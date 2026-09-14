import { requireRequestSession } from "@/lib/security/wallet-auth";
import { mapMonitoringPresentation, mapWorkerHealth } from "@/lib/product/status";
import { getPrisma } from "@/lib/db/prisma";
import { readWorkerHeartbeat } from "@/lib/monitoring/heartbeat";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireRequestSession(request);
  if ("error" in auth) return auth.error;
  const [policy, heartbeat, lastRun] = await Promise.all([
    getPrisma().protectionPolicy.findUnique({
      where: {
        userId_chainId: {
          userId: auth.session.protectedAccountId,
          chainId: auth.session.chainId,
        },
      },
      select: { enabled: true },
    }),
    readWorkerHeartbeat(auth.session.chainId),
    getPrisma().monitoringRun.findFirst({
      where: { userId: auth.session.protectedAccountId, chainId: auth.session.chainId },
      orderBy: { startedAt: "desc" },
      select: { completedAt: true },
    }),
  ]);
  const worker = mapWorkerHealth({
    lastHeartbeatAt: heartbeat?.lastHeartbeatAt ?? null,
  });
  const policyEnabled = policy?.enabled ?? false;
  const presentation = mapMonitoringPresentation({
    policyEnabled,
    workerStatus: worker.status,
  });
  return Response.json(
    {
      policyEnabled,
      protectionMonitoring: presentation.dashboardLabel,
      monitoringActive: presentation.active,
      lastCheck: lastRun?.completedAt?.toISOString() ?? null,
      lastHeartbeatAt: worker.lastHeartbeatAt,
      workerStatus: worker.status,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
