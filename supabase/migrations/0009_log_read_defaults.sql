-- 0009: log_read -- default the two id parameters to null
--
-- 0002 declared log_read(p_entity, p_entity_id, p_patient_id) with no defaults,
-- which was fine while it had no callers. Phase 2.1c gives it two shapes:
--
--   log_read('patients', <id>, <id>)   a chart was opened
--   log_read('patients')               the roster was listed
--
-- A list read is a real audit event -- "who pulled up the roster, and when" is
-- exactly the question this table exists to answer -- but it has no single row
-- to point at, so both ids are null. audit_log.entity_id and .patient_id are
-- already nullable; only the function signature refused to say so.
--
-- This also unblocks the generated types. `supabase gen types` renders a
-- parameter with no default as a REQUIRED, non-nullable string, so the roster
-- call could only type-check behind a cast. With defaults it renders as
-- optional, and the call site stays honest with no `as never` in it.
--
-- The argument TYPES are unchanged, so this is the same function identity:
-- create or replace keeps the existing grant to authenticated, and the
-- revoke/grant pair below simply restates it.

create or replace function public.log_read(
  p_entity     text,
  p_entity_id  uuid default null,
  p_patient_id uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.audit_log (actor_id, actor_role, action, entity, entity_id, patient_id)
  values (auth.uid(), public.jwt_role(), 'read', p_entity, p_entity_id, p_patient_id);
$$;

revoke execute on function public.log_read(text, uuid, uuid) from public, anon;
grant  execute on function public.log_read(text, uuid, uuid) to authenticated;
