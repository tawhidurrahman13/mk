-- SOC Bootcamp Supabase repair/bootstrap query
-- Use this only if Supabase reports:
-- ERROR: 42P01: relation "public.users" does not exist
-- ERROR: 42P01: relation "public.certifications" does not exist
--
-- Steps:
-- 1. Paste and run this file in the Supabase SQL Editor.
-- 2. Then paste and run the full supabase_schema.sql file from the first line.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role' and typnamespace = 'public'::regnamespace) then
    create type public.user_role as enum ('student', 'admin');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'certification_status' and typnamespace = 'public'::regnamespace) then
    create type public.certification_status as enum (
      'Not Started',
      'Studying',
      'Practice Ready',
      'Exam Ready',
      'Certified',
      'Failed'
    );
  end if;
end $$;

create table if not exists public.admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'SOC Analyst',
  email text not null unique,
  google_id text unique,
  profile_image text,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now(),
  last_login timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.certifications (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null unique,
  provider text not null check (provider in ('Pearson', 'CompTIA', 'SOC Bootcamp')),
  category text not null,
  difficulty text not null default 'Beginner',
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.practice_exams (
  id uuid primary key default gen_random_uuid(),
  certification_id uuid not null references public.certifications(id) on delete cascade,
  title text not null,
  description text not null default '',
  duration_minutes integer not null default 45 check (duration_minutes > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (certification_id, title)
);

create table if not exists public.certification_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  certification_id uuid not null references public.certifications(id) on delete restrict,
  prep_score integer check (prep_score between 0 and 100),
  question_bank_score integer check (question_bank_score between 0 and 100),
  practice_exam_score integer check (practice_exam_score between 0 and 100),
  status public.certification_status not null default 'Not Started',
  selected_at timestamptz,
  last_accessed_at timestamptz,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, certification_id)
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  certification_id uuid references public.certifications(id) on delete set null,
  quiz_id text not null,
  quiz_title text not null,
  score integer not null check (score >= 0),
  total integer not null check (total > 0),
  percent integer not null check (percent between 0 and 100),
  answers jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.kali_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  last_section text not null default 'intro',
  completed_sections text[] not null default '{}',
  quiz_score text,
  quiz_percent integer check (quiz_percent between 0 and 100),
  quiz_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (lower(email));
create index if not exists users_role_idx on public.users (role);
create index if not exists certifications_slug_idx on public.certifications (slug);
create index if not exists certification_scores_user_idx on public.certification_scores (user_id);
create index if not exists certification_scores_certification_idx on public.certification_scores (certification_id);
create index if not exists quiz_attempts_user_created_idx on public.quiz_attempts (user_id, created_at desc);
create index if not exists quiz_attempts_certification_idx on public.quiz_attempts (certification_id);

create or replace function public.is_admin(user_uuid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users
    where id = user_uuid
      and role = 'admin'
  );
$$;

comment on table public.users is 'SOC Bootcamp application profile table linked to Supabase Auth users.';
comment on table public.certifications is 'SOC Bootcamp certification catalog used by certification cards and quiz directory.';
