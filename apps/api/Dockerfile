# syntax=docker/dockerfile:1
# API (NestJS). Build từ thư mục gốc repo: docker build -f apps/api/Dockerfile .
# Ảnh đầy đủ (không phải -slim) đã có sẵn thư viện OpenSSL mà Prisma cần → không phụ thuộc kho apt lúc build.
FROM node:22-bookworm AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
# CA bổ sung tùy chọn (proxy doanh nghiệp): docker build --secret id=extra_ca,src=ca.crt ...
RUN --mount=type=secret,id=extra_ca,required=false \
    NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca pnpm install --frozen-lockfile --filter @th/api...
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @th/contracts build \
 && pnpm --filter @th/api build \
 && pnpm --filter @th/api deploy --legacy --prod /out \
 && cp -r apps/api/dist apps/api/prisma apps/api/scripts /out/ \
 && cd /out && npx prisma generate --schema prisma/schema.prisma

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
