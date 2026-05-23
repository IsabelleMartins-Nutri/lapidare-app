-- =============================================================
-- Migration 2026-05-22f
-- Questionário pré-consulta: tipo nos templates + envio automático
-- =============================================================
-- Idempotente. Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================

-- 1. Coluna tipo em checkin_templates --------------------------
alter table public.checkin_templates
  add column if not exists tipo text not null default 'recorrente';

-- Remove constraint antiga e recria com os 2 valores aceitos
alter table public.checkin_templates drop constraint if exists checkin_templates_tipo_check;
alter table public.checkin_templates
  add constraint checkin_templates_tipo_check
  check (tipo in ('recorrente', 'pre_consulta'));


-- 2. Atualiza handle_new_user pra enviar pré-consulta auto -----
-- Quando uma paciente nova se cadastra, todos os templates da
-- nutri marcados como tipo='pre_consulta' são enviados como
-- checkin_envios automaticamente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', '');
begin
  if v_role = 'nutri' then
    insert into public.nutris (id, nome, crn, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'nome', new.email),
      new.raw_user_meta_data ->> 'crn',
      new.email
    )
    on conflict (id) do nothing;

  elsif v_role = 'paciente' then
    declare
      v_nutri_id    uuid := (new.raw_user_meta_data ->> 'nutri_id')::uuid;
      v_pendente    public.pacientes_pendentes%rowtype;
      v_template    record;
    begin
      select * into v_pendente
      from public.pacientes_pendentes
      where nutri_id = v_nutri_id and lower(email) = lower(new.email)
      limit 1;

      if found then
        insert into public.pacientes (
          id, nutri_id, nome, email, objetivo, tipo_plano, modalidade, nascimento
        )
        values (
          new.id, v_nutri_id,
          coalesce(new.raw_user_meta_data ->> 'nome',       v_pendente.nome,       new.email),
          new.email,
          coalesce(new.raw_user_meta_data ->> 'objetivo',   v_pendente.objetivo),
          coalesce(new.raw_user_meta_data ->> 'tipo_plano', v_pendente.tipo_plano),
          coalesce(new.raw_user_meta_data ->> 'modalidade', v_pendente.modalidade),
          coalesce((new.raw_user_meta_data ->> 'nascimento')::date, v_pendente.nascimento)
        )
        on conflict (id) do nothing;

        update public.pacientes_pendentes set status = 'ativado' where id = v_pendente.id;
      else
        insert into public.pacientes (
          id, nutri_id, nome, email, objetivo, tipo_plano, modalidade, nascimento
        )
        values (
          new.id, v_nutri_id,
          coalesce(new.raw_user_meta_data ->> 'nome', new.email),
          new.email,
          new.raw_user_meta_data ->> 'objetivo',
          new.raw_user_meta_data ->> 'tipo_plano',
          new.raw_user_meta_data ->> 'modalidade',
          (new.raw_user_meta_data ->> 'nascimento')::date
        )
        on conflict (id) do nothing;
      end if;

      -- Envia automaticamente TODOS os templates de pré-consulta da nutri
      for v_template in
        select id, perguntas
        from public.checkin_templates
        where nutri_id = v_nutri_id and tipo = 'pre_consulta'
      loop
        insert into public.checkin_envios (
          nutri_id, paciente_id, perguntas, enviado_em
        )
        values (
          v_nutri_id, new.id, v_template.perguntas, now()
        );
      end loop;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
