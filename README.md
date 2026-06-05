# OmnisRouter

**AI-assisted cross-chain USDC routing between Injective and Solana.**

OmnisRouter is a testnet MVP that lets a user enter a simple payment command like:

```txt
send 0.1 USDC to inj...
```

The app parses the intent, detects the source and destination chains, prepares the correct CCTP route, executes the testnet transfer, and stores a real receipt after completion.

The goal is simple:

> Users should not need to understand bridges, chain domains, gas, burn/mint flows, or relay infrastructure just to move stablecoins across ecosystems.

OmnisRouter abstracts that complexity into an AI-assisted routing layer.

---

## Current Testnet Status

OmnisRouter currently supports real testnet execution for two working routes:

| Route                  |             Status | Execution Model                                                                                  |
| ---------------------- | -----------------: | ------------------------------------------------------------------------------------------------ |
| Solana → Injective     | Working on testnet | User-authorized Solana burn, OmnisRouter-sponsored fees, Circle CCTP V2 manual relay             |
| Injective EVM → Solana | Working on testnet | User-owned EVM wallet authorization, OmnisRouter-sponsored Injective gas, Circle CCTP forwarding |

The current product is no longer positioned as a purely demo-funded executor flow.

The working version now supports user-connected wallets, real wallet balances, real route approvals, real CCTP execution, and wallet-scoped receipts.

Internal demo/server-funded tools may still exist for development, but they are hidden from production behind feature flags.

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
send 0.1 USDC to inj...
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
Recipient validation
   ↓
Wallet approval
   ↓
CCTP execution
   ↓
Attestation / forwarding
   ↓
Destination settlement
   ↓
Wallet-scoped receipt
```

---

## Working Testnet Routes

### 1. Solana → Injective

The Solana to Injective route uses a connected Solana wallet and Circle CCTP V2 manual relay.

The user signs the Solana-side burn, while OmnisRouter sponsors the required testnet execution costs and handles the relay flow.

```txt
Connected Solana wallet
   ↓
User authorizes USDC burn
   ↓
OmnisRouter sponsors Solana transaction fees
   ↓
USDC is burned on Solana
   ↓
Circle Iris attestation is fetched
   ↓
OmnisRouter relays receiveMessage on Injective
   ↓
USDC settles on Injective
   ↓
Receipt is saved
```

This route proves that OmnisRouter can move USDC from a user-connected Solana wallet into an Injective recipient address through real CCTP testnet infrastructure.

---

### 2. Injective EVM → Solana

The Injective to Solana route uses a connected Injective EVM wallet and EIP-3009 authorization.

The user does not need to manually pay Injective gas. Instead, the user signs a one-time USDC authorization from their Injective EVM wallet, and OmnisRouter pays the Injective gas needed to submit and complete the route.

```txt
Connected Injective EVM wallet
   ↓
User signs EIP-3009 USDC authorization
   ↓
OmnisRouter submits the authorization
   ↓
Authorized USDC moves from user wallet to OmnisRouter relayer
   ↓
OmnisRouter burns/forwards USDC through Circle CCTP
   ↓
Circle Forwarding Service handles Solana-side minting
   ↓
Solana recipient receives USDC
   ↓
