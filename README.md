# VaultLite

VaultLite e um gerenciador de senhas open source, zero-knowledge, owner-deployed e Cloudflare-first.

O projeto foi desenhado para uso pessoal ou para pequenos grupos de confianca, como familia, amigos ou equipes muito pequenas em um unico deployment controlado pelo owner. O servidor gerencia autenticacao, sessoes, metadados operacionais, blobs e sincronizacao, mas nao recebe o master password em plaintext nem decripta o cofre do usuario.

## Visao geral

O VaultLite combina tres superficies principais:

- `apps/web`: aplicacao web para onboarding, autenticacao, unlock, gerenciamento do cofre, anexos, import/export, administracao e configuracoes.
- `apps/api`: API em Cloudflare Workers, com contratos compartilhados, storage adapters, realtime e integracoes com D1, R2, Durable Objects e Queues.
- `apps/extension`: extensao Chromium MV3 com fluxo de pairing assistido pelo site, unlock local, listagem local-first, fill manual e `Open & Fill` inteligente.

## Funcionalidades principais

### Cofre

- Cofre privado por usuario no deployment.
- Tipos de item suportados:
  - `login`
  - `document`
  - `card`
  - `secure_note`
- CRUD do cofre com tombstones e politica explicita de sync.
- Busca local-only no cliente.
- Favoritos, pastas e estados de UI persistidos localmente.
- Historico de senha e sincronizacao incremental via realtime.

### Onboarding, trusted devices e autenticacao

- Inicializacao do deployment via bootstrap admin.
- Convites para novos usuarios.
- Onboarding com master password e Account Key.
- Exportacao e reissue de Account Kit para bootstrap de novo device.
- Separacao explicita entre:
  - `remote authentication`
  - `local unlock`
  - `session restoration`
- Trusted devices com controle de estado e revogacao.
- Fluxo especifico para extensao com pairing website-assisted e bearer session dedicada.

### Extensao Chromium

- Pairing com o deployment sem expor tokens sensiveis ao popup.
- Unlock local-first com cache local e revalidacao assincrona.
- Lista de credenciais orientada ao contexto da aba ativa.
- `Fill` manual quando o site atual e elegivel.
- `Open & Fill` inteligente:
  - se a aba atual ja e compativel, o botao efetivamente faz fill
  - se a aba atual nao e a correta, a extensao abre a URL e agenda o fill quando a navegacao termina
- Captura e reutilizacao de form metadata nao sensivel para melhorar heuristicas de preenchimento.
- Cache quente em `storage.session` e persistencia operacional em `storage.local` para sobreviver ao ciclo do service worker MV3.

### Importacao, exportacao e backup

- Importacao suportada de:
  - `vaultlite_json_export_v1`
  - `vaultlite_encrypted_backup_v1`
  - `vaultlite_login_csv_v1`
  - `bitwarden_csv_v1`
  - `bitwarden_json_v1`
  - `bitwarden_zip_v1`
  - `onepassword_1pux_v1`
- Exportacao deterministica em JSON plaintext para portabilidade.
- Backup criptografado com passphrase em formato `vaultlite.backup.v1`.
- Anexos incluidos no backup em modo `inline_encrypted_blobs`, sem descriptografar e reencriptar no servidor.

### Anexos

- Uploads iniciados e finalizados explicitamente.
- Criptografia do lado do cliente antes do upload.
- Armazenamento em R2.
- Validacao de envelope, tamanho e consistencia do upload.

### Administracao do deployment

- Console admin para overview, invites, usuarios e auditoria.
- Operacoes de lifecycle com separacao entre autoridade operacional e acesso criptografico.
- Deployment single-tenant por design em V1.

## Modelo de seguranca

O VaultLite parte de um modelo zero-knowledge com cliente confiavel e servidor nao confiavel para plaintext do cofre.

### Invariantes de seguranca

- O servidor nunca recebe o master password em plaintext.
- O servidor nunca recebe payloads descriptografados do cofre.
- O servidor nunca recebe bytes descriptografados de anexos.
- Busca plaintext nao roda no servidor.
- `remote authentication`, `local unlock` e `session restoration` continuam conceitos separados.
- O owner/admin pode operar o deployment, mas nao ganha autoridade criptografica sobre o cofre de outro usuario.

### O que o cliente faz

