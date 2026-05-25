"use client";

import {
  checkGasCredits,
  defaultBalances,
  estimatedFeeUsdc,
  parsePaymentIntent,
  resolvePaymentRoute,
  routeRegistry,
  simulatePaymentExecution,
  validateSpendingRules,
  type GasCreditState,
  type GasResult,
  type MockBalances,
  type PaymentExecution,
  type PaymentIntent,
  type RouteResult,
  type SpendingRules,
} from "../router-simulator";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "omnis-router-product-state-v2";

export const defaultCommand = "send 40 USDC to inj1router9xk";

export const defaultRules: SpendingRules = {
  maxTransferAmount: 100,
  dailyTransferLimit: 250,
  approvalThreshold: 25,
  allowedDestinationChains: ["Injective", "Solana"],
  gasCreditLimit: 20,
  emergencyPauseEnabled: false,
};

const defaultGasCredits: GasCreditState = {
  monthlyLimit: 20,
  used: 0,
  remaining: 20,
};

type FeeChoice = "deduct_from_transfer" | "top_up_fee";

type ProductState = {
  command: string;
  intent: PaymentIntent;
  balances: MockBalances;
  rules: SpendingRules;
  gasCredits: GasCreditState;
  latestExecution: PaymentExecution | null;
  feeChoice: FeeChoice;
  paymentError: string | null;
};

type ProductContextValue = ProductState & {
  route: RouteResult;
  ruleResult: ReturnType<typeof validateSpendingRules>;
  gas: GasResult;
  remainingGasCredits: number;
  setCommand: (command: string) => void;
  saveRules: (rules: SpendingRules) => void;
  setFeeChoice: (choice: FeeChoice) => void;
  simulatePayment: () => PaymentExecution | null;
  resetGasCredits: () => void;
  resetMockState: () => void;
};

const ProductStateContext = createContext<ProductContextValue | null>(null);

function createInitialState(): ProductState {
  return {
    command: defaultCommand,
    intent: parsePaymentIntent(defaultCommand),
    balances: defaultBalances,
    rules: defaultRules,
    gasCredits: defaultGasCredits,
    latestExecution: null,
    feeChoice: "deduct_from_transfer",
    paymentError: null,
  };
}

export function ProductStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProductState>(createInitialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);

      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ProductState>;
        const command = parsed.command ?? defaultCommand;
        const rules = { ...defaultRules, ...parsed.rules };
        const storedGasCredits = { ...defaultGasCredits, ...parsed.gasCredits };
        const gasCredits = withRemaining(storedGasCredits.monthlyLimit, storedGasCredits.used);

        setState({
          command,
          intent: parsed.intent ?? parsePaymentIntent(command),
          balances: mergeBalances(parsed.balances),
          rules,
          gasCredits,
          latestExecution: parsed.latestExecution ?? null,
          feeChoice: parsed.feeChoice ?? "deduct_from_transfer",
          paymentError: parsed.paymentError ?? null,
        });
      }
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const route = useMemo(() => resolvePaymentRoute(state.intent, state.balances, routeRegistry), [state.balances, state.intent]);
  const ruleResult = useMemo(() => validateSpendingRules(state.intent, state.rules, route), [route, state.intent, state.rules]);
  const gas = useMemo(() => checkGasCredits(state.gasCredits), [state.gasCredits]);

  const value = useMemo<ProductContextValue>(() => ({
    ...state,
    route,
    ruleResult,
    gas,
    remainingGasCredits: gas.remaining,
    setCommand(command) {
      const intent = parsePaymentIntent(command);

      setState((current) => ({
        ...current,
        command,
        intent,
        latestExecution: null,
        paymentError: null,
      }));
    },
    saveRules(rules) {
      setState((current) => ({
        ...current,
        rules,
        latestExecution: null,
        paymentError: null,
        gasCredits: withRemaining(rules.gasCreditLimit, Math.min(current.gasCredits.used, rules.gasCreditLimit)),
      }));
    },
    setFeeChoice(feeChoice) {
      setState((current) => ({ ...current, feeChoice, paymentError: null }));
    },
    simulatePayment() {
      if (!route.supported || !route.sourceChain || !isEnabledDestination(route.destinationChain) || ruleResult.status === "denied" || state.rules.emergencyPauseEnabled) {
        setState((current) => ({ ...current, paymentError: route.reason }));
        return null;
      }

      const sourceBalance = state.balances[route.sourceChain].USDC;
      const feeMode = gas.feeMode === "sponsored" ? "sponsored" : state.feeChoice === "top_up_fee" ? "top_up_fee" : "deduct_from_transfer";
      const debitAmount = feeMode === "top_up_fee" ? state.intent.amount + estimatedFeeUsdc : state.intent.amount;
      const creditAmount = feeMode === "deduct_from_transfer" ? state.intent.amount - estimatedFeeUsdc : state.intent.amount;

      if (creditAmount <= 0) {
        setState((current) => ({ ...current, paymentError: "Transfer amount must exceed the estimated 0.03 USDC fee when deducting from transfer." }));
        return null;
      }

      if (sourceBalance < debitAmount) {
        setState((current) => ({ ...current, paymentError: `Insufficient ${route.sourceChain} USDC balance for ${feeMode === "top_up_fee" ? "amount plus 0.03 USDC fee" : "selected route"}.` }));
        return null;
      }

      const sourceChain = route.sourceChain;
      const destinationChain = route.destinationChain;
      const execution = simulatePaymentExecution(state.intent, route, feeMode, creditAmount);

      setState((current) => ({
        ...current,
        latestExecution: execution,
        paymentError: null,
        balances: {
          ...current.balances,
          [sourceChain]: {
            ...current.balances[sourceChain],
            USDC: roundUsdc(current.balances[sourceChain].USDC - debitAmount),
          },
          [destinationChain]: {
            ...current.balances[destinationChain],
            USDC: roundUsdc(current.balances[destinationChain].USDC + creditAmount),
          },
        },
        gasCredits: gas.feeMode === "sponsored"
          ? withRemaining(current.gasCredits.monthlyLimit, Math.min(current.gasCredits.used + 1, current.gasCredits.monthlyLimit))
          : current.gasCredits,
      }));

      return execution;
    },
    resetGasCredits() {
      setState((current) => ({ ...current, gasCredits: withRemaining(current.gasCredits.monthlyLimit, 0), paymentError: null }));
    },
    resetMockState() {
      setState(createInitialState());
    },
  }), [gas, route, ruleResult, state]);

  return <ProductStateContext.Provider value={value}>{children}</ProductStateContext.Provider>;
}

export function useProductState() {
  const context = useContext(ProductStateContext);

  if (!context) {
    throw new Error("useProductState must be used within ProductStateProvider");
  }

  return context;
}

function withRemaining(monthlyLimit: number, used: number): GasCreditState {
  return {
    monthlyLimit,
    used,
    remaining: Math.max(monthlyLimit - used, 0),
  };
}

function mergeBalances(balances?: Partial<MockBalances>): MockBalances {
  return {
    Solana: { ...defaultBalances.Solana, ...balances?.Solana },
    Injective: { ...defaultBalances.Injective, ...balances?.Injective },
    Base: { ...defaultBalances.Base, ...balances?.Base },
    Arbitrum: { ...defaultBalances.Arbitrum, ...balances?.Arbitrum },
  };
}

function isEnabledDestination(chain: RouteResult["destinationChain"]): chain is keyof MockBalances {
  return chain === "Solana" || chain === "Injective" || chain === "Base" || chain === "Arbitrum";
}

function roundUsdc(value: number) {
  return Math.round(value * 100) / 100;
}
