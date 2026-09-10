import "dotenv/config";
import { defineConfig } from "prisma/config";
export default defineConfig({ schema: "prisma/schema.prisma", migrations: { path: "prisma/migrations" }, datasource: { url: process.env.DATABASE_URL ?? "postgresql://positionguard:positionguard@localhost:5433/positionguard?schema=public" } });
