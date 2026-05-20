-- SOC Bootcamp Supabase schema
-- Paste this whole file into Supabase SQL Editor and run it as a new query.
-- If you see "ERROR: 42P01: relation public.users does not exist"
-- or "ERROR: 42P01: relation public.certifications does not exist",
-- run supabase_repair_users_first.sql first, then rerun this full file from the top.
--
-- IMPORTANT ADMIN SETUP:
-- 1. Run this schema first.
-- 2. Confirm the approved admin email exists in public.admin_emails.
--    Current approved admin email: eakhter@brooklynsteamcenter.org
-- 3. When that email signs in through Supabase Auth, their public.users role becomes admin.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'user_role'
      and n.nspname = 'public'
  ) then
    create type public.user_role as enum ('student', 'admin');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'certification_status'
      and n.nspname = 'public'
  ) then
    create type public.certification_status as enum (
      'Not Started',
      'Studying',
      'Practice Ready',
      'Exam Ready',
      'Certified',
      'Failed'
    );
  end if;
end
$$;

create table if not exists public.admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.admin_emails (email)
values ('eakhter@brooklynsteamcenter.org')
on conflict do nothing;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
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

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  target_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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

create index if not exists users_email_idx on public.users (lower(email));
create index if not exists users_role_idx on public.users (role);
create index if not exists certifications_slug_idx on public.certifications (slug);
create index if not exists certification_scores_user_idx on public.certification_scores (user_id);
create index if not exists certification_scores_certification_idx on public.certification_scores (certification_id);
create index if not exists quiz_attempts_user_created_idx on public.quiz_attempts (user_id, created_at desc);
create index if not exists quiz_attempts_certification_idx on public.quiz_attempts (certification_id);
create index if not exists site_users_email_idx on public.site_users (lower(email));
create index if not exists site_users_role_idx on public.site_users (role);
create index if not exists email_mfa_challenges_user_idx on public.email_mfa_challenges (site_user_id, created_at desc);
create index if not exists email_mfa_challenges_expiry_idx on public.email_mfa_challenges (expires_at);
create index if not exists password_reset_challenges_user_idx on public.password_reset_challenges (site_user_id, created_at desc);
create index if not exists password_reset_challenges_expiry_idx on public.password_reset_challenges (expires_at);
create index if not exists audit_logs_actor_created_idx on public.audit_logs (actor_user_id, created_at desc);
create index if not exists audit_logs_target_created_idx on public.audit_logs (target_user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists certifications_set_updated_at on public.certifications;
create trigger certifications_set_updated_at
before update on public.certifications
for each row execute function public.set_updated_at();

drop trigger if exists practice_exams_set_updated_at on public.practice_exams;
create trigger practice_exams_set_updated_at
before update on public.practice_exams
for each row execute function public.set_updated_at();

drop trigger if exists certification_scores_set_updated_at on public.certification_scores;
create trigger certification_scores_set_updated_at
before update on public.certification_scores
for each row execute function public.set_updated_at();

drop trigger if exists kali_progress_set_updated_at on public.kali_progress;
create trigger kali_progress_set_updated_at
before update on public.kali_progress
for each row execute function public.set_updated_at();

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

create or replace function public.prevent_user_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role then
    if current_user in ('postgres', 'supabase_admin')
      or auth.role() = 'service_role'
      or public.is_admin(auth.uid()) then
      return new;
    end if;

    raise exception 'Only an admin can change user roles.';
  end if;

  return new;
end;
$$;

drop trigger if exists users_prevent_role_escalation on public.users;
create trigger users_prevent_role_escalation
before update on public.users
for each row execute function public.prevent_user_role_escalation();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text;
  user_name text;
  avatar text;
  provider_subject text;
  assigned_role public.user_role;
begin
  user_email := lower(coalesce(new.email, ''));
  user_name := coalesce(
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'full_name',
    split_part(user_email, '@', 1),
    'SOC Analyst'
  );
  avatar := coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  );
  provider_subject := coalesce(
    new.raw_user_meta_data ->> 'sub',
    new.raw_user_meta_data ->> 'provider_id',
    new.id::text
  );

  assigned_role := case
    when exists (select 1 from public.admin_emails where lower(email) = user_email)
      then 'admin'::public.user_role
    else 'student'::public.user_role
  end;

  insert into public.users (
    id,
    name,
    email,
    google_id,
    profile_image,
    role,
    created_at,
    last_login,
    updated_at
  )
  values (
    new.id,
    user_name,
    user_email,
    provider_subject,
    avatar,
    assigned_role,
    now(),
    now(),
    now()
  )
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email,
    google_id = excluded.google_id,
    profile_image = excluded.profile_image,
    role = case
      when public.users.role = 'admin' then 'admin'::public.user_role
      else excluded.role
    end,
    last_login = now(),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.users (
  id,
  name,
  email,
  google_id,
  profile_image,
  role,
  created_at,
  last_login,
  updated_at
)
select
  au.id,
  coalesce(
    au.raw_user_meta_data ->> 'name',
    au.raw_user_meta_data ->> 'full_name',
    split_part(lower(au.email), '@', 1),
    'SOC Analyst'
  ) as name,
  lower(au.email) as email,
  coalesce(
    au.raw_user_meta_data ->> 'sub',
    au.raw_user_meta_data ->> 'provider_id',
    au.id::text
  ) as google_id,
  coalesce(
    au.raw_user_meta_data ->> 'avatar_url',
    au.raw_user_meta_data ->> 'picture'
  ) as profile_image,
  case
    when exists (select 1 from public.admin_emails where lower(email) = lower(au.email))
      then 'admin'::public.user_role
    else 'student'::public.user_role
  end as role,
  coalesce(au.created_at, now()) as created_at,
  now() as last_login,
  now() as updated_at
