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
 * @dev Supports both local Hardhat execution and Avalanche Fuji testnet using a single account.
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

  async function waitForTx(
    hash: Hash, 
    description: string, 
    confirmations: number = 2
  ) {
    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash, 
      confirmations 
    });
    
    if (receipt.status !== "success") {
      throw new Error(`🚨 ${description} FAILED! Hash: ${hash}`);
    }
    
    console.log(`🚀 Tx: https://sepolia.basescan.org/tx/${hash}`);
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

  // Path to Ignition deployment file
  const deploymentDir = path.join(process.cwd(), "ignition", "deployments", `chain-${chainId}`);
  const deployedAddressesPath = path.join(deploymentDir, "deployed_addresses.json");

  let isExistingDeployment = false;
  let addresses: Record<string, string> = {};

  if (fs.existsSync(deployedAddressesPath)) {
    console.log("📂 Found existing Ignition deployment data. Loading addresses...");
    addresses = JSON.parse(fs.readFileSync(deployedAddressesPath, "utf-8"));
    isExistingDeployment = true;
  } else {
    console.log("⚠️ No Ignition deployment data found for this chain. Will deploy fresh instances...");
  }

  erc8004Address = process.env.ERC8004_ADDRESS as Address;
  if (!erc8004Address) {
    throw new Error("🚨 Missing ERC8004_ADDRESS in .env. Address 8004 is required, MockERC8004 will not be deployed.");
  }

  if (networkName === "baseSepolia") {
    tokenAddress = "0xCaA5471D0d85Ed8d16cDe2925f16Af7bD0E4f751"; // Free mint test ERC20

    if (isExistingDeployment) {
      treasuryAddress = addresses["AgentEcosystemModule#AgentTreasury"] as Address;
      registryAddress = addresses["AgentEcosystemModule#AgentRegistry"] as Address;
      passAddress = addresses["AgentEcosystemModule#AgentPass"] as Address;
    } else {
      console.log("⚙️ Deploying ecosystem to Fuji...");
      treasury = await viem.deployContract("AgentTreasury", [erc8004Address]);
      treasuryAddress = treasury.address;

      registry = await viem.deployContract("AgentRegistry", [erc8004Address, treasuryAddress]);
      registryAddress = registry.address;

      await treasury.write.setAgentRegistry([registryAddress]);

      pass = await viem.deployContract("AgentPass", [
        registryAddress,
        account.account.address, // Account acts as relayer here
        "https://api.mibbo.io/pass/"
      ]);
      passAddress = pass.address;
    }

    registry = await viem.getContractAt("AgentRegistry", registryAddress!);
    treasury = await viem.getContractAt("AgentTreasury", treasuryAddress!);
    pass = await viem.getContractAt("AgentPass", passAddress!);
    token = await viem.getContractAt("TokenFaucet", tokenAddress);
    erc8004 = await viem.getContractAt("IERC8004Registry", erc8004Address);

    console.log("🚰 Minting free test tokens from faucet to the account...");
    await token.write.mint([account.account.address, parseUnits("1000", 6)]);

  } else {
    // Local / Hardhat Network
    if (!isExistingDeployment) {
      console.log("🛠️ Deploying ecosystem locally using provided 8004 address...");

      erc8004 = await viem.getContractAt("IERC8004Registry", erc8004Address);

      token = await viem.deployContract("TokenFaucet");
      tokenAddress = token.address;

      treasury = await viem.deployContract("AgentTreasury", [erc8004Address]);
      treasuryAddress = treasury.address;

      registry = await viem.deployContract("AgentRegistry", [erc8004Address, treasuryAddress]);
      registryAddress = registry.address;

      await treasury.write.setAgentRegistry([registryAddress]);

      pass = await viem.deployContract("AgentPass", [
        registryAddress,
        account.account.address, // Account is relayer
        "https://pass/"
      ]);
      passAddress = pass.address;
    } else {
      tokenAddress = addresses["TestTokenModule#Token"] as Address;
      treasuryAddress = addresses["AgentEcosystemModule#AgentTreasury"] as Address;
      registryAddress = addresses["AgentEcosystemModule#AgentRegistry"] as Address;
      passAddress = addresses["AgentEcosystemModule#AgentPass"] as Address;

      registry = await viem.getContractAt("AgentRegistry", registryAddress);
      treasury = await viem.getContractAt("AgentTreasury", treasuryAddress);
      pass = await viem.getContractAt("AgentPass", passAddress);
      token = await viem.getContractAt("TokenFaucet", tokenAddress);
      erc8004 = await viem.getContractAt("IERC8004Registry", erc8004Address); 

      await token.write.mint([account.account.address, parseUnits("1000", 6)]);
    }
  }

  console.log("✅ Environment ready.\n");

  // ─────────────────────────────────────────────────────────────────────────
  // 2. AGENT REGISTRATION
  // ─────────────────────────────────────────────────────────────────────────
 console.log("▶️ STEP 1: Registering a new AI Agent...");

  const formattedAgentCard = {
    name: "Demo Trading Agent",
    description: "You are an expert crypto trader...",
    version: "1.0.0",
    endpoint: "https://api.mibbo.io/agents/demo",
    capabilities: ["trading", "analysis"],
    avatarURI: "https://api.mibbo.io/avatar.png",
    extra: "0x",
  };

  const IDENTITY_REGISTRY_LAST_ID_SLOT = "0xa040f782729de4970518741823ec1276cbcd41a0c7493f62d173341566a04e00";
  const rawId = await publicClient.getStorageAt({
    address: erc8004Address,
    slot: IDENTITY_REGISTRY_LAST_ID_SLOT,
  });
  const agentId = BigInt(rawId ?? "0x0");

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 120); // 2 mins

  const domain = {
    name: "ERC8004IdentityRegistry",
    version: "1",
    chainId: Number(chainId),
    verifyingContract: erc8004Address,
  };

  const types = {
    AgentWalletSet: [
      { name: "agentId", type: "uint256" },
      { name: "newWallet", type: "address" },
      { name: "owner", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const message = {
    agentId: agentId,
    newWallet: account.account.address,
    owner: treasuryAddress,
    deadline: deadline,
  };

  console.log(`   Real Next Agent ID from ERC8004 storage: ${agentId}`);
  console.log(`   Domain Verifying Contract: ${domain.verifyingContract}`);

  const walletSig = await account.signTypedData({
    domain,
    types,
    primaryType: "AgentWalletSet",
    message
  });

  console.log(`   Signature: ${walletSig.substring(0, 15)}...`);

  const txHashReg = await registry.write.registerAgent([formattedAgentCard, deadline, walletSig]);
  await waitForTx(txHashReg, "Agent Registration");

  const agentOwner = await registry.read.getAgentOwner([agentId]);
  if (getAddress(agentOwner) !== getAddress(account.account.address)) {
    throw new Error(`Agent registration failed! Expected owner ${account.account.address}, got ${agentOwner}`);
  }

  const agentInfo = await registry.read.getAgentInfo([agentId]);
  console.log(`✅ Agent verified: owner=${agentOwner}, wallet=${agentInfo[1]}, created=${agentInfo[2]}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 3. AGENT CONFIGURATION (Monetization)
  // ─────────────────────────────────────────────────────────────────────────
  console.log("▶️ STEP 2: Configuring Agent Pricing & Access Limits...");

  const agentConfig = {
    tokenAddress: tokenAddress,
    subscriptionFee: parseUnits("10", 6), // 10 Tokens
    duration: BigInt(30 * 24 * 60 * 60), // 30 Days
    maxRequests: 1000n, // 1000 API calls allowed
    burnBps: 2000n, // 20% burn rate
    paused: false,
  };

  const txHashCfg = await pass.write.setConfig([agentId, agentConfig]);
  await waitForTx(txHashCfg, "Agent Configuration");
  console.log(`✅ Configuration set! (10 Tokens / 30 Days / 1000 Requests)\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 4. USER PURCHASES A PASS
  // ─────────────────────────────────────────────────────────────────────────
  console.log("▶️ STEP 3: User Purchasing an Access Pass...");

  const tokenAsUser = await viem.getContractAt("TokenFaucet", tokenAddress, { client: { wallet: account } });
  const passAsUser = await viem.getContractAt("AgentPass", passAddress, { client: { wallet: account } });

  console.log("   Approving tokens...");
  const txHashApprove = await tokenAsUser.write.approve([passAddress, parseUnits("10", 6)]);
  await waitForTx(txHashApprove, "Approve");

  console.log("   Executing purchase...");
  const txHashBuy = await passAsUser.write.purchasePass([agentId]);
  await waitForTx(txHashBuy, "Purchase Pass");

  const hasAccessAfterBuy = await pass.read.hasAccess([account.account.address, agentId]);
  console.log(`✅ Pass purchased! User has access: ${hasAccessAfterBuy}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 5. RELAYER RECORDS USAGE (Off-chain integration simulation)
  // ─────────────────────────────────────────────────────────────────────────
  console.log("▶️ STEP 4: Simulating Agent Usage (Relayer reporting)...");

  const passAsRelayer = await viem.getContractAt("AgentPass", passAddress, { client: { wallet: account } });

  console.log("   User consumes 250 API requests...");
  const txHashUsage = await passAsRelayer.write.recordUsage([agentId, account.account.address, 250n]);
  await waitForTx(txHashUsage, "Relayer Records");

  const status = await pass.read.getPassStatus([account.account.address, agentId]);
  console.log(`✅ Usage updated. Requests used: ${status[3].toString()} / ${status[4].toString()}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 6. FINAL SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log("==================================================");
  console.log("🎉 E2E Flow Completed Successfully!");
  console.log("==================================================");

  try {
    const owner = await erc8004.read.ownerOf([agentId]);
    console.log(`Agent NFT Owner: ${owner} (Treasury: ${treasuryAddress === owner})`);
  } catch (e) {
    console.log(`Agent NFT Owner check skipped (method not on minimal interface)`);
  }

  console.log(`User Pass Balance: ${await pass.read.balanceOf([account.account.address, agentId])}`);
  console.log(`User is authorized: ${status[0]}\n`); // active boolean
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Unhandled Error:");
    console.error(error);
    process.exit(1);
  });
