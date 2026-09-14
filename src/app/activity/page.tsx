import { Card, EmptyState, PageHeader, StatusPill } from "@/components/ui";
import { Icon } from "@/components/icons";
import { loadActivityData as loadProductData } from "@/lib/product/current-data";
import {
  filterAuditTimeline,
  isRoutineMonitoringEvent,
  mapAuditTimeline,
  type ActivityFilter,
  type TimelineEvent,
} from "@/lib/product/audit";
import { formatNumber, shortAddress } from "@/lib/product/format";
import { postExecutionExplanation } from "@/lib/agent/explanation";
export const dynamic = "force-dynamic";
import Link from "next/link";

const filters: Array<{ value: ActivityFilter; label: string }> = [
  { value: "important", label: "Important" },
  { value: "all", label: "All activity" },
  { value: "monitoring", label: "Monitoring" },
  { value: "executions", label: "Executions" },
  { value: "warnings", label: "Warnings / Errors" },
];

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const data = await loadProductData();
  const events = mapAuditTimeline(data.auditEvents, data.executions);
  const requestedFilter = (await searchParams).filter;
  const filter = filters.some((item) => item.value === requestedFilter)
    ? (requestedFilter as ActivityFilter)
    : "important";
  const visibleEvents = filterAuditTimeline(events, filter);
  const monitoringEvents = events.filter(isRoutineMonitoringEvent);
  const importantCount = filterAuditTimeline(events, "important").length;
  const latest = data.latestExecution;
  return (
    <div className="page">
      <PageHeader
        eyebrow="IMMUTABLE ACCOUNTABILITY"
        title="Activity & Audit Trail"
        description="Chronological evidence for observations, decisions, safety gates, and executions."
      >
        <StatusPill tone="blue">
          {importantCount} IMPORTANT · {data.totalActivityEvents} TOTAL
        </StatusPill>
      </PageHeader>
      {latest && (
        <div className="explanation-card">
          <span className="eyebrow">WHAT POSITIONGUARD CHECKED</span>
          <h2>Latest execution explanation</h2>
          <p>
            {postExecutionExplanation({
              amount: latest.displayAmount,
              asset: latest.asset,
              healthFactorBefore: latest.healthFactorBefore,
              healthFactorAfter: latest.healthFactorAfter,
              status: latest.status,
            })}
          </p>
          <details>
            <summary>Show technical details</summary>
            <p>
              Simulation {latest.simulationStatus.toLowerCase()} · receipt{" "}
              {latest.receiptVerified ? "verified" : "not verified"} · status{" "}
              {latest.status.toLowerCase()}
            </p>
          </details>
        </div>
      )}
      <nav className="activity-filters" aria-label="Activity filters">
        {filters.map((item) => (
          <Link
            key={item.value}
            href={item.value === "important" ? "/activity" : `/activity?filter=${item.value}`}
            className={filter === item.value ? "active" : ""}
            aria-current={filter === item.value ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <p className="activity-count">
        Showing{" "}
        {visibleEvents.length +
          (filter !== "executions" && filter !== "warnings" && monitoringEvents.length
            ? 1
            : 0)}{" "}
        grouped entries · {data.totalActivityEvents} total audit events
      </p>
      {events.length ? (
        <Card className="audit-card">
          <div className="audit-list">
            {filter !== "executions" && filter !== "warnings" && monitoringEvents.length > 0 && (
              <details className="monitoring-group" open={filter === "monitoring"}>
                <summary>
                  <span>
                    <b>Position monitored {monitoringEvents.length} times</b>
                    <small>
                      Last check:{" "}
                      {new Date(monitoringEvents[0]!.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </span>
                  <span>View monitoring history</span>
                </summary>
                <div className="monitoring-history">
                  {monitoringEvents.map((event) => (
                    <AuditEventRow event={event} key={event.id} />
                  ))}
                </div>
              </details>
            )}
            {visibleEvents.map((event) => (
              <AuditEventRow event={event} key={event.id} />
            ))}
            {visibleEvents.length === 0 &&
              (filter !== "monitoring" || monitoringEvents.length === 0) && (
                <p className="empty-row">No events match this filter.</p>
              )}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState title="No protection activity yet.">
            PositionGuard activity will appear here after Monitoring or Protection events occur.
          </EmptyState>
        </Card>
      )}
      <div className="audit-note">
        <Icon name="database" />
        <p>
          <b>Database-backed evidence.</b> This page combines persisted audit records and execution
          receipts. Transaction details are never hardcoded into the interface.
        </p>
      </div>
    </div>
  );
}

function AuditEventRow({ event }: { event: TimelineEvent }) {
  return (
    <article className={`audit-event ${event.execution ? "execution-event" : ""}`}>
      <div className={`audit-dot ${event.tone}`}>
        {event.tone === "good" ? (
          <Icon name="check" />
        ) : event.tone === "warn" || event.tone === "danger" ? (
          "!"
        ) : (
          <span />
        )}
      </div>
      <time>
        {new Date(event.timestamp).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}
        <small>
          {new Date(event.timestamp).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </small>
      </time>
      <div className="audit-content">
        <div>
          <h3>{event.title}</h3>
          <StatusPill tone={event.tone}>{event.type}</StatusPill>
          {event.recovered && <StatusPill tone="good">RECOVERED</StatusPill>}
        </div>
        <p>{event.detail}</p>
        {event.execution && (
          <div className="execution-proof">
            <span>
              Action <b>{event.execution.action.replaceAll("_", " ")}</b>
            </span>
            <span>
              Amount{" "}
              <b>
                {event.execution.displayAmount} {event.execution.asset}
              </b>
            </span>
            <span>
              Health factor{" "}
              <b>
                {formatNumber(event.execution.healthFactorBefore, 6)} →{" "}
                {formatNumber(event.execution.healthFactorAfter, 6)}
              </b>
            </span>
            <span>
              Receipt <b>{event.execution.receiptVerified ? "Verified" : "Not verified"}</b>
            </span>
            <span>
              Aave effect <b>{event.execution.receiptVerified ? "Verified" : "Not verified"}</b>
            </span>
            {event.execution.keeperHubExecutionId && (
              <span>
                KeeperHub ID <code>{event.execution.keeperHubExecutionId}</code>
              </span>
            )}
            {event.execution.transactionHash && (
              <span>
                Transaction <code>{shortAddress(event.execution.transactionHash, 10, 8)}</code>
              </span>
            )}
            {event.execution.transactionLink && (
              <a href={event.execution.transactionLink} target="_blank" rel="noreferrer">
                View on BaseScan <Icon name="external" />
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
