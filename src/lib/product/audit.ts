import type { AuditView, ExecutionView } from "./models";
export interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  detail: string;
  timestamp: string;
  tone: "good" | "warn" | "danger" | "neutral";
  execution?: ExecutionView;
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
  const audit = events.map((event) => ({
    id: event.id,
    type: event.type,
    title: humanize(event.type),
    detail: event.message,
    timestamp: event.createdAt,
    tone:
      event.severity === "ERROR"
        ? ("danger" as const)
        : event.severity === "WARNING"
          ? ("warn" as const)
          : ("neutral" as const),
  }));
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
