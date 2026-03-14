![Base](header.png)

## 🌀Mibboverse

A Collaborative Ecosystem for AI-Powered Alpha.

We are building a platform where everyone can earn from their Web3 experience and knowledge using AI.

> **Mibboverse Prototype** — a monorepo exploring the intersection of AI agents and onchain economies.
> Agents register identities onchain, monetize via **x402** micropayments, and are accessible through a local UI demo.

<div align="center">

[**🚀 Quick Start**](#-quick-start) · [▶️ Watch Demo](https://youtu.be/38-TBG3jFA8?si=d3g4kxGrjIfn29YP)

</div>

## 📖 Documentation:
- **[Project overview](https://mibboverse.gitbook.io/mibbopaper)** — Core concept, vision, and general project description.
- **[Core Architecture](onchain-core-base/docs/ARCHITECTURE.md)** — protocol design, ERC-8004/x402 integration, and contract lifecycle.


> [!IMPORTANT]
> ### 🧪 Prototype Limitations
> For ease of testing in this early prototype, **onchain access gating (AgentPass) and complex settlement logic are not yet fully integrated into the backend API**. 
> The UI currently demonstrates the **x402 micropayment flow** (client-side signing and header injection), while the smart contracts (`onchain-core-base`) simulate the full lifecycle independently via Hardhat scripts. End-to-end integration is a work in progress.

## What's Inside

```
mibboverse-prototype/
├── 📂 demo/                # Vite + React UI — interact with agents via x402
└── 📂 onchain-core-base/   # Hardhat project — smart contracts & deployment
```


| Module | Stack | Purpose |
|---|---|---|
| `demo` | React · Vite · Tailwind · x402 | Local UI to browse and call agent APIs via x402 micropayments |
| `onchain-core-base` | Solidity · Hardhat · TypeScript · Viem | Agent identity (ERC-8004), access control (AgentPass), treasury (ERC-8004 custodian) |

## Architecture Overview

Mibboverse transforms AI agents into **sovereign economic entities** using two core protocols:

- **ERC-8004** — binds each agent permanently to its creator via a Custodial Treasury. Agents cannot be transferred, making their on-chain history a verifiable reputation.
- **x402** — a pay-per-use monetization layer. Every agent API call is a micropayment signed by the user's wallet — no API keys, no subscriptions.

```
                                                    ┌────────────────────────────────────┐
                                                    │                                    │
                                                    ▼                                    │
                                                  [User]                                 │
                                                    │  request                           │
                                                    ▼                                    │
                                                   [UI]                                  │
                                                    │  signed request + wallet address   │
                                                    ▼                                    │
                                              [Agent x402 API]                           │
                                                    │  check access                      │
                                                    ▼                                    │
                                               [AgentPass]                               │
                                            (smart contract)                             │
                                                    ├── no access ──▶  [402 Error]      │
                                                    │                                    │
                                                    │  has access                        │
                                                    ▼                                    │
                                              settle & verify                            │
                                                 payment                                 │
                                                    │                                    │
                                                    ▼                                    │
                                                [Agent]                                  │
                                               processes                                 │
                                                request                                  │
                                                    │  response                          │
                                                    ▼                                    │
                                                  [UI]───────────────────────────────────┘
                                                                result to user
```

## Deployed Contracts (Base Sepolia Testnet)

| Address  | Name | Contracts Overview |
| ------------- | ------------- | ------------- |
|  [0x9b14f04383F57c67A4Ade9cD82d92c4944ecb588](https://sepolia.basescan.org/address/0x9b14f04383F57c67A4Ade9cD82d92c4944ecb588) | AgentTreasury | ERC-8004 Custodian & Meta-Tx Manager |
|  [0x6328A8c481E07A5295f24f0E9E91D153592072d6](https://sepolia.basescan.org/address/0x6328A8c481E07A5295f24f0E9E91D153592072d6) | AgentRegistry | Agent Lifecycle Orchestrator & Beneficial Ownership |
|  [0xe1221095e1a4bCc8f6F6b6B30f3aCc6505318183](https://sepolia.basescan.org/address/0xe1221095e1a4bCc8f6F6b6B30f3aCc6505318183) | AgentPass | NFT-based access control & membership logic |
|  [0x8004A818BFB912233c491871b3d84c89A494BD9e](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) | ERC-8004 IdentityRegistry | Agent Identity Registry Proxy |

## 🛡️ Verifiable Agent Identity (ERC-8004)

In the Mibboverse, an AI agent is more than a bot — it is an interoperable economic entity. The ERC-8004 standard provides a verifiable "Source of Truth" for an agent's identity, metadata, and specialized services, making them discoverable and usable by **any user, third-party protocol, or autonomous AI orchestrator.**

👉 **[Live Blueprint: Shugo Identity Card](https://www.trust8004.xyz/agents/84532:1856)**

**What this profile demonstrates:**
* **Immutable Ownership:** A permanent, verifiable link between the agent (Shugo) and its creator (mtv) via the ERC-8004 Identity Registry.
* **Machine-Readable Capabilities:** A standardized manifest of the agent's utility — from `perp-trading` on Hyperliquid to `cross-chain-bridging` and `token-intelligence`.
* **Service Endpoints (MCP & A2A):** A manifest of discoverable skills designed for cross-agent orchestration, enabling permissionless strategy relay and delegated execution (e.g., CoW Protocol orders and Hyperliquid perp management).
  * **MCP Implementation:** A standardized interface exposing Shugo's logic as executable tools (`analyze_token`, `find_alpha`, `execute_onchain_action`) and reactive resources (Strategy Profile, Active Watchlist).
  * **A2A Skills:** A manifest of discoverable skills designed for cross-agent orchestration, enabling permissionless strategy relay and delegated execution (e.g., CoW Protocol orders and Hyperliquid perp management).
* **Onchain Economy & Access:** Transparent definition of the payment ecosystem, specifying `$MIBBO` for **x402 micropayments** and the native `$SHUGO` token for **AgentPass** access gating.

### Permissionless Integration
Because Shugo's identity follows the **ERC-8004** standard, any user or external system can programmatically:

1. **Verify** the agent's reputation and underlying owner strategy profile.

2. **Discover** available API endpoints and supported toolsets (MCP Tools & Resources).

3. **Utilize & Transact:** Connect to the agent's economy by identifying the correct payment tokens and access-control contracts directly from the metadata.

## 🚀 Quick start

1. Clone the repository:
    ```bash
    git clone https://github.com/Matik86/mibboverse-prototype-base-batches.git
    cd mibboverse-prototype-base-batches
    ```

2. Run the Demo UI:
    ```bash
    cd demo
    npm install
    npm run dev
    ```

3.  Run the Onchain Core:
    ```bash
    cd onchain-core-base
    cp .env.example .env   # fill in PRIVATE_KEY and BASE_SEPOLIA_RPC_URL
    npm install
    npx hardhat compile
    npx hardhat run scripts/interaction.ts --network baseSepolia
    ```

Full setup details in each module's **README**:
- [demo/README.md](demo/README.md)
- [onchain-core-base/README.md](onchain-core-base/README.md)

## 🏛️ Agentic Economy

| Concept | Implementation |
| ------------- | ------------- |
| Agent Identity | 	ERC-8004 soul-bound NFT, custodied in `AgentTreasury` |
| Monetization | x402 micropayment per API call, settled onchain & pass purchase |
| Access Control | `AgentPass` — soulbound pass purchased with $AGENT token |
| Usage Tracking | Backend relayer writes session data onchain |
| Protocol Stability | $MIBBO ecosystem token for fee splits and burns |

> [!TIP]
> **Dive Deeper:** For technical diagrams, contract breakdowns, and the full lifecycle of an agent, read our [**Core Architecture Documentation**](onchain-core-base/docs/ARCHITECTURE.md).

## 💬 Contact

Have questions? Reach out:

- Telegram: [@mtv_wd](https://t.me/mtv_wd)
- Email: [mtvwdbsnss@gmail.com](mailto:mtvwdbsnss@gmail.com)
