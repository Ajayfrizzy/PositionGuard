import { z } from "zod";
import { walletSchema } from "../security/position-input";
import { chains } from "../chains/config";
const httpUrl = z.url({ protocol: /^https?$/ });
const databaseUrl = z.url({ protocol: /^postgres(?:ql)?$/ });
export function verifyEnvironment(env: Readonly<Record<string, string | undefined>> = process.env) {
  const schemas = {
    BASE_SEPOLIA_RPC_URL: httpUrl,
    BASE_RPC_URL: httpUrl,
    POSITIONGUARD_DEFAULT_CHAIN_ID: z.coerce
      .number()
      .int()
      .refine((v) => Object.hasOwn(chains, v)),
    DATABASE_URL: databaseUrl,
    POSITIONGUARD_DEV_TOKEN: z.string().min(32),
    KEEPERHUB_API_KEY: z.string().regex(/^kh_[A-Za-z0-9_-]{5,}$/),
    AAVE_WALLET_ADDRESS: walletSchema,
  };
  return Object.fromEntries(
    Object.entries(schemas).map(([key, schema]) => [
      key,
      !env[key]?.trim()
        ? "MISSING"
        : schema.safeParse(env[key]).success
          ? "VALID_FORMAT"
          : "INVALID_FORMAT",
    ]),
  );
}
