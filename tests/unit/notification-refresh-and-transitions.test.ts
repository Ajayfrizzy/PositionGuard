import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  actionNotificationIdentity,
  classifyActionNotificationChange,
  shouldNotifyBlocker,
  shouldNotifyRecovery,
  shouldNotifyRisk,
} from "../../src/lib/notifications/transitions";
import { notify, type NotificationStore } from "../../src/lib/notifications/service";
import { filterAuditTimeline, mapAuditTimeline } from "../../src/lib/product/audit";
import {
  buildMeaningfulNotifications,
  type NotificationRecord,
} from "../../src/lib/notifications/presentation";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const state = (riskLevel: string | null, blockerReason: string | null = null) => ({
  riskLevel,
  blockerReason,
  actionIdentity: null,
  approvalPending: false,
});
const notice = (
  id: string,
  type: string,
  createdAt: string,
  actionIdentity?: string,
): NotificationRecord => ({
  id,
  type,
  title: type === "MEI_SELECTED" ? "Protection action selected" : type,
  message:
    type === "MEI_SELECTED"
      ? `${actionIdentity?.split(":")[0]} ${actionIdentity?.split(":")[2]} ${actionIdentity?.split(":")[1]}.`
      : type,
  readAt: null,
  webhookStatus: "SKIPPED",
  createdAt,
  metadata: actionIdentity ? { actionIdentity } : {},
});

describe("notification transition semantics", () => {
  it("notifies SAFE → WATCH and WATCH → HIGH, but not WATCH → WATCH", () => {
    expect(shouldNotifyRisk(state("SAFE"), "WATCH")).toBe(true);
    expect(shouldNotifyRisk(state("WATCH"), "HIGH")).toBe(true);
    expect(shouldNotifyRisk(state("WATCH"), "WATCH")).toBe(false);
    expect(shouldNotifyRisk(state("HIGH"), "WATCH")).toBe(false);
  });

  it("allows WATCH again after recovery and emits recovery only for non-SAFE → SAFE", () => {
    expect(shouldNotifyRecovery(state("WATCH"), "SAFE")).toBe(true);
    expect(shouldNotifyRecovery(state("SAFE"), "SAFE")).toBe(false);
    expect(shouldNotifyRisk(state("SAFE"), "WATCH")).toBe(true);
  });

  it("suppresses the same blocker until recovery and allows reason changes", () => {
    expect(shouldNotifyBlocker(state("HIGH", "ALLOWANCE_REQUIRED"), "ALLOWANCE_REQUIRED")).toBe(
      false,
    );
    expect(shouldNotifyBlocker(state("HIGH", "ALLOWANCE_REQUIRED"), "SIMULATION_FAILED")).toBe(
      true,
    );
    expect(shouldNotifyBlocker(state("SAFE"), "ALLOWANCE_REQUIRED")).toBe(true);
  });

  it("uses stable action identity instead of cycle-specific candidate IDs", () => {
    expect(
      actionNotificationIdentity({ type: "REPAY_DEBT", asset: "USDC", amount: "001.2300" }),
    ).toBe("REPAY_DEBT:usdc:1.23");
  });

  it("recognizes a materially changed intervention", () => {
    const original = actionNotificationIdentity({
      type: "REPAY_DEBT",
      asset: "USDC",
      amount: "100",
    });
    const changed = actionNotificationIdentity({
      type: "ADD_COLLATERAL",
      asset: "WETH",
      amount: "0.1",
    });
    expect(changed).not.toBe(original);
  });

  it("suppresses near-identical accrued MEI amounts", () => {
    const previous = { type: "REPAY_DEBT", asset: "USDC", amount: "0.038241" };
    expect(classifyActionNotificationChange(previous, { ...previous, amount: "0.038215" })).toBe(
      "UNCHANGED",
    );
    expect(classifyActionNotificationChange(previous, { ...previous, amount: "0.038315" })).toBe(
      "UNCHANGED",
    );
  });

  it("reports material amount and action-type changes as updates", () => {
    const previous = { type: "REPAY_DEBT", asset: "USDC", amount: "100" };
    expect(classifyActionNotificationChange(previous, { ...previous, amount: "102" })).toBe(
      "UPDATED",
    );
    expect(
      classifyActionNotificationChange(previous, {
        type: "ADD_COLLATERAL",
        asset: "USDC",
        amount: "100",
      }),
    ).toBe("UPDATED");
    expect(source("src/lib/monitoring/service.ts")).toContain(
      '"Protection recommendation updated"',
    );
  });

  it("treats a returning recommendation as a new selection", () => {
    expect(
      classifyActionNotificationChange(null, {
        type: "REPAY_DEBT",
        asset: "USDC",
        amount: "10",
      }),
    ).toBe("SELECTED");
  });
});

