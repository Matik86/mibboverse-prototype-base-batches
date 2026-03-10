import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { type Address } from "viem";

import {
  createDeployedContractsFixture,
  makeAgentCard,
  getWalletDeadline,
  getNextAgentId,
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

describe("AgentRegistry", { concurrency: 1 }, () => {
  let ctx: DeployedContracts;

  beforeEach(async () => {
    // Quickly reverts EVM state without full redeployment
    ctx = await useFixture();
  });

  // ── Internal Helpers ─────────────────────────────────────────────────────────

  /**
   * Registers a new agent cleanly via the AgentRegistry on behalf of the specified wallet.
   * Flow:
   * 1. Predicts the next agentId.
   * 2. Generates the required ERC8004 EIP-712 wallet consent signature.
   * 3. Calls registerAgent.
   */
  async function registerAgent(
    fixture: DeployedContracts,
    userClient: any = fixture.user,
    cardOverrides: any = {}
  ): Promise<bigint> {
    const predictedId = await getNextAgentId(
      fixture.publicClient,
      fixture.erc8004.address as Address
    );

    const walletDeadline = await getWalletDeadline(fixture.publicClient);

    const walletSig = await signAgentWalletSet(
      userClient,
      fixture.erc8004.address as Address,
      fixture.chainId,
      predictedId,
      userClient.account.address as Address,
      fixture.treasury.address as Address, // Treasury owns the NFT after transfer
      walletDeadline
    );

    const registryAsUser = await fixture.viem.getContractAt(
      "AgentRegistry",
      fixture.registry.address,
      { client: { wallet: userClient } }
    );

    await registryAsUser.write.registerAgent([
      makeAgentCard(cardOverrides) as any,
      walletDeadline,
      walletSig,
    ]);

    return predictedId;
  }

  // ── 1. MANAGEMENT ────────────────────────────────────────────────────────────

  describe("Management", () => {
    describe("renounceOwnership()", () => {
      it("should always revert with 'Ownership renouncement disabled'", async () => {
        await assert.rejects(
          ctx.publicClient.simulateContract({
            address: ctx.registry.address,
            abi: ctx.registry.abi,
            functionName: "renounceOwnership",
            account: ctx.owner.account,
          }),
          (err: any) => err.message.includes("Ownership renouncement disabled")
        );
      });
    });
  });

  // ── 2. AGENT REGISTRATION ────────────────────────────────────────────────────

  describe("Agent Registration", () => {
    describe("registerAgent()", () => {
      it("should register an agent and increment totalAgents", async () => {
        assert.equal(await ctx.registry.read.totalAgents(), 0n);
        await registerAgent(ctx);
        assert.equal(await ctx.registry.read.totalAgents(), 1n);
      });

      it("should securely transfer the NFT to the treasury after registration", async () => {
        const agentId = await registerAgent(ctx);
        assertAddressEqual(await ctx.erc8004.read.ownerOf([agentId]), ctx.treasury.address);
      });

      it("should set the agentWallet to the registering user's wallet", async () => {
        const agentId = await registerAgent(ctx);
        assertAddressEqual(
          await ctx.erc8004.read.getAgentWallet([agentId]),
          ctx.user.account.address
        );
      });

      it("should correctly set the beneficialOwner to the caller", async () => {
        const agentId = await registerAgent(ctx);
        assertAddressEqual(await ctx.registry.read.getAgentOwner([agentId]), ctx.user.account.address);
      });

      it("should properly update the isIdTaken status", async () => {
        const agentId = await registerAgent(ctx);
        assert.equal(await ctx.registry.read.isIdTaken([agentId]), true);
      });

      it("should revert if the ERC8004 wallet signature is invalid or dummy", async () => {
        const registryAsUser = await ctx.viem.getContractAt(
          "AgentRegistry",
          ctx.registry.address,
          { client: { wallet: ctx.user } }
        );

        const walletDeadline = await getWalletDeadline(ctx.publicClient);

        // Using DUMMY_SIG triggers an internal signature validation failure in ERC8004
        await assert.rejects(
          registryAsUser.write.registerAgent([
            makeAgentCard() as any,
            walletDeadline,
            DUMMY_SIG,
          ])
        );
      });
    });
  });

  // ── 3. GETTERS & MODIFIERS ───────────────────────────────────────────────────

  describe("Getters & Modifiers", () => {
    describe("getAgentInfo()", () => {
      it("should return correct core agent info for a valid agent", async () => {
        const agentId = await registerAgent(ctx, ctx.user);

        const [beneficialOwner, agentWallet, createdAt] =
          await ctx.registry.read.getAgentInfo([agentId]);

        assertAddressEqual(beneficialOwner, ctx.user.account.address);
        assertAddressEqual(agentWallet, ctx.user.account.address);
        assert.ok(createdAt > 0n); // Timestamp should be correctly initialized
      });

      it("should revert with 'Agent not found' for a non-existent agent", async () => {
        await ctx.viem.assertions.revertWith(
          ctx.registry.read.getAgentInfo([9999n]),
          "Agent not found"
        );
      });
    });

    describe("isOwner() & isIdTaken()", () => {
      it("should return true from isOwner() for the actual beneficial owner", async () => {
        const agentId = await registerAgent(ctx, ctx.user);
        assert.equal(await ctx.registry.read.isOwner([agentId, ctx.user.account.address]), true);
      });

      it("should return false from isOwner() for a stranger", async () => {
        const agentId = await registerAgent(ctx, ctx.user);
        assert.equal(await ctx.registry.read.isOwner([agentId, ctx.stranger.account.address]), false);
      });

      it("should return false from isIdTaken() for an unknown agentId", async () => {
        assert.equal(await ctx.registry.read.isIdTaken([9999n]), false);
      });
    });

    describe("Array Queries: getAgentsByOwner() & agentOfOwnerByIndex()", () => {
      it("should return an empty array for an owner with no agents", async () => {
        const agents = await ctx.registry.read.getAgentsByOwner([ctx.stranger.account.address]);
        assert.equal(agents.length, 0);
      });

      it("should successfully track and return multiple agents registered by the same owner", async () => {
        await registerAgent(ctx, ctx.user, { name: "Agent A" });
        await registerAgent(ctx, ctx.user, { name: "Agent B" });
        await registerAgent(ctx, ctx.user, { name: "Agent C" });

        const agents = await ctx.registry.read.getAgentsByOwner([ctx.user.account.address]);
        assert.equal(agents.length, 3);
        assert.equal(await ctx.registry.read.totalAgents(), 3n);
      });

      it("should revert from agentOfOwnerByIndex() when index is out of bounds", async () => {
        await registerAgent(ctx, ctx.user); // Index 0 exists

        await ctx.viem.assertions.revertWith(
          ctx.registry.read.agentOfOwnerByIndex([ctx.user.account.address, 1n]),
          "Index out of bounds"
        );
      });

      it("should return the correct agentId at the specified index", async () => {
        const id0 = await registerAgent(ctx, ctx.user, { name: "First Agent" });
        const id1 = await registerAgent(ctx, ctx.user, { name: "Second Agent" });

        assert.notEqual(id0, id1);

        assert.equal(await ctx.registry.read.agentOfOwnerByIndex([ctx.user.account.address, 0n]), id0);
        assert.equal(await ctx.registry.read.agentOfOwnerByIndex([ctx.user.account.address, 1n]), id1);
      });
    });
  });

  // ── 4. SECURITY ──────────────────────────────────────────────────────────────

  describe("Security", () => {
    describe("onERC721Received()", () => {
      it("should reject NFT transfers from unauthorized or malicious contracts", async () => {
        const maliciousCaller = ctx.stranger.account;

        await assert.rejects(
          ctx.publicClient.simulateContract({
            address: ctx.registry.address,
            abi: ctx.registry.abi,
            functionName: "onERC721Received",
            args: [
              ctx.stranger.account.address,
              ctx.stranger.account.address,
              1n,
              "0x",
            ],
            account: maliciousCaller,
          }),
          (err: any) => err.message.includes("Only designated ERC8004 allowed")
        );
      });

      it("should safely accept NFT transfers strictly from the official ERC8004 contract", async () => {
        // Secure impersonation of the ERC8004 contract via Viem
        const testClient = await ctx.viem.getTestClient();
        await testClient.impersonateAccount({ address: ctx.erc8004.address as Address });
        await testClient.setBalance({
          address: ctx.erc8004.address as Address,
          value: 1000000000000000000n, // Provide ETH for gas
        });

        const result = await ctx.publicClient.simulateContract({
          address: ctx.registry.address,
          abi: ctx.registry.abi,
          functionName: "onERC721Received",
          args: [
            ctx.user.account.address,
            ctx.user.account.address,
            1n,
            "0x",
          ],
          account: ctx.erc8004.address as Address,
        });

        // Ensure the contract returns the correct standard selector
        assert.equal(result.result, "0x150b7a02");

        await testClient.stopImpersonatingAccount({ address: ctx.erc8004.address as Address });
      });
    });
  });

  // ── 5. STRESS TESTS / COMPLEX SCENARIOS ──────────────────────────────────────

  describe("Stress Tests & Complex Scenarios", () => {
    it("should process bulk registrations properly without index collisions", async () => {
      const REGISTRATIONS_COUNT = 10;
      const registeredIds: bigint[] = [];

      // Loop registering multiple agents for the same user
      for (let i = 0; i < REGISTRATIONS_COUNT; i++) {
        const id = await registerAgent(ctx, ctx.user, { name: `Bulk Agent ${i}` });
        registeredIds.push(id);
      }

      assert.equal(await ctx.registry.read.totalAgents(), BigInt(REGISTRATIONS_COUNT));

      const userAgents = await ctx.registry.read.getAgentsByOwner([ctx.user.account.address]);
      assert.equal(userAgents.length, REGISTRATIONS_COUNT);

      // Verify the order of registration was maintained perfectly in mapping
      for (let i = 0; i < REGISTRATIONS_COUNT; i++) {
        assert.equal(userAgents[i], registeredIds[i]);
        assert.equal(
          await ctx.registry.read.agentOfOwnerByIndex([ctx.user.account.address, BigInt(i)]),
          registeredIds[i]
        );
      }
    });

    it("should keep distinct agent scopes when multiple users register concurrently", async () => {
      // Interleaving registrations to simulate highly parallel network activity
      const user1Ids: bigint[] = [];
      const user2Ids: bigint[] = [];

      user1Ids.push(await registerAgent(ctx, ctx.user));
      user2Ids.push(await registerAgent(ctx, ctx.user2));
      user1Ids.push(await registerAgent(ctx, ctx.user));
      user1Ids.push(await registerAgent(ctx, ctx.user));
      user2Ids.push(await registerAgent(ctx, ctx.user2));

      // Assert global counters
      assert.equal(await ctx.registry.read.totalAgents(), 5n);

      const u1Agents = await ctx.registry.read.getAgentsByOwner([ctx.user.account.address]);
      const u2Agents = await ctx.registry.read.getAgentsByOwner([ctx.user2.account.address]);
      
      assert.equal(u1Agents.length, 3);
      assert.equal(u2Agents.length, 2);

      // Verify User 1 bounds
      assert.equal(await ctx.registry.read.agentOfOwnerByIndex([ctx.user.account.address, 0n]), user1Ids[0]);
      assert.equal(await ctx.registry.read.agentOfOwnerByIndex([ctx.user.account.address, 2n]), user1Ids[2]);

      // Verify User 2 bounds
      assert.equal(await ctx.registry.read.agentOfOwnerByIndex([ctx.user2.account.address, 0n]), user2Ids[0]);
      assert.equal(await ctx.registry.read.agentOfOwnerByIndex([ctx.user2.account.address, 1n]), user2Ids[1]);

      // Ensure zero crossover between arrays
      assert.ok(!u2Agents.includes(user1Ids[0]));
    });
  });
});