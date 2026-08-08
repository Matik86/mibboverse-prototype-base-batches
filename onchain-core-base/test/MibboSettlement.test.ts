import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { keccak256, parseEther, parseSignature, toHex } from "viem";
import { network } from "hardhat";

type Context = {
  viem: any;
  provider: { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
  publicClient: any;
  owner: any;
  relayer: any;
  treasury: any;
  payer: any;
  outsider: any;
  nextRelayer: any;
  token: any;
  settlement: any;
};

const chargeId = (label: string) => keccak256(toHex(label));

describe("MibboSettlement", { concurrency: 1 }, () => {
  let ctx: Context;

  async function deadlineIn(seconds = 3600): Promise<bigint> {
    const block = await ctx.publicClient.getBlock();
    return block.timestamp + BigInt(seconds);
  }

  async function signPermit(quota: bigint, deadline: bigint) {
    const nonce = await ctx.token.read.nonces([ctx.payer.account.address]);
    const signature = await ctx.payer.signTypedData({
      domain: {
        name: "Mock Payment Token",
        version: "1",
        chainId: await ctx.publicClient.getChainId(),
        verifyingContract: ctx.token.address,
      },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: {
        owner: ctx.payer.account.address,
        spender: ctx.settlement.address,
        value: quota,
        nonce,
        deadline,
      },
    });
    const parsed = parseSignature(signature);
    return { nonce, v: Number(parsed.v), r: parsed.r, s: parsed.s };
  }

  async function activate(quota: bigint, amount: bigint, label = "request-1") {
    const deadline = await deadlineIn();
    const permit = await signPermit(quota, deadline);
    const authorizationId = await ctx.settlement.read.computeAuthorizationId([
      ctx.payer.account.address,
      permit.nonce,
      quota,
      deadline,
    ]);
    const asRelayer = await ctx.viem.getContractAt("MibboSettlement", ctx.settlement.address, {
      client: { wallet: ctx.relayer },
    });
    await asRelayer.write.activateAndSettle([
      ctx.payer.account.address,
      quota,
      deadline,
      permit.v,
      permit.r,
      permit.s,
      amount,
      chargeId(label),
    ]);
    return { authorizationId, deadline, permit, asRelayer };
  }

  beforeEach(async () => {
    const connection = await network.connect();
    const [owner, relayer, treasury, payer, outsider, nextRelayer] = await connection.viem.getWalletClients();
    const publicClient = await connection.viem.getPublicClient();
    const token = await connection.viem.deployContract("MockPermitToken");
    const settlement = await connection.viem.deployContract("MibboSettlement", [
      token.address,
      treasury.account.address,
      owner.account.address,
      relayer.account.address,
    ]);
    await token.write.mint([payer.account.address, parseEther("10")]);

    ctx = {
      viem: connection.viem,
      provider: connection.provider as Context["provider"],
      publicClient,
      owner,
      relayer,
      treasury,
      payer,
      outsider,
      nextRelayer,
      token,
      settlement,
    };
  });

  it("uses one Permit for the first and subsequent settlements", async () => {
    const quota = parseEther("0.1");
    const firstAmount = parseEther("0.01");
    const secondAmount = parseEther("0.02");
    const { authorizationId, asRelayer } = await activate(quota, firstAmount);
    await asRelayer.write.settle([authorizationId, secondAmount, chargeId("request-2")]);

    assert.equal(await ctx.token.read.balanceOf([ctx.treasury.account.address]), firstAmount + secondAmount);
    assert.equal(await ctx.token.read.balanceOf([ctx.relayer.account.address]), 0n);
    assert.equal(await ctx.token.read.balanceOf([ctx.outsider.account.address]), 0n);
    assert.equal(
      await ctx.token.read.allowance([ctx.payer.account.address, ctx.settlement.address]),
      quota - firstAmount - secondAmount,
    );
    assert.equal(await ctx.settlement.read.remaining([authorizationId]), quota - firstAmount - secondAmount);
    const authorization = await ctx.settlement.read.authorizations([authorizationId]);
    assert.equal(authorization[2], firstAmount + secondAmount);
  });

  it("rejects a duplicate charge id", async () => {
    const amount = parseEther("0.01");
    const { authorizationId, asRelayer } = await activate(parseEther("0.1"), amount, "same-request");
    await assert.rejects(
      asRelayer.write.settle([authorizationId, amount, chargeId("same-request")]),
      (error: any) => error.message.includes("ChargeAlreadySettled"),
    );
  });

  it("never lets the relayer exceed the signed quota", async () => {
    const { authorizationId, asRelayer } = await activate(parseEther("0.1"), parseEther("0.09"));
    await assert.rejects(
      asRelayer.write.settle([authorizationId, parseEther("0.02"), chargeId("request-2")]),
      (error: any) => error.message.includes("AmountExceedsRemaining"),
    );
  });

  it("allows only the configured relayer to activate an authorization", async () => {
    const quota = parseEther("0.1");
    const deadline = await deadlineIn();
    const permit = await signPermit(quota, deadline);
    const asOutsider = await ctx.viem.getContractAt("MibboSettlement", ctx.settlement.address, {
      client: { wallet: ctx.outsider },
    });
    await assert.rejects(
      asOutsider.write.activateAndSettle([
        ctx.payer.account.address, quota, deadline, permit.v, permit.r, permit.s, parseEther("0.01"), chargeId("request-1"),
      ]),
      (error: any) => error.message.includes("NotRelayer"),
    );
  });

  it("lets the payer cancel future settlements", async () => {
    const amount = parseEther("0.01");
    const { authorizationId, asRelayer } = await activate(parseEther("0.1"), amount);
    const asPayer = await ctx.viem.getContractAt("MibboSettlement", ctx.settlement.address, {
      client: { wallet: ctx.payer },
    });
    await asPayer.write.cancelAuthorization([authorizationId]);
    await assert.rejects(
      asRelayer.write.settle([authorizationId, amount, chargeId("request-2")]),
      (error: any) => error.message.includes("AuthorizationIsCancelled"),
    );
  });

  it("enforces the authorization deadline after Permit activation", async () => {
    const quota = parseEther("0.1");
    const amount = parseEther("0.01");
    const deadline = await deadlineIn(60);
    const permit = await signPermit(quota, deadline);
    const authorizationId = await ctx.settlement.read.computeAuthorizationId([
      ctx.payer.account.address, permit.nonce, quota, deadline,
    ]);
    const asRelayer = await ctx.viem.getContractAt("MibboSettlement", ctx.settlement.address, {
      client: { wallet: ctx.relayer },
    });
    await asRelayer.write.activateAndSettle([
      ctx.payer.account.address, quota, deadline, permit.v, permit.r, permit.s, amount, chargeId("request-1"),
    ]);
    await ctx.provider.request({ method: "evm_setNextBlockTimestamp", params: [Number(deadline + 1n)] });
    await ctx.provider.request({ method: "evm_mine" });
    await assert.rejects(
      asRelayer.write.settle([authorizationId, amount, chargeId("request-2")]),
      (error: any) => error.message.includes("AuthorizationExpired"),
    );
  });

  it("supports emergency pause and relayer rotation", async () => {
    const quota = parseEther("0.1");
    const amount = parseEther("0.01");
    const deadline = await deadlineIn();
    const permit = await signPermit(quota, deadline);
    const asRelayer = await ctx.viem.getContractAt("MibboSettlement", ctx.settlement.address, {
      client: { wallet: ctx.relayer },
    });
    await ctx.settlement.write.pause();
    await assert.rejects(
      asRelayer.write.activateAndSettle([
        ctx.payer.account.address, quota, deadline, permit.v, permit.r, permit.s, amount, chargeId("request-1"),
      ]),
      (error: any) => error.message.includes("EnforcedPause"),
    );

    await ctx.settlement.write.unpause();
    await ctx.settlement.write.setRelayer([ctx.nextRelayer.account.address]);
    await assert.rejects(
      asRelayer.write.activateAndSettle([
        ctx.payer.account.address, quota, deadline, permit.v, permit.r, permit.s, amount, chargeId("request-1"),
      ]),
      (error: any) => error.message.includes("NotRelayer"),
    );
    const asNextRelayer = await ctx.viem.getContractAt("MibboSettlement", ctx.settlement.address, {
      client: { wallet: ctx.nextRelayer },
    });
    await asNextRelayer.write.activateAndSettle([
      ctx.payer.account.address, quota, deadline, permit.v, permit.r, permit.s, amount, chargeId("request-1"),
    ]);
  });
});
