"use client";

import { AppHero, DetailList, humanize } from "../components";
import { useProductState } from "../product-state";

export default function ReceiptPage() {
  const { latestExecution, balances } = useProductState();

  if (!latestExecution) {
    return (
      <>
        <AppHero eyebrow="Receipt" title={<>Mock payment <em>receipt.</em></>} copy="Run a simulated payment first, then the latest receipt is persisted locally here." />
        <section className="content-grid" aria-labelledby="receipt-title"><div className="card receipt-card"><p className="status-banner warning">No simulated payment receipt yet.</p></div></section>
      </>
    );
  }

  const entries = Object.entries(latestExecution.receipt).map(([key, value]) => [humanize(key), value] as [string, string]);

  return (
    <>
      <AppHero eyebrow="Receipt" title={<>Mock payment <em>receipt.</em></>} copy="Receipt data is generated from the latest persisted command, route check, gas state, and simulated execution." />
      <section className="content-grid" aria-labelledby="receipt-title">
        <div className="card receipt-card">
          <p className="eyebrow">Audit log</p>
          <h2 id="receipt-title">Payment receipt</h2>
          <DetailList split entries={[...entries, ["Current Solana USDC", balances.Solana.USDC.toFixed(2)], ["Current Injective USDC", balances.Injective.USDC.toFixed(2)]]} />
        </div>
      </section>
    </>
  );
}
