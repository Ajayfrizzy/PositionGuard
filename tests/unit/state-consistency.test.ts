import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { protectionRecommendation } from "../../src/lib/product/models";
import {
  fundingCta,
  mapMonitoringPresentation,
  mapProtectionIndicator,
  mapSidebarStatus,
  mapWorkerHealth,
} from "../../src/lib/product/status";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("funding state CTAs", () => {
  it("hides the CTA when no action requires funding", () =>
    expect(fundingCta("NO_ACTION_REQUIRED")).toBeNull());
  it("offers a check before readiness has run", () =>
    expect(fundingCta("NOT_CHECKED")).toBe("Check funding readiness"));
  it("offers a refresh for ready funding", () =>
    expect(fundingCta("READY")).toBe("Refresh funding status"));
  it("uses state-specific retries and no transaction CTA for service configuration", () => {
    expect(fundingCta("KEEPERHUB_UNAVAILABLE")).toBe("Retry KeeperHub check");
    expect(fundingCta("SENDER_MISMATCH")).toBeNull();
    expect(source("src/components/funding-panel.tsx")).toContain("{cta && (");
  });
});

describe("protection recommendations", () => {
  const base = {
    hasCandidate: true,
    riskLevel: "HIGH" as const,
    policyEnabled: true,
  };

  it("hides execution actions for safe and Monitor Only states", () => {
    expect(
      protectionRecommendation({ ...base, riskLevel: "SAFE", executionMode: "AUTONOMOUS" }),
    ).toMatchObject({ actionable: false, cta: null });
    expect(protectionRecommendation({ ...base, executionMode: "MONITOR_ONLY" })).toMatchObject({
      cta: { label: "View analysis" },
      message: expect.stringContaining("no transactions"),
    });
  });

  it("presents approval and autonomous flows truthfully", () => {
    expect(protectionRecommendation({ ...base, executionMode: "REQUIRE_APPROVAL" })).toMatchObject({
      cta: { label: "Review approval flow" },
      message: expect.stringContaining("you will approve execution"),
    });
    expect(protectionRecommendation({ ...base, executionMode: "AUTONOMOUS" })).toMatchObject({
      cta: { label: "Simulate protection" },
      message: expect.stringContaining("automatically"),
    });
  });
});

