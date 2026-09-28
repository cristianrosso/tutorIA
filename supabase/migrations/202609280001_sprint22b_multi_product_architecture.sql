begin;

-- Sprint 22B: arquitectura multi-curso y multi-examen.
-- Migración no destructiva: FATESCIPOL queda como producto inicial y las tablas existentes se etiquetan sin cambiar su significado académico.

create table if not exists public.academic_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academic_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.academic_categories(id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  short_name text not null,
  institution_name text,
  exam_name text,
  exam_year integer check (exam_year is null or exam_year between 2000 and 2100),
  status text not null default 'draft' check (status in ('draft','active','archived','suspended')),
  settings jsonb not null default '{}'::jsonb,
  branding jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_tutor_configs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.academic_products(id) on delete cascade,
  tutor_name text not null default 'Tutor IA',
  system_prompt_scope text not null default 'product_knowledge_only',
  default_text_model text,
  default_reasoning_model text,
  default_stt_model text,
  default_tts_model text,
  default_tts_voice text,
  max_context_chunks integer not null default 8 check (max_context_chunks between 1 and 30),
  voice_enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_exam_configs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.academic_products(id) on delete cascade,
  exam_label text not null default 'Examen de grado',
  default_question_count integer not null default 3 check (default_question_count between 1 and 50),
  allowed_question_types text[] not null default array['open_answer'],
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_product_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.academic_products(id) on delete cascade,
  status text not null default 'active' check (status in ('pending','active','expired','suspended','cancelled')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  license_type text not null default 'monthly',
  source_license_id uuid references public.student_licenses(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, product_id, starts_at),
  check (expires_at is null or expires_at > starts_at)
);

create table if not exists public.admin_product_permissions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.academic_products(id) on delete cascade,
  permission_scope text not null default 'product_admin' check (permission_scope in ('global_admin','product_admin','knowledge_admin','analytics_viewer','support_viewer')),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(admin_user_id, product_id, permission_scope)
);

