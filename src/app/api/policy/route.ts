import { requireRequestSession } from "@/lib/security/wallet-auth";
import { policySchema } from "@/lib/policies/validator";
import { getPrisma } from "@/lib/db/prisma";
import { getChain } from "@/lib/chains/config";
import { z } from "zod";
export const runtime = "nodejs";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function PUT(request: Request) {
  const auth = await requireRequestSession(request); if ("error" in auth) return auth.error;
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: { code: "INVALID_CONTENT_TYPE" } }, 415);
    const text = await request.text(); if (text.length > 8192) return json({ error: { code: "BODY_TOO_LARGE" } }, 413);
    const raw = JSON.parse(text) as Record<string, unknown>; const { confirmAutonomous, ...policyInput } = raw; const policy = policySchema.parse(policyInput); if (policy.executionMode === "AUTONOMOUS" && confirmAutonomous !== true) return json({ error: { code: "AUTONOMOUS_CONFIRMATION_REQUIRED", message: "Explicit confirmation is required before autonomous protection can be enabled." } }, 409); const db = getPrisma(); const chain = getChain(auth.session.chainId); const user = await db.user.findUnique({ where: { id: auth.session.protectedAccountId } });
    if (!user) return json({ error: { code: "PROTECTED_WALLET_NOT_FOUND", message: "Capture the configured protected wallet before saving a policy." } }, 404);
    await db.protectionPolicy.upsert({ where: { userId_chainId: { userId: user.id, chainId: chain.chainId } }, create: { userId: user.id, chainId: chain.chainId, ...policy }, update: policy });
    await db.auditEvent.create({ data: { userId: user.id, type: "POLICY_UPDATED", severity: "INFO", message: "Protection policy updated and validated.", metadata: { chainId: chain.chainId, enabled: policy.enabled } } });
    return json({ ok: true });
  } catch (error) { if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "INVALID_POLICY", message: "Policy is invalid. Require target > warning > emergency > 1 and valid limits." } }, 400); return json({ error: { code: "POLICY_UPDATE_FAILED", message: "The policy could not be saved." } }, 503); }
}
