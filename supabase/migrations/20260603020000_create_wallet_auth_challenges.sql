create table if not exists public.wallet_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  wallet_type text not null,
  nonce text not null,
  message text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.wallet_auth_challenges enable row level security;
