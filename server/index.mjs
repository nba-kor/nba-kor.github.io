// 팀원모집 API — Request 하나를 받아 Response 를 돌려주는 함수(createHandler) 하나. 저장소는 Supabase(Data API).
//
// 운영은 Supabase Edge Function(supabase/functions/recruit/index.mjs)이 이 함수를 부르고, 로컬 docker compose 는 같은
// edge-runtime 으로 띄운다(nginx 의 /api/ → 함수). 테스트(server/test.mjs)는 Node 에서 이 함수를 직접 부른다.
// 그래서 웹 표준(fetch · Request · Response)과 node:crypto · node:buffer 만 쓴다 — node:http · node:fs 는 Deno 에서 못 쓴다.
// 부르는 쪽은 셋이다: 웹 화면(Supabase Auth 디스코드 · 카카오 로그인 토큰, 또는 비회원 비밀번호)과 TNAB 디스코드 봇(봇 키 + 디스코드 ID 헤더).
// 둘 다 Supabase DB 에는 붙지 않는다 — 검증 · 권한 · 1인 1파티 · 요청 수 제한 · secret key 가 전부 여기 있다.

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { promisify } from 'node:util'
// 데이터는 글자 그대로의 import 로 읽는다 — 배포 CLI 가 이 구문만 보고 JSON 파일을 함수에 같이 묶는다(readFileSync 는 못 찾는다)
import CFG from '../data/recruit.json' with { type: 'json' }
import playersData from '../data/players.json' with { type: 'json' }
import upcomingData from '../data/upcoming.json' with { type: 'json' }
import tacticsData from '../data/tactics.json' with { type: 'json' }
import potentialsData from '../data/potentials.json' with { type: 'json' }
import videosData from '../data/videos.json' with { type: 'json' }
import ARENA from '../data/arena.json' with { type: 'json' }
import { channelUrl, createNotifier, errText, guildNick, voiceRooms } from './discord.mjs'

// 한국 출시만. 공식 홈페이지보다 먼저 인게임에 나온 선수는 upcoming.json 에서 server 를 kr 로 바꿔 올린다
// (화면 · 카카오 얼굴 · 봇이 같은 규칙을 쓴다). 홈페이지에 오르면 update-players 가 players.json 에 넣으니 upcoming 에서 지운다
const PLAYERS = new Map([...playersData.players, ...upcomingData.players].filter(p => p.server === 'kr').map(p => [p.id, p]))
// 티어표에는 미출시 선수도 올릴 수 있다(화면의 「미출시 선수 포함」)
const ALL_PLAYERS = new Set([...playersData.players, ...upcomingData.players].map(p => p.id))
const PRESETS = new Map(tacticsData.presets.map(p => [p.id, p.name]))
const TTL = CFG.ttlHours * 3_600_000
const L = CFG.limits
const MAX_BODY = 32 * 1024
const MAX_LIST = 100
const AUDIT_PAGE = 50   // 감사 로그 한 번에 보여 주는 줄
const LIMIT = { max: 30, windowMs: 10 * 60_000 }   // 한 사람(계정 · 비회원 팀원) 당 쓰기 요청. 비회원 만들기 · 가입은 IP 당
const PW_LIMIT = { max: 5, memberMax: 20, windowMs: 10 * 60_000 }   // 틀린 비회원 비밀번호: 한 IP 가 한 팀원에 · 그 팀원 전체
const PW_LEN = [4, 32]
const GATE_LIMIT = { max: 10, windowMs: 10 * 60_000 }   // 틀린 접근 비밀번호: 한 IP 당
const GATE_MEMO_MS = 30_000   // 접근 비밀번호 줄을 워커 메모리에 — 바꾸면 다른 워커는 길어야 30초 뒤에 안다
const GATE_LEN = [4, 32]
const AUTH_MEMO = { ms: 60_000, max: 500 }         // 로그인 토큰 확인 결과를 워커 메모리에 잠깐 — 요청마다 Auth 를 부르지 않게
const ROUTE_KINDS = ['move', 'pass', 'screen']
const LINK = /:\/\/|www\.|discord\.gg/i
const TEAM_ID = /^[A-Za-z0-9_-]{8}$/
// 게시판(잠재력추천 builds · 영상 videos · 커스텀 전술 tactics · 티어표 tiers · 조합표 combos): /api/<게시판>[/<id>[/like | /comments[/<댓글 id>]]]
const BOARD_PATH = /^\/api\/(builds|videos|tactics|tiers|combos)(?:\/(\d{1,15})(?:\/(like|comments)(?:\/(\d{1,15}))?)?)?$/
const BUILD_CHARS = 5
const COMBO_VS = 10   // 조합표: 상대하기 편한 · 힘든 쪽마다 캐릭터 수 · 조합(3명 세트) 수
// 유튜브 주소 → 영상 id(11자). watch?v= · youtu.be · shorts · live · embed, www · m · music 서브도메인
const YOUTUBE = /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/
const CATEGORIES = new Set(videosData.categories.map(c => c.id))
const SNOWFLAKE = /^\d{17,20}$/
const GUEST_ID = /^g(\d{1,15})$/   // 비회원 · 팀장이 넣은 팀원의 userId = 'g' + recruit_members.id
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CONTROL = /[\x00-\x1f\x7f]/
const JSON_TYPE = /^application\/json\b/i
// 아레나전: 시간대(토 · 일 1팟 · 2팟) + 토 · 일 FA(그날 시간 미정 · 용병) · 사유불참. 주는 그 주 토요일 날짜
const SLOTS = new Set(ARENA.slots.map(s => s.id))
const ROLES = new Set(ARENA.roles.map(r => r.id))   // 계정의 주력 포지션 1 · 2순위 — 스코어러 · 중열 · 센터 · 올포(allpos, 1순위로만 · 2순위 없이)
// 같은 날 시간이 겹치는 두 시간대 — 1.5차(20:00~)는 1차 · 2차와 겹친다. 한 사람은 겹치는 시간대에 한 번만 들어간다(계정 둘을 동시에 못 한다)
const minutes = t => +t.slice(0, 2) * 60 + +t.slice(3)
const SLOT_AT = new Map(ARENA.slots.map(s => [s.id, s]))
const clash = (x, y) => { const a = SLOT_AT.get(x), b = SLOT_AT.get(y); return a.day === b.day && minutes(a.time) < minutes(b.end) && minutes(b.time) < minutes(a.end) }
const CHOICES = [...SLOTS, ...ARENA.extra.map(c => c.id)]
const WEEK = /^\d{4}-\d{2}-\d{2}$/
const PLAN_LIMIT = { max: 300, windowMs: 10 * 60_000 }   // 관리자 편성표 저장 — 끌어다 놓을 때마다 저장한다
const STALE_PLAN = '그새 신청이나 편성표가 바뀌었어요 — 새로 불러올게요'
const MEMBER_ID = /^(\d{17,20}|k\d{1,20})$/   // 멤버(프로필) ID — 디스코드 ID · k<카카오 회원번호>
// 받는 요청 — 메서드 + 경로 조각. 예: 'POST team members' = 가입, 'DELETE team members member' = 방출 · 나가기
const ACTIONS = new Set([
  'GET me', 'PUT me profile', 'GET', 'POST', 'POST quick', 'GET team', 'DELETE team', 'POST team members', 'DELETE team members member', 'POST team extend',
  'PUT team', 'PUT team members member',   // 팀 정보 수정(팀장) · 참가 캐릭터 바꾸기(본인)
  'GET profiles',   // 팀장이 팀원을 직접 넣을 때 자동완성
])
// 비회원(Authorization: Guest)이 할 수 있는 것 — 자기 팀 안의 일뿐. 프로필 · 게시판은 계정만
const GUEST_ACTIONS = new Set(['GET me', 'GET profiles', 'DELETE team', 'POST team members', 'DELETE team members member', 'POST team extend', 'PUT team', 'PUT team members member'])
// 브라우저는 authorization · content-type 만 보낸다(커스텀 x- 헤더는 운영 게이트웨이 preflight 에서 잘릴 수 있다). 봇의 x-discord-* 는 서버끼리라 preflight 가 없다
const PREFLIGHT = { 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '600' }

const LOGIN = '로그인해 주세요'
const GATE = '접근 비밀번호를 입력해 주세요'
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
const scryptAsync = promisify(scrypt)   // 비동기만 — scryptSync 는 워커 CPU 시간(2초)을 먹는다
// IPv6 는 보통 한 가입자가 /64 를 통째로 받는다 — 앞 64비트로 센다(IPv4 · ::ffff:a.b.c.d · 이상한 값은 그대로)
const rateKey = ip => {
  const [a, b, ...extra] = ip.split('%')[0].split('::'), head = a ? a.split(':') : [], tail = b ? b.split(':') : []
  const full = b === undefined ? head : [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail]
  if (extra.length || full.length !== 8 || !full.every(x => /^[0-9a-f]{1,4}$/i.test(x))) return ip
  return `${full.slice(0, 4).map(x => parseInt(x, 16).toString(16)).join(':')}::/64`
}
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

/** 프로필: 표시 이름 + 개인 마이크 O/X + 캐릭터 1~maxEntries 줄(첫 줄 대표). 같은 게임 닉네임 줄들이 한 계정이다(첫 줄의 계정 = 본계정).
 *  이름을 안 보내면(봇 · 옛 화면) 저장돼 있던 이름을 그대로 둔다 — 디스코드 서버 별명과 계정 이름이 다를 수 있어 본인이 고른다 */
