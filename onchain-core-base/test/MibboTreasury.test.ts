import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { stringToHex, zeroAddress } from "viem";
import { assertAddressEqual, createDeployedContractsFixture, registerAgent, type DeployedContracts } from "./helpers.js";

const useFixture = createDeployedContractsFixture();

describe("MibboTreasury", { concurrency: 1 }, () => {
  let ctx: DeployedContracts;
  beforeEach(async () => { ctx = await useFixture(); });

  it("accepts initialization only from the configured Registry", async () => {
    await assert.rejects(ctx.treasury.write.initAgent([1n, ctx.user.account.address, 1n, "0x"]));
  });

  it("custodies registered NFTs and only accepts Registry metadata calls", async () => {
    const agentId = await registerAgent(ctx);
    assertAddressEqual(await ctx.erc8004.read.ownerOf([agentId]), ctx.treasury.address);
    await assert.rejects(ctx.treasury.write.updateMetadata([agentId, "endpoint", stringToHex("https://attacker.example")]));
  });

  it("exposes Registry as the trust boundary for privileged ERC-8004 writes", async () => {
    const agentId = await registerAgent(ctx);
    const registryAsOwner = await ctx.viem.getContractAt("MibboRegistry", ctx.registry.address, { client: { wallet: ctx.user } });
    await registryAsOwner.write.updateAgentMetadata([agentId, "endpoint", stringToHex("https://owner.example")]);
    assert.equal(await ctx.erc8004.read.getMetadata([agentId, "endpoint"]), stringToHex("https://owner.example"));
  });

  it("can irreversibly finalize the Registry binding after setup", async () => {
    await ctx.treasury.write.renounceOwnership();
    assertAddressEqual(await ctx.treasury.read.owner(), zeroAddress);

    await assert.rejects(ctx.treasury.write.setAgentRegistry([ctx.stranger.account.address]));

    const agentId = await registerAgent(ctx);
    assertAddressEqual(await ctx.erc8004.read.ownerOf([agentId]), ctx.treasury.address);
  });
});
