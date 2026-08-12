-- 0003: audit_row() wrote lower(TG_OP) = 'insert', violating the
-- audit_log_action_check constraint ('create'). Map TG_OP explicitly.

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.audit_log (actor_id, actor_role, action, entity, entity_id, before, after)
  values (
    auth.uid(),
    public.jwt_role(),
    case TG_OP when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;
