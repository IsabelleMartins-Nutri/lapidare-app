-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.14.4 · AVALIAÇÃO COM SÓ PDF (sem peso obrigatório)
-- ════════════════════════════════════════════════════════════════════
-- Permite a nutri registrar avaliação anexando SÓ o PDF (ex: avaliação
-- corporal do Shaped) sem precisar preencher peso/medidas manualmente.
--
-- Antes: peso (kg) era NOT NULL — botão "Registrar avaliação" travava
-- silenciosamente se a nutri só tinha o PDF.
--
-- Como rodar (10 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: avaliações antigas continuam tendo peso.
-- ════════════════════════════════════════════════════════════════════

alter table public.peso_registros alter column kg drop not null;

-- ════════════════════════════════════════════════════════════════════
-- ✅ Pronto! Agora dá pra registrar avaliação com SÓ o PDF anexo.
-- ════════════════════════════════════════════════════════════════════
