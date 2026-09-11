# VPS deployment

PositionGuard runs as two long-lived services: the Next.js web application and the server-side monitoring worker. PostgreSQL is external (for example Supabase); Compose does not run a database container.

1. Install Docker Engine with the Compose plugin on the VPS.
2. Copy `.env.example` to `.env` and provide the external `DATABASE_URL`, private server RPC URLs, KeeperHub credentials, webhook credentials, and chain selection. Never prefix these values with `NEXT_PUBLIC_`.
3. Run `docker compose build`, `docker compose run --rm web npm run db:migrate`, then `docker compose up -d`.
4. Check `docker compose ps` and `docker compose logs --follow web worker`.

Both services use `restart: unless-stopped`, so they return after a host reboot or process failure. The web health check verifies the HTTP process and database. The worker health check verifies its heartbeat. SIGTERM/SIGINT trigger a structured shutdown log and interrupt the poll wait.

Terminate TLS at a reverse proxy and forward the original `Host`, `Origin`, and client address headers. Session cookies are HTTP-only, SameSite=Lax, and Secure in production. Restrict `.env` permissions and do not expose the database, RPC, KeeperHub, broadcast, development, or webhook secrets to browser code or container logs.
