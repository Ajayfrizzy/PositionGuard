"use client";
import { useState } from "react";
import type { ExecutionView } from "@/lib/product/models";
import type { ExecutionStage, ProtectionExecutionResult } from "@/lib/execution/types";
import { Icon } from "./icons";

export type TimelineState = "complete" | "active" | "pending" | "failed" | "cancelled";
export interface TimelineStep { key: string; label: string; state: TimelineState }
export function executionTimeline(execution: ExecutionView | null): TimelineStep[] {
  const confirmed = execution?.status === "CONFIRMED";
  const submitted = confirmed || execution?.status === "SUBMITTED" || execution?.status === "UNCONFIRMED";
  const failed = execution?.status === "FAILED";
  const cancelled = execution?.status === "CANCELLED";
  const simulated = execution?.simulationStatus === "SUCCEEDED";
  return [
    { key: "refresh", label: "Live Aave position refreshed", state: execution ? "complete" : "pending" },
    { key: "policy", label: "Protection policy validated", state: execution ? "complete" : "pending" },
    { key: "mei", label: "Minimum Effective Intervention recalculated", state: execution ? "complete" : "pending" },
    { key: "sender", label: "KeeperHub sender verified", state: execution ? "complete" : "pending" },
    { key: "funding", label: "Balance and Aave allowance verified", state: execution ? "complete" : "pending" },
    { key: "simulation", label: "KeeperHub simulation passed", state: simulated ? "complete" : execution?.simulationStatus === "FAILED" ? "failed" : "pending" },
    { key: "revalidation", label: cancelled ? "Stale decision cancelled" : "Position revalidated before broadcast", state: cancelled ? "cancelled" : submitted || confirmed ? "complete" : "pending" },
    { key: "execution", label: "KeeperHub execution", state: confirmed ? "complete" : failed ? "failed" : submitted ? "active" : cancelled ? "cancelled" : "pending" },
    { key: "receipt", label: "Receipt and Aave event verified", state: execution?.receiptVerified ? "complete" : failed ? "failed" : "pending" },
    { key: "outcome", label: "Improved health factor verified", state: confirmed && execution.healthFactorAfter ? "complete" : "pending" },
  ];
}
const liveLabels: Record<ExecutionStage, string> = { REFRESHING_POSITION: "Live Aave position refreshed", VALIDATING_POLICY: "Protection policy validated", CALCULATING_MEI: "Minimum Effective Intervention recalculated", VERIFYING_SENDER: "KeeperHub sender verified", VERIFYING_BALANCE: "Protection balance verified", VERIFYING_ALLOWANCE: "Aave allowance verified", SIMULATING: "KeeperHub simulation passed", REVALIDATING: "Position revalidated before broadcast", READY_TO_EXECUTE: "Ready to execute", BROADCASTING: "KeeperHub execution", VERIFYING_RECEIPT: "Receipt and Aave event verified", VERIFYING_AAVE_POSITION: "Improved health factor verified", CONFIRMED: "Protection confirmed" };
export function readyExecutionTimeline(stages: ExecutionStage[]): TimelineStep[] { const completed = new Set(stages); return (Object.keys(liveLabels) as ExecutionStage[]).map(key => ({ key, label: liveLabels[key], state: completed.has(key) ? "complete" : "pending" })); }
export function ExecutionPanel({ execution, canRequest }: { execution: ExecutionView | null; canRequest: boolean }) {
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [token, setToken] = useState(""); const [live, setLive] = useState<ProtectionExecutionResult | null>(null);
  async function requestProtection() { setBusy(true); setMessage(""); setLive(null); try { const response = await fetch("/api/protection/execute", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ mode: "simulate" }) }); const body = await response.json() as ProtectionExecutionResult & { error?: { message?: string; code?: string } }; if (!response.ok) throw new Error(body.error?.message ?? body.error?.code ?? "Simulation failed safely."); setLive(body); setMessage(`Simulation passed. ${body.amount} ${body.asset} would reach projected HF ${body.projectedHealthFactor ?? "unbounded"}. Gas estimate: ${body.simulation.gasEstimate}.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Protection request could not reach the server."); } finally { setBusy(false); } }
  const timeline = live ? readyExecutionTimeline(live.stages) : executionTimeline(execution);
  return <div className="execution-panel"><div className="timeline">{timeline.map(step => <div className={`timeline-step ${step.state}`} key={step.key}><span>{step.state === "complete" ? <Icon name="check"/> : step.state === "active" ? <span className="spinner"/> : step.state === "failed" || step.state === "cancelled" ? "!" : ""}</span><p>{step.label}</p><small>{step.state}</small></div>)}</div>
    <div className="execute-cta"><p>Simulation reloads policy and Aave state, recomputes MEI, checks sender, funding, allowance, and KeeperHub without signing or broadcasting.</p><input aria-label="Operator authorization" type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="Operator authorization"/><button className="button primary" disabled={!canRequest || !token || busy} onClick={() => void requestProtection()}><Icon name="shield"/>{busy ? "Running safety checks…" : "Simulate protection"}</button>{message && <div className="inline-message" role="status">{message}</div>}</div>
  </div>;
}
