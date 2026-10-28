// 스트리트 3:3 — 하프코트 길거리 농구(1P vs CPU). 머리 메뉴 「게임」의 둘째(첫째는 슈퍼 슬램).
// 코트는 전술판(court.js)과 같은 하프코트를 위에서 내려다본다 — 골대가 위, 하프라인이 아래, 선수는 전술판처럼 얼굴 토큰.
// 움직임은 덩크 시티 3:3 에서 빌렸다 — 고른 선수 한 명만 끝까지 움직이고 동료 둘은 CPU. 슛은 누르고 있다 초록 칸에서 놓고,
// 드리블 기술(크로스오버 · 스텝백 · 스핀), 스크린 부르기, 공 달라 · 컷 · 앨리웁, 스틸 · 블록 · 스위치, 리바운드는 떨어질 자리가 바닥에 뜬다.
// 규칙은 길거리 3:3 — 11점 먼저(3점 라인 안 1점 · 밖 2점) · 3분 · 공격 12초. 수비 리바운드 · 스틸 뒤에는 3점 라인 밖으로 빼야(클리어) 슛.
// 키: 방향키 · WASD 이동, 슛 C · L · 스페이스(누르고 있다 놓는다), 패스 X · K, 기술 Z · J, 스크린 V · U. 휴대폰은 캔버스 아래 스틱 · 버튼.
// ponytail: 파울 · 아웃 오브 바운즈 없음(코트 끝에서 멈춘다) · 소리 없음 · 온라인 없음
import { mountTop, faceOf } from './app.js?v=fb02b445'
import { loadData, data, startAuth } from './board.js?v=4233415a'
import { TEAMS, NUMS, NBA_NUM, lineup } from './vipers.js?v=2902cdc5'

mountTop('/street/')
startAuth('', () => {})   // 머리의 로그인 · 이름 줄 — 다른 페이지와 같다

const cv = document.getElementById('street'), g = cv.getContext('2d')
const W = 540, H = 540, OX = 20, OY = 56                  // 화면 · 코트 왼쪽 위(위 56 은 점수판)
const CW = 500, CH = 470, R3 = 237.5, RIM_H = 100         // 코트는 전술판과 같은 단위(0.1피트) — 위가 골대, 아래가 하프라인
const RIM = { x: 250, y: 52.5, shake: 0 }
const BRK = RIM.y + Math.sqrt(R3 * R3 - 220 * 220)         // 코너 3점 직선이 끝나는 y
const LIFT = 0.15                                          // 높이 h 는 화면에서 이만큼 위로 — 비스듬히 내려다본 느낌
const GAME = 180, WIN = 11, SHOT = 12                     // 3분 · 11점 먼저 · 공격 12초
const SPD = 165, ACC = 1500, GRAV = 1100, JUMP = 300, R = 14, TOKEN = 17, GREEN = 0.85   // R = 몸 반지름, TOKEN = 그리는 토큰 반지름
const SLOTS = [1, 3, 5]                                    // 팀 다섯 중 가드 · 포워드 · 센터
const ROLE = ['G', 'F', 'C']
// 가드 · 포워드 · 센터 능력치 — 보통 1. dunk = 덩크가 되는 골대 거리(0 이면 레이업만), size = 토큰 크기 · 손 닿는 높이
const STATS = [
  { note: '가장 빠르고 드리블 기술(발목 꺾기) · 스틸 · 패스 · 2점 슛이 좋다. 덩크는 못 하고 레이업', spd: 1.08, mid: 1.02, three: 1.12, dunk: 0, jump: 0.9, block: 0.6, steal: 1.4, reb: 0.8, handle: 1.35, pass: 1.2, size: 0.92 },
  { note: '점프가 가장 높고 달려들면 멀리서도 덩크. 슛 · 수비가 고르다', spd: 1.02, mid: 1.05, three: 1, dunk: 85, jump: 1.15, block: 1, steal: 1, reb: 1, handle: 1, pass: 1, size: 1 },
  { note: '블록 · 리바운드 · 스크린이 가장 좋다. 느리고 2점 슛(3점 라인 밖)은 약하다', spd: 0.9, mid: 0.88, three: 0.55, dunk: 70, jump: 1, block: 1.5, steal: 0.7, reb: 1.5, handle: 0.65, pass: 0.9, size: 1.12 },
]
// 공격 자리 — 꼭대기 · 날개 · 코너 · 골밑 양쪽 · 자유투 줄. 가드는 꼭대기 · 날개, 포워드는 날개 · 코너, 센터는 골밑
const SPOTS = [[250, 330], [80, 225], [420, 225], [42, 78], [458, 78], [175, 112], [325, 112], [250, 190]]
const LIKES = [[0, 1, 2], [1, 2, 3, 4], [5, 6, 7]]
const DUNKS = ['SLAM DUNK!', 'TOMAHAWK!', 'WINDMILL!', 'REVERSE!']

const rnd = Math.random
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const sm = t => t * t * (3 - 2 * t)
const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.73
const unit = (x, y) => { const d = Math.hypot(x, y) || 1; return [x / d, y / d] }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const toRim = p => Math.hypot(p.x - RIM.x, p.y - RIM.y)
const outside = (x, y) => y < BRK ? Math.abs(x - RIM.x) > 220 : Math.hypot(x - RIM.x, y - RIM.y) > R3
const team = t => ps.filter(p => p.team === t)
const opp = p => team(1 - p.team)
const st = p => STATS[p.i]
const nearest = (list, o) => list.reduce((a, b) => dist(b, o) < dist(a, o) ? b : a)
const open = p => Math.min(...opp(p).map(q => dist(q, p)))   // 가장 가까운 수비까지
const reach = p => 72 * st(p).size + p.h * 1.3                // 손이 닿는 높이
const busy = p => p.act === 'shoot' || p.act === 'lay' || p.act === 'dunk'

let mode = 'load', pick = 0, sides = [0, 1], ps = [], ball = {}, score = [0, 0], clock = GAME, shot = SHOT, offense = 0, me = null
let wait = 0, next = null, clear = false, sudden = false, fade = 0
let msg = null, pops = [], parts = [], routes = [], rings = [], shake = 0, tnow = 0
const say = (text, t = 1.1) => { msg = { text, t, t0: t } }
const pop = (p, text, c = '#fff') => pops.push({ x: p.x, y: p.y - 22, text, c, t: 0.9 })
const route = (pts, kind) => routes.push({ pts, kind, t: 0.9 })   // 전술판 화살표 — run · pass · screen
function burst(x, y, n, c) {
  for (let i = 0; i < n; i++) { const a = rnd() * 6.3, v = 60 + rnd() * 160; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0.35 + rnd() * 0.3, c: Array.isArray(c) ? c[i % c.length] : c }) }
}

// ---------------------------------------------------------------- 입력

