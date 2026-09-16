-- Sprint 4: simulacro inteligente de examen oral.
begin;

alter table public.simulations
  add column if not exists difficulty text not null default 'intermedio' check (difficulty in ('basico','intermedio','avanzado')),
  add column if not exists question_count integer not null default 3 check (question_count in (3,5)),
  add column if not exists overall_score integer check (overall_score between 0 and 100),
  add column if not exists estimated_cost numeric(16,8) check (estimated_cost >= 0),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.simulation_questions
  add column if not exists parent_question_id uuid references public.simulation_questions(id) on delete set null,
  add column if not exists transcription text,
  add column if not exists score integer check (score between 0 and 100),
  add column if not exists feedback jsonb not null default '{}'::jsonb,
  add column if not exists expected_concepts text[] not null default '{}',
  add column if not exists missing_concepts text[] not null default '{}',
  add column if not exists source_references jsonb not null default '[]'::jsonb,
  add column if not exists model_answer text;

alter table public.simulation_results
  add column if not exists concepts_omitted text[] not null default '{}',
  add column if not exists model_answers jsonb not null default '[]'::jsonb,
  add column if not exists error_reviews jsonb not null default '[]'::jsonb,
  add column if not exists cost_estimated numeric(16,8) check (cost_estimated >= 0),
  add column if not exists disclaimer text not null default 'Esta evaluación es una herramienta de práctica y no constituye una calificación oficial de FATESCIPOL.';

alter table public.simulation_questions drop constraint if exists simulation_questions_question_type_check;
alter table public.simulation_questions add constraint simulation_questions_question_type_check
  check (question_type in ('conceptual','comprehension','comparison','explanation','application','follow_up','definition','enumeration'));

create index if not exists simulation_questions_parent_idx on public.simulation_questions(parent_question_id);
create index if not exists simulations_difficulty_idx on public.simulations(difficulty, status);

commit;
