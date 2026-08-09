-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.22.0 · CAMPOS DE BIOIMPEDÂNCIA NA AVALIAÇÃO
-- ════════════════════════════════════════════════════════════════════
-- O que faz:
--   - Adiciona 3 colunas em peso_registros: água corporal (%), gordura
--     visceral (nível) e TMB — taxa metabólica basal (kcal).
--   - Nenhuma alteração de RLS necessária.
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente.
-- ════════════════════════════════════════════════════════════════════

alter table public.peso_registros
  add column if not exists agua_corporal    numeric(5,2),
  add column if not exists gordura_visceral numeric(5,2),
  add column if not exists tmb              numeric(6,0);
