"use client";

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
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { toast } from "sonner";

export const INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX = "0x59f";
export const INJECTIVE_EVM_TESTNET_CHAIN_ID = 1439;

type EvmConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
type EvmUsdcBalanceStatus = "idle" | "loading" | "success" | "error";

type EvmProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export type EvmProviderInfo = {
  name: string;
  rdns: string;
  icon?: string;
  provider: EvmProvider;
};

export type InjectiveEvmWalletState = {
  isConnected: boolean;
  address: string;
  shortAddress: string;
  chainId: string;
  chainIdDecimal: number;
  connectionStatus: EvmConnectionStatus;
  error: string | null;
  balance: { status: EvmUsdcBalanceStatus; usdc: string; inj: string; error: string };
  providerName: string;
  providerIcon: string | undefined;
  detectedProviders: EvmProviderInfo[];
  selectingProvider: boolean;
  selectedProvider: EvmProvider | null;
  connect: () => Promise<void>;
  selectProvider: (info: EvmProviderInfo) => Promise<void>;
  cancelProviderSelection: () => void;
  disconnect: () => void;
  switchToInjectiveEvmTestnet: () => Promise<void>;
  refreshBalance: () => Promise<void>;
};

const InjectiveEvmWalletContext = createContext<InjectiveEvmWalletState | null>(null);

function shortAddress(address: string): string {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function InjectiveEvmWalletProvider({ children }: { children: ReactNode }) {
  const { address: wagmiAddress, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { connectAsync, connectors } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();

  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<InjectiveEvmWalletState["balance"]>({
    status: "idle", usdc: "0", inj: "0", error: "",
  });

  const address = wagmiAddress ?? "";
  const chainIdHex = chainId ? `0x${chainId.toString(16)}` : "";
  const connectorName = connector?.name ?? "";
  const connectorIcon = connector?.icon ?? undefined;
  const didFetchRef = useRef(false);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance({ status: "idle", usdc: "0", inj: "0", error: "" });
      return;
    }

    setBalance((prev) => ({ ...prev, status: "loading", error: "" }));

    try {
      const response = await fetch("/api/balances/injective-evm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await response.json() as {
        ok: boolean; error?: string;
        injBalanceFormatted?: string | null; usdcBalanceFormatted?: string | null;
      };

      if (!data.ok) throw new Error(data.error || "Balance API returned an error.");

      setBalance({
        status: "success",
        usdc: data.usdcBalanceFormatted ?? "0",
        inj: data.injBalanceFormatted ?? "0",
        error: "",
      });
    } catch (err) {
      setBalance((prev) => ({ ...prev, status: "error", error: err instanceof Error ? err.message : String(err) }));
    }
  }, [address]);

  const chainReady = isConnected && address && chainId === INJECTIVE_EVM_TESTNET_CHAIN_ID;

  useEffect(() => {
    if (chainReady && !didFetchRef.current) {
      didFetchRef.current = true;
      const id = window.setTimeout(() => void refreshBalance(), 0);
      return () => window.clearTimeout(id);
    }

    if (!chainReady) {
      didFetchRef.current = false;
    }
  }, [chainReady, refreshBalance]);

  const connect = useCallback(async () => {
    setError(null);

    try {
      const injectedConnector = connectors.find((c) => {
        const name = (c.name ?? "").toLowerCase();
        const id = (c.id ?? "").toLowerCase();
        if (name.includes("phantom") || id.includes("phantom")) return false;
        return c.type === "injected" || id.includes("metamask") || id.includes("rabby");
      });

      if (!injectedConnector) {
        toast.error("Phantom is only supported for Solana in OmnisRouter. Use MetaMask, Rabby, OKX, Brave, or Trust Wallet for Injective EVM.");
        return;
      }

      await connectAsync({ connector: injectedConnector });
      await refreshBalance();
    } catch (err) {
      if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "UserRejectedRequestError") {
        return;
      }

      setError(err instanceof Error ? err.message : "Unable to connect EVM wallet.");
    }
  }, [connectAsync, connectors, refreshBalance]);

  const selectProvider = useCallback(async (_info: EvmProviderInfo) => {
    await connect();
  }, [connect]);

  const cancelProviderSelection = useCallback(() => {}, []);

  const disconnect = useCallback(() => {
    wagmiDisconnect();
    setBalance({ status: "idle", usdc: "0", inj: "0", error: "" });
  }, [wagmiDisconnect]);

  const switchToInjectiveEvmTestnet = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: INJECTIVE_EVM_TESTNET_CHAIN_ID });
      await refreshBalance();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to switch to Injective EVM testnet.";

      if (message.toLowerCase().includes("user rejected")) return;
      setError(message);
    }
  }, [switchChainAsync, refreshBalance]);

  const statusFromWagmi = isConnected ? "connected" : error ? "error" : "disconnected";
  const connectionStatus: EvmConnectionStatus = statusFromWagmi as EvmConnectionStatus;

  const selectedProvider: EvmProvider | null = connector
    ? {
        request: async (args: { method: string; params?: unknown[] }) => {
          if (!connector.getProvider) throw new Error("Provider not available.");
          const provider = await connector.getProvider() as Record<string, unknown>;
          return (provider as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }).request(args);
        },
      }
    : null;

  const value = useMemo<InjectiveEvmWalletState>(() => ({
    isConnected,
    address,
    shortAddress: shortAddress(address),
    chainId: chainIdHex,
    chainIdDecimal: chainId,
    connectionStatus,
    error,
    balance,
    providerName: connectorName,
    providerIcon: connectorIcon,
    detectedProviders: [],
    selectingProvider: false,
    selectedProvider,
    connect,
    selectProvider,
    cancelProviderSelection,
    disconnect,
    switchToInjectiveEvmTestnet,
    refreshBalance,
  }), [isConnected, address, chainIdHex, chainId, connectionStatus, error, balance,
    connectorName, connectorIcon, selectedProvider, connect, selectProvider,
    disconnect, switchToInjectiveEvmTestnet, refreshBalance]);

  return (
    <InjectiveEvmWalletContext.Provider value={value}>
      {children}
    </InjectiveEvmWalletContext.Provider>
  );
}

export function useInjectiveEvmWallet() {
  const context = useContext(InjectiveEvmWalletContext);
  if (!context) throw new Error("useInjectiveEvmWallet must be used within InjectiveEvmWalletProvider");
  return context;
}
