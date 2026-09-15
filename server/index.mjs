#!/usr/bin/env node
// 팀원모집 API 서버 — Node 내장 모듈만 쓴다(http · crypto · fetch). 저장소는 Supabase(Data API).
//
//   node server/index.mjs                     # 설정은 .env 또는 환경변수 (.env.example 참고)
//   docker compose run --rm api node --test server/test.mjs
//
// 화면(recruit/)은 정적 사이트 그대로이고, 이 서버는 /api 만 맡는다. 로컬에서는 docker compose 의
// nginx 가 /api/ 를 이리로 넘긴다. 운영에서 도메인이 다르면 CORS_ORIGIN 을 채운다.
// 브라우저는 Supabase 에 붙지 않는다 — 검증 · 요청 수 제한 · 디스코드 봇 · secret key 가 전부 이 서버에 있다.

import { createServer } from 'node:http'
import { isIPv6 } from 'node:net'
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { channelUrl, connectGateway, createNotifier, createVoiceState } from './discord.mjs'

const data = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'))
const CFG = data('recruit.json')
const PLAYERS = new Map(data('players.json').players.filter(p => p.server === 'kr').map(p => [p.id, p]))   // 한국 출시만
const PRESETS = new Map(data('tactics.json').presets.map(p => [p.id, p.name]))
const TTL = CFG.ttlHours * 3_600_000
const L = CFG.limits
const MAX_BODY = 32 * 1024
const MAX_LIST = 100
const LIMIT = { max: 30, windowMs: 10 * 60_000 }        // IP 당 쓰기 요청
const PW_LIMIT = { max: 5, teamMax: 20, windowMs: 10 * 60_000 }   // 틀린 비밀번호: 한 사람(IP)이 한 팀에 · 팀 전체
const CLEANUP_MS = 5 * 60_000
const ROUTE_KINDS = ['move', 'pass', 'screen']
const LINK = /:\/\/|www\.|discord\.gg/i
const TEAM_ID = /^[A-Za-z0-9_-]{8}$/
const JSON_TYPE = /^application\/json\b/i
// 받는 요청 — 메서드 + 경로 조각. 예: 'POST team members' = 가입, 'DELETE team members member' = 방출 · 나가기
const ACTIONS = new Set(['GET', 'POST', 'GET team', 'DELETE team', 'POST team members', 'DELETE team members member', 'POST team extend'])

