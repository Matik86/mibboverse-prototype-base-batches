import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Load environment variables directly
const ERC8004_ADDRESS = process.env.ERC8004_ADDRESS;
const INITIAL_RELAYER = process.env.INITIAL_RELAYER;

export default buildModule("AgentEcosystemModule", (m) => {
  // Get the deployer account (Account 0) to use as a fallback relayer
  const deployer = m.getAccount(0);

  // 1. Fetch parameters
  // Throws an error if ERC8004_ADDRESS is not set in .env and not passed as parameter
  const erc8004Address = m.getParameter("erc8004Address", ERC8004_ADDRESS);
  
  // Use INITIAL_RELAYER from .env if it exists and is not empty, otherwise fallback to deployer
  const relayerAddress = INITIAL_RELAYER ? INITIAL_RELAYER : deployer;
  
  // 2. Deploy MibboTreasury
  // Requires: ERC-8004 Address
  const treasury = m.contract("MibboTreasury", [erc8004Address]);

  // 3. Deploy MibboRegistry
  // Requires: ERC-8004 Address, MibboTreasury Address
  const registry = m.contract("MibboRegistry", [erc8004Address, treasury]);

  // 4. Resolve the Circular Dependency
  // MibboTreasury needs to know the MibboRegistry address to accept initAgent() calls.
  const registryConfigured = m.call(treasury, "setAgentRegistry", [registry], {
    id: "SetRegistryInTreasury",
  });

  // 5. Deploy MibboPass
  // Requires: MibboRegistry Address and Initial Relayer (Env or Deployer)
  const pass = m.contract("MibboPass", [registry, relayerAddress]);

  // 6. Permanently remove the Treasury admin after its only setup action.
  // The Registry address is now immutable in practice: no account can replace it.
  m.call(treasury, "renounceOwnership", [], {
    id: "RenounceTreasuryOwnership",
    after: [registryConfigured, pass],
  });

  // Return deployed contracts
  return { treasury, registry, pass };
});
