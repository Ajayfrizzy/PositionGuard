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
  buildNotificationItems,
  buildMeaningfulNotifications,
  filterNotifications,
  NOTIFICATION_PAGE_SIZE,
  notificationDeliveryPresentation,
  notificationEventTone,
  notificationFilterCount,
  paginateNotificationItems,
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

  it("starts only after canonical readiness and keeps real failures attempt-scoped", () => {
    const monitoring = source("src/lib/monitoring/service.ts");
    expect(monitoring).toContain("onCanonicalReady: async (canonical)");
    expect(monitoring).toContain(":execution:${canonical.effectFingerprint}:started");
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
    const rows = [
      notice("one", "MEI_SELECTED", "2026-09-14T01:00:00Z", "REPAY_DEBT:usdc:1"),
      notice("two", "MEI_SELECTED", "2026-09-14T02:00:00Z", "REPAY_DEBT:usdc:1"),
    ];
    expect(buildNotificationItems(rows, { meaningful: false, filter: "all" })).toHaveLength(2);
  });

  it("classifies Risk, Recommendations, Executions, Failures, and System independently", () => {
    const rows = [
      notice("risk", "RISK_HIGH", "2026-09-14T01:00:00Z"),
      notice("recommendation", "MEI_SELECTED", "2026-09-14T02:00:00Z", "REPAY_DEBT:usdc:1"),
      notice("execution", "EXECUTION_CONFIRMED", "2026-09-14T03:00:00Z"),
      notice("failure", "EXECUTION_FAILED", "2026-09-14T04:00:00Z"),
      {
        ...notice("system", "POSITION_CHANGED", "2026-09-14T05:00:00Z"),
        metadata: { outcome: "STALE_INTERVENTION_CANCELLED" },
      },
    ];
    expect(filterNotifications(rows, "risk").map((row) => row.id)).toEqual(["risk"]);
    expect(filterNotifications(rows, "recommendations").map((row) => row.id)).toEqual([
      "recommendation",
    ]);
    expect(filterNotifications(rows, "executions").map((row) => row.id)).toEqual(["execution"]);
    expect(filterNotifications(rows, "failures").map((row) => row.id)).toEqual(["failure"]);
    expect(filterNotifications(rows, "system").map((row) => row.id)).toEqual(["system"]);
  });

  it("groups one execution timeline without grouping distinct confirmed executions", () => {
    const started = notice("started", "EXECUTION_STARTED", "2026-09-14T01:00:00Z");
    const confirmed = notice("confirmed", "EXECUTION_CONFIRMED", "2026-09-14T02:00:00Z");
    const other = notice("other", "EXECUTION_CONFIRMED", "2026-09-14T03:00:00Z");
    started.metadata = { canonicalIntentFingerprint: "intent-1" };
    confirmed.metadata = { canonicalIntentFingerprint: "intent-1", receiptVerified: true };
    other.metadata = { canonicalIntentFingerprint: "intent-2", receiptVerified: true };
    const items = buildNotificationItems([other, confirmed, started], {
      meaningful: true,
      filter: "executions",
    });
    expect(items).toHaveLength(2);
    expect(
      items.find((item) => item.kind !== "notification" && item.id === "execution:intent-1"),
    ).toMatchObject({
      kind: "execution-group",
      notices: expect.arrayContaining([
        expect.objectContaining({ id: "started" }),
        expect.objectContaining({ id: "confirmed" }),
      ]),
    });
    expect(notificationFilterCount([other, confirmed, started], "executions")).toBe(2);
  });

  it("keeps event failures separate from webhook delivery attention", () => {
    const withDelivery = (id: string, type: string, webhookStatus: string) => ({
      ...notice(id, type, `2026-09-14T0${id.length}:00:00Z`),
      webhookStatus,
    });
    const recommendationFailedDelivery = withDelivery("mei", "MEI_SELECTED", "FAILED");
    const confirmedFailedDelivery = withDelivery("confirmed", "EXECUTION_CONFIRMED", "FAILED");
    const executionFailedDelivered = withDelivery(
      "failed-delivered",
      "EXECUTION_FAILED",
      "DELIVERED",
    );
    const executionFailedDelivery = withDelivery("failed-webhook", "EXECUTION_FAILED", "FAILED");
    const monitoringFailed = withDelivery("monitoring", "MONITORING_FAILED", "SKIPPED");
    const riskFailedDelivery = withDelivery("risk", "RISK_WATCH", "FAILED");
    const rows = [
      recommendationFailedDelivery,
      confirmedFailedDelivery,
      executionFailedDelivered,
      executionFailedDelivery,
      monitoringFailed,
      riskFailedDelivery,
    ];

    expect(filterNotifications([recommendationFailedDelivery], "recommendations")).toHaveLength(1);
    expect(filterNotifications([recommendationFailedDelivery], "delivery")).toHaveLength(1);
    expect(filterNotifications([recommendationFailedDelivery], "failures")).toHaveLength(0);
    expect(filterNotifications([confirmedFailedDelivery], "executions")).toHaveLength(1);
    expect(filterNotifications([confirmedFailedDelivery], "delivery")).toHaveLength(1);
    expect(filterNotifications([confirmedFailedDelivery], "failures")).toHaveLength(0);
    expect(filterNotifications([executionFailedDelivered], "failures")).toHaveLength(1);
    expect(filterNotifications([executionFailedDelivered], "delivery")).toHaveLength(0);
    expect(filterNotifications([executionFailedDelivery], "failures")).toHaveLength(1);
    expect(filterNotifications([executionFailedDelivery], "delivery")).toHaveLength(1);
    expect(filterNotifications([monitoringFailed], "failures")).toHaveLength(1);
    expect(filterNotifications([riskFailedDelivery], "risk")).toHaveLength(1);
    expect(filterNotifications([riskFailedDelivery], "delivery")).toHaveLength(1);
    expect(filterNotifications([riskFailedDelivery], "failures")).toHaveLength(0);
    expect(notificationFilterCount(rows, "failures")).toBe(3);
    expect(notificationFilterCount(rows, "delivery")).toBe(4);
    expect(notificationDeliveryPresentation("FAILED")).toEqual({
      inApp: "RECORDED",
      webhook: "FAILED",
      tone: "warning",
    });
  });

  it("includes pending webhook deliveries in Delivery without changing event category", () => {
    const pending = {
      ...notice("pending", "MEI_SELECTED", "2026-09-14T01:00:00Z"),
      webhookStatus: "PENDING",
    };
    expect(filterNotifications([pending], "delivery")).toEqual([pending]);
    expect(filterNotifications([pending], "recommendations")).toEqual([pending]);
    expect(filterNotifications([pending], "failures")).toEqual([]);
  });

  it("paginates to 25 and loads 25 more while preserving the full semantic count", () => {
    const rows = Array.from({ length: 61 }, (_, index) =>
      notice(`failure-${index}`, "EXECUTION_FAILED", "2026-09-14T01:00:00Z"),
    );
    const items = buildNotificationItems(rows, { meaningful: true, filter: "failures" });
    expect(NOTIFICATION_PAGE_SIZE).toBe(25);
    expect(notificationFilterCount(rows, "failures")).toBe(61);
    expect(paginateNotificationItems(items, 25)).toHaveLength(25);
    expect(paginateNotificationItems(items, 50)).toHaveLength(50);
    expect(paginateNotificationItems(items, 75)).toHaveLength(61);
    const component = source("src/components/notification-center.tsx");
    expect(component).toContain("const selectFilter = (value: NotificationFilter)");
    expect(component).toContain('const selectView = (value: "meaningful" | "all")');
    expect(component.match(/setVisibleCount\(NOTIFICATION_PAGE_SIZE\)/g)).toHaveLength(2);
    expect(component).toContain("Load 25 more");
  });
});

