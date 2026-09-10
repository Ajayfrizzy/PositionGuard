import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { getPrisma } from "../src/lib/db/prisma";
const tables = ["User", "ProtectionPolicy", "PositionSnapshot", "ProtectionDecision", "CandidateAction", "Execution", "AuditEvent", "_prisma_migrations"];
const id = `positionguard_verification_${randomUUID()}`;
let db: ReturnType<typeof getPrisma> | undefined;
try {
  db = getPrisma();
  const found = await db.$queryRaw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`;
  const missingTables = tables.filter(t => !found.some(r => r.table_name === t));
  if (missingTables.length) { console.error(JSON.stringify({ ok: false, code: "MIGRATIONS_NOT_APPLIED", missingTables })); process.exitCode = 1; }
  else {
    await db.$transaction(async tx => {
      const row = await tx.user.create({ data: { id, walletAddress: `0x${randomBytes(20).toString("hex")}` } });
      const read = await tx.user.findUniqueOrThrow({ where: { id } });
      if (read.walletAddress !== row.walletAddress) throw new Error("READ_MISMATCH");
      await tx.user.delete({ where: { id } });
      if (await tx.user.findUnique({ where: { id } })) throw new Error("DELETE_FAILED");
    }, { timeout: 10000 });
    console.log(JSON.stringify({ ok: true, tablesVerified: tables, createReadDelete: "passed", serverPrismaFactory: "verified", verificationRecordRetained: false }));
  }
} catch { console.error(JSON.stringify({ ok: false, code: "DATABASE_VERIFICATION_FAILED", hint: "Check DATABASE_URL connectivity, TLS and applied migrations. Credentials are not logged." })); process.exitCode = 1; }
finally { await db?.$disconnect(); }
