// 팀원모집 API 테스트 — createHandler 를 Node 에서 직접 부른다(HTTP 서버 없이 Request → Response).
//   docker compose up -d && node --test server/test.mjs
// DB 테스트는 compose 의 로컬 Supabase(http://localhost:54321, compose.yaml 의 로컬 service_role 키)를 쓴다. 떠 있지 않으면
// 이유를 달고 건너뛴다. SUPABASE_URL · SUPABASE_SECRET_KEY 로 바꿀 수 있지만 로컬 주소가 아니면 DB 테스트를 돌리지 않는다.
// 로컬에는 Supabase Auth 가 없다 — 웹 로그인(/auth/v1/user) · 웹훅 · 디스코드 REST 는 가짜 fetch 가 받는다.
// DB 는 비우지 않는다 — 대신 앱마다 먼 미래의 서로 다른 시계(now)를 줘서, 목록 · 음성채널 예약 · 요청 수 제한이 그 테스트 것만 보게 한다
// (팀 만들기 · 가입의 만료 청소는 앞 테스트의 팀을 지운다). 디스코드 ID 는 실행마다 새로 만들어 지난 실행의 프로필 · 파티와 겹치지 않는다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createHandler } from './index.mjs'
import { createNotifier, voiceRooms } from './discord.mjs'

const data = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)))
const CFG = data('recruit.json')
const TTL = CFG.ttlHours * 3_600_000
const UPCOMING = data('upcoming.json').players[0].id
const PLAYERS = new Map(data('players.json').players.map(p => [p.id, p]))
const GUILD = '100'
const SITE = 'https://site.test'
const HOUR = 3_600_000, MIN = 60_000
const BOT_KEY = 'test-only-tnab-bot-key-0123456789abcdef'   // 32자 이상
const PUB = 'sb_publishable_test'
const ctrl = n => String.fromCharCode(n)
const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// ---------------------------------------------------------------- 로컬 Supabase

// compose.yaml 의 PGRST_JWT_SECRET — 로컬 전용 값이라 여기 적어도 된다. 역할별 키를 만들어 권한을 확인한다
const LOCAL_JWT_SECRET = 'nba-kor-local-only-postgrest-jwt-secret-0914'
const jwt = role => {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role })}`
  return `${head}.${createHmac('sha256', LOCAL_JWT_SECRET).update(head).digest('base64url')}`
}
const SUPA = process.env.SUPABASE_URL || 'http://localhost:54321'
const KEY = process.env.SUPABASE_SECRET_KEY || jwt('service_role')
const rest = (path, { key = KEY, ...o } = {}) =>
  fetch(`${SUPA}/rest/v1${path}`, { ...o, headers: { ...(key && { apikey: key }), 'content-type': 'application/json', ...o.headers } })
const rows = async path => (await rest(path)).json()

let noDb = false, clockBase = 0
if (!['web', 'rest', 'localhost', '127.0.0.1'].includes(URL.parse(SUPA)?.hostname)) noDb = `SUPABASE_URL(${SUPA}) 이 로컬이 아니라 DB 테스트는 건너뜁니다 — 운영 DB 에는 테스트를 돌리지 않는다`
else {
  try {
    const latest = async (table, col) => {
      const r = await rest(`/${table}?select=${col}&order=${col}.desc&limit=1`, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
      return (await r.json())[0]?.[col] ?? 0
    }
    // 2100년 이후, 그리고 지난 실행이 남긴 팀 · 요청 수 기록보다 뒤에서 시작한다 → 다시 돌려도 창(TTL · 10분)이 겹치지 않는다
    clockBase = Math.max(4_102_444_800_000, await latest('recruit_teams', 'created_at') + 1e9, await latest('recruit_hits', 'reset_at') + 1e9)
  } catch (e) { noDb = `Data API(${SUPA}) 에 연결할 수 없어 DB 테스트는 건너뜁니다(docker compose up -d): ${e.message}` }
}
if (noDb) console.log(`# ${noDb}`)
const dbTest = (name, fn) => test(name, { skip: noDb }, fn)
// 앱(테스트)마다 1e9ms(약 11일) 떨어진 시계 — TTL(3시간)보다 한참 멀어 서로의 팀이 안 보인다. 목록은 now 보다 나중에 만든 팀을 빼므로 실제 화면에도 안 섞인다
let clocks = 0
const futureBase = () => clockBase + ++clocks * 1e9
const futureClock = () => { const base = futureBase(), t0 = Date.now(); return () => base + Date.now() - t0 }

// 디스코드 ID(18자리 문자열) — 실행 시각 13자리 + 순번 5자리. 프로필 · 파티는 DB 에 남으므로 실행마다 달라야 한다
const RUN = String(Date.now())
let ids = 0
const uid = () => `${RUN}${String(++ids).padStart(5, '0')}`

// ---------------------------------------------------------------- 신원

/** 가짜 Auth 가 돌려주는 사용자. user_metadata 에는 일부러 다른 ID · 이름을 넣는다(사용자가 고칠 수 있는 값이라 서버가 쓰면 안 된다) */
const fakeUuid = id => `00000000-0000-4000-8000-${id.slice(-12)}`
const authUser = (id, { name = `웹${id.slice(-4)}`, uuid = fakeUuid(id), data } = {}) => ({
  id: uuid, aud: 'authenticated', role: 'authenticated', email: null,
  user_metadata: { provider_id: '11111111111111111', sub: '11111111111111111', full_name: '위조 이름', custom_claims: { global_name: '위조 이름' } },
  identities: [{
    identity_id: '10000000-0000-4000-8000-000000000000', id, user_id: uuid, provider: 'discord',
    identity_data: data ?? { sub: id, provider_id: id, name: 'handle', full_name: 'handle', custom_claims: { global_name: name } },
  }],
})
// 웹 = Bearer 토큰(가짜 Auth 가 web.<id>[.<이름>] 을 알아본다), 봇 = 봇 키 + 헤더
const web = (id, name) => ({ authorization: `Bearer web.${id}${name ? `.${encodeURIComponent(name)}` : ''}` })
const bot = (id, name = `봇${id.slice(-4)}`, admin) => ({
  authorization: `Bot ${BOT_KEY}`, 'x-discord-user': id, 'x-discord-name': encodeURIComponent(name), ...(admin && { 'x-discord-admin': '1' }),
})
const LOGIN = { error: '디스코드로 로그인해 주세요' }
const AUTH_DOWN = { error: '로그인 서버에 연결할 수 없어요' }

// ---------------------------------------------------------------- 공용 준비물

const logs = []
const log = (...a) => logs.push(a.map(String).join(' '))
const responses = []   // 모든 API 응답 본문 — 토큰 · auth_user_id 가 새지 않았는지 마지막에 훑는다

// 카테고리 1 안: 2(0) 3(1) 4(2) 11(2) · 다른 카테고리 7 · 채팅 6 · 스테이지 12 · 카테고리 자신 1
const CHANNELS = [
  { id: '1', type: 4, name: '음성', position: 0 },
  { id: '2', type: 2, name: '음성 1', parent_id: '1', position: 0 },
  { id: '3', type: 2, name: '음성 2', parent_id: '1', position: 1 },
  { id: '4', type: 2, name: '음성 3', parent_id: '1', position: 2 },
  { id: '11', type: 2, name: '음성 4', parent_id: '1', position: 2 },   // 같은 position 이면 id 큰 쪽(문자열 비교면 '4' 가 앞선다)
  { id: '7', type: 2, name: '다른 방', parent_id: '8', position: 20 },
  { id: '6', type: 0, name: '채팅', parent_id: '1', position: 30 },
  { id: '12', type: 13, name: '스테이지', parent_id: '1', position: 40 },
]
const BOT = { DISCORD_BOT_TOKEN: 'bot-token', DISCORD_VOICE_CATEGORY_ID: '1' }

/**
 * 가짜 바깥세상. 경로 /auth/v1/user = Supabase Auth(authReply 로 응답을 바꾼다), https://hook.test = 웹훅(reply),
 * https://discord.com = 채널 목록(channels), http://db.test = 가짜 Data API(db(url, init) → [status, body]), 그 밖(로컬 Data API)은 진짜 fetch.
 */
function fakeNet({ channels = CHANNELS, db } = {}) {
  const net = {
    hooks: [], discord: [], auth: [], reply: () => [204],
    authReply: token => {
      const [kind, id, name] = token.split('.')
      return kind === 'web' && id ? json(200, authUser(id, name ? { name: decodeURIComponent(name) } : {})) : json(403, { code: 403, error_code: 'bad_jwt', msg: 'invalid JWT' })
    },
  }
  net.fetch = async (url, init = {}) => {
    const u = new URL(url)
    if (u.pathname === '/auth/v1/user') {
      net.auth.push({ url: String(url), headers: init.headers, signal: init.signal })
      return net.authReply(init.headers.authorization.replace(/^Bearer /, ''))
    }
    if (u.origin === 'https://hook.test') {
      net.hooks.push({ url: u.pathname + u.search, headers: init.headers, body: JSON.parse(init.body) })
      const [status, body] = net.reply()
      return json(status, body)
    }
    if (u.origin === 'https://discord.com') {
      net.discord.push({ url: String(url), headers: init.headers, signal: init.signal })
      return typeof channels === 'function' ? channels(u, init) : json(200, channels)
    }
    if (u.origin === 'http://db.test') {
      const [status, body] = await db(u, init)
      return new Response(body || null, { status, headers: { 'content-type': 'application/json' } })
    }
    return fetch(url, init)
  }
  return net
}
// 요청 수 제한(recruit_hit)은 1, 프로필 조회는 "없음" 으로 답하는 가짜 DB — DB 없이 신원 · 검증 · 404 · 413 을 본다
const FAKE_DB = u => u.pathname === '/rest/v1/rpc/recruit_hit' ? [200, '1'] : u.pathname === '/rest/v1/recruit_profiles' ? [200, '[]'] : [503, '']

let appNo = 0
/** 앱 하나 = 시계 하나 · 웹훅 경로 하나 */
function start({ env = {}, now = futureClock(), log: logTo = log, channels, db } = {}) {
  const n = ++appNo, pending = []
  const net = fakeNet({ channels, db })
  const handler = createHandler({
    env: {
      SUPABASE_URL: db ? 'http://db.test' : SUPA, SUPABASE_SECRET_KEY: db ? 'sb_secret_test' : KEY, SUPABASE_PUBLISHABLE_KEY: PUB, TNAB_BOT_KEY: BOT_KEY,
      SITE_URL: SITE + '/', DISCORD_GUILD_ID: GUILD, DISCORD_WEBHOOK_URL: `https://hook.test/${n}`, ...env,
    },
    now, fetch: net.fetch, log: logTo,
    waitUntil: p => pending.push(p),
  })
  const api = async (method, path, body, { as, headers } = {}) => {
    const res = await handler(new Request(`http://api.test${path}`, {
      method,
      headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...as, ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }))
    const text = await res.text()
    responses.push(text)
    return { status: res.status, headers: res.headers, text, body: text ? JSON.parse(text) : null }
  }
  // 응답 뒤로 넘긴 일(디스코드 알림)이 다 끝날 때까지
  const idle = async () => { while (pending.length) await Promise.all(pending.splice(0)) }
  return { api, handler, net, idle, hooks: () => net.hooks.map(h => h.body), pending }
}

const ROOM = { title: '', mic: 'required', mode: 'fun', memo: '' }
const entry = (o = {}) => ({ nick: '보노', tier: '골드', char: 'bl', ...o })
const boardToken = (o = {}) => ({
  key: 'o1', side: 'off', label: '볼 핸들러', playerId: 'bl', x: 0.12345, y: 0.4567, evil: '<script>',
  routes: [{ kind: 'move', pts: [[0.5, 0.66], [-0.2, 1.7]], color: 'red' }], ...o,
})

const PROFILE_KEYS = ['userId', 'name', 'mic', 'entries', 'updatedAt']
const VIEW_KEYS = ['id', 'room', 'tactic', 'voice', 'status', 'size', 'createdAt', 'expiresAt', 'members']
const MEMBER_KEYS = ['userId', 'name', 'mic', 'entries', 'leader', 'joinedAt']
const count = list => list.reduce((c, v) => ({ ...c, [v]: (c[v] || 0) + 1 }), {})

/** 프로필을 등록한 사람 하나. kind 'web' | 'bot' */
async function person(api, { kind = 'web', name, mic = true, entries } = {}) {
  const id = uid(), as = kind === 'bot' ? bot(id, name) : web(id, name)
  const r = await api('PUT', '/api/me/profile', { mic, entries: entries ?? [entry({ nick: `n${id.slice(-5)}` })] }, { as })
  assert.equal(r.status, 200, r.text)
  return { id, as, name: r.body.profile.name }
}
const create = (api, who, tactic = { preset: 'pnr' }, room = {}) => api('POST', '/api/teams', { room: { ...ROOM, ...room }, tactic }, { as: who.as })
const me = (api, who) => api('GET', '/api/me', undefined, { as: who.as })
const quick = (api, who) => api('POST', '/api/teams/quick', undefined, { as: who.as })
const teamApi = (api, id) => ({
  get: () => api('GET', `/api/teams/${id}`),
  join: who => api('POST', `/api/teams/${id}/members`, undefined, { as: who.as }),
  kick: (userId, who) => api('DELETE', `/api/teams/${id}/members/${userId}`, undefined, { as: who?.as }),
  disband: who => api('DELETE', `/api/teams/${id}`, undefined, { as: who?.as }),
  extend: who => api('POST', `/api/teams/${id}/extend`, undefined, { as: who?.as }),
})
const userIds = team => team.members.map(m => m.userId)

// ---------------------------------------------------------------- 음성채널 후보 (디스코드 REST)

