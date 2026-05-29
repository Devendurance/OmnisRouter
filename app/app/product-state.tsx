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
const DAILY_GAS_CREDIT_LIMIT = 5;

export const defaultCommand = "send 40 USDC to inj1router9xk";

export const defaultRules: SpendingRules = {
  maxTransferAmount: 100,
  dailyTransferLimit: 250,
  approvalThreshold: 25,
  allowedDestinationChains: ["Injective", "Solana"],
  gasCreditLimit: DAILY_GAS_CREDIT_LIMIT,
  emergencyPauseEnabled: false,
};

const defaultGasCredits: GasCreditState = {
  dailyLimit: DAILY_GAS_CREDIT_LIMIT,
  usedToday: 0,
  lastResetDate: getLocalDateKey(),
  remaining: DAILY_GAS_CREDIT_LIMIT,
};

type FeeChoice = "deduct_from_transfer" | "top_up_fee";
type WalletChain = "Solana" | "Injective" | "EVM";
type WalletConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type WalletState = {
  chain: WalletChain;
  isConnected: boolean;
  address: string;
  shortAddress: string;
  connectionStatus: WalletConnectionStatus;
  disabled?: boolean;
};

type WalletsState = Record<WalletChain, WalletState>;

type ProductState = {
  command: string;
  intent: PaymentIntent;
  balances: MockBalances;
  wallets: WalletsState;
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
  mockConnectWallet: (chain: WalletChain) => void;
  mockDisconnectWallet: (chain: WalletChain) => void;
  setFeeChoice: (choice: FeeChoice) => void;
  simulatePayment: () => PaymentExecution | null;
  recordRealSponsoredExecution: () => void;
  resetGasCredits: () => void;
  resetMockState: () => void;
};

const ProductStateContext = createContext<ProductContextValue | null>(null);

const mockWalletAddresses: Record<WalletChain, string> = {
  Solana: "9xQeWvG816bUx9EPfN9xQeWvG816bUx9EPfN",
  Injective: "inj1router9xkmockwallet0000000000000000000",
  EVM: "",
};

const defaultWallets: WalletsState = {
  Solana: createWallet("Solana"),
  Injective: createWallet("Injective"),
  EVM: createWallet("EVM", true),
};

function createInitialState(): ProductState {
  return {
    command: defaultCommand,
    intent: parsePaymentIntent(defaultCommand),
    balances: defaultBalances,
    wallets: defaultWallets,
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
        const gasCredits = normalizeGasCredits(parsed.gasCredits);

        setState({
          command,
          intent: parsed.intent ?? parsePaymentIntent(command),
          balances: mergeBalances(parsed.balances),
          wallets: mergeWallets(parsed.wallets as Partial<WalletsState> | undefined),
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

    if (state.gasCredits.lastResetDate !== getLocalDateKey()) {
      setState((current) => ({ ...current, gasCredits: withRemaining(0) }));
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
        gasCredits: withRemaining(Math.min(current.gasCredits.usedToday, DAILY_GAS_CREDIT_LIMIT)),
      }));
    },
    mockConnectWallet(chain) {
      if (chain === "EVM") {
        setState((current) => ({
          ...current,
          wallets: {
            ...current.wallets,
            EVM: { ...current.wallets.EVM, connectionStatus: "error" },
          },
        }));
        return;
      }

      setState((current) => ({
        ...current,
        wallets: {
          ...current.wallets,
          [chain]: createConnectedWallet(chain),
        },
      }));
    },
    mockDisconnectWallet(chain) {
      setState((current) => ({
        ...current,
        wallets: {
          ...current.wallets,
          [chain]: createWallet(chain, chain === "EVM"),
        },
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
        gasCredits: current.gasCredits,
      }));

      return execution;
    },
    recordRealSponsoredExecution() {
      setState((current) => ({
        ...current,
        gasCredits: withRemaining(Math.min(current.gasCredits.usedToday + 1, DAILY_GAS_CREDIT_LIMIT)),
        paymentError: null,
      }));
    },
    resetGasCredits() {
      setState((current) => ({ ...current, gasCredits: withRemaining(0), paymentError: null }));
    },
    resetMockState() {
      setState((current) => ({ ...createInitialState(), gasCredits: current.gasCredits }));
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

type StoredGasCredits = Partial<GasCreditState> & {
  monthlyLimit?: unknown;
  used?: unknown;
};

function normalizeGasCredits(value: unknown): GasCreditState {
  const today = getLocalDateKey();
  const stored = value && typeof value === "object" ? value as StoredGasCredits : {};
  const storedDate = typeof stored.lastResetDate === "string" ? stored.lastResetDate : today;
  const rawUsedToday = typeof stored.usedToday === "number" ? stored.usedToday : typeof stored.used === "number" ? stored.used : 0;
  const usedToday = storedDate === today ? rawUsedToday : 0;

  return withRemaining(usedToday, today);
}

function withRemaining(usedToday: number, lastResetDate = getLocalDateKey()): GasCreditState {
  const normalizedUsed = Math.max(0, Math.min(usedToday, DAILY_GAS_CREDIT_LIMIT));

  return {
    dailyLimit: DAILY_GAS_CREDIT_LIMIT,
    usedToday: normalizedUsed,
    lastResetDate,
    remaining: Math.max(DAILY_GAS_CREDIT_LIMIT - normalizedUsed, 0),
  };
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

function createWallet(chain: WalletChain, disabled = false): WalletState {
  return {
    chain,
    isConnected: false,
    address: "",
    shortAddress: "Not connected",
    connectionStatus: "disconnected",
    disabled,
  };
}

function createConnectedWallet(chain: Exclude<WalletChain, "EVM">): WalletState {
  const address = mockWalletAddresses[chain];

  return {
    chain,
    isConnected: true,
    address,
    shortAddress: shortenWalletAddress(address),
    connectionStatus: "connected",
  };
}

function mergeWallets(wallets?: Partial<WalletsState>): WalletsState {
  return {
    Solana: { ...defaultWallets.Solana, ...wallets?.Solana },
    Injective: { ...defaultWallets.Injective, ...wallets?.Injective },
    EVM: { ...defaultWallets.EVM, ...wallets?.EVM, disabled: true },
  };
}

function shortenWalletAddress(address: string): string {
  if (!address) {
    return "Not connected";
  }

  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}
