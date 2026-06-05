import { InjectiveEvmWalletProvider } from "./InjectiveEvmWalletProvider";
import ProductNav from "./ProductNav";
import { ProductStateProvider } from "./product-state";
import SolanaWalletProvider from "./SolanaWalletProvider";
import { EvmWalletProvider } from "./providers/EvmWalletProvider";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <SolanaWalletProvider>
      <EvmWalletProvider>
      <InjectiveEvmWalletProvider>
        <ProductStateProvider>
          <main className="app-shell">
            <ProductNav />
            {children}
          </main>
        </ProductStateProvider>
      </InjectiveEvmWalletProvider>
      </EvmWalletProvider>
    </SolanaWalletProvider>
  );
}
