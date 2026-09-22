begin;

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_mode text not null check (exam_mode in ('topic','unit','integral','tribunal')),
  configuration jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','ready','in_progress','submitted','grading','completed','grading_failed','expired','cancelled')),
  total_questions integer not null default 0 check (total_questions >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  started_at timestamptz,
  deadline_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  total_score numeric(8,2) not null default 0 check (total_score >= 0),
  max_score numeric(8,2) not null default 0 check (max_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_session_questions (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid not null references public.exam_sessions(id) on delete cascade,
  assessment_session_id uuid not null references public.assessment_sessions(id) on delete cascade,
  question_id uuid not null references public.assessment_questions(id) on delete restrict,
  display_order integer not null check (display_order > 0),
  max_score numeric(8,2) not null default 1 check (max_score > 0),
  question_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(exam_session_id, question_id),
  unique(exam_session_id, display_order)
);

create table if not exists public.exam_session_answers (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid not null references public.exam_sessions(id) on delete cascade,
  session_question_id uuid not null references public.exam_session_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answer jsonb not null default '{}'::jsonb,
  is_correct boolean,
  score numeric(8,2),
  feedback jsonb not null default '{}'::jsonb,
  grading_method text,
  grading_status text not null default 'pending' check (grading_status in ('pending','graded','requires_review','failed')),
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(exam_session_id, session_question_id, user_id)
);

create table if not exists public.exam_results (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid not null unique references public.exam_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  total_score numeric(8,2) not null default 0,
  max_score numeric(8,2) not null default 0,
  percentage numeric(5,2) not null default 0,
  result_summary jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);

create index if not exists exam_sessions_user_time_idx on public.exam_sessions(user_id, created_at desc);
create index if not exists exam_sessions_status_idx on public.exam_sessions(user_id, status, deadline_at);
create index if not exists exam_session_questions_exam_idx on public.exam_session_questions(exam_session_id, display_order);
create index if not exists exam_session_answers_exam_idx on public.exam_session_answers(exam_session_id, user_id);
create index if not exists exam_results_user_time_idx on public.exam_results(user_id, completed_at desc);

create trigger exam_sessions_updated before update on public.exam_sessions for each row execute function public.touch_updated_at();
create trigger exam_session_answers_updated before update on public.exam_session_answers for each row execute function public.touch_updated_at();

do $$ declare t text; begin
  foreach t in array array['exam_sessions','exam_session_questions','exam_session_answers','exam_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists exam_sessions_read on public.exam_sessions;
create policy exam_sessions_read on public.exam_sessions for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists exam_session_questions_read on public.exam_session_questions;
create policy exam_session_questions_read on public.exam_session_questions for select to authenticated
  using ((select public.is_admin()) or exists(select 1 from public.exam_sessions s where s.id = exam_session_id and s.user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists exam_session_answers_read on public.exam_session_answers;
create policy exam_session_answers_read on public.exam_session_answers for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists exam_results_read on public.exam_results;
create policy exam_results_read on public.exam_results for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

commit;
