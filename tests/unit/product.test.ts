import { describe, expect, it, vi } from "vitest";
import {
  mapCandidates,
  shouldShowProtectionAttention,
  type ExecutionView,
} from "../../src/lib/product/models";
import {
  formatCompactUsd,
  formatNumber,
  formatPercentageRatio,
  formatTimestamp,
  shortAddress,
  transactionExplorerUrl,
} from "../../src/lib/product/format";
import { mapAuditTimeline } from "../../src/lib/product/audit";
import {
  deterministicExplanation,
  explainWithFallback,
  validateExplanation,
} from "../../src/lib/agent/explanation";
import {
  executionTimeline,
  groupExecutionTimeline,
  readyExecutionTimeline,
} from "../../src/components/execution-panel";
import { parseProtectionExecutionRequest } from "../../src/lib/protection/server-request";
import { baseSepoliaConfig } from "../../src/lib/chains/config";
import type { CandidateAction } from "../../src/lib/protection/types";

const candidate = (patch: Partial<CandidateAction> = {}): CandidateAction => ({
  id: "repay:usdc:212852",
  type: "REPAY_DEBT",
  asset: "0xusdc",
  assetSymbol: "USDC",
  amount: "0.212852",
  tokenAmount: "0.212852",
  tokenAmountUnits: "212852",
  estimatedUsdValue: "0.212852",
  expectedHealthFactor: "1.600001",
  reachesTarget: true,
  policyValidity: true,
  valid: true,
  requiresApproval: false,
  rejectionReason: null,
  rank: 1,
  ...patch,
});
const execution = (patch: Partial<ExecutionView> = {}): ExecutionView => ({
  id: "e1",
  decisionId: "decision-1",
  status: "CONFIRMED",
  simulationStatus: "SUCCEEDED",
  action: "REPAY_DEBT",
  asset: "USDC",
  amount: "212852",
  displayAmount: "0.212852",
  transactionHash: `0x${"a".repeat(64)}`,
  transactionLink: `https://sepolia.basescan.org/tx/0x${"a".repeat(64)}`,
  keeperHubExecutionId: "kh-execution",
  receiptVerified: true,
  healthFactorBefore: "1.549918",
  healthFactorAfter: "1.599999",
  failureReason: null,
  createdAt: "2026-09-08T10:00:00.000Z",
  completedAt: "2026-09-08T10:01:00.000Z",
  ...patch,
});

describe("product data presentation", () => {
  it("maps dashboard financial values without fabricating missing data", () => {
    expect(formatNumber("1.549918", 2)).toBe("1.55");
    expect(formatCompactUsd("1200.1")).toBe("$1,200.10");
    expect(formatNumber(null)).toBe("—");
  });
  it.each([
    ["0.85", "85%"],
    [0.856, "85.6%"],
    [null, "—"],
  ])("formats protocol ratio %s as %s", (value, expected) =>
    expect(formatPercentageRatio(value)).toBe(expected),
  );
  it("shortens configured wallet addresses", () =>
    expect(shortAddress("0x1234567890abcdef")).toBe("0x1234…cdef"));
  it("formats persisted timestamps with explicit UTC context", () => {
    expect(formatTimestamp("2026-09-08T10:01:00.000Z")).toContain("UTC");
    expect(formatTimestamp(null)).toBe("Unavailable");
  });
  it("labels the selected deterministic candidate", () => {
    const mapped = mapCandidates(
      [
        candidate(),
        candidate({
          id: "too-small",
          rank: 2,
          valid: false,
          reachesTarget: false,
          rejectionReason: "BELOW_TARGET",
        }),
      ],
      "repay:usdc:212852",
    );
    expect(mapped[0]).toMatchObject({
      state: "selected",
      label: "Selected",
      reason: "Minimum Effective Intervention.",
    });
    expect(mapped[1]?.reason).toContain("target health factor");
  });
  it("labels valid non-selected candidates as capital-heavier alternatives", () =>
    expect(mapCandidates([candidate({ id: "larger", amount: "0.3" })], null)[0]).toMatchObject({
      state: "valid",
      label: "Valid but not selected",
    }));
  it("explains materially oversized candidates using persisted capital values", () => {
    const mapped = mapCandidates(
      [
        candidate({ estimatedUsdValue: "1" }),
        candidate({ id: "oversized", rank: 2, estimatedUsdValue: "10" }),
      ],
      candidate().id,
    );
    expect(mapped[1]).toMatchObject({
      state: "valid",
      reason:
        "Reaches the target but uses significantly more capital than the selected Minimum Effective Intervention.",
    });
  });
  it("uses explicit approval wording", () =>
    expect(
      mapCandidates([candidate({ id: "approval", requiresApproval: true })], null)[0],
    ).toMatchObject({ state: "approval", label: "Requires approval" }));
  it("generates a strict Base Sepolia transaction URL", () =>
    expect(transactionExplorerUrl("https://sepolia.basescan.org/", `0x${"1".repeat(64)}`)).toBe(
      `https://sepolia.basescan.org/tx/0x${"1".repeat(64)}`,
    ));
  it.each(["0x123", "javascript:alert(1)"])(
    "rejects invalid transaction hashes or explorer inputs",
    (value) => {
      if (value.startsWith("0x"))
        expect(() =>
          transactionExplorerUrl(baseSepoliaConfig.blockExplorerBaseUrl, value),
        ).toThrow();
      else expect(() => transactionExplorerUrl(value, `0x${"1".repeat(64)}`)).toThrow();
    },
  );
  it("keeps Base Sepolia visibly classified as testnet", () =>
    expect(baseSepoliaConfig).toMatchObject({
      chainId: 84532,
      testnet: true,
      name: "Base Sepolia",
    }));
  it("shows protection attention only for a current actionable at-risk decision", () => {
    const ready = {
      policyEnabled: true,
      riskLevel: "WATCH" as const,
      decisionIsCurrent: true,
      decisionStatus: "READY",
      hasActionableCandidate: true,
    };
    expect(shouldShowProtectionAttention(ready)).toBe(true);
    expect(shouldShowProtectionAttention({ ...ready, riskLevel: "SAFE" })).toBe(false);
    expect(shouldShowProtectionAttention({ ...ready, policyEnabled: false })).toBe(false);
    expect(shouldShowProtectionAttention({ ...ready, decisionIsCurrent: false })).toBe(false);
    expect(shouldShowProtectionAttention({ ...ready, hasActionableCandidate: false })).toBe(false);
  });
});