const keys = new Set(), joy = { x: 0, y: 0 }, input = { sh: false, up: false, pa: false, sk: false, sc: false }
const KEYS = { KeyC: 'sh', KeyL: 'sh', Space: 'sh', KeyX: 'pa', KeyK: 'pa', KeyZ: 'sk', KeyJ: 'sk', KeyV: 'sc', KeyU: 'sc' }
let holding = false   // 슛 버튼을 누르고 있나 — 떼는 순간 슛을 놓는다
function press(k) {
  if (mode === 'select') return start()
  if (mode === 'over') return void (wait <= 0 && (mode = 'select'))
  input[k] = true
  if (k === 'sh') holding = true
}
function lift() { if (holding) { holding = false; input.up = true } }
addEventListener('keydown', e => {
  const c = e.code
  if (e.target.closest?.('input, textarea, select, button, a') || !/^(Arrow\w+|Key[WASDZXCVJKLU]|Space|Enter)$/.test(c)) return
  e.preventDefault()
  keys.add(c)
  if (e.repeat) return
  if (mode === 'select' && c.startsWith('Arrow')) {
    const row = pick / 3 | 0, col = pick % 3
    pick = c === 'ArrowLeft' ? row * 3 + (col + 2) % 3 : c === 'ArrowRight' ? row * 3 + (col + 1) % 3 : (c === 'ArrowUp' ? (row + 3) % 4 : (row + 1) % 4) * 3 + col
  } else if (c === 'Enter') { if (mode === 'select' || mode === 'over') press('sh') }
  else if (KEYS[c]) press(KEYS[c])
})
addEventListener('keyup', e => { keys.delete(e.code); if (KEYS[e.code] === 'sh' && ![...keys].some(k => KEYS[k] === 'sh')) lift() })
addEventListener('blur', () => { keys.clear(); lift() })
function axis() {
  const k = c => keys.has(c) ? 1 : 0
  const x = joy.x + k('ArrowRight') + k('KeyD') - k('ArrowLeft') - k('KeyA'), y = joy.y + k('ArrowDown') + k('KeyS') - k('ArrowUp') - k('KeyW')
  const d = Math.hypot(x, y)
  return d > 1 ? [x / d, y / d] : [x, y]
}
// 선수 고르기는 얼굴 카드를 누르고, 고른 카드를 한 번 더 누르면 시작. 끝난 화면은 누르면 선수 고르기로
const ROW_Y = 62, ROW_H = 112, COL_X = 150, COL_W = 128
cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H
  if (mode === 'select') {
    const row = Math.floor((y - ROW_Y) / ROW_H), col = Math.floor((x - COL_X) / COL_W)
    if (row >= 0 && row < 4 && col >= 0 && col < 3) { const i = row * 3 + col; i === pick ? start() : pick = i }
  } else if (mode === 'over' && wait <= 0) mode = 'select'
})
const stick = document.getElementById('stick'), knob = stick.firstElementChild
function steer(e) {
  const r = stick.getBoundingClientRect(), Rr = r.width / 2
  let x = (e.clientX - r.left - Rr) / Rr, y = (e.clientY - r.top - Rr) / Rr
  const d = Math.hypot(x, y)
  if (d > 1) { x /= d; y /= d }
  joy.x = Math.abs(x) > 0.2 ? x : 0; joy.y = Math.abs(y) > 0.2 ? y : 0
  knob.style.transform = `translate(${x * Rr * 0.55}px, ${y * Rr * 0.55}px)`
}
const release = () => { joy.x = joy.y = 0; knob.style.transform = '' }
stick.addEventListener('pointerdown', e => { stick.setPointerCapture(e.pointerId); steer(e) })
stick.addEventListener('pointermove', e => stick.hasPointerCapture(e.pointerId) && steer(e))
stick.addEventListener('pointerup', release)
stick.addEventListener('pointercancel', release)
for (const k of ['sh', 'pa', 'sk', 'sc']) {
  const b = document.getElementById(`btn-${k}`)
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); press(k) })
  if (k === 'sh') { b.addEventListener('pointerup', lift); b.addEventListener('pointercancel', lift) }
}

// ---------------------------------------------------------------- 경기 흐름

function start() {
  const ti = pick / 3 | 0, others = [0, 1, 2, 3].filter(i => i !== ti)
  sides = [ti, others[rnd() * 3 | 0]]
  ps = [0, 1].flatMap(t => TEAMS[sides[t]].three.map((f, i) => ({
    team: t, i, f, x: 250, y: 300, h: 0, vh: 0, vx: 0, vy: 0, dir: -Math.PI / 2, want: [0, 0], act: null, t: 0, T: 0,
    stun: 0, cool: 0, space: 0, call: 0, cut: 0, hold: 0, screen: 0, react: 0, rx: null, goal: null, goalT: 0, spot: null, think: 0,
    man: null, side: 1, meter: -1, rel: 0, auto: false, up: false, done: false, grade: null, gradeT: 0, hit: new Set(), trail: [],
  })))
  me = ps[pick % 3]
  score = [0, 0]; clock = GAME; sudden = false; parts = []; pops = []; routes = []; rings = []
  for (const k in input) input[k] = false
  holding = false
  check(rnd() < 0.5 ? 0 : 1)
}
const later = (t, fn) => { mode = 'dead'; wait = t; next = fn; for (const p of ps) p.want = [0, 0] }
function place(p, x, y) { Object.assign(p, { x, y, h: 0, vh: 0, vx: 0, vy: 0, act: null, stun: 0, hold: 0, screen: 0, call: 0, cut: 0, goal: null, spot: null, think: 0, meter: -1, trail: [] }) }
// 체크 볼 — 득점 · 공격 시간 위반 뒤. 공격 팀 하나가 꼭대기에서(1P 팀이면 1P), 둘은 양 날개. 수비는 같은 포지션을 맡는다
function check(t) {
  offense = t; shot = SHOT; clear = false; fade = 0.35
  const hd = t === me.team ? me : team(t)[0]
  let k = 0
  for (const p of team(t)) p === hd ? place(p, 250, 345) : place(p, k++ ? 410 : 90, 225)
  for (const q of team(1 - t)) { q.man = team(t)[q.i]; const m = q.man, [ux, uy] = unit(RIM.x - m.x, RIM.y - m.y); place(q, m.x + ux * 40, m.y + uy * 40) }
  ball = { st: 'held', owner: hd, x: hd.x, y: hd.y, h: 40 }
  say('CHECK BALL', 0.8)
  later(0.9, () => { mode = 'play' })
}
const over = () => { mode = 'over'; wait = 1.2; msg = null }

function update(dt) {
  tnow += dt
  if (mode === 'load' || mode === 'select') return
  effects(dt)
  if (mode === 'over') { wait -= dt; return }
  if (mode === 'dead') {
    wait -= dt
    for (const p of ps) body(p, dt)
    moveBall(dt)
    if (wait <= 0) { const f = next; next = null; f?.() }
    for (const k in input) input[k] = false
    return
  }
  if (!sudden) clock = Math.max(0, clock - dt)
  if (ball.st === 'held' || ball.st === 'pass') shot -= dt
  if (clock <= 0 && !sudden) {
    if (score[0] !== score[1]) return over()
    sudden = true; say('SUDDEN DEATH — 먼저 넣으면 이긴다', 1.6)
  }
  if (shot <= 0) { say('SHOT CLOCK', 1); const t = 1 - offense; return later(0.9, () => check(t)) }
  for (const p of ps) p === me ? user(p) : ai(p, dt)
  for (const p of ps) body(p, dt)
  collide()
  moveBall(dt)
  for (const k in input) input[k] = false
}

// ---------------------------------------------------------------- 1P

function user(p) {
  const [ax, ay] = axis(), hasBall = ball.owner === p, onO = offense === p.team
  // 수비에서 스틱을 놓으면 맡은 선수 앞으로 천천히 간다(덩크 시티의 자동 수비처럼 — 바짝 붙으려면 직접)
  if (!onO && Math.hypot(ax, ay) < 0.1 && p.man) { const [x, y] = guardSpot(p); go(p, x, y, 0.7) } else p.want = [ax, ay]
  if (input.sh) hasBall ? shootStart(p) : jump(p)
  if (input.up && p.act === 'shoot') letGo(p)
  if (input.pa) { if (hasBall) passTo(p, mateFor(p, ax, ay)); else if (onO) { p.call = 1.2; pop(p, '패스!', '#ffd23f') } else switchMan(p) }
  if (input.sk) { if (hasBall) move(p, ax, ay); else if (onO) cut(p, ax, ay); else steal(p) }
  if (input.sc && onO) hasBall ? callScreen(p) : plant(p)
}
function mateFor(p, ax, ay) {   // 스틱 쪽 동료 — 스틱을 안 밀었으면 더 비어 있는 동료
  const mates = team(p.team).filter(q => q !== p)
  const score = q => Math.hypot(ax, ay) < 0.3 ? open(q) : ((q.x - p.x) * ax + (q.y - p.y) * ay) / (dist(q, p) || 1)
  return mates.reduce((a, b) => score(b) > score(a) ? b : a)
}

// ---------------------------------------------------------------- 동작

function go(p, x, y, k = 1) {   // 가까워질수록 천천히 — 도착하면 선다
  const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy), s = d < 4 ? 0 : k * Math.min(1, d / 30) / d
  p.want = [dx * s, dy * s]
}
const act = (p, a, T) => Object.assign(p, { act: a, t: 0, T, done: false })
function jump(p) { if (p.h === 0 && !p.act && p.stun <= 0) p.vh = JUMP * st(p).jump }
function fall(q, t) { act(q, 'fall', t); q.vx *= 0.3; q.vy *= 0.3; q.meter = -1 }

