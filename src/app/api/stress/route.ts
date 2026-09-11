import { getPrisma } from "@/lib/db/prisma";
import { portfolioFromSnapshotContext } from "@/lib/product/snapshot-context";
import { verifyScenarioAuthorization } from "@/lib/stress/scenario-auth";
import { analyzeStress } from "@/lib/stress/service";
import { validatePolicy } from "@/lib/policies/validator";
import { z } from "zod";
export const runtime = "nodejs";
const schema = z.strictObject({ asset: z.string().min(1).max(64), percentageShock: z.number().finite().gt(-100).lt(0), scenarioAuthorization: z.string().min(20).max(2048) });
export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: { code: "INVALID_CONTENT_TYPE" } }, { status: 415 });
    const text = await request.text(); if (text.length > 4096) return Response.json({ error: { code: "BODY_TOO_LARGE" } }, { status: 413 });
    const input = schema.parse(JSON.parse(text));
    const grant = verifyScenarioAuthorization(input.scenarioAuthorization); if (!grant) return Response.json({ error: { code: "SCENARIO_AUTHORIZATION_INVALID", message: "Refresh the page and try again." } }, { status: 401 });
    const db = getPrisma();
    const [policy, snapshot] = await Promise.all([
      db.protectionPolicy.findUniqueOrThrow({ where: { userId_chainId: { userId: grant.protectedAccountId, chainId: grant.chainId } } }),
      db.positionSnapshot.findFirstOrThrow({ where: { userId: grant.protectedAccountId, chainId: grant.chainId }, orderBy: { capturedAt: "desc" } }),
    ]);
    const validated = validatePolicy({ executionMode: policy.executionMode, targetHealthFactor: policy.targetHealthFactor.toString(), warningHealthFactor: policy.warningHealthFactor.toString(), emergencyHealthFactor: policy.emergencyHealthFactor.toString(), maxAutonomousAmountUsd: policy.maxAutonomousAmountUsd.toString(), maxDailyAutonomousAmountUsd: policy.maxDailyAutonomousAmountUsd.toString(), approvalRequiredAboveUsd: policy.approvalRequiredAboveUsd.toString(), allowRepay: policy.allowRepay, allowAddCollateral: policy.allowAddCollateral, interventionCooldownMinutes: policy.interventionCooldownMinutes, enabled: policy.enabled });
    return Response.json(analyzeStress({ position: portfolioFromSnapshotContext(snapshot.normalizedContext), policy: validated, asset: input.asset, percentageShock: input.percentageShock }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    return Response.json({ error: { code: invalid ? "INVALID_STRESS_SCENARIO" : "STRESS_ANALYSIS_FAILED", message: invalid ? "Choose a price drop greater than 0% and less than 100%." : "Scenario analysis could not be completed. No funds moved and no transaction was submitted." } }, { status: invalid ? 400 : 503 });
  }
}
