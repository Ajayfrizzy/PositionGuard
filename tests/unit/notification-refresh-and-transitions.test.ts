import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  actionNotificationIdentity,
  shouldNotifyBlocker,
  shouldNotifyRecovery,
  shouldNotifyRisk,
} from "../../src/lib/notifications/transitions";
import { notify, type NotificationStore } from "../../src/lib/notifications/service";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const state = (riskLevel: string | null, blockerReason: string | null = null) => ({
  riskLevel,
  blockerReason,
  actionIdentity: null,
  approvalPending: false,
});

describe("notification transition semantics", () => {
  it("notifies SAFE → WATCH and WATCH → HIGH, but not WATCH → WATCH", () => {
    expect(shouldNotifyRisk(state("SAFE"), "WATCH")).toBe(true);
    expect(shouldNotifyRisk(state("WATCH"), "HIGH")).toBe(true);
    expect(shouldNotifyRisk(state("WATCH"), "WATCH")).toBe(false);
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
    expect(route).toContain("take: 100");
  });

  it("ties separate execution attempts to separate monitoring run identities", () => {
    const monitoring = source("src/lib/monitoring/service.ts");
    expect(monitoring).toContain(":execution:${run.id}:${selected.candidate.id}:started");
    expect(monitoring).toContain(
      ":execution:${run.id}:${selected.candidate.id}:failed:${blockerReason}",
    );
  });
});
