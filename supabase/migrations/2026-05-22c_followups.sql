-- =============================================================
-- Migration 2026-05-22c
-- Follow-ups por paciente + biblioteca de modelos
-- =============================================================
-- Idempotente. Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================


-- =============================================================
-- 1. TABELAS
-- =============================================================

-- 1.1 followup_templates — modelos da nutri (reutilizáveis) -----
create table if not exists public.followup_templates (
  id            uuid primary key default gen_random_uuid(),
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  nome          text not null,
  descricao     text,
  conteudo      text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists followup_templates_nutri_idx
  on public.followup_templates(nutri_id, created_at desc);

-- 1.2 followups — anotações por paciente ------------------------
create table if not exists public.followups (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  titulo        text not null,
  conteudo      text not null,
  data          date not null default current_date,
  template_id   uuid references public.followup_templates(id) on delete set null,
  consulta_id   uuid references public.consultas(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists followups_paciente_idx
  on public.followups(paciente_id, data desc, created_at desc);
create index if not exists followups_nutri_idx
  on public.followups(nutri_id);


-- =============================================================
-- 2. RLS
-- =============================================================
alter table public.followup_templates  enable row level security;
alter table public.followups           enable row level security;

-- Templates: nutri gerencia os próprios; pacientes NÃO veem
drop policy if exists followup_templates_all_nutri on public.followup_templates;
create policy followup_templates_all_nutri on public.followup_templates
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- Follow-ups: nutri gerencia os próprios; pacientes NÃO veem
-- (são anotações internas da nutri, não pra paciente)
drop policy if exists followups_all_nutri on public.followups;
create policy followups_all_nutri on public.followups
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());


-- =============================================================
-- 3. GRANTS
-- =============================================================
grant select, insert, update, delete on public.followup_templates  to anon, authenticated, service_role;
grant select, insert, update, delete on public.followups           to anon, authenticated, service_role;
