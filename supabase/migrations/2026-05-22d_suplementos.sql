-- =============================================================
-- Migration 2026-05-22d
-- Suplementação: lista de suplementos + habit tracker
-- =============================================================
-- Idempotente. Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================

-- 1. TABELAS ----------------------------------------------------

-- 1.1 Suplementos prescritos pela nutri à paciente
create table if not exists public.suplementos (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  nome          text not null,
  dose          text,
  horario       text,                 -- "Café da manhã", "08:00", etc.
  obs           text,
  ordem         int  not null default 0,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists suplementos_paciente_idx on public.suplementos(paciente_id, ativo, ordem);

-- 1.2 Log de tomadas (1 linha por suplemento/dia quando paciente marca)
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


-- 2. RLS --------------------------------------------------------
alter table public.suplementos       enable row level security;
alter table public.suplementos_logs  enable row level security;

-- Suplementos: paciente vê os próprios; nutri gerencia
drop policy if exists suplementos_select on public.suplementos;
create policy suplementos_select on public.suplementos
  for select using (paciente_id = auth.uid() or nutri_id = auth.uid());

drop policy if exists suplementos_write_nutri on public.suplementos;
create policy suplementos_write_nutri on public.suplementos
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- Logs: paciente gerencia os próprios; nutri lê pra ver aderência
drop policy if exists suplementos_logs_select on public.suplementos_logs;
create policy suplementos_logs_select on public.suplementos_logs
  for select using (
    paciente_id = auth.uid()
    or exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid())
  );

drop policy if exists suplementos_logs_write_paciente on public.suplementos_logs;
create policy suplementos_logs_write_paciente on public.suplementos_logs
  for all using (paciente_id = auth.uid()) with check (paciente_id = auth.uid());


-- 3. GRANTS -----------------------------------------------------
grant select, insert, update, delete on public.suplementos       to anon, authenticated, service_role;
grant select, insert, update, delete on public.suplementos_logs  to anon, authenticated, service_role;


-- 4. Permitir tipo='suplementacao' na tabela prescricoes --------
-- (reutilizamos o bucket prescricoes pra subir o PDF da prescrição
-- de suplementos)
alter table public.prescricoes drop constraint if exists prescricoes_tipo_check;
alter table public.prescricoes
  add constraint prescricoes_tipo_check
  check (tipo in ('exame', 'laudo', 'receita', 'suplementacao'));
