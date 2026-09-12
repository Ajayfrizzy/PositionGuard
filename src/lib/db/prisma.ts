import "server-only";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseConnectionString } from "./connection";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export function getPrisma(): PrismaClient {
  if (globalDb.prisma) return globalDb.prisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const allowSelfSignedCertificate =
    process.env.NODE_ENV !== "production" && process.env.DATABASE_TLS_ALLOW_SELF_SIGNED === "true";
  const adapterConnectionString = databaseConnectionString(
    connectionString,
    allowSelfSignedCertificate,
  );
  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: adapterConnectionString,
      connectionTimeoutMillis: 10000,
      query_timeout: 10000,
    }),
  });
  globalDb.prisma = client;
  return client;
}
