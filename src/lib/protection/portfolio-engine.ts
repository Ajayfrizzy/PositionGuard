import { formatUnits } from "viem";
import { ceilDiv, decimal, units, SCALE } from "../financial";
import { validatePolicy, policyContextSchema } from "../policies/validator";
import { portfolioSchema } from "./portfolio-types";
import { portfolioOutcome, minimumPortfolioAmount, WAD } from "./portfolio-estimator";
import type { CandidateAction, InterventionType, ProtectionResult, RejectionReason } from "./types";
export function evaluatePortfolio(
  input: unknown,
  policyInput: unknown,
  contextInput: unknown,
): ProtectionResult {
  const p = portfolioSchema.parse(input),
    policy = validatePolicy(policyInput),
    context = policyContextSchema.parse(contextInput);
  const target = units(policy.targetHealthFactor) * (WAD / SCALE);
  const hf = p.healthFactorWad === null ? null : BigInt(p.healthFactorWad);
  const riskLevel =
    hf === null || hf >= target
      ? "SAFE"
      : hf >= units(policy.warningHealthFactor) * (WAD / SCALE)
        ? "WATCH"
        : hf >= units(policy.emergencyHealthFactor) * (WAD / SCALE)
          ? "HIGH"
          : "CRITICAL";
  const empty = {
    action: "NO_ACTION",
    riskLevel,
    selectedCandidate: null,
    candidates: [],
  } as const;
  if (riskLevel === "SAFE")
    return {
      ...empty,
      candidates: [],
      status: "NO_ACTION",
      reasoning: "Onchain health factor meets target or the account has no debt.",
    };
  if (p.analysisBlockers.length)
    return {
      ...empty,
      candidates: [],
      status: "NO_SAFE_ACTION",
      reasoning: p.analysisBlockers.join(", "),
    };
  const candidates: (CandidateAction & { capitalNumerator: bigint; capitalDenominator: bigint })[] =
    [];
  for (const asset of p.assets) {
    for (const type of ["REPAY_DEBT", "ADD_COLLATERAL"] satisfies InterventionType[]) {
      if (type === "REPAY_DEBT" && BigInt(asset.debtBalance) === 0n) continue;
      if (type === "ADD_COLLATERAL" && !asset.canSupply) continue;
      const price = BigInt(asset.priceBase),
        unit = 10n ** BigInt(asset.decimals),
        baseUnit = BigInt(p.baseCurrencyUnit);
      const minimum = minimumPortfolioAmount(p, asset, type, target);
      const balance = BigInt(asset.walletBalance);
      const cap = (units(policy.maxAutonomousAmountUsd) * baseUnit * unit) / (SCALE * price);
      const amounts = new Set([
        balance,
        cap,
        ...(minimum === null
          ? [BigInt(asset.debtBalance)]
          : [minimum / 2n, minimum - 1n, minimum, minimum + 1n, ceilDiv(minimum * 5n, 4n)]),
      ]);
      for (const amount of amounts) {
        if (amount <= 0n || (type === "REPAY_DEBT" && amount > BigInt(asset.debtBalance))) continue;
        const projected = portfolioOutcome(p, asset, type, amount);
        const reachesTarget = projected === null || projected >= target;
        const costNumerator = amount * price * SCALE,
          costDenominator = unit * baseUnit;
        const exceeds = (usd: string) => costNumerator > units(usd) * costDenominator;
        let reason: RejectionReason | null = null;
        if (!policy.enabled) reason = "POLICY_DISABLED";
        else if (
          (type === "REPAY_DEBT" && (!policy.allowRepay || !asset.canRepay)) ||
          (type === "ADD_COLLATERAL" && !policy.allowAddCollateral)
        )
          reason = "ACTION_DISABLED";
        else if (amount > balance) reason = "INSUFFICIENT_BALANCE";
        else if (
          type === "ADD_COLLATERAL" &&
          asset.supplyCapacity !== null &&
          amount > BigInt(asset.supplyCapacity)
        )
          reason = "SUPPLY_CAP";
        else if (exceeds(policy.maxAutonomousAmountUsd)) reason = "AUTONOMOUS_LIMIT";
        else if (
          costNumerator + units(context.dailyAutonomousSpendUsd) * costDenominator >
          units(policy.maxDailyAutonomousAmountUsd) * costDenominator
        )
          reason = "DAILY_LIMIT";
        else if (
          context.lastAutonomousExecutionAtMs !== null &&
          context.nowMs - context.lastAutonomousExecutionAtMs <
            policy.interventionCooldownMinutes * 60000
        )
          reason = "COOLDOWN";
        const usd = decimal(ceilDiv(costNumerator, costDenominator));
        candidates.push({
          id: `${type}:${asset.id}:${amount}`,
          type,
          asset: asset.id,
          assetSymbol: asset.symbol,
          amount: usd,
          tokenAmount: formatUnits(amount, asset.decimals),
          tokenAmountUnits: amount.toString(),
          estimatedUsdValue: usd,
          expectedHealthFactor: projected === null ? null : formatUnits(projected, 18),
          reachesTarget,
          policyValidity: reason === null,
          valid: reason === null && reachesTarget,
          requiresApproval: reason === null && exceeds(policy.approvalRequiredAboveUsd),
          rejectionReason: reason ?? (reachesTarget ? null : "BELOW_TARGET"),
          rank: 0,
          capitalNumerator: amount * price,
          capitalDenominator: unit,
        });
      }
    }
  }
  candidates.sort((a, b) => {
    if (a.reachesTarget !== b.reachesTarget) return a.reachesTarget ? -1 : 1;
    if (a.policyValidity !== b.policyValidity) return a.policyValidity ? -1 : 1;
    const difference =
      a.capitalNumerator * b.capitalDenominator - b.capitalNumerator * a.capitalDenominator;
    if (difference !== 0n) return difference < 0n ? -1 : 1;
    if (a.requiresApproval !== b.requiresApproval) return a.requiresApproval ? 1 : -1;
    if (a.type !== b.type) return a.type === "REPAY_DEBT" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  const ranked = candidates.map((candidate, index): CandidateAction => {
    const { capitalNumerator, capitalDenominator, ...action } = candidate;
    void capitalNumerator;
    void capitalDenominator;
    return { ...action, rank: index + 1 };
  });
  const selectedCandidate =
    ranked.find((c) => c.valid && !c.requiresApproval) ?? ranked.find((c) => c.valid) ?? null;
  if (!selectedCandidate)
    return {
      ...empty,
      candidates: ranked,
      status: "NO_SAFE_ACTION",
      reasoning: "No single funded policy-compliant action restores the target.",
    };
  return {
    action: selectedCandidate.requiresApproval ? "REQUIRE_APPROVAL" : selectedCandidate.type,
    status: selectedCandidate.requiresApproval ? "REQUIRE_APPROVAL" : "READY",
    riskLevel,
    candidates: ranked,
    selectedCandidate,
    reasoning:
      "Read-only MEI estimate using per-asset prices, debts and collateral thresholds. No execution authority.",
  };
}
