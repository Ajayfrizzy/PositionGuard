import { requireRequestSession } from "@/lib/security/wallet-auth";
import { getPrisma } from "@/lib/db/prisma";
import { z } from "zod";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireRequestSession(request);
  if ("error" in auth) return auth.error;
  const parsed = z
    .object({ unreadOnly: z.enum(["true", "false"]).optional() })
    .safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success)
    return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
  const userId = auth.session.protectedAccountId;
  const db = getPrisma();
  const [rows, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: {
        userId,
        ...(parsed.data.unreadOnly === "true" ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return Response.json(
    { notifications: rows, unreadCount },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function PATCH(request: Request) {
  const auth = await requireRequestSession(request);
  if ("error" in auth) return auth.error;
  const input = z
    .strictObject({ notificationId: z.string().min(1).optional(), all: z.boolean().optional() })
    .safeParse(await request.json());
  if (!input.success || (!input.data.notificationId && input.data.all !== true))
    return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
  const result = await getPrisma().notification.updateMany({
    where: {
      userId: auth.session.protectedAccountId,
      readAt: null,
      ...(input.data.notificationId ? { id: input.data.notificationId } : {}),
    },
    data: { readAt: new Date() },
  });
  return Response.json({ ok: true, updated: result.count });
}
