// 팀원모집 API — Request 하나를 받아 Response 를 돌려주는 함수(createHandler) 하나. 저장소는 Supabase(Data API).
//
// 운영은 Supabase Edge Function(supabase/functions/recruit/index.mjs)이 이 함수를 부르고, 로컬 docker compose 는 같은
// edge-runtime 으로 띄운다(nginx 의 /api/ → 함수). 테스트(server/test.mjs)는 Node 에서 이 함수를 직접 부른다.
// 그래서 웹 표준(fetch · Request · Response)과 node:crypto · node:buffer 만 쓴다 — node:http · node:fs 는 Deno 에서 못 쓴다.
// 부르는 쪽은 둘이다: 웹 화면(Supabase Auth 디스코드 로그인 토큰)과 TNAB 디스코드 봇(봇 키 + 디스코드 ID 헤더).
// 둘 다 Supabase DB 에는 붙지 않는다 — 검증 · 권한 · 1인 1파티 · 요청 수 제한 · secret key 가 전부 여기 있다.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
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
const LIMIT = { max: 30, windowMs: 10 * 60_000 }   // 한 사람(디스코드 ID) 당 쓰기 요청
const AUTH_MEMO = { ms: 60_000, max: 500 }         // 로그인 토큰 확인 결과를 워커 메모리에 잠깐 — 요청마다 Auth 를 부르지 않게
const ROUTE_KINDS = ['move', 'pass', 'screen']
const LINK = /:\/\/|www\.|discord\.gg/i
const TEAM_ID = /^[A-Za-z0-9_-]{8}$/
const SNOWFLAKE = /^\d{17,20}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CONTROL = /[\x00-\x1f\x7f]/
const JSON_TYPE = /^application\/json\b/i
// 받는 요청 — 메서드 + 경로 조각. 예: 'POST team members' = 가입, 'DELETE team members member' = 방출 · 나가기
const ACTIONS = new Set([
  'GET me', 'PUT me profile', 'GET', 'POST', 'POST quick', 'GET team', 'DELETE team', 'POST team members', 'DELETE team members member', 'POST team extend',
])
// 브라우저는 authorization · content-type 만 보낸다(커스텀 x- 헤더는 운영 게이트웨이 preflight 에서 잘릴 수 있다). 봇의 x-discord-* 는 서버끼리라 preflight 가 없다
const PREFLIGHT = { 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '600' }

const LOGIN = '디스코드로 로그인해 주세요'
const AUTH_DOWN = '로그인 서버에 연결할 수 없어요'
const NO_PROFILE = '먼저 프로필을 등록해 주세요'
const DB_DOWN = '모집 서버 DB 에 연결할 수 없어요'
const NOT_FOUND = '팀을 찾을 수 없어요'
// RPC 가 raise 하는 sqlstate(+ message) → 사용자 문구
const RPC_ERRORS = {
  PT404: [404, NOT_FOUND], PT428: [428, NO_PROFILE], 'PT409 full': [409, '이미 다 찬 팀이에요'], 'PT409 already': [409, '이미 이 팀에 있어요'],
}

const sha256 = s => createHash('sha256').update(s).digest('hex')
const fail = (status, error) => { throw Object.assign(new Error(error), { status }) }
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const matches = (re, v) => typeof v === 'string' && re.test(v)   // 정규식 test 는 배열도 문자열로 바꿔 통과시킨다
const listOf = (a, max, min = 0) => Array.isArray(a) && a.length >= min && a.length <= max
const r3 = v => Math.round(v * 1000) / 1000
const enc = encodeURIComponent
/** Supabase 키 — 운영은 Supabase 가 넣어 주는 SUPABASE_*_KEYS(JSON 의 default), 로컬 compose 는 SUPABASE_*_KEY */
const keyOf = (env, name) => {
  try { return JSON.parse(env[`${name}S`] || '{}').default || env[name] || '' }
  catch { return env[name] || '' }
}

// ---------------------------------------------------------------- 검증 (신뢰 경계 — 허용한 필드만 다시 만든다)

