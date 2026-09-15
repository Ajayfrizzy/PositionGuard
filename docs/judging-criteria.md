# PositionGuard — Main Track Judging Criteria

This document maps the current repository and one historical confirmed Base Sepolia execution to the **Best Integration into a Live Project** criteria. It does not claim a score.

## 1. Integration depth

**Named live project:** Aave V3.

PositionGuard reads Aave account and relevant reserve state at a single block: collateral/debt totals, HF, LTV, eMode, supplied/borrowed balances, collateral enablement, wallet balances, reserve status/caps, liquidation thresholds, decimals, and oracle prices. It verifies Pool, Pool Data Provider, Addresses Provider, and oracle relationships before accepting data.

The decision model is protocol-specific. Repay candidates model reduction of Aave variable debt; supply candidates model the reserve's additional liquidation-threshold contribution. The engine reconciles reserve totals with account totals and blocks unsupported eMode, stable debt, isolation, or inconsistent snapshots. Canonical effects call the configured Aave Pool's repay or supply function on behalf of the protected account.

Repository evidence:

- [Aave service](../src/lib/aave/service.ts) and [reserve reader](../src/lib/aave/reserves.ts)
- [Aave normalizer](../src/lib/aave/normalizer.ts) and [portfolio estimator](../src/lib/protection/portfolio-estimator.ts)
- [Canonical Aave intents](../src/lib/aave/intents.ts)
- [Aave transaction/event verification](../src/lib/execution/verification.ts)
- [Aave integration notes](aave-integration.md)

## 2. Execution through KeeperHub

KeeperHub is used for simulation, direct contract-call broadcast, execution identification, status polling, and receipt evidence. The browser cannot provide arbitrary transaction fields; PositionGuard builds the exact call on the server and binds it to the expected organization execution wallet.

| Field                  | Evidence                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Network                | Base Sepolia (84532)                                                                                           |
| Before HF              | 1.549918707188866008                                                                                           |
| MEI                    | Repay 0.212852 USDC                                                                                            |
| KeeperHub execution ID | r2glntpejp16jxatt6th8                                                                                          |
| Transaction            | [BaseScan](https://sepolia.basescan.org/tx/0xc140daf6aed1e8e0623eaadbaee7dee5a59ffe860c9bd576d606401d761d7ba1) |
| After HF               | 1.599999884615885683                                                                                           |

A read-only RPC audit confirmed that this transaction succeeded at block 46623821 and emitted the exact Aave Pool Repay event for 212852 units of the configured six-decimal USDC, with the documented protected account and KeeperHub execution wallet roles. The KeeperHub ID and before/after HF are repository-recorded persisted evidence; the documentation audit could not re-query the production database from the local environment.

The confirmation path validates KeeperHub receipt status/hash/chain, verifies the RPC receipt and exact Aave event, then re-reads the position and requires HF improvement. The UI loads evidence through a query requiring CONFIRMED, receiptVerified true, and completion; it does not hardcode proof values.

Repository evidence:

- [Direct KeeperHub client](../src/lib/keeperhub/direct-client.ts)
- [Execution orchestrator](../src/lib/execution/orchestrator.ts)
- [Execution persistence/idempotency](../src/lib/execution/persist.ts)
- [Verified-protection selector](../src/lib/product/latest-verified-protection.ts)
- [KeeperHub integration details](keeperhub-integration.md)

## 3. Reliability and observability

The worker is independent of the browser, polls at a configurable interval, writes database/file heartbeats, and isolates failures by protected account. Monitor Only observes, Ask Before Acting simulates then stops, and Protect Automatically can invoke the autonomous orchestrator only after explicit policy confirmation.

Reliability controls include block-pinned reads, strict schemas, funding and exact allowance checks, mandatory simulation, immediate canonical revalidation, stale cancellation, durable idempotency, bounded status polling, explicit unconfirmed states, and independent receipt/event/post-state verification.

Observability includes JSON autonomous lifecycle logs, monitoring runs, worker states (ONLINE, DEGRADED, OFFLINE, NOT_STARTED), audit events, confirmed/failed/unconfirmed execution rows, and in-app notifications. Notification delivery state is separate: a failed webhook does not erase the event or relabel successful protection. Meaningful grouping, filters, and 25-item load-more rendering preserve historical detail.

Repository evidence:

- [Worker entry point](../scripts/monitor-worker.ts), [monitoring service](../src/lib/monitoring/service.ts), and [heartbeat](../src/lib/monitoring/heartbeat.ts)
- [Canonical revalidation](../src/lib/execution/revalidate.ts)
- [Notification service](../src/lib/notifications/service.ts) and [presentation](../src/lib/notifications/presentation.ts)
- [Observability guide](observability.md) and [testing guide](testing.md)

## 4. Usefulness and originality

Aave borrowers face a time-sensitive capital-allocation problem, not merely a notification problem. PositionGuard answers: **What is the smallest action this user has permitted that is expected to restore the safety target now, and can it be executed and proven safely?**

Unlike a dashboard, it can carry a validated intervention through simulation and execution. Unlike an alert, it computes concrete repay and supply alternatives. Unlike a naive auto-repay bot, it evaluates reserve-specific effects, compares capital, applies limits and readiness, cancels stale decisions, prevents duplicates, and verifies the protocol outcome.

MEI finds a target-reaching amount at token-unit precision under the current single-action model, then exposes alternatives and rejection reasons for inspection.

Repository evidence:

- [Portfolio engine](../src/lib/protection/portfolio-engine.ts)
- [Candidate generation](../src/lib/protection/candidate-generator.ts) and [ranking](../src/lib/protection/candidate-ranker.ts)
- [Policy validation](../src/lib/policies/validator.ts)
- [Scenario stress analysis](../src/lib/stress/service.ts)
- [Protection-engine documentation](protection-engine.md)

## 5. Developer experience and code quality

The implementation separates Aave reads, deterministic finance, policies, execution orchestration, KeeperHub transport, monitoring, notifications, wallet security, and presentation. TypeScript and Zod guard internal/external contracts; bigint/base-unit arithmetic avoids floating-point execution decisions; Prisma supplies relational constraints and migrations.

The repository includes unit and integration tests, sanitized verification scripts, a standalone production build, Docker Compose web/worker topology, health checks, restart policy, safe migrations, and focused architecture/safety/security/observability/testing/demo documentation. The optional AI layer is isolated from execution authority and has schema validation, candidate allowlisting, a timeout, and deterministic fallback.

Repository evidence:

- [Package scripts](../package.json)
- [Prisma schema](../prisma/schema.prisma) and [migrations](../prisma/migrations)
- [Tests](../tests)
- [Docker Compose](../compose.yaml) and [Dockerfile](../Dockerfile)
- [Security](security.md), [testing](testing.md), and [deployment](vps-deployment.md)
