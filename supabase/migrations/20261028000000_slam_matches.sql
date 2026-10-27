-- 슈퍼 슬램(/slam/) 온라인 1:1 대전 기록 · 랭킹.
--   slam_reports: 경기가 끝나면 두 사람이 각자 결과를 올린다(match = 방장이 만든 경기 번호). 두 줄이 서로를 가리키고 팀 · 점수가 같으면
--                 함수가 slam_matches 에 한 줄 넣고 두 줄을 지운다. 한쪽만 올린 줄(도중에 나감)은 하루 뒤 함수가 지운다
--   slam_matches: 기록된 경기. home = 방장(왼쪽 골대를 지킨다), away = 들어온 사람. 팀은 0~3(VIPERS_T · N · A · B)
--   slam_ranking: 사람별 승 · 패 · 무 — 이름은 가장 최근 경기의 이름
-- 함수(service_role)만 읽고 쓴다. 함수를 배포하기 전에 넣는다(옛 함수는 /api/slam 을 모른다 — 넣기만 해서는 아무 일도 없다)

begin;

create table public.slam_reports (
  match text not null,
  user_id text not null,
  user_name text not null,
  opp_id text not null,
  host boolean not null,
  teams smallint[] not null,
  score smallint[] not null,
  at bigint not null,
  primary key (match, user_id)
);
create index slam_reports_at on public.slam_reports (at);

create table public.slam_matches (
  id bigint generated always as identity primary key,
  match text not null unique,
  at bigint not null,
  home_id text not null,
  home_name text not null,
  home_team smallint not null,
  home_score smallint not null,
  away_id text not null,
  away_name text not null,
  away_team smallint not null,
  away_score smallint not null
);
create index slam_matches_at on public.slam_matches (at desc);

create view public.slam_ranking with (security_invoker = true) as
with sides as (
  select home_id as user_id, home_name as name, at, (home_score > away_score)::int as w, (home_score < away_score)::int as l from public.slam_matches
  union all
  select away_id, away_name, at, (away_score > home_score)::int, (away_score < home_score)::int from public.slam_matches
)
select user_id, (array_agg(name order by at desc))[1] as name, sum(w)::int as wins, sum(l)::int as losses, (count(*) - sum(w) - sum(l))::int as draws,
  count(*)::int as games, max(at) as last_at
from sides group by user_id;

alter table public.slam_reports enable row level security;
alter table public.slam_matches enable row level security;
revoke all on table public.slam_reports, public.slam_matches, public.slam_ranking from public, anon, authenticated;
grant select, insert, update, delete on table public.slam_reports to service_role;
grant select, insert, delete on table public.slam_matches to service_role;
grant select on table public.slam_ranking to service_role;

notify pgrst, 'reload schema';

commit;
