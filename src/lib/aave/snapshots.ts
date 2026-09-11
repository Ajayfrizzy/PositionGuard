import "server-only";
import { getPrisma } from "../db/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { AavePosition } from "./types";
import type { PositionAnalysis } from "./analysis";
export async function persistPositionSnapshot(
  position: AavePosition,
  analysis: PositionAnalysis,
): Promise<string> {
  const db = getPrisma();
  const metadata = JSON.parse(JSON.stringify({ position, analysis })) as Prisma.InputJsonValue;
  return db.$transaction(async (tx) => {
    // This is an operator-observed public wallet record, not proof of wallet ownership.
    const user = await tx.user.upsert({
      where: { walletAddress: position.wallet.toLowerCase() },
      create: { walletAddress: position.wallet.toLowerCase() },
      update: {},
    });
    const snapshot = await tx.positionSnapshot.create({
      data: {
        userId: user.id,
        chainId: position.chain.chainId,
        healthFactor: position.account.healthFactor,
        totalCollateralUsd: position.account.totalCollateralUsd,
        totalDebtUsd: position.account.totalDebtUsd,
        availableBorrowsUsd: position.account.availableBorrowsUsd,
        capturedAt: new Date(position.fetchedAt),
        blockNumber: BigInt(position.blockNumber),
        blockHash: position.blockHash,
        blockTimestamp: BigInt(position.blockTimestamp),
        purpose: "DECISION",
        normalizedContext: metadata,
      },
    });
    return snapshot.id;
  });
}
