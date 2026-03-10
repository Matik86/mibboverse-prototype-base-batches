![Base](images\arch_header.png)

# Architecture: Mibboverse Agentic Economy

Mibboverse is a specialized infrastructure for **User-Based AI Agents**. This protocol is engineered to maximize efficiency in AI-to-Human and AI-to-AI interactions by implementing a synergistic stack: **ERC-8004** for standardized identity and **x402** for granular access verification and monetization.


## 👻 Protocol Standards & Philosophy

### ERC-8004: Standardized Identity & Visibility
We utilize ERC-8004 to make every Mibboverse agent discoverable across the wider ecosystem (e.g., **8004 Scan**).

- **Custodial Identity Binding:** We intentionally implement a Custodial Treasury to hold the Agent NFTs. This ensures the agent is always tied to the specific user’s wallet.

- **Reputation Transparency:** Since the agent cannot be transferred or sold, the history and reputation built by an agent are permanently associated with its creator, preventing "reputation washing."

### x402: Verified Access & Monetization
The **x402** protocol serves as the verification and payment layer for all user-agent interactions.

- **Access Gating:** Instead of heavy onchain checks for every inference, x402 verifies ownership of a Soulbound (non-transferable) AgentPass.

- **Session-Based Verification:** After an AI session ends, a dedicated Backend Relayer records usage onchain to ensure quota compliance.


## 🪙 Two Tier Economy

The system operates using a two-tier token model to separate protocol maintenance from agent-specific value.

| Token  | Role | Utility |
| ------------- | ------------- | ------------- |
| $MIBBO | **Ecosystem Token** | Used for infrastructure stability, protocol-level maintenance, and agent operational support. |
| $AGENT | **Agent-Specific Token** | Used by users to purchase access passes for a specific AI agent and etc. |

### The Revenue Loop & Custom Incentives
When a user buys an `AgentPass` , they pay in the specific **$AGENT** token.

- **Customizable Burn:** Agent owners can set a unique `burnBps` (Basis Points). This allows them to choose between maximizing direct revenue or creating deflationary pressure on their agent's token.

- **Fee Split Calculation:** 

$$ \text{Owner Amount} = Fee_{\text{agent}} - \left(\frac{Fee_{\text{agent}} \times \text{burnBps}}{10000}\right) $$


## 🧩 Smart Contracts Components

1. `AgentRegistry.sol` **(The Entry Point)**
   
    Handles the birth of an agent within the ecosystem.
   - `registerAgent()`: Mints the ERC-8004 NFT, moves it to the Treasury for safety, and triggers the initial wallet binding.
   - `getAgentInfo()`: Aggregates identity data (Owner + Wallet + Creation time).
   - `isOwner()`: Centralized check used by other contracts to verify who has the right to configure the agent.
  
2. `AgentTreasury.sol` **(The Custodian)**
   
    Acts as a secure middleman for identity management.
   - `initAgent()`: Securely links the newly minted agent to the user's wallet.
   - `updateAgentWallet()`: Uses admin-signed meta-transactions to update the bound wallet without moving the NFT.
   - `updateMetadata()`: Allows for updating agent descriptors (like API endpoints) via secure EIP-712 signatures.

3. `AgentPass.sol` **(The Economic Hub)**
   
    The implementation of the **x402** logic for access and payments.
   - `setConfig()`: Beneficial owners set the "Service Level Agreement" (Fee, Duration, Max Requests, Burn BPS).
   - `purchasePass()`: The core economic function - Transfers ERC-20 tokens, executes the burn, mints a Soulbound ERC-1155 pass to the buyer.
   - `recordUsage()`: Used by Relayers to report that a user has consumed a portion of their request quota.
   - `hasAccess()`: A three-way check: Does the user have the token? Is it expired? Is there quota remaining?


## ↔️ Workflow: The Lifecycle of Core Interactions

### 1. Agent Registration Workflow (Registry Flow)

![Base](images\register_flow.png)

1. **`registerAgent()`**

    The User initiates the agent creation process by calling the `registerAgent` function on the `AgentRegistry` contract, passing the agent's metadata (`card`), a deadline, and an EIP-712 signature (`walletSig`).

1. **`register()`**

    The `AgentRegistry` acts as an intermediary and calls the `register(card.endpoint)` function on the `ERC8004` contract to mint a new Agent Identity NFT, using the provided endpoint as the `tokenURI`.

2. **`mint`**

    The `ERC800`4 contract mints the new NFT (representing the agent) and assigns ownership to the `AgentRegistry` contract. The newly generated `agentId` is returned to the Registry.

