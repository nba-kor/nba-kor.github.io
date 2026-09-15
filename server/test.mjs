// 팀원모집 API 테스트
//   docker compose run --rm api node --test server/test.mjs   # 전부 — compose 의 로컬 Supabase(db + rest)를 쓴다
//   node --test server/test.mjs                               # DB 없이 되는 것만(검증 · 알림 · 음성 상태 · 게이트웨이 · HTTP 가장자리)
// 서버를 포트 0 으로 띄우고, 가짜 웹훅 서버 · 손으로 먹인 음성채널 상태를 쓴다. DB 는 비우지 않는다 — 대신 앱마다
// 먼 미래의 서로 다른 시계(now)를 줘서, 목록 · 음성채널 예약이 그 테스트가 만든 팀만 보게 한다.

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createApp } from './index.mjs'
import { connectGateway, createNotifier, createVoiceState } from './discord.mjs'

const data = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)))
const CFG = data('recruit.json')
const TTL = CFG.ttlHours * 3_600_000
const UPCOMING = data('upcoming.json').players[0].id
const PLAYERS = new Map(data('players.json').players.map(p => [p.id, p]))
const GUILD = '100'
const SITE = 'https://site.test'
const HOUR = 3_600_000, MIN = 60_000
const listen = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)))
const sha256 = s => createHash('sha256').update(s).digest('hex')
const ctrl = n => String.fromCharCode(n)

// ---------------------------------------------------------------- 로컬 Supabase

const { SUPABASE_URL: SUPA, SUPABASE_SECRET_KEY: KEY } = process.env
// compose.yaml 의 PGRST_JWT_SECRET — 로컬 전용 값이라 여기 적어도 된다. anon · authenticated 키를 만들어 권한을 확인한다
const LOCAL_JWT_SECRET = 'nba-kor-local-only-postgrest-jwt-secret-0914'
const jwt = role => {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role })}`
  return `${head}.${createHmac('sha256', LOCAL_JWT_SECRET).update(head).digest('base64url')}`
}
const rest = (path, { key = KEY, ...o } = {}) =>
  fetch(`${SUPA}/rest/v1${path}`, { ...o, headers: { ...(key && { apikey: key }), 'content-type': 'application/json', ...o.headers } })

let noDb = false, clockBase = 0
if (!SUPA || !KEY) noDb = 'SUPABASE_URL · SUPABASE_SECRET_KEY 가 없어 DB 테스트는 건너뜁니다 — docker compose run --rm api node --test server/test.mjs'
else if (!['web', 'rest', 'localhost', '127.0.0.1'].includes(URL.parse(SUPA)?.hostname)) noDb = `SUPABASE_URL(${SUPA}) 이 로컬이 아니라 DB 테스트는 건너뜁니다 — 운영 DB 에는 테스트를 돌리지 않는다`
else {
  try {
    const r = await rest('/recruit_teams?select=created_at&order=created_at.desc&limit=1', { signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
    const [last] = await r.json()
    // 2100년 이후, 그리고 지난 실행이 남긴 팀보다 뒤에서 시작한다 → 다시 돌려도 창(TTL)이 겹치지 않는다
    clockBase = Math.max(4_102_444_800_000, (last?.created_at ?? 0) + 1e9)
  } catch (e) { noDb = `Data API(${SUPA}) 에 연결할 수 없어 DB 테스트는 건너뜁니다: ${e.message}` }
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

// 가짜 웹훅: 받은 요청을 경로별로 모은다. reply 로 응답 상태를 바꿀 수 있다.
const hooks = []
let reply = () => [204, '']
const hookServer = createServer((req, res) => {
  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    hooks.push({ url: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
    const [code, body] = reply(req)
    res.writeHead(code, { 'content-type': 'application/json' }).end(body)
  })
})
let hookPort
before(async () => { hookPort = await listen(hookServer) })
after(() => hookServer.close())
const hooksOf = path => hooks.filter(h => h.url.startsWith(path)).map(h => h.body)

// 카테고리 1 안: 2(0) 3(1, 사람 있음) 4(2) 11(2) · 숨김 5 · AFK 9 · 다른 카테고리 7 · 채팅 6
const guildCreate = () => ({
  id: GUILD, afk_channel_id: '9',
  channels: [
    { id: '1', type: 4, name: '음성', position: 0 },
    { id: '2', type: 2, name: '음성 1', parent_id: '1', position: 0 },
    { id: '3', type: 2, name: '음성 2', parent_id: '1', position: 1 },
    { id: '4', type: 2, name: '음성 3', parent_id: '1', position: 2 },
    { id: '11', type: 2, name: '음성 4', parent_id: '1', position: 2 },   // 같은 position 이면 id 큰 쪽(문자열 비교면 '4' 가 앞선다)
    { id: '5', type: 2, name: '___hidden___', parent_id: '1', position: 9, flags: 1 << 17 },
    { id: '9', type: 2, name: 'AFK', parent_id: '1', position: 10 },
    { id: '7', type: 2, name: '다른 방', parent_id: '8', position: 20 },
    { id: '6', type: 0, name: '채팅', parent_id: '1', position: 30 },
  ],
  voice_states: [{ user_id: 'u1', channel_id: '3' }],
})
const readyVoice = (categoryId = '1') => {
  const v = createVoiceState({ guildId: GUILD, categoryId })
  v.apply('GUILD_CREATE', guildCreate())
  return v
}
const ids = v => v.emptyChannels().map(c => c.id)

let appNo = 0
/** 앱 하나 = 시계 하나 · 웹훅 경로 하나. 요청마다 X-Forwarded-For 를 바꿔 요청 수 제한을 피한다. */
async function start({ env = {}, voice = null, now = futureClock(), log: logTo = log } = {}) {
  const n = ++appNo, hook = `/hook/${n}`
  const app = createApp({
    env: {
      SUPABASE_URL: SUPA, SUPABASE_SECRET_KEY: KEY, SITE_URL: SITE + '/', TRUST_PROXY: '1', DISCORD_GUILD_ID: GUILD,
      DISCORD_WEBHOOK_URL: `http://127.0.0.1:${hookPort}${hook}`, ...env,
    },
    voice, now, log: logTo,
  })
  const base = `http://127.0.0.1:${await listen(app.server)}`
  let ip = 0
  const api = async (method, path, body, { token, ip: from, headers } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'x-forwarded-for': from || `10.${n}.0.${++ip}`,
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    })
    const text = await res.text()
    responses.push(text)
    return { status: res.status, headers: res.headers, text, body: text ? JSON.parse(text) : null }
  }
  const stop = () => new Promise(r => app.server.close(r)).then(() => app.close())
  return { app, api, base, hook, stop }
}

