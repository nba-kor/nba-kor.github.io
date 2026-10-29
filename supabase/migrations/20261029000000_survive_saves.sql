-- 덩크 서바이버(/survive/) 업적 · 기록 — 로그인한 사람마다 한 줄. 비로그인은 브라우저(localStorage)에만 두고, 로그인하면 합쳐서 여기 올린다.
--   ach   = { 업적 이름: 처음 단 시각(ms) }
--   stats = { 기록 이름: 수 } — 누적 처치 · 판 수 · 맵별 최고 버틴 시간 · 해 본 캐릭터 등. 합칠 때는 큰 쪽
-- 함수(service_role)만 읽고 쓴다. 함수를 배포하기 전에 넣는다(본인 탈퇴가 이 표의 줄도 지운다 — 표가 없으면 탈퇴가 실패한다)

begin;

create table public.survive_saves (
  user_id text primary key,
  ach jsonb not null,
  stats jsonb not null,
  updated_at bigint not null
);

alter table public.survive_saves enable row level security;
revoke all on table public.survive_saves from public, anon, authenticated;
grant select, insert, update, delete on table public.survive_saves to service_role;

notify pgrst, 'reload schema';

commit;
