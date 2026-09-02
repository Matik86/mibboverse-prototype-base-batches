import { network } from "hardhat";
import { stringToHex, type Address, type Hash } from "viem";
import * as dotenv from "dotenv";

dotenv.config();

const registryAddress = process.env.MIBBO_REGISTRY_ADDRESS as Address | undefined;
const agentId = process.env.AGENT_ID ? BigInt(process.env.AGENT_ID) : undefined;
const key = process.env.METADATA_KEY;
const value = process.env.METADATA_VALUE;

function required<T>(name: string, current: T | undefined): T {
  if (current === undefined || current === "") throw new Error(`${name} must be set`);
  return current;
}

async function main() {
  const connection = await network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [owner] = await viem.getWalletClients();
  const registry = await viem.getContractAt(
    "MibboRegistry",
    required("MIBBO_REGISTRY_ADDRESS", registryAddress),
    { client: { wallet: owner } },
  );

  const metadataValue = stringToHex(required("METADATA_VALUE", value));
  const txHash: Hash = await registry.write.updateAgentMetadata([
    required("AGENT_ID", agentId),
    required("METADATA_KEY", key),
    metadataValue,
  ]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 2 });
  if (receipt.status !== "success") throw new Error(`updateAgentMetadata failed: ${txHash}`);
  console.log(`Metadata updated in block ${receipt.blockNumber}: ${txHash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