describe("notification refresh contract", () => {
  const component = source("src/components/notification-center.tsx");

  it("polls at a restrained interval only while visible and refreshes on visibility return", () => {
    expect(component).toContain("12_000");
    expect(component).toContain('document.visibilityState === "visible"');
    expect(component).toContain("stopPolling()");
    expect(component).toContain('addEventListener("visibilitychange"');
    expect(component).toContain('removeEventListener("visibilitychange"');
  });

  it("keeps initial loading separate from background and manual refresh", () => {
    expect(component).toContain("if (initial && mounted.current) setLoading(false)");
    expect(component).toContain('pendingLabel="Refreshing…"');
    expect(component).toContain("setNotices(body.notifications)");
    expect(component).not.toContain("setNotices([])");
  });

  it("keeps a persisted in-app notice when webhook delivery fails", async () => {
    const update = vi.fn(async () => ({}));
    const store = {
      notification: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "notice-1" })),
        update,
      },
    } as unknown as NotificationStore;
    const result = await notify(
      {
        userId: "user-1",
        type: "RISK_WATCH",
        title: "Watch",
        message: "Risk changed",
        dedupeKey: "episode-1",
      },
      {
        store,
        provider: { deliver: vi.fn(async () => Promise.reject(new Error("offline"))) },
      },
    );
    expect(result).toMatchObject({ notificationId: "notice-1", delivered: false });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ webhookStatus: "FAILED" }) }),
    );
  });

  it("queries and marks notifications within the authenticated account scope", () => {
    const route = source("src/app/api/notifications/route.ts");
    expect(route).toContain("userId: auth.session.protectedAccountId");
    expect(route).toContain("db.notification.count({ where: { userId, readAt: null } })");
    expect(route).toContain('orderBy: { createdAt: "desc" }');
    expect(route).not.toContain("take: 100");
  });

  it("ties separate execution attempts to separate monitoring run identities", () => {
    const monitoring = source("src/lib/monitoring/service.ts");
    expect(monitoring).toContain(":execution:${run.id}:${selected.candidate.id}:started");
    expect(monitoring).toContain(
      ":execution:${run.id}:${selected.candidate.id}:failed:${blockerReason}",
    );
  });
});

describe("historical notification presentation", () => {
  it("groups near-identical historical MEI recalculations in Meaningful view", () => {
    const items = buildMeaningfulNotifications([
      notice("n3", "MEI_SELECTED", "2026-09-14T03:00:00Z", "REPAY_DEBT:usdc:0.038217"),
      notice("n2", "MEI_SELECTED", "2026-09-14T02:00:00Z", "REPAY_DEBT:usdc:0.038215"),
      notice("n1", "MEI_SELECTED", "2026-09-14T01:00:00Z", "REPAY_DEBT:usdc:0.038241"),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "mei-group", notices: [{ id: "n2" }, { id: "n3" }] });
  });

  it("keeps materially different recommendations separate", () => {
    const items = buildMeaningfulNotifications([
      notice("n2", "MEI_SELECTED", "2026-09-14T02:00:00Z", "REPAY_DEBT:usdc:0.05"),
      notice("n1", "MEI_SELECTED", "2026-09-14T01:00:00Z", "REPAY_DEBT:usdc:0.038"),
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.kind === "notification")).toBe(true);
  });

  it("keeps explicitly selected current recommendations separate from historical noise", () => {
    const returning = notice(
      "returning",
      "MEI_SELECTED",
      "2026-09-14T02:00:00Z",
      "REPAY_DEBT:usdc:0.038215",
    );
    returning.metadata = { ...returning.metadata, change: "SELECTED" };
    const items = buildMeaningfulNotifications([
      returning,
      notice("original", "MEI_SELECTED", "2026-09-14T01:00:00Z", "REPAY_DEBT:usdc:0.038241"),
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.kind === "notification")).toBe(true);
  });

  it("never collapses execution notifications into MEI groups", () => {
    const items = buildMeaningfulNotifications([
      notice("execution", "EXECUTION_CONFIRMED", "2026-09-14T03:00:00Z"),
      notice("noise", "MEI_SELECTED", "2026-09-14T02:00:00Z", "REPAY_DEBT:usdc:0.038215"),
      notice("selected", "MEI_SELECTED", "2026-09-14T01:00:00Z", "REPAY_DEBT:usdc:0.038241"),
    ]);
    expect(
      items.find((item) => item.kind === "notification" && item.notice.id === "execution"),
    ).toBeTruthy();
  });

  it("renders every underlying row without grouping in All notifications", () => {
    const component = source("src/components/notification-center.tsx");
    expect(component).toContain('view === "all"');
    expect(component).toContain("notices.map((notice)");
    expect(component).toContain("All notifications");
  });
});

describe("monitoring recovery context", () => {
  it("preserves a monitoring failure and marks it recovered after a later success", () => {
    const timeline = mapAuditTimeline(
      [
        {
          id: "success",
          type: "POSITION_MONITORED",
          severity: "INFO",
          message: "Position monitored.",
          createdAt: "2026-09-14T04:00:00.000Z",
          metadata: {},
        },
        {
          id: "failure",
          type: "MONITORING_FAILED",
          severity: "ERROR",
          message: "Monitoring cycle failed safely.",
          createdAt: "2026-09-14T03:00:00.000Z",
          metadata: {},
        },
      ],
      [],
    );
    expect(timeline.find((event) => event.id === "failure")).toMatchObject({
      recovered: true,
      detail: expect.stringContaining("Recovered on a subsequent monitoring cycle"),
    });
    expect(filterAuditTimeline(timeline, "important").map((event) => event.id)).toContain(
      "failure",
    );
  });
});
