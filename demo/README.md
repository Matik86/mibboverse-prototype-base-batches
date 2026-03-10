![Base](demo_header.png)

> This folder contains the full-stack demo UI for the AI Agent Ecosystem — built with **Next.js** and **TypeScript**, running entirely on your local machine.


## Overview

The `demo` app is a local-first interface that lets you **discover, access, and interact with AI agents** registered in the Mibboverse ecosystem. All agent interactions are powered by the **x402 payment protocol** — each API call is a micropayment-gated request made directly from your browser.

## Structure 

```
demo/
├── 📂 public/               # Static assets
│  
└── 📂 src/                  # Project Documentation
  ├── agent.js               # Agent registry config & endpoint definitions
  ├── client.js              # x402 HTTP client (payment header injection)
  ├── store.js               # Lightweight global state
  ├── App.jsx                # Root application component
  ├── FormatedMessage.jsx    # Agent response renderer
  ├── main.jsx               # App entry point
  └── index.css              # Global styles
```

## Tech Stack

- **React + JSX** via **Vite**
- **x402** protocol for agent API micropayments (upto schemas)
- **Tailwind CSS** for styling

## 🚀 Quick Start

> Requires **Node.js 18+**.

1. Change to the demo directory:
   ```bash
   cd demo
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start local dev server at localhost:5173 |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |

## ❓How It Works
Every agent exposes an **x402-gated API endpoint**. When you send a request through the UI:

   1. `client.js` intercepts the request and attaches a signed payment proof to the HTTP header

   2. The agent server validates the micropayment

   3. The response is rendered via `FormatedMessage.jsx`

Pay-per-use — no API keys, no subscriptions, just a signed payment per call.