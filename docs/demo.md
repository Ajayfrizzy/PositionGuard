# PositionGuard hackathon demo (2–3 minutes)

## Before recording

1. Use Base Sepolia and confirm the TESTNET/no-real-value label.
2. Configure the protected wallet, reliable RPC, reachable database, operator token, and KeeperHub server variables.
3. Apply migrations and run the RPC, Aave, KeeperHub, and allowance verification scripts.
4. Enable a valid policy and run one authenticated monitoring cycle so snapshot, decision, candidates, and audit events are current.
5. Confirm the existing verified execution appears from PostgreSQL. Do not hardcode or seed it into UI components.

## Script

**0:00 — Dashboard.** Show Base Sepolia, protected wallet, active protection, and live Aave HF below target. PositionGuard observes before acting.

**0:20 — Risk and recommendation.** Show risk state, current → projected HF, and the Minimum Effective Intervention.

**0:40 — Protection Analysis.** Open `/protection`. Walk through real engine candidates: below-target rejection, policy rejection if present, selected MEI, and a valid more-expensive alternative. No rows are fabricated.

**1:05 — Policy.** Open `/settings`. Show threshold ordering, one-action/daily caps, approval threshold, allowed actions, cooldown, and enabled state. AI cannot change these limits.

**1:25 — Safety gates.** Return to Protection. Show Aave refresh, policy validation, MEI recomputation, sender, balance, allowance, simulation, pre-broadcast revalidation, receipt, Aave event, and outcome. The browser sends no amount or calldata.

**1:50 — Stale state.** Explain `POSITION CHANGED`: PositionGuard cancels the old recommendation and recalculates instead of broadcasting stale intent.

**2:05 — Verified result.** Show the database execution: 0.212852 USDC, HF 1.549918707188866008 → 1.599999884615885683, KeeperHub ID `r2glntpejp16jxatt6th8`, and verified receipt.

**2:25 — Audit.** Open `/activity`, show chronological evidence, and open transaction `0xc140daf6aed1e8e0623eaadbaee7dee5a59ffe860c9bd576d606401d761d7ba1` on Base Sepolia BaseScan.

## Prepare/reset a repeatable test position

Use a dedicated Base Sepolia wallet. Obtain test assets, supply supported collateral to the configured Aave Pool, enable collateral, and borrow conservatively. Adjust until HF is below policy target but safely above liquidation. Fund only the verified KeeperHub sender with test gas/protection tokens and grant a bounded Pool allowance.

For another run, change the position through normal Aave interactions, run monitoring, and verify the new snapshot and candidates. Never edit execution proof rows. After protection, recreate the below-target state with a deliberate testnet borrow/collateral adjustment, then recheck HF, balances, allowance, cooldown, daily limit, and sender routing.

Do not broadcast another repayment merely to test UI. The existing confirmed execution is sufficient. Any additional live repayment requires explicit authorization.

## Final live-execution gate

The production path is restored, but a new broadcast still requires the separate server-side `POSITIONGUARD_BROADCAST_TOKEN` and explicit authorization. Run simulation first, review the refreshed MEI and every safety check, then request explicit approval before using broadcast mode. Never place the broadcast token in client configuration.
