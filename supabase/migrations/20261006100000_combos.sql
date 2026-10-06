-- 조합표 게시판. 티어표(20261006000000_tier_lists.sql)와 같은 모양 — 글 · 추천 · 댓글, 수는 글 행에 트리거로 센다.
-- 브라우저는 DB 에 붙지 않고 API 함수만 secret key(service_role)로 부른다.

begin;

create table public.combos (
  id bigint generated always as identity primary key,
  author_id text not null check (author_id ~ '^\d{17,20}$'),   -- 디스코드 ID
  author_name text not null,         -- 쓸 때의 표시 이름(프로필 이름, 없으면 디스코드 이름). 고칠 때 다시 맞춘다
  title text not null,
  chars text[] not null,             -- 조합 선수 3명(한국 서버) — 게시판 공용 목록 · 필터
  positions smallint[] not null,     -- chars 의 포지션 — 포지션 필터용. 서버가 선수 데이터로 채운다
  tiers text[] not null,             -- 추천 티어(data/recruit.json 의 tiers)
  builds jsonb not null,             -- chars 와 같은 순서로 참고할 잠재력추천 글 번호 | null — [3]
  matchups jsonb not null,           -- { easy: { chars, combos }, hard: { chars, combos } } — 상대하기 편한 · 힘든 캐릭터 · 조합 글 번호
  body text not null,
  likes int not null default 0,
  comments int not null default 0,
  created_at bigint not null,        -- epoch ms, 서버 시계 기준
  updated_at bigint not null
);
create index combos_likes on public.combos (likes desc, id desc);   -- 추천순 목록

create table public.combo_likes (
  combo_id bigint not null references public.combos (id) on delete cascade,
  user_id text not null,
  primary key (combo_id, user_id)
);

create table public.combo_comments (
  id bigint generated always as identity primary key,
  combo_id bigint not null references public.combos (id) on delete cascade,
  author_id text not null,
  author_name text not null,
  body text not null,
  created_at bigint not null
);
create index combo_comments_combo on public.combo_comments (combo_id, id);

create function public.combo_count() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint := case when tg_op = 'INSERT' then new.combo_id else old.combo_id end;
  v_d int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  if tg_table_name = 'combo_likes' then
    update public.combos set likes = likes + v_d where id = v_id;
  else
    update public.combos set comments = comments + v_d where id = v_id;
  end if;
  return null;
end $$;
create trigger combo_likes_count after insert or delete on public.combo_likes for each row execute function public.combo_count();
create trigger combo_comments_count after insert or delete on public.combo_comments for each row execute function public.combo_count();

-- 추천 켜기/끄기. 돌려주는 값: { liked, likes } — 없는 글은 PT404
create function public.combo_toggle_like(p_combo bigint, p_user text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_liked boolean;
  v_likes int;
begin
  perform 1 from public.combos where id = p_combo for update;
  if not found then
    raise sqlstate 'PT404' using message = 'not_found';
  end if;
  delete from public.combo_likes where combo_id = p_combo and user_id = p_user;
  v_liked := not found;
  if v_liked then
    insert into public.combo_likes (combo_id, user_id) values (p_combo, p_user);
  end if;
  select likes into v_likes from public.combos where id = p_combo;
  return jsonb_build_object('liked', v_liked, 'likes', v_likes);
end $$;

alter table public.combos enable row level security;
alter table public.combo_likes enable row level security;
alter table public.combo_comments enable row level security;
revoke all on table public.combos, public.combo_likes, public.combo_comments from public, anon, authenticated;
grant select, insert, update, delete on table public.combos, public.combo_likes, public.combo_comments to service_role;

revoke execute on function public.combo_count() from public, anon, authenticated;
revoke execute on function public.combo_toggle_like(bigint, text) from public, anon, authenticated;
grant execute on function public.combo_toggle_like(bigint, text) to service_role;

notify pgrst, 'reload schema';

commit;
