# PositionGuard

**Autonomous Aave Position Defense**

PositionGuard observes an Aave V3 account, assesses liquidation risk, evaluates bounded defensive actions, selects the Minimum Effective Intervention (MEI), validates a user-owned policy, and routes only a canonical approved intent through KeeperHub. It then verifies the transaction receipt, Aave event, and resulting health factor.

Base Sepolia is the default hackathon environment. Its assets have no real-world value.

## Problem

DeFi borrowers must continuously watch health factors, compare possible interventions, prepare capital, and react before liquidation. A basic auto-repay rule can overreact, waste capital, use stale state, or submit an action that no longer matches the position.

## Solution

```text
Observe → Assess risk → Evaluate candidates → Select MEI → Validate policy
        → Simulate → Revalidate Aave state → Execute → Verify receipt → Verify improved HF
```

The product lives at `/dashboard`, `/position`, `/protection`, `/activity`, and `/settings`. `/dev/aave` remains an operator-only engineering verifier.

## Why this is not a simple auto-repay bot

- It considers repayment and collateral supply across normalized supported assets.
- It models health-factor outcomes and finds the smallest effective token-unit action.
- It enforces balance, action, capital, daily, cooldown, approval, and supply-cap constraints.
- It reloads policy and Aave state on the server. The browser cannot provide amount, asset, target, calldata, ABI, or token address.
- It cancels stale decisions and verifies receipts, Aave effects, and post-execution health factor.

## Minimum Effective Intervention

MEI is the smallest policy-compliant action expected to restore the position to its configured safety target. PositionGuard uses exact integer arithmetic and a binary search at token-unit resolution. Every candidate remains visible with projected HF, capital requirement, policy status, and rejection reason. The deterministic engine—not AI—is authoritative.

## Protection policy

Each wallet/chain policy stores health-factor thresholds (`target > warning > emergency > 1`), maximum intervention, daily spend, approval threshold, allowed actions, cooldown, and enabled state. The settings API validates every field with Zod. Neither UI nor AI can relax these constraints during execution.

## Aave V3 integration

Reads are pinned to one block and include account totals, reserves, supplied/debt balances, wallet protection balances, collateral flags, prices, liquidation thresholds, and eMode. Runtime checks verify chain ID, deployed code, Addresses Provider links, oracle base currency, Pool, and Data Provider before trusting data. Base Sepolia and Base mainnet configuration is centralized in `src/lib/chains/`.

## KeeperHub integration and execution safety

Server-only builders create canonical Aave `repay` and `supply` intents from allowlists. The protection request body is a strict empty object: “protect the configured wallet,” never “send this transaction.” The server independently loads active policy, reads live state, recomputes MEI, and binds the selected effect to the expected KeeperHub sender.

The server-only execution orchestrator implements sender, funding, allowance, simulation, immediate state revalidation, explicit authorization, durable idempotency, broadcast, polling, receipt/Aave-event verification, post-state verification, and persistence. Simulation is exposed to the product UI. Broadcast additionally requires a separate `POSITIONGUARD_BROADCAST_TOKEN`; the normal operator token alone cannot authorize value movement. No generic transaction API is exposed.

## Revalidation and receipt verification

Analysis remains advisory until the server reads the position again. If HF, debt, balances, reserve state, selected candidate, or policy changed materially, PositionGuard cancels the old decision and shows `POSITION CHANGED`. Success requires an independent successful RPC receipt, expected Aave effect/event, canonical transaction identity, and post-execution snapshot showing the resulting HF. `SUBMITTED` is not success.

## AI explanation layer

AI is optional and advisory. A provider receives bounded candidate IDs and summaries; output is Zod-validated and may reference only engine-generated candidates. It can explain risk, rejection, policy, and outcome, but cannot choose amounts, change policy, create calldata, or broadcast. Provider or validation failure uses a deterministic explanation, so the product continues without AI.

## Monitoring

`POST /api/monitor` runs one authenticated cycle: load policy, capture coherent live Aave state, evaluate risk, persist the decision and every candidate when needed, and append audit events. It does not broadcast recurring transactions, leaving a safe boundary for a future scheduler.

## Architecture

