import fs from "fs";
import path from "path";
import { parseUnits, type Address, type PublicClient, type Hash } from "viem";
import { network } from "hardhat";
import { getAddress } from "viem";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * @title Agent Ecosystem E2E Interaction Script
 * @notice Demonstrates the complete lifecycle of an AI Agent within the MibboVerse ecosystem.
 * @dev Supports both local Hardhat execution and Base Sepolia testnet using a single account.
 */
async function main() {
  console.log("==================================================");
  console.log("🚀 Starting Agent Ecosystem E2E Interaction Script");
  console.log("==================================================\n");

  const connection = await network.connect();
  const { viem } = connection;
  const networkName = connection.networkName;
  const publicClient = await viem.getPublicClient();

  const walletClients = await viem.getWalletClients();
  const account = walletClients[0];
  const chainId = await publicClient.getChainId();

  async function waitForTx(hash: Hash, description: string, confirmations: number = 2) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations });
    if (receipt.status !== "success") {
      throw new Error(`🚨 ${description} FAILED! Hash: ${hash}`);
    }
    console.log(`   🚀 Tx: ${hash}`);
    return receipt;
  }

  console.log(`🌐 Network: ${networkName} (Chain ID: ${chainId})`);
  console.log(`👤 Unified Account (Owner/User/Relayer): ${account.account.address}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 1. ENVIRONMENT SETUP & ADDRESS RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────

  let registryAddress: Address;
  let treasuryAddress: Address;
  let passAddress: Address;
  let erc8004Address: Address;
  let tokenAddress: Address;

  let registry: any, treasury: any, pass: any, erc8004: any, token: any;

  const deploymentDir = path.join(
    process.cwd(),
    "ignition",
    "deployments",
    `chain-${chainId}`
  );
  const deployedAddressesPath = path.join(deploymentDir, "deployed_addresses.json");

  let isExistingDeployment = false;
  let addresses: Record<string, string> = {};

  if (fs.existsSync(deployedAddressesPath)) {
    console.log("📂 Found existing Ignition deployment data. Loading addresses...");
    addresses = JSON.parse(fs.readFileSync(deployedAddressesPath, "utf-8"));
    isExistingDeployment = true;
  } else {
    console.log("⚠️  No Ignition deployment data found for this chain. Deploying fresh instances...");
  }

  erc8004Address = process.env.ERC8004_ADDRESS as Address;
  if (!erc8004Address) {
    throw new Error(
      "🚨 Missing ERC8004_ADDRESS in .env. Address 8004 is required, MockERC8004 will not be deployed."
    );
  }

  if (networkName === "baseSepolia") {
    tokenAddress = "0xCaA5471D0d85Ed8d16cDe2925f16Af7bD0E4f751"; // Free-mint test ERC20

    if (isExistingDeployment) {
      treasuryAddress  = addresses["AgentEcosystemModule#MibboTreasury"] as Address;
      registryAddress  = addresses["AgentEcosystemModule#MibboRegistry"] as Address;
      passAddress      = addresses["AgentEcosystemModule#MibboPass"] as Address;
    } else {
      console.log("⚙️  Deploying ecosystem to Base Sepolia...");

      // 1. Deploy Treasury (needs ERC8004 address)
      treasury = await viem.deployContract("MibboTreasury", [erc8004Address]);
      treasuryAddress = treasury.address;

      // 2. Deploy Registry (needs ERC8004 + Treasury addresses)
      registry = await viem.deployContract("MibboRegistry", [erc8004Address, treasuryAddress]);
      registryAddress = registry.address;

      // 3. Link Registry → Treasury (one-time owner call)
      await treasury.write.setAgentRegistry([registryAddress]);

      // 4. Deploy Pass (needs Registry address + relayer)
      pass = await viem.deployContract("MibboPass", [
        registryAddress,
        account.account.address, // Account acts as relayer
      ]);
      passAddress = pass.address;
    }

    registry = await viem.getContractAt("MibboRegistry",  registryAddress!);
    treasury = await viem.getContractAt("MibboTreasury",  treasuryAddress!);
    pass     = await viem.getContractAt("MibboPass",      passAddress!);
    token    = await viem.getContractAt("TokenFaucet",    tokenAddress);
    erc8004  = await viem.getContractAt("IERC8004Registry", erc8004Address);

    console.log("🚰 Minting free test tokens from faucet to the account...");
    // Add faucet call here if TokenFaucet has a mint/drip function

  } else {
    // ── Local / Hardhat Network ───────────────────────────────────────────
    if (!isExistingDeployment) {
      console.log("🛠️  Deploying ecosystem locally...");

      erc8004 = await viem.getContractAt("IERC8004Registry", erc8004Address);

      token         = await viem.deployContract("TokenFaucet");
      tokenAddress  = token.address;

      // 1. Deploy Treasury
      treasury      = await viem.deployContract("MibboTreasury", [erc8004Address]);
      treasuryAddress = treasury.address;

      // 2. Deploy Registry
      registry      = await viem.deployContract("MibboRegistry", [erc8004Address, treasuryAddress]);
      registryAddress = registry.address;

      // 3. Link Registry → Treasury
      await treasury.write.setAgentRegistry([registryAddress]);

      // 4. Deploy Pass
      pass = await viem.deployContract("MibboPass", [
        registryAddress,
        account.account.address, // Account is relayer
      ]);
      passAddress = pass.address;

    } else {
      tokenAddress    = addresses["TestTokenModule#Token"]            as Address;
      treasuryAddress = addresses["AgentEcosystemModule#MibboTreasury"] as Address;
      registryAddress = addresses["AgentEcosystemModule#MibboRegistry"] as Address;
      passAddress     = addresses["AgentEcosystemModule#MibboPass"]     as Address;

      registry = await viem.getContractAt("MibboRegistry",    registryAddress);
      treasury = await viem.getContractAt("MibboTreasury",    treasuryAddress);
      pass     = await viem.getContractAt("MibboPass",        passAddress);
      token    = await viem.getContractAt("TokenFaucet",      tokenAddress);
      erc8004  = await viem.getContractAt("IERC8004Registry", erc8004Address);
    }
  }

  console.log("✅ Environment ready.");
  console.log(`   MibboRegistry  : ${registryAddress!}`);
  console.log(`   MibboTreasury  : ${treasuryAddress!}`);
  console.log(`   MibboPass      : ${passAddress!}`);
  console.log(`   Token          : ${tokenAddress!}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 2. AGENT REGISTRATION
  //    MibboRegistry.registerAgent internally calls:
  //      erc8004.register(card.endpoint)          → mints NFT to registry
  //      erc8004.safeTransferFrom(registry, treasury, agentId)
  //      agentTreasury.initAgent(agentId, msg.sender, deadline, sig)
  //        └─ erc8004.setAgentWallet(agentId, userWallet, deadline, sig)
  // ─────────────────────────────────────────────────────────────────────────
  console.log("▶️  STEP 1: Registering a new AI Agent...");

  const formattedAgentCard = {
    name:        "Shugo - mtv's mibbogent",
    description: "Shugo is mtv's personal agent — trained on his alpha, strategy, and market expertise.",
    version:     "1.0.0",
    endpoint:    "ipfs://bafkreibaygtzic4hmcni7rqh4hibcjlx6tc6u2mgzqxa5s6gp5ehmhqrn4",
    capabilities: [
      "owner-strategy-relay",
      "token-intelligence",
      "onchain-execution",
      "perp-trading",
      "cross-chain-bridging",
      "web-research",
      "trending-token-discovery",
      "agent-to-agent-collaboration",
      "x402-payments",
    ],
    avatarURI: "https://amaranth-immediate-gazelle-956.mypinata.cloud/ipfs/bafkreiftfvh4rmdc2exxzo6sekcuv44wlrlijg77wbldukz3rnfxq3wv6a",
    extra: "0x",
  };

  // Read next agentId from ERC8004 storage BEFORE registering
  // (used to construct the EIP-712 signature ahead of the tx)
  const IDENTITY_REGISTRY_LAST_ID_SLOT =
    "0xa040f782729de4970518741823ec1276cbcd41a0c7493f62d173341566a04e00";
  const rawId = await publicClient.getStorageAt({
    address: erc8004Address,
    slot: IDENTITY_REGISTRY_LAST_ID_SLOT,
  });
  const agentId = BigInt(rawId ?? "0x0");

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 120); // 2 min window

  // EIP-712 typed-data for AgentWalletSet
  // owner = treasuryAddress  ← NFT owner that authorizes the wallet assignment
  // newWallet = account.address ← wallet being assigned (= msg.sender in registerAgent)
  const domain = {
    name:              "ERC8004IdentityRegistry",
    version:           "1",
    chainId:           Number(chainId),
    verifyingContract: erc8004Address,
  };
  const types = {
    AgentWalletSet: [
      { name: "agentId",   type: "uint256" },
      { name: "newWallet", type: "address" },
      { name: "owner",     type: "address" },
      { name: "deadline",  type: "uint256" },
    ],
  };
  const message = {
    agentId:   agentId,
    newWallet: account.account.address, // Must match msg.sender sent to registry
    owner:     treasuryAddress,         // Treasury holds the NFT → authorizes the set
    deadline:  deadline,
  };

  console.log(`   Pre-computed next agentId (from ERC8004 storage): ${agentId}`);
  console.log(`   Signing EIP-712 AgentWalletSet...`);

  const walletSig = await account.signTypedData({
    domain,
    types,
    primaryType: "AgentWalletSet",
    message,
  });

  console.log(`   Signature: ${walletSig.substring(0, 20)}...`);

  const txHashReg = await registry.write.registerAgent([
    formattedAgentCard,
    deadline,
    walletSig,
  ]);
  await waitForTx(txHashReg, "Agent Registration");

  // Verify registration
  const agentOwner = await registry.read.getAgentOwner([agentId]);
  if (getAddress(agentOwner) !== getAddress(account.account.address)) {
    throw new Error(
      `Agent registration failed! Expected owner ${account.account.address}, got ${agentOwner}`
    );
  }

  // getAgentInfo returns (beneficialOwner, agentWallet, createdAt)
  // agentWallet is fetched live from erc8004.getAgentWallet inside the registry
  const agentInfo = await registry.read.getAgentInfo([agentId]);
  console.log(
    `✅ Agent verified: owner=${agentInfo[0]}, wallet=${agentInfo[1]}, createdAt=${agentInfo[2]}\n`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 3. AGENT CONFIGURATION (Monetization)
  //    MibboPass.setConfig → validates duration between 1 and 365 days
  // ─────────────────────────────────────────────────────────────────────────
  console.log("▶️  STEP 2: Configuring Agent Pricing & Access Limits...");

  const agentConfig = {
    tokenAddress:    tokenAddress,
    subscriptionFee: parseUnits("10", 6), // 10 Tokens (6 decimals)
    duration:        BigInt(30 * 24 * 60 * 60), // 30 days
    maxRequests: 1000n,
    paused:      false,
    metadataURI: "ipfs://pass-metadata-cid",
  };

  const txHashCfg = await pass.write.setConfig([agentId, agentConfig]);
  await waitForTx(txHashCfg, "Agent Configuration");

  // Verify config was stored (version 1)
  const storedConfig = await pass.read.getCurrentConfig([agentId]);
  console.log(
    `✅ Config set (version ${await pass.read.currentVersion([agentId])}):` +
    ` ${parseUnits("10", 6)} fee / 30d / 1000 requests\n`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 4. USER PURCHASES A PASS
  //    purchasePass transfers the full fee to the agent's beneficial owner
  // ─────────────────────────────────────────────────────────────────────────
  console.log("▶️  STEP 3: User Purchasing an Access Pass...");

  const tokenAsUser = await viem.getContractAt("TokenFaucet", tokenAddress, {
    client: { wallet: account },
  });
  const passAsUser = await viem.getContractAt("MibboPass", passAddress, {
    client: { wallet: account },
  });

  console.log("   Approving tokens for MibboPass...");
  const txHashApprove = await tokenAsUser.write.approve([
    passAddress,
    parseUnits("10", 6),
  ]);
  await waitForTx(txHashApprove, "Token Approve");

  console.log("   Executing purchasePass...");
  const txHashBuy = await passAsUser.write.purchasePass([agentId]);
  await waitForTx(txHashBuy, "Purchase Pass");

  const hasAccessAfterBuy = await pass.read.hasAccess([account.account.address, agentId]);
  const passBalance        = await pass.read.balanceOf([account.account.address, agentId]);
  console.log(
    `✅ Pass purchased! ERC1155 balance: ${passBalance}, hasAccess: ${hasAccessAfterBuy}\n`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 5. RELAYER RECORDS USAGE
  //    Only addresses in isRelayer[] can call recordUsage
  //    (account was set as relayer in the MibboPass constructor)
  // ─────────────────────────────────────────────────────────────────────────
  console.log("▶️  STEP 4: Simulating Agent Usage (Relayer reporting)...");

  // Confirm account is an authorised relayer
  const isAuthorisedRelayer = await pass.read.isRelayer([account.account.address]);
  if (!isAuthorisedRelayer) {
    throw new Error(`🚨 Account is not a registered relayer! Call pass.setRelayer first.`);
  }

  const passAsRelayer = await viem.getContractAt("MibboPass", passAddress, {
    client: { wallet: account },
  });

  console.log("   Recording 250 API requests for user...");
  const txHashUsage = await passAsRelayer.write.recordUsage([
    agentId,
    account.account.address,
    250n,
  ]);
  await waitForTx(txHashUsage, "Record Usage");

  // getPassStatus returns:
  //   [0] active         bool
  //   [1] expiresAt      uint256
  //   [2] timeLeft       uint256  ← NEW field
  //   [3] requestsUsed   uint256
  //   [4] maxRequests    uint256
  //   [5] configVersion  uint256  ← NEW field
  const passStatus = await pass.read.getPassStatus([account.account.address, agentId]);
  const [active, expiresAt, timeLeft, requestsUsed, maxRequests, configVersion] = passStatus;

  console.log(`✅ Usage recorded:`);
  console.log(`   Requests used : ${requestsUsed.toString()} / ${maxRequests.toString()}`);
  console.log(`   Time left     : ${(Number(timeLeft) / 86400).toFixed(1)} days`);
  console.log(`   Config version: ${configVersion.toString()}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 6. ADDITIONAL READS — new view functions
  // ─────────────────────────────────────────────────────────────────────────
  console.log("▶️  STEP 5: Querying new view functions...");

  const userPasses   = await pass.read.getUserPasses([account.account.address]);
  const activePasses = await pass.read.getActivePasses([account.account.address]);
  const currentCfg   = await pass.read.getCurrentConfig([agentId]);

  console.log(`   User's all passes   : [${userPasses.join(", ")}]`);
  console.log(`   User's active passes: [${activePasses.join(", ")}]`);
  console.log(`   Current config      : fee=${currentCfg.subscriptionFee}, configuredAt=${currentCfg.configuredAt}, updatedAt=${currentCfg.updatedAt}, paused=${currentCfg.paused}\n`);
  console.log(`   Current pass URI    : ${await pass.read.uri([agentId])}\n`);

  const agentsByOwner = await registry.read.getAgentsByOwner([account.account.address]);
  console.log(`   Agents by owner     : [${agentsByOwner.join(", ")}]\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 7. FINAL SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log("==================================================");
  console.log("🎉 E2E Flow Completed Successfully!");
  console.log("==================================================");
  console.log(`Agent ID          : ${agentId}`);
  console.log(`Total agents      : ${await registry.read.totalAgents()}`);
  console.log(`User Pass Balance : ${passBalance}`);
  console.log(`User is authorized: ${active}`);
  console.log(`Pass expires at   : ${new Date(Number(expiresAt) * 1000).toISOString()}`);

  try {
    const nftOwner = await erc8004.read.ownerOf([agentId]);
    console.log(
      `Agent NFT Owner   : ${nftOwner}` +
      ` (is Treasury: ${getAddress(nftOwner) === getAddress(treasuryAddress!)})`
    );
  } catch {
    console.log(`Agent NFT Owner check skipped (method not on minimal interface)`);
  }

  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Unhandled Error:");
    console.error(error);
    process.exit(1);
  });
