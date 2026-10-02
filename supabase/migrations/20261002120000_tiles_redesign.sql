-- DESIGN_SPEC §5: tiles redesign on top of init

-- 1. New category set (no real data exists yet, so recreate the enum)
alter table public.resume_items alter column section type text;
drop type public.section_type;
create type public.section_type as enum
  ('education','coursework','skills','experience','projects','other');
alter table public.resume_items
  alter column section type public.section_type using section::public.section_type;

-- 2. Resume header fields
alter table public.profiles
  add column phone text,
  add column location text,
  add column links jsonb not null default '[]'::jsonb;

-- 3. Job overview
alter table public.jobs
  add column summary text,
  add column bullets jsonb not null default '[]'::jsonb;

-- 4. Per-user saved layout for a job
alter table public.saved_jobs
  add column layout jsonb;
