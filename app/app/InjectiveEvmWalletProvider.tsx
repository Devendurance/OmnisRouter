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

export const INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX = "0x59f";
export const INJECTIVE_EVM_TESTNET_CHAIN_ID = 1439;

type EvmConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
type EvmUsdcBalanceStatus = "idle" | "loading" | "success" | "error";

export type EvmProviderInfo = {
  name: string;
  rdns: string;
  icon?: string;
  provider: EvmProvider;
};

type EvmProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const SUPPORTED_INJECTIVE_EVM_RDNS = new Set([
  "io.metamask",
  "io.rabby",
  "com.okex.wallet",
  "com.brave.wallet",
]);

const INJECTIVE_EVM_TESTNET_RPC_URL = "https://k8s.testnet.json-rpc.injective.network/";

const INJECTIVE_EVM_TESTNET_CHAIN_CONFIG = {
  chainId: INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX,
  chainName: "Injective EVM Testnet",
  nativeCurrency: { name: "INJ", symbol: "INJ", decimals: 18 },
  rpcUrls: [INJECTIVE_EVM_TESTNET_RPC_URL],
  blockExplorerUrls: ["https://testnet.explorer.injective.network/"],
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

function isInjectiveEvmSupported(rdns: string): boolean {
  return SUPPORTED_INJECTIVE_EVM_RDNS.has(rdns);
}

async function connectWithProvider(provider: EvmProvider, onError: (msg: string) => void) {
  const accounts = await provider.request({ method: "eth_requestAccounts" });

  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
    throw new Error("No EVM wallet account returned.");
  }

  const connectedAddress = accounts[0];
  const chainIdResult = await provider.request({ method: "eth_chainId" });
  const chainIdStr = typeof chainIdResult === "string" ? chainIdResult : String(chainIdResult ?? "");

  if (chainIdStr.toLowerCase() !== INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX }],
      });
    } catch (switchError) {
      const code = (switchError && typeof switchError === "object" && "code" in switchError)
        ? (switchError as { code?: unknown }).code
        : undefined;

      if (code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [INJECTIVE_EVM_TESTNET_CHAIN_CONFIG],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX }],
        });
      } else {
        onError("Unable to switch to Injective EVM testnet. Try manually adding the network in your wallet.");
        throw switchError;
      }
    }

    const newChainId = await provider.request({ method: "eth_chainId" });
    const newChainIdStr = typeof newChainId === "string" ? newChainId : String(newChainId ?? "");

    return { connectedAddress, chainIdStr: newChainIdStr };
  }

  return { connectedAddress, chainIdStr };
}