// 드리블 기술 — 스틱이 골대 반대쪽(또는 안 밀었으면) 스텝백, 골대 쪽이면 스핀 돌파, 옆이면 크로스오버
function move(p, ax, ay) {
  if (p.act || p.h > 0 || p.cool > 0) return
  const [rx, ry] = unit(RIM.x - p.x, RIM.y - p.y), m = Math.hypot(ax, ay), fwd = m > 0.3 ? (ax * rx + ay * ry) / m : -1, d = nearest(opp(p), p)
  p.cool = 0.55
  if (fwd < -0.4) {
    act(p, 'step', 0.3); p.vx = -rx * 300; p.vy = -ry * 300; p.space = 1.4   // 떨어진 만큼 슛 초록 칸이 넓다
    if (dist(d, p) < 55) { d.stun = Math.max(d.stun, 0.3); pop(p, 'STEP BACK', '#7fffc8') }
  } else if (fwd > 0.6) {
    act(p, 'spin', 0.38); p.vx = ax / m * 310; p.vy = ay / m * 310
    if (dist(d, p) < 45) beat(p, d, 0.18, 'SPIN!')
  } else {
    act(p, 'cross', 0.26); p.vx = ax / m * 340; p.vy = ay / m * 340; p.side = -p.side
    if (dist(d, p) < 50) beat(p, d, 0.24, 'CROSSOVER')
  }
}
function beat(p, d, k, text) {   // 수비가 속나 — 가드가 잘 꺾고 센터가 잘 넘어진다
  const r = rnd(), ch = k * st(p).handle * [0.8, 1, 1.5][d.i]
  if (r < ch) { fall(d, 1.1); say('ANKLE BREAKER!', 1.2); burst(d.x, d.y, 10, '#ffd23f') }
  else if (r < ch + 0.4) { d.stun = Math.max(d.stun, 0.35); pop(p, text, '#7fffc8') }
}
function cut(p, ax, ay) {   // 공 없이 — 스틱 쪽(안 밀었으면 골대 쪽)으로 치고 들어간다. 골밑으로 컷하면 동료가 앨리웁을 띄운다
  if (p.act || p.h > 0 || p.cool > 0) return
  const [dx, dy] = Math.hypot(ax, ay) > 0.3 ? unit(ax, ay) : unit(RIM.x - p.x, RIM.y - p.y)
  act(p, 'dash', 0.32); p.vx = dx * 320; p.vy = dy * 320; p.cut = 1.4; p.cool = 0.5
  route([[p.x, p.y], [p.x + dx * 110, p.y + dy * 110]], 'run')
}
function plant(p) { if (p.act || p.h > 0) return; p.screen = 1.3; p.vx = p.vy = 0; p.hit = new Set(); p.goal = null }
function screenSpot(hd) {   // 공 가진 선수를 막는 수비의 어깨 옆(가운데 쪽)
  const D = opp(hd).find(q => q.man === hd) ?? nearest(opp(hd), hd), [vx, vy] = unit(D.x - hd.x, D.y - hd.y)
  const s = D.x + -vy * 20 < 250 === D.x < 250 ? -1 : 1
  return [clamp(D.x - vy * 20 * s + vx * 4, 20, 480), clamp(D.y + vx * 20 * s + vy * 4, 20, 455)]
}
function callScreen(hd) {   // 가장 가까운 CPU 동료가 와서 스크린을 선다
  const s = team(hd.team).filter(q => q !== hd && q !== me && !(q.screen > 0))
  if (!s.length) return
  const q = nearest(s, hd), spot = screenSpot(hd)
  Object.assign(q, { goal: spot, goalT: 2.5, spot: null, cut: 0 })
  route([[q.x, q.y], spot], 'screen')
  if (hd === me) pop(q, '스크린!', '#f5a623')
}
function switchMan(p) {   // 수비 바꾸기 — 공 가진 상대를 맡거나(이미 맡았으면) 가장 가까운 다른 상대와 바꾼다
  const hd = ball.owner, target = hd && hd.team !== p.team && p.man !== hd ? hd : nearest(opp(p).filter(q => q !== p.man), p)
  const mate = team(p.team).find(q => q.man === target)
  if (mate) mate.man = p.man
  p.man = target; pop(p, 'SWITCH', '#ff8a8a')
}
function steal(p) {
  if (p.act || p.h > 0 || p.cool > 0) return
  const o = ball.owner, [ux, uy] = unit(ball.x - p.x, ball.y - p.y)
  act(p, 'steal', 0.25); p.vx = ux * 240; p.vy = uy * 240; p.cool = 0.8
  if (!o || o.team === p.team || dist(o, p) > 36 || busy(o)) return
  if (rnd() < 0.3 * st(p).steal / st(o).handle) { grab(p, 'STEAL!'); say('STEAL!', 0.9) }
  else if (rnd() < 0.3) { p.stun = 0.45; pop(p, '헛손질', '#c9d1d9') }   // 마구 누르면 손해
}

// ---------------------------------------------------------------- 슛

function chance(p) {   // 노마크로 보통 타이밍에 놓으면 들어갈 확률
  const d = toRim(p), s = st(p)
  return d < 130 ? 0.55 * s.mid : !outside(p.x, p.y) ? 0.45 * s.mid : 0.37 * s.three * clamp(1 - (d - 290) / 160, 0.25, 1)
}
function contest(p) {   // 0~1 — 가까운 수비일수록, 뛰었으면 더
  let c = 0
  for (const q of opp(p)) c = Math.max(c, clamp((70 - dist(q, p)) / 48, 0, 1) * (q.h > 10 ? 1 : 0.75))
  return c
}
const greenW = p => { const c = contest(p); return 0.07 * (c > 0.6 ? 0.55 : c > 0.25 ? 0.8 : 1.2) * (p.space > 0 ? 1.45 : 1) }   // 초록 칸 반쪽 폭
const blocker = p => opp(p).find(q => q.h > 16 && dist(q, p) < 30 && (q.x - p.x) * (RIM.x - p.x) + (q.y - p.y) * (RIM.y - p.y) > -60)
function shootStart(p) {   // 슛 버튼 — 골대 가까이면 덩크 · 레이업, 아니면 점프슛(누르고 있다 놓는다)
  if (p.act || p.h > 0) return
  if (clear && p.team === offense) return void (p === me && pop(p, '먼저 3점 라인 밖으로!', '#ffd23f'))
  const d = toRim(p), v = Math.hypot(p.vx, p.vy)
  if (d < st(p).dunk && (v > 60 || p.cut > 0 || d < 45)) return dunk(p)
  if (d < 80) return layup(p)
  act(p, 'shoot', 0); p.meter = 0; p.up = false; p.auto = p !== me; p.vx *= 0.2; p.vy *= 0.2
  p.rel = GREEN + gauss() * 0.12 / st(p).mid   // CPU 는 놓을 때를 미리 정한다(auto)
}
function letGo(p) {
  if (p === me && p.t < 0.12 && !p.auto) { p.auto = true; p.rel = GREEN + gauss() * 0.12; return }   // 톡 치면 알아서 놓는다(초록은 잘 안 걸린다)
  const m = p.meter, c = contest(p), w = greenW(p), off = Math.abs(m - GREEN)
  const grade = off < w ? 'PERFECT' : off < w * 2.8 ? 'GOOD' : m < GREEN ? 'EARLY' : 'LATE'
  Object.assign(p, { grade, gradeT: 0.9, meter: -1, act: 'air', auto: false })
  const b = blocker(p)
  if (b && rnd() < 0.4 * st(b).block) return swat(p, b)
  const pr = Math.min(0.95, chance(p) * (1 - 0.5 * c) * (grade === 'PERFECT' ? 1.6 : grade === 'GOOD' ? 1 : 0.4))
  shotBall(p, rnd() < pr, outside(p.x, p.y) ? 2 : 1, grade === 'PERFECT')
}
function shotBall(p, make, pts, swish) {
  const d = toRim(p)
  ball = { st: 'shot', owner: null, x: p.x, y: p.y, h: p.h + 70, x0: p.x, y0: p.y, h0: p.h + 70, t: 0, T: 0.45 + d / 700, arc: 40 + d * 0.22, make, pts, by: p, team: p.team, swish }
}
function layup(p, oop) {
  const [ux, uy] = unit(p.x - RIM.x, p.y - RIM.y)
  act(p, 'lay', 0.55); Object.assign(p, { x0: p.x, y0: p.y, x1: RIM.x + ux * 22, y1: RIM.y + uy * 22, vx: 0, vy: 0, oop })
}
function layIn(p) {
  const b = blocker(p)
  if (b && rnd() < 0.45 * st(b).block) return swat(p, b)
  shotBall(p, rnd() < (p.oop ? 0.95 : 0.8) * (1 - 0.45 * contest(p)), 1, false)
  ball.T = 0.3; ball.arc = 18
  if (p.oop) say('ALLEY-OOP!', 1)
}
function dunk(p, oop) {
  const [ux, uy] = unit(p.x - RIM.x, p.y - RIM.y)
  act(p, 'dunk', 0.7); Object.assign(p, { x0: p.x, y0: p.y, x1: RIM.x + ux * 9, y1: RIM.y + uy * 9, vx: 0, vy: 0, oop })
}
function slamIn(p) {   // 덩크가 림에 닿는 순간 — 골밑에서 뛴 수비가 가끔 막는다
  const b = opp(p).find(q => q.h > 25 && toRim(q) < 34)
  if (b && rnd() < 0.35 * st(b).block * (p.oop ? 0.6 : 1)) return swat(p, b)
  made(p.team, 1, p.oop ? 'ALLEY-OOP!' : DUNKS[rnd() * DUNKS.length | 0], p)
  shake = 7; rings.push({ x: RIM.x, y: RIM.y, r: 10, t: 0.4 })
  for (const q of opp(p)) if (toRim(q) < 40 && (q.h > 10 || dist(q, p) < 26)) { fall(q, 0.9); pop(q, 'POSTERIZED', '#ff8a8a') }   // 막으러 뛰었거나 바로 밑에 있던 수비
}
function swat(p, b) {   // 블록 — 공이 골대 반대쪽으로 튄다
  const [ux, uy] = unit(p.x - RIM.x, p.y - RIM.y)
  ball = { st: 'loose', owner: null, x: p.x, y: p.y, h: p.h + 70, vx: ux * 200 + (rnd() - 0.5) * 140, vy: uy * 200 + (rnd() - 0.5) * 140, vh: 80, team: p.team, wait: 0.25 }
  Object.assign(p, { act: p.h > 0 ? 'air' : null, meter: -1, vh: Math.min(p.vh, 0) })
  say('BLOCKED!', 1); pop(b, 'BLOCK', '#5fd4ff'); burst(p.x, p.y, 12, ['#5fd4ff', '#fff']); shake = 5
}
function made(t, pts, text, by) {
  score[t] += pts
  RIM.shake = 1; burst(RIM.x, RIM.y, 14, ['#fff', TEAMS[sides[t]].color])
  pop({ x: RIM.x, y: RIM.y + 40 }, `+${pts}`, '#ffd23f')
  if (text) say(text)
  ball = { st: 'loose', dead: true, owner: null, x: RIM.x, y: RIM.y, h: RIM_H - 10, vx: 0, vy: 30, vh: -30 }
  if (score[t] >= WIN || sudden) later(1.5, over)
  else later(1.1, () => check(1 - t))
}
function rimOut(b) {   // 안 들어갔다 — 림에 맞고 튄다(공격 시간이 다시 12초)
  const a = Math.atan2(b.y0 - RIM.y, b.x0 - RIM.x) + (rnd() - 0.5) * 2.2, v = 70 + rnd() * 120
  ball = { st: 'loose', owner: null, x: RIM.x + Math.cos(a) * 8, y: RIM.y + Math.sin(a) * 8, h: RIM_H, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vh: 160 + rnd() * 120, team: b.team, wait: 0.12 }
  RIM.shake = 0.6; shot = SHOT
}

