-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.27.0 · PLANO ATIVO/INATIVO (HISTÓRICO)
-- ════════════════════════════════════════════════════════════════════
-- O que faz:
--   - Adiciona a coluna planos.ativo — em vez de "sempre o plano mais
--     recente" (implícito), agora existe um plano ativo explícito por
--     paciente, que dá pra trocar sem apagar o histórico.
--   - Backfill automático: ativa o plano mais recente de cada paciente
--     (replica exatamente o que já acontecia hoje — nada muda pra
--     quem já está usando o app).
--   - Cria um índice único que garante só 1 plano ativo por paciente
--     por vez.
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente.
-- ════════════════════════════════════════════════════════════════════

alter table public.planos add column if not exists ativo boolean not null default false;

update public.planos p set ativo = true
  where p.publicado_em = (
    select max(p2.publicado_em) from public.planos p2 where p2.paciente_id = p.paciente_id
  )
  and not exists (select 1 from public.planos p3 where p3.paciente_id = p.paciente_id and p3.ativo);

create unique index if not exists planos_ativo_unico_idx on public.planos(paciente_id) where ativo;
