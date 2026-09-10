import { formatUnits } from "viem";
import { ceilDiv } from "../financial";
import type { PortfolioPosition } from "../protection/portfolio-types";
import { healthFactorFromWad, tokenValueBase } from "./calculations";
import type { RawAccount, RawReserve } from "./types";
export function normalizeAavePosition(account: RawAccount, reserves: readonly RawReserve[], baseUnit: bigint, eMode: bigint): PortfolioPosition {
  healthFactorFromWad(account.healthFactor, account.totalDebtBase);
  const blockers: string[] = [];
  if (eMode !== 0n) blockers.push("EMODE_ESTIMATION_UNSUPPORTED");
  if (reserves.some(r => r.stableDebt > 0n)) blockers.push("STABLE_DEBT_ESTIMATION_UNSUPPORTED");
  if (reserves.some(r => r.collateralEnabled && r.debtCeiling > 0n)) blockers.push("ISOLATION_ESTIMATION_UNSUPPORTED");
  let weighted = 0n, collateral = 0n, debtDown = 0n, debtUp = 0n;
  for (const r of reserves) {
    const unit = 10n ** BigInt(r.decimals);
    if (r.collateralEnabled) { const value = tokenValueBase(r.suppliedBalance, r.price, r.decimals); collateral += value; weighted += value * r.liquidationThresholdBps; }
    debtDown += (r.variableDebt + r.stableDebt) * r.price / unit;
    debtUp += ceilDiv((r.variableDebt + r.stableDebt) * r.price, unit);
  }
  if (collateral !== account.totalCollateralBase) blockers.push("COLLATERAL_RECONCILIATION_FAILED");
  if (debtDown !== account.totalDebtBase && debtUp !== account.totalDebtBase) blockers.push("DEBT_RECONCILIATION_FAILED");
  // Preserve the reserve-weighted numerator instead of multiplying by the rounded account-average LT.
  return { model: "portfolio-v2", healthFactorWad: account.totalDebtBase === 0n ? null : account.healthFactor.toString(),
    baseCurrencyUnit: baseUnit.toString(), totalDebtBase: account.totalDebtBase.toString(), weightedCollateralNumerator: weighted.toString(),
    debtRounding: debtUp === account.totalDebtBase ? "up" : "down", analysisBlockers: blockers,
    assets: reserves.map(r => ({ id: r.asset, symbol: r.symbol, decimals: r.decimals, priceBase: r.price.toString(),
      walletBalance: r.walletBalance.toString(), suppliedBalance: r.suppliedBalance.toString(), debtBalance: r.variableDebt.toString(),
      liquidationThresholdBps: Number(r.liquidationThresholdBps), canRepay: r.active && !r.paused,
      canSupply: r.collateralEnabled && r.active && !r.paused && !r.frozen && r.liquidationThresholdBps > 0n && r.debtCeiling === 0n,
      supplyCapacity: r.supplyCapacity?.toString() ?? null })) };
}
export const formatThreshold = (bps: bigint) => formatUnits(bps, 4);
