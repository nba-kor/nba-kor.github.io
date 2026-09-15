-- 비밀번호 · 브라우저 토큰을 디스코드 계정으로 바꾼다. 웹(Supabase Auth 디스코드 로그인)과 TNAB 봇이 같은 파티 목록을 쓴다.
--   recruit_profiles : 디스코드 계정 하나 = 프로필 하나(계정 줄 · 개인 마이크). 파티에는 이 프로필을 조인해 보여준다
--   recruit_members  : unique(discord_user_id) = 1인 1파티를 DB 가 보장한다
-- 옛 팀 · 팀원 표는 통째로 버린다(클라우드에 적용하기 직전에 팀이 0개인지 확인한다). recruit_hits · recruit_hit 는 그대로 쓴다.

begin;

drop function public.recruit_create_team(text, jsonb, jsonb, jsonb, text, text, jsonb, text, bigint, bigint);
drop function public.recruit_join_team(text, text, jsonb, text, bigint, int);
drop function public.recruit_member_count(public.recruit_teams);
drop table public.recruit_members;
drop table public.recruit_teams;

-- 디스코드 ID 는 문자열 — JS number 는 snowflake(최대 20자리) 정밀도를 잃는다
create table public.recruit_profiles (
  discord_user_id text primary key check (discord_user_id ~ '^\d{17,20}$'),
  auth_user_id uuid unique,          -- 웹 로그인 계정(auth.users.id). 봇으로만 쓴 사람은 null
  discord_name text not null,        -- 표시 이름. 요청마다 신원(디스코드)에서 갱신한다
  mic boolean not null,              -- 개인 마이크 O/X
  entries jsonb not null,            -- [{ nick, tier, char }] 1~3줄, 첫 줄 대표
  created_at bigint not null,        -- epoch ms, 서버 시계 기준
  updated_at bigint not null
);

create table public.recruit_teams (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{8}$'),
  room jsonb not null,               -- { title, mic: required|listen|off, mode: fun|serious, memo }
  tactic jsonb not null,             -- { preset, name, board }
  voice jsonb,                       -- { id, name } — 디스코드 링크는 보여줄 때 만든다
  created_at bigint not null,
  expires_at bigint not null         -- 지나면 안 보이고 만들기 · 가입 RPC 가 지운다. 연장 = 그 순간부터 다시 3시간
);
-- 모집 목록 · 잡힌 음성채널(expires_at > now) · 만료 청소(expires_at <= now)
create index recruit_teams_expires on public.recruit_teams (expires_at);

-- 팀별 조회는 기본 키(team_id 가 앞), 사람별 조회는 unique(discord_user_id) 인덱스를 탄다
create table public.recruit_members (
  team_id text not null references public.recruit_teams (id) on delete cascade,
  discord_user_id text not null unique references public.recruit_profiles (discord_user_id) on delete cascade,
  leader boolean not null default false,
  joined_at bigint not null,
  primary key (team_id, discord_user_id)
);

-- RLS 는 켜고 정책은 두지 않는다 = anon · authenticated 는 전부 거절. service_role 은 BYPASSRLS 라 영향 없다
alter table public.recruit_profiles enable row level security;
alter table public.recruit_teams enable row level security;
alter table public.recruit_members enable row level security;
revoke all on table public.recruit_profiles, public.recruit_teams, public.recruit_members from public, anon, authenticated;
grant select, insert, update, delete on table public.recruit_profiles, public.recruit_teams, public.recruit_members to service_role;

-- 팀원 수 — PostgREST 계산 필드. 목록을 recruit_member_count=lt.3 / gte.3 으로 나눠 모집 중인 방을 먼저 보여준다
create function public.recruit_member_count(t public.recruit_teams) returns bigint
language sql stable
set search_path = ''
as $$ select count(*) from public.recruit_members m where m.team_id = t.id $$;

