#!/bin/sh
# Entrypoint do container: aplica as migrations pendentes (idempotente —
# db/migrations/*.sql só roda o que ainda não está em schema_migrations),
# garante o admin_ti inicial se as envs de seed estiverem definidas, e só
# então sobe o servidor Next.js. Roda em TODO start de container, então
# um redeploy no Dokploy já aplica migrations novas automaticamente.
#
# Ressalva: se um dia o app rodar com mais de uma réplica simultânea, duas
# instâncias tentando migrar ao mesmo tempo podem colidir na PK de
# schema_migrations — não é um problema com uma única réplica.
set -e

echo "[entrypoint] aplicando migrations..."
node_modules/.bin/tsx scripts/db-migrate.ts

if [ -n "$SEED_ADMIN_EMAIL" ] && [ -n "$SEED_ADMIN_NAME" ]; then
  echo "[entrypoint] verificando usuário admin_ti inicial..."
  node_modules/.bin/tsx scripts/seed-admin.ts
fi

echo "[entrypoint] iniciando Next.js..."
exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
