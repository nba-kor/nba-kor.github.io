-- 잠재력추천 게시판. 팀원모집과 같은 원칙 — 브라우저는 DB 에 붙지 않고 API 함수만 secret key(service_role)로 부른다.
--   potential_builds    : 빌드 글 하나 = 제목 · 추천 캐릭터 · 상황 설명 · 30칸(빨강 · 초록 · 파랑 각 10칸, 칸마다 잠재력)
--   potential_likes     : 사람당 글마다 추천 한 번
--   potential_comments  : 댓글
-- 추천 · 댓글 수는 글 행에 세어 둔다(트리거) — 추천순 정렬과 목록의 숫자가 조인 없이 나온다.

begin;

create table public.potential_builds (
  id bigint generated always as identity primary key,
  author_id text not null check (author_id ~ '^\d{17,20}$'),   -- 디스코드 ID
  author_name text not null,         -- 쓸 때의 표시 이름(프로필 이름, 없으면 디스코드 이름). 고칠 때 다시 맞춘다
  title text not null,
  chars text[] not null,             -- 추천 캐릭터 id 1~5명
  positions smallint[] not null,     -- chars 의 포지션(1~5) — 포지션 필터용. 서버가 선수 데이터로 채운다
  body text not null,                -- 어떤 상황에서 쓰면 좋은지
  slots jsonb not null,              -- { red: [잠재력 id | null ×10], green: [...], blue: [...] } — 레벨은 늘 최대(5)
  likes int not null default 0,
  comments int not null default 0,
  created_at bigint not null,        -- epoch ms, 서버 시계 기준
  updated_at bigint not null
);
create index potential_builds_chars on public.potential_builds using gin (chars);
create index potential_builds_positions on public.potential_builds using gin (positions);

create table public.potential_likes (
  build_id bigint not null references public.potential_builds (id) on delete cascade,
  user_id text not null,
  primary key (build_id, user_id)
);

create table public.potential_comments (
  id bigint generated always as identity primary key,
  build_id bigint not null references public.potential_builds (id) on delete cascade,
  author_id text not null,
  author_name text not null,
  body text not null,
  created_at bigint not null
);
create index potential_comments_build on public.potential_comments (build_id, id);

-- 추천 · 댓글 수. 글이 지워지며 cascade 로 지워지는 행은 글이 이미 없어 update 가 아무것도 안 한다
create function public.potential_count() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint := case when tg_op = 'INSERT' then new.build_id else old.build_id end;
  v_d int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  if tg_table_name = 'potential_likes' then
    update public.potential_builds set likes = likes + v_d where id = v_id;
  else
    update public.potential_builds set comments = comments + v_d where id = v_id;
  end if;
  return null;
end $$;
create trigger potential_likes_count after insert or delete on public.potential_likes for each row execute function public.potential_count();
create trigger potential_comments_count after insert or delete on public.potential_comments for each row execute function public.potential_count();

-- 추천 켜기/끄기. 돌려주는 값: { liked, likes } — 없는 글은 PT404
create function public.potential_toggle_like(p_build bigint, p_user text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_liked boolean;
  v_likes int;
begin
  perform 1 from public.potential_builds where id = p_build for update;   -- 같은 글 추천을 줄 세운다
  if not found then
    raise sqlstate 'PT404' using message = 'not_found';
  end if;
  delete from public.potential_likes where build_id = p_build and user_id = p_user;
  v_liked := not found;
  if v_liked then
    insert into public.potential_likes (build_id, user_id) values (p_build, p_user);
  end if;
  select likes into v_likes from public.potential_builds where id = p_build;
  return jsonb_build_object('liked', v_liked, 'likes', v_likes);
end $$;

-- RLS 는 켜고 정책은 두지 않는다 = anon · authenticated 는 전부 거절. service_role 은 BYPASSRLS 라 영향 없다
alter table public.potential_builds enable row level security;
alter table public.potential_likes enable row level security;
alter table public.potential_comments enable row level security;
revoke all on table public.potential_builds, public.potential_likes, public.potential_comments from public, anon, authenticated;
grant select, insert, update, delete on table public.potential_builds, public.potential_likes, public.potential_comments to service_role;

-- 함수 EXECUTE 는 Postgres 기본값이 PUBLIC 허용이라 함수마다 거둬야 한다. 트리거 함수는 트리거로만 돈다
revoke execute on function public.potential_count() from public, anon, authenticated;
revoke execute on function public.potential_toggle_like(bigint, text) from public, anon, authenticated;
grant execute on function public.potential_toggle_like(bigint, text) to service_role;

notify pgrst, 'reload schema';

commit;