const sha256 = s => createHash('sha256').update(s).digest('hex')
const scryptAsync = promisify(scrypt)
const fail = (status, error) => { throw Object.assign(new Error(error), { status }) }
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const matches = (re, v) => typeof v === 'string' && re.test(v)   // 정규식 test 는 배열도 문자열로 바꿔 통과시킨다
const listOf = (a, max, min = 0) => Array.isArray(a) && a.length >= min && a.length <= max
const r3 = v => Math.round(v * 1000) / 1000
const enc = encodeURIComponent
// IPv6 는 보통 한 가입자가 /64 를 통째로 받는다 — 앞 64비트로 센다(IPv4 · ::ffff:a.b.c.d 는 그대로)
const rateKey = ip => {
  if (!isIPv6(ip) || ip.includes('.')) return ip
  const [a, b] = ip.split('%')[0].split('::'), head = a ? a.split(':') : [], tail = b ? b.split(':') : []
  const full = b === undefined ? head : [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail]
  return `${full.slice(0, 4).map(x => parseInt(x, 16).toString(16)).join(':')}::/64`
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

// 솔트 붙인 scrypt 해시로만 저장한다. 비동기 scrypt 는 스레드풀에서 돌아 다른 요청을 막지 않는다
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
export function supabase({ SUPABASE_URL = '', SUPABASE_SECRET_KEY = '' }, log = console.log) {
  const base = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`
  const headers = { apikey: SUPABASE_SECRET_KEY, 'content-type': 'application/json', accept: 'application/json' }
  return async (path, { method = 'GET', body } = {}) => {
    const where = `${method} ${path.split('?')[0]}`
    let res, raw
    try {
      res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(8000) })
      raw = await res.text()
    } catch (e) {
      log(`DB 연결 실패 ${where}: ${e.message}`)
      fail(503, DB_DOWN)
    }
    let json = null
    try { json = raw ? JSON.parse(raw) : null } catch {}
    if (res.ok) return json
    const { code, message } = json || {}
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

// ---------------------------------------------------------------- 앱

/**
 * 듣기(listen) 전의 서버를 만든다. voice 는 createVoiceState() 결과(없으면 음성채널 배정 안 함),
 * now 는 테스트에서 시간을 돌리려고 받는다. idle() = 보낼 디스코드 알림이 다 나갈 때까지, cleanup() = 만료된 팀 지우기.
 */
export function createApp({ env = process.env, voice = null, now = Date.now, log = console.log } = {}) {
  const db = supabase(env, log)
  const notifier = createNotifier({
    webhookUrl: env.DISCORD_WEBHOOK_URL, siteUrl: env.SITE_URL, guildId: env.DISCORD_GUILD_ID, players: PLAYERS, modes: CFG.modes, log,
  })
  // CORS_ORIGIN 이 비면 CORS 헤더를 아예 안 붙인다(같은 도메인에서 nginx 가 프록시)
  const cors = env.CORS_ORIGIN ? { 'access-control-allow-origin': env.CORS_ORIGIN } : {}
  const preflight = {
    ...cors, 'access-control-allow-methods': 'GET, POST, DELETE',
    'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '600',
  }
  const send = (res, code, body, extra) => {
    const json = JSON.stringify(body)
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...cors, ...extra })
    res.end(json)
  }

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

  /** 끝 방부터, 만료 전인 다른 팀이 잡아 둔 방은 건너뛴다. 봇이 없거나 아직 상태를 못 받았으면 null. */
  async function pickVoice(t) {
    if (!voice?.ready) return null
    const taken = new Set((await db(`/recruit_teams?select=voice->>id&voice=not.is.null&${live(t)}`)).map(r => r.id))
    const c = voice.emptyChannels().find(c => !taken.has(c.id))
    return c ? { id: c.id, name: c.name } : null
  }
  // ponytail: 팀 만들기(빈 방 읽기 → 저장)를 프로세스 안에서 줄 세운다. 게이트웨이 봇 때문에 API 는 한 대만 띄우는 구성이라 충분하다.
  //   여러 대로 늘리면 두 팀이 같은 방을 받을 수 있다 — 그때는 방 예약을 DB 제약이나 RPC 안으로 옮길 것
  let creating = Promise.resolve()
  const oneAtATime = fn => (creating = creating.then(fn, fn))

  // ponytail: 메모리 고정 창 · 프로세스 하나 기준(IP 당 요청 수 · 팀 당 틀린 비밀번호) — 여러 대로 늘리면 Redis 같은 공유 저장소로 옮길 것
  function counter(windowMs) {
    const hits = new Map()
    let sweepAt = 0
    return (key, t, add = 1) => {
      // 청소는 1분에 한 번만(매 요청 전체 훑기 = 키를 바꿔 가며 몰아치면 요청마다 O(n)). 그래도 넘치면 통째로 비운다 —
      // 그만큼 키를 가진 쪽은 어차피 제한을 우회한다
      if (hits.size > 10_000 && t >= sweepAt) {
        for (const [k, h] of hits) if (t >= h.reset) hits.delete(k)
        sweepAt = t + 60_000
        if (hits.size > 50_000) hits.clear()
      }
      let h = hits.get(key)
      if (!h || t >= h.reset) hits.set(key, h = { n: 0, reset: t + windowMs })
      return h.n = Math.max(0, h.n + add)   // 되돌리기(-1)가 창이 바뀐 뒤에 와도 음수로 남는 기회를 만들지 않는다
    }
  }
  const writes = counter(LIMIT.windowMs), wrongByIp = counter(PW_LIMIT.windowMs), wrongByTeam = counter(PW_LIMIT.windowMs)
  const ipOf = req => rateKey((env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || '')

  /**
   * 관리 권한. 본문의 비밀번호 = 팀장 권한(틀리면 403, 10분에 한 IP 가 5번 · 팀 전체가 20번 틀리면 429).
   * 비밀번호가 없으면 Bearer 토큰 — 팀장 토큰이면 팀장, 팀원 토큰이면 자기 자신만.
   */
  async function auth(req, body, row, t) {
    if (typeof body?.password === 'string' && body.password) {
      // 먼저 한 번 센다 — 확인과 증가 사이에 scrypt(await)가 끼면 동시에 온 요청이 전부 '아직 0번'을 보고 통과한다. 맞으면 되돌린다.
      // 팀 단위로만 막으면 링크를 받은 누구나 5번 틀려서 팀장을 10분씩 잠글 수 있다 — 막는 건 틀린 그 IP 이고,
      // IP 를 바꿔 가며 찍는 건 팀 전체 20번에서 막는다(방은 최대 3시간이라 4자리 숫자도 몇 %밖에 못 찍는다)
      const who = `${row.id} ${ipOf(req)}`
      const byIp = wrongByIp(who, t), byTeam = wrongByTeam(row.id, t)
      if (byIp > PW_LIMIT.max || byTeam > PW_LIMIT.teamMax) fail(429, '비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요')
      if (await passwordOk(body.password, row.password_hash)) {
        wrongByIp(who, t, -1); wrongByTeam(row.id, t, -1)
        return { leader: true, id: null }
      }
      fail(403, '비밀번호가 맞지 않아요')
    }
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')
    if (!m) fail(401, '팀 관리 권한이 없어요 — 비밀번호를 입력해 주세요')
    const [me] = await db(`/recruit_members?select=id,leader&team_id=eq.${enc(row.id)}&token_hash=eq.${sha256(m[1])}`)
    return me || fail(403, '권한이 없어요')
  }

  const newToken = () => randomBytes(18).toString('base64url')

  function readJson(req) {
    if (!JSON_TYPE.test(req.headers['content-type'] || '')) fail(415, 'JSON 으로 보내 주세요')
    if (+req.headers['content-length'] > MAX_BODY) fail(413, '요청이 너무 커요')
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', c => {
        if ((size += c.length) <= MAX_BODY) return chunks.push(c)
        req.removeAllListeners('data')
        reject(Object.assign(new Error('요청이 너무 커요'), { status: 413 }))
      })
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        try { resolve(raw ? JSON.parse(raw) : null) }   // 빈 본문 = 토큰만 보낸 관리 요청
        catch { reject(Object.assign(new Error('요청 형식이 잘못됐어요'), { status: 400 })) }
      })
      req.on('error', reject)
    })
  }

  async function route(req, res) {
    const { pathname } = URL.parse(req.url, 'http://x') ?? fail(400, '요청 주소가 잘못됐어요')   // 예: "//" 는 URL 이 못 된다
    const m = pathname.match(/^\/api\/teams(?:\/([^/]+)(?:\/(members|extend)(?:\/([^/]+))?)?)?$/)
    const method = req.method

    if (method === 'OPTIONS' && env.CORS_ORIGIN) { res.writeHead(204, preflight); return res.end() }
    if (pathname === '/api/health' && method === 'GET') return send(res, 200, { ok: true, voice: !!voice?.ready })
    const [, id, sub, memberId] = m || []
    const action = m && [method, id && 'team', sub, memberId && 'member'].filter(Boolean).join(' ')
    if (!ACTIONS.has(action)) fail(404, '없는 주소예요')
    if (method !== 'GET' && writes(ipOf(req), now()) > LIMIT.max) fail(429, '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요')
    if (id && !TEAM_ID.test(id)) fail(404, NOT_FOUND)

    // 만들기 · 가입은 JSON 필수. 관리(해제 · 방출 · 연장)는 토큰만 보낼 수도 있어 JSON 일 때만 읽는다(DELETE 본문 허용)
    const body = action === 'POST' || action === 'POST team members' || JSON_TYPE.test(req.headers['content-type'] || '')
      ? await readJson(req) : null
    const t = now()

    switch (action) {
      case 'GET': {
        // 모집 중(open) 먼저, 다 찬 팀(full)은 맨 뒤. 각각 먼저 만든 방이 위 — 새 방은 아래에 붙는다.
        // 목록 카드는 전술판 보드를 안 쓴다 — 빼야 인증 없는 GET 한 번이 팀 100개 × 32KB 로 불어나지 않는다
        const list = op => db(`/recruit_teams?select=id,room,preset:tactic->>preset,name:tactic->>name,voice,created_at,expires_at,${MEMBERS}`
          + `&${live(t)}&recruit_member_count=${op}.${CFG.teamSize}&order=created_at.asc,id.asc&limit=${MAX_LIST}`)
        const [open, full] = await Promise.all([list('lt'), list('gte')])
        return send(res, 200, { teams: [...open, ...full].slice(0, MAX_LIST).map(view) })
      }

      case 'POST': {
        if (!isObj(body)) fail(400, '요청 형식이 잘못됐어요')
        const r = room(body.room), tac = tactic(body.tactic), p = person(body.member)
        const teamId = randomBytes(6).toString('base64url'), token = newToken()
        const passwordHash = await hashPassword(r.password)
        // 팀 + 팀장은 RPC 한 트랜잭션으로 넣는다. 시각은 줄 안에서 잰다 — 앞 팀보다 이른 시각이면 그 팀이 잡은 방을 못 본다
        const [memberId, at] = await oneAtATime(async () => {
          const at = now()
          return [await db('/rpc/recruit_create_team', {
            method: 'POST',
            body: {
              p_id: teamId, p_room: r.room, p_tactic: tac, p_voice: await pickVoice(at), p_password_hash: passwordHash,
              p_discord: p.discord, p_entries: p.entries, p_token_hash: sha256(token), p_now: at, p_expires_at: at + TTL,
            },
          }), at]
        })
        const team = view(await teamOf(teamId, at))
        notifier.teamCreated(team)
        return send(res, 201, { team, member: { id: memberId, token } })
      }

      case 'GET team':
        return send(res, 200, view(await teamOf(id, t)))

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
        return send(res, 201, { team, member: { id: mid, token } })
      }

      case 'DELETE team': {   // 팀 해제 = 삭제
        const row = await teamOf(id, t)
        if (!(await auth(req, body, row, t)).leader) fail(403, '팀장만 팀을 해제할 수 있어요')
        await disband(id)
        return send(res, 200, { ok: true })
      }

      case 'POST team extend': {
        const row = await teamOf(id, t)
        if (!(await auth(req, body, row, t)).leader) fail(403, '팀장만 연장할 수 있어요')
        // 남은 시간을 더하지 않고 지금부터 다시 TTL — 연장해도 최대 3시간
        await db(`/recruit_teams?id=eq.${enc(id)}&expires_at=gt.${t}`, { method: 'PATCH', body: { expires_at: t + TTL } })
        return send(res, 200, { team: view(await teamOf(id, t)) })
      }

      case 'DELETE team members member': {   // 방출(팀장) · 나가기(본인)
        const row = await teamOf(id, t)
        const me = await auth(req, body, row, t)
        const target = matches(/^\d{1,15}$/, memberId) && row.members.find(x => x.id === Number(memberId))
        if (!target) fail(404, '팀원을 찾을 수 없어요')
        if (!me.leader && me.id !== target.id) fail(403, '팀장만 다른 팀원을 내보낼 수 있어요')
        // 팀장이 빠지면 팀이 없어진다
        if (target.leader) {
          await disband(id)
          return send(res, 200, { ok: true, team: null })
        }
        await db(`/recruit_members?team_id=eq.${enc(id)}&id=eq.${target.id}`, { method: 'DELETE' })
        return send(res, 200, { ok: true, team: view(await teamOf(id, t)) })   // 다 찬 팀이면 다시 모집 중 → 목록에서 앞으로
      }
    }
  }

  const server = createServer(async (req, res) => {
    try {
      await route(req, res)
    } catch (e) {
      if (!e.status) log(`API 오류 ${req.method} ${req.url}:`, e)
      if (res.headersSent) return res.destroy()
      // 너무 큰 본문은 다 받지 않는다 — 413 을 먼저 보내고 연결을 끊는다(먼저 끊으면 클라이언트는 소켓 오류만 본다)
      if (e.status === 413) res.on('finish', () => req.destroy())
      send(res, e.status || 500, { error: e.status ? e.message : '서버 오류가 났어요' }, e.status === 413 && { connection: 'close' })
    }
  })

  // 만료된 팀을 지운다(팀원은 cascade). 읽기는 전부 expires_at > now 로 거르므로 지우기 전에도 보이지 않는다
  const cleanup = () => db(`/recruit_teams?expires_at=lte.${now()}`, { method: 'DELETE' })

  return { server, idle: notifier.idle, cleanup, close: () => {} }   // close: 붙잡고 있는 DB 연결이 없다(요청마다 fetch)
}

// ---------------------------------------------------------------- 직접 실행할 때만

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.loadEnvFile() } catch (e) { if (e.code !== 'ENOENT') throw e }   // .env 가 없으면 환경변수만 쓴다(이미 있는 값이 우선)
  const env = process.env
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    console.log('SUPABASE_URL · SUPABASE_SECRET_KEY 가 없어 시작하지 않습니다 (.env.example 참고)')
    process.exit(1)
  }
  const bot = env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID
  const voice = bot ? createVoiceState({ guildId: env.DISCORD_GUILD_ID, categoryId: env.DISCORD_VOICE_CATEGORY_ID }) : null
  if (!bot) console.log('DISCORD_BOT_TOKEN · DISCORD_GUILD_ID 가 없어 음성채널을 배정하지 않습니다')
  const app = createApp({ env, voice })
  const gateway = voice && connectGateway({ token: env.DISCORD_BOT_TOKEN, intents: 129, onDispatch: voice.apply, onDisconnect: voice.reset })
  const port = +env.PORT || 3000
  app.server.listen(port, () => console.log(`팀원모집 API http://localhost:${port}/api/health`))

  // 만료된 팀 청소: 켜고 15초 뒤(docker compose 에서는 api 가 nginx 보다 먼저 떠 곧바로 부르면 실패한다) + 5분마다. Supabase 무료 플랜은 7일 동안 DB 요청이 뜸하면 프로젝트를 일시정지하는데,
  // 모집이 없는 주에도 이 요청이 계속 가서 그것도 막아 준다
  const sweep = () => app.cleanup().catch(e => console.log(`만료된 팀 청소 실패: ${e.message}`))
  setTimeout(sweep, 15_000).unref()
  setInterval(sweep, CLEANUP_MS).unref()

  // docker stop · node --watch 재시작: 새 요청을 끊고, 남은 알림을 보낸 뒤 끝낸다
  const stop = () => {
    gateway?.close()
    app.server.close(async () => {
      await app.idle()
      process.exit(0)
    })
  }
  process.once('SIGTERM', stop).once('SIGINT', stop)
}
