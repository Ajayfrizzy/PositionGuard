import "dotenv/config";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
if (!process.env.DATABASE_URL) {
  console.error(JSON.stringify({ ok: false, code: "DATABASE_URL_REQUIRED" }));
  process.exitCode = 1;
} else {
  // Capture Prisma diagnostics; raw output can include database host/user details.
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url)),
      "migrate",
      "deploy",
    ],
    { env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, 45_000);
  child.on("error", () => {
    clearTimeout(timer);
    console.error(JSON.stringify({ ok: false, code: "MIGRATION_PROCESS_FAILED" }));
    process.exitCode = 1;
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    console.log(
      JSON.stringify({
        ok: code === 0,
        code:
          code === 0
            ? "MIGRATIONS_APPLIED_OR_CURRENT"
            : (output.match(/\b(?:P\d{4}|ENOTFOUND|ECONNREFUSED|ETIMEDOUT)\b/)?.[0] ??
              (timedOut
                ? "MIGRATION_TIMEOUT"
                : /certificate|SSL/i.test(output)
                  ? "MIGRATION_TLS_ERROR"
                  : /download|binaries.prisma/i.test(output)
                    ? "MIGRATION_ENGINE_UNAVAILABLE"
                    : "MIGRATION_FAILED")),
      }),
    );
    if (code !== 0) process.exitCode = 1;
  });
}
