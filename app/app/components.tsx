"use client";

import Link from "next/link";
import { useProductState } from "./product-state";

const fallbackPayments = [
  { id: "PMT-1041", amount: "18 USDC", route: "Injective -> Solana", status: "Complete" },
  { id: "PMT-1040", amount: "72 USDC", route: "Solana -> Injective", status: "Approved" },
];

export function AppHero({ eyebrow, title, copy }: { eyebrow: string; title: React.ReactNode; copy: string }) {
  const { route, gasCredits, remainingGasCredits } = useProductState();

  return (
    <section className="hero-panel">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="hero-copy">{copy}</p>
      </div>
      <div className="signal-card" aria-label="Current route summary">
        <span>Route</span>
        <strong>{route.route ?? String(route.destinationChain)}</strong>
        <small>{route.reason}</small>
        {route.supported ? <small>{route.routeId} / {route.protocol}</small> : null}
        <small>{remainingGasCredits}/{gasCredits.monthlyLimit} gas credits available</small>
      </div>
    </section>
  );
}

export function Metric({ label, value, detail, badge }: { label: string; value: string; detail: string; badge?: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small>{badge ? <em className="balance-badge">{badge}</em> : null}</div>;
}

export function RecentPayments() {
  const { latestExecution } = useProductState();
  const payments = latestExecution
    ? [{ id: "SIM-LATEST", amount: latestExecution.receipt.amount, route: latestExecution.receipt.route, status: latestExecution.receipt.status }, ...fallbackPayments]
    : fallbackPayments;

  return (
    <div className="card">
      <p className="eyebrow">Recent payments</p>
      <div className="payments-list">
        {payments.map((payment) => (
          <Link className="payment-row" href="/app/receipt" key={payment.id}>
            <strong>{payment.amount}</strong>
            <span>{payment.route}</span>
            <small>{payment.id} / {payment.status}</small>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function DetailList({ entries, split = false }: { entries: [string, React.ReactNode][]; split?: boolean }) {
  return (
    <dl className={`details-list${split ? " split" : ""}`}>
      {entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

export function humanize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}
