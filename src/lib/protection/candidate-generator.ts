import { units, decimal, ceilDiv } from "../financial";
import { validatePolicy, policyContextSchema } from "../policies/validator";
import { checkLimits } from "../policies/limits";
import { requiresApproval } from "../policies/approval";
import type { ProtectionPolicy, PolicyContext } from "../policies/types";
import { positionSchema, estimateOutcome } from "./outcome-estimator";
import type { NormalizedPosition, CandidateAction, InterventionType } from "./types";
export function generateCandidates(input: NormalizedPosition, rawPolicy: ProtectionPolicy, rawContext: PolicyContext): CandidateAction[] {
  const p = positionSchema.parse(input), policy = validatePolicy(rawPolicy), context = policyContextSchema.parse(rawContext);
  const debt = units(p.totalDebtUsd), collateral = units(p.totalCollateralUsd), lt = units(p.liquidationThreshold), target = units(policy.targetHealthFactor);
  if (debt === 0n || collateral * lt >= target * debt) return [];
  const shortfall = target * debt - collateral * lt;
  const result: CandidateAction[] = [];
  for (const type of ["REPAY_DEBT", "ADD_COLLATERAL"] satisfies InterventionType[]) {
    // Exact minimum at one micro-USD resolution; do not select from only a coarse grid.
    const minimum = ceilDiv(shortfall, type === "REPAY_DEBT" ? target : lt);
    const balance = units(type === "REPAY_DEBT" ? p.availableDebtAssetBalanceUsd : p.availableCollateralAssetBalanceUsd);
    const cap = units(policy.maxAutonomousAmountUsd);
    const amounts = new Set([minimum / 2n, minimum - 1n, minimum, minimum + 1n, ceilDiv(minimum * 5n, 4n), balance, cap, units(policy.approvalRequiredAboveUsd)]);
    for (const a of amounts) {
      if (a <= 0n || (type === "REPAY_DEBT" && a > debt)) continue;
      const amount = decimal(a);
      const expectedHealthFactor = estimateOutcome(p, type, amount);
      const reachesTarget = expectedHealthFactor === null || units(expectedHealthFactor) >= target;
      const rejection = checkLimits(type, amount, p, policy, context);
      result.push({ id: `${type}:${amount}`, type, asset: type === "REPAY_DEBT" ? p.debtAsset : p.collateralAsset,
        amount, estimatedUsdValue: amount, expectedHealthFactor, reachesTarget, policyValidity: rejection === null,
        valid: rejection === null && reachesTarget, requiresApproval: rejection === null && requiresApproval(amount, policy),
        rejectionReason: rejection ?? (reachesTarget ? null : "BELOW_TARGET"), rank: 0 });
    }
  }
  return result;
}
