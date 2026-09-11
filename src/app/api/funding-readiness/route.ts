import { requireRequestSession } from "@/lib/security/wallet-auth";
import { getPrisma } from "@/lib/db/prisma";
import { prepareLiveProtectionAnalysis } from "@/lib/protection/live-preparation";
import { selectExecutableCandidate } from "@/lib/funding/readiness";
import { z } from "zod";
import { mapFundingReadiness } from "@/lib/product/status";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireRequestSession(request);
  if ("error" in auth) return auth.error;
  try {
    const query = z
      .object({ chainId: z.coerce.number().int().positive() })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const account = await getPrisma().user.findUniqueOrThrow({
      where: { id: auth.session.protectedAccountId },
    });
    const prepared = await prepareLiveProtectionAnalysis({
      walletAddress: account.walletAddress,
      chainId: query.chainId,
    });
    const selected = await selectExecutableCandidate({
      chainId: query.chainId,
      candidates: prepared.analysis.result.candidates,
      allowApproval: true,
    });
    return Response.json(
      {
        protectedAccountId: account.id,
        selectedCandidateId: selected.candidate?.id ?? null,
        readiness: selected.readiness,
        ux: mapFundingReadiness(selected.readiness),
        rejectedCandidates: selected.rejected,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error: {
          code: error instanceof z.ZodError ? "INVALID_REQUEST" : "FUNDING_READINESS_FAILED",
        },
      },
      { status: error instanceof z.ZodError ? 400 : 503 },
    );
  }
}
