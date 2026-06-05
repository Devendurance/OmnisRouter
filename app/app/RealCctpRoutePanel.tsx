"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { hashTypedData } from "viem";
import Link from "next/link";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { DetailList } from "./components";
import { INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX, INJECTIVE_EVM_TESTNET_CHAIN_ID, useInjectiveEvmWallet, type InjectiveEvmWalletState } from "./InjectiveEvmWalletProvider";
import { useProductState } from "./product-state";
import { injectiveTestnetTxUrl, shortenHash } from "../../lib/explorers";
import { showDebugPanels, showServerFundedRoutes } from "../../lib/server/feature-flags";
import type { CctpExecutionReceipt } from "../router-simulator";

type ApiState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string; data?: T };

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

type TransferWithAuthorizationTypedData = {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: "TransferWithAuthorization";
  message: Record<string, string>;
};

type PreparedInjectiveAuthorizationResponse = {
  ok: boolean;
  error?: string;
  route?: "injective-to-solana";
  executionMode?: "user-authorized-server-sponsored";
  authorizationType?: "EIP-3009 transferWithAuthorization";
  typedData?: TransferWithAuthorizationTypedData;
  preparedTypedDataHash?: string;
  from?: string;
  to?: string;
  value?: string;
  validAfter?: string;
  validBefore?: string;
  nonce?: string;
  usdcAddress?: string;
  chainId?: number;
  relayerAddress?: string;
  solanaRecipientAddress?: string;
  solanaRecipientAta?: string;
  sourceUsdcBalance?: { usdc?: string; baseUnits?: string };
  requestedAmount?: { usdc?: string; baseUnits?: string };
  domainDebug?: {
    name?: string;
    version?: string;
    symbol?: string;
    decimals?: number;
    chainId?: number;
    verifyingContract?: string;
    contractDomainSeparator?: string;
    locallyComputedDomainSeparator?: string;
    domainSeparatorMatches?: boolean;
    localDomainSeparatorError?: string;
  };
  gasPaidBy?: string;
  note?: string;
};

type VerifiedInjectiveAuthorizationResponse = {
  ok: boolean;
  error?: string;
  recoveredSigner?: string;
  sourceEvmAddress?: string;
  activeEvmAddress?: string;
  addressesMatch?: boolean;
  authorizationValid?: boolean;
  preparedTypedDataHash?: string;
  verifyTypedDataHash?: string;
  hashesMatch?: boolean;
  signatureLength?: number;
  signatureStartsWith0x?: boolean;
  typedDataDomain?: Record<string, unknown>;
  typedDataPrimaryType?: string;
  typedDataMessage?: Record<string, string>;
  message?: string;
};

type SignedInjectiveAuthorization = {
  signature: string;
  activeEvmAddress: string;
  preparedTypedDataHash: string;
  signingMethod: "eth_signTypedData_v4";
  signingParamsOrder: "[address, typedDataJson]";
  signatureLength: number;
  signatureStartsWith0x: boolean;
};

type SubmittedInjectiveAuthorizationResponse = {
  ok: boolean;
  error?: string;
  route?: "injective-to-solana";
  executionMode?: "user-authorized-server-sponsored";
  phase?: "authorization-submitted";
  authorizationTxHash?: string;
  sourceEvmAddress?: string;
  relayerAddress?: string;
  amountUsdc?: string;
  authorizationConsumed?: boolean;
  gasPaidBy?: string;
  message?: string;
};

type CompletedInjectiveForwardingResponse = {
  ok: boolean;
  error?: string;
  route?: "injective-to-solana";
  executionMode?: "user-authorized-server-sponsored";
  phase?: "cctp-burn-submitted";
  authorizationTxHash?: string;
  approvalTxHash?: string | null;
  burnTxHash?: string;
  receiptId?: string | null;
  sourceEvmAddress?: string;
  relayerAddress?: string;
  amountUsdc?: string;
  solanaRecipientAddress?: string;
  solanaRecipientAta?: string;
  stage?: string;
  gasPaidBy?: string;
  message?: string;
};

type ForwardingStage = "idle" | "burning-injective" | "burn-submitted";

type InjectiveAuthorizationDebug = {
  prepareAuthorizationPayload: Record<string, string> | null;
  prepareAuthorizationResponse: PreparedInjectiveAuthorizationResponse | null;
};

type RelayStage = "idle" | "burn-confirmed" | "polling-iris" | "attestation-ready" | "relaying-injective" | "receipt-saved";

type TransferInputs = {
  amountUsdc: string;
  solanaRecipientAddress: string;
};

type AuthorizationInputs = TransferInputs & {
  sourceEvmAddress: string;
};

