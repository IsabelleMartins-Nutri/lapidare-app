-- =============================================================
-- Migration 2026-05-23c
-- Anamnese clínica (nutri preenche + baixa PDF)
-- =============================================================

-- 1. Modelos de anamnese (templates reutilizáveis pela nutri)
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

-- 2. Anamneses preenchidas (uma por paciente, snapshot do template)
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

-- 3. RLS — só a nutri vê/edita (anamnese é registro interno)
alter table public.anamnese_templates enable row level security;
alter table public.anamneses           enable row level security;

drop policy if exists anamnese_templates_all_nutri on public.anamnese_templates;
create policy anamnese_templates_all_nutri on public.anamnese_templates for all
  using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

drop policy if exists anamneses_all_nutri on public.anamneses;
create policy anamneses_all_nutri on public.anamneses for all
  using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- 4. GRANTs
grant select, insert, update, delete on public.anamnese_templates to anon, authenticated, service_role;
grant select, insert, update, delete on public.anamneses          to anon, authenticated, service_role;
