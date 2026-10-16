-- 카카오 로그인 · 비회원 팀원모집. 함수 배포보다 먼저 넣는다(팀 조회가 새 칸을 읽는다).
--   1) 사용자 ID 가 디스코드 snowflake 말고 k<카카오 회원번호>(카카오로만 로그인한 사람)일 수도 있다.
--      칸 이름(discord_user_id · author_id)은 그대로 둔다 — 디스코드를 연결한 사람은 여전히 디스코드 ID 다
--   2) recruit_members 에 계정 없는 팀원 — 비회원(비밀번호로 고치고 지운다)과 팀장이 직접 넣은 팀원(비밀번호 없음).
--      프로필 대신 guest 에 { name, mic, entries[, added] } 를 바로 담는다. 계정 팀원은 지금처럼 프로필을 조인한다
--   3) 만들기 · 가입 RPC 가 비회원과 참가 캐릭터(entry)를 받는다 — 따로 하던 entry PATCH 가 없어진다

begin;

-- 1)
alter table public.recruit_profiles drop constraint recruit_profiles_discord_user_id_check,
  add constraint recruit_profiles_discord_user_id_check check (discord_user_id ~ '^(\d{17,20}|k\d{1,20})$');
alter table public.potential_builds drop constraint potential_builds_author_id_check,
  add constraint potential_builds_author_id_check check (author_id ~ '^(\d{17,20}|k\d{1,20})$');
alter table public.videos drop constraint videos_author_id_check,
  add constraint videos_author_id_check check (author_id ~ '^(\d{17,20}|k\d{1,20})$');
alter table public.custom_tactics drop constraint custom_tactics_author_id_check,
  add constraint custom_tactics_author_id_check check (author_id ~ '^(\d{17,20}|k\d{1,20})$');
alter table public.tier_lists drop constraint tier_lists_author_id_check,
  add constraint tier_lists_author_id_check check (author_id ~ '^(\d{17,20}|k\d{1,20})$');
alter table public.combos drop constraint combos_author_id_check,
  add constraint combos_author_id_check check (author_id ~ '^(\d{17,20}|k\d{1,20})$');

-- 2) 계정 없는 팀원은 discord_user_id 가 null 이라 기본 키를 행 번호로 바꾼다. unique(discord_user_id) = 1인 1파티는 계정 팀원에게만 걸린다(null 은 겹쳐도 된다)
alter table public.recruit_members drop constraint recruit_members_pkey;
alter table public.recruit_members alter column discord_user_id drop not null;
alter table public.recruit_members
  add column id bigint generated always as identity primary key,   -- API 의 비회원 userId = 'g' || id
  add column guest jsonb,       -- 계정 없는 팀원: { name, mic(팀장이 넣었으면 null), entries, added(팀장이 넣었으면 true) }
  add column pw_hash text,      -- 비회원 관리 비밀번호 scrypt$<salt>$<hash>. 팀장이 넣은 팀원은 null(팀장만 뺄 수 있다)
  add constraint recruit_members_who check ((discord_user_id is null) <> (guest is null));
-- 팀별 조회 — 옛 기본 키(team_id, discord_user_id)가 하던 일
create index recruit_members_team on public.recruit_members (team_id);