export function InjectiveEvmWalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<EvmConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<InjectiveEvmWalletState["balance"]>({
    status: "idle", usdc: "0", inj: "0", error: "",
  });
  const [providerName, setProviderName] = useState("");
  const [providerIcon, setProviderIcon] = useState<string | undefined>(undefined);
  const providerRef = useRef<EvmProvider | null>(null);
  const [detectedProviders, setDetectedProviders] = useState<EvmProviderInfo[]>([]);
  const [selectingProvider, setSelectingProvider] = useState(false);

  useEffect(() => {
    const announceHandler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.provider || !detail?.info) return;

      const info: EvmProviderInfo = {
        name: String(detail.info.name || ""),
        rdns: String(detail.info.rdns || ""),
        icon: detail.info.icon || undefined,
        provider: detail.provider as EvmProvider,
      };

      setDetectedProviders((prev) => {
        if (prev.some((p) => p.rdns === info.rdns)) return prev;
        return [...prev, info];
      });
    };

    window.addEventListener("eip6963:announceProvider", announceHandler);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    return () => window.removeEventListener("eip6963:announceProvider", announceHandler);
  }, []);

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

  const completeConnection = useCallback(async (provider: EvmProvider, info: EvmProviderInfo) => {
    setConnectionStatus("connecting");
    setError(null);
    providerRef.current = provider;
    setProviderName(info.name);
    setProviderIcon(info.icon);

    try {
      const { connectedAddress, chainIdStr } = await connectWithProvider(provider, setError);

      setAddress(connectedAddress);
      setChainId(chainIdStr);
      setConnectionStatus("connected");
      setSelectingProvider(false);
      await refreshBalance();
    } catch (err) {
      setAddress("");
      setChainId("");
      setConnectionStatus("error");
      setError(err instanceof Error ? err.message : "Unable to connect EVM wallet.");
    }
  }, [refreshBalance]);

  const selectProvider = useCallback(async (info: EvmProviderInfo) => {
    if (!isInjectiveEvmSupported(info.rdns)) {
      setError(`${info.name} is not supported for Injective EVM testnet.`);
      return;
    }

    await completeConnection(info.provider, info);
  }, [completeConnection]);

  const connect = useCallback(async () => {
    setSelectingProvider(true);
    setError(null);

    setDetectedProviders([]);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    await new Promise((resolve) => setTimeout(resolve, 200));

    setDetectedProviders((current) => {
      if (current.length > 0) return current;

      const ethereum = (window as Window & { ethereum?: Record<string, unknown> }).ethereum;
      if (!ethereum) return current;

      const eth = ethereum as Record<string, unknown>;

      if (eth.isRabby) {
        return [{ name: "Rabby", rdns: "io.rabby", provider: ethereum as unknown as EvmProvider }];
      }

      if (eth.isOkxWallet || eth.okxwallet) {
        return [{ name: "OKX", rdns: "com.okex.wallet", provider: ethereum as unknown as EvmProvider }];
      }

      if (eth.isMetaMask) {
        return [{ name: "MetaMask", rdns: "io.metamask", provider: ethereum as unknown as EvmProvider }];
      }

      if (eth.isBraveWallet) {
        return [{ name: "Brave", rdns: "com.brave.wallet", provider: ethereum as unknown as EvmProvider }];
      }

      return current;
    });
  }, []);

  const cancelProviderSelection = useCallback(() => {
    setSelectingProvider(false);
  }, []);

  const disconnect = useCallback(() => {
    setAddress("");
    setChainId("");
    setConnectionStatus("disconnected");
    setError(null);
    setBalance({ status: "idle", usdc: "0", inj: "0", error: "" });
    setProviderName("");
    setProviderIcon(undefined);
    providerRef.current = null;
  }, []);

  const switchToInjectiveEvmTestnet = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider) { setError("No Injective EVM provider selected."); return; }

    try {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX }],
        });
      } catch (switchError) {
        const code = (switchError && typeof switchError === "object" && "code" in switchError)
          ? (switchError as { code?: unknown }).code : undefined;

        if (code === 4902) {
          await provider.request({ method: "wallet_addEthereumChain", params: [INJECTIVE_EVM_TESTNET_CHAIN_CONFIG] });
          await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX }] });
        } else {
          throw switchError;
        }
      }

      const newChainId = await provider.request({ method: "eth_chainId" });
      const newChainIdStr = typeof newChainId === "string" ? newChainId : String(newChainId ?? "");

      setChainId(newChainIdStr);

      if (newChainIdStr.toLowerCase() === INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX) {
        await refreshBalance();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to switch to Injective EVM testnet.");
    }
  }, [refreshBalance]);

  const value = useMemo<InjectiveEvmWalletState>(() => ({
    isConnected: connectionStatus === "connected",
    address, shortAddress: shortAddress(address),
    chainId, chainIdDecimal: parseInt(chainId, 16) || 0,
    connectionStatus, error, balance,
    providerName, providerIcon,
    detectedProviders, selectingProvider,
    selectedProvider: providerRef.current,
    connect, selectProvider, cancelProviderSelection,
    disconnect, switchToInjectiveEvmTestnet, refreshBalance,
  }), [address, balance, chainId, connect, connectionStatus, disconnect, error, providerName, providerIcon, detectedProviders, selectingProvider, refreshBalance, selectProvider, cancelProviderSelection, switchToInjectiveEvmTestnet]);

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
