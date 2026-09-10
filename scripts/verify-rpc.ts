import "dotenv/config";
import { verifyBaseRpc } from "../src/lib/verification/rpc";
import { verificationOutput } from "./verification-output";
await verificationOutput("base-rpc", () => verifyBaseRpc());
