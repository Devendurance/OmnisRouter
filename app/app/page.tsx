"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useState } from "react";
import { AppHero, DetailList, Metric, RecentPayments } from "./components";
import { useInjectiveWallet } from "./InjectiveWalletProvider";
import { useProductState, type WalletState } from "./product-state";
import SolanaWalletButton from "./SolanaWalletButton";

export default function DashboardPage() {
  const { balances, wallets, rules, gasCredits, remainingGasCredits, ruleResult, resetMockState } = useProductState();
  const enabledBalances = Object.entries(balances).filter(([, balance]) => balance.enabled);
  const { connected, publicKey } = useWallet();
  const injectiveWallet = useInjectiveWallet();
  const solanaAddress = publicKey?.toBase58() ?? "";
  const solanaDetail = connected ? `${shortenWalletAddress(solanaAddress)} / ${solanaAddress}` : "No Solana wallet connected";
  const injectiveDetail = injectiveWallet.isConnected
    ? `${injectiveWallet.wallet ?? "Injective wallet"} / ${injectiveWallet.shortAddress} / ${injectiveWallet.address}`
    : "No Injective wallet connected";

  return (
    <>
      <AppHero eyebrow="Mock AI stablecoin router" title={<>Plain-English USDC payments with <em>visible control.</em></>} copy="This dashboard uses saved local rules, deterministic checks, and simulated CCTP routing between Solana and Injective. No blockchain transactions are submitted." />
      <section className="content-grid two-col" aria-labelledby="dashboard-title">
        <div className="card primary-card">
          <p className="eyebrow">Dashboard</p>
          <h2 id="dashboard-title">Mock wallet state</h2>
          <div className="metric-row"><BalanceMetric label="Solana USDC" value={balances.Solana.USDC.toFixed(2)} detail={solanaDetail} note={connected ? undefined : "Demo balance shown."} badges={connected ? ["Connected wallet", "Demo balance"] : []} /><BalanceMetric label="Injective USDC" value={balances.Injective.USDC.toFixed(2)} detail={injectiveDetail} note={injectiveWallet.isConnected ? undefined : "Demo balance shown."} badges={injectiveWallet.isConnected ? ["Connected wallet", "Demo balance"] : []} /></div>
          <p className="status-banner warning">Wallet connection is real. USDC balances and transfers are still simulated.</p>
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
}: {
  label: string;
  value: string;
  detail: string;
  note?: string;
  badges: string[];
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
      {note ? <small>{note}</small> : null}
      {badges.length > 0 ? <div className="balance-badges">{badges.map((badge) => <span className="balance-badge" key={badge}>{badge}</span>)}</div> : null}
    </div>
  );
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
        <p className="wallet-note">Wallet connection is real. Balances and transfers are still simulated.</p>
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
