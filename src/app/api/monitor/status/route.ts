import { requireRequestSession } from "@/lib/security/wallet-auth";
import { mapWorkerHealth } from "@/lib/product/status";
import { getPrisma } from "@/lib/db/prisma";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireRequestSession(request);
  if ("error" in auth) return auth.error;
  const pollingIntervalMs = Math.max(
    30_000,
    Number(process.env.MONITOR_POLL_INTERVAL_MS ?? 60_000) || 60_000,
  );
  const policy = await getPrisma().protectionPolicy.findFirst({
    where: { userId: auth.session.protectedAccountId, chainId: auth.session.chainId },
    include: {
      user: {
        include: {
          monitoringRuns: {
            where: { chainId: auth.session.chainId },
            orderBy: { startedAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });
  const lastRun = policy?.user.monitoringRuns[0] ?? null;
  const worker = mapWorkerHealth({
    enabled: policy?.enabled ?? false,
    lastCheck: lastRun?.completedAt ?? lastRun?.startedAt ?? null,
    lastRunStatus: lastRun?.status ?? null,
    pollingIntervalMs,
  });
  return Response.json(
    {
      protectionMonitoring: policy?.enabled ? "ACTIVE" : "INACTIVE",
      lastCheck: worker.lastCheck,
      workerStatus: worker.status,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
