import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUnits, stringToHex } from "viem";
import { createDeployedContractsFixture, makePassConfig, registerAgent, type DeployedContracts } from "./helpers.js";

const useFixture = createDeployedContractsFixture();

describe("core lifecycle", { concurrency: 1 }, () => {
  let ctx: DeployedContracts;
  beforeEach(async () => { ctx = await useFixture(); });

  it("executes registration, owner metadata management, purchase, and relayer usage", async () => {
    const agentId = await registerAgent(ctx);
    const passAsOwner = await ctx.viem.getContractAt("MibboPass", ctx.pass.address, { client: { wallet: ctx.user } });
    const registryAsOwner = await ctx.viem.getContractAt("MibboRegistry", ctx.registry.address, { client: { wallet: ctx.user } });
    await registryAsOwner.write.updateAgentMetadata([agentId, "endpoint", stringToHex("https://live.example")]);
    await passAsOwner.write.setConfig([agentId, makePassConfig(ctx.token.address)]);
    await ctx.token.write.approve([ctx.pass.address, parseUnits("10", 6)], { account: ctx.user2.account });
    const passAsBuyer = await ctx.viem.getContractAt("MibboPass", ctx.pass.address, { client: { wallet: ctx.user2 } });
    await passAsBuyer.write.purchasePass([agentId]);
    const passAsRelayer = await ctx.viem.getContractAt("MibboPass", ctx.pass.address, { client: { wallet: ctx.relayer } });
    await passAsRelayer.write.recordUsage([agentId, ctx.user2.account.address, 25n]);
    const [active, , , used, maxRequests, configVersion] = await ctx.pass.read.getPassStatus([ctx.user2.account.address, agentId]);
    assert.equal(active, true);
    assert.equal(used, 25n);
    assert.equal(maxRequests, 100n);
    assert.equal(configVersion, 1n);
    assert.equal(await ctx.erc8004.read.getMetadata([agentId, "endpoint"]), stringToHex("https://live.example"));
  });
});
