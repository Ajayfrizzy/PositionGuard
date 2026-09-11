"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Icon, ShieldMark } from "./icons";
import { shortAddress } from "@/lib/product/format";

const nav = [
  ["/dashboard", "Overview", "grid"],
  ["/position", "Position", "position"],
  ["/protection", "Protection", "shield"],
  ["/scenario", "Scenario", "activity"],
  ["/activity", "Activity", "activity"],
  ["/notifications", "Notifications", "activity"],
  ["/settings", "Settings", "settings"],
] as const;

export type AppSession = {
  authenticated: boolean;
  walletAddress: string | null;
  protectedAccountId: string | null;
  chainId: number | null;
};

export function AppShell({
  children,
  session,
  protectionAttention,
}: {
  children: React.ReactNode;
  session: AppSession;
  protectionAttention: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } finally {
      router.push("/onboarding");
      router.refresh();
      setDisconnecting(false);
    }
  }

  if (path.startsWith("/dev/") || path === "/onboarding") return <>{children}</>;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <ShieldMark className="brand-mark" />
          <span>
            <strong>PositionGuard</strong>
            <small>Autonomous Defense</small>
          </span>
        </Link>
        <nav className="side-nav" aria-label="Primary navigation">
          {nav.map(([href, label, icon]) => (
            <Link
              className={path === href || (path === "/" && href === "/dashboard") ? "active" : ""}
              href={href}
              key={href}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {label === "Protection" && protectionAttention && (
                <span className="nav-alert" aria-label="Protection action available" />
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-status">
          <div className="status-heading">
            <span className="live-dot" />
            System operational
          </div>
          <p>Monitoring Base Sepolia</p>
          <div className="network-chip">
            <span className="network-icon">◆</span>
            <span>
              <b>Base Sepolia</b>
              <small>Chain ID 84532</small>
            </span>
            <em>TESTNET</em>
          </div>
        </div>
        <div className="sidebar-foot">
          <div className="avatar">
            <Icon name="shield" />
          </div>
          <div>
            <b>{session.authenticated ? "Protected Account" : "Wallet not connected"}</b>
            <span title={session.walletAddress ?? undefined}>
              {session.authenticated && session.walletAddress
                ? shortAddress(session.walletAddress)
                : "Connect wallet"}
            </span>
          </div>
          {session.authenticated ? (
            <button
              type="button"
              disabled={disconnecting}
              onClick={() => void disconnect()}
              aria-label="Disconnect from PositionGuard"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : (
            <Link href="/onboarding">Connect wallet</Link>
          )}
        </div>
      </aside>
      <main className="app-main">{children}</main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map(([href, label, icon]) => (
          <Link className={path === href ? "active" : ""} href={href} key={href}>
            <span className="mobile-nav-icon">
              <Icon name={icon} />
              {label === "Protection" && protectionAttention && (
                <span className="nav-alert" aria-label="Protection action available" />
              )}
            </span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
