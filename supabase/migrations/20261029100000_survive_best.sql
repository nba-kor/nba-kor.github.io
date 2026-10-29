-- 덩크 서바이버(/survive/) 랭킹 — 로그인한 사람마다 맵마다 최고 기록 한 줄.
--   survive_best:    함수가 한 판(맵 · 캐릭터 · 버틴 초 · 처치 · 레벨)을 받으면 더 나을 때만 바꾼다(오래 버틴 순, 같으면 많이 쓰러뜨린 순). 이름은 가장 최근 이름
--   survive_ranking: 맵마다 순위(rank — 같은 기록은 같은 순위)
-- 함수(service_role)만 읽고 쓴다. 함수를 배포하기 전에 넣는다(본인 탈퇴가 이 표의 줄도 지운다 — 표가 없으면 탈퇴가 실패한다)

begin;

create table public.survive_best (
  user_id text not null,
  map text not null check (map in ('park', 'arena', 'roof')),
  name text not null,
  hero text not null,
  secs int not null,
  kills int not null,
  lvl int not null,
  at bigint not null,
  primary key (user_id, map)
);
create index survive_best_rank on public.survive_best (map, secs desc, kills desc);

create view public.survive_ranking with (security_invoker = true) as
select user_id, map, name, hero, secs, kills, lvl, at, rank() over (partition by map order by secs desc, kills desc)::int as rank
from public.survive_best;

alter table public.survive_best enable row level security;
revoke all on table public.survive_best, public.survive_ranking from public, anon, authenticated;
grant select, insert, update, delete on table public.survive_best to service_role;
grant select on table public.survive_ranking to service_role;

notify pgrst, 'reload schema';

commit;
