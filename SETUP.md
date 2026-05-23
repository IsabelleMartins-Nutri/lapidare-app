# 📘 Tutorial passo a passo — Setup do Lapidare

**Pra quem é:** nutricionistas (ou qualquer pessoa) que quer ter seu próprio app de acompanhamento nutricional, gratuito e privado.

**Tempo total:** ~30 minutos.

**Não precisa saber programar.** Só seguir os passos.

---

## ✅ Antes de começar — você vai precisar

- Computador com internet
- Email pessoal
- ~30 minutos sem interrupção

Vai criar contas grátis em 3 serviços:
- **Supabase** (banco de dados)
- **GitHub** (código)
- **Netlify** (hospedagem)

Todos têm planos gratuitos pra sempre. Você **não vai pagar nada**.

---

## Etapa 1 — Criar banco de dados no Supabase (10 min)

### 1.1 Criar conta
1. Acesse [supabase.com](https://supabase.com)
2. Clica em **Start your project**
3. Login com Google ou email

### 1.2 Criar projeto
1. **New project**
2. Preenche:
   - **Name**: `lapidare-suanome` (ex: `lapidare-ana`)
   - **Database password**: clica em **Generate** e **salva num lugar seguro** (gerenciador de senhas, anotação privada)
   - **Region**: `South America (São Paulo)` — importante pra velocidade
   - **Pricing Plan**: Free
3. Clica em **Create new project**
4. Aguarda ~2 minutos (vai mostrar "Setting up project")

### 1.3 Rodar o setup SQL
1. No menu lateral esquerdo, clica em **SQL Editor** (ícone que parece `>_`)
2. Clica em **+ New query** (canto superior direito)
3. Abre o arquivo [`supabase/setup.sql`](supabase/setup.sql) deste repositório
4. **Copia TUDO** (Cmd+A → Cmd+C)
5. **Cola** no SQL Editor do Supabase (Cmd+V)
6. Clica no botão **Run** (canto inferior direito, ou Cmd+Enter)
7. Esperado: caixinha verde com **"Success. No rows returned"**

> ⚠️ Se der erro, manda print do erro nos comentários do repositório.

### 1.4 Desabilitar confirmação de email
Importante pra teste e pra evitar limite de email.

1. Menu lateral → **Authentication** → **Sign In / Providers**
2. Procura **User Signups** (rola pra baixo se necessário)
3. **Desliga** a chave **"Confirm email"**
4. Clica em **Save changes**

### 1.5 Pegar credenciais
1. Ícone de engrenagem (canto inferior esquerdo) → **Project Settings**
2. Menu lateral → **API**
3. Copia e guarda em um arquivo de texto:
   - **Project URL**: `https://xyzabcd.supabase.co`
   - **anon public**: chave longa começando com `eyJ...`

---

## Etapa 2 — Fork do código no GitHub (5 min)

### 2.1 Criar conta no GitHub
1. Acesse [github.com](https://github.com) → **Sign up**
2. Confirma email

### 2.2 Fazer fork deste repositório
1. Acessa este repositório (link onde você baixou esse tutorial)
2. Canto superior direito → clica em **Fork**
3. Mantém o nome `lapidare-app`
4. Clica em **Create fork**

Pronto. Agora você tem o seu próprio repositório com o código do app.

---

## Etapa 3 — Hospedar no Netlify (10 min)

### 3.1 Criar conta
1. Acesse [netlify.com](https://netlify.com) → **Sign up**
2. Clica em **GitHub** (login pelo GitHub)
3. Autoriza o Netlify a ler seus repositórios

### 3.2 Conectar o repositório
1. **Add new site** → **Import an existing project**
2. **Deploy with GitHub**
3. Procura por `lapidare-app` e clica
4. Configurações de build (já vêm preenchidas — só confere):
   - **Branch to deploy**: `main`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`

### 3.3 Configurar variáveis de ambiente
**Antes de clicar em Deploy:**

1. Rola até **Environment variables**
2. **Add variable** → adiciona estas 2:

| Nome | Valor |
|------|-------|
| `VITE_SUPABASE_URL` | (a Project URL que você copiou do Supabase) |
| `VITE_SUPABASE_ANON_KEY` | (a anon key que você copiou) |

3. Clica em **Deploy site**
4. Aguarda ~2-3 min — vai mostrar "Site is live" em verde

### 3.4 Pegar a URL do seu site
- Endereço fica tipo `https://relaxed-eclair-xyz.netlify.app`
- Pra mudar o nome: **Site configuration** → **Change site name** → escolhe algo tipo `app-ana-nutri`

---

## Etapa 4 — Criar sua conta de nutri (2 min)

1. Acessa a URL do seu site Netlify
2. Vai cair na tela de Login
3. Clica em **Criar conta**
4. Preenche:
   - **Nome completo**: seu nome
   - **CRN**: número do seu CRN
   - **Email**: seu email pessoal
   - **Senha**: mínimo 6 caracteres
5. **Criar conta**
6. Vai entrar direto no painel da Visão geral

🎉 **Pronto, seu app está no ar!**

---

## Etapa 5 — Personalizar (5 min)

1. Menu lateral → **Personalização**
2. Coloca o nome da sua marca, sobe seu logo, escolhe cores e tipografia
3. **Salvar personalização**
4. Pronto — agora o app tem a cara da sua marca

---

## 📲 Como cadastrar suas primeiras pacientes

1. Menu lateral → **Cadastrar paciente**
2. Preenche os dados (nome, email, objetivo, plano, modalidade)
3. **Cadastrar e gerar link**
4. Clica em **Copiar link** ou **WhatsApp**
5. Envia pra paciente
6. Quando ela criar a senha pelo link, **já entra no app**

---

## 🆘 Problemas comuns

### "Bucket not found" ao subir arquivo
Faltou rodar parte do setup.sql. Volta na **Etapa 1.3** e roda o SQL inteiro de novo (é seguro repetir).

### "Email rate limit exceeded"
Você excedeu 3 emails/hora do Supabase grátis. **Etapa 1.4** desliga a confirmação de email, que evita esse problema. Confere se "Confirm email" está OFF.

### "Email não autorizado" ao cadastrar paciente
Algumas vezes o Supabase bloqueia emails do mesmo domínio. Use um email diferente ou um alias `+teste` (ex: `seuemail+ana@gmail.com`).

### App diz "Conectando..." sem fim
Conferir se as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no Netlify estão **idênticas** às do Supabase. Depois de mudar, **Trigger deploy** novamente.

---

## 🔄 Como atualizar quando sair versão nova

1. No GitHub do seu fork, clica em **Sync fork** (botão no topo da página)
2. No Supabase, roda o `setup.sql` atualizado de novo (é seguro)
3. Netlify faz redeploy automático

---

## 💰 Quando vou começar a pagar?

Resumo dos limites grátis:

| Serviço | Limite Free | Quando estoura |
|---------|-------------|----------------|
| **Supabase Database** | 500 MB | ~100 pacientes ativas por ANOS |
| **Supabase Storage** | 1 GB | ~500 fotos de evolução |
| **Supabase Email Auth** | 3/hora | Configurar SMTP próprio (Resend grátis) |
| **GitHub** | Ilimitado pra repos públicos | Nunca |
| **Netlify** | 100 GB/mês de banda | Praticamente nunca pra esse uso |

Pra maioria das nutris, **dá pra ficar grátis indefinidamente.**

---

## 🤝 Contribuir / reportar problema

Esse é um projeto open source. Se encontrar bug, abre uma issue no GitHub.
Se quiser contribuir com código, abre um Pull Request.
