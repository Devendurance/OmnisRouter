"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHero, DetailList } from "../components";
import { injectiveTestnetTxUrl, shortenHash } from "../../../lib/explorers";
import type { ReactNode } from "react";

type ReceiptRow = {
  id: string;
  created_at: string;
  route: string;
  status: string;
  execution_mode?: string | null;
  amount_usdc?: string | null;
  cctp_fee_usdc?: string | null;
  estimated_received_usdc?: string | null;
  source_address?: string | null;
  destination_address?: string | null;
  solana_source_address?: string | null;
  solana_usdc_ata?: string | null;
  solana_recipient_address?: string | null;
  injective_recipient_address?: string | null;
  approval_tx?: string | null;
  burn_tx?: string | null;
  relay_tx?: string | null;
  receive_message_tx?: string | null;
  authorization_tx?: string | null;
  relayer_address?: string | null;
  owner_wallet_address?: string | null;
  owner_wallet_type?: string | null;
  gas_sponsor?: string | null;
  source_chain?: string | null;
  destination_chain?: string | null;
};

type WalletSession = {
  authenticated: boolean;
  walletAddress?: string;
  walletType?: string;
};

declare global {
  interface Window {
    solana?: { publicKey?: { toBase58: () => string }; signMessage?: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }> };
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; selectedAddress?: string };
  }
}

function injectiveTxLink(hash: string | null | undefined, fallback: string) {
  if (!hash) return fallback;

  return (
    <a href={injectiveTestnetTxUrl(hash)} target="_blank" rel="noreferrer">
      {shortenHash(hash)}
    </a>
  );
}

