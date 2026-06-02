"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppHero, DetailList, Metric } from "./components";
import { useInjectiveEvmWallet, INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX } from "./InjectiveEvmWalletProvider";
import { useInjectiveWallet } from "./InjectiveWalletProvider";
import { useProductState } from "./product-state";
import SolanaWalletButton from "./SolanaWalletButton";
import { useInjectiveNativeBalance, useInjectiveUsdcBalance, type InjectiveUsdcBalanceState } from "./useInjectiveNativeBalance";
import { useSolanaUsdcBalance, type SolanaUsdcBalanceState } from "./useSolanaUsdcBalance";

export default function DashboardPage() {
  const { rules, gasCredits, remainingGasCredits, ruleResult } = useProductState();
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const [solBalanceState, setSolBalanceState] = useState<SolBalanceState>({ status: "idle" });
  const solBalanceRequestRef = useRef(0);
  const injectiveWallet = useInjectiveWallet();
  const injBalance = useInjectiveNativeBalance(injectiveWallet.isConnected ? injectiveWallet.address : "");
  const injectiveUsdcBalance = useInjectiveUsdcBalance(injectiveWallet.isConnected ? injectiveWallet.address : "");
  const solanaUsdcBalance = useSolanaUsdcBalance();
  const solanaAddress = publicKey?.toBase58() ?? "";

  async function refreshSolBalance() {
    if (!connected || !publicKey) {
      setSolBalanceState({ status: "idle" });
      return;
    }

    const currentPublicKey = publicKey;
    const requestId = ++solBalanceRequestRef.current;
    setSolBalanceState({ status: "loading" });

    try {
      const lamports = await connection.getBalance(currentPublicKey);

      if (solBalanceRequestRef.current === requestId) {
        setSolBalanceState({ status: "success", balanceSol: lamports / LAMPORTS_PER_SOL });
      }
    } catch (error) {
      if (solBalanceRequestRef.current === requestId) {
        setSolBalanceState({
          status: "error",
          error: error instanceof Error ? error.message : "Unable to read SOL balance.",
        });
      }
    }
  }

  useEffect(() => {
    const requestId = ++solBalanceRequestRef.current;

    if (!connected || !publicKey) {
      return;
    }

    const currentPublicKey = publicKey;

    async function readSolBalance() {
      setSolBalanceState({ status: "loading" });

      try {
        const lamports = await connection.getBalance(currentPublicKey);

        if (solBalanceRequestRef.current === requestId) {
          setSolBalanceState({ status: "success", balanceSol: lamports / LAMPORTS_PER_SOL });
        }
      } catch (error) {
        if (solBalanceRequestRef.current === requestId) {
          setSolBalanceState({
            status: "error",
            error: error instanceof Error ? error.message : "Unable to read SOL balance.",
          });
        }
      }
    }

    void readSolBalance();
  }, [connected, connection, publicKey]);

  const solBalanceDisplay = formatSolBalance(connected ? solBalanceState : { status: "idle" });
  const solanaUsdcBalanceDisplay = formatSolanaUsdcBalance(connected ? solanaUsdcBalance.state : { status: "idle" });
  const injBalanceDisplay = formatInjBalance(injBalance.state);
  const injectiveUsdcBalanceDisplay = formatInjectiveUsdcBalance(injectiveUsdcBalance.state);

  return (
    <>
      <AppHero eyebrow="AI stablecoin router" title={<>Plain-English USDC payments with <em>visible control.</em></>} copy="Connect wallets, review route readiness, and monitor testnet gas and USDC balances before execution." />
      <section className="content-grid two-col" aria-labelledby="dashboard-title">
        <div className="card primary-card">
          <p className="eyebrow">Dashboard</p>
          <h2 id="dashboard-title">Wallet state</h2>
          <div className="metric-row"><BalanceMetric label="Native SOL gas balance" value={solBalanceDisplay.value} detail={solBalanceDisplay.detail} note={solBalanceDisplay.note} badges={solBalanceDisplay.badges} action={<button aria-label="Refresh native SOL gas balance" className="secondary-button compact" disabled={!connected || solBalanceState.status === "loading"} onClick={() => { void refreshSolBalance(); }} type="button">Refresh</button>} /><BalanceMetric label="Native INJ gas balance" value={injBalanceDisplay.value} detail={injBalanceDisplay.detail} note={injBalanceDisplay.note} badges={injBalanceDisplay.badges} action={<button aria-label="Refresh native INJ gas balance" className="secondary-button compact" disabled={!injectiveWallet.isConnected || injBalance.state.status === "loading"} onClick={() => { void injBalance.refresh(); }} type="button">Refresh</button>} /><BalanceMetric label="Real Solana USDC balance" value={solanaUsdcBalanceDisplay.value} detail={solanaUsdcBalanceDisplay.detail} note={solanaUsdcBalanceDisplay.note} badges={solanaUsdcBalanceDisplay.badges} action={<button aria-label="Refresh real Solana USDC balance" className="secondary-button compact" disabled={!connected || solanaUsdcBalance.state.status === "loading"} onClick={() => { void solanaUsdcBalance.refresh(); }} type="button">Refresh</button>} /><BalanceMetric label="Real Injective USDC balance" value={injectiveUsdcBalanceDisplay.value} detail={injectiveUsdcBalanceDisplay.detail} note={injectiveUsdcBalanceDisplay.note} badges={injectiveUsdcBalanceDisplay.badges} action={<button aria-label="Refresh real Injective USDC balance" className="secondary-button compact" disabled={!injectiveWallet.isConnected || injectiveUsdcBalance.state.status === "loading"} onClick={() => { void injectiveUsdcBalance.refresh(); }} type="button">Refresh</button>} /></div>
          <p className="status-banner warning">Testnet balances are shown for visibility before execution.</p>
          <Metric label="Gas credits" value={`${remainingGasCredits}/${gasCredits.dailyLimit}`} detail="Sponsored transfers today" />
          <DetailList entries={[["Solana wallet", connected ? solanaAddress : "Connect wallet or refresh balance"], ["Injective wallet", injectiveWallet.isConnected ? `${injectiveWallet.wallet ?? "Selected wallet"}: ${injectiveWallet.address}` : "Connect wallet or refresh balance"], ["Coming later", `Base, Arbitrum, and EVM wallet support`], ["Allowed destinations", rules.allowedDestinationChains.join(", ")], ["Approval threshold", `${rules.approvalThreshold} USDC`], ["Router state", rules.emergencyPauseEnabled ? "Emergency paused" : ruleResult.status === "denied" ? "Payment denied" : "Ready"]]} />
          <div className="button-row"><Link className="primary-button" href="/app/agent">Start payment</Link><Link className="secondary-button" href="/app/rules">Review rules</Link></div>
        </div>
        <div className="dashboard-stack">
          <WalletsCard />
        </div>
      </section>
    </>
  );
}

