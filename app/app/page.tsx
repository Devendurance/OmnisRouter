"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { isDevelopment } from "../../lib/server/feature-flags";
import { AppHero, DetailList, Metric } from "./components";
import { useInjectiveEvmWallet, INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX, INJECTIVE_EVM_TESTNET_CHAIN_ID } from "./InjectiveEvmWalletProvider";
import type { EvmProviderInfo } from "./InjectiveEvmWalletProvider";
import { useInjectiveWallet } from "./InjectiveWalletProvider";
import { useProductState } from "./product-state";
import SolanaWalletButton from "./SolanaWalletButton";
import { useSolanaUsdcBalance, type SolanaUsdcBalanceState } from "./useSolanaUsdcBalance";

export default function DashboardPage() {
  const { rules, gasCredits, remainingGasCredits, ruleResult } = useProductState();
  const { connection } = useConnection();
  const { connected: solanaConnected, publicKey } = useWallet();
  const [solBalanceState, setSolBalanceState] = useState<SolBalanceState>({ status: "idle" });
  const solBalanceRequestRef = useRef(0);
  const injectiveWallet = useInjectiveWallet();
  const injectiveEvmWallet = useInjectiveEvmWallet();
  const solanaUsdcBalance = useSolanaUsdcBalance();
  const solanaAddress = publicKey?.toBase58() ?? "";

  async function refreshSolBalance() {
    if (!solanaConnected || !publicKey) { setSolBalanceState({ status: "idle" }); return; }
    const currentPublicKey = publicKey;
    const requestId = ++solBalanceRequestRef.current;
    setSolBalanceState({ status: "loading" });
    try {
      const lamports = await connection.getBalance(currentPublicKey);
      if (solBalanceRequestRef.current === requestId) setSolBalanceState({ status: "success", balanceSol: lamports / LAMPORTS_PER_SOL });
    } catch (error) {
      if (solBalanceRequestRef.current === requestId) setSolBalanceState({ status: "error", error: error instanceof Error ? error.message : "Unable to read SOL balance." });
    }
  }

  useEffect(() => {
    if (!solanaConnected || !publicKey) return;
    const requestId = ++solBalanceRequestRef.current;
    const currentPublicKey = publicKey;
    (async () => {
      setSolBalanceState({ status: "loading" });
      try {
        const lamports = await connection.getBalance(currentPublicKey);
        if (solBalanceRequestRef.current === requestId) setSolBalanceState({ status: "success", balanceSol: lamports / LAMPORTS_PER_SOL });
      } catch (error) {
        if (solBalanceRequestRef.current === requestId) setSolBalanceState({ status: "error", error: error instanceof Error ? error.message : "Unable to read SOL balance." });
      }
    })();
  }, [solanaConnected, connection, publicKey]);

  const hasAnyWallet = solanaConnected || injectiveEvmWallet.isConnected || injectiveWallet.isConnected;
  const evmChainOk = injectiveEvmWallet.chainId.toLowerCase() === INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX;
  const showNativeInjCollapsed = injectiveWallet.isConnected && (solanaConnected || injectiveEvmWallet.isConnected);

  return (
    <>
      <AppHero eyebrow="AI stablecoin router" title={<>Plain-English USDC payments with <em>visible control.</em></>} copy="Connect wallets, review route readiness, and monitor testnet gas and USDC balances before execution." />
      <section className="content-grid two-col" aria-labelledby="dashboard-title">
        <div className="card primary-card">
          <p className="eyebrow">Dashboard</p>
          <h2 id="dashboard-title">Connected wallets</h2>
          <p className="wallet-note">Only connected wallets are shown here.</p>

          {!hasAnyWallet ? (
            <p className="status-banner warning">Connect a wallet to see balances and available routes.</p>
          ) : null}

          <div className="dashboard-stack">
            {solanaConnected ? (
              <div className="wallet-balance-card">
                <div className="wallet-card-header">
                  <strong>Solana wallet</strong>
                  <div className="wallet-actions">
                    <span className="wallet-status connected">connected</span>
                    <SolanaWalletButton />
                  </div>
                </div>
                <div className="wallet-address-row">
                  <span className="wallet-full-address">{solanaAddress}</span>
                </div>
                <DetailList entries={[
                  ["SOL balance", formatSolBalanceText(solBalanceState)],
                  ["SOL USDC balance", formatSolanaUsdcBalanceText(solanaUsdcBalance.state)],
                  ["Network", "Solana devnet"],
                ]} />
                <div className="button-row wallet-card-buttons">
                  <button className="secondary-button compact" disabled={!solanaConnected || solBalanceState.status === "loading"} onClick={refreshSolBalance} type="button">Refresh</button>
                </div>
              </div>
            ) : null}

            {injectiveEvmWallet.isConnected ? (
              <div className="wallet-balance-card">
                <div className="wallet-card-header">
                  <strong>Injective EVM wallet</strong>
                  {injectiveEvmWallet.providerName ? <span className="wallet-detail">{injectiveEvmWallet.providerName}</span> : null}
                  <div className="wallet-actions">
                    <span className={`wallet-status ${evmChainOk ? "connected" : "error"}`}>{evmChainOk ? "Ready" : "Wrong network"}</span>
                    {injectiveEvmWallet.isConnected ? <button className="secondary-button compact" onClick={injectiveEvmWallet.disconnect} type="button">Disconnect</button> : null}
                  </div>
                </div>
                <div className="wallet-address-row">
                  <span className="wallet-full-address">{injectiveEvmWallet.address}</span>
                </div>
                <DetailList entries={[
                  ["Active chainId", injectiveEvmWallet.chainIdDecimal ? `${injectiveEvmWallet.chainIdDecimal} / ${injectiveEvmWallet.chainId}` : "Unknown"],
                  ["Required chainId", `${INJECTIVE_EVM_TESTNET_CHAIN_ID} / ${INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX}`],
                  ["INJ balance", injectiveEvmWallet.balance.status === "success" ? `${injectiveEvmWallet.balance.inj} INJ` : injectiveEvmWallet.balance.status === "loading" ? "Loading..." : "Unavailable"],
                  ["USDC balance", injectiveEvmWallet.balance.status === "success" ? `${injectiveEvmWallet.balance.usdc} USDC` : injectiveEvmWallet.balance.status === "loading" ? "Loading..." : "Unavailable"],
                ]} />
                <div className="button-row wallet-card-buttons">
                  {!evmChainOk ? <button className="secondary-button compact" onClick={() => { void injectiveEvmWallet.switchToInjectiveEvmTestnet(); }} type="button">Switch to Injective EVM Testnet</button> : null}
                  <button className="secondary-button compact" disabled={injectiveEvmWallet.balance.status === "loading"} onClick={() => { void injectiveEvmWallet.refreshBalance(); }} type="button">Refresh</button>
                </div>
                {!evmChainOk ? <p className="status-banner error">Wrong network for user-owned gasless CCTP.</p> : null}
              </div>
            ) : null}

            {injectiveWallet.isConnected ? (
              showNativeInjCollapsed ? (
                <p className="wallet-note">Additional wallet connected: Native Injective — {injectiveWallet.shortAddress}</p>
              ) : (
                <div className="wallet-balance-card">
                  <div className="wallet-card-header">
                    <strong>Native Injective wallet</strong>
                    <div className="wallet-actions">
                      <span className={`wallet-status ${injectiveWallet.connectionStatus}`}>{injectiveWallet.connectionStatus}</span>
                      {injectiveWallet.isConnected ? <button className="secondary-button compact" onClick={injectiveWallet.disconnect} type="button">Disconnect</button> : null}
                    </div>
                  </div>
                  <div className="wallet-address-row">
                    <span className="wallet-full-address" title={injectiveWallet.address}>{injectiveWallet.address}</span>
                  </div>
                  <DetailList entries={[
                    ["Wallet type", injectiveWallet.wallet ?? "Selected wallet"],
                    ["Note", "Native mode is available for Injective identity. User-owned gasless CCTP currently uses Injective EVM wallet mode."],
                  ]} />
                </div>
              )
            ) : null}
          </div>

          {isDevelopment ? <Metric label="Gas credits" value={`${remainingGasCredits}/${gasCredits.dailyLimit}`} detail="Sponsored transfers today" /> : null}
          <DetailList entries={[
            ["Router state", rules.emergencyPauseEnabled ? "Emergency paused" : ruleResult.status === "denied" ? "Payment denied" : "Ready"],
          ]} />
          <div className="button-row">
            <Link className="primary-button" href="/app/agent">Start payment</Link>
            <Link className="secondary-button" href="/app/rules">Review rules</Link>
          </div>
        </div>

        <div className="dashboard-stack">
          <div className="card">
            <p className="eyebrow">Wallet actions</p>
            <div className="wallet-list">
              {!solanaConnected ? (
                <div className="wallet-row">
                  <div><strong>Solana wallet</strong><span>Not connected</span></div>
                  <div className="wallet-actions"><span className="wallet-status disconnected">disconnected</span><SolanaWalletButton /></div>
                </div>
              ) : null}
              {!injectiveEvmWallet.isConnected ? (
                <div className="wallet-row">
                  <div><strong>Injective EVM wallet</strong><span>Not connected</span></div>
                  <div className="wallet-actions">
                    <span className="wallet-status disconnected">disconnected</span>
                    <button className="primary-button compact" disabled={injectiveEvmWallet.connectionStatus === "connecting"} onClick={() => { void injectiveEvmWallet.connect(); }} type="button">Connect</button>
                  </div>
                </div>
              ) : null}
              {injectiveEvmWallet.selectingProvider ? (
                <EVMProviderPicker
                  providers={injectiveEvmWallet.detectedProviders}
                  onSelect={(info) => { void injectiveEvmWallet.selectProvider(info); }}
                  onCancel={injectiveEvmWallet.cancelProviderSelection}
                />
              ) : null}
              {!injectiveWallet.isConnected ? (
                <div className="wallet-row">
                  <div><strong>Native Injective wallet</strong><span>Not connected</span></div>
                  <div className="wallet-actions">
                    <span className="wallet-status disconnected">disconnected</span>
                    <ConnectNativeInjectiveButton />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="card">
            <p className="eyebrow">Receipts</p>
            <p className="status-banner success">View your private wallet-scoped CCTP receipts.</p>
            <div className="button-row">
              <Link className="primary-button" href="/app/receipt">View receipts</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function ConnectNativeInjectiveButton() {
  const injectiveWallet = useInjectiveWallet();
  const [isOpen, setIsOpen] = useState(false);
  const injectiveWallets = ["Keplr", "Leap", "Ninji"] as const;

  return (
    <div className="wallet-picker">
      <button aria-expanded={isOpen} className="primary-button compact" disabled={injectiveWallet.connectionStatus === "connecting"} onClick={() => setIsOpen((o) => !o)} type="button">Connect</button>
      {isOpen ? (
        <div className="wallet-menu">
          {injectiveWallets.map((w) => (
            <button key={w} onClick={() => { setIsOpen(false); void injectiveWallet.connect(w); }} type="button">{w}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type SolBalanceState = { status: "idle" } | { status: "loading" } | { status: "success"; balanceSol: number } | { status: "error"; error: string };

function formatSolBalanceText(state: SolBalanceState): string {
  if (state.status === "loading") return "Loading...";
  if (state.status === "success") return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(state.balanceSol)} SOL`;
  if (state.status === "error") return "Unavailable";
  return "Unavailable";
}

function formatSolanaUsdcBalanceText(state: SolanaUsdcBalanceState): string {
  if (state.status === "loading") return "Loading...";
  if (state.status === "success") return `${state.balanceUsdc} USDC`;
  if (state.status === "error") return "Unavailable";
  return "Unavailable";
}

function EVMProviderPicker({ providers, onSelect, onCancel }: { providers: EvmProviderInfo[]; onSelect: (info: EvmProviderInfo) => void; onCancel: () => void }) {
  return (
    <div className="card">
      <p className="eyebrow">Choose Injective EVM wallet</p>
      <p className="status-banner warning">Choose a wallet that supports Injective EVM testnet. MetaMask, Rabby, OKX, and Brave are recommended.</p>
      {providers.length === 0 ? (
        <p className="status-banner error">No supported Injective EVM wallet detected. Install or enable MetaMask, Rabby, OKX, or Brave.</p>
      ) : (
        <div className="wallet-list">
          {providers.map((info) => (
            <div className="wallet-row" key={info.rdns}>
              <div>
                <strong>{info.name}</strong>
                <span>{info.rdns}</span>
              </div>
              <div className="wallet-actions">
                <button className="primary-button compact" onClick={() => onSelect(info)} type="button">Connect</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="button-row">
        <button className="secondary-button compact" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  );
}
