import { authenticateOperator } from "@/lib/security/operator-auth";
import { requireRequestSession } from "@/lib/security/wallet-auth";
import { getPrisma } from "@/lib/db/prisma";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const operator = authenticateOperator(request);
  const walletAuth = operator === "authorized" ? null : await requireRequestSession(request);
  if (walletAuth && "error" in walletAuth) return walletAuth.error;
  const rows = await getPrisma().user.findMany({
    where:
      walletAuth && "session" in walletAuth
        ? { id: walletAuth.session.protectedAccountId }
        : undefined,
    include: {
      policies: { orderBy: { updatedAt: "desc" } },
      snapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });
  return Response.json(
    {
      accounts: rows.map((row) => ({
        protectedAccountId: row.id,
        walletAddress: row.walletAddress,
        policies: row.policies.map((policy) => ({
          id: policy.id,
          chainId: policy.chainId,
          enabled: policy.enabled,
          executionMode: policy.executionMode,
        })),
        lastSnapshotAt: row.snapshots[0]?.capturedAt.toISOString() ?? null,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
