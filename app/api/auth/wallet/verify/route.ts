import { NextResponse } from "next/server";
import { getAddress, recoverMessageAddress, type Hex } from "viem";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import {
  createSessionPayload,
  createWalletSessionCookie,
  type WalletType,
} from "../../../../../lib/server/wallet-auth";
import {
  getWalletAuthChallenge,
  markChallengeConsumed,
} from "../../../../../lib/server/wallet-auth-challenge";

type VerifyRequestBody = {
  walletAddress?: unknown;
  walletType?: unknown;
  challengeId?: unknown;
  signature?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as VerifyRequestBody;

    if (typeof body.walletAddress !== "string" || !body.walletAddress.trim()) {
      return NextResponse.json({ ok: false, error: "walletAddress is required." }, { status: 400 });
    }

    if (typeof body.walletType !== "string") {
      return NextResponse.json({ ok: false, error: "walletType is required." }, { status: 400 });
    }

    if (typeof body.challengeId !== "string" || !body.challengeId.trim()) {
      return NextResponse.json({ ok: false, error: "challengeId is required." }, { status: 400 });
    }

    if (typeof body.signature !== "string" || !body.signature.trim()) {
      return NextResponse.json({ ok: false, error: "signature is required." }, { status: 400 });
    }

    const walletAddress = body.walletAddress.trim();
    const walletType = body.walletType as WalletType;
    const challengeId = body.challengeId.trim();
    const signature = body.signature.trim();
    const challenge = await getWalletAuthChallenge(challengeId);

    if (!challenge) {
      return NextResponse.json({ ok: false, error: "Challenge not found." }, { status: 404 });
    }

    const now = new Date();

    if (new Date(challenge.expires_at) < now) {
      return NextResponse.json({ ok: false, error: "Challenge has expired." }, { status: 400 });
    }

    if (challenge.consumed_at) {
      return NextResponse.json({ ok: false, error: "Challenge has already been used." }, { status: 400 });
    }

    if (challenge.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "walletAddress does not match challenge." }, { status: 400 });
    }

    if (challenge.wallet_type !== walletType) {
      return NextResponse.json({ ok: false, error: "walletType does not match challenge." }, { status: 400 });
    }

    let verified = false;

    switch (walletType) {
      case "injective-evm": {
        try {
          const recovered = await recoverMessageAddress({
            message: challenge.message,
            signature: signature as Hex,
          });

          verified = getAddress(recovered) === getAddress(walletAddress);
        } catch {
          verified = false;
        }

        break;
      }

      case "solana": {
        try {
          const publicKey = new PublicKey(walletAddress);
          const messageBytes = new TextEncoder().encode(challenge.message);
          const signatureBytes = hexToUint8Array(signature);

          if (signatureBytes.length !== 64) return NextResponse.json({ ok: false, error: "Solana signature must be 64 bytes." }, { status: 400 });

          verified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey.toBytes());
        } catch {
          verified = false;
        }

        break;
      }

      case "native-injective":
      default:
        return NextResponse.json({ ok: false, error: "Native Injective wallet verification is not supported yet." }, { status: 400 });
    }

    if (!verified) {
      return NextResponse.json({ ok: false, error: "Signature verification failed." }, { status: 400 });
    }

    await markChallengeConsumed(challengeId);

    const sessionPayload = createSessionPayload(walletAddress, walletType);

    await createWalletSessionCookie(sessionPayload);

    return NextResponse.json({
      ok: true,
      walletAddress: sessionPayload.walletAddress,
      walletType: sessionPayload.walletType,
      message: "Wallet authenticated successfully.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to verify wallet signature.",
    }, { status: 500 });
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const normalized = hex.replace(/^0x/i, "");
  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}
