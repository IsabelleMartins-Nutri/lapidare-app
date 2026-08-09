-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.19.0 · CONDIÇÕES/FLAGS CLÍNICAS NO PERFIL DA PACIENTE
-- ════════════════════════════════════════════════════════════════════
-- O que faz:
--   - Adiciona coluna "condicoes" (lista de textos) na tabela pacientes,
--     pra nutri fixar etiquetas curtas no cabeçalho do perfil
--     (ex: "Endometriose", "GLP-1", "Hipotireoidismo") — visível só
--     pra ela, não aparece em nenhuma tela da paciente.
--   - Nenhuma alteração de RLS necessária: a policy de update já
--     existente (nutri_id = auth.uid()) já cobre a coluna nova.
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente.
-- ════════════════════════════════════════════════════════════════════

alter table public.pacientes add column if not exists condicoes text[] not null default '{}';
