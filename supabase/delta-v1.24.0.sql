-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.24.0 · QUESTIONÁRIO DE PRÉ-CADASTRO
-- ════════════════════════════════════════════════════════════════════
-- O que faz:
--   - Adiciona um questionário de pré-cadastro configurável pela nutri
--     (nutris.intake_perguntas) e um link público (sem login) pra
--     futuras pacientes preencherem ANTES de existir qualquer conta
--     no sistema — as respostas ficam salvas no cadastro pendente
--     (pacientes_pendentes.intake_respostas).
--   - 2 funções públicas (SECURITY DEFINER, mesmo padrão de
--     buscar_pendente_por_token): buscar_template_intake (lê as
--     perguntas) e salvar_intake_pendente (grava as respostas).
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente.
-- ════════════════════════════════════════════════════════════════════

alter table public.nutris add column if not exists intake_perguntas jsonb;

alter table public.pacientes_pendentes
  add column if not exists intake_respostas jsonb,
  add column if not exists intake_respondido_em timestamptz;

drop function if exists public.buscar_template_intake(uuid);
create or replace function public.buscar_template_intake(p_nutri_id uuid)
returns jsonb
language sql security definer set search_path = public
as $$
  select intake_perguntas from public.nutris where id = p_nutri_id limit 1;
$$;
grant execute on function public.buscar_template_intake(uuid) to anon, authenticated;

drop function if exists public.salvar_intake_pendente(uuid, jsonb);
create or replace function public.salvar_intake_pendente(p_token uuid, p_respostas jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.pacientes_pendentes
    set intake_respostas = p_respostas,
        intake_respondido_em = now()
    where token = p_token;
end;
$$;
grant execute on function public.salvar_intake_pendente(uuid, jsonb) to anon, authenticated;
