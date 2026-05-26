"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, type ParsedAccountData } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";

export const DEVNET_USDC_MINT_ADDRESS = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

const DEVNET_USDC_MINT = new PublicKey(DEVNET_USDC_MINT_ADDRESS);
const DEVNET_USDC_DECIMALS = 6;

export type SolanaUsdcBalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; balanceUsdc: string }
  | { status: "error"; error: string };

export function useSolanaUsdcBalance() {
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();
  const [state, setState] = useState<SolanaUsdcBalanceState>({ status: "idle" });
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!connected || !publicKey) {
      setState({ status: "idle" });
      return;
    }

    const requestId = ++requestRef.current;
    const owner = publicKey;
    setState({ status: "loading" });

    try {
      const response = await connection.getParsedTokenAccountsByOwner(owner, { mint: DEVNET_USDC_MINT });
      const balanceUsdc = formatParsedUsdcBalance(
        response.value.reduce<string>((total, account) => {
          const data = account.account.data as ParsedAccountData;
          const tokenAmount = data.parsed.info.tokenAmount as { amount: string; decimals: number };

          if (tokenAmount.decimals !== DEVNET_USDC_DECIMALS) {
            return total;
          }

          return addIntegerStrings(total, tokenAmount.amount);
        }, "0"),
      );

      if (requestRef.current === requestId) {
        setState({ status: "success", balanceUsdc });
      }
    } catch (error) {
      if (requestRef.current === requestId) {
        setState({
          status: "error",
          error: error instanceof Error ? error.message : "Unable to read Solana USDC balance.",
        });
      }
    }
  }, [connected, connection, publicKey]);

  useEffect(() => {
    if (!connected || !publicKey) {
      requestRef.current += 1;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [connected, publicKey, refresh]);

  return { state, refresh };
}

function formatParsedUsdcBalance(rawAmount: string): string {
  const normalizedAmount = rawAmount.replace(/^0+/, "") || "0";
  const paddedAmount = normalizedAmount.padStart(DEVNET_USDC_DECIMALS + 1, "0");
  const whole = paddedAmount.slice(0, -DEVNET_USDC_DECIMALS).replace(/^0+/, "") || "0";
  const fractionText = paddedAmount.slice(-DEVNET_USDC_DECIMALS).replace(/0+$/, "");

  return fractionText ? `${whole}.${fractionText}` : whole;
}

function addIntegerStrings(left: string, right: string): string {
  let carry = 0;
  let result = "";
  let leftIndex = left.length - 1;
  let rightIndex = right.length - 1;

  while (leftIndex >= 0 || rightIndex >= 0 || carry > 0) {
    const leftDigit = leftIndex >= 0 ? left.charCodeAt(leftIndex) - 48 : 0;
    const rightDigit = rightIndex >= 0 ? right.charCodeAt(rightIndex) - 48 : 0;
    const sum = leftDigit + rightDigit + carry;

    result = String(sum % 10) + result;
    carry = Math.floor(sum / 10);
    leftIndex -= 1;
    rightIndex -= 1;
  }

  return result.replace(/^0+/, "") || "0";
}
