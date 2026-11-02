-- 향우회(캐릭터별 커뮤니티 게시판). 영상(20260929000000_videos.sql)과 같은 모양 — 글 · 추천 · 댓글, 수는 글 행에 트리거로 센다.
-- 더한 것: 질문답변 글의 채택(adopted — 쓴 사람이 댓글 하나를 고른다, 한 번 고르면 못 바꾼다)과 내공 랭킹(채택된 답변 수, 캐릭터마다 · 전체).
-- 브라우저는 DB 에 붙지 않고 API 함수만 secret key(service_role)로 부른다.

begin;

create table public.club_posts (
  id bigint generated always as identity primary key,
  author_id text not null check (author_id ~ '^(\d{17,20}|k\d{1,20})$'),   -- 디스코드 ID · k<카카오 회원번호>
  author_name text not null,
  title text not null,
  category text not null,            -- data/club.json 의 categories id (qna 질문답변 · tip 꿀팁공유 · free 자유)
  chars text[] not null,             -- 향우회 캐릭터 1명. 다른 게시판과 같은 캐릭터 필터를 쓰려고 배열
  positions smallint[] not null,
  body text not null,
  likes int not null default 0,
  comments int not null default 0,
  adopted bigint,                    -- 채택한 댓글 id(질문답변만). 채택된 글 · 댓글은 서버가 못 고치고 못 지우게 한다
  adopted_by text,                   -- 채택된 댓글을 쓴 사람 — 내공 랭킹
  adopted_name text,
  adopted_at bigint,
  created_at bigint not null,        -- epoch ms, 서버 시계 기준
  updated_at bigint not null
);
create index club_posts_chars on public.club_posts using gin (chars);
create index club_posts_positions on public.club_posts using gin (positions);
create index club_posts_category on public.club_posts (category, id desc);
create index club_posts_author on public.club_posts (author_id);   -- 내 글에 달린 댓글(알림)
create index club_posts_adopted on public.club_posts (adopted_by) where adopted_by is not null;

create table public.club_likes (
  post_id bigint not null references public.club_posts (id) on delete cascade,
  user_id text not null,
  primary key (post_id, user_id)
);

create table public.club_comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.club_posts (id) on delete cascade,
  author_id text not null,
  author_name text not null,
  body text not null,
  created_at bigint not null
);
create index club_comments_post on public.club_comments (post_id, id);

create function public.club_count() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint := case when tg_op = 'INSERT' then new.post_id else old.post_id end;
  v_d int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  if tg_table_name = 'club_likes' then
    update public.club_posts set likes = likes + v_d where id = v_id;
  else
    update public.club_posts set comments = comments + v_d where id = v_id;
  end if;
  return null;
end $$;
create trigger club_likes_count after insert or delete on public.club_likes for each row execute function public.club_count();
create trigger club_comments_count after insert or delete on public.club_comments for each row execute function public.club_count();

-- 추천 켜기/끄기. 돌려주는 값: { liked, likes } — 없는 글은 PT404
create function public.club_toggle_like(p_post bigint, p_user text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_liked boolean;
  v_likes int;
begin
  perform 1 from public.club_posts where id = p_post for update;
  if not found then
    raise sqlstate 'PT404' using message = 'not_found';
  end if;
  delete from public.club_likes where post_id = p_post and user_id = p_user;
  v_liked := not found;
  if v_liked then
    insert into public.club_likes (post_id, user_id) values (p_post, p_user);
  end if;
  select likes into v_likes from public.club_posts where id = p_post;
  return jsonb_build_object('liked', v_liked, 'likes', v_likes);
end $$;

-- 내공 랭킹 — 채택된 답변이 많은 순(같으면 먼저 그 수에 닿은 사람). p_char = 그 캐릭터 향우회만, null = 전체. 이름은 마지막으로 채택될 때의 이름
create function public.club_ranking(p_char text, p_limit int)
returns table (user_id text, name text, adopted int)
language sql
stable
security invoker
set search_path = ''
as $$
  select adopted_by, (array_agg(adopted_name order by adopted_at desc))[1], count(*)::int
  from public.club_posts
  where adopted_by is not null and (p_char is null or chars[1] = p_char)
  group by adopted_by
  order by count(*) desc, max(adopted_at) asc
  limit p_limit
$$;

alter table public.club_posts enable row level security;
alter table public.club_likes enable row level security;
alter table public.club_comments enable row level security;
revoke all on table public.club_posts, public.club_likes, public.club_comments from public, anon, authenticated;
grant select, insert, update, delete on table public.club_posts, public.club_likes, public.club_comments to service_role;

revoke execute on function public.club_count() from public, anon, authenticated;
revoke execute on function public.club_toggle_like(bigint, text) from public, anon, authenticated;
revoke execute on function public.club_ranking(text, int) from public, anon, authenticated;
grant execute on function public.club_toggle_like(bigint, text), public.club_ranking(text, int) to service_role;

notify pgrst, 'reload schema';

commit;
