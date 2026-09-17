begin;

create table if not exists public.tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tutor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.tutor_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) between 1 and 12000),
  tutor_mode text not null default 'normal' check (tutor_mode in ('normal','quick','explain','example','review')),
  intent text,
  model_used text,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  estimated_cost numeric(16,8) not null default 0 check (estimated_cost >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.tutor_message_sources (
  message_id uuid not null references public.tutor_messages(id) on delete cascade,
  knowledge_object_id text references public.knowledge_objects(id) on delete set null,
  chunk_id uuid references public.knowledge_chunks(id) on delete set null,
  source_reference text,
  relevance_score numeric(10,6) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tutor_message_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.tutor_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating text not null check (rating in ('up','down')),
  created_at timestamptz not null default now(),
  unique(message_id, user_id)
);

create index if not exists tutor_conversations_user_time_idx on public.tutor_conversations(user_id, updated_at desc);
create index if not exists tutor_messages_conversation_time_idx on public.tutor_messages(conversation_id, created_at);
create index if not exists tutor_messages_user_time_idx on public.tutor_messages(user_id, created_at desc);
create index if not exists tutor_sources_message_idx on public.tutor_message_sources(message_id);
create index if not exists tutor_feedback_user_idx on public.tutor_message_feedback(user_id, created_at desc);

drop trigger if exists tutor_conversations_updated on public.tutor_conversations;
create trigger tutor_conversations_updated before update on public.tutor_conversations
  for each row execute function public.touch_updated_at();

do $$ declare t text; begin
  foreach t in array array['tutor_conversations','tutor_messages','tutor_message_sources','tutor_message_feedback'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

create policy tutor_conversations_read on public.tutor_conversations for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

create policy tutor_messages_read on public.tutor_messages for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

create policy tutor_sources_read on public.tutor_message_sources for select to authenticated
  using (exists(select 1 from public.tutor_messages m where m.id = message_id and ((select public.is_admin()) or (m.user_id = (select auth.uid()) and (select public.has_active_access())))));

create policy tutor_feedback_read on public.tutor_message_feedback for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

commit;
