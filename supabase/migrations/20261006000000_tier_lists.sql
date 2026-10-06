-- 티어표 게시판. 영상(20260929000000_videos.sql)과 같은 모양 — 글 · 추천 · 댓글, 수는 글 행에 트리거로 센다.
-- 브라우저는 DB 에 붙지 않고 API 함수만 secret key(service_role)로 부른다.

begin;

create table public.tier_lists (
  id bigint generated always as identity primary key,
  author_id text not null check (author_id ~ '^\d{17,20}$'),   -- 디스코드 ID
  author_name text not null,         -- 쓸 때의 표시 이름(프로필 이름, 없으면 디스코드 이름). 고칠 때 다시 맞춘다
  title text not null,
  tiers jsonb not null,              -- [{ label, color, ids }] — 서버가 검증해 다시 만든 것. ids 는 미출시 선수도 된다
  chars text[] not null,             -- 올린 한국 서버 선수 id — 게시판 공용 목록 · 필터
  positions smallint[] not null,     -- chars 의 포지션 — 포지션 필터용. 서버가 선수 데이터로 채운다
  body text not null,
  likes int not null default 0,
  comments int not null default 0,
  created_at bigint not null,        -- epoch ms, 서버 시계 기준
  updated_at bigint not null
);
create index tier_lists_likes on public.tier_lists (likes desc, id desc);   -- 추천순 목록

create table public.tier_list_likes (
  list_id bigint not null references public.tier_lists (id) on delete cascade,
  user_id text not null,
  primary key (list_id, user_id)
);

create table public.tier_list_comments (
  id bigint generated always as identity primary key,
  list_id bigint not null references public.tier_lists (id) on delete cascade,
  author_id text not null,
  author_name text not null,
  body text not null,
  created_at bigint not null
);
create index tier_list_comments_list on public.tier_list_comments (list_id, id);

create function public.tier_list_count() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint := case when tg_op = 'INSERT' then new.list_id else old.list_id end;
  v_d int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  if tg_table_name = 'tier_list_likes' then
    update public.tier_lists set likes = likes + v_d where id = v_id;
  else
    update public.tier_lists set comments = comments + v_d where id = v_id;
  end if;
  return null;
end $$;
create trigger tier_list_likes_count after insert or delete on public.tier_list_likes for each row execute function public.tier_list_count();
create trigger tier_list_comments_count after insert or delete on public.tier_list_comments for each row execute function public.tier_list_count();

-- 추천 켜기/끄기. 돌려주는 값: { liked, likes } — 없는 글은 PT404
create function public.tier_list_toggle_like(p_list bigint, p_user text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_liked boolean;
  v_likes int;
begin
  perform 1 from public.tier_lists where id = p_list for update;
  if not found then
    raise sqlstate 'PT404' using message = 'not_found';
  end if;
  delete from public.tier_list_likes where list_id = p_list and user_id = p_user;
  v_liked := not found;
  if v_liked then
    insert into public.tier_list_likes (list_id, user_id) values (p_list, p_user);
  end if;
  select likes into v_likes from public.tier_lists where id = p_list;
  return jsonb_build_object('liked', v_liked, 'likes', v_likes);
end $$;

alter table public.tier_lists enable row level security;
alter table public.tier_list_likes enable row level security;
alter table public.tier_list_comments enable row level security;
revoke all on table public.tier_lists, public.tier_list_likes, public.tier_list_comments from public, anon, authenticated;
grant select, insert, update, delete on table public.tier_lists, public.tier_list_likes, public.tier_list_comments to service_role;

revoke execute on function public.tier_list_count() from public, anon, authenticated;
revoke execute on function public.tier_list_toggle_like(bigint, text) from public, anon, authenticated;
grant execute on function public.tier_list_toggle_like(bigint, text) to service_role;

notify pgrst, 'reload schema';

commit;
