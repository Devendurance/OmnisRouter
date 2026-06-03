import { PublicKey, Keypair } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { formatUnits, parseUnits } from "viem";
import {
  executeSolanaToInjectiveCctpTransfer,
} from "../../../../../lib/server/cctp/solana-to-injective-executor";
import { SolanaToInjectiveCctpExecutionError } from "../../../../../lib/server/cctp/solana-to-injective";
import {
  DAILY_SPONSORED_GAS_CREDIT_EXHAUSTED_ERROR,
  getRequestIp,
  reserveSponsoredGasCredit,
  rollbackSponsoredGasCredit,
} from "../../../../../lib/server/gas-credit-limiter";
import { persistOmnisReceiptBestEffort, withoutUndefined } from "../../../../../lib/server/omnis-receipts";
import { serverFundedExecutionEnabled } from "../../../../../lib/server/feature-flags";

const USDC_DECIMALS = 6;
const EXECUTION_CONFIRMATION = "EXECUTE_SOLANA_TO_INJECTIVE";

type ExecuteRequestBody = {
  amountUsdc?: unknown;
  solanaSourceAddress?: unknown;
  injectiveRecipientAddress?: unknown;
  confirmExecution?: unknown;
};

export async function POST(request: Request) {
  let stage = "validation";
  let burnTxHash: string | null = null;
  let executionSubmitted = false;
  let lastValidation: ReturnType<typeof validateBody> | null = null;
  let reservedLimiterKey: string | null = null;

  try {
    if (!serverFundedExecutionEnabled) {
      return NextResponse.json({ ok: false, error: "Server-funded execution is disabled." }, { status: 403 });
    }

    const body = await request.json() as ExecuteRequestBody;
    const validation = validateBody(body);
    lastValidation = validation;

    if (!validation.ok) {
      const debug = "debug" in validation
        ? validation.debug
        : buildSolanaAddressDebug(body.solanaSourceAddress);

      return NextResponse.json(toJsonSafe({
        ok: false,
        failedStage: "validation",
        burnTxHash: null,
        error: validation.error,
        debug,
      }), { status: 400 });
    }

    const limiterUserKey = validation.serverSolanaSourceAddress || getRequestIp(request);
    const limiterReservation = reserveSponsoredGasCredit(limiterUserKey);

    if (!limiterReservation.ok) {
      return NextResponse.json({ ok: false, error: DAILY_SPONSORED_GAS_CREDIT_EXHAUSTED_ERROR }, { status: 429 });
    }

    reservedLimiterKey = limiterReservation.storageKey;

    stage = "execution";
    const result = await executeSolanaToInjectiveCctpTransfer({
      amountUsdc: validation.amountUsdc,
      sourceSolanaAddress: validation.serverSolanaSourceAddress,
      recipientInjectiveAddress: validation.injectiveRecipientAddress,
      confirmation: EXECUTION_CONFIRMATION,
    });
    executionSubmitted = true;
    burnTxHash = result.burnTxHash;

    stage = "response building";
    const responseBody = toJsonSafe({
      ok: true,
      route: "solana-to-injective",
      burnTxHash: result.burnTxHash,
      relayTxHash: result.receiveTxHash,
      amountUsdc: validation.amountUsdc,
      sourceChain: "Solana devnet",
      destinationChain: "Injective testnet",
      expectedRecipientAmount: {
        usdc: formatUnits(result.expectedRecipientAmount, USDC_DECIMALS),
        baseUnits: result.expectedRecipientAmount.toString(),
      },
      debug: validation.debug,
      message: "Solana burn confirmed. Iris attestation received. Injective relay completed.",
    });

    await persistOmnisReceiptBestEffort({
      amountUsdc: validation.amountUsdc,
      burnTxHash: result.burnTxHash,
      destinationChain: "Injective",
      estimatedRecipientAmountUsdc: formatUnits(result.expectedRecipientAmount, USDC_DECIMALS),
      forwardingFeeUsdc: "0",
      injectiveRecipientAddress: validation.injectiveRecipientAddress,
      message: responseBody.message,
      rawReceipt: withoutUndefined({
        ok: responseBody.ok,
        route: responseBody.route,
        burnTxHash: responseBody.burnTxHash,
        relayTxHash: responseBody.relayTxHash,
        amountUsdc: responseBody.amountUsdc,
        sourceChain: responseBody.sourceChain,
        destinationChain: responseBody.destinationChain,
        expectedRecipientAmount: responseBody.expectedRecipientAmount,
        solanaSourceAddress: validation.serverSolanaSourceAddress,
        injectiveRecipientAddress: validation.injectiveRecipientAddress,
        message: responseBody.message,
      }),
      relayTxHash: result.receiveTxHash,
      route: "solana-to-injective",
      solanaSourceAddress: validation.serverSolanaSourceAddress,
      sourceChain: "Solana",
      status: "completed",
    });

    return NextResponse.json(responseBody);
  } catch (error) {
    if (reservedLimiterKey && !executionSubmitted) {
      rollbackSponsoredGasCredit(reservedLimiterKey);
    }

    const failedStage = getFailedStage(error, stage);
    const message = error instanceof Error ? error.message : "Unable to execute Solana to Injective CCTP transfer.";

    console.error("Solana to Injective CCTP execution error:", { route: "POST /api/cctp/solana-to-injective/execute", failedStage, message });

    const responseBody: Record<string, unknown> = {
      ok: false,
      failedStage,
      burnTxHash,
      error: message,
    };

    if (message.includes("does not match") && message.includes("SOLANA")) {
      responseBody.debug = buildSolanaAddressDebug(lastValidation?.ok ? lastValidation.requestSolanaSourceAddress : "");
    }

    return NextResponse.json(toJsonSafe(responseBody), { status: 500 });
  }
}

