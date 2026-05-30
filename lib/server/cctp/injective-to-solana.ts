// Server-only module. Do not import from client components or browser code.
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const INJECTIVE_TESTNET_EVM_RPC_URL = "https://k8s.testnet.json-rpc.injective.network/";
const INJECTIVE_TESTNET_EVM_CHAIN_ID = 1439;
const USDC_DECIMALS = 6;
const MIN_FINALITY_THRESHOLD = 2000;
const MAX_FEE_RETRY_COUNT = 3;
const MAX_FEE_RETRY_DELAY_MS = 1000;
const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;

const CCTP_DOMAINS = {
  Solana: 5,
  Injective: 29,
} as const;

const INJECTIVE_TESTNET_CCTP = {
  USDC: "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d",
  TokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
} as const;

const SOLANA_DEVNET_CCTP = {
  UsdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
} as const;

const CIRCLE_SANDBOX_FORWARD_FEE_URL = `https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/${CCTP_DOMAINS.Injective}/${CCTP_DOMAINS.Solana}?forward=true`;
const CCTP_FORWARD_MAGIC = "cctp-forward";

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
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
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

export type PrepareInjectiveToSolanaCctpTransferInput = {
  amountUsdc: string;
  solanaRecipientAddress: string;
};

export type ExecuteInjectiveToSolanaCctpTransferInput = PrepareInjectiveToSolanaCctpTransferInput & {
  confirmation: "YES";
};

export type InjectiveToSolanaCctpPreflight = {
  amount: bigint;
  amountUsdc: string;
  approvalNeeded: boolean;
  approveCalldata: Hex;
  burnCalldata: Hex;
  currentAllowance: bigint;
  estimatedRecipientAmount: bigint;
  hookData: Hex;
  maxFee: bigint;
  mintRecipient: Hex;
  nativeGasBalance: { balance: bigint | null; error: string | null };
  safetyErrors: string[];
  solanaRecipientAddress: string;
  solanaUsdcAta: string;
  sourceAddress: Address;
  sourceUsdcBalance: bigint;
  contracts: {
    usdc: Address;
    tokenMessengerV2: Address;
    destinationCaller: typeof ZERO_BYTES32;
    minFinalityThreshold: typeof MIN_FINALITY_THRESHOLD;
  };
  forwardingFeeWarning?: string;
  forwardingFeeExplanation?: string;
  isManualFeeFallback: boolean;
  fallbackFeeWarning?: string;
};

type ForwardingFeeEstimate = {
  explanation?: string;
  feeOptions?: Array<{
    finalityThreshold?: string;
    high?: string;
    low?: string;
    med?: string;
    minimumFee?: string;
  }>;
  high?: string;
  low?: string;
  maxFee?: string;
  med?: string;
  minimumFee?: string;
  rawResponse?: unknown;
  warning?: string;
};

export type InjectiveToSolanaCctpExecutionResult = {
  approvalTxHash: Hex | null;
  burnTxHash: Hex;
  expectedRecipientAmount: bigint;
  solanaRecipientAddress: string;
  solanaUsdcAta: string;
};

export type InjectiveToSolanaCctpExecutionStage =
  | "validation"
  | "prepare/preflight"
  | "approval transaction"
  | "approval receipt"
  | "burn transaction"
  | "burn receipt";

export class InjectiveToSolanaCctpExecutionError extends Error {
  approvalTxHash?: Hex | null;
  cause: unknown;
  stage: InjectiveToSolanaCctpExecutionStage;

  constructor(stage: InjectiveToSolanaCctpExecutionStage, cause: unknown, approvalTxHash?: Hex | null) {
    super(getErrorMessage(cause));
    this.name = "InjectiveToSolanaCctpExecutionError";
    this.stage = stage;
    this.cause = cause;
    this.approvalTxHash = approvalTxHash;
  }
}

