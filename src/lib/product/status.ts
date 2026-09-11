import type { FundingReadiness, FundingReadinessState } from "../funding/readiness";

export type FundingUxStatus = "READY" | "NEEDS FUNDING" | "ALLOWANCE REQUIRED" | "SENDER ISSUE" | "KEEPERHUB UNAVAILABLE";
export function mapFundingReadiness(readiness: FundingReadiness | null): { status: FundingUxStatus; explanation: string; action: string | null } {
  if (!readiness) return { status: "KEEPERHUB UNAVAILABLE", explanation: "Funding readiness has not been checked yet.", action: "Run a protection readiness check." };
  const asset = readiness.requiredAsset; const required = readiness.requiredAmount;
  const handlers: Record<FundingReadinessState, { status: FundingUxStatus; explanation: string; action: string | null }> = {
    READY: { status: "READY", explanation: `PositionGuard currently has enough ${asset} and allowance to protect this position.`, action: null },
    INSUFFICIENT_BALANCE: { status: "NEEDS FUNDING", explanation: `Add at least ${required} ${asset} to your protection balance before automatic protection can execute.`, action: `Send ${asset} to the displayed protection funding address.` },
    INSUFFICIENT_ALLOWANCE: { status: "ALLOWANCE REQUIRED", explanation: `A bounded ${asset} approval of ${readiness.requiredAllowance} is required for Aave protection.`, action: `Approve only ${readiness.requiredAllowance} ${asset} for the displayed Aave spender.` },
    SENDER_MISMATCH: { status: "SENDER ISSUE", explanation: "The protection funding account could not be verified. No action will execute.", action: "Contact PositionGuard support." },
    KEEPERHUB_UNAVAILABLE: { status: "KEEPERHUB UNAVAILABLE", explanation: "The protection service is temporarily unavailable. Monitoring and alerts continue.", action: "Try the readiness check again later." },
    UNSUPPORTED_ASSET: { status: "NEEDS FUNDING", explanation: `${asset} is not currently supported as a protection funding asset.`, action: "Choose a supported protection action." },
  };
  return handlers[readiness.state];
}

export type WorkerStatus = "ONLINE" | "DEGRADED" | "OFFLINE";
export function mapWorkerHealth(input: { enabled: boolean; lastCheck: Date | string | null; lastRunStatus: string | null; pollingIntervalMs: number; now?: Date }) {
  const last = input.lastCheck ? new Date(input.lastCheck) : null; const now = input.now ?? new Date(); const age = last ? now.getTime() - last.getTime() : Number.POSITIVE_INFINITY;
  const status: WorkerStatus = !input.enabled || !last || age > input.pollingIntervalMs * 5 ? "OFFLINE" : input.lastRunStatus === "FAILED" || age > input.pollingIntervalMs * 2.5 ? "DEGRADED" : "ONLINE";
  return { status, lastCheck: last?.toISOString() ?? null };
}
