import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MIBBO_REGISTRY_ADDRESS = process.env.MIBBO_REGISTRY_ADDRESS;
const INITIAL_RELAYER = process.env.INITIAL_RELAYER;

export default buildModule("MibboPassModule", (m) => {
  const deployer = m.getAccount(0);

  // Parameters can override environment defaults through an Ignition parameters file.
  // The module deliberately references an existing Registry and deploys no other contract.
  const registryAddress = m.getParameter("registryAddress", MIBBO_REGISTRY_ADDRESS);
  const initialRelayer = m.getParameter(
    "initialRelayer",
    INITIAL_RELAYER || deployer,
  );

  const pass = m.contract("MibboPass", [registryAddress, initialRelayer]);

  return { pass };
});