describe("execution and audit presentation", () => {
  it("renders every confirmed execution gate complete", () =>
    expect(executionTimeline(execution()).every((step) => step.state === "complete")).toBe(true));
  it("shows stale-decision cancellation distinctly", () =>
    expect(
      executionTimeline(execution({ status: "CANCELLED", receiptVerified: false })).find(
        (step) => step.key === "revalidation",
      )?.state,
    ).toBe("cancelled"));
  it("keeps receipt pending for submitted execution", () =>
    expect(
      executionTimeline(execution({ status: "SUBMITTED", receiptVerified: false })).find(
        (step) => step.key === "receipt",
      )?.state,
    ).toBe("pending"));
  it("maps simulation-only READY_TO_EXECUTE without faking broadcast states", () => {
    const timeline = readyExecutionTimeline([
      "REFRESHING_POSITION",
      "VALIDATING_POLICY",
      "CALCULATING_MEI",
      "VERIFYING_SENDER",
      "VERIFYING_BALANCE",
      "VERIFYING_ALLOWANCE",
      "SIMULATING",
      "READY_TO_EXECUTE",
    ]);
    expect(timeline.find((step) => step.key === "READY_TO_EXECUTE")?.state).toBe("complete");
    expect(timeline.find((step) => step.key === "BROADCASTING")?.state).toBe("pending");
  });
  it("groups detailed gates under the four user-facing stages", () => {
    const groups = groupExecutionTimeline(executionTimeline(execution()));
    expect(groups.map((group) => group.title)).toEqual([
      "Analyze",
      "Validate",
      "Execute",
      "Verify",
    ]);
    expect(groups.flatMap((group) => group.steps)).toHaveLength(10);
    expect(groups.every((group) => group.state === "complete")).toBe(true);
  });
  it("combines confirmed executions with chronological audit events", () => {
    const result = mapAuditTimeline(
      [
        {
          id: "a1",
          type: "MEI_SELECTED",
          severity: "INFO",
          message: "Minimum action selected",
          createdAt: "2026-09-08T09:00:00.000Z",
          metadata: {},
        },
      ],
      [execution()],
    );
    expect(result.map((item) => item.type)).toEqual(["EXECUTION_CONFIRMED", "MEI_SELECTED"]);
    expect(result[0]?.execution?.keeperHubExecutionId).toBe("kh-execution");
  });
});

describe("bounded explanation layer", () => {
  const input = {
    healthFactor: "1.55",
    target: "1.60",
    riskLevel: "HIGH",
    candidates: mapCandidates([candidate()], candidate().id),
    selected: mapCandidates([candidate()], candidate().id)[0]!,
    protectionEnabled: true,
  };
  it("validates structured explanations referencing known candidates", () =>
    expect(
      validateExplanation(
        {
          riskSummary: "Risk",
          selectionReason: "Smallest",
          policySummary: "Allowed",
          outcomeSummary: null,
          referencedCandidateIds: [candidate().id],
        },
        [candidate().id],
      ).selectionReason,
    ).toBe("Smallest"));
  it("rejects AI attempts to introduce an unknown action", () =>
    expect(() =>
      validateExplanation(
        {
          riskSummary: "Risk",
          selectionReason: "Other",
          policySummary: "Allowed",
          outcomeSummary: null,
          referencedCandidateIds: ["arbitrary-action"],
        },
        [candidate().id],
      ),
    ).toThrow("AI_REFERENCED_UNKNOWN_CANDIDATE"));
  it("falls back deterministically when the provider fails", async () => {
    const provider = vi.fn().mockRejectedValue(new Error("offline"));
    const result = await explainWithFallback(input, provider);
    expect(result.source).toBe("deterministic");
    expect(result.explanation.selectionReason).toContain("smallest evaluated");
  });
  it("creates a useful deterministic explanation without any AI provider", () =>
    expect(deterministicExplanation(input).riskSummary).toContain("1.55"));
});

describe("safe frontend execution contract", () => {
  it("accepts only a bounded protection mode", () =>
    expect(parseProtectionExecutionRequest({ mode: "simulate" })).toEqual({ mode: "simulate" }));
  it.each([
    { amount: "1" },
    { asset: "USDC" },
    { target: "0x123" },
    { calldata: "0x" },
    { abi: [] },
  ])("rejects arbitrary execution input %j", (payload) =>
    expect(() => parseProtectionExecutionRequest(payload)).toThrow(),
  );
});
