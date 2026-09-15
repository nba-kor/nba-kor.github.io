// 팀원모집 API — Request 하나를 받아 Response 를 돌려주는 함수(createHandler) 하나. 저장소는 Supabase(Data API).
//
// 운영은 Supabase Edge Function(supabase/functions/recruit/index.mjs)이 이 함수를 부르고, 로컬 docker compose 는 같은
// edge-runtime 으로 띄운다(nginx 의 /api/ → 함수). 테스트(server/test.mjs)는 Node 에서 이 함수를 직접 부른다.
// 그래서 웹 표준(fetch · Request · Response)과 node:crypto · node:buffer 만 쓴다 — node:http · node:fs 는 Deno 에서 못 쓴다.
// 브라우저는 Supabase 에 붙지 않는다 — 검증 · 요청 수 제한 · secret key 가 전부 여기 있다.

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { promisify } from 'node:util'
// 데이터는 글자 그대로의 import 로 읽는다 — 배포 CLI 가 이 구문만 보고 JSON 파일을 함수에 같이 묶는다(readFileSync 는 못 찾는다)
import CFG from '../data/recruit.json' with { type: 'json' }
import playersData from '../data/players.json' with { type: 'json' }
import tacticsData from '../data/tactics.json' with { type: 'json' }
import { channelUrl, createNotifier, errText, voiceRooms } from './discord.mjs'

const PLAYERS = new Map(playersData.players.filter(p => p.server === 'kr').map(p => [p.id, p]))   // 한국 출시만
const PRESETS = new Map(tacticsData.presets.map(p => [p.id, p.name]))
const TTL = CFG.ttlHours * 3_600_000
const L = CFG.limits
const MAX_BODY = 32 * 1024
const MAX_LIST = 100
const LIMIT = { max: 30, windowMs: 10 * 60_000 }        // IP 당 쓰기 요청
const PW_LIMIT = { max: 5, teamMax: 20, windowMs: 10 * 60_000 }   // 틀린 비밀번호: 한 사람(IP)이 한 팀에 · 팀 전체
const ROUTE_KINDS = ['move', 'pass', 'screen']
const LINK = /:\/\/|www\.|discord\.gg/i
const TEAM_ID = /^[A-Za-z0-9_-]{8}$/
const JSON_TYPE = /^application\/json\b/i
// 받는 요청 — 메서드 + 경로 조각. 예: 'POST team members' = 가입, 'DELETE team members member' = 방출 · 나가기
const ACTIONS = new Set(['GET', 'POST', 'GET team', 'DELETE team', 'POST team members', 'DELETE team members member', 'POST team extend'])
// 브라우저는 authorization · content-type 만 보낸다(커스텀 x- 헤더는 운영 게이트웨이 preflight 에서 잘릴 수 있다)
const PREFLIGHT = { 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '600' }

const sha256 = s => createHash('sha256').update(s).digest('hex')
const scryptAsync = promisify(scrypt)   // 비동기만 — scryptSync 는 워커 CPU 시간(2초)을 먹는다
const fail = (status, error) => { throw Object.assign(new Error(error), { status }) }
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const matches = (re, v) => typeof v === 'string' && re.test(v)   // 정규식 test 는 배열도 문자열로 바꿔 통과시킨다
const listOf = (a, max, min = 0) => Array.isArray(a) && a.length >= min && a.length <= max
const r3 = v => Math.round(v * 1000) / 1000
const enc = encodeURIComponent
// IPv6 는 보통 한 가입자가 /64 를 통째로 받는다 — 앞 64비트로 센다(IPv4 · ::ffff:a.b.c.d · 이상한 값은 그대로)
const rateKey = ip => {
  const [a, b, ...extra] = ip.split('%')[0].split('::'), head = a ? a.split(':') : [], tail = b ? b.split(':') : []
  const full = b === undefined ? head : [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail]
  if (extra.length || full.length !== 8 || !full.every(x => /^[0-9a-f]{1,4}$/i.test(x))) return ip
  return `${full.slice(0, 4).map(x => parseInt(x, 16).toString(16)).join(':')}::/64`
}
/** secret key — 운영은 Supabase 가 넣어 주는 SUPABASE_SECRET_KEYS(JSON 의 default), 로컬 compose 는 SUPABASE_SECRET_KEY */
const secretKey = env => {
  try { return JSON.parse(env.SUPABASE_SECRET_KEYS || '{}').default || env.SUPABASE_SECRET_KEY || '' }
  catch { return env.SUPABASE_SECRET_KEY || '' }
}

