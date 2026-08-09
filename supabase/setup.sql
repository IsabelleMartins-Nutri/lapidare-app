-- =============================================================
-- LAPIDARE · Setup do Supabase
-- =============================================================
-- Cole este arquivo INTEIRO em:
--   Supabase → SQL Editor → New query → Run
--
-- Roda em ~5 segundos. Pode ser executado várias vezes sem erro
-- (idempotente). Cria:
--   • 10 tabelas (nutris, pacientes, planos, listas_compras,
--     prescricoes, mensagens, peso_registros, feed_pratos,
--     vendas, parcelas)
--   • Índices para consultas comuns
--   • Row Level Security em TODAS as tabelas
--   • Políticas: nutri só vê próprias pacientes;
--                paciente só vê próprios dados
--   • Trigger handle_new_user(): ao aceitar convite,
--     usuário é inserido em `nutris` ou `pacientes` automaticamente
--     conforme o user_metadata enviado no invite.
--   • 2 buckets de Storage (prescricoes, fotos_pratos) + políticas
-- =============================================================


-- =============================================================
-- 1. EXTENSIONS
-- =============================================================
create extension if not exists pgcrypto;

-- Tenta habilitar pg_cron pra check-ins automáticos.
-- Se não conseguir (sem permissão), o script continua normalmente — só
-- não terá agendamento automático (precisa enviar check-ins manualmente).
do $$
begin
  create extension if not exists pg_cron;
  raise notice 'pg_cron habilitado: check-ins automáticos vão funcionar.';
exception when others then
  raise notice 'pg_cron não pôde ser habilitado automaticamente. Pra ativar check-ins automáticos, habilite manualmente em Database → Extensions → pg_cron e rode esse setup de novo.';
end$$;


-- =============================================================
-- 2. TABELAS
-- =============================================================

-- 2.1 Nutricionistas ------------------------------------------------
create table if not exists public.nutris (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null,
  crn           text,
  email         text not null,
  meta_mensal         numeric(10,2),
  gastos_fixos        numeric(10,2),
  ticket_medio_alvo   numeric(10,2),
  horas_semanais      integer,
  created_at          timestamptz not null default now()
);
-- Compat: adiciona colunas de previsibilidade se já existia
alter table public.nutris add column if not exists meta_mensal         numeric(10,2);
alter table public.nutris add column if not exists gastos_fixos        numeric(10,2);
alter table public.nutris add column if not exists ticket_medio_alvo   numeric(10,2);
alter table public.nutris add column if not exists horas_semanais      integer;
-- v1.14.0+v1.14.1: listas customizáveis pela nutri (aparecem no cadastro de paciente)
alter table public.nutris add column if not exists objetivos    jsonb
  default '["Emagrecimento", "Hipertrofia", "Reeducação alimentar", "Saúde geral", "Performance esportiva"]'::jsonb;
alter table public.nutris add column if not exists tipos_plano  jsonb
  default '["Trimestral", "Semestral", "Consultoria", "Acompanhamento"]'::jsonb;
alter table public.nutris add column if not exists modalidades  jsonb
  default '["Presencial", "Online", "Híbrido"]'::jsonb;
-- v1.24.0: questionário de pré-cadastro (preenchido pelo futuro paciente,
-- via link público, antes de existir qualquer registro no sistema)
alter table public.nutris add column if not exists intake_perguntas jsonb;

-- 2.2 Pacientes -----------------------------------------------------
create table if not exists public.pacientes (
  id          uuid primary key references auth.users(id) on delete cascade,
  nutri_id    uuid not null references public.nutris(id) on delete cascade,
  nome        text not null,
  email       text not null,
  objetivo    text,
  tipo_plano  text,
  modalidade  text,
  sexo        text default 'feminino' check (sexo in ('feminino', 'masculino')),
  created_at  timestamptz not null default now()
);
create index if not exists pacientes_nutri_id_idx on public.pacientes(nutri_id);