function validateBody(body: ExecuteRequestBody) {
  if (typeof body.amountUsdc !== "string" || !body.amountUsdc.trim()) {
    return { ok: false as const, error: "amountUsdc is required." };
  }

  if (typeof body.injectiveRecipientAddress !== "string" || !body.injectiveRecipientAddress.trim()) {
    return { ok: false as const, error: "injectiveRecipientAddress is required." };
  }

  if (body.confirmExecution !== EXECUTION_CONFIRMATION) {
    return { ok: false as const, error: `confirmExecution must equal "${EXECUTION_CONFIRMATION}".` };
  }

  const amountUsdc = body.amountUsdc.trim();

  if (!/^\d+(\.\d{1,6})?$/.test(amountUsdc)) {
    return { ok: false as const, error: "amountUsdc must be a positive USDC amount with up to 6 decimals." };
  }

  if (parseUnits(amountUsdc, USDC_DECIMALS) <= BigInt(0)) {
    return { ok: false as const, error: "amountUsdc must be greater than 0." };
  }

  const solanaSourceAddress = body.solanaSourceAddress;
  let derivedKeypair: Keypair;

  try {
    derivedKeypair = parseSolanaPrivateKey(process.env.SOLANA_PRIVATE_KEY ?? "");
  } catch {
    return {
      ok: false as const,
      error: "Could not derive Solana wallet from SOLANA_PRIVATE_KEY.",
      debug: buildSolanaAddressDebug(solanaSourceAddress),
    };
  }

  const normalizedRequestSolanaSourceAddress = String(solanaSourceAddress ?? "").trim();
  const normalizedDerivedSolanaAddress = derivedKeypair.publicKey.toBase58().trim();
  const normalizedEnvSolanaSourceAddress = String(process.env.SOLANA_SOURCE_ADDRESS ?? "").trim();
  const debug = buildSolanaAddressDebug(
    normalizedRequestSolanaSourceAddress,
    normalizedDerivedSolanaAddress,
    normalizedEnvSolanaSourceAddress,
  );

  if (
    normalizedEnvSolanaSourceAddress &&
    normalizedEnvSolanaSourceAddress !== normalizedDerivedSolanaAddress
  ) {
    return {
      ok: false as const,
      error: "SOLANA_SOURCE_ADDRESS does not match SOLANA_PRIVATE_KEY.",
      debug,
    };
  }

  try {
    const publicKey = new PublicKey(normalizedDerivedSolanaAddress);

    if (publicKey.toBase58().trim() !== normalizedDerivedSolanaAddress) {
      return { ok: false as const, error: "Could not derive Solana wallet from SOLANA_PRIVATE_KEY.", debug };
    }
  } catch {
    return { ok: false as const, error: "Could not derive Solana wallet from SOLANA_PRIVATE_KEY.", debug };
  }

  const injectiveRecipientAddress = body.injectiveRecipientAddress.trim();

  if (!/^inj/i.test(injectiveRecipientAddress)) {
    return { ok: false as const, error: "injectiveRecipientAddress must be a valid Injective Bech32 address." };
  }

  return {
    ok: true as const,
    amountUsdc,
    requestSolanaSourceAddress: normalizedRequestSolanaSourceAddress,
    serverSolanaSourceAddress: normalizedDerivedSolanaAddress,
    injectiveRecipientAddress,
    debug,
  };
}

function getFailedStage(error: unknown, fallbackStage: string) {
  if (error instanceof SolanaToInjectiveCctpExecutionError) {
    return error.stage;
  }

  return fallbackStage;
}

function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, currentValue) => (
    typeof currentValue === "bigint" ? currentValue.toString() : currentValue
  ))) as T;
}

function parseSolanaPrivateKey(value: string): Keypair {
  const trimmed = value.trim();

  if (trimmed.startsWith("[")) {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(trimmed)));
  }

  return Keypair.fromSecretKey(bs58Decode(trimmed));
}

function buildSolanaAddressDebug(
  requestSolanaSourceAddress: unknown,
  derivedSolanaAddressFromPrivateKey?: string,
  envSolanaSourceAddress?: string,
) {
  const requestAddress = String(requestSolanaSourceAddress ?? "").trim();
  const derivedAddress = String(derivedSolanaAddressFromPrivateKey ?? deriveDebugSolanaAddress()).trim();
  const envAddress = String(envSolanaSourceAddress ?? process.env.SOLANA_SOURCE_ADDRESS ?? "").trim();

  return {
    requestSolanaSourceAddress: requestAddress,
    serverSolanaSourceAddress: derivedAddress,
    envSolanaSourceAddress: envAddress,
    requestEqualsDerived: requestAddress === derivedAddress,
    envEqualsDerived: envAddress === derivedAddress,
    usedSolanaSourceAddress: derivedAddress,
    requestLength: requestAddress.length,
    serverLength: derivedAddress.length,
    envLength: envAddress.length,
  };
}

function deriveDebugSolanaAddress() {
  try {
    return parseSolanaPrivateKey(process.env.SOLANA_PRIVATE_KEY ?? "").publicKey.toBase58().trim();
  } catch {
    return "";
  }
}

function bs58Decode(encoded: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const BASE = BigInt(58);
  let num = BigInt(0);

  for (const char of encoded) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Non-base58 character: ${char}`);
    num = num * BASE + BigInt(index);
  }

  const bytes: number[] = [];
  while (num > BigInt(0)) {
    bytes.unshift(Number(num % BigInt(256)));
    num = num / BigInt(256);
  }

  for (const char of encoded) {
    if (char === "1") bytes.unshift(0);
    else break;
  }

  return new Uint8Array(bytes);
}
