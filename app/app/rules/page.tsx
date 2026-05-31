"use client";

import { useState, type FormEvent } from "react";
import { AppHero } from "../components";
import { useProductState } from "../product-state";
import type { SpendingRules } from "../../router-simulator";

const chainOptions = ["Injective", "Solana"];

export default function RulesPage() {
  const { rules, saveRules } = useProductState();

  return (
    <>
      <AppHero eyebrow="Rules page" title={<>Deterministic spending <em>controls.</em></>} copy="These saved controls are persisted locally and used before approval and payment execution." />
      <section className="content-grid" aria-labelledby="rules-title">
        <RulesForm key={JSON.stringify(rules)} rules={rules} saveRules={saveRules} />
      </section>
    </>
  );
}

function RulesForm({ rules, saveRules }: { rules: SpendingRules; saveRules: (rules: SpendingRules) => void }) {
  const [draftRules, setDraftRules] = useState(rules);
  const [saved, setSaved] = useState(false);

  function submitRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveRules(draftRules);
    setSaved(true);
  }

  return (
    <div className="card">
          <p className="eyebrow">Rule set</p>
          <h2 id="rules-title">Spending controls</h2>
          {saved ? <p className="status-banner success">Rules saved</p> : null}
          <form onSubmit={submitRules}>
            <div className="form-grid">
              <label className="field-label">Max transfer amount<span><input min="0" type="number" value={draftRules.maxTransferAmount} onChange={(event) => setDraftRules((current) => ({ ...current, maxTransferAmount: Number(event.target.value) }))} />USDC</span></label>
              <label className="field-label">Daily transfer limit<span><input min="0" type="number" value={draftRules.dailyTransferLimit} onChange={(event) => setDraftRules((current) => ({ ...current, dailyTransferLimit: Number(event.target.value) }))} />USDC</span></label>
              <label className="field-label">Approval threshold<span><input min="0" type="number" value={draftRules.approvalThreshold} onChange={(event) => setDraftRules((current) => ({ ...current, approvalThreshold: Number(event.target.value) }))} />USDC</span></label>
              <label className="field-label">Gas credit limit<span><input min="0" type="number" value={draftRules.gasCreditLimit} onChange={(event) => setDraftRules((current) => ({ ...current, gasCreditLimit: Number(event.target.value) }))} />credits</span></label>
            </div>
            <div className="option-grid">
              {chainOptions.map((chain) => (
                <label className="toggle-row" key={chain}><input type="checkbox" checked={draftRules.allowedDestinationChains.includes(chain)} onChange={(event) => setDraftRules((current) => ({ ...current, allowedDestinationChains: event.target.checked ? [...current.allowedDestinationChains, chain] : current.allowedDestinationChains.filter((value) => value !== chain) }))} />Allow {chain}</label>
              ))}
              <label className="toggle-row"><input type="checkbox" checked={draftRules.emergencyPauseEnabled} onChange={(event) => setDraftRules((current) => ({ ...current, emergencyPauseEnabled: event.target.checked }))} />Emergency pause enabled</label>
            </div>
            <div className="button-row"><button className="primary-button" type="submit">Save rules</button></div>
          </form>
    </div>
  );
}
