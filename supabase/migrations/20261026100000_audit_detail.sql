-- 감사 로그를 자세히 — 무슨 일(label, 한글 이름 · 예 '아레나 편성 저장') · 무엇에(target · 글 제목 · 멤버 이름 · 주) · 바뀐 내용 줄(detail, 문자열 배열 · 60줄까지).
--   예) label '프로필 저장', target '갓보노', detail ["Vp_Barcode 포지션: 센터 · 중열 → 올포", "Vp_Barcode 캐릭터 +할리버튼"]
--   예) label '아레나 편성 저장', target '2026-10-31 주', detail ["Havel: 토 1차 1팀 → 토 1.5차 2팀", "+하제: 토 2차 1팀", "−Vegas_01: 토 1차 1팀"]
-- 마이페이지의 「변경 기록」(슈퍼관리자만)이 읽는다. 함수를 배포하기 전에 넣는다 — 새 칸이 없으면 로그를 남기지 못한다(요청은 그대로 된다)

begin;

alter table public.audit_log
  add column label text,
  add column target text,
  add column detail jsonb;

notify pgrst, 'reload schema';

commit;
