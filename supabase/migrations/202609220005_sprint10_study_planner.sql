begin;

create table if not exists public.student_study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  exam_date date not null,
  start_date date not null,
  timezone text not null default 'America/La_Paz',
  status text not null default 'draft' check (status in ('draft','active','paused','completed','cancelled','expired')),
  configuration jsonb not null default '{}'::jsonb,
  selected_unit_ids uuid[] not null default '{}',
  selected_topic_ids uuid[] not null default '{}',
  total_available_minutes integer not null default 0 check (total_available_minutes >= 0),
  total_planned_minutes integer not null default 0 check (total_planned_minutes >= 0),
  insufficiency_warning text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (exam_date >= start_date)
);

create table if not exists public.student_study_availability (
  id uuid primary key default gen_random_uuid(),
  study_plan_id uuid not null references public.student_study_plans(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  available_minutes integer not null default 0 check (available_minutes >= 0 and available_minutes <= 720),
  preferred_start_time time,
  created_at timestamptz not null default now(),
  unique(study_plan_id, day_of_week)
);

create table if not exists public.student_study_activities (
  id uuid primary key default gen_random_uuid(),
  study_plan_id uuid not null references public.student_study_plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  knowledge_object_id text references public.knowledge_objects(id) on delete set null,
  unit_id uuid references public.academic_units(id) on delete set null,
  topic_id uuid references public.academic_topics(id) on delete set null,
  activity_type text not null check (activity_type in ('STUDY_TOPIC','REVIEW_TOPIC','PRACTICE_QUESTIONS','FORMATIVE_ASSESSMENT','EXAM_SIMULATION','REVIEW_MISTAKES')),
  title text not null,
  scheduled_date date not null,
  estimated_minutes integer not null check (estimated_minutes > 0),
  actual_minutes integer check (actual_minutes is null or actual_minutes >= 0),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','postponed','skipped','cancelled')),
  priority integer not null default 50 check (priority >= 0 and priority <= 100),
  source_recommendation_id uuid references public.adaptive_recommendations(id) on delete set null,
  action_path text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'completed' or completed_at is not null)
);

create table if not exists public.student_study_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  study_plan_id uuid not null references public.student_study_plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  change_reason text not null,
  previous_configuration jsonb not null default '{}'::jsonb,
  updated_configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(study_plan_id, revision_number)
);

create index if not exists student_study_plans_user_status_idx on public.student_study_plans(user_id, status, updated_at desc);
create index if not exists student_study_activities_plan_date_idx on public.student_study_activities(study_plan_id, scheduled_date, status);
create index if not exists student_study_activities_user_date_idx on public.student_study_activities(user_id, scheduled_date, status);
create index if not exists student_study_revisions_plan_idx on public.student_study_plan_revisions(study_plan_id, revision_number desc);

create trigger student_study_plans_updated before update on public.student_study_plans
  for each row execute function public.touch_updated_at();
create trigger student_study_activities_updated before update on public.student_study_activities
  for each row execute function public.touch_updated_at();

do $$ declare t text; begin
  foreach t in array array['student_study_plans','student_study_availability','student_study_activities','student_study_plan_revisions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists student_study_plans_read on public.student_study_plans;
create policy student_study_plans_read on public.student_study_plans for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists student_study_availability_read on public.student_study_availability;
create policy student_study_availability_read on public.student_study_availability for select to authenticated
  using ((select public.is_admin()) or exists(select 1 from public.student_study_plans p where p.id = study_plan_id and p.user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists student_study_activities_read on public.student_study_activities;
create policy student_study_activities_read on public.student_study_activities for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists student_study_plan_revisions_read on public.student_study_plan_revisions;
create policy student_study_plan_revisions_read on public.student_study_plan_revisions for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

commit;