-- 2.3 Planos alimentares -------------------------------------------
create table if not exists public.planos (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  dados         jsonb not null,
  validade      date,
  publicado_em  timestamptz not null default now()
);
create index if not exists planos_paciente_id_idx on public.planos(paciente_id, publicado_em desc);
create index if not exists planos_nutri_id_idx on public.planos(nutri_id);
-- v1.27.0: só 1 plano "ativo" (visível pra paciente) por vez — antes disso
-- era implícito (sempre o mais recente); agora é explícito e reversível.
-- Coluna nova entra com default FALSE (não dá pra usar default true aqui:
-- se a paciente já tem vários planos acumulados, todos ficariam "ativos"
-- de uma vez, o que quebraria o índice único abaixo).
alter table public.planos add column if not exists ativo boolean not null default false;
-- Backfill: ativa só o plano mais recente de cada paciente (replica
-- exatamente o comportamento implícito que já existia — "sempre o mais
-- recente"), pra não mudar nada do que a paciente já está vendo hoje.
update public.planos p set ativo = true
  where p.publicado_em = (
    select max(p2.publicado_em) from public.planos p2 where p2.paciente_id = p.paciente_id
  )
  and not exists (select 1 from public.planos p3 where p3.paciente_id = p.paciente_id and p3.ativo);
create unique index if not exists planos_ativo_unico_idx on public.planos(paciente_id) where ativo;

-- 2.3-b Substituições (separadas do plano pra evitar JSON gigante + bugs) ----
-- dados: jsonb com formato [{ alimento, medida?, substituicoes: string[] }]
create table if not exists public.substituicoes (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  dados         jsonb not null,
  publicado_em  timestamptz not null default now()
);
create index if not exists substituicoes_paciente_id_idx on public.substituicoes(paciente_id, publicado_em desc);
create index if not exists substituicoes_nutri_id_idx on public.substituicoes(nutri_id);

-- 2.3-c Alimentos (base de busca pro editor visual de plano) -------
-- Tabela compartilhada: nutri_id null = alimento "global" (visível pra
-- todas as nutris), nutri_id preenchido = alimento próprio, cadastrado
-- só por aquela nutri (em "Meus alimentos"). kcal/prot_g/cho_g/lip_g
-- se referem à quantidade descrita em medida_padrao.
create table if not exists public.alimentos (
  id             uuid primary key default gen_random_uuid(),
  nutri_id       uuid references public.nutris(id) on delete cascade,
  nome           text not null,
  medida_padrao  text,
  kcal           numeric(7,1),
  prot_g         numeric(6,1),
  cho_g          numeric(6,1),
  lip_g          numeric(6,1),
  fibra_g        numeric(6,1),
  created_at     timestamptz not null default now()
);
create index if not exists alimentos_nome_idx on public.alimentos(lower(nome));
create index if not exists alimentos_nutri_id_idx on public.alimentos(nutri_id);

-- Seed: base TACO (Tabela Brasileira de Composição de Alimentos, 4ª ed.,
-- NEPA/UNICAMP) — 372 alimentos, valores conforme porção indicada em
-- medida_padrao. Fonte enviada pela Daniela (taco_alimentos.json).
-- Idempotente: apaga só os alimentos globais (nutri_id is null) antes de
-- reinserir, pra rodar esse delta de novo não duplicar nada nem apagar
-- alimentos próprios que a nutri já tenha cadastrado (esses têm nutri_id).
delete from public.alimentos where nutri_id is null;

insert into public.alimentos (nome, medida_padrao, kcal, prot_g, cho_g, lip_g, fibra_g) values
  ('Arroz branco cozido', '2 col sopa (80g)', 128, 2.5, 28.1, 0.2, 1.6),
  ('Arroz integral cozido', '2 col sopa (80g)', 124, 2.6, 25.8, 1.0, 2.7),
  ('Arroz parboilizado cozido', '2 col sopa (80g)', 130, 2.6, 28.4, 0.3, 1.8),
  ('Macarrao cozido', '2 col servir (120g)', 141, 4.7, 28.1, 0.9, 1.8),
  ('Macarrao integral cozido', '2 col servir (120g)', 134, 5.3, 26.0, 1.1, 4.5),
  ('Pao frances', '1 unidade (50g)', 300, 8.0, 58.6, 3.1, 2.3),
  ('Pao integral', '1 fatia (25g)', 253, 8.1, 48.0, 3.4, 5.4),
  ('Pao de forma branco', '1 fatia (25g)', 266, 8.1, 50.6, 3.4, 2.3),
  ('Pao de queijo', '1 unidade (25g)', 293, 5.0, 44.3, 10.6, 0.5),
  ('Tapioca (goma hidratada)', '1 unidade media (70g)', 338, 0.2, 83.9, 0.1, 0.0),
  ('Aveia em flocos', '4 col sopa (40g)', 394, 13.9, 66.6, 8.5, 9.1),
  ('Granola tradicional', '3 col sopa (30g)', 420, 9.2, 67.3, 13.5, 6.2),
  ('Cuscuz milho cozido', '1 escumadeira (100g)', 100, 2.1, 21.8, 0.4, 1.8),
  ('Fuba cozido (angu)', '1 escumadeira (120g)', 58, 1.3, 13.0, 0.3, 1.2),
  ('Biscoito cream cracker', '3 unidades (30g)', 454, 9.5, 65.2, 16.7, 2.1),
  ('Biscoito agua e sal', '3 unidades (30g)', 426, 8.8, 70.1, 12.3, 1.8),
  ('Cereal matinal tradicional', '4 col sopa (30g)', 380, 7.0, 85.3, 1.1, 2.4),
  ('Farinha de mandioca crua', '2 col sopa (30g)', 361, 1.5, 88.0, 0.4, 6.5),
  ('Farinha de trigo', '1 col sopa (15g)', 360, 9.8, 75.1, 1.4, 2.3),
  ('Polenta cozida', '1 fatia (100g)', 71, 1.8, 14.7, 0.7, 1.4),
  ('Quinoa cozida', '4 col sopa (100g)', 120, 4.4, 21.3, 1.9, 2.8),
  ('Batata-doce cozida', '1 unidade media (100g)', 77, 1.4, 17.7, 0.1, 2.2),
  ('Batata inglesa cozida', '1 unidade media (100g)', 52, 1.2, 11.9, 0.1, 1.5),
  ('Batata frita', '1 porcao (100g)', 274, 3.4, 32.0, 15.2, 2.7),
  ('Mandioca cozida', '1 porcao (100g)', 125, 0.6, 30.1, 0.3, 1.9),
  ('Inhame cozido', '1 porcao (100g)', 101, 1.5, 24.5, 0.1, 1.8),
  ('Aipim frito', '1 porcao (100g)', 220, 1.2, 35.0, 8.5, 2.0),
  ('Milho cozido', '1 espiga media (100g)', 95, 3.2, 18.5, 1.4, 2.0),
  ('Pao de centeio', '1 fatia (25g)', 259, 8.5, 48.3, 3.3, 6.0),
  ('Pao australiano', '1 fatia (30g)', 268, 7.8, 52.0, 3.2, 4.5),
  ('Pao sem glutem', '1 fatia (30g)', 220, 2.5, 46.0, 2.8, 2.0),
  ('Torrada integral', '3 unidades (30g)', 340, 11.0, 62.0, 4.5, 6.0),
  ('Biscoito de arroz', '3 unidades (30g)', 381, 7.0, 83.0, 2.0, 1.5),
  ('Macarrao de arroz cozido', '2 col servir (120g)', 138, 2.8, 31.0, 0.2, 1.0),
  ('Pipoca sem manteiga', '1 xicara (15g)', 375, 11.0, 74.0, 4.5, 14.5),
  ('Creme de arroz', '1 porcao (200mL)', 68, 1.2, 15.5, 0.2, 0.3),
  ('Farelo de aveia', '2 col sopa (20g)', 246, 17.3, 55.0, 7.0, 15.0),
  ('Grao de bico farinha', '2 col sopa (30g)', 387, 22.4, 57.8, 6.7, 10.8),
  ('Batata doce roxa cozida', '1 porcao (100g)', 80, 1.5, 18.5, 0.1, 2.5),
  ('Cará cozido', '1 porcao (100g)', 96, 1.5, 23.0, 0.1, 1.7),
  ('Pao de milho', '1 fatia (30g)', 248, 5.2, 46.5, 4.8, 2.8),
  ('Crepioca tapioca e ovo', '1 unidade (80g)', 170, 9.5, 21.5, 5.5, 0.2),
  ('Panqueca de aveia e banana', '2 unidades (100g)', 185, 7.0, 32.5, 4.0, 3.5),
  ('Feijao preto cozido', '1 concha (86g)', 77, 4.5, 14.0, 0.5, 8.4),
  ('Feijao carioca cozido', '1 concha (86g)', 76, 4.8, 13.6, 0.5, 8.5),
  ('Feijao verde cozido', '1 concha (86g)', 43, 3.1, 7.7, 0.3, 6.4),
  ('Lentilha cozida', '3 col sopa (80g)', 93, 6.3, 15.6, 0.5, 3.7),
  ('Grao-de-bico cozido', '3 col sopa (80g)', 164, 8.9, 27.4, 2.6, 6.0),
  ('Ervilha verde cozida', '3 col sopa (80g)', 67, 4.3, 11.3, 0.4, 5.7),
  ('Ervilha seca cozida', '3 col sopa (80g)', 96, 7.7, 17.7, 0.3, 6.0),
  ('Soja cozida', '3 col sopa (80g)', 141, 12.4, 10.7, 5.7, 8.2),
  ('Tofu firme', '1 fatia grossa (100g)', 76, 8.1, 1.9, 4.3, 0.3),
  ('Feijao fradinho cozido', '1 concha (86g)', 96, 6.8, 16.5, 0.7, 7.5),
  ('Feijao branco cozido', '1 concha (86g)', 105, 6.8, 18.0, 0.6, 9.7),
  ('Amendoim cru', '1 porcao (30g)', 567, 25.8, 16.1, 49.2, 8.5),
  ('Amendoim torrado', '1 porcao (30g)', 598, 26.4, 15.7, 52.5, 7.6),
  ('Feijao mulatinho cozido', '1 concha (86g)', 80, 5.0, 14.5, 0.5, 8.0),
  ('Feijao de corda cozido', '1 concha (86g)', 76, 5.2, 13.5, 0.6, 7.8),
  ('Feijao jalo cozido', '1 concha (86g)', 82, 5.5, 14.8, 0.6, 8.2),
  ('Lentilha vermelha cozida', '3 col sopa (80g)', 116, 9.0, 20.1, 0.4, 7.9),
  ('Favas cozidas', '3 col sopa (80g)', 88, 5.8, 15.5, 0.5, 5.4),
  ('Edamame cozido', '1 porcao (100g)', 122, 11.9, 8.9, 5.2, 5.2),
  ('Proteina de soja texturizada', '1 porcao hidratada (100g)', 53, 8.5, 4.5, 0.5, 3.8),
  ('Hummus', '2 col sopa (40g)', 166, 5.0, 14.3, 9.5, 4.0),
  ('Feijao adzuki cozido', '1 concha (86g)', 128, 7.5, 24.8, 0.1, 7.3),
  ('Frango peito grelhado sem pele', '1 file medio (120g)', 163, 31.5, 0.0, 3.7, 0.0),
  ('Frango peito cozido sem pele', '1 file medio (120g)', 170, 31.0, 0.0, 4.1, 0.0),
  ('Frango coxa grelhada sem pele', '1 unidade (100g)', 176, 27.5, 0.0, 7.0, 0.0),
  ('Frango sobrecoxa assada sem pele', '1 unidade (100g)', 192, 26.3, 0.0, 9.3, 0.0),
  ('Carne bovina patinho grelhado', '1 bife (100g)', 219, 32.0, 0.0, 9.9, 0.0),
  ('Carne bovina alcatra grelhada', '1 bife (100g)', 195, 29.0, 0.0, 8.3, 0.0),
  ('Carne bovina coxao mole cozido', '1 bife (100g)', 230, 30.8, 0.0, 11.7, 0.0),
  ('Carne bovina acem cozido', '1 porcao (100g)', 235, 29.0, 0.0, 13.2, 0.0),
  ('Carne bovina contra-file grelhado', '1 bife (100g)', 224, 29.5, 0.0, 11.5, 0.0),
  ('Carne bovina file mignon grelhado', '1 medalhao (100g)', 219, 32.4, 0.0, 9.4, 0.0),
  ('Carne suina lombo assado', '1 fatia (100g)', 218, 27.1, 0.0, 12.0, 0.0),
  ('Carne suina pernil assado', '1 porcao (100g)', 248, 25.8, 0.0, 15.8, 0.0),
  ('Peixe tilapia grelhada', '1 file (120g)', 96, 20.1, 0.0, 1.7, 0.0),
  ('Peixe salmon grelhado', '1 file (120g)', 208, 25.4, 0.0, 11.6, 0.0),
  ('Peixe atum em lata (agua)', '1/2 lata (75g)', 109, 23.4, 0.0, 1.4, 0.0),
  ('Peixe sardinha em lata (oleo)', '1/2 lata (75g)', 213, 19.2, 0.0, 15.2, 0.0),
  ('Camarao cozido', '1 porcao (100g)', 106, 22.2, 0.9, 1.4, 0.0),
  ('Ovo inteiro cozido', '1 unidade grande (60g)', 146, 13.3, 0.6, 9.5, 0.0),
  ('Ovo mexido', '2 unidades (100g)', 175, 13.6, 1.8, 13.1, 0.0),
  ('Ovo cozido claras', '2 unidades (60g)', 51, 10.8, 0.7, 0.2, 0.0),
  ('Presunto cozido', '2 fatias (40g)', 113, 14.5, 1.3, 5.7, 0.0),
  ('Peito de peru defumado', '2 fatias (40g)', 109, 18.5, 2.2, 2.8, 0.0),
  ('Linguica frango grelhada', '1 unidade (80g)', 190, 16.8, 1.5, 13.2, 0.0),
  ('Carne seca (charque) cozida', '1 porcao (100g)', 228, 38.7, 0.0, 7.9, 0.0),
  ('Frango file empanado assado', '1 file (100g)', 215, 22.4, 14.2, 7.8, 0.6),
  ('Peixe merluza grelhada', '1 file (120g)', 85, 18.5, 0.0, 1.0, 0.0),
  ('Peixe bacalhau dessalgado cozido', '1 porcao (100g)', 116, 25.8, 0.0, 1.0, 0.0),
  ('Frango coxa e sobrecoxa cozido sem pele', '1 porcao (150g)', 178, 28.5, 0.0, 7.2, 0.0),
  ('Carne bovina musculo cozido', '1 porcao (100g)', 202, 31.5, 0.0, 8.0, 0.0),
  ('Peixe tambaqui grelhado', '1 file (120g)', 127, 20.5, 0.0, 4.8, 0.0),
  ('Peixe pintado cozido', '1 file (120g)', 110, 21.0, 0.0, 2.5, 0.0),
  ('Ovo de codorna cozido', '5 unidades (50g)', 158, 13.1, 0.5, 11.2, 0.0),
  ('Sardinha fresca grelhada', '1 porcao (100g)', 208, 24.6, 0.0, 12.0, 0.0),
  ('Frango desfiadao cozido', '3 col sopa (80g)', 148, 28.0, 0.0, 3.4, 0.0),
  ('Carne moida refogada', '3 col sopa (80g)', 215, 23.5, 0.0, 13.0, 0.0),
  ('Presunto cru parma', '2 fatias (30g)', 229, 25.9, 0.5, 14.0, 0.0),
  ('Salsicha frango cozida', '1 unidade (50g)', 210, 13.0, 3.5, 16.5, 0.0),
  ('Caramujo cozido', '1 porcao (100g)', 90, 16.1, 2.0, 1.4, 0.0),
  ('Lagosta cozida', '1 porcao (100g)', 98, 20.6, 0.0, 1.5, 0.0),
  ('Marisco cozido', '1 porcao (100g)', 86, 11.9, 3.7, 2.2, 0.0),
  ('Frango asa grelhada sem pele', '2 unidades (80g)', 173, 25.5, 0.0, 7.5, 0.0),
  ('Carne de cordeiro assada', '1 porcao (100g)', 258, 25.6, 0.0, 17.0, 0.0),
  ('Leite integral', '1 copo (200mL)', 61, 3.2, 4.5, 3.3, 0.0),
  ('Leite desnatado', '1 copo (200mL)', 35, 3.5, 5.0, 0.1, 0.0),
  ('Leite semidesnatado', '1 copo (200mL)', 47, 3.3, 4.7, 1.4, 0.0),
  ('Iogurte natural integral', '1 pote (170g)', 61, 3.5, 4.9, 3.3, 0.0),
  ('Iogurte natural desnatado', '1 pote (170g)', 43, 4.3, 5.9, 0.2, 0.0),
  ('Iogurte grego integral', '1 pote (100g)', 97, 9.0, 3.6, 5.0, 0.0),
  ('Queijo minas frescal', '1 fatia grossa (30g)', 264, 17.4, 2.9, 20.2, 0.0),
  ('Queijo mussarela', '1 fatia (30g)', 300, 22.2, 2.3, 22.4, 0.0),
  ('Queijo prato', '1 fatia (30g)', 362, 24.6, 1.0, 28.9, 0.0),
  ('Queijo cottage', '2 col sopa (40g)', 97, 11.1, 2.7, 4.5, 0.0),
  ('Queijo ricota', '2 col sopa (40g)', 174, 11.6, 3.2, 13.1, 0.0),
  ('Requeijao cremoso', '1 col sopa cheia (30g)', 252, 7.6, 3.0, 22.8, 0.0),
  ('Manteiga', '1 col cha (5g)', 726, 0.7, 0.1, 82.3, 0.0),
  ('Creme de leite', '1 col sopa (20g)', 333, 2.1, 3.3, 35.1, 0.0),
  ('Whey protein concentrado', '1 dose (30g)', 110, 23.0, 4.0, 1.5, 0.0),
  ('Iogurte proteico skyr', '1 pote (170g)', 65, 11.0, 4.5, 0.2, 0.0),
  ('Queijo parmesao ralado', '1 col sopa (10g)', 387, 33.1, 4.3, 26.0, 0.0),
  ('Queijo brie', '1 fatia (30g)', 334, 20.8, 0.5, 27.7, 0.0),
  ('Queijo gouda', '1 fatia (30g)', 356, 24.9, 2.2, 27.4, 0.0),
  ('Queijo cheddar', '1 fatia (30g)', 403, 25.0, 1.3, 33.1, 0.0),
  ('Leite condensado', '1 col sopa (20g)', 321, 7.9, 54.4, 8.0, 0.0),
  ('Creme de ricota', '2 col sopa (40g)', 155, 7.0, 5.5, 12.0, 0.0),
  ('Bebida lactea fermentada', '1 copo (200mL)', 72, 2.5, 15.5, 0.5, 0.0),
  ('Creme cheese', '1 col sopa (20g)', 342, 6.2, 4.1, 34.0, 0.0),
  ('Iogurte de coco', '1 pote (170g)', 68, 1.2, 7.5, 3.8, 0.5),
  ('Kefir liquido', '1 copo (200mL)', 61, 3.3, 4.8, 3.5, 0.0),
  ('Alface crespa crua', '1 prato raso (50g)', 11, 1.3, 1.7, 0.2, 1.8),
  ('Alface americana crua', '1 prato raso (50g)', 13, 0.9, 2.0, 0.3, 1.8),
  ('Rucula crua', '1 xicara (30g)', 25, 2.6, 3.7, 0.7, 1.6),
  ('Espinafre cru', '1 xicara (30g)', 23, 2.9, 3.5, 0.4, 2.2),
  ('Espinafre cozido', '2 col sopa (50g)', 17, 1.9, 2.8, 0.3, 2.5),
  ('Brocolis cozido', '2 col sopa (50g)', 25, 2.9, 4.4, 0.4, 3.1),
  ('Couve-flor cozida', '1 porcao (80g)', 20, 1.9, 4.0, 0.1, 2.5),
  ('Cenoura crua', '1 unidade media (80g)', 34, 1.3, 7.7, 0.1, 3.2),
  ('Cenoura cozida', '2 col sopa (50g)', 31, 0.9, 7.2, 0.1, 2.5),
  ('Tomate cru', '1 unidade media (100g)', 15, 1.1, 3.1, 0.2, 1.2),
  ('Pepino cru', '1/2 unidade (80g)', 10, 0.7, 2.3, 0.1, 0.5),
  ('Abobrinha cozida', '2 col sopa (50g)', 10, 1.1, 2.0, 0.1, 1.0),
  ('Chuchu cozido', '2 col sopa (50g)', 15, 0.5, 3.6, 0.1, 1.5),
  ('Beringela cozida', '2 col sopa (50g)', 24, 0.9, 5.4, 0.2, 2.0),
  ('Couve manteiga crua', '2 col sopa (30g)', 32, 3.1, 5.4, 0.7, 3.5),
  ('Repolho cru', '2 col sopa (50g)', 16, 1.4, 3.6, 0.1, 1.8),
  ('Cebola crua', '1/2 unidade (50g)', 30, 1.2, 7.0, 0.1, 1.7),
  ('Alho cru', '1 dente (5g)', 124, 6.1, 28.0, 0.3, 4.4),
  ('Pimentao verde cru', '1/2 unidade (50g)', 20, 0.9, 4.6, 0.2, 1.4),
  ('Pimentao vermelho cru', '1/2 unidade (50g)', 27, 0.9, 6.0, 0.3, 2.1),
  ('Milho verde cozido', '4 col sopa (80g)', 88, 2.9, 18.9, 0.9, 2.5),
  ('Ervilha fresca cozida', '3 col sopa (60g)', 67, 4.3, 11.3, 0.4, 5.7),
  ('Vagem cozida', '2 col sopa (50g)', 25, 1.6, 5.0, 0.2, 2.1),
  ('Beterraba crua', '1 fatia (30g)', 29, 1.4, 6.3, 0.1, 2.0),
  ('Batata-baroa cozida', '1 porcao (100g)', 79, 1.6, 17.8, 0.4, 2.0),
  ('Quiabo cozido', '2 col sopa (50g)', 25, 1.5, 5.2, 0.2, 3.2),
  ('Jiló cozido', '2 col sopa (50g)', 20, 0.8, 4.3, 0.2, 1.6),
  ('Maxixe cozido', '2 col sopa (50g)', 20, 1.0, 4.0, 0.3, 1.8),
  ('Abobora cozida', '2 col sopa (50g)', 17, 0.7, 4.0, 0.1, 0.5),
  ('Cogumelo shitake cozido', '1 porcao (80g)', 34, 2.0, 6.5, 0.4, 3.7),
  ('Palmito cozido', '1 talo (30g)', 28, 1.8, 5.5, 0.3, 1.8),
  ('Agriao cru', '1 maço (50g)', 17, 1.7, 3.1, 0.1, 1.5),
  ('Almeirão cru', '1 maço (50g)', 19, 1.8, 3.5, 0.3, 2.0),
  ('Chicória crua', '1 xicara (50g)', 20, 1.5, 4.1, 0.3, 1.5),
  ('Aspargo cozido', '5 talos (80g)', 20, 2.2, 3.7, 0.2, 2.1),
  ('Acelga crua', '1 xicara (50g)', 18, 1.6, 3.7, 0.2, 1.6),
  ('Rabanete cru', '4 unidades (60g)', 14, 0.7, 3.0, 0.1, 1.4),
  ('Nabo cozido', '2 col sopa (60g)', 22, 0.9, 4.7, 0.1, 1.8),
  ('Bertalha crua', '1 xicara (50g)', 19, 1.5, 3.8, 0.3, 1.0),
  ('Brocolis romanesco cozido', '1 porcao (80g)', 22, 2.5, 4.0, 0.3, 2.8),
  ('Couve de bruxelas cozida', '1 porcao (80g)', 36, 2.5, 7.1, 0.5, 3.8),
  ('Alcachofra cozida', '1 unidade (100g)', 47, 3.3, 10.5, 0.2, 5.4),
  ('Alho-poro cozido', '2 col sopa (50g)', 25, 0.8, 5.5, 0.1, 1.0),
  ('Gengibre cru', '1 col cha (5g)', 80, 1.8, 17.8, 0.8, 2.0),
  ('Beterraba cozida', '1 fatia (50g)', 43, 1.5, 9.7, 0.1, 1.5),
  ('Cenoura baby crua', '5 unidades (80g)', 35, 0.6, 8.2, 0.2, 2.9),
  ('Tomatinho cereja', '10 unidades (100g)', 18, 0.9, 3.9, 0.2, 1.2),
  ('Pimentao amarelo', '1/2 unidade (60g)', 27, 1.0, 6.0, 0.2, 1.7),
  ('Repolho roxo cru', '2 col sopa (50g)', 22, 1.0, 5.0, 0.1, 2.0),
  ('Alface romana crua', '1 prato (50g)', 17, 1.2, 3.3, 0.3, 2.1),
  ('Brocolis baby cru', '1 xicara (80g)', 34, 2.8, 6.6, 0.4, 2.6),
  ('Salsa fresca', '1 maco (10g)', 36, 3.0, 6.3, 0.8, 3.3),
  ('Coentro fresco', '1 maco (10g)', 23, 2.1, 3.7, 0.5, 2.8),
  ('Banana prata', '1 unidade media (90g)', 98, 1.3, 26.0, 0.1, 2.0),
  ('Banana maca', '1 unidade (80g)', 87, 1.1, 22.8, 0.1, 1.9),
  ('Maca', '1 unidade media (130g)', 56, 0.3, 15.2, 0.2, 1.3),
  ('Laranja lima', '1 unidade media (150g)', 37, 1.0, 8.9, 0.1, 1.5),
  ('Mamao papaia', '1 fatia (150g)', 45, 0.6, 11.9, 0.2, 1.5),
  ('Mango tommy', '1 fatia (100g)', 64, 0.9, 16.8, 0.3, 1.6),
  ('Melancia', '1 fatia (200g)', 33, 0.9, 8.1, 0.2, 0.3),
  ('Melao', '1 fatia (150g)', 34, 0.7, 8.6, 0.2, 0.3),
  ('Abacaxi', '1 fatia (100g)', 48, 0.9, 12.3, 0.1, 1.0),
  ('Morango', '1 xicara (150g)', 30, 0.8, 7.1, 0.4, 1.7),
  ('Uva italia', '1 porcao (100g)', 69, 0.6, 18.1, 0.5, 0.9),
  ('Pera', '1 unidade media (130g)', 55, 0.5, 14.9, 0.1, 3.1),
  ('Pessego', '1 unidade media (100g)', 43, 1.2, 10.1, 0.3, 1.5),
  ('Avocado abacate', '1/4 unidade (80g)', 96, 1.2, 6.3, 8.4, 2.7),
  ('Acai polpa', '1 tigela (200g)', 247, 2.0, 8.1, 23.6, 13.5),
  ('Coco fresco ralado', '2 col sopa (20g)', 354, 2.7, 15.0, 33.5, 4.0),
  ('Goiaba vermelha', '1 unidade media (100g)', 54, 2.6, 10.5, 0.9, 6.3),
  ('Maracuja', '1 unidade media (100g)', 68, 2.4, 13.7, 0.7, 1.9),
  ('Kiwi', '1 unidade (80g)', 61, 1.1, 14.9, 0.5, 3.0),
  ('Lichia', '5 unidades (80g)', 66, 1.1, 16.5, 0.4, 1.3),
  ('Ameixa fresca', '2 unidades (80g)', 55, 0.8, 13.7, 0.3, 1.5),
  ('Tangerina', '1 unidade media (100g)', 38, 0.9, 9.5, 0.2, 1.5),
  ('Limao', 'suco de 1 unidade (30mL)', 22, 0.9, 5.1, 0.1, 1.5),
  ('Caju', '1 unidade media (100g)', 43, 1.0, 9.8, 0.3, 1.5),
  ('Pitanga', '1 porcao (80g)', 41, 0.9, 9.9, 0.4, 1.3),
  ('Jabuticaba', '1 porcao (100g)', 58, 0.7, 15.1, 0.1, 2.4),
  ('Framboesa', '1 xicara (120g)', 52, 1.2, 11.9, 0.7, 6.5),
  ('Mirtilo (blueberry)', '1 xicara (150g)', 57, 0.7, 14.5, 0.3, 2.4),
  ('Amora', '1 xicara (120g)', 43, 1.4, 9.6, 0.5, 5.3),
  ('Cereja', '1 porcao (100g)', 63, 1.0, 16.0, 0.2, 2.1),
  ('Figo fresco', '2 unidades (80g)', 74, 0.8, 19.2, 0.3, 2.9),
  ('Romã', '1/2 unidade (100g)', 83, 1.7, 18.7, 1.2, 4.0),
  ('Carambola', '1 unidade media (100g)', 31, 1.0, 6.7, 0.3, 2.8),
  ('Graviola', '1 fatia (100g)', 62, 1.0, 15.8, 0.3, 2.0),
  ('Fruta do conde', '1/2 unidade (100g)', 94, 2.4, 23.5, 0.4, 1.0),
  ('Manga espada', '1 fatia (100g)', 59, 0.8, 15.1, 0.2, 1.4),
  ('Melão cantaloupe', '1 fatia (150g)', 34, 0.8, 8.2, 0.2, 0.9),
  ('Nectarina', '1 unidade (100g)', 44, 1.1, 10.6, 0.3, 1.7),
  ('Manga palmer', '1 fatia (100g)', 66, 0.5, 17.0, 0.3, 1.5),
  ('Banana da terra cozida', '1/2 unidade (80g)', 89, 0.8, 23.5, 0.1, 2.3),
  ('Caqui', '1 unidade media (100g)', 70, 0.6, 18.6, 0.2, 3.6),
  ('Jaca', '1 gomo (50g)', 95, 1.7, 23.4, 0.3, 1.5),
  ('Cupuacu polpa', '2 col sopa (50g)', 49, 1.0, 12.0, 0.5, 3.1),
  ('Banana verde cozida', '1 unidade (80g)', 91, 1.2, 23.8, 0.2, 2.5),
  ('Seriguela', '5 unidades (80g)', 41, 0.7, 10.5, 0.2, 1.7),
  ('Mirtilo blueberry', '1 xicara (150g)', 57, 0.7, 14.5, 0.3, 2.4),
  ('Azeite de oliva extra virgem', '1 col sopa (10mL)', 884, 0.0, 0.0, 100.0, 0.0),
  ('Oleo de coco', '1 col sopa (10mL)', 884, 0.0, 0.0, 100.0, 0.0),
  ('Oleo de girassol', '1 col sopa (10mL)', 884, 0.0, 0.0, 100.0, 0.0),
  ('Oleo de soja', '1 col sopa (10mL)', 884, 0.0, 0.0, 100.0, 0.0),
  ('Oleo de canola', '1 col sopa (10mL)', 884, 0.0, 0.0, 100.0, 0.0),
  ('Margarina', '1 col cha (5g)', 722, 0.3, 0.1, 80.0, 0.0),
  ('Pasta de amendoim', '1 col sopa (20g)', 598, 25.0, 20.0, 50.0, 5.5),
  ('Tahine pasta de gergelim', '1 col sopa (15g)', 590, 17.0, 21.0, 53.0, 9.3),
  ('Castanha do para', '1 unidade (5g)', 656, 14.3, 15.1, 63.5, 7.5),
  ('Castanha de caju', '1 porcao (20g)', 570, 15.3, 32.7, 43.9, 3.7),
  ('Amendoa', '1 porcao (20g)', 579, 21.2, 21.7, 50.0, 12.5),
  ('Noz', '3 unidades (20g)', 654, 15.2, 13.7, 65.2, 6.7),
  ('Pistache', '1 porcao (20g)', 557, 20.6, 27.5, 45.0, 10.6),
  ('Linhaça dourada', '1 col sopa (10g)', 495, 18.3, 28.9, 42.2, 27.3),
  ('Chia', '1 col sopa (10g)', 486, 16.5, 42.1, 30.7, 34.4),
  ('Gergelim', '1 col sopa (10g)', 573, 17.7, 23.5, 49.7, 11.8),
  ('Manteiga de cacau', '1 col sopa (15g)', 900, 0.0, 0.0, 100.0, 0.0),
  ('Oleo de abacate', '1 col sopa (10mL)', 884, 0.0, 0.0, 100.0, 0.0),
  ('Oleo de gergeli tostado', '1 col sopa (10mL)', 884, 0.0, 0.0, 100.0, 0.0),
  ('Ghee manteiga clarificada', '1 col cha (5g)', 900, 0.0, 0.0, 100.0, 0.0),
  ('Pasta de macadamia', '1 col sopa (20g)', 718, 8.0, 13.8, 75.8, 8.6),
  ('Creme de avela com cacau', '1 col sopa (15g)', 547, 5.9, 57.4, 32.7, 2.9),
  ('Gergelim preto', '1 col sopa (10g)', 573, 17.7, 23.5, 49.7, 11.8),
  ('Semente de abobora', '1 col sopa (10g)', 559, 30.2, 17.8, 49.1, 6.0),
  ('Semente de girassol', '1 col sopa (10g)', 584, 20.8, 20.0, 51.5, 8.6),
  ('Acucar refinado', '1 col cha (5g)', 387, 0.0, 99.5, 0.0, 0.0),
  ('Acucar mascavo', '1 col cha (5g)', 375, 0.0, 96.0, 0.0, 0.0),
  ('Mel de abelha', '1 col sopa (20g)', 309, 0.4, 84.0, 0.0, 0.2),
  ('Geleia de frutas', '1 col sopa (20g)', 260, 0.5, 68.0, 0.0, 0.8),
  ('Chocolate meio amargo 70%', '1 quadrado (10g)', 546, 5.5, 49.5, 36.1, 10.9),
  ('Chocolate ao leite', '1 quadrado (10g)', 535, 7.0, 59.0, 30.0, 3.0),
  ('Sorvete de frutas', '1 bola (60g)', 130, 1.0, 30.0, 1.5, 0.0),
  ('Sorvete de creme', '1 bola (60g)', 207, 3.0, 23.0, 11.5, 0.0),
  ('Brigadeiro', '1 unidade (15g)', 390, 5.0, 62.0, 14.0, 0.5),
  ('Adocante aspartame', '1 envelope (0.8g)', 3, 0.0, 0.8, 0.0, 0.0),
  ('Adocante stévia', '1 envelope (0.6g)', 0, 0.0, 0.0, 0.0, 0.0),
  ('Rapadura', '1 pedaco (20g)', 380, 0.8, 96.5, 0.2, 0.0),
  ('Chocolate amargo 85%', '1 quadrado (10g)', 598, 7.8, 40.0, 43.1, 12.5),
  ('Pacoca', '1 unidade (20g)', 460, 12.0, 57.0, 22.5, 4.5),
  ('Suco de laranja natural', '1 copo (200mL)', 45, 0.7, 10.4, 0.1, 0.0),
  ('Suco de acerola natural', '1 copo (200mL)', 40, 1.0, 9.5, 0.5, 1.4),
  ('Suco de uva integral', '1 copo (200mL)', 70, 0.6, 17.2, 0.3, 0.2),
  ('Cafe sem acucar', '1 xicara (50mL)', 2, 0.2, 0.5, 0.0, 0.0),
  ('Cha verde sem acucar', '1 xicara (200mL)', 2, 0.0, 0.5, 0.0, 0.0),
  ('Agua de coco', '1 copo (200mL)', 19, 0.7, 3.7, 0.2, 1.0),
  ('Leite vegetal amêndoas', '1 copo (200mL)', 40, 1.5, 2.0, 3.0, 0.5),
  ('Leite vegetal aveia', '1 copo (200mL)', 50, 1.5, 8.0, 1.5, 0.5),
  ('Refrigerante cola', '1 lata (350mL)', 42, 0.0, 10.6, 0.0, 0.0),
  ('Energetico', '1 lata (250mL)', 45, 0.0, 11.3, 0.0, 0.0),
  ('Suco de tomate', '1 copo (200mL)', 15, 0.8, 3.3, 0.1, 0.5),
  ('Suco de cenoura', '1 copo (200mL)', 40, 0.9, 9.6, 0.2, 0.4),
  ('Suco verde (couve,maça,gengibre)', '1 copo (200mL)', 35, 0.8, 8.2, 0.2, 1.0),
  ('Kombucha', '1 copo (200mL)', 13, 0.0, 3.3, 0.0, 0.0),
  ('Cha de camomila sem acucar', '1 xicara (200mL)', 1, 0.0, 0.2, 0.0, 0.0),
  ('Cha de hibisco sem acucar', '1 xicara (200mL)', 3, 0.0, 0.7, 0.0, 0.0),
  ('Leite vegetal arroz', '1 copo (200mL)', 47, 0.3, 10.5, 1.0, 0.0),
  ('Proteina shake pronto', '1 garrafa (250mL)', 150, 25.0, 8.0, 2.5, 1.0),
  ('Agua com gas', '1 copo (200mL)', 0, 0.0, 0.0, 0.0, 0.0),
  ('Arroz com feijao', '1 prato raso (200g)', 166, 6.0, 32.0, 2.0, 4.5),
  ('Frango a passarinho', '1 porcao (150g)', 252, 28.0, 2.5, 14.5, 0.0),
  ('Omelete simples', '1 unidade (100g)', 175, 12.0, 1.5, 13.5, 0.0),
  ('Salada de frutas', '1 tigela (200g)', 60, 1.0, 15.0, 0.2, 2.0),
  ('Vitamina de banana com leite', '1 copo (250mL)', 112, 3.5, 22.0, 1.5, 1.2),
  ('Sopa de legumes', '1 tigela (300mL)', 60, 2.5, 12.0, 0.8, 2.0),
  ('Frango com legumes refogados', '1 prato (250g)', 175, 28.0, 8.0, 4.5, 2.5),
  ('Peixe grelhado com salada', '1 prato (300g)', 145, 22.0, 5.0, 4.5, 2.0),
  ('Sanduiche natural frango', '1 unidade (150g)', 235, 20.0, 28.0, 4.5, 2.5),
  ('Wrap integral frango', '1 unidade (180g)', 280, 22.0, 32.0, 7.0, 4.0),
  ('Acai com granola', '1 tigela (300g)', 345, 4.5, 42.0, 17.0, 9.5),
  ('Iogurte com fruta e granola', '1 pote (200g)', 195, 7.0, 33.0, 4.5, 2.5),
  ('Tapioca com frango e queijo', '1 unidade (120g)', 280, 20.0, 35.0, 7.0, 0.5),
  ('Pao com ovo mexido', '1 porcao (100g)', 280, 12.0, 30.0, 12.0, 1.5),
  ('Caldo verde', '1 prato fundo (300mL)', 85, 5.0, 10.0, 2.5, 2.0),
  ('Moqueca de peixe', '1 porcao (250g)', 175, 22.0, 5.0, 8.0, 1.5),
  ('Feijoada', '1 concha (200g)', 163, 9.5, 18.0, 6.0, 6.5),
  ('Frango ao molho tomate', '1 porcao (200g)', 148, 24.5, 5.0, 4.0, 1.0),
  ('Carne de panela', '1 porcao (150g)', 198, 26.0, 3.5, 9.5, 0.5),
  ('Iscas de frango grelhadas', '1 porcao (100g)', 163, 31.5, 0.0, 3.7, 0.0),
  ('Salpicao de frango', '3 col sopa (100g)', 185, 15.0, 8.5, 10.5, 1.5),
  ('Espetinho de frango grelhado', '1 espeto (100g)', 165, 30.0, 2.5, 4.0, 0.5),
  ('Salada de atum com legumes', '1 porcao (200g)', 120, 18.0, 5.0, 3.5, 2.0),
  ('Frango xadrez', '1 porcao (200g)', 175, 26.0, 7.5, 5.0, 2.0),
  ('Strogonoff de frango', '1 porcao (200g)', 235, 22.0, 8.5, 13.0, 0.5),
  ('Peixe ao forno com ervas', '1 file (150g)', 140, 24.0, 1.0, 4.5, 0.3),
  ('Abobora recheada com carne', '1 porcao (200g)', 165, 14.0, 14.0, 6.5, 2.5),
  ('Risoto de frango', '1 porcao (200g)', 198, 16.0, 24.5, 5.5, 1.0),
  ('Quiche de legumes', '1 fatia (100g)', 235, 8.5, 18.0, 14.5, 1.5),
  ('Hamburguer de frango caseiro', '1 unidade (120g)', 198, 24.5, 4.5, 9.5, 0.5),
  ('Hamburguer de lentilha', '1 unidade (100g)', 165, 8.5, 25.0, 4.0, 5.5),
  ('Creme de abobora', '1 tigela (250mL)', 72, 2.5, 14.5, 1.5, 2.0),
  ('Bowl proteico', '1 bowl (300g)', 345, 32.0, 30.0, 10.5, 6.5),
  ('Salada Caesar com frango', '1 prato (250g)', 235, 24.0, 10.5, 11.0, 2.5),
  ('Sal refinado', '1 pitada (1g)', 0, 0.0, 0.0, 0.0, 0.0),
  ('Sal light', '1 pitada (1g)', 0, 0.0, 0.0, 0.0, 0.0),
  ('Vinagre de maca', '1 col sopa (10mL)', 14, 0.0, 0.7, 0.0, 0.0),
  ('Molho de soja shoyu', '1 col sopa (10mL)', 56, 5.6, 5.7, 0.0, 0.8),
  ('Mostarda', '1 col cha (5g)', 60, 3.7, 6.4, 3.3, 3.3),
  ('Ketchup', '1 col sopa (15g)', 112, 1.6, 28.0, 0.1, 0.9),
  ('Maionese', '1 col sopa (15g)', 660, 1.3, 2.8, 72.1, 0.0),
  ('Molho de tomate caseiro', '2 col sopa (40g)', 35, 1.5, 7.0, 0.5, 1.5),
  ('Caldo de galinha (tablete)', '1/4 tablete (2.5g)', 13, 0.5, 1.5, 0.5, 0.0),
  ('Extrato de tomate', '1 col sopa (20g)', 57, 2.8, 12.0, 0.4, 2.5),
  ('Alecrim fresco', '1 ramo (5g)', 131, 3.3, 20.7, 5.9, 14.1),
  ('Manjericao fresco', '1 maco (10g)', 22, 3.2, 2.7, 0.6, 1.6),
  ('Pimenta do reino', '1 pitada (0.5g)', 251, 10.4, 63.9, 3.3, 25.3),
  ('Curcuma po', '1 col cha (3g)', 354, 7.8, 64.9, 9.9, 21.1),
  ('Canela em po', '1 col cha (3g)', 261, 3.9, 79.8, 3.2, 53.1),
  ('Whey protein isolado', '1 dose (30g)', 113, 26.0, 1.5, 0.5, 0.0),
  ('Whey protein concentrado 80%', '1 dose (30g)', 120, 24.0, 4.0, 1.5, 0.0),
  ('Creatina monoidratada', '1 dose (5g)', 0, 0.0, 0.0, 0.0, 0.0),
  ('Maltodextrina', '1 dose (30g)', 117, 0.0, 30.0, 0.0, 0.0),
  ('BCAA po', '1 dose (10g)', 40, 10.0, 0.0, 0.0, 0.0),
  ('Albumina po', '1 dose (30g)', 114, 28.5, 0.0, 0.0, 0.0),
  ('Colágeno hidrolisado', '1 dose (10g)', 38, 9.3, 0.5, 0.0, 0.0),
  ('Proteína vegetal ervilha', '1 dose (30g)', 118, 24.0, 3.5, 2.0, 0.5),
  ('Proteina vegetal mista', '1 dose (30g)', 110, 22.0, 3.0, 2.0, 2.0),
  ('Caseina proteina', '1 dose (30g)', 111, 24.0, 3.5, 1.0, 0.0),
  ('Glutamina po', '1 dose (5g)', 20, 5.0, 0.0, 0.0, 0.0),
  ('Omega 3 oleo de peixe', '2 capsulas (2g)', 18, 0.0, 0.0, 2.0, 0.0),
  ('Vitamina C 1000mg', '1 comprimido (1g)', 0, 0.0, 0.0, 0.0, 0.0),
  ('Dextrose', '1 dose (40g)', 156, 0.0, 40.0, 0.0, 0.0),
  ('Pre-treino com cafeina', '1 dose (10g)', 35, 2.0, 5.5, 0.5, 0.0),
  ('Vitamina D 2000UI', '1 capsula (0.5g)', 5, 0.0, 0.0, 0.5, 0.0),
  ('Magnesio quelato', '2 capsulas (1g)', 0, 0.0, 0.0, 0.0, 0.0),
  ('Inositol po', '1 dose (2g)', 8, 0.0, 2.0, 0.0, 0.0),
  ('Spirulina po', '1 col cha (5g)', 290, 57.5, 23.9, 7.7, 3.6),
  ('Cacau 100% po', '1 col sopa (10g)', 228, 19.6, 57.9, 13.7, 33.2),
  ('Maca peruana po', '1 col cha (5g)', 325, 13.6, 71.4, 2.2, 8.5),
  ('Levedo de cerveja', '1 col sopa (10g)', 116, 16.0, 18.8, 0.8, 7.7),
  ('Curcuma em raiz', '1 col cha ralada (5g)', 354, 7.8, 64.9, 9.9, 21.1),
  ('Gengibre em po', '1 col cha (3g)', 335, 8.9, 71.6, 4.2, 14.1),
  ('Alga nori', '1 folha (2g)', 262, 33.0, 43.0, 2.0, 34.0),
  ('Vinagre de maca com a mae', '1 col sopa (10mL)', 14, 0.0, 0.7, 0.0, 0.0),
  ('Proteina de ervilha po', '1 dose (30g)', 118, 24.0, 3.5, 2.0, 0.5),
  ('Farinha de coco', '2 col sopa (20g)', 400, 18.0, 57.5, 14.5, 38.5),
  ('Farinha de amendoa', '2 col sopa (20g)', 579, 21.2, 21.7, 50.0, 12.5),
  ('Proteina de arroz po', '1 dose (30g)', 112, 22.0, 5.0, 1.5, 1.0),
  ('Semente de hemp', '1 col sopa (10g)', 553, 31.6, 8.7, 48.7, 4.0),
  ('Kefir de agua', '1 copo (200mL)', 15, 0.5, 3.0, 0.0, 0.0),
  ('Iogurte de amendoa', '1 pote (150g)', 55, 2.0, 4.5, 3.5, 1.0);

-- 2.4 Listas de compras --------------------------------------------
create table if not exists public.listas_compras (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  dados         jsonb not null,
  publicado_em  timestamptz not null default now()
);
create index if not exists listas_compras_paciente_id_idx on public.listas_compras(paciente_id, publicado_em desc);

-- v1.10.0: coluna pdf_url nas 3 tabelas (Plano, Substituições, Compras)
-- DEVE ficar APÓS a criação das 3 tabelas (planos, substituicoes, listas_compras)
alter table public.planos          add column if not exists pdf_url text;
alter table public.substituicoes   add column if not exists pdf_url text;
alter table public.listas_compras  add column if not exists pdf_url text;

-- 2.5 Prescrições (documentos PDF) ---------------------------------
create table if not exists public.prescricoes (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  tipo          text not null check (tipo in ('exame', 'laudo', 'receita')),
  titulo        text not null,
  storage_path  text not null,
  nota          text,
  created_at    timestamptz not null default now()
);
create index if not exists prescricoes_paciente_id_idx on public.prescricoes(paciente_id, created_at desc);

-- 2.6 Mensagens (chat) ---------------------------------------------
create table if not exists public.mensagens (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  de            text not null check (de in ('nutri', 'paciente')),
  texto         text not null,
  lida          boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists mensagens_conversa_idx on public.mensagens(paciente_id, nutri_id, created_at);

-- 2.7 Avaliações antropométricas (gráfico de evolução) -------------
-- A nutri registra peso e medidas em cada consulta;
-- a paciente apenas visualiza o histórico/gráfico.
create table if not exists public.peso_registros (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid references public.nutris(id) on delete set null,
  kg            numeric(5,2),  -- v1.14.4: nullable pra permitir avaliação só com PDF
  altura_cm     numeric(5,2),
  cintura_cm    numeric(5,2),
  quadril_cm    numeric(5,2),
  braco_cm      numeric(5,2),
  coxa_cm       numeric(5,2),
  pgc           numeric(5,2),   -- % gordura corporal
  mm_kg         numeric(5,2),   -- massa magra em kg
  obs           text,
  data          date not null default current_date,
  created_at    timestamptz not null default now()
);
-- Compat: caso a tabela já existisse, adiciona colunas faltantes (idempotente)
alter table public.peso_registros
  add column if not exists nutri_id    uuid references public.nutris(id) on delete set null,
  add column if not exists altura_cm   numeric(5,2),
  add column if not exists cintura_cm  numeric(5,2),
  add column if not exists quadril_cm  numeric(5,2),
  add column if not exists braco_cm    numeric(5,2),
  add column if not exists coxa_cm     numeric(5,2),
  add column if not exists pgc         numeric(5,2),
  add column if not exists mm_kg       numeric(5,2),
  add column if not exists obs         text,
  add column if not exists pdf_url     text,
  add column if not exists agua_corporal    numeric(5,2), -- % de água corporal (bioimpedância)
  add column if not exists gordura_visceral numeric(5,2), -- nível de gordura visceral (bioimpedância)
  add column if not exists tmb              numeric(6,0), -- taxa metabólica basal, kcal (bioimpedância)
  -- Dobras cutâneas (mm) — só registro, sem cálculo automático de %gordura
  add column if not exists dobra_formula        text,
  add column if not exists dobra_tricipital     numeric(5,2),
  add column if not exists dobra_bicipital      numeric(5,2),
  add column if not exists dobra_abdominal      numeric(5,2),
  add column if not exists dobra_subescapular   numeric(5,2),
  add column if not exists dobra_axilar_media   numeric(5,2),
  add column if not exists dobra_coxa           numeric(5,2),
  add column if not exists dobra_toracica       numeric(5,2),
  add column if not exists dobra_suprailiaca    numeric(5,2),
  add column if not exists dobra_panturrilha    numeric(5,2),
  add column if not exists dobra_supraespinhal  numeric(5,2),
  add column if not exists created_at  timestamptz not null default now();
-- v1.14.4: torna peso opcional (permitir avaliação só com PDF)
alter table public.peso_registros alter column kg drop not null;
create index if not exists peso_registros_paciente_id_idx on public.peso_registros(paciente_id, data);

-- 2.7b Exames laboratoriais (evolução de exames bioquímicos) -------
-- A nutri registra os valores de cada exame numa data (ou só anexa o
-- PDF do laboratório). `valores` guarda um mapa {parametro: {valor, status}}
-- pra não precisar de uma coluna por exame — a lista de parâmetros
-- cresce/evolui só no código, sem precisar de migração de schema.
create table if not exists public.exames_registros (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid references public.nutris(id) on delete set null,
  data          date not null default current_date,
  valores       jsonb,          -- { "glicemia_jejum": { "valor": 92, "status": "normal" }, ... }
  pdf_url       text,           -- PDF do laboratório (opcional)
  obs           text,
  created_at    timestamptz not null default now()
);
create index if not exists exames_registros_paciente_id_idx on public.exames_registros(paciente_id, data);

-- 2.7c Exames de imagem (ultrassom, raio-x, densitometria, etc.) ---
-- Anotação livre da nutri por data — sem parâmetros estruturados,
-- só título + texto (e opcionalmente o PDF/imagem do laudo).
create table if not exists public.exames_imagem (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid references public.nutris(id) on delete set null,
  data          date not null default current_date,
  titulo        text not null,
  texto         text,
  pdf_url       text,
  created_at    timestamptz not null default now()
);
create index if not exists exames_imagem_paciente_id_idx on public.exames_imagem(paciente_id, data);

-- 2.7d Pedidos de exame (a nutri gera um PDF com a lista de exames
-- pra paciente levar ao laboratório) -------------------------------
create table if not exists public.pedidos_exame (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid references public.nutris(id) on delete set null,
  data          date not null default current_date,
  exames        jsonb not null default '[]',  -- ["Glicemia de jejum", "TSH", ...]
  obs           text,
  pdf_url       text,
  created_at    timestamptz not null default now()
);
create index if not exists pedidos_exame_paciente_id_idx on public.pedidos_exame(paciente_id, data);

-- 2.7e Modelos favoritos de pedido de exame -------------------------
-- Não é por paciente — é da nutri, pra reaproveitar em qualquer paciente
-- (ex: "Check-up padrão", "Perfil hormonal feminino").
create table if not exists public.pedidos_exame_modelos (
  id            uuid primary key default gen_random_uuid(),
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  nome          text not null,
  exames        jsonb not null default '[]',
  obs           text,
  created_at    timestamptz not null default now()
);
create index if not exists pedidos_exame_modelos_nutri_id_idx on public.pedidos_exame_modelos(nutri_id);

-- 2.8 Feed de pratos (fotos) ---------------------------------------
create table if not exists public.feed_pratos (
  id                uuid primary key default gen_random_uuid(),
  paciente_id       uuid not null references public.pacientes(id) on delete cascade,
  storage_path      text not null,
  refeicao          text,
  legenda           text,
  comentario_nutri  text,
  created_at        timestamptz not null default now()
);
create index if not exists feed_pratos_paciente_id_idx on public.feed_pratos(paciente_id, created_at desc);

-- 2.8.5 Gastos (financeiro - saídas) -------------------------------
-- Suporta esporádicos (data_gasto preenchida) e recorrentes (dia_recorrencia).
-- Recorrentes ativos contam todo mês automaticamente nos cálculos.
create table if not exists public.gastos (
  id                uuid primary key default gen_random_uuid(),
  nutri_id          uuid not null references public.nutris(id) on delete cascade,
  descricao         text not null,
  categoria         text not null default 'outros',
  valor             numeric(10,2) not null,
  forma_pgto        text not null default 'pix',
  data_gasto        date,
  recorrente        boolean not null default false,
  dia_recorrencia   integer check (dia_recorrencia between 1 and 31),
  ativo             boolean not null default true,
  obs               text,
  created_at        timestamptz not null default now()
);
create index if not exists gastos_nutri_idx on public.gastos(nutri_id, data_gasto desc);
create index if not exists gastos_recorrente_idx on public.gastos(nutri_id, recorrente, ativo);


-- 2.8.6 Serviços (esteira de produtos da nutri) ------------------
-- IMPORTANTE: precisa vir antes de "vendas" porque vendas tem FK pra servicos.
create table if not exists public.servicos (
  id                  uuid primary key default gen_random_uuid(),
  nutri_id            uuid not null references public.nutris(id) on delete cascade,
  nome                text not null,
  nivel               text not null default 'intermediario' check (nivel in ('entrada', 'intermediario', 'premium', 'avulso')),
  ticket              numeric(10,2) not null,
  descricao           text,
  ativo               boolean not null default true,
  vendas_planejadas   integer not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists servicos_nutri_idx on public.servicos(nutri_id, ativo);

-- 2.8b Benefícios (cupons/parcerias — cadastrado 1x, visível pra TODAS
-- as pacientes da nutri, diferente de plano/substituições que são por
-- paciente) -----------------------------------------------------------
create table if not exists public.beneficios (
  id            uuid primary key default gen_random_uuid(),
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  marca         text not null,
  descricao     text,
  imagem_url    text,
  link          text,
  cupom         text,
  ativo         boolean not null default true,
  ordem         integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists beneficios_nutri_idx on public.beneficios(nutri_id, ativo, ordem);

-- 2.9 Vendas (financeiro) ------------------------------------------
create table if not exists public.vendas (
  id            uuid primary key default gen_random_uuid(),
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  paciente_id   uuid references public.pacientes(id) on delete set null,
  servico_id    uuid references public.servicos(id) on delete set null,
  servico       text not null,
  valor_total   numeric(10,2) not null,
  forma_pgto    text not null check (forma_pgto in ('pix', 'credito1x', 'parcelado', 'asaas', 'dinheiro')),
  data_venda    date not null default current_date,
  obs           text,
  created_at    timestamptz not null default now()
);
-- Compat: adiciona servico_id se a tabela já existia sem ele
alter table public.vendas add column if not exists servico_id uuid references public.servicos(id) on delete set null;
-- paciente_nome_manual: pra registrar venda de paciente que ainda não foi
-- cadastrada no sistema (a nutri digita o nome à mão em vez de escolher
-- da lista). Usado como fallback de exibição quando paciente_id é nulo.
alter table public.vendas add column if not exists paciente_nome_manual text;
create index if not exists vendas_nutri_id_idx on public.vendas(nutri_id, data_venda desc);
create index if not exists vendas_servico_id_idx on public.vendas(servico_id, data_venda);

-- 2.10 Parcelas (financeiro) ---------------------------------------
create table if not exists public.parcelas (
  id            uuid primary key default gen_random_uuid(),
  venda_id      uuid not null references public.vendas(id) on delete cascade,
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  numero        integer not null,
  valor         numeric(10,2) not null,
  vencimento    date not null,
  status        text not null default 'pendente' check (status in ('pago', 'pendente', 'atrasado')),
  data_pgto     date,
  obs           text
);
create index if not exists parcelas_nutri_id_idx on public.parcelas(nutri_id, vencimento);
create index if not exists parcelas_venda_id_idx on public.parcelas(venda_id);

-- 2.11.8 Fotos de evolução da paciente (antes/depois) ------------
-- Nutri tira foto no consultório OU paciente envia do app dela.
-- Usadas no Dashboard de Evolução (timeline + comparativo).
create table if not exists public.fotos_evolucao (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid references public.nutris(id) on delete set null,  -- null = upload pela paciente
  storage_path  text not null,
  tipo          text not null default 'frente' check (tipo in ('frente', 'perfil_direito', 'perfil_esquerdo', 'costas', 'livre')),
  data_foto     date not null default current_date,
  obs           text,
  created_at    timestamptz not null default now()
);
create index if not exists fotos_evolucao_paciente_idx on public.fotos_evolucao(paciente_id, data_foto desc);

-- 2.11.9 Pacientes pendentes (importação CSV antes de signup) -----
-- Cadastros importados de outras plataformas. Quando paciente
-- faz signup pelo link, dados pré-preenchidos migram para `pacientes`.
create table if not exists public.pacientes_pendentes (
  id            uuid primary key default gen_random_uuid(),
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  nome          text not null,
  email         text not null,
  whatsapp      text,
  cpf           text,
  nascimento    date,
  sexo          text default 'feminino' check (sexo in ('feminino', 'masculino')),
  objetivo      text,
  tipo_plano    text,
  modalidade    text,
  obs           text,
  status        text not null default 'pendente' check (status in ('pendente', 'enviado', 'ativado')),
  created_at    timestamptz not null default now(),
  unique (nutri_id, email)
);
create index if not exists pacientes_pendentes_nutri_idx on public.pacientes_pendentes(nutri_id, status);
create index if not exists pacientes_pendentes_email_idx on public.pacientes_pendentes(email);

-- 2.12 Check-ins (templates + envios + agendamentos) --------------
-- Templates: N por nutri. paciente_id opcional (template ligado a uma paciente).
-- is_padrao define qual aparece por default ao enviar.
create table if not exists public.checkin_templates (
  id            uuid primary key default gen_random_uuid(),
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  paciente_id   uuid references public.pacientes(id) on delete cascade,
  nome          text not null default 'Check-in semanal',
  perguntas     jsonb not null,
  is_padrao     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Remove constraint antiga que limitava a 1 template por nutri+paciente
alter table public.checkin_templates drop constraint if exists checkin_templates_nutri_id_paciente_id_key;
-- Compat: adiciona is_padrao se a tabela já existia sem ele
alter table public.checkin_templates add column if not exists is_padrao boolean not null default false;
create index if not exists checkin_templates_nutri_idx on public.checkin_templates(nutri_id);
-- Garante que cada nutri tenha no máximo UM template marcado como padrão
create unique index if not exists checkin_templates_padrao_unique
  on public.checkin_templates(nutri_id)
  where is_padrao = true;

-- Agendamentos: dispara envios automaticamente em frequência configurável.
-- O processamento é feito no client (NutriLayout) sem precisar de cron externo.
create table if not exists public.checkin_agendamentos (
  id              uuid primary key default gen_random_uuid(),
  nutri_id        uuid not null references public.nutris(id) on delete cascade,
  paciente_id     uuid references public.pacientes(id) on delete cascade,
  template_id     uuid not null references public.checkin_templates(id) on delete cascade,
  frequencia      text not null check (frequencia in ('semanal', 'quinzenal', 'mensal')),
  proximo_envio   date not null,
  ativo           boolean not null default true,
  ultimo_envio    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists checkin_agendamentos_nutri_idx on public.checkin_agendamentos(nutri_id, ativo, proximo_envio);

-- Envios: cada vez que a nutri envia um check-in à paciente
create table if not exists public.checkin_envios (
  id                      uuid primary key default gen_random_uuid(),
  nutri_id                uuid not null references public.nutris(id) on delete cascade,
  paciente_id             uuid not null references public.pacientes(id) on delete cascade,
  perguntas               jsonb not null,                   -- snapshot do template no momento do envio
  enviado_em              timestamptz not null default now(),
  respondido_em           timestamptz,
  respostas               jsonb,
  lembrete_enviado_em     timestamptz,
  created_at              timestamptz not null default now()
);
create index if not exists checkin_envios_paciente_idx on public.checkin_envios(paciente_id, enviado_em desc);
create index if not exists checkin_envios_nutri_idx on public.checkin_envios(nutri_id, enviado_em desc);
create index if not exists checkin_envios_pendentes_idx on public.checkin_envios(paciente_id) where respondido_em is null;

-- 2.11 Consultas (agenda) ------------------------------------------
-- `tipo` aceita: primeira | consulta_2..consulta_12 | avaliacao | retorno
-- (texto livre para permitir numeração explícita por paciente)
create table if not exists public.consultas (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  data_hora     timestamptz not null,
  duracao_min   integer not null default 45,
  tipo          text not null default 'consulta_2',
  status        text not null default 'agendada' check (status in ('agendada', 'realizada', 'cancelada')),
  obs           text,
  meet_link     text,
  links_extras  jsonb,    -- array de { label, url } — Shaped, Trello, Notion, etc.
  created_at    timestamptz not null default now()
);
-- Compat: adiciona links_extras se a tabela já existia sem ele
alter table public.consultas add column if not exists links_extras jsonb;
-- Remove CHECK antigo caso a tabela já tenha sido criada com a versão anterior
alter table public.consultas drop constraint if exists consultas_tipo_check;
-- Compat: adiciona meet_link se a tabela já existia sem ele
alter table public.consultas add column if not exists meet_link text;
create index if not exists consultas_paciente_id_idx on public.consultas(paciente_id, data_hora);
create index if not exists consultas_nutri_id_idx on public.consultas(nutri_id, data_hora);


-- =============================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =============================================================
alter table public.nutris          enable row level security;
alter table public.pacientes       enable row level security;
alter table public.planos          enable row level security;
alter table public.listas_compras  enable row level security;
alter table public.prescricoes     enable row level security;
alter table public.mensagens       enable row level security;
alter table public.peso_registros  enable row level security;
alter table public.exames_registros enable row level security;
alter table public.exames_imagem   enable row level security;
alter table public.pedidos_exame   enable row level security;
alter table public.pedidos_exame_modelos enable row level security;
alter table public.feed_pratos     enable row level security;
alter table public.gastos          enable row level security;
alter table public.vendas          enable row level security;
alter table public.parcelas        enable row level security;
alter table public.consultas             enable row level security;
alter table public.fotos_evolucao        enable row level security;
alter table public.pacientes_pendentes   enable row level security;
alter table public.checkin_templates     enable row level security;
alter table public.checkin_envios        enable row level security;
alter table public.checkin_agendamentos  enable row level security;
alter table public.servicos              enable row level security;
alter table public.beneficios            enable row level security;
alter table public.alimentos             enable row level security;


-- =============================================================
-- 4. POLÍTICAS RLS
-- =============================================================
-- Regra geral:
--   • Nutri: enxerga apenas suas próprias pacientes e dados.
--   • Paciente: enxerga apenas os próprios dados.
-- =============================================================

-- 4.1 nutris --------------------------------------------------------
drop policy if exists nutris_select_self on public.nutris;
create policy nutris_select_self on public.nutris
  for select using (id = auth.uid());

drop policy if exists nutris_update_self on public.nutris;
create policy nutris_update_self on public.nutris
  for update using (id = auth.uid());

-- 4.2 pacientes ----------------------------------------------------
drop policy if exists pacientes_select on public.pacientes;
create policy pacientes_select on public.pacientes
  for select using (
    id = auth.uid() or nutri_id = auth.uid()
  );

drop policy if exists pacientes_insert on public.pacientes;
create policy pacientes_insert on public.pacientes
  for insert with check (nutri_id = auth.uid());

drop policy if exists pacientes_update on public.pacientes;
create policy pacientes_update on public.pacientes
  for update using (id = auth.uid() or nutri_id = auth.uid());

drop policy if exists pacientes_delete on public.pacientes;
create policy pacientes_delete on public.pacientes
  for delete using (nutri_id = auth.uid());

-- 4.3 planos -------------------------------------------------------
drop policy if exists planos_select on public.planos;
create policy planos_select on public.planos
  for select using (
    paciente_id = auth.uid() or nutri_id = auth.uid()
  );

drop policy if exists planos_write_nutri on public.planos;
create policy planos_write_nutri on public.planos
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- 4.3-b substituicoes ----------------------------------------------
alter table public.substituicoes enable row level security;

drop policy if exists substituicoes_select on public.substituicoes;
create policy substituicoes_select on public.substituicoes
  for select using (
    paciente_id = auth.uid() or nutri_id = auth.uid()
  );

drop policy if exists substituicoes_write_nutri on public.substituicoes;
create policy substituicoes_write_nutri on public.substituicoes
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- 4.4 listas_compras -----------------------------------------------
drop policy if exists listas_compras_select on public.listas_compras;
create policy listas_compras_select on public.listas_compras
  for select using (
    paciente_id = auth.uid() or nutri_id = auth.uid()
  );

drop policy if exists listas_compras_write_nutri on public.listas_compras;
create policy listas_compras_write_nutri on public.listas_compras
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- 4.5 prescricoes --------------------------------------------------
drop policy if exists prescricoes_select on public.prescricoes;
create policy prescricoes_select on public.prescricoes
  for select using (
    paciente_id = auth.uid() or nutri_id = auth.uid()
  );

drop policy if exists prescricoes_write_nutri on public.prescricoes;
create policy prescricoes_write_nutri on public.prescricoes
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- 4.6 mensagens (chat — leitura e escrita pelos dois lados) --------
drop policy if exists mensagens_select on public.mensagens;
create policy mensagens_select on public.mensagens
  for select using (
    paciente_id = auth.uid() or nutri_id = auth.uid()
  );

drop policy if exists mensagens_insert on public.mensagens;
create policy mensagens_insert on public.mensagens
  for insert with check (
    (de = 'nutri'    and nutri_id    = auth.uid()) or
    (de = 'paciente' and paciente_id = auth.uid())
  );

drop policy if exists mensagens_update_lida on public.mensagens;
create policy mensagens_update_lida on public.mensagens
  for update using (
    paciente_id = auth.uid() or nutri_id = auth.uid()
  );

-- 4.7 peso_registros / avaliações antropométricas -----------------
-- Paciente: apenas lê os próprios registros.
-- Nutri:    insere, atualiza e remove apenas das próprias pacientes.
drop policy if exists peso_select on public.peso_registros;
drop policy if exists peso_insert_paciente on public.peso_registros;
drop policy if exists peso_delete_paciente on public.peso_registros;

drop policy if exists peso_select_paciente on public.peso_registros;
create policy peso_select_paciente on public.peso_registros
  for select using (paciente_id = auth.uid());

drop policy if exists peso_all_nutri on public.peso_registros;
create policy peso_all_nutri on public.peso_registros
  for all
  using (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()))
  with check (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()));

-- 4.7b exames_registros / evolução de exames laboratoriais --------
-- Paciente: apenas lê os próprios registros.
-- Nutri:    insere, atualiza e remove apenas das próprias pacientes.
drop policy if exists exames_select_paciente on public.exames_registros;
create policy exames_select_paciente on public.exames_registros
  for select using (paciente_id = auth.uid());

drop policy if exists exames_all_nutri on public.exames_registros;
create policy exames_all_nutri on public.exames_registros
  for all
  using (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()))
  with check (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()));

-- 4.7c exames_imagem -----------------------------------------------
drop policy if exists exames_imagem_select_paciente on public.exames_imagem;
create policy exames_imagem_select_paciente on public.exames_imagem
  for select using (paciente_id = auth.uid());

drop policy if exists exames_imagem_all_nutri on public.exames_imagem;
create policy exames_imagem_all_nutri on public.exames_imagem
  for all
  using (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()))
  with check (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()));

