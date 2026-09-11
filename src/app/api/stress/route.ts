import { authenticateOperator } from "@/lib/security/operator-auth";
import { getPrisma } from "@/lib/db/prisma";
import { portfolioFromSnapshotContext } from "@/lib/product/snapshot-context";
import { analyzeStress } from "@/lib/stress/service";
import { validatePolicy } from "@/lib/policies/validator";
import { z } from "zod";
export const runtime = "nodejs";
const schema = z.strictObject({ protectedAccountId: z.string().min(1), chainId: z.number().int().positive(), asset: z.string().min(1).max(64), percentageShock: z.number().finite().gt(-100).max(1000) });
export async function POST(request: Request) {
  if (authenticateOperator(request) !== "authorized") return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  try {
    const input = schema.parse(await request.json());
    const db = getPrisma();
    const [policy, snapshot] = await Promise.all([
      db.protectionPolicy.findUniqueOrThrow({ where: { userId_chainId: { userId: input.protectedAccountId, chainId: input.chainId } } }),
      db.positionSnapshot.findFirstOrThrow({ where: { userId: input.protectedAccountId, chainId: input.chainId }, orderBy: { capturedAt: "desc" } }),
    ]);
    const validated = validatePolicy({ executionMode: policy.executionMode, targetHealthFactor: policy.targetHealthFactor.toString(), warningHealthFactor: policy.warningHealthFactor.toString(), emergencyHealthFactor: policy.emergencyHealthFactor.toString(), maxAutonomousAmountUsd: policy.maxAutonomousAmountUsd.toString(), maxDailyAutonomousAmountUsd: policy.maxDailyAutonomousAmountUsd.toString(), approvalRequiredAboveUsd: policy.approvalRequiredAboveUsd.toString(), allowRepay: policy.allowRepay, allowAddCollateral: policy.allowAddCollateral, interventionCooldownMinutes: policy.interventionCooldownMinutes, enabled: policy.enabled });
    return Response.json(analyzeStress({ position: portfolioFromSnapshotContext(snapshot.normalizedContext), policy: validated, asset: input.asset, percentageShock: input.percentageShock }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: { code: error instanceof z.ZodError ? "INVALID_STRESS_SCENARIO" : "STRESS_ANALYSIS_FAILED", message: "Scenario analysis is read-only and no onchain state was changed." } }, { status: error instanceof z.ZodError ? 400 : 503 }); }
}
