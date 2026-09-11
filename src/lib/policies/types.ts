export interface ProtectionPolicy {
  executionMode?: "MONITOR_ONLY" | "REQUIRE_APPROVAL" | "AUTONOMOUS";
  targetHealthFactor: string;
  warningHealthFactor: string;
  emergencyHealthFactor: string;
  maxAutonomousAmountUsd: string;
  maxDailyAutonomousAmountUsd: string;
  approvalRequiredAboveUsd: string;
  allowRepay: boolean;
  allowAddCollateral: boolean;
  interventionCooldownMinutes: number;
  enabled: boolean;
}
export interface PolicyContext {
  dailyAutonomousSpendUsd: string;
  nowMs: number;
  lastAutonomousExecutionAtMs: number | null;
}
