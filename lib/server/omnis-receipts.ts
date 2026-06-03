import "server-only";

import { createSupabaseServiceRoleClient } from "./supabase";

type JsonRecord = Record<string, unknown>;

type ReceiptInsert = {
  route: string;
  status: string;
  amount_usdc?: string | null;
  estimated_received_usdc?: string | null;
  cctp_fee_usdc?: string | null;
  source_chain?: string | null;
  destination_chain?: string | null;
  source_address?: string | null;
  destination_address?: string | null;
  solana_source_address?: string | null;
  solana_usdc_ata?: string | null;
  injective_recipient_address?: string | null;
  solana_recipient_address?: string | null;
  approval_tx?: string | null;
  burn_tx?: string | null;
  relay_tx?: string | null;
  receive_message_tx?: string | null;
  authorization_tx?: string | null;
  execution_mode?: string | null;
  owner_wallet_address?: string | null;
  owner_wallet_type?: string | null;
  relayer_address?: string | null;
  gas_sponsor?: string | null;
  raw_receipt?: JsonRecord;
};

export type OmnisReceiptRow = ReceiptInsert & {
  id: string;
  created_at: string;
};

type OmnisReceiptInput = {
  amountUsdc: string;
  approvalTxHash?: string | null;
  burnTxHash: string;
  destinationChain: string;
  estimatedRecipientAmountUsdc?: string | null;
  forwardingFeeUsdc?: string | null;
  injectiveRecipientAddress?: string | null;
  message?: string;
  ownerWalletAddress?: string | null;
  ownerWalletType?: string | null;
  rawReceipt?: JsonRecord;
  relayTxHash?: string | null;
  route: string;
  solanaRecipientWallet?: string | null;
  solanaSourceAddress?: string | null;
  solanaUsdcAta?: string | null;
  sourceChain: string;
  sourceEvmAddress?: string | null;
  status: string;
};

export async function insertOmnisReceipt(receipt: ReceiptInsert) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("omnis_receipts")
    .insert({
      gas_sponsor: "OmnisRouter",
      ...receipt,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to persist OmnisRouter receipt: ${error.message}`);
  }

  return typeof data?.id === "string" ? data.id : null;
}

export async function listOmnisReceipts() {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("omnis_receipts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Unable to load OmnisRouter receipts: ${error.message}`);
  }

  return (data ?? []) as OmnisReceiptRow[];
}

export async function listOmnisReceiptsByOwner(walletAddress: string, walletType: string) {
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("omnis_receipts")
    .select("*")
    .eq("owner_wallet_type", walletType)
    .ilike("owner_wallet_address", walletAddress)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Unable to load OmnisRouter receipts by owner: ${error.message}`);
  }

  return (data ?? []) as OmnisReceiptRow[];
}

export async function findOmnisReceiptByBurnTx(burnTxHash: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("omnis_receipts")
    .select("*")
    .eq("burn_tx", burnTxHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load OmnisRouter receipt by burn tx: ${error.message}`);
  }

  return data as OmnisReceiptRow | null;
}

