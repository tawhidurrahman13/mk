-- SOC Bootcamp Vercel auth + Gmail SMTP MFA extension
-- Run this once in Supabase SQL Editor before using the Vercel auth endpoints.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role' and typnamespace = 'public'::regnamespace) then
    create type public.user_role as enum ('student', 'admin');
  end if;
end $$;

create table if not exists public.site_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null default 'SOC Analyst',
  role public.user_role not null default 'student',
  password_hash text,
  google_id text unique,
  profile_image text,
  created_at timestamptz not null default now(),
  last_login timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.email_mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  site_user_id uuid not null references public.site_users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  purpose text not null default 'login',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.password_reset_challenges (
  id uuid primary key default gen_random_uuid(),
  site_user_id uuid not null references public.site_users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  pending_password_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists site_users_email_idx on public.site_users (lower(email));
create index if not exists site_users_role_idx on public.site_users (role);
create index if not exists email_mfa_challenges_user_idx on public.email_mfa_challenges (site_user_id, created_at desc);
create index if not exists email_mfa_challenges_expiry_idx on public.email_mfa_challenges (expires_at);
create index if not exists password_reset_challenges_user_idx on public.password_reset_challenges (site_user_id, created_at desc);
create index if not exists password_reset_challenges_expiry_idx on public.password_reset_challenges (expires_at);

alter table public.site_users enable row level security;
alter table public.email_mfa_challenges enable row level security;
alter table public.password_reset_challenges enable row level security;

grant select, insert, update, delete on public.site_users to service_role;
grant select, insert, update, delete on public.email_mfa_challenges to service_role;
grant select, insert, update, delete on public.password_reset_challenges to service_role;
