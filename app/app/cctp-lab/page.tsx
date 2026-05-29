"use client";

import { useState, type FormEvent } from "react";
import { DetailList } from "../components";
import { useProductState } from "../product-state";
import { injectiveTestnetTxUrl, shortenHash } from "../../../lib/explorers";

type ApiState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

type PreflightResponse = {
  ok: boolean;
  error?: string;
  preflight?: Record<string, unknown>;
};

type ExecuteResponse = {
  ok: boolean;
  error?: string;
  approvalTxHash?: string | null;
  burnTxHash?: string;
  requestedAmount?: { usdc?: string; baseUnits?: string };
  forwardingMaxFee?: { usdc?: string; baseUnits?: string };
  estimatedRecipientAmount?: { usdc?: string; baseUnits?: string };
  message?: string;
};

type TransferInputs = {
  amountUsdc: string;
  solanaRecipientAddress: string;
};

export default function CctpLabPage() {
  const { gasCredits, remainingGasCredits, recordRealSponsoredExecution } = useProductState();
  const [amountUsdc, setAmountUsdc] = useState("1.00");
  const [solanaRecipientAddress, setSolanaRecipientAddress] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [preflightState, setPreflightState] = useState<ApiState<Record<string, unknown>>>({ status: "idle" });
  const [executionState, setExecutionState] = useState<ApiState<ExecuteResponse>>({ status: "idle" });
  const [preflightInputs, setPreflightInputs] = useState<TransferInputs | null>(null);
  const currentInputs = { amountUsdc, solanaRecipientAddress };
  const preflightReady = preflightState.status === "success" && inputsMatch(preflightInputs, currentInputs);
  const creditsAvailable = remainingGasCredits > 0;
  const canExecute = preflightReady && confirmed && creditsAvailable && executionState.status !== "loading" && executionState.status !== "success";

  function updateAmountUsdc(value: string) {
    setAmountUsdc(value);
    invalidatePreflight();
  }

  function updateSolanaRecipientAddress(value: string) {
    setSolanaRecipientAddress(value);
    invalidatePreflight();
  }

  function invalidatePreflight() {
    setConfirmed(false);
    setPreflightInputs(null);
    setPreflightState({ status: "idle" });
    setExecutionState({ status: "idle" });
  }

  async function runPreflight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmed(false);
    setExecutionState({ status: "idle" });
    setPreflightState({ status: "loading" });
    const requestInputs = { amountUsdc, solanaRecipientAddress };

    try {
      const response = await fetch("/api/cctp/injective-to-solana/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsdc, solanaRecipientAddress }),
      });
      const payload = await response.json() as PreflightResponse;

      if (!response.ok || !payload.ok || !payload.preflight) {
        throw new Error(payload.error || "Unable to run CCTP preflight.");
      }

      setPreflightInputs(requestInputs);
      setPreflightState({ status: "success", data: payload.preflight });
    } catch (error) {
      setPreflightState({ status: "error", error: error instanceof Error ? error.message : "Unable to run CCTP preflight." });
    }
  }

  async function executeTransfer() {
    if (!canExecute) {
      return;
    }

    setExecutionState({ status: "loading" });

    try {
      const response = await fetch("/api/cctp/injective-to-solana/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsdc,
          solanaRecipientAddress,
          confirmExecution: "EXECUTE_TESTNET_CCTP",
        }),
      });
      const payload = await response.json() as ExecuteResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to execute CCTP transfer.");
      }

      setExecutionState({ status: "success", data: payload });
      recordRealSponsoredExecution();
    } catch (error) {
      setExecutionState({ status: "error", error: error instanceof Error ? error.message : "Unable to execute CCTP transfer." });
    }
  }

  return (
    <>
      <CctpHero />
      <section className="content-grid two-col" aria-labelledby="cctp-lab-title">
        <div className="card primary-card cctp-lab-card">
          <p className="eyebrow">Forwarding service route</p>
          <h2 id="cctp-lab-title">Real CCTP Testnet Route</h2>
          <p className="status-banner warning">Injective testnet USDC -&gt; Solana devnet USDC</p>
          <p className="status-banner warning">This uses a demo-funded testnet executor wallet. Production should use user wallet signing, auth, and rate limits.</p>
          <p className="status-banner success">Sponsored transfers today: {remainingGasCredits} / {gasCredits.dailyLimit} remaining</p>
          <p className="status-banner warning">OmnisRouter sponsors source-chain gas for your first 5 real testnet transfers each day.</p>
          <p className="status-banner warning">Circle forwarding fees may still reduce the amount received.</p>
          {!creditsAvailable ? <p className="status-banner error">You've used your 5 sponsored transfers today.</p> : null}

          <div className="option-grid" aria-label="Fee mode">
            <div className="option-card selected">A. Send net amount: recipient receives amount after route fees.</div>
            <div className="option-card">B. Exact receive mode: top up slightly so recipient receives the exact amount.</div>
          </div>

          <form onSubmit={runPreflight}>
            <div className="form-grid">
              <label className="field-label">
                Amount USDC
                <span><input min="0" step="0.000001" value={amountUsdc} onChange={(event) => updateAmountUsdc(event.target.value)} type="number" />USDC</span>
              </label>
              <label className="field-label">
                Solana recipient address
                <input value={solanaRecipientAddress} onChange={(event) => updateSolanaRecipientAddress(event.target.value)} placeholder="Solana devnet wallet address" type="text" />
              </label>
            </div>
            <div className="button-row cctp-action-row">
              <button className="primary-button" disabled={preflightState.status === "loading"} type="submit">{preflightState.status === "loading" ? "Running preflight..." : "Run Preflight"}</button>
            </div>
          </form>

          {preflightState.status === "error" ? <p className="status-banner error">{preflightState.error}</p> : null}
          {preflightState.status === "success" ? <PreflightPanel creditsRemaining={remainingGasCredits} preflight={preflightState.data} /> : null}
        </div>

        <div className="dashboard-stack">
          <div className="card cctp-lab-card">
            <p className="eyebrow">Execution control</p>
            <h2>Testnet execution</h2>
            <label className="toggle-row cctp-confirm-row"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />I understand this will execute a real testnet CCTP transfer.</label>
            <div className="button-row cctp-action-row">
              <button className="primary-button" disabled={!canExecute} onClick={executeTransfer} type="button">{executionState.status === "loading" ? "Executing..." : executionState.status === "success" ? "Testnet Transfer Executed" : "Execute Testnet Transfer"}</button>
            </div>
            {!preflightReady ? <p className="status-banner warning">Run preflight before execution.</p> : null}
            {executionState.status === "error" ? <p className="status-banner error">{executionState.error}</p> : null}
            {executionState.status === "success" ? <ExecutionPanel result={executionState.data} /> : null}
          </div>

          <div className="card cctp-lab-card">
            <p className="eyebrow">Scope guard</p>
            <DetailList entries={[
              ["Mode", "Real testnet CCTP only"],
              ["Source", "Injective testnet executor wallet"],
              ["Destination", "Solana devnet recipient ATA"],
              ["Mock flow", "Unchanged and still separate"],
            ]} />
          </div>
        </div>
      </section>
    </>
  );
}

