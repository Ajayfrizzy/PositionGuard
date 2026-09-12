import { Card, EmptyState, PageHeader, StatusPill } from "@/components/ui";
import { ExecutionPanel } from "@/components/execution-panel";
import { Icon } from "@/components/icons";
import { deterministicExplanation } from "@/lib/agent/explanation";
import { loadProtectionData } from "@/lib/product/current-data";
import { formatCompactUsd, formatNumber } from "@/lib/product/format";
import type { CandidateView } from "@/lib/product/models";
import Link from "next/link";

export const dynamic = "force-dynamic";

function CandidateRow({
  candidate,
  analysisHf,
}: {
  candidate: CandidateView;
  analysisHf: string | null;
}) {
  return (
    <article className={`candidate ${candidate.state}`}>
      <div className="candidate-rank">{candidate.rank}</div>
      <div className="candidate-action">
        <span>{candidate.type === "REPAY_DEBT" ? "Repay debt" : "Add collateral"}</span>
        <h3>
          {candidate.tokenAmount ?? candidate.amount} {candidate.assetSymbol ?? candidate.asset}
        </h3>
        <small>Capital required {formatCompactUsd(candidate.estimatedUsdValue)}</small>
      </div>
      <div className="candidate-hf">
        <span>Projected HF</span>
        <b>{formatNumber(candidate.expectedHealthFactor, 4)}</b>
        <small>
          {formatNumber(analysisHf, 2)} → {formatNumber(candidate.expectedHealthFactor, 2)}
        </small>
      </div>
      <div className="candidate-policy">
        <span>Policy</span>
        <b>{candidate.policyValidity ? "Compliant" : "Blocked"}</b>
        <small>{candidate.reachesTarget ? "Target reached" : "Below target"}</small>
      </div>
      <div className="candidate-result">
        <StatusPill
          tone={
            candidate.state === "selected"
              ? "good"
              : candidate.state === "rejected"
                ? "danger"
                : candidate.state === "approval"
                  ? "warn"
                  : "blue"
          }
        >
          {candidate.label}
        </StatusPill>
        <p>{candidate.reason}</p>
      </div>
    </article>
  );
}

