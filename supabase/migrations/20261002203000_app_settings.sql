-- Small key/value settings table (service-role only).
-- Used by telegram-webhook to store the owner's Telegram chat id after `/soyjorge <code>`.
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
-- No policies on purpose: only the service role (edge functions) can read/write.
