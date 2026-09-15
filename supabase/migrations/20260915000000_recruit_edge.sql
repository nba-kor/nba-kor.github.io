-- API 가 Supabase Edge Function 으로 옮겨 가며, 서버 메모리에 있던 상태를 DB 로 옮긴다.
-- 워커(isolate)는 요청마다 새로 뜨거나 여러 개가 동시에 돌아서 메모리 카운터 · 프로세스 안 줄 세우기를 믿을 수 없다.
--   1) recruit_hits + recruit_hit : 요청 수 제한 · 틀린 비밀번호 횟수
--   2) recruit_create_team 교체   : 음성채널 고르기를 DB 잠금 안에서 하고, 만료된 팀 청소도 여기서 한다(주기 청소 없음)
-- SQL Editor · Management API 는 트랜잭션으로 감싸 주지 않는다 — drop 과 create 사이에서 끊기지 않게 직접 감싼다.

begin;

-- 고정 창 카운터. key 예: 'w 1.2.3.4'(쓰기 요청) · 'pw <team> <ip>'(한 IP 의 틀린 비밀번호) · 'pwt <team>'(팀 전체)
create table public.recruit_hits (
  key text primary key,
  n int not null,
  reset_at bigint not null   -- epoch ms. 지나면 다음 호출이 0 부터 다시 센다
);
alter table public.recruit_hits enable row level security;
revoke all on table public.recruit_hits from public, anon, authenticated;
grant select, insert, update, delete on table public.recruit_hits to service_role;

-- n 에 p_add 를 더해 돌려준다(되돌리기는 -1). 창이 끝났으면 0 에서 다시. 0 밑으로는 안 내려간다.
-- INSERT ... ON CONFLICT DO UPDATE 한 문장이라 같은 키 동시 호출도 행 잠금으로 줄을 선다.
create function public.recruit_hit(p_key text, p_now bigint, p_window bigint, p_add int default 1)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int;
begin
  insert into public.recruit_hits as h (key, n, reset_at)
    values (p_key, greatest(0, p_add), p_now + p_window)
  on conflict (key) do update set
    n        = case when p_now >= h.reset_at then greatest(0, p_add) else greatest(0, h.n + p_add) end,
    reset_at = case when p_now >= h.reset_at then p_now + p_window else h.reset_at end
  returning n into v_n;
  return v_n;
end $$;

-- 팀 만들기: 음성채널 후보(p_rooms, 앞이 우선 = 끝 방부터 [{id, name}])를 받아 만료 전 팀이 안 잡은 첫 방을 DB 안에서 고른다.
-- 전역 advisory lock 으로 "고르기 → insert" 를 줄 세운다. commit 때 풀리므로 다음 호출은 앞 팀의 행을 본다(VOLATILE 이라 문장마다 새 스냅샷).
-- 돌려주는 값: { member: 팀장 member id, voice: {id, name} | null }
drop function public.recruit_create_team(text, jsonb, jsonb, jsonb, text, text, jsonb, text, bigint, bigint);
create function public.recruit_create_team(
  p_id text, p_room jsonb, p_tactic jsonb, p_rooms jsonb, p_password_hash text,
  p_discord text, p_entries jsonb, p_token_hash text, p_now bigint, p_expires_at bigint
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_voice jsonb;
  v_member bigint;
begin
  -- ponytail: 전역 잠금 = 팀 만들기가 한 줄로 선다. 초당 수십 건을 넘으면 방 id 별 잠금으로
  perform pg_advisory_xact_lock(hashtext('recruit_voice'));
  -- 만료 청소도 여기서(잠금 안 · expires_at 인덱스). 팀원은 cascade. 읽기는 전부 expires_at > now 로 걸러 청소 전에도 안 보인다
  delete from public.recruit_teams where expires_at <= p_now;
  delete from public.recruit_hits where reset_at <= p_now;
  -- created_at 조건은 일부러 뺀다: 워커마다 시계가 조금 달라 p_now 가 앞 팀 created_at 보다 작으면 같은 방을 준다
  select jsonb_build_object('id', r.c->>'id', 'name', r.c->>'name') into v_voice
    from jsonb_array_elements(coalesce(p_rooms, '[]')) with ordinality as r(c, i)
   where not exists (select 1 from public.recruit_teams t where t.voice->>'id' = r.c->>'id' and t.expires_at > p_now)
   order by r.i
   limit 1;
  insert into public.recruit_teams (id, room, tactic, voice, password_hash, created_at, expires_at)
    values (p_id, p_room, p_tactic, v_voice, p_password_hash, p_now, p_expires_at);
  insert into public.recruit_members (team_id, discord, entries, token_hash, leader, joined_at)
    values (p_id, p_discord, p_entries, p_token_hash, true, p_now)
    returning id into v_member;
  return jsonb_build_object('member', v_member, 'voice', v_voice);
end $$;

-- 함수 EXECUTE 는 Postgres 기본값이 PUBLIC 허용이라 함수마다 거둬야 한다
revoke execute on function public.recruit_hit(text, bigint, bigint, int) from public, anon, authenticated;
grant execute on function public.recruit_hit(text, bigint, bigint, int) to service_role;
revoke execute on function public.recruit_create_team(text, jsonb, jsonb, jsonb, text, text, jsonb, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.recruit_create_team(text, jsonb, jsonb, jsonb, text, text, jsonb, text, bigint, bigint) to service_role;

-- PostgREST 스키마 캐시 새로고침(commit 때 전달된다)
notify pgrst, 'reload schema';

commit;
