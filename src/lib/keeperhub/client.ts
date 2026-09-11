import "server-only";
import { KeeperHubReadError } from "./types";
export type KeeperHubReadPath =
  "/api/chains" | "/api/user" | "/api/user/wallet" | `/api/keys?page=${number}&limit=50`;
export interface KeeperHubReader {
  get(path: KeeperHubReadPath): Promise<unknown>;
}
export function keeperHubConfiguration() {
  const apiKey = process.env.KEEPERHUB_API_KEY;
  if (!apiKey || !/^kh_[A-Za-z0-9_-]{5,}$/.test(apiKey))
    throw new KeeperHubReadError("KEEPERHUB_API_KEY_MISSING_OR_INVALID");
  let url: URL;
  try {
    url = new URL(process.env.KEEPERHUB_BASE_URL || "https://app.keeperhub.com");
  } catch {
    throw new KeeperHubReadError("KEEPERHUB_BASE_URL_INVALID");
  }
  if (
    url.origin !== "https://app.keeperhub.com" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new KeeperHubReadError("KEEPERHUB_BASE_URL_NOT_ALLOWED");
  return { apiKey, baseUrl: url.origin };
}
export function createKeeperHubReader(): KeeperHubReader {
  const { apiKey, baseUrl } = keeperHubConfiguration();
  return {
    get: async (path) => {
      if (!/^\/api\/(chains|user|user\/wallet|keys\?page=[1-9]\d*&limit=50)$/.test(path))
        throw new KeeperHubReadError("READ_PATH_NOT_ALLOWED");
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok)
          throw new KeeperHubReadError(
            response.status === 401
              ? "KEEPERHUB_UNAUTHENTICATED"
              : response.status === 403
                ? "KEEPERHUB_FORBIDDEN"
                : response.status === 429
                  ? "KEEPERHUB_RATE_LIMITED"
                  : "KEEPERHUB_HTTP_ERROR",
            response.status,
          );
        return await response.json();
      } catch (error) {
        if (error instanceof KeeperHubReadError) throw error;
        throw new KeeperHubReadError("KEEPERHUB_UNAVAILABLE_OR_INVALID_RESPONSE");
      }
    },
  };
}