3. **`safeTransferFrom()`**

    Immediately after minting, the `AgentRegistry` transfers the ownership of the newly created NFT to the `AgentTreasury` contract for secure custodial storage using the standard ERC-721 `safeTransferFrom` method.

4. **`initAgent()`**

    The `AgentRegistry` calls the `initAgent` function on the `AgentTreasury` contract, passing the `agentId`, the User's address (`msg.sender`), the signature deadline, and the EIP-712 signature.

5. **`setAgentWallet()`**
   
    Acting as the official owner of the NFT, the `AgentTreasury` interacts with the `ERC8004` contract to explicitly bind the User's address to the agent by calling `setAgentWallet`. This grants the User operational control over the agent without holding the NFT.

6. **Return of control**

    Execution flow successfully returns from the `AgentTreasury` and `ERC8004` back to the `AgentRegistry` contract, allowing it to finalize internal state updates (recording the beneficial owner).

7. **`emit AgentRegistered`**

    The `AgentRegistry` finalizes the transaction by emitting the `AgentRegistered(agentId, msg.sender)` event, notifying offchain indexers and the User that the agent creation and routing were completely successful.

### 2. Agent Pass Workflow

#### Phase 1: Configuration (Monetization Setup)

1. **`setConfig()`**

    The Agent Owner (beneficial owner of the agent) initiates the monetization setup by calling `setConfig(agentId, cfg)` on the `AgentPass `contract. The `cfg` payload includes the ERC-20 token address (e.g., `$AGENT`), subscription fee, maximum request limit, duration, and the token burn rate (`burnBps`).

#### Phase 2: Purchase (User Acquires Access)

1. **`purchasePass()`**

    A User wants to access the agent and calls `purchasePass(agentId)`. The contract first validates that the agent is not paused and has a valid configuration. If the user is renewing, their existing pass is burned.

2. **Owner Lookup**

    The `AgentPass` contract calls `getAgentOwner(agentId)` on the `AgentRegistry` contract to retrieve the current beneficial owner's address.

3. **Fee Distribution (ERC-20)**

    The contract calculates the `burnAmount` (based on `burnBp`) and the `ownerAmount` (the remaining fee). It then interacts with the configured ERC-20 token (`$AGENT`) using `safeTransferFrom`:
    - Transfers the `ownerAmount` directly from the User to the Agent Owner.
    - Transfers the `burnAmount` from the User to the dead address (`0xdead`) to permanently burn the tokens.

4. **Soulbound Minting & Metadata**

    The contract mints a Soulbound (non-transferable) ERC-1155 token to the User, representing their access pass. It initializes the `_passMeta` mapping for the user, recording the `expiresAt` timestamp and `maxRequests`. Finally, it emits the `PassPurchased` event.

#### Phase 3: Usage & Tracking (x402 Session)

1. **Offchain Request**

    The User initiates an offchain API request to interact with the AI agent (e.g., via the x402 protocol).

2. **Access Verification**

    Before processing the request, the Backend Relayer verifies the user's quota by calling the view function `hasAccess(user, agentId)` on the `AgentPass` contract. If it returns `true` (pass is not expired and quota is not exceeded), the AI generates a response.

3. **`recordUsage()`**

    After the session concludes successfully, the authorized Backend Relayer submits an onchain transaction calling `recordUsage(agentId, user, count)` to deduct the consumed requests from the user's quota.

4. **Quota Update & Expiration**

    The contract increments `meta.requestsUsed` by the specified `count`. If the user's total usage reaches or exceeds `maxRequests`, the contract caps the usage at the maximum limit and emits a `PassExpired(user, agentId, "requests_limit")` event, gracefully revoking further access until a new pass is purchased.


## 🔒 Security & Grant Commitment

Mibboverse is built with a "Security-First" mindset. To ensure a safe environment for our users and agent owners, our roadmap for the grant period includes:
- **Professional Audits:** Upon receiving the grant, our immediate priority is to fund a comprehensive security audit of all core contracts (`Registry`, `Treasury`, `Pass`).
- **Safe Hooks Implementation:** We are designing trading fee hooks to reward agent owners. These must be battle-tested and audited before deployment to ensure liquidity safety.
- **Transparent Economy:** Every fee split and burn is verifiable onchain, ensuring a trustless environment for the agent economy.

## 📌 Development Notes

> [!IMPORTANT]
> **Agent Token Deployment:** Currently, the core contracts support any ERC-20 token address for pass purchases. We are exploring the implementation of our own secure token deployment system versus integrating
> existing industry solutions.
> 
> **Trading Fee Hooks:** We are developing specialized hooks for liquidity pools to allow owners to earn from $AGENT trading activity. This module is under active development and will be released only after
> rigorous security testing.