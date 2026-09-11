import { getAavePosition } from "@/lib/aave/service";
import { analyzePosition, previewPolicy } from "@/lib/aave/analysis";
import { persistPositionSnapshot } from "@/lib/aave/snapshots";
import { requireRequestSession } from "@/lib/security/wallet-auth";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const auth = await requireRequestSession(request);
  if ("error" in auth) return auth.error;
  try {
    const position = await getAavePosition({
      walletAddress: auth.session.walletAddress,
      chainId: auth.session.chainId,
    });
    const analysis = analyzePosition(position, previewPolicy);
    const snapshotId = await persistPositionSnapshot(position, analysis);
    return Response.json(
      {
        detected:
          Number(position.account.totalCollateralUsd) > 0 ||
          Number(position.account.totalDebtUsd) > 0,
        snapshotId,
        position: {
          healthFactor: position.account.healthFactor,
          totalCollateralUsd: position.account.totalCollateralUsd,
          totalDebtUsd: position.account.totalDebtUsd,
          reserveCount: position.reserves.filter(
            (item) =>
              Number(item.suppliedBalance) > 0 ||
              Number(item.variableDebt) > 0 ||
              Number(item.stableDebt) > 0,
          ).length,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error: {
          code: "AAVE_POSITION_DETECTION_FAILED",
          message: "We could not read this wallet's Aave position right now.",
        },
      },
      { status: 503 },
    );
  }
}
