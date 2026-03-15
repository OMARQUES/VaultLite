# AGENTS.md

## Projeto

VaultLite é um password manager open source, Cloudflare-first, zero-knowledge, voltado para uso pessoal, família, amigos e conhecidos.
Não é um produto enterprise.
A stack principal é:
- Web app: Vue 3 + TypeScript
- Extension: browser extension
- Backend: Cloudflare Workers
- Metadados: D1
- Blobs criptografados: R2

## Fonte da verdade

A principal fonte de verdade arquitetural é o plano mais recente em `docs/plans/`.
Se houver múltiplos arquivos de plano, use a versão mais recente.
Não contradiga o plano vigente.
Não invente arquitetura nova sem necessidade explícita.

## Princípios inegociáveis

- O sistema é zero-knowledge.
- O servidor nunca descriptografa o cofre.
- O admin/owner nunca tem acesso criptográfico ao vault dos usuários.
- Não existe recuperação de master password.
- O Account Kit ajuda em onboarding e bootstrap de novo dispositivo, não em reset de senha.
- Busca é local-only.
- Anexos são criptografados no cliente antes do upload.
- O projeto é single-tenant por deployment, com múltiplos usuários convidados e um vault primário por usuário.

## Terminologia canônica

Use estes termos de forma consistente:
- remote authentication
- local unlock
- session restoration
- expected_bundle_version
- deprovisioned

Não misture esses conceitos em código, docs ou contratos.

## Regras de implementação

- Leia o plano mais recente antes de implementar features estruturais.
- Em tarefas ambíguas ou grandes, use modo de planejamento primeiro.
- Prefira mudanças pequenas, localizadas e revisáveis.
- Não faça refactors amplos fora do escopo.
- Não crie abstrações extras sem necessidade real.
- Preserve a separação entre domain, crypto, contracts, adapters e apps.
- Não mover lógica criptográfica sensível para o servidor.

## Segurança

- Nunca enviar master password em claro.
- Nunca salvar token de autenticação em LocalStorage.
- Session policy web deve seguir o plano atual.
- Account Kit nunca pode conter:
  - master password
  - recovery secret que reseta senha
  - token administrativo
- Account Kit deve seguir integridade/autenticidade definidas no plano.
- Attachments devem seguir o lifecycle canônico definido no plano.
- User lifecycle deve respeitar os estados canônicos do plano.

## Testes

Test-first é obrigatório para:
- crypto
- auth
- sync
- password rotation

Smoke test é aceitável para:
- scaffold
- package wiring
- layouts e shells iniciais

Fluxos críticos devem ter:
- unit tests
- integration tests
- e2e mínimo quando aplicável

## Entrega esperada

Toda entrega deve incluir, quando aplicável:
- código
- testes
- atualização de docs mínimas
- resumo do que foi feito
- riscos, limitações ou pendências

## Estrutura do repositório

- `apps/` contém aplicações executáveis
- `packages/` contém domínio, crypto, contratos e abstrações
- `adapters/` contém integrações específicas de plataforma
- `docs/plans/` contém os planos de execução e arquitetura

## Quando estiver em dúvida

- Não improvise contratos de segurança.
- Não assuma comportamento implícito em auth, storage local, sync, Account Kit ou attachments.
- Consulte o plano vigente.
- Se a tarefa for grande, primeiro proponha estrutura, fases e impacto antes de editar arquivos.

# Status Workflow

## Objetivo
Este documento define como manter `status-card.md` atualizado durante o projeto.

## Quando atualizar
Atualize `status-card.md`:
- antes de começar uma tarefa relevante
- ao mudar o foco principal
- ao encontrar um bloqueio real
- ao concluir uma tarefa
- ao decidir algo operacional relevante

## Fluxo mínimo por tarefa
1. Identificar o card correto
2. Mudar status para `in_progress`
3. Executar trabalho
4. Atualizar notas/evidências/testes
5. Marcar `review_needed` ou `done`
6. Atualizar `Current Focus` e `Next Cards` se necessário

## Regras de status
- `not_started`: ainda não começou
- `in_progress`: trabalho ativo
- `blocked`: bloqueado por dependência real
- `review_needed`: implementado, aguardando revisão/validação
- `done`: concluído com evidência e critérios de aceite atendidos

## Quando escrever no Decision Log
Registre no `Decision Log` quando:
- uma decisão operacional mudar a ordem de execução
- um card for dividido
- um bloqueio exigir workaround
- uma limitação relevante for aceita conscientemente

Não use o `Decision Log` para progresso trivial.

## Quando atualizar Current Focus
Atualize `Current Focus` quando:
- a tarefa principal mudar
- um bloqueio mover a prioridade para outro card
- a fase ativa do projeto mudar

## O que nunca fazer
- não criar tarefa fora do `status-card.md` sem registrar
- não marcar `done` sem evidência
- não contradizer o plano-base
- não usar terminologia diferente da terminologia canônica do projeto