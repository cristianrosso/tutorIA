begin;

-- Sprint 17: Panel administrativo integral.
-- Migración no destructiva: conserva perfiles, accesos y resultados existentes.

create table if not exists public.student_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('pending','active','expired','suspended','cancelled')),
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  duration_days integer not null default 30 check (duration_days between 1 and 365),
  source text not null default 'admin_panel' check (source in ('admin_panel','import','migration','renewal','manual')),
  activated_by uuid references public.profiles(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > activated_at)
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists student_licenses_user_status_idx on public.student_licenses(user_id, status, expires_at desc);
create index if not exists student_licenses_expiry_idx on public.student_licenses(status, expires_at);
create index if not exists admin_audit_actor_time_idx on public.admin_audit_logs(actor_user_id, created_at desc);
create index if not exists admin_audit_resource_idx on public.admin_audit_logs(resource_type, resource_id, created_at desc);


drop trigger if exists student_licenses_updated on public.student_licenses;
create trigger student_licenses_updated before update on public.student_licenses
  for each row execute function public.touch_updated_at();

do $$ declare t text; begin
  foreach t in array array['student_licenses','admin_audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists student_licenses_read on public.student_licenses;
create policy student_licenses_read on public.student_licenses for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists admin_audit_logs_read on public.admin_audit_logs;
create policy admin_audit_logs_read on public.admin_audit_logs for select to authenticated
  using ((select public.is_admin()));

commit;

