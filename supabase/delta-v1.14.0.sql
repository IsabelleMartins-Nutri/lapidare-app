-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.14.0 · OBJETIVOS CUSTOMIZÁVEIS POR NUTRI
-- ════════════════════════════════════════════════════════════════════
-- O que faz: adiciona coluna "objetivos" em nutris (lista customizável).
-- Cada nutri pode editar suas próprias opções de objetivo no cadastro de
-- paciente (ex: nutri de saúde da mulher pode trocar pra "Menopausa, SOP,
-- Endometriose, Fertilidade…").
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO desse arquivo → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente. Default = lista atual do app.
-- ════════════════════════════════════════════════════════════════════

alter table public.nutris
  add column if not exists objetivos jsonb
  default '["Emagrecimento", "Hipertrofia", "Reeducação alimentar", "Saúde geral", "Performance esportiva"]'::jsonb;

-- ════════════════════════════════════════════════════════════════════
-- ✅ Pronto! Volta no app → Personalização → seção "Opções de cadastro"
-- pra editar a lista que aparece no campo "Objetivo" do paciente.
-- ════════════════════════════════════════════════════════════════════
