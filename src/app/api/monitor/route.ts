import { authenticateOperator } from "@/lib/security/operator-auth";
import { runMonitoringCycle } from "@/lib/monitoring/service";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const auth = authenticateOperator(request);
  if (auth !== "authorized")
    return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  try {
    return Response.json(await runMonitoringCycle(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      {
        error: {
          code: "MONITORING_CYCLE_FAILED",
          message: "The live monitoring cycle failed safely; no transaction was attempted.",
        },
      },
      { status: 503 },
    );
  }
}
