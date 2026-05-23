-- =============================================================
-- Migration 2026-05-22g
-- Cadastro manual pela nutri: token único em pacientes_pendentes
-- + função pública pra buscar dados do pendente pelo token
-- =============================================================
-- Idempotente. Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================

-- 1. Token único por pendente
alter table public.pacientes_pendentes
  add column if not exists token uuid not null default gen_random_uuid();

create unique index if not exists pacientes_pendentes_token_idx
  on public.pacientes_pendentes(token);


-- 2. Função SECURITY DEFINER pra anon buscar dados do pendente
-- via token (lookup público sem expor a tabela inteira)
create or replace function public.buscar_pendente_por_token(p_token uuid)
returns table(
  nome        text,
  email       text,
  nascimento  date,
  objetivo    text,
  tipo_plano  text,
  modalidade  text,
  nutri_id    uuid,
  nutri_nome  text,
  status      text
)
language sql security definer set search_path = public
as $$
  select
    pp.nome, pp.email, pp.nascimento, pp.objetivo,
    pp.tipo_plano, pp.modalidade, pp.nutri_id,
    n.nome as nutri_nome,
    pp.status
  from public.pacientes_pendentes pp
  join public.nutris n on n.id = pp.nutri_id
  where pp.token = p_token
  limit 1;
$$;

grant execute on function public.buscar_pendente_por_token(uuid) to anon, authenticated;
