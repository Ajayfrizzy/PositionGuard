import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getAddress, verifyMessage } from "viem";
import { getPrisma } from "../db/prisma";

export const SESSION_COOKIE = "positionguard_session";
export const CHALLENGE_TTL_MS = 5 * 60_000;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;

export type WalletSession = {
  id: string;
  userId: string;
  walletAddress: string;
  chainId: number;
  protectedAccountId: string;
  expiresAt: Date;
};

export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const generateNonce = () => randomBytes(32).toString("base64url");
export function normalizeWalletAddress(value: string) {
  return getAddress(value).toLowerCase();
}
export function buildWalletChallenge(input: {
  domain: string;
  uri: string;
  walletAddress: string;
  chainId: number;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}) {
  return `${input.domain} wants you to sign in with your Ethereum account:\n${getAddress(input.walletAddress)}\n\nVerify wallet ownership to protect your Aave position. This does not authorize a transaction or move funds.\n\nURI: ${input.uri}\nVersion: 1\nChain ID: ${input.chainId}\nNonce: ${input.nonce}\nIssued At: ${input.issuedAt.toISOString()}\nExpiration Time: ${input.expiresAt.toISOString()}`;
}
export async function isValidWalletSignature(input: {
  walletAddress: string;
  message: string;
  signature: `0x${string}`;
}) {
  try {
    return await verifyMessage({
      address: getAddress(input.walletAddress),
      message: input.message,
      signature: input.signature,
    });
  } catch {
    return false;
  }
}
export function sessionCookie(token: string, maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export const clearSessionCookie = () =>
  `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
export function cookieValue(request: Request, name: string) {
  const pair = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}
export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host")?.trim() || url.host;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : url.protocol.slice(0, -1);

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return url.origin;
  }
}
export function sameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === requestOrigin(request);
  } catch {
    return false;
  }
}
export async function getRequestSession(request: Request): Promise<WalletSession | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || token.length > 256) return null;
  const row = await getPrisma().userSession.findUnique({ where: { tokenHash: hashSecret(token) } });
  if (!row || row.revokedAt || row.expiresAt <= new Date()) return null;
  return row;
}
export async function requireRequestSession(request: Request) {
  if (!sameOrigin(request) && request.method !== "GET" && request.method !== "HEAD")
    return { error: Response.json({ error: { code: "CSRF_REJECTED" } }, { status: 403 }) } as const;
  const session = await getRequestSession(request);
  if (!session)
    return {
      error: Response.json(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "Connect and verify your wallet to continue.",
          },
        },
        { status: 401 },
      ),
    } as const;
  return { session } as const;
}

const attempts = new Map<string, { count: number; resetAt: number }>();
export function checkAuthRateLimit(key: string, limit = 10, windowMs = 60_000, now = Date.now()) {
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