-- 4.7d pedidos_exame -------------------------------------------------
drop policy if exists pedidos_exame_select_paciente on public.pedidos_exame;
create policy pedidos_exame_select_paciente on public.pedidos_exame
  for select using (paciente_id = auth.uid());

drop policy if exists pedidos_exame_all_nutri on public.pedidos_exame;
create policy pedidos_exame_all_nutri on public.pedidos_exame
  for all
  using (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()))
  with check (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()));

-- 4.7e pedidos_exame_modelos (só a própria nutri acessa) -----------
drop policy if exists pedidos_exame_modelos_all_nutri on public.pedidos_exame_modelos;
create policy pedidos_exame_modelos_all_nutri on public.pedidos_exame_modelos
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());

-- 4.8 feed_pratos (paciente posta, nutri lê e comenta) ------------
drop policy if exists feed_select on public.feed_pratos;
create policy feed_select on public.feed_pratos
  for select using (
    paciente_id = auth.uid()
    or paciente_id in (select id from public.pacientes where nutri_id = auth.uid())
  );

drop policy if exists feed_insert_paciente on public.feed_pratos;
create policy feed_insert_paciente on public.feed_pratos
  for insert with check (paciente_id = auth.uid());

drop policy if exists feed_update on public.feed_pratos;
create policy feed_update on public.feed_pratos
  for update using (
    paciente_id = auth.uid()
    or paciente_id in (select id from public.pacientes where nutri_id = auth.uid())
  );

