-- 카드옵티마 — Supabase 스키마 (2단계 연동 대비)
-- MVP는 localStorage만 사용하며 이 스키마는 아직 적용되지 않았습니다.
-- 적용 순서: Supabase 프로젝트 생성 → SQL Editor에서 이 파일 실행 → Auth(이메일) 활성화
--           → src/services/storage.ts 의 SupabaseRepository 구현.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- 프로필 (auth.users 1:1)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 카드
-- 민감 결제 인증정보(전체 카드번호·CVC·비밀번호)는 저장하지 않는다.
-- last4는 선택이며, 별칭만으로 식별한다.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  short_name text not null,
  issuer text not null default '',
  network text not null default 'LOCAL' check (network in ('AMEX', 'VISA', 'MASTERCARD', 'LOCAL')),
  theme text not null default 'navy' check (theme in ('navy', 'violet', 'emerald', 'graphite', 'coral')),
  last4 char(4),
  annual_fee integer not null default 0 check (annual_fee >= 0),
  -- 실적 기준
  prev_threshold integer not null default 0 check (prev_threshold >= 0),
  min_per_transaction integer not null default 0 check (min_per_transaction >= 0),
  excluded_categories text[] not null default array['tax'],
  excluded_keywords text[] not null default '{}',
  -- 수동 보정
  prev_month_adjustment integer not null default 0,
  current_month_adjustment integer not null default 0,
  verification text not null default 'example' check (verification in ('official', 'example')),
  source_note text,
  memo text,
  change_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cards_user_idx on public.cards (user_id);

-- 혜택 규칙 (업종별 할인/적립, 한도, 실적 조건)
create table if not exists public.card_benefits (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  label text not null,
  categories text[] not null default '{}',
  keywords text[] not null default '{}',
  earn_type text not null check (earn_type in ('percent', 'points')),
  percent numeric(6, 3),
  points_per_unit numeric(10, 3),
  unit_amount integer,
  point_currency text check (point_currency in ('bonvoy', 'hilton', 'skypass', 'mr', 'krw', 'npay')),
  monthly_cap_krw integer,
  monthly_cap_points integer,
  min_prev_month integer,
  min_transaction integer,
  requires_direct boolean not null default false,
  verification text not null default 'example' check (verification in ('official', 'example')),
  source text,
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (
    (earn_type = 'percent' and percent is not null)
    or (earn_type = 'points' and points_per_unit is not null and unit_amount is not null)
  )
);

create index if not exists card_benefits_card_idx on public.card_benefits (card_id);

-- 이벤트(응모형)
create table if not exists public.card_promos (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  label text not null,
  categories text[] not null default '{}',
  min_spend integer not null check (min_spend >= 0),
  reward_krw integer not null check (reward_krw >= 0),
  expires_at date,
  enrolled boolean not null default false,
  verification text not null default 'example' check (verification in ('official', 'example')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists card_promos_card_idx on public.card_promos (card_id);

-- 월별 혜택 사용액 (rule 단위) — 월 한도 잔여 계산
create table if not exists public.benefit_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  benefit_id uuid references public.card_benefits (id) on delete cascade,
  month date not null, -- 해당 월 1일
  used_krw integer not null default 0 check (used_krw >= 0),
  created_at timestamptz not null default now(),
  unique (card_id, benefit_id, month)
);

create index if not exists benefit_usage_user_month_idx on public.benefit_usage (user_id, month);

-- ─────────────────────────────────────────────────────────────
-- 결제내역
-- ─────────────────────────────────────────────────────────────
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  merchant text not null,
  category text not null default 'general',
  amount integer not null check (amount > 0),
  occurred_on date not null,
  status text not null default 'active' check (status in ('active', 'canceled')),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index if not exists transactions_card_idx on public.transactions (card_id);

-- ─────────────────────────────────────────────────────────────
-- 혜택 지갑
-- ─────────────────────────────────────────────────────────────
create table if not exists public.wallet_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid references public.cards (id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('stay', 'lounge', 'valet', 'spa', 'voucher', 'dining', 'credit', 'status')),
  remaining integer not null default 0 check (remaining >= 0),
  total integer not null default 0 check (total >= 0),
  unit text not null default '회',
  expires_at date,
  conditions text,
  how_to text,
  value_krw integer,
  verification text not null default 'example' check (verification in ('official', 'example')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_items_user_idx on public.wallet_items (user_id);
create index if not exists wallet_items_expiry_idx on public.wallet_items (user_id, expires_at);

-- ─────────────────────────────────────────────────────────────
-- 사용자 설정 (포인트 환산 가치)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  point_values jsonb not null default '{"bonvoy":10,"hilton":7,"skypass":15,"mr":1,"krw":1,"npay":1}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- updated_at 자동 갱신
-- ─────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'cards', 'transactions', 'wallet_items', 'user_settings']
  loop
    execute format('drop trigger if exists %I_touch on public.%I;', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at();', t, t);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS: 모든 행은 소유자만 접근
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.cards enable row level security;
alter table public.card_benefits enable row level security;
alter table public.card_promos enable row level security;
alter table public.benefit_usage enable row level security;
alter table public.transactions enable row level security;
alter table public.wallet_items enable row level security;
alter table public.user_settings enable row level security;

create policy "profiles_self" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "cards_owner" on public.cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "card_usage_owner" on public.benefit_usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "transactions_owner" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "wallet_owner" on public.wallet_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "settings_owner" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 혜택·이벤트는 카드 소유자만 접근 (join 기반 정책)
create policy "card_benefits_owner" on public.card_benefits
  for all using (exists (select 1 from public.cards c where c.id = card_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.cards c where c.id = card_id and c.user_id = auth.uid()));

create policy "card_promos_owner" on public.card_promos
  for all using (exists (select 1 from public.cards c where c.id = card_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.cards c where c.id = card_id and c.user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- 참고: 인증 후 profiles/user_settings 자동 생성
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name) values (new.id, new.raw_user_meta_data ->> 'name')
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