// voiceRooms 는 워커(모듈) 안에서 1분 기억한다 — 테스트마다 다른 서버 ID 를 써서 서로의 기억을 피한다
test('음성채널 후보: 음성채널(type 2)만 · 카테고리 안만 · 끝 방부터(position 큰 순, 같으면 id 큰 순) · 봇 헤더', async () => {
  const net = fakeNet(), nlogs = []
  const rooms = await voiceRooms({ botToken: 'tok', guildId: 'g-parse', categoryId: '1', fetch: net.fetch, now: () => 0, log: m => nlogs.push(m) })
  assert.deepEqual(rooms, [{ id: '11', name: '음성 4' }, { id: '4', name: '음성 3' }, { id: '3', name: '음성 2' }, { id: '2', name: '음성 1' }])
  const [call] = net.discord
  assert.equal(call.url, 'https://discord.com/api/v10/guilds/g-parse/channels')
  assert.equal(call.headers.authorization, 'Bot tok')
  assert.match(call.headers['user-agent'], /^DiscordBot \(https:\/\/nba-kor\.github\.io, [\d.]+\)$/)
  assert.ok(call.signal instanceof AbortSignal, '응답 없는 디스코드가 팀 만들기를 붙잡지 않게 시간 제한')
  assert.deepEqual(nlogs, [])

  const all = await voiceRooms({ botToken: 'tok', guildId: 'g-all', fetch: net.fetch, now: () => 0 })
  assert.deepEqual(all.map(r => r.id), ['7', '11', '4', '3', '2'], '카테고리를 안 주면 서버의 음성채널 전부')

  // 이상한 항목은 버리고 멀쩡한 것만
  const odd = fakeNet({ channels: [null, 5, { id: 'x1', type: 2, name: 'a' }, { id: '9', type: 2 }, { id: '99999999999999999999', type: 2, name: '큰 id', position: 1 }, { id: '5', type: 2, name: '작은 id', position: 1 }] })
  assert.deepEqual((await voiceRooms({ botToken: 'tok', guildId: 'g-odd', fetch: odd.fetch, now: () => 0 })).map(r => r.id), ['99999999999999999999', '5'])
})

test('음성채널 후보: 서버의 잠수(AFK) 채널은 뺀다 · 서버 정보를 못 읽으면 거르지 않고 그대로', async () => {
  const guild = afk => (u, init) => u.pathname.endsWith('/channels') ? json(200, CHANNELS) : afk(u, init)
  const afk = fakeNet({ channels: guild(() => json(200, { id: 'g-afk', afk_channel_id: '11' })) })
  assert.deepEqual((await voiceRooms({ botToken: 'tok', guildId: 'g-afk', categoryId: '1', fetch: afk.fetch, now: () => 0 })).map(r => r.id), ['4', '3', '2'])
  assert.deepEqual(afk.discord.map(c => [c.url, c.headers.authorization]), [
    ['https://discord.com/api/v10/guilds/g-afk/channels', 'Bot tok'], ['https://discord.com/api/v10/guilds/g-afk', 'Bot tok'],
  ])
  for (const [reply, why] of [[() => { throw new TypeError('fetch failed') }, '연결 실패'], [() => json(403, { code: 50001 }), '403'], [() => json(200, null), '빈 응답']]) {
    const net = fakeNet({ channels: guild(reply) })
    const rooms = await voiceRooms({ botToken: 'tok', guildId: `g-afk-${why}`, categoryId: '1', fetch: net.fetch, now: () => 0 })
    assert.deepEqual(rooms.map(r => r.id), ['11', '4', '3', '2'], why)
  }
})

test('음성채널 후보: 봇 토큰 · 서버 ID 가 없으면 부르지 않고 []', async () => {
  const net = fakeNet()
  assert.deepEqual(await voiceRooms({ botToken: '', guildId: 'g-none', fetch: net.fetch }), [])
  assert.deepEqual(await voiceRooms({ botToken: 'tok', guildId: '', fetch: net.fetch }), [])
  assert.equal(net.discord.length, 0)
})

test('음성채널 후보: 1분 기억 · 실패는 [] + 로그 · 401 도 1분 기억(다시 안 부름) · 연결 실패는 기억 안 함', async () => {
  let clock = 1_000_000, reply = () => json(200, CHANNELS)
  const net = fakeNet({ channels: () => reply() }), nlogs = []
  const call = (guildId = 'g-memo') => voiceRooms({ botToken: 'tok', guildId, categoryId: '1', fetch: net.fetch, now: () => clock, log: m => nlogs.push(m) })

  assert.equal((await call()).length, 4)
  clock += 59_999
  reply = () => json(200, [])
  assert.equal((await call()).length, 4, '1분 안에는 기억한 목록')
  assert.equal(net.discord.length, 2, '채널 목록 + 서버 정보(잠수 채널)')
  clock += 1
  assert.deepEqual(await call(), [], '1분이 지나면 다시 부른다')
  assert.equal(net.discord.length, 4)

  reply = () => json(401, { message: '401: Unauthorized', code: 0 })
  assert.deepEqual(await call('g-401'), [])
  assert.ok(nlogs.some(l => l.includes('401')), nlogs.join('\n'))
  clock += 30_000
  reply = () => json(200, CHANNELS)
  assert.deepEqual(await call('g-401'), [], '401 뒤 1분은 디스코드를 다시 부르지 않는다(틀린 요청이 쌓이면 Cloudflare 가 막는다)')
  assert.equal(net.discord.length, 6)

  reply = () => { throw new TypeError('fetch failed') }
  assert.deepEqual(await call('g-down'), [])
  reply = () => json(200, CHANNELS)
  assert.equal((await call('g-down')).length, 4, '연결 실패는 기억하지 않아 다음 팀 만들 때 다시 부른다')

  reply = () => json(200, { message: 'not a list' })
  clock += 60_000
  assert.deepEqual(await call('g-down'), [], '목록이 아닌 응답')
  assert.ok(!nlogs.join('\n').includes('tok'), '봇 토큰은 로그에 없다')
})

// ---------------------------------------------------------------- 알림 (웹훅 payload)

const POS = ['', 'PG', 'SG', 'SF', 'PF', 'C']
const charName = id => `${POS[PLAYERS.get(id).pos]} ${PLAYERS.get(id).name}`

