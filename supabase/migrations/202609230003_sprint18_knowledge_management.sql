-- Sprint 18: Gestión avanzada del conocimiento académico.
-- Ejecutar en Supabase SQL Editor o mediante Supabase CLI.
-- Migración no destructiva: agrega tablas de gestión, storage privado y estados de publicación.
begin;

create table if not exists public.knowledge_admin_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  source_label text not null default 'Compendio FATESCIPOL El Alto – Examen de Grado 2026',
  document_kind text not null default 'COMPENDIUM' check (document_kind in ('COMPENDIUM','SUPPLEMENT','CORRECTION','OTHER')),
  status text not null default 'draft' check (status in ('draft','uploaded','processing','processed','review_required','published','archived','failed')),
  active_version_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_admin_documents(id) on delete cascade,
  version_label text not null,
  original_filename text not null,
  mime_type text not null,
  storage_bucket text not null default 'academic-documents',
  storage_path text,
  file_size_bytes bigint not null default 0 check (file_size_bytes >= 0),
  source_hash text not null,
  extracted_text text,
  extraction_status text not null default 'pending' check (extraction_status in ('pending','extracted','failed')),
  processing_status text not null default 'pending' check (processing_status in ('pending','processing','processed','review_required','published','failed','rolled_back')),
  academic_document_id uuid references public.academic_documents(id) on delete set null,
  unit_number integer check (unit_number is null or unit_number between 1 and 15),
  topic_number text,
  topic_name text,
  validation_report jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(document_id, version_label),
  unique(source_hash)
);

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname = 'knowledge_admin_documents_active_version_fk'
      and conrelid = 'public.knowledge_admin_documents'::regclass
  ) then
    alter table public.knowledge_admin_documents
      add constraint knowledge_admin_documents_active_version_fk
      foreign key (active_version_id) references public.knowledge_document_versions(id) on delete set null;
  end if;
end $$;

create table if not exists public.knowledge_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_admin_documents(id) on delete cascade,
  version_id uuid not null references public.knowledge_document_versions(id) on delete cascade,
  job_type text not null check (job_type in ('extract','structure','publish','rollback','validate')),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  report jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (finished_at is null or started_at is null or finished_at >= started_at)
);

create table if not exists public.knowledge_publications (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_admin_documents(id) on delete cascade,
  version_id uuid not null references public.knowledge_document_versions(id) on delete cascade,
  academic_document_id uuid references public.academic_documents(id) on delete set null,
  status text not null default 'published' check (status in ('published','rolled_back')),
  notes text,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  rolled_back_by uuid references public.profiles(id) on delete set null,
  rolled_back_at timestamptz
);

create table if not exists public.knowledge_validation_cases (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.knowledge_document_versions(id) on delete cascade,
  question text not null,
  expected_reference text,
  result jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','passed','failed','review_required')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_admin_documents_status_idx on public.knowledge_admin_documents(status, updated_at desc);
create index if not exists knowledge_document_versions_document_idx on public.knowledge_document_versions(document_id, created_at desc);
create index if not exists knowledge_document_versions_status_idx on public.knowledge_document_versions(processing_status, created_at desc);
create index if not exists knowledge_processing_jobs_version_idx on public.knowledge_processing_jobs(version_id, created_at desc);
create index if not exists knowledge_publications_document_idx on public.knowledge_publications(document_id, published_at desc);
create index if not exists knowledge_validation_cases_version_idx on public.knowledge_validation_cases(version_id, created_at desc);

do $$
begin
  if exists(select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'academic-documents',
      'academic-documents',
      false,
      52428800,
      array[
        'text/plain',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
    )
    on conflict (id) do update set
      public = false,
      file_size_limit = 52428800,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

alter table public.knowledge_admin_documents enable row level security;
alter table public.knowledge_document_versions enable row level security;
alter table public.knowledge_processing_jobs enable row level security;
alter table public.knowledge_publications enable row level security;
alter table public.knowledge_validation_cases enable row level security;

revoke all on public.knowledge_admin_documents, public.knowledge_document_versions, public.knowledge_processing_jobs, public.knowledge_publications, public.knowledge_validation_cases from anon, authenticated;
grant all on public.knowledge_admin_documents, public.knowledge_document_versions, public.knowledge_processing_jobs, public.knowledge_publications, public.knowledge_validation_cases to service_role;
grant select on public.knowledge_admin_documents, public.knowledge_document_versions, public.knowledge_processing_jobs, public.knowledge_publications, public.knowledge_validation_cases to authenticated;

drop policy if exists knowledge_admin_documents_read on public.knowledge_admin_documents;
create policy knowledge_admin_documents_read on public.knowledge_admin_documents for select to authenticated using ((select public.is_admin()));

drop policy if exists knowledge_document_versions_read on public.knowledge_document_versions;
create policy knowledge_document_versions_read on public.knowledge_document_versions for select to authenticated using ((select public.is_admin()));

drop policy if exists knowledge_processing_jobs_read on public.knowledge_processing_jobs;
create policy knowledge_processing_jobs_read on public.knowledge_processing_jobs for select to authenticated using ((select public.is_admin()));

drop policy if exists knowledge_publications_read on public.knowledge_publications;
create policy knowledge_publications_read on public.knowledge_publications for select to authenticated using ((select public.is_admin()));

drop policy if exists knowledge_validation_cases_read on public.knowledge_validation_cases;
create policy knowledge_validation_cases_read on public.knowledge_validation_cases for select to authenticated using ((select public.is_admin()));

do $$
begin
  if exists(select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    drop policy if exists academic_documents_storage_admin_read on storage.objects;
    create policy academic_documents_storage_admin_read on storage.objects for select to authenticated
      using (bucket_id = 'academic-documents' and (select public.is_admin()));
  end if;
end $$;

drop trigger if exists knowledge_admin_documents_updated on public.knowledge_admin_documents;
create trigger knowledge_admin_documents_updated before update on public.knowledge_admin_documents for each row execute function public.touch_updated_at();

drop trigger if exists knowledge_document_versions_updated on public.knowledge_document_versions;
create trigger knowledge_document_versions_updated before update on public.knowledge_document_versions for each row execute function public.touch_updated_at();

drop trigger if exists knowledge_validation_cases_updated on public.knowledge_validation_cases;
create trigger knowledge_validation_cases_updated before update on public.knowledge_validation_cases for each row execute function public.touch_updated_at();

comment on table public.knowledge_admin_documents is 'Sprint 18: catálogo administrativo de documentos académicos en staging, revisión y publicación.';
comment on table public.knowledge_document_versions is 'Versiones de documentos fuente; conserva hash, archivo privado, extracción y relación con MKF-1 publicado.';
comment on table public.knowledge_processing_jobs is 'Trazabilidad de extracción, estructuración, publicación, rollback y validación.';
comment on table public.knowledge_publications is 'Historial de publicaciones y rollback del conocimiento académico.';

commit;
