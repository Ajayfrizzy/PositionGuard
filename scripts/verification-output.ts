import { AaveReadError } from "../src/lib/aave/errors";
import { KeeperHubReadError } from "../src/lib/keeperhub/types";
import { ZodError } from "zod";
export async function verificationOutput(check: string, action: () => Promise<unknown>) {
  try { console.log(JSON.stringify({ check, ok: true, result: await action() }, null, 2)); }
  catch (error) {
    const code = error instanceof AaveReadError || error instanceof KeeperHubReadError ? error.code : error instanceof ZodError ? "VALIDATION_FAILED" : "VERIFICATION_FAILED";
    console.error(JSON.stringify({ check, ok: false, code })); process.exitCode = 1;
  }
}
