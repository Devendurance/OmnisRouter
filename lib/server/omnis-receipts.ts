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
      injective_recipient_address: receipt.injectiveRecipientAddress ?? null,
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
