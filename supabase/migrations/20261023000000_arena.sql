-- 아레나전(매주 토 · 일 19:30~21:30) 참가 신청 · 편성. 함수 배포보다 먼저 넣는다(GET /api/me 가 site_admins 를 읽는다).
--   site_admins   : 편성할 수 있는 관리자(디스코드 ID · k<카카오 회원번호>). 마스터(site_masters)는 따로 넣지 않아도 관리자다. 화면은 없다 —
--     insert into public.site_admins (user_id, note) select discord_user_id, discord_name from public.recruit_profiles where discord_name = '<표시 이름>';
--     delete from public.site_admins where user_id = '…';
--   arena_signups : 한 주(그 주 토요일 날짜)에 한 사람 한 줄. 계정은 프로필 entries 의 게임 닉네임으로만 가리킨다 —
--     캐릭터는 읽을 때 프로필에서 가져와 프로필을 고치면 신청에도 바로 보인다
--   arena_plans   : 한 주의 편성표 { <시간대 id>: [[{ u: 사용자 ID, n: 게임 닉네임 }, …], …] } — 관리자가 통째로 저장한다

begin;

create table public.site_admins (
  user_id text primary key check (user_id ~ '^(\d{17,20}|k\d{1,20})$'),
  note text
);

create table public.arena_signups (
  week date not null,
  user_id text not null references public.recruit_profiles (discord_user_id) on delete cascade,
  slots text[] not null,
  nicks text[] not null,
  memo text not null default '',
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,   -- 처음 신청한 순서 — 다시 저장해도 안 바뀐다(upsert 가 이 칸을 안 보낸다)
  updated_at bigint not null,
  primary key (week, user_id)
);
create index arena_signups_user on public.arena_signups (user_id, week desc);   -- 마이페이지 신청 이력

create table public.arena_plans (
  week date primary key,
  plan jsonb not null,
  updated_at bigint not null,        -- 화면이 들고 있다가 저장할 때 같이 보낸다 — 그새 다른 관리자가 고쳤으면 409
  updated_by text not null
);

alter table public.site_admins enable row level security;
alter table public.arena_signups enable row level security;
alter table public.arena_plans enable row level security;
revoke all on table public.site_admins, public.arena_signups, public.arena_plans from public, anon, authenticated;
grant select, insert, update, delete on table public.site_admins, public.arena_signups, public.arena_plans to service_role;

notify pgrst, 'reload schema';

commit;
