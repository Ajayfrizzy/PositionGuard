import { units } from "../financial";
import type { ProtectionPolicy, PolicyContext } from "./types";
import type { InterventionType, NormalizedPosition, RejectionReason } from "../protection/types";
import { validatePolicy, policyContextSchema } from "./validator";
import { positionSchema } from "../protection/outcome-estimator";
export function checkLimits(type: InterventionType, amount: string, position: NormalizedPosition, input: ProtectionPolicy, context: PolicyContext): RejectionReason | null {
  const policy = validatePolicy(input);
  const p = positionSchema.parse(position);
  const c = policyContextSchema.parse(context);
  const a = units(amount);
  if (!policy.enabled) return "POLICY_DISABLED";
  if (type !== "REPAY_DEBT" && type !== "ADD_COLLATERAL") return "ACTION_DISABLED";
  if ((type === "REPAY_DEBT" && !policy.allowRepay) || (type === "ADD_COLLATERAL" && !policy.allowAddCollateral)) return "ACTION_DISABLED";
  if (a <= 0n || (type === "REPAY_DEBT" && a > units(p.totalDebtUsd))) return "INVALID_AMOUNT";
  if (a > units(type === "REPAY_DEBT" ? p.availableDebtAssetBalanceUsd : p.availableCollateralAssetBalanceUsd)) return "INSUFFICIENT_BALANCE";
  if (a > units(policy.maxAutonomousAmountUsd)) return "AUTONOMOUS_LIMIT";
  if (a + units(c.dailyAutonomousSpendUsd) > units(policy.maxDailyAutonomousAmountUsd)) return "DAILY_LIMIT";
  if (c.lastAutonomousExecutionAtMs !== null && c.nowMs - c.lastAutonomousExecutionAtMs < policy.interventionCooldownMinutes * 60000) return "COOLDOWN";
  return null;
}
