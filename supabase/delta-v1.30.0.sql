-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.30.0 · EVOLUÇÃO DE HÁBITOS/SINTOMAS RELATADOS
-- ════════════════════════════════════════════════════════════════════
-- O que faz:
--   - Cria a tabela evolucao_habitos: um jeito simples de você anotar,
--     a cada consulta, o que a paciente foi relatando sobre um hábito
--     ou sintoma (ex: "Intestino: não funcionava" → "Intestino: 3x por
--     semana"). Aparece na aba Evolução e no Modo Apresentação.
--   - É só sua, privada — a paciente não vê essas anotações no app dela.
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente.
-- ════════════════════════════════════════════════════════════════════

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

alter table public.evolucao_habitos enable row level security;

drop policy if exists evolucao_habitos_all_nutri on public.evolucao_habitos;
create policy evolucao_habitos_all_nutri on public.evolucao_habitos for all
  using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());
