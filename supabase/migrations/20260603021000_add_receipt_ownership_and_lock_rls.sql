alter table if exists public.omnis_receipts
  add column if not exists owner_wallet_address text;

alter table if exists public.omnis_receipts
  add column if not exists owner_wallet_type text;

drop policy if exists "Public can read OmnisRouter receipts" on public.omnis_receipts;

revoke all on table public.omnis_receipts from anon, authenticated;

grant select on table public.omnis_receipts to authenticated;