describe("monitoring and navigation truthfulness", () => {
  it("distinguishes a worker that has never run from an outage", () =>
    expect(
      mapWorkerHealth({
        lastHeartbeatAt: null,
      }).status,
    ).toBe("NOT_STARTED"));

  it("uses fixed heartbeat-age thresholds independent of policy and monitoring runs", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    expect(mapWorkerHealth({ lastHeartbeatAt: "2026-09-14T11:59:30Z", now }).status).toBe("ONLINE");
    expect(mapWorkerHealth({ lastHeartbeatAt: "2026-09-14T11:59:29Z", now }).status).toBe(
      "DEGRADED",
    );
    expect(mapWorkerHealth({ lastHeartbeatAt: "2026-09-14T11:58:59Z", now }).status).toBe(
      "OFFLINE",
    );
  });

  it("does not call disabled or offline protection active", () => {
    expect(
      mapSidebarStatus({ authenticated: true, enabled: false, workerStatus: "ONLINE" }),
    ).toMatchObject({ heading: "Protection disabled", detail: "Monitoring inactive" });
    expect(
      mapSidebarStatus({ authenticated: true, enabled: true, workerStatus: "OFFLINE" }),
    ).toMatchObject({ heading: "Monitoring unavailable", detail: "Worker offline" });
  });

  it.each(["NOT_STARTED", "OFFLINE"] as const)(
    "never presents %s worker state as online",
    (workerStatus) => {
      const status = mapSidebarStatus({ authenticated: true, enabled: true, workerStatus });
      expect(status.detail).not.toBe("Monitoring is online");
      expect(status.heading).not.toBe("Protection active");
    },
  );

  it("derives dashboard and sidebar from the same canonical monitoring state", () => {
    const status = mapMonitoringPresentation({ policyEnabled: true, workerStatus: "NOT_STARTED" });
    expect(status).toMatchObject({
      active: false,
      dashboardLabel: "INACTIVE",
      sidebar: { heading: "Protection enabled", detail: "Monitoring not started" },
    });
  });

  it("presents an online worker as active monitoring everywhere", () => {
    const status = mapMonitoringPresentation({ policyEnabled: true, workerStatus: "ONLINE" });
    expect(status).toMatchObject({
      active: true,
      dashboardLabel: "ACTIVE",
      sidebar: { heading: "Protection active", detail: "Monitoring is online" },
    });
  });

  it("refreshes shell worker state through the lightweight endpoint", () => {
    const shell = source("src/components/app-shell.tsx");
    expect(shell).toContain('fetch("/api/monitor/status"');
    expect(shell).toContain("15_000");
    expect(source("src/app/api/monitor/status/route.ts")).toContain("mapMonitoringPresentation");
  });

  it("maps accessible protection indicators without using green for attention", () => {
    expect(
      mapProtectionIndicator({
        enabled: true,
        workerStatus: "ONLINE",
        riskLevel: "SAFE",
        attention: false,
        blocked: false,
      }),
    ).toMatchObject({ tone: "good", label: expect.stringContaining("healthy") });
    expect(
      mapProtectionIndicator({
        enabled: true,
        workerStatus: "ONLINE",
        riskLevel: "HIGH",
        attention: true,
        blocked: false,
      }),
    ).toMatchObject({ tone: "warn", label: expect.stringContaining("attention") });
    expect(
      mapProtectionIndicator({
        enabled: true,
        workerStatus: "OFFLINE",
        riskLevel: "CRITICAL",
        attention: false,
        blocked: true,
      }),
    ).toMatchObject({ tone: "danger", label: expect.stringContaining("critical") });
    expect(
      mapProtectionIndicator({
        enabled: false,
        workerStatus: "ONLINE",
        riskLevel: "SAFE",
        attention: false,
        blocked: false,
      }),
    ).toBeNull();
  });
});

