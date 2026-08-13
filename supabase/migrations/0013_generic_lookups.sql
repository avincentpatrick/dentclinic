-- 0013: lookup_categories + lookup_values -- the generic clinic vocabularies (2.2b)
--
-- FOUR CATEGORIES, NOT FIVE. PLAN.md:68 lists "services, products, fees, cancel
-- reasons, payment methods". `services` is omitted deliberately and with the
-- owner's agreement: a service a patient books IS an appointment_type (0012) --
-- chair time with a duration, buffers, a colour and a bookable flag. A second
-- list called "services" would carry a name and nothing else, and the two would
-- drift the first time a clinic renamed one of them. Anything priced but not
-- booked -- a whitening kit, a fluoride varnish added to an invoice -- is a
-- `fee` or a `product` line, which is what those categories are for. Recorded
-- as a deviation in docs/modules/02-clinic-settings.md, in the same register as
-- 0005's deliberate deviation from PLAN's unique(email, dob).
--
-- CATEGORIES ARE SEED-ONLY, STRUCTURALLY rather than by convention: there is no
-- INSERT grant and no INSERT policy on lookup_categories, and a BEFORE UPDATE
-- trigger pins `key`, `value_kind` and `deleted_at`. The application reads
-- values BY CATEGORY KEY (Phase 4.2's cancellation dialog, Phase 7's payment
-- dialog), so a renamed or archived category is not a configuration choice --
-- it is an empty picker in front of someone trying to cancel an appointment,
-- three phases from here, with no error anywhere to explain it. The clinic may
-- rename the LABEL (white-label), reorder, and edit every value.
--
-- MONEY IS A NUMERIC COLUMN, NEVER THE GENERIC TEXT ONE. `amount numeric(12,2)`
-- exists because a fee stored as text is re-parsed by whoever reads it and
-- Phase 7 multiplies it. `value_kind` says whether an amount is meaningful for
-- a category and lookup_values_guard enforces the pair -- a fee row with a null
-- amount is a silent zero on an invoice.
--
-- WHERE THIS SHAPE RUNS OUT, flagged rather than solved: a real fee schedule
-- needs effective dates, a code system, and often per-tooth or per-surface
-- variation. This table has one amount and no history. It survives v1 ONLY
-- because invoice_items.unit_fee is a COPIED value (PLAN.md:62), so re-pricing
-- never rewrites an issued invoice -- the same denormalisation argument as
-- appointment durations in 0012. When Phase 7 needs more, `fee` graduates to
-- its own table and this category is retired. Do NOT grow lookup_values
-- sideways to meet it. See docs/modules/11-billing.md.
--
-- NO is_active COLUMN, on either table. deleted_at IS "no longer offered" --
-- the same reasoning 0005 gives for providers and 03-patients.md records:
-- "two overlapping liveness concepts on one table is how a scheduler starts
-- booking ghosts."
-- ---------------------------------------------------------------------------

create type public.lookup_value_kind as enum ('label', 'money');

create table public.lookup_categories (
  id          uuid primary key default gen_random_uuid(),
  key         text not null,   -- STABLE. The code queries this; the UI never shows it.
  label       text not null,   -- what the admin screen and every picker show; clinic-editable
  description text,            -- one sentence of help on the admin screen
  value_kind  public.lookup_value_kind not null default 'label',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid,
  -- Also the URL slug source (/admin/lookups/<key with _ replaced by ->), so it
  -- must stay free of anything needing escaping.
  constraint lookup_categories_key_shape check (key ~ '^[a-z][a-z0-9_]{1,40}$')
);

comment on table public.lookup_categories is
  'Fixed system vocabulary. Seed-only: no INSERT grant and no INSERT policy, and '
  'lookup_categories_guard pins key, value_kind and deleted_at -- the application reads values '
  'by category key, so an archived or re-keyed category is an empty picker, not a setting. '
  'See docs/modules/02-clinic-settings.md.';

create unique index lookup_categories_key_key
  on public.lookup_categories (key)
  where deleted_at is null;

create index lookup_categories_sort_idx
  on public.lookup_categories (sort_order, label)
  where deleted_at is null;