function BalanceMetric({
  label,
  value,
  detail,
  note,
  badges,
  action,
}: {
  label: string;
  value: string;
  detail: string;
  note?: string;
  badges: string[];
  action?: ReactNode;
}) {
  return (
    <div className="metric">
      <div className="metric-heading">
        <span>{label}</span>
        {action}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
      {note ? <small>{note}</small> : null}
      {badges.length > 0 ? <div className="balance-badges">{badges.map((badge) => <span className="balance-badge" key={badge}>{badge}</span>)}</div> : null}
    </div>
  );
}

type SolBalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; balanceSol: number }
  | { status: "error"; error: string };

function formatSolBalance(state: SolBalanceState): { value: string; detail: string; note?: string; badges: string[] } {
  if (state.status === "loading") {
    return { value: "Loading...", detail: "Reading devnet SOL balance", badges: ["Devnet", "Real balance"] };
  }

  if (state.status === "success") {
    return {
      value: `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(state.balanceSol)} SOL`,
      detail: "Read from Solana devnet",
      badges: ["Devnet", "Real balance"],
    };
  }

  if (state.status === "error") {
    return { value: "Unavailable", detail: "Could not read devnet SOL balance", note: state.error, badges: ["Devnet", "Error"] };
  }

  return { value: "Connect wallet or refresh balance", detail: "Connect a Solana wallet to read devnet SOL", badges: ["Devnet"] };
}

