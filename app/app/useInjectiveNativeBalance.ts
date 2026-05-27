"use client";

import { useEffect, useRef, useState } from "react";

type InjectiveNativeBalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; balanceInj: string }
  | { status: "error"; error: string };

export type InjectiveUsdcBalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; balanceUsdc: string }
  | { status: "error"; error: string };

const INJ_DENOM = "inj";
const INJ_DECIMALS = 18;
export const INJECTIVE_TESTNET_CCTP_USDC_DENOM = "erc20:0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d";
const USDC_DECIMALS = 6;

export function useInjectiveNativeBalance(address: string) {
  const [state, setState] = useState<InjectiveNativeBalanceState>({ status: "idle" });
  const requestRef = useRef(0);

  async function refresh() {
    if (!address) {
      return;
    }

    const requestId = ++requestRef.current;
    setState({ status: "loading" });

    try {
      const balanceInj = await readInjectiveNativeBalance(address);

      if (requestRef.current === requestId) {
        setState({ status: "success", balanceInj });
      }
    } catch (error) {
      if (requestRef.current === requestId) {
        setState({
          status: "error",
          error: error instanceof Error ? error.message : "Unable to read INJ balance.",
        });
      }
    }
  }

  useEffect(() => {
    const requestId = ++requestRef.current;

    if (!address) {
      return;
    }

    async function readBalance() {
      setState({ status: "loading" });

      try {
        const balanceInj = await readInjectiveNativeBalance(address);

        if (requestRef.current === requestId) {
          setState({ status: "success", balanceInj });
        }
      } catch (error) {
        if (requestRef.current === requestId) {
          setState({
            status: "error",
            error: error instanceof Error ? error.message : "Unable to read INJ balance.",
          });
        }
      }
    }

    void readBalance();
  }, [address]);

  return {
    refresh,
    state: address ? state : { status: "idle" as const },
  };
}

export function useInjectiveUsdcBalance(address: string) {
  const [state, setState] = useState<InjectiveUsdcBalanceState>({ status: "idle" });
  const requestRef = useRef(0);

  async function refresh() {
    if (!address) {
      return;
    }

    const requestId = ++requestRef.current;
    setState({ status: "loading" });

    try {
      const balanceUsdc = await getInjectiveUsdcBalance(address);

      if (requestRef.current === requestId) {
        setState({ status: "success", balanceUsdc });
      }
    } catch (error) {
      if (requestRef.current === requestId) {
        setState({
          status: "error",
          error: getReadableBalanceError(error, "Unable to read Injective USDC balance."),
        });
      }
    }
  }

  useEffect(() => {
    const requestId = ++requestRef.current;

    if (!address) {
      return;
    }

    async function readBalance() {
      setState({ status: "loading" });

      try {
        const balanceUsdc = await getInjectiveUsdcBalance(address);

        if (requestRef.current === requestId) {
          setState({ status: "success", balanceUsdc });
        }
      } catch (error) {
        if (requestRef.current === requestId) {
          setState({
            status: "error",
            error: getReadableBalanceError(error, "Unable to read Injective USDC balance."),
          });
        }
      }
    }

    void readBalance();
  }, [address]);

  return {
    refresh,
    state: address ? state : { status: "idle" as const },
  };
}

export async function readInjectiveNativeBalance(accountAddress: string) {
  const [{ ChainGrpcBankApi }, { Network, getNetworkEndpoints }] = await Promise.all([
    import("@injectivelabs/sdk-ts/client/chain"),
    import("@injectivelabs/networks"),
  ]);
  const endpoints = getNetworkEndpoints(Network.TestnetSentry ?? Network.Testnet);
  const bankApi = new ChainGrpcBankApi(endpoints.grpc);
  const balance = await bankApi.fetchBalance({ accountAddress, denom: INJ_DENOM });

  return formatAttoInj(balance.amount);
}

export async function getInjectiveUsdcBalance(accountAddress: string) {
  const [{ ChainGrpcBankApi }, { Network, getNetworkEndpoints }] = await Promise.all([
    import("@injectivelabs/sdk-ts/client/chain"),
    import("@injectivelabs/networks"),
  ]);
  const endpoints = getNetworkEndpoints(Network.TestnetSentry ?? Network.Testnet);
  const bankApi = new ChainGrpcBankApi(endpoints.grpc);

  try {
    const balance = await bankApi.fetchBalance({ accountAddress, denom: INJECTIVE_TESTNET_CCTP_USDC_DENOM });

    return formatMicroUsdc(balance.amount || "0");
  } catch (error) {
    if (isMissingBalanceError(error)) {
      return formatMicroUsdc("0");
    }

    throw error;
  }
}

function formatAttoInj(rawAmount: string) {
  const normalizedAmount = rawAmount.trim();

  if (!/^\d+$/.test(normalizedAmount)) {
    throw new Error("Injective returned an invalid native INJ amount.");
  }

  const amount = BigInt(normalizedAmount);
  const base = BigInt(10) ** BigInt(INJ_DECIMALS);
  const whole = amount / base;
  const fractional = amount % base;
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fractionalText = fractional.toString().padStart(INJ_DECIMALS, "0").slice(0, 6).replace(/0+$/, "");

  return fractionalText ? `${wholeText}.${fractionalText} INJ` : `${wholeText} INJ`;
}

function formatMicroUsdc(rawAmount: string) {
  const normalizedAmount = rawAmount.trim();

  if (!/^\d+$/.test(normalizedAmount)) {
    throw new Error("Injective returned an invalid USDC amount.");
  }

  const amount = BigInt(normalizedAmount);
  const base = BigInt(10) ** BigInt(USDC_DECIMALS);
  const whole = amount / base;
  const fractional = amount % base;
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fractionalText = fractional.toString().padStart(USDC_DECIMALS, "0").slice(0, 2);

  return `${wholeText}.${fractionalText}`;
}

function isMissingBalanceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /(balance|denom|account).*not\s*found|not\s*found.*(balance|denom|account)|account.*does\s*not\s*exist|balance.*does\s*not\s*exist|denom.*does\s*not\s*exist/i.test(message);
}

function getReadableBalanceError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}