export async function prepareInjectiveToSolanaCctpTransfer(
  input: PrepareInjectiveToSolanaCctpTransferInput,
): Promise<InjectiveToSolanaCctpPreflight> {
  const amount = parseUnits(input.amountUsdc, USDC_DECIMALS);
  const privateKey = readInjectivePrivateKeyFromEnv();
  const account = privateKeyToAccount(privateKey);
  const publicClient = createInjectivePublicClient();
  const solanaUsdcAta = getSolanaUsdcAta(input.solanaRecipientAddress).toBase58();
  const mintRecipient = encodeSolanaAtaAsBytes32(input.solanaRecipientAddress) as Hex;
  const hookData = buildForwardHookDataWithAtaCreation(input.solanaRecipientAddress) as Hex;
  const feeEstimate = await getForwardingFeeEstimate({ includeRecipientSetup: true });
  let maxFeeValue: string | undefined = hasForwardingMaxFee(feeEstimate) ? feeEstimate.maxFee : undefined;

  let isManualFeeFallback = false;
  let fallbackFeeWarning: string | undefined;

  if (!maxFeeValue) {
    const manualFeeUsdc = process.env.CCTP_MAX_FEE_USDC?.trim();

    if (manualFeeUsdc) {
      try {
        const manualFeeBaseUnits = parseUnits(manualFeeUsdc, USDC_DECIMALS);

        if (manualFeeBaseUnits <= BigInt(0)) {
          throw new Error("CCTP_MAX_FEE_USDC must be greater than 0.");
        }

        maxFeeValue = manualFeeBaseUnits.toString();
        isManualFeeFallback = true;
        fallbackFeeWarning = `Circle fee API could not be reached after ${MAX_FEE_RETRY_COUNT + 1} attempts. Using manual fallback CCTP_MAX_FEE_USDC=${manualFeeUsdc} USDC as maxFee estimate.`;
      } catch (parseError) {
        throw new Error(
          `CCTP_MAX_FEE_USDC is set but invalid: ${
            parseError instanceof Error ? parseError.message : "could not parse as USDC amount"
          }.`,
        );
      }
    }
  }

  if (!maxFeeValue) {
    throw new Error(
      "Circle fee estimate unavailable. Set CCTP_MAX_FEE_USDC in environment to use a manual fee estimate, or check your connection and try again.",
    );
  }

  if (fallbackFeeWarning && typeof feeEstimate.warning === "undefined") {
    feeEstimate.warning = fallbackFeeWarning;
  }

  const maxFee = BigInt(maxFeeValue);
  const [sourceUsdcBalance, currentAllowance, nativeGasBalance] = await Promise.all([
    readSourceUsdcBalance(publicClient, account.address),
    readCurrentAllowance(publicClient, account.address, INJECTIVE_TESTNET_CCTP.TokenMessengerV2),
    readNativeGasBalance(publicClient, account.address),
  ]);
  const approvalNeeded = currentAllowance < amount;
  const estimatedRecipientAmount = amount > maxFee ? amount - maxFee : BigInt(0);
  const safetyErrors = getSafetyErrors({ amount, maxFee, sourceUsdcBalance });
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

  return {
    amount,
    amountUsdc: input.amountUsdc,
    approvalNeeded,
    approveCalldata,
    burnCalldata,
    currentAllowance,
    estimatedRecipientAmount,
    hookData,
    maxFee,
    mintRecipient,
    nativeGasBalance,
    safetyErrors,
    solanaRecipientAddress: input.solanaRecipientAddress,
    solanaUsdcAta,
    sourceAddress: account.address,
    sourceUsdcBalance,
    contracts: {
      usdc: INJECTIVE_TESTNET_CCTP.USDC,
      tokenMessengerV2: INJECTIVE_TESTNET_CCTP.TokenMessengerV2,
      destinationCaller: ZERO_BYTES32,
      minFinalityThreshold: MIN_FINALITY_THRESHOLD,
    },
    forwardingFeeWarning: feeEstimate.warning,
    forwardingFeeExplanation: feeEstimate.explanation,
    isManualFeeFallback,
    fallbackFeeWarning,
  };
}