function inputsMatch(preflightInputs: TransferInputs | null, currentInputs: TransferInputs) {
  return preflightInputs?.amountUsdc === currentInputs.amountUsdc && preflightInputs.solanaRecipientAddress === currentInputs.solanaRecipientAddress;
}

function CctpHero() {
  return (
    <section className="hero-panel cctp-hero-panel">
      <div>
        <p className="eyebrow">CCTP lab</p>
        <h1>Real CCTP <em>Testnet Route.</em></h1>
        <p className="hero-copy">A server-side hackathon lab for the real Injective testnet to Solana devnet forwarding flow. The mock agent remains separate.</p>
      </div>
      <div className="signal-card" aria-label="CCTP route summary">
        <span>Route</span>
        <strong>Injective -&gt; Solana</strong>
        <small>Circle CCTP V2 forwarding service</small>
        <small>Real testnet transfer, server-side guarded</small>
      </div>
    </section>
  );
}

function PreflightPanel({ creditsRemaining, preflight }: { creditsRemaining: number; preflight: Record<string, unknown> }) {
  return (
    <div className="cctp-result-panel">
      <p className="status-banner success">Preflight complete</p>
      <DetailList split entries={[
        ["Source chain", text(preflight.sourceChain)],
        ["Destination chain", text(preflight.destinationChain)],
        ["Source EVM address", text(preflight.sourceEvmAddress)],
        ["Source USDC balance", amount(preflight.sourceUsdcBalance)],
        ["Requested amount", amount(preflight.requestedAmount)],
        ["Approval needed", text(preflight.approvalNeeded)],
        ["Native INJ gas balance", gas(preflight.nativeInjGasBalance)],
        ["Solana recipient wallet", text(preflight.solanaRecipientWallet)],
        ["Solana USDC ATA", text(preflight.solanaUsdcAta)],
      ]} />
      <Warnings value={preflight.warnings} />
      <CostBreakdown
        forwardingMaxFee={preflight.forwardingMaxFee}
        estimatedRecipientAmount={preflight.estimatedRecipientAmount}
        creditsRemaining={creditsRemaining}
      />
    </div>
  );
}

