// docker compose 의 api 서비스(edge-runtime)용 메인 서비스 — 운영 게이트웨이 대신 /recruit/... 요청을 함수 워커에 넘긴다.
// 한도는 Supabase 무료 플랜과 같게 둔다(메모리 256MB · CPU 2초 · 150초). 워커는 재사용되므로 함수 코드를 고쳤으면 docker compose restart api
const FN = '/app/supabase/functions/recruit'

Deno.serve(async req => {
  if (new URL(req.url).pathname.split('/')[1] !== 'recruit') return Response.json({ error: '없는 함수예요' }, { status: 404 })
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: FN,
      maybeEntrypoint: `file://${FN}/index.mjs`,
      memoryLimitMb: 256,
      workerTimeoutMs: 150_000,
      cpuTimeSoftLimitMs: 1000,
      cpuTimeHardLimitMs: 2000,
      noModuleCache: false,
      forceCreate: false,
      envVars: Object.entries(Deno.env.toObject()),
    })
    return await worker.fetch(req)
  } catch (e) {
    console.error('recruit 워커 오류:', e)   // 운영의 BOOT_ERROR · WORKER_RESOURCE_LIMIT 자리
    return Response.json({ error: '모집 서버에 연결할 수 없어요' }, { status: 503 })
  }
})
