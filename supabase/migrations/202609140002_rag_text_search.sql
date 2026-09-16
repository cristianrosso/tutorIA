begin;

alter table public.document_chunks
  add column if not exists search_vector tsvector generated always as (
    to_tsvector(
      'spanish',
      coalesce(section, '') || ' ' ||
      coalesce(section_name, '') || ' ' ||
      coalesce(topic, '') || ' ' ||
      content
    )
  ) stored;

create index if not exists document_chunks_search_idx
  on public.document_chunks using gin(search_vector);

comment on table public.document_chunks is
  'Fragmentos de compendio para Sprint RAG. search_vector permite recuperación textual inicial; embeddings pueden añadirse sin cambiar la interfaz del tutor.';

commit;
