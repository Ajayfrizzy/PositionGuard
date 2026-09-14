import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { protectionRecommendation } from "../../src/lib/product/models";
import {
  fundingCta,
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
        enabled: true,
        lastCheck: null,
        lastRunStatus: null,
        pollingIntervalMs: 60_000,
      }).status,
    ).toBe("NOT_STARTED"));

  it("does not call disabled or offline protection active", () => {
    expect(
      mapSidebarStatus({ authenticated: true, enabled: false, workerStatus: "ONLINE" }),
    ).toMatchObject({ heading: "Protection disabled", detail: "Monitoring not enabled" });
    expect(
      mapSidebarStatus({ authenticated: true, enabled: true, workerStatus: "OFFLINE" }),
    ).toMatchObject({ heading: "Monitoring unavailable", detail: "Worker offline" });
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
});
