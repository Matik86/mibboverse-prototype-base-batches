import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseUnits, type Address } from "viem";

import {
  createDeployedContractsFixture,
  makeAgentCard,
  makeAgentConfig,
  getWalletDeadline,
  getNextAgentId,
  signAgentWalletSet,
  assertAddressEqual,
  type DeployedContracts,
} from "./helpers.js";

/**
 * Type alias extending our base context with the strictly typed pass contract.
 * We deploy everything once and revert to snapshot to keep tests fast.
 */
type TestContext = DeployedContracts & { pass: any };

const useBaseFixture = createDeployedContractsFixture();

describe("AgentPass", { concurrency: 1 }, () => {
  let ctx: TestContext;

  // ── Internal Setup Helpers ───────────────────────────────────────────────────

  /**
   * Extends the base fixture to also dynamically deploy AgentPass.
   * We do this inline to avoid polluting the core helpers with AgentPass specific logic
   * while it's under heavy development.
   */
  async function useFixtureWithPass(): Promise<TestContext> {
    const base = await useBaseFixture();
    
    // Deploy the AgentPass contract 
    const pass = await base.viem.deployContract("AgentPass", [
      base.registry.address,
      base.admin.account.address, // Admin acts as the initial relayer
      "https://api.example.com/pass/",
    ]);

    return { ...base, pass };
  }

  /**
   * Helper to cleanly register an agent and apply an initial config.
   * This leaves the agent in a state ready for passes to be purchased.
   */
  async function setupReadyAgent(
    fixture: TestContext,
    fee: string = "10",
    durationDays: number = 7
  ): Promise<bigint> {
    const { publicClient, erc8004, treasury, chainId, viem, registry, user, token, pass } = fixture;

    // 1. Register Agent
    const agentId = await getNextAgentId(publicClient, erc8004.address as Address);
    const deadline = await getWalletDeadline(publicClient);
    
    const walletSig = await signAgentWalletSet(
      user, erc8004.address as Address, chainId, agentId,
      user.account.address as Address, treasury.address as Address, deadline
    );

    const registryAsUser = await viem.getContractAt("AgentRegistry", registry.address, { client: { wallet: user } });
    await registryAsUser.write.registerAgent([makeAgentCard() as any, deadline, walletSig]);

    // 2. Configure Agent via AgentPass
    const passAsUser = await viem.getContractAt("AgentPass", pass.address, { client: { wallet: user } });
    const config = makeAgentConfig(token.address as Address);
    config.subscriptionFee = parseUnits(fee, 6);
    config.duration = BigInt(durationDays * 24 * 60 * 60);

    await passAsUser.write.setConfig([agentId, config]);

    return agentId;
  }

  beforeEach(async () => {
    ctx = await useFixtureWithPass();
  });

  // ── 1. MANAGEMENT & SETUP ────────────────────────────────────────────────────

  describe("Management & Setup", () => {
    describe("Constructor parameters", () => {
      it("should set the registry address correctly", async () => {
        assertAddressEqual(await ctx.pass.read.registry(), ctx.registry.address);
      });

      it("should set the baseURI correctly", async () => {
        assert.equal(await ctx.pass.read.baseURI(), "https://api.example.com/pass/");
      });

      it("should set the initial relayer status correctly", async () => {
        assert.equal(await ctx.pass.read.isRelayer([ctx.admin.account.address]), true);
        assert.equal(await ctx.pass.read.isRelayer([ctx.user.account.address]), false);
      });
    });

    describe("setRelayer()", () => {
      it("should allow the owner to grant relayer role", async () => {
        await ctx.pass.write.setRelayer([ctx.stranger.account.address, true]);
        assert.equal(await ctx.pass.read.isRelayer([ctx.stranger.account.address]), true);
      });

      it("should allow the owner to revoke relayer role", async () => {
        await ctx.pass.write.setRelayer([ctx.stranger.account.address, false]);
        assert.equal(await ctx.pass.read.isRelayer([ctx.stranger.account.address]), false);
      });

      it("should reject setRelayer() from a non-owner", async () => {
        const passAsUser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user } });
        await assert.rejects(
          passAsUser.write.setRelayer([ctx.user.account.address, true]),
          (err: any) => err.message.includes("OwnableUnauthorizedAccount")
        );
      });
    });

    describe("setBaseURI() & uri()", () => {
      it("should allow the owner to update baseURI", async () => {
        await ctx.pass.write.setBaseURI(["https://new-uri.com/"]);
        assert.equal(await ctx.pass.read.baseURI(), "https://new-uri.com/");
      });

      it("should construct the correct token URI dynamically", async () => {
        assert.equal(await ctx.pass.read.uri([42n]), "https://api.example.com/pass/42");
      });

      it("should reject setBaseURI() from a non-owner", async () => {
        const passAsUser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user } });
        await assert.rejects(
          passAsUser.write.setBaseURI(["test"]),
          (err: any) => err.message.includes("OwnableUnauthorizedAccount")
        );
      });
    });

    describe("renounceOwnership()", () => {
      it("should always revert to prevent accidental locking", async () => {
        await assert.rejects(
          ctx.publicClient.simulateContract({
            address: ctx.pass.address,
            abi: ctx.pass.abi,
            functionName: "renounceOwnership",
            account: ctx.owner.account,
          }),
          (err: any) => err.message.includes("Ownership renouncement disabled")
        );
      });
    });
  });

  // ── 2. AGENT CONFIGURATION ───────────────────────────────────────────────────

  describe("Agent Configuration", () => {
    describe("setConfig()", () => {
      it("should save config and increment version correctly", async () => {
        const agentId = await setupReadyAgent(ctx);
        const passAsUser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user } });
        
        // Setup agent automatically applies configVersion = 1.
        assert.equal(await ctx.pass.read.currentVersion([agentId]), 1n);

        // Update config to trigger version 2
        const updatedConfig = makeAgentConfig(ctx.token.address as Address);
        updatedConfig.subscriptionFee = parseUnits("20", 6);
        await passAsUser.write.setConfig([agentId, updatedConfig]);

        assert.equal(await ctx.pass.read.currentVersion([agentId]), 2n);
        const cfg = await ctx.pass.read.getCurrentConfig([agentId]);
        assert.equal(cfg.subscriptionFee, parseUnits("20", 6));
      });

      it("should keep previous config versions accessible via getConfig()", async () => {
        const agentId = await setupReadyAgent(ctx);
        const passAsUser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user } });

        const updatedConfig = makeAgentConfig(ctx.token.address as Address);
        updatedConfig.subscriptionFee = parseUnits("20", 6);
        await passAsUser.write.setConfig([agentId, updatedConfig]);

        assert.equal((await ctx.pass.read.getConfig([agentId, 1n])).subscriptionFee, parseUnits("10", 6));
        assert.equal((await ctx.pass.read.getConfig([agentId, 2n])).subscriptionFee, parseUnits("20", 6));
      });

      it("should revert if called by someone who is not the agent owner", async () => {
        const agentId = await setupReadyAgent(ctx);
        const passAsStranger = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.stranger } });

        await ctx.viem.assertions.revertWith(
          passAsStranger.write.setConfig([agentId, makeAgentConfig(ctx.token.address as Address)]),
          "Not agent owner"
        );
      });

      it("should revert if configuration parameters are invalid (Validation Check)", async () => {
        const agentId = await setupReadyAgent(ctx);
        const passAsUser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user } });

        const baseCfg = makeAgentConfig(ctx.token.address as Address);

        await ctx.viem.assertions.revertWith(
          passAsUser.write.setConfig([agentId, { ...baseCfg, tokenAddress: "0x0000000000000000000000000000000000000000" }]),
          "Invalid token"
        );

        await ctx.viem.assertions.revertWith(
          passAsUser.write.setConfig([agentId, { ...baseCfg, subscriptionFee: 0n }]),
          "Fee required"
        );

        await ctx.viem.assertions.revertWith(
          passAsUser.write.setConfig([agentId, { ...baseCfg, maxRequests: 0n }]),
          "Requests required"
        );

        await ctx.viem.assertions.revertWith(
          passAsUser.write.setConfig([agentId, { ...baseCfg, duration: 3600n }]), // Too short
          "Invalid duration"
        );
      });
    });

    describe("setPaused()", () => {
      it("should allow the agent owner to pause and unpause access", async () => {
        const agentId = await setupReadyAgent(ctx);
        const passAsUser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user } });

        await passAsUser.write.setPaused([agentId, true]);
        assert.equal((await ctx.pass.read.getCurrentConfig([agentId])).paused, true);

        await passAsUser.write.setPaused([agentId, false]);
        assert.equal((await ctx.pass.read.getCurrentConfig([agentId])).paused, false);
      });

      it("should revert if called by a non-owner", async () => {
        const agentId = await setupReadyAgent(ctx);
        const passAsStranger = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.stranger } });

        await ctx.viem.assertions.revertWith(
          passAsStranger.write.setPaused([agentId, true]),
          "Not agent owner"
        );
      });

      it("should not bump config version when pausing", async () => {
        const agentId = await setupReadyAgent(ctx);
        const passAsUser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user } });

        assert.equal(await ctx.pass.read.currentVersion([agentId]), 1n);
        await passAsUser.write.setPaused([agentId, true]);
        assert.equal(await ctx.pass.read.currentVersion([agentId]), 1n);
      });
    });
  });

  // ── 3. PURCHASING MECHANICS ──────────────────────────────────────────────────

  describe("Purchasing Mechanics", () => {
    describe("purchasePass()", () => {
      let agentId: bigint;
      
      beforeEach(async () => {
        agentId = await setupReadyAgent(ctx, "10", 7); // 10 tokens, 7 days
      });

      it("should mint an ERC1155 token on successful purchase", async () => {
        const passAsPurchaser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user2 } });
        const tokenAsPurchaser = await ctx.viem.getContractAt("Token", ctx.token.address, { client: { wallet: ctx.user2 } });

        await tokenAsPurchaser.write.approve([ctx.pass.address, parseUnits("10", 6)]);
        await passAsPurchaser.write.purchasePass([agentId]);

        assert.equal(await ctx.pass.read.balanceOf([ctx.user2.account.address, agentId]), 1n);
      });

      it("should distribute fees correctly to the owner and the burn address", async () => {
        const passAsPurchaser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user2 } });
        const tokenAsPurchaser = await ctx.viem.getContractAt("Token", ctx.token.address, { client: { wallet: ctx.user2 } });

        const ownerBalanceBefore = await ctx.token.read.balanceOf([ctx.user.account.address]);
        const burnBalanceBefore = await ctx.token.read.balanceOf(["0x000000000000000000000000000000000000dead"]);

        await tokenAsPurchaser.write.approve([ctx.pass.address, parseUnits("10", 6)]);
        await passAsPurchaser.write.purchasePass([agentId]);

        const ownerBalanceAfter = await ctx.token.read.balanceOf([ctx.user.account.address]);
        const burnBalanceAfter = await ctx.token.read.balanceOf(["0x000000000000000000000000000000000000dead"]);

        // Total fee: 10. Burn BPS: 4000 (40%). 
        // Expected Burn: 4. Expected Owner: 6.
        assert.equal(ownerBalanceAfter - ownerBalanceBefore, parseUnits("6", 6));
        assert.equal(burnBalanceAfter - burnBalanceBefore, parseUnits("4", 6));
      });

      it("should accurately save PassMeta state", async () => {
        const passAsPurchaser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user2 } });
        const tokenAsPurchaser = await ctx.viem.getContractAt("Token", ctx.token.address, { client: { wallet: ctx.user2 } });

        await tokenAsPurchaser.write.approve([ctx.pass.address, parseUnits("10", 6)]);
        await passAsPurchaser.write.purchasePass([agentId]);

        const status = await ctx.pass.read.getPassStatus([ctx.user2.account.address, agentId]);
        const block = await ctx.publicClient.getBlock();

        const expectedDuration = BigInt(7 * 24 * 60 * 60);

        assert.equal(status[0], true); // active
        assert.equal(status[1], block.timestamp + expectedDuration); // expiresAt
        assert.equal(status[3], 0n); // requestsUsed
        assert.equal(status[4], 100n); // maxRequests
        assert.equal(status[5], 1n); // configVersion
      });

      it("should revert if the agent is paused", async () => {
        const passAsUser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user } });
        await passAsUser.write.setPaused([agentId, true]);

        const passAsPurchaser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user2 } });
        const tokenAsPurchaser = await ctx.viem.getContractAt("Token", ctx.token.address, { client: { wallet: ctx.user2 } });

        await tokenAsPurchaser.write.approve([ctx.pass.address, parseUnits("10", 6)]);

        await ctx.viem.assertions.revertWith(
          passAsPurchaser.write.purchasePass([agentId]),
          "Agent paused"
        );
      });

      it("should burn the old pass and mint a new one upon renewal", async () => {
        const passAsPurchaser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user2 } });
        const tokenAsPurchaser = await ctx.viem.getContractAt("Token", ctx.token.address, { client: { wallet: ctx.user2 } });

        await tokenAsPurchaser.write.approve([ctx.pass.address, parseUnits("100", 6)]); // Approve plenty

        await passAsPurchaser.write.purchasePass([agentId]);
        assert.equal(await ctx.pass.read.balanceOf([ctx.user2.account.address, agentId]), 1n);

        // Fast renewal
        await passAsPurchaser.write.purchasePass([agentId]);

        // Balance must remain exactly 1n (Soulbound constraint)
        assert.equal(await ctx.pass.read.balanceOf([ctx.user2.account.address, agentId]), 1n);
      });
    });
  });

  // ── 4. ACCESS & USAGE TRACKING ───────────────────────────────────────────────

  describe("Access & Usage Tracking", () => {
    let agentId: bigint;
    
    beforeEach(async () => {
      agentId = await setupReadyAgent(ctx);
      
      const passAsPurchaser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user2 } });
      const tokenAsPurchaser = await ctx.viem.getContractAt("Token", ctx.token.address, { client: { wallet: ctx.user2 } });

      await tokenAsPurchaser.write.approve([ctx.pass.address, parseUnits("10", 6)]);
      await passAsPurchaser.write.purchasePass([agentId]);
    });

    describe("recordUsage()", () => {
      it("should increment requestsUsed correctly when called by relayer", async () => {
        const passAsRelayer = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.admin } });

        await passAsRelayer.write.recordUsage([agentId, ctx.user2.account.address, 20n]);
        await passAsRelayer.write.recordUsage([agentId, ctx.user2.account.address, 30n]);

        const status = await ctx.pass.read.getPassStatus([ctx.user2.account.address, agentId]);
        assert.equal(status[3], 50n); // requestsUsed
      });

      it("should cap requestsUsed at maxRequests and void access", async () => {
        const passAsRelayer = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.admin } });

        await passAsRelayer.write.recordUsage([agentId, ctx.user2.account.address, 99n]);
        assert.equal(await ctx.pass.read.hasAccess([ctx.user2.account.address, agentId]), true);

        // Exceeding the max (100n)
        await passAsRelayer.write.recordUsage([agentId, ctx.user2.account.address, 5n]); 

        const status = await ctx.pass.read.getPassStatus([ctx.user2.account.address, agentId]);
        assert.equal(status[3], 100n); // Capped
        assert.equal(await ctx.pass.read.hasAccess([ctx.user2.account.address, agentId]), false);
      });

      it("should revert if called by a non-relayer", async () => {
        const passAsStranger = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user2 } });

        await ctx.viem.assertions.revertWith(
          passAsStranger.write.recordUsage([agentId, ctx.user2.account.address, 1n]),
          "Not relayer"
        );
      });
    });

    describe("hasAccess()", () => {
      it("should return false if the agent owner pauses the agent", async () => {
        assert.equal(await ctx.pass.read.hasAccess([ctx.user2.account.address, agentId]), true);

        const passAsOwner = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user } });
        await passAsOwner.write.setPaused([agentId, true]);

        assert.equal(await ctx.pass.read.hasAccess([ctx.user2.account.address, agentId]), false);
      });
    });
  });

  // ── 5. BATCH QUERIES & GETTERS ───────────────────────────────────────────────

  describe("Batch Queries & Getters", () => {
    describe("getUserPasses() & getActivePasses()", () => {
      let agentId1: bigint;
      let agentId2: bigint;

      beforeEach(async () => {
        agentId1 = await setupReadyAgent(ctx);
        agentId2 = await setupReadyAgent(ctx);

        const passAsPurchaser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user2 } });
        const tokenAsPurchaser = await ctx.viem.getContractAt("Token", ctx.token.address, { client: { wallet: ctx.user2 } });

        await tokenAsPurchaser.write.approve([ctx.pass.address, parseUnits("100", 6)]);
        await passAsPurchaser.write.purchasePass([agentId1]);
        await passAsPurchaser.write.purchasePass([agentId2]);
      });

      it("should return the correct list of all acquired passes", async () => {
        const passes = await ctx.pass.read.getUserPasses([ctx.user2.account.address]);
        assert.equal(passes.length, 2);
        assert.equal(passes[0], agentId1);
        assert.equal(passes[1], agentId2);
      });

      it("should filter out inactive passes when requesting active ones", async () => {
        const passAsRelayer = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.admin } });
        
        // Exhaust pass for agentId1
        await passAsRelayer.write.recordUsage([agentId1, ctx.user2.account.address, 100n]);

        const activePasses = await ctx.pass.read.getActivePasses([ctx.user2.account.address]);
        
        assert.equal(activePasses.length, 1);
        assert.equal(activePasses[0], agentId2); // Only agentId2 should remain active
      });
    });
  });

  // ── 6. SOULBOUND LOGIC ───────────────────────────────────────────────────────

  describe("Security: Soulbound Limitations", () => {
    let agentId: bigint;

    beforeEach(async () => {
      agentId = await setupReadyAgent(ctx);
      const passAsPurchaser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user2 } });
      const tokenAsPurchaser = await ctx.viem.getContractAt("Token", ctx.token.address, { client: { wallet: ctx.user2 } });

      await tokenAsPurchaser.write.approve([ctx.pass.address, parseUnits("10", 6)]);
      await passAsPurchaser.write.purchasePass([agentId]);
    });

    describe("_update() hooks", () => {
      it("should strictly block safeTransferFrom", async () => {
        const passAsPurchaser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user2 } });

        await ctx.viem.assertions.revertWith(
          passAsPurchaser.write.safeTransferFrom([
            ctx.user2.account.address,
            ctx.stranger.account.address,
            agentId,
            1n,
            "0x"
          ]),
          "Soulbound: Pass is non-transferable"
        );
      });

      it("should strictly block safeBatchTransferFrom", async () => {
        const passAsPurchaser = await ctx.viem.getContractAt("AgentPass", ctx.pass.address, { client: { wallet: ctx.user2 } });

        await ctx.viem.assertions.revertWith(
          passAsPurchaser.write.safeBatchTransferFrom([
            ctx.user2.account.address,
            ctx.stranger.account.address,
            [agentId],
            [1n],
            "0x"
          ]),
          "Soulbound: Pass is non-transferable"
        );
      });
    });
  });
});