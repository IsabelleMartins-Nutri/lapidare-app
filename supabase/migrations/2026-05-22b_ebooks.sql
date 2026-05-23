-- =============================================================
-- Migration 2026-05-22b
-- Biblioteca de e-books: tabela ebooks + ebooks_pacientes (N:N)
-- =============================================================
-- Idempotente. Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================


-- =============================================================
-- 1. TABELAS
-- =============================================================

-- 1.1 ebooks — biblioteca da nutri ------------------------------
create table if not exists public.ebooks (
  id            uuid primary key default gen_random_uuid(),
  nutri_id      uuid not null references public.nutris(id) on delete cascade,
  titulo        text not null,
  descricao     text,
  storage_path  text not null,
  tag           text,        -- ex: 'receitas', 'protocolo', 'guia', 'suplementacao'
  created_at    timestamptz not null default now()
);
create index if not exists ebooks_nutri_idx on public.ebooks(nutri_id, created_at desc);

-- 1.2 ebooks_pacientes — atribuições N:N ------------------------
create table if not exists public.ebooks_pacientes (
  id            uuid primary key default gen_random_uuid(),
  ebook_id      uuid not null references public.ebooks(id) on delete cascade,
  paciente_id   uuid not null references public.pacientes(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (ebook_id, paciente_id)
);
create index if not exists ebooks_pacientes_paciente_idx on public.ebooks_pacientes(paciente_id);
create index if not exists ebooks_pacientes_ebook_idx    on public.ebooks_pacientes(ebook_id);


-- =============================================================
-- 2. RLS
-- =============================================================
alter table public.ebooks            enable row level security;
alter table public.ebooks_pacientes  enable row level security;

-- 2.1 ebooks: nutri vê/gere os próprios; paciente vê os atribuídos
drop policy if exists ebooks_select on public.ebooks;
create policy ebooks_select on public.ebooks
  for select using (
    nutri_id = auth.uid()
    or exists (
      select 1 from public.ebooks_pacientes ep
      where ep.ebook_id = id and ep.paciente_id = auth.uid()
    )
  );

drop policy if exists ebooks_write_nutri on public.ebooks;
create policy ebooks_write_nutri on public.ebooks
  for all using (nutri_id = auth.uid()) with check (nutri_id = auth.uid());

-- 2.2 ebooks_pacientes: nutri dona do ebook gerencia; paciente vê as próprias
drop policy if exists ebooks_pacientes_select on public.ebooks_pacientes;
create policy ebooks_pacientes_select on public.ebooks_pacientes
  for select using (
    paciente_id = auth.uid()
    or exists (select 1 from public.ebooks e where e.id = ebook_id and e.nutri_id = auth.uid())
  );

drop policy if exists ebooks_pacientes_write_nutri on public.ebooks_pacientes;
create policy ebooks_pacientes_write_nutri on public.ebooks_pacientes
  for all using (
    exists (select 1 from public.ebooks e where e.id = ebook_id and e.nutri_id = auth.uid())
  ) with check (
    exists (select 1 from public.ebooks e where e.id = ebook_id and e.nutri_id = auth.uid())
  );


-- =============================================================
-- 3. BUCKET + STORAGE POLICIES
-- =============================================================
-- Convenção do path: <nutri_id>/<arquivo>.pdf
-- =============================================================
insert into storage.buckets (id, name, public)
values ('ebooks', 'ebooks', false)
on conflict (id) do nothing;

-- 3.1 SELECT: nutri vê os próprios; paciente vê quando estiver na atribuição
drop policy if exists ebooks_storage_select on storage.objects;
create policy ebooks_storage_select on storage.objects
  for select using (
    bucket_id = 'ebooks'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (
        select 1 from public.ebooks e
        join public.ebooks_pacientes ep on ep.ebook_id = e.id
        where e.storage_path = name and ep.paciente_id = auth.uid()
      )
    )
  );

-- 3.2 INSERT: só a nutri dona da pasta
drop policy if exists ebooks_storage_insert on storage.objects;
create policy ebooks_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'ebooks'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- 3.3 DELETE: só a nutri dona da pasta
drop policy if exists ebooks_storage_delete on storage.objects;
create policy ebooks_storage_delete on storage.objects
  for delete using (
    bucket_id = 'ebooks'
    and split_part(name, '/', 1) = auth.uid()::text
  );


-- =============================================================
-- 4. GRANTS
-- =============================================================
grant select, insert, update, delete on public.ebooks            to anon, authenticated, service_role;
grant select, insert, update, delete on public.ebooks_pacientes  to anon, authenticated, service_role;
