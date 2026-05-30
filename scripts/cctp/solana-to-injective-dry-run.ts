import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatUnits } from "viem";
import {
  prepareSolanaToInjectiveCctpTransfer,
  type SolanaToInjectiveCctpPreflight,
} from "../../lib/server/cctp/solana-to-injective.ts";

const USDC_DECIMALS = 6;

loadDotEnv();

const env = readRequiredEnv();
const preflight = await prepareSolanaToInjectiveCctpTransfer({
  amountUsdc: env.CCTP_AMOUNT_USDC,
  sourceSolanaAddress: env.SOLANA_SOURCE_ADDRESS,
  recipientInjectiveAddress: env.INJECTIVE_RECIPIENT_ADDRESS,
});

printSummary(preflight);

if (preflight.safetyErrors.length > 0) {
  console.log("");
  console.log("Preflight safety checks found issues:");
  for (const error of preflight.safetyErrors) {
    console.log(`- ${error}`);
  }
}

console.log("");
console.log("Dry run complete. No transactions sent.");
console.log("Solana CCTP V2 depositForBurn instruction building is pending verification.");
console.log("Execute mode is not yet available for this route.");

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
    console.error("Dry-run requires these values to prepare transfer data. No transactions sent.");
    process.exit(1);
  }

  return {
    CCTP_AMOUNT_USDC: process.env.CCTP_AMOUNT_USDC as string,
    INJECTIVE_RECIPIENT_ADDRESS: process.env.INJECTIVE_RECIPIENT_ADDRESS as string,
    SOLANA_SOURCE_ADDRESS: process.env.SOLANA_SOURCE_ADDRESS as string,
  };
}

function printSummary(preflight: SolanaToInjectiveCctpPreflight) {
  console.log("OmnisRouter Solana -> Injective CCTP V2 Manual Relay transfer prep");
  console.log("");
  console.log(`Source chain: Solana devnet (CCTP domain ${preflight.sourceDomain})`);
  console.log(`Destination chain: Injective testnet EVM (CCTP domain ${preflight.destinationDomain})`);
  console.log(`Source Solana wallet: ${preflight.sourceSolanaAddress}`);
  console.log(`Derived Solana USDC ATA: ${preflight.sourceUsdcAta}`);
  console.log(`Recipient Injective address: ${preflight.recipientInjectiveAddress}`);
  console.log(`Amount: ${preflight.amountUsdc} USDC (${preflight.amount.toString()} base units)`);

  if (preflight.sourceSolBalance === null) {
    console.log(
      `Solana SOL balance: unavailable (${preflight.sourceSolBalanceError ?? "unknown error"})`,
    );
  } else {
    console.log(
      `Solana SOL balance: ${formatUnits(preflight.sourceSolBalance, 9)} SOL (${preflight.sourceSolBalance.toString()} lamports)`,
    );
  }

  if (preflight.sourceUsdcBalance === null) {
    console.log(
      `Solana USDC balance: unavailable (${preflight.sourceUsdcBalanceError ?? "unknown error"})`,
    );
  } else {
    console.log(
      `Solana USDC balance: ${formatUsdc(preflight.sourceUsdcBalance)} (${preflight.sourceUsdcBalance.toString()} base units)`,
    );
  }

  console.log(`Mint recipient bytes32: ${preflight.mintRecipient}`);
  console.log("");
  console.log("Contracts:");
  console.log(`  Solana USDC mint: ${preflight.contracts.usdcMint}`);
  console.log(`  Solana TokenMessengerMinterV2: ${preflight.contracts.tokenMessengerMinterV2}`);
  console.log(`  Solana MessageTransmitterV2: ${preflight.contracts.messageTransmitterV2Solana}`);
  console.log(`  Injective MessageTransmitterV2: ${preflight.contracts.messageTransmitterV2Injective}`);
}

function formatUsdc(value: bigint) {
  return `${formatUnits(value, USDC_DECIMALS)} USDC`;
}
