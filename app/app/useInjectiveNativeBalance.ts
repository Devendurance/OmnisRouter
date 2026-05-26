"use client";

import { useEffect, useRef, useState } from "react";

type InjectiveNativeBalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; balanceInj: string }
  | { status: "error"; error: string };

const INJ_DENOM = "inj";
const INJ_DECIMALS = 18;

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
