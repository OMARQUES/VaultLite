# VaultLite — Especificação de Redesign de UI/UX
> Baseado no estilo da webapp (Print 9) como referência canônica.

---

## 🎨 Design System Unificado

Antes de detalhar cada tela, o sistema de design que deve ser aplicado em **todas** as interfaces:

### Paleta de Cores

```
Backgrounds (camadas de profundidade):
  --bg-base:       #090b14   → fundo mais profundo (root da página)
  --bg-surface:    #111422   → cards, painéis, sidebar
  --bg-elevated:   #1a1e30   → inputs, itens de lista sem hover
  --bg-hover:      #1f2438   → hover de itens de lista/nav
  --bg-selected:   #2a4fd6   → item selecionado (sidebar/lista)

Texto:
  --text-primary:  #f0f2ff   → títulos e valores principais
  --text-secondary:#8b90ad   → labels, subtítulos, meta
  --text-muted:    #4f546b   → placeholders, desabilitados

Accent:
  --accent:        #3d63e8   → botão primário, foco, ícone ativo
  --accent-hover:  #2f53d4   → hover do botão primário
  --accent-glow:   rgba(61,99,232,0.25) → glow sutil em botões/inputs

Feedback:
  --success:       #2dd4a0   → "Signed and verified", badges ok
  --warning:       #f5a623   → alertas
  --danger:        #e84040   → erros, delete

Bordas:
  --border:        rgba(255,255,255,0.06)  → bordas de cards/inputs
  --border-focus:  rgba(61,99,232,0.7)    → borda de input em foco
```

### Tipografia

```
Font stack: 'Inter Variable', 'Geist', 'DM Sans', system-ui

Escala:
  --text-xs:   11px / uppercase / tracking: 0.08em  → labels de seção
  --text-sm:   13px / regular → meta, subtítulos
  --text-base: 14px / medium  → corpo, itens de lista
  --text-lg:   18px / semibold → subtítulos de card
  --text-xl:   22px / bold    → títulos de seção (ex: nome do item)
  --text-2xl:  32px / bold    → títulos de flow/heading principais
  --text-3xl:  42px / extrabold → logo na tela de login

Logo "VaultLite":
  font-weight: 800
  letter-spacing: -0.02em
  color: #f0f2ff
```

### Bordas & Raios

```
--radius-sm:  6px   → inputs, badges
--radius-md:  10px  → cards internos, itens de lista
--radius-lg:  16px  → cards principais, modais
--radius-full: 9999px → avatares, toggles, badges pill
```

### Espaçamentos

```
Padding de card principal: 32px 36px
Padding de seção de input: 20px 0
Gap entre campos: 20px
Padding de input: 12px 16px
```

### Animações Globais

```css
/* Transição padrão para cores e sombras */
transition: all 180ms cubic-bezier(0.4, 0, 0.2, 1);

/* Entrada de card/modal */
@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
animation: slideUp 240ms cubic-bezier(0.22, 1, 0.36, 1);

/* Hover em botão primário */
transform: translateY(-1px);
box-shadow: 0 6px 20px rgba(61,99,232,0.35);

/* Foco em input */
box-shadow: 0 0 0 3px rgba(61,99,232,0.25);
border-color: rgba(61,99,232,0.7);
```

---

## 📋 Navbar (Prints 1–5 — Contexto Bootstrap)

### Situação Atual
Logo à esquerda, links "Home | Onboarding | Add device" à direita. Estilo flat sem hierarquia visual.

### Redesign

**Layout:**
- `height: 56px`, `padding: 0 32px`
- `background: #090b14`, `border-bottom: 1px solid var(--border)`
- `backdrop-filter: blur(12px)` se sobre conteúdo com scroll

**Logo:**
- Texto "VaultLite", `font-size: 17px`, `font-weight: 800`, `letter-spacing: -0.02em`, `color: #f0f2ff`
- Adicionar um pequeno ícone de cadeado à esquerda do texto (SVG inline, cor `--accent`)

