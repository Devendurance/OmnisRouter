// Server-only module. Do not import from client components or browser code.
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { bech32 } from "bech32";
import { parseUnits } from "viem";

const SOLANA_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const USDC_DECIMALS = 6;

const CCTP_DOMAINS = {
  Solana: 5,
  Injective: 29,
} as const;

const SOLANA_DEVNET_CCTP = {
  UsdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  TokenMessengerMinterV2Program: "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe",
  MessageTransmitterV2Program: "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC",
} as const;

const INJECTIVE_TESTNET_CCTP = {
  MessageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
} as const;

export type PrepareSolanaToInjectiveCctpTransferInput = {
  amountUsdc: string;
  sourceSolanaAddress: string;
  recipientInjectiveAddress: string;
};

export type ExecuteSolanaToInjectiveCctpTransferInput =
  PrepareSolanaToInjectiveCctpTransferInput & {
    confirmation: "YES";
  };

export type SolanaToInjectiveCctpPreflight = {
  amount: bigint;
  amountUsdc: string;
  sourceSolanaAddress: string;
  sourceUsdcAta: string;
  sourceSolBalance: bigint | null;
  sourceSolBalanceError: string | null;
  sourceUsdcBalance: bigint | null;
  sourceUsdcBalanceError: string | null;
  recipientInjectiveAddress: string;
  mintRecipient: string;
  sourceDomain: 5;
  destinationDomain: 29;
  safetyErrors: string[];
  contracts: {
    usdcMint: string;
    tokenMessengerMinterV2: string;
    messageTransmitterV2Solana: string;
    messageTransmitterV2Injective: string;
  };
};

export type SolanaToInjectiveCctpExecutionResult = {
  burnTxHash: string;
  receiveTxHash: string | null;
  expectedRecipientAmount: bigint;
  recipientInjectiveAddress: string;
};

export type SolanaToInjectiveCctpExecutionStage =
  | "validation"
  | "prepare/preflight"
  | "burn transaction"
  | "burn receipt"
  | "attestation polling"
  | "receive transaction"
  | "receive receipt";

export class SolanaToInjectiveCctpExecutionError extends Error {
  burnTxHash?: string | null;
  cause: unknown;
  stage: SolanaToInjectiveCctpExecutionStage;

  constructor(
    stage: SolanaToInjectiveCctpExecutionStage,
    cause: unknown,
    burnTxHash?: string | null,
  ) {
    super(getErrorMessage(cause));
    this.name = "SolanaToInjectiveCctpExecutionError";
    this.stage = stage;
    this.cause = cause;
    this.burnTxHash = burnTxHash;
  }
}