/** 앞뒤 공백을 떼고 길이는 코드포인트로 센다(한글·이모지 한 글자 = 1). 링크는 못 넣는다. lines = 줄바꿈(\n)만 허용(메모). */
function text(v, max, what, min = 1, lines = false) {
  if (typeof v !== 'string') fail(400, `${what}을(를) 확인해 주세요`)
  const s = v.trim(), n = [...s].length
  if ((lines ? /[\x00-\x09\x0b-\x1f\x7f]/ : CONTROL).test(s)) fail(400, `${what}에 쓸 수 없는 문자가 있어요`)
  if (n < min || n > max) fail(400, min ? `${what}은(는) ${min}~${max}자로 입력해 주세요` : `${what}은(는) ${max}자까지 입력할 수 있어요`)
  if (LINK.test(s)) fail(400, `${what}에 링크는 넣을 수 없어요`)
  return s
}

const oneOf = (map, v) => typeof v === 'string' && Object.hasOwn(map, v)

function room(v) {
  if (!isObj(v)) fail(400, '방 설정을 입력해 주세요')
  if (!oneOf(CFG.mics, v.mic)) fail(400, '마이크 조건을 골라 주세요')
  if (!oneOf(CFG.modes, v.mode)) fail(400, `${Object.values(CFG.modes).join(' · ')} 중에 골라 주세요`)
  return { title: text(v.title ?? '', L.title, '방 제목', 0), mic: v.mic, mode: v.mode, memo: text(v.memo ?? '', L.memo, '메모', 0, true) }
}

/** 프로필: 표시 이름 + 개인 마이크 O/X + 게임 계정 1~3줄(첫 줄 대표).
 *  이름을 안 보내면(봇 · 옛 화면) 저장돼 있던 이름을 그대로 둔다 — 디스코드 서버 별명과 계정 이름이 다를 수 있어 본인이 고른다 */
