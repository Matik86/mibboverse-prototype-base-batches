# Core on-chain architecture

This document describes the current `MibboRegistry → MibboTreasury → ERC-8004` core. It does not cover the separate settlement module.

## Components and trust boundaries

```text
creator
  │ registerAgent / updateAgentMetadata / updateAgentURI
  ▼
MibboRegistry ─────────── beneficial owner and agent index
  │ register NFT; forward owner-authorised metadata changes
  ▼
MibboTreasury ─────────── ERC-8004 identity-NFT custodian
  │ onlyRegistry privileged calls
  ▼
ERC-8004 Identity Registry

buyer ── ERC-20 payment ──► MibboPass (soulbound ERC-1155)
                               ├─ full fee → beneficial owner
                               └─ authorised relayer → recordUsage
```

`MibboRegistry` records the permanent beneficial owner. `MibboTreasury` owns every registered ERC-8004 identity NFT, so neither the NFT nor its reputation can be transferred by the creator. The Treasury is the only component allowed to execute the privileged ERC-8004 calls; the Registry is its sole caller.

## Registration lifecycle

1. The creator signs the ERC-8004 `AgentWalletSet` typed data for the next agent id. The NFT owner in that signature is the Treasury, because the Treasury will custody the NFT.
2. The creator calls `MibboRegistry.registerAgent(card, walletDeadline, walletSig)`.
3. Registry calls `erc8004.register(card.endpoint)`, receives the identity NFT and transfers it to Treasury.
4. Registry calls `MibboTreasury.initAgent`. Treasury verifies custody and calls ERC-8004 `setAgentWallet`.
5. Registry stores the creator as `beneficialOwner`, adds the id to their index and emits `AgentRegistered`.

The wallet signature is required only for ERC-8004 registration. There is no Treasury admin signature, admin role, or Treasury nonce in the current architecture.

## Owner metadata management

The beneficial owner updates metadata through Registry:

- `updateAgentMetadata(agentId, key, value)` → `Treasury.updateMetadata` → `ERC-8004.setMetadata`
- `updateAgentURI(agentId, newURI)` → `Treasury.updateAgentURI` → `ERC-8004.setAgentURI`

Treasury rejects direct user calls. This keeps ERC-8004 write authority in custody while allowing the Registry to enforce beneficial ownership.

## Access passes and usage

`MibboPass` is a soulbound ERC-1155. One token id equals one `agentId`.

1. The beneficial owner creates a versioned `PassConfig` with a payment token, fee, duration, request limit, pause state and metadata URI in one `setConfig` call.
2. A buyer calls `purchasePass`. The previous pass for that agent, if any, is burned and replaced.
3. The complete ERC-20 fee goes to `registry.getAgentOwner(agentId)`.
4. The pass stores its own expiry, quota and configuration version.
5. The contract itself requires `hasAccess(user, agentId)` inside `recordUsage`, so usage cannot be recorded for an expired, paused or exhausted pass.

Changing a config produces a new version for future purchases. Pausing the current version blocks access checks for every holder immediately. Transfers between non-zero addresses are prohibited.

Every stored `PassConfig` contains `configuredAt` and `updatedAt`. Its fixed-size fields are packed into two storage slots. Per-user `UserPassState` (`expiresAt`, quota counters and config version) is packed into one slot. `expiresAt` is created when a user purchases a pass, because users buy at different times; it is not an agent-level config value.

Metadata URI is versioned together with the config. The standard ERC-1155 `uri(agentId)` returns the URI of the current version. Historical URIs remain available through `getConfigURI(agentId, version)`. Before the first config, or when its URI is empty, these getters return an empty string.

## Administration and deployment

The deploy sequence is: MibboTreasury → MibboRegistry → `MibboTreasury.setAgentRegistry(registry)` → MibboPass. The Treasury owner controls `setAgentRegistry`; the current Solidity implementation permits replacing it. Treat that owner as a governance/security key and use a multisig in production.

The Pass owner controls the relayer allowlist. A dedicated, low-balance relayer wallet should be used for `recordUsage` transactions.

## Test coverage

The core test suite verifies registration and NFT custody, owner-only Registry metadata writes, Treasury `onlyRegistry` access control, payment splitting, soulbound passes, quota depletion, configuration pause behaviour and the end-to-end lifecycle. Run it without the settlement module:

```bash
npx hardhat test test/MibboRegistry.test.ts test/MibboTreasury.test.ts test/MibboPass.test.ts test/integration.test.ts
```
