-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.23.0 · DOBRAS CUTÂNEAS NA AVALIAÇÃO
-- ════════════════════════════════════════════════════════════════════
-- O que faz:
--   - Adiciona colunas em peso_registros pra registrar as 10 dobras
--     cutâneas (mm) e qual fórmula foi usada (Pollock 3, Pollock 7,
--     Petroski, Guedes, Durnin, Faulkner, Nenhuma) — só armazenamento,
--     sem cálculo automático de %gordura.
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
  add column if not exists dobra_formula        text,
  add column if not exists dobra_tricipital     numeric(5,2),
  add column if not exists dobra_bicipital      numeric(5,2),
  add column if not exists dobra_abdominal      numeric(5,2),
  add column if not exists dobra_subescapular   numeric(5,2),
  add column if not exists dobra_axilar_media   numeric(5,2),
  add column if not exists dobra_coxa           numeric(5,2),
  add column if not exists dobra_toracica       numeric(5,2),
  add column if not exists dobra_suprailiaca    numeric(5,2),
  add column if not exists dobra_panturrilha    numeric(5,2),
  add column if not exists dobra_supraespinhal  numeric(5,2);
