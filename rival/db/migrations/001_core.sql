-- Christmas HQ schema: accounts, families, wishlists, gift tracking, budgets, games.
-- Everything lives in its own `hq` schema so it can share a database with other apps.
-- Authorization is enforced in the API layer (src/lib/access.ts); every query that returns
-- another person's data goes through a shared-family check.
-- Emails are stored lowercased as text (the API lowercases them) so no extensions are needed.

create table users (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique check (email = lower(email)),
  name         text not null check (char_length(name) between 1 and 40),
  pw_hash      text not null,
  avatar       text not null default 'tree',
  color        text not null default 'red',
  theme        text not null default 'snow',
  effect       text not null default 'none',
  coins        integer not null default 50 check (coins >= 0),
  about        jsonb not null default '{}'::jsonb,
  budget_cents integer not null default 0 check (budget_cents between 0 and 100000000),
  created_at   timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user on sessions(user_id);

-- Failed sign-in / join attempts, for rate limiting.
create table attempts (
  id   bigserial primary key,
  key  text not null,
  at   timestamptz not null default now()
);
create index attempts_key on attempts(key, at);

create table families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 40),
  code       text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table members (
  family_id uuid not null references families(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index members_user on members(user_id);

create table images (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  mime       text not null check (mime in ('image/jpeg','image/png','image/webp')),
  data       bytea not null check (octet_length(data) <= 800000),
  created_at timestamptz not null default now()
);

create table wishes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null default 'exact' check (kind in ('exact','idea')),
  top        boolean not null default false,
  title      text not null check (char_length(title) between 1 and 120),
  brand      text not null default '' check (char_length(brand) <= 60),
  category   text not null default '' check (char_length(category) <= 40),
  price      text not null default '' check (char_length(price) <= 30),
  size       text not null default '' check (char_length(size) <= 40),
  color      text not null default '' check (char_length(color) <= 60),
  links      text[] not null default '{}' check (cardinality(links) <= 5),
  notes      text not null default '' check (char_length(notes) <= 600),
  image_id   uuid references images(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wishes_user on wishes(user_id, created_at desc);

-- A gift someone plans to give. When it comes from a wishlist item, wish_id is set,
-- which "claims" that item so nobody else buys it twice. Never shown to the recipient.
create table gifts (
  id           uuid primary key default gen_random_uuid(),
  giver_id     uuid not null references users(id) on delete cascade,
  recipient_id uuid not null references users(id) on delete cascade,
  wish_id      uuid references wishes(id) on delete set null,
  title        text not null check (char_length(title) between 1 and 120),
  price_cents  integer not null default 0 check (price_cents between 0 and 10000000),
  status       text not null default 'planned' check (status in ('planned','bought','wrapped','given')),
  link         text not null default '' check (char_length(link) <= 500),
  notes        text not null default '' check (char_length(notes) <= 400),
  created_at   timestamptz not null default now(),
  check (giver_id <> recipient_id)
);
create unique index gifts_one_claim on gifts(wish_id) where wish_id is not null;
create index gifts_giver on gifts(giver_id);

create table person_budgets (
  giver_id     uuid not null references users(id) on delete cascade,
  recipient_id uuid not null references users(id) on delete cascade,
  cents        integer not null check (cents between 0 and 10000000),
  primary key (giver_id, recipient_id)
);

create table plays (
  id         bigserial primary key,
  user_id    uuid not null references users(id) on delete cascade,
  game       text not null,
  score      integer not null,
  coins      integer not null,
  created_at timestamptz not null default now()
);
create index plays_user on plays(user_id, created_at desc);

create table owned (
  user_id    uuid not null references users(id) on delete cascade,
  item       text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item)
);
