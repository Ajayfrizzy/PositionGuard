import { getPrisma } from "@/lib/db/prisma";
import {
  buildWalletChallenge,
  checkAuthRateLimit,
  CHALLENGE_TTL_MS,
  generateNonce,
  hashSecret,
  normalizeWalletAddress,
  requestOrigin,
  sameOrigin,
} from "@/lib/security/wallet-auth";
import { z } from "zod";
import { getChain } from "@/lib/chains/config";
export const runtime = "nodejs";
const schema = z.strictObject({ walletAddress: z.string(), chainId: z.number().int().positive() });

function errorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request))
      return Response.json({ error: { code: "CSRF_REJECTED" } }, { status: 403 });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkAuthRateLimit(`challenge:${ip}`))
      return Response.json({ error: { code: "RATE_LIMITED" } }, { status: 429 });
    const input = schema.parse(await request.json());
    getChain(input.chainId);
    const walletAddress = normalizeWalletAddress(input.walletAddress);
    const nonce = generateNonce();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
    const origin = requestOrigin(request);
    const url = new URL(origin);
    const message = buildWalletChallenge({
      domain: url.host,
      uri: origin,
      walletAddress,
      chainId: input.chainId,
      nonce,
      issuedAt,
      expiresAt,
    });
    const row = await getPrisma().walletChallenge.create({
      data: {
        walletAddress,
        chainId: input.chainId,
        nonceHash: hashSecret(nonce),
        message,
        expiresAt,
      },
    });
    return Response.json(
      { challengeId: row.id, message, expiresAt: expiresAt.toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: { code: "INVALID_CHALLENGE_REQUEST", message: "The wallet request is invalid." } },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "UNSUPPORTED_CHAIN") {
      return Response.json(
        {
          error: {
            code: "UNSUPPORTED_CHAIN",
            message: "Switch your wallet to Base Sepolia or Base mainnet and try again.",
          },
        },
        { status: 422 },
      );
    }
    if (error instanceof Error && /address/i.test(error.message)) {
      return Response.json(
        { error: { code: "INVALID_WALLET_ADDRESS", message: "The selected wallet is invalid." } },
        { status: 400 },
      );
    }

    console.error("AUTH_CHALLENGE_FAILED", { code: errorCode(error) ?? "UNKNOWN" });
    return Response.json(
      {
        error: {
          code: "AUTH_SERVICE_UNAVAILABLE",
          message: "Wallet sign-in is temporarily unavailable. Check the database connection.",
        },
      },
      { status: 503 },
    );
  }
}