Receipt is saved
```

This route proves the core OmnisRouter thesis:

> Users should be able to move USDC cross-chain without needing to understand gas, chain mechanics, CCTP domains, or relay infrastructure.

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

Supported working routes:

| Route                  |             Status | Path                                                    |
| ---------------------- | -----------------: | ------------------------------------------------------- |
| Solana → Injective     | Working on testnet | Circle CCTP V2 manual relay                             |
| Injective EVM → Solana | Working on testnet | EIP-3009 authorization + Circle CCTP Forwarding Service |

---

### 3. Real Wallet Connection

OmnisRouter supports real wallet connection for the working testnet routes.

Current wallet model:

| Wallet Type          | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| Solana wallet        | Used for Solana source wallet connection and Solana → Injective route       |
| Injective EVM wallet | Used for Injective-side USDC authorization and Injective EVM → Solana route |

The Solana wallet flow remains separate from the Injective EVM wallet flow.

Phantom is used for Solana wallet connection. Injective EVM connection is handled through RainbowKit/wagmi with supported EVM wallets such as OKX, MetaMask, Rabby, Brave, and other compatible EVM wallets.

---

### 4. Dynamic Wallet State Dashboard

The dashboard shows connected wallets dynamically instead of showing fake or static wallet cards.

If a Solana wallet is connected, the dashboard shows:

* Solana address
* SOL balance
* Solana USDC balance
* Solana devnet status

If an Injective EVM wallet is connected, the dashboard shows:

* EVM address
* matching Injective `inj...` address
* active chain ID
* required Injective EVM chain ID
* INJ balance
* Injective EVM USDC balance
* wallet/network readiness

The `inj...` address is displayed so users can recognize the same Injective account in native format, while the route still uses the EVM address for USDC authorization.

---

### 5. Recipient Verification

Before execution, OmnisRouter validates recipient address formats and displays route-specific recipient context.

For Solana recipients, the app derives and displays the associated Solana USDC token account where needed.

For Injective recipients, the app validates the `inj...` recipient format before route execution.

The app does not claim to verify recipient identity. It validates address format and route compatibility.

---

### 6. Real CCTP Testnet Execution

OmnisRouter does not only simulate the bridge flow.

For supported routes, the app performs actual CCTP-based testnet transfers.

#### Solana → Injective

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

#### Injective EVM → Solana

```txt
User signs EIP-3009 authorization
   ↓
OmnisRouter submits authorization
   ↓
OmnisRouter burns/forwards USDC on Injective
   ↓
Circle Forwarding Service handles Solana minting
   ↓
Save receipt
```

---

### 7. Wallet-Scoped Receipts

Every successful route creates a real receipt.

Receipts are private to the signed-in wallet.

A user must sign in with a wallet signature before viewing personal receipts.

Receipt ownership rules:

| Route                  | Receipt Owner               |
| ---------------------- | --------------------------- |
| Solana → Injective     | Solana source wallet        |
| Injective EVM → Solana | Injective EVM source wallet |

Receipts include:

* route direction
* status
* execution mode
* requested amount
* estimated received amount
* source chain
* destination chain
* source wallet
* destination wallet
* recipient address
* authorization transaction, where applicable
* burn transaction
* relay transaction, where applicable
* gas sponsor
* timestamp

Receipts are persisted in Supabase and remain available after refresh.

---

### 8. Wallet Auth Sessions

OmnisRouter uses wallet-auth sessions to protect personal receipts.

Flow:

```txt
Wallet connects
   ↓
User signs auth message
   ↓
Server verifies wallet signature
   ↓
HTTP-only wallet session is created
   ↓