const PW = 'pass word!'   // 공백 · 기호도 비밀번호 — 자르지 않는다
const ROOM = { title: '', mic: true, mode: 'fun', memo: '', password: PW }
const person = (discord, entries = [{ nick: discord, tier: '골드', char: 'bl' }]) => ({ discord, entries })
const create = (api, member, tactic = { preset: 'pnr' }, room = {}) => api('POST', '/api/teams', { room: { ...ROOM, ...room }, tactic, member })
const VIEW_KEYS = ['id', 'room', 'tactic', 'voice', 'status', 'size', 'createdAt', 'expiresAt', 'members']

/** 팀 하나 + 팀 관리 요청들. 관리는 토큰(Bearer) 또는 본문 비밀번호 */
const teamApi = (api, id) => ({
  join: d => api('POST', `/api/teams/${id}/members`, typeof d === 'string' ? person(d) : d),
  get: () => api('GET', `/api/teams/${id}`),
  kick: (memberId, auth = {}) => api('DELETE', `/api/teams/${id}/members/${memberId}`, auth.password === undefined ? undefined : { password: auth.password }, auth),
  disband: (auth = {}) => api('DELETE', `/api/teams/${id}`, auth.password === undefined ? undefined : { password: auth.password }, auth),
  extend: (auth = {}) => api('POST', `/api/teams/${id}/extend`, auth.password === undefined ? undefined : { password: auth.password }, auth),
})

// ---------------------------------------------------------------- 음성채널 리듀서

test('음성 상태: GUILD_CREATE 전에는 ready 아님, 남의 길드·장애 길드는 무시', () => {
  const v = createVoiceState({ guildId: GUILD, categoryId: '1' })
  assert.equal(v.ready, false)
  assert.deepEqual(v.emptyChannels(), [])
  v.apply('GUILD_CREATE', { ...guildCreate(), id: '999' })
  v.apply('GUILD_CREATE', { id: GUILD, unavailable: true })
  assert.equal(v.ready, false)
  v.apply('GUILD_CREATE', guildCreate())
  assert.equal(v.ready, true)
})

test('음성 상태: 빈 방 끝 방부터, AFK·숨김·다른 카테고리·텍스트·사람 있는 방 제외', () => {
  const v = readyVoice()
  assert.deepEqual(ids(v), ['11', '4', '2'])
  assert.deepEqual(v.emptyChannels()[0], { id: '11', name: '음성 4', position: 2, parent: '1' })
  assert.deepEqual(ids(readyVoice('')), ['7', '11', '4', '2'])   // 카테고리 미지정 = 전체
})

test('음성 상태: VOICE_STATE_UPDATE 입장·퇴장·이동', () => {
  const v = readyVoice()
  v.apply('VOICE_STATE_UPDATE', { guild_id: GUILD, user_id: 'u2', channel_id: '11' })
  assert.deepEqual(ids(v), ['4', '2'])
  v.apply('VOICE_STATE_UPDATE', { guild_id: '999', user_id: 'u3', channel_id: '4' })   // 남의 길드
  assert.deepEqual(ids(v), ['4', '2'])
  v.apply('VOICE_STATE_UPDATE', { guild_id: GUILD, user_id: 'u2', channel_id: '2' })   // 이동
  assert.deepEqual(ids(v), ['11', '4'])
  v.apply('VOICE_STATE_UPDATE', { guild_id: GUILD, user_id: 'u2', channel_id: null })  // 퇴장
  v.apply('VOICE_STATE_UPDATE', { guild_id: GUILD, user_id: 'u1', channel_id: null })
  assert.deepEqual(ids(v), ['11', '4', '3', '2'])
})

test('음성 상태: CHANNEL_CREATE/UPDATE/DELETE, 숨김 전환, GUILD_DELETE', () => {
  const v = readyVoice()
  v.apply('VOICE_STATE_UPDATE', { guild_id: GUILD, user_id: 'u2', channel_id: '4' })
  v.apply('CHANNEL_DELETE', { id: '4', guild_id: GUILD, type: 2 })
  assert.deepEqual(ids(v), ['11', '2'])
  v.apply('CHANNEL_CREATE', { id: '4', guild_id: GUILD, type: 2, name: '새 방', parent_id: '1', position: 5 })
  assert.deepEqual(ids(v), ['4', '11', '2'], '지워진 방에 있던 접속 기록도 같이 지운다')
  v.apply('CHANNEL_CREATE', { id: '12', guild_id: '999', type: 2, parent_id: '1', position: 50 })
  v.apply('CHANNEL_UPDATE', { id: '11', guild_id: GUILD, type: 2, name: '___hidden___', parent_id: '1', position: 2, flags: 1 << 17 })
  assert.deepEqual(ids(v), ['4', '2'])
  v.apply('CHANNEL_UPDATE', { id: '11', guild_id: GUILD, type: 2, name: '음성 4', parent_id: '1', position: 2, flags: 0 })
  v.apply('CHANNEL_UPDATE', { id: '2', type: 2, name: '음성 1', parent_id: '8', position: 0 })   // guild_id 없음 + 아는 채널 → 반영
  assert.deepEqual(ids(v), ['4', '11'])
  v.apply('GUILD_DELETE', { id: GUILD, unavailable: true })
  assert.equal(v.ready, false)
  assert.deepEqual(v.emptyChannels(), [])
})

