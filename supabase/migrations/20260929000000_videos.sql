-- 영상 게시판(유튜브 링크). 잠재력추천(20260928000000_potentials.sql)과 같은 모양 — 글 · 추천 · 댓글, 수는 글 행에 트리거로 센다.
-- 브라우저는 DB 에 붙지 않고 API 함수만 secret key(service_role)로 부른다.

begin;

create table public.videos (
  id bigint generated always as identity primary key,
  author_id text not null check (author_id ~ '^\d{17,20}$'),   -- 디스코드 ID
  author_name text not null,         -- 쓸 때의 표시 이름(프로필 이름, 없으면 디스코드 이름). 고칠 때 다시 맞춘다
  title text not null,
  youtube text not null unique check (youtube ~ '^[A-Za-z0-9_-]{11}$'),   -- 유튜브 영상 id. 같은 영상은 한 번만
  category text not null,            -- data/videos.json 의 categories id (하이라이트 · 공략 · 강의 …)
  chars text[] not null,             -- 나온 캐릭터 id 0~5명
  positions smallint[] not null,     -- chars 의 포지션 — 포지션 필터용. 서버가 선수 데이터로 채운다
  body text not null,
  likes int not null default 0,
  comments int not null default 0,
  created_at bigint not null,        -- epoch ms, 서버 시계 기준
  updated_at bigint not null
);
create index videos_chars on public.videos using gin (chars);
create index videos_positions on public.videos using gin (positions);
create index videos_category on public.videos (category, id desc);   -- 홈의 "최신 강의"

create table public.video_likes (
  video_id bigint not null references public.videos (id) on delete cascade,
  user_id text not null,
  primary key (video_id, user_id)
);

create table public.video_comments (
  id bigint generated always as identity primary key,
  video_id bigint not null references public.videos (id) on delete cascade,
  author_id text not null,
  author_name text not null,
  body text not null,
  created_at bigint not null
);
create index video_comments_video on public.video_comments (video_id, id);

create function public.video_count() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint := case when tg_op = 'INSERT' then new.video_id else old.video_id end;
  v_d int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  if tg_table_name = 'video_likes' then
    update public.videos set likes = likes + v_d where id = v_id;
  else
    update public.videos set comments = comments + v_d where id = v_id;
  end if;
  return null;
end $$;
create trigger video_likes_count after insert or delete on public.video_likes for each row execute function public.video_count();
create trigger video_comments_count after insert or delete on public.video_comments for each row execute function public.video_count();

-- 추천 켜기/끄기. 돌려주는 값: { liked, likes } — 없는 글은 PT404
create function public.video_toggle_like(p_video bigint, p_user text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_liked boolean;
  v_likes int;
begin
  perform 1 from public.videos where id = p_video for update;
  if not found then
    raise sqlstate 'PT404' using message = 'not_found';
  end if;
  delete from public.video_likes where video_id = p_video and user_id = p_user;
  v_liked := not found;
  if v_liked then
    insert into public.video_likes (video_id, user_id) values (p_video, p_user);
  end if;
  select likes into v_likes from public.videos where id = p_video;
  return jsonb_build_object('liked', v_liked, 'likes', v_likes);
end $$;

alter table public.videos enable row level security;
alter table public.video_likes enable row level security;
alter table public.video_comments enable row level security;
revoke all on table public.videos, public.video_likes, public.video_comments from public, anon, authenticated;
grant select, insert, update, delete on table public.videos, public.video_likes, public.video_comments to service_role;

revoke execute on function public.video_count() from public, anon, authenticated;
revoke execute on function public.video_toggle_like(bigint, text) from public, anon, authenticated;
grant execute on function public.video_toggle_like(bigint, text) to service_role;

notify pgrst, 'reload schema';

commit;
