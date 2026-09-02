import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { stringToHex } from "viem";
import { assertAddressEqual, createDeployedContractsFixture, registerAgent, type DeployedContracts } from "./helpers.js";

const useFixture = createDeployedContractsFixture();

describe("MibboRegistry", { concurrency: 1 }, () => {
  let ctx: DeployedContracts;
  beforeEach(async () => { ctx = await useFixture(); });

  it("registers an identity NFT to Treasury and records its beneficial owner", async () => {
    const agentId = await registerAgent(ctx);
    assert.equal(await ctx.registry.read.totalAgents(), 1n);
    assertAddressEqual(await ctx.erc8004.read.ownerOf([agentId]), ctx.treasury.address);
    const [owner, wallet] = await ctx.registry.read.getAgentInfo([agentId]);
    assertAddressEqual(owner, ctx.user.account.address);
    assertAddressEqual(wallet, ctx.user.account.address);
    assert.deepEqual(await ctx.registry.read.getAgentsByOwner([ctx.user.account.address]), [agentId]);
  });

  it("allows only the beneficial owner to update metadata through Registry", async () => {
    const agentId = await registerAgent(ctx);
    const registryAsOwner = await ctx.viem.getContractAt("MibboRegistry", ctx.registry.address, { client: { wallet: ctx.user } });
    await registryAsOwner.write.updateAgentMetadata([agentId, "endpoint", stringToHex("https://new.example.test")]);
    assert.equal(await ctx.erc8004.read.getMetadata([agentId, "endpoint"]), stringToHex("https://new.example.test"));

    const registryAsStranger = await ctx.viem.getContractAt("MibboRegistry", ctx.registry.address, { client: { wallet: ctx.stranger } });
    await assert.rejects(registryAsStranger.write.updateAgentMetadata([agentId, "endpoint", stringToHex("https://attacker.example")]))
  });

  it("routes URI changes through Treasury and rejects unknown agents", async () => {
    const agentId = await registerAgent(ctx);
    const registryAsOwner = await ctx.viem.getContractAt("MibboRegistry", ctx.registry.address, { client: { wallet: ctx.user } });
    const hash = await registryAsOwner.write.updateAgentURI([agentId, "ipfs://updated-card"]);
    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
    assert.equal(await ctx.erc8004.read.tokenURI([agentId]), "ipfs://updated-card");
    const events = await ctx.registry.getEvents.AgentURIUpdated({ agentId }, {
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].args.newURI, "ipfs://updated-card");

    const registryAsStranger = await ctx.viem.getContractAt("MibboRegistry", ctx.registry.address, { client: { wallet: ctx.stranger } });
    await assert.rejects(registryAsStranger.write.updateAgentURI([agentId, "ipfs://attacker-card"]));
    await assert.rejects(ctx.registry.read.getAgentInfo([999_999n]));
  });
});