Receipt API returns only receipts owned by that wallet
```

This means connected wallet state and signed-in wallet state are intentionally separate.

A wallet can be connected for routing, but the user still needs to sign in with a wallet signature to view private receipts.

---

### 9. Supabase Persistence

OmnisRouter uses Supabase to store:

* route receipts
* wallet-auth challenges
* waitlist entries

Main tables:

* `omnis_receipts`
* `wallet_auth_challenges`
* `omnis_waitlist`

Receipt reads are no longer public/global by default.

Normal users fetch receipts through authenticated server routes that check wallet-auth sessions and return only wallet-owned records.

---

### 10. Public App Access + Protected Receipts

The production app is publicly accessible.

Users do not need a demo access code to open the app.

Public users can access:

```txt
/
/app
/app/*
```

However, personal receipt viewing still requires wallet signature authentication.

Development-only surfaces such as CCTP Lab, debug panels, demo routes, and server-funded executor flows are hidden behind feature flags.

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

## Current Execution Model

OmnisRouter currently runs in **user-owned, OmnisRouter-sponsored testnet mode** for its working routes.

This means:

* users connect their own wallets
* users authorize source-side USDC movement
* recipient wallets receive real testnet USDC
* route execution is real
* receipts are real
* Supabase persistence is real
* OmnisRouter sponsors/relays the complex parts where needed

Route-specific execution:

| Route                  | User Action                       | OmnisRouter Action                                                 |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------ |
| Solana → Injective     | User signs Solana-side burn       | Sponsors fees, polls Iris, relays to Injective                     |
| Injective EVM → Solana | User signs EIP-3009 authorization | Pays Injective gas, submits authorization, burns/forwards via CCTP |

Internal server-funded/demo execution may remain available in development, but it is not the main production user flow.

---

## Architecture

```txt
Frontend
  ├── Landing page
  ├── Waitlist form
  ├── Dashboard
  ├── Agent command page
  ├── Approval page
  ├── Payment page
  ├── Receipt page
  └── Development-only CCTP Lab

Wallet Layer
  ├── Solana wallet connection
  ├── RainbowKit / wagmi Injective EVM wallet connection
  ├── EVM network switching
  ├── Wallet balance reads
  └── Wallet-auth signature sessions

Backend/API
  ├── Waitlist API
  ├── Wallet auth challenge API
  ├── Wallet auth verify API
  ├── Wallet-scoped receipt API
  ├── Solana → Injective preflight
  ├── Solana → Injective execute
  ├── Injective EVM → Solana authorization prepare
  ├── Injective EVM → Solana authorization submit
  ├── Injective EVM → Solana burn/forward
  └── Receipt persistence

CCTP Layer
  ├── Solana burn
  ├── Circle Iris attestation polling
  ├── Injective receiveMessage relay
  ├── Injective EVM USDC authorization
  └── Circle Forwarding Service

Database
  ├── Supabase receipts table
  ├── Supabase wallet auth challenges table
  └── Supabase waitlist table
```

---

## Tech Stack

| Layer          | Technology                                  |
| -------------- | ------------------------------------------- |
| Frontend       | Next.js, React, TypeScript                  |
| Styling        | CSS / custom dark UI                        |
| EVM Wallets    | RainbowKit, wagmi, viem                     |
| Solana Wallets | Solana wallet adapter / Solana Web3 tooling |
| Database       | Supabase                                    |
| Chain Routing  | Circle CCTP V2                              |
| Solana         | Solana Web3 / SPL Token tooling             |
| Injective      | Injective EVM testnet                       |
| Receipts       | Supabase + server-side helpers              |
| Auth           | Wallet signature auth + HTTP-only cookie    |
| Deployment     | Vercel                                      |

---

## Project Structure

Key files and folders:

```txt
app/
  api/
    auth/
      wallet/
    balances/
      injective-evm/
    cctp/
      injective-to-solana/
      solana-to-injective/
    receipts/
    waitlist/

  app/
    agent/
    approval/
    cctp-lab/
    payment/
    receipt/
    lib/
      evm/
    page.tsx
    ProductNav.tsx
    RealCctpRoutePanel.tsx
    InjectiveEvmWalletProvider.tsx

lib/
  server/
    cctp/
    omnis-receipts.ts
    supabase.ts
    wallet-auth.ts

supabase/
  migrations/
```

---

## Environment Variables

### Public Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_APP_ENV=production

NEXT_PUBLIC_SHOW_DEMO_ROUTES=false
NEXT_PUBLIC_SHOW_CCTP_LAB=false
NEXT_PUBLIC_SHOW_DEBUG_PANELS=false
NEXT_PUBLIC_SHOW_SERVER_FUNDED_ROUTES=false

NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=optional_walletconnect_project_id
```

### Server-Only Environment Variables

```env
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

WALLET_SESSION_SECRET=long_random_wallet_session_secret

SOLANA_PRIVATE_KEY=your_solana_testnet_sponsor_or_execution_key

INJECTIVE_EVM_PRIVATE_KEY=your_injective_evm_relayer_key

ENABLE_CCTP_EXECUTION_API=true
ENABLE_SERVER_FUNDED_EXECUTION=false

CCTP_MAX_FEE_USDC=0.6
CONFIRM_MANUAL_MAX_FEE=YES
```

Optional local development/test variables may include:

```env
SOLANA_RECIPIENT_ADDRESS=...
INJECTIVE_RECIPIENT_ADDRESS=inj...
```

Do not expose server-only variables with `NEXT_PUBLIC_`.

---

## Feature Flags

Production should keep demo/debug tools hidden.

Recommended production flags:

```env
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_SHOW_DEMO_ROUTES=false
NEXT_PUBLIC_SHOW_CCTP_LAB=false
NEXT_PUBLIC_SHOW_DEBUG_PANELS=false
NEXT_PUBLIC_SHOW_SERVER_FUNDED_ROUTES=false
ENABLE_SERVER_FUNDED_EXECUTION=false
ENABLE_CCTP_EXECUTION_API=true
```

Recommended local development flags:

```env
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_SHOW_DEMO_ROUTES=true
NEXT_PUBLIC_SHOW_CCTP_LAB=true
NEXT_PUBLIC_SHOW_DEBUG_PANELS=true
NEXT_PUBLIC_SHOW_SERVER_FUNDED_ROUTES=true
ENABLE_SERVER_FUNDED_EXECUTION=true
ENABLE_CCTP_EXECUTION_API=true
```

---

## Security Notes

The Supabase service role key is only used server-side.

Receipt reads are wallet-scoped and should go through authenticated server routes.

Wallet-auth sessions are signed using `WALLET_SESSION_SECRET` and stored in HTTP-only cookies.

Supabase receipts should not be publicly readable by default.

Private keys are used only for testnet sponsorship, relay, and execution infrastructure. Users still authorize their own source-side USDC movement in the current working flows.

The app should never expose:

* Supabase service role key
* wallet session secret
* Solana private key
* Injective EVM private key
* raw server-side env values

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

At minimum, make sure the database includes:

* receipt storage
* waitlist storage
* wallet auth challenge storage
* receipt owner fields
* locked-down receipt RLS policies

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

## Demo Walkthrough

### 1. Landing Page

The public landing page explains OmnisRouter and allows users to join the waitlist.

---

### 2. Dashboard

Go to:

```txt
/app
```

Connect the required wallets.

For Solana → Injective:

* connect Solana wallet
* fund Solana devnet USDC if needed
* review Solana balance and USDC balance

For Injective EVM → Solana:

* connect Injective EVM wallet through the header wallet button
* switch to Injective EVM Testnet
* fund testnet USDC if needed
* review INJ and USDC balances

A Circle faucet shortcut is available in the dashboard:

```txt
https://faucet.circle.com/
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

or:

```txt
send 0.1 USDC from Injective to Solana...
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
* source wallet
* estimated received amount
* gas sponsor
* execution mode

For Injective EVM → Solana, the approval flow uses the connected Injective EVM wallet.

The user-owned gasless flow follows:

```txt
Prepare authorization
   ↓
Sign authorization
   ↓
Verify authorization
   ↓
Submit authorization
   ↓
Burn and forward to Solana
   ↓
Save receipt
```

---

### 5. Route Execution

For Solana → Injective:

```txt
User signs Solana burn
   ↓
Solana burn is confirmed
   ↓
Circle Iris attestation is fetched
   ↓
OmnisRouter relays receiveMessage to Injective
   ↓
Receipt saved
```

For Injective EVM → Solana:

```txt
User signs EIP-3009 authorization
   ↓
OmnisRouter submits authorization
   ↓
OmnisRouter burns/forwards through Circle CCTP
   ↓
Circle Forwarding Service handles Solana minting
   ↓
Receipt saved
```

---

### 6. Receipts

Go to:

```txt
/app/receipt
```

Sign in with the wallet that owns the receipt.

Receipt ownership:

* Solana → Injective receipts belong to the Solana source wallet
* Injective EVM → Solana receipts belong to the Injective EVM source wallet

The receipt page only shows receipts owned by the signed-in wallet.

---

## Current Limitations

OmnisRouter is a testnet MVP, so some parts are intentionally scoped.

Current limitations:

* routes are currently limited to Solana and Injective
* mainnet support is not enabled
* Circle CCTP forwarding and testnet RPC behavior may vary depending on network availability
* fee optimization is not fully dynamic yet
* production-grade abuse limits and per-user sponsorship quotas are still being finalized
* native Injective wallet mode is not part of the current production route flow
* Arc, Base, and Arbitrum routes are not live yet

---

## Future Roadmap

Planned improvements:

* Arc route expansion
* Base route expansion
* Arbitrum route expansion
* dynamic fee comparison
* route speed estimation
* per-user gas sponsorship limits
* usage quotas and abuse protection
* improved receipt sharing
* richer route status timeline
* better mobile wallet UX
* production monitoring and failure recovery
* mainnet-ready safeguards

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
* connected wallet-based route execution
* real Solana → Injective CCTP V2 execution
* real Injective EVM → Solana CCTP execution
* user-authorized Solana burn flow
* EIP-3009-based Injective EVM authorization
* Circle Iris attestation polling
* Circle Forwarding Service usage
* Injective relay execution
* wallet-scoped Supabase receipt persistence
* wallet-auth sessions
* public waitlist capture
* production-hidden dev/debug tooling

It is not just a mock UI.

It executes real testnet routes, sends funds to recipient wallets, and stores proof of execution.

---

## License

MIT

---

## Author

Built by Endurance.
