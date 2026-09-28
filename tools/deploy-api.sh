#!/bin/sh
# 팀원모집 · 잠재력추천 API(Supabase Edge Function 'recruit')를 운영에 배포한다. README "운영 배포" 4번.
#   sh tools/deploy-api.sh
# .env 의 SUPABASE_ACCESS_TOKEN(개인 토큰 sbp_...)을 쓴다 — 비밀값으로 올라가지 않고 이 명령에만 쓰인다.
set -e
cd "$(dirname "$0")/.."
SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env | cut -d= -f2-)
[ -n "$SUPABASE_ACCESS_TOKEN" ] || { echo '.env 에 SUPABASE_ACCESS_TOKEN 이 없어요' >&2; exit 1; }
export SUPABASE_ACCESS_TOKEN
npx supabase functions deploy recruit --project-ref lgchgqxjjlapszmxarun
curl -s https://lgchgqxjjlapszmxarun.supabase.co/functions/v1/recruit/api/health; echo