from auth.users au
where au.email is not null
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  google_id = excluded.google_id,
  profile_image = excluded.profile_image,
  role = case
    when public.users.role = 'admin' then 'admin'::public.user_role
    else excluded.role
  end,
  updated_at = now();

create or replace function public.touch_user_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set last_login = now(),
      updated_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.touch_user_login() to authenticated;

insert into public.certifications (slug, title, provider, category, difficulty, description)
values
  (
    'pearson-cybersecurity',
    'Pearson Cybersecurity',
    'Pearson',
    'CyberSecurity',
    'Beginner',
    'SOC fundamentals, threat awareness, alert triage, and defensive cyber concepts.'
  ),
  (
    'pearson-network-security',
    'Pearson Network Security',
    'Pearson',
    'Network Security',
    'Intermediate',
    'Firewall rules, segmentation, packet analysis, and secure network operations.'
  ),
  (
    'pearson-networking',
    'Pearson Networking',
    'Pearson',
    'Networking',
    'Beginner',
    'Networking basics, DNS, routing, ports, protocols, and troubleshooting.'
  ),
  (
    'comptia-network-plus',
    'CompTIA Network Plus',
    'CompTIA',
    'Networking',
    'Intermediate',
    'Network+ readiness for infrastructure, operations, troubleshooting, and security basics.'
  ),
  (
    'comptia-security-plus',
    'CompTIA Security Plus',
    'CompTIA',
    'CyberSecurity',
    'Intermediate',
    'Security+ readiness for threats, controls, identity, cryptography, risk, and operations.'
  )
on conflict (slug) do update set
  title = excluded.title,
  provider = excluded.provider,
  category = excluded.category,
  difficulty = excluded.difficulty,
  description = excluded.description,
  is_active = true,
  updated_at = now();

insert into public.practice_exams (certification_id, title, description, duration_minutes)
select id, title || ' Readiness Exam', 'Timed practice exam for ' || title || '.', 45
from public.certifications
where slug in (
  'pearson-cybersecurity',
  'pearson-network-security',
  'pearson-networking',
  'comptia-network-plus',
  'comptia-security-plus'
)
on conflict (certification_id, title) do update set
  description = excluded.description,
  duration_minutes = excluded.duration_minutes,
  is_active = true,
  updated_at = now();

