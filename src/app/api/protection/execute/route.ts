import { authenticateOperator } from "@/lib/security/operator-auth";
import { requireRequestSession } from "@/lib/security/wallet-auth";
import { executeProtection } from "@/lib/execution/orchestrator";
import { ProtectionExecutionError } from "@/lib/execution/types";
import { parseProtectionExecutionRequest } from "@/lib/protection/server-request";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 60;
const reply = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const operator = authenticateOperator(request);
  const walletAuth = operator === "authorized" ? null : await requireRequestSession(request);
  if (walletAuth && "error" in walletAuth) return walletAuth.error;
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return reply({ error: { code: "INVALID_CONTENT_TYPE" } }, 415);
    const text = await request.text();
    if (text.length > 128) return reply({ error: { code: "BODY_TOO_LARGE" } }, 413);
    const input = parseProtectionExecutionRequest(JSON.parse(text));
    if (input.mode === "broadcast" && operator !== "authorized")
      return reply(
        {
          error: {
            code: "BROADCAST_REQUIRES_OPERATOR_AUTHORIZATION",
            message: "User sessions may request preparation and simulation only.",
          },
        },
        403,
      );
    const session = walletAuth && "session" in walletAuth ? walletAuth.session : null;
    const result = await executeProtection({
      mode: input.mode,
      walletAddress: session?.walletAddress,
      chainId: session?.chainId,
      broadcastSecret:
        input.mode === "broadcast"
          ? request.headers.get("x-positionguard-broadcast-authorization")
          : null,
    });
    return reply(result);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return reply(
        {
          error: {
            code: "INVALID_REQUEST",
            message:
              "Only simulation or broadcast mode may be requested. Amount, asset, target, calldata, ABI, token, and beneficiary are forbidden.",
          },
        },
        400,
      );
    if (error instanceof ProtectionExecutionError)
      return reply(
        { error: { code: error.code, stage: error.stage, details: error.details } },
        409,
      );
    const code = error instanceof Error ? error.message : "PROTECTION_EXECUTION_FAILED";
    return reply(
      {
        error: {
          code,
          message: "Protection stopped safely before an unverified action could proceed.",
        },
      },
      code === "NO_CANONICAL_INTERVENTION_READY" ? 409 : 503,
    );
  }
}
