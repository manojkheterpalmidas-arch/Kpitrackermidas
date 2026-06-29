create extension if not exists pgcrypto;

create table if not exists roles (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  description text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists team_members (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  role text not null,
  region text not null,
  business_type text not null,
  target numeric default 0,
  kpi_type text default '',
  weekly_kpi_expectations text default '',
  active integer default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commitments (
  id text primary key default gen_random_uuid()::text,
  person_id text not null references team_members(id),
  week_start text not null,
  title text not null,
  description text default '',
  category text not null,
  target_value numeric default 0,
  actual_value numeric default 0,
  status text not null,
  reason_if_missed text default '',
  manager_comment text default '',
  priority text default 'Medium',
  due_date text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  description text default '',
  owner_id text not null,
  priority text default 'Medium',
  due_date text default '',
  status text default 'Open',
  tags text default '',
  notes text default '',
  recurring text default 'No',
  completed_date text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists one_to_one_reviews (
  id text primary key default gen_random_uuid()::text,
  person_id text not null references team_members(id),
  review_date text not null,
  wins text default '',
  blockers text default '',
  commitments_reviewed text default '',
  performance_notes text default '',
  coaching_points text default '',
  action_items text default '',
  manager_feedback text default '',
  employee_concerns text default '',
  followup_date text default '',
  private_manager_notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists kpis (
  id text primary key default gen_random_uuid()::text,
  person_id text default '',
  name text not null,
  description text default '',
  cadence text default 'Weekly',
  target numeric default 0,
  unit text default 'count',
  active integer default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists weekly_kpi_entries (
  id text primary key default gen_random_uuid()::text,
  kpi_id text not null references kpis(id),
  person_id text not null references team_members(id),
  period_start text not null,
  period_type text default 'Weekly',
  target_value numeric default 0,
  actual_value numeric default 0,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tags (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  color text default '#2563eb',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notes (
  id text primary key default gen_random_uuid()::text,
  entity_type text not null,
  entity_id text not null,
  title text default '',
  body text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_settings (
  id text primary key default 'default',
  enabled integer default 0,
  provider text default 'DeepSeek',
  endpoint text default 'https://api.deepseek.com/chat/completions',
  model text default 'deepseek-chat',
  encrypted_api_key text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id text primary key default gen_random_uuid()::text,
  action text not null,
  entity text not null,
  entity_id text not null,
  detail text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_settings (
  id text primary key default gen_random_uuid()::text,
  key text unique not null,
  value text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commitments_person_week_idx on commitments(person_id, week_start);
create index if not exists tasks_owner_due_idx on tasks(owner_id, due_date);
create index if not exists reviews_person_date_idx on one_to_one_reviews(person_id, review_date);
create index if not exists kpis_person_idx on kpis(person_id);
create index if not exists weekly_kpi_entries_person_period_idx on weekly_kpi_entries(person_id, period_start);

alter table roles enable row level security;
alter table team_members enable row level security;
alter table commitments enable row level security;
alter table tasks enable row level security;
alter table one_to_one_reviews enable row level security;
alter table kpis enable row level security;
alter table weekly_kpi_entries enable row level security;
alter table tags enable row level security;
alter table notes enable row level security;
alter table ai_settings enable row level security;
alter table audit_log enable row level security;
alter table app_settings enable row level security;

insert into app_settings (id, key, value)
values
  (gen_random_uuid()::text, 'theme', 'light'),
  (gen_random_uuid()::text, 'lock_enabled', '1'),
  (gen_random_uuid()::text, 'pin_salt', 'team-kpi-tracker-default-pin-v1'),
  (gen_random_uuid()::text, 'pin_hash', '3c6642634a571ecfe895159f167f6cf4835a3573fe10363feb16b0d21d599c34')
on conflict (key) do nothing;

insert into ai_settings (id, enabled, provider, endpoint, model, encrypted_api_key)
values ('default', 0, 'DeepSeek', 'https://api.deepseek.com/chat/completions', 'deepseek-chat', '')
on conflict (id) do nothing;
