import { Keypair } from "@solana/web3.js";
import { NextResponse } from "next/server";

type PreflightRequestBody = {
  amountUsdc?: unknown;
  solanaSourceAddress?: unknown;
  injectiveRecipientAddress?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as PreflightRequestBody;
    const validation = validateBody(body);

    if (!validation.ok) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      route: "Solana -> Injective",
      serverSolanaSourceAddress: deriveServerSolanaSourceAddress(),
      sourceChain: "Solana devnet",
      destinationChain: "Injective testnet",
      executionMode: "manual-relay",
      phases: [
        "Solana USDC burn",
        "Circle Iris attestation",
        "Injective receiveMessage relay",
        "Receipt",
      ],
      message: "Solana to Injective route is available as a staged CCTP V2 manual relay.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to validate Solana to Injective CCTP preflight.",
    }, { status: 500 });
  }
}

function validateBody(body: PreflightRequestBody) {
  if (typeof body.amountUsdc !== "string" || !body.amountUsdc.trim()) {
    return { ok: false as const, error: "amountUsdc is required." };
  }

  if (typeof body.injectiveRecipientAddress !== "string" || !body.injectiveRecipientAddress.trim()) {
    return { ok: false as const, error: "injectiveRecipientAddress is required." };
  }

  const amountUsdc = body.amountUsdc.trim();

  if (!/^\d+(\.\d{1,6})?$/.test(amountUsdc)) {
    return { ok: false as const, error: "amountUsdc must be a positive USDC amount with up to 6 decimals." };
  }

  if (Number(amountUsdc) <= 0) {
    return { ok: false as const, error: "amountUsdc must be greater than 0." };
  }

  const injectiveRecipientAddress = body.injectiveRecipientAddress.trim();

  if (!/^inj/i.test(injectiveRecipientAddress)) {
    return { ok: false as const, error: "injectiveRecipientAddress must be a valid Injective Bech32 address." };
  }

  return { ok: true as const, amountUsdc, injectiveRecipientAddress };
}

function deriveServerSolanaSourceAddress() {
  try {
    return parseSolanaPrivateKey(process.env.SOLANA_PRIVATE_KEY ?? "").publicKey.toBase58().trim();
  } catch {
    return "";
  }
}

function parseSolanaPrivateKey(value: string): Keypair {
  const trimmed = value.trim();

  if (trimmed.startsWith("[")) {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(trimmed)));
  }

  return Keypair.fromSecretKey(bs58Decode(trimmed));
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
