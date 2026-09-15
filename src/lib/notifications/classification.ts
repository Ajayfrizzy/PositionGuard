export type EventCategory = "risk" | "recommendations" | "executions" | "failures" | "system";

export function classifyProtectionEvent(input: {
  type: string;
  severity?: string;
  metadata?: Record<string, unknown>;
}): EventCategory {
  if (
    input.type === "EXECUTION_FAILED" ||
    input.type === "MONITORING_FAILED" ||
    input.type === "WEBHOOK_FAILED" ||
    input.type === "PROTECTION_BLOCKED" ||
    input.severity === "ERROR"
  )
    return "failures";
  if (/^RISK_/.test(input.type)) return "risk";
  if (input.type === "POSITION_CHANGED")
    return input.metadata?.outcome === "STALE_INTERVENTION_CANCELLED" ? "system" : "risk";
  if (
    input.type === "MEI_SELECTED" ||
    input.type === "PROTECTION_RECOMMENDATION_UPDATED" ||
    input.type === "APPROVAL_REQUIRED"
  )
    return "recommendations";
  if (
    /^EXECUTION_/.test(input.type) ||
    input.type === "REPAYMENT_CONFIRMED" ||
    input.type === "RECEIPT_VERIFIED" ||
    input.type === "AAVE_EVENT_CONFIRMED"
  )
    return "executions";
  return "system";
}
