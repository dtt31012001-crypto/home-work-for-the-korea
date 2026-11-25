# syntax=docker/dockerfile:1
# Một dịch vụ Render chạy cả API (NestJS, cổng nội bộ 4000) và Web (Next.js, cổng $PORT).
# Trình duyệt chỉ gọi Web; Web chuyển /api/* sang API qua 127.0.0.1 → cookie cùng origin, không lộ API ra ngoài.
# Build từ thư mục gốc repo: docker build -f deploy/render/Dockerfile .
FROM node:22-bookworm AS base
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# CA bổ sung tùy chọn (proxy doanh nghiệp): docker build --secret id=extra_ca,src=ca.crt ...
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca pnpm install --frozen-lockfile --filter @th/api... --filter @th/web...
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter @th/contracts build

FROM base AS api
RUN pnpm --filter @th/api build \
 && pnpm --filter @th/api deploy --legacy --prod /out \
 && cp -r apps/api/dist apps/api/prisma apps/api/scripts /out/ \
 && cd /out && npx prisma generate --schema prisma/schema.prisma

FROM base AS web
ENV API_URL=http://127.0.0.1:4000 NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @th/web build

FROM node:22-bookworm AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=api --chown=node:node /out ./api
COPY --from=web --chown=node:node /repo/apps/web/.next/standalone ./web
COPY --from=web --chown=node:node /repo/apps/web/.next/static ./web/apps/web/.next/static
COPY --chown=node:node deploy/render/start.mjs ./start.mjs
USER node
EXPOSE 10000
CMD ["node", "start.mjs"]
