alter table if exists public.omnis_receipts
  add column if not exists authorization_tx text;

alter table if exists public.omnis_receipts
  add column if not exists execution_mode text;

alter table if exists public.omnis_receipts
  add column if not exists relayer_address text;
