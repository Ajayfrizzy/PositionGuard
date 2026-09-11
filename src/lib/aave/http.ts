import { z } from "zod";
import { authenticateOperator } from "../security/operator-auth";
import { positionQuerySchema } from "../security/position-input";
import { policySchema } from "../policies/validator";
import { AaveReadError } from "./errors";
import { getAavePosition } from "./service";
import { analyzePosition, previewPolicy, type PositionAnalysis } from "./analysis";
import type { AavePosition } from "./types";
const bodySchema = positionQuerySchema.extend({ policy: policySchema });
const response = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
interface Dependencies {
  getPosition: typeof getAavePosition;
  persist: (position: AavePosition, analysis: PositionAnalysis) => Promise<string>;
}
export async function handlePositionRequest(
  request: Request,
  dependencies: Dependencies,
): Promise<Response> {
  const auth = authenticateOperator(request);
  if (auth !== "authorized")
    return response(
      { error: { code: auth === "unconfigured" ? "AUTH_NOT_CONFIGURED" : "UNAUTHORIZED" } },
      auth === "unconfigured" ? 503 : 401,
    );
  try {
    let input: z.infer<typeof bodySchema>;
    if (request.method === "GET") {
      const params = Object.fromEntries(new URL(request.url).searchParams);
      input = { ...positionQuerySchema.parse(params), policy: previewPolicy };
    } else if (request.method === "POST") {
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        return response({ error: { code: "INVALID_CONTENT_TYPE" } }, 415);
      const body = await request.text();
      if (body.length > 8192) return response({ error: { code: "BODY_TOO_LARGE" } }, 413);
      input = bodySchema.parse(JSON.parse(body));
    } else return response({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
    const position = await dependencies.getPosition({
      walletAddress: input.address,
      chainId: input.chainId,
    });
    const analysis = analyzePosition(position, input.policy);
    let snapshotId: string | null = null;
    if (request.method === "POST") {
      try {
        snapshotId = await dependencies.persist(position, analysis);
      } catch {
        return response(
          {
            error: {
              code: "SNAPSHOT_PERSISTENCE_FAILED",
              message:
                "Position read succeeded but the snapshot was not saved. Check DATABASE_URL and migrations.",
            },
          },
          503,
        );
      }
    }
    return response({ position, analysis, snapshotId });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return response(
        {
          error: {
            code: "INVALID_INPUT",
            message: "Provide a valid address, supported chain and valid analysis policy.",
          },
        },
        400,
      );
    if (error instanceof AaveReadError)
      return response(
        { error: { code: error.code } },
        ["INVALID_ADDRESS", "UNSUPPORTED_CHAIN"].includes(error.code) ? 400 : 503,
      );
    return response({ error: { code: "POSITION_READ_FAILED" } }, 503);
  }
}
export const livePositionReader = getAavePosition;
