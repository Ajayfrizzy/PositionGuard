"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProductPolicy } from "@/lib/product/models";
import { Icon } from "./icons";
const fields = [
  [
    "targetHealthFactor",
    "Target health factor",
    "PositionGuard aims to restore the position to this level.",
  ],
  ["warningHealthFactor", "Warning health factor", "Risk monitoring escalates below this level."],
  ["emergencyHealthFactor", "Emergency health factor", "Critical status begins below this level."],
  [
    "maxAutonomousAmountUsd",
    "Maximum amount per intervention",
    "Capital permitted in one automatic action.",
  ],
  [
    "maxDailyAutonomousAmountUsd",
    "Daily maximum",
    "Aggregate automatic capital permitted in 24 hours.",
  ],
  ["approvalRequiredAboveUsd", "Ask me above", "Larger actions must wait for explicit approval."],
] as const;
export function PolicyForm({
  initial,
  onboarding = false,
  fundingPanel,
}: {
  initial: ProductPolicy;
  onboarding?: boolean;
  fundingPanel?: React.ReactNode;
}) {
  const router = useRouter();
  const [policy, setPolicy] = useState(initial);
  const [confirmed, setConfirmed] = useState(initial.executionMode === "AUTONOMOUS");
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  function set(key: keyof ProductPolicy, value: string | boolean | number) {
    setPolicy((current) => ({ ...current, [key]: value }));
  }
  function setMode(value: ProductPolicy["executionMode"]) {
    set("executionMode", value);
    if (value !== "AUTONOMOUS") setConfirmed(false);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setError(false);
    try {
      const payload = {
        executionMode: policy.executionMode,
        confirmAutonomous: confirmed,
        targetHealthFactor: policy.targetHealthFactor,
        warningHealthFactor: policy.warningHealthFactor,
        emergencyHealthFactor: policy.emergencyHealthFactor,
        maxAutonomousAmountUsd: policy.maxAutonomousAmountUsd,
        maxDailyAutonomousAmountUsd: policy.maxDailyAutonomousAmountUsd,
        approvalRequiredAboveUsd: policy.approvalRequiredAboveUsd,
        allowRepay: policy.allowRepay,
        allowAddCollateral: policy.allowAddCollateral,
        interventionCooldownMinutes: policy.interventionCooldownMinutes,
        enabled: policy.enabled,
      };
      const response = await fetch("/api/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Policy update failed");
      setStatus(
        onboarding
          ? "Protection settings saved. Continue to funding readiness below."
          : "Protection settings saved. Monitoring continues even when this browser is closed.",
      );
      if (onboarding && policy.enabled) {
        router.push("/dashboard");
        router.refresh();
      } else if (onboarding) {
        document.querySelector("#funding-readiness")?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (caught) {
      setError(true);
      setStatus(caught instanceof Error ? caught.message : "Policy update failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="policy-form" onSubmit={save}>
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="label">Execution mode</span>
            <h2>Choose how protection works</h2>
          </div>
        </div>
        <div className="mode-options">
          {(["MONITOR_ONLY", "REQUIRE_APPROVAL", "AUTONOMOUS"] as const).map((mode) => (
            <label key={mode} className={policy.executionMode === mode ? "selected" : ""}>
              <input
                type="radio"
                name="executionMode"
                checked={policy.executionMode === mode}
                onChange={() => setMode(mode)}
              />
              <b>
                {mode === "MONITOR_ONLY"
                  ? "Monitor Only"
                  : mode === "REQUIRE_APPROVAL"
                    ? "Ask Before Acting"
                    : "Protect Automatically"}
              </b>
              <small>
                {mode === "MONITOR_ONLY"
                  ? "Alert me when risk increases."
                  : mode === "REQUIRE_APPROVAL"
                    ? "Prepare the protection action and wait for my approval."
                    : "Act automatically within the limits I set."}
              </small>
            </label>
          ))}
        </div>
        {policy.executionMode === "AUTONOMOUS" && (
          <label className="autonomous-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              I understand PositionGuard may act automatically without asking each time, only within
              the limits below.
            </span>
          </label>
        )}
      </section>
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="label">Risk thresholds</span>
            <h2>Health factor policy</h2>
          </div>
          <span className="ordering">Target &gt; Warning &gt; Emergency &gt; 1.00</span>
        </div>
        <div className="form-grid">
          {fields.slice(0, 3).map(([key, label, help]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                inputMode="decimal"
                value={String(policy[key])}
                onChange={(event) => set(key, event.target.value)}
                required
              />
              <small>{help}</small>
            </label>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="label">Capital limits</span>
            <h2>Automatic protection guardrails</h2>
          </div>
        </div>
        <div className="form-grid">
          {fields.slice(3).map(([key, label, help]) => (
            <label key={key}>
              <span>{label}</span>
              <div className="money-input">
                <i>$</i>
                <input
                  inputMode="decimal"
                  value={String(policy[key])}
                  onChange={(event) => set(key, event.target.value)}
                  required
                />
              </div>
              <small>{help}</small>
            </label>
          ))}
        </div>
        <label className="wide-field">
          <span>Cooldown</span>
          <div className="suffix-input">
            <input
              type="number"
              min="0"
              max="525600"
              value={policy.interventionCooldownMinutes}
              onChange={(event) => set("interventionCooldownMinutes", Number(event.target.value))}
            />
            <i>minutes</i>
          </div>
        </label>
      </section>
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="label">Permissions</span>
            <h2>Allowed actions</h2>
          </div>
        </div>
        <Toggle
          checked={policy.allowRepay}
          setChecked={(value) => set("allowRepay", value)}
          title="Repay debt"
          copy="Allow repayment of supported Aave debt."
        />
        <Toggle
          checked={policy.allowAddCollateral}
          setChecked={(value) => set("allowAddCollateral", value)}
          title="Add collateral"
          copy="Allow supported funding to be supplied as collateral."
        />
      </section>
      <section className="immutable-note">
        <Icon name="shield" />
        <div>
          <h3>The deterministic engine remains in control</h3>
          <p>
            AI and the browser cannot alter amounts, assets, calldata, policy limits, or execution
            authorization.
          </p>
        </div>
      </section>
      {fundingPanel}
      <section className="card activation-summary">
        <span className="label">
          {onboarding ? "Step 6 of 6 — Enable protection" : "Activation summary"}
        </span>
        <h2>Review your protection limits</h2>
        <Toggle
          checked={policy.enabled}
          setChecked={(value) => set("enabled", value)}
          title="Enable protection"
          copy="Start hosted monitoring for this position."
          highlight
        />
        <dl>
          <div>
            <dt>Target HF</dt>
            <dd>{policy.targetHealthFactor}</dd>
          </div>
          <div>
            <dt>Allowed actions</dt>
            <dd>
              {[policy.allowRepay && "Repay debt", policy.allowAddCollateral && "Add collateral"]
                .filter(Boolean)
                .join(", ") || "None"}
            </dd>
          </div>
          <div>
            <dt>Maximum per intervention</dt>
            <dd>${policy.maxAutonomousAmountUsd}</dd>
          </div>
          <div>
            <dt>Daily maximum</dt>
            <dd>${policy.maxDailyAutonomousAmountUsd}</dd>
          </div>
          <div>
            <dt>Cooldown</dt>
            <dd>{policy.interventionCooldownMinutes} minutes</dd>
          </div>
          <div>
            <dt>Funding readiness</dt>
            <dd>Verified before every action</dd>
          </div>
        </dl>
        <button
          className="button primary"
          disabled={busy || (policy.executionMode === "AUTONOMOUS" && !confirmed)}
        >
          {busy
            ? "Saving…"
            : policy.enabled
              ? "Save and enable protection"
              : onboarding
                ? "Save and continue to funding readiness"
                : "Save protection settings"}
        </button>
        {status && (
          <p
            className={`form-status ${error ? "error" : "success"}`}
            role={error ? "alert" : "status"}
          >
            {status}
          </p>
        )}
      </section>
    </form>
  );
}
function Toggle({
  checked,
  setChecked,
  title,
  copy,
  highlight = false,
}: {
  checked: boolean;
  setChecked(value: boolean): void;
  title: string;
  copy: string;
  highlight?: boolean;
}) {
  return (
    <label className={`toggle-row ${highlight ? "highlight" : ""}`}>
      <div>
        <b>{title}</b>
        <small>{copy}</small>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
      />
      <span className="toggle" />
    </label>
  );
}
