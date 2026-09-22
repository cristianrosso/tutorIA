begin;

create table if not exists public.student_academic_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  preferred_learning_mode text check (preferred_learning_mode is null or preferred_learning_mode in ('normal','quick','explain','example','review')),
  current_unit_id uuid references public.academic_units(id) on delete set null,
  current_topic_id uuid references public.academic_topics(id) on delete set null,
  last_studied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id text unique,
  event_type text not null check (event_type in (
    'topic_viewed','topic_studied','explanation_requested','example_requested','review_requested',
    'practice_question_answered','study_session_started','study_session_completed'
  )),
  knowledge_object_id text references public.knowledge_objects(id) on delete set null,
  unit_id uuid references public.academic_units(id) on delete set null,
  topic_id uuid references public.academic_topics(id) on delete set null,
  conversation_id uuid references public.tutor_conversations(id) on delete set null,
  message_id uuid references public.tutor_messages(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.student_topic_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  knowledge_object_id text references public.knowledge_objects(id) on delete cascade,
  unit_id uuid references public.academic_units(id) on delete set null,
  topic_id uuid references public.academic_topics(id) on delete set null,
  status text not null default 'in_progress' check (status in ('not_started','in_progress','review_needed','completed')),
  first_studied_at timestamptz not null default now(),
  last_studied_at timestamptz not null default now(),
  study_sessions_count integer not null default 0 check (study_sessions_count >= 0),
  practice_attempts integer not null default 0 check (practice_attempts >= 0),
  correct_answers integer not null default 0 check (correct_answers >= 0),
  incorrect_answers integer not null default 0 check (incorrect_answers >= 0),
  mastery_level numeric(5,2) check (mastery_level is null or (mastery_level >= 0 and mastery_level <= 100)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, knowledge_object_id)
);

create table if not exists public.student_learning_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  knowledge_object_id text references public.knowledge_objects(id) on delete set null,
  question_id uuid,
  conversation_id uuid references public.tutor_conversations(id) on delete set null,
  message_id uuid references public.tutor_messages(id) on delete set null,
  evidence_type text not null check (evidence_type in ('formative_check','simulation','practice','self_check')),
  result text not null check (result in ('correct','incorrect','partial','unknown')),
  score numeric(8,2) check (score is null or score >= 0),
  max_score numeric(8,2) check (max_score is null or max_score > 0),
  feedback text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id text not null unique,
  conversation_id uuid references public.tutor_conversations(id) on delete set null,
  operation_type text not null check (operation_type in ('tutor_chat','embedding','evaluation','simulation','stt','tts','other')),
  model_used text not null,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  other_billable_units jsonb not null default '{}'::jsonb,
  estimated_cost_usd numeric(16,8) not null default 0 check (estimated_cost_usd >= 0),
  cost_is_estimated boolean not null default true,
  pricing_version text not null default '2026-09-config',
  accounting_usd_to_bob numeric(12,4),
  estimated_cost_bob numeric(16,6),
  created_at timestamptz not null default now()
);

create table if not exists public.usage_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  alert_type text not null check (alert_type in ('high_daily_cost','high_period_cost','excessive_frequency','automation_suspected')),
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists academic_profiles_user_idx on public.student_academic_profiles(user_id);
create index if not exists learning_events_user_time_idx on public.student_learning_events(user_id, created_at desc);
create index if not exists learning_events_topic_idx on public.student_learning_events(topic_id, created_at desc);
create index if not exists topic_progress_user_unit_idx on public.student_topic_progress(user_id, unit_id, last_studied_at desc);
create index if not exists topic_progress_review_idx on public.student_topic_progress(user_id, status, last_studied_at desc);
create index if not exists learning_evidence_user_time_idx on public.student_learning_evidence(user_id, created_at desc);
create index if not exists ai_usage_user_time_idx on public.ai_usage_events(user_id, created_at desc);
create index if not exists ai_usage_operation_type_idx on public.ai_usage_events(operation_type, created_at desc);
create index if not exists usage_alerts_user_time_idx on public.usage_alerts(user_id, created_at desc);

create trigger student_academic_profiles_updated before update on public.student_academic_profiles
  for each row execute function public.touch_updated_at();
create trigger student_topic_progress_updated before update on public.student_topic_progress
  for each row execute function public.touch_updated_at();

do $$ declare t text; begin
  foreach t in array array[
    'student_academic_profiles','student_learning_events','student_topic_progress',
    'student_learning_evidence','ai_usage_events','usage_alerts'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

create policy academic_profiles_read on public.student_academic_profiles for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));
create policy learning_events_read on public.student_learning_events for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));
create policy topic_progress_read on public.student_topic_progress for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));
create policy learning_evidence_read on public.student_learning_evidence for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));
create policy ai_usage_read on public.ai_usage_events for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));
create policy usage_alerts_read on public.usage_alerts for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

commit;
