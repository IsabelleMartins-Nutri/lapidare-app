-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.20.0 · CATEGORIAS COLORIDAS NAS CONDIÇÕES
-- ════════════════════════════════════════════════════════════════════
-- O que faz:
--   - Muda a coluna "condicoes" de pacientes (lista de textos) pra
--     uma lista de objetos {texto, categoria} — permite colorir cada
--     etiqueta por tipo (Diagnóstico, Medicação, Alergia/Restrição,
--     Atenção) no cabeçalho do perfil.
--   - Preserva os dados que você já tinha cadastrado — cada etiqueta
--     existente vira categoria "Diagnóstico" automaticamente.
--   - Nenhuma alteração de RLS necessária.
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente, não apaga nenhuma etiqueta já cadastrada.
-- ════════════════════════════════════════════════════════════════════

-- Função auxiliar temporária — o Postgres não permite subquery direto
-- dentro do USING de um ALTER COLUMN TYPE, então convertemos via função.
create or replace function public._condicoes_text_to_jsonb(arr text[])
returns jsonb language sql immutable as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('texto', c, 'categoria', 'diagnostico')),
    '[]'::jsonb
  )
  from unnest(arr) as c;
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pacientes' and column_name = 'condicoes'
  ) then
    alter table public.pacientes add column condicoes jsonb not null default '[]'::jsonb;
  elsif (
    select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'pacientes' and column_name = 'condicoes'
  ) = 'ARRAY' then
    alter table public.pacientes alter column condicoes drop default;
    alter table public.pacientes
      alter column condicoes type jsonb
      using public._condicoes_text_to_jsonb(condicoes);
    alter table public.pacientes alter column condicoes set default '[]'::jsonb;
  end if;
end$$;

drop function public._condicoes_text_to_jsonb(text[]);
