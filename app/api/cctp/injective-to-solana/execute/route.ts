import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { formatUnits, parseUnits } from "viem";
import {
  InjectiveToSolanaCctpExecutionError,
  executeInjectiveToSolanaCctpTransfer,
  prepareInjectiveToSolanaCctpTransfer,
} from "../../../../../lib/server/cctp/injective-to-solana";
import {
  DAILY_SPONSORED_GAS_CREDIT_EXHAUSTED_ERROR,
  getRequestIp,
  reserveSponsoredGasCredit,
  rollbackSponsoredGasCredit,
} from "../../../../../lib/server/gas-credit-limiter";
import { persistOmnisReceiptBestEffort, withoutUndefined } from "../../../../../lib/server/omnis-receipts";

const USDC_DECIMALS = 6;
const EXECUTION_CONFIRMATION = "EXECUTE_TESTNET_CCTP";
const SERVER_EXECUTION_CONFIRMATION = "YES";
const CONFIRM_MANUAL_MAX_FEE = "YES";

type ExecuteRequestBody = {
  amountUsdc?: unknown;
  confirmExecution?: unknown;
  solanaRecipientAddress?: unknown;
};

// Testnet-only execution endpoint for the hackathon MVP.
// Do not deploy publicly without authentication, authorization, and rate limits.
export async function POST(request: Request) {
  let stage = "validation";
  let executionSubmitted = false;
  let reservedLimiterKey: string | null = null;

  try {
    if (process.env.ENABLE_CCTP_EXECUTION_API !== "true") {
      return NextResponse.json({ ok: false, error: "CCTP execution API is disabled." }, { status: 403 });
    }

    const body = await request.json() as ExecuteRequestBody;
    const validation = validateBody(body);

    if (!validation.ok) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    }

    stage = "prepare/preflight";
    const preflight = await prepareInjectiveToSolanaCctpTransfer({
      amountUsdc: validation.amountUsdc,
      solanaRecipientAddress: validation.solanaRecipientAddress,
    });

    if (preflight.isManualFeeFallback && process.env.CONFIRM_MANUAL_MAX_FEE !== CONFIRM_MANUAL_MAX_FEE) {
      return NextResponse.json({
        ok: false,
        error: "Manual fee fallback is active but CONFIRM_MANUAL_MAX_FEE is not set to YES.",
        isManualFeeFallback: true,
        fallbackFeeWarning: preflight.fallbackFeeWarning,
      }, { status: 400 });
    }

    const limiterUserKey = preflight.sourceAddress || getRequestIp(request);
    const limiterReservation = reserveSponsoredGasCredit(limiterUserKey);

    if (!limiterReservation.ok) {
      return NextResponse.json({ ok: false, error: DAILY_SPONSORED_GAS_CREDIT_EXHAUSTED_ERROR }, { status: 429 });
    }

    reservedLimiterKey = limiterReservation.storageKey;

    stage = "execution";
    const result = await executeInjectiveToSolanaCctpTransfer({
      amountUsdc: validation.amountUsdc,
      confirmation: SERVER_EXECUTION_CONFIRMATION,
      solanaRecipientAddress: validation.solanaRecipientAddress,
    });
    executionSubmitted = true;

    stage = "response building";
    const responseBody = toJsonSafe({
      ok: true,
      approvalTxHash: result.approvalTxHash ?? null,
      burnTxHash: result.burnTxHash,
      requestedAmount: {
        usdc: preflight.amountUsdc,
        baseUnits: preflight.amount.toString(),
      },
      sourceUsdcBalance: {
        usdc: formatUsdc(preflight.sourceUsdcBalance),
        baseUnits: preflight.sourceUsdcBalance.toString(),
      },
      currentAllowance: {
        usdc: formatUsdc(preflight.currentAllowance),
        baseUnits: preflight.currentAllowance.toString(),
      },
      approvalNeeded: preflight.approvalNeeded,
      nativeInjGasBalance: preflight.nativeGasBalance.balance === null
        ? { inj: null, wei: null, error: preflight.nativeGasBalance.error }
        : {
            inj: formatUnits(preflight.nativeGasBalance.balance, 18),
            wei: preflight.nativeGasBalance.balance.toString(),
            error: null,
          },
      forwardingMaxFee: {
        usdc: formatUsdc(preflight.maxFee),
        baseUnits: preflight.maxFee.toString(),
      },
      estimatedRecipientAmount: {
        usdc: formatUsdc(result.expectedRecipientAmount),
        baseUnits: result.expectedRecipientAmount.toString(),
      },
      sourceEvmAddress: preflight.sourceAddress,
      solanaRecipientWallet: result.solanaRecipientAddress,
      solanaUsdcAta: result.solanaUsdcAta,
      message: "Circle Forwarding Service handles Solana minting. Refresh Solana USDC balance after ~30-90 seconds.",
      isManualFeeFallback: preflight.isManualFeeFallback,
      fallbackFeeWarning: preflight.fallbackFeeWarning,
      maxFeeSource: preflight.isManualFeeFallback ? "manual-env-fallback" : "circle-api",
    });

    await persistOmnisReceiptBestEffort({
      amountUsdc: preflight.amountUsdc,
      approvalTxHash: result.approvalTxHash ?? null,
      burnTxHash: result.burnTxHash,
      destinationChain: "Solana",
      estimatedRecipientAmountUsdc: formatUsdc(result.expectedRecipientAmount),
      forwardingFeeUsdc: formatUsdc(preflight.maxFee),
      message: responseBody.message,
      rawReceipt: withoutUndefined(responseBody),
      route: "injective-to-solana",
      solanaRecipientWallet: result.solanaRecipientAddress,
      solanaUsdcAta: result.solanaUsdcAta,
      sourceChain: "Injective",
      sourceEvmAddress: preflight.sourceAddress,
      status: "forwarding-submitted",
    });

    return NextResponse.json(responseBody);
  } catch (error) {
    if (reservedLimiterKey && !executionSubmitted) {
      rollbackSponsoredGasCredit(reservedLimiterKey);
    }

    const serializedError = serializeCctpError(error);
    const failedStage = getFailedStage(error, stage);
    const approvalTxHash = getApprovalTxHash(error);

    logExecutionError({ error: serializedError, failedStage });

    return NextResponse.json(toJsonSafe({
      ok: false,
      failedStage,
      approvalTxHash,
      error: "Unable to execute Injective to Solana CCTP transfer.",
    }), { status: 500 });
  }
}

