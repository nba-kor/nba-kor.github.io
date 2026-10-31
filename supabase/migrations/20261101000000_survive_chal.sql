-- 덩크 서바이버(/survive/) 챌린지 맵(chal — 시간 제한 없음)을 랭킹에 — 맵 검사에 더한다.
-- 함수를 배포하기 전에 넣는다(안 넣으면 챌린지 기록을 올릴 때 DB 가 막는다)

begin;

alter table public.survive_best drop constraint survive_best_map_check;
alter table public.survive_best add constraint survive_best_map_check check (map in ('park', 'arena', 'roof', 'chal'));

commit;
