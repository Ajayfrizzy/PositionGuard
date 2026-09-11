import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

interface ScenarioGrant {
  protectedAccountId: string;
  chainId: number;
  expiresAt: number;
  purpose: "stress-analysis";
}
const secret = () => {
  const value = process.env.POSITIONGUARD_DEV_TOKEN;
  if (!value || value.length < 32) throw new Error("SCENARIO_AUTH_NOT_CONFIGURED");
  return value;
};
const sign = (payload: string) =>
  createHmac("sha256", secret()).update(payload).digest("base64url");

export function createScenarioAuthorization(input: {
  protectedAccountId: string;
  chainId: number;
  nowMs?: number;
}) {
  const grant: ScenarioGrant = {
    protectedAccountId: input.protectedAccountId,
    chainId: input.chainId,
    expiresAt: (input.nowMs ?? Date.now()) + 15 * 60_000,
    purpose: "stress-analysis",
  };
  const payload = Buffer.from(JSON.stringify(grant)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyScenarioAuthorization(
  token: string,
  nowMs = Date.now(),
): ScenarioGrant | null {
  try {
    const [payload, presented, extra] = token.split(".");
    if (!payload || !presented || extra) return null;
    const expected = sign(payload),
      a = Buffer.from(presented),
      b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ScenarioGrant;
    if (
      grant.purpose !== "stress-analysis" ||
      !grant.protectedAccountId ||
      !Number.isInteger(grant.chainId) ||
      grant.expiresAt < nowMs
    )
      return null;
    return grant;
  } catch {
    return null;
  }
}