// ---------------------------------------------------------------- 팀 만들기 · 음성채널 배정 · 알림

dbTest('팀 만들기: 끝 빈 방 배정, 만료 전인 팀이 잡은 방은 건너뜀, 해제하면 풀림 · 팀 뷰 모양', async t => {
  const voice = readyVoice()
  const { api, stop } = await start({ voice })
  t.after(stop)

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

  const b = (await create(api, person('lead-b'))).body, c = (await create(api, person('lead-c'))).body
  assert.deepEqual([b.team.voice.id, c.team.voice.id], ['4', '2'])
  assert.equal((await create(api, person('lead-d'))).body.team.voice, null, '빈 방이 없으면 voice 없이 만든다')

  voice.apply('VOICE_STATE_UPDATE', { guild_id: GUILD, user_id: 'u1', channel_id: null })
  assert.equal((await create(api, person('lead-e'))).body.team.voice.id, '3')

  const got = await api('GET', `/api/teams/${team.id}`)
  assert.deepEqual(got.body, team)
  const off = await teamApi(api, team.id).disband({ token: a.body.member.token })
  assert.deepEqual([off.status, off.body], [200, { ok: true }])
  assert.equal((await create(api, person('lead-f'))).body.team.voice.id, '11', '해제한 팀의 방은 다시 배정된다')

  // 동시에 만들어도 같은 방을 두 팀에 주지 않는다(방 고르기는 줄 세운다) — 빈 방 4 · 2 를 세 팀이 다툰다
  await teamApi(api, b.team.id).disband({ password: PW })
  await teamApi(api, c.team.id).disband({ token: c.member.token })
  const rs = await Promise.all(['p1', 'p2', 'p3'].map(d => create(api, person(d))))
  assert.deepEqual(rs.map(r => r.status), [201, 201, 201])
  assert.deepEqual(rs.map(r => r.body.team.voice?.id ?? '').sort(), ['', '2', '4'])
})

dbTest('팀 만들기: 봇이 없거나 준비 전이면 voice null · health 로 알 수 있다', async t => {
  const none = await start()
  const notReady = await start({ voice: createVoiceState({ guildId: GUILD }) })
  const ready = await start({ voice: readyVoice() })
  t.after(() => Promise.all([none.stop(), notReady.stop(), ready.stop()]))
  assert.equal((await create(none.api, person('x'))).body.team.voice, null)
  assert.equal((await create(notReady.api, person('x'))).body.team.voice, null)
  assert.deepEqual((await none.api('GET', '/api/health')).body, { ok: true, voice: false })
  assert.deepEqual((await ready.api('GET', '/api/health')).body, { ok: true, voice: true })
})

