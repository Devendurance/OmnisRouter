"use client";

import Link from "next/link";
import { AppHero, DetailList } from "../components";
import { useProductState } from "../product-state";
import { shortenAddress } from "../../router-simulator";

export default function AgentPage() {
  const { command, intent, setCommand, route, ruleResult, gas } = useProductState();
  const canContinue = route.supported && ruleResult.status !== "denied";
  const validation = route.recipientValidation;

  return (
    <>
      <AppHero eyebrow="Agent command" title={<>Describe the <em>payment.</em></>} copy="The MVP parses plain-English commands into a persisted payment intent before checking routes, rules, gas credits, and approval." />
      <section className="content-grid two-col" aria-labelledby="agent-title">
        <div className="card">
          <p className="eyebrow">Payment intent</p>
          <h2 id="agent-title">Agent command</h2>
          <label className="command-label" htmlFor="payment-command">Payment command</label>
          <textarea id="payment-command" value={command} onChange={(event) => setCommand(event.target.value)} rows={5} />
          {validation.isValid ? <p className="status-banner success">Valid recipient address · Detected chain type: {validation.chainType} · {shortenAddress(validation.normalizedAddress)}</p> : <p className="status-banner warning">Invalid address warning: {validation.error}</p>}
          {validation.warning ? <p className="status-banner warning">{validation.warning}</p> : null}
          {canContinue ? <Link className="primary-button" href="/app/approval">Review approval</Link> : <p className="status-banner error">{route.reason}</p>}
        </div>
        <div className="card parsed-card">
          <p className="eyebrow">Parsed intent</p>
          <DetailList entries={[["Amount", intent.amount.toFixed(2)], ["Asset", intent.asset], ["Full recipient", intent.recipientAddress || "No recipient detected"], ["Recipient preview", shortenAddress(intent.recipientAddress)], ["Address valid", validation.isValid ? "Yes" : "No"], ["Detected chain type", validation.chainType], ["Detected destination", route.destinationChain], ["Source chain", route.sourceChain ?? intent.optionalSourceChain ?? "Auto-select"], ["Route id", route.routeId ?? "Unsupported"], ["Protocol", route.protocol ?? "None"], ["Destination mint mode", route.destinationMintMode ?? "None"], ["Route", route.reason], ["Rules", ruleResult.status], ["Gas", gas.uiText]]} />
        </div>
      </section>
    </>
  );
}
