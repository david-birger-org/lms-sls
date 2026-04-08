create extension if not exists pgcrypto;

do $$
begin
  create type public.payment_status as enum (
    'draft',
    'creating_invoice',
    'creation_failed',
    'invoice_created',
    'processing',
    'paid',
    'failed',
    'expired',
    'cancelled',
    'reversed'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id text not null unique,
  email text,
  first_name text,
  last_name text,
  full_name text,
  image_url text,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.app_users
  drop constraint if exists app_users_role_check;

alter table public.app_users
  drop column if exists role;

create table if not exists public.auth_users (
  id text primary key,
  name text not null,
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  role text default 'user',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint auth_users_role_check check (role in ('admin', 'user'))
);

create table if not exists public.auth_sessions (
  id text primary key,
  user_id text not null references public.auth_users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.auth_accounts (
  id text primary key,
  user_id text not null references public.auth_users(id) on delete cascade,
  account_id text not null,
  provider_id text not null,
  access_token text,
  refresh_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  id_token text,
  password text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint auth_accounts_provider_account_unique unique (provider_id, account_id)
);

create table if not exists public.auth_verifications (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_uk text not null,
  name_en text not null,
  description_uk text,
  description_en text,
  pricing_type text not null default 'on_request',
  price_uah_minor bigint,
  price_usd_minor bigint,
  image_url text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint products_pricing_type_check check (pricing_type in ('fixed', 'on_request')),
  constraint products_fixed_prices_required check (
    pricing_type <> 'fixed'
    or (price_uah_minor is not null and price_usd_minor is not null)
  )
);

create table if not exists public.payments (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete restrict,
  idempotency_key text,
  provider text not null default 'monobank',
  reference text not null unique,
  invoice_id text unique,
  provider_status text,
  status public.payment_status not null,
  amount_minor bigint not null,
  profit_amount_minor bigint,
  currency text not null,
  customer_name text not null,
  customer_email text,
  description text not null,
  page_url text,
  expires_at timestamptz,
  failure_reason text,
  payment_info jsonb,
  provider_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  product_id uuid references public.products(id),
  product_slug text,
  constraint payments_currency_check check (currency in ('UAH', 'USD'))
);

create index if not exists idx_app_users_auth_user_id
  on public.app_users (auth_user_id);

create index if not exists idx_auth_sessions_user_id
  on public.auth_sessions (user_id);

create index if not exists idx_auth_accounts_user_id
  on public.auth_accounts (user_id);

create unique index if not exists idx_auth_verifications_identifier_value
  on public.auth_verifications (identifier, value);

create index if not exists idx_payments_user_id
  on public.payments (user_id);

create index if not exists idx_payments_invoice_id
  on public.payments (invoice_id);

create index if not exists idx_payments_reference
  on public.payments (reference);

create unique index if not exists idx_payments_idempotency_key
  on public.payments (idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_products_slug
  on public.products (slug);

create index if not exists idx_products_active
  on public.products (active)
  where active = true;

create index if not exists idx_payments_product_id
  on public.payments (product_id);

create index if not exists idx_payments_product_slug
  on public.payments (product_slug)
  where product_slug is not null;
