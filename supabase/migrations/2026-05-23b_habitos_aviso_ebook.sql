-- =============================================================
-- Migration 2026-05-23b
-- Aviso de novo e-book + habit tracker personalizado
-- =============================================================

-- 1. Coluna visto_em em ebooks_pacientes (pra detectar novos)
alter table public.ebooks_pacientes
  add column if not exists visto_em timestamptz;


-- 2. Tabelas de hábitos -----------------------------------------

-- Hábitos configurados pela nutri pra cada paciente
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

-- Logs diários da paciente
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


-- 3. RLS --------------------------------------------------------
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


-- 4. GRANTs -----------------------------------------------------
grant select, insert, update, delete on public.habitos       to anon, authenticated, service_role;
grant select, insert, update, delete on public.habitos_logs  to anon, authenticated, service_role;
