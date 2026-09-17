begin;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'academic_topics_upsert_key'
      and conrelid = 'public.academic_topics'::regclass
  ) then
    alter table public.academic_topics
      add constraint academic_topics_upsert_key unique(academic_unit_id, topic_number, topic_name);
  end if;
end $$;

commit;
