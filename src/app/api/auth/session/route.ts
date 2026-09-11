import {
  clearSessionCookie,
  cookieValue,
  getRequestSession,
  hashSecret,
  sameOrigin,
  SESSION_COOKIE,
} from "@/lib/security/wallet-auth";
import { getPrisma } from "@/lib/db/prisma";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getRequestSession(request);
  return session
    ? Response.json(
        {
          authenticated: true,
          session: {
            userId: session.userId,
            walletAddress: session.walletAddress,
            chainId: session.chainId,
            protectedAccountId: session.protectedAccountId,
            expiresAt: session.expiresAt.toISOString(),
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      )
    : Response.json(
        { authenticated: false },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: { code: "CSRF_REJECTED" } }, { status: 403 });
  const token = cookieValue(request, SESSION_COOKIE);
  if (token)
    await getPrisma().userSession.updateMany({
      where: { tokenHash: hashSecret(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}
