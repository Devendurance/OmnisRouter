import "server-only";

import { createHmac } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "omnis_wallet_session";
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

export type WalletType = "solana" | "injective-evm" | "native-injective";

export type WalletSessionPayload = {
  walletAddress: string;
  walletType: WalletType;
  issuedAt: number;
  expiresAt: number;
};

function getSessionSecret(): string {
  const secret = process.env.WALLET_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error("Missing required environment variable: WALLET_SESSION_SECRET.");
  }

  return secret;
}

function sign(payload: string): string {
  const secret = getSessionSecret();
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function encodeToken(payload: WalletSessionPayload): string {
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json).toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

function decodeToken(token: string): WalletSessionPayload | null {
  const index = token.lastIndexOf(".");

  if (index === -1) return null;

  const encoded = token.slice(0, index);
  const signature = token.slice(index + 1);

  if (sign(encoded) !== signature) return null;

  let payload: unknown;

  try {
    const json = Buffer.from(encoded, "base64url").toString("utf-8");
    payload = JSON.parse(json);
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;

  if (typeof record.walletAddress !== "string" || !record.walletAddress) return null;
  if (typeof record.walletType !== "string") return null;

  const walletTypes = ["solana", "injective-evm", "native-injective"];

  if (!walletTypes.includes(record.walletType)) return null;

  if (typeof record.issuedAt !== "number" || typeof record.expiresAt !== "number") return null;

  return {
    walletAddress: record.walletAddress,
    walletType: record.walletType as WalletType,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
  };
}

export async function createWalletSessionCookie(payload: WalletSessionPayload) {
  const token = encodeToken(payload);
  const store = await cookies();

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearWalletSessionCookie() {
  const store = await cookies();

  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export async function readWalletSession(): Promise<WalletSessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  const payload = decodeToken(token);

  if (!payload) return null;

  if (Date.now() > payload.expiresAt * 1000) return null;

  return payload;
}

export function createSessionPayload(walletAddress: string, walletType: WalletType): WalletSessionPayload {
  const now = Math.floor(Date.now() / 1000);

  return {
    walletAddress,
    walletType,
    issuedAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS,
  };
}
