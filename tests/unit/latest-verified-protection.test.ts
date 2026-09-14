import { describe, expect, it, vi } from "vitest";
import {
  latestVerifiedProtectionQuery,
  loadLatestVerifiedProtection,
} from "../../src/lib/product/latest-verified-protection";

type HistoricalExecution = {
  id: string;
  decisionId: string;
  executionStatus: "CONFIRMED" | "FAILED";
  receiptVerified: boolean;
  amount: string;
  completedAt: Date | null;
  decision: { userId: string; snapshot: { chainId: number } };
};

const accountId = "protected-account";
const chainId = 84532;
const execution = (
  patch: Partial<HistoricalExecution> & Pick<HistoricalExecution, "id" | "completedAt">,
): HistoricalExecution => {
  const { id, completedAt, ...overrides } = patch;
  return {
    id,
    decisionId: `decision-${id}`,
    executionStatus: "CONFIRMED",
    receiptVerified: true,
    amount: "2084",
    completedAt,
    decision: { userId: accountId, snapshot: { chainId } },
    ...overrides,
  };
};

function inMemoryFindFirst(rows: HistoricalExecution[]) {
  return vi.fn(async (query: ReturnType<typeof latestVerifiedProtectionQuery>) => {
    const { where } = query;
    return (
      rows
        .filter(
          (row) =>
            row.executionStatus === where.executionStatus &&
            row.receiptVerified === where.receiptVerified &&
            row.completedAt !== null &&
            row.decision.userId === where.decision.userId &&
            row.decision.snapshot.chainId === where.decision.snapshot.chainId,
        )
        .sort(
          (left, right) =>
            right.completedAt!.getTime() - left.completedAt!.getTime() ||
            right.id.localeCompare(left.id),
        )[0] ?? null
    );
  });
}

describe("latest verified protection selector", () => {
  const older = execution({
    id: "sep-10",
    amount: "212852",
    completedAt: new Date("2026-09-10T12:00:00.000Z"),
  });
  const newer = execution({
    id: "sep-14",
    amount: "2084",
    completedAt: new Date("2026-09-14T12:00:00.000Z"),
  });

  it("gives Overview and Protection the same newest confirmed execution", async () => {
    const findFirst = inMemoryFindFirst([older, newer]);

    const overview = await loadLatestVerifiedProtection(findFirst, accountId, chainId);
    const protection = await loadLatestVerifiedProtection(findFirst, accountId, chainId);

    expect(overview).toMatchObject({ id: "sep-14", amount: "2084" });
    expect(protection).toMatchObject({ id: "sep-14", amount: "2084" });
    expect(protection?.decisionId).toBe(overview?.decisionId);
  });

  it("does not let a later failed or unverified execution replace the latest success", async () => {
    const failed = execution({
      id: "sep-15-failed",
      executionStatus: "FAILED",
      receiptVerified: false,
      completedAt: new Date("2026-09-15T12:00:00.000Z"),
    });
    const unverified = execution({
      id: "sep-16-unverified",
      receiptVerified: false,
      completedAt: new Date("2026-09-16T12:00:00.000Z"),
    });

    const selected = await loadLatestVerifiedProtection(
      inMemoryFindFirst([older, newer, failed, unverified]),
      accountId,
      chainId,
    );

    expect(selected?.id).toBe("sep-14");
  });

  it("is protected-account and chain scoped", async () => {
    const otherAccount = execution({
      id: "other-account",
      completedAt: new Date("2026-09-17T12:00:00.000Z"),
      decision: { userId: "another-account", snapshot: { chainId } },
    });
    const otherChain = execution({
      id: "other-chain",
      completedAt: new Date("2026-09-18T12:00:00.000Z"),
      decision: { userId: accountId, snapshot: { chainId: 1 } },
    });

    const selected = await loadLatestVerifiedProtection(
      inMemoryFindFirst([older, newer, otherAccount, otherChain]),
      accountId,
      chainId,
    );

    expect(selected?.id).toBe("sep-14");
  });

  it("returns the empty state input when no verified execution exists", async () => {
    const failed = execution({
      id: "failed-only",
      executionStatus: "FAILED",
      receiptVerified: false,
      completedAt: new Date("2026-09-15T12:00:00.000Z"),
    });

    await expect(
      loadLatestVerifiedProtection(inMemoryFindFirst([failed]), accountId, chainId),
    ).resolves.toBeNull();
  });

  it("orders by authoritative completion time and requests execution proof", () => {
    const query = latestVerifiedProtectionQuery(accountId, chainId);

    expect(query.where).toMatchObject({
      executionStatus: "CONFIRMED",
      receiptVerified: true,
      completedAt: { not: null },
      decision: { userId: accountId, snapshot: { chainId } },
    });
    expect(query.orderBy).toEqual([{ completedAt: "desc" }, { id: "desc" }]);
    expect(query.include.decision.include).toMatchObject({ snapshot: true });
  });
});
