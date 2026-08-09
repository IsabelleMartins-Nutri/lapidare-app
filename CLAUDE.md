# 🌿 Lapidare App — contexto pro Claude Code

> **Esse arquivo é lido automaticamente quando você abre Claude Code nessa pasta.**
> Dá o contexto inicial pra qualquer agente saber onde está e o que tá rolando.

---

## O QUE É

**Lapidare** é um **template open source** de plataforma completa pra **nutricionistas autônomas**.

- Cada nutri tem **o próprio deploy** (faz fork do GitHub + cria Supabase próprio + deploya no Netlify)
- Zero custo recorrente (tudo plano free)
- Distribuído via [github.com/danielasoares-rd/lapidare-app](https://github.com/danielasoares-rd/lapidare-app) (template original, mantido pela Daniela)
- Deploy de referência: [lapidareapp.netlify.app](https://lapidareapp.netlify.app)

**Este fork específico (Isabelle Martins):**
- Repositório: [github.com/IsabelleMartins-Nutri/lapidare-app](https://github.com/IsabelleMartins-Nutri/lapidare-app) (`origin`) — `upstream` aponta pro repo da Daniela, pra trazer atualizações do template quando ela lançar
- App publicado: [isabellemartins.netlify.app](https://isabellemartins.netlify.app)
- Clonado localmente em: `/Users/isabellemartins/Documents/lapidare-app`

---

## STACK

- **Frontend:** React 18 + Vite + React Router v6
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime + RLS)
- **Deploy:** Netlify
- **Estilo:** Plain CSS + design tokens (sem Tailwind)
- **PWA:** Instalável no celular (manifest + ícones)

---

## DUAS PERSONAS NO MESMO APP

| Persona | Rota | Layout |
|---------|------|--------|
| **Nutri** (dona do consultório) | `/nutri/*` | Desktop-first (sidebar) |
| **Paciente** (cliente da nutri) | `/paciente/*` | Mobile-only (PWA) |

---

## DOCUMENTAÇÃO INTERNA — LEIA ANTES DE QUALQUER MUDANÇA

Os arquivos abaixo têm o histórico completo do projeto. **Antes de fazer mudanças, leia esses primeiro:**

| Arquivo | O que tem |
|---------|-----------|
| [`NOTES.md`](NOTES.md) | **REGISTRO COMPLETO** — todas as decisões, bugs corrigidos, features, RPCs, schema, próximos passos. **FONTE DA VERDADE.** |
| [`README.md`](README.md) | Visão pública do projeto (pra quem chega de fora) |
| [`SETUP.md`](SETUP.md) | Passo a passo de setup pra novas nutris (workshop Fase 02) |
| [`CUSTOMIZAR.md`](CUSTOMIZAR.md) | Guia de como modificar o app com Claude Code (pra nutris) |

---

## ESTRUTURA DA PASTA

```
lapidare-app/
├── CLAUDE.md       # ← VOCÊ ESTÁ AQUI (orientação pro agente)
├── NOTES.md        # ← LEIA ESSE: histórico de decisões
├── README.md       # Visão pública
├── SETUP.md        # Tutorial passo a passo
├── CUSTOMIZAR.md   # Pra nutris modificarem o app
├── LICENSE         # MIT
├── package.json
├── vite.config.js
├── netlify.toml
├── index.html      # PWA meta tags
├── public/
│   ├── manifest.json    # PWA
│   ├── favicon.svg
│   ├── icon-*.png       # Ícones PWA (192/512)
│   └── apple-touch-icon.png
├── src/
│   ├── app/
│   │   ├── auth/        # Login, signup, callback
│   │   ├── nutri/       # 14 telas do painel da nutri
│   │   └── paciente/    # 11 telas do app da paciente
│   ├── components/      # NutriLayout, PacienteLayout, RequireAuth
│   ├── lib/             # supabase.js, session.jsx, theme.jsx, utils.js
│   ├── styles/          # tokens.css, nutri.css, paciente.css
│   └── main.jsx
└── supabase/
    └── setup.sql        # Schema completo (~1400 linhas, idempotente)
```

---

## REGRAS IMPORTANTES PRO AGENTE

### 1. SEMPRE leia `NOTES.md` antes de mudanças grandes
Tem 100% do histórico — bugs já corrigidos, decisões tomadas, próximos passos. Evita refazer trabalho ou quebrar coisas que já funcionavam.

### 2. Schema do Supabase é **idempotente**
O `setup.sql` pode ser rodado várias vezes sem perder dados. Usa `if not exists` em todas as criações. Sempre que mudar schema, mantém essa propriedade.

### 3. NUNCA gere SQL que apague dados sem confirmar com Daniela
- `DROP TABLE`, `TRUNCATE`, `DELETE` em produção → SEMPRE perguntar antes
- ALTER, CREATE, INSERT idempotentes → OK
- Mudanças de RPC (return type) precisam de `DROP FUNCTION` antes

### 4. Personalização visual é via banco, não código
A nutri customiza marca/cores/foto na tela `Personalização`. O `ThemeProvider` (`src/lib/theme.jsx`) lê isso e aplica via CSS variables. **NÃO hardcode cores ou nomes.**

### 5. Distribuição open source
Mudanças devem ser:
- **Idempotentes no banco** (rodar de novo é seguro)
- **Compatíveis com versões antigas** quando possível (graceful degradation)
- **Documentadas em NOTES.md** depois de implementar

### 6. Antes de fazer push pro GitHub, Daniela precisa gerar token
**NUNCA commitar/pushar sem pedir token novo** (ela tem que gerar manual em Settings → Developer settings → Personal access tokens). Depois do push, **lembrar ela de revogar o token**.

---

## FLUXO DE TRABALHO TÍPICO

1. **Daniela traz um bug ou feature**
2. **Você lê `NOTES.md`** pra ver se já tem histórico relacionado
3. **Investiga o código** com Read/Grep
4. **Propõe a solução** (não implementa direto se for grande)
5. **Implementa** depois de validar a abordagem
6. **Testa com `npm run build`** pra garantir que compila
7. **Pede token pro push** (Daniela gera, manda)
8. **Push** + lembra dela de revogar
9. **Atualiza `NOTES.md`** com a mudança feita

---

## CONTEXTO ATUAL — FORK DA ISABELLE (estado em ago/2026)

Isabelle usa esse fork sozinha, pro próprio consultório — não é o contexto multi-nutri da Daniela (essa seção descreve especificamente o uso dela, separado do "CONTEXTO" genérico do template lá em cima).

**Customizações já implementadas juntas** (além do que já vinha no template):
- Editor visual de plano alimentar (sem JSON) com busca de alimentos — base de dados própria (`alimentos`, populada com a tabela TACO enviada pela Daniela), autocompletar preenche kcal/macros
- Histórico de planos com ativar/desativar (mantém todos os planos antigos, só troca qual fica visível pra paciente) + prévia antes de publicar + editar/duplicar plano existente
- Aba "Meus alimentos" pra cadastrar alimentos próprios que não estão na base
- Aba "Benefícios" — cupons/parcerias cadastradas pela nutri, visíveis a todas as pacientes dela
- "Evolução relatada" — registro manual de hábitos/sintomas relatados pela paciente a cada consulta, com timeline dedicada e seção própria no Modo Apresentação
- Ajustes visuais: contraste do topbar, tamanho da logo na sidebar

**Sem lista fixa de "próximos passos"** — o trabalho aqui é conduzido pelo que a Isabelle pedir sessão a sessão, não por um roadmap predefinido.

---

## PROJETO IRMÃO (NÃO MISTURAR)

A Daniela também trabalha no **DS Company Dashboard** (`/Users/danielasoares/Desktop/dashboard-ds-company/`) — esse é o **negócio dela** (gerenciar mentoradas, financeiro do consultório dela, esteira de produtos).

**Esse aqui (Lapidare) é DIFERENTE** — é o produto que ela vende como template. Os contextos NÃO se misturam.

Se ela mencionar "DS Company", "esteira de serviços", "mentoradas", "Painel-Mentorada", "Arsenal de Stories/Carrosséis" → ela tá falando do OUTRO projeto. Avise educadamente que pra mexer naquilo é melhor abrir o outro Claude Code lá em `dashboard-ds-company`.

---

## ANTES DE QUALQUER FEATURE — SEMPRE CONFIRMAR COM A ISABELLE

Isabelle não tem background técnico/de programação. Pra qualquer feature nova — em planejamento OU em execução — **nunca parta direto pra implementar**. Antes de codar (ou antes de fechar um plano), sempre:

1. **Pergunte o que não estiver claro.** Não assuma o que ela quis dizer se der pra interpretar de mais de um jeito — pergunte (`AskUserQuestion`).
2. **Aponte conflitos.** Se o pedido esbarrar em algo que já existe, numa decisão anterior, ou numa limitação técnica real, avise antes de seguir — não tente "resolver por baixo dos panos".
3. **Confirme os detalhes da abordagem** antes de implementar (escopo, onde vai aparecer no app, o que muda pra ela/pras pacientes) — não só "o quê", mas "como vai ficar".
4. **Explique como pra alguém que não entende de tecnologia.** Sem jargão técnico sem explicação (SQL, RLS, merge, etc. só se necessário, e aí explicando o que é em 1 frase). Usa exemplos do dia a dia do consultório dela, não do código.

Isso vale tanto em plan mode quanto em conversas normais — o objetivo é nunca surpreendê-la com uma implementação que ela não entendeu ou não pediu daquele jeito.

---

## FLUXO DE TRABALHO — COMMITS E MERGES (Isabelle)

Esse fork é personalizado e mantido pela Isabelle Martins — as regras abaixo valem pro trabalho dela nesse repositório, além de tudo que já está escrito acima.

### 1. Padrão de commit pra mudanças customizadas
Toda mudança que a gente implementar juntos (uma feature nova, um ajuste que ela pediu) recebe uma mensagem de commit começando com `custom: `, seguida de uma descrição curta do que mudou. Exemplos:

```
custom: adiciona editor visual de plano alimentar
custom: adiciona aba de benefícios/cupons de parceiros
custom: corrige contraste do topbar no painel da nutri
```

**Por quê:** separa no `git log` tudo que é customização da Isabelle daquilo que vier de um merge do `upstream` (Daniela) — essencial pra resolver conflitos de forma clara quando ela sincronizar atualizações do template, e pra saber de cara a origem de qualquer mudança no histórico.

### 2. Testar antes de commitar
Antes de qualquer commit, rodar lint (`npx eslint` nos arquivos alterados) e build (`npx vite build`) pra confirmar que não quebrou nada.

### 3. Alertar sobre risco de sobrescrita em merges do upstream
Ao trazer atualizações da Daniela (`upstream`) — seja num merge de verdade, seja só analisando o que ela mudou antes de decidir trazer — se uma mudança dela for alterar ou sobrescrever algo que foi implementado com a Isabelle (mesmo arquivo/função, ou uma feature equivalente em outro lugar do código), **avisar explicitamente antes de aplicar**: explicar o que cada lado faz, e não decidir sozinho qual versão fica. Isso vale tanto pra conflitos que o Git já sinaliza automaticamente quanto pra sobreposições "silenciosas" (features parecidas em lugares diferentes do código, que o Git não marca como conflito).

---

_Última atualização: maio/2026 · Daniela Soares + Claude_
_Seções "Antes de qualquer feature — sempre confirmar com a Isabelle", "Fluxo de trabalho — commits e merges (Isabelle)" e dados do fork/contexto atual adicionadas em ago/2026, específicas pro fork da Isabelle Martins._
