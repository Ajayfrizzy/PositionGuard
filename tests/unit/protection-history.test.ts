import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deterministicExplanation } from "../../src/lib/agent/explanation";
import {
  candidateDisplayLabel,
  mapCandidates,
  protectionDecisionState,
  type ProtectionDecisionView,
} from "../../src/lib/product/models";
import type { CandidateAction } from "../../src/lib/protection/types";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const rawCandidate: CandidateAction = {
  id: "candidate-1",
  type: "REPAY_DEBT",
  asset: "USDC",
  assetSymbol: "USDC",
  amount: "0.212852",
  tokenAmount: "0.212852",
  estimatedUsdValue: "0.212852",
  expectedHealthFactor: "1.6000",
  reachesTarget: true,
  policyValidity: true,
  valid: true,
  requiresApproval: false,
  rejectionReason: null,
  rank: 1,
};
const selected = mapCandidates([rawCandidate], rawCandidate.id)[0]!;
const decision: ProtectionDecisionView = {
  id: "decision-1",
  riskLevel: "HIGH",
  status: "READY",
  createdAt: "2026-09-12T10:00:00.000Z",
  snapshotBlockNumber: "1234",
  snapshotHealthFactor: "1.5499",
  expectedHealthFactor: "1.6000",
  candidates: [selected],
  selectedCandidate: selected,
};

describe("current and historical protection state", () => {
  it("never exposes a selected action as current while the live position is SAFE", () => {
    const state = protectionDecisionState(decision, "SAFE", false);
    expect(state.currentSelectedCandidate).toBeNull();
    expect(state.currentDecisionIsActionable).toBe(false);
    expect(state.historicalDecision?.selectedCandidate).toBe(selected);
  });

  it("keeps a stale risky decision historical and non-actionable", () => {
    const state = protectionDecisionState(decision, "HIGH", false);
    expect(state.currentDecision).toBeNull();
    expect(state.currentSelectedCandidate).toBeNull();
    expect(state.historicalDecision).toBe(decision);
  });

  it("keeps a current at-risk selected MEI actionable", () => {
    const state = protectionDecisionState(decision, "HIGH", true);
    expect(state.currentDecision).toBe(decision);
    expect(state.currentSelectedCandidate).toBe(selected);
    expect(state.currentDecisionIsActionable).toBe(true);
    expect(state.historicalDecision).toBeNull();
  });

  it("labels only a historical selected candidate as previously selected", () => {
    expect(candidateDisplayLabel(selected, true)).toBe("Previously selected");
    expect(candidateDisplayLabel(selected, false)).toBe("Selected");
  });

  it("gives SAFE state a candidate-free current explanation", () => {
    const explanation = deterministicExplanation({
      healthFactor: "1.652",
      target: "1.65",
      riskLevel: "SAFE",
      candidates: [selected],
      selected,
      protectionEnabled: true,
    });
    expect(explanation.whyThisAction).toBe("No protection action is required.");
    expect(explanation.whatHappensNext).toBe(
      "PositionGuard will continue monitoring for future risk.",
    );
    expect(explanation.referencedCandidateIds).toEqual([]);
    expect(explanation.selectionReason).not.toContain("USDC");
  });
});

describe("protection page presentation", () => {
  const page = source("src/app/protection/page.tsx");
  const css = source("src/app/globals.css");

  it("shows an explicit no-action current decision and SAFE summary", () => {
    expect(page).toContain("POSITION SAFE");
    expect(page).toContain("CURRENT PROTECTION DECISION");
    expect(page).toContain("No action required");
    expect(page).toContain("No current protection action requires execution.");
  });

  it("labels and collapses historical candidate evidence", () => {
    expect(page).toContain("PREVIOUS PROTECTION ANALYSIS");
    expect(page).toContain("Previous candidate evaluation");
    expect(page).toContain("View previous candidate analysis");
    expect(page).toContain("Not current");
    expect(page).toContain("historicalDecision.candidates.length");
  });

  it("uses visible closed/open disclosure labels and a decorative chevron", () => {
    expect(page).toContain("disclosure-label-collapsed");
    expect(page).toContain("Hide previous candidate analysis");
    expect(page).toContain("Hide remaining candidates");
    expect(page).toContain('className="disclosure-chevron" aria-hidden="true"');
    expect(css).toContain(".disclosure-chevron");
    expect(css).toMatch(/\.candidate-evidence\[open\] \.disclosure-chevron[^}]*rotate\(225deg\)/s);
  });

  it("makes the native summary row clearly interactive and keyboard visible", () => {
    expect(css).toMatch(/\.candidate-evidence summary:hover/);
    expect(css).toMatch(/\.candidate-evidence summary:focus-visible/);
    expect(css).toMatch(/\.candidate-evidence summary[^}]*cursor:\s*pointer/s);
    expect(page.match(/candidate-disclosure-summary/g)).toHaveLength(2);
  });

  it("uses historical state wording and persisted execution time", () => {
    expect(page).toContain("Decision state at selection");
    expect(page).not.toContain("Decision status");
    expect(page).toContain('className="execution-timestamp"');
    expect(page).toContain("formatTimestamp(historicalExecution.completedAt");
  });

  it("keeps historical execution proof without exposing a stale execution CTA", () => {
    expect(page).toContain("PREVIOUS PROTECTION SUCCESS");
    expect(page).toContain("This execution belongs to a previous protection event.");
    expect(page).toContain("historicalExecution.receiptVerified");
    expect(page).toContain("historicalExecution.aaveEffectVerified");
    expect(page).toContain("historicalExecution.transactionLink");
    expect(page).toMatch(/actionable \? \(\s*<ExecutionPanel/);
  });
});
