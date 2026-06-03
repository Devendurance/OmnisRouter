import "server-only";

import { randomUUID } from "node:crypto";
import { createSupabaseServiceRoleClient } from "./supabase";
import type { WalletType } from "./wallet-auth";

type WalletAuthChallengeRow = {
  id: string;
  wallet_address: string;
  wallet_type: string;
  nonce: string;
  message: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

const CHALLENGE_TTL_SECONDS = 5 * 60;

function buildAuthMessage(walletAddress: string, walletType: WalletType, nonce: string) {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();

  return [
    "Sign in to OmnisRouter.",
    "",
    `Wallet: ${walletAddress}`,
    `Type: ${walletType}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expires At: ${expiresAt}`,
    "",
    "This signature only proves wallet ownership and does not authorize a transaction.",
  ].join("\n");
}

export async function createWalletAuthChallenge(walletAddress: string, walletType: WalletType) {
  const supabase = createSupabaseServiceRoleClient();
  const nonce = randomUUID();
  const message = buildAuthMessage(walletAddress, walletType, nonce);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();

  const { data, error } = await supabase
    .from("wallet_auth_challenges")
    .insert({
      expires_at: expiresAt,
      message,
      nonce,
      wallet_address: walletAddress,
      wallet_type: walletType,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to create wallet auth challenge: ${error.message}`);
  }

  return {
    challengeId: data.id,
    expiresAt,
    message,
    nonce,
  };
}

export async function getWalletAuthChallenge(challengeId: string): Promise<WalletAuthChallengeRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("wallet_auth_challenges")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load wallet auth challenge: ${error.message}`);
  }

  return data as WalletAuthChallengeRow | null;
}

export async function markChallengeConsumed(challengeId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("wallet_auth_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challengeId)
    .is("consumed_at", null);

  if (error) {
    throw new Error(`Unable to mark challenge consumed: ${error.message}`);
  }
}
