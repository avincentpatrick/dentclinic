-- 0006: widen the patients_dob_sane bound by one day (timezone correctness)
--
-- 0005 shipped `dob <= current_date`. current_date on the server is UTC, but the
-- clinic runs in Asia/Manila (UTC+8), so between 16:00 and 23:59 UTC the clinic's
-- calendar date is already tomorrow by server reckoning. Recording a date of
-- birth of "today" during that window -- eight hours of every working day, since
-- Manila office hours sit almost entirely inside it -- would fail the check with
-- an unexplainable error at the front desk.
--
-- +1 day keeps the constraint doing its actual job (rejecting a mistyped 2099)
-- while making it timezone-agnostic. Same 0003 precedent: a constraint that is
-- wrong in production gets its own migration rather than an edit to the applied
-- file, so `supabase/migrations` stays a truthful log of what the database was
-- told, in order.
--
-- The predicate stays monotonic in the safe direction (a row valid at insert can
-- never become invalid as time passes), so `pg_dump` -> restore, which
-- revalidates CHECK constraints, is unaffected. That matters: it is the disaster
-- runbook in docs/modules/17-ops.md.

alter table public.patients drop constraint patients_dob_sane;

alter table public.patients add constraint patients_dob_sane
  check (dob is null or (dob > date '1900-01-01' and dob <= current_date + 1));
