-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.26.0 · LINKS FIXOS DE PRÉ-CONSULTA (GERAL + QFA)
-- ════════════════════════════════════════════════════════════════════
-- O que faz:
--   - Substitui o link de pré-consulta por paciente por 2 links FIXOS
--     e reutilizáveis (questionário geral + QFA), que você usa sempre
--     com qualquer pessoa — igual ao link que você já usava no WebDiet.
--   - A pessoa preenche o próprio nome/email no formulário. As
--     respostas caem numa "Caixa de entrada" na tela Cadastrar
--     paciente, antes de qualquer cadastro existir.
--   - Nova tabela pre_consulta_respostas + função pública
--     salvar_intake_submissao (SECURITY DEFINER, mesmo padrão de
--     segurança das outras funções públicas do app).
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente. Não apaga nada do fluxo anterior (só para
-- de ser usado pelo app).
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.pre_consulta_respostas (
  id            uuid primary key default gen_random_uuid(),
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  tipo          text not null check (tipo in ('geral', 'qfa')),
  nome          text,
  email         text,
  perguntas     jsonb not null,
  respostas     jsonb not null,
  cadastrada    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists pre_consulta_respostas_nutri_idx on public.pre_consulta_respostas(nutri_id, cadastrada, created_at desc);

alter table public.pre_consulta_respostas enable row level security;

drop policy if exists pre_consulta_respostas_all_nutri on public.pre_consulta_respostas;
create policy pre_consulta_respostas_all_nutri on public.pre_consulta_respostas
  for all
  using (nutri_id = auth.uid())
  with check (nutri_id = auth.uid());

drop function if exists public.salvar_intake_submissao(uuid, text, text, text, jsonb, jsonb);
create or replace function public.salvar_intake_submissao(
  p_nutri_id uuid, p_tipo text, p_nome text, p_email text,
  p_perguntas jsonb, p_respostas jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.pre_consulta_respostas (nutri_id, tipo, nome, email, perguntas, respostas)
  values (p_nutri_id, p_tipo, p_nome, p_email, p_perguntas, p_respostas);
end;
$$;
grant execute on function public.salvar_intake_submissao(uuid, text, text, text, jsonb, jsonb) to anon, authenticated;
