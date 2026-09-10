import "dotenv/config";
import { getAavePosition } from "../src/lib/aave/service";
import { getDefaultChain, getChain } from "../src/lib/chains/config";
import { verificationOutput } from "./verification-output";
const walletAddress = process.argv[2] || process.env.AAVE_WALLET_ADDRESS;
if (!walletAddress) { console.error(JSON.stringify({ check: "aave-position", ok: false, code: "AAVE_WALLET_ADDRESS_REQUIRED", usage: "npm run verify:aave -- <walletAddress> (or set AAVE_WALLET_ADDRESS)" })); process.exitCode = 1; }
else await verificationOutput("aave-position", async () => {
  const requestedChainId = process.argv[3] ? Number(process.argv[3]) : getDefaultChain().chainId;
  const chain = getChain(requestedChainId);
  const p = await getAavePosition({ walletAddress, chainId: chain.chainId });
  return { network: p.chain, wallet: p.wallet, blockNumber: p.blockNumber, blockHash: p.blockHash, fetchedAt: p.fetchedAt,
    healthFactor: p.account.healthFactor, totalCollateralUsd: p.account.totalCollateralUsd, totalDebtUsd: p.account.totalDebtUsd,
    availableBorrowsUsd: p.account.availableBorrowsUsd, liquidationThreshold: p.account.currentLiquidationThreshold,
    suppliedReserves: p.reserves.filter(r => BigInt(r.raw.suppliedBalance) > 0n),
    borrowedReserves: p.reserves.filter(r => BigInt(r.raw.variableDebt) + BigInt(r.raw.stableDebt) > 0n),
    protectionBalances: p.walletProtectionBalances, analysisBlockers: p.analysisBlockers,
    debtBearingDemoWallet: BigInt(p.account.raw.totalDebtBase) > 0n,
    note: BigInt(p.account.raw.totalDebtBase) === 0n ? "Valid read, but a debt-bearing demo wallet is still required for intervention." : "Debt exists; verify ownership, policy, funded sender and allowances before intervention." };
});
