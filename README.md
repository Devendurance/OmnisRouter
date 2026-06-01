**!Important:** Demo access code for Judges to test the product: 862910endy

---

# OmnisRouter

**AI-assisted cross-chain USDC routing between Injective and Solana.**

OmnisRouter is a testnet MVP that lets a user enter a simple payment command like:

```txt
send 0.1 USDC from Solana to inj...
```

The app parses the intent, detects the source and destination chains, prepares the correct CCTP route, executes the testnet transfer, and stores a real receipt after completion.

The goal is simple:

> Users should not need to understand bridges, chain domains, gas, burn/mint flows, or relay infrastructure just to move stablecoins across ecosystems.

OmnisRouter abstracts that complexity into an AI-assisted routing layer.

---

## Demo Status

OmnisRouter currently supports real testnet execution for:

* **Solana → Injective**
* **Injective → Solana**

The app is currently in **sponsored testnet execution mode**.

That means users provide the payment intent and recipient address, while OmnisRouter uses funded testnet execution wallets to demonstrate the full routing flow. This allows the product to show real CCTP execution without requiring every tester to fund multiple wallets across chains.

Production mode would move source-chain signing to the connected user wallet, while OmnisRouter continues to handle route detection, orchestration, relay, gas sponsorship, and receipts.

---

## What OmnisRouter Solves

Cross-chain stablecoin transfers still feel broken for normal users.

A user may have USDC on one chain while the recipient expects funds on another chain. The sender may not know:

* which network the recipient address belongs to
* which bridge or route to use
* whether they need gas on the source chain
* whether they need gas on the destination chain
* how burn/mint messaging works
* how to track whether the transfer actually completed

This creates a bad payment experience.

OmnisRouter turns this:

```txt
Which chain is this address?
Which bridge supports this route?
Do I need gas?
Where is my transaction?
Did the recipient receive it?
```

into this:

```txt
send 0.1 USDC from Solana to inj...
```

The app handles the rest.

---

## Core Product Flow

OmnisRouter works as an intent-to-execution router.

```txt
User command
   ↓
Intent parsing
   ↓
Route detection
   ↓
Safety checks
   ↓
CCTP execution
   ↓
Attestation / forwarding
   ↓
Destination settlement
   ↓
Supabase receipt
```

---

## Key Features

### 1. Natural Language Payment Intent

Users can type a simple command instead of manually selecting bridge options.

Example:

```txt
send 0.1 USDC from Solana to inj1...
```

OmnisRouter extracts:

* amount
* asset
* source chain
* destination chain
* recipient address
* route direction

---

### 2. Dynamic Route Detection

The app detects supported routes based on the command and recipient format.

Supported routes:

| Route              |             Status | Execution Path              |
| ------------------ | -----------------: | --------------------------- |
| Solana → Injective | Working on testnet | Circle CCTP V2 manual relay |
| Injective → Solana | Working on testnet | Circle CCTP forwarding flow |

---

### 3. Real CCTP Testnet Execution

OmnisRouter does not only simulate the bridge flow.

For real testnet execution, the app performs actual CCTP-based transfers.

#### Solana → Injective

The Solana to Injective route uses Circle CCTP V2 manual relay:

```txt
Burn USDC on Solana
   ↓
Poll Circle Iris for attestation
   ↓
Submit receiveMessage on Injective
   ↓
Mint/settle USDC on Injective
   ↓
Save receipt
```

#### Injective → Solana

The Injective to Solana route uses Circle’s forwarding path:

```txt
Submit burn on Injective
   ↓
Circle forwarding handles Solana-side mint
   ↓
Recipient receives USDC on Solana
   ↓
Save receipt
```

---

### 4. Real Receipts

Every successful route creates a real receipt.

Receipts include:

* route direction
* status
* requested amount
* estimated received amount
* source chain
* destination chain
* source address
* destination address
* recipient address
* burn transaction hash
* relay transaction hash, where applicable
* timestamp

Receipts are persisted in Supabase, so they remain available after refresh.

---

### 5. Supabase Persistence

OmnisRouter uses Supabase to store real route receipts and waitlist entries.

Main tables:

* `omnis_receipts`
* `omnis_waitlist`

This lets judges verify that successful route executions are not temporary local UI state.

---

### 6. Private Demo Access + Public Waitlist

The deployed version is designed so the public can see the landing page and join the waitlist, while the full app is protected behind a demo access code.

Public users can access:

```txt
/
```

and submit their email for early access.

Protected routes include:

```txt
/app
/app/*
/api/cctp/*
```

This prevents random users from triggering real testnet execution APIs while still allowing judges or demo reviewers to access the full working product.

---

## What Makes It an AI Agent?

The AI layer in OmnisRouter is not just a chatbot.

It is the **intent-to-execution layer**.

It helps turn a human payment request into a structured route plan.

The agent layer is responsible for:

* understanding the user’s payment command
* extracting amount, token, source chain, and recipient
* detecting the correct destination chain
* selecting the supported route
* preparing the execution flow
* showing approval context
* handing off to the correct CCTP execution path
* generating proof through receipts

In a production version, this agent layer can become more autonomous by selecting routes based on speed, fees, liquidity, gas sponsorship rules, and user preferences.

---

## Current Testnet Execution Mode

OmnisRouter currently runs in **sponsored testnet execution mode**.

This means:

* users can enter recipient addresses dynamically
* recipient wallets receive testnet USDC
* route execution is real
* receipts are real
* Supabase persistence is real
* source-chain signing is currently handled by funded testnet execution wallets

This design was chosen for the hackathon MVP to make the product testable without forcing every reviewer to fund multiple testnet wallets across Solana and Injective.

Production mode would move source-chain signing to the connected user wallet.

---

## Architecture

```txt
Frontend
  ├── Landing page
  ├── Waitlist form
  ├── Demo login gate
  ├── Dashboard
  ├── Agent command page
  ├── Approval page
  ├── Payment page
  ├── Receipt page
  └── CCTP Lab

Backend/API
  ├── Waitlist API
  ├── Demo access protection
  ├── Solana → Injective preflight
  ├── Solana → Injective execute
  ├── Injective → Solana preflight
  ├── Injective → Solana execute
  └── Receipt persistence

CCTP Layer
  ├── Solana burn
  ├── Circle Iris attestation polling
  ├── Injective receiveMessage relay
  └── Circle forwarding service

Database
  ├── Supabase receipts table
  └── Supabase waitlist table
```

---

## Tech Stack

| Layer          | Technology                          |
| -------------- | ----------------------------------- |
| Frontend       | Next.js, React, TypeScript          |
| Styling        | CSS / custom UI                     |
| Database       | Supabase                            |
| Chain Routing  | Circle CCTP V2                      |
| Solana         | Solana Web3 / SPL Token tooling     |
| Injective      | Injective testnet / EVM relay path  |
| Deployment     | Vercel                              |
| Access Control | Demo access code + HTTP-only cookie |
| Persistence    | Supabase service-role server helper |

---

## Project Structure

Key files and folders:

```txt
app/
  api/
    cctp/
      injective-to-solana/
      solana-to-injective/
    waitlist/
  app/
    agent/
    approval/
    cctp-lab/
    payment/
    receipt/
  page.tsx

lib/
  server/
    cctp/
    omnis-receipts.ts
    supabase.ts

supabase/
  migrations/
    create_omnis_receipts.sql
    create_omnis_waitlist.sql
```

---

## Environment Variables

Create a local `.env` file.

Do not commit `.env`.

### Public Environment Variables

Only this value is safe to expose publicly:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
```

Do **not** include `/rest/v1` in the Supabase URL.

Correct:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
```

Wrong:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co/rest/v1
```

---

### Server-Only Environment Variables

These must stay private.

```env
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

DEMO_ACCESS_CODE=your_private_demo_code

SOLANA_SOURCE_ADDRESS=your_solana_testnet_execution_wallet
SOLANA_PRIVATE_KEY=your_solana_private_key

INJECTIVE_EVM_PRIVATE_KEY=your_injective_evm_relayer_key

ENABLE_SOLANA_BURN=true
CONFIRM_SOLANA_BURN=EXECUTE_SOLANA_TESTNET_BURN
CONFIRM_SOLANA_TO_INJECTIVE_RELAY=YES