alter table public.admin_emails enable row level security;
alter table public.users enable row level security;
alter table public.certifications enable row level security;
alter table public.practice_exams enable row level security;
alter table public.certification_scores enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.kali_progress enable row level security;
alter table public.site_users enable row level security;
alter table public.email_mfa_challenges enable row level security;
alter table public.password_reset_challenges enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists admin_emails_select on public.admin_emails;
create policy admin_emails_select
on public.admin_emails
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists admin_emails_manage on public.admin_emails;
create policy admin_emails_manage
on public.admin_emails
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists users_select_own_or_admin on public.users;
create policy users_select_own_or_admin
on public.users
for select
to authenticated
using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists users_insert_own on public.users;
create policy users_insert_own
on public.users
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists users_update_own_or_admin on public.users;
create policy users_update_own_or_admin
on public.users
for update
to authenticated
using (id = auth.uid() or public.is_admin(auth.uid()))
with check (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin
on public.users
for delete
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists certifications_select_authenticated on public.certifications;
create policy certifications_select_authenticated
on public.certifications
for select
to authenticated
using (is_active = true or public.is_admin(auth.uid()));

drop policy if exists certifications_manage_admin on public.certifications;
create policy certifications_manage_admin
on public.certifications
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists practice_exams_select_authenticated on public.practice_exams;
create policy practice_exams_select_authenticated
on public.practice_exams
for select
to authenticated
using (is_active = true or public.is_admin(auth.uid()));

drop policy if exists practice_exams_manage_admin on public.practice_exams;
create policy practice_exams_manage_admin
on public.practice_exams
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists certification_scores_select_own_or_admin on public.certification_scores;
create policy certification_scores_select_own_or_admin
on public.certification_scores
for select
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists certification_scores_insert_own_or_admin on public.certification_scores;
create policy certification_scores_insert_own_or_admin
on public.certification_scores
for insert
to authenticated
with check (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists certification_scores_update_own_or_admin on public.certification_scores;
create policy certification_scores_update_own_or_admin
on public.certification_scores
for update
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()))
with check (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists certification_scores_delete_admin on public.certification_scores;
create policy certification_scores_delete_admin
on public.certification_scores
for delete
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists quiz_attempts_select_own_or_admin on public.quiz_attempts;
create policy quiz_attempts_select_own_or_admin
on public.quiz_attempts
for select
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists quiz_attempts_insert_own on public.quiz_attempts;
create policy quiz_attempts_insert_own
on public.quiz_attempts
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists quiz_attempts_update_admin on public.quiz_attempts;
create policy quiz_attempts_update_admin
on public.quiz_attempts
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists quiz_attempts_delete_admin on public.quiz_attempts;
create policy quiz_attempts_delete_admin
on public.quiz_attempts
for delete
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists kali_progress_select_own_or_admin on public.kali_progress;
create policy kali_progress_select_own_or_admin
on public.kali_progress
for select
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists kali_progress_insert_own on public.kali_progress;
create policy kali_progress_insert_own
on public.kali_progress
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists kali_progress_update_own_or_admin on public.kali_progress;
create policy kali_progress_update_own_or_admin
on public.kali_progress
for update
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()))
with check (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists kali_progress_delete_admin on public.kali_progress;
create policy kali_progress_delete_admin
on public.kali_progress
for delete
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
on public.audit_logs
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists audit_logs_insert_admin on public.audit_logs;
create policy audit_logs_insert_admin
on public.audit_logs
for insert
to authenticated
with check (public.is_admin(auth.uid()));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.admin_emails to authenticated;
grant select, insert, update, delete on public.certifications to authenticated;
grant select, insert, update, delete on public.practice_exams to authenticated;
grant select, insert, update, delete on public.users to authenticated;
grant select, insert, update, delete on public.certification_scores to authenticated;
grant select, insert, update, delete on public.quiz_attempts to authenticated;
grant select, insert, update, delete on public.kali_progress to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select, insert, update, delete on public.site_users to service_role;
grant select, insert, update, delete on public.email_mfa_challenges to service_role;
grant select, insert, update, delete on public.password_reset_challenges to service_role;

-- Optional bootstrap command if the authorized admin changes after legal/admin review:
-- insert into public.admin_emails (email) values ('new-approved-admin@example.edu') on conflict do nothing;