function profile(v) {
  if (!isObj(v)) fail(400, '프로필 정보가 없어요')
  if (typeof v.mic !== 'boolean') fail(400, '마이크 사용 여부를 골라 주세요')
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
  return { name: v.name == null ? null : text(v.name, 32, '표시 이름'), mic: v.mic, entries }
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

// ---------------------------------------------------------------- Supabase Data API (PostgREST)

/**
 * Data API 호출 함수를 만든다. 요청 하나 = 트랜잭션 하나. 키는 apikey 헤더에만 싣는다 — 클라우드의 sb_secret_ 는 JWT 가
 * 아니라서 Authorization 에 넣으면 거절된다(로컬은 nginx 가 apikey 를 Authorization 으로 옮긴다). 키 · 쿼리는 로그에 안 남긴다.
 * 연결 실패 · 시간 초과 · 5xx 는 503, RPC 거절(PTxxx)은 사용자 문구, 나머지는 500(로그).
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
    const known = Object.hasOwn(RPC_ERRORS, code) ? RPC_ERRORS[code] : RPC_ERRORS[`${code} ${message}`]
    if (known) fail(...known)
    if (res.status >= 500 || !code) {   // 코드 없는 응답 = PostgREST 가 아닌 앞단(프록시 502 등)
      log(`DB 응답 ${res.status} ${where}: ${code ? `${code} ${message}` : raw.slice(0, 200)}`)
      fail(503, DB_DOWN)
    }
    throw new Error(`DB ${res.status} ${where}: ${code} ${message}`)
  }
}

// 팀원은 팀장 먼저, 들어온 순. 이름 · 마이크 · 계정은 프로필을 조인한다 — 프로필을 고치면 파티에도 바로 보인다. auth_user_id 는 고르지 않는다
const MEMBERS = 'members:recruit_members(discord_user_id,leader,joined_at,profile:recruit_profiles(discord_name,mic,entries))'
  + '&members.order=leader.desc,joined_at.asc,discord_user_id.asc'

// ---------------------------------------------------------------- API

/**
 * (request: Request) => Promise<Response> 를 만든다. 경로는 /api/... (Edge Function 은 앞의 /recruit 를 떼고 넘긴다).
 * now 는 테스트가 시간을 돌리려고, fetch 는 가짜 Data API · Auth · 디스코드를 끼우려고 받는다. waitUntil = 응답 뒤에도 끝내야 할 일(디스코드 알림).
 * 워커 메모리에는 로그인 확인 결과(60초)만 둔다 — 제한 횟수 · 방 배정 · 1인 1파티는 DB 가 센다.
 */
export function createHandler({ env = {}, now = Date.now, fetch = globalThis.fetch, waitUntil = p => p, log = console.log } = {}) {
  const db = supabase({ url: env.SUPABASE_URL, key: keyOf(env, 'SUPABASE_SECRET_KEY'), fetch, log })
  const publishable = keyOf(env, 'SUPABASE_PUBLISHABLE_KEY')
  const botKey = Buffer.from(env.TNAB_BOT_KEY || '')
  const notifier = createNotifier({
    webhookUrl: env.DISCORD_WEBHOOK_URL, siteUrl: env.SITE_URL, guildId: env.DISCORD_GUILD_ID, players: PLAYERS, modes: CFG.modes, fetch, waitUntil, log,
  })
  const rooms = () => voiceRooms({ botToken: env.DISCORD_BOT_TOKEN, guildId: env.DISCORD_GUILD_ID, categoryId: env.DISCORD_VOICE_CATEGORY_ID, fetch, now, log })
  // 화면이 다른 도메인(GitHub Pages)에서 부른다 — 목록에 있는 Origin 만 그대로 돌려준다(쉼표로 여러 개)
  const origins = (env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)

  // ------------------------------------------------ 신원: { id: 디스코드 ID 문자열, name, authUserId, admin }

  const authMemo = new Map()   // sha256(토큰) → { user, until }
  /**
   * 웹: Supabase Auth 에 토큰을 보여 사용자를 받는다. 디스코드 ID 는 identities 의 discord 항목에서만 꺼낸다 —
   * user_metadata 는 사용자가 updateUser 로 고칠 수 있어 믿지 않는다.
   */
  async function webUser(token) {
    const key = sha256(token), memo = authMemo.get(key)
    if (memo && memo.until > now()) return memo.user
    if (!publishable) { log('SUPABASE_PUBLISHABLE_KEYS 가 없어 로그인을 확인할 수 없습니다'); fail(503, AUTH_DOWN) }
    let res, body
    try {
      // SUPABASE_AUTH_URL: 로컬 compose 는 DB 만 흉내 내고 로그인 확인은 클라우드 Auth 에 맡긴다(운영은 비워 두면 SUPABASE_URL)
      res = await fetch(`${(env.SUPABASE_AUTH_URL || env.SUPABASE_URL || '').replace(/\/+$/, '')}/auth/v1/user`, {
        headers: { apikey: publishable, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000),
      })
      if (res.status === 401 || res.status === 403) fail(401, LOGIN)   // 만료 · 로그아웃 · 가짜 토큰
      body = res.ok ? await res.json() : null
    } catch (e) {
      if (e.status) throw e
      log(`로그인 확인 실패: ${errText(e)}`)
      fail(503, AUTH_DOWN)
    }
    if (!isObj(body)) { log(`로그인 확인 응답 ${res.status}`); fail(503, AUTH_DOWN) }
    const identity = Array.isArray(body.identities) && body.identities.find(i => i?.provider === 'discord')
    if (!matches(SNOWFLAKE, identity?.id)) fail(401, LOGIN)   // 디스코드가 아닌 계정(또는 연결을 끊은 계정)
    const d = isObj(identity.identity_data) ? identity.identity_data : {}
    const name = [d.custom_claims?.global_name, d.full_name, d.name]
      .map(s => typeof s === 'string' ? s.replace(/[\x00-\x1f\x7f]/g, '').trim() : '').find(Boolean) || 'Discord 사용자'
    const user = { id: identity.id, name: [...name].slice(0, 80).join(''), authUserId: matches(UUID, body.id) ? body.id : null, admin: false }
    if (authMemo.size >= AUTH_MEMO.max) authMemo.clear()   // 오래된 것부터 고르는 대신 통째로 — 다음 요청이 Auth 를 한 번 더 부를 뿐
    authMemo.set(key, { user, until: now() + AUTH_MEMO.ms })
    return user
  }

  /**
   * 봇: 봇 키가 맞으면 헤더의 디스코드 ID · 이름을 믿는다(봇이 interaction.user 에서 넣는다). 관리자 여부도 봇이 디스코드 권한을 보고 넣는다.
   * 키가 32자보다 짧거나 없으면 봇 인증을 끈다 — 짧은 키는 찍어 맞힐 수 있다.
   */
  function botUser(request, key) {
    const got = Buffer.from(key)
    if (botKey.length < 32 || got.length !== botKey.length || !timingSafeEqual(got, botKey)) fail(401, LOGIN)
    const h = request.headers, id = h.get('x-discord-user') || ''
    if (!SNOWFLAKE.test(id)) fail(400, '디스코드 사용자 ID 가 잘못됐어요')
    let name = ''
    try { name = decodeURIComponent(h.get('x-discord-name') || '').trim() } catch {}   // 헤더는 latin1 이라 봇이 퍼센트 인코딩해 보낸다
    if (!name || CONTROL.test(name) || [...name].length > 80) fail(400, '디스코드 이름이 잘못됐어요')
    return { id, name, authUserId: null, admin: h.get('x-discord-admin') === '1' }
  }

  async function identity(request) {
    const [, scheme, cred] = /^(Bearer|Bot)\s+(\S+)$/i.exec(request.headers.get('authorization') || '') || []
    if (!scheme) fail(401, LOGIN)
    return scheme.toLowerCase() === 'bot' ? botUser(request, cred) : webUser(cred)
  }

  // ------------------------------------------------ 팀 · 프로필 읽기

  // 클라이언트가 보는 팀 모양은 이것 하나뿐 — 필드를 골라 새로 만든다(auth_user_id 같은 내부 값은 넣지 않는다).
  // 목록 행은 tactic 대신 preset · name 만 온다.
  function view(t) {
    const members = t.members.map(m => ({
      userId: m.discord_user_id, name: m.profile.discord_name, mic: m.profile.mic, entries: m.profile.entries, leader: m.leader, joinedAt: m.joined_at,
    }))
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
  const findTeam = async (id, t) =>
    (await db(`/recruit_teams?select=id,room,tactic,voice,created_at,expires_at,${MEMBERS}&id=eq.${enc(id)}&expires_at=gt.${t}`))[0] || null
  const teamOf = async (id, t) => await findTeam(id, t) || fail(404, NOT_FOUND)
  // 모집 중 = 만료 전. now 보다 나중에 만든 팀도 뺀다 — 테스트가 먼 미래 시계로 만든 팀이 실제 목록에 안 섞이게
  const live = t => `expires_at=gt.${t}&created_at=lte.${t}`
  const disband = id => db(`/recruit_teams?id=eq.${enc(id)}`, { method: 'DELETE' })   // 팀원은 on delete cascade
  const isLeader = (team, user) => !!team.members.find(m => m.userId === user.id)?.leader

  // 고정 창 카운터(recruit_hit RPC) — 한 문장 upsert 라 워커 여러 개가 동시에 세도 틀리지 않는다. 늘어난 횟수를 돌려준다
  const hit = (key, windowMs) => db('/rpc/recruit_hit', { method: 'POST', body: { p_key: key, p_now: now(), p_window: windowMs, p_add: 1 } })

  /** 내 프로필 + 지금 든 팀 id. 표시 이름은 프로필에 저장된 것을 쓴다 —
   *  처음 만들 때 디스코드 이름으로 채워지고, 그 뒤로는 본인이 화면에서 고칠 때만 바뀐다(서버 별명이 다른 경우) */
  async function mine(user) {
    const [p] = await db(`/recruit_profiles?select=discord_name,mic,entries,updated_at,member:recruit_members(team_id,team:recruit_teams(expires_at))&discord_user_id=eq.${user.id}`)
    return p || null
  }
  const profileView = (user, p) => ({ userId: user.id, name: p.discord_name, mic: p.mic, entries: p.entries, updatedAt: p.updated_at })

  /** 만들기 · 가입 전: 프로필 확인(없으면 428 — RPC 도 잠금 안에서 다시 확인한다)과, 1인 1파티로 빠질 기존 팀의 스냅샷(알림용) */
  async function current(user, t) {
    const p = await mine(user) || fail(428, NO_PROFILE)
    return p.member ? findTeam(p.member.team_id, t) : null
  }

  // 1인 1파티로 빠진 기존 팀 알림. 스냅샷은 RPC 전에 읽은 것 — 그 사이 다른 팀으로 바뀌었으면(드묾) 알림만 건너뛴다
  function leftNotice(left, old, userId) {
    if (!left || old?.id !== left.teamId) return
    const before = view(old), me = before.members.find(m => m.userId === userId)
    if (left.disbanded) notifier.teamDisbanded(before, 'move')
    else if (me) notifier.memberLeft({ ...before, members: before.members.filter(m => m !== me) }, me, 'move')
  }

  async function join(id, user, old, t) {
    // 만료 · 이미 이 팀 · 정원 확인, 기존 팀에서 빠지기, INSERT 를 RPC 가 전역 잠금 안에서 한 트랜잭션으로 한다 —
    // 여러 요청이 동시에 와도 정원을 넘지 않고, 같은 사람이 두 팀에 남지 않는다
    const { left, count } = await db('/rpc/recruit_join_team', { method: 'POST', body: { p_team: id, p_actor: user.id, p_now: t, p_size: CFG.teamSize } })
    const team = view(await teamOf(id, t))
    leftNotice(left, old, user.id)
    notifier.memberJoined(team, user.id, count)
    return { team, left }
  }

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
    try { return raw ? JSON.parse(raw) : null }
    catch { fail(400, '요청 형식이 잘못됐어요') }
  }

  async function route(request) {
    const { pathname } = new URL(request.url)
    const method = request.method
    if (pathname === '/api/health' && method === 'GET') {
      return [200, { ok: true, voice: !!(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID), login: !!publishable }]
    }
    const me = pathname.match(/^\/api\/me(\/profile)?$/)
    const m = pathname.match(/^\/api\/teams(?:\/([^/]+)(?:\/(members|extend)(?:\/([^/]+))?)?)?$/)
    const [, id, sub, userId] = m || []
    const action = me ? `${method} me${me[1] ? ' profile' : ''}`
      : m && (id === 'quick' && !sub ? `${method} quick` : [method, id && 'team', sub, userId && 'member'].filter(Boolean).join(' '))
    if (!ACTIONS.has(action)) fail(404, '없는 주소예요')
    if (id && action !== 'POST quick' && !TEAM_ID.test(id)) fail(404, NOT_FOUND)
    const t = now()

    // 공개 읽기 — 로그인 없이 목록 · 팀 화면(카톡 링크)
    if (action === 'GET') {
      // 모집 중(open) 먼저, 다 찬 팀(full)은 맨 뒤. 각각 먼저 만든 방이 위 — 새 방은 아래에 붙는다.
      // 목록 카드는 전술판 보드를 안 쓴다 — 빼야 인증 없는 GET 한 번이 팀 100개 × 32KB 로 불어나지 않는다
      const list = op => db(`/recruit_teams?select=id,room,preset:tactic->>preset,name:tactic->>name,voice,created_at,expires_at,${MEMBERS}`
        + `&${live(t)}&recruit_member_count=${op}.${CFG.teamSize}&order=created_at.asc,id.asc&limit=${MAX_LIST}`)
      const [open, full] = await Promise.all([list('lt'), list('gte')])
      return [200, { teams: [...open, ...full].slice(0, MAX_LIST).map(view) }]
    }
    if (action === 'GET team') return [200, view(await teamOf(id, t))]

    const user = await identity(request)
    // 쓰기는 신원을 확인한 뒤 사람 단위로 센다 — 로그인 · 봇 키 없이 온 요청은 여기까지 못 와서 남의 한도를 태우지 못한다
    if (method !== 'GET' && await hit(`w ${user.id}`, LIMIT.windowMs) > LIMIT.max) fail(429, '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요')
    const body = action === 'POST' || action === 'PUT me profile' ? await readJson(request) : null   // 나머지는 본문을 읽지 않는다

    switch (action) {
      case 'GET me': {
        const p = await mine(user)
        const teamId = p?.member?.team?.expires_at > t ? p.member.team_id : null   // 만료됐지만 아직 안 지운 팀은 없는 팀
        return [200, { user: { id: user.id, name: user.name }, profile: p && profileView(user, p), teamId }]
      }

      case 'PUT me profile': {
        const p = profile(body)
        // 이름을 안 보냈으면 저장돼 있던 이름을, 프로필이 아직 없으면 디스코드 이름을 쓴다
        const name = p.name ?? (await mine(user))?.discord_name ?? user.name
        await db('/rpc/recruit_upsert_profile', {
          method: 'POST', body: { p_user: user.id, p_auth: user.authUserId, p_name: name, p_mic: p.mic, p_entries: p.entries, p_now: t },
        })
        return [200, { profile: { userId: user.id, name, mic: p.mic, entries: p.entries, updatedAt: t } }]
      }

      case 'POST': {
        if (!isObj(body)) fail(400, '요청 형식이 잘못됐어요')
        const r = room(body.room), tac = tactic(body.tactic)
        const [old, candidates] = await Promise.all([current(user, t), rooms()])
        const teamId = randomBytes(6).toString('base64url'), at = now()
        // 방 고르기(끝 방부터, 만료 전 팀이 안 잡은 첫 방) · 만료된 팀 청소 · 기존 팀에서 빠지기 · 팀 + 팀장 저장을 RPC 가 전역 잠금 안에서
        // 한 트랜잭션으로 한다 — 워커가 여럿이어도 두 팀이 같은 방을 받지 않고, 한 사람이 두 팀에 남지 않는다
        const { left } = await db('/rpc/recruit_create_team', {
          method: 'POST',
          body: { p_id: teamId, p_actor: user.id, p_room: r, p_tactic: tac, p_rooms: candidates, p_now: at, p_expires_at: at + TTL },
        })
        const team = view(await teamOf(teamId, at))
        leftNotice(left, old, user.id)
        notifier.teamCreated(team)
        return [201, { team, left }]
      }

      case 'POST team members':
        return [201, await join(id, user, await current(user, t), t)]

      case 'POST quick': {   // 봇의 "빠른 참가": 가장 오래된 모집 중 팀(내 팀 제외). 고르는 사이 차거나 없어진 팀은 건너뛴다
        const old = await current(user, t)
        const open = await db(`/recruit_teams?select=id&${live(t)}&recruit_member_count=lt.${CFG.teamSize}`
          + `${old ? `&id=neq.${enc(old.id)}` : ''}&order=created_at.asc,id.asc&limit=5`)
        for (const row of open) {
          try { return [201, await join(row.id, user, old, t)] }
          catch (e) { if (![404, 409].includes(e.status)) throw e }
        }
        fail(404, '참가할 수 있는 모집 중인 팀이 없어요')
      }

      case 'DELETE team': {   // 팀 해제 = 삭제. 봇은 디스코드 관리자 권한을 확인한 뒤 X-Discord-Admin 을 붙인다
        const team = view(await teamOf(id, t)), lead = isLeader(team, user)
        if (!lead && !user.admin) fail(403, '팀장만 팀을 해제할 수 있어요')
        await disband(id)
        notifier.teamDisbanded(team, lead ? 'disband' : 'admin')
        return [200, { ok: true }]
      }

      case 'POST team extend': {
        if (!isLeader(view(await teamOf(id, t)), user)) fail(403, '팀장만 연장할 수 있어요')
        // 남은 시간을 더하지 않고 지금부터 다시 TTL — 연장해도 최대 3시간
        await db(`/recruit_teams?id=eq.${enc(id)}&expires_at=gt.${t}`, { method: 'PATCH', body: { expires_at: t + TTL } })
        return [200, { team: view(await teamOf(id, t)) }]
      }

      case 'DELETE team members member': {   // 방출(팀장) · 나가기(본인)
        const before = view(await teamOf(id, t))
        const target = before.members.find(x => x.userId === userId) || fail(404, '팀원을 찾을 수 없어요')
        if (target.userId !== user.id && !isLeader(before, user)) fail(403, '팀장만 다른 팀원을 내보낼 수 있어요')
        if (target.leader) {   // 팀장이 빠지면 팀이 없어진다
          await disband(id)
          notifier.teamDisbanded(before, 'leader')
          return [200, { ok: true, team: null }]
        }
        await db(`/recruit_members?team_id=eq.${enc(id)}&discord_user_id=eq.${enc(userId)}`, { method: 'DELETE' })
        const team = view(await teamOf(id, t))   // 다 찬 팀이면 다시 모집 중 → 목록에서 앞으로
        notifier.memberLeft(team, target, target.userId === user.id ? 'leave' : 'kick')
        return [200, { ok: true, team }]
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