function ExecutionPanel({ result }: { result: ExecuteResponse }) {
  return (
    <div className="cctp-result-panel">
      <p className="status-banner success">Execution submitted</p>
      <DetailList entries={[
        ["Approval tx", txLink(result.approvalTxHash, "Approval skipped")],
        ["Burn tx", txLink(result.burnTxHash, "Pending")],
        ["Forwarding service", result.message ?? "Circle Forwarding Service handles Solana minting."],
      ]} />
      <CostBreakdown
        forwardingMaxFee={result.forwardingMaxFee}
        estimatedRecipientAmount={result.estimatedRecipientAmount}
        creditsRemaining={0}
      />
    </div>
  );
}

function Warnings({ value }: { value: unknown }) {
  const warnings = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];

  if (warnings.length === 0) {
    return null;
  }

  return <div className="cctp-warning-list">{warnings.map((warning) => <p className="status-banner warning" key={warning}>{warning}</p>)}</div>;
}

function amount(value: unknown) {
  if (!value || typeof value !== "object") {
    return "Unavailable";
  }

  const record = value as Record<string, unknown>;
  const usdc = typeof record.usdc === "string" ? record.usdc : undefined;
  const baseUnits = typeof record.baseUnits === "string" ? record.baseUnits : undefined;

  return usdc ? `${usdc} USDC${baseUnits ? ` / ${baseUnits} units` : ""}` : "Unavailable";
}

function gas(value: unknown) {
  if (!value || typeof value !== "object") {
    return "Unavailable";
  }

  const record = value as Record<string, unknown>;
  const inj = typeof record.inj === "string" ? record.inj : undefined;
  const error = typeof record.error === "string" ? record.error : undefined;

  return inj ? `${inj} INJ` : error ?? "Unavailable";
}

function text(value: unknown) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return "Unavailable";
}

function usdcOnly(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  return typeof record.usdc === "string" ? record.usdc : undefined;
}

function txLink(hash: string | null | undefined, fallback: string) {
  if (!hash) {
    return fallback;
  }

  return (
    <a href={injectiveTestnetTxUrl(hash)} target="_blank" rel="noreferrer">
      {shortenHash(hash)}
    </a>
  );
}

function CostBreakdown({
  creditsRemaining: _creditsRemaining,
  estimatedRecipientAmount,
  forwardingMaxFee,
}: {
  creditsRemaining: number;
  estimatedRecipientAmount: unknown;
  forwardingMaxFee: unknown;
}) {
  const feeUsdc = usdcOnly(forwardingMaxFee);
  const receivedUsdc = usdcOnly(estimatedRecipientAmount);

  return (
    <div className="cost-breakdown" aria-label="Transfer cost breakdown">
      <p className="eyebrow">Transfer cost breakdown</p>
      <p className="status-banner success">
        OmnisRouter sponsors the source-chain INJ gas. Circle&apos;s forwarding fee is protocol-level and is deducted from the transferred USDC amount.
      </p>
      <DetailList entries={[
        ["Source-chain INJ gas", "Paid by OmnisRouter (sponsored by gas credits)"],
        ["Circle CCTP forwarding fee", feeUsdc ? `Deducted from transfer — ${feeUsdc} USDC` : "Unavailable"],
        ["Estimated received amount", receivedUsdc ? `${receivedUsdc} USDC` : "Unavailable"],
      ]} />
    </div>
  );
}
