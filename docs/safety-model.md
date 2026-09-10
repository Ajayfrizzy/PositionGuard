# Phase 1 safety model

The engine is pure deterministic code. Zod rejects malformed policies, positions and context; monetary calculations use bigint. Policy rejection precedes execution eligibility. An approval-required result is advisory and has no execution path. NO_SAFE_ACTION is distinct from an already safe position. Disabled policies and exhausted budgets cannot select actions.

Phase 1 introduced no network or execution paths. Phase 2 adds authenticated read-only Aave RPC and deliberate snapshot persistence; there are still no KeeperHub writes, AI providers or wallet signing. The home page reports foundation status and contains no invented position data. PostgreSQL access is server-only and requires DATABASE_URL; the database is not needed for pure engine tests or rendering the home page.

The schema stores exact Decimal financial columns, nullable unbounded HF, immutable decision context copies, relations with restrictive deletion, ordered candidate ranks, unique idempotency keys and optional receipt evidence. Execution amount is reserved for integer token base units (Decimal(78,0)); Phase 1 candidate amounts are normalized USD (Decimal(30,6)). No execution records are created. AuditEvent is a storage foundation: append-only database enforcement and tamper evidence are not implemented yet.

Before execution is introduced, implement wallet ownership and funding bindings, supported network/token registries, live reserve-aware estimation, atomic budget reservations, policy version checks, bounded approvals, simulation, stale-state cancellation, durable idempotency recovery, receipt/effect verification and post-execution HF checks. Caller-provided spend/cooldown context currently has no database-backed concurrency guarantee. Do not expose this function as an unauthenticated execution authority.

PostgreSQL development credentials in compose.yaml are local-only examples; use separate secrets and least-privilege roles outside local development. No provider secrets are needed for this phase.

Phase 2 authentication is a development operator bearer token, not wallet ownership verification. Account totals/HF are retained at full returned precision; unsupported modes and reconciliation failures block estimates. See [Aave integration](aave-integration.md) for the current service/API safety boundary.