export function RealCctpRoutePanel() {
  const { publicKey: solanaPublicKey, signTransaction } = useWallet();
  const injectiveEvmWallet = useInjectiveEvmWallet();
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
  const [sourceWalletMode, setSourceWalletMode] = useState<"injective-evm" | null>(null);
  const [preparedAuthorizationInputs, setPreparedAuthorizationInputs] = useState<AuthorizationInputs | null>(null);
  const [preparedAuthorizationState, setPreparedAuthorizationState] = useState<ApiState<PreparedInjectiveAuthorizationResponse>>({ status: "idle" });
  const [authorizationSignatureState, setAuthorizationSignatureState] = useState<ApiState<SignedInjectiveAuthorization>>({ status: "idle" });
  const [verifiedAuthorizationState, setVerifiedAuthorizationState] = useState<ApiState<VerifiedInjectiveAuthorizationResponse>>({ status: "idle" });
  const [submittedAuthorizationState, setSubmittedAuthorizationState] = useState<ApiState<SubmittedInjectiveAuthorizationResponse>>({ status: "idle" });
  const [forwardingState, setForwardingState] = useState<ApiState<CompletedInjectiveForwardingResponse>>({ status: "idle" });
  const [forwardingStage, setForwardingStage] = useState<ForwardingStage>("idle");
  const [injectiveAuthorizationDebug, setInjectiveAuthorizationDebug] = useState<InjectiveAuthorizationDebug>({
    prepareAuthorizationPayload: null,
    prepareAuthorizationResponse: null,
  });
  const sourceEvmAddress = injectiveEvmWallet.address;
  const evmChainOk = injectiveEvmWallet.isConnected && injectiveEvmWallet.chainId.toLowerCase() === INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX;
  const currentInputs = { amountUsdc, solanaRecipientAddress };
  const preflightReady = preflightState.status === "success" && inputsMatch(preflightInputs, currentInputs);
  const currentAuthorizationInputs = { amountUsdc, solanaRecipientAddress, sourceEvmAddress };
  const authorizationReady = preparedAuthorizationState.status === "success" && authorizationInputsMatch(preparedAuthorizationInputs, currentAuthorizationInputs);
  const creditsAvailable = remainingGasCredits > 0;
  const canExecute = eligible && preflightReady && confirmed && creditsAvailable && executionState.status !== "loading" && executionState.status !== "success";
  const canPrepareInjectiveAuthorization = eligible && sourceWalletMode === "injective-evm" && injectiveEvmWallet.isConnected && evmChainOk && preparedAuthorizationState.status !== "loading";
  const canSignInjectiveAuthorization =
    authorizationReady &&
    Boolean(preparedAuthorizationState.data.typedData) &&
    authorizationSignatureState.status !== "loading";
  const canVerifyInjectiveAuthorization =
    authorizationReady &&
    authorizationSignatureState.status === "success" &&
    verifiedAuthorizationState.status !== "loading";
  const canSubmitInjectiveAuthorization =
    authorizationReady &&
    verifiedAuthorizationState.status === "success" &&
    authorizationSignatureState.status === "success" &&
    preparedAuthorizationState.status === "success" &&
    Boolean(preparedAuthorizationState.data.domainDebug?.domainSeparatorMatches) &&
    submittedAuthorizationState.status !== "loading" &&
    submittedAuthorizationState.status !== "success";
  const canCompleteForwarding =
    submittedAuthorizationState.status === "success" &&
    Boolean(submittedAuthorizationState.data.authorizationTxHash) &&
    preparedAuthorizationState.status === "success" &&
    forwardingState.status !== "loading" &&
    forwardingState.status !== "success";
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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setAuthorizationSignatureState({ status: "idle" });
      setVerifiedAuthorizationState({ status: "idle" });
      setSubmittedAuthorizationState({ status: "idle" });
      setForwardingState({ status: "idle" });
      setForwardingStage("idle");
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [amountUsdc, sourceEvmAddress, injectiveEvmWallet.chainId]);

  useEffect(() => {
    if (eligible && injectiveEvmWallet.isConnected && evmChainOk && sourceWalletMode === null) {
      const id = window.setTimeout(() => setSourceWalletMode("injective-evm"), 0);
      return () => window.clearTimeout(id);
    }
  }, [eligible, injectiveEvmWallet.isConnected, evmChainOk, sourceWalletMode]);

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
      toast.success("Route reviewed", { description: "Solana to Injective CCTP route ready." });
    } catch (error) {
      const message = humanizeError(error, "Unable to review the route.");

      toast.error("Route check failed", { description: message });
      setPreparedBurnState({ status: "error", error: message });
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
      toast.success("Wallet signed burn", { description: "Solana wallet authorized the USDC transaction." });
    } catch (error) {
      setSignedBurnTransaction(null);
      const message = humanizeError(error, "Wallet signature test failed. No transaction was sent.");

      toast.error("Wallet signing failed", { description: message });
      setWalletSignatureState({ status: "error", error: message });
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
      toast.success("Burn confirmed", { description: "Solana burn submitted. Waiting for Circle Iris attestation." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signed burn could not be submitted.";

      toast.error("Burn failed", { description: message });
      setSubmitBurnState({ status: "error", error: message });
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
        toast.success("Relay completed", { description: "USDC minted on Injective via Circle CCTP." });
      } else {
        setRelayStage("polling-iris");
      }

      setCompleteRelayState({ status: "success", data: payload });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Injective relay could not be completed. Retry without burning again.";

      toast.error("Relay failed", { description: message });
      setCompleteRelayState({ status: "error", error: message });
    }
  }

  async function prepareInjectiveAuthorization() {
    if (!canPrepareInjectiveAuthorization) return;

    setPreparedAuthorizationState({ status: "loading" });
    setAuthorizationSignatureState({ status: "idle" });
    setVerifiedAuthorizationState({ status: "idle" });
    setSubmittedAuthorizationState({ status: "idle" });
    setForwardingState({ status: "idle" });
    setForwardingStage("idle");

    try {
      if (sourceWalletMode !== "injective-evm") {
        throw new Error("Choose Injective EVM wallet mode before preparing gasless authorization.");
      }

      if (!injectiveEvmWallet.isConnected || !injectiveEvmWallet.address) {
        throw new Error("Connect an Injective EVM wallet from the Dashboard first.");
      }

      if (!evmChainOk) {
        throw new Error("Switch your EVM wallet to Injective EVM testnet from the Dashboard.");
      }

      const evmAddress = injectiveEvmWallet.address;
      const nextAuthorizationInputs = { amountUsdc, solanaRecipientAddress, sourceEvmAddress: evmAddress };
      const prepareAuthorizationPayload = {
        amountUsdc,
        sourceEvmAddress: evmAddress,
        solanaRecipientAddress,
      };

      setInjectiveAuthorizationDebug({
        prepareAuthorizationPayload,
        prepareAuthorizationResponse: null,
      });

      if (process.env.NODE_ENV === "development") {
        console.log("[OmnisRouter] prepare-authorization payload", prepareAuthorizationPayload);
      }

      const response = await fetch("/api/cctp/injective-to-solana/user/prepare-authorization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prepareAuthorizationPayload),
      });
      const payload = await response.json() as PreparedInjectiveAuthorizationResponse;

      setInjectiveAuthorizationDebug((current) => ({
        ...current,
        prepareAuthorizationResponse: payload,
      }));

      if (process.env.NODE_ENV === "development") {
        console.log("[OmnisRouter] prepare-authorization response", payload);
      }

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `API returned status ${response.status}`);
      }

      setPreparedAuthorizationInputs(nextAuthorizationInputs);
      setPreparedAuthorizationState({ status: "success", data: payload });
      toast.success("Authorization prepared", { description: "Review and sign the USDC authorization from your Injective EVM wallet." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to prepare gasless authorization.";

      toast.error("Preparation failed", { description: message });
      setPreparedAuthorizationState({ status: "error", error: message });
    }
  }

  async function signInjectiveAuthorization() {
    if (!canSignInjectiveAuthorization || preparedAuthorizationState.status !== "success" || !preparedAuthorizationState.data.typedData) return;

    setAuthorizationSignatureState({ status: "loading" });
    setVerifiedAuthorizationState({ status: "idle" });

    try {
      const preparedSourceAddress = String(preparedAuthorizationState.data.from || preparedAuthorizationState.data.typedData?.message.from || "");

      if (!preparedSourceAddress) {
        throw new Error("Prepared authorization is missing a source EVM address.");
      }

      if (!injectiveEvmWallet.address) {
        throw new Error("Connect an EVM wallet before signing authorization.");
      }

      const signingProvider = injectiveEvmWallet.selectedProvider;
      if (!signingProvider) {
        throw new Error("Connect an Injective EVM wallet from the Dashboard first.");
      }

      let accounts = await signingProvider.request({ method: "eth_accounts" });

      if (!Array.isArray(accounts) || accounts.length === 0) {
        accounts = await signingProvider.request({ method: "eth_requestAccounts" });
      }

      const activeAccount = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";

      if (activeAccount.toLowerCase() !== preparedSourceAddress.toLowerCase()) {
        throw new Error("Switch your active EVM wallet account to the prepared source address, then sign again.");
      }

      const walletTypedData = buildWalletTypedDataForSigning(preparedAuthorizationState.data.typedData);
      const preparedTypedDataHash = hashTransferWithAuthorizationTypedData(preparedAuthorizationState.data.typedData);
      const signature = await signingProvider.request({
        method: "eth_signTypedData_v4",
        params: [activeAccount, JSON.stringify(walletTypedData)],
      });

      if (typeof signature !== "string") {
        throw new Error("Wallet did not return an authorization signature.");
      }

      setAuthorizationSignatureState({
        status: "success",
        data: {
          signature,
          activeEvmAddress: activeAccount,
          preparedTypedDataHash,
          signingMethod: "eth_signTypedData_v4",
          signingParamsOrder: "[address, typedDataJson]",
          signatureLength: signature.length,
          signatureStartsWith0x: signature.startsWith("0x"),
        },
      });
      toast.success("Authorization signed", { description: "Your wallet signature was received. No transaction has been sent yet." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign authorization. No transaction was sent.";

      toast.error("Signing failed", { description: message });
      setAuthorizationSignatureState({ status: "error", error: message });
    }
  }

  async function verifyInjectiveAuthorization() {
    if (!canVerifyInjectiveAuthorization || preparedAuthorizationState.status !== "success" || authorizationSignatureState.status !== "success") return;

    setVerifiedAuthorizationState({ status: "loading" });

    try {
      const response = await fetch("/api/cctp/injective-to-solana/user/verify-authorization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typedData: preparedAuthorizationState.data.typedData,
          signature: authorizationSignatureState.data.signature,
          sourceEvmAddress: sourceEvmAddress || preparedAuthorizationState.data.from,
          activeEvmAddress: authorizationSignatureState.data.activeEvmAddress,
          preparedTypedDataHash: authorizationSignatureState.data.preparedTypedDataHash,
        }),
      });
      const payload = await response.json() as VerifiedInjectiveAuthorizationResponse;

      if (!response.ok || !payload.ok) {
        const message = payload.error || `API returned status ${response.status}`;

        toast.error("Verification failed", { description: message });
        setVerifiedAuthorizationState({
          status: "error",
          error: message,
          data: payload,
        });
        return;
      }

      setVerifiedAuthorizationState({ status: "success", data: payload });
      toast.success("Authorization verified", { description: "The signature matches your source wallet." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to verify authorization. No transaction was sent.";

      toast.error("Verification failed", { description: message });
      setVerifiedAuthorizationState({ status: "error", error: message });
    }
  }

  async function submitInjectiveAuthorization() {
    if (!canSubmitInjectiveAuthorization || preparedAuthorizationState.status !== "success" || authorizationSignatureState.status !== "success") return;

    setSubmittedAuthorizationState({ status: "loading" });

    try {
      const response = await fetch("/api/cctp/injective-to-solana/user/submit-authorization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typedData: preparedAuthorizationState.data.typedData,
          signature: authorizationSignatureState.data.signature,
          amountUsdc,
          sourceEvmAddress: injectiveEvmWallet.address || preparedAuthorizationState.data.from,
          solanaRecipientAddress,
        }),
      });
      const payload = await response.json() as SubmittedInjectiveAuthorizationResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `API returned status ${response.status}`);
      }

      setSubmittedAuthorizationState({ status: "success", data: payload });
      toast.success("Authorization submitted", { description: "OmnisRouter submitted your authorization and paid the Injective gas." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit authorization.";

      toast.error("Submission failed", { description: message });
      setSubmittedAuthorizationState({ status: "error", error: message });
    }
  }

  async function completeForwarding() {
    if (!canCompleteForwarding || preparedAuthorizationState.status !== "success" || submittedAuthorizationState.status !== "success") return;

    setForwardingStage("burning-injective");
    setForwardingState({ status: "loading" });

    try {
      const response = await fetch("/api/cctp/injective-to-solana/user/complete-forwarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorizationTxHash: submittedAuthorizationState.data.authorizationTxHash,
          sourceEvmAddress: injectiveEvmWallet.address || preparedAuthorizationState.data.from,
          amountUsdc,
          solanaRecipientAddress,
          solanaRecipientAta: preparedAuthorizationState.data.solanaRecipientAta,
          authorization: {
            from: preparedAuthorizationState.data.from,
            to: preparedAuthorizationState.data.to,
            value: preparedAuthorizationState.data.value,
            validAfter: preparedAuthorizationState.data.validAfter,
            validBefore: preparedAuthorizationState.data.validBefore,
            nonce: preparedAuthorizationState.data.nonce,
          },
        }),
      });
      const payload = await response.json() as CompletedInjectiveForwardingResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `API returned status ${response.status}`);
      }

      setForwardingStage("burn-submitted");
      setForwardingState({ status: "success", data: payload });
      toast.success("Burn submitted", { description: "USDC was burned on Injective. Circle Forwarding Service is handling Solana minting." });

      if (payload.receiptId) {
        toast.success("Receipt saved", { description: "Your wallet-scoped receipt is now available." });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to burn and forward USDC.";

      toast.error("Burn failed", { description: message });
      setForwardingStage("idle");
      setForwardingState({ status: "error", error: message });
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
      const message = humanizeError(error, "Unable to complete route check.");

      toast.error("Route check failed", { description: message });
      setPreflightState({ status: "error", error: message });
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
      toast.success("Transfer executed", { description: "Circle Forwarding Service handles Solana minting." });

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
      const message = humanizeError(error, "Transfer could not be completed. No receipt was recorded unless a burn transaction was submitted.");

      toast.error("Transfer failed", { description: message });
      setExecutionState({ status: "error", error: message });
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
          <InjectiveAuthorizationPanel
            authorizationSignatureState={authorizationSignatureState}
            canPrepare={canPrepareInjectiveAuthorization}
            canSign={canSignInjectiveAuthorization}
            canVerify={canVerifyInjectiveAuthorization}
            canSubmit={canSubmitInjectiveAuthorization}
            onPrepare={prepareInjectiveAuthorization}
            onSign={signInjectiveAuthorization}
            onVerify={verifyInjectiveAuthorization}
            onSubmit={submitInjectiveAuthorization}
            onCompleteForwarding={completeForwarding}
            preparedAuthorizationState={preparedAuthorizationState}
            debug={injectiveAuthorizationDebug}
            evmChainOk={evmChainOk}
            evmWallet={injectiveEvmWallet}
            sourceWalletMode={sourceWalletMode}
            verifiedAuthorizationState={verifiedAuthorizationState}
            submittedAuthorizationState={submittedAuthorizationState}
            forwardingState={forwardingState}
            forwardingStage={forwardingStage}
            canCompleteForwarding={canCompleteForwarding}
            authorizationReady={authorizationReady}
          />
          {showServerFundedRoutes() ? (
          <ServerFundedExecutionSection
            canExecute={canExecute}
            confirmed={confirmed}
            executionState={executionState}
            executeTransfer={executeTransfer}
            preflightReady={preflightReady}
            preflightState={preflightState}
            setConfirmed={setConfirmed}
          />
          ) : null}
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

function authorizationInputsMatch(preparedInputs: AuthorizationInputs | null, currentInputs: AuthorizationInputs) {
  return preparedInputs?.amountUsdc === currentInputs.amountUsdc &&
    preparedInputs.solanaRecipientAddress === currentInputs.solanaRecipientAddress &&
    preparedInputs.sourceEvmAddress === currentInputs.sourceEvmAddress;
}

function formatJson(value: unknown) {
  if (!value) return "Unavailable";

  try {
    return JSON.stringify(value);
  } catch {
    return "Unavailable";
  }
}

function buildWalletTypedDataForSigning(typedData: TransferWithAuthorizationTypedData) {
  return {
    ...typedData,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      TransferWithAuthorization: typedData.types.TransferWithAuthorization,
    },
  };
}

