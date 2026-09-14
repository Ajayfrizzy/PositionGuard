/**
 * Canonical database selector for historical protection success.
 *
 * `receiptVerified` is persisted only after the successful RPC receipt, Aave
 * event, and post-execution position have all been verified.
 */
export function latestVerifiedProtectionQuery(protectedAccountId: string, chainId: number) {
  return {
    where: {
      executionStatus: "CONFIRMED" as const,
      receiptVerified: true,
      completedAt: { not: null },
      decision: {
        userId: protectedAccountId,
        snapshot: { chainId },
      },
    },
    include: {
      decision: {
        include: {
          snapshot: true,
          candidates: { orderBy: { rank: "asc" as const } },
        },
      },
    },
    orderBy: [{ completedAt: "desc" as const }, { id: "desc" as const }],
  };
}

export function loadLatestVerifiedProtection<Row>(
  findFirst: (query: ReturnType<typeof latestVerifiedProtectionQuery>) => Promise<Row | null>,
  protectedAccountId: string,
  chainId: number,
) {
  return findFirst(latestVerifiedProtectionQuery(protectedAccountId, chainId));
}
