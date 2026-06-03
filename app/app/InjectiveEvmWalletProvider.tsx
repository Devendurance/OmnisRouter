"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX = "0x59f";
export const INJECTIVE_EVM_TESTNET_CHAIN_ID = 1439;

type EvmConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
type EvmUsdcBalanceStatus = "idle" | "loading" | "success" | "error";

export type InjectiveEvmWalletState = {
  isConnected: boolean;
  address: string;
  shortAddress: string;
  chainId: string;
  chainIdDecimal: number;
  connectionStatus: EvmConnectionStatus;
  error: string | null;
  balance: { status: EvmUsdcBalanceStatus; usdc: string; inj: string; error: string };
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToInjectiveEvmTestnet: () => Promise<void>;
  refreshBalance: () => Promise<void>;
};

const InjectiveEvmWalletContext = createContext<InjectiveEvmWalletState | null>(null);

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getEthereumProvider(): EthereumProvider {
  const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;

  if (!ethereum) {
    throw new Error("No EVM wallet provider found. Install an EVM wallet.");
  }

  return ethereum;
}

const INJECTIVE_EVM_TESTNET_RPC_URL = "https://k8s.testnet.json-rpc.injective.network/";

function shortAddress(address: string): string {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function InjectiveEvmWalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<EvmConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<InjectiveEvmWalletState["balance"]>({
    status: "idle",
    usdc: "0",
    inj: "0",
    error: "",
  });

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
        ok: boolean;
        error?: string;
        injBalanceFormatted?: string | null;
        usdcBalanceFormatted?: string | null;
      };

      if (!data.ok) {
        throw new Error(data.error || "Balance API returned an error.");
      }

      setBalance({
        status: "success",
        usdc: data.usdcBalanceFormatted ?? "0",
        inj: data.injBalanceFormatted ?? "0",
        error: "",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      setBalance((prev) => ({ ...prev, status: "error", error: message }));
    }
  }, [address]);

  const connect = useCallback(async () => {
    setConnectionStatus("connecting");
    setError(null);

    try {
      const provider = getEthereumProvider();
      const accounts = await provider.request({ method: "eth_requestAccounts" });

      if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
        throw new Error("No EVM wallet account returned.");
      }

      const connectedAddress = accounts[0];
      const connectedChainId = await provider.request({ method: "eth_chainId" });
      const chainIdStr = typeof connectedChainId === "string" ? connectedChainId : String(connectedChainId ?? "");

      setAddress(connectedAddress);
      setChainId(chainIdStr);
      setConnectionStatus("connected");

      if (chainIdStr.toLowerCase() !== INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX }],
          });
          const newChainId = await provider.request({ method: "eth_chainId" });
          const newChainIdStr = typeof newChainId === "string" ? newChainId : String(newChainId ?? "");

          setChainId(newChainIdStr);
        } catch (switchError) {
          const code = (switchError && typeof switchError === "object" && "code" in switchError)
            ? (switchError as { code?: unknown }).code
            : undefined;

          if (code === 4902) {
            try {
              await provider.request({
                method: "wallet_addEthereumChain",
                params: [{
                  chainId: INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX,
                  chainName: "Injective EVM Testnet",
                  nativeCurrency: { name: "INJ", symbol: "INJ", decimals: 18 },
                  rpcUrls: [INJECTIVE_EVM_TESTNET_RPC_URL],
                  blockExplorerUrls: ["https://testnet.explorer.injective.network/"],
                }],
              });
              await provider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX }],
              });
              const newChainId = await provider.request({ method: "eth_chainId" });
              const newChainIdStr = typeof newChainId === "string" ? newChainId : String(newChainId ?? "");

              setChainId(newChainIdStr);
            } catch {
              setError("Add Injective EVM testnet to this wallet, then try again.");
            }
          }
        }
      }

      await refreshBalance();
    } catch (err) {
      setAddress("");
      setChainId("");
      setConnectionStatus("error");
      setError(err instanceof Error ? err.message : "Unable to connect EVM wallet.");
    }
  }, [refreshBalance]);

  const disconnect = useCallback(() => {
    setAddress("");
    setChainId("");
    setConnectionStatus("disconnected");
    setError(null);
    setBalance({ status: "idle", usdc: "0", inj: "0", error: "" });
  }, []);

  const switchToInjectiveEvmTestnet = useCallback(async () => {
    try {
      const provider = getEthereumProvider();

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
            params: [{
              chainId: INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX,
              chainName: "Injective EVM Testnet",
              nativeCurrency: { name: "INJ", symbol: "INJ", decimals: 18 },
              rpcUrls: [INJECTIVE_EVM_TESTNET_RPC_URL],
              blockExplorerUrls: ["https://testnet.explorer.injective.network/"],
            }],
          });
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: INJECTIVE_EVM_TESTNET_CHAIN_ID_HEX }],
          });
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
      const message = err instanceof Error ? err.message : "Unable to switch to Injective EVM testnet.";

      setError(message);
    }
  }, [refreshBalance]);

  const value = useMemo<InjectiveEvmWalletState>(() => ({
    isConnected: connectionStatus === "connected",
    address,
    shortAddress: shortAddress(address),
    chainId,
    chainIdDecimal: parseInt(chainId, 16) || 0,
    connectionStatus,
    error,
    balance,
    connect,
    disconnect,
    switchToInjectiveEvmTestnet,
    refreshBalance,
  }), [address, balance, chainId, connect, connectionStatus, disconnect, error, refreshBalance, switchToInjectiveEvmTestnet]);

  return (
    <InjectiveEvmWalletContext.Provider value={value}>
      {children}
    </InjectiveEvmWalletContext.Provider>
  );
}

export function useInjectiveEvmWallet() {
  const context = useContext(InjectiveEvmWalletContext);

  if (!context) {
    throw new Error("useInjectiveEvmWallet must be used within InjectiveEvmWalletProvider");
  }

  return context;
}

