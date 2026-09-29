-- 팀원모집: 파티마다 어떤 캐릭터로 들어왔는지. 프로필 entries 의 몇 번째 줄인지(0 = 대표).
-- API 가 팀을 보여 줄 때 이 줄을 맨 앞으로 옮긴다 — 웹 · 디스코드 알림 · 카톡 카드 · TNAB 봇이 모두 entries[0] 을 쓰므로 따로 고칠 곳이 없다.
-- 프로필을 고쳐 그 줄이 없어지면 대표(0)로 보여 준다.

begin;

alter table public.recruit_members add column entry smallint not null default 0 check (entry >= 0);

notify pgrst, 'reload schema';

commit;
