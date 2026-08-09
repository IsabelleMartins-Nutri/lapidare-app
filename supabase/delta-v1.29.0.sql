-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.29.0 · BENEFÍCIOS (CUPONS DE PARCEIROS)
-- ════════════════════════════════════════════════════════════════════
-- O que faz:
--   - Cria a tabela beneficios: parcerias/cupons que você cadastra UMA
--     vez (marca, imagem, link do site, código do cupom) e que TODAS
--     as suas pacientes passam a ver no app delas — diferente do plano
--     alimentar, que é individual por paciente.
--   - RLS: só você edita os seus benefícios; qualquer paciente sua
--     pode ler (a tabela verifica se a paciente logada pertence a
--     você antes de mostrar).
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente.
-- ════════════════════════════════════════════════════════════════════

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

alter table public.beneficios enable row level security;

drop policy if exists beneficios_select on public.beneficios;
create policy beneficios_select on public.beneficios
  for select using (
    nutri_id = auth.uid()
    or exists (select 1 from public.pacientes p where p.id = auth.uid() and p.nutri_id = beneficios.nutri_id)
  );

drop policy if exists beneficios_write_nutri on public.beneficios;
create policy beneficios_write_nutri on public.beneficios
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());
