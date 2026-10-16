-- 사이트 접근 비밀번호 · 마스터. 함수 배포보다 먼저 넣는다(함수가 요청마다 site_gate 를 읽는다).
--   site_gate: 한 줄. 없으면 접근 비밀번호가 꺼져 있다(누구나 들어온다). 마스터가 내 프로필에서 처음 정하면 생긴다.
--     code 는 회원끼리 나눠 쓰는 공용 비밀번호라 해시하지 않는다 — 마스터가 내 프로필에서 지금 값을 보고 단톡방에 다시 알려 줄 수 있게.
--     token 은 비밀번호를 맞힌 브라우저가 들고 다니는 값. 비밀번호를 바꿀 때마다 새로 만들어 모두 다시 입력하게 한다
--   site_masters: 접근 비밀번호를 보고 바꿀 수 있는 계정(디스코드 ID · k<카카오 회원번호>). 화면은 없다 — 아래처럼 SQL 로 넣고 뺀다
--     insert into public.site_masters (user_id, note) values ('<디스코드 ID>', '<누구>');
-- 끄기: delete from public.site_gate;  (다른 워커는 길어야 30초 뒤에 안다)

begin;

create table public.site_gate (
  id int primary key default 1 check (id = 1),
  code text not null check (char_length(code) between 4 and 32),
  token text not null,
  changed_at bigint not null,
  changed_by text not null
);

create table public.site_masters (
  user_id text primary key check (user_id ~ '^(\d{17,20}|k\d{1,20})$'),
  note text
);

alter table public.site_gate enable row level security;
alter table public.site_masters enable row level security;
revoke all on table public.site_gate, public.site_masters from public, anon, authenticated;
grant select, insert, update, delete on table public.site_gate, public.site_masters to service_role;

insert into public.site_masters (user_id, note) values ('296599152379428864', '갓보노');

notify pgrst, 'reload schema';

commit;
