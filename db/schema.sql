-- VidyCut database schema. Run in a dedicated Supabase project's SQL editor.
-- PostgreSQL 15+; idempotent table creation, with explicitly named access policies.
begin;
create extension if not exists pgcrypto;
create table if not exists public.users (
  id uuid primary key,
  email text,
  name text not null default '',
  avatar_url text,
  role text not null default 'user' check (role in ('user','admin')),
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check(char_length(name) between 1 and 200),
  definition jsonb not null,
  revision integer not null default 1,
  thumbnail_path text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  version integer not null,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  unique(project_id,version)
);
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  mime text not null,
  size_bytes bigint not null check(size_bytes>=0),
  storage_path text not null unique,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.tracks (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  kind text not null check(kind in ('video','audio')),
  definition jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  name text not null,
  definition jsonb not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.effects (
  id uuid primary key default gen_random_uuid(), name text not null,
  definition jsonb not null default '{}', enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.filters (like public.effects including all);
create table if not exists public.stickers (like public.effects including all);
create table if not exists public.audio_assets (like public.effects including all);
create table if not exists public.settings (like public.effects including all);
create table if not exists public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  kind text not null,
  status text not null default 'queued' check(status in ('queued','running','completed','failed','canceled')),
  config jsonb not null,
  progress double precision not null default 0 check(progress between 0 and 1),
  result_path text,
  error_code text,
  attempts integer not null default 0,
  worker_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_updated on public.projects(user_id,updated_at desc);
create index if not exists versions_project on public.project_versions(project_id,version desc);
create index if not exists media_project on public.media(project_id,user_id);
create index if not exists tracks_project on public.tracks(project_id);
create index if not exists jobs_queue on public.render_jobs(status,created_at) where status='queued';
create index if not exists jobs_owner on public.render_jobs(user_id,created_at desc);
-- All cloud writes go through the authorized Node API, not browser table writes.
do $$ declare table_name text; begin
  foreach table_name in array array['users','projects','project_versions','media','tracks','templates','effects','filters','stickers','audio_assets','render_jobs','settings'] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;
-- Optional Supabase integration. Ordinary PostgreSQL still supports the Node API.
do $$ begin
  if to_regprocedure('auth.uid()') is not null then
    execute 'drop policy if exists users_read_self on public.users';
    execute 'create policy users_read_self on public.users for select using(id=auth.uid())';
    execute 'drop policy if exists projects_read_own on public.projects';
    execute 'create policy projects_read_own on public.projects for select using(user_id=auth.uid())';
    execute 'drop policy if exists versions_read_own on public.project_versions';
    execute 'create policy versions_read_own on public.project_versions for select using(user_id=auth.uid())';
    execute 'drop policy if exists media_read_own on public.media';
    execute 'create policy media_read_own on public.media for select using(user_id=auth.uid())';
    execute 'drop policy if exists tracks_read_own on public.tracks';
    execute 'create policy tracks_read_own on public.tracks for select using(user_id=auth.uid())';
    execute 'drop policy if exists jobs_read_own on public.render_jobs';
    execute 'create policy jobs_read_own on public.render_jobs for select using(user_id=auth.uid())';
  end if;
end $$;
create or replace function public.vidycut_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.users(id,email,name,avatar_url) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''),new.raw_user_meta_data->>'avatar_url') on conflict(id) do nothing;
  return new;
end $$;
do $$ begin
  if to_regclass('auth.users') is not null then
    execute 'drop trigger if exists vidycut_auth_user_created on auth.users';
    execute 'create trigger vidycut_auth_user_created after insert on auth.users for each row execute function public.vidycut_new_user()';
    execute 'insert into public.users(id,email) select id,email from auth.users on conflict(id) do nothing';
  end if;
end $$;
-- No client write grants or admin policies. Service-role credentials remain server-side.
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on all tables in schema public from anon';
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'grant select on public.users,public.projects,public.project_versions,public.media,public.tracks,public.render_jobs to authenticated';
  end if;
end $$;
commit;
