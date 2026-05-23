-- =============================================================
-- Migration 2026-05-22
-- Adiciona: fotos_evolucao + pacientes_pendentes + links_extras
--           em consultas + cron de check-ins automáticos
-- =============================================================
-- Idempotente: pode rodar várias vezes sem quebrar nada.
-- Cole tudo no SQL Editor do Supabase e clique em Run.
-- =============================================================


-- =============================================================
-- 1. TABELAS NOVAS
-- =============================================================

-- 1.1 fotos_evolucao -------------------------------------------
-- Fotos antes/depois da paciente. Nutri OU paciente sobem.
create table if not exists public.fotos_evolucao (
  id            uuid primary key default gen_random_uuid(),
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  nutri_id      uuid references public.nutris(id) on delete set null,  -- null = upload pela paciente
  storage_path  text not null,
  tipo          text not null default 'frente' check (tipo in ('frente', 'perfil_direito', 'perfil_esquerdo', 'costas', 'livre')),
  data_foto     date not null default current_date,
  obs           text,
  created_at    timestamptz not null default now()
);
create index if not exists fotos_evolucao_paciente_idx
  on public.fotos_evolucao(paciente_id, data_foto desc);

-- 1.2 pacientes_pendentes (importação CSV) ---------------------
create table if not exists public.pacientes_pendentes (
  id            uuid primary key default gen_random_uuid(),
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  nome          text not null,
  email         text not null,
  whatsapp      text,
  cpf           text,
  nascimento    date,
  objetivo      text,
  tipo_plano    text,
  modalidade    text,
  obs           text,
  status        text not null default 'pendente' check (status in ('pendente', 'enviado', 'ativado')),
  created_at    timestamptz not null default now(),
  unique (nutri_id, email)
);
create index if not exists pacientes_pendentes_nutri_idx
  on public.pacientes_pendentes(nutri_id, status);
create index if not exists pacientes_pendentes_email_idx
  on public.pacientes_pendentes(email);


-- =============================================================
-- 2. COLUNA NOVA EM consultas (links_extras)
-- =============================================================
alter table public.consultas add column if not exists links_extras jsonb;


-- =============================================================
-- 3. RLS
-- =============================================================
alter table public.fotos_evolucao        enable row level security;
alter table public.pacientes_pendentes   enable row level security;

-- 3.1 fotos_evolucao (paciente vê próprias; nutri vê das pacientes)
drop policy if exists fotos_evolucao_select on public.fotos_evolucao;
create policy fotos_evolucao_select on public.fotos_evolucao
  for select using (
    paciente_id = auth.uid()
    or exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid())
  );

drop policy if exists fotos_evolucao_insert_nutri on public.fotos_evolucao;
create policy fotos_evolucao_insert_nutri on public.fotos_evolucao
  for insert with check (
    exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid())
  );

drop policy if exists fotos_evolucao_insert_paciente on public.fotos_evolucao;
create policy fotos_evolucao_insert_paciente on public.fotos_evolucao
  for insert with check (paciente_id = auth.uid());

drop policy if exists fotos_evolucao_delete on public.fotos_evolucao;
create policy fotos_evolucao_delete on public.fotos_evolucao
  for delete using (
    paciente_id = auth.uid()
    or exists (select 1 from public.pacientes p where p.id = paciente_id and p.nutri_id = auth.uid())
  );

-- 3.2 pacientes_pendentes (só a nutri dona) --------------------
drop policy if exists pacientes_pendentes_all_nutri on public.pacientes_pendentes;
create policy pacientes_pendentes_all_nutri on public.pacientes_pendentes
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());


