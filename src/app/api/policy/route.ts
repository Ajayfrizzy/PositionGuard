import { authenticateOperator } from "@/lib/security/operator-auth";
import { policySchema } from "@/lib/policies/validator";
import { getPrisma } from "@/lib/db/prisma";
import { getDefaultChain } from "@/lib/chains/config";
import { z } from "zod";
export const runtime = "nodejs";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function PUT(request: Request) {
  const auth = authenticateOperator(request); if (auth !== "authorized") return json({ error: { code: auth === "unconfigured" ? "AUTH_NOT_CONFIGURED" : "UNAUTHORIZED", message: auth === "unconfigured" ? "Settings authorization is unavailable." : "Settings authorization was not accepted." } }, auth === "unconfigured" ? 503 : 401);
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: { code: "INVALID_CONTENT_TYPE" } }, 415);
    const text = await request.text(); if (text.length > 8192) return json({ error: { code: "BODY_TOO_LARGE" } }, 413);
    const policy = policySchema.parse(JSON.parse(text)); const db = getPrisma(); const chain = getDefaultChain(); const configured = process.env.AAVE_WALLET_ADDRESS?.toLowerCase(); const user = configured ? await db.user.findUnique({ where: { walletAddress: configured } }) : await db.user.findFirst({ orderBy: { createdAt: "desc" } });
    if (!user) return json({ error: { code: "PROTECTED_WALLET_NOT_FOUND", message: "Capture the configured protected wallet before saving a policy." } }, 404);
    await db.protectionPolicy.upsert({ where: { userId_chainId: { userId: user.id, chainId: chain.chainId } }, create: { userId: user.id, chainId: chain.chainId, ...policy }, update: policy });
    await db.auditEvent.create({ data: { userId: user.id, type: "POLICY_UPDATED", severity: "INFO", message: "Protection policy updated and validated.", metadata: { chainId: chain.chainId, enabled: policy.enabled } } });
    return json({ ok: true });
  } catch (error) { if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "INVALID_POLICY", message: "Policy is invalid. Require target > warning > emergency > 1 and valid limits." } }, 400); return json({ error: { code: "POLICY_UPDATE_FAILED", message: "The policy could not be saved." } }, 503); }
}
