// 팀원모집 API 테스트 — createHandler 를 Node 에서 직접 부른다(HTTP 서버 없이 Request → Response).
//   docker compose up -d && node --test server/test.mjs
// DB 테스트는 compose 의 로컬 Supabase(http://localhost:54321, compose.yaml 의 로컬 service_role 키)를 쓴다. 떠 있지 않으면
// 이유를 달고 건너뛴다. SUPABASE_URL · SUPABASE_SECRET_KEY 로 바꿀 수 있지만 로컬 주소가 아니면 DB 테스트를 돌리지 않는다.
// 웹훅 · 디스코드 REST 는 가짜 fetch 가 받는다. DB 는 비우지 않는다 — 대신 앱마다 먼 미래의 서로 다른 시계(now)를 줘서,
// 목록 · 음성채널 예약 · 요청 수 제한이 그 테스트 것만 보게 한다(팀 만들기의 만료 청소는 앞 테스트의 팀을 지운다).

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

// ---------------------------------------------------------------- 공용 준비물

const logs = []
const log = (...a) => logs.push(a.map(String).join(' '))
const responses = []   // 모든 API 응답 본문 — 비밀번호 · 해시가 새지 않았는지 마지막에 훑는다

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
 * 가짜 바깥세상. https://hook.test = 웹훅(reply 로 응답을 바꾼다), https://discord.com = 채널 목록(channels),
 * http://db.test = 가짜 Data API(db(url, init) → [status, body]), 그 밖(로컬 Data API)은 진짜 fetch.
 */