**Links de navegação:**
- `font-size: 13px`, `font-weight: 500`, `color: var(--text-secondary)`
- `gap: 4px` entre os links
- Cada link: `padding: 6px 12px`, `border-radius: var(--radius-sm)`
- **Hover:** `background: var(--bg-hover)`, `color: var(--text-primary)`, transição `180ms`
- **Active (página atual):** `background: rgba(61,99,232,0.15)`, `color: var(--accent)`
- Separador visual: linha `1px solid var(--border)` vertical entre links, ou apenas espaço de `gap: 8px`

---

## 🖥️ Tela 1 — Bootstrap: Initialize Deployment

### Situação Atual
Card centralizado, campo de bootstrap token com avatar à direita, botão "Verify deployment access".

### Redesign

**Fundo da página:**
- `background: var(--bg-base)` — quase preto com leve tom azulado
- Adicionar uma textura sutil: `background-image: radial-gradient(ellipse at 50% 0%, rgba(61,99,232,0.08) 0%, transparent 60%)` — um bloom azul suave vindo de cima

**Card principal:**
- `width: 480px`, `max-width: calc(100vw - 48px)`, centralizado vertical + horizontalmente
- `background: var(--bg-surface)` `(#111422)`
- `border: 1px solid var(--border)`
- `border-radius: var(--radius-lg)` `(16px)`
- `padding: 36px`
- `box-shadow: 0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)`
- Entrada com animação `slideUp` `240ms ease`

**Indicador de progresso (BOOTSTRAP · Step 1 of 2):**
- Remover o texto simples atual
- Adicionar dois segmentos de barra: `[████░░]`
  - Container: `height: 2px`, `background: var(--bg-elevated)`, `border-radius: 9999px`, `margin-bottom: 28px`
  - Segmento ativo: `width: 50%`, `background: var(--accent)`, animação de `width` ao trocar de passo
- Abaixo da barra, label: `"BOOTSTRAP · STEP 1 OF 2"`, `font-size: 11px`, `letter-spacing: 0.08em`, `text-transform: uppercase`, `color: var(--text-muted)`

**Heading "Initialize deployment":**
- `font-size: 28px`, `font-weight: 700`, `color: var(--text-primary)`, `letter-spacing: -0.02em`
- `margin: 8px 0 28px`

**Label do campo "Bootstrap token":**
- `font-size: 12px`, `font-weight: 500`, `color: var(--text-secondary)`, `margin-bottom: 6px`

**Input de Bootstrap token:**
- `width: 100%`, `height: 44px`, `padding: 0 16px`
- `background: var(--bg-elevated)` `(#1a1e30)`
- `border: 1px solid var(--border)`
- `border-radius: var(--radius-sm)` `(6px)`
- `color: var(--text-primary)`, `font-size: 14px`
- `font-family: 'Geist Mono', monospace` — token é código, usar monospace
- **Foco:** `border-color: var(--border-focus)`, `box-shadow: 0 0 0 3px var(--accent-glow)`, transição `180ms`
- **Remover o avatar "VL" dentro do input** — não faz sentido semântico aqui. Se for um indicador de sessão, mover para a navbar (já existe como ícone de usuário logado)

**Botão "Verify deployment access":**
- `width: 100%`, `height: 44px`, `margin-top: 20px`
- `background: var(--accent)` `(#3d63e8)`
- `color: #fff`, `font-size: 14px`, `font-weight: 600`
- `border-radius: var(--radius-sm)`
- **Hover:** `background: var(--accent-hover)`, `transform: translateY(-1px)`, `box-shadow: 0 6px 20px rgba(61,99,232,0.35)`, transição `180ms`
- **Active (click):** `transform: translateY(0)`, `box-shadow: none`
- **Loading state:** Substituir o texto por um spinner SVG inline (anel girando) + "Verifying…", `opacity: 0.7`, `cursor: not-allowed`

---

## 🖥️ Tela 2 — Bootstrap: Create Owner Account