describe("empty and isolated product states", () => {
  it("does not render fake position financials without an Aave V3 position", () => {
    const page = source("src/app/position/page.tsx");
    expect(page).toContain("if (!data.hasAavePosition)");
    expect(page).toContain("No supported Aave V3 position detected.");
    expect(page).toContain("RefreshPositionButton");
  });

  it("renders useful notification and activity empty states", () => {
    const notifications = source("src/components/notification-center.tsx");
    expect(notifications).toContain("No protection events yet.");
    expect(notifications).toContain("Reconnect Wallet");
    expect(notifications).toContain("notices.some((item) => !item.readAt)");
    expect(source("src/app/activity/page.tsx")).toContain("No protection activity yet.");
  });

  it("keeps scenarios read-only and separate from live product state", () => {
    const route = source("src/app/api/stress/route.ts");
    const result = source("src/components/stress-form.tsx");
    expect(route).not.toMatch(/\.(create|update|upsert|delete)\s*\(/);
    expect(result).toContain("dashboard risk, funding readiness, and the");
    expect(result).toContain("NO ONCHAIN STATE CHANGED");
  });

  it("makes policy activation and each Protection Mode explicit", () => {
    const policy = source("src/components/policy-form.tsx");
    expect(policy).toContain("Enable Protection");
    expect(policy).toContain("Save Protection Settings");
    expect(policy).toContain("No transactions are submitted.");
    expect(policy).toContain("wait for my approval");
    expect(policy).toContain("Act automatically within the limits I set.");
  });

  it('labels an already-enabled policy "Protection enabled"', () => {
    expect(source("src/components/policy-form.tsx")).toContain(
      'savedPolicy.enabled && policy.enabled ? "Protection enabled" : "Enable protection"',
    );
  });

  it("adopts the persisted policy, refreshes routes, and notifies the mounted shell", () => {
    const form = source("src/components/policy-form.tsx");
    const route = source("src/app/api/policy/route.ts");
    expect(form).toContain("setPolicy(persistedPolicy)");
    expect(form).toContain("dirty.current = false");
    expect(form).toContain("router.refresh()");
    expect(form).toContain('new CustomEvent("positionguard:policy-saved"');
    expect(route).toContain("policy: {");
    expect(route).toContain("savedPolicy.targetHealthFactor.toString()");
    expect(route).toContain("revalidatePath(path)");
  });

  it("does not use monitoring runs as the worker liveness signal", () => {
    const statusRoute = source("src/app/api/monitor/status/route.ts");
    const productData = source("src/lib/product/data.ts");
    expect(statusRoute).toContain("readWorkerHeartbeat(auth.session.chainId)");
    expect(statusRoute).toContain("lastHeartbeatAt: heartbeat?.lastHeartbeatAt ?? null");
    expect(productData).toContain("const heartbeatPromise = readWorkerHeartbeat(network.chainId)");
    expect(productData).toContain("lastHeartbeatAt: heartbeat?.lastHeartbeatAt ?? null");
  });

  it("updates process heartbeat independently from monitoring cycles", () => {
    const worker = source("scripts/monitor-worker.ts");
    expect(worker).toContain("WORKER_HEARTBEAT_INTERVAL_MS");
    expect(worker).toContain("setInterval(() => void touchHeartbeat()");
    expect(worker).toContain("recordWorkerHeartbeat({ chainId, instanceId");
  });

  it("namespaces heartbeat identity so local workers cannot make production appear online", () => {
    const heartbeat = source("src/lib/monitoring/heartbeat.ts");
    const compose = source("compose.yaml");
    expect(heartbeat).toContain("chainId_workerName_environment");
    expect(heartbeat).toContain('process.env.NODE_ENV === "production"');
    expect(compose.match(/WORKER_ENVIRONMENT: production/g)).toHaveLength(2);
    expect(source("scripts/verify-database.ts")).toContain("missingColumns.map((column)");
  });

  it("refreshes monitoring immediately before starting the 15-second poll", () => {
    const shell = source("src/components/app-shell.tsx");
    const immediate = shell.indexOf("void refreshMonitoring();");
    const polling = shell.indexOf("window.setInterval(() => void refreshMonitoring(), 15_000)");
    expect(immediate).toBeGreaterThan(-1);
    expect(polling).toBeGreaterThan(immediate);
  });

  it("prevents overlapping monitoring refreshes and refreshes after visibility restoration", () => {
    const shell = source("src/components/app-shell.tsx");
    expect(shell).toContain("if (controller) return");
    expect(shell).toContain('document.visibilityState === "visible"');
    expect(shell).toContain('addEventListener("visibilitychange", onVisibilityChange)');
    expect(shell).toContain('removeEventListener("visibilitychange", onVisibilityChange)');
  });

  it("converges sidebar state directly from the lightweight server response", () => {
    const shell = source("src/components/app-shell.tsx");
    expect(shell).toContain("setPolicyEnabled(data.policyEnabled)");
    expect(shell).toContain("setWorkerStatus(data.workerStatus)");
    expect(shell).toContain("setShellLoaded(true)");
  });

  it("reconciles the preserved app shell immediately after wallet authentication", () => {
    const shell = source("src/components/app-shell.tsx");
    const onboarding = source("src/components/wallet-onboarding.tsx");
    expect(shell).toContain('window.addEventListener("positionguard:session-authenticated"');
    expect(shell).toContain('fetch("/api/auth/session", { cache: "no-store" })');
    expect(shell).toContain("if (!activeSession.authenticated) return");
    expect(onboarding).toContain('new CustomEvent("positionguard:session-authenticated"');
    expect(onboarding).toContain("router.refresh()");
  });

  it("drives the dashboard protection card from the same live status as the sidebar", () => {
    const shell = source("src/components/app-shell.tsx");
    const dashboard = source("src/app/dashboard/page.tsx");
    const liveCard = source("src/components/live-protection-status.tsx");
    expect(shell).toContain("<LiveMonitoringProvider");
    expect(shell).toContain("setLastMonitoringCheck(data.lastCheck)");
    expect(dashboard).toContain("<LiveProtectionStatus");
    expect(liveCard).toContain("useLiveMonitoring()");
    expect(liveCard).toContain("live?.loaded ? live.workerStatus : initialWorkerStatus");
    expect(liveCard).toContain("mapMonitoringPresentation({ policyEnabled, workerStatus })");
  });
});
