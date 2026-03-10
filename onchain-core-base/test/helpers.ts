import { network } from "hardhat";
import assert from "node:assert/strict";
import { parseUnits, getAddress, type Address } from "viem";

/**
 * OZ v5 OwnableUpgradeable uses an ERC-7201 storage namespace.
 * This is the storage slot that contains the `_owner` value.
 */
const OWNABLE_STORAGE_SLOT =
  "0x9016d09d72d40fdae2fd8ceac6b6234c7706214fd39c1cd1e609a0528c199300";

/**
 * IdentityRegistryUpgradeable uses an ERC-7201 storage namespace.
 * In the IdentityRegistry storage layout, the first field is `_lastId`,
 * which is used to predict the next minted agentId.
 */
const IDENTITY_REGISTRY_LASTID_SLOT =
  "0xa040f782729de4970518741823ec1276cbcd41a0c7493f62d173341566a04e00";

/**
 * 65-byte placeholder signature.
 * Useful when a call reverts before signature verification (e.g. on a precondition).
 */
export const DUMMY_SIG = ("0x" + "00".repeat(65)) as `0x${string}`;

/**
 * Matches AgentCard struct in AgentTypes.sol
 */
export type AgentCard = {
  name: string;
  description: string;
  version: string;
  endpoint: string;
  capabilities: string[];
  avatarURI: string;
  extra: `0x${string}`;
};

/**
 * Matches AgentConfig struct in AgentTypes.sol
 */
export type AgentConfig = {
  tokenAddress: Address;
  subscriptionFee: bigint;
  duration: bigint;
  maxRequests: bigint;
  burnBps: bigint;
  paused: boolean;
};

/**
 * Builds an AgentCard with safe defaults for tests.
 */
export function makeAgentCard(overrides: Partial<AgentCard> = {}): AgentCard {
  return {
    name: "Test Agent",
    description: "A test AI agent",
    version: "1.0.0",
    endpoint: "https://agent.example.com",
    capabilities: ["swap", "transfer"],
    avatarURI: "https://example.com/avatar.png",
    extra: "0x",
    ...overrides,
  };
}

/**
 * Builds an AgentConfig with reasonable defaults for tests.
 */
export function makeAgentConfig(tokenAddress: Address): AgentConfig {
  return {
    tokenAddress,
    subscriptionFee: parseUnits("10", 6),
    duration: BigInt(7 * 24 * 60 * 60), // 7 days
    maxRequests: 100n,
    burnBps: 4000n, // 40%
    paused: false,
  };
}

/**
 * Normalizes both addresses to checksum format before comparing.
 */
export function assertAddressEqual(actual: string, expected: string) {
  assert.equal(getAddress(actual), getAddress(expected));
}

/**
 * Deadline for AgentTreasury admin EIP-712 signatures.
 * We use "now + 1 hour" to avoid flaky failures due to block timestamp drift.
 */
export async function getDeadline(publicClient: any): Promise<bigint> {
  const block = await publicClient.getBlock();
  return block.timestamp + 3600n;
}

/**
 * Deadline for ERC8004 setAgentWallet EIP-712 signatures.
 * Contract-side constraint is effectively "short-lived"; we use ~5 minutes.
 */
export async function getWalletDeadline(publicClient: any): Promise<bigint> {
  const block = await publicClient.getBlock();
  return block.timestamp + 290n;
}

/**
 * Reads `_lastId` from ERC-7201 storage and returns the value as bigint.
 * The next minted id is `_lastId` at the moment before minting.
 */
export async function getNextAgentId(
  publicClient: any,
  erc8004Address: Address,
): Promise<bigint> {
  const raw = await publicClient.getStorageAt({
    address: erc8004Address,
    slot: IDENTITY_REGISTRY_LASTID_SLOT,
  });
  return BigInt(raw ?? "0x0");
}

/** Minimal JSON-RPC provider shape used by Hardhat. */
export type JsonRpcProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

// ── AgentTreasury EIP-712 domain ─────────────────────────────────────────────

/**
 * EIP-712 signature for AgentTreasury.updateAgentWallet admin authorization.
 */