-- 3) 팀 만들기. p_actor = 계정 ID. 비회원이면 null 이고 p_guest · p_pw 로 팀장 행을 만든다(프로필 확인 · 1인 1파티 없음 — 계정이 없다).
-- p_entry = 참가 캐릭터(프로필 · guest entries 의 몇 번째 줄). 잠금 · 청소 · 음성채널 고르기는 앞 버전과 같다.
-- 돌려주는 값: { voice: {id, name} | null, left: {teamId, disbanded} | null, member: 팀장 행 id }
drop function public.recruit_create_team(text, text, jsonb, jsonb, jsonb, bigint, bigint);
create function public.recruit_create_team(
  p_id text, p_actor text, p_room jsonb, p_tactic jsonb, p_rooms jsonb, p_now bigint, p_expires_at bigint,
  p_entry int default 0, p_guest jsonb default null, p_pw text default null
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
  v_member bigint;
begin
  -- ponytail: 전역 잠금 = 만들기 · 가입이 한 줄로 선다. 초당 수십 건을 넘으면 사람 · 방 id 별 잠금으로
  perform pg_advisory_xact_lock(hashtext('recruit_voice'));
  delete from public.recruit_teams where expires_at <= p_now;
  delete from public.recruit_hits where reset_at <= p_now;
  if p_actor is not null then
    perform 1 from public.recruit_profiles where discord_user_id = p_actor;
    if not found then
      raise sqlstate 'PT428' using message = 'no_profile';
    end if;
    -- 1인 1파티: 기존 팀에서 빠진다. 팀장이었으면 그 팀은 해제
    select m.team_id, m.leader into v_team, v_leader from public.recruit_members m where m.discord_user_id = p_actor;
    if found then
      if v_leader then
        delete from public.recruit_teams where id = v_team;
      else
        delete from public.recruit_members where team_id = v_team and discord_user_id = p_actor;
      end if;
      v_left := jsonb_build_object('teamId', v_team, 'disbanded', v_leader);
    end if;
  end if;
  -- created_at 조건은 일부러 뺀다: 워커마다 시계가 조금 달라 p_now 가 앞 팀 created_at 보다 작으면 같은 방을 준다
  select jsonb_build_object('id', r.c->>'id', 'name', r.c->>'name') into v_voice
    from jsonb_array_elements(coalesce(p_rooms, '[]')) with ordinality as r(c, i)
   where not exists (select 1 from public.recruit_teams t where t.voice->>'id' = r.c->>'id' and t.expires_at > p_now)
   order by r.i
   limit 1;
  insert into public.recruit_teams (id, room, tactic, voice, created_at, expires_at)
    values (p_id, p_room, p_tactic, v_voice, p_now, p_expires_at);
  insert into public.recruit_members (team_id, discord_user_id, guest, pw_hash, leader, joined_at, entry)
    values (p_id, p_actor, p_guest, p_pw, true, p_now, p_entry)
    returning id into v_member;
  return jsonb_build_object('voice', v_voice, 'left', v_left, 'member', v_member);
end $$;

-- 가입. 계정(p_actor)이면 앞 버전과 같고, 비회원 · 팀장이 넣는 팀원(p_actor null, p_guest)은 정원만 본다.
-- 돌려주는 값: { left, count: 넣은 뒤 인원, member: 넣은 행 id }
drop function public.recruit_join_team(text, text, bigint, int);
create function public.recruit_join_team(
  p_team text, p_actor text, p_now bigint, p_size int, p_entry int default 0, p_guest jsonb default null, p_pw text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_left jsonb;
  v_team text;
  v_leader boolean;
  v_count int;
  v_member bigint;
begin
  perform pg_advisory_xact_lock(hashtext('recruit_voice'));
  delete from public.recruit_teams where expires_at <= p_now;
  if p_actor is not null then
    perform 1 from public.recruit_profiles where discord_user_id = p_actor;
    if not found then
      raise sqlstate 'PT428' using message = 'no_profile';
    end if;
  end if;
  perform 1 from public.recruit_teams where id = p_team and expires_at > p_now for update;
  if not found then
    raise sqlstate 'PT404' using message = 'not_found';
  end if;
  if p_actor is not null then
    select m.team_id, m.leader into v_team, v_leader from public.recruit_members m where m.discord_user_id = p_actor;
    if v_team = p_team then
      raise sqlstate 'PT409' using message = 'already';
    end if;
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
  insert into public.recruit_members (team_id, discord_user_id, guest, pw_hash, joined_at, entry)
    values (p_team, p_actor, p_guest, p_pw, p_now, p_entry)
    returning id into v_member;
  return jsonb_build_object('left', v_left, 'count', v_count + 1, 'member', v_member);
end $$;

revoke execute on function public.recruit_create_team(text, text, jsonb, jsonb, jsonb, bigint, bigint, int, jsonb, text) from public, anon, authenticated;
grant execute on function public.recruit_create_team(text, text, jsonb, jsonb, jsonb, bigint, bigint, int, jsonb, text) to service_role;
revoke execute on function public.recruit_join_team(text, text, bigint, int, int, jsonb, text) from public, anon, authenticated;
grant execute on function public.recruit_join_team(text, text, bigint, int, int, jsonb, text) to service_role;

notify pgrst, 'reload schema';

commit;
