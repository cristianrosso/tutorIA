begin;

-- Sprint 17B: límite de un dispositivo activo por estudiante.
-- No elimina sesiones históricas; solo permite una sesión no revocada por usuario.

alter table public.access_sessions
  add column if not exists user_agent text,
  add column if not exists ip_hint text;

with ranked as (
  select
    id,
    row_number() over (partition by user_id order by last_seen_at desc, created_at desc) as rn
  from public.access_sessions
  where revoked_at is null
)
update public.access_sessions s
set revoked_at = now()
from ranked r
where s.id = r.id and r.rn > 1;

create unique index if not exists access_sessions_one_active_per_user_idx
  on public.access_sessions(user_id)
  where revoked_at is null;

comment on table public.access_sessions is 'Control de dispositivo único: para estudiantes solo una sesión activa no revocada por usuario.';

commit;
