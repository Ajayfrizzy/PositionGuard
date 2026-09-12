"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
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
  async function load() {
    const response = await fetch("/api/notifications");
    if (!response.ok) {
      setError(
        response.status === 401
          ? "Your session expired."
          : "Notifications are temporarily unavailable.",
      );
      return;
    }
    const body = (await response.json()) as { notifications: Notice[] };
    setError("");
    setNotices(body.notifications);
  }
  useEffect(() => {
    let active = true;
    fetch("/api/notifications")
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((body: { notifications: Notice[] }) => {
        if (active) setNotices(body.notifications);
      })
      .catch((status: unknown) => {
        if (active) {
          setError(
            status === 401 ? "Your session expired." : "Notifications are temporarily unavailable.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
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
      {error && (
        <div className="session-expired">
          <p className="form-status error">{error}</p>
          <Link className="button primary" href="/onboarding">
            Reconnect Wallet
          </Link>
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
                  <b>{labels[notice.type] ?? notice.title}</b>
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
      ) : (
        <p className="empty-row">
          No notifications yet. Repetitive monitoring events are deduplicated automatically.
        </p>
      )}
    </section>
  );
}
