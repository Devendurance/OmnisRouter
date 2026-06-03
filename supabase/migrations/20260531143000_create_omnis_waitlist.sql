create extension if not exists pgcrypto;

create table if not exists public.omnis_waitlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null unique,
  source text not null default 'landing'
);

alter table public.omnis_waitlist enable row level security;

revoke all on table public.omnis_waitlist from anon;
revoke all on table public.omnis_waitlist from authenticated;