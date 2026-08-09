-- ════════════════════════════════════════════════════════════════════
-- LAPIDARE · UPDATE v1.25.0 · ENVIO DO QFA PELA ABA ATENDIMENTO
-- ════════════════════════════════════════════════════════════════════
-- O que faz:
--   - Permite um novo tipo de check-in ('atendimento'), usado quando a
--     nutri envia o QFA (frequência alimentar) por link direto da aba
--     Atendimento, sem misturar com os check-ins semanais.
--
-- Como rodar (30 seg):
--   1. Supabase → SQL Editor → + New query
--   2. Cola TUDO → Run
--   3. Esperado: "Success. No rows returned"
--
-- 100% seguro: idempotente.
-- ════════════════════════════════════════════════════════════════════

alter table public.checkin_templates drop constraint if exists checkin_templates_tipo_check;
alter table public.checkin_templates
  add constraint checkin_templates_tipo_check check (tipo in ('recorrente', 'pre_consulta', 'atendimento'));

alter table public.checkin_envios drop constraint if exists checkin_envios_tipo_check;
alter table public.checkin_envios
  add constraint checkin_envios_tipo_check check (tipo in ('recorrente', 'pre_consulta', 'atendimento'));
