# PositionGuard implementation plan

Status: Phase 1 foundation and Phase 2 read-only Aave/Base service implemented. A complete live position read and database migration application remain pending environment verification. No transactions performed. The current behavior is documented in protection-engine.md; it supersedes this original roadmap for WATCH evaluation and hard autonomous caps.

## Repository and dependencies

The repository contains only README.md and LICENSE, with a clean initial worktree. No application, dependency lockfile, database, tests, or repository AGENTS.md exists. Local Node is 25.9.0 and npm is 11.13.0.

Use Next.js App Router, strict TypeScript, Tailwind, shadcn/ui, wagmi, viem, TanStack Query, Zod, Prisma and PostgreSQL as requested. Pin compatible stable versions and commit the lockfile at scaffolding time; verify package engine and peer requirements before installation. Use a supported Node LTS version compatible with both Next.js and Prisma. Add Vitest for domain/integration tests and Playwright for essential browser flows. No floating-point arithmetic for money, token amounts, or health-factor decisions.

## Verified integration facts and remaining gates

- KeeperHub exposes direct contract execution, dry-run simulation, execution status and receipt evidence. Implement a server-only REST adapter against the documented contract, with Zod validation of external responses. Sources: https://docs.keeperhub.com/api/direct-execution and https://docs.keeperhub.com/cli/execution-recovery .
- KeeperHub's idempotency replay window is 24 hours. Persist canonical request bytes and a stable decision/effect key before submission; uncertain requests past that window require reconciliation, never automatic resubmission. Honor polling hints and Retry-After. Unknown states remain unresolved, not successful.
- KeeperHub documents a simulation sender discrepancy for Safe routing. MVP execution requires a verified EOA route whose actual sender matches simulation; reject unverified signer modes. This is a real integration limitation, not something a successful simulation resolves.
- Aave supports supply and variable-rate repay on behalf of a beneficiary. Funds and Pool allowance belong to the transaction sender. A connected browser wallet does not grant KeeperHub access to that wallet's funds. Source: https://aave.com/docs/aave-v3/smart-contracts/pool .
- Proposed demo model: one authenticated beneficiary, explicitly bound to one funded KeeperHub execution wallet. Store the beneficiary and funding wallet separately. Check both against that binding; reject any mismatch. Funding-wallet registration must be operator-authorized, not inferred from a user signature. Protection funds are held in the KeeperHub wallet. Bounded ERC-20 Pool approvals are explicit setup operations through KeeperHub, independently simulated and verified; approval failure prevents protection.
- Prefer Ethereum Sepolia only after intersecting live KeeperHub enabled testnets with Aave's deployment registry and verifying contracts, reserves and prices onchain. Sepolia has a published Aave registry: https://raw.githubusercontent.com/aave-dao/aave-address-book/main/src/AaveV3Sepolia.sol . KeeperHub discovery: https://docs.keeperhub.com/api/chains . Do not assume that a documented chain is currently enabled for this account.
- Before enabling writes: verify KeeperHub credentials/scopes, actual signer, RPC chain ID, Aave Pool/provider/oracle addresses, supported token decimals and reserve flags, gas funding, balances, allowance and an actual readable test position. None of these account-specific checks has yet been performed.
- Read the selected deployment's actual ABI and reserve capabilities, including collateral enablement, caps, paused/frozen status and eMode/isolation. Initially reject unsupported position modes instead of applying ordinary-market estimates to them. ADD_COLLATERAL initially requires an already enabled eligible collateral reserve.

## Architecture decisions

Keep the requested eight layers separate: risk, candidate generation, outcome estimation, policy, advisory agent, execution guard, KeeperHub adapter, verification. Domain modules accept immutable typed inputs and have no wallet/network authority. Only the execution orchestrator can call KeeperHub write methods. Browser requests identify decisions; they never supply executable calldata.

