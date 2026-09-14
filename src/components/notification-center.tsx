"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusPill } from "./ui";
import { LoadingButton } from "./loading-button";
type Notice = {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  webhookStatus: string;
  createdAt: string;
};
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
  POSITION_CHANGED: "Position changed",
};
export function NotificationCenter() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestInFlight = useRef(false);
  const mounted = useRef(false);
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
      ) : notices.length ? (
        <div className="notification-list">
          {notices.map((notice) => (
            <article className={notice.readAt ? "read" : "unread"} key={notice.id}>
              <span className="notification-dot" />
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
                  {new Date(notice.createdAt).toLocaleString()} · Delivery{" "}
                  {notice.webhookStatus.toLowerCase()}
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
          ))}
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