function fakeNet({ channels = CHANNELS, db } = {}) {
  const net = { hooks: [], discord: [], reply: () => [204] }
  net.fetch = async (url, init = {}) => {
    const u = new URL(url)
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
// 요청 수 제한(recruit_hit)만 1 로 답하는 가짜 DB — DB 없이 검증 · 404 · 413 을 본다
const HITS_ONLY = u => u.pathname === '/rest/v1/rpc/recruit_hit' ? [200, '1'] : [503, '']

let appNo = 0
/** 앱 하나 = 시계 하나 · 웹훅 경로 하나. 요청마다 다른 IP 를 줘서 요청 수 제한을 피한다(ip 로 고정 가능). */
function start({ env = {}, now = futureClock(), log: logTo = log, channels, db } = {}) {
  const n = ++appNo, pending = []
  const net = fakeNet({ channels, db })
  const handler = createHandler({
    env: {
      SUPABASE_URL: db ? 'http://db.test' : SUPA, SUPABASE_SECRET_KEY: db ? 'sb_secret_test' : KEY,
      SITE_URL: SITE + '/', DISCORD_GUILD_ID: GUILD, DISCORD_WEBHOOK_URL: `https://hook.test/${n}`, ...env,
    },
    now, fetch: net.fetch, log: logTo,
    waitUntil: p => pending.push(p),
    ipOf: req => req.headers.get('x-test-ip'),
  })
  let ip = 0
  const api = async (method, path, body, { token, ip: from, headers } = {}) => {
    const res = await handler(new Request(`http://api.test${path}`, {
      method,
      headers: {
        'x-test-ip': from ?? `10.${n % 250}.${(++ip >> 8) % 250}.${ip % 250}`,
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
        ...headers,
      },
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

const PW = 'pass word!'   // 공백 · 기호도 비밀번호 — 자르지 않는다
const ROOM = { title: '', mic: true, mode: 'fun', memo: '', password: PW }
const person = (discord, entries = [{ nick: discord, tier: '골드', char: 'bl' }]) => ({ discord, entries })
const create = (api, member, tactic = { preset: 'pnr' }, room = {}, o) => api('POST', '/api/teams', { room: { ...ROOM, ...room }, tactic, member }, o)
const VIEW_KEYS = ['id', 'room', 'tactic', 'voice', 'status', 'size', 'createdAt', 'expiresAt', 'members']
const count = list => list.reduce((c, v) => ({ ...c, [v]: (c[v] || 0) + 1 }), {})

/** 팀 하나 + 팀 관리 요청들. 관리는 토큰(Bearer) 또는 본문 비밀번호 */
const teamApi = (api, id) => ({
  join: (d, o) => api('POST', `/api/teams/${id}/members`, typeof d === 'string' ? person(d) : d, o),
  get: () => api('GET', `/api/teams/${id}`),
  kick: (memberId, auth = {}) => api('DELETE', `/api/teams/${id}/members/${memberId}`, auth.password === undefined ? undefined : { password: auth.password }, auth),
  disband: (auth = {}) => api('DELETE', `/api/teams/${id}`, auth.password === undefined ? undefined : { password: auth.password }, auth),
  extend: (auth = {}) => api('POST', `/api/teams/${id}/extend`, auth.password === undefined ? undefined : { password: auth.password }, auth),
})

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

// ---------------------------------------------------------------- 팀 만들기 · 음성채널 배정 · 알림

dbTest('팀 만들기: 끝 방부터 배정, 만료 전인 팀이 잡은 방은 건너뜀, 해제하면 풀림 · 팀 뷰 모양', async () => {
  const { api } = start({ env: BOT })

  const a = await create(api, person('lead-a'), { preset: 'pnr' }, { title: '  같이 3판 ', mic: false, mode: 'serious', memo: ' 첫 줄\n둘째 줄 ' })
  assert.equal(a.status, 201)
  const { team } = a.body
  assert.deepEqual(Object.keys(team), VIEW_KEYS)
  assert.deepEqual(team.room, { title: '같이 3판', mic: false, mode: 'serious', memo: '첫 줄\n둘째 줄' }, '앞뒤 공백만 자르고 줄바꿈은 둔다')
  assert.deepEqual(team.voice, { id: '11', name: '음성 4', url: `https://discord.com/channels/${GUILD}/11` })
  assert.equal(team.status, 'open')
  assert.equal(team.size, 3)
  assert.equal(team.expiresAt, team.createdAt + TTL)
  assert.match(team.id, /^[A-Za-z0-9_-]{8}$/)
  assert.equal(typeof a.body.member.id, 'number')
  assert.match(a.body.member.token, /^[A-Za-z0-9_-]{24}$/)
  assert.deepEqual(team.members.map(m => Object.keys(m)), [['id', 'leader', 'discord', 'entries', 'joinedAt']])

  const b = (await create(api, person('lead-b'))).body, c = (await create(api, person('lead-c'))).body, d = (await create(api, person('lead-d'))).body
  assert.deepEqual([b, c, d].map(x => x.team.voice.id), ['4', '3', '2'])
  assert.equal((await create(api, person('lead-e'))).body.team.voice, null, '빈 방이 없으면 voice 없이 만든다')

  const got = await api('GET', `/api/teams/${team.id}`)
  assert.deepEqual(got.body, team)
  const off = await teamApi(api, team.id).disband({ token: a.body.member.token })
  assert.deepEqual([off.status, off.body], [200, { ok: true }])
  assert.equal((await create(api, person('lead-f'))).body.team.voice.id, '11', '해제한 팀의 방은 다시 배정된다')

  // 동시에 만들어도 같은 방을 두 팀에 주지 않는다(DB 잠금) — 빈 방 4 · 3 을 세 팀이 다툰다
  await teamApi(api, b.team.id).disband({ password: PW })
  await teamApi(api, c.team.id).disband({ token: c.member.token })
  const rs = await Promise.all(['p1', 'p2', 'p3'].map(x => create(api, person(x))))
  assert.deepEqual(rs.map(r => r.status), [201, 201, 201])
  assert.deepEqual(rs.map(r => r.body.team.voice?.id ?? '').sort(), ['', '3', '4'])
})

dbTest('팀 만들기: 방 3개에 10팀이 동시에 → 서로 다른 방 3개 + 나머지는 voice null', async () => {
  const three = CHANNELS.filter(c => ['2', '3', '4'].includes(c.id))
  const { api, net } = start({ env: BOT, channels: three })
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => create(api, person(`par${i}`))))
  assert.deepEqual(rs.map(r => r.status), Array(10).fill(201))
  const got = rs.map(r => r.body.team.voice?.id ?? null)
  assert.deepEqual(got.filter(Boolean).sort(), ['2', '3', '4'])
  assert.equal(got.filter(v => v === null).length, 7)
  assert.ok(net.discord.length >= 1)
})

dbTest('팀 만들기: 봇이 없거나 디스코드가 실패하면 voice null · health 의 voice 는 봇 설정 여부', async () => {
  const none = start()
  const broken = start({ env: { ...BOT, DISCORD_GUILD_ID: 'g-broken' }, channels: () => json(403, { message: 'Missing Access', code: 50001 }) })
  const ok = start({ env: BOT })
  assert.equal((await create(none.api, person('x'))).body.team.voice, null)
  assert.equal(none.net.discord.length, 0, '봇이 없으면 디스코드를 부르지 않는다')
  const r = await create(broken.api, person('x'))
  assert.deepEqual([r.status, r.body.team.voice], [201, null], '디스코드 오류로 팀 만들기가 실패하지 않는다')
  assert.deepEqual((await none.api('GET', '/api/health')).body, { ok: true, voice: false })
  assert.deepEqual((await ok.api('GET', '/api/health')).body, { ok: true, voice: true })
})

dbTest('가입 → 모집 완료 → 4번째 409, 디스코드 닉네임 중복(대소문자 무시) 409, 알림 3종(방 정보 줄 · 메모 필드) · waitUntil', async () => {
  const { api, idle, hooks, net, pending } = start({ env: BOT })
  const leader = person('Bono<@123>', [
    { nick: '보노_*bono*', tier: '골드', char: 'bl' },
    { nick: '보노_*bono*', tier: '골드', char: 'klfd' },
    { nick: '부계정<@123>', tier: '실버', char: 'bl' },
  ])
  const room = { title: '빡겜 *3판*만', mic: false, mode: 'serious', memo: '디코 필수\n<@123> - 매너' }
  const { body: { team } } = await create(api, leader, { preset: 'high-low' }, room)
  assert.ok(pending.length >= 1, '알림은 waitUntil 로 넘긴다(응답 뒤에도 워커가 살아 있게)')
  const { join } = teamApi(api, team.id)

  const j1 = await join('Member')
  assert.equal(j1.status, 201)
  assert.equal(j1.body.team.status, 'open')
  assert.equal((await join('member')).status, 409)
  assert.equal((await join('bono<@123>')).status, 409)
  const j2 = await join(person('@everyone', [{ nick: 'third', tier: '전성기', char: 'sga' }]))
  assert.equal(j2.status, 201)
  assert.equal(j2.body.team.status, 'full')
  assert.deepEqual(j2.body.team.members.map(m => [m.leader, m.discord]), [[true, 'Bono<@123>'], [false, 'Member'], [false, '@everyone']])
  const j3 = await join('late')
  assert.deepEqual([j3.status, j3.body], [409, { error: '이미 다 찬 팀이에요' }])

  await idle()
  const [start1, joined, full, ...rest] = hooks()
  assert.equal(rest.length, 0)
  for (const h of net.hooks) {
    assert.match(h.url, /^\/\d+\?wait=true$/)
    assert.match(h.headers['user-agent'], /^DiscordBot \(/)
    assert.deepEqual(h.body.allowed_mentions, { parse: [] })
    assert.equal(h.body.username, 'NBA 덩크 시티 팀원모집')
  }
  const meta = '🔇 마이크 X · 빡겜 · 전술 하이\\-로우'
  const memo = { name: '메모', value: '디코 필수\n\\<\\@123\\> \\- 매너' }

  const e1 = start1.embeds[0]
  assert.equal(e1.title, '🏀 팀원 모집 시작 · 빡겜 3판만', '제목은 방 제목 우선 · 이스케이프 대신 마크다운 기호를 뺀다')
  assert.equal(e1.url, `${SITE}/recruit/?t=${team.id}`)
  assert.equal(e1.color, 0xf5a623)
  assert.equal(e1.description, `${meta}\n\n**보노\\_\\*bono\\*** (골드) · Bono\\<\\@123\\>\nPG 라멜로 볼 외 2개\n\n모집 1/3`)
  assert.deepEqual(e1.fields, [{ name: '음성채널', value: `<#11>\n[바로 들어가기](https://discord.com/channels/${GUILD}/11)` }, memo])
  assert.deepEqual(e1.thumbnail, { url: `${SITE}/assets/players/bl.png` })

  const e2 = joined.embeds[0]
  assert.equal(e2.title, '✅ 팀원 합류 · 빡겜 3판만 (2/3)')
  assert.equal(e2.color, 0x4d9eff)
  assert.equal(e2.description, `${meta}\n\n**Member** (골드) · Member\nPG 라멜로 볼`)
  assert.deepEqual(e2.fields, [memo])

  const e3 = full.embeds[0]
  assert.equal(e3.title, '🎉 모집 완료 · 빡겜 3판만')
  assert.equal(e3.color, 0x35c6a7)
  assert.equal(e3.description.split('\n\n').length, 4, '방 정보 줄 + 팀원 3명')
  assert.ok(e3.description.startsWith(`${meta}\n\n`))
  assert.ok(e3.description.includes('**third** (전성기) · \\@everyone\n'))
  assert.ok(!/(^|[^\\])[<@]/.test(e3.description), '멘션이 될 수 있는 < @ 는 전부 이스케이프')
  assert.deepEqual(e3.fields, [{ name: '음성채널', value: `<#11> 로 모여주세요\n[바로 들어가기](https://discord.com/channels/${GUILD}/11)` }, memo])
  assert.ok(!JSON.stringify(hooks()).includes(PW), '알림에 비밀번호가 없다')
})

test('알림: 음성채널 없음 문구 · 전술 자유 · 웹훅 429 는 한 번 기다렸다 재시도(30초 넘게 기다리라면 버림) · 404 면 끈다', async () => {
  const net = fakeNet(), nlogs = [], pending = []
  const n = createNotifier({
    webhookUrl: 'https://hook.test/notify', siteUrl: SITE, guildId: GUILD, players: PLAYERS, modes: CFG.modes,
    fetch: net.fetch, waitUntil: p => pending.push(p), log: m => nlogs.push(m),
  })
  const idle = async () => { while (pending.length) await Promise.all(pending.splice(0)) }
  const sent = () => net.hooks.map(h => h.body)
  const team = (name = '', room = {}) => ({
    id: 'AbCdEfGh', room: { title: '', mic: true, mode: 'fun', memo: '', ...room }, tactic: { preset: null, name, board: null },
    voice: null, status: 'open', size: 3, createdAt: 0, expiresAt: TTL,
    members: [{ id: 1, leader: true, discord: 'solo', entries: [{ nick: 'solo', tier: '골드', char: 'bl' }], joinedAt: 0 }],
  })

  let first = true
  net.reply = () => first ? (first = false, [429, { retry_after: 0.05 }]) : [204]
  n.teamCreated(team())
  await idle()
  assert.equal(sent().length, 2)
  assert.deepEqual(sent()[0], sent()[1])
  assert.equal(sent()[0].embeds[0].title, '🏀 팀원 모집 시작 · 전술 자유')
  assert.deepEqual(sent()[0].embeds[0].fields, [{ name: '음성채널', value: '빈 음성채널이 없어요 — 자유롭게 모여주세요' }], '메모가 없으면 메모 필드도 없다')
  assert.equal(sent()[0].embeds[0].description, '🎙️ 마이크 O · 즐겜 · 전술 자유\n\n**solo** (골드) · solo\nPG 라멜로 볼\n\n모집 1/3')

  // retry_after 도 Retry-After 헤더도 없는 429 → 1초 쉬고 재시도 · 방 제목이 없으면 보드 이름, 마크다운 기호는 제목에서 뺀다
  first = true
  net.reply = () => first ? (first = false, [429, {}]) : [204]
  let at = Date.now()
  n.teamCreated(team('**우리_전술** <@1>', { title: '*_*' }))
  await idle()
  assert.ok(Date.now() - at >= 900, `재시도까지 ${Date.now() - at}ms`)
  assert.equal(sent().length, 4)
  assert.equal(sent()[3].embeds[0].title, '🏀 팀원 모집 시작 · 우리전술 1')
  assert.ok(sent()[3].embeds[0].description.startsWith('🎙️ 마이크 O · 즐겜 · 전술 \\*\\*우리\\_전술\\*\\* \\<\\@1\\>\n\n'))

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

// ---------------------------------------------------------------- 검증 (DB 없이 — 요청 수 제한만 가짜 DB 가 답한다)

test('검증: 잘못된 신청은 400', async () => {
  const { api } = start({ db: HITS_ONLY })
  const bad = async (member, why) => {
    const r = await create(api, member)
    assert.equal(r.status, 400, why)
    assert.equal(typeof r.body.error, 'string', why)
  }
  const e = (o = {}) => ({ nick: '보노', tier: '골드', char: 'bl', ...o })
  await bad(person('a', [e({ tier: '마스터' })]), '없는 티어')
  await bad(person('a', [e({ char: 'nope' })]), '없는 캐릭터')
  await bad(person('a', [e({ char: UPCOMING })]), '미출시 캐릭터')
  await bad(person('a', [e(), e({ char: 'klfd' }), e({ char: 'sga' }), e({ char: 'lkdqq' })]), '4개')
  await bad(person('a', []), '0개')
  await bad(person('a', [e(), e()]), '같은 닉네임·캐릭터 중복')
  await bad(person('a', [e({ nick: 'discord.gg/abc' })]), '닉네임에 링크')
  await bad(person('https://evil.test'), '디스코드 닉네임에 링크')
  await bad(person('a', [e({ nick: 'www.evil.test' })]), 'www 링크')
  await bad(person('a', [e({ nick: `a${ctrl(7)}b` })]), '제어문자')
  await bad(person('a', [e({ nick: 'a\nb' })]), '닉네임 줄바꿈')
  await bad(person('a', [e({ nick: '   ' })]), '공백뿐인 닉네임')
  await bad(person('a', [e({ nick: 'ㄱ'.repeat(21) })]), '닉네임 21자')
  await bad(person('가'.repeat(33)), '디스코드 33자')
  await bad(person('a', [e({ nick: ['보노'] })]), '문자열 아닌 닉네임')
  await bad(person('a', [e({ char: ['bl'] })]), '배열 캐릭터')
  await bad({ discord: 'a', entries: 'bl' }, 'entries 가 배열 아님')
  await bad(null, '신청 정보 없음')

  for (const [tactic, why] of [
    [{ preset: 'nope' }, '없는 프리셋'],
    [{ preset: ['pnr'] }, '배열 프리셋'],
    ['pnr', '전술이 객체 아님'],
    [{ board: { tokens: [] }, name: 'x'.repeat(31) }, '전술 이름 31자'],
    [{ board: { tokens: [] }, name: 'https://x.test' }, '전술 이름에 링크'],
  ]) assert.equal((await create(api, person('a'), tactic)).status, 400, why)

  assert.equal((await api('POST', '/api/teams', '{"member":')).status, 400, '깨진 JSON')
  assert.equal((await api('POST', '/api/teams', [])).status, 400, '배열 본문')
  assert.equal((await api('POST', '/api/teams', '')).status, 400, '빈 본문')
  const plain = await api('POST', '/api/teams', JSON.stringify({ room: ROOM, member: person('a') }), { headers: { 'content-type': 'text/plain' } })
  assert.equal(plain.status, 415)
})

test('검증: 방 설정(제목 · 마이크 · 즐겜/빡겜 · 메모 · 비밀번호)이 잘못되면 400', async () => {
  const { api } = start({ db: HITS_ONLY })
  const { password, ...noPw } = ROOM
  const { mic, ...noMic } = ROOM
  const { mode, ...noMode } = ROOM
  const cases = [
    [undefined, '방 설정 없음'],
    ['fun', '방 설정이 객체 아님'],
    [noMic, '마이크 없음'],
    [{ ...ROOM, mic: 'true' }, '마이크가 문자열'],
    [{ ...ROOM, mic: 1 }, '마이크가 숫자'],
    [noMode, '모드 없음'],
    [{ ...ROOM, mode: 'hard' }, '없는 모드'],
    [{ ...ROOM, mode: ['fun'] }, '배열 모드'],
    [{ ...ROOM, mode: 'toString' }, '프로토타입 이름'],
    [{ ...ROOM, title: 'ㄱ'.repeat(CFG.limits.title + 1) }, '제목 31자'],
    [{ ...ROOM, title: 'discord.gg/x' }, '제목에 링크'],
    [{ ...ROOM, title: '한 줄\n두 줄' }, '제목 줄바꿈'],
    [{ ...ROOM, title: 3 }, '제목이 숫자'],
    [{ ...ROOM, memo: 'ㄱ'.repeat(CFG.limits.memo + 1) }, '메모 101자'],
    [{ ...ROOM, memo: '여기로 https://evil.test' }, '메모에 링크'],
    [{ ...ROOM, memo: '윈도 줄바꿈\r\n' + 'x' }, '메모에 \\r'],
    [{ ...ROOM, memo: `탭${ctrl(9)}문자` }, '메모에 탭'],
    [{ ...ROOM, memo: ['메모'] }, '배열 메모'],
    [noPw, '비밀번호 없음'],
    [{ ...ROOM, password: 'abc' }, '비밀번호 3자'],
    [{ ...ROOM, password: 'a'.repeat(CFG.limits.passwordMax + 1) }, '비밀번호 21자'],
    [{ ...ROOM, password: '      ' }, '공백뿐인 비밀번호'],
    [{ ...ROOM, password: 12345 }, '숫자 비밀번호'],
    [{ ...ROOM, password: ['abcd'] }, '배열 비밀번호'],
  ]
  for (const [room, why] of cases) {
    const r = await api('POST', '/api/teams', { room, tactic: { preset: 'pnr' }, member: person('a') })
    assert.equal(r.status, 400, why)
    assert.equal(typeof r.body.error, 'string', why)
  }
})

dbTest('검증: 코드포인트 길이 · 공백 자르기 · 모르는 필드 버리기 · 비밀번호 경계값', async () => {
  const { api } = start()
  const e = (o = {}) => ({ nick: '보노', tier: '골드', char: 'bl', ...o })
  // 길이는 코드포인트로 센다 — 이모지 20개 닉네임(UTF-16 으로 40)은 통과
  const ok = await create(api, person('가'.repeat(32), [e({ nick: '😀'.repeat(20) })]), {}, { title: '😀'.repeat(30), memo: '😀'.repeat(100), password: '😀'.repeat(4) })
  assert.equal(ok.status, 201)
  assert.equal(ok.body.team.members[0].entries[0].nick, '😀'.repeat(20))
  assert.equal(ok.body.team.room.title, '😀'.repeat(30))
  assert.equal((await create(api, person('b'), {}, { password: 'a'.repeat(20) })).status, 201, '비밀번호 20자')
  assert.equal((await create(api, person('b'), {}, { password: '😀'.repeat(21) })).status, 400, '이모지 21자')

  const trimmed = await api('POST', '/api/teams', {
    room: { ...ROOM, extra: 'x', title: undefined, memo: null }, tactic: { preset: 'pnr' },
    member: { discord: '  bono  ', entries: [{ ...e({ nick: '  보노 ' }), extra: 'x' }], evil: 1 }, evil: 1,
  })
  assert.equal(trimmed.status, 201)
  assert.deepEqual(trimmed.body.team.room, { title: '', mic: true, mode: 'fun', memo: '' })
  assert.deepEqual(trimmed.body.team.members[0].entries, [{ nick: '보노', tier: '골드', char: 'bl' }])
  assert.equal(trimmed.body.team.members[0].discord, 'bono')
})

const boardToken = (o = {}) => ({
  key: 'o1', side: 'off', label: '볼 핸들러', playerId: 'bl', x: 0.12345, y: 0.4567, evil: '<script>',
  routes: [{ kind: 'move', pts: [[0.5, 0.66], [-0.2, 1.7]], color: 'red' }], ...o,
})

dbTest('전술판 보드: 허용 필드만 저장, 좌표 반올림·자르기', async () => {
  const { api } = start()
  const token = boardToken
  const r = await create(api, person('a'), { preset: 'pnr', board: { tokens: [token(), token({ key: 'd1', side: 'def', playerId: null, routes: [] })], extra: 1 }, name: '' })
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

test('검증: 전술판 보드 한도 초과 · 잘못된 모양은 400', async () => {
  const { api } = start({ db: HITS_ONLY })
  const token = boardToken
  const bad = async (board, why) => assert.equal((await create(api, person('a'), { board })).status, 400, why)
  await bad({ tokens: Array.from({ length: 7 }, () => token()) }, '토큰 7개')
  await bad({ tokens: [token({ key: 'x9' })] }, '잘못된 key')
  await bad({ tokens: [token({ key: ['o1'] })] }, '배열 key')
  await bad({ tokens: [token({ side: 'mid' })] }, '잘못된 side')
  await bad({ tokens: [token({ label: 'ㄱ'.repeat(21) })] }, '이름표 21자')
  await bad({ tokens: [token({ playerId: 'Bad_ID' })] }, '잘못된 playerId')
  await bad({ tokens: [token({ x: '0.5' })] }, '문자열 좌표')
  await bad({ tokens: [token({ y: null })] }, 'null 좌표')
  await bad({ tokens: [token({ routes: Array.from({ length: 9 }, () => ({ kind: 'move', pts: [[0, 0], [1, 1]] })) })] }, '동선 9개')
  await bad({ tokens: [token({ routes: [{ kind: 'dribble', pts: [[0, 0], [1, 1]] }] })] }, '없는 동선 종류')
  await bad({ tokens: [token({ routes: [{ kind: 'pass', pts: [[0, 0]] }] })] }, '점 1개')
  await bad({ tokens: [token({ routes: [{ kind: 'pass', pts: Array.from({ length: 81 }, () => [0, 0]) }] })] }, '점 81개')
  await bad({ tokens: [token({ routes: [{ kind: 'pass', pts: [[0, 0], [1, 1, 1]] }] })] }, '점 좌표 3개')
  await bad({ tokens: [token({ routes: undefined })] }, 'routes 없음')
  await bad({ tokens: 'x' }, 'tokens 가 배열 아님')
  await bad([], '보드가 배열')
})

dbTest('전술 이름 만들기: 보드면 이름 > 프리셋 이름 > 커스텀 전술, 보드 없으면 프리셋 이름만', async () => {
  const { api } = start()
  const name = async tactic => (await create(api, person('a'), tactic)).body.team.tactic
  const board = { tokens: [] }
  assert.deepEqual(await name({ preset: 'pnr' }), { preset: 'pnr', name: '픽 앤 롤', board: null })
  assert.deepEqual(await name({ preset: 'pnr', name: '무시됨' }), { preset: 'pnr', name: '픽 앤 롤', board: null })
  assert.deepEqual(await name({ preset: '', name: '무시됨' }), { preset: null, name: '', board: null })
  assert.deepEqual(await name({}), { preset: null, name: '', board: null })
  assert.deepEqual((await api('POST', '/api/teams', { room: ROOM, member: person('a') })).body.team.tactic, { preset: null, name: '', board: null }, '전술 생략')
  assert.equal((await name({ board, preset: 'pnr', name: '  우리 전술 ' })).name, '우리 전술')
  assert.equal((await name({ board, preset: 'zone' })).name, '2-1 지역방어')
  assert.equal((await name({ board, name: '' })).name, '커스텀 전술')

  const drawn = { tokens: [{ key: 'o1', side: 'off', label: '', playerId: null, x: 0.5, y: 0.5, routes: [] }] }
  const { id } = (await create(api, person('a'), { preset: 'pnr', board: drawn })).body.team
  const listed = (await api('GET', '/api/teams')).body.teams.find(x => x.id === id)   // 같은 ms 에 만든 팀끼리는 순서가 id 로 갈린다
  assert.deepEqual(Object.keys(listed), VIEW_KEYS)
  assert.deepEqual(listed.tactic, { preset: 'pnr', name: '픽 앤 롤' }, '목록에는 보드를 싣지 않는다')
  assert.ok(!('board' in listed.tactic))
  assert.deepEqual((await api('GET', `/api/teams/${id}`)).body.tactic.board, drawn, '팀 화면에는 그대로')
})

// ---------------------------------------------------------------- 관리: 방출 · 나가기 · 해제 · 연장 (토큰 또는 비밀번호)

dbTest('방출(팀장 토큰 · 비밀번호) · 나가기(본인 토큰) · 팀원 토큰은 남을 못 건드림 · 토큰 없음 401', async () => {
  const { api } = start()
  const { body: { team, member: lead } } = await create(api, person('lead'))
  const { body: { member: other } } = await create(api, person('other-lead'))
  const tm = teamApi(api, team.id)
  const a = (await tm.join('a')).body.member, b = (await tm.join('b')).body.member

  assert.equal((await tm.kick(a.id)).status, 401)
  assert.equal((await tm.kick(a.id, { headers: { authorization: 'Basic abc' } })).status, 401)
  assert.equal((await tm.kick(a.id, { password: '' })).status, 401, '빈 비밀번호 = 비밀번호 없음')
  assert.equal((await tm.kick(a.id, { token: b.token })).status, 403, '팀원이 다른 팀원을 내보낼 수 없다')
  assert.equal((await tm.kick(a.id, { token: other.token })).status, 403, '다른 팀 팀장 토큰')
  assert.equal((await tm.kick(a.id, { token: 'garbage' })).status, 403)
  assert.equal((await tm.kick(lead.id, { token: a.token })).status, 403, '팀원이 팀장을 내보낼 수 없다')
  assert.equal((await tm.disband({ token: a.token })).status, 403, '팀원은 해제 못 함')
  assert.equal((await tm.extend({ token: a.token })).status, 403, '팀원은 연장 못 함')
  assert.equal((await tm.get()).body.members.length, 3, '아무것도 바뀌지 않았다')

  const left = await tm.kick(a.id, { token: a.token })
  assert.equal(left.status, 200)
  assert.equal(left.body.ok, true)
  assert.deepEqual(left.body.team.members.map(m => m.discord), ['lead', 'b'])
  assert.equal((await tm.kick(a.id, { token: a.token })).status, 403, '나간 뒤 토큰은 무효')

  const kicked = await tm.kick(b.id, { token: lead.token })
  assert.equal(kicked.status, 200)
  assert.deepEqual(kicked.body.team.members.map(m => m.discord), ['lead'])

  const c = (await tm.join('c')).body.member
  const byPw = await tm.kick(c.id, { password: PW })
  assert.deepEqual([byPw.status, byPw.body.ok, byPw.body.team.members.map(m => m.discord)], [200, true, ['lead']], '비밀번호 = 팀장 권한')

  // 토큰만 보내는 DELETE 에 content-type: application/json 이 붙어 본문이 비어 있어도 된다
  const d = (await tm.join('d')).body.member
  const empty = await api('DELETE', `/api/teams/${team.id}/members/${d.id}`, '', { token: d.token })
  assert.equal(empty.status, 200)

  assert.equal((await tm.kick(999999, { token: lead.token })).status, 404)
  assert.equal((await tm.kick('abc', { token: lead.token })).status, 404)
})

dbTest('팀 해제: 팀장 토큰 · 비밀번호 → 삭제(GET 404 · 가입 404 · 목록에서 빠짐)', async () => {
  const { api } = start()
  const one = (await create(api, person('one'))).body
  const two = (await create(api, person('two'))).body
  const t1 = teamApi(api, one.team.id), t2 = teamApi(api, two.team.id)
  const member = (await t2.join('m')).body.member

  assert.deepEqual((await t1.disband({ token: one.member.token })).body, { ok: true })
  assert.deepEqual((await t2.disband({ password: PW })).body, { ok: true })
  for (const tm of [t1, t2]) {
    assert.deepEqual([(await tm.get()).status, (await tm.get()).body], [404, { error: '팀을 찾을 수 없어요' }])
    assert.equal((await tm.join('late')).status, 404)
    assert.equal((await tm.disband({ password: PW })).status, 404)
    assert.equal((await tm.extend({ password: PW })).status, 404)
  }
  assert.equal((await t2.kick(member.id, { token: member.token })).status, 404)
  const listed = (await api('GET', '/api/teams')).body.teams.map(x => x.id)
  assert.ok(!listed.includes(one.team.id) && !listed.includes(two.team.id))
  const rows = await (await rest(`/recruit_members?select=id&team_id=in.(${one.team.id},${two.team.id})`)).json()
  assert.deepEqual(rows, [], '팀원도 같이 지워진다(cascade)')
})

dbTest('팀장이 빠지면(본인 토큰 · 비밀번호로 방출) 팀이 해제된다', async () => {
  const { api } = start()
  const self = (await create(api, person('lead'))).body
  const ts = teamApi(api, self.team.id)
  await ts.join('a')
  const r = await ts.kick(self.member.id, { token: self.member.token })
  assert.deepEqual([r.status, r.body], [200, { ok: true, team: null }])
  assert.equal((await ts.get()).status, 404)
  assert.equal((await ts.join('b')).status, 404)

  const pw = (await create(api, person('lead2'))).body
  const tp = teamApi(api, pw.team.id)
  const r2 = await tp.kick(pw.member.id, { password: PW })
  assert.deepEqual([r2.status, r2.body], [200, { ok: true, team: null }])
  assert.equal((await tp.get()).status, 404)
})

dbTest('비밀번호: 틀리면 403, 한 IP 가 10분에 5번 틀리면 그 IP 만 429(다른 IP · 토큰은 된다) · 팀 전체 20번이면 429 · 해시로만 저장', async () => {
  let clock = futureBase()
  const { api } = start({ now: () => clock })
  const { body: { team, member: lead } } = await create(api, person('lead'), {}, { password: ' 앞뒤 공백 ' })
  const other = (await create(api, person('other'))).body.team
  const tm = teamApi(api, team.id)
  const bad = '192.0.2.66', leader = '192.0.2.77'

  assert.equal((await tm.extend({ password: '앞뒤 공백', ip: bad })).status, 403, '비밀번호는 자르지 않는다')
  for (let i = 0; i < 4; i++) {
    const r = await (i % 2 ? tm.disband({ password: `wrong${i}`, ip: bad }) : tm.kick(lead.id, { password: `wrong${i}`, ip: bad }))
    assert.deepEqual([r.status, r.body], [403, { error: '비밀번호가 맞지 않아요' }], `${i + 2}번째`)
  }
  const locked = await tm.extend({ password: ' 앞뒤 공백 ', ip: bad })
  assert.deepEqual([locked.status, locked.body], [429, { error: '비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요' }], '같은 IP 6번째는 맞아도 429')
  assert.equal((await tm.get()).status, 200, '팀은 그대로')
  assert.equal((await tm.extend({ password: ' 앞뒤 공백 ', ip: leader })).status, 200, '남이 틀려도 팀장(다른 IP)은 잠기지 않는다')
  assert.equal((await tm.extend({ token: lead.token, ip: bad })).status, 200, '토큰은 막지 않는다')
  assert.equal((await teamApi(api, other.id).extend({ password: PW, ip: bad })).status, 200, '다른 팀은 상관없다')
  // 막힌 IP 가 계속 보내도 팀 전체 횟수는 늘지 않는다 — 한 IP 가 21번 보내 팀장까지 잠그지 못한다
  for (let i = 0; i < 15; i++) assert.equal((await tm.disband({ password: `more${i}`, ip: bad })).status, 429)
  assert.equal((await tm.extend({ password: ' 앞뒤 공백 ', ip: leader })).status, 200, '한 IP 가 21번 보내도 다른 IP 의 팀장은 된다')

  clock += 10 * MIN
  assert.equal((await tm.extend({ password: ' 앞뒤 공백 ', ip: bad })).status, 200, '10분 지나면 풀린다')

  // IP 를 바꿔 가며 찍어도 팀 전체 20번에서 막힌다
  const spread = []
  for (let i = 0; i < 21; i++) spread.push((await tm.extend({ password: `spread${i}`, ip: `198.51.100.${i}` })).status)
  assert.deepEqual(spread, [...Array(20).fill(403), 429], '팀 전체 21번째는 429')
  assert.equal((await tm.extend({ password: ' 앞뒤 공백 ', ip: leader })).status, 429, '팀 전체가 잠기면 맞아도 429')
  assert.equal((await tm.extend({ token: lead.token })).status, 200, '그래도 토큰은 된다')
  clock += 10 * MIN

  const hashes = (await (await rest(`/recruit_teams?select=password_hash&id=in.(${team.id},${other.id})`)).json()).map(r => r.password_hash)
  for (const h of hashes) assert.match(h, /^scrypt\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/)
  const again = (await create(api, person('same-pw'))).body.team
  const [{ password_hash: h2 }] = await (await rest(`/recruit_teams?select=password_hash&id=eq.${again.id}`)).json()
  assert.ok(!hashes.includes(h2), '같은 비밀번호도 솔트가 달라 해시가 다르다')

  // 한 IP 가 동시에 몰아쳐도 확인되는 건 5번뿐 — 세는 게 scrypt 를 기다린 뒤라면 전부 '아직 0번'을 보고 통과한다
  const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => teamApi(api, again.id).extend({ password: `burst${i}`, ip: bad })))
  assert.deepEqual(burst.map(r => r.status).sort(), [...Array(5).fill(403), ...Array(7).fill(429)])
  assert.equal((await teamApi(api, again.id).extend({ password: PW, ip: bad })).status, 429, '몰아친 IP 는 맞아도 429')
})

dbTest('비밀번호: 워커 여럿 · IP 여럿이 동시에 찍어도 팀 전체 20번만 확인된다(DB 가 센다)', async () => {
  const clock = futureClock()
  // 요청마다 다른 핸들러 = 운영에서 요청이 서로 다른 워커(isolate)로 가는 경우. 메모리에 센다면 전부 통과한다
  const apps = Array.from({ length: 6 }, () => start({ now: clock }))
  const { body: { team, member: lead } } = await create(apps[0].api, person('lead'))
  const rs = await Promise.all(Array.from({ length: 30 }, (_, i) =>
    teamApi(apps[i % apps.length].api, team.id).extend({ password: `par${i}`, ip: `203.0.113.${i + 1}` })))
  assert.deepEqual(count(rs.map(r => r.status)), { 403: 20, 429: 10 })
  assert.equal((await teamApi(apps[1].api, team.id).extend({ password: PW, ip: '203.0.113.200' })).status, 429, '팀 전체가 잠겼다')
  assert.equal((await teamApi(apps[2].api, team.id).extend({ token: lead.token })).status, 200, '토큰은 된다')
  const [row] = await (await rest(`/recruit_hits?select=n&key=eq.${encodeURIComponent(`pwt ${team.id}`)}`)).json()
  assert.equal(row.n, 31)
})

dbTest('연장: 팀장 토큰 · 비밀번호 → 만료 = 지금 + 3시간(더하지 않는다) · 만료된 팀은 연장 못 함', async () => {
  let clock = futureBase()
  const { api } = start({ now: () => clock })
  const { body: { team, member: lead } } = await create(api, person('lead'))
  const tm = teamApi(api, team.id)
  assert.equal(team.expiresAt, clock + TTL)

  clock += HOUR
  const byToken = await tm.extend({ token: lead.token })
  assert.equal(byToken.status, 200)
  assert.deepEqual(Object.keys(byToken.body), ['team'])
  assert.equal(byToken.body.team.expiresAt, clock + TTL)
  assert.equal(byToken.body.team.createdAt, team.createdAt)

  clock += 30 * MIN
  const byPw = await tm.extend({ password: PW })
  assert.equal(byPw.body.team.expiresAt, clock + TTL)
  const twice = await tm.extend({ password: PW })
  assert.equal(twice.body.team.expiresAt, clock + TTL, '연달아 눌러도 최대 3시간')

  clock += TTL - 1
  assert.equal((await tm.get()).status, 200, '연장한 만큼 더 보인다')
  assert.equal((await api('GET', '/api/teams')).body.teams[0].expiresAt, clock + 1)
  clock += 1
  assert.equal((await tm.get()).status, 404, '만료 시각이 되면 없는 팀')
  assert.equal((await tm.extend({ token: lead.token })).status, 404)
})

// ---------------------------------------------------------------- 동시 가입 · Data API 권한

dbTest('동시 가입 10건 → 남은 자리(2)만큼만 201, 나머지 409 · 알림은 합류 하나 + 완료 하나', async () => {
  const { api, idle, hooks } = start()
  const { body: { team } } = await create(api, person('lead'))
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => teamApi(api, team.id).join(`racer${i}`)))
  assert.deepEqual(rs.map(r => r.status).sort(), [201, 201, 409, 409, 409, 409, 409, 409, 409, 409])
  assert.ok(rs.filter(r => r.status === 409).every(r => r.body.error === '이미 다 찬 팀이에요'), JSON.stringify(rs.map(r => r.body.error)))
  const got = (await api('GET', `/api/teams/${team.id}`)).body
  assert.deepEqual([got.status, got.members.length], ['full', 3])
  await idle()
  // 두 가입이 서로의 다시 읽기에 끼어도 "모집 완료" 가 두 번 가지 않는다(도착 순서는 바뀔 수 있다)
  assert.deepEqual(hooks().map(b => b.embeds[0].title).sort(), ['✅ 팀원 합류 · 픽 앤 롤 (2/3)', '🎉 모집 완료 · 픽 앤 롤', '🏀 팀원 모집 시작 · 픽 앤 롤'].sort())
})

dbTest('Data API 권한: anon · authenticated 키나 키 없이는 팀원모집 표 · RPC 를 못 쓴다(secret key 만 된다)', async () => {
  const compose = readFileSync(new URL('../compose.yaml', import.meta.url), 'utf8')
  assert.ok(compose.includes(`SUPABASE_SECRET_KEY: ${jwt('service_role')}`), 'compose.yaml 의 api SUPABASE_SECRET_KEY 는 LOCAL_JWT_SECRET 으로 서명한 service_role 키여야 한다')
  const post = body => ({ method: 'POST', body: JSON.stringify(body) })
  for (const [who, key] of [['anon', jwt('anon')], ['authenticated', jwt('authenticated')], ['키 없음', null]]) {
    for (const [path, o] of [
      ['/recruit_teams?select=id&limit=1', {}],
      ['/recruit_teams?select=password_hash&limit=1', {}],
      ['/recruit_teams?select=id&recruit_member_count=lt.3', {}],
      ['/recruit_members?select=token_hash&limit=1', {}],
      ['/recruit_hits?select=key&limit=1', {}],
      ['/recruit_teams', post({ id: 'AAAAAAAA', room: {}, tactic: {}, password_hash: 'x', created_at: 0, expires_at: 0 })],
      ['/recruit_hits', post({ key: 'x', n: 0, reset_at: 0 })],
      ['/recruit_teams?expires_at=lte.9999999999999', { method: 'DELETE' }],
      ['/recruit_hits?reset_at=lte.9999999999999', { method: 'DELETE' }],
      ['/rpc/recruit_hit', post({ p_key: 'x', p_now: 0, p_window: 1, p_add: -100 })],
      ['/rpc/recruit_create_team', post({
        p_id: 'AAAAAAAA', p_room: {}, p_tactic: {}, p_rooms: [], p_password_hash: 'x', p_discord: 'x', p_entries: [], p_token_hash: 'x', p_now: 0, p_expires_at: 0,
      })],
      ['/rpc/recruit_join_team', post({ p_team: 'AAAAAAAA', p_discord: 'x', p_entries: [], p_token_hash: 'x', p_now: 0, p_size: 3 })],
    ]) {
      const r = await rest(path, { key, ...o })
      assert.ok([401, 403].includes(r.status), `${who} ${o.method || 'GET'} ${path} → ${r.status} ${await r.text()}`)
    }
  }
  assert.equal((await rest('/recruit_hits?select=key&limit=1')).status, 200, 'secret key 는 된다')
  // 옛 recruit_create_team(p_voice …) 은 없어졌다 — 두 벌이 남으면 PostgREST 가 어느 쪽을 부를지 헷갈린다
  const old = await rest('/rpc/recruit_create_team', post({
    p_id: 'AAAAAAAA', p_room: {}, p_tactic: {}, p_voice: null, p_password_hash: 'x', p_discord: 'x', p_entries: [], p_token_hash: 'x', p_now: 0, p_expires_at: 0,
  }))
  assert.equal(old.status, 404, await old.text())
})

// ---------------------------------------------------------------- 목록 순서 · 만료 · 청소 · 404

dbTest('목록: 모집 중(오래된 순) 먼저 · 다 찬 팀은 뒤로 · 빠지면 다시 앞으로 · 만료된 팀은 안 보이고 방도 풀린다', async () => {
  let clock = futureBase()
  const { api } = start({ env: BOT, now: () => clock, channels: CHANNELS.filter(c => c.id !== '3') })
  const mk = async d => { clock += 1000; return (await create(api, person(d))).body }
  const a = await mk('a'), b = await mk('b'), c = await mk('c'), d = await mk('d')
  assert.deepEqual([a, b, c, d].map(x => x.team.voice?.id ?? null), ['11', '4', '2', null])
  const fill = async x => { const tm = teamApi(api, x.team.id); return [(await tm.join(`${x.team.id}-1`)).body.member, (await tm.join(`${x.team.id}-2`)).body.member] }
  const [a1] = await fill(a)
  await fill(c)
  const order = async () => (await api('GET', '/api/teams')).body.teams.map(x => [x.members[0].discord, x.status])

  assert.deepEqual(await order(), [['b', 'open'], ['d', 'open'], ['a', 'full'], ['c', 'full']])
  const e = await mk('e')
  assert.deepEqual(await order(), [['b', 'open'], ['d', 'open'], ['e', 'open'], ['a', 'full'], ['c', 'full']], '새 방은 모집 중 맨 아래')

  const out = await teamApi(api, a.team.id).kick(a1.id, { password: PW })
  assert.equal(out.body.team.status, 'open')
  assert.deepEqual(await order(), [['a', 'open'], ['b', 'open'], ['d', 'open'], ['e', 'open'], ['c', 'full']], '다 찬 팀에서 빠지면 만든 순서 자리로 돌아간다')

  clock = a.team.expiresAt   // 정확히 만료 시각 = 만료
  const ta = teamApi(api, a.team.id)
  assert.equal((await ta.get()).status, 404)
  assert.equal((await ta.join('late')).status, 404, '만료된 팀 가입은 404')
  assert.equal((await ta.kick(a.member.id, { token: a.member.token })).status, 404)
  assert.deepEqual(await order(), [['b', 'open'], ['d', 'open'], ['e', 'open'], ['c', 'full']])
  assert.equal((await create(api, person('next'))).body.team.voice.id, '11', '만료된 팀이 잡았던 끝 방')
})

dbTest('만료 청소: 팀을 만들 때 RPC 가 만료된 팀(팀원 cascade)과 창이 끝난 요청 수 기록을 지운다 · 만료 전 팀은 남는다', async () => {
  let clock = futureBase()
  const { api } = start({ now: () => clock })
  const ip = `198.18.${appNo % 250}.1`
  const gone = (await create(api, person('gone'), {}, {}, { ip })).body.team
  await teamApi(api, gone.id).join('m')
  clock += 1
  const stay = (await create(api, person('stay'))).body.team
  const rows = async () => (await (await rest(`/recruit_teams?select=id&id=in.(${gone.id},${stay.id})&order=created_at`)).json()).map(r => r.id)
  const hitRow = async () => (await rest(`/recruit_hits?select=n&key=eq.${encodeURIComponent(`w ${ip}`)}`)).json()

  clock = gone.expiresAt
  assert.equal((await teamApi(api, gone.id).get()).status, 404, '지우기 전에도 안 보인다')
  assert.deepEqual(await rows(), [gone.id, stay.id], '읽기만으로는 지우지 않는다')
  assert.equal((await hitRow()).length, 1)

  const listed = (await api('GET', '/api/teams')).body.teams.map(x => x.id)
  assert.deepEqual(listed, [stay.id])

  await create(api, person('trigger'))
  assert.deepEqual(await rows(), [stay.id], '만료된 팀만 지워졌다')
  assert.deepEqual(await (await rest(`/recruit_members?select=id&team_id=eq.${gone.id}`)).json(), [], '팀원도 cascade')
  assert.deepEqual(await hitRow(), [], '창이 끝난 요청 수 기록도 지워졌다')
  assert.equal((await teamApi(api, stay.id).get()).status, 200)
})

const all404 = async (api, list) => {
  for (const [m, p, body] of list) {
    const r = await api(m, p, body, { token: 'x' })
    assert.equal(r.status, 404, `${m} ${p}`)
    assert.equal(typeof r.body.error, 'string')
  }
}

test('404: 잘못된 id · 없는 주소', async () => {
  const { api } = start({ db: HITS_ONLY })
  await all404(api, [
    ['GET', '/api/teams/short'], ['GET', '/api/teams/AAAAAAAA%2F'], ['GET', '/api/nope'], ['GET', '/api/teams/AAAAAAAA/extra'], ['PUT', '/api/teams'],
    ['DELETE', '/api/teams'], ['GET', '/api/teams/AAAAAAAA/members'], ['GET', '/api/teams/AAAAAAAA/extend'], ['DELETE', '/api/teams/AAAAAAAA/extend'],
    ['POST', '/api/teams/AAAAAAAA/extend/1'], ['POST', '/api/teams/AAAAAAAA/members/1'], ['POST', '/api/teams/bad/extend'], ['DELETE', '/api/teams/bad/members/1'],
    ['GET', '/'], ['GET', '/recruit/api/health'], ['GET', '//api/health'],
  ])
})

dbTest('404: 없는 팀', async () => {
  const { api } = start()
  await all404(api, [
    ['GET', '/api/teams/AAAAAAAA'], ['POST', '/api/teams/AAAAAAAA/members', person('a')], ['DELETE', '/api/teams/AAAAAAAA'],
    ['POST', '/api/teams/AAAAAAAA/extend'], ['DELETE', '/api/teams/AAAAAAAA/members/1', { password: PW }],
  ])
})

// ---------------------------------------------------------------- HTTP 가장자리

test('CORS: 목록에 있는 Origin 만 그대로 돌려준다(에러 포함) · preflight 204 · 없는 Origin 은 허용 헤더 없음 · CORS_ORIGIN 없으면 헤더 없음', async () => {
  const site = 'https://nba-kor.github.io', local = 'http://localhost:8000', evil = 'https://evil.test'
  const on = start({ env: { CORS_ORIGIN: ` ${site} , ${local}` }, db: HITS_ONLY })
  const off = start({ db: HITS_ONLY })
  const call = (app, method, path, origin, headers = {}) => app.handler(new Request(`http://api.test${path}`, { method, headers: { ...(origin && { origin }), ...headers } }))

  for (const origin of [site, local]) {
    const pre = await call(on, 'OPTIONS', '/api/teams/AAAAAAAA/members/1', origin, { 'access-control-request-method': 'DELETE', 'access-control-request-headers': 'authorization, content-type' })
    assert.equal(pre.status, 204)
    assert.equal(pre.headers.get('access-control-allow-origin'), origin)
    assert.equal(pre.headers.get('access-control-allow-methods'), 'GET, POST, DELETE, OPTIONS')
    assert.equal(pre.headers.get('access-control-allow-headers'), 'authorization, content-type')
    assert.equal(pre.headers.get('access-control-max-age'), '600')
    assert.equal(pre.headers.get('vary'), 'Origin')
    assert.equal(await pre.text(), '')
    const ok = await call(on, 'GET', '/api/health', origin)
    assert.deepEqual([ok.status, ok.headers.get('access-control-allow-origin'), ok.headers.get('vary')], [200, origin, 'Origin'])
    const err = await call(on, 'GET', '/api/teams/AAAA', origin)
    assert.deepEqual([err.status, err.headers.get('access-control-allow-origin')], [404, origin], '에러 응답에도')
  }

  const pre = await call(on, 'OPTIONS', '/api/teams', evil, { 'access-control-request-method': 'POST' })
  assert.equal(pre.status, 204)
  for (const h of ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers']) assert.equal(pre.headers.get(h), null, h)
  const denied = await call(on, 'GET', '/api/health', evil)
  assert.deepEqual([denied.status, denied.headers.get('access-control-allow-origin'), denied.headers.get('vary')], [200, null, 'Origin'])
  assert.equal((await call(on, 'GET', '/api/health', null)).headers.get('access-control-allow-origin'), null, 'Origin 없음(같은 도메인 · curl)')
  assert.equal((await call(on, 'GET', '/api/health', `${site}.evil.test`)).headers.get('access-control-allow-origin'), null, '앞부분만 같은 Origin')

  const offPre = await call(off, 'OPTIONS', '/api/teams', site)
  assert.equal(offPre.status, 204)
  assert.equal(offPre.headers.get('access-control-allow-origin'), null)
  assert.equal((await call(off, 'GET', '/api/health', site)).headers.get('access-control-allow-origin'), null)
  assert.equal((await call(off, 'GET', '/api/health', site)).headers.get('vary'), null)
})

test('413: 32KB 넘는 본문 (content-length · 스트림 둘 다, 관리 요청 포함)', async () => {
  const { api, handler } = start({ db: HITS_ONLY })
  const big = JSON.stringify({ room: ROOM, member: person('a'), pad: 'x'.repeat(33 * 1024) })
  const r = await api('POST', '/api/teams', big)
  assert.equal(r.status, 413)
  assert.equal(typeof r.body.error, 'string')
  assert.equal((await api('DELETE', '/api/teams/AAAAAAAA', JSON.stringify({ password: 'x'.repeat(33 * 1024) }))).status, 413)
  assert.equal((await api('POST', '/api/teams', '{}', { headers: { 'content-length': String(40 * 1024) } })).status, 413, 'content-length 만 봐도 거절')

  let pulled = 0
  const chunk = new TextEncoder().encode('x'.repeat(8 * 1024))
  const endless = await handler(new Request('http://api.test/api/teams', {
    method: 'POST', duplex: 'half', headers: { 'content-type': 'application/json', 'x-test-ip': '192.0.2.1' },
    body: new ReadableStream({ pull(c) { pulled++; c.enqueue(chunk) } }),   // 끝나지 않는 스트림 — 다 읽으려 들면 테스트가 멈춘다
  }))
  assert.equal(endless.status, 413)
  assert.ok(pulled <= 8, `넘친 뒤로는 더 읽지 않는다(${pulled}번 읽음)`)
  assert.equal((await api('GET', '/api/health')).status, 200)
})

dbTest('요청 수 제한: IP 당 POST·DELETE(연장 포함) 30번 / 10분(DB 가 센다), GET 제외 · IPv6 는 /64 · IP 헤더 없음은 한 통', async () => {
  let clock = futureBase()
  const { api } = start({ now: () => clock })
  const ip = `100.64.${appNo % 250}.1`
  for (let i = 0; i < 30; i++) assert.equal((await api('POST', '/api/teams', {}, { ip })).status, 400)
  const r = await api('POST', '/api/teams', {}, { ip })
  assert.deepEqual([r.status, r.body], [429, { error: '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요' }])
  assert.equal((await api('DELETE', '/api/teams/AAAAAAAA', undefined, { ip, token: 'x' })).status, 429)
  assert.equal((await api('POST', '/api/teams/AAAAAAAA/extend', { password: PW }, { ip })).status, 429)
  assert.equal((await api('GET', '/api/teams', undefined, { ip })).status, 200, 'GET 은 세지 않는다')
  assert.equal((await api('POST', '/api/teams', {}, { ip: `${ip}9` })).status, 400, '다른 IP')
  // text/plain · 폼 POST 는 다른 사이트가 preflight 없이 보낼 수 있다 — 세지 않아서 방문자의 한도를 태우지 못한다
  const victim = `100.64.${appNo % 250}.2`
  for (let i = 0; i < 31; i++) {
    const type = i % 2 ? 'text/plain' : 'application/x-www-form-urlencoded'
    assert.equal((await api('POST', '/api/teams', 'x', { ip: victim, headers: { 'content-type': type } })).status, 415)
  }
  assert.equal((await api('POST', '/api/teams/AAAAAAAA/extend', 'x', { ip: victim, headers: { 'content-type': 'text/plain' } })).status, 404, '토큰 · 비밀번호 없는 관리 요청(없는 팀)')
  assert.equal((await api('POST', '/api/teams', {}, { ip: victim })).status, 400, 'JSON 이 아닌 요청은 세지 않았다')
  // IPv6 는 한 /64 안에서 주소를 바꿔 가며 보내도 한 곳으로 센다
  for (let i = 1; i <= 30; i++) assert.equal((await api('POST', '/api/teams', {}, { ip: `2001:db8:${appNo}:2::${i.toString(16)}` })).status, 400)
  assert.equal((await api('POST', '/api/teams', {}, { ip: `2001:0db8:${appNo.toString().padStart(4, '0')}:0002:ffff:0:0:1` })).status, 429, '같은 /64')
  assert.equal((await api('POST', '/api/teams', {}, { ip: `2001:db8:${appNo}:3::1` })).status, 400, '다른 /64')
  // 헤더가 없으면 '-' 한 통 — 제한이 풀리지 않는다
  for (let i = 0; i < 30; i++) assert.equal((await api('POST', '/api/teams', {}, { ip: '' })).status, 400)
  assert.equal((await api('POST', '/api/teams', {}, { ip: '' })).status, 429)
  clock += 10 * MIN
  assert.equal((await api('POST', '/api/teams', {}, { ip })).status, 400, '10분 지나면 풀린다')
  assert.equal((await api('POST', '/api/teams', {}, { ip: '' })).status, 400)
})

dbTest('요청 수 제한: 워커 여럿이 같은 IP 요청 40개를 동시에 받아도 정확히 30개만 통과', async () => {
  const clock = futureClock()
  const apps = Array.from({ length: 5 }, () => start({ now: clock }))
  const ip = `100.65.${appNo % 250}.1`
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => apps[i % apps.length].api('POST', '/api/teams', {}, { ip })))
  assert.deepEqual(count(rs.map(r => r.status)), { 400: 30, 429: 10 })
})

// ---------------------------------------------------------------- Data API 오류 (DB 없이 — 끊긴 연결 · 가짜 PostgREST)

const DB_DOWN = '모집 서버 DB 에 연결할 수 없어요'

test('Data API 에 닿지 않으면 503(쓰기는 요청 수 제한부터 DB 를 쓴다) · 키는 로그에 없다', async () => {
  const dlogs = []
  // Deno 는 fetch 오류 문구에 URL(토큰 해시 쿼리 포함)을 싣는다
  const down = u => { throw new TypeError(`error sending request for url (${u}): client error (Connect)`) }
  const { api } = start({ db: down, env: { SUPABASE_SECRET_KEY: 'sb_secret_leak' }, log: (...a) => dlogs.push(a.map(String).join(' ')) })
  for (const [m, p, body, token] of [
    ['GET', '/api/teams'], ['GET', '/api/teams/AAAAAAAA'], ['POST', '/api/teams', { room: ROOM, member: person('a') }], ['POST', '/api/teams/AAAAAAAA/members', person('a')],
    ['POST', '/api/teams/AAAAAAAA/extend', { password: PW }], ['DELETE', '/api/teams/AAAAAAAA'], ['POST', '/api/teams', {}],
    ['DELETE', '/api/teams/AAAAAAAA/members/1', undefined, 'tok'],
  ]) {
    const r = await api(m, p, body, { token })
    assert.deepEqual([r.status, r.body], [503, { error: DB_DOWN }], `${m} ${p}`)
  }
  assert.equal((await api('GET', '/api/health')).status, 200, 'health 는 DB 를 안 쓴다')
  assert.ok(dlogs.length && !dlogs.join('\n').includes('sb_secret_leak'), dlogs.join('\n'))
  assert.ok(dlogs.every(l => l.includes('(<url>)') && !l.includes('db.test')), dlogs.join('\n'))
})

test('Data API 오류 → HTTP: PT404 · PT409(full) · 23505 는 사용자 문구, 5xx · 프록시 오류는 503, 그 밖은 500 · 요청 모양 · secret key 고르기', async () => {
  const row = {
    id: 'AAAAAAAA', room: { title: '', mic: true, mode: 'fun', memo: '' }, tactic: { preset: null, name: '', board: null }, voice: null,
    password_hash: 'scrypt$x$y', created_at: 0, expires_at: TTL,
    members: [
      { id: 1, discord: 'lead', entries: [{ nick: 'lead', tier: '골드', char: 'bl' }], leader: true, joined_at: 0 },
      { id: 7, discord: 'a', entries: [{ nick: 'a', tier: '골드', char: 'bl' }], leader: false, joined_at: 0 },
    ],
  }
  const seen = []
  let rpc = [200, '7']
  const db = (u, init) => {
    seen.push({ method: init.method, path: u.pathname + u.search, headers: init.headers, body: init.body && JSON.parse(init.body) })
    if (u.pathname === '/rest/v1/rpc/recruit_hit') return [200, '1']
    if (u.pathname === '/rest/v1/rpc/recruit_create_team') return [200, JSON.stringify({ member: 1, voice: { id: '11', name: '음성 4' } })]
    return u.pathname.startsWith('/rest/v1/rpc/') ? rpc : init.method === 'DELETE' ? [204, ''] : [200, JSON.stringify([row])]
  }
  const elogs = []
  const keys = JSON.stringify({ default: 'sb_secret_from_keys', other: 'sb_secret_other' })
  const { api } = start({
    db, env: { ...BOT, DISCORD_GUILD_ID: 'g-shape', SUPABASE_SECRET_KEYS: keys, SUPABASE_SECRET_KEY: 'sb_secret_fallback' }, now: () => 0,
    log: (...a) => elogs.push(a.map(String).join(' ')),
  })
  const join = () => api('POST', '/api/teams/AAAAAAAA/members', person('a'), { ip: '192.0.2.9' })

  const ok = await join()
  assert.deepEqual([ok.status, ok.body.member.id, ok.body.team.status], [201, 7, 'open'])
  assert.ok(!ok.text.includes('scrypt') && !ok.text.includes('password'), '저장된 해시는 팀 뷰에 없다')
  const hitCall = seen.find(s => s.path === '/rest/v1/rpc/recruit_hit')
  assert.deepEqual(hitCall.body, { p_key: 'w 192.0.2.9', p_now: 0, p_window: 600_000, p_add: 1 })
  const call = seen.find(s => s.path === '/rest/v1/rpc/recruit_join_team')
  assert.equal(call.headers.apikey, 'sb_secret_from_keys', 'SUPABASE_SECRET_KEYS 의 default 가 먼저')
  assert.equal(call.headers.authorization, undefined, 'secret key 는 Authorization 에 싣지 않는다')
  assert.deepEqual([call.headers['content-type'], call.headers.accept], ['application/json', 'application/json'])
  assert.ok(seen.every(s => s.path.startsWith('/rest/v1/recruit_') || s.path.startsWith('/rest/v1/rpc/')), seen.map(s => s.path).join('\n'))

  // 팀 만들기: 디스코드 후보를 끝 방부터 p_rooms 로 넘기고, 고르기는 RPC 에 맡긴다
  seen.length = 0
  const made = await create(api, person('lead'))
  assert.equal(made.status, 201)
  const cr = seen.find(s => s.path === '/rest/v1/rpc/recruit_create_team').body
  assert.deepEqual(Object.keys(cr).sort(), ['p_discord', 'p_entries', 'p_expires_at', 'p_id', 'p_now', 'p_password_hash', 'p_room', 'p_rooms', 'p_tactic', 'p_token_hash'])
  assert.deepEqual(cr.p_rooms, [{ id: '11', name: '음성 4' }, { id: '4', name: '음성 3' }, { id: '3', name: '음성 2' }, { id: '2', name: '음성 1' }])
  assert.equal(cr.p_expires_at, TTL)
  assert.match(cr.p_password_hash, /^scrypt\$/)
  assert.ok(!JSON.stringify(cr).includes(PW), '비밀번호 원문은 DB 로 가지 않는다')

  // SUPABASE_SECRET_KEYS 가 없거나 깨졌으면 SUPABASE_SECRET_KEY
  for (const [SUPABASE_SECRET_KEYS, want] of [['', 'sb_secret_fallback'], ['{not json', 'sb_secret_fallback'], ['{}', 'sb_secret_fallback'], ['null', 'sb_secret_fallback']]) {
    const s2 = []
    const app = start({ db: (u, init) => (s2.push(init.headers.apikey), [200, '1']), env: { SUPABASE_SECRET_KEYS, SUPABASE_SECRET_KEY: 'sb_secret_fallback' } })
    await app.api('POST', '/api/teams', {})
    assert.deepEqual(s2, [want], JSON.stringify(SUPABASE_SECRET_KEYS))
  }

  const pg = (code, message) => JSON.stringify({ code, details: null, hint: null, message })
  for (const [reply, status, error] of [
    [[404, pg('PT404', 'not_found')], 404, '팀을 찾을 수 없어요'],
    [[409, pg('PT409', 'full')], 409, '이미 다 찬 팀이에요'],
    [[409, pg('23505', 'duplicate key value violates unique constraint "recruit_members_team_discord"')], 409, '이미 이 팀에 있는 디스코드 닉네임이에요'],
    [[500, pg('55P03', 'canceling statement due to lock timeout')], 503, DB_DOWN],
    [[502, '<html>502 Bad Gateway</html>'], 503, DB_DOWN],
    [[409, pg('PT409', 'closed')], 500, '서버 오류가 났어요'],
    [[409, pg('23505', 'duplicate key value violates unique constraint "recruit_teams_pkey"')], 500, '서버 오류가 났어요'],
    [[401, pg('PGRST301', 'No suitable key or wrong key type')], 500, '서버 오류가 났어요'],
  ]) {
    rpc = reply
    const r = await join()
    assert.deepEqual([r.status, r.body], [status, { error }], reply.join(' '))
  }
  assert.equal(elogs.filter(l => l.startsWith('API 오류')).length, 3, '500 은 로그에 남긴다')
  assert.ok(!elogs.join('\n').includes('sb_secret_'), '키는 로그에 남기지 않는다')
})

test('응답 어디에도 비밀번호 · 해시 · 토큰 해시가 없다', () => {
  const all = responses.join('\n')
  for (const secret of [PW, ' 앞뒤 공백 ', 'scrypt', 'password', 'token_hash']) assert.ok(!all.includes(secret), secret)
  assert.ok(responses.length > (noDb ? 50 : 300), responses.length)
})

test('서버 오류(500)는 한 번도 나지 않았다', () => {
  assert.deepEqual(logs.filter(l => l.startsWith('API 오류')), [])
})
