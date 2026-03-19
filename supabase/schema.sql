create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email text,
  first_name text,
  last_name text,
  full_name text,
  image_url text,
  clerk_created_at timestamptz,
  clerk_updated_at timestamptz,
  raw_clerk_data jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.app_users
  drop constraint if exists app_users_role_check;

alter table public.app_users
  drop column if exists role;

create table if not exists public.payments (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete restrict,
  provider text not null default 'monobank',
  reference text not null unique,
  invoice_id text unique,
  status text not null,
  amount_minor bigint not null,
  final_amount_minor bigint,
  currency text not null,
  customer_name text not null,
  customer_email text,
  description text not null,
  page_url text,
  failure_reason text,
  payment_info jsonb,
  provider_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint payments_currency_check check (currency in ('UAH', 'USD'))
);

create index if not exists idx_app_users_clerk_user_id
  on public.app_users (clerk_user_id);

create index if not exists idx_payments_user_id
  on public.payments (user_id);

create index if not exists idx_payments_invoice_id
  on public.payments (invoice_id);

create index if not exists idx_payments_reference
  on public.payments (reference);
