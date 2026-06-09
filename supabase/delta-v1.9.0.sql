-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.9.0 · SUBSTITUIÇÕES
-- ════════════════════════════════════════════════════════════════════
-- O que faz: cria a tabela "substituicoes" (separada do plano alimentar)
-- e configura as permissões.
--
-- Como rodar (1 minuto):
--   1. Abre o Supabase do seu app
--   2. Menu lateral esquerdo → SQL Editor → + New query
--   3. Cola TUDO desse arquivo
--   4. Clica em Run (canto inferior direito) ou aperta Cmd+Enter
--   5. Esperado: "Success. No rows returned"
--
-- 100% seguro: pode rodar de novo (idempotente — usa "if not exists").
-- Não toca em pacientes, planos, nem nada que já existe.
-- ════════════════════════════════════════════════════════════════════

-- 1. Tabela nova: armazena as substituições por paciente
create table if not exists public.substituicoes (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  dados         jsonb not null,
  publicado_em  timestamptz not null default now()
);

-- 2. Índices pra performance
create index if not exists substituicoes_paciente_id_idx
  on public.substituicoes(paciente_id, publicado_em desc);
create index if not exists substituicoes_nutri_id_idx
  on public.substituicoes(nutri_id);

-- 3. Liga Row Level Security (segurança por linha)
alter table public.substituicoes enable row level security;

-- 4. Política: a paciente vê só as substituições dela; a nutri vê das pacientes dela
drop policy if exists substituicoes_select on public.substituicoes;
create policy substituicoes_select on public.substituicoes
  for select using (
    paciente_id = auth.uid() or nutri_id = auth.uid()
  );

-- 5. Política: só a nutri pode criar/editar/excluir
drop policy if exists substituicoes_write_nutri on public.substituicoes;
create policy substituicoes_write_nutri on public.substituicoes
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════
-- ✅ Pronto! Volta no seu app e vê a nova aba "Substituições"
-- no perfil de qualquer paciente (entre "Plano" e "Compras").
-- ════════════════════════════════════════════════════════════════════
