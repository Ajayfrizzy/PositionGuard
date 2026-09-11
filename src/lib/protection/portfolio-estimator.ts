import { ceilDiv } from "../financial";
import type { PortfolioAsset, PortfolioPosition } from "./portfolio-types";
import type { InterventionType } from "./types";
export const WAD = 10n ** 18n;
export function portfolioOutcome(
  p: PortfolioPosition,
  asset: PortfolioAsset,
  type: InterventionType,
  amount: bigint,
): bigint | null {
  if (amount < 0n) throw new Error("Invalid amount");
  const price = BigInt(asset.priceBase),
    tokenUnit = 10n ** BigInt(asset.decimals);
  let debt = BigInt(p.totalDebtBase),
    weighted = BigInt(p.weightedCollateralNumerator);
  if (type === "REPAY_DEBT") {
    const old = BigInt(asset.debtBalance);
    if (amount > old) throw new Error("Repayment exceeds asset debt");
    const value = (a: bigint) =>
      p.debtRounding === "up" ? ceilDiv(a * price, tokenUnit) : (a * price) / tokenUnit;
    debt -= value(old) - value(old - amount);
    if (debt < 0n) throw new Error("Inconsistent debt contributions");
  } else {
    const old = BigInt(asset.suppliedBalance);
    const contribution = ((old + amount) * price) / tokenUnit - (old * price) / tokenUnit;
    weighted += contribution * BigInt(asset.liquidationThresholdBps);
  }
  return debt === 0n ? null : (weighted * WAD) / (debt * 10000n);
}
export function minimumPortfolioAmount(
  p: PortfolioPosition,
  asset: PortfolioAsset,
  type: InterventionType,
  target: bigint,
): bigint | null {
  let hi: bigint;
  if (type === "REPAY_DEBT") hi = BigInt(asset.debtBalance);
  else {
    const lt = BigInt(asset.liquidationThresholdBps);
    if (lt === 0n) return null;
    const shortfall =
      target * BigInt(p.totalDebtBase) * 10000n - BigInt(p.weightedCollateralNumerator) * WAD;
    if (shortfall <= 0n) return 1n;
    hi =
      ceilDiv(shortfall * 10n ** BigInt(asset.decimals), BigInt(asset.priceBase) * lt * WAD) +
      ceilDiv(10n ** BigInt(asset.decimals), BigInt(asset.priceBase)) +
      1n;
  }
  const effective = (a: bigint) => {
    const hf = portfolioOutcome(p, asset, type, a);
    return hf === null || hf >= target;
  };
  if (hi === 0n || !effective(hi)) return null;
  let lo = 1n;
  // Binary search proves minimality at token-unit resolution, including base-value rounding steps.
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (effective(mid)) hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}
