import { getPrisma } from "@/lib/db/prisma";
export const runtime = "nodejs";
export async function GET() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", service: "web", timestamp: new Date().toISOString() });
  } catch {
    return Response.json({ status: "degraded", service: "web" }, { status: 503 });
  }
}
