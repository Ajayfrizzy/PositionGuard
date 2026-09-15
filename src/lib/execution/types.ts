import type { AavePosition } from "../aave/types";
import type { AaveIntent } from "../aave/intents";
import type { ProtectionPolicy, PolicyContext } from "../policies/types";
import type { CandidateAction, ProtectionResult } from "../protection/types";
import type { KeeperHubSimulation } from "../keeperhub/direct-types";

export const executionStages = [
  "REFRESHING_POSITION",
  "VALIDATING_POLICY",
  "CALCULATING_MEI",
  "VERIFYING_SENDER",
  "VERIFYING_BALANCE",
  "VERIFYING_ALLOWANCE",
  "SIMULATING",
  "REVALIDATING",
  "READY_TO_EXECUTE",
  "BROADCASTING",
  "VERIFYING_RECEIPT",
  "VERIFYING_AAVE_POSITION",
  "CONFIRMED",
] as const;
export type ExecutionStage = (typeof executionStages)[number];
export type ExecutionMode = "simulate" | "broadcast";
export interface CanonicalPreparation {
  walletAddress: string;
  chainId: number;
  policyId: string;
  policyUpdatedAt: string;
  policy: ProtectionPolicy;
  context: PolicyContext;
  position: AavePosition;
  result: ProtectionResult;
  candidate: CandidateAction;
  intent: AaveIntent;
  effectFingerprint: string;
}
export interface SafetyChecks {
  sender: { expected: string; actual: string; verified: boolean };
  funding: { balanceUnits: string; requiredUnits: string; sufficient: boolean };
  allowance: { currentAllowance: string; requiredAmount: string; sufficient: boolean };
  simulation: KeeperHubSimulation;
}
export interface ProtectionExecutionResult {
  outcome:
    | "READY_TO_EXECUTE"
    | "AUTHORIZATION_REQUIRED"
    | "POSITION_CHANGED"
    | "DUPLICATE_PREVENTED"
    | "CONFIRMED"
    | "UNCONFIRMED";
  stage: ExecutionStage;
  stages: ExecutionStage[];
  currentHealthFactor: string | null;
  selectedAction: string;
  amount: string;
  asset: string;
  projectedHealthFactor: string | null;
  simulation: { success: true; wouldRevert: false; gasEstimate: string } | null;
  checks: SafetyChecks | null;
  refreshed?: { healthFactor: string | null; action: string | null; amount: string | null };
  executionId?: string;
  transactionHash?: string;
  idempotencyKey?: string;
  effectFingerprint?: string;
  healthFactorAfter?: string | null;
}
export class ProtectionExecutionError extends Error {
  constructor(
    public readonly code: string,
    public readonly stage: ExecutionStage,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "ProtectionExecutionError";
  }
}
