import { NextResponse } from "next/server";
import { createWalletAuthChallenge } from "../../../../../lib/server/wallet-auth-challenge";
import type { WalletType } from "../../../../../lib/server/wallet-auth";

const VALID_WALLET_TYPES: WalletType[] = ["solana", "injective-evm", "native-injective"];

type ChallengeRequestBody = {
  walletAddress?: unknown;
  walletType?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as ChallengeRequestBody;

    if (typeof body.walletAddress !== "string" || !body.walletAddress.trim()) {
      return NextResponse.json({ ok: false, error: "walletAddress is required." }, { status: 400 });
    }

    if (typeof body.walletType !== "string" || !VALID_WALLET_TYPES.includes(body.walletType as WalletType)) {
      return NextResponse.json({ ok: false, error: "walletType must be solana, injective-evm, or native-injective." }, { status: 400 });
    }

    const walletAddress = body.walletAddress.trim();
    const walletType = body.walletType as WalletType;

    if (walletType === "native-injective") {
      return NextResponse.json({
        ok: false,
        error: "Native Injective wallet sign-in is not available yet. Use Injective EVM wallet mode for private receipts.",
      }, { status: 400 });
    }

    const challenge = await createWalletAuthChallenge(walletAddress, walletType);

    return NextResponse.json({
      ok: true,
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt,
      message: challenge.message,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to create wallet auth challenge.",
    }, { status: 500 });
  }
}
