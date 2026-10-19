# API, workers and rooms share one image; APP picks the service (api | workers | rooms).
# Runs TypeScript through tsx (as in development) to keep one code path; see docs/DECISIONS.md ADR-0017.
FROM node:22-bookworm-slim AS build
ENV CI=1 PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@rihla/api..." --filter "@rihla/workers..." --filter "@rihla/rooms..." \
 && pnpm --filter @rihla/pack-schema build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
RUN mkdir -p /data/packs && chown node:node /data/packs
WORKDIR /repo
COPY --from=build --chown=node:node /repo /repo
USER node
ARG APP=api
ENV APP=${APP}
EXPOSE 4000 2567
CMD ["/repo/infra/docker/start.sh"]