drop policy if exists feed_delete_paciente on public.feed_pratos;
create policy feed_delete_paciente on public.feed_pratos
  for delete using (paciente_id = auth.uid());

-- 4.9 vendas (só a nutri dona) -------------------------------------
drop policy if exists vendas_all on public.vendas;
create policy vendas_all on public.vendas
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- 4.9b gastos (só a nutri dona) -----------------------------------
drop policy if exists gastos_all on public.gastos;
create policy gastos_all on public.gastos
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- 4.10 parcelas (só a nutri dona) ----------------------------------
drop policy if exists parcelas_all on public.parcelas;
create policy parcelas_all on public.parcelas
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- 4.12 check-ins ---------------------------------------------------
-- Templates: nutri gerencia os próprios; paciente lê apenas os que se aplicam a ela
drop policy if exists checkin_templates_all_nutri on public.checkin_templates;
create policy checkin_templates_all_nutri on public.checkin_templates
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());

drop policy if exists checkin_templates_select_paciente on public.checkin_templates;
create policy checkin_templates_select_paciente on public.checkin_templates
  for select using (
    paciente_id = auth.uid()
    or (paciente_id is null and nutri_id in (select nutri_id from public.pacientes where id = auth.uid()))
  );

-- Envios: paciente vê os próprios; nutri gerencia os enviados a suas pacientes;
-- paciente pode atualizar (responder) os próprios.
drop policy if exists checkin_envios_select on public.checkin_envios;
create policy checkin_envios_select on public.checkin_envios
  for select using (paciente_id = auth.uid() or nutri_id = auth.uid());

