"use client";
import { useState } from "react";
import { Icon } from "./icons";
import { StatusPill } from "./ui";
import { formatNumber } from "@/lib/product/format";
import {
  buildStressRequest,
  presetPriceDrops,
  recoveryTransition,
  stressResultState,
  validateCustomPriceDrop,
} from "@/lib/stress/presentation";
import type { ProtectionResult } from "@/lib/protection/types";

type Result = {
  simulationOnly: true;
  onchainStateChanged: false;
  asset: string;
  percentageShock: number;
  currentHealthFactor: string | null;
  projectedHealthFactor: string | null;
  projectedRisk: string;
  targetHealthFactor: string;
  mei: { action: string; asset: string; amount: string } | null;
  requiredCapitalUsd: string | null;
  projectedRecoveryHealthFactor: string | null;
  result: ProtectionResult;
};
type DropChoice = number | "custom";
const riskTone = (risk: string) =>
  risk === "SAFE" ? "good" : risk === "WATCH" ? "warn" : "danger";
const actionLabel = (action: string) => (action === "REPAY_DEBT" ? "Repay" : "Add");

export function StressForm({
  scenarioAuthorization,
  assets,
}: {
  scenarioAuthorization: string | null;
  assets: string[];
}) {
  const [asset, setAsset] = useState(assets[0] ?? "WETH");
  const [choice, setChoice] = useState<DropChoice>(10);
  const [customDrop, setCustomDrop] = useState("25");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const priceDrop = choice === "custom" ? Number(customDrop) : choice;
  const customError = choice === "custom" ? validateCustomPriceDrop(priceDrop) : null;
  async function run(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!scenarioAuthorization) {
      setError(
        "Scenario access is unavailable. Refresh the page or check the server authorization configuration.",
      );
      return;
    }
    const validation = validateCustomPriceDrop(priceDrop);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/stress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildStressRequest({ asset, priceDrop, scenarioAuthorization })),
      });
      const body = (await response.json()) as Result & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Stress test failed");
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Stress test failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="scenario-flow">
      <form className="card stress-form" onSubmit={run}>
        <div className="scenario-step">
          <span className="step-number">1</span>
          <div className="step-content">
            <label htmlFor="stress-asset">
              <b>Choose collateral asset</b>
              <small>Select the collateral asset whose price you want to stress.</small>
            </label>
            <select
              id="stress-asset"
              value={asset}
              onChange={(event) => setAsset(event.target.value)}
            >
              {assets.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="scenario-divider" aria-hidden="true" />
        <div className="scenario-step">
          <span className="step-number">2</span>
          <div className="step-content">
            <fieldset>
              <legend>Simulate a price drop</legend>
              <p>Choose a common market move or enter your own percentage.</p>
              <div className="shock-presets">
                {presetPriceDrops.map((drop) => (
                  <button
                    type="button"
                    key={drop}
                    className={choice === drop ? "selected" : ""}
                    aria-pressed={choice === drop}
                    onClick={() => setChoice(drop)}
                  >
                    -{drop}%
                  </button>
                ))}
                <button
                  type="button"
                  className={choice === "custom" ? "selected" : ""}
                  aria-pressed={choice === "custom"}
                  onClick={() => setChoice("custom")}
                >
                  Custom
                </button>
              </div>
              {choice === "custom" && (
                <label className="custom-drop" htmlFor="custom-drop">
                  <span>Custom price drop</span>
                  <span className="percentage-input">
                    <input
                      id="custom-drop"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      max="99.99"
                      step="0.01"
                      value={customDrop}
                      onChange={(event) => setCustomDrop(event.target.value)}
                      aria-invalid={Boolean(customError)}
                    />
                    <i>%</i>
                  </span>
                  {customError && <small className="field-error">{customError}</small>}
                </label>
              )}
            </fieldset>
          </div>
        </div>
        <div className="scenario-action">
          <button
            className="button primary"
            disabled={busy || !scenarioAuthorization || Boolean(customError)}
          >
            <Icon name="activity" />
            {busy ? "Calculating…" : "Run Stress Test"}
          </button>
          <p>PositionGuard will calculate the projected health factor and protection response.</p>
        </div>
        {error && (
          <p className="form-status error" role="alert">
            {error}
          </p>
        )}
      </form>
      {result && <StressResult result={result} />}
    </div>
  );
}

