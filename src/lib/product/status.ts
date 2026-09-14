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
        "PositionGuard will evaluate funding readiness automatically when a protection action is selected.",
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
      action: `Send ${asset} to the displayed Protection Account.`,
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

export type WorkerStatus = "ONLINE" | "DEGRADED" | "OFFLINE" | "NOT_STARTED";
export type MonitoringPresentation = {
  state: WorkerStatus;
  active: boolean;
  dashboardLabel: "ACTIVE" | "INACTIVE" | "DEGRADED" | "UNAVAILABLE";
  sidebar: { heading: string; detail: string; tone: "good" | "warn" | "neutral" };
};
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
  const status: WorkerStatus = !last
    ? "NOT_STARTED"
    : !input.enabled || age > input.pollingIntervalMs * 5
      ? "OFFLINE"
      : input.lastRunStatus === "FAILED" || age > input.pollingIntervalMs * 2.5
        ? "DEGRADED"
        : "ONLINE";
  return { status, lastCheck: last?.toISOString() ?? null };
}

export type ProtectionIndicator = {
  tone: "good" | "warn" | "danger";
  label: string;
} | null;

export function mapProtectionIndicator(input: {
  enabled: boolean;
  workerStatus: WorkerStatus;
  riskLevel: string;
  attention: boolean;
  blocked: boolean;
}): ProtectionIndicator {
  if (!input.enabled) return null;
  if (input.blocked || input.riskLevel === "CRITICAL")
    return { tone: "danger", label: "Protection blocked or critical risk" };
  if (input.attention || input.riskLevel === "WATCH" || input.riskLevel === "HIGH")
    return { tone: "warn", label: "Protection action needs attention" };
  if (input.workerStatus === "ONLINE")
    return { tone: "good", label: "Protection enabled and monitoring healthy" };
  return null;
}

export function mapSidebarStatus(input: {
  authenticated: boolean;
  enabled: boolean;
  workerStatus: WorkerStatus;
}): { heading: string; detail: string; tone: "good" | "warn" | "neutral" } {
  if (!input.authenticated)
    return { heading: "Connect wallet", detail: "Protection not configured", tone: "neutral" };
  return mapMonitoringPresentation({
    policyEnabled: input.enabled,
    workerStatus: input.workerStatus,
  }).sidebar;
}

/** The single user-facing interpretation of policy and worker state. */
export function mapMonitoringPresentation(input: {
  policyEnabled: boolean;
  workerStatus: WorkerStatus;
}): MonitoringPresentation {
  if (!input.policyEnabled)
    return {
      state: input.workerStatus,
      active: false,
      dashboardLabel: "INACTIVE",
      sidebar: {
        heading: "Protection disabled",
        detail: "Monitoring inactive",
        tone: "neutral",
      },
    };
  if (input.workerStatus === "ONLINE")
    return {
      state: "ONLINE",
      active: true,
      dashboardLabel: "ACTIVE",
      sidebar: {
        heading: "Protection active",
        detail: "Monitoring is online",
        tone: "good",
      },
    };
  if (input.workerStatus === "DEGRADED")
    return {
      state: "DEGRADED",
      active: true,
      dashboardLabel: "DEGRADED",
      sidebar: {
        heading: "Monitoring degraded",
        detail: "Worker needs attention",
        tone: "warn",
      },
    };
  if (input.workerStatus === "NOT_STARTED")
    return {
      state: "NOT_STARTED",
      active: false,
      dashboardLabel: "INACTIVE",
      sidebar: {
        heading: "Protection enabled",
        detail: "Monitoring not started",
        tone: "neutral",
      },
    };
  return {
    state: "OFFLINE",
    active: false,
    dashboardLabel: "UNAVAILABLE",
    sidebar: {
      heading: "Monitoring unavailable",
      detail: "Worker offline",
      tone: "warn",
    },
  };
}

export function fundingCta(status: FundingUxStatus): string | null {
  const labels: Record<FundingUxStatus, string | null> = {
    NOT_CHECKED: "Check funding readiness",
    NO_ACTION_REQUIRED: null,
    READY: "Refresh funding status",
    INSUFFICIENT_BALANCE: "Recheck protection funds",
    INSUFFICIENT_ALLOWANCE: "Recheck bounded allowance",
    SENDER_MISMATCH: null,
    KEEPERHUB_UNAVAILABLE: "Retry KeeperHub check",
    UNSUPPORTED_ASSET: null,
  };
  return labels[status];
}
