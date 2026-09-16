-- Ejecutar una sola vez mediante Supabase CLI o SQL Editor, como postgres.
begin;

create type public.app_role as enum ('ADMIN', 'ESTUDIANTE');
create type public.account_status as enum ('active', 'inactive');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  full_name text not null check (length(trim(full_name)) between 3 and 100),
  role public.app_role not null default 'ESTUDIANTE',
  status public.account_status not null default 'inactive',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at),
  check (role = 'ADMIN' or expires_at is not null)
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number between 1 and 15),
  name text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id),
  title text not null,
  source text not null,
  version text not null default '2026',
  storage_path text,
  status text not null default 'pending' check (status in ('pending','processing','ready','failed')),
  created_at timestamptz not null default now()
);
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  section text,
  section_name text,
  topic text,
  page integer check (page > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(document_id, chunk_index)
);
comment on table public.document_chunks is 'Unidad y origen se obtienen del documento. Embeddings e índices vectoriales se añadirán en Sprint RAG.';

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  unit_id uuid not null references public.units(id),
  mode text not null check (mode in ('text','voice','simulation')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  retrieved_sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table public.simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  unit_id uuid not null references public.units(id),
  session_id uuid references public.study_sessions(id),
  status text not null default 'in_progress' check (status in ('in_progress','completed','abandoned')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create table public.simulation_questions (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations(id) on delete cascade,
  position integer not null check (position > 0),
  question text not null,
  question_type text not null check (question_type in ('conceptual','comprehension','comparison','explanation','application','follow_up')),
  answer text,
  retrieved_sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(simulation_id, position)
);
create table public.simulation_results (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null unique references public.simulations(id) on delete cascade,
  conceptual integer not null check (conceptual between 0 and 30),
  terminology integer not null check (terminology between 0 and 20),
  application integer not null check (application between 0 and 20),
  argumentation integer not null check (argumentation between 0 and 20),
  clarity integer not null check (clarity between 0 and 10),
  total integer generated always as (conceptual + terminology + application + argumentation + clarity) stored,
  strengths text[] not null default '{}',
  improvements text[] not null default '{}',
  suggested_answer text not null,
  review_topics text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  session_id uuid references public.study_sessions(id),
  simulation_id uuid references public.simulations(id),
  provider text not null default 'openai',
  model text not null,
  event_type text not null check (event_type in ('chat','embedding','stt','tts','realtime')),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  audio_input numeric(12,3) not null default 0 check (audio_input >= 0),
  audio_output numeric(12,3) not null default 0 check (audio_output >= 0),
  estimated_cost numeric(16,8) check (estimated_cost >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  price_version text,
  provider_request_id text unique,
  created_at timestamptz not null default now()
);
comment on column public.usage_events.audio_input is 'Duración de entrada de audio, en segundos';
comment on column public.usage_events.audio_output is 'Duración de salida de audio, en segundos';
comment on column public.usage_events.estimated_cost is 'Estimación USD; NULL = costo no calculado, nunca asumir cero';

create table public.access_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  auth_session_id uuid not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
comment on table public.access_sessions is 'Preparación de límites de sesiones; aún sin enforcement de concurrencia';
create table public.rate_limit_buckets (
  key text primary key,
  hits integer not null default 1,
  window_start timestamptz not null default now(),
  expires_at timestamptz not null
);

create index profiles_role_status_idx on public.profiles(role, status);
create index documents_unit_idx on public.documents(unit_id);
create index sessions_user_time_idx on public.study_sessions(user_id, started_at desc);
create index sessions_unit_idx on public.study_sessions(unit_id);
create index messages_session_time_idx on public.messages(session_id, created_at);
create index simulations_user_time_idx on public.simulations(user_id, started_at desc);
create index simulations_unit_idx on public.simulations(unit_id);
create index simulations_session_idx on public.simulations(session_id);
create index usage_user_time_idx on public.usage_events(user_id, created_at desc);
create index usage_time_idx on public.usage_events(created_at desc);
create index usage_session_idx on public.usage_events(session_id);
create index usage_simulation_idx on public.usage_events(simulation_id);
create index access_user_idx on public.access_sessions(user_id);
create index rate_limit_expiry_idx on public.rate_limit_buckets(expires_at);

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function public.touch_updated_at();

-- No trigger de alta desde auth.users: metadata del usuario no otorga roles.
create function public.has_active_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid())
    and p.status = 'active' and p.starts_at <= now()
    and (p.expires_at is null or p.expires_at > now()));
$$;
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid())
    and p.role = 'ADMIN' and p.status = 'active' and p.starts_at <= now()
    and (p.expires_at is null or p.expires_at > now()));
$$;
revoke all on function public.has_active_access(), public.is_admin(), public.touch_updated_at() from public;
grant execute on function public.has_active_access(), public.is_admin() to authenticated;

-- Ventana fija atómica, compartida entre instancias. Solo clave de servicio.
create function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or length(p_key) <> 64 then
    raise exception 'Invalid rate limit arguments';
  end if;
  delete from public.rate_limit_buckets where expires_at < now();
  insert into public.rate_limit_buckets(key, hits, window_start, expires_at)
    values (p_key, 1, now(), now() + make_interval(secs => p_window_seconds))
  on conflict(key) do update set hits = public.rate_limit_buckets.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Cerrar permisos predeterminados de Supabase y activar RLS en todas las tablas.
do $$ declare t text; begin
  foreach t in array array['profiles','units','documents','document_chunks','study_sessions','messages',
    'simulations','simulation_questions','simulation_results','usage_events','access_sessions','rate_limit_buckets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    if t <> 'rate_limit_buckets' then
      execute format('grant select on public.%I to authenticated', t);
    end if;
  end loop;
end $$;

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy units_read on public.units for select to authenticated
  using ((select public.has_active_access()));
create policy documents_read on public.documents for select to authenticated
  using ((select public.is_admin()) or ((select public.has_active_access()) and status = 'ready'
    and exists(select 1 from public.units u where u.id = unit_id and u.enabled)));
create policy chunks_read on public.document_chunks for select to authenticated
  using (exists(select 1 from public.documents d where d.id = document_id));
create policy sessions_read on public.study_sessions for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));
create policy messages_read on public.messages for select to authenticated
  using (exists(select 1 from public.study_sessions s where s.id = session_id));
create policy simulations_read on public.simulations for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));
create policy questions_read on public.simulation_questions for select to authenticated
  using (exists(select 1 from public.simulations s where s.id = simulation_id));
create policy results_read on public.simulation_results for select to authenticated
  using (exists(select 1 from public.simulations s where s.id = simulation_id));
create policy usage_read on public.usage_events for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));
create policy access_read on public.access_sessions for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

insert into public.units(number, name, enabled) values (1, 'Doctrina Policial', true);
insert into public.units(number, name, enabled)
  select n, 'Unidad temática ' || n, false from generate_series(2, 15) n;

commit;
