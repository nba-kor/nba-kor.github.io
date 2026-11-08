#!/bin/sh
# 팀원모집 · 잠재력추천 API(Supabase Edge Function 'recruit')를 운영에 배포한다. README "운영 배포" 4번.
#   sh tools/deploy-api.sh
# .env 의 SUPABASE_ACCESS_TOKEN(개인 토큰 sbp_...)을 쓴다 — 비밀값으로 올라가지 않고 이 명령에만 쓰인다.
set -e
cd "$(dirname "$0")/.."
SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env | cut -d= -f2-)
[ -n "$SUPABASE_ACCESS_TOKEN" ] || { echo '.env 에 SUPABASE_ACCESS_TOKEN 이 없어요' >&2; exit 1; }
export SUPABASE_ACCESS_TOKEN
# CLI 는 3.x 로 고정 — 큰 버전(v4)이 나오면 옵션을 다시 확인하고 올린다.
# 3.0 부터 운영 배포는 확인을 묻는데 Claude Code 의 ! 안에서는 물을 수 없어 멈춘다 — 이 스크립트를 돌리는 게 확인이라 --yes(2026-11-08 사용자가 정함)
npx supabase@3 functions deploy recruit --remote=lgchgqxjjlapszmxarun --yes
curl -s https://lgchgqxjjlapszmxarun.supabase.co/functions/v1/recruit/api/health; echo
