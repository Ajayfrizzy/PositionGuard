type RiskLevel = "SAFE" | "WATCH" | "HIGH" | "CRITICAL";

export interface NotificationState {
  riskLevel: string | null;
  blockerReason: string | null;
  actionIdentity: string | null;
  action?: NotificationAction | null;
  riskEpisodeId?: string | null;
  approvalPending: boolean;
}

const riskRank: Record<RiskLevel, number> = { SAFE: 0, WATCH: 1, HIGH: 2, CRITICAL: 3 };

export const shouldNotifyRisk = (previous: NotificationState, currentRisk: RiskLevel) =>
  currentRisk !== "SAFE" &&
  (previous.riskLevel === null ||
    riskRank[currentRisk] > riskRank[(previous.riskLevel as RiskLevel) ?? "SAFE"]);

export const shouldNotifyRecovery = (previous: NotificationState, currentRisk: RiskLevel) =>
  currentRisk === "SAFE" && previous.riskLevel !== null && previous.riskLevel !== "SAFE";

export const shouldNotifyBlocker = (previous: NotificationState, currentReason: string) =>
  previous.blockerReason !== currentReason;

export function normalizeNotificationAmount(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return trimmed.toLowerCase();
  const [integer = "0", fraction = ""] = trimmed.split(".");
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger;
}

export function actionNotificationIdentity(action: {
  type: string;
  asset: string;
  amount: string;
}) {
  return `${action.type}:${action.asset.toLowerCase()}:${normalizeNotificationAmount(action.amount)}`;
}

export type NotificationAction = {
  type: string;
  asset: string;
  amount: string;
  policyState?: string;
};

export type ActionNotificationChange = "UNCHANGED" | "SELECTED" | "UPDATED";

/** Notification-only tolerance; exact MEI values remain in decisions and audit records. */
export function classifyActionNotificationChange(
  previous: NotificationAction | null | undefined,
  current: NotificationAction | null,
): ActionNotificationChange {
  if (!current) return "UNCHANGED";
  if (!previous) return "SELECTED";
  if (
    previous.type !== current.type ||
    previous.asset.toLowerCase() !== current.asset.toLowerCase() ||
    (previous.policyState ?? "") !== (current.policyState ?? "")
  )
    return "UPDATED";

  const priorAmount = Number(previous.amount);
  const nextAmount = Number(current.amount);
  if (!Number.isFinite(priorAmount) || !Number.isFinite(nextAmount))
    return normalizeNotificationAmount(previous.amount) ===
      normalizeNotificationAmount(current.amount)
      ? "UNCHANGED"
      : "UPDATED";
  const absoluteChange = Math.abs(nextAmount - priorAmount);
  const relativeChange = absoluteChange / Math.max(Math.abs(priorAmount), Number.EPSILON);
  // Both guards must be crossed: at least one millionth of a token and at least 1%.
  return absoluteChange >= 0.000001 && relativeChange >= 0.01 ? "UPDATED" : "UNCHANGED";
}
