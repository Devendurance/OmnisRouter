"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

  return (
    <nav className="topbar" aria-label="Product navigation">
      <Link className="brand" href="/app">
        Omnis<em>Router</em>
      </Link>
      <div className="nav-actions" aria-label="Product sections">
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
      <Link className={`pause-pill${rules.emergencyPauseEnabled ? " danger" : ""}`} href="/">
        {rules.emergencyPauseEnabled ? "Paused" : "Public site"}
      </Link>
    </nav>
  );
}
