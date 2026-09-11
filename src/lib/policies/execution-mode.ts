export type PolicyExecutionMode = "MONITOR_ONLY" | "REQUIRE_APPROVAL" | "AUTONOMOUS";
export type ExecutionDisposition = "OBSERVE" | "SIMULATE" | "EXECUTE" | "BLOCK";
export function executionDisposition(input: {
  mode: PolicyExecutionMode;
  actionable: boolean;
  ready: boolean;
}): ExecutionDisposition {
  if (!input.actionable || input.mode === "MONITOR_ONLY") return "OBSERVE";
  if (!input.ready) return "BLOCK";
  return input.mode === "REQUIRE_APPROVAL" ? "SIMULATE" : "EXECUTE";
}