ENABLE_CCTP_EXECUTION_API=true
CCTP_AMOUNT_USDC=0.1
CCTP_MAX_FEE_USDC=0.6
CONFIRM_MANUAL_MAX_FEE=YES
```

Optional script fallback values may include:

```env
INJECTIVE_RECIPIENT_ADDRESS=inj...
SOLANA_RECIPIENT_ADDRESS=...
```

These are mainly useful for local scripts or manual testing.

---

## Security Notes

The following values must never be committed:

```txt
.env
.env.local
private keys
service role keys
demo access code
```

The Supabase service role key is only used server-side.

Private keys are currently used only for hackathon testnet execution mode. In production, source-chain signing should move to user wallet signing.

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/omnis-router.git
cd omnis-router
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create `.env`

```bash
cp .env.example .env
```

Then fill in the required environment variables.

### 4. Run Supabase migrations

Open Supabase SQL Editor and run the migration files inside:

```txt
supabase/migrations/
```

At minimum, run:

```txt
create_omnis_receipts.sql
create_omnis_waitlist.sql
```

### 5. Start development server

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

---

## Build

Run:

```bash
npm run build
```

Expected result:

```txt
Compiled successfully
```

---

## Deployment

OmnisRouter is designed to deploy on Vercel.

Add all required environment variables in:

```txt
Vercel → Project → Settings → Environment Variables
```

Required Vercel variables:

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
DEMO_ACCESS_CODE=...

SOLANA_SOURCE_ADDRESS=...
SOLANA_PRIVATE_KEY=...

INJECTIVE_EVM_PRIVATE_KEY=...

ENABLE_SOLANA_BURN=true
CONFIRM_SOLANA_BURN=EXECUTE_SOLANA_TESTNET_BURN
CONFIRM_SOLANA_TO_INJECTIVE_RELAY=YES

ENABLE_CCTP_EXECUTION_API=true
CCTP_AMOUNT_USDC=0.1
CCTP_MAX_FEE_USDC=0.6
CONFIRM_MANUAL_MAX_FEE=YES
```

After adding or changing environment variables, redeploy the project.

---

## Demo Walkthrough

### 1. Landing Page

The public landing page explains OmnisRouter and allows users to join the waitlist.

Normal visitors only see the public landing page and waitlist form.

---

### 2. Demo Login

The full app is protected behind a private demo access code.

After entering the correct code, the user can access:

```txt
/app
```

---

### 3. Agent Command

Go to:

```txt
/app/agent
```

Enter a payment command:

```txt
send 0.1 USDC from Solana to inj...
```

OmnisRouter parses the payment intent and detects the route.

---

### 4. Approval

Go to:

```txt
/app/approval
```

Review:

* amount
* asset
* recipient
* route
* protocol
* execution mode

Then approve and execute the route.

---

### 5. Route Execution

For Solana → Injective:

```txt
Solana burn
   ↓
Iris attestation polling
   ↓
Injective relay
   ↓
Receipt saved
```

For Injective → Solana:

```txt
Injective burn
   ↓
Circle forwarding
   ↓
Solana mint
   ↓
Receipt saved
```

---

### 6. Receipts

Go to:

```txt
/app/receipt
```

The receipt page shows real route receipts persisted in Supabase.

---

## Current Limitations

OmnisRouter is a hackathon MVP, so some parts are intentionally scoped.

Current limitations:

* source-chain signing is currently handled by funded testnet execution wallets
* connected user wallet signing for source-chain burns is planned after the hackathon
* routes are currently limited to Solana and Injective
* fee optimization is not fully dynamic yet
* production-grade abuse limits and per-user quotas are not fully finalized
* mainnet support is not enabled

---

## Future Roadmap

Planned improvements:

* connected user wallet signing for Solana burns
* connected user wallet signing for Injective burns
* per-user gas sponsorship limits
* daily gas credit system
* route fee comparison
* Base and Arbitrum route expansion
* better transaction status timeline
* automatic receipt sharing
* public testnet access after waitlist rollout
* mainnet-ready safeguards
* production monitoring and failure recovery

---

## Why This Matters

Stablecoins are one of crypto’s strongest use cases, but cross-chain movement still feels too technical.

OmnisRouter makes cross-chain payment execution feel closer to sending a normal instruction:

```txt
send 10 USDC to this address
```

The user should not need to care whether the recipient is on Solana, Injective, Base, or another supported chain.

The router should understand, validate, execute, and prove the transfer.

That is the direction OmnisRouter is building toward.

---

## Hackathon Summary

OmnisRouter is a working testnet product that demonstrates:

* AI-assisted payment intent parsing
* dynamic route detection
* real Solana → Injective CCTP V2 execution
* real Injective → Solana execution
* Circle Iris attestation polling
* Injective relay execution
* Supabase receipt persistence
* public waitlist capture
* private demo access protection

It is not just a mock UI.

It executes real testnet routes, sends funds to recipient wallets, and stores proof of execution.

---

## License

MIT

---

## Author

Built by Endurance for the Injective Solo AI Builder Sprint.
