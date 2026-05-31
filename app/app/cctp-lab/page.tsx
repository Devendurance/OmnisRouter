"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { DetailList } from "../components";
import { useProductState } from "../product-state";
import { injectiveTestnetTxUrl, shortenHash } from "../../../lib/explorers";
import type { CctpExecutionReceipt } from "../../router-simulator";

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
  sourceUsdcBalance?: { usdc?: string; baseUnits?: string };
  forwardingMaxFee?: { usdc?: string; baseUnits?: string };
  estimatedRecipientAmount?: { usdc?: string; baseUnits?: string };
  sourceEvmAddress?: string;
  solanaRecipientWallet?: string;
  solanaUsdcAta?: string;
  isManualFeeFallback?: boolean;
  maxFeeSource?: string;
  fallbackFeeWarning?: string;
  message?: string;
};

type TransferInputs = {
  amountUsdc: string;
  solanaRecipientAddress: string;
};

export default function CctpLabPage() {
  const { gasCredits, recordCctpReceipt, recordRealSponsoredExecution, remainingGasCredits } = useProductState();
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
      setPreflightState({ status: "error", error: humanizeError(error, "Unable to complete route check.") });
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

      if (payload.burnTxHash) {
        const receipt: CctpExecutionReceipt = {
          id: `cctp-${Date.now()}-${payload.burnTxHash.slice(2, 10)}`,
          createdAt: new Date().toISOString(),
          routeLabel: "Injective → Solana",
          sourceChain: "Injective",
          destinationChain: "Solana",
          asset: "USDC",
          requestedAmount: payload.requestedAmount?.usdc ?? amountUsdc,
          forwardingFee: payload.forwardingMaxFee?.usdc ?? "Unknown",
          estimatedRecipientAmount: payload.estimatedRecipientAmount?.usdc ?? "Unknown",
          sourceGasSponsor: "OmnisRouter",
          approvalTxHash: payload.approvalTxHash ?? null,
          burnTxHash: payload.burnTxHash,
          sourceEvmAddress: payload.sourceEvmAddress ?? "",
          solanaRecipientWallet: payload.solanaRecipientWallet ?? solanaRecipientAddress,
          solanaUsdcAta: payload.solanaUsdcAta ?? "",
          status: "forwarding-submitted",
          message: payload.message ?? "Circle Forwarding Service handles Solana minting.",
        };

        recordCctpReceipt(receipt);
      }
    } catch (error) {
      setExecutionState({ status: "error", error: humanizeError(error, "Transfer could not be completed. No receipt was recorded unless a burn transaction was submitted.") });
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
          <p className="status-banner warning">Testnet execution mode: OmnisRouter uses a funded server-side Solana execution wallet to demonstrate real CCTP routing. Users provide the recipient and intent; OmnisRouter handles burn, attestation, relay, and receipt generation.</p>
          <p className="status-banner warning">This uses a funded testnet executor wallet. Production should use user wallet signing, auth, and rate limits.</p>
          <p className="status-banner success">Sponsored transfers today: {remainingGasCredits} / {gasCredits.dailyLimit} remaining</p>
          <p className="status-banner warning">OmnisRouter sponsors the source-chain INJ gas. Circle&apos;s forwarding fee is deducted from the transferred USDC amount.</p>
          {!creditsAvailable ? <p className="status-banner error">You&apos;ve used today&apos;s 10 sponsored testnet transfers. Try again tomorrow.</p> : null}

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
              <button className="primary-button" disabled={preflightState.status === "loading"} type="submit">{preflightState.status === "loading" ? "Running route check..." : "Run Route Check"}</button>
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
              <button className="primary-button" disabled={!canExecute} onClick={executeTransfer} type="button">{executionState.status === "loading" ? "Executing..." : executionState.status === "success" ? "Transfer Executed" : "Execute Real Testnet Transfer"}</button>
            </div>
            {!preflightReady ? <p className="status-banner warning">Run a route check before executing.</p> : null}
            {executionState.status === "error" ? <p className="status-banner error">{executionState.error}</p> : null}
            {executionState.status === "success" ? <ExecutionPanel result={executionState.data} /> : null}
          </div>

          <div className="card cctp-lab-card">
            <p className="eyebrow">Reverse route</p>
            <h2>Solana &rarr; Injective</h2>
            <p className="status-banner success">Solana devnet USDC &rarr; Injective testnet USDC</p>
            <p className="status-banner warning">This route uses a staged CCTP V2 manual relay.</p>
            <p className="status-banner success">Phases: Solana burn &rarr; Iris attestation &rarr; Injective relay &rarr; Receipt</p>
            <p className="status-banner warning">Execution is available from the Agent → Approval panel when an Injective recipient is detected.</p>
          </div>

          <div className="card cctp-lab-card">
            <p className="eyebrow">Scope guard</p>
            <DetailList entries={[
              ["Mode", "Real testnet CCTP only"],
              ["Source", "Injective testnet executor wallet"],
              ["Destination", "Solana devnet recipient ATA"],
              ["App flow", "Unchanged and still separate"],
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

function humanizeError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("api is disabled") || lower.includes("execution api")) {
    return "Real execution is currently disabled in this environment.";
  }

  if (lower.includes("credits exhausted") || lower.includes("daily sponsored")) {
    return "You've used today's 10 sponsored testnet transfers. Try again tomorrow.";
  }

  if (lower.includes("fee") || lower.includes("circle")) {
    return "Circle fee estimate could not be reached. Check your connection and try again.";
  }

  if (lower.includes("invalid solana") || lower.includes("solana recipient")) {
    return "This does not look like a valid Solana recipient address.";
  }

  return fallback;
}

function CctpHero() {
  return (
    <section className="hero-panel cctp-hero-panel">
      <div>
        <p className="eyebrow">CCTP lab</p>
        <h1>Real CCTP <em>Testnet Route.</em></h1>
        <p className="hero-copy">A server-side hackathon lab for the real Injective testnet to Solana devnet forwarding flow.</p>
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
      <p className="status-banner success">Route check complete</p>
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
        isManualFeeFallback={Boolean(preflight.isManualFeeFallback)}
      />
    </div>
  );
}

function ExecutionPanel({ result }: { result: ExecuteResponse }) {
  return (
    <div className="cctp-result-panel">
      <p className="status-banner success">Burn submitted on Injective</p>
      <p className="status-banner success">Circle Forwarding Service is handling Solana minting. This can take around 30&ndash;90 seconds.</p>
      <p className="status-banner success">Check the receipt page for transaction proof.</p>
      <DetailList entries={[
        ["Approval tx", txLink(result.approvalTxHash, "Approval skipped")],
        ["Burn tx", txLink(result.burnTxHash, "Pending")],
      ]} />
      <CostBreakdown
        forwardingMaxFee={result.forwardingMaxFee}
        estimatedRecipientAmount={result.estimatedRecipientAmount}
        creditsRemaining={0}
        isManualFeeFallback={Boolean(result.isManualFeeFallback)}
      />
      <div className="button-row cctp-action-row">
        <Link className="secondary-button" href="/app/receipt">View Receipt</Link>
      </div>
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
  isManualFeeFallback = false,
}: {
  creditsRemaining: number;
  estimatedRecipientAmount: unknown;
  forwardingMaxFee: unknown;
  isManualFeeFallback?: boolean;
}) {
  const feeUsdc = usdcOnly(forwardingMaxFee);
  const receivedUsdc = usdcOnly(estimatedRecipientAmount);
  const feeSourceEntry: [string, React.ReactNode] = isManualFeeFallback
    ? ["Fee source", "Manual fallback"]
    : ["Fee source", "Circle fee API"];

  return (
    <div className="cost-breakdown" aria-label="Transfer cost breakdown">
      <p className="eyebrow">Transfer cost breakdown</p>
      <p className="status-banner success">
        OmnisRouter sponsors the source-chain INJ gas. Circle&apos;s forwarding fee is protocol-level and is deducted from the transferred USDC amount.
      </p>
      {isManualFeeFallback ? (
        <p className="status-banner warning">
          Circle fee API was unavailable, so OmnisRouter used the configured manual max fee fallback.
        </p>
      ) : null}
      <DetailList entries={[
        feeSourceEntry,
        ["Source-chain INJ gas", "Paid by OmnisRouter (sponsored by gas credits)"],
        ["Circle CCTP forwarding fee", feeUsdc ? `Deducted from transfer — ${feeUsdc} USDC` : "Unavailable"],
        ["Estimated received amount", receivedUsdc ? `${receivedUsdc} USDC` : "Unavailable"],
      ]} />
    </div>
  );
}
