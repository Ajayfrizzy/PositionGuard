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
    if (!prepared.analysis.result.selectedCandidate)
      return Response.json(
        {
          protectedAccountId: account.id,
          selectedCandidateId: null,
          state: "NO_ACTION_REQUIRED",
          readiness: null,
          reason: "NO_ACTIONABLE_CANDIDATE",
          ux: mapFundingReadiness(null, "NO_ACTION_REQUIRED"),
          rejectedCandidates: [],
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    const selected = await selectExecutableCandidate({
      chainId: query.chainId,
      candidates: prepared.analysis.result.candidates,
      allowApproval: true,
    });
    const state = selected.readiness?.state ?? "NO_ACTION_REQUIRED";
    return Response.json(
      {
        protectedAccountId: account.id,
        selectedCandidateId: selected.candidate?.id ?? null,
        state,
        readiness: selected.readiness,
        reason: selected.readiness ? selected.readiness.reason : "NO_ACTIONABLE_CANDIDATE",
        ux: mapFundingReadiness(selected.readiness, "NO_ACTION_REQUIRED"),
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
