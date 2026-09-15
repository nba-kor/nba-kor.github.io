-- 팀원모집 저장소. 같은 파일을 로컬(docker compose 첫 기동)과 Supabase 클라우드(SQL Editor 또는 supabase db push)에 쓴다.
-- 브라우저는 Supabase 에 붙지 않는다 — API 서버만 secret key(service_role)로 Data API 를 부른다.
-- 그래서 anon · authenticated 에는 아무 권한도 주지 않는다(publishable key 가 새도 읽을 수 있는 게 없다).

create table public.recruit_teams (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{8}$'),
  room jsonb not null,             -- { title, mic, mode, memo }
  tactic jsonb not null,           -- { preset, name, board }
  voice jsonb,                     -- { id, name } — 디스코드 링크는 보여줄 때 만든다
  password_hash text not null,     -- 팀장 비밀번호의 scrypt$솔트$해시. 비밀번호 자체는 저장하지 않는다
  created_at bigint not null,      -- epoch ms, 서버 시계 기준(테스트가 시간을 돌린다)
  expires_at bigint not null       -- 지나면 안 보이고 서버가 주기적으로 지운다. 연장 = 그 순간부터 다시 3시간
);

create table public.recruit_members (
  id bigint generated always as identity primary key,
  team_id text not null references public.recruit_teams (id) on delete cascade,
  discord text not null,
  entries jsonb not null,          -- [{ nick, tier, char }]
  token_hash text not null,        -- bearer 토큰의 sha256 hex. 토큰 자체는 저장하지 않는다
  leader boolean not null default false,
  joined_at bigint not null
);

-- 한 팀 안에서 디스코드 닉네임은 대소문자 무시 유일. team_id 가 앞이라 팀별 팀원 조회 · 인원 세기도 이 인덱스를 탄다
create unique index recruit_members_team_discord on public.recruit_members (team_id, lower(discord));
-- 모집 목록 · 잡힌 음성채널(expires_at > now) · 만료 청소(expires_at <= now)
create index recruit_teams_expires on public.recruit_teams (expires_at);

-- RLS 는 켜고 정책은 두지 않는다 = anon · authenticated 는 전부 거절. service_role 은 BYPASSRLS 라 영향 없다.
-- 프로젝트마다 public 기본 권한이 달라서(자동 공개 여부) 권한은 여기서 직접 정한다. service_role 도 GRANT 가 없으면 못 쓴다.
alter table public.recruit_teams enable row level security;
alter table public.recruit_members enable row level security;
revoke all on table public.recruit_teams, public.recruit_members from public, anon, authenticated;
-- update 는 가입 RPC 의 select ... for update 와 연장에 필요하다
grant select, insert, update, delete on table public.recruit_teams, public.recruit_members to service_role;

-- 팀원 수 — PostgREST 계산 필드. 목록을 recruit_member_count=lt.3 / gte.3 으로 나눠 모집 중인 방을 먼저 보여준다
create function public.recruit_member_count(t public.recruit_teams) returns bigint
language sql stable
set search_path = ''
as $$ select count(*) from public.recruit_members m where m.team_id = t.id $$;

-- 팀 + 팀장을 한 트랜잭션으로 넣고 팀장 member id 를 돌려준다
create function public.recruit_create_team(
  p_id text, p_room jsonb, p_tactic jsonb, p_voice jsonb, p_password_hash text,
  p_discord text, p_entries jsonb, p_token_hash text, p_now bigint, p_expires_at bigint
) returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_member bigint;
begin
  insert into public.recruit_teams (id, room, tactic, voice, password_hash, created_at, expires_at)
    values (p_id, p_room, p_tactic, p_voice, p_password_hash, p_now, p_expires_at);
  insert into public.recruit_members (team_id, discord, entries, token_hash, leader, joined_at)
    values (p_id, p_discord, p_entries, p_token_hash, true, p_now)
    returning id into v_member;
  return v_member;
end $$;

-- 가입. 팀 행을 잠가(for update) 같은 팀 가입을 줄 세운다 — "자리 확인 → insert" 사이에 다른 가입이 끼지 못해
-- 동시에 몰려도 정원을 넘지 않는다. 없거나 만료된 팀은 PT404, 다 찼으면 PT409 'full' — 서버가 한국어 문구로 바꾼다.
-- 같은 디스코드 닉네임은 insert 의 유니크 인덱스가 23505(HTTP 409)로 막는다.
create function public.recruit_join_team(
  p_team text, p_discord text, p_entries jsonb, p_token_hash text, p_now bigint, p_size int
) returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_member bigint;
begin
  perform 1 from public.recruit_teams where id = p_team and expires_at > p_now for update;
  if not found then
    raise sqlstate 'PT404' using message = 'not_found';
  end if;
  if (select count(*) from public.recruit_members where team_id = p_team) >= p_size then
    raise sqlstate 'PT409' using message = 'full';
  end if;
  insert into public.recruit_members (team_id, discord, entries, token_hash, joined_at)
    values (p_team, p_discord, p_entries, p_token_hash, p_now)
    returning id into v_member;
  return v_member;
end $$;

-- 함수 EXECUTE 는 Postgres 기본값이 PUBLIC 허용이라 함수마다 거둬야 한다
revoke execute on function public.recruit_member_count(public.recruit_teams) from public, anon, authenticated;
grant execute on function public.recruit_member_count(public.recruit_teams) to service_role;
revoke execute on function public.recruit_create_team(text, jsonb, jsonb, jsonb, text, text, jsonb, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.recruit_create_team(text, jsonb, jsonb, jsonb, text, text, jsonb, text, bigint, bigint) to service_role;
revoke execute on function public.recruit_join_team(text, text, jsonb, text, bigint, int) from public, anon, authenticated;
grant execute on function public.recruit_join_team(text, text, jsonb, text, bigint, int) to service_role;

-- PostgREST 스키마 캐시 새로고침(클라우드는 자동이지만 해가 없다)
notify pgrst, 'reload schema';
