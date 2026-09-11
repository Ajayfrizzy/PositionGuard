import { z } from "zod";
import { decimalSchema, units, SCALE } from "../financial";
export const policySchema = z.strictObject({
  executionMode: z.enum(["MONITOR_ONLY", "REQUIRE_APPROVAL", "AUTONOMOUS"]).default("REQUIRE_APPROVAL"),
  targetHealthFactor: decimalSchema, warningHealthFactor: decimalSchema, emergencyHealthFactor: decimalSchema,
  maxAutonomousAmountUsd: decimalSchema, maxDailyAutonomousAmountUsd: decimalSchema, approvalRequiredAboveUsd: decimalSchema,
  allowRepay: z.boolean(), allowAddCollateral: z.boolean(), enabled: z.boolean(),
  interventionCooldownMinutes: z.number().int().min(0).max(525600),
}).superRefine((p, ctx) => {
  if (!(units(p.targetHealthFactor) > units(p.warningHealthFactor) && units(p.warningHealthFactor) > units(p.emergencyHealthFactor) && units(p.emergencyHealthFactor) > SCALE))
    ctx.addIssue({ code: "custom", message: "Require target > warning > emergency > 1" });
});
export const policyContextSchema = z.strictObject({
  dailyAutonomousSpendUsd: decimalSchema,
  nowMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  lastAutonomousExecutionAtMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
}).refine(c => c.lastAutonomousExecutionAtMs === null || c.lastAutonomousExecutionAtMs <= c.nowMs, "Last execution cannot be in the future");
export const validatePolicy = (input: unknown) => policySchema.parse(input);
