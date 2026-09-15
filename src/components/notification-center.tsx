"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusPill } from "./ui";
import { LoadingButton } from "./loading-button";
import {
  buildNotificationItems,
  buildMeaningfulNotifications,
  deliveryStatusCopy,
  notificationFilterCount,
  type NotificationFilter,
  type NotificationRecord as Notice,
} from "@/lib/notifications/presentation";
const labels: Record<string, string> = {
  RISK_WATCH: "Risk increased",
  RISK_HIGH: "Risk increased",
  RISK_CRITICAL: "Risk increased",
  MEI_SELECTED: "Protection action selected",
  PROTECTION_BLOCKED: "Protection blocked",
  APPROVAL_REQUIRED: "Approval required",
  EXECUTION_STARTED: "Execution started",
  EXECUTION_CONFIRMED: "Execution successful",
  EXECUTION_FAILED: "Execution failed",
  MONITORING_FAILED: "Monitoring failed",
  POSITION_CHANGED: "Position changed",
};
const filters: Array<{ value: NotificationFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "risk", label: "Risk" },
  { value: "recommendations", label: "Recommendations" },
  { value: "executions", label: "Executions" },
  { value: "failures", label: "Failures" },
  { value: "system", label: "System" },
];
export function NotificationCenter({
  initialFilter = "all",
}: {
  initialFilter?: NotificationFilter;
}) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"meaningful" | "all">("meaningful");
  const [filter, setFilter] = useState<NotificationFilter>(initialFilter);
  const requestInFlight = useRef(false);
  const mounted = useRef(false);
  const meaningful = useMemo(() => buildMeaningfulNotifications(notices), [notices]);
  const visibleItems = useMemo(
    () => buildNotificationItems(notices, { meaningful: view === "meaningful", filter }),
    [filter, notices, view],
  );
  const selectedCount = useMemo(() => notificationFilterCount(notices, filter), [filter, notices]);
  const selectFilter = (value: NotificationFilter) => {
    setFilter(value);
    const url = value === "all" ? "/notifications" : `/notifications?filter=${value}`;
    window.history.replaceState(null, "", url);
  };
  const load = useCallback(async (initial = false) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) throw response.status;
      const body = (await response.json()) as { notifications: Notice[] };
      if (!mounted.current) return;
      setError("");
      setNotices(body.notifications);
    } catch (status) {
      if (!mounted.current) return;
      setError(
        status === 401
          ? "Your session expired."
          : initial
            ? "Notifications are temporarily unavailable."
            : "Could not refresh notifications. We’ll retry automatically.",
      );
    } finally {
      requestInFlight.current = false;
      if (initial && mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const initialRequest = window.setTimeout(() => void load(true), 0);
    let interval: number | null = null;
    const stopPolling = () => {
      if (interval !== null) window.clearInterval(interval);
      interval = null;
    };
    const startPolling = () => {
      if (interval === null) interval = window.setInterval(() => void load(), 12_000);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void load();
        startPolling();
      } else {
        stopPolling();
      }
    };
    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mounted.current = false;
      window.clearTimeout(initialRequest);
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);
  async function refresh() {
    setRefreshing(true);
    await load();
    if (mounted.current) setRefreshing(false);
  }
  async function mark(notificationId?: string) {
    if (pendingId) return;
    setPendingId(notificationId ?? "all");
    setError("");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationId ? { notificationId } : { all: true }),
      });
      if (!response.ok) throw new Error("Notification could not be updated. Please retry.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notification could not be updated.");
    } finally {
      setPendingId(null);
    }
  }
  return (
    <section className="card notification-center">
      <div className="section-heading">
        <div>
          <span className="label">Notification center</span>
          <h2>Meaningful protection events</h2>
          {!loading && (
            <small>
              {meaningful.length} meaningful · {notices.length} total
            </small>
          )}
        </div>
        <div className="button-row">
          <LoadingButton
            className="button secondary"
            pending={refreshing}
            pendingLabel="Refreshing…"
            disabled={refreshing || loading}
            onClick={() => void refresh()}
          >
            Refresh
          </LoadingButton>
          {notices.some((item) => !item.readAt) && (
            <LoadingButton
              className="button secondary"
              pending={pendingId === "all"}
              pendingLabel="Updating…"
              disabled={Boolean(pendingId)}
              onClick={() => void mark()}
            >
              Mark all read
            </LoadingButton>
          )}
        </div>
      </div>
      <div className="notification-views" role="tablist" aria-label="Notification view">
        <button
          type="button"
          role="tab"
          aria-selected={view === "meaningful"}
          className={view === "meaningful" ? "active" : ""}
          onClick={() => setView("meaningful")}
        >
          Meaningful
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "all"}
          className={view === "all" ? "active" : ""}
          onClick={() => setView("all")}
        >
          All notifications
        </button>
      </div>
      <nav className="notification-filters" aria-label="Notification filters">
        {filters.map((item) => (
          <button
            type="button"
            key={item.value}
            className={filter === item.value ? "active" : ""}
            aria-pressed={filter === item.value}
            onClick={() => selectFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {!loading && filter !== "all" && (
        <p className="notification-filter-count">
          {selectedCount} {filter === "executions" ? "executions" : filter}
        </p>
      )}
      {error && (
        <div className={error === "Your session expired." ? "session-expired" : undefined}>
          <p className="form-status error">{error}</p>
          {error === "Your session expired." && (
            <Link className="button primary" href="/onboarding">
              Reconnect Wallet
            </Link>
          )}
        </div>
      )}
      {loading ? (
        <div className="notification-loading" role="status" aria-busy="true">
          <span className="button-spinner" aria-hidden="true" />
          Loading notifications…
        </div>
      ) : visibleItems.length ? (
        <div className="notification-list">
          {visibleItems.map((item) =>
            item.kind === "notification" ? (
              <NotificationRow
                notice={item.notice}
                pendingId={pendingId}
                mark={mark}
                key={item.notice.id}
              />
            ) : item.kind === "mei-group" ? (
              <article
                className={item.notices.some((notice) => !notice.readAt) ? "unread" : "read"}
                key={item.id}
              >
                <span className="notification-dot" />
                <div className="notification-group-copy">
                  <div>
                    <b>Protection recommendation updated</b>
                    <StatusPill tone="good">
                      {item.notices.some((notice) => !notice.readAt) ? "NEW" : "READ"}
                    </StatusPill>
                  </div>
                  <h3>{item.notices.length} recalculations during this risk period</h3>
                  <p>
                    Latest: {item.action.type === "REPAY_DEBT" ? "Repay" : "Add collateral"}{" "}
                    {item.action.amount} {item.action.asset.toUpperCase()}
                  </p>
                  <details className="notification-update-group">
                    <summary>View {item.notices.length} updates</summary>
                    <div>
                      {[...item.notices].reverse().map((notice) => (
                        <NotificationRow
                          notice={notice}
                          pendingId={pendingId}
                          mark={mark}
                          compact
                          key={notice.id}
                        />
                      ))}
                    </div>
                  </details>
                </div>
              </article>
            ) : (
              <ExecutionNotificationGroup
                item={item}
                pendingId={pendingId}
                mark={mark}
                key={item.id}
              />
            ),
          )}
        </div>
      ) : error ? null : (
        <p className="empty-row">
          <b>No protection events yet.</b> Risk changes, approvals, executions, and blocked actions
          will appear here.
        </p>
      )}
    </section>
  );
}

function ExecutionNotificationGroup({
  item,
  pendingId,
  mark,
}: {
  item: Extract<ReturnType<typeof buildNotificationItems>[number], { kind: "execution-group" }>;
  pendingId: string | null;
  mark: (notificationId?: string) => Promise<void>;
}) {
  const metadata = item.latest.metadata ?? {};
  return (
    <article className={item.notices.some((notice) => !notice.readAt) ? "unread" : "read"}>
      <span className="notification-dot" />
      <div className="notification-group-copy">
        <div>
          <b>Autonomous protection execution</b>
          <StatusPill
            tone={
              item.notices.some((notice) => notice.type === "EXECUTION_FAILED") ? "danger" : "good"
            }
          >
            {item.latest.type === "EXECUTION_CONFIRMED" ? "CONFIRMED" : "IN PROGRESS"}
          </StatusPill>
        </div>
        <h3>{item.notices.length} recorded execution events</h3>
        <p>
          {typeof metadata.action === "string"
            ? metadata.action.replaceAll("_", " ")
            : "Protection"}
          {typeof metadata.amount === "string" ? ` · ${metadata.amount}` : ""}
          {typeof metadata.asset === "string" ? ` ${metadata.asset}` : ""}
        </p>
        <div className="execution-notification-proof">
          {typeof metadata.executionId === "string" && (
            <span>
              KeeperHub ID <code>{metadata.executionId}</code>
            </span>
          )}
          {typeof metadata.transactionHash === "string" && (
            <span>
              Transaction <code>{metadata.transactionHash}</code>
            </span>
          )}
          {typeof metadata.transactionLink === "string" && (
            <a href={metadata.transactionLink} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
          {(typeof metadata.healthFactorBefore === "string" ||
            typeof metadata.healthFactorAfter === "string") && (
            <span>
              Health factor {String(metadata.healthFactorBefore ?? "—")} →{" "}
              {String(metadata.healthFactorAfter ?? "—")}
            </span>
          )}
          <span>
            Receipt {metadata.receiptVerified === true ? "verified" : "pending"} · Aave{" "}
            {metadata.aaveVerified === true ? "verified" : "pending"}
          </span>
        </div>
        <details className="notification-update-group" open>
          <summary>View execution timeline</summary>
          <div>
            {[...item.notices]
              .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
              .map((notice) => (
                <NotificationRow
                  notice={notice}
                  pendingId={pendingId}
                  mark={mark}
                  compact
                  key={notice.id}
                />
              ))}
          </div>
        </details>
      </div>
    </article>
  );
}

function NotificationRow({
  notice,
  pendingId,
  mark,
  compact = false,
}: {
  notice: Notice;
  pendingId: string | null;
  mark: (notificationId?: string) => Promise<void>;
  compact?: boolean;
}) {
  return (
    <article className={`${notice.readAt ? "read" : "unread"}${compact ? " compact" : ""}`}>
      {!compact && <span className="notification-dot" />}
      <div>
        <div>
          <b>
            {notice.type === "MEI_SELECTED" && notice.title.includes("updated")
              ? "Protection recommendation updated"
              : (labels[notice.type] ?? notice.title)}
          </b>
          <StatusPill
            tone={
              notice.type.includes("FAILED") || notice.type.includes("BLOCKED")
                ? "danger"
                : notice.type.includes("RISK") || notice.type === "APPROVAL_REQUIRED"
                  ? "warn"
                  : "good"
            }
          >
            {notice.readAt ? "READ" : "NEW"}
          </StatusPill>
        </div>
        <h3>{notice.title}</h3>
        <p>{notice.message}</p>
        <small>
          {new Date(notice.createdAt).toLocaleString()} · {deliveryStatusCopy(notice.webhookStatus)}
        </small>
      </div>
      {!notice.readAt && (
        <LoadingButton
          className="notification-read-button"
          pending={pendingId === notice.id}
          pendingLabel="Updating…"
          disabled={Boolean(pendingId)}
          onClick={() => void mark(notice.id)}
        >
          Mark read
        </LoadingButton>
      )}
    </article>
  );
}
