import type { Metadata } from "next";
import Script from "next/script";
import { Toaster } from "sonner";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import PendoInitializer from "./PendoInitializer";

export const metadata: Metadata = {
  title: "OmnisRouter",
  description:
    "AI-powered stablecoin payment agent for cross-chain USDC transfers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script id="pendo-install" strategy="beforeInteractive">
          {`(function(apiKey){
    (function(p,e,n,d,o){var v,w,x,y,z;o=p[d]=p[d]||{};o._q=o._q||[];
    v=['initialize','identify','updateOptions','pageLoad','track','trackAgent'];for(w=0,x=v.length;w<x;++w)(function(m){
    o[m]=o[m]||function(){o._q[m===v[0]?'unshift':'push']([m].concat([].slice.call(arguments,0)));};})(v[w]);
    y=e.createElement(n);y.async=!0;y.src='https://cdn.pendo.io/agent/static/'+apiKey+'/pendo.js';
    z=e.getElementsByTagName(n)[0];z.parentNode.insertBefore(y,z);})(window,document,'script','pendo');
})('7bde49aa-1f97-4539-ac99-16999d199038');`}
        </Script>
      </head>
      <body suppressHydrationWarning>
        <PendoInitializer />
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
