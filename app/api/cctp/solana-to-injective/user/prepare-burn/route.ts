import { PublicKey } from "@solana/web3.js";
import { bech32 } from "bech32";
import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import { prepareUserAuthorizedSolanaToInjectiveBurn } from "../../../../../../lib/server/cctp/solana-to-injective-executor";

const USDC_DECIMALS = 6;

type PrepareBurnRequestBody = {
  amountUsdc?: unknown;
  sourceSolanaAddress?: unknown;
  injectiveRecipientAddress?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as PrepareBurnRequestBody;
    const validation = validateBody(body);

    if (!validation.ok) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    }

    const prepared = await prepareUserAuthorizedSolanaToInjectiveBurn(validation);

    return NextResponse.json({
      ok: true,
      route: "solana-to-injective",
      executionMode: "user-authorized-server-sponsored",
      serializedTransaction: prepared.serializedTransaction,
      sourceSolanaAddress: prepared.sourceSolanaAddress,
      sponsorFeePayer: prepared.sponsorFeePayer,
      eventRentPayer: prepared.eventRentPayer,
      messageSentEventData: prepared.messageSentEventData,
      userUsdcAta: prepared.userUsdcAta,
      amountUsdc: prepared.amountUsdc,
      injectiveRecipientAddress: prepared.injectiveRecipientAddress,
      requiredUserSignature: prepared.requiredUserSignature,
      gasPaidBy: "OmnisRouter",
      note: "User authorizes USDC burn. OmnisRouter pays Solana fees and Injective relay gas.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to prepare user-authorized Solana burn.",
    }, { status: 500 });
  }
}

function validateBody(body: PrepareBurnRequestBody) {
  if (typeof body.amountUsdc !== "string" || !body.amountUsdc.trim()) {
    return { ok: false as const, error: "amountUsdc is required." };
  }

  if (typeof body.sourceSolanaAddress !== "string" || !body.sourceSolanaAddress.trim()) {
    return { ok: false as const, error: "sourceSolanaAddress is required." };
  }

  if (typeof body.injectiveRecipientAddress !== "string" || !body.injectiveRecipientAddress.trim()) {
    return { ok: false as const, error: "injectiveRecipientAddress is required." };
  }

  const amountUsdc = body.amountUsdc.trim();

  if (!/^\d+(\.\d{1,6})?$/.test(amountUsdc) || parseUnits(amountUsdc, USDC_DECIMALS) <= BigInt(0)) {
    return { ok: false as const, error: "amountUsdc must be a positive USDC amount with up to 6 decimals." };
  }

  const sourceSolanaAddress = body.sourceSolanaAddress.trim();

  try {
    const publicKey = new PublicKey(sourceSolanaAddress);

    if (publicKey.toBase58() !== sourceSolanaAddress) {
      return { ok: false as const, error: "sourceSolanaAddress must be a valid Solana public key." };
    }
  } catch {
    return { ok: false as const, error: "sourceSolanaAddress must be a valid Solana public key." };
  }

  const injectiveRecipientAddress = body.injectiveRecipientAddress.trim();

  try {
    const decoded = bech32.decode(injectiveRecipientAddress);
    const accountData = bech32.fromWords(decoded.words);

    if (decoded.prefix !== "inj" || accountData.length !== 20) {
      return { ok: false as const, error: "injectiveRecipientAddress must be a valid Injective Bech32 address." };
    }
  } catch {
    return { ok: false as const, error: "injectiveRecipientAddress must be a valid Injective Bech32 address." };
  }

  return {
    ok: true as const,
    amountUsdc,
    sourceSolanaAddress,
    injectiveRecipientAddress,
  };
}
