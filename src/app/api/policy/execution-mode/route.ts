import { requireRequestSession } from "@/lib/security/wallet-auth";
import { getPrisma } from "@/lib/db/prisma";
import { z } from "zod";
import { revalidateTag } from "next/cache";
export const runtime = "nodejs";
const schema = z.strictObject({
  chainId: z.number().int().positive(),
  executionMode: z.enum(["MONITOR_ONLY", "REQUIRE_APPROVAL", "AUTONOMOUS"]),
  confirmAutonomous: z.boolean().optional(),
});
export async function PATCH(request: Request) {
  const auth = await requireRequestSession(request);
  if ("error" in auth) return auth.error;
  try {
    const input = schema.parse(await request.json());
    if (input.executionMode === "AUTONOMOUS" && input.confirmAutonomous !== true)
      return Response.json(
        { error: { code: "AUTONOMOUS_CONFIRMATION_REQUIRED" } },
        { status: 409 },
      );
    const db = getPrisma();
    const policy = await db.protectionPolicy.update({
      where: {
        userId_chainId: { userId: auth.session.protectedAccountId, chainId: input.chainId },
      },
      data: { executionMode: input.executionMode },
    });
    await db.auditEvent.create({
      data: {
        userId: auth.session.protectedAccountId,
        type: "EXECUTION_MODE_UPDATED",
        severity: input.executionMode === "AUTONOMOUS" ? "WARNING" : "INFO",
        message: `Protection execution mode changed to ${input.executionMode}.`,
        metadata: { policyId: policy.id, chainId: input.chainId },
      },
    });
    revalidateTag("product-data", { expire: 0 });
    return Response.json({ ok: true, executionMode: policy.executionMode });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: error instanceof z.ZodError ? "INVALID_REQUEST" : "EXECUTION_MODE_UPDATE_FAILED",
        },
      },
      { status: error instanceof z.ZodError ? 400 : 503 },
    );
  }
}