-- =============================================================
-- 4. TRIGGER handle_new_user (atualizado pra migrar pendente)
-- =============================================================
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
          id, nutri_id, nome, email, objetivo, tipo_plano, modalidade
        )
        values (
          new.id,
          v_nutri_id,
          coalesce(new.raw_user_meta_data ->> 'nome',       v_pendente.nome,       new.email),
          new.email,
          coalesce(new.raw_user_meta_data ->> 'objetivo',   v_pendente.objetivo),
          coalesce(new.raw_user_meta_data ->> 'tipo_plano', v_pendente.tipo_plano),
          coalesce(new.raw_user_meta_data ->> 'modalidade', v_pendente.modalidade)
        )
        on conflict (id) do nothing;

        update public.pacientes_pendentes
          set status = 'ativado'
          where id = v_pendente.id;
      else
        insert into public.pacientes (
          id, nutri_id, nome, email, objetivo, tipo_plano, modalidade
        )
        values (
          new.id,
          v_nutri_id,
          coalesce(new.raw_user_meta_data ->> 'nome', new.email),
          new.email,
          new.raw_user_meta_data ->> 'objetivo',
          new.raw_user_meta_data ->> 'tipo_plano',
          new.raw_user_meta_data ->> 'modalidade'
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


-- =============================================================
-- 5. BUCKET fotos_evolucao + POLICIES
-- =============================================================
insert into storage.buckets (id, name, public)
values ('fotos_evolucao', 'fotos_evolucao', false)
on conflict (id) do nothing;

drop policy if exists fotos_evolucao_storage_select on storage.objects;
create policy fotos_evolucao_storage_select on storage.objects
  for select using (
    bucket_id = 'fotos_evolucao'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or split_part(name, '/', 1) in (
        select id::text from public.pacientes where nutri_id = auth.uid()
      )
    )
  );

drop policy if exists fotos_evolucao_storage_insert_paciente on storage.objects;
create policy fotos_evolucao_storage_insert_paciente on storage.objects
  for insert with check (
    bucket_id = 'fotos_evolucao'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists fotos_evolucao_storage_insert_nutri on storage.objects;
create policy fotos_evolucao_storage_insert_nutri on storage.objects
  for insert with check (
    bucket_id = 'fotos_evolucao'
    and split_part(name, '/', 1) in (
      select id::text from public.pacientes where nutri_id = auth.uid()
    )
  );

drop policy if exists fotos_evolucao_storage_delete on storage.objects;
create policy fotos_evolucao_storage_delete on storage.objects
  for delete using (
    bucket_id = 'fotos_evolucao'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or split_part(name, '/', 1) in (
        select id::text from public.pacientes where nutri_id = auth.uid()
      )
    )
  );


-- =============================================================
-- 6. CRON pra check-ins automáticos (item #3a)
-- =============================================================
-- Roda todo dia às 08:00 UTC (05:00 BRT) e dispara os check-ins
-- agendados cuja data_proximo_envio chegou ou já passou.
-- =============================================================
create extension if not exists pg_cron;

create or replace function public.processar_agendamentos_checkin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ag record;
  v_proximo date;
begin
  for v_ag in
    select * from public.checkin_agendamentos
    where ativo = true and proximo_envio <= current_date
  loop
    -- cria o envio
    insert into public.checkin_envios (
      nutri_id, paciente_id, template_id, status, enviado_em
    )
    values (
      v_ag.nutri_id, v_ag.paciente_id, v_ag.template_id, 'enviado', now()
    );

    -- calcula próximo envio conforme frequência
    v_proximo := case v_ag.frequencia
      when 'semanal'    then v_ag.proximo_envio + interval '7 days'
      when 'quinzenal'  then v_ag.proximo_envio + interval '14 days'
      when 'mensal'     then v_ag.proximo_envio + interval '1 month'
      else v_ag.proximo_envio + interval '7 days'
    end;

    update public.checkin_agendamentos
      set proximo_envio = v_proximo,
          ultimo_envio  = now()
      where id = v_ag.id;
  end loop;
end;
$$;

-- agenda diária (idempotente)
select cron.unschedule('processar_agendamentos_checkin')
  where exists (select 1 from cron.job where jobname = 'processar_agendamentos_checkin');

select cron.schedule(
  'processar_agendamentos_checkin',
  '0 8 * * *',
  $cron$select public.processar_agendamentos_checkin();$cron$
);


-- =============================================================
-- 7. GRANTS (garantia)
-- =============================================================
grant select, insert, update, delete on public.fotos_evolucao       to anon, authenticated, service_role;
grant select, insert, update, delete on public.pacientes_pendentes  to anon, authenticated, service_role;
