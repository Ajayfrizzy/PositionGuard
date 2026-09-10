import "dotenv/config";
import { verifyKeeperHub } from "../src/lib/keeperhub/verification";
import { verificationOutput } from "./verification-output";
await verificationOutput("keeperhub-read-only", () => verifyKeeperHub());
