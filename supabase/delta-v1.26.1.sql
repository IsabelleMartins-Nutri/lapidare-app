-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.26.1 · CORREÇÃO: FUNÇÃO buscar_nome_nutri FALTANDO
-- ════════════════════════════════════════════════════════════════════
-- O que faz:
--   - Cria a função buscar_nome_nutri, que faltava no seu banco (só
--     existia num delta antigo que nunca foi rodado). É ela que os
--     links de pré-consulta usam pra confirmar que o link é válido.
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