// ---------------------------------------------------------------- 공

function passTo(p, to) {
  if (!to || p.act || p.h > 0) return
  const lob = !clear && (to.cut > 0 || to.i === 2) && toRim(to) < 130   // 골밑으로 들어가는 동료에게는 앨리웁
  const lead = lob ? 0.35 : 0.15, tx = clamp(to.x + to.vx * lead, 10, 490), ty = clamp(to.y + to.vy * lead, 10, 460)
  const d = Math.hypot(tx - p.x, ty - p.y)
  ball = { st: 'pass', owner: null, from: p, to, team: p.team, x: p.x, y: p.y, h: 45, x0: p.x, y0: p.y, x1: tx, y1: ty, h0: 45, h1: lob ? 100 : 45, arc: lob ? 60 : 6, t: 0, T: lob ? 0.5 + d / 900 : 0.1 + d / (520 * st(p).pass), tried: new Set(), oop: lob }
  route([[p.x, p.y], [tx, ty]], 'pass')
  p.cool = 0.25; to.call = 0
}
function grab(p, why) {
  ball = { st: 'held', owner: p, x: p.x, y: p.y, h: 40 }
  p.cut = 0; p.call = 0
  if (why) pop(p, why, '#7fffc8')
  if (p.team !== offense) {   // 공격이 바뀐다 — 3점 라인 안에서 잡았으면 밖으로 빼야 슛을 쏠 수 있다
    offense = p.team; shot = SHOT; clear = !outside(p.x, p.y)
    for (const q of ps) Object.assign(q, { screen: 0, goal: null, call: 0, cut: 0, spot: null, think: 0 })
    for (const q of team(1 - p.team)) q.man = team(p.team)[q.i]
    if (clear && p.team === me.team) say('CLEAR — 3점 라인 밖으로', 1.2)
  }
}
function landing(b) {   // 떨어지는 공이 손 높이(75)로 내려오는 자리 — 바닥에 표시한다
  let { x, y, h, vx, vy, vh } = b
  for (let i = 0; i < 90; i++) { vh -= GRAV / 60; h += vh / 60; x += vx / 60; y += vy / 60; if (vh < 0 && h < 75) break }
  return { x: clamp(x, 6, CW - 6), y: clamp(y, 6, CH - 6) }
}
function moveBall(dt) {
  const b = ball
  if (b.st === 'held') {
    const o = b.owner
    b.x = o.x; b.y = o.y
    if (clear && o.team === offense && outside(o.x, o.y)) { clear = false; pop(o, 'CLEAR', '#7fffc8') }
    return
  }
  b.t = (b.t || 0) + dt
  if (b.st === 'pass') {
    const k = Math.min(1, b.t / b.T)
    b.x = b.x0 + (b.x1 - b.x0) * k; b.y = b.y0 + (b.y1 - b.y0) * k; b.h = b.h0 + (b.h1 - b.h0) * k + b.arc * 4 * k * (1 - k)
    for (const q of ps) if (q.team !== b.team && !b.tried.has(q) && q.stun <= 0 && !q.act && dist(q, b) < 15 * st(q).size && b.h < reach(q)) {
      b.tried.add(q)
      if (rnd() < 0.22 * st(q).steal) return void (grab(q, 'STEAL!'), say('INTERCEPTED!', 0.9))
    }
    if (k < 1) return
    const r = b.to
    if (dist(r, b) < 30 && r.stun <= 0 && !r.act) {
      grab(r)
      if (b.oop && toRim(r) < 130) st(r).dunk ? dunk(r, true) : layup(r, true)
    } else Object.assign(b, { st: 'loose', team: undefined, vx: (b.x1 - b.x0) / b.T * 0.5, vy: (b.y1 - b.y0) / b.T * 0.5, vh: 0, wait: 0 })   // 못 받았다
    return
  }
  if (b.st === 'shot') {
    const k = Math.min(1, b.t / b.T)
    b.x = b.x0 + (RIM.x - b.x0) * k; b.y = b.y0 + (RIM.y - b.y0) * k; b.h = b.h0 + (RIM_H + 4 - b.h0) * k + b.arc * 4 * k * (1 - k)
    if (k >= 1) b.make ? made(b.team, b.pts, b.swish ? (b.pts > 1 ? 'SPLASH!' : 'PERFECT!') : null, b.by) : rimOut(b)
    return
  }
  // 굴러다니는 공 — 손이 닿는 사람(가까운 순, 리바운드가 좋을수록 손이 길다)이 잡는다
  b.vh -= GRAV * dt; b.h += b.vh * dt
  if (b.h <= 0) { b.h = 0; b.vh = b.vh < -70 ? -b.vh * 0.55 : 0; b.vx *= 0.85; b.vy *= 0.85 }
  b.x += b.vx * dt; b.y += b.vy * dt
  if (b.h === 0) { const k = Math.exp(-1.2 * dt); b.vx *= k; b.vy *= k }
  if (b.x < 6 || b.x > CW - 6) { b.vx *= -0.6; b.x = clamp(b.x, 6, CW - 6) }
  if (b.y < 6 || b.y > CH - 6) { b.vy *= -0.6; b.y = clamp(b.y, 6, CH - 6) }
  if (b.dead || (b.wait -= dt) > 0) return
  b.land = landing(b)
  let best = null, bd = 1e9
  for (const p of ps) {
    if ((p.act && p.act !== 'air' && p.act !== 'dash' && p.act !== 'steal') || p.stun > 0 || b.h > reach(p)) continue
    const d = dist(p, b)
    if (d < 15 + 6 * st(p).reb && d < bd) { best = p; bd = d }
  }
  if (best) grab(best, b.team === undefined ? null : b.team === best.team ? 'OFF. REB' : 'REBOUND')
}

