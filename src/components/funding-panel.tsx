"use client";
import { useState } from "react";
import { StatusPill } from "./ui";
import { LoadingButton } from "./loading-button";
import { mapFundingReadiness, type FundingUxStatus } from "@/lib/product/status";
type Readiness = {
  state: string;
  requiredAsset: string;
  requiredAmount: string;
  availableBalance: string | null;
  currentAllowance: string | null;
  requiredAllowance: string;
  sender: string | null;
};
export function FundingPanel({
  chainId,
  spender,
  onboarding = false,
}: {
  chainId: number;
  spender: string;
  onboarding?: boolean;
}) {
  const [data, setData] = useState<{
    state: FundingUxStatus;
    readiness: Readiness | null;
    ux: { status: FundingUxStatus; explanation: string; action: string | null };
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function check() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/funding-readiness?chainId=${chainId}`);
      const body = (await response.json()) as typeof data & { error?: { code?: string } };
      if (!response.ok || !body) throw new Error(body?.error?.code ?? "Readiness check failed");
      setData(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Readiness check failed");
    } finally {
      setBusy(false);
    }
  }
  const readiness = data?.readiness;
  const ux = data?.ux ?? mapFundingReadiness(null);
  const tone =
    ux.status === "READY"
      ? "good"
      : ux.status === "NOT_CHECKED" || ux.status === "NO_ACTION_REQUIRED"
        ? "neutral"
        : "warn";
  return (
    <section className="card funding-panel">
      <div className="section-heading">
        <div>
          <span className="label">
            {onboarding ? "Step 5 of 6 — Review funding" : "Protection Funding"}
          </span>
          <h2>Make protection ready</h2>
          <p className="section-description">
            PositionGuard never moves funds or requests unlimited approval silently.
          </p>
        </div>
        <StatusPill tone={tone}>{ux.status.replaceAll("_", " ")}</StatusPill>
      </div>
      {data ? (
        <>
          <p className="funding-explanation">{ux.explanation}</p>
          {readiness && (
            <dl>
              <div>
                <dt>Required protection asset</dt>
                <dd>{readiness?.requiredAsset ?? "Not selected"}</dd>
              </div>
              <div>
                <dt>Required amount</dt>
                <dd>{readiness?.requiredAmount ?? "—"}</dd>
              </div>
              <div>
                <dt>Available protection balance</dt>
                <dd>{readiness?.availableBalance ?? "Unavailable"}</dd>
              </div>
              <div>
                <dt>Current Aave allowance</dt>
                <dd>{readiness?.currentAllowance ?? "Unavailable"}</dd>
              </div>
              <div>
                <dt>Required allowance</dt>
                <dd>{readiness?.requiredAllowance ?? "—"}</dd>
              </div>
              <div>
                <dt>Funding destination</dt>
                <dd>
                  <code>{readiness?.sender ?? "Unavailable"}</code>
                </dd>
              </div>
              <div>
                <dt>Approval spender</dt>
                <dd>
                  <code>{spender}</code>
                </dd>
              </div>
            </dl>
          )}
          {ux.action && (
            <div className="funding-guidance">
              <b>What to do next</b>
              <p>{ux.action}</p>
              {readiness?.state === "INSUFFICIENT_ALLOWANCE" && (
                <p>
                  Token: {readiness.requiredAsset}. Spender: Aave Pool. Purpose: allow only the
                  selected protection amount. Maximum requested: {readiness.requiredAllowance}. Do
                  not use unlimited approval.
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="empty-row">{ux.explanation}</p>
      )}
      <LoadingButton
        type="button"
        className="button secondary"
        pending={busy}
        pendingLabel="Checking funding…"
        disabled={busy}
        onClick={() => void check()}
      >
        Check funding readiness
      </LoadingButton>
      {error && (
        <p className="form-status error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
