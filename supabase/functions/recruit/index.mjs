// Supabase Edge Function 'recruit' — 팀원모집 API 의 입구. 로직은 전부 server/index.mjs (Node 테스트와 같은 코드).
//   배포: npx supabase functions deploy recruit --project-ref lgchgqxjjlapszmxarun   (README 참고)
// 운영 주소 https://<ref>.supabase.co/functions/v1/recruit/api/... → 이 함수는 /recruit/api/... 로 받는다.
import { createHandler } from '../../../server/index.mjs'

const handler = createHandler({
  env: Deno.env.toObject(),   // SUPABASE_URL · SUPABASE_SECRET_KEYS 는 Supabase 가 넣고, 나머지는 supabase secrets set 으로
  waitUntil: p => EdgeRuntime.waitUntil(p),   // 디스코드 알림을 응답 뒤까지 살려 둔다
  // 요청 수 제한 키로만 쓴다(권한 판단에는 안 쓴다). cf-connecting-ip 는 앞단 Cloudflare 가 실제 주소로 넣는다.
  // X-Forwarded-For 는 클라이언트가 앞쪽을 지어낼 수 있어 마지막(프록시가 붙인) 주소를 쓴다
  ipOf: req => req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',').at(-1).trim() || '',
})

// 앞의 함수 이름 조각만 뗀다 — 로컬 nginx(/api/ → /recruit/api/)와 운영이 같은 /api/... 경로가 된다
Deno.serve(req => {
  const url = new URL(req.url)
  url.pathname = url.pathname.replace(/^\/recruit(?=\/|$)/, '')
  return handler(new Request(url, req))
})
