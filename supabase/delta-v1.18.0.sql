-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.18.0 · MODELOS FAVORITOS DE PEDIDO DE EXAME
-- ════════════════════════════════════════════════════════════════════
-- Permite salvar um pedido de exame como "modelo" reutilizável em
-- qualquer paciente (ex: "Check-up padrão"), pra não remontar a
-- seleção de exames toda vez.
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.pedidos_exame_modelos (
  id            uuid primary key default gen_random_uuid(),
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  nome          text not null,
  exames        jsonb not null default '[]',
  obs           text,
  created_at    timestamptz not null default now()
);
create index if not exists pedidos_exame_modelos_nutri_id_idx on public.pedidos_exame_modelos(nutri_id);

alter table public.pedidos_exame_modelos enable row level security;

drop policy if exists pedidos_exame_modelos_all_nutri on public.pedidos_exame_modelos;
create policy pedidos_exame_modelos_all_nutri on public.pedidos_exame_modelos
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());
