"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
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

type PreparedUserAuthorizedBurnResponse = {
  ok: boolean;
  error?: string;
  route?: "solana-to-injective";
  executionMode?: "user-authorized-server-sponsored";
  serializedTransaction?: string;
  sourceSolanaAddress?: string;
  sponsorFeePayer?: string;
  eventRentPayer?: string;
  messageSentEventData?: string;
  userUsdcAta?: string;
  amountUsdc?: string;
  injectiveRecipientAddress?: string;
  requiredUserSignature?: string;
  gasPaidBy?: string;
  note?: string;
};

type SubmitSignedBurnResponse = {
  ok: boolean;
  error?: string;
  burnTxHash?: string;
  message?: string;
};

type CompleteInjectiveRelayResponse = {
  ok: boolean;
  status?: "pending" | "completed";
  error?: string;
  burnTxHash?: string;
  relayTxHash?: string;
  receiptId?: string | null;
  message?: string;
};

type RelayStage = "idle" | "burn-confirmed" | "polling-iris" | "attestation-ready" | "relaying-injective" | "receipt-saved";

type TransferInputs = {
  amountUsdc: string;
  solanaRecipientAddress: string;
};

export function RealCctpRoutePanel() {
  const { publicKey: solanaPublicKey, signTransaction } = useWallet();
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
  const policyAllowsSolanaToInjectiveExecution =
    !rules.emergencyPauseEnabled &&
    intent.amount <= rules.maxTransferAmount &&
    intent.amount <= rules.dailyTransferLimit &&
    rules.allowedDestinationChains.includes("Injective");
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
  const [preparedBurnState, setPreparedBurnState] = useState<ApiState<PreparedUserAuthorizedBurnResponse>>({ status: "idle" });
  const [walletSignatureState, setWalletSignatureState] = useState<ApiState<{ message: string }>>({ status: "idle" });
  const [signedBurnTransaction, setSignedBurnTransaction] = useState<string | null>(null);
  const [submitBurnState, setSubmitBurnState] = useState<ApiState<SubmitSignedBurnResponse>>({ status: "idle" });
  const [completeRelayState, setCompleteRelayState] = useState<ApiState<CompleteInjectiveRelayResponse>>({ status: "idle" });
  const [relayStage, setRelayStage] = useState<RelayStage>("idle");
  const currentInputs = { amountUsdc, solanaRecipientAddress };
  const preflightReady = preflightState.status === "success" && inputsMatch(preflightInputs, currentInputs);
  const creditsAvailable = remainingGasCredits > 0;
  const canExecute = eligible && preflightReady && confirmed && creditsAvailable && executionState.status !== "loading" && executionState.status !== "success";
  const connectedSolanaAddress = solanaPublicKey?.toBase58() ?? "";
  const canPrepareUserAuthorizedBurn =
    solanaToInjectiveDetected &&
    Boolean(connectedSolanaAddress) &&
    intent.amount > 0 &&
    route.recipientValidation.isValid &&
    route.recipientValidation.chainType === "Injective" &&
    preparedBurnState.status !== "loading";
  const canTestWalletSignature =
    preparedBurnState.status === "success" &&
    Boolean(preparedBurnState.data.serializedTransaction) &&
    typeof signTransaction === "function" &&
    walletSignatureState.status !== "loading";
  const canSubmitSignedBurn =
    Boolean(signedBurnTransaction) &&
    preparedBurnState.status === "success" &&
    solanaToInjectiveConfirmed &&
    creditsAvailable &&
    policyAllowsSolanaToInjectiveExecution &&
    submitBurnState.status !== "loading" &&
    submitBurnState.status !== "success";
  const canCompleteInjectiveRelay =
    submitBurnState.status === "success" &&
    Boolean(submitBurnState.data.burnTxHash) &&
    completeRelayState.status !== "loading" &&
    !(completeRelayState.status === "success" && completeRelayState.data.status === "completed");

  async function prepareUserAuthorizedBurn() {
    if (!canPrepareUserAuthorizedBurn) return;

    setPreparedBurnState({ status: "loading" });
    setWalletSignatureState({ status: "idle" });
    setSignedBurnTransaction(null);
    setSubmitBurnState({ status: "idle" });
    setCompleteRelayState({ status: "idle" });
    setRelayStage("idle");

    try {
      const response = await fetch("/api/cctp/solana-to-injective/user/prepare-burn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsdc,
          sourceSolanaAddress: connectedSolanaAddress,
          injectiveRecipientAddress: intent.recipientAddress,
        }),
      });
      const payload = await response.json() as PreparedUserAuthorizedBurnResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `API returned status ${response.status}`);
      }

      setPreparedBurnState({ status: "success", data: payload });
    } catch (error) {
      setPreparedBurnState({ status: "error", error: humanizeError(error, "Unable to review the route.") });
    }
  }

  async function testWalletSignature() {
    if (!canTestWalletSignature || !preparedBurnState.data.serializedTransaction || !signTransaction) return;

    setWalletSignatureState({ status: "loading" });

    try {
      const rawTransaction = base64ToUint8Array(preparedBurnState.data.serializedTransaction);
      const transaction = deserializeSolanaTransaction(rawTransaction);

      const signedTransaction = await signTransaction(transaction);
      setSignedBurnTransaction(uint8ArrayToBase64(signedTransaction.serialize()));
      setSubmitBurnState({ status: "idle" });
      setCompleteRelayState({ status: "idle" });
      setRelayStage("idle");
      setWalletSignatureState({ status: "success", data: { message: "USDC authorized. Ready to send with OmnisRouter." } });
    } catch (error) {
      setSignedBurnTransaction(null);
      setWalletSignatureState({ status: "error", error: humanizeError(error, "Wallet signature test failed. No transaction was sent.") });
    }
  }

  async function submitSignedBurn() {
    if (!canSubmitSignedBurn || !signedBurnTransaction || preparedBurnState.status !== "success") return;

    setSubmitBurnState({ status: "loading" });

    try {
      const response = await fetch("/api/cctp/solana-to-injective/user/submit-burn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signedTransaction: signedBurnTransaction,
          amountUsdc,
          sourceSolanaAddress: connectedSolanaAddress,
          injectiveRecipientAddress: intent.recipientAddress,
        }),
      });
      const payload = await response.json() as SubmitSignedBurnResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `API returned status ${response.status}`);
      }

      setSubmitBurnState({ status: "success", data: payload });
      setCompleteRelayState({ status: "idle" });
      setRelayStage("burn-confirmed");
    } catch (error) {
      setSubmitBurnState({ status: "error", error: error instanceof Error ? error.message : "Signed burn could not be submitted." });
    }
  }

  async function completeInjectiveRelay() {
    if (!canCompleteInjectiveRelay || submitBurnState.status !== "success" || !submitBurnState.data.burnTxHash) return;

    setRelayStage("polling-iris");
    setCompleteRelayState({ status: "loading" });

    try {
      const response = await fetch("/api/cctp/solana-to-injective/user/complete-relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          burnTxHash: submitBurnState.data.burnTxHash,
          amountUsdc,
          sourceSolanaAddress: connectedSolanaAddress,
          injectiveRecipientAddress: intent.recipientAddress,
        }),
      });
      const payload = await response.json() as CompleteInjectiveRelayResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `API returned status ${response.status}`);
      }

      if (payload.status === "completed") {
        setRelayStage("receipt-saved");
        recordRealSponsoredExecution();
      } else {
        setRelayStage("polling-iris");
      }

      setCompleteRelayState({ status: "success", data: payload });
    } catch (error) {
      setCompleteRelayState({ status: "error", error: error instanceof Error ? error.message : "Injective relay could not be completed. Retry without burning again." });
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
      {realRouteDetected && route.realRouteCandidate?.sourceChain === "Solana" ? <p className="status-banner warning">Execution mode: User-authorized, OmnisRouter-sponsored</p> : null}
      {realRouteDetected && route.realRouteCandidate?.sourceChain === "Solana" ? <div className="cctp-result-panel"><p className="status-banner success">You authorize the USDC transfer. OmnisRouter pays Solana gas and handles the relay.</p></div> : null}
      <p className="status-banner warning">Safety note: This uses a funded testnet executor wallet. Production should use user wallet signing, auth, and rate limits.</p>
      <p className="status-banner success">Sponsored transfers today: {remainingGasCredits} / {gasCredits.dailyLimit} remaining</p>
      {solanaToInjectiveDetected ? (
        <p className="status-banner warning">OmnisRouter pays Solana gas and handles the Injective relay.</p>
      ) : (
        <p className="status-banner warning">OmnisRouter sponsors the source-chain INJ gas. Circle&apos;s forwarding fee is deducted from the transferred USDC amount.</p>
      )}
      {!creditsAvailable ? <p className="status-banner error">You&apos;ve used today&apos;s 10 sponsored testnet transfers. Try again tomorrow.</p> : null}
      {!realRouteDetected ? <p className="status-banner warning">Real execution currently supports Solana and Injective recipients on the testnet USDC CCTP routes.</p> : null}
      {executionInputsValid && !policyAllowsExecution ? <p className="status-banner error">Real execution is blocked by the current spending policy or emergency pause.</p> : null}
      {solanaToInjectiveDetected && !policyAllowsSolanaToInjectiveExecution ? <p className="status-banner error">Solana to Injective execution is blocked by the current spending policy or emergency pause.</p> : null}

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
      {preflightState.status === "success" && preflightReady ? <PreflightPanel preflight={preflightState.data} /> : null}

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
              className="secondary-button"
              disabled={!canPrepareUserAuthorizedBurn}
              onClick={prepareUserAuthorizedBurn}
              type="button"
            >
              {preparedBurnState.status === "loading" ? "Reviewing route..." : "Review Route"}
            </button>
            {preparedBurnState.status === "success" && typeof signTransaction === "function" ? (
              <button
                className="secondary-button"
                disabled={!canTestWalletSignature}
                onClick={testWalletSignature}
                type="button"
              >
                {walletSignatureState.status === "loading" ? "Authorizing USDC..." : "Authorize USDC"}
              </button>
            ) : null}
            <button className="primary-button" disabled={!canSubmitSignedBurn} onClick={submitSignedBurn} type="button">
              {submitBurnState.status === "loading" ? "Sending with OmnisRouter..." : "Send with OmnisRouter"}
            </button>
            {submitBurnState.status === "success" ? (
              <button className="primary-button" disabled={!canCompleteInjectiveRelay} onClick={completeInjectiveRelay} type="button">
                {completeRelayState.status === "loading" ? "Finalizing on Injective..." : "Finalize on Injective"}
              </button>
            ) : null}
          </div>
          {!connectedSolanaAddress ? <p className="status-banner warning">Connect a Solana wallet to review this route.</p> : null}
          {preparedBurnState.status === "error" ? <p className="status-banner error">{preparedBurnState.error}</p> : null}
          {preparedBurnState.status === "success" ? <PreparedBurnPanel result={preparedBurnState.data} /> : null}
          {walletSignatureState.status === "error" ? <p className="status-banner error">{walletSignatureState.error}</p> : null}
          {walletSignatureState.status === "success" ? <p className="status-banner success">{walletSignatureState.data.message}</p> : null}
          {preparedBurnState.status === "success" ? <p className="status-banner success">Stage: Route prepared</p> : null}
          {walletSignatureState.status === "success" ? <p className="status-banner success">Stage: USDC authorized</p> : null}
          {submitBurnState.status === "loading" ? <p className="status-banner warning">Stage: Sending with OmnisRouter</p> : null}
          {submitBurnState.status === "error" ? <p className="status-banner error">{submitBurnState.error}</p> : null}
          {submitBurnState.status === "success" ? <SubmittedBurnPanel result={submitBurnState.data} /> : null}
          {submitBurnState.status === "success" ? <RelayStagesPanel response={completeRelayState} stage={relayStage} /> : null}
          {completeRelayState.status === "error" ? <p className="status-banner error">{completeRelayState.error}</p> : null}
        </>
      ) : null}
    </div>
  );
}

