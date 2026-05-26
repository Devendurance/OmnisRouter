"use client";

import { Buffer } from "buffer";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type InjectiveWalletName = "Keplr" | "Leap" | "Ninji";
type InjectiveConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type InjectiveWalletState = {
  wallet: InjectiveWalletName | null;
  isConnected: boolean;
  address: string;
  shortAddress: string;
  connectionStatus: InjectiveConnectionStatus;
  error: string | null;
  connect: (walletName: InjectiveWalletName) => Promise<void>;
  disconnect: () => Promise<void>;
};

type InjectiveWalletStrategy = {
  setWallet?: (wallet: unknown) => Promise<void> | void;
  enable?: () => Promise<boolean> | Promise<void> | boolean | void;
  getAddresses?: () => Promise<string[]>;
  getWalletDeviceType?: () => Promise<unknown>;
  disconnect?: () => Promise<void> | void;
};

const InjectiveWalletContext = createContext<InjectiveWalletState | null>(null);

const walletLabels: Record<InjectiveWalletName, string> = {
  Keplr: "Keplr",
  Leap: "Leap",
  Ninji: "Ninji",
};

const INJECTIVE_WALLET_STORAGE_KEY = "omnis.injective.selectedWallet";
const INJECTIVE_ADDRESS_STORAGE_KEY = "omnis.injective.lastAddress";
const injectiveWalletNames = new Set<InjectiveWalletName>(["Keplr", "Leap", "Ninji"]);

export function InjectiveWalletProvider({ children }: { children: ReactNode }) {
  const strategyRef = useRef<InjectiveWalletStrategy | null>(null);
  const [wallet, setWallet] = useState<InjectiveWalletName | null>(null);
  const [address, setAddress] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<InjectiveConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  const getStrategy = useCallback(async () => {
    if (typeof window === "undefined") {
      throw new Error("Injective wallets can only be connected in the browser.");
    }

    if (!globalThis.Buffer) {
      globalThis.Buffer = Buffer;
    }

    if (!strategyRef.current) {
      const [{ WalletStrategy }, { ChainId }] = await Promise.all([
        import("@injectivelabs/wallet-strategy"),
        import("@injectivelabs/ts-types"),
      ]);

      strategyRef.current = new WalletStrategy({
        chainId: ChainId.Testnet,
        strategies: {},
      }) as unknown as InjectiveWalletStrategy;
    }

    return strategyRef.current;
  }, []);

  const saveSession = useCallback((walletName: InjectiveWalletName, nextAddress: string) => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(INJECTIVE_WALLET_STORAGE_KEY, walletName);
      window.localStorage.setItem(INJECTIVE_ADDRESS_STORAGE_KEY, nextAddress);
    } catch {
      // Wallet connection should still succeed if localStorage is unavailable.
    }
  }, []);

  const clearSession = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.removeItem(INJECTIVE_WALLET_STORAGE_KEY);
      window.localStorage.removeItem(INJECTIVE_ADDRESS_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures; in-memory state is still reset below.
    }
  }, []);

  const connect = useCallback(async (walletName: InjectiveWalletName) => {
    setWallet(walletName);
    setConnectionStatus("connecting");
    setError(null);

    try {
      const [{ Wallet }] = await Promise.all([import("@injectivelabs/wallet-base")]);
      const walletMap: Record<InjectiveWalletName, unknown> = {
        Keplr: Wallet.Keplr,
        Leap: Wallet.Leap,
        Ninji: Wallet.Ninji,
      };
      const selectedWallet = walletMap[walletName];

      if (!selectedWallet) {
        throw new Error(`${walletLabels[walletName]} is not supported yet.`);
      }

      const strategy = await getStrategy();
      await strategy.setWallet?.(selectedWallet);
      await strategy.enable?.();

      const addresses = await strategy.getAddresses?.();
      const nextAddress = addresses?.[0];

      if (!nextAddress) {
        throw new Error(`No Injective address found for ${walletLabels[walletName]}. Make sure the extension is installed, unlocked, and connected to Injective testnet.`);
      }

      setAddress(nextAddress);
      setConnectionStatus("connected");
      saveSession(walletName, nextAddress);
    } catch (cause) {
      const message = cause instanceof Error
        ? cause.message
        : `Unable to connect ${walletLabels[walletName]}. Make sure the wallet extension is installed and unlocked.`;

      setAddress("");
      setConnectionStatus("error");
      setError(message);
    }
  }, [getStrategy, saveSession]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let isActive = true;

    const reconnect = async () => {
      let storedWallet: string | null = null;

      try {
        storedWallet = window.localStorage.getItem(INJECTIVE_WALLET_STORAGE_KEY);
      } catch {
        return;
      }

      if (!storedWallet) {
        return;
      }

      if (!injectiveWalletNames.has(storedWallet as InjectiveWalletName)) {
        clearSession();
        return;
      }

      const walletName = storedWallet as InjectiveWalletName;

      setWallet(walletName);
      setConnectionStatus("connecting");
      setError(null);

      try {
        const [{ Wallet }] = await Promise.all([import("@injectivelabs/wallet-base")]);
        const walletMap: Record<InjectiveWalletName, unknown> = {
          Keplr: Wallet.Keplr,
          Leap: Wallet.Leap,
          Ninji: Wallet.Ninji,
        };
        const selectedWallet = walletMap[walletName];

        if (!selectedWallet) {
          throw new Error(`${walletLabels[walletName]} is not supported yet.`);
        }

        const strategy = await getStrategy();
        await strategy.setWallet?.(selectedWallet);
        await strategy.enable?.();

        const addresses = await strategy.getAddresses?.();
        const nextAddress = addresses?.[0];

        if (!nextAddress) {
          throw new Error(`No Injective address found for ${walletLabels[walletName]}. Make sure the extension is installed, unlocked, and connected to Injective testnet.`);
        }

        if (!isActive) {
          return;
        }

        setWallet(walletName);
        setAddress(nextAddress);
        setConnectionStatus("connected");
        setError(null);
        saveSession(walletName, nextAddress);
      } catch (cause) {
        if (!isActive) {
          return;
        }

        const message = cause instanceof Error
          ? cause.message
          : `Unable to reconnect ${walletLabels[walletName]}. Open your Injective wallet and connect again.`;

        setWallet(null);
        setAddress("");
        setConnectionStatus("disconnected");
        setError(`Could not restore ${walletLabels[walletName]} session: ${message}`);
      }
    };

    void reconnect();

    return () => {
      isActive = false;
    };
  }, [clearSession, getStrategy, saveSession]);

  const disconnect = useCallback(async () => {
    try {
      await strategyRef.current?.disconnect?.();
    } finally {
      clearSession();
      setWallet(null);
      setAddress("");
      setConnectionStatus("disconnected");
      setError(null);
    }
  }, [clearSession]);

  const value = useMemo<InjectiveWalletState>(() => ({
    wallet,
    isConnected: connectionStatus === "connected",
    address,
    shortAddress: shortenAddress(address),
    connectionStatus,
    error,
    connect,
    disconnect,
  }), [address, connect, connectionStatus, disconnect, error, wallet]);

  return <InjectiveWalletContext.Provider value={value}>{children}</InjectiveWalletContext.Provider>;
}

export function useInjectiveWallet() {
  const context = useContext(InjectiveWalletContext);

  if (!context) {
    throw new Error("useInjectiveWallet must be used within InjectiveWalletProvider");
  }

  return context;
}

function shortenAddress(address: string) {
  if (!address) {
    return "Not connected";
  }

  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}
