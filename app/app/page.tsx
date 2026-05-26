"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppHero, DetailList, Metric, RecentPayments } from "./components";
import { useInjectiveWallet } from "./InjectiveWalletProvider";
import { useProductState, type WalletState } from "./product-state";
import SolanaWalletButton from "./SolanaWalletButton";
import { useInjectiveNativeBalance } from "./useInjectiveNativeBalance";

export default function DashboardPage() {
  const { balances, wallets, rules, gasCredits, remainingGasCredits, ruleResult, resetMockState } = useProductState();
  const enabledBalances = Object.entries(balances).filter(([, balance]) => balance.enabled);
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const [solBalanceState, setSolBalanceState] = useState<SolBalanceState>({ status: "idle" });
  const solBalanceRequestRef = useRef(0);
  const injectiveWallet = useInjectiveWallet();
  const injBalance = useInjectiveNativeBalance(injectiveWallet.isConnected ? injectiveWallet.address : "");
  const solanaAddress = publicKey?.toBase58() ?? "";
  const solanaDetail = connected ? `${shortenWalletAddress(solanaAddress)} / ${solanaAddress}` : "No Solana wallet connected";
  const injectiveDetail = injectiveWallet.isConnected
    ? `${injectiveWallet.wallet ?? "Injective wallet"} / ${injectiveWallet.shortAddress} / ${injectiveWallet.address}`
    : "No Injective wallet connected";

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
  const injBalanceDisplay = formatInjBalance(injBalance.state);

  return (
    <>
      <AppHero eyebrow="Mock AI stablecoin router" title={<>Plain-English USDC payments with <em>visible control.</em></>} copy="This dashboard uses saved local rules, deterministic checks, and simulated CCTP routing between Solana and Injective. No blockchain transactions are submitted." />
      <section className="content-grid two-col" aria-labelledby="dashboard-title">
        <div className="card primary-card">
          <p className="eyebrow">Dashboard</p>
          <h2 id="dashboard-title">Mock wallet state</h2>
          <div className="metric-row"><BalanceMetric label="Native SOL gas balance" value={solBalanceDisplay.value} detail={solBalanceDisplay.detail} note={solBalanceDisplay.note} badges={solBalanceDisplay.badges} action={<button aria-label="Refresh native SOL gas balance" className="secondary-button compact" disabled={!connected || solBalanceState.status === "loading"} onClick={() => { void refreshSolBalance(); }} type="button">Refresh</button>} /><BalanceMetric label="Native INJ gas balance" value={injBalanceDisplay.value} detail={injBalanceDisplay.detail} note={injBalanceDisplay.note} badges={injBalanceDisplay.badges} action={<button aria-label="Refresh native INJ gas balance" className="secondary-button compact" disabled={!injectiveWallet.isConnected || injBalance.state.status === "loading"} onClick={() => { void injBalance.refresh(); }} type="button">Refresh</button>} /><BalanceMetric label="Demo USDC balance" value={balances.Solana.USDC.toFixed(2)} detail={solanaDetail} note={connected ? undefined : "Demo balance shown."} badges={connected ? ["Connected wallet", "Demo balance"] : []} /><BalanceMetric label="Demo Injective USDC balance" value={balances.Injective.USDC.toFixed(2)} detail={injectiveDetail} note={injectiveWallet.isConnected ? undefined : "Demo balance shown."} badges={injectiveWallet.isConnected ? ["Connected wallet", "Demo balance"] : []} /></div>
          <p className="status-banner warning">SOL balance is real. INJ balance is real. Demo USDC balance is still simulated.</p>
          <Metric label="Gas credits" value={`${remainingGasCredits}/${gasCredits.monthlyLimit}`} detail="Sponsored transfers" />
          <DetailList entries={[["Solana wallet", connected ? solanaAddress : "No Solana wallet connected - using demo balance"], ["Injective wallet", injectiveWallet.isConnected ? `${injectiveWallet.wallet ?? "Selected wallet"}: ${injectiveWallet.address}` : "No Injective wallet connected - using demo balance"], ["Mock balances", enabledBalances.map(([chain, balance]) => `${chain}: ${balance.USDC.toFixed(2)} USDC`).join(" / ")], ["Coming later", `Base, Arbitrum, and EVM wallet support`], ["Allowed destinations", rules.allowedDestinationChains.join(", ")], ["Approval threshold", `${rules.approvalThreshold} USDC`], ["Router state", rules.emergencyPauseEnabled ? "Emergency paused" : ruleResult.status === "denied" ? "Payment denied" : "Ready"]]} />
          <div className="button-row"><Link className="primary-button" href="/app/agent">Start mock payment</Link><Link className="secondary-button" href="/app/rules">Review rules</Link><button className="secondary-button" onClick={resetMockState} type="button">Reset mock state</button></div>
        </div>
        <div className="dashboard-stack">
          <WalletsCard wallets={wallets} />
          <RecentPayments />
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

  return { value: "Connect wallet", detail: "Connect a Solana wallet to read devnet SOL", badges: ["Devnet"] };
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

  return { value: "Connect wallet", detail: "Connect an Injective wallet to read testnet INJ", badges: ["Testnet"] };
}

function WalletsCard({
  wallets,
}: {
  wallets: Record<WalletState["chain"], WalletState>;
}) {
  const { connected, connecting, publicKey } = useWallet();
  const injectiveWallet = useInjectiveWallet();
  const [isInjectivePickerOpen, setIsInjectivePickerOpen] = useState(false);
  const solanaAddress = publicKey?.toBase58() ?? "";
  const solanaStatus = connecting ? "connecting" : connected ? "connected" : "disconnected";
  const injectiveWallets = ["Keplr", "Leap", "Ninji"] as const;
  const evmWallet = wallets.EVM;

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
            <strong>EVM wallet</strong>
            <span>Coming later</span>
          </div>
          <div className="wallet-actions">
            <span className={`wallet-status ${evmWallet.connectionStatus}`}>coming later</span>
            <button className="secondary-button compact" disabled type="button">Connect</button>
          </div>
        </div>
        <p className="wallet-note">Wallet connection is real. USDC balances and transfers are still simulated.</p>
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
