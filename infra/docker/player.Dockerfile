# Static player (QR landing + PWA) behind nginx; packs are served from a volume the API publishes into.
FROM node:22-bookworm-slim AS build
ENV CI=1 PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@rihla/player..." && pnpm --filter @rihla/player build

FROM nginx:1.27-alpine
COPY infra/nginx/player.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/player/dist /usr/share/nginx/html
RUN mkdir -p /usr/share/nginx/packs
EXPOSE 8080