drop policy if exists checkin_envios_insert_nutri on public.checkin_envios;
create policy checkin_envios_insert_nutri on public.checkin_envios
  for insert with check (nutri_id = auth.uid());

drop policy if exists checkin_envios_update on public.checkin_envios;
create policy checkin_envios_update on public.checkin_envios
  for update using (paciente_id = auth.uid() or nutri_id = auth.uid())
  with check (paciente_id = auth.uid() or nutri_id = auth.uid());

drop policy if exists checkin_envios_delete_nutri on public.checkin_envios;
create policy checkin_envios_delete_nutri on public.checkin_envios
  for delete using (nutri_id = auth.uid());

-- Agendamentos: nutri gerencia os próprios (paciente não vê)
drop policy if exists checkin_agendamentos_all_nutri on public.checkin_agendamentos;
create policy checkin_agendamentos_all_nutri on public.checkin_agendamentos
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- Serviços: nutri gerencia os próprios (paciente não vê)
drop policy if exists servicos_all_nutri on public.servicos;
create policy servicos_all_nutri on public.servicos
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- Benefícios: nutri gerencia os próprios; QUALQUER paciente dela pode
-- ler (diferente de todo o resto do app, que é escopado por paciente_id
-- — aqui não existe paciente_id, é compartilhado entre todas as
-- pacientes daquela nutri).
drop policy if exists beneficios_select on public.beneficios;
create policy beneficios_select on public.beneficios
  for select using (
    nutri_id = auth.uid()
    or exists (select 1 from public.pacientes p where p.id = auth.uid() and p.nutri_id = beneficios.nutri_id)
  );

