-- Sprint 5: 15 unidades, progreso académico e ingesta completa.
begin;

update public.units set name = case number
  when 1 then 'Doctrina Policial'
  when 2 then 'Patrullaje Policial'
  when 3 then 'Seguridad de Instalaciones'
  when 4 then 'Investigación Criminal'
  when 5 then 'Educación Vial e Investigación de Accidentes de Tránsito'
  when 6 then 'Operaciones Policiales'
  when 7 then 'Fundamentos Jurídicos de la Función Policial'
  when 8 then 'Derechos Humanos Aplicados a la Función Policial'
  when 9 then 'Derecho Penal y Derecho Procesal Penal Aplicados a la Función Policial'
  when 10 then 'Género y Violencia Intrafamiliar'
  when 11 then 'Legislación Policial y Seguridad Ciudadana'
  when 12 then 'Expresión Oral, Ética y Relaciones Humanas'
  when 13 then 'Psicología Aplicada a la Función Policial'
  when 14 then 'Soporte Vital Básico (Técnica MARCH)'
  when 15 then 'Metodología de la Investigación Científica'
  else name end,
  enabled = true;

alter table public.documents
  add column if not exists content_hash text,
  add column if not exists active boolean not null default true,
  add column if not exists processed_at timestamptz,
  add column if not exists ingestion_report jsonb not null default '{}'::jsonb,
  add column if not exists superseded_by uuid references public.documents(id),
  add column if not exists original_filename text;

alter table public.document_chunks
  add column if not exists page_start integer check (page_start is null or page_start > 0),
  add column if not exists page_end integer check (page_end is null or page_end > 0),
  add column if not exists section_number text,
  add column if not exists section_title text,
  add column if not exists unit_number integer check (unit_number is null or unit_number between 1 and 15),
  add column if not exists unit_name text;

update public.document_chunks
set page_start = coalesce(page_start, page),
    page_end = coalesce(page_end, page),
    section_number = coalesce(section_number, section),
    section_title = coalesce(section_title, section_name),
    unit_number = coalesce(unit_number, nullif(metadata->>'unit','')::integer),
    unit_name = coalesce(unit_name, metadata->>'unit_name')
where true;

alter table public.usage_events
  add column if not exists unit_id uuid references public.units(id),
  add column if not exists feature text check (feature is null or feature in ('tutor_text','tutor_voice','practice','simulation','admin_ingest')),
  add column if not exists retrieval_ms integer check (retrieval_ms is null or retrieval_ms >= 0),
  add column if not exists llm_ms integer check (llm_ms is null or llm_ms >= 0),
  add column if not exists tts_ms integer check (tts_ms is null or tts_ms >= 0),
  add column if not exists total_ms integer check (total_ms is null or total_ms >= 0);

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  unit_id uuid not null references public.units(id),
  topic text,
  question text not null,
  answer text,
  result text not null check (result in ('bien','parcialmente','necesita_repasar')),
  feedback text not null,
  score integer check (score is null or score between 0 and 100),
  source_references jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.unit_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  unit_id uuid not null references public.units(id),
  status text not null default 'sin_iniciar' check (status in ('sin_iniciar','en_estudio','practicando','buen_dominio','necesita_refuerzo')),
  study_sessions integer not null default 0 check (study_sessions >= 0),
  questions_asked integer not null default 0 check (questions_asked >= 0),
  practices integer not null default 0 check (practices >= 0),
  simulations integer not null default 0 check (simulations >= 0),
  average_score numeric(5,2),
  weak_topics text[] not null default '{}',
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, unit_id)
);

create index if not exists documents_unit_active_idx on public.documents(unit_id, active, status);
create index if not exists documents_hash_idx on public.documents(content_hash);
create index if not exists chunks_unit_topic_idx on public.document_chunks(unit_number, topic);
create index if not exists chunks_section_idx on public.document_chunks(section_title);
create index if not exists usage_unit_feature_idx on public.usage_events(unit_id, feature, created_at desc);
create index if not exists practice_user_unit_idx on public.practice_attempts(user_id, unit_id, created_at desc);
create index if not exists progress_user_unit_idx on public.unit_progress(user_id, unit_id);

alter table public.practice_attempts enable row level security;
alter table public.unit_progress enable row level security;
revoke all on public.practice_attempts, public.unit_progress from anon, authenticated;
grant all on public.practice_attempts, public.unit_progress to service_role;
grant select on public.practice_attempts, public.unit_progress to authenticated;

drop policy if exists practice_read on public.practice_attempts;
create policy practice_read on public.practice_attempts for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

drop policy if exists progress_read on public.unit_progress;
create policy progress_read on public.unit_progress for select to authenticated
  using ((select public.is_admin()) or (user_id = (select auth.uid()) and (select public.has_active_access())));

commit;
