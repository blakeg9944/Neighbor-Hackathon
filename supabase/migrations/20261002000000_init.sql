-- Resume Tailorer: initial schema
create extension if not exists vector with schema extensions;

create type public.section_type as enum (
  'experience', 'education', 'project', 'skill', 'certification', 'summary', 'other'
);

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, holds the whole-resume embedding
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  embedding   extensions.vector(1536),
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- source_resumes: original uploads + extracted text
-- ---------------------------------------------------------------------------
create table public.source_resumes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  storage_path  text,
  raw_text      text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- resume_items: parsed sections (experience, skill, ...)
-- ---------------------------------------------------------------------------
create table public.resume_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  source_resume_id  uuid references public.source_resumes (id) on delete set null,
  section           public.section_type not null,
  title             text,
  organization      text,
  start_date        text,
  end_date          text,
  content           jsonb not null default '{}'::jsonb,  -- e.g. {"bullets": [...], "location": "..."}
  content_text      text not null default '',
  created_at        timestamptz not null default now()
);

create index resume_items_user_section_idx on public.resume_items (user_id, section);

-- ---------------------------------------------------------------------------
-- jobs: global pool, deduped by url
-- ---------------------------------------------------------------------------
create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  url             text unique,
  company         text,
  title           text,
  description     text,
  qualifications  jsonb not null default '{}'::jsonb,  -- {"required": [...], "preferred": [...]}
  embedding       extensions.vector(1536),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index jobs_embedding_idx on public.jobs
  using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- saved_jobs: per-user bookmarks into the global pool
-- ---------------------------------------------------------------------------
create table public.saved_jobs (
  user_id     uuid not null references auth.users (id) on delete cascade,
  job_id      uuid not null references public.jobs (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, job_id)
);

-- ---------------------------------------------------------------------------
-- generated_resumes: dashboard list of tailored outputs
-- ---------------------------------------------------------------------------
create table public.generated_resumes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  job_id        uuid references public.jobs (id) on delete set null,
  title         text,
  content       jsonb not null default '{}'::jsonb,
  storage_path  text,
  match_score   real,
  created_at    timestamptz not null default now()
);

create index generated_resumes_user_idx on public.generated_resumes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.source_resumes    enable row level security;
alter table public.resume_items      enable row level security;
alter table public.jobs              enable row level security;
alter table public.saved_jobs        enable row level security;
alter table public.generated_resumes enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "own source_resumes" on public.source_resumes
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own resume_items" on public.resume_items
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own saved_jobs" on public.saved_jobs
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own generated_resumes" on public.generated_resumes
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "jobs readable" on public.jobs
  for select to authenticated using (true);

create policy "jobs insertable" on public.jobs
  for insert to authenticated with check (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Matching RPCs (profile embedding vs job embeddings)
-- p_user_id is explicit so the service-role backend can call these too;
-- for authenticated callers RLS on profiles still limits them to their own row.
-- ---------------------------------------------------------------------------
create or replace function public.match_jobs(
  p_user_id   uuid,
  match_count int default 10,
  only_saved  boolean default false
)
returns table (
  id uuid, url text, company text, title text, qualifications jsonb, fit double precision
)
language sql stable
security invoker
set search_path = public, extensions
as $$
  select j.id, j.url, j.company, j.title, j.qualifications,
         1 - (j.embedding <=> p.embedding) as fit
  from public.jobs j
  cross join public.profiles p
  where p.id = p_user_id
    and p.embedding is not null
    and j.embedding is not null
    and (not only_saved or exists (
      select 1 from public.saved_jobs s where s.job_id = j.id and s.user_id = p_user_id
    ))
  order by j.embedding <=> p.embedding
  limit match_count;
$$;

create or replace function public.job_fit(p_user_id uuid, p_job_id uuid)
returns double precision
language sql stable
security invoker
set search_path = public, extensions
as $$
  select 1 - (j.embedding <=> p.embedding)
  from public.jobs j, public.profiles p
  where j.id = p_job_id and p.id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- Storage: private buckets, files live under {user_id}/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false), ('resumes', 'resumes', false)
on conflict (id) do nothing;

create policy "own files read" on storage.objects
  for select to authenticated
  using (bucket_id in ('uploads', 'resumes') and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own files insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('uploads', 'resumes') and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own files delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('uploads', 'resumes') and (storage.foldername(name))[1] = auth.uid()::text);
