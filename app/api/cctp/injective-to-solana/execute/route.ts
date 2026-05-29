import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { formatUnits, parseUnits } from "viem";
import {
  InjectiveToSolanaCctpExecutionError,
  executeInjectiveToSolanaCctpTransfer,
  prepareInjectiveToSolanaCctpTransfer,
} from "../../../../../lib/server/cctp/injective-to-solana";

const USDC_DECIMALS = 6;
const EXECUTION_CONFIRMATION = "EXECUTE_TESTNET_CCTP";
const SERVER_EXECUTION_CONFIRMATION = "YES";
const DAILY_SPONSORED_EXECUTION_LIMIT = 5;
const ROUTE_LIMITER_NAME = "injective-to-solana-cctp";
const DAILY_LIMIT_EXHAUSTED_ERROR = "Daily sponsored gas credits exhausted. Try again tomorrow or use paid mode when available.";

type DailyLimiterEntry = {
  dateKey: string;
  successfulExecutions: number;
};

// MVP in-memory limiter. Production should use Redis/database-backed rate limiting per authenticated user/wallet.
const dailyExecutionLimiter = new Map<string, DailyLimiterEntry>();

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

    const limiterKey = getDailyLimiterKey(request, ROUTE_LIMITER_NAME);

    if (!reserveSponsoredExecutionCredit(limiterKey)) {
      return NextResponse.json({ ok: false, error: DAILY_LIMIT_EXHAUSTED_ERROR }, { status: 429 });
    }

    reservedLimiterKey = limiterKey;

    stage = "execution";
    const result = await executeInjectiveToSolanaCctpTransfer({
      amountUsdc: validation.amountUsdc,
      confirmation: SERVER_EXECUTION_CONFIRMATION,
      solanaRecipientAddress: validation.solanaRecipientAddress,
    });
    executionSubmitted = true;

    stage = "response building";
    return NextResponse.json(toJsonSafe({
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
    }));
  } catch (error) {
    if (reservedLimiterKey && !executionSubmitted) {
      rollbackSponsoredExecutionCredit(reservedLimiterKey);
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

function getDailyLimiterKey(request: Request, routeName: string) {
  return `${getRequestIp(request)}:${routeName}`;
}

function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return forwardedFor || realIp || "unknown-ip";
}

function reserveSponsoredExecutionCredit(key: string) {
  const entry = getDailyLimiterEntry(key);

  if (entry.successfulExecutions >= DAILY_SPONSORED_EXECUTION_LIMIT) {
    return false;
  }

  dailyExecutionLimiter.set(key, {
    ...entry,
    successfulExecutions: entry.successfulExecutions + 1,
  });

  return true;
}

function rollbackSponsoredExecutionCredit(key: string) {
  const entry = getDailyLimiterEntry(key);

  dailyExecutionLimiter.set(key, {
    ...entry,
    successfulExecutions: Math.max(entry.successfulExecutions - 1, 0),
  });
}

function getDailyLimiterEntry(key: string) {
  const dateKey = getUtcDateKey();
  const existing = dailyExecutionLimiter.get(key);

  if (existing?.dateKey === dateKey) {
    return existing;
  }

  const freshEntry = { dateKey, successfulExecutions: 0 };
  dailyExecutionLimiter.set(key, freshEntry);

  return freshEntry;
}

function getUtcDateKey() {
  return new Date().toISOString().slice(0, 10);
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