drop policy if exists beneficios_write_nutri on public.beneficios;
create policy beneficios_write_nutri on public.beneficios
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- 4.10b fotos_evolucao (paciente vê próprias; nutri vê das pacientes)
drop policy if exists fotos_evolucao_select on public.fotos_evolucao;
create policy fotos_evolucao_select on public.fotos_evolucao
  for select using (
    paciente_id = auth.uid()
    or exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid())
  );

drop policy if exists fotos_evolucao_insert_nutri on public.fotos_evolucao;
create policy fotos_evolucao_insert_nutri on public.fotos_evolucao
  for insert with check (
    exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid())
  );

drop policy if exists fotos_evolucao_insert_paciente on public.fotos_evolucao;
create policy fotos_evolucao_insert_paciente on public.fotos_evolucao
  for insert with check (paciente_id = auth.uid());

drop policy if exists fotos_evolucao_delete on public.fotos_evolucao;
create policy fotos_evolucao_delete on public.fotos_evolucao
  for delete using (
    paciente_id = auth.uid()
    or exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid())
  );

-- 4.10c pacientes_pendentes (só a nutri dona) ----------------------
drop policy if exists pacientes_pendentes_all_nutri on public.pacientes_pendentes;
create policy pacientes_pendentes_all_nutri on public.pacientes_pendentes
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- 4.11 consultas (nutri gerencia; paciente vê só as próprias) ------
drop policy if exists consultas_select on public.consultas;
create policy consultas_select on public.consultas
  for select using (paciente_id = auth.uid() or nutri_id = auth.uid());

drop policy if exists consultas_write_nutri on public.consultas;
create policy consultas_write_nutri on public.consultas
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());


-- =============================================================
-- 5. TRIGGER: handle_new_user
-- =============================================================
-- Quando alguém aceita o convite do Supabase (e portanto cria uma
-- linha em auth.users), espelhamos automaticamente em nutris ou
-- pacientes — conforme o `user_metadata.role` enviado no invite.
--
-- Fluxo:
--   • Nutri se cadastra normal via signUp({ data: { role: 'nutri',
--     nome: '...', crn: '...' } }) → cria linha em `nutris`.
--   • Nutri convida paciente via Edge Function que chama
--     auth.admin.inviteUserByEmail(email, { data: {
--       role: 'paciente', nutri_id, nome, objetivo, tipo_plano,
--       modalidade } }) → ao aceitar, cria linha em `pacientes`.
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', '');
begin
  if v_role = 'nutri' then
    insert into public.nutris (id, nome, crn, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'nome', new.email),
      new.raw_user_meta_data ->> 'crn',
      new.email
    )
    on conflict (id) do nothing;

  elsif v_role = 'paciente' then
    declare
      v_nutri_id    uuid := (new.raw_user_meta_data ->> 'nutri_id')::uuid;
      v_pendente    public.pacientes_pendentes%rowtype;
    begin
      -- Tenta encontrar paciente pendente importada com o mesmo email
      select * into v_pendente
      from public.pacientes_pendentes
      where nutri_id = v_nutri_id and lower(email) = lower(new.email)
      limit 1;

      if found then
        -- Migra dados da importação, preenchendo com o que veio no signup
        insert into public.pacientes (
          id, nutri_id, nome, email, objetivo, tipo_plano, modalidade
        )
        values (
          new.id,
          v_nutri_id,
          coalesce(new.raw_user_meta_data ->> 'nome',       v_pendente.nome,       new.email),
          new.email,
          coalesce(new.raw_user_meta_data ->> 'objetivo',   v_pendente.objetivo),
          coalesce(new.raw_user_meta_data ->> 'tipo_plano', v_pendente.tipo_plano),
          coalesce(new.raw_user_meta_data ->> 'modalidade', v_pendente.modalidade)
        )
        on conflict (id) do nothing;

        update public.pacientes_pendentes
          set status = 'ativado'
          where id = v_pendente.id;
      else
        insert into public.pacientes (
          id, nutri_id, nome, email, objetivo, tipo_plano, modalidade
        )
        values (
          new.id,
          v_nutri_id,
          coalesce(new.raw_user_meta_data ->> 'nome', new.email),
          new.email,
          new.raw_user_meta_data ->> 'objetivo',
          new.raw_user_meta_data ->> 'tipo_plano',
          new.raw_user_meta_data ->> 'modalidade'
        )
        on conflict (id) do nothing;
      end if;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================
-- 6. STORAGE BUCKETS
-- =============================================================
-- Convenção de caminho: <paciente_id>/<arquivo>
-- Isso permite que as políticas usem split_part(name,'/',1) para
-- identificar a paciente dona da pasta.
-- =============================================================
insert into storage.buckets (id, name, public)
values ('prescricoes', 'prescricoes', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('fotos_pratos', 'fotos_pratos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('fotos_evolucao', 'fotos_evolucao', false)
on conflict (id) do nothing;


-- =============================================================
-- 7. POLÍTICAS DE STORAGE
-- =============================================================

-- 7.1 prescricoes (nutri envia PDFs; paciente lê os próprios) ------

drop policy if exists prescricoes_storage_select on storage.objects;
create policy prescricoes_storage_select on storage.objects
  for select using (
    bucket_id = 'prescricoes'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or split_part(name, '/', 1) in (
        select id::text from public.pacientes where nutri_id = auth.uid()
      )
    )
  );

drop policy if exists prescricoes_storage_insert_nutri on storage.objects;
create policy prescricoes_storage_insert_nutri on storage.objects
  for insert with check (
    bucket_id = 'prescricoes'
    and split_part(name, '/', 1) in (
      select id::text from public.pacientes where nutri_id = auth.uid()
    )
  );

drop policy if exists prescricoes_storage_delete_nutri on storage.objects;
create policy prescricoes_storage_delete_nutri on storage.objects
  for delete using (
    bucket_id = 'prescricoes'
    and split_part(name, '/', 1) in (
      select id::text from public.pacientes where nutri_id = auth.uid()
    )
  );

-- 7.2 fotos_pratos (paciente posta na própria pasta; nutri lê) -----

drop policy if exists fotos_pratos_storage_select on storage.objects;
create policy fotos_pratos_storage_select on storage.objects
  for select using (
    bucket_id = 'fotos_pratos'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or split_part(name, '/', 1) in (
        select id::text from public.pacientes where nutri_id = auth.uid()
      )
    )
  );

drop policy if exists fotos_pratos_storage_insert_paciente on storage.objects;
create policy fotos_pratos_storage_insert_paciente on storage.objects
  for insert with check (
    bucket_id = 'fotos_pratos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists fotos_pratos_storage_delete_paciente on storage.objects;
create policy fotos_pratos_storage_delete_paciente on storage.objects
  for delete using (
    bucket_id = 'fotos_pratos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- 7.3 fotos_evolucao (nutri OU paciente sobem; ambos leem) ---------

drop policy if exists fotos_evolucao_storage_select on storage.objects;
create policy fotos_evolucao_storage_select on storage.objects
  for select using (
    bucket_id = 'fotos_evolucao'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or split_part(name, '/', 1) in (
        select id::text from public.pacientes where nutri_id = auth.uid()
      )
    )
  );

drop policy if exists fotos_evolucao_storage_insert_paciente on storage.objects;
create policy fotos_evolucao_storage_insert_paciente on storage.objects
  for insert with check (
    bucket_id = 'fotos_evolucao'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists fotos_evolucao_storage_insert_nutri on storage.objects;
create policy fotos_evolucao_storage_insert_nutri on storage.objects
  for insert with check (
    bucket_id = 'fotos_evolucao'
    and split_part(name, '/', 1) in (
      select id::text from public.pacientes where nutri_id = auth.uid()
    )
  );

drop policy if exists fotos_evolucao_storage_delete on storage.objects;
create policy fotos_evolucao_storage_delete on storage.objects
  for delete using (
    bucket_id = 'fotos_evolucao'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or split_part(name, '/', 1) in (
        select id::text from public.pacientes where nutri_id = auth.uid()
      )
    )
  );


-- =============================================================
-- 7.b REALTIME PUBLICATION (chat em tempo real)
-- =============================================================
-- Adiciona mensagens à publicação supabase_realtime para que
-- INSERTs disparem eventos no cliente via supabase.channel().
-- Idempotente: ignora erro se já estiver adicionado.
-- =============================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.mensagens;
  exception when duplicate_object then null;
  end;
end$$;


-- =============================================================
-- 8. GRANTS (privilégios de acesso aos roles do Supabase)
-- =============================================================
-- O Supabase normalmente aplica esses GRANTs automaticamente em
-- projetos novos. Em alguns projetos eles não vêm — sem isso o
-- PostgREST retorna 403 antes de checar a RLS, então login real
-- não funciona. Reaplicar é idempotente e seguro.
-- A segurança real é garantida pela RLS, não pelos GRANTs.
-- =============================================================
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

grant execute on all functions in schema public
  to anon, authenticated, service_role;

-- Garante que tabelas criadas FUTURAMENTE também tenham os GRANTs
alter default privileges in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant execute on functions
  to anon, authenticated, service_role;


-- =============================================================
-- 9. AGENDAMENTO AUTOMÁTICO DE CHECK-INS (pg_cron — opcional)
-- =============================================================
-- Sem isto, os agendamentos só disparam quando a nutri abre
-- `/nutri/checkins`. Com pg_cron habilitado, dispara todo dia 8h
-- (horário de Brasília) mesmo que a nutri não abra o app.
--
-- Como habilitar pg_cron no Supabase:
--   1. Dashboard → Database → Extensions → busque "pg_cron"
--   2. Clique em "Enable"
--   3. Rode este bloco no SQL Editor
-- =============================================================

-- Função que processa todos os agendamentos vencidos
create or replace function public.processar_agendamentos_checkin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ag       record;
  pac_id   uuid;
  prox     date;
begin
  for ag in
    select * from public.checkin_agendamentos
    where ativo = true and proximo_envio <= current_date
    for update skip locked
  loop
    -- Para "todas as pacientes", cria 1 envio pra cada
    if ag.paciente_id is null then
      for pac_id in
        select id from public.pacientes where nutri_id = ag.nutri_id
      loop
        insert into public.checkin_envios (nutri_id, paciente_id, perguntas)
        select ag.nutri_id, pac_id, t.perguntas
        from public.checkin_templates t where t.id = ag.template_id;
      end loop;
    else
      insert into public.checkin_envios (nutri_id, paciente_id, perguntas)
      select ag.nutri_id, ag.paciente_id, t.perguntas
      from public.checkin_templates t where t.id = ag.template_id;
    end if;

    -- Avança próximo envio conforme frequência
    prox := case ag.frequencia
      when 'semanal'    then ag.proximo_envio + interval '7 days'
      when 'quinzenal'  then ag.proximo_envio + interval '14 days'
      when 'mensal'     then ag.proximo_envio + interval '1 month'
      else                   ag.proximo_envio + interval '7 days'
    end;

    update public.checkin_agendamentos
      set proximo_envio = prox, ultimo_envio = now()
      where id = ag.id;
  end loop;
end;
$$;

-- Agenda execução diária às 11 UTC (= 8h horário de Brasília)
-- pg_cron é OPCIONAL. Se não estiver habilitado, esse bloco simplesmente pula.
-- Pra habilitar: Database → Extensions → busca "pg_cron" → enable → rode o setup de novo.
do $$
begin
  -- Só tenta agendar SE o schema "cron" existir (pg_cron habilitado)
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      perform cron.schedule(
        'lapidare-checkins-diario',
        '0 11 * * *',
        $cron$select public.processar_agendamentos_checkin();$cron$
      );
      raise notice 'pg_cron agendado: check-ins automáticos vão rodar diariamente às 11 UTC';
    exception
      when duplicate_object then null;  -- já agendado, tudo bem
      when others then
        raise notice 'pg_cron presente mas não foi possível agendar: %', SQLERRM;
    end;
  else
    raise notice 'pg_cron NÃO habilitado (opcional). Pra ativar check-ins automáticos: Database → Extensions → pg_cron → enable, depois rode o setup de novo.';
  end if;
end$$;


-- =============================================================
-- 10. EXTRAS — recursos adicionados depois (idempotente)
-- =============================================================
-- E-books (biblioteca), Follow-ups (anotações), Suplementação,
-- LGPD (termo + nascimento), Pré-consulta (questionários),
-- Cadastro manual (token único)
-- =============================================================

-- 10.1 Colunas extras em tabelas existentes ---------------------
alter table public.pacientes        add column if not exists nascimento       date;
alter table public.pacientes        add column if not exists termo_aceito_em  timestamptz;
alter table public.pacientes        add column if not exists termo_versao     text;
alter table public.pacientes        add column if not exists sexo             text default 'feminino' check (sexo in ('feminino', 'masculino'));
-- condicoes: lista de etiquetas clínicas com categoria — {texto, categoria}.
-- Bloco trata 3 casos: coluna não existe (cria jsonb); coluna existe como
-- text[] de uma versão anterior (converte preservando os dados, categoria
-- vira "diagnostico" por padrão); coluna já é jsonb (não faz nada).
-- Função auxiliar: Postgres não permite subquery direto dentro do USING
-- de um ALTER COLUMN TYPE, então convertemos via função.
create or replace function public._condicoes_text_to_jsonb(arr text[])
returns jsonb language sql immutable as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('texto', c, 'categoria', 'diagnostico')),
    '[]'::jsonb
  )
  from unnest(arr) as c;
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pacientes' and column_name = 'condicoes'
  ) then
    alter table public.pacientes add column condicoes jsonb not null default '[]'::jsonb;
  elsif (
    select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'pacientes' and column_name = 'condicoes'
  ) = 'ARRAY' then
    alter table public.pacientes alter column condicoes drop default;
    alter table public.pacientes
      alter column condicoes type jsonb
      using public._condicoes_text_to_jsonb(condicoes);
    alter table public.pacientes alter column condicoes set default '[]'::jsonb;
  end if;
