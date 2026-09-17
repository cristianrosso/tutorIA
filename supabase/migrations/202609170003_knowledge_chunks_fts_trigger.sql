begin;

create or replace function public.refresh_knowledge_chunk_search_vector()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.search_vector =
    setweight(to_tsvector('spanish', coalesce(new.content, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(array_to_string(new.keywords, ' '), '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(new.source_reference, '')), 'C');
  return new;
end;
$$;

drop trigger if exists knowledge_chunks_search_vector_refresh on public.knowledge_chunks;
create trigger knowledge_chunks_search_vector_refresh
before insert or update of content, keywords, source_reference
on public.knowledge_chunks
for each row execute function public.refresh_knowledge_chunk_search_vector();

update public.knowledge_chunks
set search_vector =
  setweight(to_tsvector('spanish', coalesce(content, '')), 'A') ||
  setweight(to_tsvector('spanish', coalesce(array_to_string(keywords, ' '), '')), 'B') ||
  setweight(to_tsvector('spanish', coalesce(source_reference, '')), 'C');

commit;
