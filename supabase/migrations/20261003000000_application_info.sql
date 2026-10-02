-- Standard job-application answers (work authorization, EEO, links, graduation...) used by auto-apply.
-- One jsonb bag so new questions don't need a migration; shape = schemas.ApplicationInfo (DESIGN_SPEC §6.1).
-- Covered by the existing profiles RLS policies (own row only).
alter table public.profiles
  add column application jsonb not null default '{}'::jsonb;
