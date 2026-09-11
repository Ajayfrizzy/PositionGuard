import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
function equal(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export function authorizeBroadcast(input: {
  presentedSecret: string | null | undefined;
  effectFingerprint: string;
}) {
  const configured = process.env.POSITIONGUARD_BROADCAST_TOKEN;
  if (
    !configured ||
    configured.length < 32 ||
    !input.presentedSecret ||
    !equal(configured, input.presentedSecret)
  )
    return null;
  return Object.freeze({
    approved: true as const,
    effectFingerprint: input.effectFingerprint,
    authorizedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  });
}
export function requireBroadcastAuthorization(
  value: ReturnType<typeof authorizeBroadcast>,
  fingerprint: string,
) {
  return Boolean(
    value?.approved && value.effectFingerprint === fingerprint && value.expiresAt >= Date.now(),
  );
}
