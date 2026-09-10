export type RiskLevel = "SAFE" | "WATCH" | "HIGH" | "CRITICAL";
export type InterventionType = "REPAY_DEBT" | "ADD_COLLATERAL";
export type ActionType = InterventionType | "NO_ACTION" | "REQUIRE_APPROVAL";
export interface NormalizedPosition {
  healthFactor: string | null;
  totalCollateralUsd: string;
  totalDebtUsd: string;
  liquidationThreshold: string;
  availableDebtAssetBalanceUsd: string;
  availableCollateralAssetBalanceUsd: string;
  debtAsset: string;
  collateralAsset: string;
}
export type RejectionReason = "POLICY_DISABLED" | "ACTION_DISABLED" | "INSUFFICIENT_BALANCE" | "INVALID_AMOUNT" | "AUTONOMOUS_LIMIT" | "DAILY_LIMIT" | "COOLDOWN" | "BELOW_TARGET" | "SUPPLY_CAP";
export interface CandidateAction {
  id: string;
  type: InterventionType;
  asset: string;
  /** Normalized USD amount, not token units. */
  amount: string;
  tokenAmount?: string;
  tokenAmountUnits?: string;
  assetSymbol?: string;
  estimatedUsdValue: string;
  expectedHealthFactor: string | null;
  reachesTarget: boolean;
  policyValidity: boolean;
  valid: boolean;
  requiresApproval: boolean;
  rejectionReason: RejectionReason | null;
  rank: number;
}
export interface ProtectionResult {
  action: ActionType;
  status: "NO_ACTION" | "READY" | "REQUIRE_APPROVAL" | "NO_SAFE_ACTION";
  riskLevel: RiskLevel;
  selectedCandidate: CandidateAction | null;
  candidates: CandidateAction[];
  reasoning: string;
}
