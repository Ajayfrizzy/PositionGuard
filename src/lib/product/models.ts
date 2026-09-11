import type { CandidateAction, RiskLevel } from "../protection/types";

export type ConnectionState = "connected" | "disconnected" | "unknown";
export interface ProductPolicy {
  executionMode: "MONITOR_ONLY" | "REQUIRE_APPROVAL" | "AUTONOMOUS";
  id: string | null;
  targetHealthFactor: string;
  warningHealthFactor: string;
  emergencyHealthFactor: string;
  maxAutonomousAmountUsd: string;
  maxDailyAutonomousAmountUsd: string;
  approvalRequiredAboveUsd: string;
  allowRepay: boolean;
  allowAddCollateral: boolean;
  interventionCooldownMinutes: number;
  enabled: boolean;
  updatedAt: string | null;
}
export interface ProductPosition {
  wallet: string | null;
  healthFactor: string | null;
  totalCollateralUsd: string;
  totalDebtUsd: string;
  availableBorrowsUsd: string;
  liquidationThreshold: string | null;
  blockNumber: string | null;
  blockTimestamp: string | null;
  capturedAt: string | null;
  reserves: Array<{ asset: string; symbol: string; suppliedBalance: string; suppliedUsd: string; debtBalance: string; debtUsd: string; walletBalance: string; walletBalanceUsd: string; collateralEnabled: boolean; liquidationThreshold: string }>;
}
export interface CandidateView extends CandidateAction {
  state: "selected" | "rejected" | "valid" | "approval";
  label: string;
  reason: string;
}
export interface ExecutionView {
  id: string;
  status: "NOT_STARTED" | "SUBMITTED" | "CONFIRMED" | "FAILED" | "UNCONFIRMED" | "CANCELLED";
  simulationStatus: "NOT_STARTED" | "SUCCEEDED" | "FAILED";
  action: string;
  asset: string;
  amount: string;
  displayAmount: string;
  transactionHash: string | null;
  transactionLink: string | null;
  keeperHubExecutionId: string | null;
  receiptVerified: boolean;
  healthFactorBefore: string | null;
  healthFactorAfter: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}
export interface AuditView { id: string; type: string; severity: "INFO" | "WARNING" | "ERROR"; message: string; createdAt: string; metadata: Record<string, unknown> }
export interface ProductData {
  protectedAccountId: string | null;
  database: ConnectionState;
  network: { chainId: number; name: string; testnet: boolean; explorer: string };
  position: ProductPosition;
  policy: ProductPolicy;
  riskLevel: RiskLevel;
  analysisHealthFactor: string | null;
  candidates: CandidateView[];
  selectedCandidate: CandidateView | null;
  protectionAttention: boolean;
  latestExecution: ExecutionView | null;
  executions: ExecutionView[];
  auditEvents: AuditView[];
  positionChangedAt: string | null;
  keeperHub: { authenticated: ConnectionState; senderVerified: ConnectionState; sender: string | null };
  rpc: ConnectionState;
  aave: ConnectionState;
  error: string | null;
  monitoring: { active: boolean; lastCheck: string | null; status: string | null };
  fundingReadiness: string | null;
}

export function shouldShowProtectionAttention(input: { policyEnabled: boolean; riskLevel: RiskLevel; decisionIsCurrent: boolean; decisionStatus: string | null; hasActionableCandidate: boolean }) {
  return input.policyEnabled && input.riskLevel !== "SAFE" && input.decisionIsCurrent && input.hasActionableCandidate && ["READY", "REQUIRE_APPROVAL"].includes(input.decisionStatus ?? "");
}

const REASONS: Record<string, string> = {
  BELOW_TARGET: "Does not restore the configured target health factor.",
  POLICY_DISABLED: "Protection is disabled by policy.",
  ACTION_DISABLED: "This action type is not permitted by policy.",
  INSUFFICIENT_BALANCE: "The protection wallet balance is insufficient.",
  INVALID_AMOUNT: "The intervention amount is invalid.",
  AUTONOMOUS_LIMIT: "Exceeds the maximum autonomous intervention.",
  DAILY_LIMIT: "Exceeds the remaining daily autonomous spend limit.",
  COOLDOWN: "The intervention cooldown is still active.",
  SUPPLY_CAP: "The reserve supply capacity would be exceeded.",
};
export function mapCandidates(candidates: CandidateAction[], selectedId: string | null): CandidateView[] {
  return candidates.map(candidate => {
    const selected = candidate.id === selectedId;
    const state = selected ? "selected" : !candidate.valid ? "rejected" : candidate.requiresApproval ? "approval" : "valid";
    const label = selected ? "Selected" : state === "rejected" ? "Rejected" : state === "approval" ? "Requires approval" : "Valid but not selected";
    const reason = selected ? "Minimum Effective Intervention." : candidate.rejectionReason ? (REASONS[candidate.rejectionReason] ?? candidate.rejectionReason) : candidate.requiresApproval ? "Valid, but requires explicit approval." : "Reaches the target but uses more capital than the selected action.";
    return { ...candidate, state, label, reason };
  });
}
