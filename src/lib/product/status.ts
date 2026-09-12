import type { FundingReadiness, FundingReadinessState } from "../funding/readiness";

export type FundingUxStatus = "NOT_CHECKED" | "NO_ACTION_REQUIRED" | FundingReadinessState;
export function mapFundingReadiness(
  readiness: FundingReadiness | null,
  emptyState: "NOT_CHECKED" | "NO_ACTION_REQUIRED" = "NOT_CHECKED",
): {
  status: FundingUxStatus;
  explanation: string;
  action: string | null;
} {
  if (!readiness && emptyState === "NO_ACTION_REQUIRED")
    return {
      status: "NO_ACTION_REQUIRED",
      explanation: "No protection action currently requires funding.",
      action:
        "No protection funding check is required right now. PositionGuard will evaluate funding readiness automatically when a protection action is selected.",
    };
  if (!readiness)
    return {
      status: "NOT_CHECKED",
      explanation: "Funding readiness has not been checked yet.",
      action: "Run a protection readiness check.",
    };
  const asset = readiness.requiredAsset;
  const handlers: Record<
    FundingReadinessState,
    { status: FundingUxStatus; explanation: string; action: string | null }
  > = {
    READY: {
      status: "READY",
      explanation: "Protection funding is ready.",
      action: null,
    },
    INSUFFICIENT_BALANCE: {
      status: "INSUFFICIENT_BALANCE",
      explanation: "Add more protection funds.",
      action: `Send ${asset} to the displayed protection funding address.`,
    },
    INSUFFICIENT_ALLOWANCE: {
      status: "INSUFFICIENT_ALLOWANCE",
      explanation: "A bounded Aave approval is required.",
      action: `Approve only ${readiness.requiredAllowance} ${asset} for the displayed Aave spender.`,
    },
    SENDER_MISMATCH: {
      status: "SENDER_MISMATCH",
      explanation: "Protection sender configuration does not match.",
      action: "Contact PositionGuard support.",
    },
    KEEPERHUB_UNAVAILABLE: {
      status: "KEEPERHUB_UNAVAILABLE",
      explanation: "KeeperHub could not be reached or verified.",
      action: "Try the readiness check again later.",
    },
    UNSUPPORTED_ASSET: {
      status: "UNSUPPORTED_ASSET",
      explanation: "This protection asset is not currently supported.",
      action: "Choose a supported protection action.",
    },
  };
  return handlers[readiness.state];
}

export type WorkerStatus = "ONLINE" | "DEGRADED" | "OFFLINE";
export function mapWorkerHealth(input: {
  enabled: boolean;
  lastCheck: Date | string | null;
  lastRunStatus: string | null;
  pollingIntervalMs: number;
  now?: Date;
}) {
  const last = input.lastCheck ? new Date(input.lastCheck) : null;
  const now = input.now ?? new Date();
  const age = last ? now.getTime() - last.getTime() : Number.POSITIVE_INFINITY;
  const status: WorkerStatus =
    !input.enabled || !last || age > input.pollingIntervalMs * 5
      ? "OFFLINE"
      : input.lastRunStatus === "FAILED" || age > input.pollingIntervalMs * 2.5
        ? "DEGRADED"
        : "ONLINE";
  return { status, lastCheck: last?.toISOString() ?? null };
}
