"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, ShieldMark } from "./icons";
import { shortAddress } from "@/lib/product/format";
import {
  mapSidebarStatus,
  type ProtectionIndicator,
  type WorkerStatus,
} from "@/lib/product/status";

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
  protectionAttention: initialProtectionAttention,
}: {
  children: React.ReactNode;
  session: AppSession;
  protectionAttention: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);
  const [protectionAttention, setProtectionAttention] = useState(initialProtectionAttention);
  const [policyEnabled, setPolicyEnabled] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>("NOT_STARTED");
  const [protectionIndicator, setProtectionIndicator] = useState<ProtectionIndicator>(null);
  const [shellLoaded, setShellLoaded] = useState(!session.authenticated);
  const [shellUnavailable, setShellUnavailable] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const visiblePendingPath = pendingPath === path ? null : pendingPath;

  useEffect(() => {
    if (!session.authenticated) return;
    const controller = new AbortController();
    fetch("/api/shell", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("SHELL_STATUS_UNAVAILABLE");
        return response.json();
      })
      .then(
        (
          data: {
            protectionAttention?: boolean;
            policyEnabled?: boolean;
            workerStatus?: WorkerStatus;
            protectionIndicator?: ProtectionIndicator;
          } | null,
        ) => {
          if (!data) return;
          setProtectionAttention(Boolean(data.protectionAttention));
          setPolicyEnabled(Boolean(data.policyEnabled));
          setWorkerStatus(data.workerStatus ?? "NOT_STARTED");
          setProtectionIndicator(data.protectionIndicator ?? null);
        },
      )
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setShellUnavailable(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setShellLoaded(true);
      });
    return () => controller.abort();
  }, [session.authenticated]);

  function navigationProps(href: string) {
    const active = path === href || (path === "/" && href === "/dashboard");
    const pending = visiblePendingPath === href && !active;
    return {
      "aria-current": active ? ("page" as const) : undefined,
      "aria-label": pending ? `${href.slice(1)} loading` : undefined,
      className: active ? "active" : pending ? "pending" : "",
      onClick: () => {
        if (!active) setPendingPath(href);
      },
    };
  }

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
  const sidebarStatus = shellUnavailable
    ? ({
        heading: "Protection status unavailable",
        detail: "Monitoring state could not be loaded",
        tone: "warn",
      } as const)
    : session.authenticated && !shellLoaded
      ? ({
          heading: "Checking protection status",
          detail: "Loading Monitoring state",
          tone: "neutral",
        } as const)
      : mapSidebarStatus({
          authenticated: session.authenticated,
          enabled: policyEnabled,
          workerStatus,
        });
  const networkName = session.chainId === 8453 ? "Base" : "Base Sepolia";
  const isTestnet = session.chainId !== 8453;
  const effectiveIndicator =
    protectionIndicator ??
    (protectionAttention
      ? ({ tone: "warn", label: "Protection action needs attention" } as const)
      : null);
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
            <Link {...navigationProps(href)} href={href} key={href}>
              <Icon name={icon} />
              <span>{label}</span>
              {visiblePendingPath === href && <span className="nav-spinner" />}
              {label === "Protection" && effectiveIndicator && (
                <span
                  className={`nav-alert ${effectiveIndicator.tone}`}
                  aria-label={effectiveIndicator.label}
                  title={effectiveIndicator.label}
                />
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-status">
          <div className="status-heading">
            <span className={`status-dot ${sidebarStatus.tone}`} />
            {sidebarStatus.heading}
          </div>
          <p>{sidebarStatus.detail}</p>
          <div className="network-chip">
            <span className="network-icon">◆</span>
            <span>
              <b>{networkName}</b>
              <small>Chain ID {session.chainId ?? "—"}</small>
            </span>
            {isTestnet && <em>TESTNET</em>}
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
              aria-busy={disconnecting}
            >
              {disconnecting && <span className="button-spinner" aria-hidden="true" />}
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
          <Link {...navigationProps(href)} href={href} key={href}>
            <span className="mobile-nav-icon">
              <Icon name={icon} />
              {label === "Protection" && effectiveIndicator && (
                <span
                  className={`nav-alert ${effectiveIndicator.tone}`}
                  aria-label={effectiveIndicator.label}
                />
              )}
            </span>
            <span>{label}</span>
            {visiblePendingPath === href && <span className="sr-only">Loading</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