- Deriva chaves e executa o unlock local.
- Decripta payloads do cofre.
- Criptografa anexos antes do upload.
- Mantem o indice de busca local.
- Gera e valida artefatos locais necessarios ao trusted-device flow.

### O que o servidor faz

- Controla sessoes, invites, lifecycle, quotas e metadados operacionais.
- Persiste payloads e blobs cifrados.
- Mantem contratos de sync e realtime.
- Armazena metadados nao sensiveis para extensao, como icon state e form metadata estrutural.

### Extensao: fronteiras de privilegio

Seguindo a politica da extensao:

- o `background` e a autoridade sensivel
- `popup`, `options` e `content-script` operam com privilegios menores
- o `content-script` nao persiste segredos digitados
- o bearer da extensao e escopado para `extension`
- o allowlist de endpoints bearer e explicito

### Persistencia local e fail-closed

- `LocalStorage` nao deve conter segredos de autenticacao ou sessao.
- O estado local confiavel segue allowlist explicita.
- O unlock local usa envelope cifrado, nao `accountKey` persistido em plaintext.
- Em producao, a runtime falha fechada quando faltam pre-condicoes criticas, como:
  - bootstrap token forte
  - keypair do Account Kit
  - bindings de storage esperados

## Arquitetura

### Runtime e storage

- Web app: `Vue 3 + TypeScript + Vite`
- API: `Hono` rodando em `Cloudflare Workers`
- Banco relacional: `Cloudflare D1`
- Blob storage: `Cloudflare R2`
- Realtime: `Durable Objects + WebSockets`
- Trabalho assincrono: `Cloudflare Queues`
- Extensao: `Chromium MV3`
- Testes: `Vitest`

### Monorepo

```txt
/apps
  /api
  /extension
  /web

/packages
  /contracts
  /crypto
  /domain
  /runtime-abstractions
  /storage-abstractions
  /test-utils

/adapters
  /cloudflare-runtime
  /cloudflare-storage

/infrastructure
  /migrations
  /scripts

/docs
  /adr
  /plans
  /testing
```

### Responsabilidades por camada

- `packages/domain`: entidades, invariantes e vocabulario canonico.
- `packages/crypto`: crypto helpers, Account Kit, envelopes, KDF policy e utilitarios criptograficos.
- `packages/contracts`: schemas e contratos compartilhados entre web, API e extensao.
- `packages/storage-abstractions`: interfaces e repositorios logicos.
- `adapters/cloudflare-storage`: implementacoes de D1 e R2.
- `adapters/cloudflare-runtime`: integracao com runtime de Worker.
- `apps/api`: borda HTTP, autenticao, sync, realtime, anexos, admin, pairing e endpoints da extensao.
- `apps/web`: UX confiavel para onboarding, cofre, settings e admin.
- `apps/extension`: popup, background, content scripts e runtime local-first.

## Como a hospedagem funciona na Cloudflare

O projeto foi desenhado explicitamente para Cloudflare em V1.

### API

A API e publicada como `Cloudflare Worker` usando `wrangler.toml`.

Bindings principais no repo hoje:

- `D1` para metadados relacionais do produto
- `R2` para blobs de anexos
- `Durable Object` para hub de realtime
- `Queue` para trabalho assincrono de descoberta/sincronizacao de icones

### Web

O frontend web e empacotado com Vite e publicado em `Cloudflare Pages`.

O deployment em Pages pode usar:

- assets estaticos para o shell web
- Pages Functions quando necessario
- configuracao da origem da API por secret do projeto

### Realtime

O modelo de realtime roda em cima de:

- endpoint de connect-token na API
- WebSocket autenticado
- Durable Object como coordenador stateful para eventos delta

Isso permite:

- sync incremental
- patches por dominio funcional
- aplicacao seletiva em web e extensao
- evitar refresh amplo desnecessario

### Storage

- `D1`: estado de autenticacao, sessoes, devices, invites, metadados, vault metadata e outros registros operacionais.
- `R2`: armazenamento de blobs de anexos cifrados.
- `Queues`: trabalho assincrono e desacoplado, hoje usado no pipeline de icones.

### Configuracao e ambiente

O `wrangler.toml` do repo ja define:

- ambiente local de desenvolvimento
- ambiente `production`
- variaveis de runtime
- bindings de D1, R2, Durable Objects e Queues

