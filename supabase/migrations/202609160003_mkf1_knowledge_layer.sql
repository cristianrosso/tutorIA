-- Sprint 5A: Motor de Conocimiento Académico MKF-1.
-- No crea embeddings y no modifica document_chunks ni el RAG existente.
begin;

create table if not exists public.academic_documents (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid references public.documents(id) on delete set null,
  title text not null,
  source text not null,
  document_version text not null default '2026',
  schema_version text not null default 'MKF-1.0' check (schema_version = 'MKF-1.0'),
  source_hash text not null,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','PROCESSED','REVIEW_REQUIRED','FAILED')),
  report jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_hash, document_version, schema_version)
);

create table if not exists public.academic_units (
  id uuid primary key default gen_random_uuid(),
  academic_document_id uuid not null references public.academic_documents(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  unit_number integer not null check (unit_number between 1 and 15),
  unit_name text not null,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','PROCESSED','REVIEW_REQUIRED','FAILED')),
  hierarchy jsonb not null default '{}'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  source_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(academic_document_id, unit_number)
);

create table if not exists public.academic_topics (
  id uuid primary key default gen_random_uuid(),
  academic_unit_id uuid not null references public.academic_units(id) on delete cascade,
  parent_topic_id uuid references public.academic_topics(id) on delete set null,
  topic_number text,
  topic_name text not null,
  sequence_index integer not null default 0 check (sequence_index >= 0),
  hierarchy jsonb not null default '{}'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  source_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_objects (
  id text primary key,
  academic_document_id uuid not null references public.academic_documents(id) on delete cascade,
  academic_unit_id uuid not null references public.academic_units(id) on delete cascade,
  academic_topic_id uuid references public.academic_topics(id) on delete set null,
  parent_id text references public.knowledge_objects(id) deferrable initially deferred,
  concept text not null,
  title text not null,
  content_type text not null check (content_type in ('DEFINITION','ENUMERATION','CLASSIFICATION','PRINCIPLE','VALUE','CHARACTERISTIC','RULE','NORMATIVE','ARTICLE','PROCEDURE','PROCEDURE_STEP','REQUIREMENT','EXCEPTION','COMPARISON','CAUSE_EFFECT','EXAMPLE','APPLICATION','CASE','FORMULA','METHODOLOGY','SOURCE_NOTE','GENERAL_ACADEMIC_KNOWLEDGE','OTHER')),
  source_content text not null,
  source_scope text not null check (source_scope in ('OFFICIAL_SOURCE','COMPENDIUM_EXPLANATION','GENERAL_ACADEMIC_KNOWLEDGE','UNKNOWN')),
  hierarchy jsonb not null default '{}'::jsonb,
  retrieval_metadata jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  pedagogy jsonb not null default '{}'::jsonb,
  assessment jsonb not null default '{}'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  source_hash text not null,
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(academic_document_id, id, version)
);

create table if not exists public.knowledge_relations (
  id uuid primary key default gen_random_uuid(),
  academic_document_id uuid not null references public.academic_documents(id) on delete cascade,
  from_object_id text not null references public.knowledge_objects(id) on delete cascade,
  to_object_id text not null references public.knowledge_objects(id) on delete cascade,
  relation_type text not null check (relation_type in ('PARENT_OF','CHILD_OF','RELATED_TO','PART_OF','HAS_PRINCIPLE','HAS_VALUE','HAS_CHARACTERISTIC','HAS_STEP','PRECEDES','FOLLOWS','CONTRASTS_WITH','DEPENDS_ON','SOURCE_OF')),
  confidence numeric(4,3) not null default 1 check (confidence >= 0 and confidence <= 1),
  generated_metadata boolean not null default false,
  validation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(from_object_id, to_object_id, relation_type)
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  knowledge_object_id text not null references public.knowledge_objects(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  source_content text not null,
  source_hash text not null,
  token_estimate integer check (token_estimate is null or token_estimate >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(knowledge_object_id, chunk_index)
);

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  academic_document_id uuid references public.academic_documents(id) on delete set null,
  schema_version text not null default 'MKF-1.0' check (schema_version = 'MKF-1.0'),
  unit_number integer check (unit_number is null or unit_number between 1 and 15),
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','PROCESSED','REVIEW_REQUIRED','FAILED')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  report_path text,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (finished_at is null or finished_at >= started_at)
);

create index if not exists academic_documents_active_idx on public.academic_documents(active, status);
create index if not exists academic_units_document_idx on public.academic_units(academic_document_id, unit_number);
create index if not exists academic_topics_unit_idx on public.academic_topics(academic_unit_id, topic_number);
create unique index if not exists academic_topics_identity_idx
  on public.academic_topics(academic_unit_id, coalesce(topic_number, ''), topic_name);
create index if not exists knowledge_objects_unit_type_idx on public.knowledge_objects(academic_unit_id, content_type, active);
create index if not exists knowledge_objects_source_hash_idx on public.knowledge_objects(source_hash);
create index if not exists knowledge_objects_parent_idx on public.knowledge_objects(parent_id);
create index if not exists knowledge_relations_from_idx on public.knowledge_relations(from_object_id, relation_type);
create index if not exists knowledge_relations_to_idx on public.knowledge_relations(to_object_id, relation_type);
create index if not exists knowledge_chunks_object_idx on public.knowledge_chunks(knowledge_object_id);
create index if not exists ingestion_runs_status_idx on public.ingestion_runs(status, started_at desc);

create trigger academic_documents_updated before update on public.academic_documents for each row execute function public.touch_updated_at();
create trigger academic_units_updated before update on public.academic_units for each row execute function public.touch_updated_at();
create trigger academic_topics_updated before update on public.academic_topics for each row execute function public.touch_updated_at();
create trigger knowledge_objects_updated before update on public.knowledge_objects for each row execute function public.touch_updated_at();

alter table public.academic_documents enable row level security;
alter table public.academic_units enable row level security;
alter table public.academic_topics enable row level security;
alter table public.knowledge_objects enable row level security;
alter table public.knowledge_relations enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.ingestion_runs enable row level security;

revoke all on public.academic_documents, public.academic_units, public.academic_topics, public.knowledge_objects, public.knowledge_relations, public.knowledge_chunks, public.ingestion_runs from anon, authenticated;
grant all on public.academic_documents, public.academic_units, public.academic_topics, public.knowledge_objects, public.knowledge_relations, public.knowledge_chunks, public.ingestion_runs to service_role;
grant select on public.academic_documents, public.academic_units, public.academic_topics, public.knowledge_objects, public.knowledge_relations, public.knowledge_chunks, public.ingestion_runs to authenticated;

drop policy if exists academic_documents_read on public.academic_documents;
create policy academic_documents_read on public.academic_documents for select to authenticated
  using ((select public.is_admin()) or (active and status in ('PROCESSED','REVIEW_REQUIRED') and (select public.has_active_access())));

drop policy if exists academic_units_read on public.academic_units;
create policy academic_units_read on public.academic_units for select to authenticated
  using ((select public.is_admin()) or ((select public.has_active_access()) and exists(select 1 from public.academic_documents d where d.id = academic_document_id and d.active)));

drop policy if exists academic_topics_read on public.academic_topics;
create policy academic_topics_read on public.academic_topics for select to authenticated
  using ((select public.is_admin()) or ((select public.has_active_access()) and exists(select 1 from public.academic_units u join public.academic_documents d on d.id = u.academic_document_id where u.id = academic_unit_id and d.active)));

drop policy if exists knowledge_objects_read on public.knowledge_objects;
create policy knowledge_objects_read on public.knowledge_objects for select to authenticated
  using ((select public.is_admin()) or (active and (select public.has_active_access()) and exists(select 1 from public.academic_documents d where d.id = academic_document_id and d.active)));

drop policy if exists knowledge_relations_read on public.knowledge_relations;
create policy knowledge_relations_read on public.knowledge_relations for select to authenticated
  using ((select public.is_admin()) or ((select public.has_active_access()) and exists(select 1 from public.academic_documents d where d.id = academic_document_id and d.active)));

drop policy if exists knowledge_chunks_read on public.knowledge_chunks;
create policy knowledge_chunks_read on public.knowledge_chunks for select to authenticated
  using ((select public.is_admin()) or ((select public.has_active_access()) and exists(select 1 from public.knowledge_objects k join public.academic_documents d on d.id = k.academic_document_id where k.id = knowledge_object_id and k.active and d.active)));

drop policy if exists ingestion_runs_read on public.ingestion_runs;
create policy ingestion_runs_read on public.ingestion_runs for select to authenticated
  using ((select public.is_admin()));

commit;
