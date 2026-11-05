# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
RUN npm install --global pnpm@12.10.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=yu-pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --package-import-method=copy

FROM dependencies AS builder
COPY . .
RUN pnpm build

FROM dependencies AS migration-builder
COPY scripts/migrate.ts ./scripts/migrate.ts
COPY src/lib/logging.ts ./src/lib/logging.ts
RUN pnpm exec esbuild scripts/migrate.ts --bundle --platform=node --format=cjs --external:pg-native --outfile=/app/migrate.cjs

FROM base AS migrator
COPY --from=migration-builder /app/migrate.cjs ./migrate.cjs
COPY drizzle ./drizzle
USER node
CMD ["node", "migrate.cjs"]

FROM dependencies AS integration-test
COPY scripts ./scripts
COPY drizzle ./drizzle
CMD ["sh", "scripts/run-integration-suites.sh"]

FROM base AS oidc-test
COPY scripts/mock-oidc.mjs ./mock-oidc.mjs
USER node
CMD ["node", "mock-oidc.mjs"]

FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/docs/wiki ./docs/wiki
USER node
EXPOSE 3000
CMD ["node", "server.js"]