export async function executeInjectiveToSolanaCctpTransfer(
  input: ExecuteInjectiveToSolanaCctpTransferInput,
): Promise<InjectiveToSolanaCctpExecutionResult> {
  if (input.confirmation !== "YES") {
    throw new InjectiveToSolanaCctpExecutionError("validation", new Error("Explicit confirmation is required to execute Injective -> Solana CCTP transfer."));
  }

  let preflight: InjectiveToSolanaCctpPreflight;

  try {
    preflight = await prepareInjectiveToSolanaCctpTransfer(input);
  } catch (error) {
    throw new InjectiveToSolanaCctpExecutionError("prepare/preflight", error);
  }

  if (preflight.safetyErrors.length > 0) {
    throw new InjectiveToSolanaCctpExecutionError("prepare/preflight", new Error(`Real mode blocked by preflight safety checks: ${preflight.safetyErrors.join("; ")}`));
  }

  const privateKey = readInjectivePrivateKeyFromEnv();
  const account = privateKeyToAccount(privateKey);
  const publicClient = createInjectivePublicClient();
  const walletClient = createWalletClient({
    account,
    chain: injectiveTestnetEvm,
    transport: http(INJECTIVE_TESTNET_EVM_RPC_URL),
  });

  let approvalTxHash: Hex | null = null;

  if (preflight.approvalNeeded) {
    try {
      approvalTxHash = await walletClient.sendTransaction({
        account,
        to: INJECTIVE_TESTNET_CCTP.USDC,
        data: preflight.approveCalldata,
      });
    } catch (error) {
      throw new InjectiveToSolanaCctpExecutionError("approval transaction", error, approvalTxHash);
    }

    let approvalReceipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>;

    try {
      approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
    } catch (error) {
      throw new InjectiveToSolanaCctpExecutionError("approval receipt", error, approvalTxHash);
    }

    if (approvalReceipt.status !== "success") {
      throw new InjectiveToSolanaCctpExecutionError("approval receipt", new Error("Approval transaction failed. Burn transaction not sent."), approvalTxHash);
    }
  }

  let burnTxHash: Hex;

  try {
    burnTxHash = await walletClient.sendTransaction({
      account,
      to: INJECTIVE_TESTNET_CCTP.TokenMessengerV2,
      data: preflight.burnCalldata,
    });
  } catch (error) {
    throw new InjectiveToSolanaCctpExecutionError("burn transaction", error, approvalTxHash);
  }

  let burnReceipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>;

  try {
    burnReceipt = await publicClient.waitForTransactionReceipt({ hash: burnTxHash });
  } catch (error) {
    throw new InjectiveToSolanaCctpExecutionError("burn receipt", error, approvalTxHash);
  }

  if (burnReceipt.status !== "success") {
    throw new InjectiveToSolanaCctpExecutionError("burn receipt", new Error("depositForBurnWithHook transaction failed."), approvalTxHash);
  }

  return {
    approvalTxHash,
    burnTxHash,
    expectedRecipientAmount: preflight.estimatedRecipientAmount,
    solanaRecipientAddress: preflight.solanaRecipientAddress,
    solanaUsdcAta: preflight.solanaUsdcAta,
  };
}

const injectiveTestnetEvm = defineChain({
  id: INJECTIVE_TESTNET_EVM_CHAIN_ID,
  name: "Injective EVM Testnet",
  nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
  rpcUrls: {
    default: { http: [INJECTIVE_TESTNET_EVM_RPC_URL] },
  },
});

function createInjectivePublicClient() {
  return createPublicClient({
    chain: injectiveTestnetEvm,
    transport: http(INJECTIVE_TESTNET_EVM_RPC_URL),
  });
}

function readInjectivePrivateKeyFromEnv() {
  const privateKey = process.env.INJECTIVE_EVM_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("Missing required environment variable: INJECTIVE_EVM_PRIVATE_KEY.");
  }

  return normalizePrivateKey(privateKey);
}

function normalizePrivateKey(privateKey: string) {
  const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("INJECTIVE_EVM_PRIVATE_KEY must be a 32-byte hex private key.");
  }

  return normalized as Hex;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const shortMessage = typeof record.shortMessage === "string" ? record.shortMessage.trim() : "";
    const details = typeof record.details === "string" ? record.details.trim() : "";

    if (shortMessage) {
      return shortMessage;
    }

    if (details) {
      return details;
    }
  }

  const fallback = String(error).trim();

  return fallback || "Unknown CCTP execution error.";
}