create table public.lookup_values (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.lookup_categories (id),

  -- Optional STABLE machine key, present on every seeded row. A clinic renaming
  -- "GCash" to "G-Cash" must not split a year of payment totals across two
  -- report rows, and Phase 6's procedures.code joins against it.
  code        text,
  label       text not null,
  -- Money categories only; enforced against value_kind by lookup_values_guard.
  amount      numeric(12,2),
  sort_order  integer not null default 0,

  -- The CODE depends on this row existing: Phase 4.2 derives the no-show metric
  -- from a specific cancel reason (PLAN.md:49 -- "no_show = broken + reason
  -- code"), and every picker needs an "Other". Renaming stays allowed;
  -- archiving does not.
  is_system   boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid,

  constraint lookup_values_amount_sane check (amount is null or amount >= 0),
  -- Same-row, so a CHECK rather than a trigger. A 23514 the server action maps
  -- to a readable sentence is a better failure than an archive that half-worked.
  constraint lookup_values_system_not_archivable check (deleted_at is null or not is_system),
  constraint lookup_values_code_shape check (code is null or code ~ '^[A-Za-z0-9_.-]{1,40}$')
);

comment on table public.lookup_values is
  'Clinic-editable values under a fixed category. amount is a numeric column, never the generic '
  'text one -- Phase 7 multiplies it. Rows with is_system are read by name somewhere in the code '
  'and can be renamed but not archived. See docs/modules/02-clinic-settings.md.';

-- Mirrors providers_profile_key's shape: partial on both the nullability and
-- the soft-delete predicate.
create unique index lookup_values_code_key
  on public.lookup_values (category_id, code)
  where code is not null and deleted_at is null;

-- Two live "Cash" rows in one dropdown is an unusable picker.
create unique index lookup_values_label_key
  on public.lookup_values (category_id, lower(label))
  where deleted_at is null;

create index lookup_values_category_idx
  on public.lookup_values (category_id, sort_order, label)
  where deleted_at is null;

create trigger lookup_categories_updated_at
  before update on public.lookup_categories
  for each row execute function public.set_updated_at();

create trigger lookup_categories_audit
  after insert or update or delete on public.lookup_categories
  for each row execute function private.audit_row();

create trigger lookup_values_updated_at
  before update on public.lookup_values
  for each row execute function public.set_updated_at();

create trigger lookup_values_audit
  after insert or update or delete on public.lookup_values
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Column guards.
--
-- 0002 left a note that profiles.role/is_active would need one of these. Same
-- reasoning here: a superadmin holds a direct UPDATE grant, so "the server
-- action's allow-list" stops the app and nothing else. The cost of a
-- hand-crafted PostgREST call is not an audit gap -- it is a picker that
-- renders empty three phases later, with no error anywhere to explain it.
--
-- In `private` like audit_row() and handle_new_user(): 0001 already revoked the
-- schema from public, anon and authenticated, so no per-function revoke line is
-- needed.
-- ---------------------------------------------------------------------------
create or replace function private.lookup_categories_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.key is distinct from old.key then
    raise exception 'category_key_immutable' using errcode = '42501';
  end if;
  if new.value_kind is distinct from old.value_kind then
    raise exception 'category_kind_immutable' using errcode = '42501';
  end if;
  if new.deleted_at is not null then
    raise exception 'category_not_archivable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger lookup_categories_guard
  before update on public.lookup_categories
  for each row execute function private.lookup_categories_guard();

create or replace function private.lookup_values_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.lookup_value_kind;
begin
  select c.value_kind into v_kind
  from public.lookup_categories c
  where c.id = new.category_id;

  if v_kind is null then
    raise exception 'unknown_category' using errcode = '23503';
  end if;
  if v_kind = 'money' and new.amount is null then
    raise exception 'amount_required' using errcode = '22023';
  end if;
  if v_kind = 'label' and new.amount is not null then
    raise exception 'amount_not_allowed' using errcode = '22023';
  end if;

  if TG_OP = 'UPDATE' then
    -- Moving a value between categories would change what it means without
    -- changing what it says.
    if new.category_id is distinct from old.category_id then
      raise exception 'category_immutable' using errcode = '42501';
    end if;
    if old.is_system and new.code is distinct from old.code then
      raise exception 'system_code_immutable' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger lookup_values_guard
  before insert or update on public.lookup_values
  for each row execute function private.lookup_values_guard();

-- ---------------------------------------------------------------------------
-- RLS
--
-- Everyone signed in reads both: a patient sees a payment method on their own
-- invoice (Phase 7) and a cancellation reason on their own cancelled
-- appointment (Phase 4.2). There is nothing confidential in a clinic's reason
-- codes or its price list -- a price list is on the clinic's website -- so the
-- role split appointment_types needs is not warranted here.
--
-- lookup_categories has NO archived-read policy because archiving one is
-- impossible (lookup_categories_guard), and NO insert policy or grant because
-- categories are seeded.
-- ---------------------------------------------------------------------------
alter table public.lookup_categories enable row level security;

create policy "everyone signed in reads lookup categories"
  on public.lookup_categories for select
  using (deleted_at is null);

create policy "superadmin updates lookup categories"
  on public.lookup_categories for update
  using (public.jwt_role() = 'superadmin')
  with check (public.jwt_role() = 'superadmin');

revoke all            on public.lookup_categories from anon;
revoke insert, delete on public.lookup_categories from authenticated;
grant  select, update on public.lookup_categories to authenticated;

alter table public.lookup_values enable row level security;

create policy "everyone signed in reads lookup values"
  on public.lookup_values for select
  using (deleted_at is null);

create policy "superadmin reads archived lookup values (Archive view)"
  on public.lookup_values for select
  using (public.jwt_role() = 'superadmin' and deleted_at is not null);

create policy "superadmin writes lookup values"
  on public.lookup_values for insert
  with check (public.jwt_role() = 'superadmin');

create policy "superadmin updates lookup values"
  on public.lookup_values for update
  using (public.jwt_role() = 'superadmin')
  with check (public.jwt_role() = 'superadmin');

revoke all    on public.lookup_values from anon;
revoke delete on public.lookup_values from authenticated;
grant  select, insert, update on public.lookup_values to authenticated;

-- ---------------------------------------------------------------------------
-- Seeds -- PLAN.md:82
-- ---------------------------------------------------------------------------
insert into public.lookup_categories (key, label, description, value_kind, sort_order) values
  ('cancel_reason',  'Cancellation reasons',
   'Why an appointment was cancelled or broken. Chosen by staff at cancellation and used for the no-show rate.',
   'label', 10),
  ('payment_method', 'Payment methods',
   'How the clinic accepts payment. Offered on the payment dialog from Phase 7.',
   'label', 20),
  ('fee',            'Fees',
   'Standard price per procedure. Copied onto an invoice line when it is added, so changing a price never rewrites an issued invoice.',
   'money', 30),
  ('product',        'Products',
   'Retail items sold at the counter, priced as invoice lines.',
   'money', 40);

insert into public.lookup_values (category_id, code, label, sort_order, is_system)
select c.id, v.code, v.label, v.sort_order, v.is_system
from public.lookup_categories c,
     (values
        ('no_show',              'Did not attend',            10, true),
        ('patient_illness',      'Patient unwell',            20, false),
        ('patient_schedule',     'Patient schedule conflict', 30, false),
        ('patient_cost',         'Cost concern',              40, false),
        ('provider_unavailable', 'Provider unavailable',      50, false),
        ('clinic_emergency',     'Clinic emergency',          60, false),
        ('weather',              'Weather or transport',      70, false),
        ('other',                'Other',                     80, true)
     ) as v(code, label, sort_order, is_system)
where c.key = 'cancel_reason';

-- PLAN.md:82 names exactly these three. Anything else is the clinic's to add.
insert into public.lookup_values (category_id, code, label, sort_order)
select c.id, v.code, v.label, v.sort_order
from public.lookup_categories c,
     (values
        ('cash',  'Cash',  10),
        ('gcash', 'GCash', 20),
        ('card',  'Card',  30)
     ) as v(code, label, sort_order)
where c.key = 'payment_method';

-- STARTER PRICES, not a fee schedule. Every amount is a placeholder the clinic
-- must set before Phase 7 issues an invoice, and the admin screen says so on
-- screen. Codes are stable and are what Phase 6's procedures.code will match.
insert into public.lookup_values (category_id, code, label, amount, sort_order)
select c.id, v.code, v.label, v.amount, v.sort_order
from public.lookup_categories c,
     (values
        ('PROPHY_ADULT',      'Adult prophylaxis (cleaning)',      1500.00, 10),
        ('PROPHY_CHILD',      'Child prophylaxis',                 1000.00, 20),
        ('EXAM_NEW',          'New patient exam',                   800.00, 30),
        ('CONSULT',           'Consultation',                       500.00, 40),
        ('FILL_COMPOSITE_1S', 'Composite filling, one surface',    1800.00, 50),
        ('EXT_SIMPLE',        'Simple extraction',                 2000.00, 60),
        ('RCT_MOLAR',         'Root canal, molar',                12000.00, 70),
        ('CROWN_PFM',         'Crown, porcelain fused to metal',  15000.00, 80)
     ) as v(code, label, amount, sort_order)
where c.key = 'fee';

-- `product` is seeded with NO values on purpose: a retail catalogue is the
-- clinic's own, and a first-use EmptyState asking for the first one is better
-- than two invented rows they have to work out how to delete.

-- An amount with no currency is not money. One clinic per install, so this is a
-- setting rather than a column. `on conflict do nothing` so the seed order
-- against 2.2a's settings work never matters.
insert into private.settings (key, value)
values ('currency', to_jsonb('PHP'::text))
on conflict (key) do nothing;
