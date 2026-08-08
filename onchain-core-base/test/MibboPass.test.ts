import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUnits } from "viem";
import { createDeployedContractsFixture, makePassConfig, registerAgent, type DeployedContracts } from "./helpers.js";

const useFixture = createDeployedContractsFixture();

describe("MibboPass", { concurrency: 1 }, () => {
  let ctx: DeployedContracts;
  beforeEach(async () => { ctx = await useFixture(); });

  async function configure(agentId: bigint) {
    const registryOwner = await ctx.viem.getContractAt("MibboPass", ctx.pass.address, { client: { wallet: ctx.user } });
    await registryOwner.write.setConfig([agentId, makePassConfig(ctx.token.address)]);
  }

  it("mints a soulbound pass, pays the agent owner, and creates an active quota", async () => {
    const agentId = await registerAgent(ctx);
    await configure(agentId);
    const passAsBuyer = await ctx.viem.getContractAt("MibboPass", ctx.pass.address, { client: { wallet: ctx.user2 } });
    await ctx.token.write.approve([ctx.pass.address, parseUnits("10", 6)], { account: ctx.user2.account });
    const ownerBalance = await ctx.token.read.balanceOf([ctx.user.account.address]);
    await passAsBuyer.write.purchasePass([agentId]);
    assert.equal(await ctx.pass.read.balanceOf([ctx.user2.account.address, agentId]), 1n);
    assert.equal(await ctx.pass.read.balanceOf([ctx.user2.account.address, agentId + 1n]), 0n);
    assert.equal(await ctx.pass.read.uri([agentId]), "ipfs://pass-config-v1");
    assert.equal(await ctx.pass.read.hasAccess([ctx.user2.account.address, agentId]), true);
    assert.equal(await ctx.token.read.balanceOf([ctx.user.account.address]), ownerBalance + parseUnits("10", 6));
    await assert.rejects(passAsBuyer.write.safeTransferFrom([ctx.user2.account.address, ctx.stranger.account.address, agentId, 1n, "0x"]));
  });

  it("only lets a relayer record usage and closes access at the quota", async () => {
    const agentId = await registerAgent(ctx);
    await configure(agentId);
    await ctx.token.write.approve([ctx.pass.address, parseUnits("10", 6)], { account: ctx.user2.account });
    const buyerPass = await ctx.viem.getContractAt("MibboPass", ctx.pass.address, { client: { wallet: ctx.user2 } });
    await buyerPass.write.purchasePass([agentId]);
    const relayerPass = await ctx.viem.getContractAt("MibboPass", ctx.pass.address, { client: { wallet: ctx.relayer } });
    await relayerPass.write.recordUsage([agentId, ctx.user2.account.address, 100n]);
    assert.equal(await ctx.pass.read.hasAccess([ctx.user2.account.address, agentId]), false);
    await assert.rejects(relayerPass.write.recordUsage([agentId, ctx.user2.account.address, 1n]));
    await assert.rejects(buyerPass.write.recordUsage([agentId, ctx.user2.account.address, 1n]));
  });

  it("rejects usage recording after the pass has expired", async () => {
    const agentId = await registerAgent(ctx);
    await configure(agentId);
    await ctx.token.write.approve([ctx.pass.address, parseUnits("10", 6)], { account: ctx.user2.account });
    const buyerPass = await ctx.viem.getContractAt("MibboPass", ctx.pass.address, { client: { wallet: ctx.user2 } });
    await buyerPass.write.purchasePass([agentId]);
    await ctx.provider.request({ method: "evm_increaseTime", params: [8 * 24 * 60 * 60] });
    await ctx.provider.request({ method: "evm_mine" });
    assert.equal(await ctx.pass.read.hasAccess([ctx.user2.account.address, agentId]), false);
    const relayerPass = await ctx.viem.getContractAt("MibboPass", ctx.pass.address, { client: { wallet: ctx.relayer } });
    await assert.rejects(relayerPass.write.recordUsage([agentId, ctx.user2.account.address, 1n]));
  });

  it("sets versioned pass metadata URI only together with a new config", async () => {
    const agentId = await registerAgent(ctx);
    const ownerPass = await ctx.viem.getContractAt("MibboPass", ctx.pass.address, { client: { wallet: ctx.user } });
    assert.equal(await ctx.pass.read.uri([agentId]), "");
    await ownerPass.write.setConfig([agentId, { ...makePassConfig(ctx.token.address), metadataURI: "ipfs://pass-v1" }]);
    assert.equal(await ctx.pass.read.uri([agentId]), "ipfs://pass-v1");
    assert.equal(await ctx.pass.read.getConfigURI([agentId, 1]), "ipfs://pass-v1");
    await ownerPass.write.setConfig([agentId, { ...makePassConfig(ctx.token.address), metadataURI: "ipfs://pass-v2" }]);
    assert.equal(await ctx.pass.read.uri([agentId]), "ipfs://pass-v2");
    assert.equal(await ctx.pass.read.getConfigURI([agentId, 1]), "ipfs://pass-v1");
    assert.equal(await ctx.pass.read.getConfigURI([agentId, 2]), "ipfs://pass-v2");
  });

  it("preserves prior config versions while pausing the current config for all access checks", async () => {
    const agentId = await registerAgent(ctx);
    await configure(agentId);
    const ownerPass = await ctx.viem.getContractAt("MibboPass", ctx.pass.address, { client: { wallet: ctx.user } });
    await ctx.token.write.approve([ctx.pass.address, parseUnits("10", 6)], { account: ctx.user2.account });
    const buyerPass = await ctx.viem.getContractAt("MibboPass", ctx.pass.address, { client: { wallet: ctx.user2 } });
    await buyerPass.write.purchasePass([agentId]);
    await ownerPass.write.setConfig([agentId, { ...makePassConfig(ctx.token.address), subscriptionFee: parseUnits("12", 6), metadataURI: "ipfs://pass-v2" }]);
    const beforePause = await ctx.pass.read.getCurrentConfig([agentId]);
    assert.ok(beforePause.configuredAt > 0n);
    assert.equal(beforePause.updatedAt, beforePause.configuredAt);
    await ctx.provider.request({ method: "evm_increaseTime", params: [1] });
    await ctx.provider.request({ method: "evm_mine" });
    await ownerPass.write.setPaused([agentId, true]);
    assert.equal(await ctx.pass.read.hasAccess([ctx.user2.account.address, agentId]), false);
    assert.equal((await ctx.pass.read.getConfig([agentId, 1n])).paused, false);
    const pausedConfig = await ctx.pass.read.getCurrentConfig([agentId]);
    assert.equal(pausedConfig.paused, true);
    assert.ok(pausedConfig.updatedAt > pausedConfig.configuredAt);
  });
});
