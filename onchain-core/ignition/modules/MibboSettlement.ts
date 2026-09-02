import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

function requiredAddressEnv(name: string): `0x${string}` {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a 20-byte EVM address`);
  }
  return value as `0x${string}`;
}

export default buildModule("MibboSettlementModule", (m) => {
  // hardhat.config.ts loads .env through dotenv before this module is evaluated.
  // These values are public addresses; no private key is passed to Ignition.
  const token = requiredAddressEnv("SETTLEMENT_TOKEN_ADDRESS");
  const treasury = requiredAddressEnv("SETTLEMENT_TREASURY_ADDRESS");
  const owner = requiredAddressEnv("SETTLEMENT_OWNER_ADDRESS");
  const relayer = requiredAddressEnv("SETTLEMENT_RELAYER_ADDRESS");

  const settlement = m.contract("MibboSettlement", [token, treasury, owner, relayer]);

  return { settlement };
});
