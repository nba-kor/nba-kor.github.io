-- 덩크 서바이버 랭킹에 그 판에 든 스킬 — 끝날 때 가진 스킬 id(6칸까지, 돌파는 'block+'). 예전 기록은 빈 목록.
-- 함수를 배포하기 전에 넣는다(함수가 랭킹에서 skills 를 읽는다)

begin;

alter table public.survive_best add column skills text[] not null default '{}';

create or replace view public.survive_ranking with (security_invoker = true) as
select user_id, map, name, hero, secs, kills, lvl, at, rank() over (partition by map order by secs desc, kills desc)::int as rank, skills
from public.survive_best;

notify pgrst, 'reload schema';

commit;
