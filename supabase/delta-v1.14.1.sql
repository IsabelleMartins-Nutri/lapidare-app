-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.14.1 · TIPOS DE PLANO + MODALIDADES CUSTOMIZÁVEIS
-- ════════════════════════════════════════════════════════════════════
-- Estende a customização da v1.14.0: agora a nutri também edita as listas
-- de "Tipo de plano" e "Modalidade" no cadastro de paciente.
--
-- Útil pra quem só atende online, ou tem nomes próprios pros planos
-- (ex: "Programa Mulheres em Equilíbrio · Trimestral").
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente.
-- ════════════════════════════════════════════════════════════════════

alter table public.nutris
  add column if not exists tipos_plano jsonb
  default '["Trimestral", "Semestral", "Consultoria", "Acompanhamento"]'::jsonb;

alter table public.nutris
  add column if not exists modalidades jsonb
  default '["Presencial", "Online", "Híbrido"]'::jsonb;

-- ════════════════════════════════════════════════════════════════════
-- ✅ Pronto! Personalização → seção "Opções de cadastro de paciente"
-- agora mostra 3 editores: Objetivo, Tipo de plano, Modalidade.
-- ════════════════════════════════════════════════════════════════════
