import { AppHero, DetailList } from "../components";
import { injectiveTestnetTxUrl, shortenHash } from "../../../lib/explorers";
import { listOmnisReceipts, type OmnisReceiptRow } from "../../../lib/server/omnis-receipts";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

function injectiveTxLink(hash: string | null | undefined, fallback: string) {
  if (!hash) {
    return fallback;
  }

  return (
    <a href={injectiveTestnetTxUrl(hash)} target="_blank" rel="noreferrer">
      {shortenHash(hash)}
    </a>
  );
}

function solanaDevnetTxLink(hash: string | null | undefined, fallback: string) {
  if (!hash) {
    return fallback;
  }

  return (
    <a href={`https://explorer.solana.com/tx/${hash}?cluster=devnet`} target="_blank" rel="noreferrer">
      {shortenHash(hash)}
    </a>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function humanizeStatus(status: string): string {
  if (status === "forwarding-submitted") {
    return "Forwarding submitted";
  }

  return status.replace(/-/g, " ");
}

function isUserOwnedInjectiveToSolana(receipt: OmnisReceiptRow) {
  return receipt.route === "injective-to-solana" && receipt.execution_mode === "user-authorized-server-sponsored";
}

function isSolanaToInjective(receipt: OmnisReceiptRow) {
  return receipt.route === "solana-to-injective";
}

function routeLabel(receipt: OmnisReceiptRow) {
  if (isSolanaToInjective(receipt)) return "Solana -> Injective";
  if (isUserOwnedInjectiveToSolana(receipt)) return "Injective -> Solana (User-owned)";
  return "Injective -> Solana";
}

function hasValue(value: ReactNode) {
  return value !== null && value !== undefined && value !== "";
}

function visibleEntries(entries: [string, ReactNode][]) {
  return entries.filter(([, value]) => hasValue(value));
}

function amount(value: string | number | null | undefined, fallback = "0") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function receiptEntries(receipt: OmnisReceiptRow): [string, ReactNode][] {
  if (isUserOwnedInjectiveToSolana(receipt)) {
    return visibleEntries([
      ["Created", formatTime(receipt.created_at)],
      ["Status", humanizeStatus(receipt.status)],
      ["Execution mode", "User-authorized, OmnisRouter-sponsored"],
      ["Requested amount", `${amount(receipt.amount_usdc)} USDC`],
      ["CCTP fee", `${amount(receipt.cctp_fee_usdc)} USDC`],
      ["Estimated received", `${amount(receipt.estimated_received_usdc)} USDC`],
      ["Gas sponsor", receipt.gas_sponsor ?? "OmnisRouter"],
      ["User EVM source address", receipt.source_address],
      ["OmnisRouter relayer/sponsor", receipt.relayer_address],
      ["Solana recipient", receipt.solana_recipient_address ?? receipt.destination_address],
      ["Solana ATA", receipt.solana_usdc_ata],
      ["Authorization Tx", injectiveTxLink(receipt.authorization_tx, "Pending")],
      ["Approval Tx", injectiveTxLink(receipt.approval_tx, "Not needed")],
      ["Burn Tx", injectiveTxLink(receipt.burn_tx, "Pending")],
    ]);
  }

  if (isSolanaToInjective(receipt)) {
    return visibleEntries([
      ["Created", formatTime(receipt.created_at)],
      ["Status", humanizeStatus(receipt.status)],
      ["Requested amount", `${amount(receipt.amount_usdc)} USDC`],
      ["CCTP fee", `${amount(receipt.cctp_fee_usdc)} USDC`],
      ["Estimated received", `${amount(receipt.estimated_received_usdc)} USDC`],
      ["Gas sponsor", receipt.gas_sponsor ?? "OmnisRouter"],
      ["Solana Source Address", receipt.solana_source_address],
      ["Solana USDC ATA", receipt.solana_usdc_ata],
      ["Injective Recipient", receipt.injective_recipient_address],
      ["Burn Tx", solanaDevnetTxLink(receipt.burn_tx, "Pending")],
      ["Relay Tx / ReceiveMessage Tx", injectiveTxLink(receipt.receive_message_tx ?? receipt.relay_tx, "")],
    ]);
  }

  return visibleEntries([
    ["Created", formatTime(receipt.created_at)],
    ["Status", humanizeStatus(receipt.status)],
    ["Requested amount", `${amount(receipt.amount_usdc)} USDC`],
    ["Forwarding fee", `${amount(receipt.cctp_fee_usdc)} USDC`],
    ["Estimated received", `${amount(receipt.estimated_received_usdc)} USDC`],
    ["Gas sponsor", receipt.gas_sponsor ?? "OmnisRouter"],
    ["Source EVM Address", receipt.source_address],
    ["Solana Recipient", receipt.solana_recipient_address ?? receipt.destination_address],
    ["Approval Tx", injectiveTxLink(receipt.approval_tx, "Approval skipped")],
    ["Forwarding/Burn Tx", injectiveTxLink(receipt.burn_tx, "Pending")],
  ]);
}

function receiptNote(receipt: OmnisReceiptRow) {
  if (isUserOwnedInjectiveToSolana(receipt)) {
    return "User authorized USDC movement with EIP-3009. OmnisRouter paid Injective gas and forwarded through Circle CCTP. Solana mint is handled by Circle's Forwarding Service.";
  }

  if (!isSolanaToInjective(receipt)) {
    return "Solana mint is handled by Circle's Forwarding Service. OmnisRouter stores the Injective approval and burn transaction proof.";
  }

  return "USDC was burned on Solana, attested by Circle Iris, then manually relayed to Injective through receiveMessage. OmnisRouter stores the burn and relay proof.";
}

async function loadReceipts() {
  try {
    return await listOmnisReceipts();
  } catch (error) {
    console.error("OmnisRouter receipt page could not load Supabase receipts:", error instanceof Error ? error.message : error);
    return [];
  }
}

export default async function ReceiptPage() {
  const receipts = await loadReceipts();

  return (
    <>
      <AppHero eyebrow="Receipt" title={<>Payment <em>receipts.</em></>} copy="CCTP execution receipts persisted in Supabase." />

      <section className="content-grid" aria-labelledby="real-receipts-title">
        <div className="card receipt-card">
          <p className="eyebrow">Receipts</p>
          <h2 id="real-receipts-title">CCTP Receipts</h2>
          {receipts.length === 0 ? (
            <p className="status-banner warning">No real receipts yet. Execute a testnet route to generate one.</p>
          ) : (
            <div className="dashboard-stack">
              {receipts.map((receipt) => (
                <div className="card cctp-lab-card" key={receipt.id}>
                  <p className="eyebrow">{routeLabel(receipt)}</p>
                  <DetailList split entries={receiptEntries(receipt)} />
                  <p className="status-banner success">
                    {receiptNote(receipt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
