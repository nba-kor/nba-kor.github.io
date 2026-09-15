// Supabase Edge Function 'recruit' — 팀원모집 API 의 입구. 로직은 전부 server/index.mjs (Node 테스트와 같은 코드).
//   배포: npx supabase functions deploy recruit --project-ref lgchgqxjjlapszmxarun   (README 참고)
// 운영 주소 https://<ref>.supabase.co/functions/v1/recruit/api/... → 이 함수는 /recruit/api/... 로 받는다.
import { createHandler } from '../../../server/index.mjs'

const handler = createHandler({
  env: Deno.env.toObject(),   // SUPABASE_URL · SUPABASE_SECRET_KEYS · SUPABASE_PUBLISHABLE_KEYS 는 Supabase 가 넣고, 나머지(TNAB_BOT_KEY 등)는 supabase secrets set 으로
  waitUntil: p => EdgeRuntime.waitUntil(p),   // 디스코드 알림을 응답 뒤까지 살려 둔다
})

// 앞의 함수 이름 조각만 뗀다 — 로컬 nginx(/api/ → /recruit/api/)와 운영이 같은 /api/... 경로가 된다
Deno.serve(req => {
  const url = new URL(req.url)
  url.pathname = url.pathname.replace(/^\/recruit(?=\/|$)/, '')
  return handler(new Request(url, req))
})
