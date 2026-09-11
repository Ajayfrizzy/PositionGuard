import { formatUnits } from "viem";
import { z } from "zod";
import type { ProtectionPolicy, PolicyContext } from "../policies/types";
import { evaluateProtection } from "../protection/protection-engine";
import { portfolioSchema, type PortfolioPosition } from "../protection/portfolio-types";

const stressInputSchema = z.object({ asset: z.string().min(1).max(64), percentageShock: z.number().finite().gt(-100).max(1000) });
const SCALE = 1_000_000n;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export function stressPosition(positionInput: PortfolioPosition, asset: string, percentageShock: number): PortfolioPosition {
  const position = portfolioSchema.parse(positionInput);
  const parsed = stressInputSchema.parse({ asset, percentageShock });
  const factor = SCALE + BigInt(Math.round(parsed.percentageShock * 10_000));
  let found = false;
  const assets = position.assets.map(item => {
    if (item.id.toLowerCase() !== parsed.asset.toLowerCase() && item.symbol.toLowerCase() !== parsed.asset.toLowerCase()) return item;
    found = true; return { ...item, priceBase: (BigInt(item.priceBase) * factor / SCALE).toString() };
  });
  if (!found) throw new Error("STRESS_ASSET_NOT_FOUND");
  let totalDebt = 0n, weighted = 0n;
  for (const item of assets) {
    const unit = 10n ** BigInt(item.decimals), price = BigInt(item.priceBase);
    const debtNumerator = BigInt(item.debtBalance) * price;
    totalDebt += position.debtRounding === "up" ? ceilDiv(debtNumerator, unit) : debtNumerator / unit;
    const collateralValue = BigInt(item.suppliedBalance) * price / unit;
    weighted += collateralValue * BigInt(item.liquidationThresholdBps);
  }
  const healthFactorWad = totalDebt === 0n ? null : (weighted * 10n ** 18n / (totalDebt * 10_000n)).toString();
  return { ...position, assets, totalDebtBase: totalDebt.toString(), weightedCollateralNumerator: weighted.toString(), healthFactorWad };
}

export function analyzeStress(input: { position: PortfolioPosition; policy: ProtectionPolicy; context?: PolicyContext; asset: string; percentageShock: number }) {
  const stressedPosition = stressPosition(input.position, input.asset, input.percentageShock);
  const result = evaluateProtection(stressedPosition, input.policy, input.context ?? { dailyAutonomousSpendUsd: "0", nowMs: Date.now(), lastAutonomousExecutionAtMs: null });
  return {
    simulationOnly: true as const,
    onchainStateChanged: false as const,
    asset: input.asset,
    percentageShock: input.percentageShock,
    currentHealthFactor: input.position.healthFactorWad === null ? null : formatUnits(BigInt(input.position.healthFactorWad), 18),
    projectedHealthFactor: stressedPosition.healthFactorWad === null ? null : formatUnits(BigInt(stressedPosition.healthFactorWad), 18),
    projectedRisk: result.riskLevel,
    mei: result.selectedCandidate ? { action: result.selectedCandidate.type, asset: result.selectedCandidate.assetSymbol ?? result.selectedCandidate.asset, amount: result.selectedCandidate.tokenAmount ?? result.selectedCandidate.amount } : null,
    requiredCapitalUsd: result.selectedCandidate?.estimatedUsdValue ?? null,
    result,
  };
}
