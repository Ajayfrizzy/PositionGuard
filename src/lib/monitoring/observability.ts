type AutonomousLogEvent =
  | "autonomous-evaluation"
  | "autonomous-revalidation"
  | "autonomous-skipped"
  | "autonomous-simulation"
  | "autonomous-broadcast"
  | "autonomous-confirmed"
  | "autonomous-failed";

export function logAutonomousEvent(event: AutonomousLogEvent, metadata: Record<string, unknown>) {
  // One JSON object per line keeps production logs grep-friendly and machine parseable.
  console.log(JSON.stringify({ event, ...metadata }));
}

export const safeWallet = (walletAddress: string) =>
  walletAddress.length > 10
    ? `${walletAddress.slice(0, 6).toLowerCase()}…${walletAddress.slice(-4).toLowerCase()}`
    : walletAddress.toLowerCase();
