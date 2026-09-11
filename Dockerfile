FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
FROM dependencies AS build
COPY . .
RUN npm run db:generate && npm run build
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN groupadd --system positionguard && useradd --system --gid positionguard positionguard
COPY --from=build --chown=positionguard:positionguard /app/.next/standalone ./
COPY --from=build --chown=positionguard:positionguard /app/.next/static ./.next/static
COPY --from=build --chown=positionguard:positionguard /app/scripts ./scripts
COPY --from=build --chown=positionguard:positionguard /app/src ./src
COPY --from=build --chown=positionguard:positionguard /app/node_modules ./node_modules
COPY --from=build --chown=positionguard:positionguard /app/package.json ./package.json
USER positionguard
CMD ["node", "server.js"]
