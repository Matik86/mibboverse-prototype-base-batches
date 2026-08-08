import { network } from "hardhat";

type Address = `0x${string}`;

const token = process.env.SETTLEMENT_TOKEN_ADDRESS as Address | undefined;
const treasury = process.env.SETTLEMENT_TREASURY_ADDRESS as Address | undefined;
const owner = process.env.SETTLEMENT_OWNER_ADDRESS as Address | undefined;
const relayer = process.env.SETTLEMENT_RELAYER_ADDRESS as Address | undefined;

if (!token || !treasury || !owner || !relayer) {
  throw new Error(
    "SETTLEMENT_TOKEN_ADDRESS, SETTLEMENT_TREASURY_ADDRESS, SETTLEMENT_OWNER_ADDRESS and SETTLEMENT_RELAYER_ADDRESS are required",
  );
}

const { viem } = await network.connect();
const settlement = await viem.deployContract("MibboSettlement", [token, treasury, owner, relayer]);

console.log("MibboSettlement deployed:", settlement.address);
