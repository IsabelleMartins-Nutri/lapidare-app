-- =============================================================
-- Migration 2026-05-23
-- Personalização visual: logo, marca, cores, tipografia, textos
-- =============================================================
-- Cole no SQL Editor do Supabase e clique em Run.
-- =============================================================

-- 1. Novos campos em nutris
alter table public.nutris add column if not exists logo_url        text;
alter table public.nutris add column if not exists marca_nome      text default 'Lapidare';
alter table public.nutris add column if not exists marca_subtitulo text;
alter table public.nutris add column if not exists cor_primaria    text default '#a08456';
alter table public.nutris add column if not exists cor_secundaria  text default '#c9a96e';
alter table public.nutris add column if not exists tipografia      text default 'classica';
alter table public.nutris add column if not exists mensagem_login  text;
alter table public.nutris add column if not exists mensagem_termo  text;

alter table public.nutris drop constraint if exists nutris_tipografia_check;
alter table public.nutris add constraint nutris_tipografia_check
  check (tipografia in ('classica', 'modern', 'minimal', 'romantica'));


-- 2. Bucket de logos (público — pra carregar em qualquer lugar do app)
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists logos_storage_insert on storage.objects;
create policy logos_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'logos' and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists logos_storage_delete on storage.objects;
create policy logos_storage_delete on storage.objects
  for delete using (
    bucket_id = 'logos' and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists logos_storage_update on storage.objects;
create policy logos_storage_update on storage.objects
  for update using (
    bucket_id = 'logos' and split_part(name, '/', 1) = auth.uid()::text
  );


-- 3. Função pública pra paciente carregar a personalização da nutri dela
create or replace function public.buscar_personalizacao_nutri(p_nutri_id uuid)
returns table(
  marca_nome text, marca_subtitulo text, logo_url text,
  cor_primaria text, cor_secundaria text, tipografia text,
  mensagem_login text, mensagem_termo text
)
language sql security definer set search_path = public
as $$
  select
    coalesce(marca_nome, 'Lapidare') as marca_nome,
    marca_subtitulo, logo_url,
    coalesce(cor_primaria,   '#a08456') as cor_primaria,
    coalesce(cor_secundaria, '#c9a96e') as cor_secundaria,
    coalesce(tipografia,     'classica') as tipografia,
    mensagem_login, mensagem_termo
  from public.nutris
  where id = p_nutri_id
  limit 1;
$$;
grant execute on function public.buscar_personalizacao_nutri(uuid) to anon, authenticated;