describe("notification delivery presentation", () => {
  it("maps every webhook state to compact icon-and-text semantics", () => {
    expect(notificationDeliveryPresentation("DELIVERED")).toMatchObject({
      inApp: "RECORDED",
      webhook: "DELIVERED",
      tone: "success",
    });
    expect(notificationDeliveryPresentation("FAILED")).toMatchObject({
      webhook: "FAILED",
      tone: "warning",
    });
    expect(notificationDeliveryPresentation("PENDING")).toMatchObject({
      webhook: "PENDING",
      tone: "pending",
    });
    expect(notificationDeliveryPresentation("SKIPPED")).toMatchObject({
      webhook: "NOT CONFIGURED",
      tone: "muted",
    });
    const component = source("src/components/notification-center.tsx");
    expect(component).toContain('<span className="notification-delivery-label">Delivery</span>');
    expect(component).toContain('className="delivery-in-app" aria-label="In-app recorded"');
    expect(component).toContain('<span className="delivery-channel">In-app</span>');
    expect(component).toContain('<span className="delivery-channel">Webhook</span>');
    expect(component).toContain('? "•"');
    expect(component).not.toContain("delivery.inApp.charAt");
  });

  it("keeps delivery inline on desktop and wraps without horizontal overflow", () => {
    const css = source("src/app/productization.css");
    const deliveryStyles = css.slice(css.indexOf(".notification-list .notification-delivery"));
    expect(deliveryStyles).toContain("display: flex");
    expect(deliveryStyles).toContain("flex-wrap: wrap");
    expect(deliveryStyles).toContain("max-width: 100%");
    expect(deliveryStyles).toContain("min-width: 0");
    expect(deliveryStyles).toContain("white-space: nowrap");
  });

  it("keeps an execution failure primary and renders webhook failure as secondary warning", () => {
    expect(notificationEventTone("EXECUTION_FAILED")).toBe("danger");
    expect(notificationDeliveryPresentation("FAILED")).toMatchObject({
      inApp: "RECORDED",
      webhook: "FAILED",
      tone: "warning",
    });
  });

  it("keeps a recommendation successful when its webhook delivery fails", () => {
    expect(notificationEventTone("MEI_SELECTED")).toBe("good");
    expect(notificationDeliveryPresentation("FAILED").tone).toBe("warning");
  });

  it("keeps a confirmed execution successful and labels delivered transport separately", () => {
    expect(notificationEventTone("EXECUTION_CONFIRMED")).toBe("good");
    expect(notificationDeliveryPresentation("DELIVERED")).toEqual({
      inApp: "RECORDED",
      webhook: "DELIVERED",
      tone: "success",
    });
  });

  it("presents skipped or unavailable webhooks as not configured without changing the event", () => {
    expect(notificationEventTone("RISK_WATCH")).toBe("warn");
    expect(notificationDeliveryPresentation("SKIPPED")).toEqual({
      inApp: "RECORDED",
      webhook: "NOT CONFIGURED",
      tone: "muted",
    });
  });

  it("places grouped execution delivery outside execution proof and timeline rows", () => {
    const component = source("src/components/notification-center.tsx");
    const group = component.slice(component.indexOf("function ExecutionNotificationGroup"));
    expect(group.indexOf('className="execution-notification-proof"')).toBeLessThan(
      group.indexOf("<NotificationDelivery status={item.latest.webhookStatus}"),
    );
    expect(group.indexOf("<NotificationDelivery status={item.latest.webhookStatus}")).toBeLessThan(
      group.indexOf('className="notification-update-group"'),
    );
    expect(group).toContain("showDelivery={false}");
    expect(component.indexOf("<p>{notice.message}</p>")).toBeLessThan(
      component.indexOf("{showDelivery && <NotificationDelivery"),
    );
    const css = source("src/app/productization.css");
    expect(css).toContain(".delivery-webhook.warning");
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
