import { authenticateOperator } from "@/lib/security/operator-auth";
import { getPrisma } from "@/lib/db/prisma";
import { prepareLiveProtectionAnalysis } from "@/lib/protection/live-preparation";
import { selectExecutableCandidate } from "@/lib/funding/readiness";
import { z } from "zod";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (authenticateOperator(request) !== "authorized") return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  try {
    const query = z.object({ protectedAccountId: z.string().min(1), chainId: z.coerce.number().int().positive() }).parse(Object.fromEntries(new URL(request.url).searchParams));
    const account = await getPrisma().user.findUniqueOrThrow({ where: { id: query.protectedAccountId } });
    const prepared = await prepareLiveProtectionAnalysis({ walletAddress: account.walletAddress, chainId: query.chainId });
    const selected = await selectExecutableCandidate({ chainId: query.chainId, candidates: prepared.analysis.result.candidates, allowApproval: true });
    return Response.json({ protectedAccountId: account.id, selectedCandidateId: selected.candidate?.id ?? null, readiness: selected.readiness, rejectedCandidates: selected.rejected }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: { code: error instanceof z.ZodError ? "INVALID_REQUEST" : "FUNDING_READINESS_FAILED" } }, { status: error instanceof z.ZodError ? 400 : 503 }); }
}
