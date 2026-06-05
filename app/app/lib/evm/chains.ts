import { defineChain } from "viem";

export const injectiveEvmTestnet = defineChain({
  id: 1439,
  name: "Injective EVM Testnet",
  nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://k8s.testnet.json-rpc.injective.network/"] },
  },
  blockExplorers: {
    default: {
      name: "Injective EVM Testnet Explorer",
      url: "https://testnet.blockscout.injective.network",
    },
  },
});

export const injectiveEvmMainnet = defineChain({
  id: 1776,
  name: "Injective EVM",
  nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://sentry.evm-rpc.injective.network/"] },
  },
  blockExplorers: {
    default: {
      name: "Injective EVM Explorer",
      url: "https://blockscout.injective.network",
    },
  },
});
