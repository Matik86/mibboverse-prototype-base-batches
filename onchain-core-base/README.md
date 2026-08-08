![Mibboverse](docs/images/main_header.png)

# Mibboverse on-chain core — v2

The v2 smart-contract suite for non-transferable ERC-8004 agent identities, versioned ERC-1155 access passes, and optional x402 settlement.

## Contracts

| Contract | Purpose | Administrative model |
|---|---|---|
| `MibboRegistry` | Registers agents, records their beneficial owners, and authorises identity metadata writes. | No global owner. |
| `MibboTreasury` | Custodies ERC-8004 identity NFTs and executes privileged ERC-8004 writes. | Its owner is renounced by the `AgentEcosystem` Ignition module after Registry configuration. |
| `MibboPass` | Soulbound ERC-1155 access passes. Each `agentId` is the ERC-1155 token ID. | Owner manages the relayer allowlist. Agent owners manage their own pass configs. |
| `MibboSettlement` | Optional non-upgradeable EIP-2612 sign-once, settle-many payment module. | Separate owner controls pausing and relayer rotation. |

`MibboSettlement` is intentionally independent of the agent ecosystem deployment. It is deployed only when the x402 settlement flow is needed.

## Documentation

- [Core architecture](docs/ARCHITECTURE.md) — trust boundaries, lifecycle, access passes, and deployment finalisation.
- [Contract overview](docs/contracts-overview.md) — diagrams, public responsibilities, and invariants.
- [Protocol overview](docs/overview.md) — product-level identity and custody model.
- [x402 settlement](docs/x402-settlement.md) — `MibboSettlement` model and deployment.

## Existing Base Sepolia deployments

The following addresses are historical deployments made before the v2 contract renaming and architecture changes. They are not v2 deployments and must not be treated as matching the current source.

| Address | Historical role |
|---|---|
| [0x9b14f04383F57c67A4Ade9cD82d92c4944ecb588](https://sepolia.basescan.org/address/0x9b14f04383F57c67A4Ade9cD82d92c4944ecb588) | Legacy Treasury |
| [0x6328A8c481E07A5295f24f0E9E91D153592072d6](https://sepolia.basescan.org/address/0x6328A8c481E07A5295f24f0E9E91D153592072d6) | Legacy Registry |
| [0xe1221095e1a4bCc8f6F6b6B30f3aCc6505318183](https://sepolia.basescan.org/address/0xe1221095e1a4bCc8f6F6b6B30f3aCc6505318183) | Legacy Pass |
| [0x8004A818BFB912233c491871b3d84c89A494BD9e](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) | ERC-8004 Identity Registry proxy |

## Repository layout

```text
onchain-core-base/
├── contracts/
│   ├── interfaces/               # Interfaces and AgentTypes
│   ├── mocs/                     # Test mocks
│   ├── MibboRegistry.sol
│   ├── MibboTreasury.sol
│   ├── MibboPass.sol
│   └── MibboSettlement.sol
├── docs/
├── ignition/modules/
│   ├── AgentEcosystem.ts         # Registry, Treasury and Pass deployment
│   ├── MibboSettlement.ts        # Standalone settlement deployment
│   └── TestToken.ts
├── scripts/
│   ├── interaction.ts
│   ├── updateMetadata.ts
│   └── deployMibboSettlement.ts
└── test/
```

## Setup

```powershell
cd D:\Solidity\mibboverse-prototype\onchain-core-base
copy .env.example .env
npm install
```

Populate only the variables needed for the command you are running. `.env.example` documents the ecosystem, metadata-update, and settlement values. Never commit `.env` or private keys.

## Tests

Run the v2 core suite:

```powershell
npx hardhat test test/MibboRegistry.test.ts test/MibboTreasury.test.ts test/MibboPass.test.ts test/integration.test.ts test/MibboSettlement.test.ts
```

## Deploying the agent ecosystem

Required configuration:

```env
PRIVATE_KEY=""
BASE_SEPOLIA_RPC_URL=""
ERC8004_ADDRESS=""
INITIAL_RELAYER=""
```

`INITIAL_RELAYER` is optional. If empty, the deployer is initially added as a MibboPass relayer. For production, set a dedicated low-balance relayer address.

```powershell
npx hardhat ignition deploy ignition/modules/AgentEcosystem.ts --network baseSepolia
```

The module performs these actions in order:

1. Deploy `MibboTreasury`.
2. Deploy `MibboRegistry` with the ERC-8004 and Treasury addresses.
3. Configure Treasury to trust that Registry.
4. Deploy `MibboPass` with the Registry and initial relayer.
5. Call `MibboTreasury.renounceOwnership()`.

After step 5, no account can replace the Registry trusted by Treasury. Do not run this module until the supplied ERC-8004 address and deployment account have been verified.

## Deploying MibboSettlement

Set these public addresses in `.env`:

```env
SETTLEMENT_TOKEN_ADDRESS=""
SETTLEMENT_TREASURY_ADDRESS=""
SETTLEMENT_OWNER_ADDRESS=""
SETTLEMENT_RELAYER_ADDRESS=""
```

Then deploy:

```powershell
npx hardhat ignition deploy ignition/modules/MibboSettlement.ts --network baseSepolia
```

Use a multisig for `SETTLEMENT_OWNER_ADDRESS` and a dedicated gas wallet for `SETTLEMENT_RELAYER_ADDRESS`.

## Operational scripts

```powershell
# Demonstrate registration, pass configuration, purchase, and usage.
npx hardhat run scripts/interaction.ts --network baseSepolia

# Update an agent metadata key through MibboRegistry.
npx hardhat run scripts/updateMetadata.ts --network baseSepolia
```

The metadata script uses `MIBBO_REGISTRY_ADDRESS`, `AGENT_ID`, `METADATA_KEY`, and `METADATA_VALUE` from `.env`.
