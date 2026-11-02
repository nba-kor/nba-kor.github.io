-- 향우회 그림 첨부. 글 · 댓글에 그림 이름(<사람 ID>_<무작위 16자>.webp|jpg) 목록. 그림 파일은 Storage 의 공개 버킷 club —
-- 화면이 웹용으로 줄여(WebP, 안 되면 JPEG) 함수로 보내고, 함수가 secret key 로 올리고 지운다. 읽기는 누구나 공개 주소로.

begin;

alter table public.club_posts add column images text[] not null default '{}';
alter table public.club_comments add column images text[] not null default '{}';

-- 버킷: 공개 읽기 · 한 장 300KB · WebP / JPEG 만. 로컬 compose 에는 Storage 가 없어 건너뛴다
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('club', 'club', true, 307200, array['image/webp', 'image/jpeg'])
    on conflict (id) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
