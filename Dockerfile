# syntax=docker/dockerfile:1

# ---- deps: todas as dependências (dev incluídas — exigidas pelo build) ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compila o Next.js ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- prod-deps: só as dependências de produção (imagem final mais enxuta) ----
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runner: imagem final que roda em produção ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# node_modules de produção (inclui tsx, usado só pra rodar as migrations/seed
# no entrypoint — ver package.json) + build compilado + o que os scripts
# precisam em runtime: db/migrations/*.sql e lib/auth/password.ts (hash de
# senha, reaproveitado pelo scripts/seed-admin.ts).
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
# Sem pasta public/ neste projeto hoje — se um dia existir (ex.: favicon,
# assets estáticos), volte a copiá-la aqui: COPY --from=builder /app/public ./public
COPY package.json next.config.mjs ./
COPY db ./db
COPY scripts ./scripts
COPY lib/auth/password.ts ./lib/auth/password.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x docker-entrypoint.sh \
  && mkdir -p /data/storage \
  && chown -R nextjs:nodejs /app /data/storage

USER nextjs

EXPOSE 3000
ENV PORT=3000
# Caminho padrão do volume de storage (fotos de check-in, contratos) — monte
# um volume persistente do Dokploy neste path.
ENV STORAGE_ROOT=/data/storage

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/login" >/dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
