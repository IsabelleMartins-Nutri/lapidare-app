-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.15.0 · CORREÇÕES DE AUDITORIA
-- ════════════════════════════════════════════════════════════════════
-- Adiciona funções auxiliares e ajustes de schema pra os fixes de auditoria:
--
-- 1. buscar_nome_nutri(uuid) — RPC pública pra tela de signup sem token
--    (paciente entra pelo link genérico sem estar autenticada; a policy
--    de select em `nutris` bloqueia essa leitura).
--
-- 2. Nenhuma outra mudança de schema — os demais fixes são só código.
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente.
-- ════════════════════════════════════════════════════════════════════

drop function if exists public.buscar_nome_nutri(uuid);
create or replace function public.buscar_nome_nutri(p_nutri_id uuid)
returns table(nome text, marca_nome text)
language sql security definer set search_path = public
as $$
  select n.nome, coalesce(n.marca_nome, 'Lapidare') as marca_nome
  from public.nutris n
  where n.id = p_nutri_id
  limit 1;
$$;
grant execute on function public.buscar_nome_nutri(uuid) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- ✅ Pronto! O signup público (link sem token) volta a funcionar.
-- ════════════════════════════════════════════════════════════════════