function profile(v) {
  if (!isObj(v)) fail(400, '프로필 정보가 없어요')
  if (typeof v.mic !== 'boolean') fail(400, '마이크 사용 여부를 골라 주세요')
  if (!listOf(v.entries, CFG.maxEntries, 1)) fail(400, `캐릭터는 1~${CFG.maxEntries}개 등록할 수 있어요`)
  const seen = new Set()
  const entries = v.entries.map(e => {
    if (!isObj(e)) fail(400, '계정 정보를 확인해 주세요')
    const nick = text(e.nick, 20, '게임 닉네임')
    const tier = e.tier ?? ''   // 티어는 이제 안 받는다 — 예전에 적은 티어만 그대로 둔다
    if (tier !== '' && !CFG.tiers.includes(tier)) fail(400, '티어를 골라 주세요')
    if (typeof e.char !== 'string' || !PLAYERS.has(e.char)) fail(400, '한국 서버에 출시된 캐릭터만 고를 수 있어요')
    const key = `${nick}\n${e.char}`   // 닉네임에 제어문자가 없으니 \n 으로 이어도 겹치지 않는다
    if (seen.has(key)) fail(400, '같은 계정에 같은 캐릭터가 두 번 들어갔어요')
    seen.add(key)
    // 아레나 — 계정의 주력 포지션(1 · 2순위, 그 계정의 줄마다 같은 값)과 캐릭터 돌파(1~7). 둘 다 없어도 된다(팀원모집 · 옛 프로필)
    const roles = e.roles ?? []
    if (!listOf(roles, 2) || roles.some(r => !ROLES.has(r)) || new Set(roles).size !== roles.length || roles.includes('allpos') && roles.length > 1) fail(400, '주력 포지션을 다시 골라 주세요')
    const bt = e.breakthrough ?? null
    if (bt !== null && !(Number.isInteger(bt) && bt >= 1 && bt <= ARENA.breakthrough)) fail(400, `돌파는 1~${ARENA.breakthrough} 중에 골라 주세요`)
    return { nick, tier, char: e.char, ...(roles.length && { roles }), ...(bt && { breakthrough: bt }) }
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
  // custom = 전술판의 커스텀 전술 번호. 팀 화면이 그 전술의 설명 · 작성자를 보여 준다(지워졌으면 보드만). 보드가 있을 때만 의미가 있다
  if (v.custom != null && !(Number.isInteger(v.custom) && v.custom > 0)) fail(400, '전술 정보가 잘못됐어요')
  return { preset, name: b ? name || presetName || '커스텀 전술' : presetName, board: b, ...(b && v.custom && { custom: v.custom }) }
}

const positionsOf = chars => [...new Set(chars.map(c => PLAYERS.get(c).pos))].sort()
function charsOf(v, min, max, what) {
  if (!listOf(v, max, min) || new Set(v).size !== v.length || !v.every(c => typeof c === 'string' && PLAYERS.has(c))) {
    fail(400, min ? `${what}를 ${min === max ? max : `${min}~${max}`}명 골라 주세요` : `${what}는 ${max}명까지 고를 수 있어요`)
  }
  return v
}

/** 영상 글: 유튜브 주소 · 제목 · 분류 · 나온 캐릭터 0~5명 · 설명 */
function video(v) {
  if (!isObj(v)) fail(400, '요청 형식이 잘못됐어요')
  const youtube = typeof v.url === 'string' && YOUTUBE.exec(v.url.trim())?.[1]
  if (!youtube) fail(400, '유튜브 영상 주소를 넣어 주세요')
  if (!CATEGORIES.has(v.category)) fail(400, '분류를 골라 주세요')
  const chars = charsOf(v.chars ?? [], 0, videosData.maxChars, '캐릭터')
  return {
    youtube, category: v.category, chars, positions: positionsOf(chars),
    title: text(v.title, 60, '제목'), body: text(v.body ?? '', 1000, '설명', 0, true),
  }
}

/** 커스텀 전술: 이름 · 설명 · 전술판 보드(선수 1명 이상) · 고치기 시작한 기본 전술 */
function customTactic(v) {
  if (!isObj(v)) fail(400, '요청 형식이 잘못됐어요')
  const b = board(v.board)
  if (!b.tokens.length) fail(400, '코트에 선수를 한 명 이상 올려 주세요')
  if (v.preset != null && !(typeof v.preset === 'string' && PRESETS.has(v.preset))) fail(400, '없는 전술이에요')
  const chars = [...new Set(b.tokens.map(t => t.playerId).filter(id => PLAYERS.has(id)))]
  return {
    title: text(v.title, 30, '전술 이름'), body: text(v.body, 500, '전술 설명', 1, true),
    board: b, preset: v.preset ?? null, chars, positions: positionsOf(chars),
  }
}

/** 티어표 글: 제목 · 설명 · 티어 1~12줄(이름 · 색 · 선수). 한 선수는 한 줄에만, 한 명 이상은 올려야 한다 */
function tierList(v) {
  if (!isObj(v)) fail(400, '요청 형식이 잘못됐어요')
  if (!listOf(v.tiers, 12, 1)) fail(400, '티어는 1~12줄까지 둘 수 있어요')
  const seen = new Set()
  const tiers = v.tiers.map(t => {
    if (!isObj(t) || !matches(/^#[0-9a-f]{6}$/i, t.color) || !listOf(t.ids, ALL_PLAYERS.size)) fail(400, '티어 정보가 잘못됐어요')
    for (const id of t.ids) {
      if (typeof id !== 'string' || !ALL_PLAYERS.has(id) || seen.has(id)) fail(400, '티어에 없는 선수가 있거나 같은 선수가 두 번 들어갔어요')
      seen.add(id)
    }
    return { label: text(t.label, 10, '티어 이름', 0), color: t.color, ids: t.ids }
  })
  if (!seen.size) fail(400, '티어에 선수를 한 명 이상 올려 주세요')
  const chars = [...seen].filter(id => PLAYERS.has(id))
  return { title: text(v.title, 40, '제목'), body: text(v.body ?? '', 500, '설명', 0, true), tiers, chars, positions: positionsOf(chars) }
}

/** 조합표 글: 이름 · 선수 3명(+ 선수마다 참고할 잠재력추천 글) · 상대하기 편한/힘든 캐릭터 · 조합(3명 세트) · 설명.
 *  잠재력추천 글 번호는 모양만 본다 — 지워진 글은 화면이 빼고 보여 준다 */
function combo(v) {
  if (!isObj(v)) fail(400, '요청 형식이 잘못됐어요')
  const chars = charsOf(v.chars, 3, 3, '조합 선수')
  const builds = v.builds ?? [null, null, null]
  if (!listOf(builds, 3, 3) || !builds.every(x => x === null || (Number.isInteger(x) && x > 0 && x < 1e15))) fail(400, '추천 잠재력 정보가 잘못됐어요')
  const setKey = c => [...c].sort().join()   // 같은 세 명이면 순서가 달라도 같은 조합
  const side = (s = {}, what) => {
    if (!isObj(s)) fail(400, '상대 정보가 잘못됐어요')
    if (!listOf(s.combos ?? [], COMBO_VS)) fail(400, `${what} 조합은 ${COMBO_VS}개까지 만들 수 있어요`)
    const combos = (s.combos ?? []).map(c => charsOf(c, 3, 3, `${what} 조합 선수`))
    if (new Set(combos.map(setKey)).size !== combos.length) fail(400, `${what} 쪽에 같은 조합이 두 번 들어갔어요`)
    return { chars: charsOf(s.chars ?? [], 0, COMBO_VS, `${what} 캐릭터`), combos }
  }
  const vs = v.matchups ?? {}
  if (!isObj(vs)) fail(400, '상대 정보가 잘못됐어요')
  const easy = side(vs.easy, '상대하기 편한'), hard = side(vs.hard, '상대하기 힘든')
  const hardSets = new Set(hard.combos.map(setKey))
  if (easy.chars.some(c => hard.chars.includes(c)) || easy.combos.some(c => hardSets.has(setKey(c)))) fail(400, '같은 캐릭터 · 조합을 편한 쪽과 힘든 쪽에 같이 넣었어요')
  return {
    title: text(v.title, 40, '조합 이름'), body: text(v.body ?? '', 1000, '조합 설명', 0, true),
    chars, positions: positionsOf(chars), builds, matchups: { easy, hard },
  }
}

/** 잠재력 빌드 글. cat = data/potentials.json(능력치는 최대 레벨 기준). 칸은 비워 둘 수 있지만 한 칸은 채워야 한다 */
function build(v, cat) {
  if (!isObj(v)) fail(400, '요청 형식이 잘못됐어요')
  charsOf(v.chars, 1, BUILD_CHARS, '추천 캐릭터')
  if (!isObj(v.slots)) fail(400, '잠재력을 넣어 주세요')
  const byId = new Map(cat.potentials.map(p => [p.id, p]))
  const slots = {}
  for (const { id: color, name } of cat.colors) {
    const row = v.slots[color]
    if (!listOf(row, cat.slots, cat.slots)) fail(400, `${name} 잠재력 칸이 잘못됐어요`)
    // 잠재력은 늘 최대 레벨(5)로 끼운다고 보고 레벨은 받지 않는다 — 칸마다 잠재력 id 또는 null
    slots[color] = row.map(x => {
      if (x == null) return null
      if (typeof x !== 'string' || byId.get(x)?.color !== color) fail(400, `${name} 칸에 없는 잠재력이 있어요`)
      return x
    })
  }
  if (!Object.values(slots).flat().some(Boolean)) fail(400, '잠재력을 한 칸 이상 넣어 주세요')
  return {
    title: text(v.title, 40, '제목'),
    chars: v.chars,
    positions: positionsOf(v.chars),
    body: text(v.body ?? '', 1000, '설명', 0, true),
    slots,
  }
}

/** 이 파티에서 쓰는 줄(entry)을 맨 앞으로. 프로필을 고쳐 그 줄이 없어졌으면 대표 그대로 */
const playing = (entries, i) => i > 0 && i < entries.length ? [entries[i], ...entries.filter((_, k) => k !== i)] : entries

/** 팀장이 직접 넣는 팀원: 게임 닉네임 · 캐릭터(+ 티어, 모르면 ''). 마이크는 모른다(null) */
function added(v) {
  if (!isObj(v)) fail(400, '넣을 팀원 정보가 없어요')
  const nick = text(v.nick, 20, '게임 닉네임')
  const tier = v.tier ?? ''
  if (tier !== '' && !CFG.tiers.includes(tier)) fail(400, '티어를 골라 주세요')
  if (typeof v.char !== 'string' || !PLAYERS.has(v.char)) fail(400, '한국 서버에 출시된 캐릭터만 고를 수 있어요')
  return { name: nick, mic: null, entries: [{ nick, tier, char: v.char }], added: true }
}

// ---------------------------------------------------------------- 감사 로그 — 무슨 일(label) · 바뀐 내용 줄(detail)

const BOARD_KO = { builds: '잠재력추천', videos: '영상', tactics: '커스텀 전술', tiers: '티어표', combos: '조합표' }
const AUDIT_LABEL = {
  'PUT /api/gate': '접근 비밀번호 변경', 'PUT /api/me/profile': '프로필 저장',
  'PUT /api/arena/signup': '아레나 신청', 'DELETE /api/arena/signup': '아레나 신청 취소', 'PUT /api/arena/plan': '아레나 편성 저장',
  'PUT /api/members/:id': '멤버 등급 변경', 'DELETE /api/members/:id': '멤버 탈퇴 처리',
  'POST /api/teams': '모집 팀 만들기', 'POST /api/teams/quick': '모집 빠른 참가', 'PUT /api/teams/:id': '모집 팀 정보 수정', 'DELETE /api/teams/:id': '모집 팀 해제',
  'POST /api/teams/:id/extend': '모집 팀 연장', 'POST /api/teams/:id/members': '모집 팀 가입', 'PUT /api/teams/:id/members/:id': '모집 참가 캐릭터 변경',
  'DELETE /api/teams/:id/members/:id': '모집 팀 나가기 · 내보내기',
  ...Object.fromEntries(Object.entries(BOARD_KO).flatMap(([k, ko]) => [
    [`POST /api/${k}`, `${ko} 글 쓰기`], [`PUT /api/${k}/:id`, `${ko} 글 수정`], [`DELETE /api/${k}/:id`, `${ko} 글 삭제`],
    [`POST /api/${k}/:id/like`, `${ko} 추천`], [`POST /api/${k}/:id/comments`, `${ko} 댓글 쓰기`], [`DELETE /api/${k}/:id/comments/:id`, `${ko} 댓글 삭제`],
  ])),
}
/** 'DELETE /api/builds/12/comments/5' → '잠재력추천 댓글 삭제' (모르는 요청은 null — 화면은 메서드 · 경로를 보여 준다) */
export const auditLabel = action => AUDIT_LABEL[action
  .replace(/^(\S+ \/api\/(?:teams|members|builds|videos|tactics|tiers|combos))\/(?!quick$)[^/]+/, '$1/:id')
  .replace(/\/(members|comments)\/[^/]+$/, '/$1/:id')] ?? null

const charKo = id => PLAYERS.get(id)?.short || PLAYERS.get(id)?.name || id
const roleKo = id => ARENA.roles.find(r => r.id === id)?.label ?? id
const rolesKo = roles => roles.map(roleKo).join(' · ') || '없음'
const CHOICE_KO = Object.fromEntries([...ARENA.slots, ...ARENA.extra].map(c => [c.id, c.short]))
const SLOT_KO = Object.fromEntries(ARENA.slots.map(s => [s.id, s.short]))
/** 두 목록 차이 「+새것 −빠진것」 — 같으면 '' */
const plusMinus = (a, b, name = String) => [...b.filter(x => !a.includes(x)).map(x => `+${name(x)}`), ...a.filter(x => !b.includes(x)).map(x => `−${name(x)}`)].join(' ')
/** 감사 로그에 남기는 사용자 글(제목 · 댓글)은 앞부분만 */
const clip = (t, n = 80) => [...t].length > n ? `${[...t].slice(0, n).join('')}…` : t

/** 프로필 저장 전(old: { discord_name, mic, entries } | null) · 후 → 바뀐 내용 줄. 계정 = 같은 닉네임 줄들, 첫 계정이 본계정 */
export function profileChanges(old, now) {
  const accts = entries => {
    const m = new Map()
    for (const e of entries) {
      const a = m.get(e.nick) || m.set(e.nick, { roles: e.roles ?? [], chars: [], bt: {} }).get(e.nick)
      a.chars.push(e.char)
      if (e.breakthrough) a.bt[e.char] = e.breakthrough
    }
    return m
  }
  const desc = a => `포지션 ${rolesKo(a.roles)} · ${a.chars.map(charKo).join(', ')}`
  const mic = on => on ? '사용' : '안 함'
  const after = accts(now.entries)
  if (!old) return [`프로필 만듦 — 이름 ${now.name} · 마이크 ${mic(now.mic)}`, ...[...after].map(([n, a]) => `계정 ${n}: ${desc(a)}`)]
  const before = accts(old.entries), out = []
  if (old.discord_name !== now.name) out.push(`표시 이름: ${old.discord_name} → ${now.name}`)
  if (old.mic !== now.mic) out.push(`마이크: ${mic(old.mic)} → ${mic(now.mic)}`)
  if (old.entries[0]?.nick !== now.entries[0]?.nick) out.push(`본계정: ${old.entries[0]?.nick ?? '-'} → ${now.entries[0]?.nick ?? '-'}`)
  for (const [n, a] of after) {
    const b = before.get(n)
    if (!b) { out.push(`계정 추가 ${n}: ${desc(a)}`); continue }
    if (b.roles.join() !== a.roles.join()) out.push(`${n} 포지션: ${rolesKo(b.roles)} → ${rolesKo(a.roles)}`)
    const pm = plusMinus(b.chars, a.chars, charKo)
    if (pm) out.push(`${n} 캐릭터 ${pm}`)
    else if (b.chars[0] !== a.chars[0]) out.push(`${n} 대표 캐릭터: ${charKo(b.chars[0])} → ${charKo(a.chars[0])}`)
    for (const c of a.chars) if (b.chars.includes(c) && (b.bt[c] ?? 0) !== (a.bt[c] ?? 0)) out.push(`${n} ${charKo(c)} 돌파: ${b.bt[c] ?? '-'} → ${a.bt[c] ?? '-'}`)
  }
  for (const n of before.keys()) if (!after.has(n)) out.push(`계정 삭제 ${n}`)
  return out
}

/** 아레나 신청 전(old | null) · 후({ slots, nicks, memo }) → 바뀐 내용 줄. 처음 신청이면 그대로 */
export function signupChanges(old, now) {
  const slots = s => s.map(c => CHOICE_KO[c] ?? c).join(' · ') || '-', nicks = n => n.join(', ') || '-'
  if (!old) return [`시간: ${slots(now.slots)}`, `계정: ${nicks(now.nicks)}`, now.memo && `메모: ${now.memo}`].filter(Boolean)
  return [
    old.slots.join() !== now.slots.join() && `시간: ${slots(old.slots)} → ${slots(now.slots)}`,
    old.nicks.join() !== now.nicks.join() && `계정: ${nicks(old.nicks)} → ${nicks(now.nicks)}`,
    old.memo !== now.memo && `메모: ${old.memo || '-'} → ${now.memo || '-'}`,
  ].filter(Boolean)
}

/**
 * 편성표 저장 전 · 후 → 계정마다 「닉네임: 토 1차 1팀 → 2팀」 · 「+닉네임: 토 2차 1팀」(넣음) · 「−닉네임: …」(뺌).
 * 한 시간대에서 빠지고 다른 시간대에 들어갔으면 한 줄(「닉네임: 토 1차 1팀 → 토 1.5차 2팀」). 앞 팀이 비어 번호가 당겨진 것도 옮긴 것으로 나온다
 */
export function planChanges(old, now) {
  const places = plan => {
    const m = new Map()
    for (const s of ARENA.slots) (plan?.[s.id] || []).forEach((tm, i) => tm.forEach(a => {
      const k = `${a.u}\n${a.n}`
      ;(m.get(k) || m.set(k, new Map()).get(k)).set(s.id, i + 1)
    }))
    return m
  }
  const before = places(old), after = places(now), out = [], at = (slot, team) => `${SLOT_KO[slot]} ${team}팀`
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(k) || new Map(), a = after.get(k) || new Map(), nick = k.split('\n')[1]
    for (const [s, t] of a) if (b.has(s) && b.get(s) !== t) out.push(`${nick}: ${at(s, b.get(s))} → ${t}팀`)
    const gone = [...b].filter(([s]) => !a.has(s)), added = [...a].filter(([s]) => !b.has(s))
    if (gone.length === 1 && added.length === 1) out.push(`${nick}: ${at(...gone[0])} → ${at(...added[0])}`)
    else out.push(...added.map(p => `+${nick}: ${at(...p)}`), ...gone.map(p => `−${nick}: ${at(...p)}`))
  }
  return out
}

/** 아레나 주 = 그 주 토요일 날짜(KST, 'YYYY-MM-DD'). 일요일 closeAt(21:30, 마지막 판이 끝나는 시각)이 지나면 다음 주 */
export function arenaWeek(ms) {
  const d = new Date(ms + 9 * 3_600_000)   // KST 시각을 UTC 칸으로 읽는다(한국은 서머타임이 없다)
  const [hh, mm] = ARENA.closeAt.split(':').map(Number)
  const dow = d.getUTCDay(), past = d.getUTCHours() * 60 + d.getUTCMinutes() >= hh * 60 + mm
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? (past ? 6 : -1) : 6 - dow))
  return d.toISOString().slice(0, 10)
}

/** 아레나 신청: 시간대(여럿 · 사유불참은 혼자) + 참가 계정(내 프로필의 게임 닉네임, 사유불참이면 없음) + 메모.
 *  nicks = 내 프로필의 계정 닉네임 → 주력 포지션 — 집계표가 1순위로 나누므로 참가 계정은 1순위가 있어야 한다 */
function arenaSignup(v, nicks) {
  if (!isObj(v)) fail(400, '신청 정보가 없어요')
  if (!listOf(v.slots, CHOICES.length, 1) || v.slots.some(s => !CHOICES.includes(s)) || new Set(v.slots).size !== v.slots.length) fail(400, '참석할 시간을 골라 주세요')
  const absent = v.slots.includes('absent')
  if (absent && v.slots.length > 1) fail(400, '사유불참은 다른 시간과 같이 고를 수 없어요')
  const picked = absent ? [] : v.nicks
  if (!absent && (!listOf(picked, nicks.size, 1) || picked.some(n => !nicks.has(n)) || new Set(picked).size !== picked.length)) fail(400, '참가할 계정을 내 프로필에서 골라 주세요')
  const noRole = picked.find(n => !nicks.get(n)?.length)
  if (noRole) fail(400, `「${noRole}」 계정의 주력 포지션(1순위)을 정해 주세요`)
  return { slots: CHOICES.filter(c => v.slots.includes(c)), nicks: picked, memo: text(v.memo ?? '', ARENA.memo, '메모', 0) }
}

/** 편성표: { 시간대: [[{ u, n }]] } — 신청한 계정만, 팀당 teamSize 명까지, 한 사람은 겹치는 시간대에 한 번(계정 둘을 동시에 못 한다). 빈 팀은 버린다 */
function arenaPlan(v, signups) {
  if (!isObj(v)) fail(400, '편성표 형식이 잘못됐어요')
  const ok = new Set(signups.flatMap(s => s.accounts.map(a => `${s.userId}\n${a.nick}`)))
  const out = {}, at = new Map()   // 사람 → 들어간 시간대들
  for (const [slot, teams] of Object.entries(v)) {
    if (!SLOTS.has(slot) || !listOf(teams, ARENA.maxTeams) || !teams.every(Array.isArray)) fail(400, '편성표 형식이 잘못됐어요')
    out[slot] = teams.filter(team => team.length).map(team => {
      if (team.length > ARENA.teamSize) fail(400, `한 팀은 ${ARENA.teamSize}명까지예요`)
      return team.map(a => {
        if (!isObj(a) || typeof a.u !== 'string' || typeof a.n !== 'string') fail(400, '편성표 형식이 잘못됐어요')
        if (!ok.has(`${a.u}\n${a.n}`)) fail(409, STALE_PLAN)   // 그새 신청을 취소했거나 계정을 뺐다
        const mine = at.get(a.u) || []
        if (mine.some(x => clash(x, slot))) fail(400, '한 사람은 겹치는 시간대에 한 번만 넣을 수 있어요')
        at.set(a.u, [...mine, slot])
        return { u: a.u, n: a.n }
      })
    })
  }
  return out
}

// ---------------------------------------------------------------- 비회원 비밀번호

// 솔트 붙인 scrypt 해시로만 저장한다. 비동기 scrypt 는 워커 스레드에서 돌아 CPU 시간 한도에 안 잡히고 다른 요청도 막지 않는다
async function hashPassword(pw) {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('base64url')}$${(await scryptAsync(pw, salt, 32)).toString('base64url')}`
}
async function passwordOk(pw, stored) {
  const [, salt, hash] = stored.split('$')
  return timingSafeEqual(await scryptAsync(pw, Buffer.from(salt, 'base64url'), 32), Buffer.from(hash, 'base64url'))
}

/** 비회원 만들기 · 가입: 그 기기에 둔 간이 프로필(이름 · 마이크 · 계정 줄) + 관리 비밀번호 → 행에 담을 guest + 해시 */
async function guestOf(v) {
  const p = profile(isObj(v) ? v.guest : null)
  if (p.name == null) fail(400, '이름을 입력해 주세요')
  const pw = v.password, n = typeof pw === 'string' ? [...pw].length : 0
  if (typeof pw !== 'string' || !pw.trim() || CONTROL.test(pw) || n < PW_LEN[0] || n > PW_LEN[1]) fail(400, `비밀번호는 ${PW_LEN[0]}~${PW_LEN[1]}자로 입력해 주세요`)
  return { guest: { name: p.name, mic: p.mic, entries: p.entries }, hash: await hashPassword(pw) }
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
  return async (path, { method = 'GET', body, prefer } = {}) => {
    const where = `${method} ${path.split('?')[0]}`
    let res, raw, json, tries = 0
    for (;;) {
      try {
        res = await fetch(base + path, { method, headers: prefer ? { ...headers, prefer } : headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(8000) })
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

// 팀원은 팀장 먼저, 들어온 순. 계정 팀원의 이름 · 마이크 · 계정은 프로필을 조인한다 — 프로필을 고치면 파티에도 바로 보인다.
// 계정 없는 팀원은 행의 guest. auth_user_id · pw_hash 는 고르지 않는다
const MEMBERS = 'members:recruit_members(id,discord_user_id,leader,joined_at,entry,guest,profile:recruit_profiles(name:discord_name,mic,entries))'
  + '&members.order=leader.desc,joined_at.asc,id.asc'
/** 팀원 한 줄을 고르는 Data API 조건 — 계정 팀원은 계정 ID, 계정 없는 팀원은 행 번호(g<id>) */
const memberRow = (teamId, userId) => `team_id=eq.${enc(teamId)}&${GUEST_ID.test(userId) ? `id=eq.${GUEST_ID.exec(userId)[1]}` : `discord_user_id=eq.${enc(userId)}`}`

// ---------------------------------------------------------------- API

/**
 * (request: Request) => Promise<Response> 를 만든다. 경로는 /api/... (Edge Function 은 앞의 /recruit 를 떼고 넘긴다).
 * now 는 테스트가 시간을 돌리려고, fetch 는 가짜 Data API · Auth · 디스코드를 끼우려고 받는다. waitUntil = 응답 뒤에도 끝내야 할 일(디스코드 알림).
 * 워커 메모리에는 로그인 확인 결과(60초)만 둔다 — 제한 횟수 · 방 배정 · 1인 1파티는 DB 가 센다.
 */
export function createHandler({ env = {}, now = Date.now, fetch = globalThis.fetch, waitUntil = p => p, log = console.log, potentials = potentialsData, ipOf = () => '' } = {}) {
  const db = supabase({ url: env.SUPABASE_URL, key: keyOf(env, 'SUPABASE_SECRET_KEY'), fetch, log })
  const publishable = keyOf(env, 'SUPABASE_PUBLISHABLE_KEY')
  const botKey = Buffer.from(env.TNAB_BOT_KEY || '')
  const notifier = createNotifier({
    webhookUrl: env.DISCORD_WEBHOOK_URL, siteUrl: env.SITE_URL, guildId: env.DISCORD_GUILD_ID, players: PLAYERS, modes: CFG.modes, fetch, waitUntil, log,
  })
  const rooms = () => voiceRooms({ botToken: env.DISCORD_BOT_TOKEN, guildId: env.DISCORD_GUILD_ID, categoryId: env.DISCORD_VOICE_CATEGORY_ID, fetch, now, log })
  // 화면이 다른 도메인(GitHub Pages)에서 부른다 — 목록에 있는 Origin 만 그대로 돌려준다(쉼표로 여러 개)
  const origins = (env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)
  // 요청 수 제한 키로만 쓴다(권한 판단에는 안 쓴다). 헤더가 없으면 '-' 한 통으로 센다(제한이 풀리지 않게). 긴 헤더로 키를 부풀리지 못하게 자른다
  const ipKey = request => rateKey(String(ipOf(request) || '').trim().slice(0, 64)) || '-'

  // ------------------------------------------------ 신원: { id, name, authUserId, admin, guest? }
  // id = 디스코드 ID(디스코드를 연결한 계정 · 봇) · k<카카오 회원번호>(카카오로만 로그인한 계정) · g<팀원 행 번호>(비회원)

  const authMemo = new Map()   // sha256(토큰) → { user, until }
  const actors = new WeakMap()   // 요청 → 확인한 신원 — 응답 뒤 감사 로그에 남길 사람
  const notes = new WeakMap()    // 요청 → { target, detail } — 처리하는 쪽이 감사 로그에 붙이는 무엇에 · 바뀐 내용 줄
  const note = (request, target, detail = []) => notes.set(request, { target, detail: detail.filter(Boolean) })
  /**
   * 웹: Supabase Auth 에 토큰을 보여 사용자를 받는다. ID 는 identities(디스코드 먼저, 없으면 카카오)에서만 꺼낸다 —
   * user_metadata 는 사용자가 updateUser 로 고칠 수 있어 ID 로는 믿지 않는다(본인이 고르는 표시 이름에만 쓴다).
   * 디스코드 계정에 카카오를 연결해도 디스코드 ID 그대로라 프로필 · 파티 · 글이 이어지고, 봇과도 같은 사람이다.
   * ponytail: 카카오로 먼저 쓰던 계정에 디스코드가 붙으면(같은 이메일 자동 연결 등) ID 가 디스코드로 바뀌어 옛 프로필 · 글과 끊긴다 —
   * 화면은 디스코드 계정에 카카오를 붙이는 연결만 연다. 반대 방향이 필요해지면 처음 쓴 ID 를 DB 에 묶어 둘 것
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
    const ids = Array.isArray(body.identities) ? body.identities : []
    const discord = ids.find(i => i?.provider === 'discord'), kakao = ids.find(i => i?.provider === 'kakao')
    const clean = s => typeof s === 'string' ? s.replace(/[\x00-\x1f\x7f]/g, '').trim() : ''
    const authUserId = matches(UUID, body.id) ? body.id : null
    let user
    if (matches(SNOWFLAKE, discord?.id)) {
      const d = isObj(discord.identity_data) ? discord.identity_data : {}
      const name = [d.custom_claims?.global_name, d.full_name, d.name].map(clean).find(Boolean) || 'Discord 사용자'
      // 같은 서버 사람들은 별명으로 서로를 안다 — 별명이 있으면 그것을 이름으로 쓴다(봇은 이미 별명을 보낸다)
      const nick = await guildNick({ botToken: env.DISCORD_BOT_TOKEN, guildId: env.DISCORD_GUILD_ID, userId: discord.id, fetch, now, log })
      user = { id: discord.id, name: nick || [...name].slice(0, 80).join(''), authUserId, admin: false }
    } else if (matches(/^\d{1,20}$/, kakao?.id)) {
      // 카카오 닉네임은 대개 실명이라 쓰지 않는다 — 처음 로그인할 때 화면이 받아 user_metadata.nickname 에 둔 이름
      const nick = [...clean(isObj(body.user_metadata) ? body.user_metadata.nickname : '')].slice(0, 32).join('')
      user = { id: `k${kakao.id}`, name: nick && !LINK.test(nick) ? nick : '카카오 사용자', authUserId, admin: false }
    } else fail(401, LOGIN)   // 디스코드 · 카카오가 아닌 계정(또는 연결을 끊은 계정)
    if (authMemo.size >= AUTH_MEMO.max) authMemo.clear()   // 오래된 것부터 고르는 대신 통째로 — 다음 요청이 Auth 를 한 번 더 부를 뿐
    authMemo.set(key, { user, until: now() + AUTH_MEMO.ms })
    return user
  }

  /**
   * 봇: 봇 키가 맞으면 헤더의 디스코드 ID · 이름을 믿는다(봇이 interaction.user 에서 넣는다). 관리자 여부도 봇이 디스코드 권한을 보고 넣는다.
   * 키가 32자보다 짧거나 없으면 봇 인증을 끈다 — 짧은 키는 찍어 맞힐 수 있다.
   */
  const botKeyOk = key => {
    const got = Buffer.from(key)
    return botKey.length >= 32 && got.length === botKey.length && timingSafeEqual(got, botKey)
  }
  function botUser(request, key) {
    if (!botKeyOk(key)) fail(401, LOGIN)
    const h = request.headers, id = h.get('x-discord-user') || ''
    if (!SNOWFLAKE.test(id)) fail(400, '디스코드 사용자 ID 가 잘못됐어요')
    let name = ''
    try { name = decodeURIComponent(h.get('x-discord-name') || '').trim() } catch {}   // 헤더는 latin1 이라 봇이 퍼센트 인코딩해 보낸다
    if (!name || CONTROL.test(name) || [...name].length > 80) fail(400, '디스코드 이름이 잘못됐어요')
    return { id, name, authUserId: null, admin: h.get('x-discord-admin') === '1' }
  }

  /**
   * 비회원: Guest g<팀원 행 번호>:<퍼센트 인코딩한 비밀번호>. 그 행의 비밀번호가 맞으면 그 팀원이다 — 행 번호가 그 팀 안의 userId 라
   * 다른 팀에는 권한이 없다. 틀린 비밀번호는 한 IP 가 한 팀원에 5번, 그 팀원 전체로 20번(10분)에서 막는다 —
   * 팀원 단위로만 막으면 링크를 받은 누구나 5번 틀려서 그 사람을 10분씩 잠글 수 있다. 이미 막힌 IP 의 요청은 전체에 세지 않는다
   */
  async function guestUser(request, cred) {
    const [, mid, raw] = /^g(\d{1,15}):(.+)$/.exec(cred) || []
    let pw = ''
    try { pw = decodeURIComponent(raw || '') } catch {}
    if (!mid || !pw) fail(401, LOGIN)
    const [row] = await db(`/recruit_members?select=guest,pw_hash&id=eq.${mid}`)
    if (!row?.pw_hash) fail(401, '없는 팀원이거나 비밀번호로 관리할 수 없는 팀원이에요')
    // 먼저 한 번 센다 — 확인과 증가 사이에 scrypt(await)가 끼면 동시에 온 요청이 전부 '아직 0번'을 보고 통과한다. 맞으면 되돌린다
    const keys = [`pw g${mid} ${ipKey(request)}`, `pwm g${mid}`]
    if (await hit(keys[0], PW_LIMIT.windowMs) > PW_LIMIT.max || await hit(keys[1], PW_LIMIT.windowMs) > PW_LIMIT.memberMax) {
      fail(429, '비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요')
    }
    if (!await passwordOk(pw, row.pw_hash)) fail(403, '비밀번호가 맞지 않아요')
    await Promise.all(keys.map(k => hit(k, PW_LIMIT.windowMs, -1)))
    return { id: `g${mid}`, name: row.guest.name, authUserId: null, admin: false, guest: true }
  }

  /** guestOk = 비회원 비밀번호도 받는 요청(GUEST_ACTIONS). 나머지는 계정만 */
  async function identity(request, guestOk = false) {
    const [, scheme, cred] = /^(Bearer|Bot|Guest)\s+(\S+)$/i.exec(request.headers.get('authorization') || '') || []
    if (!scheme) fail(401, LOGIN)
    const kind = scheme.toLowerCase()
    const user = kind === 'guest' ? guestOk ? await guestUser(request, cred) : fail(401, LOGIN) : kind === 'bot' ? botUser(request, cred) : await webUser(cred)
    actors.set(request, user)
    return user
  }

  /**
   * 감사 로그(audit_log) — 바꾼 요청(GET 이 아니고 성공)마다 누가 · 무엇을(메서드 · 경로 · 한글 이름) · 무엇에(target) · 바뀐 내용 줄(detail, 60줄까지).
   * 본문은 통째로 안 남긴다(비밀번호를 싣는 요청이 있다) — target · detail 은 처리하는 쪽이 note() 로 골라 붙인다.
   * 응답 뒤에 넣고, 실패해도 요청에는 영향이 없다(함수 로그만). 접근 비밀번호 입력(POST /api/gate)은 바꾸는 일이 아니라 뺀다
   */
  function audit(request, status) {
    const { pathname } = new URL(request.url), action = `${request.method} ${pathname}`
    if (request.method === 'GET' || status >= 300 || action === 'POST /api/gate') return
    const user = actors.get(request), { target = null, detail = [] } = notes.get(request) || {}
    const lines = detail.length > 60 ? [...detail.slice(0, 59), `…외 ${detail.length - 59}줄`] : detail
    waitUntil(db('/audit_log', { method: 'POST', body: {
      at: now(), user_id: user?.id ?? null, user_name: user?.name ?? null, action, status, label: auditLabel(action), target, detail: lines.length ? lines : null,
    } })
      .catch(e => log(`감사 로그 실패 ${action}: ${errText(e)}`)))
  }

  // ------------------------------------------------ 접근 비밀번호 (site_gate) · 마스터 (site_masters)
  // 켜져 있으면(줄이 있으면) 모든 API 가 ?g=<토큰> 을 싣는다 — 헤더로 보내면 공개 GET 도 preflight 가 붙어 호출이 두 배가 된다.
  // 토큰은 비밀번호를 맞히면 받고, 마스터가 비밀번호를 바꾸면 새로 만들어져 모두 다시 입력한다

  let gateMemo = null   // { row, until }
  async function gateRow(fresh = false) {
    if (!fresh && gateMemo && gateMemo.until > now()) return gateMemo.row
    const [row] = await db('/site_gate?select=code,token,changed_at&id=eq.1')
    gateMemo = { row: row || null, until: now() + GATE_MEMO_MS }
    return gateMemo.row
  }
  const same = (a, b) => {
    const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''))
    return x.length === y.length && timingSafeEqual(x, y)
  }
  /** 이 요청이 들어와도 되는지 — 꺼져 있거나, 토큰이 맞거나, 봇 키가 맞으면(봇은 서버끼리라 비밀번호를 모른다) */
  async function gatePass(request) {
    const [, bot] = /^Bot\s+(\S+)$/i.exec(request.headers.get('authorization') || '') || []
    if (bot && botKeyOk(bot)) return true
    const row = await gateRow()
    return !row || same(new URL(request.url).searchParams.get('g'), row.token)
  }
  const isMaster = async user => !user.guest && (await db(`/site_masters?select=user_id&user_id=eq.${enc(user.id)}`)).length > 0
  // 관리자(아레나 편성) = site_admins 또는 마스터
  const inAdmins = async user => !user.guest && (await db(`/site_admins?select=user_id&user_id=eq.${enc(user.id)}`)).length > 0
  const isAdmin = async user => (await Promise.all([isMaster(user), inAdmins(user)])).some(Boolean)
  function gateCode(v) {
    const code = typeof v === 'string' ? v.trim() : '', n = [...code].length
    if (CONTROL.test(code) || n < GATE_LEN[0] || n > GATE_LEN[1]) fail(400, `접근 비밀번호는 ${GATE_LEN[0]}~${GATE_LEN[1]}자로 정해 주세요`)
    return code
  }

  async function gate(request) {
    switch (request.method) {
      case 'GET': {   // 화면이 처음 열릴 때: 켜져 있는지 · 들고 있는 토큰이 아직 맞는지
        const row = await gateRow()
        return [200, { on: !!row, ok: !row || same(new URL(request.url).searchParams.get('g'), row.token) }]
      }
      case 'POST': {   // 비밀번호 입력 → 토큰. 꺼져 있으면 token null
        const body = await readJson(request)   // JSON 이 아니면 세기 전에 415 — 폼 POST 로 남의 IP 한도를 태우지 못하게
        const row = await gateRow(true)
        if (!row) return [200, { token: null }]
        // 먼저 세고, 맞으면 되돌린다 — 확인과 증가 사이에 동시 요청이 끼어도 한도를 넘지 못한다
        const key = `gate ${ipKey(request)}`
        if (await hit(key, GATE_LIMIT.windowMs) > GATE_LIMIT.max) fail(429, '비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요')
        if (!same(isObj(body) && typeof body.code === 'string' ? body.code.trim() : '', row.code)) fail(403, '비밀번호가 맞지 않아요')
        await hit(key, GATE_LIMIT.windowMs, -1)
        return [200, { token: row.token }]
      }
      case 'PUT': {   // 마스터: 비밀번호 바꾸기(처음이면 켜기). 새 토큰을 돌려줘 바꾼 사람의 브라우저는 그대로 들어와 있다
        const user = await identity(request)
        if (!await isMaster(user)) fail(403, '마스터만 접근 비밀번호를 바꿀 수 있어요')
        if (await hit(`w ${user.id}`, LIMIT.windowMs) > LIMIT.max) fail(429, '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요')
        const body = await readJson(request)
        const row = { id: 1, code: gateCode(isObj(body) ? body.code : null), token: randomBytes(24).toString('base64url'), changed_at: now(), changed_by: user.id }
        await db('/site_gate?on_conflict=id', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates' })
        gateMemo = { row, until: now() + GATE_MEMO_MS }
        return [200, { code: row.code, token: row.token, changedAt: row.changed_at }]
      }
    }
    fail(404, '없는 주소예요')
  }

  // ------------------------------------------------ 팀 · 프로필 읽기

  // 클라이언트가 보는 팀 모양은 이것 하나뿐 — 필드를 골라 새로 만든다(auth_user_id 같은 내부 값은 넣지 않는다).
  // 목록 행은 tactic 대신 preset · name 만 온다.
  // kind: user 계정 · guest 비회원(비밀번호로 관리) · added 팀장이 넣은 팀원(마이크 null, 티어 '' 일 수 있다)
  function view(t) {
    const members = t.members.map(m => {
      const p = m.profile || m.guest
      return {
        userId: m.discord_user_id ?? `g${m.id}`, name: p.name, mic: p.mic, entries: playing(p.entries, m.entry), leader: m.leader, joinedAt: m.joined_at,
        kind: !m.guest ? 'user' : m.guest.added ? 'added' : 'guest',
      }
    })
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
  const hit = (key, windowMs, add = 1) => db('/rpc/recruit_hit', { method: 'POST', body: { p_key: key, p_now: now(), p_window: windowMs, p_add: add } })

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
    return { old: p.member ? await findTeam(p.member.team_id, t) : null, entries: p.entries.length }
  }

  /** 어떤 캐릭터(프로필 몇 번째 줄)로 들어가는지. 안 보내면 대표(0) — 봇 · 옛 화면 */
  const entryOf = (body, entries) => {
    const e = isObj(body) && body.entry != null ? body.entry : 0
    if (!Number.isInteger(e) || e < 0 || e >= entries) fail(400, '참가할 캐릭터를 다시 골라 주세요')
    return e
  }

  // 1인 1파티로 빠진 기존 팀 알림. 스냅샷은 RPC 전에 읽은 것 — 그 사이 다른 팀으로 바뀌었으면(드묾) 알림만 건너뛴다
  function leftNotice(left, old, userId) {
    if (!left || old?.id !== left.teamId) return
    const before = view(old), me = before.members.find(m => m.userId === userId)
    if (left.disbanded) notifier.teamDisbanded(before, 'move')
    else if (me) notifier.memberLeft({ ...before, members: before.members.filter(m => m !== me) }, me, 'move')
  }

  /** g = 계정 없는 팀원(비회원 · 팀장이 넣은 팀원)이면 { guest, hash } 이고 user · old 는 null. 돌려주는 member = 넣은 사람의 userId */
  async function join(id, user, old, t, entry = 0, g = null) {
    // 만료 · 이미 이 팀 · 정원 확인, 기존 팀에서 빠지기, INSERT 를 RPC 가 전역 잠금 안에서 한 트랜잭션으로 한다 —
    // 여러 요청이 동시에 와도 정원을 넘지 않고, 같은 사람이 두 팀에 남지 않는다
    const r = await db('/rpc/recruit_join_team', {
      method: 'POST', body: { p_team: id, p_actor: user?.id ?? null, p_now: t, p_size: CFG.teamSize, p_entry: entry, p_guest: g?.guest ?? null, p_pw: g?.hash ?? null },
    })
    const team = view(await teamOf(id, t)), member = user?.id ?? `g${r.member}`
    if (user) leftNotice(r.left, old, user.id)
    notifier.memberJoined(team, member, r.count)
    return { team, left: r.left, member }
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

  // ------------------------------------------------ 게시판(잠재력추천 · 영상 · 커스텀 전술 · 티어표 · 조합표) — 읽기는 공개, 쓰기 · 추천 · 댓글은 로그인
  // 글 · 추천 · 댓글 표가 게시판마다 한 벌씩 있고 모양이 같다. 다른 것은 표 이름 · 글 검증 · 게시판만의 칸 · 목록 필터

  const BOARDS = {
    builds: {
      table: 'potential_builds', likes: 'potential_likes', comments: 'potential_comments', fk: 'build_id', rpc: ['potential_toggle_like', 'p_build'],
      one: 'build', cols: 'slots', validate: v => build(v, potentials), extra: b => ({ slots: b.slots }),
    },
    videos: {
      table: 'videos', likes: 'video_likes', comments: 'video_comments', fk: 'video_id', rpc: ['video_toggle_like', 'p_video'],
      one: 'video', cols: 'youtube,category', validate: video, extra: b => ({ youtube: b.youtube, category: b.category }),
      neighbors: true,   // 글 화면의 이전 · 다음 영상(올린 순서)
      // ?cat=<분류> — 홈의 "최신 강의"
      filter: q => CATEGORIES.has(q.get('cat')) ? `&category=eq.${q.get('cat')}` : '',
      // 같은 영상은 한 번만(youtube unique). 동시에 두 번 올리면 unique 위반이 500 으로 난다 — ponytail: 드물어서 미리 한 번 보는 것으로 충분
      async unique(v, id) {
        const [dup] = await db(`/videos?select=id&youtube=eq.${v.youtube}${id ? `&id=neq.${id}` : ''}`)
        if (dup) fail(409, '이미 올라온 영상이에요')
      },
    },
    tactics: {   // 댓글 없음 — 전술판 프리셋 목록의 "커스텀 전술"
      table: 'custom_tactics', likes: 'custom_tactic_likes', comments: null, fk: 'tactic_id', rpc: ['custom_tactic_toggle_like', 'p_tactic'],
      one: 'tactic', cols: 'preset', validate: customTactic, extra: b => ({ preset: b.preset, board: b.board }),
    },
    tiers: {   // 목록 카드에 작은 티어표를 그리려고 목록에도 tiers 를 준다
      table: 'tier_lists', likes: 'tier_list_likes', comments: 'tier_list_comments', fk: 'list_id', rpc: ['tier_list_toggle_like', 'p_list'],
      one: 'tier', cols: 'tiers', validate: tierList, extra: b => ({ tiers: b.tiers }),
    },
    combos: {   // 목록 카드에 상대 캐릭터를 보여 주려고 목록에도 준다
      table: 'combos', likes: 'combo_likes', comments: 'combo_comments', fk: 'combo_id', rpc: ['combo_toggle_like', 'p_combo'],
      one: 'combo', cols: 'builds,matchups', validate: combo, extra: b => ({ builds: b.builds, matchups: b.matchups }),
    },
  }
  const nameOf = async user => (await mine(user))?.discord_name ?? user.name

  async function board(request, [, kind, id, sub, cid], t) {
    const B = BOARDS[kind], { searchParams: q } = new URL(request.url), method = request.method
    const action = [method, id && 'item', sub, cid && 'comment'].filter(Boolean).join(' ')
    const known = ['GET', 'POST', 'GET item', 'PUT item', 'DELETE item', 'POST item like', 'POST item comments', 'DELETE item comments comment']
    if (!known.includes(action) || (sub === 'comments' && !B.comments)) fail(404, '없는 주소예요')
    const view = b => ({
      id: b.id, authorId: b.author_id, author: b.author_name, title: b.title, chars: b.chars, body: b.body,
      likes: b.likes, comments: b.comments, createdAt: b.created_at, updatedAt: b.updated_at, ...B.extra(b),
    })
    const itemOf = async id => (await db(`/${B.table}?select=*&id=eq.${id}`))[0] || fail(404, '글을 찾을 수 없어요')

    // ?char=<id> · ?pos=1~5 · ?sort=new(기본)|likes · ?limit=1~100 · ?ids=1,2,3(30개까지 — 조합표가 고른 잠재력추천 글만 한 번에 읽는다) (+ 게시판별 필터)
    if (action === 'GET') {
      const char = q.get('char'), pos = q.get('pos'), ids = q.get('ids'), limit = Math.min(MAX_LIST, Math.max(1, +q.get('limit') || MAX_LIST))
      const order = q.get('sort') === 'likes' ? 'likes.desc,id.desc' : 'id.desc'
      const rows = await db(`/${B.table}?select=id,author_id,author_name,title,chars,likes,comments,created_at,updated_at,${B.cols}`
        + (char && PLAYERS.has(char) ? `&chars=cs.${enc(`{${char}}`)}` : '')
        + (/^[1-5]$/.test(pos || '') ? `&positions=cs.${enc(`{${pos}}`)}` : '')
        + (/^\d{1,15}(?:,\d{1,15}){0,29}$/.test(ids || '') ? `&id=in.(${ids})` : '')
        + (B.filter?.(q) || '')
        + `&order=${order}&limit=${limit}`)
      return [200, { [kind]: rows.map(view) }]
    }
    if (action === 'GET item') {
      // 이전 = 바로 전에 올라온 글, 다음 = 바로 뒤에 올라온 글 — { id, title } | null
      const near = (op, dir) => B.neighbors ? db(`/${B.table}?select=id,title&id=${op}.${id}&order=id.${dir}&limit=1`).then(r => r[0] || null) : null
      const [b, comments, prev, next] = await Promise.all([
        itemOf(id), B.comments ? db(`/${B.comments}?select=id,author_id,author_name,body,created_at&${B.fk}=eq.${id}&order=id.asc`) : [], near('lt', 'desc'), near('gt', 'asc'),
      ])
      // 로그인 토큰을 붙여 부르면 내가 추천했는지도 준다. 토큰이 틀려도 글은 보여 준다
      let liked = false
      if (request.headers.has('authorization')) {
        const user = await identity(request).catch(() => null)
        liked = !!user && (await db(`/${B.likes}?select=user_id&${B.fk}=eq.${id}&user_id=eq.${user.id}`)).length > 0
      }
      return [200, {
        [B.one]: view(b), liked, ...(B.neighbors && { prev, next }),
        comments: comments.map(c => ({ id: c.id, authorId: c.author_id, author: c.author_name, body: c.body, createdAt: c.created_at })),
      }]
    }

    const user = await identity(request)
    if (await hit(`w ${user.id}`, LIMIT.windowMs) > LIMIT.max) fail(429, '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요')
    const mineOrAdmin = (authorId, what) => { if (authorId !== user.id && !user.admin) fail(403, `내가 쓴 ${what}만 고치거나 지울 수 있어요`) }

    switch (action) {
      case 'POST': {
        const v = B.validate(await readJson(request))
        await B.unique?.(v)
        const [b] = await db(`/${B.table}`, {
          method: 'POST', prefer: 'return=representation', body: { ...v, author_id: user.id, author_name: await nameOf(user), created_at: t, updated_at: t },
        })
        note(request, `#${b.id} ${clip(b.title)}`, [b.chars?.length && `캐릭터: ${b.chars.map(charKo).join(', ')}`])
        return [201, { [B.one]: view(b) }]
      }
      case 'PUT item': {
        const v = B.validate(await readJson(request)), old = await itemOf(id)
        mineOrAdmin(old.author_id, '글')
        await B.unique?.(v, id)
        await db(`/${B.table}?id=eq.${id}`, { method: 'PATCH', body: { ...v, author_name: await nameOf(user), updated_at: t } })
        const b = await itemOf(id), pm = plusMinus(old.chars || [], b.chars || [], charKo)
        note(request, `#${id} ${clip(b.title)}`, [
          old.author_id !== user.id && `${old.author_name} 님의 글`, old.title !== b.title && `제목: ${clip(old.title)} → ${clip(b.title)}`, pm && `캐릭터 ${pm}`,
          old.body !== b.body && '내용 수정', JSON.stringify(B.extra(old)) !== JSON.stringify(B.extra(b)) && '그 밖의 칸 수정',
        ])
        return [200, { [B.one]: view(b) }]
      }
      case 'DELETE item': {
        const old = await itemOf(id)
        mineOrAdmin(old.author_id, '글')
        await db(`/${B.table}?id=eq.${id}`, { method: 'DELETE' })   // 추천 · 댓글은 cascade
        note(request, `#${id} ${clip(old.title)}`, [old.author_id !== user.id && `${old.author_name} 님의 글`])
        return [200, { ok: true }]
      }
      case 'POST item like': {
        const b = await itemOf(id)   // 없는 글이면 여기서 404(RPC 의 PT404 는 팀 문구라 동시 삭제 때만 난다)
        const r = await db(`/rpc/${B.rpc[0]}`, { method: 'POST', body: { [B.rpc[1]]: +id, p_user: user.id } })
        note(request, `#${id} ${clip(b.title)}`, [r?.liked === false ? '추천 취소' : '추천'])
        return [200, r]
      }
      case 'POST item comments': {
        const v = await readJson(request)
        const body = text(isObj(v) ? v.body : null, 500, '댓글', 1, true)
        const b = await itemOf(id)
        await db(`/${B.comments}`, { method: 'POST', body: { [B.fk]: +id, author_id: user.id, author_name: await nameOf(user), body, created_at: t } })
        note(request, `#${id} ${clip(b.title)}`, [`「${clip(body)}」`])
        return [201, { ok: true }]
      }
      case 'DELETE item comments comment': {
        const [[c], b] = await Promise.all([db(`/${B.comments}?select=author_id,author_name,body&id=eq.${cid}&${B.fk}=eq.${id}`), itemOf(id)])
        mineOrAdmin((c || fail(404, '댓글을 찾을 수 없어요')).author_id, '댓글')
        await db(`/${B.comments}?id=eq.${cid}`, { method: 'DELETE' })
        note(request, `#${id} ${clip(b.title)}`, [`「${clip(c.body)}」`, c.author_id !== user.id && `${c.author_name} 님의 댓글`])
        return [200, { ok: true }]
      }
    }
  }

  // ------------------------------------------------ 아레나전 — 보기는 공개, 신청은 로그인(프로필 필요), 편성표는 관리자

  // 신청 한 줄 = 그 사람의 프로필을 조인한다 — 계정(게임 닉네임)의 캐릭터 · 표시 이름은 늘 지금 프로필 것. 프로필에서 빠진 닉네임은 안 보인다
  // owner = 본계(프로필 첫 줄) 닉네임 — 길드에서는 본계 닉네임으로 사람을 안다. 계정: 주력 포지션 · 캐릭터 · 돌파({ 캐릭터: 1~7 })
  const signupsOf = async week => (await db(`/arena_signups?select=user_id,slots,nicks,memo,updated_at,profile:recruit_profiles(name:discord_name,entries)&week=eq.${week}&order=created_at.asc,user_id.asc`))
    .map(s => ({
      userId: s.user_id, name: s.profile.name, owner: s.profile.entries[0]?.nick ?? s.profile.name, slots: s.slots, memo: s.memo, updatedAt: s.updated_at,
      accounts: s.nicks.map(nick => {
        const rows = s.profile.entries.filter(e => e.nick === nick)
        return { nick, roles: rows[0]?.roles ?? [], chars: rows.map(e => e.char), bt: Object.fromEntries(rows.filter(e => e.breakthrough).map(e => [e.char, e.breakthrough])) }
      }).filter(a => a.chars.length),
    }))

  async function arena(request, sub, t) {
    const action = [request.method, sub].filter(Boolean).join(' ')
    if (!['GET', 'GET mine', 'PUT signup', 'DELETE signup', 'PUT plan'].includes(action)) fail(404, '없는 주소예요')
    const cur = arenaWeek(t)

    // ?w=YYYY-MM-DD(그 주 토요일) — 없으면 이번 주. 신청 · 편성은 이번 주만, 지난 주는 보기만
    if (action === 'GET') {
      const w = new URL(request.url).searchParams.get('w') || ''
      const week = WEEK.test(w) && !Number.isNaN(Date.parse(w)) ? w : cur
      const [signups, [plan], members] = await Promise.all([
        signupsOf(week),
        db(`/arena_plans?select=plan,updated_at&week=eq.${week}`),
        // ponytail: 최근에 프로필을 고친 1000명까지만 센다 — 길드 인원이면 넉넉하다
        week === cur ? db('/recruit_profiles?select=discord_user_id,discord_name,main:entries->0->>nick&order=updated_at.desc&limit=1000') : [],
      ])
      const live = new Set(signups.flatMap(s => s.accounts.map(a => `${s.userId}\n${a.nick}`)))
      const signed = new Set(signups.map(s => s.userId))
      return [200, {
        week, current: cur, signups,
        // 그새 신청을 취소했거나 계정을 뺀 줄은 편성표에서도 안 보인다(관리자가 다음에 저장하면 빠진다)
        plan: Object.fromEntries(Object.entries(plan?.plan || {}).map(([slot, teams]) => [slot, teams.map(tm => tm.filter(a => live.has(`${a.u}\n${a.n}`)))])),
        planAt: plan?.updated_at ?? null,
        missing: members.filter(p => !signed.has(p.discord_user_id)).map(p => p.main || p.discord_name),   // 프로필은 있는데 이번 주 신청이 없는 사람(본계 닉네임)
      }]
    }

    const user = await identity(request)
    if (action === 'GET mine') {   // 마이페이지 신청 이력 — 최근 10주 + 그 주 편성표에서 내 자리
      const rows = await db(`/arena_signups?select=week,slots,nicks,memo&user_id=eq.${enc(user.id)}&order=week.desc&limit=10`)
      const plans = rows.length ? await db(`/arena_plans?select=week,plan&week=in.(${rows.map(r => r.week).join(',')})`) : []
      const planOf = new Map(plans.map(p => [p.week, p.plan]))
      return [200, {
        current: cur,
        history: rows.map(r => ({
          ...r,
          assigned: Object.entries(planOf.get(r.week) || {}).flatMap(([slot, teams]) => teams.flatMap((tm, i) => tm.filter(a => a.u === user.id).map(a => ({ slot, team: i + 1, nick: a.n })))),
        })),
      }]
    }
    const planning = action === 'PUT plan'
    if (await hit(`${planning ? 'plan' : 'w'} ${user.id}`, LIMIT.windowMs) > (planning ? PLAN_LIMIT.max : LIMIT.max)) fail(429, '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요')

    switch (action) {
      case 'PUT signup': {
        const body = await readJson(request)
        const [p, [old]] = await Promise.all([mine(user), db(`/arena_signups?select=slots,nicks,memo&week=eq.${cur}&user_id=eq.${enc(user.id)}`)])
        if (!p) fail(428, NO_PROFILE)
        const v = arenaSignup(body, new Map([...p.entries].reverse().map(e => [e.nick, e.roles ?? []])))   // 뒤집어 넣어 계정의 첫 줄 값이 남는다
        // created_at 은 안 보낸다 — 처음 넣을 때만 DB 기본값, 다시 저장해도 신청 순서가 그대로다
        await db('/arena_signups?on_conflict=week,user_id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { week: cur, user_id: user.id, ...v, updated_at: t } })
        note(request, `${cur} 주`, signupChanges(old, v))
        return [200, { week: cur, signup: { ...v, updatedAt: t } }]
      }
      case 'DELETE signup': {
        const [old] = await db(`/arena_signups?week=eq.${cur}&user_id=eq.${enc(user.id)}`, { method: 'DELETE', prefer: 'return=representation' })
        note(request, `${cur} 주`, old ? signupChanges(null, old) : ['신청이 없었어요'])
        return [200, { ok: true }]
      }
      case 'PUT plan': {   // { week, version: 읽어 온 planAt, plan } — 통째로 바꾼다
        if (!await isAdmin(user)) fail(403, '관리자만 편성할 수 있어요')
        const body = await readJson(request)
        if (!isObj(body) || body.week !== cur) fail(409, STALE_PLAN)
        const [[old], signups] = await Promise.all([db(`/arena_plans?select=updated_at,plan&week=eq.${cur}`), signupsOf(cur)])
        // ponytail: 읽고 쓰는 사이에 다른 관리자가 저장하면(같은 순간) 늦게 쓴 쪽이 덮는다 — 관리자 몇 명이라 충분. 겹치면 updated_at 조건부 PATCH 로
        if ((old?.updated_at ?? null) !== (body.version ?? null)) fail(409, STALE_PLAN)
        const plan = arenaPlan(body.plan, signups)
        await db('/arena_plans?on_conflict=week', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { week: cur, plan, updated_at: t, updated_by: user.id } })
        note(request, `${cur} 주`, planChanges(old?.plan, plan))
        return [200, { plan, planAt: t }]
      }
    }
  }

  // ------------------------------------------------ 멤버 관리(관리자) — 멤버 = 프로필이 있는 사람. 관리자 임명 · 해제 · 탈퇴.
  // 마스터(site_masters = 슈퍼관리자)는 바꾸거나 탈퇴시킬 수 없고, 본인도 못 바꾼다(실수로 자기 권한을 잃지 않게)

  async function members(request, id, t) {
    const action = [request.method, id && 'member'].filter(Boolean).join(' ')
    if (!['GET', 'PUT member', 'DELETE member'].includes(action)) fail(404, '없는 주소예요')
    const user = await identity(request)
    if (!await isAdmin(user)) fail(403, '관리자만 멤버를 관리할 수 있어요')

    if (action === 'GET') {   // 슈퍼관리자 → 관리자 → 멤버, 각각 본계정 닉네임 순. lastWeek = 마지막으로 아레나 신청한 주, attend = 출석(아래)
      const [profiles, masters, admins, weeks] = await Promise.all([
        db('/recruit_profiles?select=discord_user_id,discord_name,entries,created_at,updated_at&order=updated_at.desc&limit=1000'),
        db('/site_masters?select=user_id'), db('/site_admins?select=user_id'),
        db('/arena_signups?select=user_id,week,slots&order=week.desc&limit=10000'),
      ])
      const role = new Map([...admins.map(a => [a.user_id, 'admin']), ...masters.map(m => [m.user_id, 'master'])])
      const last = new Map()
      for (const w of weeks) if (!last.has(w.user_id)) last.set(w.user_id, w.week)
      // 출석 = 그 주에 신청(사유불참 빼고). 이번 주에 신청했으면 이번 주부터, 아직이면 지난주부터 거꾸로 센다 —
      // streak = 연속 참석 주, missed = 연속 미참석 주(가입한 주 · 아레나 신청을 받기 시작한 주 앞은 안 센다)
      const cur = arenaWeek(t), back = w => new Date(Date.parse(`${w}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10)
      const first = weeks.reduce((m, w) => w.week < m ? w.week : m, cur)
      const went = new Map(), now = new Map()
      for (const w of weeks) {
        const absent = w.slots.includes('absent')
        if (w.week === cur) now.set(w.user_id, absent ? 'absent' : 'in')
        if (!absent) went.set(w.user_id, (went.get(w.user_id) || new Set()).add(w.week))
      }
      const attend = p => {
        const set = went.get(p.discord_user_id) || new Set(), start = [first, arenaWeek(p.created_at)].sort().at(-1)
        let w = now.get(p.discord_user_id) === 'in' ? cur : back(cur), streak = 0, missed = 0
        if (set.has(w)) for (; set.has(w); w = back(w)) streak++
        else for (; w >= start && !set.has(w); w = back(w)) missed++
        return { now: now.get(p.discord_user_id) ?? null, streak, missed, total: set.size }
      }
      const ORDER = { master: 0, admin: 1, member: 2 }
      return [200, {
        members: profiles.map(p => ({
          userId: p.discord_user_id, name: p.discord_name, main: p.entries[0]?.nick ?? p.discord_name, accounts: new Set(p.entries.map(e => e.nick)).size,
          role: role.get(p.discord_user_id) || 'member', lastWeek: last.get(p.discord_user_id) ?? null, attend: attend(p), updatedAt: p.updated_at,
        })).sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.main.localeCompare(b.main, 'ko')),
      }]
    }

    if (await hit(`w ${user.id}`, LIMIT.windowMs) > LIMIT.max) fail(429, '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요')
    if (!MEMBER_ID.test(id)) fail(404, '멤버를 찾을 수 없어요')
    if (id === user.id) fail(400, '본인의 등급은 바꾸거나 탈퇴시킬 수 없어요')
    const [[target], master, wasAdmin] = await Promise.all([db(`/recruit_profiles?select=discord_name&discord_user_id=eq.${id}`), isMaster({ id }), inAdmins({ id })])
    if (master) fail(403, '슈퍼관리자는 등급을 바꾸거나 탈퇴시킬 수 없어요')
    if (!target) fail(404, '멤버를 찾을 수 없어요')

    if (action === 'PUT member') {   // { role: 'admin' | 'member' }
      const body = await readJson(request)
      if (!isObj(body) || !['admin', 'member'].includes(body.role)) fail(400, '관리자 · 멤버 중에 골라 주세요')
      if (body.role === 'admin') await db('/site_admins?on_conflict=user_id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: { user_id: id, note: `${target.discord_name} · ${user.id} 임명` } })
      else await db(`/site_admins?user_id=eq.${id}`, { method: 'DELETE' })
      note(request, target.discord_name, [`등급: ${wasAdmin ? '관리자' : '멤버'} → ${body.role === 'admin' ? '관리자' : '멤버'}`])
      return [200, { userId: id, role: body.role }]
    }
    // 탈퇴 = 관리자 권한 · 프로필을 지운다(게임 계정 · 아레나 신청 · 팀원모집 자리는 프로필에 cascade). 팀장이던 모집 팀은 해제한다.
    // ponytail: 다시 로그인하면 새로 가입할 수 있다 — 막아야 하면 차단 목록을 둔다
    const [led] = await db(`/recruit_members?select=team_id&discord_user_id=eq.${id}&leader=is.true`)
    if (led) await disband(led.team_id)
    await db(`/site_admins?user_id=eq.${id}`, { method: 'DELETE' })
    await db(`/recruit_profiles?discord_user_id=eq.${id}`, { method: 'DELETE' })
    note(request, target.discord_name, [`프로필 · 게임 계정 · 아레나 신청${wasAdmin ? ' · 관리자 권한' : ''} 삭제`, led && '이끌던 모집 팀 해제'])
    return [200, { ok: true }]
  }

  /** 감사 로그 보기 — 마스터만. ?before=<id>(더 보기) · ?who=<사용자 ID>(그 사람만) · 최근 것부터 50줄 */
  async function auditLog(request) {
    if (request.method !== 'GET') fail(404, '없는 주소예요')
    const user = await identity(request)
    if (!await isMaster(user)) fail(403, '슈퍼관리자만 볼 수 있어요')
    const q = new URL(request.url).searchParams, before = q.get('before') || '', who = q.get('who') || ''
    const rows = await db('/audit_log?select=id,at,user_id,user_name,action,label,target,detail'
      + (/^\d{1,15}$/.test(before) ? `&id=lt.${before}` : '') + (/^[gk]?\d{1,20}$/.test(who) ? `&user_id=eq.${who}` : '')
      + `&order=id.desc&limit=${AUDIT_PAGE + 1}`)
    const page = rows.slice(0, AUDIT_PAGE)
    return [200, {
      logs: page.map(r => ({ id: r.id, at: r.at, userId: r.user_id, userName: r.user_name, action: r.action, label: r.label, target: r.target, detail: r.detail ?? [] })),
      next: rows.length > AUDIT_PAGE ? page.at(-1).id : null,
    }]
  }

  async function route(request) {
    const { pathname } = new URL(request.url)
    const method = request.method
    if (pathname === '/api/health' && method === 'GET') {
      return [200, { ok: true, voice: !!(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID), login: !!publishable }]
    }
    if (pathname === '/api/gate') return gate(request)
    if (!await gatePass(request)) throw Object.assign(new Error(GATE), { status: 401, gate: true })
    if (pathname === '/api/audit') return auditLog(request)
    const b = pathname.match(BOARD_PATH)
    if (b) return board(request, b, now())
    const a = pathname.match(/^\/api\/arena(?:\/(signup|plan|mine))?$/)
    if (a) return arena(request, a[1], now())
    const mb = pathname.match(/^\/api\/members(?:\/([^/]+))?$/)
    if (mb) return members(request, mb[1], now())
    const me = pathname.match(/^\/api\/me(\/profile)?$/)
    const m = pathname.match(/^\/api\/teams(?:\/([^/]+)(?:\/(members|extend)(?:\/([^/]+))?)?)?$/)
    const [, id, sub, userId] = m || []
    const action = me ? `${method} me${me[1] ? ' profile' : ''}`
      : pathname === '/api/profiles' ? `${method} profiles`
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

    // 비회원 만들기 · 가입 = 신원 없이 본문의 간이 프로필 + 비밀번호. 비밀번호를 정한 뒤로는 Guest 신원으로 그 팀 안의 일을 한다
    const anon = ['POST', 'POST team members'].includes(action) && !request.headers.has('authorization')
    // JSON 이 아닌 본문(폼 POST 등)은 아무 사이트나 preflight 없이 보낼 수 있다 — 세기 전에 거절해 방문자 IP 의 한도를 태우지 못하게 한다
    if (anon && !JSON_TYPE.test(request.headers.get('content-type') || '')) fail(415, 'JSON 으로 보내 주세요')
    const user = anon ? null : await identity(request, GUEST_ACTIONS.has(action))
    // 쓰기는 신원을 확인한 뒤 사람 단위로 센다 — 로그인 · 봇 키 없이 온 요청은 여기까지 못 와서 남의 한도를 태우지 못한다. 비회원 만들기 · 가입은 IP 단위
    // ponytail: 모바일 통신사는 여러 사람이 IP 하나를 나눠 쓴다 — 비회원끼리 한도에 걸리기 시작하면 IP 한도만 따로 늘린다
    if (method !== 'GET' && await hit(`w ${user?.id ?? `ip ${ipKey(request)}`}`, LIMIT.windowMs) > LIMIT.max) fail(429, '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요')
    // 가입은 본문이 없어도 된다(봇 · 옛 화면) — JSON 으로 { entry } 를 보낼 때만 읽는다. 나머지는 본문을 읽지 않는다
    const joinBody = action === 'POST team members' && JSON_TYPE.test(request.headers.get('content-type') || '')
    const body = ['POST', 'PUT me profile', 'PUT team', 'PUT team members member'].includes(action) || joinBody ? await readJson(request) : null

    switch (action) {
      case 'GET me': {
        // 비회원 = 비밀번호 확인(다른 기기에서 내 팀을 관리하려고). 프로필 · 소속 팀은 그 기기에만 있다
        if (user.guest) return [200, { user: { id: user.id, name: user.name }, profile: null, teamId: null }]
        const [p, master, admin] = await Promise.all([mine(user), isMaster(user), inAdmins(user)])
        const teamId = p?.member?.team?.expires_at > t ? p.member.team_id : null   // 만료됐지만 아직 안 지운 팀은 없는 팀
        // 마스터에게만 master · 지금 접근 비밀번호(내 프로필에서 보고 바꾼다). 꺼져 있으면 gate: null
        const g = master && await gateRow(true)
        return [200, {
          user: { id: user.id, name: user.name }, profile: p && profileView(user, p), teamId, admin: master || admin,   // admin = 아레나 편성 · 숨긴 메뉴(팀원모집)
          ...(master && { master, gate: g && { code: g.code, changedAt: g.changed_at } }),
        }]
      }

      case 'PUT me profile': {
        const p = profile(body), old = await mine(user)
        // 이름을 안 보냈으면 저장돼 있던 이름을, 프로필이 아직 없으면 디스코드 이름을 쓴다
        const name = p.name ?? old?.discord_name ?? user.name
        await db('/rpc/recruit_upsert_profile', {
          method: 'POST', body: { p_user: user.id, p_auth: user.authUserId, p_name: name, p_mic: p.mic, p_entries: p.entries, p_now: t },
        })
        note(request, name, profileChanges(old, { name, mic: p.mic, entries: p.entries }))
        return [200, { profile: { userId: user.id, name, mic: p.mic, entries: p.entries, updatedAt: t } }]
      }

      case 'POST': {
        if (!isObj(body)) fail(400, '요청 형식이 잘못됐어요')
        const r = room(body.room), tac = tactic(body.tactic)
        const g = user ? null : await guestOf(body)   // 비회원: 1인 1파티 · 프로필 확인 없음(계정이 없다)
        const [{ old, entries }, candidates] = await Promise.all([g ? { old: null, entries: g.guest.entries.length } : current(user, t), rooms()])
        const entry = entryOf(body, entries)
        const teamId = randomBytes(6).toString('base64url'), at = now()
        // 방 고르기(끝 방부터, 만료 전 팀이 안 잡은 첫 방) · 만료된 팀 청소 · 기존 팀에서 빠지기 · 팀 + 팀장 저장을 RPC 가 전역 잠금 안에서
        // 한 트랜잭션으로 한다 — 워커가 여럿이어도 두 팀이 같은 방을 받지 않고, 한 사람이 두 팀에 남지 않는다
        const { left, member } = await db('/rpc/recruit_create_team', {
          method: 'POST',
          body: {
            p_id: teamId, p_actor: user?.id ?? null, p_room: r, p_tactic: tac, p_rooms: candidates, p_now: at, p_expires_at: at + TTL,
            p_entry: entry, p_guest: g?.guest ?? null, p_pw: g?.hash ?? null,
          },
        })
        const team = view(await teamOf(teamId, at))
        if (user) leftNotice(left, old, user.id)
        notifier.teamCreated(team)
        // 비회원은 자기 userId(g<번호>)를 받아 그 기기에 비밀번호와 같이 둔다 — 이것으로 팀을 관리한다
        return [201, { team, left, ...(g && { member: `g${member}` }) }]
      }

      case 'POST team members': {
        if (body?.add !== undefined) {   // 팀장이 직접 넣는 팀원(닉네임 · 캐릭터). 계정과 잇지 않는다 — 그 사람이 나중에 직접 가입하면 팀장이 이 줄을 뺀다
          if (!user) fail(401, LOGIN)
          const v = added(body.add)
          if (!isLeader(view(await teamOf(id, t)), user)) fail(403, '팀장만 팀원을 넣을 수 있어요')
          return [201, { team: (await join(id, null, null, t, 0, { guest: v, hash: null })).team }]
        }
        if (user?.guest) fail(400, '비회원은 비밀번호를 새로 정해 가입해 주세요')
        if (!user) {
          const g = await guestOf(body)
          const { team, member } = await join(id, null, null, t, entryOf(body, g.guest.entries.length), g)
          return [201, { team, left: null, member }]
        }
        const { old, entries } = await current(user, t)
        const { team, left } = await join(id, user, old, t, entryOf(body, entries))
        return [201, { team, left }]
      }

      case 'GET profiles': {   // 팀장이 팀원을 직접 넣을 때 자동완성 — 표시 이름이나 대표 게임 닉네임에 q 가 들어간 프로필, 최근에 고친 순 8개
        const q = (new URL(request.url).searchParams.get('q') || '').replace(/[*"\\]/g, '').trim()   // 따옴표로 감싸 넘긴다 — 와일드카드(*) · 따옴표 · 역슬래시만 뺀다
        if (!q || [...q].length > 20) return [200, { profiles: [] }]
        const like = enc(`"*${q}*"`)
        const rows = await db(`/recruit_profiles?select=discord_name,entries&or=(discord_name.ilike.${like},entries->0->>nick.ilike.${like})&order=updated_at.desc&limit=8`)
        return [200, { profiles: rows.map(p => ({ name: p.discord_name, entries: p.entries })) }]
      }

      case 'POST quick': {   // 봇의 "빠른 참가": 가장 오래된 모집 중 팀(내 팀 제외). 고르는 사이 차거나 없어진 팀은 건너뛴다
        const { old } = await current(user, t)
        const open = await db(`/recruit_teams?select=id&${live(t)}&recruit_member_count=lt.${CFG.teamSize}`
          + `${old ? `&id=neq.${enc(old.id)}` : ''}&order=created_at.asc,id.asc&limit=5`)
        for (const row of open) {
          try { const { team, left } = await join(row.id, user, old, t); return [201, { team, left }] }
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

      case 'PUT team': {   // 팀 정보 수정 — 방 설정은 통째로, 전술은 보냈을 때만 바꾼다(안 보내면 그대로). 음성채널 · 팀원 · 남은 시간은 그대로
        if (!isObj(body)) fail(400, '요청 형식이 잘못됐어요')
        if (!isLeader(view(await teamOf(id, t)), user)) fail(403, '팀장만 팀 정보를 고칠 수 있어요')
        const patch = { room: room(body.room), ...(body.tactic !== undefined && { tactic: tactic(body.tactic) }) }
        await db(`/recruit_teams?id=eq.${enc(id)}&expires_at=gt.${t}`, { method: 'PATCH', body: patch })
        return [200, { team: view(await teamOf(id, t)) }]
      }

      case 'PUT team members member': {   // 참가 캐릭터 바꾸기 — 본인만. { entry } = 프로필(비회원은 가입할 때 보낸 계정 줄) 몇 번째 줄
        if (userId !== user.id) fail(403, '내 캐릭터만 바꿀 수 있어요')
        const self = view(await teamOf(id, t)).members.find(m => m.userId === user.id) || fail(404, '팀원을 찾을 수 없어요')
        const entry = entryOf(body, self.entries.length)   // 보여 줄 때 순서만 바꾼다 — 줄 수는 프로필과 같다
        await db(`/recruit_members?${memberRow(id, user.id)}`, { method: 'PATCH', body: { entry } })
        return [200, { team: view(await teamOf(id, t)) }]
      }

      case 'DELETE team members member': {   // 방출(팀장) · 나가기(본인)
        const before = view(await teamOf(id, t))
        const target = before.members.find(x => x.userId === userId) || fail(404, '팀원을 찾을 수 없어요')
        if (target.userId !== user.id && !isLeader(before, user)) fail(403, '팀장만 다른 팀원을 내보낼 수 있어요')
        note(request, target.name, [target.userId === user.id ? '본인이 나감' : '팀장이 내보냄', target.leader && '팀장이라 팀 해제'])
        if (target.leader) {   // 팀장이 빠지면 팀이 없어진다
          await disband(id)
          notifier.teamDisbanded(before, 'leader')
          return [200, { ok: true, team: null }]
        }
        await db(`/recruit_members?${memberRow(id, userId)}`, { method: 'DELETE' })
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
      return [e.status || 500, { error: e.status ? e.message : '서버 오류가 났어요', ...(e.gate && { gate: true }) }]
    })
    audit(request, status)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...cors },
    })
  }
}