-- 프로필 저장. 같은 웹 계정(auth)이 다른 디스코드 ID 로 옮겨 붙었으면 옛 프로필의 연결만 끊는다(unique 충돌 대신).
-- 봇은 auth 를 모른다(null) — 이미 있는 연결은 그대로 둔다
create function public.recruit_upsert_profile(p_user text, p_auth uuid, p_name text, p_mic boolean, p_entries jsonb, p_now bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_auth is not null then
    update public.recruit_profiles set auth_user_id = null where auth_user_id = p_auth and discord_user_id <> p_user;
  end if;
  insert into public.recruit_profiles as p (discord_user_id, auth_user_id, discord_name, mic, entries, created_at, updated_at)
    values (p_user, p_auth, p_name, p_mic, p_entries, p_now, p_now)
  on conflict (discord_user_id) do update set
    auth_user_id = coalesce(excluded.auth_user_id, p.auth_user_id),
    discord_name = excluded.discord_name,
    mic = excluded.mic,
    entries = excluded.entries,
    updated_at = excluded.updated_at;
end $$;

-- 팀 만들기. 전역 advisory lock 으로 만들기 · 가입을 한 줄로 세운다 — 음성채널 "고르기 → insert" 와 1인 1파티 "빠지기 → 넣기" 사이에
-- 다른 요청이 끼지 못한다. commit 때 풀리므로 다음 호출은 앞 요청의 결과를 본다(VOLATILE 이라 문장마다 새 스냅샷).
-- 음성채널 후보(p_rooms, 앞이 우선 = 끝 방부터 [{id, name}]) 중 만료 전 팀이 안 잡은 첫 방을 준다.
-- 돌려주는 값: { voice: {id, name} | null, left: {teamId, disbanded} | null }
create function public.recruit_create_team(
  p_id text, p_actor text, p_room jsonb, p_tactic jsonb, p_rooms jsonb, p_now bigint, p_expires_at bigint
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_voice jsonb;
  v_left jsonb;
  v_team text;
  v_leader boolean;
begin
  -- ponytail: 전역 잠금 = 만들기 · 가입이 한 줄로 선다. 초당 수십 건을 넘으면 사람 · 방 id 별 잠금으로
  perform pg_advisory_xact_lock(hashtext('recruit_voice'));
  -- 만료 청소도 여기서(잠금 안 · expires_at 인덱스). 팀원은 cascade. 읽기는 전부 expires_at > now 로 걸러 청소 전에도 안 보인다
  delete from public.recruit_teams where expires_at <= p_now;
  delete from public.recruit_hits where reset_at <= p_now;
  perform 1 from public.recruit_profiles where discord_user_id = p_actor;
  if not found then
    raise sqlstate 'PT428' using message = 'no_profile';
  end if;
  -- 1인 1파티: 기존 팀에서 빠진다. 팀장이었으면 그 팀은 해제(팀장이 빠지면 해제 — 웹 규칙)
  select m.team_id, m.leader into v_team, v_leader from public.recruit_members m where m.discord_user_id = p_actor;
  if found then
    if v_leader then
      delete from public.recruit_teams where id = v_team;
    else
      delete from public.recruit_members where team_id = v_team and discord_user_id = p_actor;
    end if;
    v_left := jsonb_build_object('teamId', v_team, 'disbanded', v_leader);
  end if;
  -- created_at 조건은 일부러 뺀다: 워커마다 시계가 조금 달라 p_now 가 앞 팀 created_at 보다 작으면 같은 방을 준다
  select jsonb_build_object('id', r.c->>'id', 'name', r.c->>'name') into v_voice
    from jsonb_array_elements(coalesce(p_rooms, '[]')) with ordinality as r(c, i)
   where not exists (select 1 from public.recruit_teams t where t.voice->>'id' = r.c->>'id' and t.expires_at > p_now)
   order by r.i
   limit 1;
  insert into public.recruit_teams (id, room, tactic, voice, created_at, expires_at)
    values (p_id, p_room, p_tactic, v_voice, p_now, p_expires_at);
  insert into public.recruit_members (team_id, discord_user_id, leader, joined_at)
    values (p_id, p_actor, true, p_now);
  return jsonb_build_object('voice', v_voice, 'left', v_left);
end $$;

-- 가입. 만들기와 같은 잠금 안에서: 없거나 만료 PT404 · 이미 이 팀 PT409 'already' · 다 참 PT409 'full' → 기존 팀에서 빠지기 → insert.
-- 이미 이 팀이면 앞에서 걸러지므로 기존 팀 처리가 대상 팀의 인원을 바꾸는 일은 없다.
-- 돌려주는 값: { left: {teamId, disbanded} | null, count: 넣은 뒤 인원 } — count 는 서버가 "모집 완료" 알림을 한 번만 보내는 데 쓴다
create function public.recruit_join_team(p_team text, p_actor text, p_now bigint, p_size int)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_left jsonb;
  v_team text;
  v_leader boolean;
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext('recruit_voice'));
  delete from public.recruit_teams where expires_at <= p_now;
  perform 1 from public.recruit_profiles where discord_user_id = p_actor;
  if not found then
    raise sqlstate 'PT428' using message = 'no_profile';
  end if;
  perform 1 from public.recruit_teams where id = p_team and expires_at > p_now for update;
  if not found then
    raise sqlstate 'PT404' using message = 'not_found';
  end if;
  select m.team_id, m.leader into v_team, v_leader from public.recruit_members m where m.discord_user_id = p_actor;
  if v_team = p_team then
    raise sqlstate 'PT409' using message = 'already';
  end if;
  select count(*) into v_count from public.recruit_members where team_id = p_team;
  if v_count >= p_size then
    raise sqlstate 'PT409' using message = 'full';
  end if;
  if v_team is not null then
    if v_leader then
      delete from public.recruit_teams where id = v_team;
    else
      delete from public.recruit_members where team_id = v_team and discord_user_id = p_actor;
    end if;
    v_left := jsonb_build_object('teamId', v_team, 'disbanded', v_leader);
  end if;
  insert into public.recruit_members (team_id, discord_user_id, joined_at) values (p_team, p_actor, p_now);
  return jsonb_build_object('left', v_left, 'count', v_count + 1);
end $$;

-- 함수 EXECUTE 는 Postgres 기본값이 PUBLIC 허용이라 함수마다 거둬야 한다
revoke execute on function public.recruit_member_count(public.recruit_teams) from public, anon, authenticated;
grant execute on function public.recruit_member_count(public.recruit_teams) to service_role;
revoke execute on function public.recruit_upsert_profile(text, uuid, text, boolean, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.recruit_upsert_profile(text, uuid, text, boolean, jsonb, bigint) to service_role;
revoke execute on function public.recruit_create_team(text, text, jsonb, jsonb, jsonb, bigint, bigint) from public, anon, authenticated;
grant execute on function public.recruit_create_team(text, text, jsonb, jsonb, jsonb, bigint, bigint) to service_role;
revoke execute on function public.recruit_join_team(text, text, bigint, int) from public, anon, authenticated;
grant execute on function public.recruit_join_team(text, text, bigint, int) to service_role;

-- PostgREST 스키마 캐시 새로고침(commit 때 전달된다)
notify pgrst, 'reload schema';

commit;
