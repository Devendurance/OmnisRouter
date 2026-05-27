import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  parseUnits,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CCTP_DOMAINS, INJECTIVE_TESTNET_CCTP } from "./constants.ts";
import {
  buildForwardHookDataWithAtaCreation,
  encodeSolanaAtaAsBytes32,
  getForwardingFeeEstimate,
  getSolanaUsdcAta,
} from "./forwarding-utils.ts";

const INJECTIVE_TESTNET_EVM_RPC_URL = "https://k8s.testnet.json-rpc.injective.network/";
const INJECTIVE_TESTNET_EVM_CHAIN_ID = 1439;
const USDC_DECIMALS = 6;
const MIN_FINALITY_THRESHOLD = 2000;
const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const tokenMessengerV2Abi = [
  {
    type: "function",
    name: "depositForBurnWithHook",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

loadDotEnv();

const env = readRequiredEnv();
const amount = parseUnits(env.CCTP_AMOUNT_USDC, USDC_DECIMALS);
const solanaUsdcAta = getSolanaUsdcAta(env.SOLANA_RECIPIENT_ADDRESS);
const mintRecipient = encodeSolanaAtaAsBytes32(env.SOLANA_RECIPIENT_ADDRESS) as Hex;
const hookData = buildForwardHookDataWithAtaCreation(env.SOLANA_RECIPIENT_ADDRESS) as Hex;
const feeEstimate = await getForwardingFeeEstimate({ includeRecipientSetup: true });

if (feeEstimate.warning) {
  console.warn(`Forwarding fee warning: ${feeEstimate.warning}`);
}

if (!feeEstimate.maxFee) {
  console.error("Unable to compute maxFee from Circle forwarding fee estimate. No transactions sent.");
  process.exit(1);
}

const maxFee = BigInt(feeEstimate.maxFee);
const privateKey = normalizePrivateKey(env.INJECTIVE_EVM_PRIVATE_KEY);
const account = privateKeyToAccount(privateKey);
const injectiveTestnetEvm = defineChain({
  id: INJECTIVE_TESTNET_EVM_CHAIN_ID,
  name: "Injective EVM Testnet",
  nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
  rpcUrls: {
    default: { http: [INJECTIVE_TESTNET_EVM_RPC_URL] },
  },
});
const publicClient = createPublicClient({
  chain: injectiveTestnetEvm,
  transport: http(INJECTIVE_TESTNET_EVM_RPC_URL),
});
const walletClient = createWalletClient({
  account,
  chain: injectiveTestnetEvm,
  transport: http(INJECTIVE_TESTNET_EVM_RPC_URL),
});
const approveCalldata = encodeFunctionData({
  abi: erc20Abi,
  functionName: "approve",
  args: [INJECTIVE_TESTNET_CCTP.TokenMessengerV2, amount],
});
const burnCalldata = encodeFunctionData({
  abi: tokenMessengerV2Abi,
  functionName: "depositForBurnWithHook",
  args: [
    amount,
    CCTP_DOMAINS.Solana,
    mintRecipient,
    INJECTIVE_TESTNET_CCTP.USDC,
    ZERO_BYTES32,
    maxFee,
    MIN_FINALITY_THRESHOLD,
    hookData,
  ],
});
const realModeEnabled = env.ENABLE_REAL_CCTP === "true";

printSummary({
  amount: env.CCTP_AMOUNT_USDC,
  approveCalldata,
  burnCalldata,
  hookData,
  maxFee: maxFee.toString(),
  mintRecipient,
  solanaRecipient: env.SOLANA_RECIPIENT_ADDRESS,
  solanaUsdcAta: solanaUsdcAta.toBase58(),
  sourceAddress: account.address,
});

if (!realModeEnabled) {
  console.log("");
  console.log("Dry run only. No transactions sent.");
} else {
  console.warn("");
  console.warn("WARNING: ENABLE_REAL_CCTP=true. Real Injective testnet CCTP transactions will be sent.");

  const approvalHash = await walletClient.sendTransaction({
    account,
    to: INJECTIVE_TESTNET_CCTP.USDC,
    data: approveCalldata,
  });
  console.log(`Approval transaction hash: ${approvalHash}`);
  const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
  console.log(`Approval receipt status: ${approvalReceipt.status}`);

  if (approvalReceipt.status !== "success") {
    throw new Error("Approval transaction failed. Burn transaction not sent.");
  }

  const burnHash = await walletClient.sendTransaction({
    account,
    to: INJECTIVE_TESTNET_CCTP.TokenMessengerV2,
    data: burnCalldata,
  });
  console.log(`depositForBurnWithHook transaction hash: ${burnHash}`);
  const burnReceipt = await publicClient.waitForTransactionReceipt({ hash: burnHash });
  console.log(`Burn receipt status: ${burnReceipt.status}`);
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
    ENABLE_REAL_CCTP: process.env.ENABLE_REAL_CCTP,
    INJECTIVE_EVM_PRIVATE_KEY: process.env.INJECTIVE_EVM_PRIVATE_KEY as string,
    SOLANA_RECIPIENT_ADDRESS: process.env.SOLANA_RECIPIENT_ADDRESS as string,
  };
}

function normalizePrivateKey(privateKey: string) {
  const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    console.error("INJECTIVE_EVM_PRIVATE_KEY must be a 32-byte hex private key.");
    process.exit(1);
  }

  return normalized as Hex;
}

function printSummary(summary: {
  amount: string;
  approveCalldata: Hex;
  burnCalldata: Hex;
  hookData: Hex;
  maxFee: string;
  mintRecipient: Hex;
  solanaRecipient: string;
  solanaUsdcAta: string;
  sourceAddress: string;
}) {
  console.log("OmnisRouter Injective -> Solana CCTP Forwarding Service transfer prep");
  console.log("");
  console.log("Source chain: Injective testnet EVM");
  console.log("Destination chain: Solana devnet");
  console.log(`Source EVM address: ${summary.sourceAddress}`);
  console.log(`Amount: ${summary.amount} USDC (${amount.toString()} base units)`);
  console.log(`Solana recipient wallet: ${summary.solanaRecipient}`);
  console.log(`Derived Solana USDC ATA: ${summary.solanaUsdcAta}`);
  console.log(`mintRecipient bytes32: ${summary.mintRecipient}`);
  console.log(`maxFee: ${summary.maxFee}`);
  console.log(`Approval token: ${INJECTIVE_TESTNET_CCTP.USDC}`);
  console.log(`Approval spender: ${INJECTIVE_TESTNET_CCTP.TokenMessengerV2}`);
  console.log(`Burn target: ${INJECTIVE_TESTNET_CCTP.TokenMessengerV2}`);
  console.log(`destinationCaller: ${ZERO_BYTES32}`);
  console.log(`minFinalityThreshold: ${MIN_FINALITY_THRESHOLD}`);
  console.log(`Hook data: ${summary.hookData}`);
  console.log(`approve calldata preview: ${previewCalldata(summary.approveCalldata)}`);
  console.log(`depositForBurnWithHook calldata preview: ${previewCalldata(summary.burnCalldata)}`);
}

function previewCalldata(calldata: Hex) {
  return `${calldata.slice(0, 74)}... (${(calldata.length - 2) / 2} bytes)`;
}
