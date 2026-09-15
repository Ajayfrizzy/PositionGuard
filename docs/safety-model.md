# PositionGuard safety model

PositionGuard treats every intervention as untrusted until live state, policy, funding, simulation, canonical identity, and post-transaction evidence pass. The deterministic engine decides; KeeperHub executes; independent RPC/Aave verification determines whether success may be recorded.

## Ownership and sessions

Onboarding creates a five-minute challenge containing origin, wallet, chain, nonce, issue time, and expiry. The signed message explicitly does not authorize a transaction. PositionGuard verifies the signature, atomically consumes the challenge, and creates a seven-day database session.

Only the session-token hash is stored. The raw token uses an HTTP-only, SameSite=Lax cookie with Secure in production. State-changing wallet APIs apply same-origin checks, and queries are scoped to the session's protected-account ID and chain. Authentication rate limiting is in process, not distributed.

The development/operator bearer token remains for diagnostic/operator endpoints; it is not user ownership proof.

## Policy and capital controls

A persisted wallet/chain policy must be enabled and satisfy target HF > warning HF > emergency HF > 1. It controls execution mode, repay/supply permissions, maximum single autonomous amount, rolling 24-hour spend, approval threshold, and cooldown. Protect Automatically requires explicit confirmation.

Execution context counts submitted, confirmed, and unconfirmed capital in the last 24 hours and uses the latest such execution for cooldown. A candidate cannot bypass disabled actions or exceed balance, supply capacity, per-action limit, daily limit, or cooldown.

## MEI and readiness

The engine uses bigint/base-unit arithmetic and reserve-specific prices and thresholds. It finds the minimum target-reaching amount at token-unit precision, preserves rejected alternatives, and uses deterministic ranking. Unsupported eMode, stable debt, isolation, and reconciliation fail closed.

The execution wallet is separate from the protected account. PositionGuard verifies KeeperHub's organization wallet against the configured pin, then reads the sender's exact underlying-token balance and Pool allowance. It creates no approvals, does not treat ETH as WETH, and has no unlimited silent approval path.

## Canonical intent, simulation, and revalidation

Only server builders produce execution intents. Browser input cannot choose target, calldata, ABI, function, token, amount, sender, or beneficiary. Assets and Pool addresses are chain-specific allowlists.

Every execution path simulates the exact KeeperHub call. For broadcast mode, PositionGuard then reconstructs policy, spend/cooldown context, live Aave position, candidate, and intent. Policy ID/version, effect fingerprint, and base-unit amount must match. A mismatch or now-safe position is persisted as stale and is not broadcast.

## Idempotency and authorization

The unique idempotency key binds wallet, chain, policy/version, action, asset, amount, and effect fingerprint. Reservation occurs in a database transaction; a conditional update lets one caller claim a not-started execution.

Interactive/operator broadcast requires operator authentication and a separate effect-bound broadcast secret that expires after 60 seconds. Wallet sessions may simulate only. Autonomous execution is available only from the server worker after verifying the saved mode is AUTONOMOUS; every remaining gate still applies.

## Verification and AI isolation

Confirmation requires verified KeeperHub receipts, a consistent hash, the expected chain, a successful RPC receipt, and an exact Aave Pool event. PositionGuard then re-reads Aave and requires HF improvement when both HFs are finite. Only then does it persist CONFIRMED, receiptVerified true, a post-execution snapshot, and audit evidence. Ambiguous broadcast becomes UNCONFIRMED.

The optional AI provider receives bounded summaries, may reference only engine candidates, must pass a Zod schema, and times out after four seconds. Failure uses deterministic text. AI cannot alter decision or execution fields.

## Observability

Monitoring runs, snapshots, decisions, candidates, readiness, executions, audit events, notifications, and heartbeats are stored. Autonomous stages produce one-line JSON logs. Notifications persist before optional webhook delivery, so webhook failure remains a delivery incident rather than an execution failure.

## Risk and mitigation

| Risk                    | Implemented mitigation                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Stale state             | Canonical reconstruction; fingerprint/version/amount comparison; stale cancellation and audit.  |
| Arbitrary calldata      | Strict mode-only request and server-built allowlisted Aave intent.                              |
| Duplicate execution     | Deterministic unique key and atomic conditional claim.                                          |
| Insufficient funding    | Live underlying-token balance check for exact sender and amount.                                |
| Insufficient allowance  | Live sender-to-Pool comparison against exact amount; no automatic approval.                     |
| Policy bypass           | Active wallet/chain policy loaded server-side with action/capital/daily/cooldown limits.        |
| Wrong sender            | Wallet/profile consistency, sender pin, simulation match, repay-event repayer match.            |
| Reverted transaction    | Mandatory simulation and successful KeeperHub/RPC receipt requirements.                         |
| Receipt mismatch        | Expected chain, verified status, consistent hash, RPC block/status checks.                      |
| Aave effect missing     | Exact Pool Repay/Supply event match for reserve, beneficiary, and amount.                       |
| No position improvement | Coherent post-state read and finite-HF improvement requirement.                                 |
| Worker outage           | Database/file heartbeats, status UI, restart policy, health check, logs.                        |
| Account-cycle failure   | Persisted and contained; remaining accounts continue.                                           |
| Webhook failure         | In-app row persists first; independent delivery status; execution unchanged.                    |
| AI failure              | Schema/candidate validation, timeout, deterministic fallback, no authority.                     |
| Cross-wallet leakage    | Signed session and protected-account/chain-scoped queries.                                      |
| CSRF                    | Origin and Sec-Fetch-Site checks on session-authenticated writes.                               |
| Secret exposure         | Server-only environment, no public secrets, sanitized diagnostics, restricted KeeperHub origin. |

## Residual limitations

- PositionGuard has not undergone a formal third-party security audit.
- Rate limiting is not shared across replicas.
- Web and worker trust the same production environment and database.
- Allowance is an operational prerequisite; PositionGuard does not manage revocation.
- The post-state condition proves improvement, not exact target attainment.
- There is no background reconciler for executions still unconfirmed after in-request polling.
- Audit records are relational evidence, not cryptographically tamper-evident or database-enforced append-only logs.

See [security](security.md), [architecture](architecture.md), and [testing](testing.md).
