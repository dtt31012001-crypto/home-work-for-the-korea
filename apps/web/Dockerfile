# syntax=docker/dockerfile:1
# Web (Next.js standalone). Build từ thư mục gốc repo: docker build -f apps/web/Dockerfile .
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG API_URL=http://api:4000
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
# CA bổ sung tùy chọn (proxy doanh nghiệp): docker build --secret id=extra_ca,src=ca.crt ...
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca pnpm install --frozen-lockfile --filter @th/web...
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter @th/contracts build && pnpm --filter @th/web build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
