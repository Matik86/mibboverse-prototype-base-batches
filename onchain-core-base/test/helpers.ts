import { network } from "hardhat";
import assert from "node:assert/strict";
import { getAddress, parseUnits, type Address } from "viem";

const OWNABLE_STORAGE_SLOT =
  "0x9016d09d72d40fdae2fd8ceac6b6234c7706214fd39c1cd1e609a0528c199300";
const IDENTITY_REGISTRY_LASTID_SLOT =
  "0xa040f782729de4970518741823ec1276cbcd41a0c7493f62d173341566a04e00";

export type AgentCard = {
  name: string;
  description: string;
  version: string;
  endpoint: string;
  capabilities: string[];
  avatarURI: string;
  extra: `0x${string}`;
};

export type PassConfigParams = {
  tokenAddress: Address;
  subscriptionFee: bigint;
  duration: bigint;
  maxRequests: bigint;
  paused: boolean;
  metadataURI: string;
};

export const makeAgentCard = (overrides: Partial<AgentCard> = {}): AgentCard => ({
  name: "Test agent",
  description: "Agent used by the core-contract test suite",
  version: "1.0.0",
  endpoint: "https://agent.example.test",
  capabilities: ["analysis"],
  avatarURI: "https://agent.example.test/avatar.png",
  extra: "0x",
  ...overrides,
});

export const makePassConfig = (tokenAddress: Address): PassConfigParams => ({
  tokenAddress,
  subscriptionFee: parseUnits("10", 6),
  duration: 7n * 24n * 60n * 60n,
  maxRequests: 100n,
  paused: false,
  metadataURI: "ipfs://pass-config-v1",
});

export const assertAddressEqual = (actual: string, expected: string) =>
  assert.equal(getAddress(actual), getAddress(expected));

export async function getWalletDeadline(publicClient: any): Promise<bigint> {
  return (await publicClient.getBlock()).timestamp + 290n;
}

export async function getNextAgentId(publicClient: any, erc8004Address: Address): Promise<bigint> {
  const raw = await publicClient.getStorageAt({
    address: erc8004Address,
    slot: IDENTITY_REGISTRY_LASTID_SLOT,
  });
  return BigInt(raw ?? "0x0");
}

export async function signAgentWalletSet(
  walletClient: any,
  erc8004Address: Address,
  chainId: number,
  agentId: bigint,
  owner: Address,
  deadline: bigint,
) {
  return walletClient.signTypedData({
    domain: { name: "ERC8004IdentityRegistry", version: "1", chainId, verifyingContract: erc8004Address },
    types: {
      AgentWalletSet: [
        { name: "agentId", type: "uint256" },
        { name: "newWallet", type: "address" },
        { name: "owner", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "AgentWalletSet",
    message: { agentId, newWallet: walletClient.account.address, owner, deadline },
  });
}

export type JsonRpcProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

export function createSnapshotFixture<T>(deploy: () => Promise<T>) {
  let cached: T | undefined;
  let snapshotId: string | undefined;
  return async (): Promise<T> => {
    const provider = (await network.connect()).provider as JsonRpcProvider;
    if (!cached) {
      cached = await deploy();
      snapshotId = await provider.request({ method: "evm_snapshot" }) as string;
      return cached;
    }
    if (!await provider.request({ method: "evm_revert", params: [snapshotId] })) cached = await deploy();
    snapshotId = await provider.request({ method: "evm_snapshot" }) as string;
    return cached;
  };
}

export async function deployAll() {
  const conn = await network.connect();
  const { viem } = conn;
  const [owner, user, user2, stranger, relayer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const implementation = await viem.deployContract("IdentityRegistryUpgradeable");
  const proxy = await viem.deployContract("ERC1967Proxy", [implementation.address, "0x06fdde03"]);
  const ownerPadded = (`0x${owner.account.address.slice(2).padStart(64, "0")}`) as `0x${string}`;
  await (conn.provider as JsonRpcProvider).request({
    method: "hardhat_setStorageAt", params: [proxy.address, OWNABLE_STORAGE_SLOT, ownerPadded],
  });
  const erc8004 = await viem.getContractAt("IdentityRegistryUpgradeable", proxy.address, { client: { wallet: owner } });
  await erc8004.write.initialize();

  const token = await viem.deployContract("Token");
  const treasury = await viem.deployContract("MibboTreasury", [erc8004.address]);
  const registry = await viem.deployContract("MibboRegistry", [erc8004.address, treasury.address]);
  await treasury.write.setAgentRegistry([registry.address]);
  const pass = await viem.deployContract("MibboPass", [registry.address, relayer.account.address]);

  await token.write.mint([user.account.address, parseUnits("1000", 6)]);
  await token.write.mint([user2.account.address, parseUnits("1000", 6)]);
  return { viem, publicClient, provider: conn.provider as JsonRpcProvider, chainId: await publicClient.getChainId(), erc8004, token, treasury, registry, pass, owner, user, user2, stranger, relayer };
}

export type DeployedContracts = Awaited<ReturnType<typeof deployAll>>;
export const createDeployedContractsFixture = () => createSnapshotFixture(deployAll);

export async function registerAgent(ctx: DeployedContracts, wallet = ctx.user): Promise<bigint> {
  const agentId = await getNextAgentId(ctx.publicClient, ctx.erc8004.address as Address);
  const deadline = await getWalletDeadline(ctx.publicClient);
  const signature = await signAgentWalletSet(wallet, ctx.erc8004.address as Address, ctx.chainId, agentId, ctx.treasury.address as Address, deadline);
  const registry = await ctx.viem.getContractAt("MibboRegistry", ctx.registry.address, { client: { wallet } });
  await registry.write.registerAgent([makeAgentCard(), deadline, signature]);
  return agentId;
}
