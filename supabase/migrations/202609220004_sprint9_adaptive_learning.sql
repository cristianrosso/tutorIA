begin;

create table if not exists public.student_mastery_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  knowledge_object_id text references public.knowledge_objects(id) on delete set null,
  topic_id uuid references public.academic_topics(id) on delete set null,
  unit_id uuid references public.academic_units(id) on delete set null,
  mastery_score numeric(5,2) not null default 0 check (mastery_score >= 0 and mastery_score <= 100),
  mastery_level text not null check (mastery_level in ('INSUFFICIENT_EVIDENCE','INITIAL','DEVELOPING','CONSOLIDATED')),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  correct_answers integer not null default 0 check (correct_answers >= 0),
  partial_answers integer not null default 0 check (partial_answers >= 0),
  incorrect_answers integer not null default 0 check (incorrect_answers >= 0),
  last_assessed_at timestamptz,
  calculation_version text not null default 'adaptive-v1.0',
  evidence_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists student_mastery_unique_scope_idx on public.student_mastery_estimates(
  user_id,
  coalesce(knowledge_object_id, ''),
  coalesce(topic_id::text, ''),
  coalesce(unit_id::text, '')
);

create table if not exists public.adaptive_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  knowledge_object_id text references public.knowledge_objects(id) on delete set null,
  topic_id uuid references public.academic_topics(id) on delete set null,
  unit_id uuid references public.academic_units(id) on delete set null,
  recommendation_type text not null check (recommendation_type in ('REVIEW_TOPIC','PRACTICE_TOPIC','REVIEW_PREREQUISITE','CONTINUE_TOPIC','START_NEW_TOPIC','RETRY_ASSESSMENT')),
  priority integer not null default 0 check (priority >= 0 and priority <= 100),
  reason_code text not null check (reason_code in ('INSUFFICIENT_EVIDENCE','ISOLATED_ERROR','OBSERVED_DIFFICULTY','RECURRENT_DIFFICULTY','CONTINUE_RECENT_TOPIC','START_NEW_TOPIC','ADVANCE_DIFFICULTY')),
  recommended_difficulty text check (recommended_difficulty is null or recommended_difficulty in ('basic','intermediate','advanced')),
  reason text not null,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','accepted','in_progress','completed','postponed','dismissed','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.adaptive_learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recommendation_id uuid references public.adaptive_recommendations(id) on delete set null,
  knowledge_object_id text references public.knowledge_objects(id) on delete set null,
  topic_id uuid references public.academic_topics(id) on delete set null,
  unit_id uuid references public.academic_units(id) on delete set null,
  event_type text not null check (event_type in ('recommendation_generated','recommendation_accepted','recommendation_postponed','recommendation_dismissed','recommendation_completed','mastery_recalculated')),
  previous_mastery numeric(5,2) check (previous_mastery is null or (previous_mastery >= 0 and previous_mastery <= 100)),
  updated_mastery numeric(5,2) check (updated_mastery is null or (updated_mastery >= 0 and updated_mastery <= 100)),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists student_mastery_user_idx on public.student_mastery_estimates(user_id, mastery_level, updated_at desc);
create index if not exists adaptive_recommendations_user_status_idx on public.adaptive_recommendations(user_id, status, priority desc, created_at desc);
create index if not exists adaptive_recommendations_knowledge_idx on public.adaptive_recommendations(user_id, knowledge_object_id, recommendation_type, status);
create index if not exists adaptive_learning_events_user_time_idx on public.adaptive_learning_events(user_id, created_at desc);

create trigger student_mastery_estimates_updated before update on public.student_mastery_estimates
  for each row execute function public.touch_updated_at();
create trigger adaptive_recommendations_updated before update on public.adaptive_recommendations
  for each row execute function public.touch_updated_at();

do $$ declare t text; begin
  foreach t in array array['student_mastery_estimates','adaptive_recommendations','adaptive_learning_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists student_mastery_estimates_read on public.student_mastery_estimates;
create policy student_mastery_estimates_read on public.student_mastery_estimates for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists adaptive_recommendations_read on public.adaptive_recommendations;
create policy adaptive_recommendations_read on public.adaptive_recommendations for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists adaptive_learning_events_read on public.adaptive_learning_events;
create policy adaptive_learning_events_read on public.adaptive_learning_events for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

commit;
