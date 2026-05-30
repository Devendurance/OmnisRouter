"use client";

import { AppHero, DetailList, humanize } from "../components";
import { useProductState } from "../product-state";
import { injectiveTestnetTxUrl, shortenHash } from "../../../lib/explorers";

function txLink(hash: string | null, fallback: string) {
  if (!hash) {
    return fallback;
  }

  return (
    <a href={injectiveTestnetTxUrl(hash)} target="_blank" rel="noreferrer">
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

export default function ReceiptPage() {
  const { balances, latestExecution, realCctpReceipts } = useProductState();

  return (
    <>
      <AppHero eyebrow="Receipt" title={<>Payment <em>receipts.</em></>} copy="Simulated and real CCTP execution receipts persisted locally." />

      {!latestExecution && realCctpReceipts.length === 0 ? (
        <section className="content-grid" aria-labelledby="receipt-title">
          <div className="card receipt-card">
            <p className="status-banner warning">No payment receipts yet. Run a simulated payment or execute a real CCTP transfer first.</p>
          </div>
        </section>
      ) : null}

      {latestExecution ? (
        <section className="content-grid" aria-labelledby="receipt-title">
          <div className="card receipt-card">
            <p className="eyebrow">Audit log</p>
            <h2 id="receipt-title">Mock payment receipt</h2>
            <DetailList split entries={[
              ...Object.entries(latestExecution.receipt).map(([key, value]) => [humanize(key), value] as [string, string]),
              ["Current Solana USDC", balances.Solana.USDC.toFixed(2)],
              ["Current Injective USDC", balances.Injective.USDC.toFixed(2)],
            ]} />
          </div>
        </section>
      ) : null}

      <section className="content-grid" aria-labelledby="real-receipts-title">
        <div className="card receipt-card">
          <p className="eyebrow">Real receipts</p>
          <h2 id="real-receipts-title">Real CCTP Receipts</h2>
          {realCctpReceipts.length === 0 ? (
            <p className="status-banner warning">No real CCTP receipts yet.</p>
          ) : (
            <div className="dashboard-stack">
              {realCctpReceipts.map((receipt) => (
                <div className="card cctp-lab-card" key={receipt.id}>
                  <p className="eyebrow">{receipt.routeLabel}</p>
                  <DetailList split entries={[
                    ["Created", formatTime(receipt.createdAt)],
                    ["Status", humanizeStatus(receipt.status)],
                    ["Requested amount", `${receipt.requestedAmount} ${receipt.asset}`],
                    ["Forwarding fee", `${receipt.forwardingFee} ${receipt.asset}`],
                    ["Estimated received", `${receipt.estimatedRecipientAmount} ${receipt.asset}`],
                    ["Source gas sponsor", receipt.sourceGasSponsor],
                    ["Source EVM address", receipt.sourceEvmAddress],
                    ["Solana recipient", receipt.solanaRecipientWallet],
                    ["Solana USDC ATA", receipt.solanaUsdcAta],
                    ["Approval tx", txLink(receipt.approvalTxHash, "Approval skipped")],
                    ["Burn tx", txLink(receipt.burnTxHash, "Pending")],
                  ]} />
                  <p className="status-banner success">
                    Solana mint is handled by Circle&apos;s Forwarding Service. OmnisRouter stores the Injective approval and burn transaction proof.
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
