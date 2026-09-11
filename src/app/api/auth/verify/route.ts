import { getPrisma } from "@/lib/db/prisma";
import { checkAuthRateLimit, isValidWalletSignature, normalizeWalletAddress, SESSION_TTL_MS, generateNonce, hashSecret, sessionCookie, sameOrigin } from "@/lib/security/wallet-auth";
import { z } from "zod";
export const runtime = "nodejs";
const schema = z.strictObject({ challengeId: z.string().min(1), walletAddress: z.string(), chainId: z.number().int().positive(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: { code: "CSRF_REJECTED" } }, { status: 403 });
    const input = schema.parse(await request.json()); const walletAddress = normalizeWalletAddress(input.walletAddress);
    if (!checkAuthRateLimit(`verify:${walletAddress}`, 8)) return Response.json({ error: { code: "RATE_LIMITED" } }, { status: 429 });
    const db = getPrisma(); const challenge = await db.walletChallenge.findUnique({ where: { id: input.challengeId } });
    if (!challenge || challenge.walletAddress !== walletAddress || challenge.chainId !== input.chainId) return Response.json({ error: { code: "CHALLENGE_NOT_FOUND" } }, { status: 401 });
    if (challenge.consumedAt) return Response.json({ error: { code: "CHALLENGE_ALREADY_USED" } }, { status: 409 });
    if (challenge.expiresAt <= new Date()) return Response.json({ error: { code: "CHALLENGE_EXPIRED" } }, { status: 401 });
    const valid = await isValidWalletSignature({ walletAddress, message: challenge.message, signature: input.signature as `0x${string}` });
    if (!valid) return Response.json({ error: { code: "INVALID_SIGNATURE" } }, { status: 401 });
    const rawToken = generateNonce(); const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const result = await db.$transaction(async tx => {
      const consumed = await tx.walletChallenge.updateMany({ where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
      if (consumed.count !== 1) throw new Error("CHALLENGE_ALREADY_USED");
      const user = await tx.user.upsert({ where: { walletAddress }, create: { walletAddress }, update: {} });
      await tx.walletChallenge.update({ where: { id: challenge.id }, data: { userId: user.id } });
      const session = await tx.userSession.create({ data: { userId: user.id, walletAddress, chainId: input.chainId, protectedAccountId: user.id, tokenHash: hashSecret(rawToken), expiresAt } });
      return { user, session };
    });
    return Response.json({ userId: result.user.id, walletAddress, chainId: input.chainId, protectedAccountId: result.user.id, expiresAt: expiresAt.toISOString() }, { headers: { "Set-Cookie": sessionCookie(rawToken), "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: { code: error instanceof z.ZodError ? "INVALID_VERIFY_REQUEST" : error instanceof Error && error.message === "CHALLENGE_ALREADY_USED" ? "CHALLENGE_ALREADY_USED" : "VERIFY_FAILED" } }, { status: error instanceof Error && error.message === "CHALLENGE_ALREADY_USED" ? 409 : 400 }); }
}
