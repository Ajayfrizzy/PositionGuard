import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  filterAuditTimeline,
  isRoutineMonitoringEvent,
  type TimelineEvent,
} from "../../src/lib/product/audit";
import { formatTokenAmount } from "../../src/lib/product/format";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const monitored: TimelineEvent = {
  id: "monitor-1",
  type: "POSITION_MONITORED",
  title: "Position Monitored",
  detail: "No intervention required.",
  timestamp: "2026-09-14T10:00:00.000Z",
  tone: "neutral",
};
const important: TimelineEvent = {
  id: "risk-1",
  type: "RISK_THRESHOLD_CROSSED",
  title: "Risk Threshold Crossed",
  detail: "Health Factor crossed the warning threshold.",
  timestamp: "2026-09-14T10:01:00.000Z",
  tone: "warn",
};

describe("final cross-page UX refinement", () => {
  it("formats normalized USDC and WETH amounts at readable precision", () => {
    expect(formatTokenAmount("6.589324", "USDC")).toBe("6.589324");
    expect(formatTokenAmount("0.005010271933749728", "WETH")).toBe("0.00501027");
    expect(formatTokenAmount("6589324", "USDC")).toBe("6,589,324");
  });

  it("maps formatted reserve debt from normalized variable and stable balances", () => {
    const data = source("src/lib/product/data.ts");
    expect(data).toContain("reserve.variableDebt");
    expect(data).toContain("parseUnits(string(reserve.variableDebt)");
    expect(data).not.toContain("debtBalance: hasFormattedReserves ? debtRaw");
  });

  it("keeps amount, token symbol, and USD value distinct on Position", () => {
    const page = source("src/app/position/page.tsx");
    expect(page).toContain("formatTokenAmount(");
    expect(page).toContain("formatCompactUsd(");
    expect(page).toContain("Supplied amount / value");
  });

  it("labels the dashboard execution as historical evidence", () => {
    const page = source("src/app/dashboard/page.tsx");
    expect(page).toContain("LATEST VERIFIED PROTECTION");
    expect(page).toContain("Previous verified execution · not the current position state");
  });

  it("initializes Settings and Dashboard from the same funding assessment", () => {
    expect(source("src/app/dashboard/page.tsx")).toContain("data.fundingAssessment");
    expect(source("src/app/settings/page.tsx")).toContain(
      "initialAssessment={data.fundingAssessment}",
    );
    expect(source("src/components/funding-panel.tsx")).toContain("Last verified");
  });

  it("shows the snapshot used both before and after a scenario run", () => {
    expect(source("src/app/scenario/page.tsx")).toContain("Based on live position");
    expect(source("src/app/api/stress/route.ts")).toContain("snapshotBlockNumber");
    expect(source("src/components/stress-form.tsx")).toContain("Simulation snapshot");
  });

  it("groups monitoring while keeping important events visible", () => {
    expect(isRoutineMonitoringEvent(monitored)).toBe(true);
    expect(filterAuditTimeline([monitored, important], "important")).toEqual([important]);
    expect(filterAuditTimeline([monitored, important], "warnings")).toEqual([important]);
    const page = source("src/app/activity/page.tsx");
    expect(page).toContain("View monitoring history");
    expect(page).toContain("total audit events");
    expect(page).toContain("Aave effect");
  });

  it("uses block copy and a compact accessible autonomous confirmation", () => {
    const form = source("src/components/policy-form.tsx");
    const css = source("src/app/autonomous.css");
    expect(form).toContain("Allow PositionGuard to repay supported Aave debt.");
    expect(form).toContain("Allow PositionGuard to supply supported collateral.");
    expect(form).toContain("Approval required above");
    expect(form).toContain("Protection is enabled");
    expect(form).toContain("Protection will be enabled");
    expect(form).toContain('className="autonomous-confirm"');
    expect(css).toMatch(/\.autonomous-confirm input\s*{[^}]*width:\s*16px/s);
  });

  it("keeps previous candidate evidence collapsed with a secondary disclosure", () => {
    const page = source("src/app/protection/page.tsx");
    const css = source("src/app/globals.css");
    expect(page).toContain('<details className="candidate-evidence historical-candidates">');
    expect(page).not.toContain(
      '<details open className="candidate-evidence historical-candidates">',
    );
    expect(css).toContain(".historical-candidates > summary");
  });
});