export default async function ProtectionPage() {
  const data = await loadProtectionData();
  if (!data.hasAavePosition)
    return (
      <div className="page">
        <PageHeader
          eyebrow="DETERMINISTIC DEFENSE"
          title="Protection Analysis"
          description="Every candidate is evaluated against live position state and hard policy constraints."
        >
          <StatusPill tone="neutral">NO POSITION</StatusPill>
        </PageHeader>
        <Card>
          <EmptyState title="No supported Aave V3 position detected">
            Protection analysis begins after PositionGuard captures supplied collateral or debt.
          </EmptyState>
          <div className="empty-actions">
            <Link className="button primary" href="/position">
              Refresh position
            </Link>
          </div>
        </Card>
      </div>
    );
  const selected = data.selectedCandidate;
  const actionable = data.riskLevel !== "SAFE" && data.decisionIsCurrent ? selected : null;
  const analysisHf = data.analysisHealthFactor ?? data.position.healthFactor;
  const explanation = deterministicExplanation({
    healthFactor: data.position.healthFactor,
    target: data.policy.targetHealthFactor,
    riskLevel: data.riskLevel,
    candidates: data.candidates,
    selected: actionable,
    protectionEnabled: data.policy.enabled,
  });
  const closestRejected = data.candidates
    .filter((candidate) => candidate.state === "rejected")
    .sort(
      (a, b) =>
        Math.abs(Number(a.expectedHealthFactor ?? 0) - Number(data.policy.targetHealthFactor)) -
        Math.abs(Number(b.expectedHealthFactor ?? 0) - Number(data.policy.targetHealthFactor)),
    )
    .slice(0, 2);
  const featuredIds = new Set([
    ...(selected ? [selected.id] : []),
    ...closestRejected.map((candidate) => candidate.id),
  ]);
  const featured = [...(selected ? [selected] : []), ...closestRejected];
  const remaining = data.candidates.filter((candidate) => !featuredIds.has(candidate.id));

  return (
    <div className="page">
      <PageHeader
        eyebrow="DETERMINISTIC DEFENSE"
        title="Protection Analysis"
        description="Every candidate is evaluated against live position state and hard policy constraints."
      >
        <StatusPill
          tone={
            !data.hasAavePosition
              ? "neutral"
              : data.riskLevel === "SAFE"
                ? "good"
                : actionable && data.policy.enabled
                  ? "warn"
                  : "neutral"
          }
        >
          {!data.hasAavePosition
            ? "NO POSITION"
            : data.riskLevel === "SAFE"
              ? "POSITION SAFE"
              : actionable && data.policy.enabled
                ? "INTERVENTION AVAILABLE"
                : "NO ACTION READY"}
        </StatusPill>
      </PageHeader>
      {data.riskLevel === "SAFE" && data.hasAavePosition && (
        <div className="alert success">
          Your position is currently within the configured safety target.
        </div>
      )}
      <div className="analysis-summary">
        <Card>
          <span className="label">Current health factor</span>
          <strong>{formatNumber(data.position.healthFactor, 4)}</strong>
          <StatusPill tone={data.riskLevel === "SAFE" ? "good" : "danger"}>
            {data.riskLevel}
          </StatusPill>
        </Card>
        <Card>
          <span className="label">Configured target</span>
          <strong>{formatNumber(data.policy.targetHealthFactor, 2)}</strong>
          <small>Policy enforced server-side</small>
        </Card>
        <Card>
          <span className="label">Collateral / debt</span>
          <strong>{formatCompactUsd(data.position.totalCollateralUsd)}</strong>
          <small>{formatCompactUsd(data.position.totalDebtUsd)} borrowed</small>
        </Card>
      </div>
      <Card className="mei-explainer">
        <div className="round-icon">
          <Icon name="shield" />
        </div>
        <div>
          <p className="eyebrow">MINIMUM EFFECTIVE INTERVENTION</p>
          <h2>The smallest action that restores safety.</h2>
          <p>
            Minimum Effective Intervention is the smallest policy-compliant action expected to
            restore the position to its configured safety target. Rule-based safety logic—not
            AI—selects the amount.
          </p>
        </div>
        {selected && (
          <div className="selected-mini">
            <span>
              {data.riskLevel === "SAFE" ? "Latest verified decision" : "Selected action"}
            </span>
            <b>
              {selected.tokenAmount ?? selected.amount} {selected.assetSymbol ?? selected.asset}
            </b>
            <small>Projected HF {formatNumber(selected.expectedHealthFactor, 4)}</small>
          </div>
        )}
      </Card>
      <Card>
        <div className="section-heading">
          <div>
            <span className="label">Candidate evaluation</span>
            <h2>{data.candidates.length} actions evaluated</h2>
            <p className="section-description">
              Selected action first, followed by the nearest rejected alternatives.
            </p>
          </div>
          <StatusPill tone="blue">RULE-BASED</StatusPill>
        </div>
        {data.candidates.length ? (
          <>
            <div className="candidate-list featured-candidates">
              {featured.map((candidate) => (
                <CandidateRow candidate={candidate} analysisHf={analysisHf} key={candidate.id} />
              ))}
            </div>
            {remaining.length > 0 && (
              <details className="candidate-evidence">
                <summary>
                  <span>
                    Review {remaining.length} remaining candidate{remaining.length === 1 ? "" : "s"}
                  </span>
                  <small>Full policy and projection evidence</small>
                </summary>
                <div className="candidate-list">
                  {remaining.map((candidate) => (
                    <CandidateRow
                      candidate={candidate}
                      analysisHf={analysisHf}
                      key={candidate.id}
                    />
                  ))}
                </div>
              </details>
            )}
          </>
        ) : (
          <EmptyState title="No evaluated candidates">
            A stored protection decision with candidate records is required. PositionGuard never
            fabricates example actions.
          </EmptyState>
        )}
      </Card>
      <div className="explanation-card">
        <span className="eyebrow">SAFETY EXPLANATION · RULE-BASED</span>
        <h2>Why this matters</h2>
        <p>{explanation.whyRiskChanged ?? explanation.riskSummary}</p>
        <h2>Why this action</h2>
        <p>{explanation.whyThisAction ?? explanation.selectionReason}</p>
        <h2>What PositionGuard checked</h2>
        <p>{explanation.policySummary}</p>
        <h2>What happens next</h2>
        <p>{explanation.whatHappensNext}</p>
        <details>
          <summary>Show technical details</summary>
          <p>Candidate references: {explanation.referencedCandidateIds.join(", ") || "None"}</p>
          {explanation.rejectedReasons?.map((item) => (
            <p key={item.candidateId}>
              {item.candidateId}: {item.reason}
            </p>
          ))}
        </details>
      </div>
      <Card>
        <div className="section-heading">
          <div>
            <span className="label">Controlled execution</span>
            <h2>Protection Execution</h2>
          </div>
          {data.latestExecution && (
            <StatusPill tone={data.latestExecution.status === "CONFIRMED" ? "good" : "neutral"}>
              {data.latestExecution.status}
            </StatusPill>
          )}
        </div>
        <ExecutionPanel
          execution={data.latestExecution}
          canRequest={
            Boolean(actionable) &&
            data.policy.enabled &&
            data.policy.executionMode !== "MONITOR_ONLY"
          }
          mode={data.policy.executionMode}
          hasActionableCandidate={Boolean(actionable)}
        />
      </Card>
      {(data.latestExecution?.status === "CANCELLED" || data.positionChangedAt) && (
        <div className="stale-state">
          <Icon name="activity" />
          <div>
            <p className="eyebrow">POSITION CHANGED</p>
            <h2>Stale intervention cancelled</h2>
            <p>
              The Aave position changed after this protection recommendation was created.
              PositionGuard cancelled the stale intervention and recalculated protection.
            </p>
          </div>
        </div>
      )}
      {data.latestExecution?.status === "CONFIRMED" && (
        <Card className="success-card">
          <div className="success-mark">
            <Icon name="check" />
          </div>
          <div>
            <p className="eyebrow">PROTECTION SUCCESSFUL</p>
            <h2>
              Health factor {formatNumber(data.latestExecution.healthFactorBefore, 4)} →{" "}
              {formatNumber(data.latestExecution.healthFactorAfter, 4)}
            </h2>
            <p>
              {data.latestExecution.action === "REPAY_DEBT" ? "Repayment" : "Collateral supplied"}:{" "}
              <b>
                {data.latestExecution.displayAmount} {data.latestExecution.asset}
              </b>
            </p>
          </div>
          <div className="success-proof">
            <span>
              KeeperHub <b>{data.latestExecution.keeperHubExecutionId ? "Verified" : "—"}</b>
            </span>
            <span>
              Aave <b>{data.latestExecution.receiptVerified ? "Receipt confirmed" : "Pending"}</b>
            </span>
            {data.latestExecution.transactionLink && (
              <a href={data.latestExecution.transactionLink} target="_blank" rel="noreferrer">
                View transaction <Icon name="external" />
              </a>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