Network configuration centrally defines chain ID, Pool/provider/oracle, tokens, explorer, finality rules and supported modes. Read position, reserves, prices, balances and allowances at a consistent block; record block number/hash and timestamp. Revalidation obtains a fresh coherent snapshot.

Risk boundaries: validate 1 < emergency < warning < target. SAFE is HF >= target; WATCH is warning <= HF < target; HIGH is emergency <= HF < warning; CRITICAL is HF < emergency. No debt is SAFE with explicit unbounded-HF representation. Evaluate protection below warning, restoring to target. WATCH is monitored without automatic spending. No cooldown bypass in the initial MVP.

Let W be liquidation-threshold-weighted collateral value, D debt value and T target HF. Ordinary-market estimates use repay requirement max(0, D - W/T), and added collateral requirement max(0, (T*D - W)/assetLiquidationThreshold). Convert using oracle price and token decimals with conservative integer rounding. Determine the smallest token-unit amount satisfying the estimator, and test its immediate predecessor; include below-minimum and larger comparison candidates. Never use a coarse sampling grid as proof of minimum. Handle zero debt, debt caps, insufficient balances and rounding explicitly.

Persist every candidate, including below-target and policy-rejected actions. Separate target attainment, hard validity and approval requirement. Rank target-reaching, hard-valid candidates by capital usage, then autonomous eligibility, then complexity, with stable ties. If the minimum requires approval, return REQUIRE_APPROVAL; do not silently spend more to avoid approval. Amounts above autonomous or approval thresholds require manual approval. Disabled actions, daily autonomous budget exhaustion and cooldown block autonomous execution. Approval binds the exact decision/effect and policy version and still requires all execution guards; it is not a policy override.

AI gets candidate IDs and read-only context. It cannot change selection economics or amounts. Provider unavailability uses a recorded deterministic fallback. To resolve the brief's distinct malformed-output and unavailable-provider requirements: malformed structured output blocks that evaluation's execution; ordinary provider unavailability permits deterministic selection. All model output is Zod-validated and checked against generated candidates.

## Database foundation

Requested models: User, ProtectionPolicy, PositionSnapshot, ProtectionDecision, CandidateAction, Execution and AuditEvent.

Add WalletBinding, Session/AuthNonce, DecisionApproval and BudgetReservation for authorization and concurrency. Policies are versioned; snapshots/decisions retain the exact version and reasoning context. Store token units as decimal strings or sufficiently wide exact numeric values, never JavaScript numbers; HF and prices have explicit scales. Execution stores all requested proof/status fields plus canonical intent, effect hash, first-submission time, polling/recovery metadata and linked pre/post snapshots. Unique idempotency/effect constraints and transactional per-wallet reservations prevent concurrent workers from spending the same budget. Uncertain broadcasts retain their reservation and block competing protection until reconciled. UTC daily accounting includes outstanding reservations; no rollover permits duplication of an unresolved effect.

Audit events are append-only through application and database permissions, with ordered IDs and correlation IDs. This is an auditable history, not a claim of cryptographic immutability.

## Implementation phases and expected files