### Situação Atual
Três campos: Username, Master password, Device name. Aviso de senha. Botão Continue.

### Redesign

**Card:**
- Mesmo estilo da Tela 1 (480px, bg-surface, border, shadow, slideUp)
- Indicador: `[████████]` — barra 100% preenchida (Step 2 de 2)

**Heading "Create owner account":**
- Mesmo estilo da Tela 1: `28px bold`

**Campos (Username, Master password, Device name):**

*Cada campo:*
- Label: `12px`, `font-weight: 500`, `color: var(--text-secondary)`, `margin-bottom: 6px`
- Input: mesma especificação da Tela 1
- `gap: 20px` entre os grupos de campo

*Ícones nos inputs:*
- Remover os avatares "VL" dos campos — eram confusos e fora de padrão
- No campo **Master password**, colocar um botão de toggle de visibilidade no `padding-right`:
  - Ícone olho (aberto/fechado), `color: var(--text-muted)`, `cursor: pointer`
  - **Hover:** `color: var(--text-primary)`

*Device name:*
- Valor padrão "Primary Browser" pré-preenchido
- Adicionar ícone de monitor/browser à esquerda dentro do input (`padding-left: 40px`), `color: var(--text-muted)`
- Campo editável mas com estilo levemente diferente para indicar que já tem valor sugerido

**Texto de aviso ("Forgotten master passwords can't be recovered"):**
- Remover o estilo flat atual
- Substituir por um bloco de alerta discreto:
  - `background: rgba(245,166,35,0.08)`, `border-left: 3px solid #f5a623`
  - `border-radius: 0 6px 6px 0`, `padding: 10px 14px`, `margin: 4px 0 20px`
  - Ícone de triângulo de aviso à esquerda do texto
  - Texto: `13px`, `color: #f5a623`

**Botão "Continue":**
- Mesma especificação do botão da Tela 1 (width 100%, accent, hover elevado)

---

## 🖥️ Tela 3 — Bootstrap: Save Account Kit (Loading)

### Situação Atual
Spinner "Preparing account kit...", checkbox, botão "Finish setup" desabilitado.

### Redesign

**Card:**
- Mesmo estilo base (mas pode ser ligeiramente mais largo: `520px`)

**Estado de loading:**
- Remover o spinner simples de borda atual
- Substituir por um **bloco de status animado**:
  - Container: `background: var(--bg-elevated)`, `border: 1px solid var(--border)`, `border-radius: var(--radius-md)` `(10px)`, `padding: 20px`
  - Linha 1: Ícone de chave (SVG inline) `color: var(--accent)` com animação `pulse` (opacity 0.4 → 1 → 0.4, 1.4s infinite)
  - Linha 2: Texto "Preparing account kit…" `14px`, `color: var(--text-secondary)`
  - Linha 3: Barra de progresso indeterminada animada:
    - Trilho: `height: 3px`, `background: var(--bg-hover)`, `border-radius: 9999px`
    - Preenchimento: animação de shimmer percorrendo da esquerda para a direita, `background: linear-gradient(90deg, transparent, var(--accent), transparent)`, largura `40%`, `animation: shimmer 1.4s ease infinite`

**Checkbox "I saved the Account Kit outside this browser":**
- Custom checkbox:
  - `width: 16px`, `height: 16px`, `border: 1.5px solid var(--border)`, `border-radius: 4px`
  - Quando marcado: `background: var(--accent)`, `border-color: var(--accent)`, ícone de check branco animado com `scale 0.5 → 1 + opacity 0 → 1`, `120ms ease`
  - Label: `13px`, `color: var(--text-secondary)`, ao lado do checkbox, `gap: 10px`

**Botão "Finish setup" — estado desabilitado:**
- `opacity: 0.35`, `cursor: not-allowed`, `background: var(--accent)` (mantém a cor mas opaco)
- **Não** mudar para cinza — o azul desabilitado com baixa opacidade é mais coerente com o design system

---