export async function updateOmnisReceiptRelayCompleted(id: string, relayTxHash: string, rawReceipt: JsonRecord) {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("omnis_receipts")
    .update({
      raw_receipt: rawReceipt,
      receive_message_tx: relayTxHash,
      relay_tx: relayTxHash,
      status: "completed",
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Unable to update OmnisRouter receipt: ${error.message}`);
  }
}

export async function persistOmnisReceiptBestEffort(receipt: OmnisReceiptInput) {
  try {
    return await insertOmnisReceipt({
      amount_usdc: receipt.amountUsdc,
      approval_tx: receipt.approvalTxHash ?? null,
      burn_tx: receipt.burnTxHash,
      cctp_fee_usdc: receipt.forwardingFeeUsdc ?? null,
      destination_address: receipt.solanaRecipientWallet ?? receipt.injectiveRecipientAddress ?? null,
      destination_chain: receipt.destinationChain,
      estimated_received_usdc: receipt.estimatedRecipientAmountUsdc ?? null,
      execution_mode: receipt.ownerWalletType ? undefined : "server-funded-testnet-executor",
      injective_recipient_address: receipt.injectiveRecipientAddress ?? null,
      owner_wallet_address: receipt.ownerWalletAddress ?? null,
      owner_wallet_type: receipt.ownerWalletType ?? "executor-demo",
      raw_receipt: receipt.rawReceipt ?? withoutUndefined({
        amountUsdc: receipt.amountUsdc,
        approvalTxHash: receipt.approvalTxHash ?? null,
        burnTxHash: receipt.burnTxHash,
        destinationChain: receipt.destinationChain,
        estimatedRecipientAmountUsdc: receipt.estimatedRecipientAmountUsdc ?? null,
        forwardingFeeUsdc: receipt.forwardingFeeUsdc ?? null,
        injectiveRecipientAddress: receipt.injectiveRecipientAddress ?? null,
        message: receipt.message,
        relayTxHash: receipt.relayTxHash ?? null,
        route: receipt.route,
        solanaRecipientWallet: receipt.solanaRecipientWallet ?? null,
        solanaSourceAddress: receipt.solanaSourceAddress ?? null,
        solanaUsdcAta: receipt.solanaUsdcAta ?? null,
        sourceChain: receipt.sourceChain,
        sourceEvmAddress: receipt.sourceEvmAddress ?? null,
        status: receipt.status,
      }),
      receive_message_tx: receipt.relayTxHash ?? null,
      relay_tx: receipt.relayTxHash ?? null,
      route: receipt.route,
      solana_recipient_address: receipt.solanaRecipientWallet ?? null,
      solana_source_address: receipt.solanaSourceAddress ?? null,
      solana_usdc_ata: receipt.solanaUsdcAta ?? null,
      source_address: receipt.sourceEvmAddress ?? receipt.solanaSourceAddress ?? null,
      source_chain: receipt.sourceChain,
      status: receipt.status,
    });
  } catch (error) {
    console.error("OmnisRouter receipt persistence skipped:", error instanceof Error ? error.message : error);
    return null;
  }
}

export function withoutUndefined<T extends JsonRecord>(value: T): JsonRecord {
  return Object.fromEntries(
    Object.entries(value).filter(([, currentValue]) => currentValue !== undefined),
  );
}

type UserOwnedInjectiveToSolanaReceiptInput = {
  amountUsdc: string;
  approvalTxHash?: string | null;
  authorizationTxHash: string;
  burnTxHash: string;
  forwardingFeeUsdc?: string | null;
  relayerAddress: string;
  solanaRecipientAddress: string;
  solanaRecipientAta: string;
  sourceEvmAddress: string;
};

export async function persistUserOwnedForwardingReceiptBestEffort(receipt: UserOwnedInjectiveToSolanaReceiptInput) {
  try {
    return await insertOmnisReceipt({
      amount_usdc: receipt.amountUsdc,
      approval_tx: receipt.approvalTxHash ?? null,
      authorization_tx: receipt.authorizationTxHash,
      burn_tx: receipt.burnTxHash,
      cctp_fee_usdc: receipt.forwardingFeeUsdc ?? null,
      destination_address: receipt.solanaRecipientAddress,
      destination_chain: "Solana",
      execution_mode: "user-authorized-server-sponsored",
      owner_wallet_address: receipt.sourceEvmAddress,
      owner_wallet_type: "injective-evm",
      relayer_address: receipt.relayerAddress,
      route: "injective-to-solana",
      solana_recipient_address: receipt.solanaRecipientAddress,
      solana_usdc_ata: receipt.solanaRecipientAta,
      source_address: receipt.sourceEvmAddress,
      source_chain: "Injective EVM",
      status: "forwarding-submitted",
      raw_receipt: withoutUndefined({
        amountUsdc: receipt.amountUsdc,
        approvalTxHash: receipt.approvalTxHash ?? null,
        authorizationTxHash: receipt.authorizationTxHash,
        burnTxHash: receipt.burnTxHash,
        forwardingFeeUsdc: receipt.forwardingFeeUsdc ?? null,
        relayerAddress: receipt.relayerAddress,
        route: "injective-to-solana",
        solanaRecipientAddress: receipt.solanaRecipientAddress,
        solanaUsdcAta: receipt.solanaRecipientAta,
        sourceChain: "Injective EVM",
        sourceEvmAddress: receipt.sourceEvmAddress,
        status: "forwarding-submitted",
      }),
    });
  } catch (error) {
    console.error("OmnisRouter user-owned receipt persistence skipped:", error instanceof Error ? error.message : error);
    return null;
  }
}
