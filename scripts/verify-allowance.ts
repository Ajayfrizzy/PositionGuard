import "dotenv/config";
import { getDefaultChain } from "../src/lib/chains/config";
import { getAaveAllowance } from "../src/lib/aave/allowance";
import { verificationOutput } from "./verification-output";
await verificationOutput("aave-allowance", () => getAaveAllowance({ chainId: getDefaultChain().chainId,
  sender: process.env.KEEPERHUB_EXECUTION_WALLET, assetSymbol: process.argv[2], amount: process.argv[3] }));