Para producao, o projeto exige configuracao explicita de secrets e falha fechada quando posture de seguranca esta fraca.

## Estrategia de UX e preenchimento na extensao

O VaultLite nao tenta transformar V1 em autofill invisivel e arriscado.

Diretrizes atuais:

- `Fill` e user-triggered
- o background e a autoridade sensivel
- o popup e local-first
- o pipeline de fill e unico
- o `Open & Fill` reaproveita o mesmo core de fill
- metadados de formulario sao estruturais e nao carregam valores sensiveis

Com a implementacao mais recente:

- a extensao pode capturar `form metadata` nao sensivel
- persistir esse metadata autenticado no deployment
- sincronizar deltas via realtime
- reutilizar o conhecimento entre sessoes e devices

## Desenvolvimento local

### Requisitos

- `Node.js`
- `npm`
- `pnpm` como package manager definido no repo
- `Wrangler`

### Setup rapido

```bash
npm install
npm run reset:local-state
npm run dev:local
```

Isso sobe:

- API local em Worker dev
- app web em Vite

Scripts uteis:

```bash
npm run dev:api
npm run dev:web
npm run local:invite
npm run validate:migrations
npm run smoke:local-flow
```

## Testes e qualidade

O repo usa `Vitest` e `TypeScript` em workspaces separados.

Comandos principais:

```bash
npm run test --workspace @vaultlite/contracts
npm run test --workspace @vaultlite/api
npm run test --workspace @vaultlite/web
npm run test --workspace @vaultlite/extension

npm run typecheck --workspace @vaultlite/contracts --if-present
npm run typecheck --workspace @vaultlite/web --if-present
npm run typecheck --workspace @vaultlite/extension --if-present
```

Tambem existem scripts operacionais para:

- reset de estado local
- emissao de invite local
- validacao de migrations
- smoke flow de desenvolvimento
- analise de logs do ambiente local

## Fluxo de deploy

Resumo do fluxo atual:

1. criar ou recriar recursos Cloudflare
2. configurar secrets do Worker
3. fazer deploy da API com Wrangler
4. buildar e publicar o app web no Pages
5. validar metadata da runtime e bootstrap state

O guia operacional de referencia esta em:

- [docs/quick-commands.md](docs/quick-commands.md)

## Escopo de produto

### Em escopo no V1

- onboarding por invite
- master password + Account Key
- Account Kit para bootstrap/trusted device
- trusted devices
- vault CRUD
- login, document, card e secure note
- anexos cifrados
- busca local-only
- import/export e backup
- extensao Chromium MV3
- sync e realtime
- operacoes admin basicas de deployment

### Fora de escopo no V1

- multi-tenant SaaS
- shared vaults
- passkeys
- enterprise SSO, SCIM ou SIEM
- email-based recovery
- admin recovery do cofre do usuario
- app mobile nativo

## Documentacao importante

- [docs/PRD.md](docs/PRD.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)
- [docs/quick-commands.md](docs/quick-commands.md)
- [docs/IMPORT_FORMATS.md](docs/IMPORT_FORMATS.md)
- [docs/EXPORT_JSON_FORMAT.md](docs/EXPORT_JSON_FORMAT.md)
- [docs/BACKUP_FORMAT.md](docs/BACKUP_FORMAT.md)
- [docs/testing/release-checklist.md](docs/testing/release-checklist.md)
- [docs/adr](docs/adr)
- [docs/plans](docs/plans)

## ADRs mais relevantes

- [ADR 0001 - Deployment target](docs/adr/0001-deployment-target.md)
- [ADR 0003 - Auth protocol and session model](docs/adr/0003-auth-protocol-and-session-model.md)
- [ADR 0006 - Local storage policy](docs/adr/0006-local-storage-policy.md)
- [ADR 0011 - Extension auth, session, and manual fill policy](docs/adr/0011-extension-auth-and-fill-policy.md)

## Filosofia do projeto

VaultLite prioriza:

- zero-knowledge real, nao marketing
- baixo custo operacional para um owner-deployment
- separacao clara de fronteiras de confianca
- UX local-first quando isso nao enfraquece a seguranca
- documentacao e ADRs como parte do produto, nao como pos-facto

Se voce quiser entender a arquitetura antes de rodar o projeto, comece por `PRD`, `ARCHITECTURE`, `SECURITY` e `THREAT_MODEL`.