| Phase | Expected changes | Completion evidence |
| --- | --- | --- |
| 1. Foundation | package.json, lockfile, tsconfig.json, Next/Tailwind/lint/test configuration, .env.example, .gitignore, compose.yaml, prisma/schema.prisma, prisma/migrations/, src/lib/db/, src/lib/config/ | Dependencies resolve; migration applies to PostgreSQL; typecheck and build pass |
| 2. Deterministic engine | src/lib/aave/{types,calculations}.ts, src/lib/protection/*, src/lib/policies/*, tests/unit/ | Required risk, MEI, policy, boundary, precision, disabled-action, daily-limit and cooldown tests pass |
| 3. Aave reads | src/lib/aave/{client,account,reserves}.ts, scripts/verify-network.ts, tests/integration/aave/ | Real allowlisted network position and reserve reads; block/price/decimal validation |
| 4. KeeperHub adapter | src/lib/keeperhub/{client,types,simulate,execute,status,idempotency}.ts, tests/integration/keeperhub/ | Documented response contract and recovery tests; real read-only simulation with configured sender |
| 5. Guard and verification | src/lib/execution/, src/lib/verification/{transaction,position}.ts, database repositories | Stale cancellation, concurrent dispatch, timeout recovery, failed/absent receipts and HF anomaly tests |
| 6. API and sessions | src/app/api/{auth,positions,policies,protection,executions}/, src/lib/security/ | Signed wallet challenge, nonce expiry/replay prevention, resource ownership, CSRF/origin checks and Zod validation |
| 7. Frontend | src/app/{dashboard,position,protection,activity,settings}/, src/components/, client providers | Wallet connection; real server data; all candidates and rejection reasons; progress and audit timeline |
| 8. AI explanations | src/lib/agent/{provider,decision,explanation,schemas}.ts | Advisory-only contract, malformed-output block and unavailable-provider fallback tests |
| 9. Monitoring | src/lib/monitoring/{monitor,evaluator,scheduler}.ts, scripts/monitor.ts | Restartable single-process polling; policy loading, snapshots, locking, cooldown and recovery |
| 10. Demo/hardening | README.md, docs/{architecture,protection-engine,keeperhub-integration,safety-model,demo}.md, tests/integration/, tests/e2e/ | Complete checks and a funded, explicitly enabled real KeeperHub/Aave execution with transaction proof |

## Execution protocol

1. Authenticate ownership/binding; read and persist position; validate versioned policy and funding eligibility.
2. Generate, estimate, validate and persist all candidates and the selected MEI; record AI explanation/fallback outcome.
3. Atomically reserve budget and the active wallet execution slot. Persist canonical intent and stable idempotency key.
4. Simulate the exact contract call. Require explicit success and wouldRevert=false, correct sender, recipient, chain and intent.
5. Immediately before submitting to KeeperHub, re-read position/reserves/prices/funding and policy; recheck target need, MEI, budget, cooldown and decision expiry. Cancel and audit POSITION_STATE_CHANGED if the action is stale, including the 1.27-to-1.60 example. Changed intents require a fresh decision and simulation.
6. Submit persisted bytes with persisted key. Save execution ID; recover ambiguous responses with the same intent/key only within the safe replay window. Never release funds or generate another decision while broadcast outcome is unknown.
7. Poll using server hints with bounded retries and persisted scheduling. A terminal status alone is insufficient proof.
8. Verify nonempty successful KeeperHub receipts and independently check chain receipts, sender, destination, calldata/effect and relevant Aave events using viem. Apply configured confirmation/reorg handling.
9. Re-read Aave at or after the receipt block; store before/after HF. Distinguish transaction confirmation from protection effectiveness. Non-improvement or target miss generates an anomaly, not a misleading protected badge.

The client can revalidate immediately before API submission, not atomically at KeeperHub's eventual broadcast or mining time. Document this residual race. Strict atomic HF preconditions would need verified KeeperHub conditional semantics or a reviewed onchain guard, neither of which is assumed in this MVP.

## Test and demo acceptance

Implement every requested unit/integration case, plus integer-boundary minimality, collateral-specific thresholds, wallet/signer mismatch, unsupported mode/asset/chain, malformed AI, concurrent reservations, policy changes during simulation, idempotency-window expiry, process restart, unknown status, missing receipt evidence and transaction-effect mismatch. Mocks belong only in tests; any fixture UI mode is explicitly labeled and cannot execute.

The real demo requires a verified funded KeeperHub wallet, bounded Pool allowance, supported Aave test position, reachable PostgreSQL and RPC, and server credentials. Record the decision, all candidates, simulation, revalidation, execution ID, receipt, explorer link and pre/post position. Do not claim the MVP or transaction-proof milestone complete until this evidence exists.

Dependency reference checked: https://nextjs.org/docs/app/getting-started/installation . Exact dependency versions, Prisma runtime compatibility, authenticated chain availability and onchain configuration remain phase-one verification tasks.