test('알림: 방 마이크 3단계 · 멤버 줄(이름 · 티어 · 대표 캐릭터 · 마이크 O/X) · 모집 완료만 파티원 멘션 · 이탈 · 해제', async () => {
  const net = fakeNet(), pending = []
  const n = createNotifier({ webhookUrl: 'https://hook.test/n', siteUrl: SITE, guildId: GUILD, players: PLAYERS, modes: CFG.modes, fetch: net.fetch, waitUntil: p => pending.push(p), log })
  const mem = (userId, name, o = {}) => ({ userId, name, mic: true, entries: [entry({ nick: name })], leader: false, joinedAt: 0, ...o })
  const A = mem('111111111111111111', 'Bono<@1>', { leader: true, entries: [entry({ nick: '보노_*' }), entry({ char: 'klfd' })] })
  const B = mem('22222222222222222222', '@everyone', { mic: false, entries: [entry({ tier: '전성기', char: 'sga' })] })
  const C = mem('33333333333333333', 'c')
  const team = (members, room = {}, tactic = { preset: 'high-low', name: '하이-로우', board: null }) => ({
    id: 'AbCdEfGh', room: { ...ROOM, ...room }, tactic, voice: { id: '11', name: '음성 4' }, status: 'open', size: 3, createdAt: 0, expiresAt: TTL, members,
  })
  n.teamCreated(team([A], { title: '빡겜 *3판*만', mode: 'serious', memo: '디코 필수\n<@123> - 매너' }))
  n.memberJoined(team([A, B], { mic: 'listen' }), B.userId, 2)
  n.memberJoined(team([A, B, C], { mic: 'off' }), C.userId, 3)
  n.memberJoined(team([A, B, C]), B.userId, 2)   // 다시 읽은 뷰에 뒤이은 가입이 섞여도 인원은 RPC 가 센 count 로 — 완료가 두 번 안 간다
  n.memberLeft(team([A, B]), C, 'leave')
  n.memberLeft(team([A]), B, 'kick')
  n.memberLeft(team([A]), B, 'move')
  for (const why of ['disband', 'leader', 'move', 'admin']) n.teamDisbanded(team([A, B], {}, { preset: null, name: '', board: null }), why)
  while (pending.length) await Promise.all(pending.splice(0))

  const sent = net.hooks.map(h => h.body)
  assert.equal(sent.length, 11)
  for (const h of net.hooks) {
    assert.match(h.url, /^\/n\?wait=true$/)
    assert.match(h.headers['user-agent'], /^DiscordBot \(/)
    assert.equal(h.body.username, 'NBA 덩크 시티 팀원모집')
  }
  const full = sent[2]
  sent.forEach((b, i) => i !== 2 && assert.deepEqual([b.allowed_mentions, b.content], [{ parse: [] }, undefined], `${i}: 모집 완료 말고는 멘션 없음`))
  assert.deepEqual(full.allowed_mentions, { users: [A.userId, B.userId, C.userId] }, '멘션 대상 = 파티원 ID(문자열)만')
  assert.equal(full.content, `<@${A.userId}> <@${B.userId}> <@${C.userId}>`)

  const lineA = `**Bono\\<\\@1\\>** (골드) · PG 라멜로 볼 외 1개 · 마이크 O`
  const lineB = `**\\@everyone** (전성기) · ${charName('sga')} · 마이크 X`
  const lineC = `**c** (골드) · PG 라멜로 볼 · 마이크 O`
  const [e1, e2, e3, e4, l1, l2, l3, d1, d2, d3, d4] = sent.map(b => b.embeds[0])
  assert.equal(e1.title, '🏀 팀원 모집 시작 · 빡겜 3판만', '제목은 방 제목 우선 · 이스케이프 대신 마크다운 기호를 뺀다')
  assert.equal(e1.url, `${SITE}/recruit/?t=AbCdEfGh`)
  assert.equal(e1.color, 0xf5a623)
  assert.equal(e1.description, `🎙️ 마이크 필수 · 빡겜 · 전술 하이\\-로우\n\n${lineA}\n\n모집 1/3`)
  assert.deepEqual(e1.fields, [
    { name: '음성채널', value: `<#11>\n[바로 들어가기](https://discord.com/channels/${GUILD}/11)` }, { name: '메모', value: '디코 필수\n\\<\\@123\\> \\- 매너' },
  ])
  assert.deepEqual(e1.thumbnail, { url: `${SITE}/assets/players/bl.png` })

  assert.deepEqual([e2.title, e2.color, e2.description], ['✅ 팀원 합류 · 하이-로우 (2/3)', 0x4d9eff, `🎧 듣코가능 · 즐겜 · 전술 하이\\-로우\n\n${lineB}`])
  assert.deepEqual(e2.fields, [], '메모가 없으면 메모 필드도 없다')
  assert.deepEqual([e3.title, e3.color], ['🎉 모집 완료 · 하이-로우', 0x35c6a7])
  assert.equal(e3.description, `🔇 마이크 필요없음 · 즐겜 · 전술 하이\\-로우\n\n${lineA}\n${lineB}\n${lineC}`)
  assert.ok(!/(^|[^\\])[<@]/.test(e3.description), '멘션이 될 수 있는 < @ 는 설명에서 전부 이스케이프')
  assert.deepEqual(e3.fields, [{ name: '음성채널', value: `<#11> 로 모여주세요\n[바로 들어가기](https://discord.com/channels/${GUILD}/11)` }])
  assert.equal(e4.title, '✅ 팀원 합류 · 하이-로우 (2/3)')

  assert.deepEqual([l1.title, l1.color, l1.description], ['👋 팀원 이탈 · 하이-로우 (2/3)', 0x8a94a6, `🎙️ 마이크 필수 · 즐겜 · 전술 하이\\-로우\n\n${lineC}\n팀에서 나갔어요`])
  assert.deepEqual([l2.title, l2.description.split('\n').at(-1)], ['👋 팀원 이탈 · 하이-로우 (1/3)', '팀장이 내보냈어요'])
  assert.equal(l3.description.split('\n').at(-1), '다른 팀으로 옮겼어요')
  assert.deepEqual([d1.title, d1.color, d1.description], ['🛑 팀 해제 · 전술 자유', 0xe5534b, '🎙️ 마이크 필수 · 즐겜 · 전술 자유\n\n팀장이 팀을 해제했어요'])
  assert.deepEqual([d2, d3, d4].map(d => d.description.split('\n\n')[1]), ['팀장이 나가서 팀이 해제됐어요', '팀장이 다른 팀으로 옮겨 팀이 해제됐어요', '관리자가 팀을 해제했어요'])
})

test('알림: 음성채널 없음 문구 · 웹훅 429 는 한 번 기다렸다 재시도(30초 넘게 기다리라면 버림) · 404 면 끈다 · 로그에 URL 없음', async () => {
  const net = fakeNet(), nlogs = [], pending = []
  const n = createNotifier({
    webhookUrl: 'https://hook.test/notify', siteUrl: SITE, guildId: GUILD, players: PLAYERS, modes: CFG.modes,
    fetch: net.fetch, waitUntil: p => pending.push(p), log: m => nlogs.push(m),
  })
  const idle = async () => { while (pending.length) await Promise.all(pending.splice(0)) }
  const sent = () => net.hooks.map(h => h.body)
  const team = (name = '', room = {}) => ({
    id: 'AbCdEfGh', room: { ...ROOM, ...room }, tactic: { preset: null, name, board: null },
    voice: null, status: 'open', size: 3, createdAt: 0, expiresAt: TTL,
    members: [{ userId: '111111111111111111', name: 'solo', mic: false, entries: [entry()], leader: true, joinedAt: 0 }],
  })

  let first = true
  net.reply = () => first ? (first = false, [429, { retry_after: 0.05 }]) : [204]
  n.teamCreated(team())
  await idle()
  assert.equal(sent().length, 2)
  assert.deepEqual(sent()[0], sent()[1])
  assert.equal(sent()[0].embeds[0].title, '🏀 팀원 모집 시작 · 전술 자유')
  assert.deepEqual(sent()[0].embeds[0].fields, [{ name: '음성채널', value: '빈 음성채널이 없어요 — 자유롭게 모여주세요' }])
  assert.equal(sent()[0].embeds[0].description, '🎙️ 마이크 필수 · 즐겜 · 전술 자유\n\n**solo** (골드) · PG 라멜로 볼 · 마이크 X\n\n모집 1/3')

  // retry_after 도 Retry-After 헤더도 없는 429 → 1초 쉬고 재시도 · 방 제목이 없으면 보드 이름, 마크다운 기호는 제목에서 뺀다
  first = true
  net.reply = () => first ? (first = false, [429, {}]) : [204]
  let at = Date.now()
  n.teamCreated(team('**우리_전술** <@1>', { title: '*_*' }))
  await idle()
  assert.ok(Date.now() - at >= 900, `재시도까지 ${Date.now() - at}ms`)
  assert.equal(sent().length, 4)
  assert.equal(sent()[3].embeds[0].title, '🏀 팀원 모집 시작 · 우리전술 1')
  assert.ok(sent()[3].embeds[0].description.startsWith('🎙️ 마이크 필수 · 즐겜 · 전술 \\*\\*우리\\_전술\\*\\* \\<\\@1\\>\n\n'))

  // 한 시간 기다리라는 429 → 기다리지 않고 그 알림만 버린다(큐가 막히지 않는다)
  first = true
  net.reply = () => first ? (first = false, [429, { retry_after: 3600, global: true }]) : [204]
  at = Date.now()
  n.teamCreated(team())
  n.teamCreated(team('다음 알림'))
  await idle()
  assert.ok(Date.now() - at < 2000, `큐가 ${Date.now() - at}ms 막혔다`)
  assert.deepEqual(sent().slice(4).map(b => b.embeds[0].title), ['🏀 팀원 모집 시작 · 전술 자유', '🏀 팀원 모집 시작 · 다음 알림'], '버린 알림은 재시도하지 않는다')
  assert.ok(nlogs.some(l => l.includes('3600')), nlogs.join('\n'))

  net.reply = () => [404, { message: 'Unknown Webhook' }]
  n.teamCreated(team())
  await idle()
  n.teamCreated(team())
  await idle()
  assert.equal(sent().length, 7, '404 뒤로는 보내지 않는다')
  assert.ok(nlogs.some(l => l.includes('404')))

  // Deno 의 fetch 오류 문구는 요청 URL 을 통째로 싣는다 — 웹훅 토큰 · 봇 채널 주소가 로그에 남지 않게
  const deno = async url => { throw new TypeError(`error sending request for url (${url}): client error (Connect): dns error: failed`) }
  const dlogs = [], dpending = []
  const leak = createNotifier({
    webhookUrl: 'https://hook.test/api/webhooks/1/SECRET_HOOK_TOKEN', siteUrl: SITE, guildId: GUILD, players: PLAYERS, modes: CFG.modes,
    fetch: deno, waitUntil: p => dpending.push(p), log: m => dlogs.push(m),
  })
  leak.teamCreated(team())
  await Promise.all(dpending)
  assert.deepEqual(await voiceRooms({ botToken: 'tok', guildId: 'g-deno', fetch: deno, now: () => 0, log: m => dlogs.push(m) }), [])
  assert.deepEqual(dlogs, [
    '디스코드 웹훅 오류: error sending request for url (<url>): client error (Connect): dns error: failed',
    '디스코드 채널 목록 오류: error sending request for url (<url>): client error (Connect): dns error: failed',
  ])
})

// ---------------------------------------------------------------- 신원 (DB 없이)

test('웹 신원: Auth(/auth/v1/user)로 토큰 확인 · 디스코드 ID 는 identities 에서만(user_metadata 무시) · 이름 고르기 · 60초 기억', async () => {
  let clock = 1_000_000
  const { api, net } = start({ db: FAKE_DB, now: () => clock })
  const id = uid()
  // 봇 헤더를 같이 보내도 웹 토큰이면 Auth 의 신원만 쓴다
  const r = await api('GET', '/api/me', undefined, { as: web(id), headers: { 'x-discord-user': '99999999999999999', 'x-discord-admin': '1' } })
  assert.deepEqual([r.status, r.body], [200, { user: { id, name: `웹${id.slice(-4)}` }, profile: null, teamId: null }])
  const [call] = net.auth
  assert.equal(call.url, 'http://db.test/auth/v1/user')
  assert.deepEqual([call.headers.apikey, call.headers.authorization], [PUB, `Bearer web.${id}`])
  assert.ok(call.signal instanceof AbortSignal)

  // SUPABASE_AUTH_URL 이 있으면 로그인 확인만 거기로(로컬 compose → 클라우드 Auth), DB 는 그대로 SUPABASE_URL
  const other = start({ db: FAKE_DB, now: () => clock, env: { SUPABASE_AUTH_URL: 'https://auth.test/' } })
  assert.equal((await other.api('GET', '/api/me', undefined, { as: web(id) })).status, 200)
  assert.equal(other.net.auth[0].url, 'https://auth.test/auth/v1/user')

  // 같은 토큰은 60초 기억(sha256 키) — 지나면 다시 묻는다 · 다른 토큰은 따로
  await api('GET', '/api/me', undefined, { as: web(id) })
  clock += 59_999
  await api('GET', '/api/me', undefined, { as: web(id) })
  assert.equal(net.auth.length, 1)
  clock += 1
  await api('GET', '/api/me', undefined, { as: web(id) })
  assert.equal(net.auth.length, 2)
  await api('GET', '/api/me', undefined, { as: web(id, '다른 토큰') })
  assert.equal(net.auth.length, 3)

  const user = async (body, status = 200) => {
    net.authReply = () => json(status, body)
    return api('GET', '/api/me', undefined, { as: web(uid()) })
  }
  const name = async data => (await user(authUser('12345678901234567', { data }))).body.user.name
  assert.equal(await name({ custom_claims: { global_name: ' 전역 ' }, full_name: 'full', name: 'name' }), '전역')
  assert.equal(await name({ full_name: 'full', name: 'name' }), 'full')
  assert.equal(await name({ name: 'name' }), 'name')
  assert.equal(await name({}), 'Discord 사용자')
  assert.equal(await name({ full_name: '   ', name: ['x'] }), 'Discord 사용자')
  assert.equal(await name({ name: `줄${ctrl(10)}바꿈` }), '줄바꿈')
  assert.equal(await name({ name: '가'.repeat(81) }), '가'.repeat(80), '80자로 자른다')
  assert.equal((await user(authUser('12345678901234567890'))).body.user.id, '12345678901234567890', '20자리 ID 도 문자열 그대로')

  // 디스코드 신원이 없으면 401 — user_metadata 의 provider_id · 이름은 믿지 않는다
  const u = authUser('12345678901234567')
  for (const [body, why] of [
    [{ ...u, identities: [{ ...u.identities[0], provider: 'google' }] }, '구글 계정뿐'],
    [{ ...u, identities: [] }, '신원 없음'],
    [{ ...u, identities: undefined }, 'identities 없음'],
    [{ ...u, identities: [{ ...u.identities[0], id: 12345678901234567 }] }, '숫자 ID'],
    [{ ...u, identities: [{ ...u.identities[0], id: 'abc' }] }, '이상한 ID'],
  ]) assert.deepEqual([(await user(body)).status, (await user(body)).body], [401, LOGIN], why)

  // Auth 가 401 · 403 = 로그인 필요, 5xx · 연결 실패 · 이상한 응답 = 503. 실패는 기억하지 않는다
  assert.deepEqual([(await user({ msg: 'expired' }, 401)).status, (await user({ msg: 'bad_jwt' }, 403)).status], [401, 401])
  for (const [reply, why] of [
    [() => json(500, {}), '500'], [() => json(404, {}), '404(로컬 compose 처럼 Auth 가 없음)'], [() => { throw new TypeError('fetch failed http://db.test/auth') }, '연결 실패'],
    [() => new Response('<html>', { status: 200 }), 'JSON 아님'], [() => json(200, null), 'null'],
  ]) {
    net.authReply = reply
    const who = web(uid()), before = net.auth.length
    assert.deepEqual([(await api('GET', '/api/me', undefined, { as: who })).body, (await api('GET', '/api/me', undefined, { as: who })).body], [AUTH_DOWN, AUTH_DOWN], why)
    assert.equal(net.auth.length, before + 2, `${why}: 실패는 기억하지 않는다`)
  }

  // 인증 헤더가 없거나 모양이 틀리면 Auth 를 부르지 않고 401
  const calls = net.auth.length
  for (const headers of [{}, { authorization: 'Basic abc' }, { authorization: 'Bearer' }, { authorization: 'Bearer a b' }, { authorization: 'Token web.1' }]) {
    const r2 = await api('GET', '/api/me', undefined, { headers })
    assert.deepEqual([r2.status, r2.body], [401, LOGIN], JSON.stringify(headers))
  }
  assert.equal(net.auth.length, calls)
})

test('웹 신원: 서버 별명이 있으면 그것을 이름으로(없거나 서버 밖이면 계정 이름) · 10분 기억 · 봇은 안 부른다', async () => {
  let clock = 1_000_000
  const id = uid(), seen = []
  const member = (u) => {
    seen.push(u.pathname)
    return u.pathname.endsWith(`/members/${id}`)
      ? json(200, { nick: '  길드별명 ', user: { global_name: '계정이름' } })
      : json(404, { message: 'Unknown Member' })
  }
  const { api } = start({ db: FAKE_DB, now: () => clock, env: { DISCORD_BOT_TOKEN: 'tok' }, channels: member })
  const name = async (as, app = api) => (await app('GET', '/api/me', undefined, { as })).body.user.name

  assert.equal(await name(web(id)), '길드별명', '앞뒤 공백은 자른다')
  assert.deepEqual(seen, [`/api/v10/guilds/${GUILD}/members/${id}`])

  // 같은 워커에서 10분은 다시 안 부른다(토큰 기억 60초와 별개 — 토큰을 바꿔서 확인한다)
  clock += 5 * 60_000
  assert.equal(await name(web(id, '계정이름')), '길드별명')
  assert.equal(seen.length, 1, '10분 안에는 디스코드를 다시 안 부른다')
  clock += 6 * 60_000
  assert.equal(await name(web(id, '계정이름')), '길드별명')
  assert.equal(seen.length, 2, '10분이 지나면 다시 본다')

  // 서버에 없는 사람(404) · 봇 토큰이 없는 서버는 계정 이름 그대로
  const outsider = uid()
  assert.equal(await name(web(outsider, '바깥사람')), '바깥사람')
  const noBot = start({ db: FAKE_DB, now: () => clock, channels: member })
  assert.equal(await name(web(uid(), '토큰없음'), noBot.api), '토큰없음')

  // 봇 신원은 헤더 이름(=봇이 보낸 서버 별명)을 그대로 쓴다 — 디스코드를 부르지 않는다
  const before = seen.length
  assert.equal(await name(bot(id, '봇이 준 별명')), '봇이 준 별명')
  assert.equal(seen.length, before, '봇 요청은 디스코드를 안 부른다')
})

test('웹 신원: 기억은 500개까지(넘치면 비움) · publishable key 고르기 · 키가 없으면 Auth 를 안 부르고 503 · health 의 login', async () => {
  const app = start({ db: FAKE_DB, now: () => 0 })
  const first = web(uid())
  await app.api('GET', '/api/me', undefined, { as: first })
  for (let i = 0; i < 499; i++) await app.api('GET', '/api/me', undefined, { as: web(uid()) })
  await app.api('GET', '/api/me', undefined, { as: first })
  assert.equal(app.net.auth.length, 500, '500개까지는 기억')
  await app.api('GET', '/api/me', undefined, { as: web(uid()) })   // 501번째 → 비우고 넣는다
  await app.api('GET', '/api/me', undefined, { as: first })
  assert.equal(app.net.auth.length, 502)

  const keys = start({ db: FAKE_DB, env: { SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_keys' }), SUPABASE_PUBLISHABLE_KEY: 'fallback' } })
  await keys.api('GET', '/api/me', undefined, { as: web(uid()) })
  assert.equal(keys.net.auth[0].headers.apikey, 'sb_publishable_keys', 'SUPABASE_PUBLISHABLE_KEYS 의 default 가 먼저')
  assert.deepEqual((await keys.api('GET', '/api/health')).body, { ok: true, voice: false, login: true })

  const none = start({ db: FAKE_DB, env: { SUPABASE_PUBLISHABLE_KEY: '' }, log: () => {} })
  const r = await none.api('GET', '/api/me', undefined, { as: web(uid()) })
  assert.deepEqual([r.status, r.body, none.net.auth.length], [503, AUTH_DOWN, 0])
  assert.deepEqual((await none.api('GET', '/api/health')).body, { ok: true, voice: false, login: false })
  const botOnly = await none.api('GET', '/api/me', undefined, { as: bot(uid()) })
  assert.equal(botOnly.status, 200, '웹 로그인이 꺼져도 봇은 된다')
})

test('봇 신원: 봇 키(32자 이상 · timingSafeEqual) + X-Discord-User(17~20자리) + X-Discord-Name(퍼센트 인코딩) · Auth 는 안 부른다', async () => {
  const { api, net } = start({ db: FAKE_DB })
  const id = uid()
  const ok = await api('GET', '/api/me', undefined, { as: bot(id, '  보노 🏀 봇  ') })
  assert.deepEqual([ok.status, ok.body], [200, { user: { id, name: '보노 🏀 봇' }, profile: null, teamId: null }], '디코드 · 앞뒤 공백 자르기')
  assert.equal((await api('GET', '/api/me', undefined, { as: bot('12345678901234567') })).status, 200, '17자리')
  assert.equal((await api('GET', '/api/me', undefined, { as: bot('99999999999999999999') })).body.user.id, '99999999999999999999', '20자리 — 정밀도 손실 없이 문자열')
  assert.equal((await api('GET', '/api/me', undefined, { as: bot(id, '가'.repeat(80)) })).status, 200, '이름 80자')
  assert.equal((await api('GET', '/api/me', undefined, { as: { ...bot(id), authorization: `bot ${BOT_KEY}` } })).status, 200, 'Bot 은 대소문자 무시')

  for (const [as, why] of [
    [{ ...bot(id), authorization: `Bot ${BOT_KEY.slice(0, -1)}x` }, '같은 길이 틀린 키'],
    [{ ...bot(id), authorization: `Bot ${BOT_KEY}x` }, '더 긴 키'],
    [{ ...bot(id), authorization: 'Bot short' }, '짧은 키'],
    [{ ...bot(id), authorization: `Bearer ${BOT_KEY}` }, '봇 키를 Bearer 로(가짜 Auth 가 거절)'],
  ]) assert.deepEqual([(await api('GET', '/api/me', undefined, { as })).status, (await api('GET', '/api/me', undefined, { as })).body], [401, LOGIN], why)
  // 서버 키가 32자보다 짧거나 없으면 봇 인증을 끈다 — 헤더가 그 키와 똑같아도 401
  for (const TNAB_BOT_KEY of ['a'.repeat(31), '']) {
    const off = start({ db: FAKE_DB, env: { TNAB_BOT_KEY } })
    const r = await off.api('GET', '/api/me', undefined, { as: { ...bot(id), authorization: `Bot ${TNAB_BOT_KEY || 'x'}` } })
    assert.deepEqual([r.status, r.body], [401, LOGIN], `서버 키 ${TNAB_BOT_KEY.length}자`)
  }

  for (const [headers, why] of [
    [{ 'x-discord-user': '1234567890123456' }, '16자리'], [{ 'x-discord-user': '123456789012345678901' }, '21자리'], [{ 'x-discord-user': '12345678901234567a' }, '문자'],
    [{ 'x-discord-user': '' }, '빈 값'], [{ 'x-discord-user': '-12345678901234567' }, '음수'], [{ 'x-discord-user': '1.2345678901234567e17' }, '지수 표기'],
  ]) {
    const r = await api('GET', '/api/me', undefined, { as: bot(id), headers })
    assert.deepEqual([r.status, r.body], [400, { error: '디스코드 사용자 ID 가 잘못됐어요' }], why)
  }
  for (const [name, why] of [['%E0%A4%A', '깨진 퍼센트 인코딩'], ['', '빈 이름'], ['%20%20', '공백뿐'], [encodeURIComponent('가'.repeat(81)), '81자'], ['a%0Ab', '줄바꿈'], ['a%00b', 'NUL']]) {
    const r = await api('GET', '/api/me', undefined, { as: { ...bot(id), 'x-discord-name': name } })
    assert.deepEqual([r.status, r.body], [400, { error: '디스코드 이름이 잘못됐어요' }], why)
  }
  const { 'x-discord-name': _, ...noName } = bot(id)
  assert.equal((await api('GET', '/api/me', undefined, { as: noName })).status, 400, '이름 헤더 없음')
  assert.equal(net.auth.length, 2, 'Auth 는 Bearer 로 보낸 두 번만(실패는 기억하지 않는다)')
})

// ---------------------------------------------------------------- 검증 (DB 없이 — 요청 수 제한 · 프로필 조회만 가짜 DB 가 답한다)

test('검증: 프로필(마이크 O/X · 계정 1~3줄) 이 잘못되면 400', async () => {
  const { api } = start({ db: FAKE_DB })
  const as = bot(uid())
  const bad = async (body, why, error) => {
    const r = await api('PUT', '/api/me/profile', body, { as })
    assert.equal(r.status, 400, why)
    assert.equal(typeof r.body.error, 'string', why)
    if (error) assert.equal(r.body.error, error, why)
  }
  const ok = { mic: true, entries: [entry()] }
  await bad({ entries: [entry()] }, '마이크 없음', '마이크 사용 여부를 골라 주세요')
  await bad({ ...ok, mic: 'true' }, '마이크 문자열')
  await bad({ ...ok, mic: 1 }, '마이크 숫자')
  await bad({ ...ok, mic: null }, '마이크 null')
  await bad({ ...ok, entries: [entry({ tier: '마스터' })] }, '없는 티어')
  await bad({ ...ok, entries: [entry({ char: 'nope' })] }, '없는 캐릭터')
  await bad({ ...ok, entries: [entry({ char: UPCOMING })] }, '미출시 캐릭터')
  await bad({ ...ok, entries: [entry(), entry({ char: 'klfd' }), entry({ char: 'sga' }), entry({ char: 'lkdqq' })] }, '4개')
  await bad({ ...ok, entries: [] }, '0개')
  await bad({ ...ok, entries: [entry(), entry()] }, '같은 닉네임·캐릭터 중복')
  await bad({ ...ok, entries: [entry({ nick: 'discord.gg/abc' })] }, '닉네임에 링크')
  await bad({ ...ok, entries: [entry({ nick: 'www.evil.test' })] }, 'www 링크')
  await bad({ ...ok, entries: [entry({ nick: `a${ctrl(7)}b` })] }, '제어문자')
  await bad({ ...ok, entries: [entry({ nick: 'a\nb' })] }, '닉네임 줄바꿈')
  await bad({ ...ok, entries: [entry({ nick: '   ' })] }, '공백뿐인 닉네임')
  await bad({ ...ok, entries: [entry({ nick: 'ㄱ'.repeat(21) })] }, '닉네임 21자')
  await bad({ ...ok, entries: [entry({ nick: ['보노'] })] }, '문자열 아닌 닉네임')
  await bad({ ...ok, entries: [entry({ char: ['bl'] })] }, '배열 캐릭터')
  await bad({ ...ok, entries: [null] }, '계정 줄이 null')
  await bad({ ...ok, entries: 'bl' }, 'entries 가 배열 아님')
  await bad(null, '본문 null')
  await bad([], '배열 본문')
  await bad('{"mic":', '깨진 JSON')
  await bad('', '빈 본문')
  const plain = await api('PUT', '/api/me/profile', JSON.stringify(ok), { as, headers: { 'content-type': 'text/plain' } })
  assert.equal(plain.status, 415)
})

test('검증: 방 설정(제목 · 마이크 필수/듣코가능/필요없음 · 즐겜/빡겜 · 메모) · 전술 · 보드가 잘못되면 400 · 맞으면 프로필 확인(428)까지 간다', async () => {
  const { api } = start({ db: FAKE_DB })
  const as = bot(uid())
  const post = body => api('POST', '/api/teams', body, { as })
  const { mic, ...noMic } = ROOM
  const { mode, ...noMode } = ROOM
  for (const [room, why] of [
    [undefined, '방 설정 없음'], ['fun', '방 설정이 객체 아님'],
    [noMic, '마이크 없음'], [{ ...ROOM, mic: true }, '옛 마이크 boolean'], [{ ...ROOM, mic: false }, '옛 마이크 false'], [{ ...ROOM, mic: 'on' }, '없는 마이크'],
    [{ ...ROOM, mic: ['off'] }, '배열 마이크'], [{ ...ROOM, mic: 'toString' }, '프로토타입 이름 마이크'],
    [noMode, '모드 없음'], [{ ...ROOM, mode: 'hard' }, '없는 모드'], [{ ...ROOM, mode: ['fun'] }, '배열 모드'], [{ ...ROOM, mode: 'toString' }, '프로토타입 이름'],
    [{ ...ROOM, title: 'ㄱ'.repeat(CFG.limits.title + 1) }, '제목 31자'], [{ ...ROOM, title: 'discord.gg/x' }, '제목에 링크'],
    [{ ...ROOM, title: '한 줄\n두 줄' }, '제목 줄바꿈'], [{ ...ROOM, title: 3 }, '제목이 숫자'],
    [{ ...ROOM, memo: 'ㄱ'.repeat(CFG.limits.memo + 1) }, '메모 101자'], [{ ...ROOM, memo: '여기로 https://evil.test' }, '메모에 링크'],
    [{ ...ROOM, memo: '윈도 줄바꿈\r\nx' }, '메모에 \\r'], [{ ...ROOM, memo: `탭${ctrl(9)}문자` }, '메모에 탭'], [{ ...ROOM, memo: ['메모'] }, '배열 메모'],
  ]) {
    const r = await post({ room, tactic: { preset: 'pnr' } })
    assert.equal(r.status, 400, why)
    assert.equal(typeof r.body.error, 'string', why)
  }
  assert.equal((await post({ room: { ...ROOM, mic: 'on' } })).body.error, '마이크 조건을 골라 주세요')

  for (const [tactic, why] of [
    [{ preset: 'nope' }, '없는 프리셋'], [{ preset: ['pnr'] }, '배열 프리셋'], ['pnr', '전술이 객체 아님'],
    [{ board: { tokens: [] }, name: 'x'.repeat(31) }, '전술 이름 31자'], [{ board: { tokens: [] }, name: 'https://x.test' }, '전술 이름에 링크'],
  ]) assert.equal((await post({ room: ROOM, tactic })).status, 400, why)

  const token = boardToken
  for (const [board, why] of [
    [{ tokens: Array.from({ length: 7 }, () => token()) }, '토큰 7개'], [{ tokens: [token({ key: 'x9' })] }, '잘못된 key'], [{ tokens: [token({ key: ['o1'] })] }, '배열 key'],
    [{ tokens: [token({ side: 'mid' })] }, '잘못된 side'], [{ tokens: [token({ label: 'ㄱ'.repeat(21) })] }, '이름표 21자'], [{ tokens: [token({ playerId: 'Bad_ID' })] }, '잘못된 playerId'],
    [{ tokens: [token({ x: '0.5' })] }, '문자열 좌표'], [{ tokens: [token({ y: null })] }, 'null 좌표'],
    [{ tokens: [token({ routes: Array.from({ length: 9 }, () => ({ kind: 'move', pts: [[0, 0], [1, 1]] })) })] }, '동선 9개'],
    [{ tokens: [token({ routes: [{ kind: 'dribble', pts: [[0, 0], [1, 1]] }] })] }, '없는 동선 종류'],
    [{ tokens: [token({ routes: [{ kind: 'pass', pts: [[0, 0]] }] })] }, '점 1개'],
    [{ tokens: [token({ routes: [{ kind: 'pass', pts: Array.from({ length: 81 }, () => [0, 0]) }] })] }, '점 81개'],
    [{ tokens: [token({ routes: [{ kind: 'pass', pts: [[0, 0], [1, 1, 1]] }] })] }, '점 좌표 3개'],
    [{ tokens: [token({ routes: undefined })] }, 'routes 없음'], [{ tokens: 'x' }, 'tokens 가 배열 아님'], [[], '보드가 배열'],
  ]) assert.equal((await post({ room: ROOM, tactic: { board } })).status, 400, why)

  assert.equal((await post('{"room":')).status, 400, '깨진 JSON')
  assert.equal((await post([])).status, 400, '배열 본문')
  assert.equal((await post('')).status, 400, '빈 본문')
  assert.equal((await api('POST', '/api/teams', JSON.stringify({ room: ROOM }), { as, headers: { 'content-type': 'text/plain' } })).status, 415)
  for (const mic of Object.keys(CFG.mics)) {
    const r = await post({ room: { ...ROOM, mic } })
    assert.deepEqual([r.status, r.body], [428, { error: '먼저 프로필을 등록해 주세요' }], `${mic}: 검증을 통과하고 프로필이 없어 428`)
  }
  for (const path of ['/api/teams/AAAAAAAA/members', '/api/teams/quick']) {
    assert.deepEqual((await api('POST', path, undefined, { as })).body, { error: '먼저 프로필을 등록해 주세요' }, path)
  }
})

// ---------------------------------------------------------------- 프로필 (DB)

dbTest('프로필: 저장 · 다시 저장 · /me · 표시 이름은 본인이 고른다(안 보내면 유지 · 디스코드 이름이 바뀌어도 유지) · auth_user_id 는 저장만(응답엔 없음) · 봇 저장은 연결을 안 지운다', async () => {
  let clock = futureBase()
  const { api, net } = start({ now: () => clock })
  const id = uid(), as = web(id)
  assert.deepEqual((await api('GET', '/api/me', undefined, { as })).body, { user: { id, name: `웹${id.slice(-4)}` }, profile: null, teamId: null })

  const saved = await api('PUT', '/api/me/profile', {
    mic: false, entries: [{ ...entry({ nick: '  보노 ' }), extra: 1 }, entry({ nick: '😀'.repeat(20), tier: '실버', char: 'klfd' })], name: '  보노보노 ', userId: '1', evil: 1,
  }, { as })
  assert.equal(saved.status, 200)
  assert.deepEqual(Object.keys(saved.body), ['profile'])
  assert.deepEqual(Object.keys(saved.body.profile), PROFILE_KEYS)
  const want = { userId: id, name: '보노보노', mic: false, entries: [entry(), entry({ nick: '😀'.repeat(20), tier: '실버', char: 'klfd' })], updatedAt: clock }
  assert.deepEqual(saved.body.profile, want, '닉네임 · 표시 이름 앞뒤 공백 자르기 · 모르는 필드 버리기')
  const got = await api('GET', '/api/me', undefined, { as })
  assert.deepEqual(got.body, { user: { id, name: `웹${id.slice(-4)}` }, profile: want, teamId: null }, 'user.name 은 신원, profile.name 은 본인이 고른 이름')
  let [row] = await rows(`/recruit_profiles?select=*&discord_user_id=eq.${id}`)
  assert.deepEqual([row.auth_user_id, row.discord_name, row.created_at, row.updated_at], [fakeUuid(id), want.name, clock, clock])

  clock += MIN
  const again = await api('PUT', '/api/me/profile', { mic: true, entries: [entry({ char: 'sga' })] }, { as })
  assert.deepEqual(again.body.profile, { ...want, mic: true, entries: [entry({ char: 'sga' })], updatedAt: clock }, '덮어쓴다 — 이름을 안 보내면 저장된 이름 그대로')

  // 디스코드에서 이름을 바꿔도 표시 이름은 그대로다. 서버 별명이 계정 이름과 다를 수 있어 본인이 고른 이름을 지킨다
  const renamed = await api('GET', '/api/me', undefined, { as: web(id, '새 이름') })
  assert.deepEqual([renamed.body.user.name, renamed.body.profile.name], ['새 이름', '보노보노'])
  ;[row] = await rows(`/recruit_profiles?select=*&discord_user_id=eq.${id}`)
  assert.deepEqual([row.discord_name, row.created_at], ['보노보노', clock - MIN])

  // 봇이 저장해도(이름을 안 보낸다) 표시 이름은 그대로, 웹 계정 연결(auth_user_id)도 그대로
  const viaBot = await api('PUT', '/api/me/profile', { mic: false, entries: [entry()] }, { as: bot(id, '봇 이름') })
  assert.equal(viaBot.body.profile.name, '보노보노')
  ;[row] = await rows(`/recruit_profiles?select=*&discord_user_id=eq.${id}`)
  assert.deepEqual([row.auth_user_id, row.discord_name, row.mic], [fakeUuid(id), '보노보노', false])

  assert.equal((await api('GET', '/api/me', undefined, { as: bot(id, '봇 이름') })).body.profile.mic, false, '웹 · 봇이 같은 프로필')

  // 이름 바꾸기 · 형식
  clock += MIN
  assert.equal((await api('PUT', '/api/me/profile', { name: '길드별명', mic: true, entries: [entry()] }, { as })).body.profile.name, '길드별명')
  assert.equal((await api('GET', '/api/me', undefined, { as: bot(id, '봇 이름') })).body.profile.name, '길드별명', '봇도 같은 이름을 본다')
  for (const [name, why] of [[' ', '빈 이름'], ['x'.repeat(33), '33자'], ['http://a.b', '링크'], ['한\n줄', '줄바꿈']]) {
    assert.equal((await api('PUT', '/api/me/profile', { name, mic: true, entries: [entry()] }, { as })).status, 400, why)
  }

  // 같은 웹 계정(auth uuid)이 다른 디스코드 ID 로 옮겨 붙으면 옛 프로필의 연결만 끊는다(unique 충돌 500 대신)
  const other = uid()
  net.authReply = () => json(200, authUser(other, { uuid: fakeUuid(id) }))
  assert.equal((await api('PUT', '/api/me/profile', { mic: true, entries: [entry()] }, { as: web(other, 'relink') })).status, 200)
  const linked = await rows(`/recruit_profiles?select=discord_user_id,auth_user_id&discord_user_id=in.(${id},${other})&order=discord_user_id`)
  assert.deepEqual(linked, [{ discord_user_id: id, auth_user_id: null }, { discord_user_id: other, auth_user_id: fakeUuid(id) }])
})

// ---------------------------------------------------------------- 팀 만들기 · 음성채널 배정

dbTest('팀 만들기: 팀 뷰 모양(팀원 = 프로필) · 방 마이크 3단계 · 끝 방부터 배정, 잡힌 방은 건너뜀, 해제하면 풀림 · 동시에 만들어도 방이 안 겹친다', async () => {
  const { api } = start({ env: BOT })
  const lead = await person(api, { kind: 'bot', name: '팀장 봇', mic: false, entries: [entry(), entry({ char: 'klfd' })] })
  const a = await create(api, lead, { preset: 'pnr' }, { title: '  같이 3판 ', mic: 'listen', mode: 'serious', memo: ' 첫 줄\n둘째 줄 ' })
  assert.equal(a.status, 201)
  assert.deepEqual(Object.keys(a.body), ['team', 'left'])
  assert.equal(a.body.left, null)
  const { team } = a.body
  assert.deepEqual(Object.keys(team), VIEW_KEYS)
  assert.deepEqual(team.room, { title: '같이 3판', mic: 'listen', mode: 'serious', memo: '첫 줄\n둘째 줄' }, '앞뒤 공백만 자르고 줄바꿈은 둔다')
  assert.deepEqual(team.voice, { id: '11', name: '음성 4', url: `https://discord.com/channels/${GUILD}/11` })
  assert.deepEqual([team.status, team.size, team.expiresAt - team.createdAt], ['open', 3, TTL])
  assert.match(team.id, /^[A-Za-z0-9_-]{8}$/)
  assert.deepEqual(team.members.map(m => Object.keys(m)), [MEMBER_KEYS])
  assert.deepEqual(team.members[0], { userId: lead.id, name: '팀장 봇', mic: false, entries: [entry(), entry({ char: 'klfd' })], leader: true, joinedAt: team.createdAt })
  assert.equal((await me(api, lead)).body.teamId, team.id)
  assert.deepEqual((await api('GET', `/api/teams/${team.id}`)).body, team)

  // 방 마이크 3단계 — 각각 그대로 저장된다
  const leads = await Promise.all([1, 2, 3, 4].map(() => person(api)))
  const made = []
  for (const [i, mic] of ['required', 'off', 'required', 'listen'].entries()) made.push((await create(api, leads[i], {}, { mic })).body.team)
  assert.deepEqual(made.map(t => t.room.mic), ['required', 'off', 'required', 'listen'])
  assert.deepEqual(made.map(t => t.voice?.id ?? null), ['4', '3', '2', null], '빈 방이 없으면 voice 없이 만든다')

  assert.deepEqual((await teamApi(api, team.id).disband(lead)).body, { ok: true })
  assert.equal((await create(api, await person(api))).body.team.voice.id, '11', '해제한 팀의 방은 다시 배정된다')

  // 동시에 만들어도 같은 방을 두 팀에 주지 않는다(DB 잠금) — 빈 방 4 · 3 을 세 팀이 다툰다
  await teamApi(api, made[0].id).disband(leads[0])
  await teamApi(api, made[1].id).disband(leads[1])
  const racers = await Promise.all([1, 2, 3].map(() => person(api)))
  const rs = await Promise.all(racers.map(p => create(api, p)))
  assert.deepEqual(rs.map(r => r.status), [201, 201, 201])
  assert.deepEqual(rs.map(r => r.body.team.voice?.id ?? '').sort(), ['', '3', '4'])
})

dbTest('팀 만들기: 방 3개에 10팀이 동시에 → 서로 다른 방 3개 + 나머지는 voice null', async () => {
  const { api, net } = start({ env: BOT, channels: CHANNELS.filter(c => ['2', '3', '4'].includes(c.id)) })
  const leads = await Promise.all(Array.from({ length: 10 }, () => person(api)))
  const rs = await Promise.all(leads.map(p => create(api, p)))
  assert.deepEqual(rs.map(r => r.status), Array(10).fill(201))
  const got = rs.map(r => r.body.team.voice?.id ?? null)
  assert.deepEqual(got.filter(Boolean).sort(), ['2', '3', '4'])
  assert.equal(got.filter(v => v === null).length, 7)
  assert.ok(net.discord.length >= 1)
})

dbTest('팀 만들기: 봇이 없거나 디스코드가 실패하면 voice null · health 의 voice 는 봇 설정 여부 · 프로필이 없으면 428', async () => {
  const none = start()
  const broken = start({ env: { ...BOT, DISCORD_GUILD_ID: 'g-broken' }, channels: () => json(403, { message: 'Missing Access', code: 50001 }) })
  const ok = start({ env: BOT })
  assert.equal((await create(none.api, await person(none.api))).body.team.voice, null)
  assert.equal(none.net.discord.length, 0, '봇이 없으면 디스코드를 부르지 않는다')
  const r = await create(broken.api, await person(broken.api))
  assert.deepEqual([r.status, r.body.team.voice], [201, null], '디스코드 오류로 팀 만들기가 실패하지 않는다')
  assert.deepEqual((await none.api('GET', '/api/health')).body, { ok: true, voice: false, login: true })
  assert.deepEqual((await ok.api('GET', '/api/health')).body, { ok: true, voice: true, login: true })

  const nobody = { id: uid() }
  nobody.as = web(nobody.id)
  const no = await create(ok.api, nobody)
  assert.deepEqual([no.status, no.body], [428, { error: '먼저 프로필을 등록해 주세요' }])
  const { team } = (await create(ok.api, await person(ok.api))).body
  assert.equal((await teamApi(ok.api, team.id).join(nobody)).status, 428)
  assert.equal((await quick(ok.api, nobody)).status, 428)
  assert.equal((await teamApi(ok.api, team.id).get()).body.members.length, 1)
})

dbTest('검증(DB): 코드포인트 길이 · 공백 자르기 · 모르는 필드 버리기 · 전술판 보드 허용 필드만, 좌표 반올림·자르기', async () => {
  const { api } = start()
  const p = await person(api)
  const ok = await create(api, p, {}, { title: '😀'.repeat(30), memo: '😀'.repeat(100) })
  assert.equal(ok.status, 201)
  assert.deepEqual([ok.body.team.room.title, ok.body.team.room.memo], ['😀'.repeat(30), '😀'.repeat(100)])
  const trimmed = await api('POST', '/api/teams', { room: { ...ROOM, extra: 'x', title: undefined, memo: null }, tactic: { preset: 'pnr' }, evil: 1 }, { as: p.as })
  assert.deepEqual(trimmed.body.team.room, { title: '', mic: 'required', mode: 'fun', memo: '' })

  const r = await create(api, p, { preset: 'pnr', board: { tokens: [boardToken(), boardToken({ key: 'd1', side: 'def', playerId: null, routes: [] })], extra: 1 }, name: '' })
  assert.equal(r.status, 201)
  assert.deepEqual(r.body.team.tactic, {
    preset: 'pnr', name: '픽 앤 롤',
    board: {
      tokens: [
        { key: 'o1', side: 'off', label: '볼 핸들러', playerId: 'bl', x: 0.123, y: 0.457, routes: [{ kind: 'move', pts: [[0.5, 0.66], [0, 1]] }] },
        { key: 'd1', side: 'def', label: '볼 핸들러', playerId: null, x: 0.123, y: 0.457, routes: [] },
      ],
    },
  })
})

dbTest('전술 이름 만들기: 보드면 이름 > 프리셋 이름 > 커스텀 전술, 보드 없으면 프리셋 이름만 · 목록에는 보드 없음', async () => {
  const { api } = start()
  const p = await person(api)
  const name = async tactic => (await create(api, p, tactic)).body.team.tactic
  const board = { tokens: [] }
  assert.deepEqual(await name({ preset: 'pnr' }), { preset: 'pnr', name: '픽 앤 롤', board: null })
  assert.deepEqual(await name({ preset: 'pnr', name: '무시됨' }), { preset: 'pnr', name: '픽 앤 롤', board: null })
  assert.deepEqual(await name({ preset: '', name: '무시됨' }), { preset: null, name: '', board: null })
  assert.deepEqual(await name({}), { preset: null, name: '', board: null })
  assert.deepEqual((await api('POST', '/api/teams', { room: ROOM }, { as: p.as })).body.team.tactic, { preset: null, name: '', board: null }, '전술 생략')
  assert.equal((await name({ board, preset: 'pnr', name: '  우리 전술 ' })).name, '우리 전술')
  assert.equal((await name({ board, preset: 'zone' })).name, '2-1 지역방어')
  assert.equal((await name({ board, name: '' })).name, '커스텀 전술')

  const drawn = { tokens: [{ key: 'o1', side: 'off', label: '', playerId: null, x: 0.5, y: 0.5, routes: [] }] }
  const { id } = (await create(api, p, { preset: 'pnr', board: drawn })).body.team
  const { teams } = (await api('GET', '/api/teams')).body
  assert.deepEqual(teams.map(t => t.id), [id], '1인 1파티 — 만들 때마다 앞 팀은 해제돼 마지막 팀만 남는다')
  assert.deepEqual(Object.keys(teams[0]), VIEW_KEYS)
  assert.deepEqual(teams[0].tactic, { preset: 'pnr', name: '픽 앤 롤' }, '목록에는 보드를 싣지 않는다')
  assert.deepEqual((await api('GET', `/api/teams/${id}`)).body.tactic.board, drawn, '팀 화면에는 그대로')
})

// ---------------------------------------------------------------- 가입 · 빠른 참가 · 1인 1파티

dbTest('가입 → 모집 완료 → 4번째 409 · 같은 팀 다시 409 · 알림(시작 · 합류 · 완료 멘션) · waitUntil', async () => {
  const { api, idle, hooks, pending } = start({ env: BOT })
  const lead = await person(api, { name: 'Bono<@123>' }), a = await person(api, { kind: 'bot', name: 'A 봇', mic: false }), b = await person(api)
  const late = await person(api)
  const { body: { team } } = await create(api, lead, { preset: 'high-low' }, { title: '빡겜 *3판*만', mode: 'serious' })
  assert.ok(pending.length >= 1, '알림은 waitUntil 로 넘긴다(응답 뒤에도 워커가 살아 있게)')
  const tm = teamApi(api, team.id)

  const j1 = await tm.join(a)
  assert.equal(j1.status, 201)
  assert.deepEqual(Object.keys(j1.body), ['team', 'left'])
  assert.deepEqual([j1.body.left, j1.body.team.status, userIds(j1.body.team)], [null, 'open', [lead.id, a.id]])
  assert.deepEqual(j1.body.team.members[1], { userId: a.id, name: 'A 봇', mic: false, entries: j1.body.team.members[1].entries, leader: false, joinedAt: j1.body.team.members[1].joinedAt })
  for (const who of [a, lead]) assert.deepEqual([(await tm.join(who)).status, (await tm.join(who)).body], [409, { error: '이미 이 팀에 있어요' }])
  const j2 = await tm.join(b)
  assert.deepEqual([j2.status, j2.body.team.status, userIds(j2.body.team)], [201, 'full', [lead.id, a.id, b.id]])
  const j3 = await tm.join(late)
  assert.deepEqual([j3.status, j3.body], [409, { error: '이미 다 찬 팀이에요' }])
  assert.equal((await me(api, late)).body.teamId, null)

  await idle()
  const [started, joined, full, ...rest] = hooks()
  assert.equal(rest.length, 0, '거절된 가입은 알림이 없다')
  assert.equal(started.embeds[0].title, '🏀 팀원 모집 시작 · 빡겜 3판만')
  assert.ok(started.embeds[0].description.includes('**Bono\\<\\@123\\>** (골드) · PG 라멜로 볼 · 마이크 O'))
  assert.equal(joined.embeds[0].title, '✅ 팀원 합류 · 빡겜 3판만 (2/3)')
  assert.ok(joined.embeds[0].description.endsWith('**A 봇** (골드) · PG 라멜로 볼 · 마이크 X'))
  assert.equal(full.embeds[0].title, '🎉 모집 완료 · 빡겜 3판만')
  assert.deepEqual([full.content, full.allowed_mentions], [`<@${lead.id}> <@${a.id}> <@${b.id}>`, { users: [lead.id, a.id, b.id] }])
  assert.deepEqual([started.allowed_mentions, joined.allowed_mentions], [{ parse: [] }, { parse: [] }])
})

dbTest('빠른 참가: 가장 오래된 모집 중 팀(내 팀 · 다 찬 팀 · 만료 제외) · 없으면 404', async () => {
  let clock = futureBase()
  const { api } = start({ now: () => clock })
  const [l1, l2, l3, a, b, c, d] = await Promise.all(Array.from({ length: 7 }, () => person(api)))
  const t1 = (await create(api, l1)).body.team
  clock += 1000
  const t2 = (await create(api, l2)).body.team
  clock += 1000
  const t3 = (await create(api, l3)).body.team
  await teamApi(api, t1.id).join(a)
  await teamApi(api, t1.id).join(b)   // t1 은 다 참

  const q = await quick(api, c)
  assert.deepEqual([q.status, q.body.team.id, q.body.left], [201, t2.id, null], '다 찬 t1 을 건너뛰고 t2')
  const mine = await quick(api, l2)
  assert.deepEqual([mine.status, mine.body.team.id, mine.body.left], [201, t3.id, { teamId: t2.id, disbanded: true }], '내 팀(t2)은 건너뛰고, 옮기면 내 팀은 해제')
  assert.equal((await teamApi(api, t2.id).get()).status, 404)
  assert.equal((await me(api, c)).body.teamId, null, 't2 가 해제돼 c 도 팀이 없다')

  const q2 = await quick(api, d)
  assert.deepEqual([q2.status, q2.body.team.status, userIds(q2.body.team)], [201, 'full', [l3.id, l2.id, d.id]])
  const none = await quick(api, c)
  assert.deepEqual([none.status, none.body], [404, { error: '참가할 수 있는 모집 중인 팀이 없어요' }])
  clock = t3.expiresAt
  const l4 = await person(api)
  clock += 1
  await create(api, l4)   // 만료 뒤에 만든 팀만 남는다
  assert.equal((await quick(api, c)).body.team.members[0].userId, l4.id)
})

dbTest('1인 1파티: 팀원이 다른 팀에 가입하거나 팀을 만들면 기존 팀에서만 빠진다(left · 이탈 알림)', async () => {
  const { api, idle, hooks } = start()
  const l1 = await person(api), l2 = await person(api, { kind: 'bot' }), a = await person(api), b = await person(api, { kind: 'bot' })
  const t1 = (await create(api, l1, { preset: 'pnr' })).body.team
  const t2 = (await create(api, l2, { preset: 'zone' })).body.team
  await teamApi(api, t1.id).join(a)
  await teamApi(api, t1.id).join(b)

  const moved = await teamApi(api, t2.id).join(a)
  assert.deepEqual([moved.status, moved.body.left, userIds(moved.body.team)], [201, { teamId: t1.id, disbanded: false }, [l2.id, a.id]])
  const after = (await teamApi(api, t1.id).get()).body
  assert.deepEqual([after.status, userIds(after)], ['open', [l1.id, b.id]], '다 찬 팀에서 빠지면 다시 모집 중')
  assert.equal((await me(api, a)).body.teamId, t2.id)

  const made = await create(api, b)
  assert.deepEqual([made.status, made.body.left], [201, { teamId: t1.id, disbanded: false }])
  assert.deepEqual(userIds((await teamApi(api, t1.id).get()).body), [l1.id])
  assert.equal((await rows(`/recruit_members?select=team_id&discord_user_id=in.(${a.id},${b.id})`)).length, 2, '한 사람 = 한 줄')

  await idle()
  assert.deepEqual(hooks().map(h => h.embeds[0].title), [
    '🏀 팀원 모집 시작 · 픽 앤 롤', '🏀 팀원 모집 시작 · 2-1 지역방어', '✅ 팀원 합류 · 픽 앤 롤 (2/3)', '🎉 모집 완료 · 픽 앤 롤',
    '👋 팀원 이탈 · 픽 앤 롤 (2/3)', '✅ 팀원 합류 · 2-1 지역방어 (2/3)', '👋 팀원 이탈 · 픽 앤 롤 (1/3)', '🏀 팀원 모집 시작 · 픽 앤 롤',
  ])
  const left = hooks()[4].embeds[0]
  assert.ok(left.description.endsWith('다른 팀으로 옮겼어요') && left.description.includes(`**${a.name}**`), left.description)
})

dbTest('1인 1파티: 팀장이 다른 팀에 가입하거나 새 팀을 만들면 기존 팀은 해제된다(팀원도 팀 없음 · 해제 알림)', async () => {
  const { api, idle, hooks } = start({ env: BOT })
  const l1 = await person(api), l2 = await person(api, { kind: 'bot' }), a = await person(api), b = await person(api)
  const t1 = (await create(api, l1, { preset: 'pnr' })).body.team
  await teamApi(api, t1.id).join(a)
  const t2 = (await create(api, l2, { preset: 'zone' })).body.team

  const moved = await teamApi(api, t2.id).join(l1)
  assert.deepEqual([moved.status, moved.body.left, userIds(moved.body.team)], [201, { teamId: t1.id, disbanded: true }, [l2.id, l1.id]])
  assert.equal((await teamApi(api, t1.id).get()).status, 404)
  assert.deepEqual(await rows(`/recruit_members?select=discord_user_id&team_id=eq.${t1.id}`), [], '팀원 행도 cascade')
  assert.equal((await me(api, a)).body.teamId, null)
  assert.equal(moved.body.team.voice.id, '4', '해제된 t1 의 방(11)은 풀린다')
  assert.equal((await create(api, a)).body.team.voice.id, '11')

  await teamApi(api, t2.id).join(b)
  const again = await create(api, l2)
  assert.deepEqual([again.status, again.body.left], [201, { teamId: t2.id, disbanded: true }])
  assert.deepEqual([(await me(api, l1)).body.teamId, (await me(api, b)).body.teamId], [null, null])
  assert.equal((await me(api, l2)).body.teamId, again.body.team.id)

  await idle()
  const titles = hooks().map(h => h.embeds[0].title)
  assert.deepEqual(titles.filter(t => t.startsWith('🛑')), ['🛑 팀 해제 · 픽 앤 롤', '🛑 팀 해제 · 2-1 지역방어'])
  const disband = hooks().find(h => h.embeds[0].title === '🛑 팀 해제 · 픽 앤 롤').embeds[0]
  assert.ok(disband.description.endsWith('팀장이 다른 팀으로 옮겨 팀이 해제됐어요'))
  assert.ok(titles.indexOf('🛑 팀 해제 · 픽 앤 롤') < titles.indexOf('✅ 팀원 합류 · 2-1 지역방어 (2/3)'), '옛 팀 알림이 먼저')
})

dbTest('동시 가입 10건 → 남은 자리(2)만큼만 201, 나머지 409 · 알림은 합류 하나 + 완료 하나', async () => {
  const { api, idle, hooks } = start()
  const lead = await person(api)
  const racers = await Promise.all(Array.from({ length: 10 }, (_, i) => person(api, { kind: i % 2 ? 'bot' : 'web' })))
  const { body: { team } } = await create(api, lead)
  const rs = await Promise.all(racers.map(p => teamApi(api, team.id).join(p)))
  assert.deepEqual(count(rs.map(r => r.status)), { 201: 2, 409: 8 })
  assert.ok(rs.filter(r => r.status === 409).every(r => r.body.error === '이미 다 찬 팀이에요'), JSON.stringify(rs.map(r => r.body.error)))
  const got = (await api('GET', `/api/teams/${team.id}`)).body
  assert.deepEqual([got.status, got.members.length], ['full', 3])
  await idle()
  // 두 가입이 서로의 다시 읽기에 끼어도 "모집 완료" 가 두 번 가지 않는다(도착 순서는 바뀔 수 있다)
  assert.deepEqual(hooks().map(b => b.embeds[0].title).sort(), ['✅ 팀원 합류 · 픽 앤 롤 (2/3)', '🎉 모집 완료 · 픽 앤 롤', '🏀 팀원 모집 시작 · 픽 앤 롤'].sort())
})

dbTest('동시에: 같은 사람이 만들기 · 가입 · 가입 · 만들기 · 빠른 참가를 한꺼번에 보내도 한 팀에만 남는다', async () => {
  const { api } = start()
  const la = await person(api), lb = await person(api)
  const ta = (await create(api, la)).body.team, tb = (await create(api, lb)).body.team
  for (let round = 0; round < 5; round++) {
    const u = await person(api, { kind: round % 2 ? 'bot' : 'web' })
    const rs = await Promise.all([create(api, u), teamApi(api, ta.id).join(u), teamApi(api, tb.id).join(u), create(api, u), quick(api, u)])
    // 만든 팀이 다시 읽기 전에 같은 사람의 다음 요청으로 해제되면 404, 빠른 참가가 먼저 그 팀에 넣었으면 가입이 409(이미 이 팀) — 상태는 멀쩡해야 한다
    assert.ok(rs.every(r => [201, 404, 409].includes(r.status)), rs.map(r => `${r.status} ${r.text}`).join('\n'))
    const mine = await rows(`/recruit_members?select=team_id,leader&discord_user_id=eq.${u.id}`)
    assert.equal(mine.length, 1, `${round}: 한 사람 = 한 팀`)
    assert.equal((await me(api, u)).body.teamId, mine[0].team_id)
    const led = await rows(`/recruit_members?select=team_id&leader=is.true&discord_user_id=eq.${u.id}`)
    assert.ok(led.length <= 1)
    for (const r of rs) if (r.status === 201 && r.body.team.id !== mine[0].team_id && r.body.team.members[0].userId === u.id) {
      assert.equal((await teamApi(api, r.body.team.id).get()).status, 404, '남지 않은 내 팀은 해제됐다')
    }
    await teamApi(api, mine[0].team_id).kick(u.id, u)   // 다음 판을 위해 비운다(팀장이면 해제)
  }
  assert.deepEqual([userIds((await teamApi(api, ta.id).get()).body), userIds((await teamApi(api, tb.id).get()).body)], [[la.id], [lb.id]])
})

// ---------------------------------------------------------------- 관리: 방출 · 나가기 · 해제 · 연장

dbTest('권한: 방출(팀장) · 나가기(본인) · 해제(팀장 · 봇 관리자) · 연장(팀장) — 팀원 · 남 · 봇 관리자는 그 밖에 못 한다 · 401 · 404', async () => {
  const { api, idle, hooks } = start()
  const lead = await person(api), a = await person(api, { kind: 'bot' }), b = await person(api), out = await person(api), outBot = await person(api, { kind: 'bot' })
  const admin = { id: uid() }
  admin.as = bot(admin.id, '관리자', true)
  const { body: { team } } = await create(api, lead)
  const tm = teamApi(api, team.id)
  await tm.join(a)
  await tm.join(b)

  for (const [r, why] of [[tm.kick(a.id), '방출'], [tm.disband(), '해제'], [tm.extend(), '연장'], [tm.kick(a.id, { as: { authorization: 'Bearer nope' } }), '가짜 토큰']]) {
    assert.deepEqual([(await r).status, (await r).body], [401, LOGIN], why)
  }
  const kickOnly = { error: '팀장만 다른 팀원을 내보낼 수 있어요' }
  for (const [r, body, why] of [
    [tm.kick(a.id, b), kickOnly, '팀원이 다른 팀원'], [tm.kick(lead.id, a), kickOnly, '팀원이 팀장'], [tm.kick(a.id, out), kickOnly, '남'],
    [tm.kick(a.id, admin), kickOnly, '봇 관리자도 방출은 못 한다'],
    [tm.disband(a), { error: '팀장만 팀을 해제할 수 있어요' }, '팀원 해제'], [tm.disband(out), { error: '팀장만 팀을 해제할 수 있어요' }, '남 해제'],
    [tm.disband(outBot), { error: '팀장만 팀을 해제할 수 있어요' }, '관리자 헤더 없는 봇'],
    [tm.disband({ as: { ...bot(admin.id), 'x-discord-admin': 'true' } }), { error: '팀장만 팀을 해제할 수 있어요' }, 'X-Discord-Admin 은 1 만'],
    [tm.disband({ as: { ...web(out.id), 'x-discord-admin': '1' } }), { error: '팀장만 팀을 해제할 수 있어요' }, '웹 요청의 관리자 헤더는 무시'],
    [tm.extend(a), { error: '팀장만 연장할 수 있어요' }, '팀원 연장'], [tm.extend(admin), { error: '팀장만 연장할 수 있어요' }, '봇 관리자 연장'],
  ]) assert.deepEqual([(await r).status, (await r).body], [403, body], why)
  assert.deepEqual(userIds((await tm.get()).body), [lead.id, a.id, b.id], '아무것도 바뀌지 않았다')
  assert.deepEqual((await tm.kick(out.id, lead)).body, { error: '팀원을 찾을 수 없어요' })
  for (const bad of ['abc', '1', '123456789012345678901', '%20']) assert.equal((await tm.kick(bad, lead)).status, 404, bad)

  const left = await tm.kick(a.id, a)
  assert.deepEqual([left.status, left.body.ok, userIds(left.body.team), left.body.team.status], [200, true, [lead.id, b.id], 'open'])
  assert.equal((await tm.kick(a.id, a)).status, 404, '나간 뒤에는 없는 팀원')
  assert.equal((await me(api, a)).body.teamId, null)
  const kicked = await tm.kick(b.id, lead)
  assert.deepEqual([kicked.status, userIds(kicked.body.team)], [200, [lead.id]])
  const rejoin = await teamApi(api, team.id).join(b)
  assert.deepEqual([rejoin.status, rejoin.body.left], [201, null], '방출돼도 다시 가입할 수 있다')

  const ext = await tm.extend(lead)
  assert.equal(ext.status, 200)
  const off = await tm.disband(admin)
  assert.deepEqual([off.status, off.body], [200, { ok: true }], '봇 + X-Discord-Admin: 1 은 남의 팀도 해제')
  assert.equal((await tm.get()).status, 404)
  assert.deepEqual([(await me(api, lead)).body.teamId, (await me(api, b)).body.teamId], [null, null])

  // 팀장이 본인을 빼면 해제
  const t2 = (await create(api, lead)).body.team
  await teamApi(api, t2.id).join(a)
  const self = await teamApi(api, t2.id).kick(lead.id, lead)
  assert.deepEqual([self.status, self.body], [200, { ok: true, team: null }])
  assert.equal((await teamApi(api, t2.id).get()).status, 404)
  const t3 = (await create(api, out)).body.team
  assert.deepEqual((await teamApi(api, t3.id).disband(out)).body, { ok: true })

  await idle()
  const tail = hooks().map(h => h.embeds[0]).filter(e => /^(👋|🛑)/.test(e.title)).map(e => `${e.title} | ${e.description.split('\n').at(-1)}`)
  assert.deepEqual(tail, [
    '👋 팀원 이탈 · 픽 앤 롤 (2/3) | 팀에서 나갔어요', '👋 팀원 이탈 · 픽 앤 롤 (1/3) | 팀장이 내보냈어요',
    '🛑 팀 해제 · 픽 앤 롤 | 관리자가 팀을 해제했어요', '🛑 팀 해제 · 픽 앤 롤 | 팀장이 나가서 팀이 해제됐어요', '🛑 팀 해제 · 픽 앤 롤 | 팀장이 팀을 해제했어요',
  ])
})

dbTest('연장: 팀장 → 만료 = 지금 + 3시간(더하지 않는다) · 만료된 팀은 연장 · 가입 · 관리 404', async () => {
  let clock = futureBase()
  const { api } = start({ now: () => clock })
  const lead = await person(api), a = await person(api)
  const { body: { team } } = await create(api, lead)
  const tm = teamApi(api, team.id)
  assert.equal(team.expiresAt, clock + TTL)

  clock += HOUR
  const ext = await tm.extend(lead)
  assert.equal(ext.status, 200)
  assert.deepEqual(Object.keys(ext.body), ['team'])
  assert.deepEqual([ext.body.team.expiresAt, ext.body.team.createdAt], [clock + TTL, team.createdAt])
  clock += 30 * MIN
  assert.equal((await tm.extend(lead)).body.team.expiresAt, clock + TTL)
  assert.equal((await tm.extend(lead)).body.team.expiresAt, clock + TTL, '연달아 눌러도 최대 3시간')

  clock += TTL - 1
  assert.equal((await tm.get()).status, 200, '연장한 만큼 더 보인다')
  assert.equal((await api('GET', '/api/teams')).body.teams[0].expiresAt, clock + 1)
  assert.equal((await me(api, lead)).body.teamId, team.id)
  clock += 1
  assert.equal((await tm.get()).status, 404, '만료 시각이 되면 없는 팀')
  assert.equal((await me(api, lead)).body.teamId, null, '지우기 전에도 /me 에는 팀이 없다')
  for (const r of [tm.extend(lead), tm.join(a), tm.disband(lead), tm.kick(lead.id, lead)]) assert.equal((await r).status, 404)
  assert.deepEqual((await create(api, lead)).body.left, null, '만료된 팀은 청소돼 left 도 없다')
})

// ---------------------------------------------------------------- 목록 순서 · 만료 · 청소 · 404

dbTest('목록: 모집 중(오래된 순) 먼저 · 다 찬 팀은 뒤로 · 빠지면 다시 앞으로 · 만료된 팀은 안 보이고 방도 풀린다', async () => {
  let clock = futureBase()
  const { api } = start({ env: BOT, now: () => clock, channels: CHANNELS.filter(c => c.id !== '3') })
  const label = new Map()
  const mk = async name => {
    const p = await person(api)
    label.set(p.id, name)
    clock += 1000
    return { p, team: (await create(api, p)).body.team }
  }
  const a = await mk('a'), b = await mk('b'), c = await mk('c'), d = await mk('d')
  assert.deepEqual([a, b, c, d].map(x => x.team.voice?.id ?? null), ['11', '4', '2', null])
  const fill = async x => Promise.all([1, 2].map(async () => { const p = await person(api); await teamApi(api, x.team.id).join(p); return p }))
  const [a1] = await fill(a)
  await fill(c)
  const order = async () => (await api('GET', '/api/teams')).body.teams.map(x => [label.get(x.members[0].userId), x.status])

  assert.deepEqual(await order(), [['b', 'open'], ['d', 'open'], ['a', 'full'], ['c', 'full']])
  await mk('e')
  assert.deepEqual(await order(), [['b', 'open'], ['d', 'open'], ['e', 'open'], ['a', 'full'], ['c', 'full']], '새 방은 모집 중 맨 아래')

  const out = await teamApi(api, a.team.id).kick(a1.id, a.p)
  assert.equal(out.body.team.status, 'open')
  assert.deepEqual(await order(), [['a', 'open'], ['b', 'open'], ['d', 'open'], ['e', 'open'], ['c', 'full']], '다 찬 팀에서 빠지면 만든 순서 자리로 돌아간다')

  clock = a.team.expiresAt   // 정확히 만료 시각 = 만료
  assert.equal((await teamApi(api, a.team.id).get()).status, 404)
  assert.deepEqual(await order(), [['b', 'open'], ['d', 'open'], ['e', 'open'], ['c', 'full']])
  assert.equal((await mk('next')).team.voice.id, '11', '만료된 팀이 잡았던 끝 방')
})

dbTest('만료 청소: 팀을 만들 때 RPC 가 만료된 팀(팀원 cascade)과 창이 끝난 요청 수 기록을 지운다 · 만료 전 팀은 남는다', async () => {
  let clock = futureBase()
  const { api } = start({ now: () => clock })
  const g = await person(api), m = await person(api), s = await person(api), trigger = await person(api)
  const gone = (await create(api, g)).body.team
  await teamApi(api, gone.id).join(m)
  clock += 1
  const stay = (await create(api, s)).body.team
  const teamRows = async () => (await rows(`/recruit_teams?select=id&id=in.(${gone.id},${stay.id})&order=created_at`)).map(r => r.id)
  const hitRow = () => rows(`/recruit_hits?select=n&key=eq.${encodeURIComponent(`w ${g.id}`)}`)

  clock = gone.expiresAt
  assert.equal((await teamApi(api, gone.id).get()).status, 404, '지우기 전에도 안 보인다')
  assert.deepEqual(await teamRows(), [gone.id, stay.id], '읽기만으로는 지우지 않는다')
  assert.equal((await hitRow()).length, 1)
  assert.deepEqual((await api('GET', '/api/teams')).body.teams.map(x => x.id), [stay.id])

  await create(api, trigger)
  assert.deepEqual(await teamRows(), [stay.id], '만료된 팀만 지워졌다')
  assert.deepEqual(await rows(`/recruit_members?select=discord_user_id&team_id=eq.${gone.id}`), [], '팀원도 cascade')
  assert.deepEqual(await hitRow(), [], '창이 끝난 요청 수 기록도 지워졌다')
  assert.equal((await teamApi(api, stay.id).get()).status, 200)
  assert.equal((await rows(`/recruit_profiles?select=discord_user_id&discord_user_id=eq.${g.id}`)).length, 1, '프로필은 남는다')
})

test('404: 잘못된 id · 없는 주소(신원 확인 전)', async () => {
  const { api, net } = start({ db: FAKE_DB })
  for (const [m, p] of [
    ['GET', '/api/teams/short'], ['GET', '/api/teams/AAAAAAAA%2F'], ['GET', '/api/nope'], ['GET', '/api/teams/AAAAAAAA/extra'], ['PUT', '/api/teams'],
    ['DELETE', '/api/teams'], ['GET', '/api/teams/AAAAAAAA/members'], ['GET', '/api/teams/AAAAAAAA/extend'], ['DELETE', '/api/teams/AAAAAAAA/extend'],
    ['POST', '/api/teams/AAAAAAAA/extend/1'], ['POST', '/api/teams/AAAAAAAA/members/1'], ['POST', '/api/teams/bad/extend'], ['DELETE', '/api/teams/bad/members/1'],
    ['GET', '/api/teams/quick'], ['DELETE', '/api/teams/quick'], ['POST', '/api/teams/quick/members'], ['POST', '/api/teams/quick/extend'],
    ['PUT', '/api/me'], ['POST', '/api/me'], ['GET', '/api/me/profile'], ['POST', '/api/me/profile'], ['GET', '/api/me/'], ['PUT', '/api/me/profile/x'],
    ['GET', '/'], ['GET', '/recruit/api/health'], ['GET', '//api/health'],
  ]) {
    const r = await api(m, p, undefined, { as: web(uid()) })
    assert.equal(r.status, 404, `${m} ${p}`)
    assert.equal(typeof r.body.error, 'string')
  }
  assert.equal(net.auth.length, 0)
})

dbTest('404: 없는 팀', async () => {
  const { api } = start()
  const p = await person(api)
  for (const r of [
    api('GET', '/api/teams/AAAAAAAA'), teamApi(api, 'AAAAAAAA').join(p), teamApi(api, 'AAAAAAAA').disband(p), teamApi(api, 'AAAAAAAA').extend(p),
    teamApi(api, 'AAAAAAAA').kick(p.id, p),
  ]) assert.deepEqual([(await r).status, (await r).body], [404, { error: '팀을 찾을 수 없어요' }])
})

// ---------------------------------------------------------------- Data API 권한

dbTest('Data API 권한: anon · authenticated 키나 키 없이는 팀원모집 표 · RPC 를 못 쓴다(secret key 만 된다) · 옛 함수는 없다', async () => {
  const compose = readFileSync(new URL('../compose.yaml', import.meta.url), 'utf8')
  assert.ok(compose.includes(`SUPABASE_SECRET_KEY: ${jwt('service_role')}`), 'compose.yaml 의 api SUPABASE_SECRET_KEY 는 LOCAL_JWT_SECRET 으로 서명한 service_role 키여야 한다')
  assert.match(compose, /TNAB_BOT_KEY: (\S{32,})/, 'compose.yaml 에 로컬 봇 키(32자 이상)')
  const post = body => ({ method: 'POST', body: JSON.stringify(body) })
  const someone = '123456789012345678'
  for (const [who, key] of [['anon', jwt('anon')], ['authenticated', jwt('authenticated')], ['키 없음', null]]) {
    for (const [path, o] of [
      ['/recruit_profiles?select=discord_user_id,auth_user_id&limit=1', {}],
      ['/recruit_teams?select=id&limit=1', {}],
      ['/recruit_teams?select=id&recruit_member_count=lt.3', {}],
      ['/recruit_members?select=discord_user_id&limit=1', {}],
      ['/recruit_hits?select=key&limit=1', {}],
      ['/recruit_profiles', post({ discord_user_id: someone, discord_name: 'x', mic: true, entries: [], created_at: 0, updated_at: 0 })],
      ['/recruit_teams', post({ id: 'AAAAAAAA', room: {}, tactic: {}, created_at: 0, expires_at: 0 })],
      ['/recruit_members', post({ team_id: 'AAAAAAAA', discord_user_id: someone, joined_at: 0 })],
      ['/recruit_hits', post({ key: 'x', n: 0, reset_at: 0 })],
      ['/recruit_profiles?discord_user_id=eq.1', { method: 'PATCH', body: JSON.stringify({ discord_name: 'x' }) }],
      ['/recruit_teams?expires_at=lte.9999999999999', { method: 'DELETE' }],
      ['/recruit_members?joined_at=lte.9999999999999', { method: 'DELETE' }],
      ['/recruit_hits?reset_at=lte.9999999999999', { method: 'DELETE' }],
      ['/rpc/recruit_hit', post({ p_key: 'x', p_now: 0, p_window: 1, p_add: -100 })],
      ['/rpc/recruit_upsert_profile', post({ p_user: someone, p_auth: null, p_name: 'x', p_mic: true, p_entries: [], p_now: 0 })],
      ['/rpc/recruit_create_team', post({ p_id: 'AAAAAAAA', p_actor: someone, p_room: {}, p_tactic: {}, p_rooms: [], p_now: 0, p_expires_at: 0 })],
      ['/rpc/recruit_join_team', post({ p_team: 'AAAAAAAA', p_actor: someone, p_now: 0, p_size: 3 })],
    ]) {
      const r = await rest(path, { key, ...o })
      assert.ok([401, 403].includes(r.status), `${who} ${o.method || 'GET'} ${path} → ${r.status} ${await r.text()}`)
    }
  }
  assert.equal((await rest('/recruit_profiles?select=discord_user_id&limit=1')).status, 200, 'secret key 는 된다')
  // 옛 비밀번호 · 토큰 시그니처는 없어졌다 — 두 벌이 남으면 PostgREST 가 어느 쪽을 부를지 헷갈린다
  for (const [path, body] of [
    ['/rpc/recruit_create_team', { p_id: 'AAAAAAAA', p_room: {}, p_tactic: {}, p_rooms: [], p_password_hash: 'x', p_discord: 'x', p_entries: [], p_token_hash: 'x', p_now: 0, p_expires_at: 0 }],
    ['/rpc/recruit_join_team', { p_team: 'AAAAAAAA', p_discord: 'x', p_entries: [], p_token_hash: 'x', p_now: 0, p_size: 3 }],
  ]) {
    const old = await rest(path, post(body))
    assert.equal(old.status, 404, await old.text())
  }
  const cols = await rest('/recruit_teams?select=password_hash&limit=1')
  assert.equal(cols.status, 400, '옛 password_hash 열도 없다')
  // 디스코드 ID 형식은 DB 도 막는다
  const badId = await rest('/rpc/recruit_upsert_profile', post({ p_user: '123', p_auth: null, p_name: 'x', p_mic: true, p_entries: [], p_now: 0 }))
  assert.equal(badId.status, 400, await badId.text())
})

// ---------------------------------------------------------------- HTTP 가장자리

test('CORS: 목록에 있는 Origin 만 그대로 돌려준다(에러 포함) · preflight 204(PUT 포함) · 없는 Origin 은 허용 헤더 없음 · CORS_ORIGIN 없으면 헤더 없음', async () => {
  const site = 'https://nba-kor.github.io', local = 'http://localhost:8000', evil = 'https://evil.test'
  const on = start({ env: { CORS_ORIGIN: ` ${site} , ${local}` }, db: FAKE_DB })
  const off = start({ db: FAKE_DB })
  const call = (app, method, path, origin, headers = {}) => app.handler(new Request(`http://api.test${path}`, { method, headers: { ...(origin && { origin }), ...headers } }))

  for (const origin of [site, local]) {
    const pre = await call(on, 'OPTIONS', '/api/me/profile', origin, { 'access-control-request-method': 'PUT', 'access-control-request-headers': 'authorization, content-type' })
    assert.equal(pre.status, 204)
    assert.equal(pre.headers.get('access-control-allow-origin'), origin)
    assert.equal(pre.headers.get('access-control-allow-methods'), 'GET, POST, PUT, DELETE, OPTIONS')
    assert.equal(pre.headers.get('access-control-allow-headers'), 'authorization, content-type')
    assert.equal(pre.headers.get('access-control-max-age'), '600')
    assert.equal(pre.headers.get('vary'), 'Origin')
    assert.equal(await pre.text(), '')
    const ok = await call(on, 'GET', '/api/health', origin)
    assert.deepEqual([ok.status, ok.headers.get('access-control-allow-origin'), ok.headers.get('vary')], [200, origin, 'Origin'])
    const err = await call(on, 'GET', '/api/teams/AAAA', origin)
    assert.deepEqual([err.status, err.headers.get('access-control-allow-origin')], [404, origin], '에러 응답에도')
    const unauth = await call(on, 'GET', '/api/me', origin)
    assert.deepEqual([unauth.status, unauth.headers.get('access-control-allow-origin')], [401, origin], '401 에도 — 화면이 "로그인해 주세요" 를 읽는다')
  }

  const pre = await call(on, 'OPTIONS', '/api/teams', evil, { 'access-control-request-method': 'POST' })
  assert.equal(pre.status, 204)
  for (const h of ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers']) assert.equal(pre.headers.get(h), null, h)
  const denied = await call(on, 'GET', '/api/health', evil)
  assert.deepEqual([denied.status, denied.headers.get('access-control-allow-origin'), denied.headers.get('vary')], [200, null, 'Origin'])
  assert.equal((await call(on, 'GET', '/api/health', null)).headers.get('access-control-allow-origin'), null, 'Origin 없음(같은 도메인 · curl · 봇)')
  assert.equal((await call(on, 'GET', '/api/health', `${site}.evil.test`)).headers.get('access-control-allow-origin'), null, '앞부분만 같은 Origin')

  const offPre = await call(off, 'OPTIONS', '/api/teams', site)
  assert.equal(offPre.status, 204)
  assert.equal(offPre.headers.get('access-control-allow-origin'), null)
  assert.equal((await call(off, 'GET', '/api/health', site)).headers.get('access-control-allow-origin'), null)
  assert.equal((await call(off, 'GET', '/api/health', site)).headers.get('vary'), null)
})

test('413: 32KB 넘는 본문 (content-length · 스트림 둘 다) · 본문을 안 쓰는 요청은 읽지 않는다', async () => {
  const { api, handler } = start({ db: FAKE_DB })
  const as = bot(uid())
  const big = JSON.stringify({ room: ROOM, pad: 'x'.repeat(33 * 1024) })
  const r = await api('POST', '/api/teams', big, { as })
  assert.deepEqual([r.status, typeof r.body.error], [413, 'string'])
  assert.equal((await api('PUT', '/api/me/profile', JSON.stringify({ mic: true, pad: 'x'.repeat(33 * 1024) }), { as })).status, 413)
  assert.equal((await api('POST', '/api/teams', '{}', { as, headers: { 'content-length': String(40 * 1024) } })).status, 413, 'content-length 만 봐도 거절')
  const join = await api('POST', '/api/teams/AAAAAAAA/members', 'x'.repeat(33 * 1024), { as, headers: { 'content-type': 'text/plain' } })
  assert.equal(join.status, 428, '가입은 본문을 무시한다(415 · 413 아님)')

  let pulled = 0
  const chunk = new TextEncoder().encode('x'.repeat(8 * 1024))
  const endless = await handler(new Request('http://api.test/api/teams', {
    method: 'POST', duplex: 'half', headers: { 'content-type': 'application/json', ...as },
    body: new ReadableStream({ pull(c) { pulled++; c.enqueue(chunk) } }),   // 끝나지 않는 스트림 — 다 읽으려 들면 테스트가 멈춘다
  }))
  assert.equal(endless.status, 413)
  assert.ok(pulled <= 8, `넘친 뒤로는 더 읽지 않는다(${pulled}번 읽음)`)
  assert.equal((await api('GET', '/api/health')).status, 200)
})

dbTest('요청 수 제한: 한 사람(디스코드 ID) 당 PUT · POST · DELETE 30번 / 10분(DB 가 센다) · 웹 · 봇이 같은 ID 면 같이 · GET · 인증 실패는 안 센다', async () => {
  let clock = futureBase()
  const { api } = start({ now: () => clock })
  const id = uid(), other = uid()
  for (let i = 0; i < 15; i++) assert.equal((await api('PUT', '/api/me/profile', {}, { as: web(id) })).status, 400)
  for (let i = 0; i < 15; i++) assert.equal((await api('POST', '/api/teams', {}, { as: bot(id) })).status, 400)
  const r = await api('PUT', '/api/me/profile', {}, { as: web(id) })
  assert.deepEqual([r.status, r.body], [429, { error: '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요' }])
  for (const [m, p] of [['DELETE', '/api/teams/AAAAAAAA'], ['POST', '/api/teams/quick'], ['POST', '/api/teams/AAAAAAAA/extend'], ['DELETE', `/api/teams/AAAAAAAA/members/${id}`]]) {
    assert.equal((await api(m, p, undefined, { as: bot(id) })).status, 429, `${m} ${p}`)
  }
  assert.equal((await api('GET', '/api/me', undefined, { as: web(id) })).status, 200, 'GET 은 세지 않는다')
  assert.equal((await api('GET', '/api/teams')).status, 200)
  assert.equal((await api('PUT', '/api/me/profile', {}, { as: bot(other) })).status, 400, '다른 사람')
  assert.equal((await api('PUT', '/api/me/profile', {}, { as: { ...bot(id), authorization: 'Bot wrong' } })).status, 401, '인증 실패가 먼저')
  const [row] = await rows(`/recruit_hits?select=n&key=eq.${encodeURIComponent(`w ${id}`)}`)
  assert.equal(row.n, 35)
  clock += 10 * MIN
  assert.equal((await api('PUT', '/api/me/profile', {}, { as: web(id) })).status, 400, '10분 지나면 풀린다')
})

dbTest('요청 수 제한: 워커 여럿이 같은 사람 요청 40개를 동시에 받아도 정확히 30개만 통과', async () => {
  const clock = futureClock()
  const apps = Array.from({ length: 5 }, () => start({ now: clock }))
  const id = uid()
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => apps[i % apps.length].api('PUT', '/api/me/profile', {}, { as: bot(id) })))
  assert.deepEqual(count(rs.map(r => r.status)), { 400: 30, 429: 10 })
})

// ---------------------------------------------------------------- Data API 오류 (DB 없이 — 끊긴 연결 · 가짜 PostgREST)

const DB_DOWN = '모집 서버 DB 에 연결할 수 없어요'

test('Data API 에 닿지 않으면 503 · 키는 로그에 없다', async () => {
  const dlogs = []
  // Deno 는 fetch 오류 문구에 URL 을 싣는다
  const down = u => { throw new TypeError(`error sending request for url (${u}): client error (Connect)`) }
  const { api } = start({ db: down, env: { SUPABASE_SECRET_KEY: 'sb_secret_leak' }, log: (...a) => dlogs.push(a.map(String).join(' ')) })
  const as = bot(uid())
  for (const [m, p, body, who] of [
    ['GET', '/api/teams'], ['GET', '/api/teams/AAAAAAAA'], ['GET', '/api/me', undefined, as], ['GET', '/api/me', undefined, web(uid())],
    ['PUT', '/api/me/profile', { mic: true, entries: [entry()] }, as], ['POST', '/api/teams', { room: ROOM }, as], ['POST', '/api/teams/AAAAAAAA/members', undefined, as],
    ['POST', '/api/teams/quick', undefined, as], ['POST', '/api/teams/AAAAAAAA/extend', undefined, as], ['DELETE', '/api/teams/AAAAAAAA', undefined, as],
    ['DELETE', `/api/teams/AAAAAAAA/members/${as['x-discord-user']}`, undefined, as],
  ]) {
    const r = await api(m, p, body, { as: who })
    assert.deepEqual([r.status, r.body], [503, { error: DB_DOWN }], `${m} ${p}`)
  }
  assert.equal((await api('GET', '/api/health')).status, 200, 'health 는 DB 를 안 쓴다')
  assert.ok(dlogs.length && !dlogs.join('\n').includes('sb_secret_leak'), dlogs.join('\n'))
  assert.ok(dlogs.every(l => l.includes('(<url>)') && !l.includes('db.test')), dlogs.join('\n'))
})

test('Data API 오류 → HTTP: PT404 · PT409(full · already) · PT428 은 사용자 문구, 5xx · 프록시 오류는 503, 그 밖은 500 · RPC 요청 모양 · secret key 고르기', async () => {
  const id = '123456789012345678'
  const member = (uid, leader) => ({ discord_user_id: uid, leader, joined_at: 0, profile: { discord_name: uid, mic: true, entries: [entry()] } })
  const row = {
    id: 'AAAAAAAA', room: ROOM, tactic: { preset: null, name: '', board: null }, voice: null, created_at: 0, expires_at: TTL,
    members: [member('111111111111111111', true), member(id, false)],
  }
  const seen = []
  let rpc = [200, JSON.stringify({ left: null, count: 2 })]
  const db = (u, init) => {
    seen.push({ method: init.method, path: u.pathname + u.search, headers: init.headers, body: init.body && JSON.parse(init.body) })
    if (u.pathname === '/rest/v1/rpc/recruit_hit') return [200, '1']
    if (u.pathname === '/rest/v1/recruit_profiles') return init.method === 'PATCH' ? [204, ''] : [200, JSON.stringify([{ discord_name: '봇', mic: true, entries: [entry()], updated_at: 0, member: null }])]
    if (u.pathname === '/rest/v1/rpc/recruit_create_team') return [200, JSON.stringify({ voice: { id: '11', name: '음성 4' }, left: null })]
    if (u.pathname === '/rest/v1/rpc/recruit_upsert_profile') return [200, '']
    return u.pathname.startsWith('/rest/v1/rpc/') ? (typeof rpc === 'function' ? rpc() : rpc) : init.method === 'DELETE' ? [204, ''] : [200, JSON.stringify([row])]
  }
  const elogs = []
  const keys = JSON.stringify({ default: 'sb_secret_from_keys', other: 'sb_secret_other' })
  const { api } = start({
    db, env: { ...BOT, DISCORD_GUILD_ID: 'g-shape', SUPABASE_SECRET_KEYS: keys, SUPABASE_SECRET_KEY: 'sb_secret_fallback' }, now: () => 0,
    log: (...a) => elogs.push(a.map(String).join(' ')),
  })
  const as = bot(id, '봇')
  const join = () => api('POST', '/api/teams/AAAAAAAA/members', undefined, { as })

  const ok = await join()
  assert.deepEqual([ok.status, ok.body.left, ok.body.team.status, userIds(ok.body.team)], [201, null, 'open', ['111111111111111111', id]])
  assert.deepEqual(seen.find(s => s.path === '/rest/v1/rpc/recruit_hit').body, { p_key: `w ${id}`, p_now: 0, p_window: 600_000, p_add: 1 })
  const call = seen.find(s => s.path === '/rest/v1/rpc/recruit_join_team')
  assert.deepEqual(call.body, { p_team: 'AAAAAAAA', p_actor: id, p_now: 0, p_size: 3 })
  assert.equal(call.headers.apikey, 'sb_secret_from_keys', 'SUPABASE_SECRET_KEYS 의 default 가 먼저')
  assert.equal(call.headers.authorization, undefined, 'secret key 는 Authorization 에 싣지 않는다')
  assert.deepEqual([call.headers['content-type'], call.headers.accept], ['application/json', 'application/json'])
  assert.ok(seen.every(s => s.path.startsWith('/rest/v1/recruit_') || s.path.startsWith('/rest/v1/rpc/')), seen.map(s => s.path).join('\n'))
  assert.ok(!seen.some(s => s.method === 'PATCH'), '읽기만으로 프로필을 고치지 않는다')
  assert.ok(seen.every(s => !s.path.includes('auth_user_id')), 'auth_user_id 는 읽지 않는다')

  // 디스코드 이름이 달라도 프로필은 그대로다 — 표시 이름은 본인이 화면에서만 바꾼다
  seen.length = 0
  await api('POST', '/api/teams/AAAAAAAA/members', undefined, { as: bot(id, '새 이름') })
  assert.deepEqual(seen.filter(s => s.method === 'PATCH'), [], '신원 이름으로 덮어쓰지 않는다')

  // 팀 만들기 · 프로필 저장 RPC 모양
  seen.length = 0
  assert.equal((await api('POST', '/api/teams', { room: ROOM, tactic: { preset: 'pnr' } }, { as })).status, 201)
  const cr = seen.find(s => s.path === '/rest/v1/rpc/recruit_create_team').body
  assert.deepEqual(Object.keys(cr).sort(), ['p_actor', 'p_expires_at', 'p_id', 'p_now', 'p_room', 'p_rooms', 'p_tactic'])
  assert.deepEqual([cr.p_actor, cr.p_expires_at, cr.p_room], [id, TTL, ROOM])
  assert.deepEqual(cr.p_rooms, [{ id: '11', name: '음성 4' }, { id: '4', name: '음성 3' }, { id: '3', name: '음성 2' }, { id: '2', name: '음성 1' }])
  assert.equal((await api('PUT', '/api/me/profile', { mic: false, entries: [entry()] }, { as })).status, 200)
  assert.deepEqual(seen.find(s => s.path === '/rest/v1/rpc/recruit_upsert_profile').body, { p_user: id, p_auth: null, p_name: '봇', p_mic: false, p_entries: [entry()], p_now: 0 })

  // SUPABASE_SECRET_KEYS 가 없거나 깨졌으면 SUPABASE_SECRET_KEY
  for (const SUPABASE_SECRET_KEYS of ['', '{not json', '{}', 'null']) {
    const s2 = []
    const app = start({ db: (u, init) => (s2.push(init.headers.apikey), [200, '1']), env: { SUPABASE_SECRET_KEYS, SUPABASE_SECRET_KEY: 'sb_secret_fallback' } })
    await app.api('PUT', '/api/me/profile', {}, { as: bot(uid()) })
    assert.deepEqual(s2, ['sb_secret_fallback'], JSON.stringify(SUPABASE_SECRET_KEYS))
  }

  const pg = (code, message) => JSON.stringify({ code, details: null, hint: null, message })
  for (const [reply, status, error] of [
    [[404, pg('PT404', 'not_found')], 404, '팀을 찾을 수 없어요'],
    [[409, pg('PT409', 'full')], 409, '이미 다 찬 팀이에요'],
    [[409, pg('PT409', 'already')], 409, '이미 이 팀에 있어요'],
    [[428, pg('PT428', 'no_profile')], 428, '먼저 프로필을 등록해 주세요'],
    [[500, pg('55P03', 'canceling statement due to lock timeout')], 503, DB_DOWN],
    [[502, '<html>502 Bad Gateway</html>'], 503, DB_DOWN],
    [[409, pg('PT409', 'closed')], 500, '서버 오류가 났어요'],
    [[409, pg('23505', 'duplicate key value violates unique constraint "recruit_members_discord_user_id_key"')], 500, '서버 오류가 났어요'],
    [[401, pg('PGRST301', 'No suitable key or wrong key type')], 500, '서버 오류가 났어요'],
  ]) {
    rpc = reply
    const r = await join()
    assert.deepEqual([r.status, r.body], [status, { error }], reply.join(' '))
  }
  assert.equal(elogs.filter(l => l.startsWith('API 오류')).length, 3, '500 은 로그에 남긴다')

  // PGRST303(앞단이 찍은 임시 JWT 의 발급 시각이 DB 시계보다 앞섬) — 운영에서 함수가 막 켜졌을 때 났다. 잠깐 뒤 다시 보낸다
  const skew = [401, pg('PGRST303', 'JWT issued at future')]
  let left = 1
  rpc = () => left-- > 0 ? skew : [200, JSON.stringify({ left: null, count: 2 })]
  const retried = await join()
  assert.deepEqual([retried.status, left], [201, -1], '한 번 거절돼도 다시 보내 성공한다')
  rpc = skew
  const calls = seen.length
  const stuck = await join()
  assert.deepEqual([stuck.status, stuck.body], [503, { error: DB_DOWN }], '계속 어긋나면 500 이 아니라 503(다시 시도할 수 있는 오류)')
  assert.equal(seen.slice(calls).filter(s => s.path === '/rest/v1/rpc/recruit_join_team').length, 3, '처음 + 두 번 더')
  assert.ok(!elogs.join('\n').includes('sb_secret_'), '키는 로그에 남기지 않는다')
})

test('응답 어디에도 토큰 · 봇 키 · auth_user_id · 옛 비밀번호 필드가 없다', () => {
  const all = responses.join('\n')
  for (const secret of [BOT_KEY, 'Bearer', 'web.', 'auth_user_id', 'authUserId', '00000000-0000-4000-8000', PUB, 'sb_secret', 'password', 'token_hash']) {
    assert.ok(!all.includes(secret), secret)
  }
  assert.ok(responses.length > (noDb ? 150 : 500), responses.length)
})

test('서버 오류(500)는 한 번도 나지 않았다', () => {
  assert.deepEqual(logs.filter(l => l.startsWith('API 오류')), [])
})