export async function prepareSolanaToInjectiveCctpTransfer(
  input: PrepareSolanaToInjectiveCctpTransferInput,
): Promise<SolanaToInjectiveCctpPreflight> {
  const amount = parseUnits(input.amountUsdc, USDC_DECIMALS);
  const sourceSolanaAddress = validateSolanaAddress(input.sourceSolanaAddress);
  const recipientInjectiveAddress = validateInjectiveAddress(input.recipientInjectiveAddress);
  const connection = new Connection(SOLANA_DEVNET_RPC_URL, "confirmed");
  const sourcePublicKey = new PublicKey(sourceSolanaAddress);
  const usdcMint = new PublicKey(SOLANA_DEVNET_CCTP.UsdcMint);
  const sourceUsdcAta = getAssociatedTokenAddressSync(usdcMint, sourcePublicKey, true).toBase58();
  const safetyErrors: string[] = [];

  const [solBalanceResult, usdcBalanceResult] = await Promise.allSettled([
    connection.getBalance(sourcePublicKey),
    getAccount(connection, new PublicKey(sourceUsdcAta)).then(
      (account) => account.amount,
      () => {
        throw new Error("Token account not found or unreachable.");
      },
    ),
  ]);

  const sourceSolBalance =
    solBalanceResult.status === "fulfilled" ? BigInt(solBalanceResult.value) : null;

  const sourceSolBalanceError =
    solBalanceResult.status === "rejected"
      ? getErrorMessage(solBalanceResult.reason)
      : null;

  const sourceUsdcBalance =
    usdcBalanceResult.status === "fulfilled" ? usdcBalanceResult.value : null;

  const sourceUsdcBalanceError =
    usdcBalanceResult.status === "rejected"
      ? getErrorMessage(usdcBalanceResult.reason)
      : null;

  if (sourceUsdcBalance === null) {
    safetyErrors.push(`Unable to read source Solana USDC balance: ${sourceUsdcBalanceError ?? "unknown error"}.`);
  } else if (sourceUsdcBalance < amount) {
    safetyErrors.push("Source Solana USDC balance is less than requested amount.");
  }

  if (sourceSolBalance === null) {
    safetyErrors.push(`Unable to read source Solana SOL balance for gas: ${sourceSolBalanceError ?? "unknown error"}.`);
  } else if (sourceSolBalance < LAMPORTS_PER_SOL / 100) {
    safetyErrors.push("Source Solana wallet may not have enough SOL for transaction fees.");
  }

  const mintRecipient = encodeInjectiveAddressAsBytes32(recipientInjectiveAddress);

  return {
    amount,
    amountUsdc: input.amountUsdc,
    sourceSolanaAddress,
    sourceUsdcAta,
    sourceSolBalance,
    sourceSolBalanceError,
    sourceUsdcBalance,
    sourceUsdcBalanceError,
    recipientInjectiveAddress,
    mintRecipient,
    sourceDomain: CCTP_DOMAINS.Solana,
    destinationDomain: CCTP_DOMAINS.Injective,
    safetyErrors,
    contracts: {
      usdcMint: SOLANA_DEVNET_CCTP.UsdcMint,
      tokenMessengerMinterV2: SOLANA_DEVNET_CCTP.TokenMessengerMinterV2Program,
      messageTransmitterV2Solana: SOLANA_DEVNET_CCTP.MessageTransmitterV2Program,
      messageTransmitterV2Injective: INJECTIVE_TESTNET_CCTP.MessageTransmitterV2,
    },
  };
}

export async function executeSolanaToInjectiveCctpTransfer(
  _input: ExecuteSolanaToInjectiveCctpTransferInput,
): Promise<SolanaToInjectiveCctpExecutionResult> {
  throw new SolanaToInjectiveCctpExecutionError(
    "burn transaction",
    new Error(
      "Solana CCTP V2 depositForBurn account layout not verified yet. " +
        "Verify PDA seeds and instruction account ordering against Circle's official CCTP V2 Solana program documentation " +
        "before implementing raw instruction building and execution.",
    ),
  );
}

function validateSolanaAddress(address: string): string {
  const normalized = address.trim();

  if (!normalized) {
    throw new Error("sourceSolanaAddress is required.");
  }

  try {
    const publicKey = new PublicKey(normalized);

    if (publicKey.toBase58() !== normalized) {
      throw new Error("sourceSolanaAddress must be a valid Solana public key.");
    }
  } catch {
    throw new Error("sourceSolanaAddress must be a valid Solana public key.");
  }

  return normalized;
}

function validateInjectiveAddress(address: string): string {
  const normalized = address.trim();

  if (!normalized) {
    throw new Error("recipientInjectiveAddress is required.");
  }

  if (!/^inj/i.test(normalized)) {
    throw new Error("recipientInjectiveAddress must be a valid Injective Bech32 address starting with inj.");
  }

  try {
    const decoded = bech32.decode(normalized);

    if (decoded.prefix !== "inj") {
      throw new Error("recipientInjectiveAddress must use the inj prefix.");
    }

    const accountData = bech32.fromWords(decoded.words);

    if (accountData.length !== 20) {
      throw new Error("recipientInjectiveAddress decoded account data is not a normal 20-byte account.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("recipientInjectiveAddress")) {
      throw error;
    }

    throw new Error("recipientInjectiveAddress must be a valid Injective Bech32 address.");
  }

  return normalized;
}

function encodeInjectiveAddressAsBytes32(injAddress: string): string {
  const decoded = bech32.decode(injAddress);
  const words = bech32.fromWords(decoded.words);
  const hex = Buffer.from(words).toString("hex");

  return `0x${"0".repeat(24)}${hex}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  const fallback = String(error).trim();

  return fallback || "Unknown error.";
}
