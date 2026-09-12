"use client";
import { useState } from "react";
import type { ExecutionView } from "@/lib/product/models";
import type { ExecutionStage, ProtectionExecutionResult } from "@/lib/execution/types";
import { Icon } from "./icons";
import { LoadingButton } from "./loading-button";

export type TimelineState = "complete" | "active" | "pending" | "failed" | "cancelled";
export interface TimelineStep {
  key: string;
  label: string;
  state: TimelineState;
}
export interface TimelineGroup {
  key: "analyze" | "validate" | "execute" | "verify";
  title: string;
  description: string;
  steps: TimelineStep[];
  state: TimelineState;
}
export function executionTimeline(execution: ExecutionView | null): TimelineStep[] {
  const confirmed = execution?.status === "CONFIRMED";
  const submitted =
    confirmed || execution?.status === "SUBMITTED" || execution?.status === "UNCONFIRMED";
  const failed = execution?.status === "FAILED";
  const cancelled = execution?.status === "CANCELLED";
  const simulated = execution?.simulationStatus === "SUCCEEDED";
  return [
    {
      key: "refresh",
      label: "Live Aave position refreshed",
      state: execution ? "complete" : "pending",
    },
    {
      key: "policy",
      label: "Protection policy validated",
      state: execution ? "complete" : "pending",
    },
    {
      key: "mei",
      label: "Minimum Effective Intervention recalculated",
      state: execution ? "complete" : "pending",
    },
    {
      key: "sender",
      label: "KeeperHub sender verified",
      state: execution ? "complete" : "pending",
    },
    {
      key: "funding",
      label: "Balance and Aave allowance verified",
      state: execution ? "complete" : "pending",
    },
    {
      key: "simulation",
      label: "KeeperHub simulation passed",
      state: simulated
        ? "complete"
        : execution?.simulationStatus === "FAILED"
          ? "failed"
          : "pending",
    },
    {
      key: "revalidation",
      label: cancelled ? "Stale decision cancelled" : "Position revalidated before broadcast",
      state: cancelled ? "cancelled" : submitted || confirmed ? "complete" : "pending",
    },
    {
      key: "execution",
      label: "KeeperHub execution",
      state: confirmed
        ? "complete"
        : failed
          ? "failed"
          : submitted
            ? "active"
            : cancelled
              ? "cancelled"
              : "pending",
    },
    {
      key: "receipt",
      label: "Receipt and Aave event verified",
      state: execution?.receiptVerified ? "complete" : failed ? "failed" : "pending",
    },
    {
      key: "outcome",
      label: "Improved health factor verified",
      state: confirmed && execution.healthFactorAfter ? "complete" : "pending",
    },
  ];
}
const liveLabels: Record<ExecutionStage, string> = {
  REFRESHING_POSITION: "Live Aave position refreshed",
  VALIDATING_POLICY: "Protection policy validated",
  CALCULATING_MEI: "Minimum Effective Intervention recalculated",
  VERIFYING_SENDER: "KeeperHub sender verified",
  VERIFYING_BALANCE: "Protection balance verified",
  VERIFYING_ALLOWANCE: "Aave allowance verified",
  SIMULATING: "KeeperHub simulation passed",
  REVALIDATING: "Position revalidated before broadcast",
  READY_TO_EXECUTE: "Ready to execute",
  BROADCASTING: "KeeperHub execution",
  VERIFYING_RECEIPT: "Receipt and Aave event verified",
  VERIFYING_AAVE_POSITION: "Improved health factor verified",
  CONFIRMED: "Protection confirmed",
};
export function readyExecutionTimeline(stages: ExecutionStage[]): TimelineStep[] {
  const completed = new Set(stages);
  return (Object.keys(liveLabels) as ExecutionStage[]).map((key) => ({
    key,
    label: liveLabels[key],
    state: completed.has(key) ? "complete" : "pending",
  }));
}

const timelineSections = [
  {
    key: "analyze",
    title: "Analyze",
    description: "Refresh position and calculate MEI",
    keys: ["refresh", "mei", "REFRESHING_POSITION", "CALCULATING_MEI"],
  },
  {
    key: "validate",
    title: "Validate",
    description: "Apply policy and safety checks",
    keys: [
      "policy",
      "sender",
      "funding",
      "simulation",
      "VALIDATING_POLICY",
      "VERIFYING_SENDER",
      "VERIFYING_BALANCE",
      "VERIFYING_ALLOWANCE",
      "SIMULATING",
    ],
  },
  {
    key: "execute",
    title: "Execute",
    description: "Revalidate and submit through KeeperHub",
    keys: ["revalidation", "execution", "REVALIDATING", "READY_TO_EXECUTE", "BROADCASTING"],
  },
  {
    key: "verify",
    title: "Verify",
    description: "Confirm receipt, Aave event, and outcome",
    keys: ["receipt", "outcome", "VERIFYING_RECEIPT", "VERIFYING_AAVE_POSITION", "CONFIRMED"],
  },
] as const;

