import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  prepareSolanaToInjectiveCctpTransfer,
  type SolanaToInjectiveCctpPreflight,
} from "../../lib/server/cctp/solana-to-injective.ts";
import { buildSolanaDepositForBurnTransaction } from "./solana-cctp-instructions.ts";

const SOLANA_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const SOLANA_DEVNET_EXPLORER_TX_URL = "https://explorer.solana.com/tx/{hash}?cluster=devnet";
const EXECUTION_CONFIRMATION = "EXECUTE_SOLANA_TESTNET_BURN";

loadDotEnv();

const env = readRequiredEnv();

if (env.ENABLE_SOLANA_BURN !== "true") {
  console.log("ENABLE_SOLANA_BURN is not true. No transactions sent.");
  process.exit(0);
}

if (env.CONFIRM_SOLANA_BURN !== EXECUTION_CONFIRMATION) {
  console.log(`CONFIRM_SOLANA_BURN must equal "${EXECUTION_CONFIRMATION}". No transactions sent.`);
  process.exit(0);
}

const sourceKeypair = parseSolanaPrivateKey(env.SOLANA_PRIVATE_KEY);
const derivedPublicKey = sourceKeypair.publicKey.toBase58();

if (derivedPublicKey !== env.SOLANA_SOURCE_ADDRESS) {
  console.error("SOLANA_PRIVATE_KEY does not match SOLANA_SOURCE_ADDRESS.");
  console.error(`  Derived public key: ${derivedPublicKey}`);
  console.error(`  Expected:           ${env.SOLANA_SOURCE_ADDRESS}`);
  console.error("No transactions sent.");
  process.exit(1);
}

const connection = new Connection(SOLANA_DEVNET_RPC_URL, "confirmed");

console.log("OmnisRouter Solana -> Injective CCTP V2 depositForBurn execution");
console.log("");

const preflight = await prepareSolanaToInjectiveCctpTransfer({
  amountUsdc: env.CCTP_AMOUNT_USDC,
  sourceSolanaAddress: env.SOLANA_SOURCE_ADDRESS,
  recipientInjectiveAddress: env.INJECTIVE_RECIPIENT_ADDRESS,
});

if (preflight.safetyErrors.length > 0) {
  console.log("Preflight safety checks found issues:");
  for (const error of preflight.safetyErrors) {
    console.log(`  - ${error}`);
  }
  console.log("");
  console.log("Execution blocked by safety checks. No transactions sent.");
  process.exit(1);
}

console.log(`Source wallet: ${env.SOLANA_SOURCE_ADDRESS}`);
console.log(`Recipient: ${env.INJECTIVE_RECIPIENT_ADDRESS}`);
console.log(`Amount: ${preflight.amountUsdc} USDC`);
console.log(`USDC ATA: ${preflight.sourceUsdcAta}`);

const buildResult = await buildSolanaDepositForBurnTransaction(connection, {
  amountBaseUnits: preflight.amount,
  mintRecipientBytes32: preflight.mintRecipient,
  ownerAddress: preflight.sourceSolanaAddress,
  sourceUsdcAta: preflight.sourceUsdcAta,
});

console.log(`Message sent event data: ${buildResult.messageSentEventDataPublicKey.toBase58()}`);
console.log(`Instructions: ${buildResult.transaction.instructions.length}`);
console.log(`Required signers: ${buildResult.requiredSigners.map((s) => s.toBase58()).join(", ")}`);

const tx = buildResult.transaction;
tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
tx.feePayer = sourceKeypair.publicKey;

console.log("");
console.log("About to send real Solana devnet CCTP burn transaction.");

const signature = await sendAndConfirmTransaction(
  connection,
  tx,
  [sourceKeypair, buildResult.messageSentEventDataKeypair],
  { commitment: "confirmed" },
);

console.log("");
console.log("Burn submitted.");
console.log(`Burn tx signature: ${signature}`);
console.log(`Explorer: ${SOLANA_DEVNET_EXPLORER_TX_URL.replace("{hash}", signature)}`);
console.log(`Message sent event data: ${buildResult.messageSentEventDataPublicKey.toBase58()}`);
console.log("Next phase is Iris attestation polling. No Injective mint was attempted.");

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
    "SOLANA_PRIVATE_KEY",
    "INJECTIVE_RECIPIENT_ADDRESS",
    "CCTP_AMOUNT_USDC",
    "ENABLE_SOLANA_BURN",
    "CONFIRM_SOLANA_BURN",
  ] as const;

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("Missing required environment variable(s):");
    for (const key of missing) {
      console.error(`  - ${key}`);
    }
    process.exit(1);
  }

  return {
    CCTP_AMOUNT_USDC: process.env.CCTP_AMOUNT_USDC as string,
    CONFIRM_SOLANA_BURN: process.env.CONFIRM_SOLANA_BURN as string,
    ENABLE_SOLANA_BURN: process.env.ENABLE_SOLANA_BURN as string,
    INJECTIVE_RECIPIENT_ADDRESS: process.env.INJECTIVE_RECIPIENT_ADDRESS as string,
    SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY as string,
    SOLANA_SOURCE_ADDRESS: process.env.SOLANA_SOURCE_ADDRESS as string,
  };
}

function parseSolanaPrivateKey(value: string): Keypair {
  const trimmed = value.trim();

  if (trimmed.startsWith("[")) {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(trimmed)));
  }

  return Keypair.fromSecretKey(bs58Decode(trimmed));
}

function bs58Decode(encoded: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const BASE = BigInt(58);

  let num = BigInt(0);

  for (const char of encoded) {
    const index = ALPHABET.indexOf(char);

    if (index === -1) {
      throw new Error(`Non-base58 character in SOLANA_PRIVATE_KEY: ${char}`);
    }

    num = num * BASE + BigInt(index);
  }

  const bytes: number[] = [];

  while (num > BigInt(0)) {
    bytes.unshift(Number(num % BigInt(256)));
    num = num / BigInt(256);
  }

  for (const char of encoded) {
    if (char === "1") {
      bytes.unshift(0);
    } else {
      break;
    }
  }

  return new Uint8Array(bytes);
}
