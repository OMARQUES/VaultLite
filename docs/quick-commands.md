# VaultLite Quick Commands

## 1) Resetar e testar localmente

```bash
# no root do repo
npm install

# limpa estado local do wrangler (D1/R2 local)
npm run reset:local-state

# sobe API + Web no mesmo terminal
npm run dev:local
```

```bash
# testes
npm run test --workspace @vaultlite/contracts
npm run test --workspace @vaultlite/api
npm run test --workspace @vaultlite/web
npm run test --workspace @vaultlite/extension

# typecheck
npm run typecheck --workspace @vaultlite/contracts --if-present
npm run typecheck --workspace @vaultlite/web --if-present
npm run typecheck --workspace @vaultlite/extension --if-present
```

```bash
# smoke local (opcional)
npm run smoke:local-flow
```

## 2) Resetar Cloudflare (DESTRUTIVO)

```bash
# login
npx wrangler login
npx wrangler whoami

# apaga recursos antigos (se existirem)
# IMPORTANTE: use --name para não deletar o worker local do wrangler.toml
npx wrangler delete --name vaultlite-api-prod --env production
npx wrangler pages project delete vaultlite-web
npx wrangler d1 delete vaultlite-prod-db
npx wrangler r2 bucket delete vaultlite-prod-blobs
```

```txt
# R2: bucket só pode ser deletado se estiver vazio.
# Se der erro "bucket is not empty", escolha UMA opção:
# 1) Dashboard Cloudflare -> R2 -> bucket -> Empty bucket -> depois delete
# 2) Mais simples para teste: criar um bucket novo com outro nome e atualizar wrangler.toml
```

## 3) Criar recursos Cloudflare novamente

```bash
# cria DB e bucket
npx wrangler d1 create vaultlite-prod-db
npx wrangler r2 bucket create vaultlite-prod-blobs
```

```txt
# Se o bucket antigo não puder ser apagado:
# crie outro nome, por exemplo:
# npx wrangler r2 bucket create vaultlite-prod-blobs-v2
# e atualize bucket_name no wrangler.toml (env.production.r2_buckets)
```

```txt
# depois de criar o D1:
# copie o database_id retornado e atualize em wrangler.toml:
# [[env.production.d1_databases]]
# database_id = "<NOVO_DATABASE_ID>"
```

## 4) Configurar secrets da API (produção)

### 4.1 Gerar chave Account Kit (Ed25519)

```bash
openssl genpkey -algorithm ED25519 -out account-kit-private.pem
openssl pkey -in account-kit-private.pem -pubout -out account-kit-public.pem
```

### 4.2 Subir secrets no Worker

```bash
# token forte (troque pelo seu)
printf '%s' 'iMsExpJ4PzM3S9E38tULSIFHS40U57M8sPG-yFG5BbQU0svVL3aJG_pDwLoa5z_X' | npx wrangler secret put VAULTLITE_BOOTSTRAP_ADMIN_TOKEN --env production

# chaves account kit
cat account-kit-private.pem | npx wrangler secret put VAULTLITE_ACCOUNT_KIT_PRIVATE_KEY --env production
cat account-kit-public.pem  | npx wrangler secret put VAULTLITE_ACCOUNT_KIT_PUBLIC_KEY  --env production
```

## 5) Deploy da API (produção)

```bash
npx wrangler deploy --env production

# validar
curl https://vaultlite-api-prod.otavio-marques20.workers.dev/api/runtime/metadata
```

## 6) Deploy do Web (Pages)

```bash
# cria projeto pages (uma vez)
npx wrangler pages project create vaultlite-web --production-branch main

# define origem da API para o Pages Function proxy
printf '%s' 'https://vaultlite-api-prod.otavio-marques20.workers.dev' | npx wrangler pages secret put VAULTLITE_API_ORIGIN --project-name vaultlite-web

# build web
npm run build --workspace @vaultlite/web

# deploy web (IMPORTANTE: usar --cwd apps/web para incluir /functions)
npx wrangler pages deploy dist --project-name vaultlite-web --branch main --cwd apps/web
```

## 7) Ajuste final de origem pública

```txt
# em wrangler.toml (env.production.vars):
# VAULTLITE_SERVER_URL = "https://vaultlite-web.pages.dev"
```

```bash
# redeploy API depois de ajustar VAULTLITE_SERVER_URL
npx wrangler deploy --env production
```

## 8) Verificacoes finais

```bash
curl https://vaultlite-api-prod.otavio-marques20.workers.dev/api/runtime/metadata
curl https://vaultlite-web.pages.dev/api/bootstrap/state
```