function solanaDevnetTxLink(hash: string | null | undefined, fallback: string) {
  if (!hash) return fallback;

  return (
    <a href={`https://explorer.solana.com/tx/${hash}?cluster=devnet`} target="_blank" rel="noreferrer">
      {shortenHash(hash)}
    </a>
  );
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function humanizeStatus(status: string): string {
  if (status === "forwarding-submitted") return "Forwarding submitted";
  return status.replace(/-/g, " ");
}

function isUserOwned(receipt: ReceiptRow) {
  return receipt.owner_wallet_type === "injective-evm" || receipt.owner_wallet_type === "solana";
}

function isSolanaToInjective(receipt: ReceiptRow) {
  return receipt.route === "solana-to-injective";
}

function isServerFunded(receipt: ReceiptRow) {
  return receipt.owner_wallet_type === "executor-demo" || receipt.execution_mode === "server-funded-testnet-executor";
}

function routeLabel(receipt: ReceiptRow) {
  if (isSolanaToInjective(receipt)) return "Solana -> Injective";
  if (isUserOwned(receipt)) return "Injective -> Solana (User-owned)";
  return "Injective -> Solana";
}

function amount(value: string | number | null | undefined, fallback = "0") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function receiptEntries(receipt: ReceiptRow): [string, ReactNode][] {
  const visible = (entries: [string, ReactNode][]) => entries.filter(([, v]) => v !== null && v !== undefined && v !== "");

  if (isUserOwned(receipt) || (isServerFunded(receipt) && receipt.authorization_tx)) {
    return visible([
      ["Created", formatTime(receipt.created_at)],
      ["Status", humanizeStatus(receipt.status)],
      ["Execution mode", "User-authorized, OmnisRouter-sponsored"],
      ["Requested amount", `${amount(receipt.amount_usdc)} USDC`],
      ["CCTP fee", `${amount(receipt.cctp_fee_usdc)} USDC`],
      ["Estimated received", `${amount(receipt.estimated_received_usdc)} USDC`],
      ["Gas sponsor", receipt.gas_sponsor ?? "OmnisRouter"],
      ["User EVM source address", receipt.source_address],
      ["OmnisRouter relayer/sponsor", receipt.relayer_address],
      ["Solana recipient", receipt.solana_recipient_address ?? receipt.destination_address],
      ["Solana ATA", receipt.solana_usdc_ata],
      ["Authorization Tx", injectiveTxLink(receipt.authorization_tx, "Pending")],
      ["Approval Tx", injectiveTxLink(receipt.approval_tx, "Not needed")],
      ["Burn Tx", injectiveTxLink(receipt.burn_tx, "Pending")],
    ]);
  }

  if (isSolanaToInjective(receipt)) {
    return visible([
      ["Created", formatTime(receipt.created_at)],
      ["Status", humanizeStatus(receipt.status)],
      ["Requested amount", `${amount(receipt.amount_usdc)} USDC`],
      ["CCTP fee", `${amount(receipt.cctp_fee_usdc)} USDC`],
      ["Estimated received", `${amount(receipt.estimated_received_usdc)} USDC`],
      ["Gas sponsor", receipt.gas_sponsor ?? "OmnisRouter"],
      ["Solana Source Address", receipt.solana_source_address],
      ["Solana USDC ATA", receipt.solana_usdc_ata],
      ["Injective Recipient", receipt.injective_recipient_address],
      ["Burn Tx", solanaDevnetTxLink(receipt.burn_tx, "Pending")],
      ["Relay Tx / ReceiveMessage Tx", injectiveTxLink(receipt.receive_message_tx ?? receipt.relay_tx, "")],
    ]);
  }

  return visible([
    ["Created", formatTime(receipt.created_at)],
    ["Status", humanizeStatus(receipt.status)],
    ["Requested amount", `${amount(receipt.amount_usdc)} USDC`],
    ["Forwarding fee", `${amount(receipt.cctp_fee_usdc)} USDC`],
    ["Estimated received", `${amount(receipt.estimated_received_usdc)} USDC`],
    ["Gas sponsor", receipt.gas_sponsor ?? "OmnisRouter"],
    ["Source EVM Address", receipt.source_address],
    ["Solana Recipient", receipt.solana_recipient_address ?? receipt.destination_address],
    ["Approval Tx", injectiveTxLink(receipt.approval_tx, "Approval skipped")],
    ["Forwarding/Burn Tx", injectiveTxLink(receipt.burn_tx, "Pending")],
  ]);
}

function receiptNote(receipt: ReceiptRow) {
  if (isUserOwned(receipt) || receipt.authorization_tx) {
    return "User authorized USDC movement with EIP-3009. OmnisRouter paid Injective gas and forwarded through Circle CCTP. Solana mint is handled by Circle's Forwarding Service.";
  }

  if (!isSolanaToInjective(receipt)) {
    return "Solana mint is handled by Circle's Forwarding Service. OmnisRouter stores the Injective approval and burn transaction proof.";
  }

  return "USDC was burned on Solana, attested by Circle Iris, then manually relayed to Injective through receiveMessage. OmnisRouter stores the burn and relay proof.";
}

export default function ReceiptPage() {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [signInState, setSignInState] = useState<{ status: "idle" | "loading" | "error"; error?: string }>({ status: "idle" });
  const didFetchRef = useRef(false);

  const fetchSession = useCallback(async () => {
    setSessionLoading(true);

    try {
      const response = await fetch("/api/auth/wallet/session");
      const data = await response.json() as WalletSession;

      setSession(data);
      return data;
    } catch {
      setSession({ authenticated: false });
      return { authenticated: false };
    } finally {
      setSessionLoading(false);
    }
  }, []);

  const loadReceipts = useCallback(async () => {
    setReceiptsLoading(true);

    try {
      const response = await fetch("/api/receipts/mine");

      if (!response.ok) {
        setReceipts([]);
        return;
      }

      const data = await response.json() as { ok: boolean; receipts: ReceiptRow[]; walletType?: string };

      setReceipts(data.receipts ?? []);
      return data;
    } catch {
      setReceipts([]);
      return null;
    } finally {
      setReceiptsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (didFetchRef.current) return;

    let cancelled = false;
    didFetchRef.current = true;

    (async () => {
      const sessionData = await fetchSession();

      if (cancelled) return;

      if (sessionData.authenticated) {
        await loadReceipts();
      }
    })();

    return () => { cancelled = true; };
  }, [fetchSession, loadReceipts]);

  async function signIn(walletType: "solana" | "injective-evm") {
    setSignInState({ status: "loading" });

    try {
      let walletAddress = "";

      if (walletType === "solana") {
        walletAddress = window.solana?.publicKey?.toBase58() || "";
        if (!walletAddress) throw new Error("Solana wallet not connected.");
      } else {
        walletAddress = (window as Window & { ethereum?: { selectedAddress?: string } }).ethereum?.selectedAddress || "";
        if (!walletAddress) {
          const accounts = await window.ethereum!.request({ method: "eth_requestAccounts" });
          walletAddress = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
        }

        if (!walletAddress) throw new Error("EVM wallet not connected.");
      }

      const challengeRes = await fetch("/api/auth/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, walletType }),
      });
      const challengeData = await challengeRes.json() as { ok: boolean; error?: string; challengeId?: string; message?: string };

      if (!challengeData.ok || !challengeData.challengeId || !challengeData.message) {
        throw new Error(challengeData.error || "Could not create sign-in challenge.");
      }

      let signature = "";

      if (walletType === "solana") {
        if (!window.solana?.signMessage) throw new Error("Solana signMessage not available.");
        const encoded = new TextEncoder().encode(challengeData.message);
        const result = await window.solana.signMessage(encoded, "utf8");
        signature = Buffer.from(result.signature).toString("hex");
        if (!signature.startsWith("0x")) signature = `0x${signature}`;
      } else {
        const ethereum = window.ethereum;
        if (!ethereum) throw new Error("No EVM wallet provider found.");
        signature = await ethereum.request({
          method: "personal_sign",
          params: [challengeData.message, walletAddress],
        }) as string;
      }

      const verifyRes = await fetch("/api/auth/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, walletType, challengeId: challengeData.challengeId, signature }),
      });
      const verifyData = await verifyRes.json() as { ok: boolean; error?: string };

      if (!verifyData.ok) {
        throw new Error(verifyData.error || "Signature verification failed.");
      }

      setSignInState({ status: "idle" });
      await fetchSession();
      await loadReceipts();
    } catch (error) {
      setSignInState({ status: "error", error: error instanceof Error ? error.message : "Sign-in failed." });
    }
  }

  async function signOut() {
    await fetch("/api/auth/wallet/logout", { method: "POST" });
    setSession({ authenticated: false });
    setReceipts([]);
  }

  if (sessionLoading) {
    return (
      <>
        <AppHero eyebrow="Receipt" title={<>Payment <em>receipts.</em></>} copy="" />
        <section className="content-grid"><div className="card receipt-card"><p className="status-banner warning">Loading session...</p></div></section>
      </>
    );
  }

  return (
    <>
      <AppHero eyebrow="Receipt" title={<>Payment <em>receipts.</em></>} copy={session?.authenticated ? `Signed in as ${session.walletAddress}` : "Sign in to view your receipts."} />

      <section className="content-grid" aria-labelledby="real-receipts-title">
        <div className="card receipt-card">
          <p className="eyebrow">Receipts</p>
          <h2 id="real-receipts-title">CCTP Receipts</h2>

          {!session?.authenticated ? (
            <>
              <p className="status-banner warning">Sign in with your wallet to view your receipts.</p>
              <div className="button-row cctp-action-row">
                <button
                  className="secondary-button"
                  disabled={signInState.status === "loading"}
                  onClick={() => signIn("solana")}
                  type="button"
                >
                  {signInState.status === "loading" ? "Signing in..." : "Sign in with Solana wallet"}
                </button>
                <button
                  className="secondary-button"
                  disabled={signInState.status === "loading"}
                  onClick={() => signIn("injective-evm")}
                  type="button"
                >
                  {signInState.status === "loading" ? "Signing in..." : "Sign in with Injective EVM wallet"}
                </button>
              </div>
              {signInState.status === "error" ? <p className="status-banner error">{signInState.error}</p> : null}
            </>
          ) : null}

          {session?.authenticated ? (
            <>
              <div className="button-row cctp-action-row">
                <Link className="secondary-button" href="/app/approval">New transfer</Link>
                <button className="secondary-button" onClick={signOut} type="button">Sign out</button>
              </div>

              {receiptsLoading ? <p className="status-banner warning">Loading receipts...</p> : null}

              {!receiptsLoading && receipts.length === 0 ? (
                <>
                  {session?.walletType === "solana" ? (
                    <p className="status-banner warning">No Solana-owned receipts found for this signed-in wallet yet.</p>
                  ) : session?.walletType === "injective-evm" ? (
                    <p className="status-banner warning">No Injective EVM receipts found for this signed-in wallet yet.</p>
                  ) : (
                    <p className="status-banner warning">No receipts found for this signed-in wallet yet. Execute a testnet route to generate one.</p>
                  )}
                  <p className="status-banner warning">Receipts are scoped to the signed-in wallet. Sign out and sign in with another wallet to view that wallet&apos;s receipts.</p>
                </>
              ) : null}

              <div className="dashboard-stack">
                {receipts.map((receipt) => (
                  <div className="card cctp-lab-card" key={receipt.id}>
                    <p className="eyebrow">{routeLabel(receipt)}</p>
                    <DetailList split entries={receiptEntries(receipt)} />
                    <p className="status-banner success">{receiptNote(receipt)}</p>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
