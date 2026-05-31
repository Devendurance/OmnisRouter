"use client";

import Link from "next/link";
import { useState } from "react";
import { DetailList } from "./components";
import { useProductState } from "./product-state";
import { injectiveTestnetTxUrl, shortenHash } from "../../lib/explorers";
import type { CctpExecutionReceipt } from "../router-simulator";

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

type SolanaToInjectiveExecuteResponse = {
  ok: boolean;
  error?: string;
  burnTxHash?: string;
  relayTxHash?: string | null;
  amountUsdc?: string;
  expectedRecipientAmount?: { usdc?: string; baseUnits?: string };
  debug?: {
    serverSolanaSourceAddress?: string;
    usedSolanaSourceAddress?: string;
  };
  message?: string;
};

type TransferInputs = {
  amountUsdc: string;
  solanaRecipientAddress: string;
};

export function RealCctpRoutePanel() {
  const { gasCredits, intent, recordCctpReceipt, recordRealSponsoredExecution, remainingGasCredits, route, rules } = useProductState();
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
  const solanaToInjectiveDetected =
    realRouteDetected &&
    route.realRouteCandidate?.sourceChain === "Solana" &&
    route.realRouteCandidate?.destinationChain === "Injective";
  const [confirmed, setConfirmed] = useState(false);
  const [preflightState, setPreflightState] = useState<ApiState<Record<string, unknown>>>({ status: "idle" });
  const [executionState, setExecutionState] = useState<ApiState<ExecuteResponse>>({ status: "idle" });
  const [preflightInputs, setPreflightInputs] = useState<TransferInputs | null>(null);
  const [solanaToInjectiveConfirmed, setSolanaToInjectiveConfirmed] = useState(false);
  const [solanaToInjectiveExecutionState, setSolanaToInjectiveExecutionState] = useState<ApiState<SolanaToInjectiveExecuteResponse>>({ status: "idle" });
  const currentInputs = { amountUsdc, solanaRecipientAddress };
  const preflightReady = preflightState.status === "success" && inputsMatch(preflightInputs, currentInputs);
  const creditsAvailable = remainingGasCredits > 0;
  const canExecute = eligible && preflightReady && confirmed && creditsAvailable && executionState.status !== "loading" && executionState.status !== "success";
  const solanaToInjectiveCanExecute =
    solanaToInjectiveDetected && solanaToInjectiveConfirmed && creditsAvailable &&
    solanaToInjectiveExecutionState.status !== "loading" &&
    solanaToInjectiveExecutionState.status !== "success" &&
    policyAllowsExecution &&
    rules.allowedDestinationChains.includes("Injective");

  async function executeSolanaToInjectiveTransfer() {
    if (!solanaToInjectiveCanExecute) return;

    setSolanaToInjectiveExecutionState({ status: "loading" });

    const requestBody = {
      amountUsdc,
      injectiveRecipientAddress: intent.recipientAddress,
      confirmExecution: "EXECUTE_SOLANA_TO_INJECTIVE" as const,
    };

    console.log("Solana -> Injective execute payload:", {
      amountUsdc: requestBody.amountUsdc,
      injectiveRecipientAddress: requestBody.injectiveRecipientAddress,
      direction: "Solana → Injective",
    });

    try {
      const response = await fetch("/api/cctp/solana-to-injective/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json() as SolanaToInjectiveExecuteResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `API returned status ${response.status}`);
      }

      setSolanaToInjectiveExecutionState({ status: "success", data: payload });
      recordRealSponsoredExecution();

      if (payload.burnTxHash) {
        const receipt: CctpExecutionReceipt = {
          id: `cctp-s2i-${Date.now()}-${payload.burnTxHash.slice(0, 10)}`,
          createdAt: new Date().toISOString(),
          routeLabel: "Solana → Injective",
          sourceChain: "Solana",
          destinationChain: "Injective",
          asset: "USDC",
          requestedAmount: payload.amountUsdc ?? amountUsdc,
          forwardingFee: "0",
          estimatedRecipientAmount: payload.expectedRecipientAmount?.usdc ?? amountUsdc,
          sourceGasSponsor: "OmnisRouter",
          approvalTxHash: null,
          burnTxHash: payload.burnTxHash,
          relayTxHash: payload.relayTxHash ?? null,
          sourceEvmAddress: "",
          solanaSourceAddress: payload.debug?.usedSolanaSourceAddress ?? payload.debug?.serverSolanaSourceAddress ?? "",
          serverSolanaSourceAddress: payload.debug?.serverSolanaSourceAddress ?? "",
          usedSolanaSourceAddress: payload.debug?.usedSolanaSourceAddress ?? payload.debug?.serverSolanaSourceAddress ?? "",
          solanaRecipientWallet: "",
          injectiveRecipientAddress: intent.recipientAddress,
          solanaUsdcAta: "",
          status: payload.relayTxHash ? "completed" : "burn-submitted",
          message: payload.message ?? "Solana burn submitted. Iris attestation received. Injective relay completed.",
        };

        recordCctpReceipt(receipt);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      setSolanaToInjectiveExecutionState({
        status: "error",
        error: message || "Solana to Injective transfer could not be completed.",
      });
    }
  }

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
      const payload = (await response.json()) as ExecuteResponse;

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
    <div className="card cctp-lab-card">
      <p className="eyebrow">Real route option</p>
      <h2>{realRouteDetected ? "Real CCTP Testnet Route Available" : "Real CCTP Testnet Route"}</h2>
      {realRouteDetected && route.realRouteCandidate?.sourceChain === "Injective" ? <p className="status-banner success">OmnisRouter detected a Solana recipient and found a real Injective &rarr; Solana USDC route.</p> : null}
      {realRouteDetected && route.realRouteCandidate?.sourceChain === "Solana" ? <p className="status-banner success">OmnisRouter detected an Injective recipient and found a real Solana &rarr; Injective USDC route.</p> : null}
      {realRouteDetected && route.realRouteCandidate?.sourceChain === "Solana" ? <p className="status-banner warning">This route uses a staged CCTP V2 manual relay.</p> : null}
      {realRouteDetected && route.realRouteCandidate?.sourceChain === "Solana" ? <div className="cctp-result-panel"><p className="status-banner success">Phases: Solana burn &rarr; Iris attestation &rarr; Injective relay &rarr; Receipt</p></div> : null}
      <p className="status-banner warning">Safety note: This uses a funded testnet executor wallet. Production should use user wallet signing, auth, and rate limits.</p>
      <p className="status-banner success">Sponsored transfers today: {remainingGasCredits} / {gasCredits.dailyLimit} remaining</p>
      <p className="status-banner warning">OmnisRouter sponsors the source-chain INJ gas. Circle&apos;s forwarding fee is deducted from the transferred USDC amount.</p>
      {!creditsAvailable ? <p className="status-banner error">You&apos;ve used today&apos;s 10 sponsored testnet transfers. Try again tomorrow.</p> : null}
      {!realRouteDetected ? <p className="status-banner warning">Real execution currently supports Solana and Injective recipients on the testnet USDC CCTP routes.</p> : null}
      {executionInputsValid && !policyAllowsExecution ? <p className="status-banner error">Real execution is blocked by the current spending policy or emergency pause.</p> : null}

      <div className="option-grid" aria-label="Fee mode">
        <div className="option-card selected">A. Send net amount: recipient receives amount after route fees.</div>
        <div className="option-card">B. Exact receive mode: top up slightly so recipient receives the exact amount.</div>
      </div>

      <DetailList entries={[
        ["Current route", route.realRouteCandidate ? `${route.realRouteCandidate.sourceChain} -> ${route.realRouteCandidate.destinationChain}` : route.route ?? `${route.sourceChain ?? "Unresolved"} -> ${route.destinationChain}`],
        ["Amount", amountUsdc ? `${amountUsdc} ${intent.asset}` : "Unavailable"],
        [solanaToInjectiveDetected ? "Injective recipient" : "Solana recipient", solanaRecipientAddress || "No recipient detected"],
        ["Protocol", route.realRouteCandidate?.protocol ?? route.protocol ?? "Unavailable"],
      ]} />

      <div className="button-row cctp-action-row">
        <button className="secondary-button" disabled={!eligible || preflightState.status === "loading"} onClick={runPreflight} type="button">
          {preflightState.status === "loading" ? "Running route check..." : "Run Route Check"}
        </button>
      </div>

      {preflightState.status === "error" ? <p className="status-banner error">{preflightState.error}</p> : null}
      {preflightState.status === "success" && !preflightReady ? <p className="status-banner warning">Route details changed. Run a route check again before executing.</p> : null}
      {preflightState.status === "success" && preflightReady ? <PreflightPanel creditsRemaining={remainingGasCredits} preflight={preflightState.data} /> : null}

      {eligible ? (
        <>
          <label className="toggle-row cctp-confirm-row"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />I understand this executes a real testnet transfer using the testnet executor wallet.</label>
          <div className="button-row cctp-action-row">
            <button className="primary-button" disabled={!canExecute} onClick={executeTransfer} type="button">{executionState.status === "loading" ? "Executing..." : executionState.status === "success" ? "Transfer Executed" : "Execute Real Testnet Transfer"}</button>
          </div>
          {!preflightReady ? <p className="status-banner warning">Run a route check before executing.</p> : null}
          {executionState.status === "error" ? <p className="status-banner error">{executionState.error}</p> : null}
          {executionState.status === "success" ? <ExecutionPanel result={executionState.data} /> : null}
        </>
      ) : null}

      {solanaToInjectiveDetected ? (
        <>
          <label className="toggle-row cctp-confirm-row">
            <input checked={solanaToInjectiveConfirmed} onChange={(event) => setSolanaToInjectiveConfirmed(event.target.checked)} type="checkbox" />
            I understand this executes a real testnet Solana to Injective CCTP V2 manual relay.
          </label>
          <div className="button-row cctp-action-row">
            <button
              className="primary-button"
              disabled={!solanaToInjectiveCanExecute}
              onClick={executeSolanaToInjectiveTransfer}
              type="button"
            >
              {solanaToInjectiveExecutionState.status === "loading"
                ? "Executing..."
                : solanaToInjectiveExecutionState.status === "success"
                ? "Transfer Complete"
                : "Execute Solana → Injective Route"}
            </button>
          </div>
          {solanaToInjectiveExecutionState.status === "error" ? (
            <p className="status-banner error">{solanaToInjectiveExecutionState.error}</p>
          ) : null}
          {solanaToInjectiveExecutionState.status === "success" ? (
            <div className="cctp-result-panel">
              <p className="status-banner success">Transfer complete</p>
              <p className="status-banner success">Phases: Solana burn → Iris attestation → Injective relay → Complete</p>
              <DetailList entries={[
                ["Burn tx", (() => {
                  const hash = solanaToInjectiveExecutionState.data?.burnTxHash;
                  return hash ? <a href={`https://explorer.solana.com/tx/${hash}?cluster=devnet`} target="_blank" rel="noreferrer">{shortenHash(hash, 12)}</a> : "Pending";
                })()],
                ["Relay tx", (() => {
                  const hash = solanaToInjectiveExecutionState.data?.relayTxHash;
                  return hash ? <a href={injectiveTestnetTxUrl(hash)} target="_blank" rel="noreferrer">{shortenHash(hash, 12)}</a> : "Pending";
                })()],
                ["Message", solanaToInjectiveExecutionState.data?.message ?? "Complete."],
              ]} />
              <div className="button-row cctp-action-row">
                <Link className="secondary-button" href="/app/receipt">View Receipt</Link>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
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

function PreflightPanel({ creditsRemaining, preflight }: { creditsRemaining: number; preflight: Record<string, unknown> }) {
  return (
    <div className="cctp-result-panel">
      <p className="status-banner success">Route check complete</p>
      <DetailList split entries={[
        ["Requested amount", amount(preflight.requestedAmount)],
        ["Source USDC balance", amount(preflight.sourceUsdcBalance)],
        ["Approval needed", text(preflight.approvalNeeded)],
        ["Native INJ gas balance", gas(preflight.nativeInjGasBalance)],
        ["Solana USDC ATA", text(preflight.solanaUsdcAta)],
      ]} />
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
  creditsRemaining,
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
