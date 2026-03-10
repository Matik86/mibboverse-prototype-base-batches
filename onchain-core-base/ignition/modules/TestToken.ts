// ignition/modules/Token.ts

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseUnits } from "viem";

export default buildModule("TokenModule", (m) => {
  const deployer = m.getAccount(0);

  // Deploy Token contract (constructor takes no args)
  const token = m.contract("TokenFaucet", []);

  // Mint 1,000,000 TEST to deployer (6 decimals like USDC)
  const mintAmount = parseUnits("1000000", 6); // 1_000_000_000_000

  m.call(token, "mint", [deployer, mintAmount], {
    id: "MintInitialSupply",
    after: [token],
  });

  return { token };
});