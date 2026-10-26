-- 감사 로그 — 사이트에서 무언가를 바꾼 요청(GET 이 아니고 2xx 로 끝난 것)마다 한 줄. 함수가 응답한 뒤에(waitUntil) 넣는다.
--   누가: user_id(디스코드 ID · k<카카오> · g<비회원 팀원>) · user_name(그때의 표시 이름). 로그인 없이 하는 비회원 만들기 · 가입은 둘 다 null
--   무엇: action = '<메서드> <경로>' — 경로에 글 · 팀 · 사람 번호가 들어 있다(예: 'PUT /api/arena/plan', 'DELETE /api/builds/12', 'PUT /api/members/<ID>')
--   본문은 남기지 않는다 — 비회원 비밀번호 · 접근 비밀번호를 싣는 요청이 있다. 접근 비밀번호 입력(POST /api/gate)은 바꾸는 일이 아니라 남기지 않는다
--   함수(service_role)는 넣고 읽기만 한다 — 고치거나 지울 권한이 없다
-- 보기: 대시보드 Table Editor 의 audit_log, 또는 SQL Editor 에서
--   select to_timestamp(at / 1000.0) at time zone 'Asia/Seoul' as kst, user_name, user_id, action, status from public.audit_log order by at desc limit 200;
-- ponytail: 지우지 않고 쌓인다(한 줄 100바이트 남짓) — DB 가 500MB 에 가까워지면 SQL Editor 에서 오래된 줄을 지운다

begin;

create table public.audit_log (
  id bigint generated always as identity primary key,
  at bigint not null,
  user_id text,
  user_name text,
  action text not null,
  status smallint not null
);
create index audit_log_at on public.audit_log (at desc);
create index audit_log_user on public.audit_log (user_id, at desc);

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from public, anon, authenticated;
grant select, insert on table public.audit_log to service_role;

notify pgrst, 'reload schema';

commit;