create table if not exists public.product_audit_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.academic_products(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.academic_categories (id, slug, name, description)
values ('00000000-0000-4000-8000-000000000001', 'policial', 'Formación policial', 'Productos académicos de formación policial.')
on conflict (slug) do update set name = excluded.name, description = excluded.description;

insert into public.academic_products (
  id, category_id, slug, name, short_name, institution_name, exam_name, exam_year, status, settings, branding
)
values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'fatescipol-grado',
  'FATESCIPOL — Examen de Grado 2026',
  'FATESCIPOL',
  'FATESCIPOL El Alto',
  'Examen de Grado',
  2026,
  'active',
  '{"default_unit_count":15,"default_language":"es-BO","commercial_license_days":30}'::jsonb,
  '{"primary_color":"#0f766e","accent_color":"#e9c46a"}'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  institution_name = excluded.institution_name,
  exam_name = excluded.exam_name,
  exam_year = excluded.exam_year,
  status = 'active',
  settings = public.academic_products.settings || excluded.settings,
  branding = public.academic_products.branding || excluded.branding;

insert into public.product_tutor_configs (product_id, tutor_name, system_prompt_scope, max_context_chunks, voice_enabled, settings)
values ('00000000-0000-4000-8000-000000000101', 'Tutor IA FATESCIPOL', 'product_knowledge_only', 8, true, '{"source_label":"Compendio FATESCIPOL El Alto – Examen de Grado 2026"}'::jsonb)
on conflict (product_id) do update set tutor_name = excluded.tutor_name, settings = public.product_tutor_configs.settings || excluded.settings;

insert into public.product_exam_configs (product_id, exam_label, default_question_count, allowed_question_types, settings)
values ('00000000-0000-4000-8000-000000000101', 'Examen de Grado 2026', 3, array['open_answer','short_answer','case_application'], '{"tribunal_virtual":true}'::jsonb)
on conflict (product_id) do update set exam_label = excluded.exam_label, settings = public.product_exam_configs.settings || excluded.settings;

-- Agregar product_id nullable a capas académicas, RAG, evaluación, progreso, costos y administración.
do $$
declare
  t text;
  tables text[] := array[
    'academic_documents','academic_units','academic_topics','knowledge_objects','knowledge_relations','knowledge_chunks','ingestion_runs',
    'knowledge_admin_documents','knowledge_document_versions','knowledge_processing_jobs','knowledge_publications','knowledge_validation_cases',
    'units','documents','document_chunks','study_sessions','messages','simulations','simulation_questions','simulation_results','usage_events',
    'practice_attempts','unit_progress','tutor_conversations','tutor_messages','tutor_message_sources','tutor_message_feedback',
    'student_academic_profiles','student_learning_events','student_topic_progress','student_learning_evidence','ai_usage_events','usage_alerts',
    'assessment_questions','assessment_sessions','assessment_session_questions','assessment_answers',
    'exam_sessions','exam_session_questions','exam_session_answers','exam_results',
    'student_mastery_estimates','adaptive_recommendations','adaptive_learning_events',
    'student_study_plans','student_study_availability','student_study_activities','student_study_plan_revisions',
    'student_pedagogical_preferences','pedagogical_interactions',
    'guided_class_sessions','guided_class_steps','guided_class_interactions','guided_class_progress'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists product_id uuid references public.academic_products(id) on delete set null', t);
      execute format('update public.%I set product_id = %L where product_id is null', t, '00000000-0000-4000-8000-000000000101');
      execute format('create index if not exists %I on public.%I(product_id)', left(t || '_product_id_idx', 63), t);
    end if;
  end loop;
end $$;

insert into public.user_product_licenses (user_id, product_id, status, starts_at, expires_at, license_type, source_license_id, metadata)
select
  sl.user_id,
  '00000000-0000-4000-8000-000000000101'::uuid,
  sl.status,
  sl.activated_at,
  sl.expires_at,
  case when sl.duration_days <= 31 then 'monthly' else 'custom' end,
  sl.id,
  jsonb_build_object('source','student_licenses_backfill','duration_days',sl.duration_days)
from public.student_licenses sl
where to_regclass('public.student_licenses') is not null
on conflict do nothing;

insert into public.user_product_licenses (user_id, product_id, status, starts_at, expires_at, license_type, metadata)
select
  p.id,
  '00000000-0000-4000-8000-000000000101'::uuid,
  case when p.status = 'active' then 'active' else 'suspended' end,
  p.starts_at,
  p.expires_at,
  'legacy_profile',
  '{"source":"profiles_backfill"}'::jsonb
from public.profiles p
where p.role = 'ESTUDIANTE'
  and not exists (
    select 1 from public.user_product_licenses upl
    where upl.user_id = p.id and upl.product_id = '00000000-0000-4000-8000-000000000101'::uuid
  )
on conflict do nothing;

insert into public.admin_product_permissions (admin_user_id, product_id, permission_scope, active)
select p.id, null, 'global_admin', true
from public.profiles p
where p.role = 'ADMIN'
on conflict do nothing;

create index if not exists academic_products_status_idx on public.academic_products(status, slug);
create index if not exists user_product_licenses_user_status_idx on public.user_product_licenses(user_id, status, expires_at desc);
create index if not exists user_product_licenses_product_status_idx on public.user_product_licenses(product_id, status, expires_at desc);
create index if not exists admin_product_permissions_admin_idx on public.admin_product_permissions(admin_user_id, active);
create index if not exists product_audit_product_time_idx on public.product_audit_events(product_id, created_at desc);

-- RPC de búsqueda semántica con filtro opcional por producto, sin romper la función anterior.
do $$
begin
  if exists(select 1 from pg_type where typname = 'vector') then
    execute 'create or replace function public.match_knowledge_chunks_by_product(
      query_embedding vector(1536),
      match_threshold double precision default 0.15,
      match_count integer default 20,
      filter_unit_number integer default null,
      filter_topic_id uuid default null,
      filter_product_id uuid default null
    )
    returns table(
      id uuid,
      knowledge_object_id text,
      parent_id text,
      academic_unit_id uuid,
      academic_topic_id uuid,
      chunk_type text,
      content text,
      source_content text,
      source_text text,
      source_reference text,
      page_reference text,
      keywords text[],
      metadata jsonb,
      product_id uuid,
      similarity double precision,
      knowledge_objects jsonb
    )
    language sql stable security definer set search_path = public as $body$
      select
        kc.id,
        kc.knowledge_object_id,
        kc.parent_id,
        kc.academic_unit_id,
        kc.academic_topic_id,
        kc.chunk_type,
        kc.content,
        kc.source_content,
        kc.source_text,
        kc.source_reference,
        kc.page_reference,
        kc.keywords,
        kc.metadata,
        kc.product_id,
        (1 - (kc.embedding <=> query_embedding))::double precision as similarity,
        jsonb_build_object(
          ''id'', ko.id,
          ''title'', ko.title,
          ''concept'', ko.concept,
          ''parent_id'', ko.parent_id,
          ''hierarchy'', ko.hierarchy,
          ''source_content'', ko.source_content
        ) as knowledge_objects
      from public.knowledge_chunks kc
      join public.knowledge_objects ko on ko.id = kc.knowledge_object_id
      where kc.embedding is not null
        and (1 - (kc.embedding <=> query_embedding)) >= match_threshold
        and (filter_product_id is null or kc.product_id = filter_product_id)
        and (filter_topic_id is null or kc.academic_topic_id = filter_topic_id)
        and (filter_unit_number is null or (kc.metadata->>''unit_number'')::integer = filter_unit_number)
      order by kc.embedding <=> query_embedding
      limit least(match_count, 100)
    $body$';
    execute 'revoke all on function public.match_knowledge_chunks_by_product(vector, double precision, integer, integer, uuid, uuid) from public, anon';
    execute 'grant execute on function public.match_knowledge_chunks_by_product(vector, double precision, integer, integer, uuid, uuid) to authenticated, service_role';
  end if;
end $$;

alter table public.academic_categories enable row level security;
alter table public.academic_products enable row level security;
alter table public.product_tutor_configs enable row level security;
alter table public.product_exam_configs enable row level security;
alter table public.user_product_licenses enable row level security;
alter table public.admin_product_permissions enable row level security;
alter table public.product_audit_events enable row level security;

revoke all on public.academic_categories, public.academic_products, public.product_tutor_configs, public.product_exam_configs, public.user_product_licenses, public.admin_product_permissions, public.product_audit_events from anon, authenticated;
grant all on public.academic_categories, public.academic_products, public.product_tutor_configs, public.product_exam_configs, public.user_product_licenses, public.admin_product_permissions, public.product_audit_events to service_role;
grant select on public.academic_categories, public.academic_products, public.product_tutor_configs, public.product_exam_configs, public.user_product_licenses, public.admin_product_permissions, public.product_audit_events to authenticated;

drop policy if exists academic_categories_read on public.academic_categories;
create policy academic_categories_read on public.academic_categories for select to authenticated
  using ((select public.is_admin()) or status = 'active');

drop policy if exists academic_products_read on public.academic_products;
create policy academic_products_read on public.academic_products for select to authenticated
  using ((select public.is_admin()) or status = 'active');

drop policy if exists product_tutor_configs_read on public.product_tutor_configs;
create policy product_tutor_configs_read on public.product_tutor_configs for select to authenticated
  using ((select public.is_admin()) or exists(select 1 from public.user_product_licenses upl where upl.product_id = product_id and upl.user_id = (select auth.uid()) and upl.status = 'active' and upl.starts_at <= now() and (upl.expires_at is null or upl.expires_at > now())));

drop policy if exists product_exam_configs_read on public.product_exam_configs;
create policy product_exam_configs_read on public.product_exam_configs for select to authenticated
  using ((select public.is_admin()) or exists(select 1 from public.user_product_licenses upl where upl.product_id = product_id and upl.user_id = (select auth.uid()) and upl.status = 'active' and upl.starts_at <= now() and (upl.expires_at is null or upl.expires_at > now())));

drop policy if exists user_product_licenses_read on public.user_product_licenses;
create policy user_product_licenses_read on public.user_product_licenses for select to authenticated
  using ((select public.is_admin()) or user_id = (select auth.uid()));

drop policy if exists admin_product_permissions_read on public.admin_product_permissions;
create policy admin_product_permissions_read on public.admin_product_permissions for select to authenticated
  using ((select public.is_admin()) or admin_user_id = (select auth.uid()));

drop policy if exists product_audit_events_read on public.product_audit_events;
create policy product_audit_events_read on public.product_audit_events for select to authenticated
  using ((select public.is_admin()));

drop trigger if exists academic_categories_updated on public.academic_categories;
create trigger academic_categories_updated before update on public.academic_categories for each row execute function public.touch_updated_at();
drop trigger if exists academic_products_updated on public.academic_products;
create trigger academic_products_updated before update on public.academic_products for each row execute function public.touch_updated_at();
drop trigger if exists product_tutor_configs_updated on public.product_tutor_configs;
create trigger product_tutor_configs_updated before update on public.product_tutor_configs for each row execute function public.touch_updated_at();
drop trigger if exists product_exam_configs_updated on public.product_exam_configs;
create trigger product_exam_configs_updated before update on public.product_exam_configs for each row execute function public.touch_updated_at();
drop trigger if exists user_product_licenses_updated on public.user_product_licenses;
create trigger user_product_licenses_updated before update on public.user_product_licenses for each row execute function public.touch_updated_at();

comment on table public.academic_products is 'Sprint 22B: catálogo multi-curso/multi-examen. FATESCIPOL es el producto inicial.';
comment on column public.knowledge_chunks.product_id is 'Aislamiento RAG por producto académico. Null no debe usarse en nuevas publicaciones.';

commit;
