"use client";

import Link from "next/link";
import { AppHero, DetailList } from "../components";
import { useProductState } from "../product-state";

export default function PaymentPage() {
  const { realCctpReceipts } = useProductState();
  const latestReceipt = realCctpReceipts[0];

  return (
    <>
      <AppHero eyebrow="Payment timeline" title={<>Execution <em>status.</em></>} copy="View the latest persisted testnet route execution status." />
      <section className="content-grid" aria-labelledby="timeline-title">
        <div className="card">
          <p className="eyebrow">Execution status</p>
          <h2 id="timeline-title">Payment execution</h2>
          {latestReceipt ? (
            <>
              <p className="status-banner success">Latest testnet receipt found</p>
              <DetailList entries={[
                ["Status", latestReceipt.status],
                ["Source chain", latestReceipt.sourceChain],
                ["Destination chain", latestReceipt.destinationChain],
                ["Route", latestReceipt.routeLabel],
                ["Requested amount", `${latestReceipt.requestedAmount} ${latestReceipt.asset}`],
                ["Estimated received", `${latestReceipt.estimatedRecipientAmount} ${latestReceipt.asset}`],
              ]} />
              <Link className="primary-button" href="/app/receipt">View receipt</Link>
            </>
          ) : (
            <p className="status-banner warning">No real testnet payment has been executed yet.</p>
          )}
        </div>
      </section>
    </>
  );
}
