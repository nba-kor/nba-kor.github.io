-- 아레나 FA(시간 미정 · 용병)를 토요일 · 일요일로 나눈다 — 'flex' 하나였던 것을 'satfa' · 'sunfa' 로.
-- 예전에 FA 를 고른 신청(지난 주 이력까지)은 두 요일 다 고른 것으로 바꾼다. 'flex' 는 늘 맨 뒤였고(사유불참과는 같이 못 고른다) 새 두 id 도 맨 뒤라 순서가 그대로다.
-- 함수를 배포한 다음에 넣는다(예전 함수는 satfa · sunfa 를 모른다).

update public.arena_signups set slots = array_remove(slots, 'flex') || array['satfa', 'sunfa'] where 'flex' = any (slots);