function formatSolanaUsdcBalance(state: SolanaUsdcBalanceState): { value: string; detail: string; note?: string; badges: string[] } {
  if (state.status === "loading") {
    return { value: "Loading...", detail: "Reading devnet USDC token account", badges: ["Devnet", "Real balance"] };
  }

  if (state.status === "success") {
    return {
      value: `${state.balanceUsdc} USDC`,
      detail: "Read from Solana devnet USDC mint",
      badges: ["Devnet", "Real balance"],
    };
  }

  if (state.status === "error") {
    return { value: "Unavailable", detail: "Could not read devnet USDC balance", note: state.error, badges: ["Devnet", "Error"] };
  }

  return { value: "Connect wallet or refresh balance", detail: "Connect a Solana wallet to read devnet USDC", badges: ["Devnet"] };
}

function formatInjectiveUsdcBalance(state: InjectiveUsdcBalanceState): { value: string; detail: string; note?: string; badges: string[] } {
  if (state.status === "loading") {
    return { value: "Loading...", detail: "Reading Injective testnet CCTP USDC balance", badges: ["Testnet", "Real balance"] };
  }

  if (state.status === "success") {
    return {
      value: `${state.balanceUsdc} USDC`,
      detail: "Read from Injective testnet CCTP USDC denom",
      badges: ["Testnet", "Real balance"],
    };
  }

  if (state.status === "error") {
    return { value: "Unavailable", detail: "Could not read Injective testnet USDC balance", note: state.error, badges: ["Testnet", "Error"] };
  }

  return { value: "Connect wallet or refresh balance", detail: "Connect an Injective wallet to read testnet USDC", badges: ["Testnet"] };
}

function formatInjBalance(state: ReturnType<typeof useInjectiveNativeBalance>["state"]): { value: string; detail: string; note?: string; badges: string[] } {
  if (state.status === "loading") {
    return { value: "Loading...", detail: "Reading Injective testnet INJ balance", badges: ["Testnet", "Real balance"] };
  }

  if (state.status === "success") {
    return {
      value: state.balanceInj,
      detail: "Read from Injective testnet",
      badges: ["Testnet", "Real balance"],
    };
  }

  if (state.status === "error") {
    return { value: "Unavailable", detail: "Could not read testnet INJ balance", note: state.error, badges: ["Testnet", "Error"] };
  }

  return { value: "Connect wallet or refresh balance", detail: "Connect an Injective wallet to read testnet INJ", badges: ["Testnet"] };
}