## 🖥️ Tela 4 — Bootstrap: Save Account Kit (Ready, não baixado)

### Situação Atual
Card "Account Kit ready" com badge "Signed and verified", botão de download, checkbox, botão Finish.

### Redesign

**Card de status "Account Kit ready":**
- Container: `background: var(--bg-elevated)`, `border: 1px solid rgba(45,212,160,0.2)` — borda esverdeada sutil para indicar sucesso
- `border-radius: var(--radius-md)`, `padding: 20px 24px`
- Entrada com animação: `slideUp 200ms ease` quando transicionar do estado de loading

*Lado esquerdo:*
- Ícone de shield com check: `color: var(--success)` `(#2dd4a0)`, `24px`
- Título "Account Kit ready": `16px`, `font-weight: 600`, `color: var(--text-primary)`, `margin-bottom: 4px`
- Sub: "Issued for omarques on development_deployment." — `13px`, `color: var(--text-secondary)`

*Lado direito:*
- Badge "Signed and verified":
  - `background: rgba(45,212,160,0.12)`, `border: 1px solid rgba(45,212,160,0.3)`
  - `color: #2dd4a0`, `font-size: 11px`, `font-weight: 600`, `letter-spacing: 0.04em`
  - `border-radius: 9999px`, `padding: 4px 12px`

**Botão "Download signed Account Kit":**
- `width: 100%`, `height: 44px`, `margin-top: 20px`
- `background: var(--accent)`, estilo idêntico ao botão primário padrão
- Ícone de download (arrow-down-to-line SVG, 16px) à esquerda do texto
- **Hover:** elevação + glow como padrão

**Checkbox:**
- Mesmo estilo da Tela 3
- Neste estado, ainda **desmarcada**

**Botão "Finish setup" — desabilitado:**
- Mesmo estilo desabilitado da Tela 3

---

## 🖥️ Tela 5 — Bootstrap: Save Account Kit (Baixado, concluindo)

### Situação Atual
"Download again", mensagem "Download started. Save it outside this browser.", checkbox marcado, Finish habilitado.

### Redesign

**Mudanças em relação à Tela 4:**

*Botão de download:*
- Muda de "Download signed Account Kit" → "Download again"
- Estilo: `background: var(--bg-elevated)`, `border: 1px solid var(--border)`, `color: var(--text-primary)` — botão secundário, pois a ação principal foi concluída
- **Hover:** `background: var(--bg-hover)`, sem glow

*Mensagem de confirmação:*
- Aparece com animação `fadeIn 200ms ease` abaixo do botão de download
- `"✓ Download started. Save it outside this browser."`
- `font-size: 13px`, `color: var(--success)`, ícone de check verde à esquerda

*Checkbox:*
- Pode ter sido marcada automaticamente após download, ou manual
- Quando marcada: animação de check (scale + opacity como descrito na Tela 3)

*Botão "Finish setup" — habilitado:*
- Retorna a `opacity: 1`, `cursor: pointer`
- Animação sutil ao habilitar: `transition: opacity 300ms ease, box-shadow 180ms`
- **Hover, Active:** padrão

---

## 🖥️ Tela 6 — Login (Web App)

### Situação Atual
Card centralizado com logo grande "VaultLite", ícone de usuário + username, input de senha com olho e botão de seta, device hashtag.

### Redesign

Este é o primeiro contato visual do usuário com o sistema após o bootstrap. Deve ser **elegante e minimalista**.

**Fundo da página:**
- `background: var(--bg-base)` `(#090b14)`
- Adicionar efeito de profundidade: dois círculos radiais de blur muito sutil
  - `radial-gradient(ellipse 600px 400px at 30% 60%, rgba(61,99,232,0.05) 0%, transparent 100%)`
  - `radial-gradient(ellipse 400px 300px at 70% 40%, rgba(61,99,232,0.04) 0%, transparent 100%)`

