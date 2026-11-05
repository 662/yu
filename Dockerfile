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

FROM dependencies AS migrator
COPY src/lib/logging.ts ./src/lib/logging.ts
COPY drizzle ./drizzle
COPY scripts ./scripts
CMD ["pnpm", "db:migrate"]

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
USER node
EXPOSE 3000
CMD ["node", "server.js"]
