begin;

alter table public.tutor_messages
  drop constraint if exists tutor_messages_tutor_mode_check;

alter table public.tutor_messages
  add constraint tutor_messages_tutor_mode_check
  check (tutor_mode in (
    'normal','quick','explain','simple','academic','deep','example','review','comparison','step_by_step'
  ));

alter table public.student_academic_profiles
  drop constraint if exists student_academic_profiles_preferred_learning_mode_check;

alter table public.student_academic_profiles
  add constraint student_academic_profiles_preferred_learning_mode_check
  check (preferred_learning_mode is null or preferred_learning_mode in (
    'normal','quick','explain','simple','academic','deep','example','review','comparison','step_by_step'
  ));

create table if not exists public.student_pedagogical_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  preferred_mode text check (preferred_mode is null or preferred_mode in (
    'normal','quick','explain','simple','academic','deep','example','review','comparison','step_by_step'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pedagogical_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.tutor_conversations(id) on delete cascade,
  message_id uuid references public.tutor_messages(id) on delete set null,
  mode text not null check (mode in (
    'normal','quick','explain','simple','academic','deep','example','review','comparison','step_by_step'
  )),
  strategy text not null check (strategy in (
    'DIRECT_EXPLANATION','PROGRESSIVE_EXPLANATION','CONCEPTUAL_BREAKDOWN','PRACTICAL_EXAMPLE',
    'COMPARATIVE_EXPLANATION','PROCEDURAL_EXPLANATION','ACTIVE_RECALL','GUIDED_REVIEW'
  )),
  reformulation_requested boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pedagogical_preferences_user_idx on public.student_pedagogical_preferences(user_id);
create index if not exists pedagogical_interactions_user_time_idx on public.pedagogical_interactions(user_id, created_at desc);
create index if not exists pedagogical_interactions_conversation_idx on public.pedagogical_interactions(conversation_id, created_at desc);
create index if not exists pedagogical_interactions_mode_idx on public.pedagogical_interactions(mode, strategy, created_at desc);

drop trigger if exists student_pedagogical_preferences_updated on public.student_pedagogical_preferences;
create trigger student_pedagogical_preferences_updated before update on public.student_pedagogical_preferences
  for each row execute function public.touch_updated_at();

do $$ declare t text; begin
  foreach t in array array['student_pedagogical_preferences','pedagogical_interactions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists pedagogical_preferences_read on public.student_pedagogical_preferences;
create policy pedagogical_preferences_read on public.student_pedagogical_preferences for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists pedagogical_interactions_read on public.pedagogical_interactions;
create policy pedagogical_interactions_read on public.pedagogical_interactions for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

commit;
