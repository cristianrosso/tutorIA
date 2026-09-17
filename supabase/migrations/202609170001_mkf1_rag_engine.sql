-- Sprint 5B: RAG academico inteligente sobre MKF-1.
-- Compatible con entornos de prueba sin pgvector: crea vector/RPC solo si la extensión está disponible.
begin;

do $$
begin
  if exists(select 1 from pg_available_extensions where name = 'vector') then
    create extension if not exists vector;
  end if;
end $$;

alter table public.knowledge_chunks
  add column if not exists parent_id text,
  add column if not exists academic_unit_id uuid references public.academic_units(id) on delete set null,
  add column if not exists academic_topic_id uuid references public.academic_topics(id) on delete set null,
  add column if not exists chunk_type text not null default 'SOURCE' check (chunk_type in ('SOURCE','PARENT_CONTEXT','RELATION_CONTEXT','SUMMARY_VIEW')),
  add column if not exists content text,
  add column if not exists normalized_content text,
  add column if not exists source_text text,
  add column if not exists source_reference text,
  add column if not exists page_reference text,
  add column if not exists token_count integer check (token_count is null or token_count >= 0),
  add column if not exists embedding_model text,
  add column if not exists embedding_hash text,
  add column if not exists keywords text[] not null default '{}',
  add column if not exists updated_at timestamptz not null default now();

update public.knowledge_chunks
set content = coalesce(content, source_content),
    normalized_content = coalesce(normalized_content, regexp_replace(lower(coalesce(source_content, content, '')), '\s+', ' ', 'g')),
    source_text = coalesce(source_text, source_content, content),
    embedding_hash = coalesce(embedding_hash, source_hash)
where true;

do $$
begin
  if exists(select 1 from pg_type where typname = 'vector') then
    execute 'alter table public.knowledge_chunks add column if not exists embedding vector(1536)';
  end if;
end $$;

alter table public.knowledge_chunks
  add column if not exists search_vector tsvector;

update public.knowledge_chunks
set search_vector =
  setweight(to_tsvector('spanish', coalesce(content, '')), 'A') ||
  setweight(to_tsvector('spanish', coalesce(array_to_string(keywords, ' '), '')), 'B') ||
  setweight(to_tsvector('spanish', coalesce(source_reference, '')), 'C')
where search_vector is null;

create index if not exists knowledge_chunks_text_search_idx
  on public.knowledge_chunks using gin(search_vector);
create index if not exists knowledge_chunks_hash_idx
  on public.knowledge_chunks(embedding_hash, embedding_model);
create index if not exists knowledge_chunks_parent_idx
  on public.knowledge_chunks(parent_id);
create index if not exists knowledge_chunks_unit_topic_idx
  on public.knowledge_chunks(academic_unit_id, academic_topic_id);

do $$
begin
  if exists(select 1 from pg_type where typname = 'vector') then
    execute 'create index if not exists knowledge_chunks_embedding_idx on public.knowledge_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100)';
  end if;
end $$;

drop trigger if exists knowledge_chunks_updated on public.knowledge_chunks;
create trigger knowledge_chunks_updated before update on public.knowledge_chunks for each row execute function public.touch_updated_at();

do $$
begin
  if exists(select 1 from pg_type where typname = 'vector') then
    execute 'create or replace function public.match_knowledge_chunks(
      query_embedding vector(1536),
      match_threshold double precision default 0.15,
      match_count integer default 20,
      filter_unit_number integer default null,
      filter_topic_id uuid default null
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
        and (filter_topic_id is null or kc.academic_topic_id = filter_topic_id)
        and (filter_unit_number is null or (kc.metadata->>''unit_number'')::integer = filter_unit_number)
      order by kc.embedding <=> query_embedding
      limit least(match_count, 100)
    $body$';
    execute 'revoke all on function public.match_knowledge_chunks(vector, double precision, integer, integer, uuid) from public, anon';
    execute 'grant execute on function public.match_knowledge_chunks(vector, double precision, integer, integer, uuid) to authenticated, service_role';
  end if;
end $$;

comment on table public.knowledge_chunks is 'Chunks academicos MKF-1 para RAG hibrido: fuente preservada, texto normalizado, keywords, FTS y embeddings pgvector cuando esté disponible.';

commit;
