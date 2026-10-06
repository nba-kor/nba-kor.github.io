-- 조합표: 추천 티어를 빼고, 상대하기 편한 · 힘든 「조합」을 다른 조합 글 번호 대신 캐릭터 3명 세트로 바꾼다
-- (matchups.easy|hard.combos: [글 번호] → [[id, id, id]]). 함수 배포와 함께 넣는다 — 이 파일을 먼저 Run 하고 바로 배포.

begin;

alter table public.combos drop column tiers;

-- 바꾸기 전에 올라온 글의 상대 조합(글 번호)은 3명 세트로 옮길 수 없어 비운다
update public.combos
set matchups = jsonb_set(jsonb_set(matchups, '{easy,combos}', '[]'), '{hard,combos}', '[]')
where jsonb_typeof(matchups #> '{easy,combos,0}') = 'number' or jsonb_typeof(matchups #> '{hard,combos,0}') = 'number';

notify pgrst, 'reload schema';

commit;
