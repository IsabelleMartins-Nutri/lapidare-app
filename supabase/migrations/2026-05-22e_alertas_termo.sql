-- =============================================================
-- Migration 2026-05-22e
-- Adiciona campos pra alertas relacionais (nascimento)
-- e termo de consentimento (LGPD).
-- =============================================================
-- Idempotente. Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================


-- 1. NOVOS CAMPOS EM pacientes ---------------------------------
alter table public.pacientes add column if not exists nascimento       date;
alter table public.pacientes add column if not exists termo_aceito_em  timestamptz;
alter table public.pacientes add column if not exists termo_versao     text;


-- 2. TRIGGER handle_new_user — propaga nascimento do pendente --
-- (atualiza pra também migrar o nascimento da paciente_pendente)
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
          new.id,
          v_nutri_id,
          coalesce(new.raw_user_meta_data ->> 'nome',       v_pendente.nome,       new.email),
          new.email,
          coalesce(new.raw_user_meta_data ->> 'objetivo',   v_pendente.objetivo),
          coalesce(new.raw_user_meta_data ->> 'tipo_plano', v_pendente.tipo_plano),
          coalesce(new.raw_user_meta_data ->> 'modalidade', v_pendente.modalidade),
          coalesce((new.raw_user_meta_data ->> 'nascimento')::date, v_pendente.nascimento)
        )
        on conflict (id) do nothing;

        update public.pacientes_pendentes
          set status = 'ativado'
          where id = v_pendente.id;
      else
        insert into public.pacientes (
          id, nutri_id, nome, email, objetivo, tipo_plano, modalidade, nascimento
        )
        values (
          new.id,
          v_nutri_id,
          coalesce(new.raw_user_meta_data ->> 'nome', new.email),
          new.email,
          new.raw_user_meta_data ->> 'objetivo',
          new.raw_user_meta_data ->> 'tipo_plano',
          new.raw_user_meta_data ->> 'modalidade',
          (new.raw_user_meta_data ->> 'nascimento')::date
        )
        on conflict (id) do nothing;
      end if;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 3. POLICY: paciente pode atualizar próprios dados (termo) ----
-- Já existe a policy de SELECT/UPDATE da própria linha. Garantimos:
drop policy if exists pacientes_update_self on public.pacientes;
create policy pacientes_update_self on public.pacientes
  for update using (id = auth.uid()) with check (id = auth.uid());
