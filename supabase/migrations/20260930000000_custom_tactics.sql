-- 커스텀 전술. 전술판에서 고친 보드에 이름 · 설명을 붙여 올리면 다른 사람도 프리셋 목록(수비 전술 아래)에서 고른다.
-- 잠재력추천 · 영상과 같은 게시판 모양(글 · 좋아요)이고 댓글은 없다 — comments 칸은 공용 목록 쿼리 때문에 0 으로 둔다.

begin;

create table public.custom_tactics (
  id bigint generated always as identity primary key,
  author_id text not null check (author_id ~ '^\d{17,20}$'),   -- 디스코드 ID
  author_name text not null,         -- 쓸 때의 표시 이름(프로필 이름, 없으면 디스코드 이름)
  title text not null,               -- 전술 이름
  body text not null,                -- 전술 설명
  board jsonb not null,              -- { tokens: [{ key, side, label, playerId, x, y, routes }] } — 서버가 검증해 다시 만든 것
  preset text,                       -- 고치기 시작한 기본 전술 id(없으면 null)
  chars text[] not null,             -- 보드에 올린 선수 id — 나중에 캐릭터로 거를 때
  positions smallint[] not null,
  likes int not null default 0,
  comments int not null default 0,   -- 댓글은 없다. 게시판 공용 코드가 목록에서 같이 읽는다
  created_at bigint not null,
  updated_at bigint not null
);
create index custom_tactics_likes on public.custom_tactics (likes desc, id desc);   -- 프리셋 목록은 좋아요순

create table public.custom_tactic_likes (
  tactic_id bigint not null references public.custom_tactics (id) on delete cascade,
  user_id text not null,
  primary key (tactic_id, user_id)
);

create function public.custom_tactic_count() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.custom_tactics set likes = likes + case when tg_op = 'INSERT' then 1 else -1 end
   where id = case when tg_op = 'INSERT' then new.tactic_id else old.tactic_id end;
  return null;
end $$;
create trigger custom_tactic_likes_count after insert or delete on public.custom_tactic_likes for each row execute function public.custom_tactic_count();

-- 좋아요 켜기/끄기. 돌려주는 값: { liked, likes } — 없는 글은 PT404
create function public.custom_tactic_toggle_like(p_tactic bigint, p_user text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_liked boolean;
  v_likes int;
begin
  perform 1 from public.custom_tactics where id = p_tactic for update;
  if not found then
    raise sqlstate 'PT404' using message = 'not_found';
  end if;
  delete from public.custom_tactic_likes where tactic_id = p_tactic and user_id = p_user;
  v_liked := not found;
  if v_liked then
    insert into public.custom_tactic_likes (tactic_id, user_id) values (p_tactic, p_user);
  end if;
  select likes into v_likes from public.custom_tactics where id = p_tactic;
  return jsonb_build_object('liked', v_liked, 'likes', v_likes);
end $$;

alter table public.custom_tactics enable row level security;
alter table public.custom_tactic_likes enable row level security;
revoke all on table public.custom_tactics, public.custom_tactic_likes from public, anon, authenticated;
grant select, insert, update, delete on table public.custom_tactics, public.custom_tactic_likes to service_role;

revoke execute on function public.custom_tactic_count() from public, anon, authenticated;
revoke execute on function public.custom_tactic_toggle_like(bigint, text) from public, anon, authenticated;
grant execute on function public.custom_tactic_toggle_like(bigint, text) to service_role;

notify pgrst, 'reload schema';

commit;
