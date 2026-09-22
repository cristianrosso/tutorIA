begin;

-- Sprint 13: Modo Clase y aprendizaje guiado inteligente.
-- Migración no destructiva: no modifica licencias ni pagos históricos.

create table if not exists public.economic_settings (
  id text primary key default 'default',
  license_duration_days integer not null default 30 check (license_duration_days between 1 and 365),
  monthly_student_budget_bob numeric(12,2) not null default 40 check (monthly_student_budget_bob > 0),
  expected_students integer not null default 400 check (expected_students > 0),
  usd_to_bob_rate numeric(12,4) not null default 6.96 check (usd_to_bob_rate > 0),
  infrastructure_monthly_bob numeric(12,2) not null default 0 check (infrastructure_monthly_bob >= 0),
  voice_enabled boolean not null default true,
  voice_monthly_budget_bob numeric(12,2) not null default 10 check (voice_monthly_budget_bob >= 0),
  alert_thresholds numeric[] not null default array[50,75,90,100]::numeric[],
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.economic_settings(id)
values ('default')
on conflict (id) do nothing;

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_operation_type_check;
alter table public.ai_usage_events
  add constraint ai_usage_events_operation_type_check
  check (operation_type in (
    'tutor_chat','embedding','evaluation','simulation','stt','tts','guided_class','guided_class_feedback','other'
  ));

create table if not exists public.guided_class_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  unit_id uuid references public.academic_units(id) on delete set null,
  topic_id uuid references public.academic_topics(id) on delete set null,
  unit_number integer not null check (unit_number between 1 and 15),
  topic_label text,
  class_mode text not null check (class_mode in ('topic','unit','reinforcement')),
  pedagogical_mode text not null check (pedagogical_mode in ('simple','academic','deep','review')),
  interaction_mode text not null check (interaction_mode in ('text','voice','mixed')),
  status text not null default 'ready' check (status in ('draft','ready','in_progress','awaiting_student_answer','feedback','paused','completed','cancelled','error')),
  current_step integer not null default 0 check (current_step >= 0),
  estimated_duration_minutes integer not null default 30 check (estimated_duration_minutes in (15,30,45,60)),
  objectives text[] not null default '{}',
  source_summary jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guided_class_steps (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references public.guided_class_sessions(id) on delete cascade,
  knowledge_object_id text references public.knowledge_objects(id) on delete set null,
  step_order integer not null check (step_order > 0),
  step_type text not null check (step_type in ('introduction','objective','explanation','example','check_question','feedback','summary')),
  title text not null,
  content text not null,
  check_question text,
  expected_answer text,
  source_references jsonb not null default '[]'::jsonb,
  status text not null default 'ready' check (status in ('ready','shown','awaiting_answer','answered','completed','skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_session_id, step_order)
);

create table if not exists public.guided_class_interactions (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references public.guided_class_sessions(id) on delete cascade,
  step_id uuid references public.guided_class_steps(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  interaction_type text not null check (interaction_type in ('student_question','student_answer','tutor_feedback','pause','resume','complete')),
  input_mode text not null default 'text' check (input_mode in ('text','voice')),
  student_message text,
  tutor_response text,
  assessment_reference jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.guided_class_progress (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null unique references public.guided_class_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  completed_steps integer not null default 0 check (completed_steps >= 0),
  total_steps integer not null default 0 check (total_steps >= 0),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guided_class_sessions_user_status_idx on public.guided_class_sessions(user_id, status, updated_at desc);
create index if not exists guided_class_sessions_unit_idx on public.guided_class_sessions(unit_number, topic_id, created_at desc);
create index if not exists guided_class_steps_session_idx on public.guided_class_steps(class_session_id, step_order);
create index if not exists guided_class_interactions_session_idx on public.guided_class_interactions(class_session_id, created_at desc);
create index if not exists guided_class_progress_user_idx on public.guided_class_progress(user_id, last_activity_at desc);

create trigger economic_settings_updated before update on public.economic_settings
  for each row execute function public.touch_updated_at();
create trigger guided_class_sessions_updated before update on public.guided_class_sessions
  for each row execute function public.touch_updated_at();
create trigger guided_class_steps_updated before update on public.guided_class_steps
  for each row execute function public.touch_updated_at();
create trigger guided_class_progress_updated before update on public.guided_class_progress
  for each row execute function public.touch_updated_at();

do $$ declare t text; begin
  foreach t in array array['economic_settings','guided_class_sessions','guided_class_steps','guided_class_interactions','guided_class_progress'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists economic_settings_read on public.economic_settings;
create policy economic_settings_read on public.economic_settings for select to authenticated
  using ((select public.is_admin()));

drop policy if exists guided_class_sessions_read on public.guided_class_sessions;
create policy guided_class_sessions_read on public.guided_class_sessions for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists guided_class_steps_read on public.guided_class_steps;
create policy guided_class_steps_read on public.guided_class_steps for select to authenticated
  using ((select public.is_admin()) or exists(select 1 from public.guided_class_sessions s where s.id = class_session_id and s.user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists guided_class_interactions_read on public.guided_class_interactions;
create policy guided_class_interactions_read on public.guided_class_interactions for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists guided_class_progress_read on public.guided_class_progress;
create policy guided_class_progress_read on public.guided_class_progress for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

commit;