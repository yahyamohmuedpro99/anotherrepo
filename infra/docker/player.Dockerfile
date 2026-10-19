# Static player (QR landing + PWA) behind nginx; packs, API and rooms are proxied (upstreams set by env).
FROM node:22-bookworm-slim AS build
ENV CI=1 PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@rihla/player..." && pnpm --filter @rihla/player build

FROM nginx:1.27-alpine
ENV PORT=8080 API_UPSTREAM=http://api:4000 ROOMS_UPSTREAM=http://rooms:2567
COPY infra/nginx/player.conf.template /etc/nginx/templates/default.conf.template
COPY infra/nginx/15-resolver.envsh /docker-entrypoint.d/15-resolver.envsh
COPY --from=build /repo/apps/player/dist /usr/share/nginx/html
EXPOSE 8080
