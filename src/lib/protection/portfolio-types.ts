import { z } from "zod";
const integer = z.string().regex(/^(0|[1-9]\d{0,77})$/);
const positive = integer.refine((v) => BigInt(v) > 0n);
export const portfolioAssetSchema = z.strictObject({
  id: z.string().min(1).max(64),
  symbol: z.string().min(1).max(64),
  decimals: z.number().int().min(0).max(36),
  priceBase: positive,
  walletBalance: integer,
  suppliedBalance: integer,
  debtBalance: integer,
  liquidationThresholdBps: z.number().int().min(0).max(10000),
  canRepay: z.boolean(),
  canSupply: z.boolean(),
  supplyCapacity: integer.nullable(),
});
export const portfolioSchema = z
  .strictObject({
    model: z.literal("portfolio-v2"),
    healthFactorWad: integer.nullable(),
    baseCurrencyUnit: positive,
    totalDebtBase: integer,
    weightedCollateralNumerator: integer,
    debtRounding: z.enum(["up", "down"]),
    assets: z.array(portfolioAssetSchema).max(128),
    analysisBlockers: z.array(z.string().max(100)).max(128),
  })
  .superRefine((p, ctx) => {
    if ((BigInt(p.totalDebtBase) === 0n) !== (p.healthFactorWad === null))
      ctx.addIssue({ code: "custom", message: "Zero debt requires unbounded HF" });
    if (new Set(p.assets.map((a) => a.id)).size !== p.assets.length)
      ctx.addIssue({ code: "custom", message: "Duplicate assets" });
  });
export type PortfolioPosition = z.infer<typeof portfolioSchema>;
export type PortfolioAsset = z.infer<typeof portfolioAssetSchema>;
