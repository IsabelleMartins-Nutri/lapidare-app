-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.16.0 · EXAMES LABORATORIAIS
-- ════════════════════════════════════════════════════════════════════
-- Adiciona a tabela de exames laboratoriais (aba "Exames" no perfil
-- da paciente): registro de valores por data + upload de PDF do
-- laboratório + evolução comparando datas.
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.exames_registros (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid references public.nutris(id) on delete set null,
  data          date not null default current_date,
  valores       jsonb,
  pdf_url       text,
  obs           text,
  created_at    timestamptz not null default now()
);
create index if not exists exames_registros_paciente_id_idx on public.exames_registros(paciente_id, data);

alter table public.exames_registros enable row level security;

drop policy if exists exames_select_paciente on public.exames_registros;
create policy exames_select_paciente on public.exames_registros
  for select using (paciente_id = auth.uid());

drop policy if exists exames_all_nutri on public.exames_registros;
create policy exames_all_nutri on public.exames_registros
  for all
  using (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()))
  with check (exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid()));