**Card de login:**
- `width: 400px`, `max-width: calc(100vw - 48px)`
- `background: var(--bg-surface)` `(#111422)`
- `border: 1px solid var(--border)`
- `border-radius: 20px`
- `padding: 40px 36px`
- `box-shadow: 0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)`
- Entrada: `slideUp 300ms cubic-bezier(0.22, 1, 0.36, 1)` + `opacity 0 → 1`

**Logo no card:**
- "VaultLite": `font-size: 36px`, `font-weight: 800`, `letter-spacing: -0.03em`, `color: #f0f2ff`
- `text-align: center`, `margin-bottom: 28px`
- Remover/reduzir o ícone do usuário que está muito grande — manter apenas como avatar compacto

**Bloco de usuário:**
- Container: `display: flex`, `align-items: center`, `gap: 10px`, `justify-content: center`, `margin-bottom: 24px`
- Avatar circular: `width: 32px`, `height: 32px`, `background: rgba(61,99,232,0.2)`, `border: 1.5px solid rgba(61,99,232,0.4)`, `border-radius: 9999px`
  - Ícone de pessoa dentro: `color: var(--accent)`, `16px`
- Username "omarques": `font-size: 16px`, `font-weight: 600`, `color: var(--text-primary)`

**Input de senha:**
- `height: 48px` (ligeiramente maior para tela de login — mais imponente)
- `padding: 0 50px 0 16px` — espaço para os ícones à direita
- `background: var(--bg-elevated)`
- `border: 1.5px solid var(--border)` — borda ligeiramente mais espessa para esta tela
- `border-radius: var(--radius-sm)`
- `color: var(--text-primary)`, `font-size: 15px`
- Placeholder "Enter your password": `color: var(--text-muted)`
- **Foco:** `border-color: var(--accent)`, `box-shadow: 0 0 0 3px var(--accent-glow)`
- **Ícone de olho:** `right: 48px`, `color: var(--text-muted)`, cursor pointer. Hover: `color: var(--text-primary)`
- **Botão de submit (seta →):**
  - Posicionado dentro do input, `right: 0`, altura total do input
  - `width: 48px`, `background: var(--accent)`, `border-radius: 0 6px 6px 0`
  - Ícone de arrow-right, `color: #fff`, `18px`
  - **Hover:** `background: var(--accent-hover)`, transição `180ms`
  - **Foco do input:** o botão ganha `box-shadow` alinhado com o glow do input

