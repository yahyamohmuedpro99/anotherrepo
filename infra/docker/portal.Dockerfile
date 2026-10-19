# Portal (Next.js standalone). NEXT_PUBLIC_* values and the API rewrite are baked in at build time.
FROM node:22-bookworm-slim AS build
ENV CI=1 PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
ARG API_URL=http://api:4000
ARG NEXT_PUBLIC_PLAYER_URL=http://localhost:8080
ARG NEXT_PUBLIC_ROOMS_URL=ws://localhost:8080/rooms
ENV API_URL=${API_URL} NEXT_PUBLIC_PLAYER_URL=${NEXT_PUBLIC_PLAYER_URL} NEXT_PUBLIC_ROOMS_URL=${NEXT_PUBLIC_ROOMS_URL}
RUN pnpm install --frozen-lockfile --filter "@rihla/portal..." && pnpm --filter @rihla/portal build

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/portal/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/portal/.next/static ./apps/portal/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/portal/server.js"]
