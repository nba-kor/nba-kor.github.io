-- 향우회 조회수. 글 화면이 처음 열릴 때(?view=1) 함수가 club_view 로 하나 올린다.

begin;

alter table public.club_posts add column views int not null default 0;

create function public.club_view(p_post bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.club_posts set views = views + 1 where id = p_post
$$;

revoke execute on function public.club_view(bigint) from public, anon, authenticated;
grant execute on function public.club_view(bigint) to service_role;

notify pgrst, 'reload schema';

commit;
