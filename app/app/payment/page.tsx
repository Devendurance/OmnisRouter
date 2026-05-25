"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AppHero, DetailList } from "../components";
import { useProductState } from "../product-state";

export default function PaymentPage() {
  const { latestExecution, route, ruleResult, gas, rules, feeChoice, paymentError, setFeeChoice, simulatePayment } = useProductState();
  const attempted = useRef(false);
  const blocked = rules.emergencyPauseEnabled || !route.supported || ruleResult.status === "denied";
  const requiresFeeChoice = gas.feeMode === "user_choice_required";

  useEffect(() => {
    if (!requiresFeeChoice && !blocked && !latestExecution && !attempted.current) {
      attempted.current = true;
      simulatePayment();
    }
  }, [blocked, latestExecution, requiresFeeChoice, simulatePayment]);

  return (
    <>
      <AppHero eyebrow="Payment timeline" title={<>Execution <em>simulator.</em></>} copy="The payment route is mocked end-to-end while preserving the latest execution and receipt in local storage." />
      <section className="content-grid" aria-labelledby="timeline-title">
        <div className="card">
          <p className="eyebrow">Mock timeline</p>
          <h2 id="timeline-title">Payment execution</h2>
          {rules.emergencyPauseEnabled ? <p className="status-banner error">Agent spending is paused. Disable emergency pause to continue.</p> : null}
          {!rules.emergencyPauseEnabled && blocked ? <p className="status-banner error">Payment denied</p> : null}
          {gas.feeMode === "sponsored" ? <p className="status-banner success">Gas credit applied: sponsored mode</p> : <p className="status-banner warning">Gas credits exhausted. Choose A/B fee handling.</p>}
          {requiresFeeChoice ? <div className="option-grid"><button className={`option-card${feeChoice === "deduct_from_transfer" ? " selected" : ""}`} onClick={() => setFeeChoice("deduct_from_transfer")} type="button">A. Deduct 0.03 USDC from transfer amount</button><button className={`option-card${feeChoice === "top_up_fee" ? " selected" : ""}`} onClick={() => setFeeChoice("top_up_fee")} type="button">B. Top up 0.03 USDC so recipient receives exact amount</button></div> : null}
          {paymentError ? <p className="status-banner error">{paymentError}</p> : null}
          {requiresFeeChoice && !latestExecution && !blocked ? <button className="primary-button flow-button" onClick={() => simulatePayment()} type="button">Continue with selected fee option</button> : null}
          {latestExecution ? <><p className="status-banner success">Payment simulated successfully</p><ol className="timeline-list">{latestExecution.timeline.map((status, index) => <li key={status}><span>{String(index + 1).padStart(2, "0")}</span>{status}</li>)}</ol><Link className="primary-button" href="/app/receipt">View receipt</Link></> : <DetailList entries={[["Status", blocked ? "Blocked" : "Preparing simulation"], ["Source chain", route.sourceChain ?? "Unresolved"], ["Destination chain", route.destinationChain], ["Route id", route.routeId ?? "Unsupported"], ["Protocol", route.protocol ?? "None"], ["Gas mode", gas.feeMode], ["Destination mint mode", route.destinationMintMode ?? "None"], ["Rule check", ruleResult.reasons.join(" ")]]} />}
        </div>
      </section>
    </>
  );
}
