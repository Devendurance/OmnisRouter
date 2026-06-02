import { InjectiveEvmWalletProvider } from "./InjectiveEvmWalletProvider";
import { InjectiveWalletProvider } from "./InjectiveWalletProvider";
import ProductNav from "./ProductNav";
import { ProductStateProvider } from "./product-state";
import SolanaWalletProvider from "./SolanaWalletProvider";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <SolanaWalletProvider>
      <InjectiveWalletProvider>
        <InjectiveEvmWalletProvider>
          <ProductStateProvider>
            <main className="app-shell">
              <ProductNav />
              {children}
            </main>
          </ProductStateProvider>
        </InjectiveEvmWalletProvider>
      </InjectiveWalletProvider>
    </SolanaWalletProvider>
  );
}
