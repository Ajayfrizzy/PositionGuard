import "dotenv/config";
import { verifyEnvironment } from "../src/lib/verification/environment";
const result = verifyEnvironment();
console.log(JSON.stringify(result, null, 2));
if (Object.values(result).some(v => v !== "VALID_FORMAT")) process.exitCode = 1;
