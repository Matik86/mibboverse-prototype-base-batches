# MibboSettlement: internal x402 settlement

`MibboSettlement` is a non-upgradeable, private settlement contract for one EIP-2612 token and one immutable treasury. It is independent of `MibboRegistry`, `MibboTreasury`, and `MibboPass`; deploy it only for a sign-once, settle-many x402 flow.

- The user signs one EIP-2612 Permit naming the settlement contract as spender.
- The backend relayer sends `activateAndSettle` once. It atomically applies Permit, creates the on-chain quota and charges the first request.
- Later requests call `settle` with the same authorization ID and a unique `chargeId`.
- Quota, deadline and duplicate-charge protection are enforced on-chain.
- Tokens always move from payer to the constructor-defined treasury. They never pass through the relayer or remain in the contract.
- The payer can cancel an authorization. The owner can pause the module and rotate the relayer.

The relayer can consume the unused amount of a valid authorization. That is the necessary trust boundary of a sign-once, settle-many model. A compromise cannot exceed the user-signed quota or redirect funds to another recipient.

Use a multisig as `owner` and a dedicated, low-balance gas wallet as `relayer` in production. Unlike MibboTreasury, this owner must remain available for emergency pause/unpause and relayer rotation.

## Public interface

`IMibboSettlement` contains the module's custom errors, events, and external interface.

| Function | Caller | Purpose |
|---|---|---|
| `activateAndSettle(...)` | Relayer | Applies Permit, creates an authorisation, and settles the first charge atomically. |
| `settle(authorizationId, amount, chargeId)` | Relayer | Settles a subsequent unique charge within the remaining quota. |
| `cancelAuthorization(authorizationId)` | Payer | Prevents future charges from that authorisation. |
| `setRelayer(address)` | Owner | Rotates the relayer. |
| `pause()` / `unpause()` | Owner | Emergency control of new settlements. |

## Deployment

Add these public addresses to `.env`:

```env
SETTLEMENT_TOKEN_ADDRESS=
SETTLEMENT_TREASURY_ADDRESS=
SETTLEMENT_OWNER_ADDRESS=
SETTLEMENT_RELAYER_ADDRESS=
```

The Ignition module reads them directly. Use:

```powershell
npx hardhat ignition deploy ignition/modules/MibboSettlement.ts --network baseSepolia
```

The private key used to send the deployment transaction remains the existing `PRIVATE_KEY` from `.env`; it is not passed to the contract.

For the agent identity and pass deployment, see [core architecture](ARCHITECTURE.md).
