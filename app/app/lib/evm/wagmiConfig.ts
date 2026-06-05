import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  braveWallet,
  metaMaskWallet,
  okxWallet,
  rabbyWallet,
  trustWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { injectiveEvmTestnet } from "./chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "0000000000000000000000000000000000000000000000000000000000000000";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Supported Injective EVM wallets",
      wallets: [metaMaskWallet, rabbyWallet, okxWallet, braveWallet, trustWallet],
    },
  ],
  { projectId, appName: "OmnisRouter" },
);

export const wagmiConfig = createConfig({
  chains: [injectiveEvmTestnet],
  connectors,
  transports: {
    [injectiveEvmTestnet.id]: http(),
  },
});