// ---------------------------------------------------------------- 검증 (신뢰 경계 — 허용한 필드만 다시 만든다)

/** 앞뒤 공백을 떼고 길이는 코드포인트로 센다(한글·이모지 한 글자 = 1). 링크는 못 넣는다. lines = 줄바꿈(\n)만 허용(메모). */
function text(v, max, what, min = 1, lines = false) {
  if (typeof v !== 'string') fail(400, `${what}을(를) 확인해 주세요`)
  const s = v.trim(), n = [...s].length
  if ((lines ? /[\x00-\x09\x0b-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(s)) fail(400, `${what}에 쓸 수 없는 문자가 있어요`)
  if (n < min || n > max) fail(400, min ? `${what}은(는) ${min}~${max}자로 입력해 주세요` : `${what}은(는) ${max}자까지 입력할 수 있어요`)
  if (LINK.test(s)) fail(400, `${what}에 링크는 넣을 수 없어요`)
  return s
}

/** 방 설정. 비밀번호는 따로 돌려준다 — 팀 뷰에 섞이지 않게 */
function room(v) {
  if (!isObj(v)) fail(400, '방 설정을 입력해 주세요')
  if (typeof v.mic !== 'boolean') fail(400, '마이크 사용 여부를 골라 주세요')
  if (typeof v.mode !== 'string' || !Object.hasOwn(CFG.modes, v.mode)) fail(400, `${Object.values(CFG.modes).join(' · ')} 중에 골라 주세요`)
  const pw = v.password, n = typeof pw === 'string' ? [...pw].length : 0
  // 비밀번호는 자르지 않고 받은 그대로 해시한다(앞뒤 공백도 비밀번호) — 공백뿐인 것만 막는다
  if (typeof pw !== 'string' || !pw.trim() || n < L.passwordMin || n > L.passwordMax) {
    fail(400, `비밀번호는 ${L.passwordMin}~${L.passwordMax}자로 입력해 주세요`)
  }
  return {
    room: { title: text(v.title ?? '', L.title, '방 제목', 0), mic: v.mic, mode: v.mode, memo: text(v.memo ?? '', L.memo, '메모', 0, true) },
    password: pw,
  }
}

function person(v) {
  if (!isObj(v)) fail(400, '신청 정보가 없어요')
  const discord = text(v.discord, 32, '디스코드 닉네임')
  if (!listOf(v.entries, CFG.maxEntries, 1)) fail(400, `캐릭터는 1~${CFG.maxEntries}개 등록할 수 있어요`)
  const seen = new Set()
  const entries = v.entries.map(e => {
    if (!isObj(e)) fail(400, '계정 정보를 확인해 주세요')
    const nick = text(e.nick, 20, '게임 닉네임')
    if (!CFG.tiers.includes(e.tier)) fail(400, '티어를 골라 주세요')
    if (typeof e.char !== 'string' || !PLAYERS.has(e.char)) fail(400, '한국 서버에 출시된 캐릭터만 고를 수 있어요')
    const key = `${nick}\n${e.char}`   // 닉네임에 제어문자가 없으니 \n 으로 이어도 겹치지 않는다
    if (seen.has(key)) fail(400, '같은 계정에 같은 캐릭터가 두 번 들어갔어요')
    seen.add(key)
    return { nick, tier: e.tier, char: e.char }
  })
  return { discord, entries }
}

// 전술판은 토큰을 옮기면 동선도 같이 밀려 코트 밖(0~1 바깥) 좌표가 저장될 수 있다 — 거절하지 않고 잘라 넣는다.
const coord = v => {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(400, '전술판 좌표가 잘못됐어요')
  return r3(Math.min(1, Math.max(0, v)))
}

function board(b) {
  if (!isObj(b) || !listOf(b.tokens, 6)) fail(400, '전술판에는 선수를 6명까지 둘 수 있어요')
  return {
    tokens: b.tokens.map(t => {
      if (!isObj(t) || !matches(/^[od][1-3]$/, t.key) || !['off', 'def'].includes(t.side)) fail(400, '전술판 선수 정보가 잘못됐어요')
      if (t.playerId != null && !matches(/^[a-z0-9-]{1,40}$/, t.playerId)) fail(400, '전술판 선수 정보가 잘못됐어요')
      if (!listOf(t.routes, 8)) fail(400, '동선은 선수마다 8개까지 그릴 수 있어요')
      return {
        key: t.key, side: t.side, label: text(t.label, 20, '선수 이름표', 0), playerId: t.playerId ?? null,
        x: coord(t.x), y: coord(t.y),
        routes: t.routes.map(r => {
          if (!isObj(r) || !ROUTE_KINDS.includes(r.kind) || !listOf(r.pts, 80, 2)) fail(400, '동선 정보가 잘못됐거나 너무 길어요')
          return { kind: r.kind, pts: r.pts.map(p => listOf(p, 2, 2) ? p.map(coord) : fail(400, '전술판 좌표가 잘못됐어요')) }
        }),
      }
    }),
  }
}

function tactic(v) {
  if (v == null) v = {}
  if (!isObj(v)) fail(400, '전술 정보가 잘못됐어요')
  const preset = v.preset || null
  if (preset !== null && !(typeof preset === 'string' && PRESETS.has(preset))) fail(400, '없는 전술이에요')
  const b = v.board == null ? null : board(v.board)
  const name = v.name == null ? '' : text(v.name, 30, '전술 이름', 0)
  const presetName = preset ? PRESETS.get(preset) : ''
  return { preset, name: b ? name || presetName || '커스텀 전술' : presetName, board: b }
}


// ---------------------------------------------------------------- 비밀번호

// 솔트 붙인 scrypt 해시로만 저장한다. 비동기 scrypt 는 워커 스레드에서 돌아 CPU 시간 한도에 안 잡히고 다른 요청도 막지 않는다
async function hashPassword(pw) {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('base64url')}$${(await scryptAsync(pw, salt, 32)).toString('base64url')}`
}
async function passwordOk(pw, stored) {
  const [, salt, hash] = stored.split('$')
  return timingSafeEqual(await scryptAsync(pw, Buffer.from(salt, 'base64url'), 32), Buffer.from(hash, 'base64url'))
}

// ---------------------------------------------------------------- Supabase Data API (PostgREST)

const DB_DOWN = '모집 서버 DB 에 연결할 수 없어요'
const NOT_FOUND = '팀을 찾을 수 없어요'
const NOT_OPEN = { full: '이미 다 찬 팀이에요' }   // 가입 RPC 의 PT409 message

/**
 * Data API 호출 함수를 만든다. 요청 하나 = 트랜잭션 하나. 키는 apikey 헤더에만 싣는다 — 클라우드의 sb_secret_ 는 JWT 가
 * 아니라서 Authorization 에 넣으면 거절된다(로컬은 nginx 가 apikey 를 Authorization 으로 옮긴다). 키 · 쿼리(토큰 해시)는 로그에 안 남긴다.
 * 연결 실패 · 시간 초과 · 5xx 는 503, 가입 거절(PTxxx) · 닉네임 중복(23505)은 사용자 문구, 나머지는 500(로그).
 */
function supabase({ url = '', key = '', fetch, log }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`
  const headers = { apikey: key, 'content-type': 'application/json', accept: 'application/json' }
  return async (path, { method = 'GET', body } = {}) => {
    const where = `${method} ${path.split('?')[0]}`
    let res, raw, json, tries = 0
    for (;;) {
      try {
        res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(8000) })
        raw = await res.text()
      } catch (e) {
        log(`DB 연결 실패 ${where}: ${errText(e)}`)
        fail(503, DB_DOWN)
      }
      json = null
      try { json = raw ? JSON.parse(raw) : null } catch {}
      // 클라우드 앞단이 secret key 로 찍어 준 임시 JWT 의 발급 시각이 DB 시계보다 조금 앞서면 PGRST303 으로 거절된다
      // (함수가 막 켜졌을 때 운영에서 실제로 났다). 인증 단계에서 거절돼 SQL 은 안 돌았으니 쓰기도 잠깐 뒤 다시 보내도 안전하다
      if (!(res.status === 401 && json?.code === 'PGRST303') || ++tries > 2) break
      await new Promise(r => setTimeout(r, 1000))
    }
    if (res.ok) return json
    const { code, message } = json || {}
    if (code === 'PGRST303') {
      log(`DB 인증 시각 어긋남 ${where}: ${message}`)
      fail(503, DB_DOWN)
    }
    if (code === 'PT404') fail(404, NOT_FOUND)
    if (code === 'PT409' && NOT_OPEN[message]) fail(409, NOT_OPEN[message])
    if (code === '23505' && message?.includes('recruit_members_team_discord')) fail(409, '이미 이 팀에 있는 디스코드 닉네임이에요')
    if (res.status >= 500 || !code) {   // 코드 없는 응답 = PostgREST 가 아닌 앞단(프록시 502 등)
      log(`DB 응답 ${res.status} ${where}: ${code ? `${code} ${message}` : raw.slice(0, 200)}`)
      fail(503, DB_DOWN)
    }
    throw new Error(`DB ${res.status} ${where}: ${code} ${message}`)
  }
}