end$$;

drop function if exists public._condicoes_text_to_jsonb(text[]);

alter table public.checkin_templates add column if not exists tipo text not null default 'recorrente';
alter table public.checkin_templates drop constraint if exists checkin_templates_tipo_check;
alter table public.checkin_templates
  add constraint checkin_templates_tipo_check check (tipo in ('recorrente', 'pre_consulta', 'atendimento'));

alter table public.checkin_envios   add column if not exists nome text;
alter table public.checkin_envios   add column if not exists tipo text not null default 'recorrente';
alter table public.checkin_envios   drop constraint if exists checkin_envios_tipo_check;
alter table public.checkin_envios
  add constraint checkin_envios_tipo_check check (tipo in ('recorrente', 'pre_consulta', 'atendimento'));

alter table public.pacientes_pendentes
  add column if not exists token uuid not null default gen_random_uuid();
create unique index if not exists pacientes_pendentes_token_idx on public.pacientes_pendentes(token);
alter table public.pacientes_pendentes
  add column if not exists sexo text default 'feminino' check (sexo in ('feminino', 'masculino'));
-- v1.24.0: respostas do questionário de pré-cadastro (link público)
alter table public.pacientes_pendentes
  add column if not exists intake_respostas jsonb,
  add column if not exists intake_respondido_em timestamptz;

alter table public.prescricoes drop constraint if exists prescricoes_tipo_check;
alter table public.prescricoes
  add constraint prescricoes_tipo_check
  check (tipo in ('exame', 'laudo', 'receita', 'suplementacao'));


-- 10.2 E-books (biblioteca + atribuições) ----------------------
create table if not exists public.ebooks (
  id            uuid primary key default gen_random_uuid(),
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  titulo        text not null,
  descricao     text,
  storage_path  text not null,
  tag           text,
  created_at    timestamptz not null default now()
);
create index if not exists ebooks_nutri_idx on public.ebooks(nutri_id, created_at desc);

create table if not exists public.ebooks_pacientes (
  id          uuid primary key default gen_random_uuid(),
  ebook_id    uuid not null references public.ebooks(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (ebook_id, paciente_id)
);
create index if not exists ebooks_pacientes_paciente_idx on public.ebooks_pacientes(paciente_id);
create index if not exists ebooks_pacientes_ebook_idx    on public.ebooks_pacientes(ebook_id);


-- 10.3 Follow-ups (anotações da nutri) -------------------------
create table if not exists public.followup_templates (
  id          uuid primary key default gen_random_uuid(),
  nutri_id    uuid not null references public.nutris(id) on delete cascade,
  nome        text not null,
  descricao   text,
  conteudo    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists followup_templates_nutri_idx
  on public.followup_templates(nutri_id, created_at desc);

create table if not exists public.followups (
  id          uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  nutri_id    uuid not null references public.nutris(id) on delete cascade,
  titulo      text not null,
  conteudo    text not null,
  data        date not null default current_date,
  template_id uuid references public.followup_templates(id) on delete set null,
  consulta_id uuid references public.consultas(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists followups_paciente_idx on public.followups(paciente_id, data desc, created_at desc);
create index if not exists followups_nutri_idx    on public.followups(nutri_id);

-- Evolução de hábitos/sintomas relatados — a nutri escreve manualmente o
-- que a paciente relatou sobre um item (ex: "Intestino", "Sono") a cada
-- consulta, formando um histórico. Diferente do habit tracker (paciente
-- marca diariamente) e do check-in (perguntas fixas) — aqui é 100% texto
-- livre, escrito só pela nutri, pra usar no Modo Apresentação da Evolução.
create table if not exists public.evolucao_habitos (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  item          text not null,
  nota          text not null,
  data          date not null default current_date,
  created_at    timestamptz not null default now()
);
create index if not exists evolucao_habitos_paciente_idx on public.evolucao_habitos(paciente_id, item, data);


-- 10.4 Suplementação (lista + habit tracker) -------------------
create table if not exists public.suplementos (
  id          uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  nutri_id    uuid not null references public.nutris(id) on delete cascade,
  nome        text not null,
  dose        text,
  horario     text,
  obs         text,
  ordem       int not null default 0,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists suplementos_paciente_idx on public.suplementos(paciente_id, ativo, ordem);

create table if not exists public.suplementos_logs (
  id            uuid primary key default gen_random_uuid(),
  suplemento_id uuid not null references public.suplementos(id) on delete cascade,
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  data          date not null default current_date,
  tomado        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (suplemento_id, data)
);
create index if not exists suplementos_logs_paciente_idx on public.suplementos_logs(paciente_id, data desc);


-- 10.5 RLS + policies das tabelas novas ------------------------
alter table public.ebooks              enable row level security;
alter table public.ebooks_pacientes    enable row level security;
alter table public.followup_templates  enable row level security;
alter table public.followups           enable row level security;
alter table public.evolucao_habitos    enable row level security;
alter table public.suplementos         enable row level security;
alter table public.suplementos_logs    enable row level security;

-- ebooks
drop policy if exists ebooks_select on public.ebooks;
create policy ebooks_select on public.ebooks for select using (
  nutri_id = auth.uid()
  or exists (select 1 from public.ebooks_pacientes ep where ep.ebook_id = id and ep.paciente_id = auth.uid())
);
drop policy if exists ebooks_write_nutri on public.ebooks;
create policy ebooks_write_nutri on public.ebooks for all
  using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- ebooks_pacientes
drop policy if exists ebooks_pacientes_select on public.ebooks_pacientes;
create policy ebooks_pacientes_select on public.ebooks_pacientes for select using (
  paciente_id = auth.uid()
  or exists (select 1 from public.ebooks e where e.id = ebook_id and e.nutri_id = auth.uid())
);
drop policy if exists ebooks_pacientes_write_nutri on public.ebooks_pacientes;
create policy ebooks_pacientes_write_nutri on public.ebooks_pacientes for all
  using (exists (select 1 from public.ebooks e where e.id = ebook_id and e.nutri_id = auth.uid()))
  with check (exists (select 1 from public.ebooks e where e.id = ebook_id and e.nutri_id = auth.uid()));

-- followup_templates + followups (só a nutri)
drop policy if exists followup_templates_all_nutri on public.followup_templates;
create policy followup_templates_all_nutri on public.followup_templates for all
  using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());
drop policy if exists followups_all_nutri on public.followups;
create policy followups_all_nutri on public.followups for all
  using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());
drop policy if exists evolucao_habitos_all_nutri on public.evolucao_habitos;
create policy evolucao_habitos_all_nutri on public.evolucao_habitos for all
  using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- suplementos (nutri gerencia, paciente vê os próprios)
drop policy if exists suplementos_select on public.suplementos;
create policy suplementos_select on public.suplementos for select
  using (paciente_id = auth.uid() or nutri_id = auth.uid());
drop policy if exists suplementos_write_nutri on public.suplementos;
create policy suplementos_write_nutri on public.suplementos for all
  using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- suplementos_logs (paciente marca, nutri lê)
drop policy if exists suplementos_logs_select on public.suplementos_logs;
create policy suplementos_logs_select on public.suplementos_logs for select using (
  paciente_id = auth.uid()
  or exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid())
);
drop policy if exists suplementos_logs_write_paciente on public.suplementos_logs;
create policy suplementos_logs_write_paciente on public.suplementos_logs for all
  using (paciente_id = auth.uid()) with check (paciente_id = auth.uid());

-- Paciente atualizar próprio registro (pra termo LGPD)
drop policy if exists pacientes_update_self on public.pacientes;
create policy pacientes_update_self on public.pacientes for update
  using (id = auth.uid()) with check (id = auth.uid());


-- 10.5-b Bucket de documentos (PDFs do Plano/Substituições/Compras) — v1.10.0
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', true)
on conflict (id) do nothing;

drop policy if exists documentos_select on storage.objects;
create policy documentos_select on storage.objects
  for select using (bucket_id = 'documentos');

drop policy if exists documentos_insert on storage.objects;
create policy documentos_insert on storage.objects
  for insert with check (
    bucket_id = 'documentos' and auth.uid() is not null
  );

drop policy if exists documentos_update on storage.objects;
create policy documentos_update on storage.objects
  for update using (
    bucket_id = 'documentos' and auth.uid() is not null
  );

drop policy if exists documentos_delete on storage.objects;
create policy documentos_delete on storage.objects
  for delete using (
    bucket_id = 'documentos' and auth.uid() is not null
  );


-- 10.6 Bucket de e-books + policies ----------------------------
insert into storage.buckets (id, name, public)
values ('ebooks', 'ebooks', false)
on conflict (id) do nothing;

drop policy if exists ebooks_storage_select on storage.objects;
create policy ebooks_storage_select on storage.objects for select using (
  bucket_id = 'ebooks'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or exists (
      select 1 from public.ebooks e
      join public.ebooks_pacientes ep on ep.ebook_id = e.id
      where e.storage_path = name and ep.paciente_id = auth.uid()
    )
  )
);
drop policy if exists ebooks_storage_insert on storage.objects;
create policy ebooks_storage_insert on storage.objects for insert with check (
  bucket_id = 'ebooks' and split_part(name, '/', 1) = auth.uid()::text
);
drop policy if exists ebooks_storage_delete on storage.objects;
create policy ebooks_storage_delete on storage.objects for delete using (
  bucket_id = 'ebooks' and split_part(name, '/', 1) = auth.uid()::text
);


-- 10.6b Função pública pra buscar nome da nutri (sem token) -----
-- Usada pelo signup genérico e pelo link fixo de pré-consulta —
-- paciente/visitante ainda não está autenticada, e a policy de select
-- em `nutris` só permite id = auth.uid(), então essa leitura via
-- .from() nunca funcionaria pra usuário anônimo.
drop function if exists public.buscar_nome_nutri(uuid);
create or replace function public.buscar_nome_nutri(p_nutri_id uuid)
returns table(nome text, marca_nome text)
language sql security definer set search_path = public
as $$
  select n.nome, coalesce(n.marca_nome, 'Lapidare') as marca_nome
  from public.nutris n
  where n.id = p_nutri_id
  limit 1;
$$;
grant execute on function public.buscar_nome_nutri(uuid) to anon, authenticated;

-- 10.7 Função pública pra buscar pendente por token ------------
drop function if exists public.buscar_pendente_por_token(uuid);
create or replace function public.buscar_pendente_por_token(p_token uuid)
returns table(
  nome text, email text, nascimento date, sexo text,
  objetivo text, tipo_plano text, modalidade text,
  nutri_id uuid, nutri_nome text, status text
)
language sql security definer set search_path = public
as $$
  select pp.nome, pp.email, pp.nascimento, coalesce(pp.sexo, 'feminino') as sexo,
    pp.objetivo, pp.tipo_plano, pp.modalidade, pp.nutri_id,
    n.nome as nutri_nome, pp.status
  from public.pacientes_pendentes pp
  join public.nutris n on n.id = pp.nutri_id
  where pp.token = p_token
  limit 1;
$$;
grant execute on function public.buscar_pendente_por_token(uuid) to anon, authenticated;

-- 10.7b Funções públicas do questionário de pré-cadastro --------
-- (preenchido pelo futuro paciente, antes de existir qualquer conta)
drop function if exists public.buscar_template_intake(uuid);
create or replace function public.buscar_template_intake(p_nutri_id uuid)
returns jsonb
language sql security definer set search_path = public
as $$
  select intake_perguntas from public.nutris where id = p_nutri_id limit 1;
$$;
grant execute on function public.buscar_template_intake(uuid) to anon, authenticated;

drop function if exists public.salvar_intake_pendente(uuid, jsonb);
create or replace function public.salvar_intake_pendente(p_token uuid, p_respostas jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.pacientes_pendentes
    set intake_respostas = p_respostas,
        intake_respondido_em = now()
    where token = p_token;
end;
$$;
grant execute on function public.salvar_intake_pendente(uuid, jsonb) to anon, authenticated;

-- 10.7c Caixa de entrada de pré-consulta (link FIXO, reutilizável) ---
-- Substitui o fluxo por token: a nutri tem 2 links fixos (geral e QFA)
-- que envia pra qualquer pessoa, sempre os mesmos — a própria pessoa
-- preenche nome/email no formulário. As respostas caem aqui, sem
-- precisar de nenhum cadastro prévio.
create table if not exists public.pre_consulta_respostas (
  id            uuid primary key default gen_random_uuid(),
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  tipo          text not null check (tipo in ('geral', 'qfa')),
  nome          text,
  email         text,
  perguntas     jsonb not null,
  respostas     jsonb not null,
  cadastrada    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists pre_consulta_respostas_nutri_idx on public.pre_consulta_respostas(nutri_id, cadastrada, created_at desc);

alter table public.pre_consulta_respostas enable row level security;

drop policy if exists pre_consulta_respostas_all_nutri on public.pre_consulta_respostas;
create policy pre_consulta_respostas_all_nutri on public.pre_consulta_respostas
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());

drop function if exists public.salvar_intake_submissao(uuid, text, text, text, jsonb, jsonb);
create or replace function public.salvar_intake_submissao(
  p_nutri_id uuid, p_tipo text, p_nome text, p_email text,
  p_perguntas jsonb, p_respostas jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.pre_consulta_respostas (nutri_id, tipo, nome, email, perguntas, respostas)
  values (p_nutri_id, p_tipo, p_nome, p_email, p_perguntas, p_respostas);
end;
$$;
grant execute on function public.salvar_intake_submissao(uuid, text, text, text, jsonb, jsonb) to anon, authenticated;


-- 10.8 handle_new_user atualizado (nascimento + pré-consulta) --
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', '');
begin
  if v_role = 'nutri' then
    insert into public.nutris (id, nome, crn, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'nome', new.email),
      new.raw_user_meta_data ->> 'crn',
      new.email
    )
    on conflict (id) do nothing;
  elsif v_role = 'paciente' then
    declare
      v_nutri_id uuid := (new.raw_user_meta_data ->> 'nutri_id')::uuid;
      v_pendente public.pacientes_pendentes%rowtype;
      v_template record;
    begin
      select * into v_pendente from public.pacientes_pendentes
      where nutri_id = v_nutri_id and lower(email) = lower(new.email) limit 1;

      if found then
        insert into public.pacientes (id, nutri_id, nome, email, objetivo, tipo_plano, modalidade, nascimento, sexo)
        values (
          new.id, v_nutri_id,
          coalesce(new.raw_user_meta_data ->> 'nome',       v_pendente.nome,       new.email),
          new.email,
          coalesce(new.raw_user_meta_data ->> 'objetivo',   v_pendente.objetivo),
          coalesce(new.raw_user_meta_data ->> 'tipo_plano', v_pendente.tipo_plano),
          coalesce(new.raw_user_meta_data ->> 'modalidade', v_pendente.modalidade),
          coalesce((new.raw_user_meta_data ->> 'nascimento')::date, v_pendente.nascimento),
          coalesce(new.raw_user_meta_data ->> 'sexo',       v_pendente.sexo,       'feminino')
        ) on conflict (id) do nothing;
        update public.pacientes_pendentes set status = 'ativado' where id = v_pendente.id;
      else
        insert into public.pacientes (id, nutri_id, nome, email, objetivo, tipo_plano, modalidade, nascimento, sexo)
        values (
          new.id, v_nutri_id,
          coalesce(new.raw_user_meta_data ->> 'nome', new.email),
          new.email,
          new.raw_user_meta_data ->> 'objetivo',
          new.raw_user_meta_data ->> 'tipo_plano',
          new.raw_user_meta_data ->> 'modalidade',
          (new.raw_user_meta_data ->> 'nascimento')::date,
          coalesce(new.raw_user_meta_data ->> 'sexo', 'feminino')
        ) on conflict (id) do nothing;
      end if;

      for v_template in
        select id, nome, perguntas from public.checkin_templates
        where nutri_id = v_nutri_id and tipo = 'pre_consulta'
      loop
        insert into public.checkin_envios (nutri_id, paciente_id, nome, tipo, perguntas, enviado_em)
        values (v_nutri_id, new.id,
          coalesce(v_template.nome, 'Check-in pré-consulta'),
          'pre_consulta', v_template.perguntas, now());
      end loop;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();


-- 10.9 processar_agendamentos_checkin atualizado --------------
create or replace function public.processar_agendamentos_checkin()
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_ag record; v_tpl record; v_proximo date;
begin
  for v_ag in select * from public.checkin_agendamentos
    where ativo = true and proximo_envio <= current_date
  loop
    select id, nome, perguntas into v_tpl from public.checkin_templates where id = v_ag.template_id;
    insert into public.checkin_envios (nutri_id, paciente_id, nome, tipo, perguntas, enviado_em)
    values (v_ag.nutri_id, v_ag.paciente_id,
      coalesce(v_tpl.nome, 'Check-in'), 'recorrente', v_tpl.perguntas, now());
    v_proximo := case v_ag.frequencia
      when 'semanal'   then v_ag.proximo_envio + interval '7 days'
      when 'quinzenal' then v_ag.proximo_envio + interval '14 days'
      when 'mensal'    then v_ag.proximo_envio + interval '1 month'
      else v_ag.proximo_envio + interval '7 days'
    end;
    update public.checkin_agendamentos
      set proximo_envio = v_proximo, ultimo_envio = now()
      where id = v_ag.id;
  end loop;
end;
$$;


-- 10.10 GRANTs nas tabelas novas -------------------------------
grant select, insert, update, delete on public.ebooks              to anon, authenticated, service_role;
grant select, insert, update, delete on public.ebooks_pacientes    to anon, authenticated, service_role;
grant select, insert, update, delete on public.followup_templates  to anon, authenticated, service_role;
grant select, insert, update, delete on public.followups           to anon, authenticated, service_role;
grant select, insert, update, delete on public.suplementos         to anon, authenticated, service_role;
grant select, insert, update, delete on public.suplementos_logs    to anon, authenticated, service_role;


-- =============================================================
-- 11. PERSONALIZAÇÃO (logo, cores, tipografia, textos)
-- =============================================================
alter table public.nutris add column if not exists logo_url        text;
alter table public.nutris add column if not exists marca_nome      text default 'Lapidare';
alter table public.nutris add column if not exists marca_subtitulo text;
alter table public.nutris add column if not exists cor_primaria    text default '#a08456';
alter table public.nutris add column if not exists cor_secundaria  text default '#c9a96e';
alter table public.nutris add column if not exists tipografia      text default 'classica';
alter table public.nutris add column if not exists mensagem_login  text;
alter table public.nutris add column if not exists mensagem_termo  text;
-- Override manual da cor do texto na sidebar (auto-calculada por luminância
-- por padrão; aqui a nutri pode forçar uma cor específica se quiser controle total)
alter table public.nutris add column if not exists cor_texto_sidebar text;

-- Foto de perfil da nutri (aparece pras pacientes no chat, feed, banners)
alter table public.nutris add column if not exists foto_url text;

alter table public.nutris drop constraint if exists nutris_tipografia_check;
alter table public.nutris add constraint nutris_tipografia_check
  check (tipografia in ('classica', 'modern', 'minimal', 'romantica'));

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Garante que o bucket é público (idempotente)
update storage.buckets set public = true where id = 'logos';

-- SELECT público (bucket é público, mas a policy explícita garante)
drop policy if exists logos_storage_select on storage.objects;
create policy logos_storage_select on storage.objects for select using (
  bucket_id = 'logos'
);

-- Como cada nutri tem SEU PRÓPRIO Supabase (1 nutri por deploy), permite
-- qualquer usuário autenticado fazer upload/update/delete no bucket logos.
-- Mais permissivo que checar UUID (que dava erro de RLS).
drop policy if exists logos_storage_insert on storage.objects;
create policy logos_storage_insert on storage.objects for insert with check (
  bucket_id = 'logos' and auth.uid() is not null
);
drop policy if exists logos_storage_update on storage.objects;
create policy logos_storage_update on storage.objects for update
  using (bucket_id = 'logos' and auth.uid() is not null)
  with check (bucket_id = 'logos' and auth.uid() is not null);
drop policy if exists logos_storage_delete on storage.objects;
create policy logos_storage_delete on storage.objects for delete using (
  bucket_id = 'logos' and auth.uid() is not null
);

-- DROP antes do CREATE pra permitir mudar o retorno (Postgres bloqueia
-- create-or-replace quando o return type muda)
drop function if exists public.buscar_personalizacao_nutri(uuid);

create or replace function public.buscar_personalizacao_nutri(p_nutri_id uuid)
returns table(
  marca_nome text, marca_subtitulo text, logo_url text,
  cor_primaria text, cor_secundaria text, tipografia text,
  mensagem_login text, mensagem_termo text, cor_texto_sidebar text,
  nutri_nome text, nutri_foto_url text
)
language sql security definer set search_path = public
as $$
  select
    coalesce(marca_nome, 'Lapidare'),
    marca_subtitulo, logo_url,
    coalesce(cor_primaria,   '#a08456'),
    coalesce(cor_secundaria, '#c9a96e'),
    coalesce(tipografia,     'classica'),
    mensagem_login, mensagem_termo, cor_texto_sidebar,
    coalesce(nome, 'Sua nutri') as nutri_nome,
    foto_url as nutri_foto_url
  from public.nutris where id = p_nutri_id limit 1;
$$;
grant execute on function public.buscar_personalizacao_nutri(uuid) to anon, authenticated;


-- 11.X buscar_marca_principal · usada pela tela de Login (anônimo)
-- Cada deploy é de UMA nutri (a "dona"). Essa função retorna a marca dela
-- pra personalizar a tela de Login antes mesmo de qualquer usuário logar.
-- DROP antes pra permitir mudar o retorno (mesmo motivo da função acima)
drop function if exists public.buscar_marca_principal();

create or replace function public.buscar_marca_principal()
returns table(
  marca_nome text, marca_subtitulo text, logo_url text,
  cor_primaria text, cor_secundaria text, tipografia text,
  mensagem_login text, cor_texto_sidebar text
)
language sql security definer set search_path = public
as $$
  select
    coalesce(marca_nome, 'Lapidare'),
    marca_subtitulo, logo_url,
    coalesce(cor_primaria,   '#a08456'),
    coalesce(cor_secundaria, '#c9a96e'),
    coalesce(tipografia,     'classica'),
    mensagem_login, cor_texto_sidebar
  from public.nutris
  order by created_at asc
  limit 1;
$$;
grant execute on function public.buscar_marca_principal() to anon, authenticated;


-- =============================================================
-- 12. HÁBITOS + AVISO E-BOOK + FIX RECURSÃO RLS
-- =============================================================

-- 12.1 ebooks_pacientes.visto_em (controle "novo" pra paciente)
alter table public.ebooks_pacientes add column if not exists visto_em timestamptz;


-- 12.2 SECURITY DEFINER pra quebrar recursão entre ebooks ↔ ebooks_pacientes
create or replace function public.paciente_pode_ver_ebook(p_ebook_id uuid)
returns boolean language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.ebooks_pacientes
    where ebook_id = p_ebook_id and paciente_id = auth.uid()
  );
$$;

create or replace function public.nutri_dona_do_ebook(p_ebook_id uuid)
returns boolean language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.ebooks where id = p_ebook_id and nutri_id = auth.uid()
  );
