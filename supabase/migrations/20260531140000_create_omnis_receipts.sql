create extension if not exists pgcrypto;

create table if not exists public.omnis_receipts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  route text not null,
  status text not null,
  amount_usdc numeric,
  estimated_received_usdc numeric,
  cctp_fee_usdc numeric,
  source_chain text,
  destination_chain text,
  source_address text,
  destination_address text,
  solana_source_address text,
  solana_usdc_ata text,
  injective_recipient_address text,
  solana_recipient_address text,
  approval_tx text,
  burn_tx text,
  relay_tx text,
  receive_message_tx text,
  gas_sponsor text default 'OmnisRouter',
  raw_receipt jsonb
);

alter table public.omnis_receipts enable row level security;

drop policy if exists "Public can read OmnisRouter receipts" on public.omnis_receipts;

create policy "Public can read OmnisRouter receipts"
on public.omnis_receipts
for select
to anon, authenticated
using (true);

grant usage on schema public to anon, authenticated;
grant select on table public.omnis_receipts to anon, authenticated;