function StressResult({ result }: { result: Result }) {
  const state = stressResultState(result.result);
  const recovery = recoveryTransition(
    result.projectedHealthFactor,
    result.projectedRecoveryHealthFactor,
  );
  return (
    <section className="card stress-result" aria-live="polite">
      <header className="stress-result-header">
        <div>
          <span className="label">Stress test result</span>
          <h2>
            {result.asset} {result.percentageShock}%
          </h2>
        </div>
        <StatusPill tone={riskTone(result.projectedRisk)}>{result.projectedRisk} RISK</StatusPill>
      </header>
      <div className="projected-position">
        <div>
          <span>Current Health Factor</span>
          <strong>{formatNumber(result.currentHealthFactor, 2)}</strong>
        </div>
        <span className="transition-arrow" aria-label="changes to">
          →
        </span>
        <div>
          <span>Projected Health Factor</span>
          <strong className={result.projectedRisk === "SAFE" ? "good" : "danger"}>
            {formatNumber(result.projectedHealthFactor, 2)}
          </strong>
        </div>
        <div>
          <span>Risk Level</span>
          <strong>{result.projectedRisk}</strong>
        </div>
      </div>
      {state.kind === "safe" && (
        <div className="response-panel safe-response">
          <div className="response-icon">
            <Icon name="check" />
          </div>
          <div>
            <span className="label">PositionGuard response</span>
            <h3>Position remains within your safety target.</h3>
            <p>No protection action would be required.</p>
            <div className="safe-hf-row">
              <span>
                Current HF <b>{formatNumber(result.currentHealthFactor, 2)}</b>
              </span>
              <span>
                Projected HF <b>{formatNumber(result.projectedHealthFactor, 2)}</b>
              </span>
              <span>
                Target HF <b>{formatNumber(result.targetHealthFactor, 2)}</b>
              </span>
            </div>
          </div>
        </div>
      )}
      {state.kind === "actionable" && result.mei && (
        <div className="response-panel action-response">
          <div className="response-icon">
            <Icon name="shield" />
          </div>
          <div>
            <span className="label">PositionGuard response</span>
            <h3>
              {actionLabel(result.mei.action)}{" "}
              <em>
                {result.mei.amount} {result.mei.asset}
              </em>
            </h3>
            <div className="recovery-block">
              <span>Projected recovery</span>
              <div className="recovery-states">
                <div>
                  <small>{recovery.before.label}</small>
                  <b>{formatNumber(recovery.before.healthFactor, 2)}</b>
                </div>
                <span className="transition-arrow" aria-label="recovers to">
                  →
                </span>
                <div>
                  <small>{recovery.after.label}</small>
                  <b>{formatNumber(recovery.after.healthFactor, 2)}</b>
                </div>
              </div>
            </div>
            <div className="mei-label">
              <Icon name="check" />
              <span>
                <b>Minimum Effective Intervention</b>The smallest policy-compliant action expected
                to restore the configured safety target.
              </span>
            </div>
            {result.requiredCapitalUsd && (
              <small className="capital-note">
                Estimated capital required: ${result.requiredCapitalUsd}
              </small>
            )}
          </div>
        </div>
      )}
      {state.kind === "blocked" && (
        <div className="response-panel blocked-response">
          <div className="response-icon">
            <Icon name="shield" />
          </div>
          <div>
            <span className="label">PositionGuard response</span>
            <h3>Protection would be blocked</h3>
            <p>{state.blocker}</p>
            <small>Review your protection policy or funding before relying on this action.</small>
          </div>
        </div>
      )}
      <div className="explanation-card">
        <span className="eyebrow">WHY THIS MATTERS</span>
        <h2>Why this scenario changes your risk</h2>
        <p>
          A {Math.abs(result.percentageShock)}% {result.asset} price decrease would move health
          factor from {formatNumber(result.currentHealthFactor, 2)} to{" "}
          {formatNumber(result.projectedHealthFactor, 2)}.
        </p>
        <h2>Why this action</h2>
        <p>
          {result.mei
            ? `${result.mei.amount} ${result.mei.asset} is the smallest policy-compliant action found for this scenario.`
            : (state.blocker ?? "No action is needed under this scenario.")}
        </p>
        <h2>What happens next</h2>
        <p>
          This result is informational. Monitoring continues against live Aave state and no scenario
          transaction is broadcast.
        </p>
        <details>
          <summary>Show technical details</summary>
          <p>
            Deterministic scenario engine · target HF {result.targetHealthFactor} · projected risk{" "}
            {result.projectedRisk}
          </p>
        </details>
      </div>
      <footer className="result-safety">
        <Icon name="shield" />
        <b>SIMULATION ONLY</b>
        <span>No funds moved and no blockchain transaction was submitted.</span>
      </footer>
    </section>
  );
}
