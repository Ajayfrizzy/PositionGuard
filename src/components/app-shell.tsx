"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, ShieldMark } from "./icons";
import { shortAddress } from "@/lib/product/format";
import { LiveMonitoringProvider } from "./live-monitoring-context";
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
  const [sessionOverride, setSessionOverride] = useState<AppSession | null>(null);
  const activeSession = sessionOverride ?? session;
  const [disconnecting, setDisconnecting] = useState(false);
  const [protectionAttention, setProtectionAttention] = useState(initialProtectionAttention);
  const [policyEnabled, setPolicyEnabled] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>("NOT_STARTED");
  const [lastMonitoringCheck, setLastMonitoringCheck] = useState<string | null>(null);
  const [protectionIndicator, setProtectionIndicator] = useState<ProtectionIndicator>(null);
  const [shellLoaded, setShellLoaded] = useState(!session.authenticated);
  const [shellUnavailable, setShellUnavailable] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const visiblePendingPath = pendingPath === path ? null : pendingPath;

  useEffect(() => {
    const adoptSession = (next: AppSession) => {
      setSessionOverride(next);
      setShellLoaded(!next.authenticated);
      setShellUnavailable(false);
    };
    const onSessionAuthenticated = (event: Event) => {
      const detail = (event as CustomEvent<AppSession>).detail;
      if (detail?.authenticated && detail.walletAddress && detail.chainId) adoptSession(detail);
    };
    window.addEventListener("positionguard:session-authenticated", onSessionAuthenticated);

    // Root layouts are preserved during client navigation. Reconcile a shell that
    // was mounted before authentication with the authoritative cookie session.
    if (!activeSession.authenticated && path !== "/onboarding") {
      void fetch("/api/auth/session", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as {
            authenticated?: boolean;
            session?: Omit<AppSession, "authenticated">;
          };
        })
        .then((result) => {
          if (result?.authenticated && result.session)
            adoptSession({ authenticated: true, ...result.session });
        })
        .catch(() => undefined);
    }

    return () =>
      window.removeEventListener("positionguard:session-authenticated", onSessionAuthenticated);
  }, [activeSession.authenticated, path]);

  useEffect(() => {
    if (!activeSession.authenticated) return;
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
            protectionIndicator?: ProtectionIndicator;
          } | null,
        ) => {
          if (!data) return;
          setProtectionAttention(Boolean(data.protectionAttention));
          setProtectionIndicator(data.protectionIndicator ?? null);
        },
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [activeSession.authenticated, activeSession.chainId, activeSession.protectedAccountId]);

  useEffect(() => {
    if (!activeSession.authenticated) return;
    let stopped = false;
    let controller: AbortController | null = null;
    const refreshMonitoring = async () => {
      if (controller) return;
      controller = new AbortController();
      try {
        const response = await fetch("/api/monitor/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          setSessionOverride({
            authenticated: false,
            walletAddress: null,
            protectedAccountId: null,
            chainId: null,
          });
          return;
        }
        if (!response.ok) throw new Error("MONITOR_STATUS_UNAVAILABLE");
        const data = (await response.json()) as {
          policyEnabled: boolean;
          workerStatus: WorkerStatus;
          lastCheck: string | null;
        };
        if (!stopped) {
          setPolicyEnabled(data.policyEnabled);
          setWorkerStatus(data.workerStatus);
          setLastMonitoringCheck(data.lastCheck);
          setShellUnavailable(false);
          setShellLoaded(true);
        }
      } catch (error) {
        if (!stopped && !(error instanceof DOMException && error.name === "AbortError")) {
          setShellUnavailable(true);
          setShellLoaded(true);
        }
      } finally {
        controller = null;
      }
    };
    void refreshMonitoring();
    const interval = window.setInterval(() => void refreshMonitoring(), 15_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshMonitoring();
    };
    const onPolicySaved = (event: Event) => {
      const detail = (event as CustomEvent<{ policyEnabled?: boolean }>).detail;
      if (typeof detail?.policyEnabled === "boolean") {
        setPolicyEnabled(detail.policyEnabled);
        if (!detail.policyEnabled) {
          setProtectionAttention(false);
          setProtectionIndicator(null);
        }
      }
      setShellUnavailable(false);
      setShellLoaded(true);
      void refreshMonitoring();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("positionguard:policy-saved", onPolicySaved);
    return () => {
      stopped = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("positionguard:policy-saved", onPolicySaved);
    };
  }, [activeSession.authenticated, activeSession.chainId, activeSession.protectedAccountId]);

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
      setSessionOverride({
        authenticated: false,
        walletAddress: null,
        protectedAccountId: null,
        chainId: null,
      });
      setPolicyEnabled(false);
      setWorkerStatus("NOT_STARTED");
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
    : activeSession.authenticated && !shellLoaded
      ? ({
          heading: "Checking protection status",
          detail: "Loading Monitoring state",
          tone: "neutral",
        } as const)
      : mapSidebarStatus({
          authenticated: activeSession.authenticated,
          enabled: policyEnabled,
          workerStatus,
        });
  const networkName = activeSession.chainId === 8453 ? "Base" : "Base Sepolia";
  const isTestnet = activeSession.chainId !== 8453;
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
            <Link {...navigationProps(href)} href={href} prefetch key={href}>
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
              <small>Chain ID {activeSession.chainId ?? "—"}</small>
            </span>
            {isTestnet && <em>TESTNET</em>}
          </div>
        </div>
        <div className="sidebar-foot">
          <div className="avatar">
            <Icon name="shield" />
          </div>
          <div>
            <b>{activeSession.authenticated ? "Protected Account" : "Wallet not connected"}</b>
            <span title={activeSession.walletAddress ?? undefined}>
              {activeSession.authenticated && activeSession.walletAddress
                ? shortAddress(activeSession.walletAddress)
                : "Connect wallet"}
            </span>
          </div>
          {activeSession.authenticated ? (
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
      <LiveMonitoringProvider
        value={{
          loaded: shellLoaded,
          unavailable: shellUnavailable,
          policyEnabled,
          workerStatus,
          lastCheck: lastMonitoringCheck,
        }}
      >
        <main className="app-main">{children}</main>
      </LiveMonitoringProvider>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map(([href, label, icon]) => (
          <Link {...navigationProps(href)} href={href} prefetch key={href}>
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