// 팀원은 팀장 먼저, 들어온 순. 토큰 해시는 고르지 않는다
const MEMBERS = 'members:recruit_members(id,discord,entries,leader,joined_at)&members.order=leader.desc,joined_at.asc,id.asc'

// ---------------------------------------------------------------- API

/**
 * (request: Request) => Promise<Response> 를 만든다. 경로는 /api/... (Edge Function 은 앞의 /recruit 를 떼고 넘긴다).
 * now 는 테스트가 시간을 돌리려고, fetch 는 가짜 Data API · 디스코드를 끼우려고 받는다. waitUntil = 응답 뒤에도 끝내야 할 일(디스코드 알림),
 * ipOf = 요청 수 제한에 쓸 접속 주소(권한 판단엔 안 쓴다). 워커 메모리에 믿고 두는 상태는 없다 — 제한 횟수 · 방 배정은 DB 가 센다.
 */
export function createHandler({ env = {}, now = Date.now, fetch = globalThis.fetch, waitUntil = p => p, ipOf = () => '', log = console.log } = {}) {
  const db = supabase({ url: env.SUPABASE_URL, key: secretKey(env), fetch, log })
  const notifier = createNotifier({
    webhookUrl: env.DISCORD_WEBHOOK_URL, siteUrl: env.SITE_URL, guildId: env.DISCORD_GUILD_ID, players: PLAYERS, modes: CFG.modes, fetch, waitUntil, log,
  })
  const rooms = () => voiceRooms({ botToken: env.DISCORD_BOT_TOKEN, guildId: env.DISCORD_GUILD_ID, categoryId: env.DISCORD_VOICE_CATEGORY_ID, fetch, now, log })
  // 화면이 다른 도메인(GitHub Pages)에서 부른다 — 목록에 있는 Origin 만 그대로 돌려준다(쉼표로 여러 개)
  const origins = (env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)

  // 클라이언트가 보는 팀 모양은 이것 하나뿐 — 필드를 골라 새로 만든다(비밀번호 · 토큰 해시는 절대 넣지 않는다).
  // 목록 행은 tactic 대신 preset · name 만 온다.
  function view(t) {
    const members = t.members.map(m => ({ id: m.id, leader: m.leader, discord: m.discord, entries: m.entries, joinedAt: m.joined_at }))
    return {
      id: t.id,
      room: t.room,
      tactic: t.tactic ?? { preset: t.preset, name: t.name },
      voice: t.voice ? { ...t.voice, url: channelUrl(env.DISCORD_GUILD_ID, t.voice.id) } : null,
      status: members.length >= CFG.teamSize ? 'full' : 'open',
      size: CFG.teamSize,
      createdAt: t.created_at,
      expiresAt: t.expires_at,
      members,
    }
  }
  // 만료된 팀은 지우기 전에도 없는 팀이다
  const teamOf = async (id, t) =>
    (await db(`/recruit_teams?select=id,room,tactic,voice,password_hash,created_at,expires_at,${MEMBERS}&id=eq.${enc(id)}&expires_at=gt.${t}`))[0] || fail(404, NOT_FOUND)
  // 모집 중 = 만료 전. now 보다 나중에 만든 팀도 뺀다 — 테스트가 먼 미래 시계로 만든 팀이 실제 목록에 안 섞이게
  const live = t => `expires_at=gt.${t}&created_at=lte.${t}`
  const disband = id => db(`/recruit_teams?id=eq.${enc(id)}`, { method: 'DELETE' })   // 팀원은 on delete cascade

  // 고정 창 카운터(recruit_hit RPC) — 한 문장 upsert 라 워커 여러 개가 동시에 세도 틀리지 않는다. 늘어난 횟수를 돌려준다(-1 = 되돌리기)
  const hit = (key, windowMs, add = 1) => db('/rpc/recruit_hit', { method: 'POST', body: { p_key: key, p_now: now(), p_window: windowMs, p_add: add } })

  /**
   * 관리 권한. 본문의 비밀번호 = 팀장 권한(틀리면 403, 10분에 한 IP 가 5번 · 팀 전체가 20번 틀리면 429).
   * 비밀번호가 없으면 Bearer 토큰 — 팀장 토큰이면 팀장, 팀원 토큰이면 자기 자신만.
   */
  async function auth(request, body, row, ip) {
    if (typeof body?.password === 'string' && body.password) {
      // 먼저 한 번 센다 — 확인과 증가 사이에 scrypt(await)가 끼면 동시에 온 요청이 전부 '아직 0번'을 보고 통과한다. 맞으면 되돌린다.
      // 팀 단위로만 막으면 링크를 받은 누구나 5번 틀려서 팀장을 10분씩 잠글 수 있다 — 막는 건 틀린 그 IP 이고,
      // IP 를 바꿔 가며 찍는 건 팀 전체 20번에서 막는다(방은 최대 3시간이라 4자리 숫자도 몇 %밖에 못 찍는다).
      // 이미 막힌 IP 의 요청은 팀 전체에 세지 않는다 — 같이 세면 한 IP 가 21번 보내 팀장까지 잠근다
      const keys = [`pw ${row.id} ${ip}`, `pwt ${row.id}`]
      if (await hit(keys[0], PW_LIMIT.windowMs) > PW_LIMIT.max || await hit(keys[1], PW_LIMIT.windowMs) > PW_LIMIT.teamMax) {
        fail(429, '비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요')
      }
      if (await passwordOk(body.password, row.password_hash)) {
        await Promise.all(keys.map(k => hit(k, PW_LIMIT.windowMs, -1)))
        return { leader: true, id: null }
      }
      fail(403, '비밀번호가 맞지 않아요')
    }
    const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '')
    if (!m) fail(401, '팀 관리 권한이 없어요 — 비밀번호를 입력해 주세요')
    const [me] = await db(`/recruit_members?select=id,leader&team_id=eq.${enc(row.id)}&token_hash=eq.${sha256(m[1])}`)
    return me || fail(403, '권한이 없어요')
  }

  const newToken = () => randomBytes(18).toString('base64url')

  // 본문은 32KB 까지만 읽는다 — content-length 가 없거나(chunked) 거짓이어도 읽으면서 센다
  async function readJson(request) {
    if (!JSON_TYPE.test(request.headers.get('content-type') || '')) fail(415, 'JSON 으로 보내 주세요')
    if (+request.headers.get('content-length') > MAX_BODY) fail(413, '요청이 너무 커요')
    const decoder = new TextDecoder()
    let size = 0, raw = ''
    if (request.body) for await (const chunk of request.body) {
      if ((size += chunk.byteLength) > MAX_BODY) fail(413, '요청이 너무 커요')   // for await 를 던지며 나가면 스트림도 취소된다
      raw += decoder.decode(chunk, { stream: true })
    }
    raw += decoder.decode()
    try { return raw ? JSON.parse(raw) : null }   // 빈 본문 = 토큰만 보낸 관리 요청
    catch { fail(400, '요청 형식이 잘못됐어요') }
  }

  async function route(request) {
    const { pathname } = new URL(request.url)
    const method = request.method
    if (pathname === '/api/health' && method === 'GET') return [200, { ok: true, voice: !!(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID) }]
    const m = pathname.match(/^\/api\/teams(?:\/([^/]+)(?:\/(members|extend)(?:\/([^/]+))?)?)?$/)
    const [, id, sub, memberId] = m || []
    const action = m && [method, id && 'team', sub, memberId && 'member'].filter(Boolean).join(' ')
    if (!ACTIONS.has(action)) fail(404, '없는 주소예요')
    // 헤더가 없으면 '-' 한 통으로 센다(제한이 풀리지 않게). 긴 헤더로 키를 부풀리지 못하게 자른다
    const ip = rateKey(String(ipOf(request) || '').trim().slice(0, 64)) || '-'
    const type = request.headers.get('content-type') || ''
    // 쓰기로 세는 건 JSON 본문이나 토큰을 실은 요청만 — text/plain · 폼 POST 는 아무 사이트나 preflight 없이 보내 방문자의 한도를
    // 태울 수 있고, JSON · 토큰이 없으면 아무것도 못 바꾼다(415 · 401)
    if (method !== 'GET' && (JSON_TYPE.test(type) || request.headers.has('authorization')) && await hit(`w ${ip}`, LIMIT.windowMs) > LIMIT.max) {
      fail(429, '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요')
    }
    if (id && !TEAM_ID.test(id)) fail(404, NOT_FOUND)

    // 만들기 · 가입은 JSON 필수. 관리(해제 · 방출 · 연장)는 토큰만 보낼 수도 있어 JSON 일 때만 읽는다(DELETE 본문 허용)
    const body = action === 'POST' || action === 'POST team members' || JSON_TYPE.test(type)
      ? await readJson(request) : null
    const t = now()

    switch (action) {
      case 'GET': {
        // 모집 중(open) 먼저, 다 찬 팀(full)은 맨 뒤. 각각 먼저 만든 방이 위 — 새 방은 아래에 붙는다.
        // 목록 카드는 전술판 보드를 안 쓴다 — 빼야 인증 없는 GET 한 번이 팀 100개 × 32KB 로 불어나지 않는다
        const list = op => db(`/recruit_teams?select=id,room,preset:tactic->>preset,name:tactic->>name,voice,created_at,expires_at,${MEMBERS}`
          + `&${live(t)}&recruit_member_count=${op}.${CFG.teamSize}&order=created_at.asc,id.asc&limit=${MAX_LIST}`)
        const [open, full] = await Promise.all([list('lt'), list('gte')])
        return [200, { teams: [...open, ...full].slice(0, MAX_LIST).map(view) }]
      }

      case 'POST': {
        if (!isObj(body)) fail(400, '요청 형식이 잘못됐어요')
        const r = room(body.room), tac = tactic(body.tactic), p = person(body.member)
        const teamId = randomBytes(6).toString('base64url'), token = newToken()
        const [passwordHash, candidates] = await Promise.all([hashPassword(r.password), rooms()])
        const at = now()
        // 방 고르기(끝 방부터, 만료 전 팀이 안 잡은 첫 방) · 만료된 팀 청소 · 팀 + 팀장 저장을 RPC 가 전역 잠금 안에서 한 트랜잭션으로 한다 —
        // 워커가 여럿이어도 두 팀이 같은 방을 받지 않는다
        const { member } = await db('/rpc/recruit_create_team', {
          method: 'POST',
          body: {
            p_id: teamId, p_room: r.room, p_tactic: tac, p_rooms: candidates, p_password_hash: passwordHash,
            p_discord: p.discord, p_entries: p.entries, p_token_hash: sha256(token), p_now: at, p_expires_at: at + TTL,
          },
        })
        const team = view(await teamOf(teamId, at))
        notifier.teamCreated(team)
        return [201, { team, member: { id: member, token } }]
      }

      case 'GET team':
        return [200, view(await teamOf(id, t))]

      case 'POST team members': {
        const p = person(body), token = newToken()
        // 만료 · 정원 확인과 INSERT 는 RPC 가 팀 행을 잠근 채 한 트랜잭션으로 한다(FOR UPDATE) — 여러 요청이 동시에 와도
        // 정원을 넘지 않는다. 없는 팀 · 만료는 PT404, 다 찬 팀은 PT409 · 닉네임 중복은 23505 로 와서 사용자 문구가 된다.
        const mid = await db('/rpc/recruit_join_team', {
          method: 'POST',
          body: { p_team: id, p_discord: p.discord, p_entries: p.entries, p_token_hash: sha256(token), p_now: t, p_size: CFG.teamSize },
        })
        const team = view(await teamOf(id, t))
        // 다시 읽는 사이 다음 가입이 끼었을 수 있다. 알림은 내가 들어온 시점 기준으로 — 같은 팀의 member id 는 잠금 순서대로 커진다
        notifier.memberJoined({ ...team, members: team.members.filter(x => x.id <= mid) }, mid)
        return [201, { team, member: { id: mid, token } }]
      }

      case 'DELETE team': {   // 팀 해제 = 삭제
        const row = await teamOf(id, t)
        if (!(await auth(request, body, row, ip)).leader) fail(403, '팀장만 팀을 해제할 수 있어요')
        await disband(id)
        return [200, { ok: true }]
      }

      case 'POST team extend': {
        const row = await teamOf(id, t)
        if (!(await auth(request, body, row, ip)).leader) fail(403, '팀장만 연장할 수 있어요')
        // 남은 시간을 더하지 않고 지금부터 다시 TTL — 연장해도 최대 3시간
        await db(`/recruit_teams?id=eq.${enc(id)}&expires_at=gt.${t}`, { method: 'PATCH', body: { expires_at: t + TTL } })
        return [200, { team: view(await teamOf(id, t)) }]
      }

      case 'DELETE team members member': {   // 방출(팀장) · 나가기(본인)
        const row = await teamOf(id, t)
        const me = await auth(request, body, row, ip)
        const target = matches(/^\d{1,15}$/, memberId) && row.members.find(x => x.id === Number(memberId))
        if (!target) fail(404, '팀원을 찾을 수 없어요')
        if (!me.leader && me.id !== target.id) fail(403, '팀장만 다른 팀원을 내보낼 수 있어요')
        // 팀장이 빠지면 팀이 없어진다
        if (target.leader) {
          await disband(id)
          return [200, { ok: true, team: null }]
        }
        await db(`/recruit_members?team_id=eq.${enc(id)}&id=eq.${target.id}`, { method: 'DELETE' })
        return [200, { ok: true, team: view(await teamOf(id, t)) }]   // 다 찬 팀이면 다시 모집 중 → 목록에서 앞으로
      }
    }
  }

  return async request => {
    const origin = request.headers.get('origin')
    // Origin 마다 답이 달라지니 캐시가 섞이지 않게 Vary 를 늘 붙인다. 에러 응답에도 붙여야 화면이 오류 문구를 읽는다
    const cors = origins.length ? { vary: 'Origin', ...(origins.includes(origin) && { 'access-control-allow-origin': origin }) } : {}
    // preflight 는 운영 게이트웨이가 대신 답해 주지 않는다(요금도 안 센다). 목록에 없는 Origin 이면 허용 헤더 없이 204
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, ...(cors['access-control-allow-origin'] && PREFLIGHT) } })
    const [status, body] = await route(request).catch(e => {
      if (!e.status) log(`API 오류 ${request.method} ${new URL(request.url).pathname}:`, e)
      return [e.status || 500, { error: e.status ? e.message : '서버 오류가 났어요' }]
    })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...cors },
    })
  }
}
