import { authenticateOperator } from "@/lib/security/operator-auth";
import { getPrisma } from "@/lib/db/prisma";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (authenticateOperator(request) !== "authorized") return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const policies = await getPrisma().protectionPolicy.findMany({ where: { enabled: true }, include: { user: { include: { monitoringRuns: { orderBy: { startedAt: "desc" }, take: 1 } } } } });
  return Response.json({ active: true, pollingIntervalMs: Math.max(30_000, Number(process.env.MONITOR_POLL_INTERVAL_MS ?? 60_000) || 60_000), accounts: policies.map(policy => ({ protectedAccountId: policy.userId, walletAddress: policy.user.walletAddress, chainId: policy.chainId, executionMode: policy.executionMode, lastRun: policy.user.monitoringRuns[0] ? { ...policy.user.monitoringRuns[0], startedAt: policy.user.monitoringRuns[0].startedAt.toISOString(), completedAt: policy.user.monitoringRuns[0].completedAt?.toISOString() ?? null } : null })) }, { headers: { "Cache-Control": "no-store" } });
}
