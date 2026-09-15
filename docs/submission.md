# PositionGuard Hackathon Submission

## Project name

PositionGuard

## Tagline

Autonomous Aave Position Defense

## One-sentence summary

PositionGuard monitors a user-owned Aave V3 position, computes the smallest policy-permitted intervention expected to restore its health-factor target, executes a canonical action through KeeperHub, and independently verifies the outcome.

## Problem

Aave borrowers must continuously track health factor, collateral prices, debt, available capital, and timing. Naive automation can act on stale state, overcommit capital, violate policy, duplicate a transaction, or confuse submission with successful protection.

## Solution

PositionGuard combines signed wallet onboarding, coherent Aave reads, deterministic risk and MEI calculation, user-defined capital/action controls, hosted monitoring, KeeperHub simulation/execution, stale-state cancellation, idempotency, and receipt/Aave/post-state verification.

## Integrated project

Aave V3

## KeeperHub usage

KeeperHub provides authenticated organization-wallet simulation, direct canonical Aave contract-call execution, execution IDs, status polling, and verified receipt evidence. PositionGuard constructs and constrains the action and verifies it independently after KeeperHub execution.

## Network

Base Sepolia (chain ID 84532). Testnet assets have no real-world value.

## Live application

[positionguard.online](https://positionguard.online)

## Source code

[github.com/Ajayfrizzy/PositionGuard](https://github.com/Ajayfrizzy/PositionGuard)

## Verified KeeperHub transaction

[Base Sepolia transaction 0xc140…d7ba1](https://sepolia.basescan.org/tx/0xc140daf6aed1e8e0623eaadbaee7dee5a59ffe860c9bd576d606401d761d7ba1)

Repository-recorded evidence: KeeperHub execution r2glntpejp16jxatt6th8; repay 0.212852 USDC; HF 1.549918707188866008 → 1.599999884615885683. A read-only RPC audit independently confirmed the successful receipt and exact Aave Pool Repay event.

## Demo video

TBD — YouTube link will be added before submission.

## Key features

- Signed wallet ownership and database-backed wallet/chain session
- Hosted worker independent of the browser
- Coherent block-pinned Aave V3 position and reserve reads
- Deterministic reserve-aware MEI for debt repayment or eligible collateral supply
- Three execution modes with explicit autonomous confirmation
- User action, capital, daily-spend, approval, and cooldown limits
- Execution-wallet funding and exact Pool allowance checks
- Server-generated canonical intents and KeeperHub simulation
- Immediate revalidation, stale cancellation, and durable idempotency
- KeeperHub receipt, independent RPC/Aave event, and post-state verification
- Scenario-only collateral-price stress testing
- Audit trail, worker status, structured logs, and delivery-aware notifications
- Advisory AI explanation with deterministic fallback

## Technical architecture

The Next.js web service handles onboarding, sessions, policy, and wallet-scoped UI. A separate worker loads enabled policies, reads Aave over Base RPC, invokes the deterministic engine, and routes authorized canonical actions through KeeperHub. PostgreSQL stores sessions, policies, snapshots, candidates, executions, monitoring, audit, and notifications. See [architecture](architecture.md).

## Safety

The browser cannot supply transaction fields. PositionGuard enforces saved policy, sender, funding, allowance, simulation, canonical revalidation, idempotency, verified receipts, exact Aave events, and post-state improvement. AI cannot modify execution. See [safety](safety-model.md) and [security](security.md).

## Why PositionGuard is useful

It converts liquidation monitoring into a bounded capital decision and proven protocol outcome. It is more actionable than an alert, more transparent than a fixed bot, and safer than blindly replaying an old repayment amount.

## Main Track judging criteria

See [PositionGuard — Main Track Judging Criteria](judging-criteria.md).

## Known limitations

PositionGuard currently targets Aave V3 on configured Base networks, with canonical USDC/WETH repay and already-enabled collateral-supply actions. Unsupported eMode, stable debt, isolation, or inconsistent reserve data blocks intervention. Ask Before Acting simulates and stops; wallet sessions do not currently expose a user-confirmed broadcast. Base mainnet execution is not claimed. The project has not undergone a formal third-party security audit.
