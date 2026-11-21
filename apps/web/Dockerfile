# Abhas Next.js 16 dashboard container (multi-stage, non-root)
FROM node:22-slim AS deps
WORKDIR /app/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts

FROM node:22-slim AS builder
WORKDIR /app/apps/web
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/apps/web/node_modules ./node_modules
COPY apps/web ./
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app/apps/web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/apps/web/package.json ./package.json
COPY --from=builder --chown=node:node /app/apps/web/next.config.ts ./next.config.ts
COPY --from=builder --chown=node:node /app/apps/web/public ./public
COPY --from=builder --chown=node:node /app/apps/web/.next ./.next
COPY --from=deps --chown=node:node /app/apps/web/node_modules ./node_modules

USER node
EXPOSE 3000

CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
