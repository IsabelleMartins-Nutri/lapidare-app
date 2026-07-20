-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.17.0 · EXAMES DE IMAGEM + PEDIDO DE EXAME
-- ════════════════════════════════════════════════════════════════════
-- Adiciona duas tabelas novas dentro da aba "Exames":
--   1. exames_imagem  — anotações livres de exames de imagem (ultrassom,
--      raio-x, densitometria) por data.
--   2. pedidos_exame  — pedidos de exame que a nutri gera em PDF pra
--      paciente levar ao laboratório.
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente.
-- ════════════════════════════════════════════════════════════════════

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

create table if not exists public.pedidos_exame (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid references public.nutris(id) on delete set null,
  data          date not null default current_date,
  exames        jsonb not null default '[]',
  obs           text,
  pdf_url       text,
  created_at    timestamptz not null default now()
);
create index if not exists pedidos_exame_paciente_id_idx on public.pedidos_exame(paciente_id, data);

alter table public.exames_imagem enable row level security;
alter table public.pedidos_exame enable row level security;

drop policy if exists exames_imagem_select_paciente on public.exames_imagem;
create policy exames_imagem_select_paciente on public.exames_imagem
  for select using (paciente_id = auth.uid());

drop policy if exists exames_imagem_all_nutri on public.exames_imagem;
create policy exames_imagem_all_nutri on public.exames_imagem
  for all
  using (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()))
  with check (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()));

drop policy if exists pedidos_exame_select_paciente on public.pedidos_exame;
create policy pedidos_exame_select_paciente on public.pedidos_exame
  for select using (paciente_id = auth.uid());

drop policy if exists pedidos_exame_all_nutri on public.pedidos_exame;
create policy pedidos_exame_all_nutri on public.pedidos_exame
  for all
  using (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()))
  with check (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()));
