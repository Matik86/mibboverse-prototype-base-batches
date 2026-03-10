import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Load environment variables directly
const ERC8004_ADDRESS = process.env.ERC8004_ADDRESS;
const PASS_BASE_URI = process.env.PASS_BASE_URI;
const INITIAL_RELAYER = process.env.INITIAL_RELAYER;

export default buildModule("AgentEcosystemModule", (m) => {
  // Get the deployer account (Account 0) to use as a fallback relayer
  const deployer = m.getAccount(0);

  // 1. Fetch parameters
  // Throws an error if ERC8004_ADDRESS is not set in .env and not passed as parameter
  const erc8004Address = m.getParameter("erc8004Address", ERC8004_ADDRESS);
  
  // Use INITIAL_RELAYER from .env if it exists and is not empty, otherwise fallback to deployer
  const relayerAddress = INITIAL_RELAYER ? INITIAL_RELAYER : deployer;
  
  // Throws an error if PASS_BASE_URI is not set in .env and not passed as parameter
  const baseURI = m.getParameter("passBaseURI", PASS_BASE_URI);

  // 2. Deploy AgentTreasury
  // Requires: ERC-8004 Address
  const treasury = m.contract("AgentTreasury", [erc8004Address]);

  // 3. Deploy AgentRegistry
  // Requires: ERC-8004 Address, AgentTreasury Address
  const registry = m.contract("AgentRegistry", [erc8004Address, treasury]);

  // 4. Resolve the Circular Dependency
  // AgentTreasury needs to know the AgentRegistry address to accept initAgent() calls.
  m.call(treasury, "setAgentRegistry", [registry], {
    id: "SetRegistryInTreasury",
  });

  // 5. Deploy AgentPass
  // Requires: AgentRegistry Address, Initial Relayer (Env or Deployer), Base URI
  const pass = m.contract("AgentPass", [registry, relayerAddress, baseURI]);

  // Return deployed contracts
  return { treasury, registry, pass };
});