function inputsMatch(preflightInputs: TransferInputs | null, currentInputs: TransferInputs) {
  return preflightInputs?.amountUsdc === currentInputs.amountUsdc && preflightInputs.solanaRecipientAddress === currentInputs.solanaRecipientAddress;
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function uint8ArrayToBase64(value: Uint8Array): string {
  let binary = "";

  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return window.btoa(binary);
}

function deserializeSolanaTransaction(rawTransaction: Uint8Array): Transaction | VersionedTransaction {
  try {
    return Transaction.from(rawTransaction);
  } catch {
    return VersionedTransaction.deserialize(rawTransaction);
  }
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

function PreflightPanel({ preflight }: { preflight: Record<string, unknown> }) {
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
        isManualFeeFallback={Boolean(result.isManualFeeFallback)}
      />
      <div className="button-row cctp-action-row">
        <Link className="secondary-button" href="/app/receipt">View Receipt</Link>
      </div>
    </div>
  );
}

function PreparedBurnPanel({ result }: { result: PreparedUserAuthorizedBurnResponse }) {
  return (
    <div className="cctp-result-panel">
      <p className="status-banner success">Execution mode: User-authorized, OmnisRouter-sponsored</p>
      <p className="status-banner success">You authorize the USDC transfer. OmnisRouter pays Solana gas and handles the relay.</p>
      <DetailList entries={[
        ["Execution mode", result.executionMode ?? "user-authorized-server-sponsored"],
        ["Required user signature", result.requiredUserSignature ?? "Unavailable"],
        ["Sponsor fee payer", result.sponsorFeePayer ?? "Unavailable"],
        ["Event rent payer", result.eventRentPayer ?? "Unavailable"],
        ["Message event account", result.messageSentEventData ?? "Unavailable"],
        ["User USDC ATA", result.userUsdcAta ?? "Unavailable"],
        ["Gas paid by", result.gasPaidBy ?? "OmnisRouter"],
        ["Note", result.note ?? "Route prepared; no transfer sent yet."],
      ]} />
    </div>
  );
}

function SubmittedBurnPanel({ result }: { result: SubmitSignedBurnResponse }) {
  return (
    <div className="cctp-result-panel">
      <p className="status-banner success">Stage: Solana transfer confirmed</p>
      <DetailList entries={[
        ["Burn tx", result.burnTxHash ? <a href={`https://explorer.solana.com/tx/${result.burnTxHash}?cluster=devnet`} target="_blank" rel="noreferrer">{shortenHash(result.burnTxHash, 12)}</a> : "Unavailable"],
        ["Message", result.message ?? "Solana transfer confirmed. Ready to finalize on Injective."],
      ]} />
    </div>
  );
}

function RelayStagesPanel({ response, stage }: { response: ApiState<CompleteInjectiveRelayResponse>; stage: RelayStage }) {
  const result = response.status === "success" ? response.data : null;
  const completed = result?.status === "completed";

  return (
    <div className="cctp-result-panel">
      <p className="status-banner success">Stage: Solana transfer confirmed</p>
      {response.status === "idle" ? <p className="status-banner warning">Click Finalize on Injective to wait for Circle attestation and complete the route.</p> : null}
      {response.status !== "idle" ? <p className={stage === "polling-iris" ? "status-banner warning" : "status-banner success"}>Stage: Waiting for Circle attestation</p> : null}
      {completed ? <p className="status-banner success">Stage: Attestation received</p> : null}
      {completed ? <p className="status-banner success">Stage: Finalizing on Injective</p> : null}
      {completed ? <p className="status-banner success">Stage: Receipt saved</p> : null}
      {result?.status === "pending" ? <p className="status-banner warning">{result.message ?? "Attestation pending. Retry shortly."}</p> : null}
      <DetailList entries={[
        ["Burn tx", result?.burnTxHash ? <a href={`https://explorer.solana.com/tx/${result.burnTxHash}?cluster=devnet`} target="_blank" rel="noreferrer">{shortenHash(result.burnTxHash, 12)}</a> : "Waiting for relay completion"],
        ["Relay tx", result?.relayTxHash ? txLink(result.relayTxHash, "Pending") : "Pending"],
      ]} />
      {completed ? (
        <div className="button-row cctp-action-row">
          <Link className="secondary-button" href="/app/receipt">View Receipt</Link>
        </div>
      ) : null}
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
  estimatedRecipientAmount,
  forwardingMaxFee,
  isManualFeeFallback = false,
}: {
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