function WalletsCard() {
  const { connected, connecting, publicKey } = useWallet();
  const injectiveWallet = useInjectiveWallet();
  const injectiveEvmWallet = useInjectiveEvmWallet();
  const [isInjectivePickerOpen, setIsInjectivePickerOpen] = useState(false);
  const solanaAddress = publicKey?.toBase58() ?? "";
  const solanaStatus = connecting ? "connecting" : connected ? "connected" : "disconnected";
  const injectiveWallets = ["Keplr", "Leap", "Ninji"] as const;
  const evmChainOk = injectiveEvmWallet.chainId.toLowerCase() === INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX;

  return (
    <div className="card">
      <p className="eyebrow">Wallets</p>
      <div className="wallet-list">
        <div className="wallet-row">
          <div>
            <strong>Solana wallet</strong>
            <span>{connected ? shortenWalletAddress(solanaAddress) : "Not connected"}</span>
            {connected ? <span className="wallet-full-address">{solanaAddress}</span> : null}
          </div>
          <div className="wallet-actions">
            <span className={`wallet-status ${solanaStatus}`}>{solanaStatus}</span>
            <SolanaWalletButton />
          </div>
        </div>
        <div className="wallet-row">
          <div>
            <strong>Injective wallet</strong>
            <span>{injectiveWallet.isConnected ? `${injectiveWallet.wallet} - ${injectiveWallet.shortAddress}` : "Not connected"}</span>
            {injectiveWallet.isConnected ? <span className="wallet-full-address" title={injectiveWallet.address}>{injectiveWallet.address}</span> : null}
            {injectiveWallet.error ? <span aria-live="polite" className="wallet-error">{injectiveWallet.error}</span> : null}
          </div>
          <div className="wallet-actions">
            <span aria-live="polite" className={`wallet-status ${injectiveWallet.connectionStatus}`}>{injectiveWallet.connectionStatus}</span>
            {injectiveWallet.isConnected ? (
              <button className="secondary-button compact" onClick={injectiveWallet.disconnect} type="button">Disconnect</button>
            ) : (
              <div className="wallet-picker">
                <button aria-expanded={isInjectivePickerOpen} className="primary-button compact" disabled={injectiveWallet.connectionStatus === "connecting"} onClick={() => setIsInjectivePickerOpen((isOpen) => !isOpen)} type="button">Connect Injective Wallet</button>
                {isInjectivePickerOpen ? (
                  <div className="wallet-menu">
                    {injectiveWallets.map((walletName) => (
                      <button key={walletName} onClick={() => { setIsInjectivePickerOpen(false); void injectiveWallet.connect(walletName); }} type="button">{walletName}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
        <div className="wallet-row">
          <div>
            <strong>Injective EVM wallet</strong>
            <span>{injectiveEvmWallet.isConnected ? injectiveEvmWallet.shortAddress : "Not connected"}</span>
            {injectiveEvmWallet.isConnected ? <span className="wallet-full-address" title={injectiveEvmWallet.address}>{injectiveEvmWallet.address}</span> : null}
            {injectiveEvmWallet.isConnected ? <span className="wallet-detail">Chain: {injectiveEvmWallet.chainIdDecimal || "Unknown"} {evmChainOk ? "✓" : "— expected 1439"}</span> : null}
            {injectiveEvmWallet.balance.status === "success" ? <span className="wallet-detail">USDC: {injectiveEvmWallet.balance.usdc}</span> : null}
            {injectiveEvmWallet.error ? <span aria-live="polite" className="wallet-error">{injectiveEvmWallet.error}</span> : null}
          </div>
          <div className="wallet-actions">
            <span aria-live="polite" className={`wallet-status ${injectiveEvmWallet.connectionStatus}`}>{injectiveEvmWallet.connectionStatus}</span>
            {injectiveEvmWallet.isConnected ? (
              <>
                {!evmChainOk ? (
                  <button className="secondary-button compact" onClick={() => { void injectiveEvmWallet.switchToInjectiveEvmTestnet(); }} type="button">Switch to Injective EVM Testnet</button>
                ) : null}
                <button className="secondary-button compact" onClick={injectiveEvmWallet.disconnect} type="button">Disconnect</button>
              </>
            ) : (
              <button className="primary-button compact" disabled={injectiveEvmWallet.connectionStatus === "connecting"} onClick={() => { void injectiveEvmWallet.connect(); }} type="button">Connect Injective EVM Wallet</button>
            )}
          </div>
        </div>
        <p className="wallet-note">Wallet connection and displayed balances use testnet data.</p>
      </div>
    </div>
  );
}

function shortenWalletAddress(address: string): string {
  if (!address) {
    return "Not connected";
  }

  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}
