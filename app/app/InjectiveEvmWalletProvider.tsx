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
  balance: { status: EvmUsdcBalanceStatus; usdc: string; error: string };
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

const INJECTIVE_TESTNET_CCTP_USDC_DENOM = "erc20:0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d";
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
    error: "",
  });

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance({ status: "idle", usdc: "0", error: "" });
      return;
    }

    setBalance({ status: "loading", usdc: "0", error: "" });

    try {
      const [{ ChainGrpcBankApi }, { Network, getNetworkEndpoints }] = await Promise.all([
        import("@injectivelabs/sdk-ts/client/chain"),
        import("@injectivelabs/networks"),
      ]);
      const endpoints = getNetworkEndpoints(Network.TestnetSentry ?? Network.Testnet);
      const bankApi = new ChainGrpcBankApi(endpoints.grpc);
      const result = await bankApi.fetchBalance({ accountAddress: address, denom: INJECTIVE_TESTNET_CCTP_USDC_DENOM });
      const rawAmount = result.amount || "0";
      const amount = BigInt(rawAmount);
      const base = BigInt(10) ** BigInt(6);
      const whole = amount / base;
      const fractional = amount % base;
      const wholeText = whole.toString();
      const fractionalText = fractional.toString().padStart(6, "0").slice(0, 2);
      const usdc = fractionalText ? `${wholeText}.${fractionalText}` : wholeText;

      setBalance({ status: "success", usdc, error: "" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/balance.*not\s*found|not\s*found.*balance|denom.*not\s*found|account.*does\s*not\s*exist/i.test(message)) {
        setBalance({ status: "success", usdc: "0", error: "" });
      } else {
        setBalance({ status: "error", usdc: "0", error: message });
      }
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
    setBalance({ status: "idle", usdc: "0", error: "" });
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