$$;

grant execute on function public.paciente_pode_ver_ebook(uuid) to anon, authenticated;
grant execute on function public.nutri_dona_do_ebook(uuid)     to anon, authenticated;


-- 12.3 Reescreve policies de ebooks sem recursão
drop policy if exists ebooks_select on public.ebooks;
create policy ebooks_select on public.ebooks for select using (
  nutri_id = auth.uid() or public.paciente_pode_ver_ebook(id)
);

drop policy if exists ebooks_pacientes_select on public.ebooks_pacientes;
create policy ebooks_pacientes_select on public.ebooks_pacientes for select using (
  paciente_id = auth.uid() or public.nutri_dona_do_ebook(ebook_id)
);

drop policy if exists ebooks_pacientes_write_nutri on public.ebooks_pacientes;
create policy ebooks_pacientes_write_nutri on public.ebooks_pacientes for all
  using (public.nutri_dona_do_ebook(ebook_id))
  with check (public.nutri_dona_do_ebook(ebook_id));

drop policy if exists ebooks_pacientes_update_paciente on public.ebooks_pacientes;
create policy ebooks_pacientes_update_paciente on public.ebooks_pacientes for update
  using (paciente_id = auth.uid()) with check (paciente_id = auth.uid());

drop policy if exists ebooks_storage_select on storage.objects;
create policy ebooks_storage_select on storage.objects for select using (
  bucket_id = 'ebooks'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or exists (
      select 1 from public.ebooks e
      where e.storage_path = name and public.paciente_pode_ver_ebook(e.id)
    )
  )
);


-- 12.4 Habit tracker personalizado
create table if not exists public.habitos (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  nome          text not null,
  emoji         text,
  tipo          text not null default 'boolean',
  meta          numeric,
  unidade       text,
  ordem         int not null default 0,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.habitos drop constraint if exists habitos_tipo_check;
alter table public.habitos add constraint habitos_tipo_check
  check (tipo in ('boolean', 'numero', 'escala'));
create index if not exists habitos_paciente_idx on public.habitos(paciente_id, ativo, ordem);

create table if not exists public.habitos_logs (
  id            uuid primary key default gen_random_uuid(),
  habito_id     uuid not null references public.habitos(id) on delete cascade,
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  data          date not null default current_date,
  valor         numeric not null,
  created_at    timestamptz not null default now(),
  unique (habito_id, data)
);
create index if not exists habitos_logs_paciente_idx on public.habitos_logs(paciente_id, data desc);

alter table public.habitos       enable row level security;
alter table public.habitos_logs  enable row level security;

drop policy if exists habitos_select on public.habitos;
create policy habitos_select on public.habitos for select
  using (paciente_id = auth.uid() or nutri_id = auth.uid());

drop policy if exists habitos_write_nutri on public.habitos;
create policy habitos_write_nutri on public.habitos for all
  using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

drop policy if exists habitos_logs_select on public.habitos_logs;
create policy habitos_logs_select on public.habitos_logs for select using (
  paciente_id = auth.uid()
  or exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid())
);

drop policy if exists habitos_logs_write_paciente on public.habitos_logs;
create policy habitos_logs_write_paciente on public.habitos_logs for all
  using (paciente_id = auth.uid()) with check (paciente_id = auth.uid());

grant select, insert, update, delete on public.habitos       to anon, authenticated, service_role;
grant select, insert, update, delete on public.habitos_logs  to anon, authenticated, service_role;


-- =============================================================
-- 13. ANAMNESE CLÍNICA (registro interno da nutri + PDF)
-- =============================================================

create table if not exists public.anamnese_templates (
  id          uuid primary key default gen_random_uuid(),
  nutri_id    uuid not null references public.nutris(id) on delete cascade,
  nome        text not null,
  descricao   text,
  estrutura   jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists anamnese_templates_nutri_idx
  on public.anamnese_templates(nutri_id, created_at desc);

create table if not exists public.anamneses (
  id           uuid primary key default gen_random_uuid(),
  paciente_id  uuid not null references public.pacientes(id) on delete cascade,
  nutri_id     uuid not null references public.nutris(id) on delete cascade,
  titulo       text not null,
  estrutura    jsonb not null,
  respostas    jsonb not null default '{}'::jsonb,
  data         date not null default current_date,
  template_id  uuid references public.anamnese_templates(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists anamneses_paciente_idx
  on public.anamneses(paciente_id, data desc, created_at desc);

alter table public.anamnese_templates enable row level security;
alter table public.anamneses           enable row level security;

drop policy if exists anamnese_templates_all_nutri on public.anamnese_templates;
create policy anamnese_templates_all_nutri on public.anamnese_templates for all
  using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

drop policy if exists anamneses_all_nutri on public.anamneses;
create policy anamneses_all_nutri on public.anamneses for all
  using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

grant select, insert, update, delete on public.anamnese_templates to anon, authenticated, service_role;
grant select, insert, update, delete on public.anamneses          to anon, authenticated, service_role;


-- =============================================================
-- FIM — Lapidare setup
-- =============================================================
-- Pós-instalação na nutri:
--   1. Em Authentication → Providers, garanta que "Email" está
--      habilitado.
--   2. Em Authentication → URL Configuration, defina a Site URL
--      como a URL final do Netlify (ex: https://app-da-nutri.netlify.app).
--   3. Em Authentication → Templates, edite o template "Invite user"
--      em português se desejar.
--   4. (Opcional) Em Database → Extensions, habilite `pg_cron`
--      para envio automático de check-ins.
-- =============================================================
e