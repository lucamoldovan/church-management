-- =====================================================================
-- PHASE 1 — Payment Options (online vs cash "pay at event")
-- Run in Supabase SQL Editor. Idempotent / safe to re-run.
-- Matches LIVE schema: registrations(event_packages, events.price/date/time/department).
-- =====================================================================

-- payment_method: 'online' (Stripe / future providers) | 'cash' (pay at event)
alter table public.registrations add column if not exists payment_method text default 'online';

-- amount collected so far (supports partial payments in the future)
alter table public.registrations add column if not exists amount_paid numeric(10,2) default 0;

-- when & who collected the payment (cash collected by staff at check-in)
alter table public.registrations add column if not exists paid_at timestamptz;
alter table public.registrations add column if not exists paid_by uuid references public.profiles(id) on delete set null;

-- payment_status semantics now: 'unpaid' | 'pending' | 'paid' | 'partial'
--   unpaid  = online intended, not completed
--   pending = cash, awaiting collection at the event
--   paid    = fully paid
--   partial = partially paid (future)

-- Backfill: existing paid rows get amount_paid = package_price
update public.registrations
  set amount_paid = package_price
  where payment_status = 'paid' and (amount_paid is null or amount_paid = 0);