```text
Next.js UI
  ├─ server mapper ─ PostgreSQL (policy, snapshots, candidates, executions, audit)
  ├─ policy API ─ Zod validation
  ├─ monitoring API ─ Aave coherent reader ─ deterministic MEI
  └─ protection API ─ canonical recomputation ─ [fail-closed broadcaster boundary]

Core: normalized portfolio → exact estimator → candidates → policy → ranker → intent
```

## Verified Base Sepolia execution

```text
Before HF 1.549918707188866008
  → PositionGuard MEI: repay 0.212852 USDC
  → KeeperHub execution r2glntpejp16jxatt6th8
  → transaction 0xc140daf6aed1e8e0623eaadbaee7dee5a59ffe860c9bd576d606401d761d7ba1
  → After HF 1.599999884615885683
```

[View the verified transaction on BaseScan](https://sepolia.basescan.org/tx/0xc140daf6aed1e8e0623eaadbaee7dee5a59ffe860c9bd576d606401d761d7ba1).

The app does not hardcode this record. Dashboard, success, and activity views render it only when the confirmed `Execution` row and relations exist in PostgreSQL.

## Setup

Requires Node 24, npm, and PostgreSQL.

```sh
nvm use
npm ci
cp .env.example .env
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`; `/` redirects to `/dashboard`.

## Environment variables

| Variable                         | Purpose                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`                   | Server-only PostgreSQL URL                                 |
| `BASE_SEPOLIA_RPC_URL`           | Server-only testnet RPC                                    |
| `BASE_RPC_URL`                   | Optional Base mainnet RPC                                  |
| `POSITIONGUARD_DEFAULT_CHAIN_ID` | Defaults to `84532`                                        |
| `AAVE_WALLET_ADDRESS`            | Server-configured protected wallet                         |
| `POSITIONGUARD_DEV_TOKEN`        | 32+ character operator authorization                       |
| `KEEPERHUB_API_KEY`              | Server-only KeeperHub credential                           |
| `KEEPERHUB_BASE_URL`             | Restricted official HTTPS origin                           |
| `KEEPERHUB_EXECUTION_WALLET`     | Expected sender pin                                        |
| `POSITIONGUARD_BROADCAST_TOKEN`  | Separate 32+ character step-up authorization for broadcast |
| `MONITOR_POLL_INTERVAL_MS`       | Worker interval; clamped to at least 30 seconds            |
| `POSITIONGUARD_WEBHOOK_URL`      | Optional persisted-notification webhook                    |
| `POSITIONGUARD_WEBHOOK_SECRET`   | Optional HMAC-SHA256 webhook signing secret                |

Never expose these through `NEXT_PUBLIC_` variables.

## Database and testing

Prisma persists users, policies, coherent snapshots, decisions, candidates, executions, and audit events. Apply both migrations. Keep the verified execution as a normal database row; never seed proof values into UI components.

```sh
npm run db:generate
npm run db:validate
npm run db:migrate:safe
npm run verify:db
npm run lint
npm run typecheck
npm test
npm run build
```

Run one monitoring cycle with `npm run worker:monitor -- --once`, or start the long-running process with `npm run worker:monitor`. Each enabled protected account is processed independently. `MONITOR_ONLY` never simulates or broadcasts, `REQUIRE_APPROVAL` stops after simulation, and only an explicitly confirmed `AUTONOMOUS` policy can enter the existing broadcast orchestrator.

Tests cover financial behavior, Aave normalization, policies, candidate mapping, timelines, stale cancellation, confirmed execution/audit mapping, explorer URL safety, AI validation/fallback, testnet labeling, and rejection of arbitrary execution fields.

## Demo and known limitations

See [the 2–3 minute demo script](docs/demo.md) and [Base Sepolia runbook](docs/base-sepolia-demo.md).

- Only configured Base Aave reserves and repay/supply are supported.
- The worker must be deployed as a supervised process or invoked by hosted cron/job infrastructure.
- Email delivery remains behind the notification-provider interface; persisted in-app and webhook delivery are implemented.
- Product authorization currently uses the development operator token rather than wallet-session UX.
- Database and provider availability depend on deployment networking.