export async function signSetWallet(
  walletClient: any,
  treasuryAddress: Address,
  chainId: number,
  agentId: bigint,
  wallet: Address,
  nonce: bigint,
  deadline: bigint,
) {
  return walletClient.signTypedData({
    domain: {
      name: "AgentTreasury",
      version: "1",
      chainId,
      verifyingContract: treasuryAddress,
    },
    types: {
      SetWallet: [
        { name: "agentId", type: "uint256" },
        { name: "wallet", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "SetWallet",
    message: { agentId, wallet, nonce, deadline },
  });
}

/**
 * EIP-712 signature for AgentTreasury.updateMetadata admin authorization.
 */
export async function signSetMetadata(
  walletClient: any,
  treasuryAddress: Address,
  chainId: number,
  agentId: bigint,
  key: string,
  value: `0x${string}`,
  nonce: bigint,
  deadline: bigint,
) {
  return walletClient.signTypedData({
    domain: {
      name: "AgentTreasury",
      version: "1",
      chainId,
      verifyingContract: treasuryAddress,
    },
    types: {
      SetMetadata: [
        { name: "agentId", type: "uint256" },
        { name: "key", type: "string" },
        { name: "value", type: "bytes" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "SetMetadata",
    message: { agentId, key, value, nonce, deadline },
  });
}

// ── ERC8004 EIP-712 domain ───────────────────────────────────────────────────

/**
 * EIP-712 signature for ERC8004 "agent wallet consent".
 * Signed by `newWallet` to approve being set as agentWallet for `agentId`.
 *
 * Important: `owner` must be the current NFT owner (in our flow: AgentTreasury).
 */
export async function signAgentWalletSet(
  walletClient: any,
  erc8004Address: Address,
  chainId: number,
  agentId: bigint,
  newWallet: Address,
  owner: Address,
  deadline: bigint,
) {
  return walletClient.signTypedData({
    domain: {
      name: "ERC8004IdentityRegistry",
      version: "1",
      chainId,
      verifyingContract: erc8004Address,
    },
    types: {
      AgentWalletSet: [
        { name: "agentId", type: "uint256" },
        { name: "newWallet", type: "address" },
        { name: "owner", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "AgentWalletSet",
    message: { agentId, newWallet, owner, deadline },
  });
}

// ── Fixtures (snapshots) ─────────────────────────────────────────────────────

/**
 * Creates a snapshot-based fixture.
 *
 * - First call: runs `deploy()` and takes a snapshot.
 * - Subsequent calls: reverts to the previous snapshot, then takes a new snapshot.
 *
 * This pattern keeps contract addresses stable and makes test setup fast while
 * still providing per-test isolation of chain state.
 *
 * Notes:
 * - Do not use this in parallel/concurrent tests against the same chain.
 * - If you need a truly fresh deployment (new addresses), call `deployAll()`.
 */
export function createSnapshotFixture<T>(
  deploy: () => Promise<T>,
) {
  let cached: T | undefined;
  let snapshotId: string | undefined;

  return async (): Promise<T> => {
    // @ts-ignore
    const provider = (await network.connect()).provider as JsonRpcProvider;
    
    if (!cached) {
      cached = await deploy();
      snapshotId = (await provider.request({
        method: "evm_snapshot",
        params: [],
      })) as string;
      return cached;
    }

    const ok = (await provider.request({
      method: "evm_revert",
      params: [snapshotId],
    })) as boolean;

    if (!ok) {
      cached = await deploy();
    }

    snapshotId = (await provider.request({
      method: "evm_snapshot",
      params: [],
    })) as string;

    return cached;
  };
}

/**
 * Convenience factory for the standard deployment fixture used in tests.
 * Each test gets a clean snapshot while reusing the same deployment.
 */
export function createDeployedContractsFixture() {
  return createSnapshotFixture(deployAll);
}

// ── Deployment ───────────────────────────────────────────────────────────────

export type DeployedContracts = Awaited<ReturnType<typeof deployAll>>;

/**
 * Deploys the full test environment:
 * - IdentityRegistryUpgradeable behind ERC1967Proxy (owner is written directly to storage)
 * - ERC20 Mock Token
 * - AgentTreasury
 * - AgentRegistry
 * - AgentPass
 *
 * Additionally:
 * - Resolves the circular dependency between Treasury and Registry using one-time setter.
 * - Grants admin role to `admin`
 * - Mints test tokens to `user` and `user2`
 *
 * Returns the deployed contracts, wallet clients, a public client, chainId,
 * and the JSON-RPC provider (for snapshots/fixtures).
 */
export async function deployAll() {
  // Hardhat v3: use network.connect() instead of hre.viem
  const conn = await network.connect();
  const viem = conn.viem;

  // Added relayer to the list of test wallets
  const [owner, admin, user, user2, stranger, relayer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  // 1) Deploy implementation (constructor disables initializers)
  const impl = await viem.deployContract("IdentityRegistryUpgradeable");

  // 2) Deploy proxy without init calldata
  const proxy = await viem.deployContract("ERC1967Proxy", [
    impl.address,
    "0x06fdde03",
  ]);

  // 3) Set `_owner` directly in proxy storage (ERC-7201 slot)
  const ownerPadded = ("0x" +
    owner.account.address.slice(2).padStart(64, "0")) as `0x${string}`;

  await (conn.provider as JsonRpcProvider).request({
    method: "hardhat_setStorageAt",
    params: [proxy.address, OWNABLE_STORAGE_SLOT, ownerPadded],
  });

  // 4) Initialize via proxy as owner
  const erc8004 = await viem.getContractAt("IdentityRegistryUpgradeable", proxy.address, {
    client: { wallet: owner },
  });
  await erc8004.write.initialize();

  // 5) Deploy the Mock Token
  const token = await viem.deployContract("Token");

  // 6) Deploy AgentTreasury (depends only on erc8004)
  const treasury = await viem.deployContract("AgentTreasury", [erc8004.address]);

  // 7) Deploy AgentRegistry (depends on erc8004 and treasury)
  const registry = await viem.deployContract("AgentRegistry", [
    erc8004.address,
    treasury.address,
  ]);

  // 8) Set AgentRegistry address in Treasury (One-time setup to resolve circular dependency)
  await treasury.write.setAgentRegistry([registry.address]);

  // 9) Deploy AgentPass (depends on registry and relayer)
  const baseURI = "https://api.mibboverse.io/pass/";
  const pass = await viem.deployContract("AgentPass", [
    registry.address,
    relayer.account.address,
    baseURI
  ]);

  // Set Treasury Admin
  await treasury.write.setAdmin([admin.account.address, true]);

  // Mint test tokens
  await token.write.mint([user.account.address, parseUnits("1000", 6)]);
  await token.write.mint([user2.account.address, parseUnits("1000", 6)]);

  return {
    // tooling
    viem,
    publicClient,
    chainId,
    provider: conn.provider as JsonRpcProvider,

    // contracts
    erc8004,
    registry,
    treasury,
    pass, // Exporting the new AgentPass contract
    token,

    // wallets
    owner,
    admin,
    user,
    user2,
    stranger,
    relayer, // Exporting relayer wallet
  };
}