dbTest('가입 → 모집 완료 → 4번째 409, 디스코드 닉네임 중복(대소문자 무시) 409, 알림 3종(방 정보 줄 · 메모 필드)', async t => {
  const { api, app, hook, stop } = await start({ voice: readyVoice() })
  t.after(stop)
  const leader = person('Bono<@123>', [
    { nick: '보노_*bono*', tier: '골드', char: 'bl' },
    { nick: '보노_*bono*', tier: '골드', char: 'klfd' },
    { nick: '부계정<@123>', tier: '실버', char: 'bl' },
  ])
  const room = { title: '빡겜 *3판*만', mic: false, mode: 'serious', memo: '디코 필수\n<@123> - 매너' }
  const { body: { team } } = await create(api, leader, { preset: 'high-low' }, room)
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

  await app.idle()
  const [start1, joined, full, ...rest] = hooksOf(hook)
  assert.equal(rest.length, 0)
  for (const h of hooks.filter(h => h.url.startsWith(hook))) {
    assert.equal(h.url, `${hook}?wait=true`)
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
  assert.ok(!JSON.stringify(hooksOf(hook)).includes(PW), '알림에 비밀번호가 없다')
})

test('알림: 음성채널 없음 문구 · 전술 자유 · 웹훅 429 는 한 번 기다렸다 재시도(30초 넘게 기다리라면 버림) · 404 면 끈다', async t => {
  const hook = `/hook/notify${++appNo}`, nlogs = []
  const n = createNotifier({ webhookUrl: `http://127.0.0.1:${hookPort}${hook}`, siteUrl: SITE, guildId: GUILD, players: PLAYERS, modes: CFG.modes, log: m => nlogs.push(m) })
  const team = (name = '', room = {}) => ({
    id: 'AbCdEfGh', room: { title: '', mic: true, mode: 'fun', memo: '', ...room }, tactic: { preset: null, name, board: null },
    voice: null, status: 'open', size: 3, createdAt: 0, expiresAt: TTL,
    members: [{ id: 1, leader: true, discord: 'solo', entries: [{ nick: 'solo', tier: '골드', char: 'bl' }], joinedAt: 0 }],
  })
  t.after(() => { reply = () => [204, ''] })

  let first = true
  reply = () => first ? (first = false, [429, JSON.stringify({ retry_after: 0.05 })]) : [204, '']
  n.teamCreated(team())
  await n.idle()
  const sent = hooksOf(hook)
  assert.equal(sent.length, 2)
  assert.deepEqual(sent[0], sent[1])
  assert.equal(sent[0].embeds[0].title, '🏀 팀원 모집 시작 · 전술 자유')
  assert.deepEqual(sent[0].embeds[0].fields, [{ name: '음성채널', value: '빈 음성채널이 없어요 — 자유롭게 모여주세요' }], '메모가 없으면 메모 필드도 없다')
  assert.equal(sent[0].embeds[0].description, '🎙️ 마이크 O · 즐겜 · 전술 자유\n\n**solo** (골드) · solo\nPG 라멜로 볼\n\n모집 1/3')

  // retry_after 도 Retry-After 헤더도 없는 429 → 1초 쉬고 재시도 · 방 제목이 없으면 보드 이름, 마크다운 기호는 제목에서 뺀다
  first = true
  reply = () => first ? (first = false, [429, '{}']) : [204, '']
  let at = Date.now()
  n.teamCreated(team('**우리_전술** <@1>', { title: '*_*' }))
  await n.idle()
  assert.ok(Date.now() - at >= 900, `재시도까지 ${Date.now() - at}ms`)
  assert.equal(hooksOf(hook).length, 4)
  assert.equal(hooksOf(hook)[3].embeds[0].title, '🏀 팀원 모집 시작 · 우리전술 1')
  assert.ok(hooksOf(hook)[3].embeds[0].description.startsWith('🎙️ 마이크 O · 즐겜 · 전술 \\*\\*우리\\_전술\\*\\* \\<\\@1\\>\n\n'))

  // 한 시간 기다리라는 429 → 기다리지 않고 그 알림만 버린다(큐가 막히지 않는다)
  first = true
  reply = () => first ? (first = false, [429, JSON.stringify({ retry_after: 3600, global: true })]) : [204, '']
  at = Date.now()
  n.teamCreated(team())
  n.teamCreated(team('다음 알림'))
  await n.idle()
  assert.ok(Date.now() - at < 2000, `큐가 ${Date.now() - at}ms 막혔다`)
  assert.deepEqual(hooksOf(hook).slice(4).map(b => b.embeds[0].title), ['🏀 팀원 모집 시작 · 전술 자유', '🏀 팀원 모집 시작 · 다음 알림'], '버린 알림은 재시도하지 않는다')
  assert.ok(nlogs.some(l => l.includes('3600')), nlogs.join('\n'))

  reply = () => [404, '{"message":"Unknown Webhook"}']
  n.teamCreated(team())
  await n.idle()
  n.teamCreated(team())
  await n.idle()
  assert.equal(hooksOf(hook).length, 7, '404 뒤로는 보내지 않는다')
  assert.ok(nlogs.some(l => l.includes('404')))
})

// ---------------------------------------------------------------- 검증

test('검증: 잘못된 신청은 400', async t => {
  const { api, stop } = await start()
  t.after(stop)
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

test('검증: 방 설정(제목 · 마이크 · 즐겜/빡겜 · 메모 · 비밀번호)이 잘못되면 400', async t => {
  const { api, stop } = await start()
  t.after(stop)
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

dbTest('검증: 코드포인트 길이 · 공백 자르기 · 모르는 필드 버리기 · 비밀번호 경계값', async t => {
  const { api, stop } = await start()
  t.after(stop)
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

dbTest('전술판 보드: 허용 필드만 저장, 좌표 반올림·자르기', async t => {
  const { api, stop } = await start()
  t.after(stop)
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

test('검증: 전술판 보드 한도 초과 · 잘못된 모양은 400', async t => {
  const { api, stop } = await start()
  t.after(stop)
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

dbTest('전술 이름 만들기: 보드면 이름 > 프리셋 이름 > 커스텀 전술, 보드 없으면 프리셋 이름만', async t => {
  const { api, stop } = await start()
  t.after(stop)
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

dbTest('방출(팀장 토큰 · 비밀번호) · 나가기(본인 토큰) · 팀원 토큰은 남을 못 건드림 · 토큰 없음 401', async t => {
  const { api, stop } = await start()
  t.after(stop)
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

dbTest('팀 해제: 팀장 토큰 · 비밀번호 → 삭제(GET 404 · 가입 404 · 목록에서 빠짐)', async t => {
  const { api, stop } = await start()
  t.after(stop)
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

dbTest('팀장이 빠지면(본인 토큰 · 비밀번호로 방출) 팀이 해제된다', async t => {
  const { api, stop } = await start()
  t.after(stop)
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

dbTest('비밀번호: 틀리면 403, 한 IP 가 10분에 5번 틀리면 그 IP 만 429(다른 IP · 토큰은 된다) · 팀 전체 20번이면 429 · 해시로만 저장', async t => {
  let clock = futureBase()
  const { api, stop } = await start({ now: () => clock })
  t.after(stop)
  const { body: { team, member: lead } } = await create(api, person('lead'), {}, { password: ' 앞뒤 공백 ' })
  const other = (await create(api, person('other'))).body.team
  const tm = teamApi(api, team.id)
  const bad = '6.6.6.6', leader = '7.7.7.7'

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

  clock += 10 * MIN
  assert.equal((await tm.extend({ password: ' 앞뒤 공백 ', ip: bad })).status, 200, '10분 지나면 풀린다')

  // IP 를 바꿔 가며 찍어도 팀 전체 20번에서 막힌다
  const spread = []
  for (let i = 0; i < 21; i++) spread.push((await tm.extend({ password: `spread${i}`, ip: `10.99.${i}.1` })).status)
  assert.deepEqual(spread, [...Array(20).fill(403), 429], '팀 전체 21번째는 429')
  assert.equal((await tm.extend({ password: ' 앞뒤 공백 ', ip: leader })).status, 429, '팀 전체가 잠기면 맞아도 429')
  assert.equal((await tm.extend({ token: lead.token })).status, 200, '그래도 토큰은 된다')
  clock += 10 * MIN

  const [row] = await (await rest(`/recruit_teams?select=password_hash&id=in.(${team.id},${other.id})&order=id`)).json()
  assert.match(row.password_hash, /^scrypt\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/)
  const hashes = (await (await rest(`/recruit_teams?select=password_hash&id=in.(${team.id},${other.id})`)).json()).map(r => r.password_hash)
  const again = (await create(api, person('same-pw'))).body.team
  const [{ password_hash: h2 }] = await (await rest(`/recruit_teams?select=password_hash&id=eq.${again.id}`)).json()
  assert.ok(!hashes.includes(h2), '같은 비밀번호도 솔트가 달라 해시가 다르다')

  // 한 IP 가 동시에 몰아쳐도 확인되는 건 5번뿐 — 세는 게 scrypt 를 기다린 뒤라면 전부 '아직 0번'을 보고 통과한다
  const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => teamApi(api, again.id).extend({ password: `burst${i}`, ip: bad })))
  assert.deepEqual(burst.map(r => r.status).sort(), [...Array(5).fill(403), ...Array(7).fill(429)])
  assert.equal((await teamApi(api, again.id).extend({ password: PW, ip: bad })).status, 429, '몰아친 IP 는 맞아도 429')
})

dbTest('연장: 팀장 토큰 · 비밀번호 → 만료 = 지금 + 3시간(더하지 않는다) · 만료된 팀은 연장 못 함', async t => {
  let clock = futureBase()
  const { api, stop } = await start({ now: () => clock })
  t.after(stop)
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

dbTest('동시 가입 10건 → 남은 자리(2)만큼만 201, 나머지 409 · 알림은 합류 하나 + 완료 하나', async t => {
  const { api, app, hook, stop } = await start()
  t.after(stop)
  const { body: { team } } = await create(api, person('lead'))
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => teamApi(api, team.id).join(`racer${i}`)))
  assert.deepEqual(rs.map(r => r.status).sort(), [201, 201, 409, 409, 409, 409, 409, 409, 409, 409])
  assert.ok(rs.filter(r => r.status === 409).every(r => r.body.error === '이미 다 찬 팀이에요'), JSON.stringify(rs.map(r => r.body.error)))
  const got = (await api('GET', `/api/teams/${team.id}`)).body
  assert.deepEqual([got.status, got.members.length], ['full', 3])
  await app.idle()
  // 두 가입이 서로의 다시 읽기에 끼어도 "모집 완료" 가 두 번 가지 않는다(도착 순서는 바뀔 수 있다)
  assert.deepEqual(hooksOf(hook).map(b => b.embeds[0].title).sort(), ['✅ 팀원 합류 · 픽 앤 롤 (2/3)', '🎉 모집 완료 · 픽 앤 롤', '🏀 팀원 모집 시작 · 픽 앤 롤'].sort())
})

dbTest('Data API 권한: anon · authenticated 키나 키 없이는 팀원모집 표 · RPC 를 못 쓴다(secret key 만 된다)', async () => {
  assert.equal(jwt('service_role'), KEY, 'compose.yaml 의 SUPABASE_SECRET_KEY 는 LOCAL_JWT_SECRET 으로 서명한 service_role 키여야 한다')
  const post = body => ({ method: 'POST', body: JSON.stringify(body) })
  for (const [who, key] of [['anon', jwt('anon')], ['authenticated', jwt('authenticated')], ['키 없음', null]]) {
    for (const [path, o] of [
      ['/recruit_teams?select=id&limit=1', {}],
      ['/recruit_teams?select=password_hash&limit=1', {}],
      ['/recruit_teams?select=id&recruit_member_count=lt.3', {}],
      ['/recruit_members?select=token_hash&limit=1', {}],
      ['/recruit_teams', post({ id: 'AAAAAAAA', room: {}, tactic: {}, password_hash: 'x', created_at: 0, expires_at: 0 })],
      ['/recruit_teams?expires_at=lte.9999999999999', { method: 'DELETE' }],
      ['/rpc/recruit_create_team', post({
        p_id: 'AAAAAAAA', p_room: {}, p_tactic: {}, p_voice: null, p_password_hash: 'x', p_discord: 'x', p_entries: [], p_token_hash: 'x', p_now: 0, p_expires_at: 0,
      })],
      ['/rpc/recruit_join_team', post({ p_team: 'AAAAAAAA', p_discord: 'x', p_entries: [], p_token_hash: 'x', p_now: 0, p_size: 3 })],
    ]) {
      const r = await rest(path, { key, ...o })
      assert.ok([401, 403].includes(r.status), `${who} ${o.method || 'GET'} ${path} → ${r.status} ${await r.text()}`)
    }
  }
  assert.equal((await rest('/recruit_members?select=id&limit=1')).status, 200, 'secret key 는 된다')
})

// ---------------------------------------------------------------- 목록 순서 · 만료 · 자동 삭제 · 404

dbTest('목록: 모집 중(오래된 순) 먼저 · 다 찬 팀은 뒤로 · 빠지면 다시 앞으로 · 만료된 팀은 안 보이고 방도 풀린다', async t => {
  let clock = futureBase()
  const { api, stop } = await start({ voice: readyVoice(), now: () => clock })
  t.after(stop)
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

dbTest('자동 삭제: cleanup() 은 만료 시각이 지난 팀만 지운다(팀원 cascade)', async t => {
  // 과거 시계를 쓴다 — 먼 미래 시계로 지우면 compose 의 api 가 지금 시각으로 만든 팀까지 지워진다.
  // (반대로 그 api 의 5분 청소가 이 테스트의 팀을 먼저 지울 수는 있다 — 그래도 아래 단언은 성립하게 짰다)
  let clock = 946_684_800_000 + clocks * 1e6
  const { api, app, stop } = await start({ now: () => clock })
  t.after(stop)
  const gone = (await create(api, person('gone'))).body.team
  clock += 1
  const stay = (await create(api, person('stay'))).body.team
  await teamApi(api, gone.id).join('m')

  clock = gone.expiresAt
  assert.equal((await teamApi(api, gone.id).get()).status, 404, '지우기 전에도 안 보인다')
  const listed = (await api('GET', '/api/teams')).body.teams.map(x => x.id)
  assert.ok(listed.includes(stay.id) && !listed.includes(gone.id), JSON.stringify(listed))

  await app.cleanup()
  const left = await (await rest(`/recruit_teams?select=id&id=in.(${gone.id},${stay.id})`)).json()
  assert.ok(!left.some(r => r.id === gone.id), '만료된 팀은 지워졌다')
  assert.deepEqual(await (await rest(`/recruit_members?select=id&team_id=eq.${gone.id}`)).json(), [])
  if (left.length) assert.deepEqual(left.map(r => r.id), [stay.id], '만료 전 팀은 남는다')
  assert.equal((await teamApi(api, stay.id).get()).status, left.length ? 200 : 404)
})

const all404 = async (api, list) => {
  for (const [m, p, body] of list) {
    const r = await api(m, p, body, { token: 'x' })
    assert.equal(r.status, 404, `${m} ${p}`)
    assert.equal(typeof r.body.error, 'string')
  }
}

test('404: 잘못된 id · 없는 주소', async t => {
  const { api, stop } = await start()
  t.after(stop)
  await all404(api, [
    ['GET', '/api/teams/short'], ['GET', '/api/teams/AAAAAAAA%2F'], ['GET', '/api/nope'], ['GET', '/api/teams/AAAAAAAA/extra'], ['PUT', '/api/teams'],
    ['DELETE', '/api/teams'], ['GET', '/api/teams/AAAAAAAA/members'], ['GET', '/api/teams/AAAAAAAA/extend'], ['DELETE', '/api/teams/AAAAAAAA/extend'],
    ['POST', '/api/teams/AAAAAAAA/extend/1'], ['POST', '/api/teams/AAAAAAAA/members/1'], ['POST', '/api/teams/bad/extend'], ['DELETE', '/api/teams/bad/members/1'],
  ])
})

dbTest('404: 없는 팀', async t => {
  const { api, stop } = await start()
  t.after(stop)
  await all404(api, [
    ['GET', '/api/teams/AAAAAAAA'], ['POST', '/api/teams/AAAAAAAA/members', person('a')], ['DELETE', '/api/teams/AAAAAAAA'],
    ['POST', '/api/teams/AAAAAAAA/extend'], ['DELETE', '/api/teams/AAAAAAAA/members/1', { password: PW }],
  ])
})

// ---------------------------------------------------------------- HTTP 가장자리

test('CORS: CORS_ORIGIN 이 있으면 preflight 204 와 모든 응답에 Allow-Origin, 없으면 헤더 없음', async t => {
  const origin = 'https://nba-kor.github.io'
  const on = await start({ env: { CORS_ORIGIN: origin } })
  const off = await start()
  t.after(() => Promise.all([on.stop(), off.stop()]))

  const pre = await fetch(`${on.base}/api/teams`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } })
  assert.equal(pre.status, 204)
  assert.equal(pre.headers.get('access-control-allow-origin'), origin)
  assert.equal(pre.headers.get('access-control-allow-methods'), 'GET, POST, DELETE')
  assert.equal(pre.headers.get('access-control-allow-headers'), 'content-type, authorization')
  assert.equal(pre.headers.get('access-control-max-age'), '600')
  assert.equal((await on.api('GET', '/api/health')).headers.get('access-control-allow-origin'), origin)
  assert.equal((await on.api('GET', '/api/teams/AAAA')).headers.get('access-control-allow-origin'), origin, '에러 응답에도')

  assert.equal((await fetch(`${off.base}/api/teams`, { method: 'OPTIONS' })).status, 404)
  assert.equal((await off.api('GET', '/api/health')).headers.get('access-control-allow-origin'), null)
})

test('413: 32KB 넘는 본문 (content-length · chunked 둘 다, 관리 요청 포함)', async t => {
  const { api, base, stop } = await start()
  t.after(stop)
  const big = JSON.stringify({ room: ROOM, member: person('a'), pad: 'x'.repeat(33 * 1024) })
  const r = await api('POST', '/api/teams', big)
  assert.equal(r.status, 413)
  assert.equal(typeof r.body.error, 'string')
  assert.equal((await api('DELETE', '/api/teams/AAAAAAAA', JSON.stringify({ password: 'x'.repeat(33 * 1024) }))).status, 413)

  const chunked = await fetch(`${base}/api/teams`, {
    method: 'POST', duplex: 'half', headers: { 'content-type': 'application/json' },
    body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close() } }),
  })
  assert.equal(chunked.status, 413)
  assert.equal((await api('GET', '/api/health')).status, 200, '서버는 멀쩡하다')
})

test('요청 수 제한: IP 당 POST·DELETE(연장 포함) 30번 / 10분, GET 은 제외', async t => {
  let clock = 1_700_000_000_000
  const { api, stop } = await start({ now: () => clock })
  t.after(stop)
  const ip = '203.0.113.7'
  for (let i = 0; i < 30; i++) assert.notEqual((await api('POST', '/api/teams', {}, { ip })).status, 429)
  const r = await api('POST', '/api/teams', {}, { ip })
  assert.equal(r.status, 429)
  assert.equal(typeof r.body.error, 'string')
  assert.equal((await api('DELETE', '/api/teams/AAAAAAAA', undefined, { ip })).status, 429)
  assert.equal((await api('POST', '/api/teams/AAAAAAAA/extend', { password: PW }, { ip })).status, 429)
  assert.notEqual((await api('GET', '/api/teams', undefined, { ip })).status, 429)   // DB 가 없으면 503 — 제한에 안 걸리면 된다
  assert.equal((await api('POST', '/api/teams', {}, { ip: `${ip}, 10.0.0.1` })).status, 429, 'X-Forwarded-For 첫 주소 기준')
  assert.equal((await api('POST', '/api/teams', {}, { ip: '203.0.113.8' })).status, 400)
  // IPv6 는 한 /64 안에서 주소를 바꿔 가며 보내도 한 곳으로 센다
  for (let i = 1; i <= 30; i++) assert.notEqual((await api('POST', '/api/teams', {}, { ip: `2001:db8:1:2::${i.toString(16)}` })).status, 429)
  assert.equal((await api('POST', '/api/teams', {}, { ip: '2001:0db8:0001:0002:ffff:0:0:1' })).status, 429, '같은 /64')
  assert.equal((await api('POST', '/api/teams', {}, { ip: '2001:db8:1:3::1' })).status, 400, '다른 /64')
  clock += 10 * 60_000
  assert.equal((await api('POST', '/api/teams', {}, { ip })).status, 400, '10분 지나면 풀린다')
})

test('요청 수 제한: TRUST_PROXY 가 아니면 X-Forwarded-For 를 믿지 않는다', async t => {
  const { api, stop } = await start({ env: { TRUST_PROXY: '0' } })
  t.after(stop)
  for (let i = 0; i < 30; i++) await api('POST', '/api/teams', {})   // 매번 다른 X-Forwarded-For
  assert.equal((await api('POST', '/api/teams', {})).status, 429)
})

test('URL 로 읽을 수 없는 요청 주소는 400', async t => {
  const { base, stop } = await start()
  t.after(stop)
  const status = await new Promise((resolve, reject) =>
    request(base, { path: '//' }, res => { res.resume(); resolve(res.statusCode) }).on('error', reject).end())
  assert.equal(status, 400)
})

// ---------------------------------------------------------------- Data API 오류 (DB 없이 — 닫힌 포트 · 가짜 PostgREST)

const DB_DOWN = '모집 서버 DB 에 연결할 수 없어요'

test('Data API 에 닿지 않으면 503 · 검증 실패는 DB 에 가기 전에 400 · 키는 로그에 없다', async t => {
  const closed = createServer()
  const port = await listen(closed)
  await new Promise(r => closed.close(r))
  const dlogs = []
  const { api, app, stop } = await start({ env: { SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_SECRET_KEY: 'sb_secret_test' }, log: (...a) => dlogs.push(a.map(String).join(' ')) })
  t.after(stop)
  for (const [m, p, body] of [
    ['GET', '/api/teams'], ['GET', '/api/teams/AAAAAAAA'], ['POST', '/api/teams', { room: ROOM, member: person('a') }], ['POST', '/api/teams/AAAAAAAA/members', person('a')],
    ['POST', '/api/teams/AAAAAAAA/extend', { password: PW }], ['DELETE', '/api/teams/AAAAAAAA'],
  ]) {
    const r = await api(m, p, body)
    assert.deepEqual([r.status, r.body], [503, { error: DB_DOWN }], `${m} ${p}`)
  }
  await assert.rejects(app.cleanup(), { status: 503 })
  assert.equal((await create(api, person('a', []))).status, 400)
  assert.equal((await create(api, person('a'), {}, { mode: 'x' })).status, 400)
  assert.ok(dlogs.length && !dlogs.join('\n').includes('sb_secret_test'), dlogs.join('\n'))
})

test('Data API 오류 → HTTP: PT404 · PT409(full) · 23505 는 사용자 문구, 5xx · 프록시 오류는 503, 그 밖은 500 · 청소 요청 모양', async t => {
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
  const fake = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, headers: req.headers })
    const [code, body] = req.url.startsWith('/rest/v1/rpc/') ? rpc : req.method === 'DELETE' ? [204, ''] : [200, JSON.stringify([row])]
    res.writeHead(code, { 'content-type': 'application/json' }).end(body)
  })
  const port = await listen(fake)
  const elogs = []
  const { api, app, stop } = await start({
    env: { SUPABASE_URL: `http://127.0.0.1:${port}/`, SUPABASE_SECRET_KEY: 'sb_secret_test' }, now: () => 0, log: (...a) => elogs.push(a.map(String).join(' ')),
  })
  t.after(() => { fake.close(); return stop() })
  const join = () => api('POST', '/api/teams/AAAAAAAA/members', person('a'))

  const ok = await join()
  assert.deepEqual([ok.status, ok.body.member.id, ok.body.team.status], [201, 7, 'open'])
  assert.ok(!ok.text.includes('scrypt') && !ok.text.includes('password'), '저장된 해시는 팀 뷰에 없다')
  const call = seen.find(s => s.url === '/rest/v1/rpc/recruit_join_team')
  assert.equal(call.headers.apikey, 'sb_secret_test')
  assert.equal(call.headers.authorization, undefined, 'secret key 는 Authorization 에 싣지 않는다')
  assert.deepEqual([call.headers['content-type'], call.headers.accept], ['application/json', 'application/json'])
  assert.ok(seen.every(s => s.url.startsWith('/rest/v1/recruit_') || s.url.startsWith('/rest/v1/rpc/')), seen.map(s => s.url).join('\n'))

  seen.length = 0
  await app.cleanup()
  assert.deepEqual(seen.map(s => `${s.method} ${s.url}`), ['DELETE /rest/v1/recruit_teams?expires_at=lte.0'], '필터 없는 DELETE 는 보내지 않는다')

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
  assert.ok(!elogs.join('\n').includes('sb_secret_test'), '키는 로그에 남기지 않는다')
})

// ---------------------------------------------------------------- 게이트웨이 (가짜 WebSocket 서버)

/** RFC 6455 최소 구현: 핸드셰이크, 서버→클라 텍스트/닫기 프레임, 클라→서버 마스킹 프레임 해독. */
async function fakeGateway() {
  const clients = [], waiters = []
  const srv = createServer()
  srv.on('upgrade', (req, sock) => {
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    const frame = (op, payload) => Buffer.concat([Buffer.from([0x80 | op, payload.length]), payload])   // 125바이트 이하만
    const inbox = [], waiting = []
    const push = m => waiting.length ? waiting.shift()(m) : inbox.push(m)
    const c = {
      closing: false,
      send: o => sock.write(frame(1, Buffer.from(JSON.stringify(o)))),
      close: code => { c.closing = true; const p = Buffer.alloc(2); p.writeUInt16BE(code); sock.write(frame(8, p)) },
      next: () => inbox.length ? Promise.resolve(inbox.shift()) : new Promise(r => waiting.push(r)),
      until: async pred => { for (;;) { const m = await c.next(); if (pred(m)) return m } },
    }
    let buf = Buffer.alloc(0)
    sock.on('data', d => {
      buf = Buffer.concat([buf, d])
      while (buf.length >= 6) {
        let len = buf[1] & 127, off = 2
        if (len === 126) { len = buf.readUInt16BE(2); off = 4 }
        if (buf.length < off + 4 + len) return
        const mask = buf.subarray(off, off + 4)
        const data = Buffer.from(buf.subarray(off + 4, off + 4 + len).map((b, i) => b ^ mask[i % 4]))
        const op = buf[0] & 15
        buf = buf.subarray(off + 4 + len)
        if (op === 1) push(JSON.parse(data))
        if (op === 8) {
          c.closing ? sock.end() : sock.end(frame(8, data))
          push({ closed: data.readUInt16BE(0) })
        }
      }
    })
    sock.on('error', () => {})
    clients.push({ c, sock })
    waiters.shift()?.(c)
  })
  const port = await listen(srv)
  return {
    url: `ws://127.0.0.1:${port}`,
    client: () => new Promise(r => waiters.push(r)),
    stop: () => { for (const { sock } of clients) sock.destroy(); srv.close() },
  }
}

test('게이트웨이: HELLO → IDENTIFY, 디스패치 전달, seq 실은 하트비트, op7 → 끊고 5초 뒤 새 IDENTIFY', { timeout: 15_000 }, async t => {
  const gw = await fakeGateway()
  const events = [], glogs = []
  let disconnects = 0
  const conn = gw.client()
  const g = connectGateway({ token: 'tok', url: gw.url, onDispatch: (t, d) => events.push([t, d]), onDisconnect: () => disconnects++, log: m => glogs.push(m) })
  t.after(() => { g.close(); gw.stop() })

  const c = await conn
  // 디스패치를 HELLO 보다 먼저 보내 첫 박동(무작위 지연)이 seq 를 확실히 싣게 한다
  c.send({ op: 0, t: 'READY', s: 1, d: { v: 10 } })
  c.send({ op: 0, t: 'GUILD_CREATE', s: 2, d: { id: GUILD } })
  c.send({ op: 10, d: { heartbeat_interval: 300 } })
  assert.deepEqual(await c.next(), { op: 2, d: { token: 'tok', intents: 129, properties: { os: 'linux', browser: 'nba-kor', device: 'nba-kor' } } })
  assert.deepEqual(events, [['READY', { v: 10 }], ['GUILD_CREATE', { id: GUILD }]])
  assert.deepEqual(await c.next(), { op: 1, d: 2 })
  c.send({ op: 11 })
  assert.deepEqual(await c.next(), { op: 1, d: 2 }, 'ACK 받았으니 계속 박동')
  c.send({ op: 11 })
  c.send({ op: 1 })
  assert.deepEqual(await c.next(), { op: 1, d: 2 }, '서버가 op1 을 보내면 바로 박동')
  assert.equal(disconnects, 0)

  const reconnect = gw.client()
  c.send({ op: 7 })   // 다음 정기 박동(300ms)보다 한참 먼저 끊겨야 한다 — 좀비 판정과 헷갈리지 않게
  assert.deepEqual(await c.until(m => m.closed), { closed: 4000 })
  assert.equal(disconnects, 1)
  const at = Date.now()
  const c2 = await reconnect
  assert.ok(Date.now() - at >= 4500, '최소 5초 기다렸다 다시 붙는다')
  c2.send({ op: 10, d: { heartbeat_interval: 60_000 } })
  assert.equal((await c2.next()).op, 2, '재연결 때마다 새로 IDENTIFY')
  g.close()
  assert.deepEqual(await c2.until(m => m.closed), { closed: 1000 })
  assert.equal(disconnects, 2)
})

test('게이트웨이: ACK 없는 좀비 연결은 끊는다 · 치명적 종료 코드면 재연결 안 함', { timeout: 5000 }, async t => {
  const gw = await fakeGateway()
  const glogs = []
  t.after(() => gw.stop())

  let conn = gw.client()
  const g1 = connectGateway({ token: 'tok', url: gw.url, onDispatch: () => {}, log: m => glogs.push(m) })
  const c = await conn
  c.send({ op: 10, d: { heartbeat_interval: 30 } })
  await c.next()                                        // IDENTIFY
  assert.deepEqual(await c.next(), { op: 1, d: null })  // 첫 박동 — ACK 안 보냄
  assert.deepEqual(await c.until(m => m.closed), { closed: 4000 })
  g1.close()

  conn = gw.client()
  let down = 0
  const g2 = connectGateway({ token: 'bad', url: gw.url, onDispatch: () => {}, onDisconnect: () => down++, log: m => glogs.push(m) })
  const c2 = await conn
  c2.send({ op: 10, d: { heartbeat_interval: 60_000 } })
  await c2.next()
  c2.close(4004)
  await c2.until(m => m.closed)
  for (let i = 0; i < 100 && !down; i++) await new Promise(r => setTimeout(r, 10))
  assert.equal(down, 1)
  assert.ok(glogs.some(l => l.includes('4004') && l.includes('재연결하지 않습니다')), glogs.join('\n'))
  g2.close()
})

test('게이트웨이: null 프레임 · heartbeat_interval 없는 HELLO 로 죽지 않는다', { timeout: 5000 }, async t => {
  const gw = await fakeGateway()
  const conn = gw.client()
  const g = connectGateway({ token: 'tok', url: gw.url, onDispatch: () => {}, log: () => {} })
  t.after(() => { g.close(); gw.stop() })
  const c = await conn
  c.send(null)
  c.send({ op: 10 })
  c.send({ op: 10, d: { heartbeat_interval: 60_000 } })
  assert.equal((await c.next()).op, 2, '멀쩡한 HELLO 에만 IDENTIFY 한 번')
})

test('응답 어디에도 비밀번호 · 해시 · 토큰 해시가 없다', () => {
  const all = responses.join('\n')
  for (const secret of [PW, ' 앞뒤 공백 ', 'scrypt', 'password', 'token_hash']) assert.ok(!all.includes(secret), secret)
  assert.ok(responses.length > 100)
})

test('서버 오류(500)는 한 번도 나지 않았다', () => {
  assert.deepEqual(logs.filter(l => l.startsWith('API 오류')), [])
})
