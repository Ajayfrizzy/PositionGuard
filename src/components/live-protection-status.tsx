"use client";
import { ArrowLink, Card, StatusPill } from "./ui";
import { Icon } from "./icons";
import { useLiveMonitoring } from "./live-monitoring-context";
import { formatCompactUsd, formatNumber, timeAgo } from "@/lib/product/format";
import { mapMonitoringPresentation, type WorkerStatus } from "@/lib/product/status";
import type { ProductPolicy } from "@/lib/product/models";

export function LiveProtectionStatus({
  policy,
  fundingStatus,
  initialWorkerStatus,
  initialLastCheck,
}: {
  policy: ProductPolicy;
  fundingStatus: string;
  initialWorkerStatus: WorkerStatus;
  initialLastCheck: string | null;
}) {
  const live = useLiveMonitoring();
  const policyEnabled = live?.loaded ? live.policyEnabled : policy.enabled;
  const workerStatus = live?.loaded ? live.workerStatus : initialWorkerStatus;
  const lastCheck = live?.loaded ? live.lastCheck : initialLastCheck;
  const monitoring = mapMonitoringPresentation({ policyEnabled, workerStatus });
  const monitoringLabel = live?.unavailable ? "UNAVAILABLE" : monitoring.dashboardLabel;
  const workerLabel = live?.unavailable ? "UNKNOWN" : monitoring.state.replaceAll("_", " ");

  return (
    <Card className="protection-card">
      <div className="card-heading">
        <div className="round-icon">
          <Icon name="shield" />
        </div>
        <div>
          <span className="label">Protection status</span>
          <h2>{policyEnabled ? "Protection enabled" : "Protection disabled"}</h2>
        </div>
        <StatusPill
          tone={
            policyEnabled ? (monitoring.active && !live?.unavailable ? "good" : "warn") : "neutral"
          }
        >
          {policyEnabled ? "ENABLED" : "DISABLED"}
        </StatusPill>
      </div>
      <div className="protection-list">
        <div>
          <span>Protection mode</span>
          <b>
            {policy.executionMode === "MONITOR_ONLY"
              ? "MONITOR ONLY"
              : policy.executionMode === "REQUIRE_APPROVAL"
                ? "ASK BEFORE ACTING"
                : "PROTECT AUTOMATICALLY"}
          </b>
        </div>
        <div>
          <span>Protection monitoring</span>
          <b>{monitoringLabel}</b>
        </div>
        <div>
          <span>Worker status</span>
          <b>{workerLabel}</b>
        </div>
        <div>
          <span>Last check</span>
          <b>{lastCheck ? timeAgo(lastCheck) : "Never"}</b>
        </div>
        <div>
          <span>Funding readiness</span>
          <b>{fundingStatus.replaceAll("_", " ")}</b>
        </div>
        <div>
          <span>Configured target</span>
          <b>{formatNumber(policy.targetHealthFactor, 2)} HF</b>
        </div>
        <div>
          <span>Automatic limit</span>
          <b>{formatCompactUsd(policy.maxAutonomousAmountUsd)}</b>
        </div>
      </div>
      <ArrowLink href="/settings">View protection policy</ArrowLink>
    </Card>
  );
}
