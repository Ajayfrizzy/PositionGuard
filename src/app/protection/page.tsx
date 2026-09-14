import { Card, EmptyState, PageHeader, StatusPill } from "@/components/ui";
import { ExecutionPanel } from "@/components/execution-panel";
import { Icon } from "@/components/icons";
import { deterministicExplanation } from "@/lib/agent/explanation";
import { loadProtectionData } from "@/lib/product/current-data";
import { formatCompactUsd, formatNumber, formatTimestamp } from "@/lib/product/format";
import { candidateDisplayLabel, type CandidateView } from "@/lib/product/models";
import Link from "next/link";

export const dynamic = "force-dynamic";

function CandidateRow({
  candidate,
  analysisHf,
  historical = false,
}: {
  candidate: CandidateView;
  analysisHf: string | null;
  historical?: boolean;
}) {
  return (
    <article className={`candidate ${candidate.state}${historical ? " historical" : ""}`}>
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
          {candidateDisplayLabel(candidate, historical)}
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
  const actionable = data.currentSelectedCandidate;
  const currentDecision = data.currentDecision;
  const historicalDecision = data.historicalDecision;
  const currentCandidates = data.riskLevel === "SAFE" ? [] : (currentDecision?.candidates ?? []);
  const analysisHf = currentDecision?.snapshotHealthFactor ?? data.position.healthFactor;
  const explanation = deterministicExplanation({
    healthFactor: data.position.healthFactor,
    target: data.policy.targetHealthFactor,
    riskLevel: data.riskLevel,
    candidates: currentCandidates,
    selected: actionable,
    protectionEnabled: data.policy.enabled,
  });
  const historicalExplanation = historicalDecision
    ? deterministicExplanation({
        healthFactor: historicalDecision.snapshotHealthFactor,
        target: data.policy.targetHealthFactor,
        riskLevel: historicalDecision.riskLevel,
        candidates: historicalDecision.candidates,
        selected: historicalDecision.selectedCandidate,
        protectionEnabled: data.policy.enabled,
      })
    : null;
  const closestRejected = currentCandidates
    .filter((candidate) => candidate.state === "rejected")
    .sort(
      (a, b) =>
        Math.abs(Number(a.expectedHealthFactor ?? 0) - Number(data.policy.targetHealthFactor)) -
        Math.abs(Number(b.expectedHealthFactor ?? 0) - Number(data.policy.targetHealthFactor)),
    )
    .slice(0, 2);
  const featuredIds = new Set([
    ...(actionable ? [actionable.id] : []),
    ...closestRejected.map((candidate) => candidate.id),
  ]);
  const featured = [...(actionable ? [actionable] : []), ...closestRejected];
  const remaining = currentCandidates.filter((candidate) => !featuredIds.has(candidate.id));
  const currentExecution =
    data.currentDecisionIsActionable &&
    data.latestExecution &&
    data.latestExecution.decisionId === currentDecision?.id
      ? data.latestExecution
      : null;
  const historicalExecution = currentExecution ? null : data.latestExecution;

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
          <b>No protection action required.</b>
          <span>Your current position is above the configured safety target.</span>
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
          <p className="eyebrow">CURRENT PROTECTION DECISION</p>
          <h2>{actionable ? "Minimum Effective Intervention" : "No action required"}</h2>
          <p>
            {actionable
              ? "This is the smallest policy-compliant action for the current position. Rule-based safety logic—not AI—selects the amount."
              : "PositionGuard does not recommend an intervention for the current position."}
          </p>
        </div>
        {actionable && (
          <div className="selected-mini">
            <span>Selected action</span>
            <b>
              {actionable.tokenAmount ?? actionable.amount}{" "}
              {actionable.assetSymbol ?? actionable.asset}
            </b>
            <small>Projected HF {formatNumber(actionable.expectedHealthFactor, 4)}</small>
          </div>
        )}
      </Card>
      {currentCandidates.length > 0 && (
        <Card>
          <div className="section-heading">
            <div>
              <span className="label">Candidate evaluation</span>
              <h2>{currentCandidates.length} current actions evaluated</h2>
              <p className="section-description">
                Selected action first, followed by the nearest rejected alternatives.
              </p>
            </div>
            <StatusPill tone="blue">RULE-BASED</StatusPill>
          </div>
          {currentCandidates.length ? (
            <>
              <div className="candidate-list featured-candidates">
                {featured.map((candidate) => (
                  <CandidateRow candidate={candidate} analysisHf={analysisHf} key={candidate.id} />
                ))}
              </div>
              {remaining.length > 0 && (
                <details className="candidate-evidence">
                  <summary className="candidate-disclosure-summary">
                    <span className="candidate-disclosure-copy">
                      <span className="disclosure-label disclosure-label-collapsed">
                        Review {remaining.length} remaining candidate
                        {remaining.length === 1 ? "" : "s"}
                      </span>
                      <span className="disclosure-label disclosure-label-expanded">
                        Hide remaining candidates
                      </span>
                      <small>
                        {remaining.length} additional candidate
                        {remaining.length === 1 ? "" : "s"} · Full policy and projection evidence
                      </small>
                    </span>
                    <span className="disclosure-chevron" aria-hidden="true" />
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
      )}
      {historicalDecision && (
        <Card className="historical-analysis">
          <div className="section-heading">
            <div>
              <span className="label">PREVIOUS PROTECTION ANALYSIS</span>
              <h2>Latest protection history</h2>
              <p className="section-description">Based on an earlier position snapshot.</p>
            </div>
            <StatusPill tone="neutral">HISTORICAL</StatusPill>
          </div>
          <div className="historical-decision-grid">
            <div>
              <span>Previous risk event</span>
              <b>{historicalDecision.riskLevel}</b>
              <small>HF {formatNumber(historicalDecision.snapshotHealthFactor, 4)}</small>
            </div>
            <div>
              <span>Previous recommendation</span>
              {historicalDecision.selectedCandidate ? (
                <b>
                  {historicalDecision.selectedCandidate.type === "REPAY_DEBT" ? "Repay" : "Supply"}{" "}
                  {historicalDecision.selectedCandidate.tokenAmount ??
                    historicalDecision.selectedCandidate.amount}{" "}
                  {historicalDecision.selectedCandidate.assetSymbol ??
                    historicalDecision.selectedCandidate.asset}
                </b>
              ) : (
                <b>No action selected</b>
              )}
              <small>
                Projected HF{" "}
                {formatNumber(historicalDecision.selectedCandidate?.expectedHealthFactor, 4)}
              </small>
            </div>
            <div>
              <span>Decision state at selection</span>
              <b>{historicalDecision.status.replaceAll("_", " ")}</b>
              <small>Decision created: {formatTimestamp(historicalDecision.createdAt)}</small>
            </div>
            <div>
              <span>Snapshot block</span>
              <b>{historicalDecision.snapshotBlockNumber ?? "Unavailable"}</b>
              <small>Historical evidence</small>
            </div>
          </div>
          {historicalDecision.candidates.length > 0 && (
            <details className="candidate-evidence historical-candidates">
              <summary className="candidate-disclosure-summary">
                <span className="candidate-disclosure-copy">
                  <span className="disclosure-label disclosure-label-collapsed">
                    View previous candidate analysis
                  </span>
                  <span className="disclosure-label disclosure-label-expanded">
                    Hide previous candidate analysis
                  </span>
                  <small>
                    {historicalDecision.candidates.length} historical candidate
                    {historicalDecision.candidates.length === 1 ? "" : "s"} · Not current execution
                    recommendations
                  </small>
                </span>
                <span className="disclosure-chevron" aria-hidden="true" />
              </summary>
              <div className="historical-candidate-heading">
                <span className="label">Previous candidate evaluation</span>
                <p className="section-description">
                  These actions were evaluated during the latest historical protection decision.
                </p>
              </div>
              <div className="candidate-list">
                {historicalDecision.candidates.map((candidate) => (
                  <CandidateRow
                    candidate={candidate}
                    analysisHf={historicalDecision.snapshotHealthFactor}
                    historical
                    key={candidate.id}
                  />
                ))}
              </div>
              {historicalExplanation && (
                <div className="historical-explanation">
                  <h3>Why this action was selected</h3>
                  <p>{historicalExplanation.whyThisAction}</p>
                </div>
              )}
            </details>
          )}
        </Card>
      )}
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
            <h2>Current Protection Execution</h2>
          </div>
          {currentExecution && (
            <StatusPill tone={currentExecution.status === "CONFIRMED" ? "good" : "neutral"}>
              {currentExecution.status}
            </StatusPill>
          )}
        </div>
        {actionable ? (
          <ExecutionPanel
            execution={currentExecution}
            canRequest={data.policy.enabled && data.policy.executionMode !== "MONITOR_ONLY"}
            mode={data.policy.executionMode}
            hasActionableCandidate
          />
        ) : (
          <p className="empty-row">No current protection action requires execution.</p>
        )}
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
      {historicalExecution?.status === "CONFIRMED" && (
        <Card className="success-card">
          <div className="success-mark">
            <Icon name="check" />
          </div>
          <div>
            <p className="eyebrow">PREVIOUS PROTECTION SUCCESS</p>
            <h2>
              Health factor {formatNumber(historicalExecution.healthFactorBefore, 4)} →{" "}
              {formatNumber(historicalExecution.healthFactorAfter, 4)}
            </h2>
            <p>
              {historicalExecution.action === "REPAY_DEBT" ? "Repayment" : "Collateral supplied"}:{" "}
              <b>
                {historicalExecution.displayAmount} {historicalExecution.asset}
              </b>
            </p>
            <p>This execution belongs to a previous protection event.</p>
            <small className="execution-timestamp">
              Executed{" "}
              {formatTimestamp(historicalExecution.completedAt ?? historicalExecution.createdAt)}
            </small>
          </div>
          <div className="success-proof">
            <span>
              KeeperHub <b>{historicalExecution.keeperHubExecutionId ? "Verified" : "—"}</b>
            </span>
            {historicalExecution.keeperHubExecutionId && (
              <code>{historicalExecution.keeperHubExecutionId}</code>
            )}
            <span>
              Receipt <b>{historicalExecution.receiptVerified ? "Verified" : "Pending"}</b>
            </span>
            <span>
              Aave event <b>{historicalExecution.aaveEffectVerified ? "Verified" : "Pending"}</b>
            </span>
            {historicalExecution.transactionLink && (
              <a href={historicalExecution.transactionLink} target="_blank" rel="noreferrer">
                View transaction <Icon name="external" />
              </a>
            )}
          </div>
        </Card>
      )}
      {historicalExecution && historicalExecution.status !== "CONFIRMED" && (
        <Card className="historical-execution">
          <div className="section-heading">
            <div>
              <span className="label">PREVIOUS PROTECTION EXECUTION</span>
              <h2>Previous Protection Execution</h2>
              <p className="section-description">
                This execution belongs to a previous protection event.
              </p>
            </div>
            <StatusPill tone="neutral">{historicalExecution.status}</StatusPill>
          </div>
          <p>
            Execution completed:{" "}
            {formatTimestamp(historicalExecution.completedAt ?? historicalExecution.createdAt)}
          </p>
        </Card>
      )}
    </div>
  );
}
