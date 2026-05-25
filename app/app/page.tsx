"use client";

import Link from "next/link";
import { AppHero, DetailList, Metric, RecentPayments } from "./components";
import { useProductState } from "./product-state";

export default function DashboardPage() {
  const { balances, rules, gasCredits, remainingGasCredits, ruleResult, resetMockState } = useProductState();
  const enabledBalances = Object.entries(balances).filter(([, balance]) => balance.enabled);

  return (
    <>
      <AppHero eyebrow="Mock AI stablecoin router" title={<>Plain-English USDC payments with <em>visible control.</em></>} copy="This dashboard uses saved local rules, deterministic checks, and simulated CCTP routing between Solana and Injective. No blockchain transactions are submitted." />
      <section className="content-grid two-col" aria-labelledby="dashboard-title">
        <div className="card primary-card">
          <p className="eyebrow">Dashboard</p>
          <h2 id="dashboard-title">Mock wallet state</h2>
          <div className="metric-row"><Metric label="Solana USDC" value={balances.Solana.USDC.toFixed(2)} detail="Enabled source" /><Metric label="Gas credits" value={`${remainingGasCredits}/${gasCredits.monthlyLimit}`} detail="Sponsored transfers" /></div>
          <DetailList entries={[["Mock balances", enabledBalances.map(([chain, balance]) => `${chain}: ${balance.USDC.toFixed(2)} USDC`).join(" / ")], ["Later EVM fields", `Base ${balances.Base.enabled ? "enabled" : "disabled"}, Arbitrum ${balances.Arbitrum.enabled ? "enabled" : "disabled"}`], ["Allowed destinations", rules.allowedDestinationChains.join(", ")], ["Approval threshold", `${rules.approvalThreshold} USDC`], ["Router state", rules.emergencyPauseEnabled ? "Emergency paused" : ruleResult.status === "denied" ? "Payment denied" : "Ready"]]} />
          <div className="button-row"><Link className="primary-button" href="/app/agent">Start mock payment</Link><Link className="secondary-button" href="/app/rules">Review rules</Link><button className="secondary-button" onClick={resetMockState} type="button">Reset mock state</button></div>
        </div>
        <RecentPayments />
      </section>
    </>
  );
}
