import { authenticateOperator } from "@/lib/security/operator-auth";
import { getPrisma } from "@/lib/db/prisma";
import { z } from "zod";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (authenticateOperator(request) !== "authorized") return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const parsed = z.object({ protectedAccountId: z.string().min(1), unreadOnly: z.enum(["true", "false"]).optional() }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
  const rows = await getPrisma().notification.findMany({ where: { userId: parsed.data.protectedAccountId, ...(parsed.data.unreadOnly === "true" ? { readAt: null } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
  return Response.json({ notifications: rows }, { headers: { "Cache-Control": "no-store" } });
}
