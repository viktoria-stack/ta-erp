-- ============================================================
-- TAILORED ATHLETE ERP — Supabase Schema
-- Run this in Supabase SQL Editor (supabase.com → SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── SUPPLIERS ──────────────────────────────────────────────
create table suppliers (
  id          text primary key default ('S' || lpad(floor(random()*9000+1000)::text, 4, '0')),
  name        text not null,
  contact     text,
  phone       text,
  country     text,
  currency    text default 'GBP' check (currency in ('GBP','EUR','USD')),
  lead_days   integer default 30,
  status      text default 'Active' check (status in ('Active','Inactive')),
  notes       text,
  created_at  timestamptz default now()
);

-- ─── PRODUCTS / INVENTORY ───────────────────────────────────
create table products (
  id          text primary key,           -- e.g. TA-COMP-001
  name        text not null,
  category    text,
  warehouse   text,
  cost        numeric(10,2) default 0,
  currency    text default 'GBP',
  -- sizes stored as JSON: {"XS":100,"S":200,"M":300,"L":200,"XL":100,"XXL":50}
  sizes       jsonb default '{"XS":0,"S":0,"M":0,"L":0,"XL":0,"XXL":0}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─── PURCHASE ORDERS ────────────────────────────────────────
create table purchase_orders (
  id                text primary key,     -- e.g. PO-2024-001
  supplier_id       text references suppliers(id),
  supplier_name     text,                 -- denormalised for speed
  warehouse         text,
  currency          text default 'GBP',
  status            text default 'Draft'
                      check (status in ('Draft','Sent','Confirmed','In Production','Shipped','Received','Cancelled')),
  expected_delivery date,
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ─── PO LINES ───────────────────────────────────────────────
create table po_lines (
  id          uuid primary key default uuid_generate_v4(),
  po_id       text references purchase_orders(id) on delete cascade,
  sku         text,
  product     text,
  -- sizes ordered: {"XS":0,"S":0,"M":0,"L":0,"XL":0,"XXL":0}
  sizes       jsonb default '{"XS":0,"S":0,"M":0,"L":0,"XL":0,"XXL":0}',
  unit_cost   numeric(10,2) default 0,
  currency    text default 'GBP',
  created_at  timestamptz default now()
);

-- ─── INDEXES ────────────────────────────────────────────────
create index on purchase_orders(status);
create index on purchase_orders(supplier_id);
create index on purchase_orders(created_at desc);
create index on po_lines(po_id);

-- ─── UPDATED_AT TRIGGER ─────────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_po_updated
  before update on purchase_orders
  for each row execute function set_updated_at();

create trigger trg_products_updated
  before update on products
  for each row execute function set_updated_at();

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────
-- Enable RLS (enable auth later via Supabase Auth)
alter table suppliers       enable row level security;
alter table products        enable row level security;
alter table purchase_orders enable row level security;
alter table po_lines        enable row level security;

-- Temporary open policy (replace with proper auth later)
create policy "allow all" on suppliers       for all using (true);
create policy "allow all" on products        for all using (true);
create policy "allow all" on purchase_orders for all using (true);
create policy "allow all" on po_lines        for all using (true);

-- ─── SEED DATA ───────────────────────────────────────────────
insert into suppliers (id, name, contact, phone, country, currency, lead_days, status) values
  ('S001', 'ProTex Manufacturing',  'james.li@protex.com',      '+86 21 5566 7788', 'China',    'USD', 45, 'Active'),
  ('S002', 'EuroSport Fabrics',     'anna.k@eurosport.de',      '+49 30 1234 5678', 'Germany',  'EUR', 21, 'Active'),
  ('S003', 'Atlas Threads',         'm.hassan@atlasthreads.pk', '+92 21 111 222',   'Pakistan', 'USD', 60, 'Active'),
  ('S004', 'Nordic Performance Co.','erik.l@nordicperf.se',     '+46 8 123 456',    'Sweden',   'EUR', 30, 'Inactive');

insert into products (id, name, category, warehouse, cost, currency, sizes) values
  ('TA-COMP-001','Compression Tights','Bottoms',  'UK - London',    18, 'GBP', '{"XS":120,"S":340,"M":510,"L":290,"XL":180,"XXL":60}'),
  ('TA-PERF-002','Performance Tee',   'Tops',     'UK - London',    12, 'GBP', '{"XS":80,"S":210,"M":430,"L":380,"XL":220,"XXL":90}'),
  ('TA-JACK-003','Training Jacket',   'Outerwear','EU - Amsterdam',  38, 'EUR', '{"XS":40,"S":95,"M":140,"L":110,"XL":75,"XXL":30}'),
  ('TA-SHOT-004','Pro Shorts',        'Bottoms',  'US - New York',   22, 'USD', '{"XS":60,"S":180,"M":270,"L":195,"XL":120,"XXL":45}'),
  ('TA-VEST-005','Training Vest',     'Tops',     'UK - London',    15, 'GBP', '{"XS":30,"S":75,"M":95,"L":70,"XL":50,"XXL":20}');

insert into purchase_orders (id, supplier_id, supplier_name, warehouse, currency, status, expected_delivery, notes) values
  ('PO-2024-001','S001','ProTex Manufacturing','UK - London',   'USD','Received',     '2024-03-15','Spring/Summer 2024 collection run'),
  ('PO-2024-002','S002','EuroSport Fabrics',   'EU - Amsterdam','EUR','Shipped',      '2024-03-25',''),
  ('PO-2024-003','S003','Atlas Threads',       'US - New York', 'USD','In Production','2024-05-01','US market launch'),
  ('PO-2024-004','S001','ProTex Manufacturing','UK - London',   'USD','Confirmed',    '2024-06-10','Autumn/Winter 2024 top-up'),
  ('PO-2024-005','S002','EuroSport Fabrics',   'EU - Amsterdam','EUR','Draft',        '2024-04-20','');

insert into po_lines (po_id, sku, product, sizes, unit_cost, currency) values
  ('PO-2024-001','TA-COMP-001','Compression Tights','{"XS":200,"S":500,"M":700,"L":400,"XL":200,"XXL":100}',22.50,'USD'),
  ('PO-2024-001','TA-PERF-002','Performance Tee',   '{"XS":150,"S":300,"M":500,"L":350,"XL":200,"XXL":80}', 14.00,'USD'),
  ('PO-2024-002','TA-JACK-003','Training Jacket',   '{"XS":100,"S":250,"M":350,"L":250,"XL":150,"XXL":50}', 42.00,'EUR'),
  ('PO-2024-003','TA-SHOT-004','Pro Shorts',        '{"XS":120,"S":300,"M":450,"L":300,"XL":180,"XXL":60}', 26.00,'USD'),
  ('PO-2024-004','TA-VEST-005','Training Vest',     '{"XS":80,"S":200,"M":280,"L":200,"XL":120,"XXL":40}',  17.50,'USD'),
  ('PO-2024-004','TA-COMP-001','Compression Tights','{"XS":100,"S":300,"M":400,"L":250,"XL":150,"XXL":50}', 22.50,'USD'),
  ('PO-2024-005','TA-JACK-003','Training Jacket',   '{"XS":50,"S":150,"M":200,"L":150,"XL":80,"XXL":30}',   42.00,'EUR');
