import type { Metadata } from "next";
import "./globals.css";

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
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
