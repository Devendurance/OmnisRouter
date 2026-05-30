import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Connection } from "@solana/web3.js";
import {
  prepareSolanaToInjectiveCctpTransfer,
  type SolanaToInjectiveCctpPreflight,
} from "../../lib/server/cctp/solana-to-injective.ts";
import { buildSolanaDepositForBurnTransaction } from "./solana-cctp-instructions.ts";

const SOLANA_DEVNET_RPC_URL = "https://api.devnet.solana.com";

loadDotEnv();

const env = readRequiredEnv();
const connection = new Connection(SOLANA_DEVNET_RPC_URL, "confirmed");

console.log("OmnisRouter Solana -> Injective CCTP V2 depositForBurn transaction builder");
console.log("");

const preflight = await prepareSolanaToInjectiveCctpTransfer({
  amountUsdc: env.CCTP_AMOUNT_USDC,
  sourceSolanaAddress: env.SOLANA_SOURCE_ADDRESS,
  recipientInjectiveAddress: env.INJECTIVE_RECIPIENT_ADDRESS,
});

printPreflightSummary(preflight);

if (preflight.safetyErrors.length > 0) {
  console.log("");
  console.log("Preflight safety checks found issues:");
  for (const error of preflight.safetyErrors) {
    console.log(`- ${error}`);
  }
  console.log("");
  console.log("Transaction building blocked by safety checks.");
  process.exit(1);
}

console.log("");
console.log("Building depositForBurn transaction...");

const result = await buildSolanaDepositForBurnTransaction(connection, {
  amountBaseUnits: preflight.amount,
  mintRecipientBytes32: preflight.mintRecipient,
  ownerAddress: preflight.sourceSolanaAddress,
  sourceUsdcAta: preflight.sourceUsdcAta,
});

console.log("Transaction built successfully.");
console.log("");
console.log("Source Solana wallet:", preflight.sourceSolanaAddress);
console.log("Recipient Injective address:", preflight.recipientInjectiveAddress);
console.log("Amount:", preflight.amountUsdc, "USDC");
console.log("Source USDC ATA:", result.sourceUsdcAta);
console.log("Mint recipient bytes32:", result.mintRecipientBytes32);
console.log("Mint recipient public key:", result.mintRecipientPublicKey.toBase58());
console.log("");
console.log("Derived PDAs:");
for (const [label, address] of Object.entries(result.pdaSummary)) {
  console.log(`  ${label}:`, address);
}
console.log("");
console.log("Message sent event data public key:", result.messageSentEventDataPublicKey.toBase58());
console.log("Transaction instruction count:", result.transaction.instructions.length);
console.log("");
console.log("Required signers:");
for (const signer of result.requiredSigners) {
  console.log(`  - ${signer.toBase58()}`);
}
console.log("");
console.log("No transaction sent.");

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const envFile = readFileSync(envPath, "utf8");

  for (const line of envFile.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readRequiredEnv() {
  const required = [
    "SOLANA_SOURCE_ADDRESS",
    "INJECTIVE_RECIPIENT_ADDRESS",
    "CCTP_AMOUNT_USDC",
  ] as const;

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("Missing required environment variable(s):");
    for (const key of missing) {
      console.error(`- ${key}`);
    }
    process.exit(1);
  }

  return {
    CCTP_AMOUNT_USDC: process.env.CCTP_AMOUNT_USDC as string,
    INJECTIVE_RECIPIENT_ADDRESS: process.env.INJECTIVE_RECIPIENT_ADDRESS as string,
    SOLANA_SOURCE_ADDRESS: process.env.SOLANA_SOURCE_ADDRESS as string,
  };
}

function printPreflightSummary(preflight: SolanaToInjectiveCctpPreflight) {
  console.log(`Source: Solana devnet (domain ${preflight.sourceDomain})`);
  console.log(`Destination: Injective testnet EVM (domain ${preflight.destinationDomain})`);
  console.log(`Source wallet: ${preflight.sourceSolanaAddress}`);
  console.log(`USDC ATA: ${preflight.sourceUsdcAta}`);

  if (preflight.sourceSolBalance !== null) {
    console.log(`SOL balance: ${preflight.sourceSolBalance} lamports`);
  }

  if (preflight.sourceUsdcBalance !== null) {
    console.log(`USDC balance: ${preflight.sourceUsdcBalance} base units`);
  }
}
