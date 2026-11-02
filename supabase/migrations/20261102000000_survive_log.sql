-- 덩크 서바이버(/survive/) 리더보드의 최근 기록 · 구매 내역.
--   survive_runs: 로그인한 사람이 올린 판 한 줄씩 — 맵 · 캐릭터 · 버틴 초 · 처치 · 레벨 · 스킬 · 받은 포인트(pts — 함수가 처치 · 레벨 · 시간으로 셈한다). 이름은 그때 이름
--   survive_buys: 포인트로 산 스킨 — 스킨 id · 낸 포인트(사람마다 스킨마다 한 줄)
-- 함수(service_role)만 읽고 쓴다. 함수를 배포하기 전에 넣는다(탈퇴가 이 표의 줄도 지운다 — 표가 없으면 탈퇴가 실패한다)

begin;

create table public.survive_runs (
  id bigint generated always as identity primary key,
  user_id text not null,
  name text not null,
  map text not null check (map in ('park', 'arena', 'roof', 'chal')),
  hero text not null,
  secs int not null,
  kills int not null,
  lvl int not null,
  skills text[] not null default '{}',
  pts int not null,
  at bigint not null
);
create index survive_runs_at on public.survive_runs (at desc);
create index survive_runs_user on public.survive_runs (user_id, at desc);

create table public.survive_buys (
  id bigint generated always as identity primary key,
  user_id text not null,
  name text not null,
  skin text not null,
  price int not null,
  at bigint not null,
  unique (user_id, skin)
);
create index survive_buys_at on public.survive_buys (at desc);

alter table public.survive_runs enable row level security;
alter table public.survive_buys enable row level security;
revoke all on table public.survive_runs, public.survive_buys from public, anon, authenticated;
grant select, insert, update, delete on table public.survive_runs, public.survive_buys to service_role;

notify pgrst, 'reload schema';

commit;