export function groupExecutionTimeline(steps: TimelineStep[]): TimelineGroup[] {
  return timelineSections.map((section) => {
    const grouped = steps.filter((step) => (section.keys as readonly string[]).includes(step.key));
    const state: TimelineState = grouped.some((step) => step.state === "failed")
      ? "failed"
      : grouped.some((step) => step.state === "cancelled")
        ? "cancelled"
        : grouped.length > 0 && grouped.every((step) => step.state === "complete")
          ? "complete"
          : grouped.some((step) => step.state === "active")
            ? "active"
            : "pending";
    return {
      key: section.key,
      title: section.title,
      description: section.description,
      steps: grouped,
      state,
    };
  });
}
export function ExecutionPanel({
  execution,
  canRequest,
  mode,
  hasActionableCandidate,
}: {
  execution: ExecutionView | null;
  canRequest: boolean;
  mode: "MONITOR_ONLY" | "REQUIRE_APPROVAL" | "AUTONOMOUS";
  hasActionableCandidate: boolean;
}) {
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [technicalError, setTechnicalError] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<ProtectionExecutionResult | null>(null);
  async function requestProtection() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setMessageIsError(false);
    setTechnicalError("");
    setLive(null);
    try {
      const response = await fetch("/api/protection/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "simulate" }),
      });
      const body = (await response.json()) as ProtectionExecutionResult & {
        error?: { message?: string; code?: string };
      };
      if (!response.ok) {
        setTechnicalError(body.error?.code ?? `HTTP ${response.status}`);
        throw new Error(
          body.error?.message ?? "PositionGuard could not complete the protection simulation.",
        );
      }
      setLive(body);
      setMessage(
        `Simulation passed. ${body.amount} ${body.asset} would reach projected HF ${body.projectedHealthFactor ?? "unbounded"}. Gas estimate: ${body.simulation.gasEstimate}.`,
      );
    } catch (error) {
      setMessageIsError(true);
      setMessage(
        error instanceof Error ? error.message : "Protection request could not reach the server.",
      );
    } finally {
      setBusy(false);
    }
  }
  const timeline = live ? readyExecutionTimeline(live.stages) : executionTimeline(execution);
  const groups = groupExecutionTimeline(timeline);
  return (
    <div className="execution-panel">
      <div className="timeline-groups" aria-label="Protection execution stages">
        {groups.map((group, index) => (
          <section className={`timeline-group ${group.state}`} key={group.key}>
            <header>
              <span className="timeline-number">{index + 1}</span>
              <div>
                <h3>{group.title}</h3>
                <p>{group.description}</p>
              </div>
              <small>{group.state}</small>
            </header>
            <div className="timeline-details">
              {group.steps.map((step) => (
                <div className={`timeline-step ${step.state}`} key={step.key}>
                  <span>
                    {step.state === "complete" ? (
                      <Icon name="check" />
                    ) : step.state === "active" ? (
                      <span className="spinner" />
                    ) : step.state === "failed" || step.state === "cancelled" ? (
                      "!"
                    ) : (
                      ""
                    )}
                  </span>
                  <p>{step.label}</p>
                  <small>{step.state}</small>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {canRequest ? (
        <div className="execute-cta" aria-busy={busy}>
          <p>
            {mode === "REQUIRE_APPROVAL"
              ? "PositionGuard will prepare protection, but you will approve execution. This simulation does not sign or broadcast."
              : "PositionGuard acts automatically only within configured limits. Simulate the current protection path without signing or broadcasting."}
          </p>
          <LoadingButton
            className="button primary"
            pending={busy}
            pendingLabel="Simulating…"
            disabled={!canRequest || busy}
            onClick={() => void requestProtection()}
          >
            <Icon name="shield" />
            {mode === "REQUIRE_APPROVAL" ? "Simulate approval flow" : "Simulate protection"}
          </LoadingButton>
          {busy && (
            <p className="sr-only" role="status">
              Protection simulation is running.
            </p>
          )}
          {message && (
            <div
              className={`inline-message ${messageIsError ? "error" : "success"}`}
              role={messageIsError ? "alert" : "status"}
            >
              {message}
              {technicalError && (
                <details>
                  <summary>Show technical details</summary>
                  <code>{technicalError}</code>
                </details>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="empty-row">
          {!hasActionableCandidate
            ? "No current Protection Action requires execution."
            : mode === "MONITOR_ONLY"
              ? "Monitor Only mode does not submit transactions."
              : "Enable Protection before requesting a simulation."}
        </p>
      )}
    </div>
  );
}
