import { createHash, timingSafeEqual } from "node:crypto";
export function authenticateOperator(request: Request): "authorized" | "unconfigured" | "unauthorized" {
  const token = process.env.POSITIONGUARD_DEV_TOKEN;
  if (!token || token.length < 32) return "unconfigured";
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ") || header.length > 1024) return "unauthorized";
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(header.slice(7)), hash(token)) ? "authorized" : "unauthorized";
}
