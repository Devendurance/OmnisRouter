"use client";

import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

export default function SolanaWalletButton() {
  return <WalletMultiButton className="wallet-adapter-button compact" />;
}
