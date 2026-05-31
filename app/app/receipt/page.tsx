"use client";

import { AppHero, DetailList } from "../components";
import { useProductState } from "../product-state";
import { injectiveTestnetTxUrl, shortenHash } from "../../../lib/explorers";
import type { ReactNode } from "react";
import type { CctpExecutionReceipt } from "../../router-simulator";

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

function isSolanaToInjective(receipt: CctpExecutionReceipt) {
  return receipt.sourceChain === "Solana" && receipt.destinationChain === "Injective";
}

function routeLabel(receipt: CctpExecutionReceipt) {
  return isSolanaToInjective(receipt) ? "Solana → Injective" : receipt.routeLabel;
}

function receiptStatus(receipt: CctpExecutionReceipt) {
  if (!isSolanaToInjective(receipt)) {
    return humanizeStatus(receipt.status);
  }

  if (receipt.status === "completed") {
    return "Completed";
  }

  if (receipt.relayTxHash) {
    return "Completed";
  }

  if (receipt.message.toLowerCase().includes("attestation")) {
    return "Attestation received";
  }

  if (receipt.burnTxHash) {
    return "Burn submitted";
  }

  return humanizeStatus(receipt.status);
}

function solanaSourceAddress(receipt: CctpExecutionReceipt) {
  return receipt.solanaSourceAddress || receipt.serverSolanaSourceAddress || receipt.usedSolanaSourceAddress || "";
}

function injectiveRecipientAddress(receipt: CctpExecutionReceipt) {
  return receipt.injectiveRecipientAddress || receipt.solanaRecipientWallet || "";
}

function hasValue(value: ReactNode) {
  return value !== null && value !== undefined && value !== "";
}

function visibleEntries(entries: [string, ReactNode][]) {
  return entries.filter(([, value]) => hasValue(value));
}

function realReceiptEntries(receipt: CctpExecutionReceipt): [string, ReactNode][] {
  if (isSolanaToInjective(receipt)) {
    return visibleEntries([
      ["Created", formatTime(receipt.createdAt)],
      ["Status", receiptStatus(receipt)],
      ["Requested amount", `${receipt.requestedAmount} ${receipt.asset}`],
      ["CCTP fee", `${receipt.forwardingFee || "0"} ${receipt.asset}`],
      ["Estimated received", `${receipt.estimatedRecipientAmount} ${receipt.asset}`],
      ["Gas sponsor", "OmnisRouter covered Solana burn + Injective relay gas"],
      ["Solana source address", solanaSourceAddress(receipt)],
      ["Solana USDC ATA", receipt.solanaUsdcAta],
      ["Injective recipient", injectiveRecipientAddress(receipt)],
      ["Burn tx", solanaDevnetTxLink(receipt.burnTxHash, "Pending")],
      ["Injective relay tx", injectiveTxLink(receipt.relayTxHash, "")],
    ]);
  }

  return visibleEntries([
    ["Created", formatTime(receipt.createdAt)],
    ["Status", humanizeStatus(receipt.status)],
    ["Requested amount", `${receipt.requestedAmount} ${receipt.asset}`],
    ["Forwarding fee", `${receipt.forwardingFee} ${receipt.asset}`],
    ["Estimated received", `${receipt.estimatedRecipientAmount} ${receipt.asset}`],
    ["Source gas sponsor", receipt.sourceGasSponsor],
    ["Source EVM address", receipt.sourceEvmAddress],
    ["Solana recipient", receipt.solanaRecipientWallet],
    ["Solana USDC ATA", receipt.solanaUsdcAta],
    ["Approval tx", injectiveTxLink(receipt.approvalTxHash, "Approval skipped")],
    ["Burn tx", injectiveTxLink(receipt.burnTxHash, "Pending")],
  ]);
}

function realReceiptNote(receipt: CctpExecutionReceipt) {
  if (!isSolanaToInjective(receipt)) {
    return "Solana mint is handled by Circle's Forwarding Service. OmnisRouter stores the Injective approval and burn transaction proof.";
  }

  if (!receipt.relayTxHash) {
    return "USDC was burned on Solana. OmnisRouter is waiting for Circle Iris attestation before submitting the Injective relay.";
  }

  return "USDC was burned on Solana, attested by Circle Iris, then manually relayed to Injective through receiveMessage. OmnisRouter stores the burn and relay proof.";
}

export default function ReceiptPage() {
  const { realCctpReceipts } = useProductState();

  return (
    <>
      <AppHero eyebrow="Receipt" title={<>Payment <em>receipts.</em></>} copy="CCTP execution receipts persisted locally." />

      <section className="content-grid" aria-labelledby="real-receipts-title">
        <div className="card receipt-card">
          <p className="eyebrow">Receipts</p>
          <h2 id="real-receipts-title">CCTP Receipts</h2>
          {realCctpReceipts.length === 0 ? (
            <p className="status-banner warning">No real receipts yet. Execute a testnet route to generate one.</p>
          ) : (
            <div className="dashboard-stack">
              {realCctpReceipts.map((receipt) => (
                <div className="card cctp-lab-card" key={receipt.id}>
                  <p className="eyebrow">{routeLabel(receipt)}</p>
                  <DetailList split entries={realReceiptEntries(receipt)} />
                  <p className="status-banner success">
                    {realReceiptNote(receipt)}
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
