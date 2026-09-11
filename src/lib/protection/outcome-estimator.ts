import { z } from "zod";
import { decimalSchema, units, decimal, SCALE } from "../financial";
import type { InterventionType, NormalizedPosition } from "./types";
export const positionSchema = z
  .strictObject({
    healthFactor: decimalSchema.nullable(),
    totalCollateralUsd: decimalSchema,
    totalDebtUsd: decimalSchema,
    liquidationThreshold: decimalSchema.refine(
      (v) => units(v) > 0n && units(v) <= SCALE,
      "Threshold must be in (0, 1]",
    ),
    availableDebtAssetBalanceUsd: decimalSchema,
    availableCollateralAssetBalanceUsd: decimalSchema,
    debtAsset: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
    collateralAsset: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  })
  .superRefine((p, ctx) => {
    const expected = calculateHealthFactor(p);
    if (
      p.healthFactor !== expected &&
      !(p.healthFactor !== null && expected !== null && units(p.healthFactor) === units(expected))
    )
      ctx.addIssue({
        code: "custom",
        path: ["healthFactor"],
        message: "HF must match normalized formula floored to six decimals; use null for zero debt",
      });
  });
export function calculateHealthFactor(
  p: Pick<NormalizedPosition, "totalCollateralUsd" | "totalDebtUsd" | "liquidationThreshold">,
): string | null {
  const debt = units(p.totalDebtUsd);
  return debt === 0n
    ? null
    : decimal((units(p.totalCollateralUsd) * units(p.liquidationThreshold)) / debt);
}
export function estimateOutcome(
  input: NormalizedPosition,
  type: InterventionType,
  amount: string,
): string | null {
  const p = positionSchema.parse(input);
  const a = units(amount);
  if (a <= 0n) throw new Error("Amount must be positive");
  if (type === "REPAY_DEBT") {
    if (a > units(p.totalDebtUsd)) throw new Error("Repayment exceeds debt");
    return calculateHealthFactor({ ...p, totalDebtUsd: decimal(units(p.totalDebtUsd) - a) });
  }
  if (type !== "ADD_COLLATERAL") throw new Error("Unsupported action");
  return calculateHealthFactor({
    ...p,
    totalCollateralUsd: decimal(units(p.totalCollateralUsd) + a),
  });
}