function validateBody(body: ExecuteRequestBody) {
  if (typeof body.amountUsdc !== "string" || !body.amountUsdc.trim()) {
    return { ok: false as const, error: "amountUsdc is required." };
  }

  if (typeof body.solanaRecipientAddress !== "string" || !body.solanaRecipientAddress.trim()) {
    return { ok: false as const, error: "solanaRecipientAddress is required." };
  }

  if (body.confirmExecution !== EXECUTION_CONFIRMATION) {
    return { ok: false as const, error: `confirmExecution must equal ${EXECUTION_CONFIRMATION}.` };
  }

  const amountUsdc = body.amountUsdc.trim();

  if (!/^\d+(\.\d{1,6})?$/.test(amountUsdc)) {
    return { ok: false as const, error: "amountUsdc must be a positive USDC amount with up to 6 decimals." };
  }

  if (parseUnits(amountUsdc, USDC_DECIMALS) <= BigInt(0)) {
    return { ok: false as const, error: "amountUsdc must be greater than 0." };
  }

  const solanaRecipientAddress = body.solanaRecipientAddress.trim();

  try {
    const publicKey = new PublicKey(solanaRecipientAddress);

    if (publicKey.toBase58() !== solanaRecipientAddress) {
      return { ok: false as const, error: "solanaRecipientAddress must be a valid Solana public key." };
    }
  } catch {
    return { ok: false as const, error: "solanaRecipientAddress must be a valid Solana public key." };
  }

  return { ok: true as const, amountUsdc, solanaRecipientAddress };
}

function formatUsdc(value: bigint) {
  return formatUnits(value, USDC_DECIMALS);
}

function logExecutionError({ error, failedStage }: { error: SerializedCctpError; failedStage: string }) {
  console.error("Injective to Solana CCTP execution API error:", {
    route: "POST /api/cctp/injective-to-solana/execute",
    failedStage,
    name: error.name,
    message: error.message,
    shortMessage: error.shortMessage,
    stack: error.stack,
  });
}

function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, currentValue) => (
    typeof currentValue === "bigint" ? currentValue.toString() : currentValue
  ))) as T;
}

type SerializedCctpError = {
  causeMessage?: string;
  details?: string;
  message: string;
  name: string;
  shortMessage?: string;
  stack?: string;
};

function serializeCctpError(error: unknown): SerializedCctpError {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const cause = record.cause && typeof record.cause === "object" ? record.cause as Record<string, unknown> : undefined;
  const causeMessage = getString(cause?.message);
  const shortMessage = getString(record.shortMessage) ?? getNestedString(record.cause, "shortMessage");
  const details = getString(record.details) ?? getNestedString(record.cause, "details");
  const message = getString(record.message)
    ?? shortMessage
    ?? details
    ?? causeMessage
    ?? (typeof error === "string" && error.trim() ? error.trim() : undefined)
    ?? "Unknown CCTP execution error.";

  return {
    causeMessage,
    details,
    message,
    name: getString(record.name) ?? "CctpExecutionError",
    shortMessage,
    stack: getString(record.stack),
  };
}

function getFailedStage(error: unknown, fallbackStage: string) {
  if (error instanceof InjectiveToSolanaCctpExecutionError) {
    return error.stage;
  }

  if (error && typeof error === "object" && "stage" in error && typeof (error as { stage?: unknown }).stage === "string") {
    return (error as { stage: string }).stage;
  }

  return fallbackStage;
}

function getApprovalTxHash(error: unknown) {
  if (error instanceof InjectiveToSolanaCctpExecutionError) {
    return error.approvalTxHash ?? null;
  }

  if (error && typeof error === "object" && "approvalTxHash" in error) {
    const approvalTxHash = (error as { approvalTxHash?: unknown }).approvalTxHash;

    return typeof approvalTxHash === "string" ? approvalTxHash : null;
  }

  return null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNestedString(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return getString((value as Record<string, unknown>)[key]);
}
