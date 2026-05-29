"use client";

import { useState } from "react";
import { DetailList } from "./components";
import { useProductState } from "./product-state";

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

export function RealCctpRoutePanel() {
  const { gasCredits, intent, remainingGasCredits, recordRealSponsoredExecution, route, rules } = useProductState();
  const amountUsdc = Number.isFinite(intent.amount) ? String(intent.amount) : "";
  const solanaRecipientAddress = route.recipientValidation.normalizedAddress || intent.recipientAddress.trim();
  const realRouteDetected = Boolean(route.realRouteCandidate);
  const executionInputsValid =
    intent.asset.toUpperCase() === "USDC" &&
    intent.amount > 0 &&
    route.realRouteCandidate?.sourceChain === "Injective" &&
    route.realRouteCandidate.destinationChain === "Solana" &&
    route.recipientValidation.isValid &&
    route.recipientValidation.chainType === "Solana";
  const policyAllowsExecution =
    !rules.emergencyPauseEnabled &&
    intent.amount <= rules.maxTransferAmount &&
    intent.amount <= rules.dailyTransferLimit &&
    rules.allowedDestinationChains.includes("Solana");
  const eligible = executionInputsValid && policyAllowsExecution;
  const [confirmed, setConfirmed] = useState(false);
  const [preflightState, setPreflightState] = useState<ApiState<Record<string, unknown>>>({ status: "idle" });
  const [executionState, setExecutionState] = useState<ApiState<ExecuteResponse>>({ status: "idle" });
  const [preflightInputs, setPreflightInputs] = useState<TransferInputs | null>(null);
  const currentInputs = { amountUsdc, solanaRecipientAddress };
  const preflightReady = preflightState.status === "success" && inputsMatch(preflightInputs, currentInputs);
  const creditsAvailable = remainingGasCredits > 0;
  const canExecute = eligible && preflightReady && confirmed && creditsAvailable && executionState.status !== "loading" && executionState.status !== "success";

  async function runPreflight() {
    if (!eligible) {
      return;
    }

    setConfirmed(false);
    setExecutionState({ status: "idle" });
    setPreflightState({ status: "loading" });

    try {
      const response = await fetch("/api/cctp/injective-to-solana/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsdc, solanaRecipientAddress }),
      });
      const payload = (await response.json()) as PreflightResponse;

      if (!response.ok || !payload.ok || !payload.preflight) {
        throw new Error(payload.error || "Unable to run CCTP preflight.");
      }

      setPreflightInputs(currentInputs);
      setPreflightState({ status: "success", data: payload.preflight });
    } catch (error) {
      setPreflightInputs(null);
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
      const payload = (await response.json()) as ExecuteResponse;

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
    <div className="card cctp-lab-card">
      <p className="eyebrow">Real route option</p>
      <h2>{realRouteDetected ? "Real CCTP Testnet Route Available" : "Real CCTP Testnet Route"}</h2>
      {realRouteDetected ? <p className="status-banner success">OmnisRouter detected this as a Solana recipient address and found a real Injective -&gt; Solana USDC route.</p> : null}
      {realRouteDetected ? <p className="status-banner warning">This route can execute a real testnet Injective USDC -&gt; Solana USDC transfer through Circle CCTP Forwarding Service.</p> : null}
      <p className="status-banner warning">Safety note: This uses a demo-funded testnet executor wallet. Production version should use user wallet signing, auth, rate limits, and abuse protection.</p>
      <p className="status-banner success">Sponsored transfers today: {remainingGasCredits} / {gasCredits.dailyLimit} remaining</p>
      <p className="status-banner warning">OmnisRouter sponsors source-chain gas for your first 5 real testnet transfers each day.</p>
      <p className="status-banner warning">Circle forwarding fees may still reduce the amount received.</p>
      {!creditsAvailable ? <p className="status-banner error">You've used your 5 sponsored transfers today.</p> : null}
      {!realRouteDetected ? <p className="status-banner warning">Real execution currently supports Solana recipients through the Injective -&gt; Solana testnet USDC route.</p> : null}
      {executionInputsValid && !policyAllowsExecution ? <p className="status-banner error">Real execution is blocked by the current spending policy or emergency pause.</p> : null}

      <div className="option-grid" aria-label="Fee mode">
        <div className="option-card selected">A. Send net amount: recipient receives amount after route fees.</div>
        <div className="option-card">B. Exact receive mode: top up slightly so recipient receives the exact amount.</div>
      </div>

      <DetailList entries={[
        ["Current route", route.realRouteCandidate ? `${route.realRouteCandidate.sourceChain} -> ${route.realRouteCandidate.destinationChain}` : route.route ?? `${route.sourceChain ?? "Unresolved"} -> ${route.destinationChain}`],
        ["Amount", amountUsdc ? `${amountUsdc} ${intent.asset}` : "Unavailable"],
        ["Solana recipient", solanaRecipientAddress || "No recipient detected"],
        ["Protocol", route.realRouteCandidate?.protocol ?? route.protocol ?? "Unavailable"],
      ]} />

      <div className="button-row cctp-action-row">
        <button className="secondary-button" disabled={!eligible || preflightState.status === "loading"} onClick={runPreflight} type="button">
          {preflightState.status === "loading" ? "Running preflight..." : "Run Real Route Preflight"}
        </button>
      </div>

      {preflightState.status === "error" ? <p className="status-banner error">{preflightState.error}</p> : null}
      {preflightState.status === "success" && !preflightReady ? <p className="status-banner warning">Route details changed. Run preflight again before executing.</p> : null}
      {preflightState.status === "success" && preflightReady ? <PreflightPanel creditsRemaining={remainingGasCredits} preflight={preflightState.data} /> : null}

      {eligible ? (
        <>
          <label className="toggle-row cctp-confirm-row"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />I understand this executes a real testnet transfer using the demo executor wallet.</label>
          <div className="button-row cctp-action-row">
            <button className="primary-button" disabled={!canExecute} onClick={executeTransfer} type="button">{executionState.status === "loading" ? "Executing..." : executionState.status === "success" ? "Real Route Executed" : "Execute Real Testnet Route"}</button>
          </div>
          {!preflightReady ? <p className="status-banner warning">Run a successful preflight before execution.</p> : null}
          {executionState.status === "error" ? <p className="status-banner error">{executionState.error}</p> : null}
          {executionState.status === "success" ? <ExecutionPanel result={executionState.data} /> : null}
        </>
      ) : null}
    </div>
  );
}

function inputsMatch(preflightInputs: TransferInputs | null, currentInputs: TransferInputs) {
  return preflightInputs?.amountUsdc === currentInputs.amountUsdc && preflightInputs.solanaRecipientAddress === currentInputs.solanaRecipientAddress;
}

function PreflightPanel({ creditsRemaining, preflight }: { creditsRemaining: number; preflight: Record<string, unknown> }) {
  return (
    <div className="cctp-result-panel">
      <p className="status-banner success">Preflight complete</p>
      <DetailList split entries={[
        ["Requested amount", amount(preflight.requestedAmount)],
        ["Forwarding fee", amount(preflight.forwardingMaxFee)],
        ["Estimated recipient amount", amount(preflight.estimatedRecipientAmount)],
        ["Source gas sponsor", "OmnisRouter"],
        ["Credits remaining", String(creditsRemaining)],
        ["Source USDC balance", amount(preflight.sourceUsdcBalance)],
        ["Approval needed", text(preflight.approvalNeeded)],
        ["Native INJ gas balance", gas(preflight.nativeInjGasBalance)],
        ["Solana USDC ATA", text(preflight.solanaUsdcAta)],
      ]} />
    </div>
  );
}

function ExecutionPanel({ result }: { result: ExecuteResponse }) {
  return (
    <div className="cctp-result-panel">
      <p className="status-banner success">Execution submitted</p>
      <DetailList entries={[
        ["Approval tx", result.approvalTxHash ?? "Approval skipped"],
        ["Burn/depositForBurnWithHook tx", result.burnTxHash ?? "Pending"],
        ["Requested amount", amount(result.requestedAmount)],
        ["Forwarding fee", amount(result.forwardingMaxFee)],
        ["Estimated recipient amount", result.estimatedRecipientAmount?.usdc ? `${result.estimatedRecipientAmount.usdc} USDC` : "Unknown"],
        ["Source gas sponsor", "OmnisRouter"],
        ["Forwarding service", result.message ?? "Circle Forwarding Service handles Solana minting."],
      ]} />
    </div>
  );
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