// ---------------------------------------------------------------- CPU

function ai(p, dt) {
  p.think -= dt
  if (p.act || p.stun > 0 || p.hold > 0) return void (p.want = [0, 0])
  if (ball.st === 'loose' && !ball.dead) return chase(p)
  if (ball.owner === p) return handle(p)
  if (offense === p.team) return offBall(p)
  defend(p)
}
function laneOpen(p) {   // 골대까지 앞을 막는 수비가 없나
  const dx = RIM.x - p.x, dy = RIM.y - p.y, L = dx * dx + dy * dy
  return !opp(p).some(q => { const t = ((q.x - p.x) * dx + (q.y - p.y) * dy) / L; return t > 0 && t < 1 && Math.hypot(p.x + dx * t - q.x, p.y + dy * t - q.y) < 24 })
}
function handle(p) {   // 공 가진 CPU
  if (p.think > 0) return
  p.think = 0.16 + rnd() * 0.14
  const d = toRim(p), c = open(p), mates = team(p.team).filter(q => q !== p), out = outside(p.x, p.y)
  if (clear && !out) {   // 클리어 — 밖에 비어 있는 동료에게 주거나 들고 나간다
    const ok = mates.find(q => outside(q.x, q.y) && open(q) > 50)
    if (ok && c < 34 && rnd() < 0.5) return passTo(p, ok)
    const [ux, uy] = unit(p.x - RIM.x, p.y - RIM.y)
    return go(p, clamp(RIM.x + ux * (R3 + 30), 20, 480), clamp(RIM.y + Math.max(uy, 0.35) * (R3 + 30), 20, 455))
  }
  const caller = mates.find(q => q.call > 0)
  if (caller && rnd() < 0.85) return passTo(p, caller)
  const cutter = mates.find(q => q.cut > 0 && toRim(q) < 160 && open(q) > 24)
  if (cutter && rnd() < 0.6) return passTo(p, cutter)
  if (d < Math.max(st(p).dunk, 70) && (c > 18 || rnd() < 0.4)) return shootStart(p)
  if (shot < 2.2) return shootStart(p)
  if (c > 45 && chance(p) * (out ? 2 : 1) > 0.5 + rnd() * 0.35) return shootStart(p)
  if (c < 34 && p.cool <= 0 && rnd() < 0.3) {
    const [rx, ry] = unit(RIM.x - p.x, RIM.y - p.y), s = rnd() < 0.5 ? 1 : -1, r = rnd()
    return r < 0.5 ? move(p, -ry * s, rx * s) : r < 0.75 ? move(p, 0, 0) : move(p, rx, ry)
  }
  const free = mates.filter(q => open(q) > 55)
  if (c < 30 && free.length && rnd() < 0.35) return passTo(p, free[rnd() * free.length | 0])
  if (rnd() < 0.05) callScreen(p)
  if (laneOpen(p) || rnd() < 0.25) return go(p, RIM.x, RIM.y + 20)
  const a = Math.atan2(p.y - RIM.y, p.x - RIM.x) + (rnd() - 0.5) * 1.2, r = clamp(d + (rnd() - 0.6) * 80, 90, 300)   // 둘레를 돌며 틈을 본다
  go(p, clamp(RIM.x + Math.cos(a) * r, 25, 475), clamp(RIM.y + Math.sin(a) * r, 30, 450))
}
function pickSpot(p) {   // 동료와 가장 떨어진 자리(클리어 중이면 3점 라인 밖 자리만)
  const mates = team(p.team).filter(q => q !== p), list = (clear ? [0, 1, 2, 3, 4] : LIKES[p.i]).map(i => SPOTS[i])
  const room = ([x, y]) => Math.min(...mates.map(q => Math.hypot(q.x - x, q.y - y))) + rnd() * 40
  return list.reduce((a, b) => room(b) > room(a) ? b : a)
}
function offBall(p) {   // 공 없는 CPU 공격 — 자리 잡기 · 컷 · 스크린
  if (ball.st === 'pass' && ball.to === p) return go(p, ball.x1, ball.y1)
  if (p.goal) {
    go(p, p.goal[0], p.goal[1])
    if (Math.hypot(p.goal[0] - p.x, p.goal[1] - p.y) < 9) plant(p)
    else if (p.goalT <= 0) p.goal = null
    return
  }
  if (p.screen > 0) return
  if (p.cut > 0) return go(p, RIM.x + (p.x < RIM.x ? -18 : 18), RIM.y + 35)
  if (p.think <= 0) {
    p.think = 1.2 + rnd() * 1.8
    const hd = ball.owner, r = rnd()
    if (!clear && hd && r < 0.22 && toRim(p) > 110) { p.cut = 1.4; route([[p.x, p.y], [RIM.x, RIM.y + 35]], 'run'); return }
    if (!clear && hd && hd !== me && r < 0.36 && open(hd) < 40) { Object.assign(p, { goal: screenSpot(hd), goalT: 2.5 }); route([[p.x, p.y], p.goal], 'screen'); return }
    p.spot = pickSpot(p)
  }
  if (p.spot) go(p, p.spot[0], p.spot[1])
}
function guardSpot(p) {   // 맡은 선수와 골대 사이 — 공 가진 선수에게는 바짝, 아니면 공 쪽으로 처져서
  const m = p.man, on = m === ball.owner, gap = on ? 24 : 44, [ux, uy] = unit(RIM.x - m.x, RIM.y - m.y)
  let x = m.x + ux * gap, y = m.y + uy * gap
  if (!on) { x += (ball.x - x) * 0.22; y += (ball.y - y) * 0.22 }
  return [x, y]
}
function defend(p) {
  const hd = ball.owner, m = p.man ?? (p.man = nearest(opp(p), p))
  // 슛 · 레이업 · 덩크를 막으러 뛴다(반응이 조금 늦다)
  const s = opp(p).find(q => busy(q) && dist(q, p) < 70)
  if (s && p.h === 0) {
    if (p.rx !== s) { p.rx = s; p.react = 0.08 + rnd() * 0.16 / st(p).block }
    else if (p.react <= 0 && dist(s, p) < 46) { jump(p); p.rx = null; return }
    return go(p, s.x + (RIM.x - s.x) * 0.15, s.y + (RIM.y - s.y) * 0.15)
  }
  if (!s) p.rx = null
  // 도움 수비 — 공 가진 상대가 골밑으로 들어오는데 맡은 수비가 제쳐졌으면 골대와 가장 가까운 수비가 막는다
  if (hd && hd.team !== p.team && m !== hd && toRim(hd) < 120) {
    const D = team(p.team).find(q => q.man === hd), help = team(p.team).filter(q => q.man !== hd && q !== me)
    if (help.length && help.reduce((a, b) => toRim(b) < toRim(a) ? b : a) === p && (!D || dist(D, hd) > 38 || D.stun > 0 || D.hold > 0 || D.act === 'fall')) {
      const [ux, uy] = unit(RIM.x - hd.x, RIM.y - hd.y)
      return go(p, hd.x + ux * 22, hd.y + uy * 22)
    }
  }
  if (m === hd && dist(p, hd) < 30 && p.cool <= 0 && rnd() < 0.0025 * st(p).steal) return steal(p)
  const [x, y] = guardSpot(p)
  go(p, x, y)
}
function chase(p) {   // 리바운드 · 루즈볼 — 가까운 선수는 떨어질 자리로, 공이 손 높이로 오면 뛴다
  const L = ball.land ?? ball
  if (dist(p, L) < 170 || p === nearest(team(p.team).filter(q => q !== me), L)) go(p, L.x, L.y)
  else p.want = [0, 0]
  if (p.h === 0 && ball.vh < 0 && dist(p, ball) < 28 && ball.h > reach(p) && ball.h < reach(p) + 45) jump(p)
}

