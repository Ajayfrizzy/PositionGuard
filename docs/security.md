# Security

PositionGuard uses layered controls around wallet ownership, server authority, policy, and transaction verification. This document describes implemented controls, not a formal audit.

## Wallet ownership and sessions

- Five-minute, random, one-time wallet challenges bind origin, URI, checksummed wallet, chain, timestamps, and nonce.
- The signed message explicitly says it does not authorize a transaction.
- viem verifies the signature; challenge consumption and session creation are atomic.
- Consumed and expired nonces are rejected.
- Seven-day session tokens are random; only SHA-256 hashes are stored.
- Cookies are HTTP-only and SameSite=Lax; Secure is added in production.
- Logout revokes the database session and clears the cookie.
- State-changing session APIs reject cross-site origins/Sec-Fetch-Site.
- Challenge/verification attempts use an in-memory rate limiter. It is per process, not distributed.

## Account and input isolation

Wallet-scoped routes derive protectedAccountId, wallet, and chain from the verified database session. Prisma queries and updates apply that scope. User sessions may request protection simulation but cannot request broadcast.

Request bodies use strict Zod schemas and size/content-type limits. The protection endpoint accepts only mode; arbitrary target, function, ABI, calldata, token, amount, sender, and beneficiary are forbidden.

## Server-only execution authority

RPC URLs, database credentials, KeeperHub keys, operator/broadcast tokens, and webhook secrets remain server-side and must never use NEXT_PUBLIC prefixes.

Canonical transaction construction uses configured chain contracts and USDC/WETH allowlists. The expected KeeperHub execution wallet is pinned and compared with authenticated wallet/profile data, simulation sender, and relevant transaction/event evidence.

Interactive/operator broadcast requires the operator bearer credential plus a separate 32+ character broadcast token. Its authorization is bound to the canonical effect fingerprint and expires after 60 seconds. The worker has a separate server-only autonomous path that requires an explicitly confirmed, enabled AUTONOMOUS policy.

## Financial and transaction controls

- Deterministic bigint/base-unit MEI; AI has no execution authority.
- Saved action, capital, daily-spend, approval, and cooldown limits.
- Live execution-wallet underlying balance check.
- Live exact sender-to-Aave-Pool allowance check.
- No approval transaction builder and no unlimited silent approval.
- Mandatory KeeperHub simulation and expected sender/target match.
- Immediate policy/state/candidate canonical revalidation.
- Stale cancellation instead of blind execution.
- Unique durable idempotency and atomic claim.
- Verified KeeperHub receipt plus independent RPC receipt and Aave event.
- Post-execution Aave read and finite-HF improvement check.
- Ambiguous state persists as UNCONFIRMED rather than success.

## Network and provider controls

KeeperHub base URL is restricted to the official HTTPS origin and redirects are rejected. External KeeperHub and AI payloads are schema-validated. RPC reads verify chain and deployed Aave relationships and pin a coherent snapshot to one block.

Optional webhooks can be signed with HMAC-SHA256 and time out after eight seconds. In-app persistence occurs first, so delivery failure does not corrupt product state.

## Operational guidance

- Restrict .env and certificate permissions.
- Use provider CA validation; leave DATABASE_TLS_ALLOW_SELF_SIGNED false in production.
- Put Next.js behind TLS and forward Host and X-Forwarded-Proto correctly.
- Keep PostgreSQL and RPC/KeeperHub endpoints off the public client.
- Rotate credentials after suspected exposure.
- Stop the worker during an execution incident while preserving web access and evidence.
- Never manually resubmit an unconfirmed action with a new idempotency key.
- Review and bound existing Aave token allowances operationally.

## Security status

**PositionGuard has not undergone a formal third-party security audit.**

Additional known limitations: the authentication rate limiter is process-local, web and worker share the production trust environment, stored audit rows are not cryptographically tamper-evident, and the application does not manage allowance revocation or run a separate background reconciler for unconfirmed executions.

See [safety model](safety-model.md) and [deployment](vps-deployment.md).
