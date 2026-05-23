# Lapidare — App de acompanhamento nutricional

Template open source de plataforma completa para nutricionistas.
Cada nutri tem **seu próprio painel + app das pacientes**, com banco
isolado e zero custo recorrente.

> Use, modifique, distribua livremente. Sem suporte oficial — esse é um
> projeto pessoal disponibilizado como template.

---

## ✨ O que tem dentro

### Painel da Nutri (desktop)
- 📊 Visão geral: receita do mês, meta, consultas da semana, alertas
- 👥 Pacientes: cadastro completo + perfil com 9 abas (Evolução, Follow-up, Plano, Compras, Suplementação, Prescrições, E-books, Avaliação, Check-in)
- 📅 Agenda com calendário mensal + links Meet/Shaped/Notion
- 💬 Chat realtime com cada paciente
- 📷 Feed de pratos (paciente posta, nutri comenta)
- 📋 Check-ins recorrentes + Questionários pré-consulta
- 📑 Prescrições em PDF + Biblioteca de e-books
- 💊 Suplementação com habit tracker (aderência %)
- 💰 Financeiro completo: entradas, saídas, previsibilidade, cérebro do negócio
- 🚨 Alertas relacionais: aniversário, sumiu do chat, baixa aderência etc.

### App da Paciente (mobile-first)
- 🏠 Início com banners de consulta, check-in pendente
- 🥗 Plano alimentar com substituições
- 🛒 Lista de compras
- 📷 Feed de pratos (posta refeições, recebe comentários da nutri)
- 📈 Progresso: peso, medidas, fotos de evolução
- 💊 Suplementos com check diário e streak
- 📑 Prescrições + E-books
- 💬 Chat realtime
- 📋 Check-in respondendo banner
- 📜 Termo de consentimento LGPD no primeiro acesso

### Stack
- **React 18 + Vite** (frontend)
- **Supabase** (Postgres + Auth + Storage + Realtime + RLS)
- **Netlify** (deploy)
- Plain CSS (sem Tailwind) com design system próprio

---

## 🚀 Setup completo — passo a passo

**Tempo total: ~30 minutos.** Não precisa saber programar.

### 1. Crie sua conta no Supabase (grátis pra sempre)

1. Acesse [supabase.com](https://supabase.com) → **Start your project**
2. Login com GitHub ou email
3. **New project** → escolhe nome (`lapidare-suanome`), senha forte do banco, região **São Paulo** (`sa-east-1`)
4. Aguarda ~2 min até subir

### 2. Rode o SQL de setup

1. No painel do Supabase, vai em **SQL Editor** (ícone no menu lateral)
2. Clica em **+ New query**
3. Abre o arquivo [`supabase/setup.sql`](supabase/setup.sql) deste repositório
4. **Copia tudo** (Cmd/Ctrl + A → Cmd/Ctrl + C)
5. Cola no SQL Editor → **Run** (canto inferior direito)
6. Esperado: `Success. No rows returned`

> 💡 O script é **idempotente** — pode rodar de novo quando atualizar o template, sem perder dados.

### 3. Pegue as credenciais do seu Supabase

1. **Project Settings** (ícone de engrenagem) → **API**
2. Copia:
   - **Project URL** (algo como `https://xyzabcd.supabase.co`)
   - **anon / public key** (chave longa)

### 4. Fork deste repositório no GitHub

1. No topo desta página do GitHub, clica em **Fork**
2. Escolhe seu usuário → cria fork

### 5. Deploy no Netlify (grátis)

1. Acesse [netlify.com](https://netlify.com) → **Sign up** com GitHub
2. **Add new site** → **Import an existing project** → **Deploy with GitHub**
3. Escolhe o seu fork do `lapidare-app`
4. Configurações de build (já vêm preenchidas pelo `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
5. **Site settings** → **Environment variables** → adiciona 2:

```
VITE_SUPABASE_URL=https://xyzabcd.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...
```

6. **Deploys** → **Trigger deploy** → aguarda 2-3 min
7. Seu app vai estar em `https://nome-do-site.netlify.app`

### 6. Crie sua conta de nutri

1. Abre o app na URL do Netlify
2. Tab **Criar conta** → preenche nome, CRN, email, senha
3. Confirma email (verifica spam)
4. Login → cai na **Visão geral** do painel
5. **Pronto!** Já dá pra cadastrar suas primeiras pacientes em **Cadastrar paciente**

### 7. (Opcional) Configurar email e domínio próprio

**Email automático do Supabase** (convites, recuperação de senha):
- O Supabase manda 3 emails/hora no plano grátis. Pra mais, configure SMTP próprio em **Project Settings → Authentication → SMTP**.

**Domínio próprio** (ex: `app.suamarca.com.br`):
- No Netlify: **Domain settings** → **Add custom domain**
- Configurar DNS conforme as instruções do Netlify

---

## 🔄 Como atualizar quando sair versão nova do template

1. No GitHub do seu fork, clica em **Sync fork** (botão fica no topo)
2. No Supabase, roda o `setup.sql` atualizado de novo (é idempotente)
3. O Netlify faz redeploy automático

---

## 🎨 Personalização

- **Cores e identidade**: edita `src/styles/tokens.css`
- **Logo/marca**: substitui o texto "Lapidare" em `src/app/auth/Login.jsx` e `src/components/NutriLayout.jsx`
- **Templates de check-in padrão**: edita `src/lib/checkinDefault.js`

---

## 📚 Estrutura do projeto

```
src/
├── app/
│   ├── auth/          # Login, signup, callback
│   ├── nutri/         # Painel da nutri
│   └── paciente/      # App da paciente
├── components/        # Layouts e componentes compartilhados
├── lib/               # Supabase client, helpers, validators
└── styles/            # CSS global + tokens

supabase/
├── setup.sql          # Schema completo (rode 1 vez)
└── migrations/        # Histórico de mudanças (referência)
```

---

## ⚖️ Limites do plano grátis Supabase

| Recurso | Limite | Quando estoura |
|---------|--------|----------------|
| Database | 500 MB | ~100 pacientes ativas por anos |
| Storage | 1 GB | ~500 fotos de evolução |
| Active users | 50.000/mês | irrelevante |
| Email Auth | 3/hora | configurar SMTP próprio (grátis no Resend) |

Quando estourar, o **Supabase Pro** sai US$ 25/mês (~R$ 130) com 8 GB DB + 100 GB storage.

---

## 🤝 Contribuir / reportar bug

Esse é um projeto **open source mantido pessoalmente**, sem garantia de suporte.

- **Bugs**: abra uma issue no GitHub
- **Pull requests** com melhorias são bem-vindas
- **Dúvidas de setup**: tenta primeiro em comunidades de devs (Discord, Stack Overflow). Se for algo realmente novo do projeto, pode abrir issue.

---

## 📜 Licença

[MIT](LICENSE) — use livremente, comercialmente ou pessoalmente.
Não precisa pedir permissão nem pagar.
