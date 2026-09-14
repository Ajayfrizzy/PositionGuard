import Link from "next/link";
import {
  ArrowLink,
  Card,
  ConnectionDot,
  EmptyState,
  Metric,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { LiveProtectionStatus } from "@/components/live-protection-status";
import { loadDashboardData } from "@/lib/product/current-data";
import { formatCompactUsd, formatNumber, shortAddress, timeAgo } from "@/lib/product/format";
import { deterministicExplanation } from "@/lib/agent/explanation";
import { protectionRecommendation } from "@/lib/product/models";
import { mapFundingReadiness } from "@/lib/product/status";

export const dynamic = "force-dynamic";
const riskTone = (risk: string) =>
  risk === "SAFE" ? "good" : risk === "WATCH" ? "warn" : "danger";
export default async function DashboardPage() {
  const data = await loadDashboardData();
  const candidate =
    data.riskLevel === "SAFE" || !data.decisionIsCurrent ? null : data.selectedCandidate;
  const recommendation = protectionRecommendation({
    hasCandidate: Boolean(candidate),
    riskLevel: data.riskLevel,
    policyEnabled: data.policy.enabled,
    executionMode: data.policy.executionMode,
  });
  const execution = data.latestExecution;
  const funding = mapFundingReadiness(
    data.fundingAssessment,
    data.currentDecisionIsActionable ? "NOT_CHECKED" : "NO_ACTION_REQUIRED",
  );
  const currentHealthFactor = Number(data.position.healthFactor);
  const targetHealthFactor = Number(data.policy.targetHealthFactor);
  const explanation = deterministicExplanation({
    healthFactor: data.position.healthFactor,
    target: data.policy.targetHealthFactor,
    riskLevel: data.riskLevel,
    candidates: data.candidates,
    selected: candidate,
    protectionEnabled: data.policy.enabled,
  });
  return (
    <div className="page">
      <div className="testnet-banner" role="note" aria-label="Testnet warning">
        <span>TESTNET</span>
        <p>Base Sepolia assets have no real-world value.</p>
        <b>Chain ID {data.network.chainId}</b>
      </div>
      <PageHeader
        eyebrow="COMMAND CENTER"
        title="Position Overview"
        description="Live risk assessment and protection status."
      >
        <Link className="button secondary" href="/position">
          <Icon name="activity" />
          View live position
        </Link>
      </PageHeader>
      <div className="explanation-card">
        <span className="eyebrow">WHY THIS MATTERS</span>
        <h2>
          {!data.hasAavePosition
            ? "No supported Aave V3 position detected"
            : data.riskLevel === "SAFE"
              ? "Your safety target is currently met"
              : "Your position needs attention"}
        </h2>
        {!data.hasAavePosition ? (
          <p>
            PositionGuard needs a supported Aave V3 position before it can calculate Health Factor,
            risk, or a Protection Action.
          </p>
        ) : (
          <>
            <p>{explanation.whyRiskChanged}</p>
            <p>{explanation.whatHappensNext}</p>
            <details>
              <summary>Show technical details</summary>
              <p>{explanation.policySummary}</p>
            </details>
          </>
        )}
      </div>
      {data.error && (
        <div className="alert warning">
          <b>Live data unavailable</b>
          <span>{data.error}</span>
        </div>
      )}
      <div className="overview-grid">
        <Card className="health-card">
          {!data.hasAavePosition ? (
            <EmptyState title="No supported Aave V3 position detected">
              Refresh the Position page after supplying collateral or borrowing on Base Sepolia.
            </EmptyState>
          ) : (
            <>
              <div className="health-top">
                <div>
                  <span className="label">Health factor</span>
                  <div className="health-value">{formatNumber(data.position.healthFactor, 2)}</div>
                </div>
                <StatusPill tone={riskTone(data.riskLevel)}>
                  <span className="pulse-dot" />
                  {data.riskLevel} RISK
                </StatusPill>
              </div>
              <div className="hf-track">
                <i
                  style={{
                    width: `${Math.min(100, Math.max(3, ((Number(data.position.healthFactor ?? 1) - 1) / 0.8) * 100))}%`,
                  }}
                />
                <span
                  className="target-marker"
                  style={{
                    left: `${Math.min(96, Math.max(4, ((Number(data.policy.targetHealthFactor) - 1) / 0.8) * 100))}%`,
                  }}
                />
              </div>
              <div className="track-labels">
                <span>1.00 liquidation</span>
                <b>Target {formatNumber(data.policy.targetHealthFactor, 2)}</b>
                <span>1.80 safe</span>
              </div>
              <p className="health-copy">
                {data.riskLevel === "SAFE"
                  ? currentHealthFactor > targetHealthFactor + 0.0005
                    ? "Your position is currently above the configured safety target."
                    : "Your position currently meets the configured safety target."
                  : "Your position is below the configured safety target. PositionGuard has evaluated defensive actions."}
              </p>
              <div className="health-meta">
                <span>
                  <i className="live-dot" />
                  Last assessed{" "}
                  {data.position.capturedAt ? timeAgo(data.position.capturedAt) : "never"}
                </span>
                <Link href="/position">
                  Position details <Icon name="arrow" />
                </Link>
              </div>
            </>
          )}
        </Card>
        <LiveProtectionStatus
          policy={data.policy}
          fundingStatus={funding.status}
          initialWorkerStatus={data.monitoring.status ?? "NOT_STARTED"}
          initialLastCheck={data.monitoring.lastCheck}
        />
      </div>
      {candidate ? (
        <Card className="recommendation">
          <div className="recommendation-accent" />
          <div className="recommendation-copy">
            <p className="eyebrow">POSITIONGUARD RECOMMENDS</p>
            <h2>
              {candidate.type === "REPAY_DEBT" ? "Repay" : "Supply"}{" "}
              <span>
                {candidate.tokenAmount ?? candidate.amount}{" "}
                {candidate.assetSymbol ?? candidate.asset}
              </span>
            </h2>
            <p>
              Smallest policy-compliant action expected to restore your configured safety target.
            </p>
            <p>{recommendation.message}</p>
            <div className="mei-badge">
              <Icon name="check" />
              Minimum Effective Intervention
            </div>
          </div>
          <div className="projection">
            <span>Projected health factor</span>
            <div>
              <b>{formatNumber(data.position.healthFactor, 2)}</b>
              <span className="transition-arrow" aria-label="improves to">
                →
              </span>
              <strong>{formatNumber(candidate.expectedHealthFactor, 2)}</strong>
            </div>
            <small>Target {formatNumber(data.policy.targetHealthFactor, 2)}</small>
          </div>
          <div className="recommendation-actions">
            <Link className="button secondary" href="/protection">
              View analysis
            </Link>
            {recommendation.cta && recommendation.cta.label !== "View analysis" && (
              <Link className="button primary" href={recommendation.cta.href}>
                <Icon name="shield" />
                {recommendation.cta.label}
              </Link>
            )}
          </div>
        </Card>
      ) : (
        <Card className="dashboard-empty-action">
          <EmptyState title="No protection action required">
            {data.hasAavePosition
              ? "Your current position has no actionable Minimum Effective Intervention."
              : "No supported Aave V3 position is available for protection analysis."}
          </EmptyState>
        </Card>
      )}
      {data.hasAavePosition && (
        <div className="metric-grid">
          <Metric
            label="Total collateral"
            value={formatCompactUsd(data.position.totalCollateralUsd)}
            detail="Across Aave V3"
          />
          <Metric
            label="Total debt"
            value={formatCompactUsd(data.position.totalDebtUsd)}
            detail="Current borrowed value"
          />
          <Metric
            label="Available borrow"
            value={formatCompactUsd(data.position.availableBorrowsUsd)}
            detail="At current collateral"
          />
          <Metric
            label="Protection balances"
            value={formatCompactUsd(
              data.position.reserves.reduce((sum, item) => sum + Number(item.walletBalanceUsd), 0),
            )}
            detail={`${data.position.reserves.filter((r) => Number(r.walletBalance) > 0).length} available assets`}
          />
        </div>
      )}
      <div className="dashboard-bottom">
        <Card>
          <div className="section-heading">
            <div>
              <span className="label">
                {execution?.status === "CONFIRMED"
                  ? "LATEST VERIFIED PROTECTION"
                  : "LATEST PROTECTION EVENT"}
              </span>
              <h2>
                {execution
                  ? execution.status === "CONFIRMED"
                    ? "Position successfully protected"
                    : `Execution ${execution.status.toLowerCase()}`
                  : "No protection execution yet"}
              </h2>
            </div>
            {execution && (
              <StatusPill tone={execution.status === "CONFIRMED" ? "good" : "neutral"}>
                {execution.status}
              </StatusPill>
            )}
          </div>
          {execution ? (
            <div className="event-summary historical-event">
              <div className="event-icon">
                <Icon name="check" />
              </div>
              <div>
                <p>
                  {execution.action === "REPAY_DEBT" ? "Repaid" : "Supplied"}{" "}
                  <b>
                    {execution.displayAmount} {execution.asset}
                  </b>
                </p>
                <small>
                  {timeAgo(execution.completedAt ?? execution.createdAt)} · KeeperHub{" "}
                  {execution.keeperHubExecutionId ? "verified" : "pending"}
                </small>
                <small>
                  {execution.status === "CONFIRMED"
                    ? "Previous verified execution · not the current position state"
                    : "Previous execution record · not the current position state"}
                </small>
              </div>
              <div className="hf-change">
                <span>HF</span>
                <b>
                  {formatNumber(execution.healthFactorBefore, 2)} →{" "}
                  {formatNumber(execution.healthFactorAfter, 2)}
                </b>
              </div>
            </div>
          ) : (
            <div className="empty-row">Confirmed executions are rendered from the database.</div>
          )}
          <ArrowLink href="/activity">View full audit trail</ArrowLink>
        </Card>
        <Card>
          <div className="section-heading">
            <div>
              <span className="label">Integration status</span>
              <h2>Platform availability</h2>
            </div>
            <span className="status-timestamp">Server verified</span>
          </div>
          <div className="connections">
            {[
              ["RPC", data.rpc, "Available"],
              ["Aave V3 snapshot", data.aave, "Available"],
              ["Database", data.database, "Available"],
              ["KeeperHub", data.keeperHub.authenticated, "Configured"],
              ["Protection Account", data.keeperHub.senderVerified, "Configured"],
            ].map(([label, state, connectedLabel]) => (
              <div key={label}>
                <ConnectionDot state={state as "connected" | "disconnected" | "unknown"} />
                <span>{label}</span>
                <b>
                  {state === "connected"
                    ? connectedLabel
                    : state === "unknown"
                      ? "Not verified"
                      : "Not configured"}
                </b>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <footer className="page-footer">
        <span>
          <span className="status-dot neutral" />
          Protected Account
        </span>
        <code title={data.position.wallet ?? ""}>{shortAddress(data.position.wallet)}</code>
        <span>Network</span>
        <b>{data.network.name}</b>
      </footer>
    </div>
  );
}