// ---------------------------------------------------------------- 몸

const DASH = new Set(['cross', 'spin', 'step', 'dash', 'steal'])
const speed = p => SPD * st(p).spd * (ball.owner === p ? 0.9 : 1)
function acting(p, dt) {
  p.t += dt
  if (p.act === 'shoot') {   // 웅크렸다(0.1초) 뛰어 천천히 오른다 — 놓으면 떨어진다
    p.meter = p.t / 0.62
    if (p.t > 0.1 && !p.up) { p.up = true; p.vh = 180 }
    if ((p.auto && p.meter >= p.rel) || p.meter >= 1.3) letGo(p)
  } else if (p.act === 'lay') {
    const k = Math.min(1, p.t / p.T)
    p.x = p.x0 + (p.x1 - p.x0) * sm(k); p.y = p.y0 + (p.y1 - p.y0) * sm(k); p.h = 55 * Math.sin(Math.PI * k)
    if (k >= 0.6 && !p.done) { p.done = true; layIn(p) }
  } else if (p.act === 'dunk') {
    const k = Math.min(1, p.t / 0.42)
    p.x = p.x0 + (p.x1 - p.x0) * sm(k); p.y = p.y0 + (p.y1 - p.y0) * sm(k); p.h = 95 * Math.sin(k * Math.PI / 2)
    if (k >= 1 && !p.done) { p.done = true; slamIn(p) }
  }
  if (!p.T || p.t < p.T) return
  if (p.act === 'dunk' || p.act === 'lay') { p.act = p.h > 0 ? 'air' : null; p.vh = 0 }
  else p.act = null
}
function body(p, dt) {
  for (const k of ['stun', 'cool', 'space', 'call', 'cut', 'hold', 'screen', 'react', 'gradeT', 'goalT']) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt)
  if (p.act) acting(p, dt)
  const glued = p.act === 'dunk' || p.act === 'lay'   // 덩크 · 레이업은 acting 이 자리 · 높이를 정한다
  if (!glued && (p.h > 0 || p.vh > 0)) {
    p.vh -= GRAV * (p.act === 'shoot' ? 0.35 : 1) * dt; p.h += p.vh * dt
    if (p.h <= 0) { p.h = 0; p.vh = 0; if (p.act === 'air') p.act = null }
  }
  if (DASH.has(p.act)) { const k = Math.exp(-2.5 * dt); p.vx *= k; p.vy *= k }
  else if (!p.act && p.h === 0 && p.stun <= 0 && p.hold <= 0 && p.screen <= 0) {
    const s = speed(p), tx = p.want[0] * s, ty = p.want[1] * s, dx = tx - p.vx, dy = ty - p.vy, d = Math.hypot(dx, dy), a = ACC * (ball.owner === p ? 0.7 : 1) * dt   // 공을 들면 방향이 굼뜨다
    if (d <= a) { p.vx = tx; p.vy = ty } else { p.vx += dx / d * a; p.vy += dy / d * a }
  } else if (p.h === 0 && !glued) { const k = Math.exp(-10 * dt); p.vx *= k; p.vy *= k }
  if (!glued) { p.x += p.vx * dt; p.y += p.vy * dt }
  const r = R * st(p).size
  if (p.x < r || p.x > CW - r) { p.x = clamp(p.x, r, CW - r); p.vx = 0 }
  if (p.y < r || p.y > CH - r) { p.y = clamp(p.y, r, CH - r); p.vy = 0 }
  // 보는 쪽 — 달리면 가는 쪽, 서 있는 수비는 공 쪽, 슛은 골대 쪽
  const v = Math.hypot(p.vx, p.vy), to = busy(p) ? Math.atan2(RIM.y - p.y, RIM.x - p.x) : v > 30 ? Math.atan2(p.vy, p.vx) : offense !== p.team ? Math.atan2(ball.y - p.y, ball.x - p.x) : p.dir
  p.dir += ((to - p.dir + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, 14 * dt)
  if (DASH.has(p.act)) p.trail.push({ x: p.x, y: p.y, t: 0.22 })
  for (const a of p.trail) a.t -= dt
  if (p.trail.length && p.trail[0].t <= 0) p.trail = p.trail.filter(a => a.t > 0)
}
function collide() {   // 몸끼리 밀어낸다 — 스크린은 밀리지 않고, 부딪힌 수비는 잠깐 걸린다
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j]
    if (a.act === 'dunk' || b.act === 'dunk' || a.act === 'lay' || b.act === 'lay' || Math.abs(a.h - b.h) > 40) continue
    const rr = R * (st(a).size + st(b).size) * 0.92, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy)
    if (d >= rr || d === 0) continue
    for (const [s, q] of [[a, b], [b, a]]) if (s.screen > 0 && q.team !== s.team && q.team !== offense && !s.hit.has(q)) {
      s.hit.add(q); q.hold = 0.6; pop(q, 'SCREEN', '#f5a623')
      const D = team(q.team).find(o => o.man === s)   // CPU 수비는 스크린에 걸리면 반쯤 바꿔 막는다(스위치)
      if (D && D !== me && q !== me && rnd() < 0.5) { [q.man, D.man] = [D.man, q.man]; pop(D, 'SWITCH', '#ff8a8a') }
    }
    const k = (rr - d) / d, wa = a.screen > 0 ? 0 : b.screen > 0 ? 1 : 0.5
    a.x -= dx * k * wa; a.y -= dy * k * wa; b.x += dx * k * (1 - wa); b.y += dy * k * (1 - wa)
  }
}
function effects(dt) {
  if (msg && (msg.t -= dt) <= 0) msg = null
  for (const a of pops) { a.t -= dt; a.y -= 28 * dt }
  for (const a of parts) { a.t -= dt; a.x += a.vx * dt; a.y += a.vy * dt; a.vx *= 0.92; a.vy *= 0.92 }
  for (const a of routes) a.t -= dt
  for (const a of rings) { a.t -= dt; a.r += 160 * dt }
  pops = pops.filter(a => a.t > 0); parts = parts.filter(a => a.t > 0); routes = routes.filter(a => a.t > 0); rings = rings.filter(a => a.t > 0)
  shake = Math.max(0, shake - dt * 30); RIM.shake = Math.max(0, RIM.shake - dt * 3); fade = Math.max(0, fade - dt)
}

// ---------------------------------------------------------------- 그리기

