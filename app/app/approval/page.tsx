"use client";

import Link from "next/link";
import { AppHero, DetailList } from "../components";
import { useProductState } from "../product-state";
import { shortenAddress } from "../../router-simulator";

export default function ApprovalPage() {
  const { intent, route, ruleResult, gas, rules, feeChoice, setFeeChoice } = useProductState();
  const paused = rules.emergencyPauseEnabled;
  const canApprove = route.supported && ruleResult.status !== "denied" && !paused;
  const statusText = paused ? "Agent spending is paused. Disable emergency pause to continue." : !route.supported || ruleResult.status === "denied" ? route.reason : ruleResult.status === "needs_approval" ? "Approval required" : "Ready for payment";

  return (
    <>
      <AppHero eyebrow="Approval required" title={<>Review before <em>execution.</em></>} copy="This card shows the payment summary and deterministic checks. Approval links to the mock execution timeline." />
      <section className="content-grid" aria-labelledby="approval-title">
        <div className="card approval-card">
          <p className="eyebrow">Approval card</p>
          <h2 id="approval-title">Payment approval</h2>
          <p className={`status-banner ${canApprove ? "success" : "error"}`}>{statusText}</p>
          <p className="status-banner warning">Crypto transfers are irreversible. Confirm this recipient is correct.</p>
          {gas.feeMode === "sponsored" ? <p className="status-banner success">Gas credit applied: {gas.uiText}</p> : <p className="status-banner warning">Gas credits exhausted</p>}
          {gas.feeMode === "user_choice_required" ? <div className="option-grid"><button className={`option-card${feeChoice === "deduct_from_transfer" ? " selected" : ""}`} onClick={() => setFeeChoice("deduct_from_transfer")} type="button">A. Deduct estimated fee from transfer amount</button><button className={`option-card${feeChoice === "top_up_fee" ? " selected" : ""}`} onClick={() => setFeeChoice("top_up_fee")} type="button">B. Top up fee so recipient receives exact amount</button></div> : null}
          <DetailList split entries={[["Amount", `${intent.amount.toFixed(2)} ${intent.asset}`], ["Full recipient", intent.recipientAddress || "No recipient detected"], ["Recipient preview", shortenAddress(intent.recipientAddress)], ["Detected destination chain", route.destinationChain], ["Source chain", route.sourceChain ?? "Unresolved"], ["Route id", route.routeId ?? "Unsupported"], ["Protocol", route.protocol ?? "None"], ["Destination mint mode", route.destinationMintMode ?? "None"], ["Gas mode", gas.feeMode], ["Estimated fee", `${gas.estimatedFee.toFixed(2)} USDC`], ["Rule result", <span className={ruleResult.status === "denied" ? "bad" : "good"} key="rule-result">{ruleResult.status}</span>], ["Approval reason", ruleResult.reasons.join(" ")]]} />
          <div className="recipient-verification">
            <p className="eyebrow">Recipient verification</p>
            <DetailList entries={[["Detected destination chain", route.destinationChain], ["Full recipient address", intent.recipientAddress || "No recipient detected"], ["Shortened recipient address", shortenAddress(intent.recipientAddress)]]} />
            <p className="status-banner warning">This address format is valid, but OmnisRouter cannot confirm this belongs to your intended recipient. Only continue if you trust this address.</p>
            <p className="verification-note">Crypto transfers are irreversible.</p>
          </div>
          <div className="button-row">{canApprove ? <Link className="primary-button" href="/app/payment">I confirm and approve transfer</Link> : <span className="danger-button">Approval blocked</span>}<Link className="secondary-button" href="/app/agent">Cancel</Link></div>
        </div>
      </section>
    </>
  );
}