async function readSourceUsdcBalance(publicClient: ReturnType<typeof createInjectivePublicClient>, owner: Address) {
  return publicClient.readContract({
    address: INJECTIVE_TESTNET_CCTP.USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

async function readCurrentAllowance(publicClient: ReturnType<typeof createInjectivePublicClient>, owner: Address, spender: Address) {
  return publicClient.readContract({
    address: INJECTIVE_TESTNET_CCTP.USDC,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

async function readNativeGasBalance(publicClient: ReturnType<typeof createInjectivePublicClient>, owner: Address) {
  try {
    const balance = await publicClient.getBalance({ address: owner });

    return { balance, error: null };
  } catch (error) {
    return {
      balance: null,
      error: error instanceof Error ? error.message : "Unable to read native INJ gas balance.",
    };
  }
}

function getSafetyErrors({
  amount,
  maxFee,
  sourceUsdcBalance,
}: {
  amount: bigint;
  maxFee: bigint;
  sourceUsdcBalance: bigint;
}) {
  const errors: string[] = [];

  if (amount <= maxFee) {
    errors.push("Requested amount is too small relative to forwarding fee.");
  }

  if (sourceUsdcBalance < amount) {
    errors.push("Source USDC balance is less than required amount.");
  }

  return errors;
}

function getSolanaUsdcAta(solanaWalletAddress: string) {
  const owner = new PublicKey(solanaWalletAddress);
  const mint = new PublicKey(SOLANA_DEVNET_CCTP.UsdcMint);

  // Forwarding destination may be any valid Solana account; allow off-curve owners for ATA derivation.
  return getAssociatedTokenAddressSync(mint, owner, true);
}

function encodeSolanaAtaAsBytes32(solanaWalletAddress: string) {
  return publicKeyToBytes32Hex(getSolanaUsdcAta(solanaWalletAddress));
}

function buildForwardHookDataWithAtaCreation(solanaWalletAddress: string) {
  const wallet = new PublicKey(solanaWalletAddress);
  const magic = Buffer.alloc(24);
  magic.write(CCTP_FORWARD_MAGIC, "ascii");

  const version = Buffer.alloc(4);
  version.writeUInt32BE(0, 0);

  const length = Buffer.alloc(4);
  length.writeUInt32BE(33, 0);

  const hookData = Buffer.concat([
    magic,
    version,
    length,
    Buffer.from([1]),
    Buffer.from(wallet.toBytes()),
  ]);

  return `0x${hookData.toString("hex")}`;
}

function publicKeyToBytes32Hex(publicKey: PublicKey) {
  const bytes = publicKey.toBytes();

  if (bytes.length !== 32) {
    throw new Error(`Expected Solana public key to be 32 bytes, received ${bytes.length}.`);
  }

  return `0x${Buffer.from(bytes).toString("hex")}`;
}

async function getForwardingFeeEstimate(options: { includeRecipientSetup?: boolean } = {}): Promise<ForwardingFeeEstimate> {
  const url = options.includeRecipientSetup
    ? `${CIRCLE_SANDBOX_FORWARD_FEE_URL}&includeRecipientSetup=true`
    : CIRCLE_SANDBOX_FORWARD_FEE_URL;

  try {
    const response = await fetchWithRetry(url, MAX_FEE_RETRY_COUNT, MAX_FEE_RETRY_DELAY_MS);

    if (!response.ok) {
      return { warning: `Circle fee API returned ${response.status} ${response.statusText} after ${MAX_FEE_RETRY_COUNT + 1} attempts.` };
    }

    const data = await response.json() as unknown;

    return {
      rawResponse: data,
      ...extractForwardingFees(data),
    };
  } catch (error) {
    return {
      warning: error instanceof Error
        ? `Circle fee API request failed after ${MAX_FEE_RETRY_COUNT + 1} attempts: ${error.message}`
        : `Circle fee API request failed after ${MAX_FEE_RETRY_COUNT + 1} attempts.`,
    };
  }
}

async function fetchWithRetry(url: string, maxRetries: number, delayMs: number): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

function extractForwardingFees(data: unknown): ForwardingFeeEstimate {
  if (Array.isArray(data)) {
    return extractForwardingFeeOptions(data);
  }

  if (!data || typeof data !== "object") {
    return { warning: "Circle fee API returned an unexpected response." };
  }

  const record = data as Record<string, unknown>;
  const direct = pickFeeTiers(record);

  if (direct.low || direct.med || direct.high) {
    return direct;
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const nested = pickFeeTiers(value as Record<string, unknown>);

      if (nested.low || nested.med || nested.high) {
        return nested;
      }
    }
  }

  return { warning: "Circle fee API response did not include low/med/high fee tiers." };
}

function extractForwardingFeeOptions(values: unknown[]): ForwardingFeeEstimate {
  const feeOptions = values
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    .map((record) => {
      const forwardFee = record.forwardFee && typeof record.forwardFee === "object"
        ? record.forwardFee as Record<string, unknown>
        : undefined;

      return {
        finalityThreshold: stringifyFee(record.finalityThreshold),
        minimumFee: stringifyFee(record.minimumFee),
        low: stringifyFee(forwardFee?.low),
        med: stringifyFee(forwardFee?.med),
        high: stringifyFee(forwardFee?.high),
      };
    });

  const selectedOption = feeOptions.find((option) => option.finalityThreshold === String(MIN_FINALITY_THRESHOLD));

  if (!selectedOption) {
    return {
      explanation: `Circle returned fee options, but none matched finalityThreshold ${MIN_FINALITY_THRESHOLD}.`,
      feeOptions,
      warning: "Circle fee API response did not include the required finality threshold option.",
    };
  }

  const maxFee = selectedOption.high ?? selectedOption.med;

  if (!maxFee) {
    return {
      ...selectedOption,
      explanation: `${buildFeeExplanation(selectedOption)} Cannot compute maxFee without forwardFee.high or forwardFee.med for finalityThreshold ${MIN_FINALITY_THRESHOLD}.`,
      feeOptions,
      warning: "Circle fee API response did not include high or med forward fee for the required finality threshold.",
    };
  }

  return {
    ...selectedOption,
    explanation: `Selected finalityThreshold ${MIN_FINALITY_THRESHOLD}. ${buildFeeExplanation(selectedOption)}`,
    feeOptions,
    maxFee,
  };
}

function pickFeeTiers(record: Record<string, unknown>) {
  return {
    low: stringifyFee(record.low ?? record.lowFee ?? record.minimumFee),
    med: stringifyFee(record.med ?? record.medium ?? record.mediumFee),
    high: stringifyFee(record.high ?? record.highFee ?? record.maximumFee),
  };
}

function stringifyFee(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return undefined;
}

function computeMaxForwardFee(feeOptions: Array<{ high?: string; minimumFee?: string }>) {
  const maxFee = feeOptions.reduce<bigint | null>((currentMax, option) => {
    const high = parseIntegerString(option.high);
    const minimumFee = parseIntegerString(option.minimumFee) ?? BigInt(0);

    if (high === undefined) {
      return currentMax;
    }

    const candidate = high + minimumFee;

    return currentMax === null || candidate > currentMax ? candidate : currentMax;
  }, null);

  return maxFee === null ? undefined : maxFee.toString();
}

function hasForwardingMaxFee(feeEstimate: Awaited<ReturnType<typeof getForwardingFeeEstimate>>): feeEstimate is Awaited<ReturnType<typeof getForwardingFeeEstimate>> & { maxFee: string } {
  return "maxFee" in feeEstimate && typeof feeEstimate.maxFee === "string" && feeEstimate.maxFee.length > 0;
}

function parseIntegerString(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }

  return BigInt(value);
}

function buildFeeExplanation(option: { low?: string; med?: string; high?: string }) {
  const missing = [
    option.low ? undefined : "low",
    option.med ? undefined : "med",
    option.high ? undefined : "high",
  ].filter(Boolean);

  if (missing.length === 0) {
    return "Circle returned forwardFee.low, forwardFee.med, and forwardFee.high values.";
  }

  return `Circle did not return ${missing.join("/")} forward fee value(s) for the selected option.`;
}
