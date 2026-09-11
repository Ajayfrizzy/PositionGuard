import { getPrisma } from "@/lib/db/prisma";
import { buildWalletChallenge, checkAuthRateLimit, CHALLENGE_TTL_MS, generateNonce, hashSecret, normalizeWalletAddress, sameOrigin } from "@/lib/security/wallet-auth";
import { z } from "zod";
import { getChain } from "@/lib/chains/config";
export const runtime = "nodejs";
const schema = z.strictObject({ walletAddress: z.string(), chainId: z.number().int().positive() });
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: { code: "CSRF_REJECTED" } }, { status: 403 });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkAuthRateLimit(`challenge:${ip}`)) return Response.json({ error: { code: "RATE_LIMITED" } }, { status: 429 });
    const input = schema.parse(await request.json()); getChain(input.chainId);
    const walletAddress = normalizeWalletAddress(input.walletAddress); const nonce = generateNonce(); const issuedAt = new Date(); const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS); const url = new URL(request.url);
    const message = buildWalletChallenge({ domain: url.host, uri: url.origin, walletAddress, chainId: input.chainId, nonce, issuedAt, expiresAt });
    const row = await getPrisma().walletChallenge.create({ data: { walletAddress, chainId: input.chainId, nonceHash: hashSecret(nonce), message, expiresAt } });
    return Response.json({ challengeId: row.id, message, expiresAt: expiresAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: { code: "INVALID_CHALLENGE_REQUEST" } }, { status: 400 }); }
}