function hashTransferWithAuthorizationTypedData(typedData: TransferWithAuthorizationTypedData) {
  return hashTypedData({
    domain: typedData.domain,
    types: { TransferWithAuthorization: typedData.types.TransferWithAuthorization },
    primaryType: typedData.primaryType,
    message: {
      ...typedData.message,
      value: BigInt(typedData.message.value),
      validAfter: BigInt(typedData.message.validAfter),
      validBefore: BigInt(typedData.message.validBefore),
    },
  });
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

function InjectiveAuthorizationPanel({
  authorizationSignatureState,
  authorizationReady,
  canCompleteForwarding,
  canPrepare,
  canSign,
  canSubmit,
  canVerify,
  debug,
  evmChainOk,
  evmWallet,
  forwardingState,
  forwardingStage,
  onCompleteForwarding,
  onPrepare,
  onSign,
  onSubmit,
  onVerify,
  preparedAuthorizationState,
  sourceWalletMode,
  submittedAuthorizationState,
  verifiedAuthorizationState,
}: {
  authorizationSignatureState: ApiState<SignedInjectiveAuthorization>;
  authorizationReady: boolean;
  canCompleteForwarding: boolean;
  canPrepare: boolean;
  canSign: boolean;
  canSubmit: boolean;
  canVerify: boolean;
  debug: InjectiveAuthorizationDebug;
  evmChainOk: boolean;
  evmWallet: InjectiveEvmWalletState;
  forwardingState: ApiState<CompletedInjectiveForwardingResponse>;
  forwardingStage: ForwardingStage;
  onCompleteForwarding: () => void;
  onPrepare: () => void;
  onSign: () => void;
  onSubmit: () => void;
  onVerify: () => void;
  preparedAuthorizationState: ApiState<PreparedInjectiveAuthorizationResponse>;
  sourceWalletMode: "injective-evm" | null;
  submittedAuthorizationState: ApiState<SubmittedInjectiveAuthorizationResponse>;
  verifiedAuthorizationState: ApiState<VerifiedInjectiveAuthorizationResponse>;
}) {
  const requestedAmount = preparedAuthorizationState.status === "success"
    ? preparedAuthorizationState.data.requestedAmount
    : debug.prepareAuthorizationResponse?.requestedAmount;
  const requestedAmountText = amount(requestedAmount) !== "Unavailable"
    ? amount(requestedAmount)
    : debug.prepareAuthorizationPayload?.amountUsdc
      ? `${debug.prepareAuthorizationPayload.amountUsdc} USDC`
      : "Unavailable";

  return (
    <div className="cctp-result-panel">
      <p className="eyebrow">User-owned gasless route</p>
      <p className="status-banner success">Your Injective EVM wallet authorizes USDC with a signature. OmnisRouter pays gas and routes through CCTP.</p>
      {sourceWalletMode === "injective-evm" ? (
        <>
          <p className="status-banner success">This route uses your connected Injective EVM wallet as the USDC source. You sign an authorization. OmnisRouter pays gas during execution.</p>
          {!evmWallet.isConnected ? (
            <p className="status-banner error">Connect an Injective EVM wallet from the Dashboard first.</p>
          ) : null}
          {evmWallet.isConnected && !evmChainOk ? (
            <p className="status-banner error">Switch your EVM wallet to Injective EVM testnet from the Dashboard.</p>
          ) : null}
          <DetailList entries={[
            ["Source wallet mode", "Injective EVM"],
            ["Connected EVM source address", evmWallet.address || "Not connected"],
            ["Active EVM chainId", evmWallet.chainIdDecimal ? `${evmWallet.chainIdDecimal} / ${evmWallet.chainId}` : "Not connected"],
            ["Required chainId", `${INJECTIVE_EVM_TESTNET_CHAIN_ID} / ${INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX}`],
            ["EVM USDC balance", evmWallet.balance.status === "success" ? `${evmWallet.balance.usdc} USDC` : evmWallet.balance.status === "loading" ? "Loading..." : "Unavailable"],
            ["Requested amount", requestedAmountText],
            ["OmnisRouter relayer/sponsor", preparedAuthorizationState.status === "success" ? preparedAuthorizationState.data.relayerAddress ?? "Unavailable" : "Available after prepare"],
          ]} />
          {preparedAuthorizationState.status === "success" && preparedAuthorizationState.data.domainDebug && showDebugPanels() ? (
            <>
              <DetailList entries={[
                ["USDC name", preparedAuthorizationState.data.domainDebug.name ?? "Unavailable"],
                ["USDC version", preparedAuthorizationState.data.domainDebug.version ?? "Unavailable"],
                ["USDC symbol", preparedAuthorizationState.data.domainDebug.symbol ?? "Unavailable"],
                ["USDC decimals", String(preparedAuthorizationState.data.domainDebug.decimals ?? "")],
                ["Domain chainId", String(preparedAuthorizationState.data.domainDebug.chainId ?? "")],
                ["Domain verifying contract", preparedAuthorizationState.data.domainDebug.verifyingContract ?? "Unavailable"],
                ["Domain separator match", preparedAuthorizationState.data.domainDebug.domainSeparatorMatches ? "Yes" : "No"],
                ["Contract domain separator", preparedAuthorizationState.data.domainDebug.contractDomainSeparator ?? "Unavailable"],
                ["Computed domain separator", preparedAuthorizationState.data.domainDebug.locallyComputedDomainSeparator ?? "Unavailable"],
                ["Domain separator error", preparedAuthorizationState.data.domainDebug.localDomainSeparatorError ?? "None"],
              ]} />
              {!preparedAuthorizationState.data.domainDebug.domainSeparatorMatches ? (
                <p className="status-banner error">Typed-data domain does not match Injective USDC contract domain. Signature would be rejected on-chain.</p>
              ) : null}
            </>
          ) : null}
          <div className="button-row cctp-action-row">
            <button className="secondary-button" disabled={!canPrepare} onClick={onPrepare} type="button">
              {preparedAuthorizationState.status === "loading" ? "Preparing authorization..." : "Prepare gasless authorization"}
            </button>
            <button className="secondary-button" disabled={!canSign} onClick={onSign} type="button">
              {authorizationSignatureState.status === "loading" ? "Signing authorization..." : "Sign authorization"}
            </button>
            <button className="secondary-button" disabled={!canVerify} onClick={onVerify} type="button">
              {verifiedAuthorizationState.status === "loading" ? "Verifying authorization..." : "Verify authorization"}
            </button>
            <button className="primary-button" disabled={!canSubmit} onClick={onSubmit} type="button">
              {submittedAuthorizationState.status === "loading" ? "Submitting authorization..." : "Submit authorization"}
            </button>
            <button className="primary-button" disabled={!canCompleteForwarding} onClick={onCompleteForwarding} type="button">
              {forwardingState.status === "loading" ? "Burning on Injective..." : "Burn and forward to Solana"}
            </button>
          </div>
          {!canPrepare && sourceWalletMode === "injective-evm" ? (
            <p className="status-banner warning">
              {!evmWallet.isConnected ? "Connect Injective EVM wallet from the Dashboard first." :
               !evmChainOk ? "Switch your EVM wallet to Injective EVM testnet." :
               "Enter a USDC amount and valid Solana recipient first."}
            </p>
          ) : null}
          {canPrepare && preparedAuthorizationState.status === "idle" ? (
            <p className="status-banner warning">Prepare authorization first.</p>
          ) : null}
          {preparedAuthorizationState.status === "success" && !authorizationReady ? (
            <p className="status-banner warning">Authorization details changed. Prepare again before signing.</p>
          ) : null}
          {authorizationReady && authorizationSignatureState.status === "idle" && !canSign ? (
            <p className="status-banner warning">Sign authorization first.</p>
          ) : null}
          {authorizationSignatureState.status === "success" && verifiedAuthorizationState.status === "idle" ? (
            <p className="status-banner warning">Verify authorization first.</p>
          ) : null}
          {verifiedAuthorizationState.status === "success" && submittedAuthorizationState.status === "idle" && !canSubmit ? (
            <p className="status-banner warning">Submit authorization first.</p>
          ) : null}
        </>
      ) : null}
      {preparedAuthorizationState.status === "error" ? <p className="status-banner error">{preparedAuthorizationState.error}</p> : null}
      {authorizationSignatureState.status === "error" ? <p className="status-banner error">{authorizationSignatureState.error}</p> : null}
      {verifiedAuthorizationState.status === "error" ? <p className="status-banner error">{verifiedAuthorizationState.error}</p> : null}
      {submittedAuthorizationState.status === "error" ? <p className="status-banner error">{submittedAuthorizationState.error}</p> : null}
      {forwardingState.status === "error" ? <p className="status-banner error">{forwardingState.error}</p> : null}

      {verifiedAuthorizationState.status === "error" && verifiedAuthorizationState.data?.addressesMatch === false && showDebugPanels() ? (
        <DetailList entries={[
          ["Source EVM address", verifiedAuthorizationState.data.sourceEvmAddress ?? "Unavailable"],
          ["Recovered signer", verifiedAuthorizationState.data.recoveredSigner ?? "Unavailable"],
          ["Active EVM wallet address", evmWallet.address || "Unavailable"],
          ["Prepared typed data hash", verifiedAuthorizationState.data.preparedTypedDataHash ?? "Unavailable"],
          ["Verify typed data hash", verifiedAuthorizationState.data.verifyTypedDataHash ?? "Unavailable"],
          ["Hashes match", verifiedAuthorizationState.data.hashesMatch ? "Yes" : "No"],
        ]} />
      ) : null}

      {(preparedAuthorizationState.status === "success" || authorizationSignatureState.status === "success" || verifiedAuthorizationState.status === "success") ? (
        <div className="cctp-result-panel">
          <p className="eyebrow">Progress</p>
          <DetailList entries={[
            ["Authorization prepared", preparedAuthorizationState.status === "success" ? "Done" : preparedAuthorizationState.status === "loading" ? "..." : "Pending"],
            ["User signed authorization", authorizationSignatureState.status === "success" ? "Done" : authorizationSignatureState.status === "loading" ? "..." : "Pending"],
            ["Authorization verified", verifiedAuthorizationState.status === "success" ? "Done" : verifiedAuthorizationState.status === "loading" ? "..." : "Pending"],
            ["Authorization submitted", submittedAuthorizationState.status === "success" ? "Done" : submittedAuthorizationState.status === "loading" ? "..." : "Pending"],
            ["Burn submitted", forwardingStage === "burn-submitted" && forwardingState.status === "success" ? "Done" : forwardingState.status === "loading" ? "..." : "Pending"],
          ]} />
          {forwardingStage === "burn-submitted" && forwardingState.status === "success" ? (
            <p className="status-banner success">Circle Forwarding Service is handling Solana minting.</p>
          ) : null}
          {forwardingState.status === "success" && forwardingState.data.receiptId ? (
            <p className="status-banner success">Receipt saved</p>
          ) : forwardingState.status === "success" && !forwardingState.data.receiptId ? (
            <p className="status-banner warning">Burn submitted, but receipt save failed. Keep your transaction hashes.</p>
          ) : null}
        </div>
      ) : null}
      {preparedAuthorizationState.status === "success" ? (
        <DetailList entries={[
          ["EIP-3009 source EVM address", evmWallet.address || preparedAuthorizationState.data.from || "Unavailable"],
          ["OmnisRouter relayer/sponsor", preparedAuthorizationState.data.relayerAddress ?? "Unavailable"],
          ["User Injective EVM USDC balance", amount(preparedAuthorizationState.data.sourceUsdcBalance)],
          ["Requested amount", amount(preparedAuthorizationState.data.requestedAmount)],
          ["Authorization type", preparedAuthorizationState.data.authorizationType ?? "EIP-3009 transferWithAuthorization"],
          ["USDC value", preparedAuthorizationState.data.value ?? "Unavailable"],
          ...(showDebugPanels() ? [["Prepared typed data hash", preparedAuthorizationState.data.preparedTypedDataHash ?? "Unavailable"]] as [string, string][] : []),
          ["Solana recipient ATA", preparedAuthorizationState.data.solanaRecipientAta ?? "Unavailable"],
          ["Gas paid by", preparedAuthorizationState.data.gasPaidBy ?? "OmnisRouter"],
          ["Note", preparedAuthorizationState.data.note ?? "User signs authorization only. No transaction is sent in this phase."],
        ]} />
      ) : null}
      {authorizationSignatureState.status === "success" ? (
        <DetailList entries={(showDebugPanels()
          ? [
              ["Signature", shortenHash(authorizationSignatureState.data.signature, 12)],
              ["Signing method", authorizationSignatureState.data.signingMethod],
              ["Signing params order", authorizationSignatureState.data.signingParamsOrder],
              ["Active EVM signer", authorizationSignatureState.data.activeEvmAddress],
              ["Prepared typed data hash", authorizationSignatureState.data.preparedTypedDataHash],
              ["Signature length", String(authorizationSignatureState.data.signatureLength)],
              ["Signature starts with 0x", authorizationSignatureState.data.signatureStartsWith0x ? "Yes" : "No"],
            ]
          : [
              ["Signature", shortenHash(authorizationSignatureState.data.signature, 12)],
            ])} />
      ) : null}
      {verifiedAuthorizationState.status === "success" ? (
        <DetailList entries={(showDebugPanels()
          ? [
              ["Recovered signer", verifiedAuthorizationState.data.recoveredSigner ?? "Unavailable"],
              ["Active EVM signer", verifiedAuthorizationState.data.activeEvmAddress ?? "Unavailable"],
              ["Prepared typed data hash", verifiedAuthorizationState.data.preparedTypedDataHash ?? "Unavailable"],
              ["Verify typed data hash", verifiedAuthorizationState.data.verifyTypedDataHash ?? "Unavailable"],
              ["Hashes match", verifiedAuthorizationState.data.hashesMatch ? "Yes" : "No"],
              ["Signature length", String(verifiedAuthorizationState.data.signatureLength ?? "")],
              ["Signature starts with 0x", verifiedAuthorizationState.data.signatureStartsWith0x ? "Yes" : "No"],
              ["Typed data domain", formatJson(verifiedAuthorizationState.data.typedDataDomain)],
              ["Typed data primary type", verifiedAuthorizationState.data.typedDataPrimaryType ?? "Unavailable"],
              ["Typed data message", formatJson(verifiedAuthorizationState.data.typedDataMessage)],
              ["Authorization valid", verifiedAuthorizationState.data.authorizationValid ? "Yes" : "No"],
              ["Message", verifiedAuthorizationState.data.message ?? (submittedAuthorizationState.status === "success" ? "Authorization signature verified and submitted." : "Authorization signature verified. No transaction sent.")],
            ]
          : [
              ["Authorization valid", verifiedAuthorizationState.data.authorizationValid ? "Yes" : "No"],
              ["Message", verifiedAuthorizationState.data.message ?? (submittedAuthorizationState.status === "success" ? "Authorization signature verified and submitted." : "Authorization signature verified. No transaction sent.")],
            ])} />
      ) : null}
      {submittedAuthorizationState.status === "success" ? (
        <DetailList entries={[
          ["Authorization tx", submittedAuthorizationState.data.authorizationTxHash ? (() => { const hash = submittedAuthorizationState.data.authorizationTxHash!; return <a href={`https://testnet.explorer.injective.network/transaction/${hash}`} target="_blank" rel="noreferrer">{shortenHash(hash, 12)}</a>; })() : "Unavailable"],
          ["Relayer address", submittedAuthorizationState.data.relayerAddress ?? "Unavailable"],
          ["Authorization consumed", submittedAuthorizationState.data.authorizationConsumed ? "Yes" : "No"],
          ["Source EVM address", submittedAuthorizationState.data.sourceEvmAddress ?? "Unavailable"],
          ["Amount", submittedAuthorizationState.data.amountUsdc ? `${submittedAuthorizationState.data.amountUsdc} USDC` : "Unavailable"],
          ["Gas paid by", submittedAuthorizationState.data.gasPaidBy ?? "OmnisRouter"],
          ["Message", submittedAuthorizationState.data.message ?? "Authorization submitted. CCTP burn not attempted in this phase."],
        ]} />
      ) : null}
      {forwardingState.status === "success" ? (
        <DetailList entries={[
          ["Authorization tx", forwardingState.data.authorizationTxHash ? <a href={`https://testnet.explorer.injective.network/transaction/${forwardingState.data.authorizationTxHash}`} target="_blank" rel="noreferrer">{shortenHash(forwardingState.data.authorizationTxHash, 12)}</a> : "Unavailable"],
          ["Approval tx", forwardingState.data.approvalTxHash ? <a href={`https://testnet.explorer.injective.network/transaction/${forwardingState.data.approvalTxHash}`} target="_blank" rel="noreferrer">{shortenHash(forwardingState.data.approvalTxHash, 12)}</a> : "Not needed"],
          ["Burn tx", forwardingState.data.burnTxHash ? <a href={`https://testnet.explorer.injective.network/transaction/${forwardingState.data.burnTxHash}`} target="_blank" rel="noreferrer">{shortenHash(forwardingState.data.burnTxHash, 12)}</a> : "Unavailable"],
          ["Relayer address", forwardingState.data.relayerAddress ?? "Unavailable"],
          ["Source EVM address", forwardingState.data.sourceEvmAddress ?? "Unavailable"],
          ["Solana recipient ATA", forwardingState.data.solanaRecipientAta ?? "Unavailable"],
          ["Gas paid by", forwardingState.data.gasPaidBy ?? "OmnisRouter"],
          ["Message", forwardingState.data.message ?? "USDC burned on Injective. Circle Forwarding Service handles Solana minting."],
        ]} />
      ) : null}
      {forwardingState.status === "success" && forwardingState.data.receiptId ? (
        <div className="button-row cctp-action-row">
          <Link className="primary-button" href="/app/receipt">&rarr; View receipt</Link>
        </div>
      ) : null}
    </div>
  );
}

function ServerFundedExecutionSection({
  canExecute,
  confirmed,
  executionState,
  executeTransfer,
  preflightReady,
  preflightState,
  setConfirmed,
}: {
  canExecute: boolean;
  confirmed: boolean;
  executionState: ApiState<ExecuteResponse>;
  executeTransfer: () => void;
  preflightReady: boolean;
  preflightState: ApiState<Record<string, unknown>>;
  setConfirmed: (confirmed: boolean) => void;
}) {
  const executorAddress = preflightState.status === "success"
    ? text(preflightState.data.sourceEvmAddress)
    : "Run a route check to see the executor wallet address.";

  return (
    <div className="cctp-result-panel">
      <p className="eyebrow">Server-funded testnet execution</p>
      <p className="status-banner warning">This legacy demo route uses the OmnisRouter testnet executor wallet as the source of funds. It does not spend from your connected EVM wallet.</p>
      <p className="status-banner warning">This route pays INJ gas from OmnisRouter. This route spends executor USDC, not connected user USDC.</p>
      <DetailList entries={[
        ["Executor/source wallet", executorAddress],
        ["Source-chain INJ gas", "Paid by OmnisRouter"],
        ["Source funds", "Executor wallet USDC (not connected user USDC)"],
      ]} />
      <label className="toggle-row cctp-confirm-row"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />I understand this executes a real testnet transfer using the testnet executor wallet.</label>
      <div className="button-row cctp-action-row">
        <button className="primary-button" disabled={!canExecute} onClick={executeTransfer} type="button">{executionState.status === "loading" ? "Executing..." : executionState.status === "success" ? "Transfer Executed" : "Execute with testnet executor wallet"}</button>
      </div>
      {!preflightReady ? <p className="status-banner warning">Run a route check before executing.</p> : null}
      {executionState.status === "error" ? <p className="status-banner error">{executionState.error}</p> : null}
      {executionState.status === "success" ? <ExecutionPanel result={executionState.data} /> : null}
    </div>
  );
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
