import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseUnits, encodePacked, type Address } from "viem";

import {
  createDeployedContractsFixture,
  makeAgentCard,
  makeAgentConfig,
  getDeadline,
  getWalletDeadline,
  signAgentWalletSet,
  signSetWallet,
  signSetMetadata,
  assertAddressEqual,
  getNextAgentId,
  type DeployedContracts,
} from "./helpers.js";

/**
 * Type alias extending our base context with the strictly typed pass contract.
 * We deploy everything once and revert to snapshot to keep tests fast.
 */
type TestContext = DeployedContracts & { pass: any };

const useBaseFixture = createDeployedContractsFixture();

describe("Integration Ecosystem", { concurrency: 1 }, () => {
  let ctx: TestContext;

  // ── Internal Setup Helpers ───────────────────────────────────────────────────

  async function useIntegrationFixture(): Promise<TestContext> {
    const base = await useBaseFixture();
    
    // Deploy AgentPass for full ecosystem integration
    const pass = await base.viem.deployContract("AgentPass", [
      base.registry.address,
      base.admin.account.address, // Admin acts as relayer
      "https://api.example.com/pass/",
    ]);

    return { ...base, pass };
  }

  /**
   * Internal helper to dry-up registration in integration scenarios.
   */
  async function registerIntegrationAgent(
    wallet: any, 
    cardOverride?: any
  ): Promise<bigint> {
    const { publicClient, erc8004, treasury, chainId, viem, registry } = ctx;

    const agentId = await getNextAgentId(publicClient, erc8004.address as Address);
    const deadline = await getWalletDeadline(publicClient);
    const card = cardOverride ? makeAgentCard(cardOverride) : makeAgentCard();

    const walletSig = await signAgentWalletSet(
      wallet, erc8004.address as Address, chainId, agentId,
      wallet.account.address as Address, treasury.address as Address, deadline
    );

    const r = await viem.getContractAt("AgentRegistry", registry.address, { client: { wallet } });
    await r.write.registerAgent([card as any, deadline, walletSig]);

    return agentId;
  }

  beforeEach(async () => {
    ctx = await useIntegrationFixture();
  });

  // ── 1. GRAND E2E FLOW ────────────────────────────────────────────────────────

  describe("Grand E2E: Lifecycle & Monetization", () => {
    it("should successfully execute full lifecycle: Register -> Config -> Purchase -> Use -> Admin Updates -> Renew -> Pause", async () => {
      const { 
        viem, user, user2, stranger, admin, publicClient, chainId, 
        registry, treasury, erc8004, token, pass 
      } = ctx;

      // --- 1. REGISTRATION ---
      const agentId = await registerIntegrationAgent(user, { name: "Matrix Protocol" });

      assertAddressEqual(await erc8004.read.ownerOf([agentId]), treasury.address);
      assertAddressEqual(await erc8004.read.getAgentWallet([agentId]), user.account.address);
      assertAddressEqual(await registry.read.getAgentOwner([agentId]), user.account.address);

      // --- 2. CONFIGURATION ---
      const rAsUser = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: user } });
      const cfg = makeAgentConfig(token.address as Address);
      cfg.subscriptionFee = parseUnits("10", 6);
      cfg.maxRequests = 100n;

      await rAsUser.write.setConfig([agentId, cfg]);

      // --- 3. PURCHASE PASS ---
      const passAsUser2 = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: user2 } });
      const tokenAsUser2 = await viem.getContractAt("Token", token.address, { client: { wallet: user2 } });

      await tokenAsUser2.write.approve([pass.address, parseUnits("10", 6)]);

      const ownerBalanceBefore = await token.read.balanceOf([user.account.address]);
      const burnBalanceBefore = await token.read.balanceOf(["0x000000000000000000000000000000000000dead"]);

      await passAsUser2.write.purchasePass([agentId]);

      assert.equal(await pass.read.balanceOf([user2.account.address, agentId]), 1n);
      assert.equal(await pass.read.hasAccess([user2.account.address, agentId]), true);

      // Fee = 10, Burn = 40% (4) -> Owner = 6
      assert.equal(await token.read.balanceOf([user.account.address]) - ownerBalanceBefore, parseUnits("6", 6));
      assert.equal(await token.read.balanceOf(["0x000000000000000000000000000000000000dead"]) - burnBalanceBefore, parseUnits("4", 6));

      // --- 4. USAGE TRACKING ---
      const passAsRelayer = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: admin } });

      await passAsRelayer.write.recordUsage([agentId, user2.account.address, 50n]);
      let status = await pass.read.getPassStatus([user2.account.address, agentId]);
      assert.equal(status[3], 50n); // requestsUsed
      assert.equal(status[0], true); // active

      await passAsRelayer.write.recordUsage([agentId, user2.account.address, 50n]);
      status = await pass.read.getPassStatus([user2.account.address, agentId]);
      assert.equal(status[3], 100n); // maxRequests reached
      assert.equal(status[0], false); // inactive

      // --- 5. ADMIN METADATA UPDATE ---
      let deadline = await getDeadline(publicClient);
      let nonce = await treasury.read.nonces([agentId]);
      const newEndpoint = encodePacked(["string"], ["https://matrix-v2.com"]) as `0x${string}`;

      const metaSig = await signSetMetadata(
        admin, treasury.address as Address, chainId,
        agentId, "endpoint", newEndpoint, nonce, deadline
      );

      const tAsUser = await viem.getContractAt("AgentTreasury", treasury.address, { client: { wallet: user } });
      await tAsUser.write.updateMetadata([agentId, "endpoint", newEndpoint, deadline, metaSig]);
      assert.equal(await erc8004.read.getMetadata([agentId, "endpoint"]), newEndpoint);

      // --- 6. WALLET UPDATE (Double Signature) ---
      deadline = await getDeadline(publicClient);
      nonce = await treasury.read.nonces([agentId]);

      const walletAdminSig = await signSetWallet(
        admin, treasury.address as Address, chainId,
        agentId, stranger.account.address as Address, nonce, deadline
      );

      const walletDeadline = await getWalletDeadline(publicClient);
      const strangerWalletSig = await signAgentWalletSet(
        stranger, erc8004.address as Address, chainId,
        agentId, stranger.account.address as Address, treasury.address as Address, walletDeadline
      );

      await tAsUser.write.updateAgentWallet([
        agentId, stranger.account.address, deadline, walletAdminSig, walletDeadline, strangerWalletSig
      ]);

      assertAddressEqual(await erc8004.read.getAgentWallet([agentId]), stranger.account.address);

      // --- 7. RENEWAL ---
      await tokenAsUser2.write.approve([pass.address, parseUnits("10", 6)]);
      await passAsUser2.write.purchasePass([agentId]);

      status = await pass.read.getPassStatus([user2.account.address, agentId]);
      assert.equal(status[0], true); 
      assert.equal(status[3], 0n); 
      assert.equal(await pass.read.balanceOf([user2.account.address, agentId]), 1n);

      // --- 8. PAUSING AGENT ---
      await rAsUser.write.setPaused([agentId, true]);
      assert.equal(await pass.read.hasAccess([user2.account.address, agentId]), false);

      const passAsStranger = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: stranger } });
      const tokenAsStranger = await viem.getContractAt("Token", token.address, { client: { wallet: stranger } });

      // Transfer tokens to stranger to attempt purchase
      await token.write.transfer([stranger.account.address, parseUnits("100", 6)], { account: user.account });
      await tokenAsStranger.write.approve([pass.address, parseUnits("10", 6)]);

      await ctx.viem.assertions.revertWith(
        passAsStranger.write.purchasePass([agentId]),
        "Agent paused"
      );

      // --- 9. UNPAUSE ---
      await rAsUser.write.setPaused([agentId, false]);
      assert.equal(await pass.read.hasAccess([user2.account.address, agentId]), true);
    });
  });

  // ── 2. CONFIGURATION & VERSIONING ────────────────────────────────────────────

  describe("Configuration & Versioning Logic", () => {
    it("should not affect active passes until renewal when owner updates price/limits", async () => {
      const { viem, user, user2, pass, token } = ctx;

      const agentId = await registerIntegrationAgent(user);
      const passAsOwner = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: user } });

      // V1 Config: 10 USDC, 100 requests
      const cfgV1 = makeAgentConfig(token.address as Address);
      cfgV1.subscriptionFee = parseUnits("10", 6);
      cfgV1.maxRequests = 100n;
      await passAsOwner.write.setConfig([agentId, cfgV1]);

      // User2 buys V1 pass
      const passAsUser2 = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: user2 } });
      const tokenAsUser2 = await viem.getContractAt("Token", token.address, { client: { wallet: user2 } });
      await tokenAsUser2.write.approve([pass.address, parseUnits("100", 6)]);
      await passAsUser2.write.purchasePass([agentId]);

      // Owner updates to V2 Config: 50 USDC, 500 requests
      const cfgV2 = makeAgentConfig(token.address as Address);
      cfgV2.subscriptionFee = parseUnits("50", 6);
      cfgV2.maxRequests = 500n;
      await passAsOwner.write.setConfig([agentId, cfgV2]);

      // User2's current pass should still show V1 limits
      let status = await pass.read.getPassStatus([user2.account.address, agentId]);
      assert.equal(status[4], 100n); // maxRequests remains 100
      assert.equal(status[5], 1n); // configVersion is 1

      // User2 renews pass (will now pay 50 USDC and get V2 limits)
      const balanceBefore = await token.read.balanceOf([user2.account.address]);
      await passAsUser2.write.purchasePass([agentId]);
      const balanceAfter = await token.read.balanceOf([user2.account.address]);

      assert.equal(balanceBefore - balanceAfter, parseUnits("50", 6)); 

      status = await pass.read.getPassStatus([user2.account.address, agentId]);
      assert.equal(status[4], 500n); // maxRequests updated to 500
      assert.equal(status[5], 2n); // configVersion is now 2
    });

    it("should correctly handle 100% burn rate (sending all funds to 0xdead without reverting)", async () => {
      const { viem, user, user2, pass, token } = ctx;

      const agentId = await registerIntegrationAgent(user);
      const passAsOwner = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: user } });

      const cfg = makeAgentConfig(token.address as Address);
      cfg.subscriptionFee = parseUnits("20", 6);
      cfg.burnBps = 10000n; // 100%
      await passAsOwner.write.setConfig([agentId, cfg]);

      const ownerBalanceBefore = await token.read.balanceOf([user.account.address]);
      const burnBalanceBefore = await token.read.balanceOf(["0x000000000000000000000000000000000000dead"]);

      const passAsUser2 = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: user2 } });
      const tokenAsUser2 = await viem.getContractAt("Token", token.address, { client: { wallet: user2 } });

      await tokenAsUser2.write.approve([pass.address, parseUnits("20", 6)]);
      await passAsUser2.write.purchasePass([agentId]); 

      const ownerBalanceAfter = await token.read.balanceOf([user.account.address]);
      const burnBalanceAfter = await token.read.balanceOf(["0x000000000000000000000000000000000000dead"]);

      assert.equal(ownerBalanceAfter - ownerBalanceBefore, 0n); // Owner gets exactly 0
      assert.equal(burnBalanceAfter - burnBalanceBefore, parseUnits("20", 6)); // Dead gets everything
    });
  });

  // ── 3. SECURITY & REPLAY ATTACK PREVENTION ───────────────────────────────────

  describe("Security Boundaries", () => {
    it("should strictly prevent EIP-712 signature replay attacks across the ecosystem", async () => {
      const { viem, user, stranger, admin, treasury, pass, token, publicClient, chainId } = ctx;
      const agentId = await registerIntegrationAgent(user);

      const passAsOwner = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: user } });
      await passAsOwner.write.setConfig([agentId, makeAgentConfig(token.address as Address)]);

      const deadline = await getDeadline(publicClient);
      const nonce = await treasury.read.nonces([agentId]);
      const newEndpoint = encodePacked(["string"], ["https://hacked-endpoint.com"]) as `0x${string}`;

      // Admin legitimately signs metadata update
      const metaSig = await signSetMetadata(
        admin, treasury.address as Address, chainId,
        agentId, "endpoint", newEndpoint, nonce, deadline
      );

      const tAsStranger = await viem.getContractAt("AgentTreasury", treasury.address, { client: { wallet: stranger } });

      // Stranger relays the valid signature (allowed, since sig is from admin)
      await tAsStranger.write.updateMetadata([agentId, "endpoint", newEndpoint, deadline, metaSig]);

      // Stranger tries to REPLAY the exact same signature
      await viem.assertions.revertWith(
        tAsStranger.write.updateMetadata([agentId, "endpoint", newEndpoint, deadline, metaSig]),
        "Invalid admin signature" // Nonce has incremented, old sig is strictly invalid
      );
    });
  });

  // ── 4. STRESS TESTS ──────────────────────────────────────────────────────────

  describe("Stress Testing & High Load Ecosystem Scenarios", () => {
    it("should seamlessly route multi-agent bulk purchases from different owners (Stress Test)", async () => {
      const { viem, user, stranger, user2, pass, token } = ctx; // user2 is the buyer

      // User 1 creates Agent A
      const agentA = await registerIntegrationAgent(user, { name: "Agent A" });
      const passAsUser = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: user } });
      await passAsUser.write.setConfig([agentA, makeAgentConfig(token.address as Address)]);

      // Stranger creates Agent B
      const agentB = await registerIntegrationAgent(stranger, { name: "Agent B" });
      const passAsStranger = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: stranger } });
      await passAsStranger.write.setConfig([agentB, makeAgentConfig(token.address as Address)]);

      // User 2 buys passes for both
      const passAsUser2 = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: user2 } });
      const tokenAsUser2 = await viem.getContractAt("Token", token.address, { client: { wallet: user2 } });
      await tokenAsUser2.write.approve([pass.address, parseUnits("100", 6)]);

      const user1BalanceBefore = await token.read.balanceOf([user.account.address]);
      const strangerBalanceBefore = await token.read.balanceOf([stranger.account.address]);

      // Sequential fast purchases
      await passAsUser2.write.purchasePass([agentA]);
      await passAsUser2.write.purchasePass([agentB]);

      // Array bounds verification
      const activePasses = await pass.read.getActivePasses([user2.account.address]);
      assert.equal(activePasses.length, 2);
      assert.equal(activePasses.includes(agentA), true);
      assert.equal(activePasses.includes(agentB), true);

      // Verify routing math
      const user1BalanceAfter = await token.read.balanceOf([user.account.address]);
      const strangerBalanceAfter = await token.read.balanceOf([stranger.account.address]);

      // Default fee is 10. Burn is 40%. Each owner should receive 6 USDC
      assert.equal(user1BalanceAfter - user1BalanceBefore, parseUnits("6", 6));
      assert.equal(strangerBalanceAfter - strangerBalanceBefore, parseUnits("6", 6));
    });

    it("should safely handle massive off-chain usage tracking operations (Stress Test)", async () => {
      const { viem, user, user2, admin, pass, token } = ctx;

      const agentId = await registerIntegrationAgent(user);
      const passAsOwner = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: user } });
      
      const config = makeAgentConfig(token.address as Address);
      config.maxRequests = 5000n; // High limit
      await passAsOwner.write.setConfig([agentId, config]);

      const passAsUser2 = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: user2 } });
      const tokenAsUser2 = await viem.getContractAt("Token", token.address, { client: { wallet: user2 } });

      await tokenAsUser2.write.approve([pass.address, parseUnits("100", 6)]);
      await passAsUser2.write.purchasePass([agentId]);

      const passAsRelayer = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: admin } });

      // Simulating a highly active agent generating multiple rapid usage updates
      for (let i = 0; i < 10; i++) {
        await passAsRelayer.write.recordUsage([agentId, user2.account.address, 150n]);
      }

      // Check cumulative logic safely tracked
      const status = await pass.read.getPassStatus([user2.account.address, agentId]);
      assert.equal(status[3], 1500n); // 10 * 150
      assert.equal(status[0], true); // Still active (1500 < 5000)
    });
  });
});