import ProductNav from "./ProductNav";
import { ProductStateProvider } from "./product-state";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProductStateProvider>
      <main className="app-shell">
        <ProductNav />
        {children}
      </main>
    </ProductStateProvider>
  );
}
