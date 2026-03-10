import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { encodePacked, type Address, getAddress } from "viem";

import {
  createDeployedContractsFixture,
  makeAgentCard,
  getDeadline,
  getWalletDeadline,
  getNextAgentId,
  signSetWallet,
  signSetMetadata,
  signAgentWalletSet,
  assertAddressEqual,
  DUMMY_SIG,
  type DeployedContracts,
} from "./helpers.js";

/**
 * Snapshot-based fixture
 * - Deploys all contracts ONCE.
 * - Reverts the EVM state to the post-deploy snapshot before EACH test.
 * This guarantees perfect test isolation with minimal performance overhead.
 */
const useFixture = createDeployedContractsFixture();

describe("AgentTreasury", { concurrency: 1 }, () => {
  let ctx: DeployedContracts;

  beforeEach(async () => {
    // Quickly reverts EVM state without full redeployment
    ctx = await useFixture();
  });

  // ── Internal Helpers ─────────────────────────────────────────────────────────

  /**
   * Registers an agent cleanly via the AgentRegistry.
   * This is necessary because AgentTreasury expects the agent to be properly registered
   * and the NFT to be transferred into the Treasury as part of the flow.
   */
  async function registerAgent(fixture: DeployedContracts): Promise<bigint> {
    const predictedId = await getNextAgentId(
      fixture.publicClient,
      fixture.erc8004.address as Address
    );

    const walletDeadline = await getWalletDeadline(fixture.publicClient);

    const walletSig = await signAgentWalletSet(
      fixture.user,
      fixture.erc8004.address as Address,
      fixture.chainId,
      predictedId,
      fixture.user.account.address as Address,
      fixture.treasury.address as Address,
      walletDeadline
    );

    const registryAsUser = await fixture.viem.getContractAt(
      "AgentRegistry",
      fixture.registry.address,
      { client: { wallet: fixture.user } }
    );

    await registryAsUser.write.registerAgent([
      makeAgentCard() as any,
      walletDeadline,
      walletSig,
    ]);

    return predictedId;
  }

  /**
   * Helper to generate a new ERC8004 EIP-712 wallet signature for wallet updates.
   */
  async function makeWalletSig(
    fixture: DeployedContracts,
    signer: any,
    agentId: bigint,
    newWallet: Address
  ) {
    const deadline = await getWalletDeadline(fixture.publicClient);
    const sig = await signAgentWalletSet(
      signer,
      fixture.erc8004.address as Address,
      fixture.chainId,
      agentId,
      newWallet,
      fixture.treasury.address as Address, // Current owner is always the treasury
      deadline
    );
    return { walletDeadline: deadline, walletSig: sig };
  }

  // ── 1. MANAGEMENT ────────────────────────────────────────────────────────────

  describe("Management", () => {
    describe("setAdmin()", () => {
    it("should allow the owner to grant admin role", async () => {
      assert.equal(await ctx.treasury.read.isAdmin([ctx.user.account.address]), false);
      
      await ctx.treasury.write.setAdmin([ctx.user.account.address, true]);
      
      assert.equal(await ctx.treasury.read.isAdmin([ctx.user.account.address]), true);
    });

    it("should allow the owner to revoke admin role", async () => {
      assert.equal(await ctx.treasury.read.isAdmin([ctx.admin.account.address]), true);
      
      await ctx.treasury.write.setAdmin([ctx.admin.account.address, false]);
      
      assert.equal(await ctx.treasury.read.isAdmin([ctx.admin.account.address]), false);
    });

    it("should reject setAdmin from a non-owner", async () => {
      const treasuryAsUser = await ctx.viem.getContractAt(
        "AgentTreasury",
        ctx.treasury.address,
        { client: { wallet: ctx.user } }
      );
      await assert.rejects(
        treasuryAsUser.write.setAdmin([ctx.user.account.address, true]),
        (err: any) => err.message.includes("OwnableUnauthorizedAccount")
      );
    });

    it("should revert when admin is the zero address", async () => {
      await ctx.viem.assertions.revertWith(
        ctx.treasury.write.setAdmin(["0x0000000000000000000000000000000000000000", true]),
        "Zero address"
      );
    });
    });

    describe("setAgentRegistry()", () => {
      it("should revert if trying to set registry again on configured treasury", async () => {
        // In helpers.ts deployAll(), setAgentRegistry is already called once.
        await ctx.viem.assertions.revertWith(
          ctx.treasury.write.setAgentRegistry([ctx.stranger.account.address]),
          "Registry already set"
        );
      });

      it("should allow setting the registry once on a fresh deployment", async () => {
        const freshTreasury = await ctx.viem.deployContract("AgentTreasury", [
          ctx.erc8004.address,
        ]);

        await freshTreasury.write.setAgentRegistry([ctx.registry.address]);
        assertAddressEqual(await freshTreasury.read.agentRegistry(), ctx.registry.address);
      });

      it("should revert when setting registry to zero address", async () => {
        const freshTreasury = await ctx.viem.deployContract("AgentTreasury", [
          ctx.erc8004.address,
        ]);

        await ctx.viem.assertions.revertWith(
          freshTreasury.write.setAgentRegistry(["0x0000000000000000000000000000000000000000"]),
          "Zero address: agentRegistry"
        );
      });
    });

    describe("renounceOwnership()", () => {
      it("should always revert with 'Ownership renouncement disabled'", async () => {
        await assert.rejects(
          ctx.publicClient.simulateContract({
            address: ctx.treasury.address,
            abi: ctx.treasury.abi,
            functionName: "renounceOwnership",
            account: ctx.owner.account,
          }),
          (err: any) => err.message.includes("Ownership renouncement disabled")
        );
      });
    });
  });

  // ── 2. AGENT LIFECYCLE ────────────────────────────────────────────────────────────

  describe("Agent Lifecycle", () => {
    describe("initAgent()", () => {
    it("should reject initAgent from a non-registry caller", async () => {
      const treasuryAsUser = await ctx.viem.getContractAt(
        "AgentTreasury",
        ctx.treasury.address,
        { client: { wallet: ctx.user } }
      );
      const deadline = await getWalletDeadline(ctx.publicClient);

      await ctx.viem.assertions.revertWith(
        treasuryAsUser.write.initAgent([1n, ctx.user.account.address, deadline, DUMMY_SIG]),
        "Only AgentRegistry"
      );
    });

    it("should revert if the NFT is not owned by the treasury", async () => {
      // 1. Deploy a fresh Treasury to isolate this specific test
      const freshTreasury = await ctx.viem.deployContract("AgentTreasury", [
        ctx.erc8004.address,
      ]);

      // 2. We set 'user' as the authorized Registry for this specific fresh Treasury
      // This allows 'user' to bypass the "Only AgentRegistry" check.
      await freshTreasury.write.setAgentRegistry([ctx.user.account.address]);

      // 3. The 'user' directly mints an NFT from ERC8004 to themselves (bypassing treasury logic)
      const erc8004AsUser = await ctx.viem.getContractAt(
        "IdentityRegistryUpgradeable",
        ctx.erc8004.address,
        { client: { wallet: ctx.user } }
      );
      
      const txHash = await erc8004AsUser.write.register(["https://test"]);
      await ctx.publicClient.waitForTransactionReceipt({ hash: txHash });
      
      // Get the next valid agent ID (or assume it's the one we just minted)
      const agentId = await getNextAgentId(ctx.publicClient, ctx.erc8004.address as Address) - 1n;
      const deadline = await getWalletDeadline(ctx.publicClient);

      const treasuryAsUser = await ctx.viem.getContractAt(
        "AgentTreasury",
        freshTreasury.address,
        { client: { wallet: ctx.user } } // Acting as the authorized registry
      );

      // Now it passes the 'Only AgentRegistry' check, but hits 'NFT not in treasury'
      // because the NFT is currently sitting on 'ctx.user.account.address'
      await ctx.viem.assertions.revertWith(
        treasuryAsUser.write.initAgent([agentId, ctx.user.account.address, deadline, DUMMY_SIG]),
        "NFT not in treasury"
      );
    });

    it("should correctly initialize agent when called via full registry flow", async () => {
      const agentId = await registerAgent(ctx);

      assertAddressEqual(
        await ctx.erc8004.read.getAgentWallet([agentId]),
        ctx.user.account.address
      );
      assertAddressEqual(
        await ctx.erc8004.read.ownerOf([agentId]),
        ctx.treasury.address
      );
    });
    });

    describe("updateAgentWallet()", () => {
      it("should successfully update wallet and increment nonce", async () => {
        const agentId = await registerAgent(ctx);
        const nonceBefore = await ctx.treasury.read.nonces([agentId]);
        const adminDeadline = await getDeadline(ctx.publicClient);

        const adminSig = await signSetWallet(
          ctx.admin,
          ctx.treasury.address as Address,
          ctx.chainId,
          agentId,
          ctx.user2.account.address,
          nonceBefore,
          adminDeadline
        );

        const { walletDeadline, walletSig } = await makeWalletSig(
          ctx,
          ctx.user2,
          agentId,
          ctx.user2.account.address as Address
        );

        const treasuryAsUser = await ctx.viem.getContractAt(
          "AgentTreasury",
          ctx.treasury.address,
          { client: { wallet: ctx.user } }
        );

        await treasuryAsUser.write.updateAgentWallet([
          agentId,
          ctx.user2.account.address,
          adminDeadline,
          adminSig,
          walletDeadline,
          walletSig,
        ]);

        assertAddressEqual(
          await ctx.erc8004.read.getAgentWallet([agentId]),
          ctx.user2.account.address
        );
        assert.equal(await ctx.treasury.read.nonces([agentId]), nonceBefore + 1n);
      });

      it("should revert with 'Admin signature expired' when deadline is in the past", async () => {
        const agentId = await registerAgent(ctx);
        const adminDeadline = 1n; // Far past
        const nonce = await ctx.treasury.read.nonces([agentId]);

        const adminSig = await signSetWallet(
          ctx.admin, ctx.treasury.address as Address, ctx.chainId, agentId, ctx.user2.account.address, nonce, adminDeadline
        );
        const walletDeadline = await getWalletDeadline(ctx.publicClient);

        const treasuryAsUser = await ctx.viem.getContractAt(
          "AgentTreasury", ctx.treasury.address, { client: { wallet: ctx.user } }
        );

        await ctx.viem.assertions.revertWith(
          treasuryAsUser.write.updateAgentWallet([
            agentId, ctx.user2.account.address, adminDeadline, adminSig, walletDeadline, DUMMY_SIG
          ]),
          "Admin signature expired"
        );
      });

      it("should revert with 'Invalid admin signature' if signed by a non-admin", async () => {
        const agentId = await registerAgent(ctx);
        const adminDeadline = await getDeadline(ctx.publicClient);
        const nonce = await ctx.treasury.read.nonces([agentId]);

        // Sign with 'user' instead of 'admin'
        const fakeSig = await signSetWallet(
          ctx.user, ctx.treasury.address as Address, ctx.chainId, agentId, ctx.user2.account.address, nonce, adminDeadline
        );
        const walletDeadline = await getWalletDeadline(ctx.publicClient);

        const treasuryAsUser = await ctx.viem.getContractAt(
          "AgentTreasury", ctx.treasury.address, { client: { wallet: ctx.user } }
        );

        await ctx.viem.assertions.revertWith(
          treasuryAsUser.write.updateAgentWallet([
            agentId, ctx.user2.account.address, adminDeadline, fakeSig, walletDeadline, DUMMY_SIG
          ]),
          "Invalid admin signature"
        );
      });

      it("should prevent replay attacks by utilizing nonces properly", async () => {
        const agentId = await registerAgent(ctx);
        const adminDeadline = await getDeadline(ctx.publicClient);
        const nonce = await ctx.treasury.read.nonces([agentId]);

        const adminSig = await signSetWallet(
          ctx.admin, ctx.treasury.address as Address, ctx.chainId, agentId, ctx.user2.account.address, nonce, adminDeadline
        );

        const { walletDeadline, walletSig } = await makeWalletSig(ctx, ctx.user2, agentId, ctx.user2.account.address as Address);

        const treasuryAsUser = await ctx.viem.getContractAt("AgentTreasury", ctx.treasury.address, { client: { wallet: ctx.user } });

        // First call succeeds
        await treasuryAsUser.write.updateAgentWallet([
          agentId, ctx.user2.account.address, adminDeadline, adminSig, walletDeadline, walletSig
        ]);

        // Using the exact same adminSig again should fail since nonce incremented
        const { walletDeadline: wd2, walletSig: ws2 } = await makeWalletSig(ctx, ctx.user2, agentId, ctx.user2.account.address as Address);

        await ctx.viem.assertions.revertWith(
          treasuryAsUser.write.updateAgentWallet([
            agentId, ctx.user2.account.address, adminDeadline, adminSig, wd2, ws2
          ]),
          "Invalid admin signature"
        );
      });
    });

    describe("updateMetadata()", () => {
      it("should successfully update metadata and increment nonce", async () => {
        const agentId = await registerAgent(ctx);
        const nonceBefore = await ctx.treasury.read.nonces([agentId]);
        const deadline = await getDeadline(ctx.publicClient);

        const newValue = encodePacked(["string"], ["https://new-endpoint.com"]) as `0x${string}`;

        const adminSig = await signSetMetadata(
          ctx.admin, ctx.treasury.address as Address, ctx.chainId, agentId, "endpoint", newValue, nonceBefore, deadline
        );

        const treasuryAsUser = await ctx.viem.getContractAt("AgentTreasury", ctx.treasury.address, { client: { wallet: ctx.user } });

        await treasuryAsUser.write.updateMetadata([agentId, "endpoint", newValue, deadline, adminSig]);

        assert.equal(await ctx.erc8004.read.getMetadata([agentId, "endpoint"]), newValue);
        assert.equal(await ctx.treasury.read.nonces([agentId]), nonceBefore + 1n);
      });

      it("should revert if attempting to update reserved key 'agentWallet'", async () => {
        const agentId = await registerAgent(ctx);
        const deadline = await getDeadline(ctx.publicClient);
        const nonce = await ctx.treasury.read.nonces([agentId]);

        const val = encodePacked(["address"], [ctx.stranger.account.address]) as `0x${string}`;

        const adminSig = await signSetMetadata(
          ctx.admin, ctx.treasury.address as Address, ctx.chainId, agentId, "agentWallet", val, nonce, deadline
        );

        const treasuryAsUser = await ctx.viem.getContractAt("AgentTreasury", ctx.treasury.address, { client: { wallet: ctx.user } });

        await ctx.viem.assertions.revertWith(
          treasuryAsUser.write.updateMetadata([agentId, "agentWallet", val, deadline, adminSig]),
          "reserved key"
        );
      });
    });
  });

  // ── 3. ERC721 RECEIVER HOOK ──────────────────────────────────────────────────

  describe("Security: onERC721Received", () => {
    it("should reject NFT transfers from unauthorized contracts", async () => {
      await assert.rejects(
        ctx.publicClient.simulateContract({
          address: ctx.treasury.address,
          abi: ctx.treasury.abi,
          functionName: "onERC721Received",
          args: [ctx.user.account.address, ctx.user.account.address, 1n, "0x"],
          account: ctx.stranger.account, // Random caller pretending to be an ERC721
        }),
        (err: any) => err.message.includes("Only designated ERC8004 allowed")
      );
    });
  });

  // ── 4. STRESS TESTS / COMPLEX SCENARIOS ──────────────────────────────────────

  describe("Stress Tests & Complex Scenarios", () => {
    it("should support sequential wallet updates seamlessly (Stress Test)", async () => {
      const agentId = await registerAgent(ctx);
      const treasuryAsUser = await ctx.viem.getContractAt("AgentTreasury", ctx.treasury.address, { client: { wallet: ctx.user } });

      const steps: [any, Address][] = [
        [ctx.user2, ctx.user2.account.address as Address],
        [ctx.stranger, ctx.stranger.account.address as Address],
        [ctx.user, ctx.user.account.address as Address], // Back to original
      ];

      for (const [signer, target] of steps) {
        const adminDeadline = await getDeadline(ctx.publicClient);
        const nonce = await ctx.treasury.read.nonces([agentId]);

        const adminSig = await signSetWallet(
          ctx.admin, ctx.treasury.address as Address, ctx.chainId, agentId, target, nonce, adminDeadline
        );

        const { walletDeadline, walletSig } = await makeWalletSig(ctx, signer, agentId, target);

        await treasuryAsUser.write.updateAgentWallet([
          agentId, target, adminDeadline, adminSig, walletDeadline, walletSig,
        ]);

        assertAddressEqual(await ctx.erc8004.read.getAgentWallet([agentId]), target);
      }

      // Initial nonce was 0 -> After 3 updates, it should be 3
      assert.equal(await ctx.treasury.read.nonces([agentId]), 3n);
    });

    it("should maintain safe state integrity between wallet updates and metadata updates", async () => {
      const agentId = await registerAgent(ctx);
      const treasuryAsUser = await ctx.viem.getContractAt("AgentTreasury", ctx.treasury.address, { client: { wallet: ctx.user } });

      // --- Step 1: updateAgentWallet (nonce 0 -> 1) ---
      const adminDeadline = await getDeadline(ctx.publicClient);
      let nonce = await ctx.treasury.read.nonces([agentId]);
      
      const adminSig = await signSetWallet(ctx.admin, ctx.treasury.address as Address, ctx.chainId, agentId, ctx.user2.account.address, nonce, adminDeadline);
      const { walletDeadline, walletSig } = await makeWalletSig(ctx, ctx.user2, agentId, ctx.user2.account.address as Address);

      await treasuryAsUser.write.updateAgentWallet([agentId, ctx.user2.account.address, adminDeadline, adminSig, walletDeadline, walletSig]);
      assert.equal(await ctx.treasury.read.nonces([agentId]), 1n);

      // --- Step 2: updateMetadata (nonce 1 -> 2) ---
      const deadline = await getDeadline(ctx.publicClient);
      nonce = await ctx.treasury.read.nonces([agentId]);
      
      const val = encodePacked(["string"], ["https://updated.com"]) as `0x${string}`;
      const sig = await signSetMetadata(ctx.admin, ctx.treasury.address as Address, ctx.chainId, agentId, "endpoint", val, nonce, deadline);

      await treasuryAsUser.write.updateMetadata([agentId, "endpoint", val, deadline, sig]);
      assert.equal(await ctx.treasury.read.nonces([agentId]), 2n);
    });
  });
});