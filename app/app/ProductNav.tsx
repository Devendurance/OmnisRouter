"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccount, useChainId, useDisconnect } from "wagmi";
import { INJECTIVE_EVM_TESTNET_CHAIN_ID, useInjectiveEvmWallet } from "./InjectiveEvmWalletProvider";
import { useProductState } from "./product-state";

const navItems = [
  ["/app", "Dashboard"],
  ["/app/rules", "Rules"],
  ["/app/agent", "Agent"],
  ["/app/approval", "Approval"],
  ["/app/payment", "Payment"],
  ["/app/receipt", "Receipt"],
  ["/app/cctp-lab", "CCTP Lab"],
] as const;

export default function ProductNav() {
  const pathname = usePathname();
  const { rules } = useProductState();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { refreshBalance } = useInjectiveEvmWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrongNetwork = isConnected && chainId !== INJECTIVE_EVM_TESTNET_CHAIN_ID;

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && menuOpen) closeMenu();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen, closeMenu]);

  useEffect(() => {
    const unsubConnect = (() => {
      let prevConnected = isConnected;

      return () => {
        if (isConnected && !prevConnected) {
          toast.success("Wallet connected");
          refreshBalance();
        }

        prevConnected = isConnected;
      };
    })();

    return unsubConnect;
  }, [isConnected, refreshBalance]);

  useEffect(() => {
    if (wrongNetwork) {
      toast.error("Wrong EVM network", { description: "Switch to Injective EVM Testnet." });
    }
  }, [wrongNetwork]);

  return (
    <>
      <nav className="topbar" aria-label="Product navigation">
        <Link className="brand" href="/app">
          Omnis<em>Router</em>
        </Link>

        <div className="nav-actions desktop-nav" aria-label="Product sections">
          {navItems.map(([href, label]) => {
            const isActive = pathname === href;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`nav-button${isActive ? " active" : ""}`}
                href={href}
                key={href}
              >
                {label}
              </Link>
            );
          })}
        </div>

        <div className="nav-right">
          <div className="evm-connect-area">
            <ConnectButton.Custom>
              {({ account, chain, openConnectModal, openChainModal, mounted }) => {
                if (!mounted) return null;

                if (!account || !chain) {
                  return (
                    <button className="nav-button primary" onClick={openConnectModal} type="button">
                      Connect EVM Wallet
                    </button>
                  );
                }

                if (chain.unsupported || (chain.id !== INJECTIVE_EVM_TESTNET_CHAIN_ID)) {
                  return (
                    <button className="nav-button danger" onClick={openChainModal} type="button">
                      Wrong network
                    </button>
                  );
                }

                return (
                  <div className="evm-account-pill">
                    <button className="nav-button" onClick={openChainModal} type="button" title="Switch network">
                      <span className="chain-dot" /> {chain.name}
                    </button>
                    <button className="nav-button" onClick={openConnectModal} type="button">
                      {account.displayName}
                    </button>
                    <button className="nav-button" onClick={() => { wagmiDisconnect(); toast.success("Wallet disconnected"); }} type="button" title="Disconnect">
                      &#10005;
                    </button>
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>

          <Link
            className={`pause-pill${rules.emergencyPauseEnabled ? " danger" : ""}`}
            href="/"
          >
            {rules.emergencyPauseEnabled ? "Paused" : "Public site"}
          </Link>

          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="hamburger"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <span className={menuOpen ? "hamburger-line open" : "hamburger-line"} />
            <span className={menuOpen ? "hamburger-line open" : "hamburger-line"} />
            <span className={menuOpen ? "hamburger-line open" : "hamburger-line"} />
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div className="mobile-drawer-overlay" onClick={closeMenu} onKeyDown={undefined}>
          <nav
            aria-label="Mobile navigation"
            className="mobile-drawer"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={undefined}
            role="dialog"
          >
            <div className="mobile-drawer-header">
              <Link className="brand" href="/app" onClick={closeMenu}>
                Omnis<em>Router</em>
              </Link>
              <button aria-label="Close menu" className="mobile-drawer-close" onClick={closeMenu} type="button">
                &#10005;
              </button>
            </div>

            <div className="mobile-drawer-links">
              {navItems.map(([href, label]) => {
                const isActive = pathname === href;

                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={`mobile-nav-link${isActive ? " active" : ""}`}
                    href={href}
                    key={href}
                    onClick={closeMenu}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>

            <div className="mobile-drawer-footer">
              <ConnectButton.Custom>
                {({ account, chain, openConnectModal, mounted }) => {
                  if (!mounted) return null;

                  if (!account || !chain) {
                    return (
                      <button className="primary-button" onClick={() => { openConnectModal(); }} type="button">
                        Connect EVM Wallet
                      </button>
                    );
                  }

                  return (
                    <p className="wallet-note">
                      {account.displayName} — {chain.name}
                    </p>
                  );
                }}
              </ConnectButton.Custom>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