let dpr = 0, courtC = null
const X = x => OX + x, Y = (y, h = 0) => OY + y - h * LIFT
const circle = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2) }
function text(s, x, y, size, fill = '#fff', align = 'center') {
  g.font = `900 ${size}px system-ui, sans-serif`; g.textAlign = align; g.lineJoin = 'round'
  g.lineWidth = Math.max(3, size / 5); g.strokeStyle = '#0b0e14'; g.strokeText(s, x, y); g.fillStyle = fill; g.fillText(s, x, y)
}
// 코트 — 전술판(court.js)과 같은 선 · 색. 한 번 그려 두고 옮겨 그린다
function bakeCourt() {
  courtC = Object.assign(document.createElement('canvas'), { width: W * dpr, height: H * dpr })
  const c = courtC.getContext('2d'), arc = (cx, cy, r, a0, a1) => { c.beginPath(); c.arc(cx, cy, r, a0 * Math.PI / 180, a1 * Math.PI / 180) }
  c.scale(dpr, dpr)
  c.fillStyle = '#0b0e14'; c.fillRect(0, 0, W, H)
  c.translate(OX, OY)
  c.fillStyle = '#1f2937'; c.fillRect(0, 0, CW, CH)
  c.fillStyle = '#243041'; c.fillRect(170, 0, 160, 190)
  c.strokeStyle = '#7d8896'; c.lineWidth = 2
  c.strokeRect(1, 1, CW - 2, CH - 2); c.strokeRect(170, 0, 160, 190)
  arc(250, 190, 60, 0, 360); c.stroke()
  arc(RIM.x, RIM.y, 40, 0, 180); c.stroke()
  const a = Math.atan2(BRK - RIM.y, 220) * 180 / Math.PI
  c.beginPath(); c.moveTo(30, 0); c.lineTo(30, BRK); c.moveTo(470, 0); c.lineTo(470, BRK); c.stroke()
  arc(RIM.x, RIM.y, R3, a, 180 - a); c.stroke()
  arc(250, CH, 60, 180, 360); c.stroke()
  c.font = '900 34px system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffffff0d'; c.fillText('STREET 3:3', 250, 300)
}
function drawHoop() {
  const j = Math.sin(tnow * 60) * RIM.shake * 2.5, y = Y(RIM.y, RIM_H)
  g.fillStyle = '#00000055'; g.fillRect(X(220), Y(40) - 1, 60, 5)   // 백보드 그림자(바닥)
  g.fillStyle = '#e8edf3'; g.fillRect(X(220), Y(40, RIM_H) - 4, 60, 6)
  g.strokeStyle = '#ffffffaa'; g.lineWidth = 1.5; circle(X(RIM.x) + j, y + 3, 7); g.stroke()   // 그물
  g.strokeStyle = '#f5a623'; g.lineWidth = 3; circle(X(RIM.x) + j, y, 9.5); g.stroke()
}
function drawRoutes() {   // 전술판 화살표 — 컷은 파랑, 패스는 점선, 스크린은 주황 막대
  for (const r of routes) {
    const [[x0, y0], [x1, y1]] = r.pts, c = r.kind === 'screen' ? '#f5a623' : '#4d9eff', [ux, uy] = unit(x1 - x0, y1 - y0)
    g.globalAlpha = Math.min(1, r.t * 2) * 0.85; g.strokeStyle = g.fillStyle = c; g.lineWidth = 3; g.lineCap = 'round'
    g.setLineDash(r.kind === 'pass' ? [8, 7] : [])
    g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke(); g.setLineDash([])
    if (r.kind === 'screen') { g.beginPath(); g.moveTo(X(x1) - uy * 13, Y(y1) + ux * 13); g.lineTo(X(x1) + uy * 13, Y(y1) - ux * 13); g.stroke() }
    else { g.beginPath(); g.moveTo(X(x1), Y(y1)); g.lineTo(X(x1) - ux * 10 - uy * 6, Y(y1) - uy * 10 + ux * 6); g.lineTo(X(x1) - ux * 10 + uy * 6, Y(y1) - uy * 10 - ux * 6); g.fill() }
  }
  g.globalAlpha = 1
}
function drawPlayer(p) {
  const T = TEAMS[sides[p.team]], s = 1 + p.h / 140, r = TOKEN * st(p).size * s, x = X(p.x), y = Y(p.y, p.h)
  for (const a of p.trail) { g.globalAlpha = a.t / 0.22 * 0.3; g.fillStyle = T.color; circle(X(a.x), Y(a.y), r); g.fill() }   // 잔상
  g.globalAlpha = 1
  if (p.screen > 0) {   // 스크린 — 앞에 주황 막대
    const [ux, uy] = [Math.cos(p.dir), Math.sin(p.dir)], cx = x + ux * (r + 5), cy = y + uy * (r + 5)
    g.strokeStyle = '#f5a623'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - uy * r, cy + ux * r); g.lineTo(cx + uy * r, cy - ux * r); g.stroke()
  }
  g.save(); g.translate(x, y)
  if (p.act === 'fall') g.rotate((1 - p.t / p.T) ** 2 * 10)   // 빙글 — 발목이 꺾였다
  g.fillStyle = T.dark; circle(0, 0, r); g.fill()
  const img = p.f.img
  if (img.complete && img.naturalWidth) { g.save(); circle(0, 0, r - 2.5); g.clip(); g.drawImage(img, -r, -r, r * 2, r * 2); g.restore() }
  g.strokeStyle = T.color; g.lineWidth = 3; circle(0, 0, r - 1.5); g.stroke()
  g.restore()
  // 보는 쪽 — 고리 밖 작은 삼각형
  const [dx, dy] = [Math.cos(p.dir), Math.sin(p.dir)]
  g.fillStyle = T.color; g.beginPath(); g.moveTo(x + dx * (r + 6), y + dy * (r + 6)); g.lineTo(x + dx * r - dy * 5, y + dy * r + dx * 5); g.lineTo(x + dx * r + dy * 5, y + dy * r - dx * 5); g.fill()
  // 등번호
  g.fillStyle = T.color; circle(x + r * 0.72, y + r * 0.72, 8); g.fill(); g.strokeStyle = T.trim; g.lineWidth = 1.5; g.stroke()
  g.font = '800 9px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(p.f.num, x + r * 0.72, y + r * 0.72 + 3)
  if (p === me) { g.strokeStyle = '#ffd23f'; g.lineWidth = 2; circle(x, y, r + 3.5); g.stroke(); text('1P', x, y + r + 13, 10, '#ffd23f') }   // 1P — 노란 고리 · 아래 이름표
  if (p.call > 0) text('패스!', x, y - r - 16, 12, '#ffd23f')
  if (p.hold > 0 || p.stun > 0.2) text('!', x - r - 3, y - r + 4, 13, '#f5a623')
  if (p.act === 'fall') for (let k = 0; k < 3; k++) { const a = tnow * 6 + k * 2.1; text('✦', x + Math.cos(a) * (r + 4), y - r * 0.6 + Math.sin(a) * 4, 9, '#ffd23f') }
}
function drawMeter(p) {   // 1P 슛 게이지 — 초록 칸에서 놓으면 PERFECT
  if (p.act !== 'shoot' || p.meter < 0) return
  const x = X(p.x) + TOKEN * 1.3 + 8, y = Y(p.y, p.h) + 26, hgt = 56, w = greenW(p), m = Math.min(p.meter, 1.3) / 1.3, gy = y - (GREEN + w) / 1.3 * hgt, gh = w * 2 / 1.3 * hgt
  g.fillStyle = '#0b0e14dd'; g.fillRect(x - 2, y - hgt - 2, 12, hgt + 4)
  g.fillStyle = '#2ea04355'; g.fillRect(x, gy, 8, gh)
  g.fillStyle = Math.abs(p.meter - GREEN) < w ? '#3fb950' : '#ffd23f'; g.fillRect(x, y - m * hgt, 8, m * hgt)
  g.strokeStyle = '#3fb950'; g.lineWidth = 2; g.strokeRect(x - 1, gy, 10, gh)   // 초록 칸은 테두리로 — 차오르는 막대에 가려지지 않게
}
function drawBall() {
  const b = ball
  let x = b.x, y = b.y, h = b.h
  if (b.st === 'held') {   // 드리블 — 손 쪽(보는 쪽 옆)에서 튄다. 슛 · 덩크 · 레이업은 머리 위
    const o = b.owner, [dx, dy] = [Math.cos(o.dir), Math.sin(o.dir)]
    if (busy(o) || o.act === 'air') { x = o.x + dx * 4; y = o.y + dy * 4; h = o.h + (o.act === 'dunk' ? 30 : 60) }
    else { x = o.x + dx * 9 - dy * 11 * o.side; y = o.y + dy * 9 + dx * 11 * o.side; h = 6 + 34 * Math.abs(Math.sin(tnow * 9)) }
  }
  g.fillStyle = '#00000066'; g.beginPath(); g.ellipse(X(x), Y(y), 6, 3.5, 0, 0, Math.PI * 2); g.fill()
  const r = 5.5 * (1 + h / 120), bx = X(x), by = Y(y, h), flash = b.st === 'loose' && !b.dead && b.vh < 0 && b.h < 150
  g.fillStyle = flash ? '#fff1d6' : '#f08a24'; circle(bx, by, r); g.fill()
  g.strokeStyle = '#3a1a00'; g.lineWidth = 1.2; g.stroke()
  g.beginPath(); g.moveTo(bx - r, by); g.lineTo(bx + r, by); g.moveTo(bx, by - r); g.lineTo(bx, by + r); g.stroke()
}
function hud() {
  g.fillStyle = '#0b0e14'; g.fillRect(0, 0, W, OY - 6)
  const side = (t, x, align) => {
    const T = TEAMS[sides[t]], s = align === 'left' ? 1 : -1
    g.fillStyle = T.color; g.fillRect(align === 'left' ? 12 : W - 18, 10, 6, 30)
    text(String(score[t]), x, 40, 30, '#fff', align)
    text(T.name + (t === me.team ? ' (1P)' : ''), x + s * 44, 22, 12, T.color, align)
    if (offense === t && mode === 'play') text('● 공격', x + s * 44, 39, 11, '#f5a623', align)
  }
  side(0, 26, 'left'); side(1, W - 26, 'right')
  const m = Math.floor(clock / 60), sec = Math.floor(clock % 60)
  text(sudden ? 'SUDDEN DEATH' : `${m}:${String(sec).padStart(2, '0')}`, W / 2, 25, sudden ? 15 : 22, '#fff')
  text(`공격 ${Math.max(0, Math.ceil(shot))} · ${WIN}점 먼저`, W / 2, 42, 11, shot < 4.5 ? '#ff6b6b' : '#9aa4b1')
}
function selectScreen() {
  g.fillStyle = '#0b0e14'; g.fillRect(0, 0, W, H)
  text('내 선수를 고르세요', W / 2, 36, 20, '#ffd23f')
  TEAMS.forEach((T, ti) => {
    const y0 = ROW_Y + ti * ROW_H
    text(T.name, 18, y0 + 50, 15, T.color, 'left')
    text('3명 · 가드 포워드 센터', 18, y0 + 68, 9, '#9aa4b1', 'left')
    T.three.forEach((f, c) => {
      const x0 = COL_X + c * COL_W, on = pick === ti * 3 + c
      g.fillStyle = on ? '#2a2410' : '#161b22'; g.strokeStyle = on ? '#ffd23f' : T.color + '66'; g.lineWidth = on ? 3 : 1.5
      g.beginPath(); g.roundRect(x0, y0, COL_W - 10, ROW_H - 8, 10); g.fill(); g.stroke()
      const cx = x0 + (COL_W - 10) / 2
      g.fillStyle = T.dark; circle(cx, y0 + 38, 29); g.fill()
      if (f.img.complete && f.img.naturalWidth) { g.save(); circle(cx, y0 + 38, 27); g.clip(); g.drawImage(f.img, cx - 29, y0 + 9, 58, 58); g.restore() }
      g.strokeStyle = T.color; g.lineWidth = 3; circle(cx, y0 + 38, 28); g.stroke()
      g.font = '700 12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e6edf3'; g.fillText(f.name.length > 9 ? f.name.slice(0, 9) + '…' : f.name, cx, y0 + 83)
      g.font = '600 10px system-ui, sans-serif'; g.fillStyle = '#9aa4b1'; g.fillText(`${ROLE[c]} · #${f.num}`, cx, y0 + 97)
    })
  })
  text('고른 선수를 한 번 더 누르면 시작 · Enter', W / 2, H - 10, 12, '#9aa4b1')
}
function draw() {
  const d = Math.min(2, devicePixelRatio || 1)
  if (d !== dpr) { dpr = d; cv.width = W * d; cv.height = H * d; courtC = null }
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (mode === 'load') { g.fillStyle = '#0b0e14'; g.fillRect(0, 0, W, H); return text('불러오는 중…', W / 2, H / 2, 16, '#9aa4b1') }
  if (mode === 'select') return selectScreen()
  if (!courtC) bakeCourt()
  g.drawImage(courtC, 0, 0, W, H)
  g.save()
  if (shake) g.translate((rnd() - 0.5) * shake, (rnd() - 0.5) * shake)
  if (clear) {   // 클리어 — 3점 라인이 깜빡인다
    const a = Math.atan2(BRK - RIM.y, 220)
    g.strokeStyle = `rgba(255,210,63,${0.45 + 0.35 * Math.sin(tnow * 8)})`; g.lineWidth = 4
    g.beginPath(); g.moveTo(X(30), Y(0)); g.lineTo(X(30), Y(BRK)); g.arc(X(RIM.x), Y(RIM.y), R3, Math.PI - a, a, true); g.lineTo(X(470), Y(0)); g.stroke()
  }
  drawRoutes()
  if (me && offense !== me.team && me.man && mode === 'play') {   // 내가 맡은 선수 — 빨간 점선
    g.strokeStyle = '#ff5d5d66'; g.lineWidth = 2; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(X(me.x), Y(me.y)); g.lineTo(X(me.man.x), Y(me.man.y)); g.stroke(); g.setLineDash([])
  }
  if (ball.st === 'loose' && !ball.dead && ball.land) {   // 리바운드 — 떨어질 자리. 공이 하얗게 빛나면 뛸 때
    const L = ball.land, hot = ball.vh < 0 && ball.h < 150
    g.strokeStyle = hot ? '#ffffff' : '#ffffff88'; g.lineWidth = 2; g.setLineDash([5, 4]); circle(X(L.x), Y(L.y), 14); g.stroke(); g.setLineDash([])
  }
  for (const p of ps) { const r = TOKEN * st(p).size; g.fillStyle = '#00000059'; g.beginPath(); g.ellipse(X(p.x), Y(p.y) + 3, r * 1.05, r * 0.75, 0, 0, Math.PI * 2); g.fill() }
  const air = ps.filter(p => p.h > 45), low = ps.filter(p => p.h <= 45).sort((a, b) => a.y - b.y)
  for (const p of low) drawPlayer(p)
  drawHoop()
  for (const p of air) drawPlayer(p)
  if (ball.st) drawBall()
  for (const a of rings) { g.strokeStyle = `rgba(255,255,255,${a.t * 2})`; g.lineWidth = 3; circle(X(a.x), Y(a.y, RIM_H), a.r); g.stroke() }
  for (const a of parts) { g.globalAlpha = Math.min(1, a.t * 3); g.fillStyle = a.c; g.fillRect(X(a.x) - 2, Y(a.y, RIM_H * 0.5) - 2, 4, 4) }
  g.globalAlpha = 1
  for (const p of ps) if (p.gradeT > 0) text(p.grade, X(p.x), Y(p.y, p.h) - 30 - (0.9 - p.gradeT) * 20, 13, { PERFECT: '#3fb950', GOOD: '#ffd23f' }[p.grade] ?? '#ff8a8a')
  for (const a of pops) { g.globalAlpha = Math.min(1, a.t * 2.5); text(a.text, X(a.x), Y(a.y), 12, a.c) }
  g.globalAlpha = 1
  if (me) drawMeter(me)
  g.restore()
  if (clear && mode === 'play') text(offense === me.team ? 'CLEAR — 3점 라인 밖으로' : `${TEAMS[sides[offense]].name} CLEAR 중`, W / 2, H - 14, 13, '#ffd23f')
  if (msg) { const k = msg.t / msg.t0; g.globalAlpha = Math.min(1, k * 4); text(msg.text, W / 2, 250 + (1 - k) * -10, msg.text.length > 14 ? 22 : 34, '#ffd23f'); g.globalAlpha = 1 }
  hud()
  if (fade > 0) { g.fillStyle = `rgba(11,14,20,${fade / 0.35})`; g.fillRect(0, OY - 6, W, H) }
  if (mode === 'over') {
    const win = score[me.team] > score[1 - me.team]
    g.fillStyle = '#0b0e14cc'; g.fillRect(0, 0, W, H)
    text(win ? 'YOU WIN!' : 'YOU LOSE', W / 2, 230, 44, win ? '#ffd23f' : '#ff8a8a')
    text(`${TEAMS[sides[0]].name} ${score[0]} - ${score[1]} ${TEAMS[sides[1]].name}`, W / 2, 275, 18, '#fff')
    if (wait <= 0) text('누르면 다시', W / 2, 320, 14, '#9aa4b1')
  }
}

let last = 0
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0)
  last = t
  update(dt)
  draw()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

await loadData()
const kr = data.players.filter(p => p.server === 'kr')
TEAMS.forEach((T, ti) => {
  const five = lineup(kr, ti)
  T.three = SLOTS.map(pos => {
    const p = five[pos - 1], img = new Image()
    if (p) img.src = faceOf(p)
    return { name: p ? p.short || p.name : `${pos}번`, num: NBA_NUM[p?.id] ?? NUMS[pos - 1], img }
  })
})
// 포지션 특성 표 — STATS 의 설명
document.getElementById('pos-table').replaceChildren(...STATS.map((S, i) => {
  const tr = document.createElement('tr')
  tr.append(Object.assign(document.createElement('th'), { textContent: ['가드', '포워드', '센터'][i] }), Object.assign(document.createElement('td'), { textContent: S.note }))
  return tr
}))
mode = 'select'
