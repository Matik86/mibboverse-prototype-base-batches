# About Mibboverse

> This document describes the product-level identity model. For the v2 contract architecture, deployment finalisation, and access-pass mechanics, see the [core architecture](ARCHITECTURE.md) and [contract overview](contracts-overview.md).

### What is Mibboverse

Mibboverse turns user expertise into onchain AI agents.

Every agent in Mibboverse is a distinct economic unit — not a chatbot, not a product feature, not a subscription service. It is a fully onchain construct that carries its creator's identity, reputation, and knowledge, expressed as an automated, executable agent.

The protocol connects three primitives that have not previously existed together at this level of integration: user identity bound permanently onchain via ERC-8004, an AI agent that learns from and operates on behalf of that identity, and an economic layer that allows others to access and compensate that expertise.

### Vision

Most knowledge in crypto exists in private channels, closed communities, and individual heads. It is neither portable, verifiable, nor monetizable in a systematic way.

Mibboverse changes this by transforming the onchain activity, strategies, and accumulated expertise of any user into an executable AI agent — one that can be accessed by others, acts on their behalf, and generates revenue for its creator.

The underlying claim is straightforward: if your Alpha has value, it should be possible to automate it, verify its provenance, and earn from it without giving it away.

### Why Onchain AI Agents

The term "AI agent" has become broadly applied to any system that executes multi-step tasks. Mibboverse uses the term precisely.

An agent in Mibboverse:

* Has a permanent, verifiable identity anchored onchain via an ERC-8004 NFT
* Is bound to a specific user through a custodial identity contract — the `MibboTreasury`
* Operates under economic rules encoded in smart contracts — access pricing and usage limits
* Is accessible only to users who hold a valid, time-and-request-bounded pass
* Can be monetised with time- and request-bounded access passes; the separate `MibboSettlement` module supports optional x402 settlement

This makes the agent a real economic actor, not a product skin on top of an LLM API.

### Why alpha Must Be Executable

Knowing something in Web3 has always created asymmetric value — just not in the clean, textbook way people describe it.

The real edge belongs to the people who’ve been here long enough to build pattern recognition. Traders and degens, yes — but also flippers, airdrop hunters, early community movers, even founders who know how attention flows. Different games, same principle: they’ve seen cycles repeat, they recognize setups early, and they act before it’s obvious.

They don’t rely on perfect information. They rely on experience — reading liquidity, spotting behavioral shifts, understanding when something is about to move and when it’s already too late. Most of what they do isn’t written down. It’s pattern recognition, built over time.

Until now, that edge lived inside people. It showed up in Telegram chats, X threads, Discord messages, or trade history — fragmented, inconsistent, and impossible to systematize. It couldn’t be automated, verified, or turned into something economically closed.

An agent in Mibboverse changes that. It converts experience into execution. When someone uses an agent, they’re not getting advice — they’re accessing a system that already knows how to act. It encodes the creator’s patterns, timing, and decision-making into something that runs on its own.

Alpha stops being something you share. It becomes something you deploy.


# Alpha

**Alpha** is the edge a crypto participant builds over time — not from theory, but from being in the market. It’s pattern recognition shaped by cycles, repetition, and real exposure: knowing where attention is forming, how liquidity is behaving, when something is early and when it’s already crowded.

It shows up in how they act — what they touch, what they ignore, how they size, and when they move. Not as a fixed strategy, but as a way of seeing the market that others don’t have yet.

In Mibboverse, alpha is not a metaphor. It is the raw material that gets encoded into an agent, exposed as a service, and compensated when others use it.

Alpha has three properties that make it valuable in this context:

* It is **asymmetric** — not everyone has it
* It is **actionable** — it produces outcomes when executed
* It is **personal** — it is rooted in specific experience and cannot be separated from the person who developed it


# The Agent

### Agent

An agent in Mibboverse is the operational form of a creator's alpha. It is a distinct economic unit — not a chatbot, not a product feature, not a subscription service.

An agent combines:

* A **permanent** [**onchain identity**](/mibboverse-docs/core-concepts/onchain-identity.md) permanently tied to its creator
* An **economic layer** — an [agent token](/mibboverse-docs/economy/agent-token.md) and a [pass system](/mibboverse-docs/access.md) that govern access and compensation
* A **compute layer** — execution powered by Mibbot

The agent **learns from interaction with its creator**. Over time, it accumulates context, refines its operational patterns, and becomes a more precise expression of the creator's expertise.

An agent performs a dual function:

* It is a **personal tool** for the creator — executing their tasks, strategies, and workflows
* It is a **conduit of the creator's expertise** for others — accessible via passes

At its core, every agent is powered by Mibbot — the system that enables memory, reasoning, and continuous learning from the creator’s interactions.

### Mibbot

Mibbot is the AI engine that powers every agent in Mibboverse.

It is not a separate product and not a feature — it is the underlying execution layer that gives agents memory, reasoning, and the ability to act across Web3.

Mibbot enables what static tools cannot: it remembers. It retains dialogue context across interactions, allowing agents to go beyond one-time execution and instead accumulate experience over time.

As a creator continues to work with their agent, Mibbot refines the agent’s behavior — turning it into an increasingly accurate representation of the creator’s alpha.

**What Mibbot can do:**

Every Mibboverse agent inherits the full Mibbot capability set:

* **Hyperliquid** — open and manage positions, analyse trading history, track account performance
* **Polymarket —** analyse live markets, accounts, and activity, and interact with Polymarket through the agent in the usual way.
* **DEX execution** — swaps and limit orders across decentralised exchanges
* **Cross-chain bridging** — move funds across supported networks
* **Web and social intelligence** — website crawling, web search, Twitter/X search
* **Market data** — access to analytics tools including DexScreener, CoinGecko, and equivalent data sources

This capability set is the same for every agent. What differentiates one agent from another is not what Mibbot can do — it is what the creator has taught their agent to do with it.


# Onchain Identity

### Identity Model

In Mibboverse, an agent’s identity is not a username or profile. It is a permanent onchain binding between a creator and their agent.

This binding is established through **beneficial ownership**, recorded in `MibboRegistry`.\
The creator’s address is set at registration and **cannot be changed**.

This ensures that every agent is:

* economically tied to its creator
* reputationally accountable to its creator
* independent in execution

### ERC-8004 Integration

To standardize agent identity and enable interoperability, Mibboverse adopts the [**ERC-8004**](https://www.8004.org/learn) standart.

Under this standard, each agent:

* receives a unique identity as an ERC-721 NFT
* is associated with an Agent Card (metadata describing endpoints, capabilities, and payment address)
* participates in shared registries:
  * **Identity Registry** — agent identity
  * **Reputation Registry** — interaction history and feedback
  * **Validation Registry** — third-party task verification

ERC-8004 agents are publicly discoverable via explorers such as [**8004scan**](https://8004scan.io/) and other ecosystem interfaces. This makes every Mibboverse agent transparent, searchable, and accessible beyond the application itself.

### Custody & Reputation Guarantees

Mibboverse introduces a critical deviation from the default ERC-8004 model.

The identity NFT is **not held by the user -** It is held in custody by `MibboTreasury`.

At the same time, ownership is permanently defined via `beneficialOwner` in `MibboRegistry`.

This design ensures that:

* identity cannot be transferred
* reputation cannot be sold, reassigned, or lost
* the creator remains permanently accountable

As a result, an agent’s reputation becomes **non-transferable and durable**, surviving any economic or interface-layer changes.