**Device tag (#Notebook):**
- Posicionado abaixo do input, `text-align: right`
- `font-size: 12px`, `color: var(--text-muted)`, `font-family: monospace`
- Prefix "#" em `color: var(--accent)`

**Micro-interação de erro (senha errada):**
- Input inteiro faz `shake` horizontal: `@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }` com `duration: 300ms`
- `border-color: var(--danger)`, `box-shadow: 0 0 0 3px rgba(232,64,64,0.2)`

---

## 🖥️ Tela 7 — Extensão: Primeiro Acesso (Pareamento)

> Contexto: popup de extensão de browser. Dimensões limitadas: ~380px largura, sem limite de altura definido mas recomendável manter em ~420px para caber em popups padrão.

### Situação Atual
Logo, texto explicativo, Server URL, Device name, botão de conectar.

### Redesign

**Container do popup:**
- `width: 360px`, `min-height: 360px`
- `background: var(--bg-surface)` `(#111422)` — o popup já é o "card"
- `padding: 24px`
- Sem bordas externas (o browser já define a borda do popup)

**Header:**
- "VaultLite": `font-size: 20px`, `font-weight: 800`, `letter-spacing: -0.02em`, `color: #f0f2ff`
- Ícone de cadeado SVG inline antes do texto, `18px`, `color: var(--accent)`, `margin-right: 8px`
- `margin-bottom: 6px`

**Texto descritivo:**
- "Start a trusted-device request and approve it in web settings."
- `font-size: 13px`, `color: var(--text-secondary)`, `line-height: 1.5`
- `margin-bottom: 20px`

**Campos Server URL e Device name:**
- Labels: `11px`, `uppercase`, `letter-spacing: 0.06em`, `color: var(--text-muted)`, `margin-bottom: 5px`
- Inputs: `height: 40px`, `padding: 0 12px`, `background: var(--bg-elevated)`, `border: 1px solid var(--border)`, `border-radius: 6px`
- Server URL: `font-family: monospace`, `font-size: 12px`, `color: var(--text-secondary)` — URLs são código
- Device name: `font-size: 13px`, `color: var(--text-primary)`
- `gap: 14px` entre os campos

**Botão "Connect with trusted device":**
- `width: 100%`, `height: 42px`, `margin-top: 20px`
- `background: var(--accent)`, `color: #fff`, `font-size: 14px`, `font-weight: 600`
- `border-radius: 6px`
- Ícone de link/chain à esquerda do texto
- **Hover:** `translateY(-1px)` + glow
- **Loading state:** spinner inline + "Connecting…"

**Divisor visual entre seções:**
- Linha `1px solid var(--border)` com texto "PAIR NEW DEVICE" em `10px uppercase` centrado — serve para dar contexto visual ao formulário

---

## 🖥️ Tela 8 — Extensão: Pareado (Login)

> Popup da extensão após pareamento. Idêntico em estrutura à Tela 6 (web login), mas adaptado para o tamanho do popup.

### Redesign

**Container:**
- `width: 360px`, `background: var(--bg-surface)`, `padding: 28px 24px`

**Logo:**
- "VaultLite": `font-size: 28px`, `font-weight: 800`, `letter-spacing: -0.02em`
- `text-align: center`, `margin-bottom: 20px`

**Bloco de usuário:**
- Avatar + username centralizados, igual à Tela 6 mas mais compacto
- Avatar: `28px`, username: `15px`

**Input de senha:**
- `height: 44px`, mesma estrutura da Tela 6 mas com `font-size: 14px`
- Botão de submit dentro do input (seta →): igual à Tela 6

**Device tag:**
- "#VaultLite Extension": `12px`, `color: var(--text-muted)`, `font-family: monospace`
- `text-align: right`, `margin-top: 8px`
- Prefix "#": `color: var(--accent)`

**Diferencial visual da extensão vs. webapp:**
- Adicionar uma linha de `2px solid var(--accent)` no topo do popup (full width) como indicador de que está conectado/online
- Pequeno badge `• Connected` no canto inferior esquerdo: `8px dot verde (var(--success))` + "development_deployment" em `11px`, `color: var(--text-muted)`

---

## 🔄 Resumo de Melhorias Globais de UX

| Problema atual | Solução |
|---|---|
| Avatar "VL" dentro de inputs | Remover — não tem função clara, polui o input |
| Indicador de step como texto simples | Barra de progresso animada de 2 segmentos |
| Botão desabilitado vira cinza | Mantém cor do accent com `opacity: 0.35` |
| Card sem sombra/profundidade | `box-shadow` multicamada para profundidade real |
| Inputs sem estado de foco visível | Ring de glow azul `+ border-color` em foco |
| Checkbox padrão do browser | Custom checkbox com animação de check |
| Textos de aviso em estilo flat | Bloco com `border-left` colorido e fundo tintado |
| Sem feedback de erro visual | Animação `shake` + borda vermelha |
| Ausência de microinterações | Hover com `translateY`, transições de `180ms` em todos elementos interativos |
| Spinner de loading genérico | Shimmer bar + ícone com pulse para estado de preparação |

---

## 🗂️ Ordem de Implementação Recomendada

1. **Design tokens** (CSS variables) — aplicar globalmente
2. **Tela 6** (Login web) — tela mais visível, define o tom visual
3. **Telas 1 e 2** (Bootstrap setup) — componentes de input/button reutilizáveis
4. **Telas 3, 4, 5** (Account Kit) — estados de um mesmo componente
5. **Telas 7 e 8** (Extensão) — adaptar componentes já criados para popup
