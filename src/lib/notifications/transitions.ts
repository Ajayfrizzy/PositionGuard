type RiskLevel = "SAFE" | "WATCH" | "HIGH" | "CRITICAL";

export interface NotificationState {
  riskLevel: string | null;
  blockerReason: string | null;
  actionIdentity: string | null;
  approvalPending: boolean;
}

export const shouldNotifyRisk = (previous: NotificationState, currentRisk: RiskLevel) =>
  currentRisk !== "SAFE" && previous.riskLevel !== currentRisk;

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
