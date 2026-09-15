# VPS deployment

PositionGuard's production topology is two long-lived Docker Compose services—Next.js web and the monitoring worker—plus external PostgreSQL. The current live URL is [positionguard.online](https://positionguard.online).

## Prerequisites

- Linux VPS with Docker Engine and the Compose plugin
- DNS pointing the public hostname to the VPS
- reverse proxy and TLS certificate
- external PostgreSQL reachable from both containers
- private Base RPC URL
- KeeperHub organization credentials and verified execution-wallet pin
- repository checkout under a non-root deployment account

Do not commit or paste database credentials, API keys, RPC URLs containing credentials, broadcast/operator tokens, webhook secrets, or private keys. Keep the production environment only in the VPS environment file with restricted permissions.

## Services

| Service  | Command                                          | Health                                                  |
| -------- | ------------------------------------------------ | ------------------------------------------------------- |
| web      | standalone Next.js server on container port 3000 | GET /api/health; succeeds only when PostgreSQL responds |
| worker   | scripts/monitor-worker.ts                        | file heartbeat newer than five minutes                  |
| database | external PostgreSQL                              | checked by web health and verify:db                     |

Both containers use restart: unless-stopped and a 30-second stop grace period. The worker also writes a database heartbeat every 10 seconds, which drives the product's ONLINE/DEGRADED/OFFLINE state.

## Initial deployment

```sh
git clone https://github.com/Ajayfrizzy/PositionGuard.git /opt/positionguard
cd /opt/positionguard
cp .env.example .env
chmod 600 .env
```

Fill the server-only environment values. If the database provider requires a CA, install or mount it as documented by that provider; the current Compose file mounts certs/supabase-ca.crt read-only. Do not enable DATABASE_TLS_ALLOW_SELF_SIGNED in production.

Validate, build, migrate, and start:

```sh
cd /opt/positionguard
sudo docker compose config --quiet
sudo docker compose build --pull
sudo docker compose run --rm web npm run verify:env
sudo docker compose run --rm web npm run db:migrate:safe
sudo docker compose run --rm web npm run verify:db
sudo docker compose up -d --force-recreate --remove-orphans --wait --wait-timeout 180
```

db:migrate:safe serializes migration work with a PostgreSQL advisory lock and applies Prisma migrations. verify:db performs temporary database CRUD and cleanup; it is not a read-only connectivity check.

## Deploy an update

First run local quality gates and push the reviewed commit. On the VPS:

```sh
cd /opt/positionguard
git status --short
git pull --ff-only origin main
git log -1 --oneline
sudo docker compose config --quiet
sudo docker compose build --pull
sudo docker compose run --rm web npm run db:migrate:safe
sudo docker compose run --rm web npm run verify:db
sudo docker compose up -d --force-recreate --remove-orphans --wait --wait-timeout 180
```

Stop if git status reports unexpected local changes. A plain docker compose restart does not install changed code or environment values.

## Environment-only update

After securely editing /opt/positionguard/.env:

```sh
cd /opt/positionguard
sudo docker compose run --rm web npm run verify:env
sudo docker compose up -d --force-recreate --remove-orphans --wait --wait-timeout 180
```

Recreation is required because restart retains the container's old environment.

## Status, logs, and health

```sh
cd /opt/positionguard
sudo docker compose ps
sudo docker compose logs --tail=100 web
sudo docker compose logs --tail=100 worker
curl -fsS https://positionguard.online/api/health
```

Follow logs during an incident:

```sh
sudo docker compose logs --follow web worker
```

Expected production state:

- web and worker are healthy;
- the public health response contains status ok and service web;
- worker logs contain monitoring-worker-started, monitoring-cycle, and failed: 0;
- the product reports the worker ONLINE after its database heartbeat is fresh.

Autonomous lifecycle log events include autonomous-evaluation, autonomous-revalidation, autonomous-skipped, autonomous-simulation, autonomous-broadcast, autonomous-confirmed, and autonomous-failed.

## Worker controls and verification

```sh
cd /opt/positionguard
sudo docker compose stop worker
sudo docker compose start worker
sudo docker compose ps
sudo docker compose logs --tail=100 worker
```

The UI should become DEGRADED after roughly 30 seconds without a database heartbeat and OFFLINE after roughly 60 seconds. Starting the worker should return it to ONLINE after the next heartbeat.

Safe production configuration/read checks:

```sh
sudo docker compose run --rm web npm run verify:env
sudo docker compose run --rm web npm run verify:rpc
sudo docker compose run --rm web npm run verify:keeperhub
```

verify:db performs temporary CRUD. verify:autonomous writes monitoring data and runs KeeperHub simulation but explicitly does not broadcast. Do not run worker:monitor -- --once as a casual health check when a policy is enabled in AUTONOMOUS mode: it is an operational cycle and may execute.

## Reverse proxy and TLS

The Compose web port is bound to 127.0.0.1:3000, so expose it through the host reverse proxy. Terminate TLS there and forward Host, X-Forwarded-Proto, and the real client-address headers. This is required for secure cookies and accurate same-origin checks.

After proxy changes:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

No container rebuild is needed for an Nginx-only change.

## Rollback and incident response

Deploy a known-good Git commit with the same build/migrate/recreate workflow. Do not run destructive database rollback commands: Prisma migrations may not be safely reversible. If worker behavior is under investigation, stop only the worker; the web UI and persisted evidence remain available.

If KeeperHub status is ambiguous, preserve the UNCONFIRMED execution and idempotency key. Do not manually resubmit a new transaction. See [observability](observability.md), [safety](safety-model.md), and [the Base Sepolia runbook](base-sepolia-demo.md).
