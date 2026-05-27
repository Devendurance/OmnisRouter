import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatUnits, type Hex } from "viem";
import {
  executeInjectiveToSolanaCctpTransfer,
  prepareInjectiveToSolanaCctpTransfer,
  type InjectiveToSolanaCctpPreflight,
} from "../../lib/server/cctp/injective-to-solana.ts";

const USDC_DECIMALS = 6;

loadDotEnv();

const env = readRequiredEnv();
const preflight = await prepareInjectiveToSolanaCctpTransfer({
  amountUsdc: env.CCTP_AMOUNT_USDC,
  solanaRecipientAddress: env.SOLANA_RECIPIENT_ADDRESS,
});
const realModeEnabled = env.ENABLE_REAL_CCTP === "true";
const realModeConfirmed = env.CONFIRM_REAL_CCTP === "YES";

if (preflight.forwardingFeeWarning) {
  console.warn(`Forwarding fee warning: ${preflight.forwardingFeeWarning}`);
}

printSummary(preflight);

if (!realModeEnabled) {
  console.log("");
  console.log("Dry run only. No transactions sent.");
} else {
  if (!realModeConfirmed) {
    console.log("");
    console.log("Real mode requested, but CONFIRM_REAL_CCTP=YES is required.");
    console.log("No transactions sent.");
    process.exit(1);
  }

  console.log("");
  console.log("REAL CCTP MODE ENABLED. This will approve and burn testnet USDC on Injective.");

  if (preflight.safetyErrors.length > 0) {
    console.log("");
    console.log("Real mode blocked by preflight safety checks:");
    for (const error of preflight.safetyErrors) {
      console.log(`- ${error}`);
    }
    console.log("No transactions sent.");
    process.exit(1);
  }

  const result = await executeInjectiveToSolanaCctpTransfer({
    amountUsdc: env.CCTP_AMOUNT_USDC,
    solanaRecipientAddress: env.SOLANA_RECIPIENT_ADDRESS,
    confirmation: "YES",
  });

  if (result.approvalTxHash) {
    console.log(`Approval transaction hash: ${result.approvalTxHash}`);
  } else {
    console.log("Approval skipped: current allowance already covers requested amount.");
  }

  console.log(`depositForBurnWithHook transaction hash: ${result.burnTxHash}`);
  console.log("Circle Forwarding Service handles Solana minting. Check Solana USDC balance after ~30-60 seconds.");
}

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
  const required = ["INJECTIVE_EVM_PRIVATE_KEY", "SOLANA_RECIPIENT_ADDRESS", "CCTP_AMOUNT_USDC"] as const;
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("Missing required environment variable(s):");
    for (const key of missing) {
      console.error(`- ${key}`);
    }
    console.error("Dry-run still requires these values to prepare calldata. No transactions sent.");
    process.exit(1);
  }

  return {
    CCTP_AMOUNT_USDC: process.env.CCTP_AMOUNT_USDC as string,
    CONFIRM_REAL_CCTP: process.env.CONFIRM_REAL_CCTP,
    ENABLE_REAL_CCTP: process.env.ENABLE_REAL_CCTP,
    SOLANA_RECIPIENT_ADDRESS: process.env.SOLANA_RECIPIENT_ADDRESS as string,
  };
}

function printSummary(summary: InjectiveToSolanaCctpPreflight) {
  console.log("OmnisRouter Injective -> Solana CCTP Forwarding Service transfer prep");
  console.log("");
  console.log("Source chain: Injective testnet EVM");
  console.log("Destination chain: Solana devnet");
  console.log(`Source EVM address: ${summary.sourceAddress}`);
  console.log(`Amount: ${summary.amountUsdc} USDC (${summary.amount.toString()} base units)`);
  console.log(`Source USDC balance: ${formatUsdc(summary.sourceUsdcBalance)} (${summary.sourceUsdcBalance.toString()} base units)`);
  console.log(`Requested amount: ${formatUsdc(summary.amount)} (${summary.amount.toString()} base units)`);
  console.log(`Estimated forwarding maxFee: ${formatUsdc(summary.maxFee)} (${summary.maxFee.toString()} base units)`);
  console.log(`Estimated recipient amount after maxFee: ${formatUsdc(summary.estimatedRecipientAmount)} (${summary.estimatedRecipientAmount.toString()} base units)`);
  console.log(`Current TokenMessengerV2 allowance: ${formatUsdc(summary.currentAllowance)} (${summary.currentAllowance.toString()} base units)`);
  console.log(`Approval needed: ${summary.approvalNeeded ? "yes" : "no"}`);
  if (summary.nativeGasBalance.balance === null) {
    console.log(`Native INJ gas balance: unavailable (${summary.nativeGasBalance.error}). Source needs testnet INJ for gas.`);
  } else {
    console.log(`Native INJ gas balance: ${formatUnits(summary.nativeGasBalance.balance, 18)} INJ. Source needs testnet INJ for gas.`);
  }
  console.log(`Solana recipient wallet: ${summary.solanaRecipientAddress}`);
  console.log(`Derived Solana USDC ATA: ${summary.solanaUsdcAta}`);
  console.log(`mintRecipient bytes32: ${summary.mintRecipient}`);
  console.log(`maxFee: ${summary.maxFee.toString()}`);
  console.log(`Approval token: ${summary.contracts.usdc}`);
  console.log(`Approval spender: ${summary.contracts.tokenMessengerV2}`);
  console.log(`Burn target: ${summary.contracts.tokenMessengerV2}`);
  console.log(`destinationCaller: ${summary.contracts.destinationCaller}`);
  console.log(`minFinalityThreshold: ${summary.contracts.minFinalityThreshold}`);
  console.log(`Hook data: ${summary.hookData}`);
  console.log(`approve calldata preview: ${previewCalldata(summary.approveCalldata)}`);
  console.log(`depositForBurnWithHook calldata preview: ${previewCalldata(summary.burnCalldata)}`);
}

function previewCalldata(calldata: Hex) {
  return `${calldata.slice(0, 74)}... (${(calldata.length - 2) / 2} bytes)`;
}

function formatUsdc(value: bigint) {
  return `${formatUnits(value, USDC_DECIMALS)} USDC`;
}
