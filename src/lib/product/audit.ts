import type { AuditView, ExecutionView } from "./models";
import { classifyProtectionEvent } from "../notifications/classification";
export interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  detail: string;
  timestamp: string;
  tone: "good" | "warn" | "danger" | "neutral";
  recovered?: boolean;
  execution?: ExecutionView;
}
export type ActivityFilter = "important" | "all" | "monitoring" | "executions" | "warnings";

export const isRoutineMonitoringEvent = (event: TimelineEvent) =>
  event.type === "POSITION_MONITORED" ||
  event.type === "MONITORING_COMPLETED" ||
  event.type === "MONITORING_RUN";

export function filterAuditTimeline(events: TimelineEvent[], filter: ActivityFilter) {
  if (filter === "all") return events.filter((event) => !isRoutineMonitoringEvent(event));
  if (filter === "monitoring") return [];
  if (filter === "executions")
    return events.filter(
      (event) =>
        Boolean(event.execution) ||
        classifyProtectionEvent({ type: event.type }) === "executions" ||
        /SIMULATION/.test(event.type),
    );
  if (filter === "warnings")
    return events.filter((event) => event.tone === "warn" || event.tone === "danger");
  return events.filter((event) => !isRoutineMonitoringEvent(event));
}
const humanize = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
export function mapAuditTimeline(
  events: AuditView[],
  executions: ExecutionView[],
): TimelineEvent[] {
  const successfulMonitoringTypes = new Set([
    "POSITION_MONITORED",
    "RISK_THRESHOLD_CROSSED",
    "CANDIDATES_EVALUATED",
    "MEI_SELECTED",
  ]);
  const audit = events.map((event) => {
    const recovered =
      event.type === "MONITORING_FAILED" &&
      events.some(
        (candidate) =>
          successfulMonitoringTypes.has(candidate.type) &&
          Date.parse(candidate.createdAt) > Date.parse(event.createdAt),
      );
    return {
      id: event.id,
      type: event.type,
      title: humanize(event.type),
      detail: recovered
        ? `${event.message} Recovered on a subsequent monitoring cycle.`
        : event.message,
      timestamp: event.createdAt,
      tone:
        event.severity === "ERROR"
          ? ("danger" as const)
          : event.severity === "WARNING"
            ? ("warn" as const)
            : ("neutral" as const),
      recovered,
    };
  });
  const executionEvents = executions.map((execution) => ({
    id: `execution:${execution.id}`,
    type: `EXECUTION_${execution.status}`,
    title:
      execution.status === "CONFIRMED"
        ? "Protection execution confirmed"
        : `Protection execution ${execution.status.toLowerCase()}`,
    detail: `${execution.action === "REPAY_DEBT" ? "Repaid" : "Supplied"} ${execution.displayAmount} ${execution.asset}.`,
    timestamp: execution.completedAt ?? execution.createdAt,
    tone:
      execution.status === "CONFIRMED"
        ? ("good" as const)
        : execution.status === "FAILED"
          ? ("danger" as const)
          : execution.status === "CANCELLED"
            ? ("warn" as const)
            : ("neutral" as const),
    execution,
  }));
  return [...audit, ...executionEvents].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  );
}
