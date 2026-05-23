-- =============================================================
-- Migration 2026-05-22h
-- Adiciona nome + tipo em checkin_envios pra diferenciar
-- pré-consulta de check-in recorrente
-- =============================================================
-- Idempotente. Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================

-- 1. Novas colunas em checkin_envios
alter table public.checkin_envios add column if not exists nome text;
alter table public.checkin_envios add column if not exists tipo text not null default 'recorrente';

alter table public.checkin_envios drop constraint if exists checkin_envios_tipo_check;
alter table public.checkin_envios
  add constraint checkin_envios_tipo_check
  check (tipo in ('recorrente', 'pre_consulta'));


-- 2. Trigger handle_new_user — preenche nome + tipo dos envios automáticos
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

      -- Envia automaticamente os templates de pré-consulta da nutri
      for v_template in
        select id, nome, perguntas
        from public.checkin_templates
        where nutri_id = v_nutri_id and tipo = 'pre_consulta'
      loop
        insert into public.checkin_envios (
          nutri_id, paciente_id, nome, tipo, perguntas, enviado_em
        )
        values (
          v_nutri_id, new.id,
          coalesce(v_template.nome, 'Check-in pré-consulta'),
          'pre_consulta',
          v_template.perguntas,
          now()
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


-- 3. Atualiza cron de check-ins recorrentes pra incluir nome + tipo
create or replace function public.processar_agendamentos_checkin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ag      record;
  v_tpl     record;
  v_proximo date;
begin
  for v_ag in
    select * from public.checkin_agendamentos
    where ativo = true and proximo_envio <= current_date
  loop
    select id, nome, perguntas into v_tpl
    from public.checkin_templates
    where id = v_ag.template_id;

    insert into public.checkin_envios (
      nutri_id, paciente_id, nome, tipo, perguntas, enviado_em
    )
    values (
      v_ag.nutri_id, v_ag.paciente_id,
      coalesce(v_tpl.nome, 'Check-in'),
      'recorrente',
      v_tpl.perguntas,
      now()
    );

    v_proximo := case v_ag.frequencia
      when 'semanal'    then v_ag.proximo_envio + interval '7 days'
      when 'quinzenal'  then v_ag.proximo_envio + interval '14 days'
      when 'mensal'     then v_ag.proximo_envio + interval '1 month'
      else v_ag.proximo_envio + interval '7 days'
    end;

    update public.checkin_agendamentos
      set proximo_envio = v_proximo, ultimo_envio = now()
      where id = v_ag.id;
  end loop;
end;
$$;
