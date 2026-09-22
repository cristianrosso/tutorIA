begin;

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  knowledge_object_id text references public.knowledge_objects(id) on delete set null,
  unit_id uuid references public.academic_units(id) on delete set null,
  topic_id uuid references public.academic_topics(id) on delete set null,
  question_type text not null check (question_type in ('multiple_choice','true_false','short_answer','open_answer','case_application')),
  question_text text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb,
  expected_answer text,
  rubric jsonb not null default '[]'::jsonb,
  explanation text not null,
  difficulty text not null check (difficulty in ('basic','intermediate','advanced')),
  source_references jsonb not null default '[]'::jsonb,
  validation_status text not null default 'validated' check (validation_status in ('validated','requires_review','rejected')),
  source_hash text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  unit_id uuid references public.academic_units(id) on delete set null,
  topic_id uuid references public.academic_topics(id) on delete set null,
  assessment_type text not null default 'formative',
  status text not null default 'created' check (status in ('created','in_progress','completed','abandoned')),
  question_type text not null default 'mixed',
  difficulty text not null default 'basic' check (difficulty in ('basic','intermediate','advanced')),
  total_questions integer not null default 0 check (total_questions >= 0),
  answered_questions integer not null default 0 check (answered_questions >= 0),
  correct_answers integer not null default 0 check (correct_answers >= 0),
  partial_answers integer not null default 0 check (partial_answers >= 0),
  incorrect_answers integer not null default 0 check (incorrect_answers >= 0),
  total_score numeric(8,2) not null default 0 check (total_score >= 0),
  max_score numeric(8,2) not null default 0 check (max_score >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_session_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_session_id uuid not null references public.assessment_sessions(id) on delete cascade,
  question_id uuid not null references public.assessment_questions(id) on delete restrict,
  question_order integer not null check (question_order > 0),
  question_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(assessment_session_id, question_id),
  unique(assessment_session_id, question_order)
);

create table if not exists public.assessment_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_session_id uuid not null references public.assessment_sessions(id) on delete cascade,
  question_id uuid not null references public.assessment_questions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  student_answer jsonb not null,
  result text not null check (result in ('correct','partially_correct','incorrect','requires_review')),
  is_correct boolean not null default false,
  score numeric(8,2) not null default 0 check (score >= 0),
  max_score numeric(8,2) not null default 1 check (max_score > 0),
  feedback jsonb not null default '{}'::jsonb,
  grading_method text not null check (grading_method in ('deterministic','semantic_rules','ai_rubric','manual_review')),
  grading_confidence numeric(5,2) not null default 0 check (grading_confidence >= 0 and grading_confidence <= 1),
  answered_at timestamptz not null default now(),
  unique(assessment_session_id, question_id, user_id)
);

create index if not exists assessment_questions_unit_topic_idx on public.assessment_questions(unit_id, topic_id, question_type, difficulty);
create index if not exists assessment_sessions_user_time_idx on public.assessment_sessions(user_id, started_at desc);
create index if not exists assessment_session_questions_session_idx on public.assessment_session_questions(assessment_session_id, question_order);
create index if not exists assessment_answers_session_idx on public.assessment_answers(assessment_session_id, user_id);

create trigger assessment_questions_updated before update on public.assessment_questions for each row execute function public.touch_updated_at();
create trigger assessment_sessions_updated before update on public.assessment_sessions for each row execute function public.touch_updated_at();

do $$ declare t text; begin
  foreach t in array array['assessment_questions','assessment_sessions','assessment_session_questions','assessment_answers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists assessment_questions_read on public.assessment_questions;
create policy assessment_questions_read on public.assessment_questions for select to authenticated
  using ((select public.is_admin()) or ((select public.has_active_access()) and validation_status = 'validated'));

drop policy if exists assessment_sessions_read on public.assessment_sessions;
create policy assessment_sessions_read on public.assessment_sessions for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists assessment_session_questions_read on public.assessment_session_questions;
create policy assessment_session_questions_read on public.assessment_session_questions for select to authenticated
  using ((select public.is_admin()) or exists(select 1 from public.assessment_sessions s where s.id = assessment_session_id and s.user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists assessment_answers_read on public.assessment_answers;
create policy assessment_answers_read on public.assessment_answers for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

commit;
