# Implementation status

This file replaces the original phase plan with a current implementation map. The judge-facing overview is [README](../README.md); detailed data flow is in [architecture](architecture.md).

| Area              | Current implementation evidence                                                             |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Foundation        | Next.js/TypeScript, Prisma/PostgreSQL, Zod, viem, Vitest, Docker Compose                    |
| Wallet onboarding | Signed expiring one-time challenge, database-backed hashed session, secure cookie settings  |
| Aave              | Runtime-verified, block-pinned account/reserve/oracle reads and portfolio normalization     |
| Protection engine | Deterministic risk, repay/supply candidates, token-unit MEI, policy and capital enforcement |
| KeeperHub         | Authentication/readiness, simulation, direct broadcast, status polling, receipt validation  |
| Execution safety  | Sender, funding, allowance, canonical revalidation, stale cancellation, idempotency         |
| Verification      | Independent RPC receipt, exact Aave event, post-state HF improvement                        |
| Monitoring        | Hosted worker, enabled-account cycles, three execution modes, heartbeat/status, JSON logs   |
| Notifications     | Persist-first in-app rows, optional HMAC webhook, dedupe/grouping/filter/load-more          |
| Scenario          | Simulation-only collateral-price shocks using persisted position and deterministic engine   |
| AI                | Advisory explanation schema and deterministic fallback; no execution authority              |
| Deployment        | Standalone web and worker containers with external PostgreSQL and health checks             |

## Remaining product limitations

Ask Before Acting currently stops after simulation and has no wallet-session confirmed-broadcast path. Unsupported Aave modes/reconciliation fail closed. Execution actions are limited to configured USDC/WETH repay and eligible supply on Base networks. There is no background reconciler for previously unconfirmed execution. No mainnet execution or formal security audit is claimed.

For verification commands and current quality results, see [testing](testing.md). For hackathon evidence, see [judging criteria](judging-criteria.md).
