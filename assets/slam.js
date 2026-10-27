// 슈퍼 슬램 — 5:5 풀코트 오락실 농구(1P vs CPU). 숨긴 메뉴 — 마이페이지 관리자 메뉴에서만 링크한다.
// 90년대 오락실 농구(Super Slams) 느낌만 빌린 새 게임이다. 원작 롬 · 그림 · 팀 이름은 쓰지 않는다 — 롬은 저작물이라 이 공개 사이트에 둘 수 없다.
// 선수 얼굴은 덩크 시티 선수(data/players.json). 1P 는 오른쪽 골대를 공격한다. 포지션마다 궁극기가 있고 게이지가 차면 쓴다.
// 키: 방향키 · WASD 이동, 드리블 Z · J, 패스 X · K, 슛 C · L · 스페이스, 궁극기 V · U. 수비 때는 스틸 · 선수 바꾸기 · 블록 · 스틸 대시. 휴대폰은 캔버스 아래 스틱 · 버튼.
// ponytail: 파울 · 자유투 · 아웃 오브 바운즈 · 하프코트 바이얼레이션 · 소리 없음 — 공은 코트 끝에서 튕겨 나온다
import { mountTop } from './app.js?v=fb02b445'
import { loadData, data, startAuth } from './board.js?v=4233415a'

mountTop('/slam/')
startAuth('', () => {})   // 머리의 로그인 · 이름 줄 — 다른 페이지와 같다

const cv = document.getElementById('slam'), g = cv.getContext('2d')
const W = 960, H = 540, DPR = Math.min(2, devicePixelRatio || 1)
cv.width = W * DPR; cv.height = H * DPR; g.scale(DPR, DPR)

const CL = 940, CW = 500, RIM = 100                 // 코트 길이 · 너비 · 림 높이(월드 단위 = 0.1피트)
const HOOP = [{ x: 52, z: 250, shake: 0 }, { x: 888, z: 250, shake: 0 }]
const S = 1.45, TOP = 150                            // 화면 배율 · 코트 먼 쪽 줄의 화면 y
const GAME = 180, SHOT = 30, SPD = 175, GRAV = 1100, JUMP = 360
const TEAMS = [
  { name: 'VIPERS_T', color: '#d6323a', dark: '#7d1520' },
  { name: 'VIPERS_N', color: '#1f9d6b', dark: '#0d5a3c' },
  { name: 'VIPERS_A', color: '#2f6fd0', dark: '#173c7a' },
  { name: 'VIPERS_B', color: '#8b4fd0', dark: '#4a2483' },
]
const NUMS = [1, 7, 10, 23, 34]
const ULT = ['앵클 브레이커', '딥 쓰리', '에어 워크', '불도저', '메가 슬램']   // 포지션 1~5 의 궁극기
const ULT_FILL = 1 / 32                                                        // 초당 — 32초면 찬다
const SPOT = [[270, 0], [210, -150], [210, 150], [75, -100], [65, 100]]   // 공격 골대에서 [뒤로, 옆으로] — 포지션 1~5
const SKIN = '#b9825a'
const CARDS = [[40, 80], [490, 80], [40, 305], [490, 305]], CARD_W = 430, CARD_H = 205

let mode = 'load', pick = 0, sides = [0, 1]          // sides = [1P 팀, CPU 팀] (TEAMS 번호)
let ps = [], ball = {}, score = [0, 0], clock = GAME, shot = SHOT, offense = 0, ctl = null, msg = null, wait = 0, tip = null, camX = CL / 2
let cut = null, parts = [], rings = [], shake = 0, tnow = 0   // 궁극기 컷인 · 파편 · 충격파 · 화면 흔들림 · 시계(초)

const rnd = Math.random
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const goal = t => HOOP[t === 0 ? 1 : 0]              // 공격하는 골대
const side = t => t === 0 ? 1 : -1                   // 공격 방향 x 부호
const team = t => ps.filter(p => p.team === t)
const nearest = (list, o) => list.reduce((a, b) => dist(b, o) < dist(a, o) ? b : a)
const open = p => Math.min(...ps.filter(q => q.team !== p.team).map(q => dist(q, p)))   // 가장 가까운 수비까지
const say = (text, t = 1.1) => { msg = { text, t, t0: t } }
const guarded = o => o.act === 'air' || o.act === 'cross' || o.act === 'dunk' || o.sure   // 이 동작 중에는 스틸이 안 된다
/** 월드 → 화면. 가까울수록(z 가 클수록) 크게 — [x, y, 월드 1 의 픽셀] */
function P(x, z, h = 0) { const u = S * (0.8 + 0.4 * z / CW); return [W / 2 + (x - camX) * u, TOP + z * 0.7 - h * u, u] }

// ---------------------------------------------------------------- 입력

const keys = new Set(), joy = { x: 0, z: 0 }, input = { dr: false, pa: false, sh: false, ul: false }
const KEYS = { KeyZ: 'dr', KeyJ: 'dr', KeyX: 'pa', KeyK: 'pa', KeyC: 'sh', KeyL: 'sh', Space: 'sh', KeyV: 'ul', KeyU: 'ul' }

function press(k) {
  if (mode === 'select') return start()
  if (mode === 'over') return void (wait <= 0 && (mode = 'select'))   // 끝나자마자 연타로 결과를 건너뛰지 않게
  input[k] = true
}
addEventListener('keydown', e => {
  const c = e.code
  if (e.target.closest?.('input, textarea, select, button, a') || !/^(Arrow\w+|Key[WASDZXCVJKLU]|Space|Enter)$/.test(c)) return
  e.preventDefault()
  keys.add(c)
  if (e.repeat) return
  if (mode === 'select' && c.startsWith('Arrow')) {
    const col = c === 'ArrowLeft' ? 0 : c === 'ArrowRight' ? 1 : pick % 2, row = c === 'ArrowUp' ? 0 : c === 'ArrowDown' ? 1 : pick >> 1
    pick = row * 2 + col
  } else if (c === 'Enter') { if (mode === 'select' || mode === 'over') press('sh') }
  else if (KEYS[c]) press(KEYS[c])
})
addEventListener('keyup', e => keys.delete(e.code))
addEventListener('blur', () => keys.clear())
function axis() {
  const k = c => keys.has(c) ? 1 : 0
  const x = joy.x + k('ArrowRight') + k('KeyD') - k('ArrowLeft') - k('KeyA'), z = joy.z + k('ArrowDown') + k('KeyS') - k('ArrowUp') - k('KeyW')
  const d = Math.hypot(x, z)
  return d > 1 ? [x / d, z / d] : [x, z]
}
// 팀 선택은 카드를 누르고, 고른 카드를 한 번 더 누르면 시작. 끝난 화면은 누르면 팀 선택으로
cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H
  if (mode === 'select') {
    const i = CARDS.findIndex(([cx, cy]) => x >= cx && x <= cx + CARD_W && y >= cy && y <= cy + CARD_H)
    if (i >= 0) i === pick ? start() : pick = i
  } else if (mode === 'over' && wait <= 0) mode = 'select'
})
// 휴대폰 스틱 · 버튼
const stick = document.getElementById('stick'), knob = stick.firstElementChild, ulBtn = document.getElementById('btn-ul')
function steer(e) {
  const r = stick.getBoundingClientRect(), R = r.width / 2
  let x = (e.clientX - r.left - R) / R, z = (e.clientY - r.top - R) / R
  const d = Math.hypot(x, z)
  if (d > 1) { x /= d; z /= d }
  joy.x = Math.abs(x) > 0.2 ? x : 0; joy.z = Math.abs(z) > 0.2 ? z : 0
  knob.style.transform = `translate(${x * R * 0.55}px, ${z * R * 0.55}px)`
}
const release = () => { joy.x = joy.z = 0; knob.style.transform = '' }
stick.addEventListener('pointerdown', e => { stick.setPointerCapture(e.pointerId); steer(e) })
stick.addEventListener('pointermove', e => stick.hasPointerCapture(e.pointerId) && steer(e))
stick.addEventListener('pointerup', release)
stick.addEventListener('pointercancel', release)
for (const k of ['dr', 'pa', 'sh', 'ul']) document.getElementById(`btn-${k}`).addEventListener('pointerdown', e => { e.preventDefault(); press(k) })

// ---------------------------------------------------------------- 경기 흐름

function start() {
  const others = [0, 1, 2, 3].filter(i => i !== pick)
  sides = [pick, others[Math.floor(rnd() * others.length)]]
  ps = [0, 1].flatMap(t => TEAMS[sides[t]].five.map((f, i) => ({
    team: t, i, f, x: 0, z: 0, h: 0, vh: 0, dir: side(t), run: 0, mv: false, act: null, t: 0,
    cool: 0, stun: 0, fall: 0, think: 0, cut: 0, block: 0, reach: 0, ult: rnd() * 0.3, boost: 0, cdx: 0, dp: 0, hand: 1, sq: 0, kb: null, sure: false, trail: [], tt: 0,
  })))
  score = [0, 0]; clock = GAME; shot = SHOT; offense = 0
  cut = null; parts = []; rings = []; shake = 0
  for (const k in input) input[k] = false
  const at = [[370, 250], [415, 120], [415, 380], [330, 170], [456, 250]]
  for (const p of ps) { const [x, z] = at[p.i]; p.x = p.team ? CL - x : x; p.z = p.team ? CW - z : z }
  ball = { st: 'tip', x: 470, z: 250, h: 60, owner: null, trail: [], rot: 0 }
  ctl = ps.find(p => p.team === 0 && p.i === 4)
  tip = { t: 0, me: null, cpu: 0.28 + (rnd() - 0.5) * 0.4, cpuUp: false }
  mode = 'tip'
  say('TIP OFF', 1.2)
}

// 점프볼 — 공이 꼭대기(0.6초)에 갈 때 맞춰 뛰어야 한다. 점프는 0.33초에 가장 높으니 0.28초쯤 누르면 딱 맞다
function tipOff(dt) {
  tip.t += dt
  ball.h = 60 + 300 * tip.t - 250 * tip.t ** 2
  const cpuC = ps.find(p => p.team === 1 && p.i === 4)
  if (input.sh && tip.me == null) { tip.me = tip.t; jump(ctl) }
  if (!tip.cpuUp && tip.t >= tip.cpu) { tip.cpuUp = true; jump(cpuC) }
  if (tip.t < 0.95) return
  const win = tip.me != null && Math.abs(tip.me - 0.28) < Math.abs(tip.cpu - 0.28) ? 0 : 1
  offense = win
  Object.assign(ball, { st: 'pass', h: 110, to: ps.find(p => p.team === win && p.i === 0), tried: new Set(ps) })
  mode = 'play'
}

function grab(p, why) {
  const turn = p.team !== offense
  if (turn || ball.rebound) shot = SHOT
  offense = p.team
  Object.assign(ball, { st: 'held', owner: p, to: null, rebound: false, sure: false })
  if (p.act === 'rush') p.act = null
  p.sure = false; p.dp = 0
  p.think = 0.3 + rnd() * 0.3
  ctl = p.team === 0 ? p : nearest(team(0), p)
  if (why) say(why)
}

function made(t, pts, text, by) {
  score[t] += pts
  say(text || (pts === 3 ? '3 POINTS!' : '2 POINTS'))
  const h = goal(t)
  burst(h.x, h.z, RIM, 28, ['#ffd23f', '#ff9d00', '#fff'])
  h.shake = Math.max(h.shake, 0.3)
  if (by) by.ult = Math.min(1, by.ult + 0.3)
  Object.assign(ball, { st: 'drop', owner: null, x: h.x, z: h.z, h: RIM - 4, vx: 0, vz: 0, vh: -60 })
  offense = 1 - t
  mode = 'dead'; wait = 1.2
}

// 득점한 골대 밑에서 상대 1번이 공을 잡고 시작
function inbound(t) {
  const h = goal(1 - t), pg = ps.find(p => p.team === t && p.i === 0)
  Object.assign(pg, { x: h.x + side(1 - t) * 30, z: h.z + 70, h: 0, vh: 0, act: null, stun: 0, fall: 0, kb: null })
  shot = SHOT; mode = 'play'
  grab(pg)
}

function miss(h) {
  const s = Math.sign(h.x - CL / 2)
  h.shake = 0.25
  Object.assign(ball, { st: 'loose', owner: null, x: h.x - s * 12, z: h.z, h: RIM + 4, vx: -s * (50 + rnd() * 140), vz: (rnd() - 0.5) * 260, vh: 150 + rnd() * 100, rebound: true, sure: false })
  ctl = nearest(team(0), ball)
}

function swat(p, b) {
  Object.assign(ball, { st: 'loose', owner: null, x: p.x, z: p.z, h: p.h + 70, vx: -side(p.team) * (120 + rnd() * 120), vz: (rnd() - 0.5) * 200, vh: 60, rebound: false })
  b.ult = Math.min(1, b.ult + 0.2)
  ctl = nearest(team(0), ball)
  shake = Math.max(shake, 5)
  say('BLOCK!')
}

const end = () => { mode = 'over'; msg = null; cut = null; wait = 1.5 }

// ---------------------------------------------------------------- 효과

function burst(x, z, h, n, c) {
  for (let i = 0; i < n; i++) parts.push({ x, z, h, vx: (rnd() - 0.5) * 300, vz: (rnd() - 0.5) * 200, vh: 80 + rnd() * 320, t: 0.45 + rnd() * 0.4, c: Array.isArray(c) ? c[i % c.length] : c })
}
/** 넘어뜨린다 — 밀려나는 속도(vx, vz)는 없어도 된다 */
function knock(q, vx, vz, t) {
  q.stun = q.fall = t
  q.act = null
  q.kb = vx || vz ? { vx, vz, t: 0.35 } : null
  burst(q.x, q.z, 4, 6, '#e3cfa3')
}

// ---------------------------------------------------------------- 동작

function jump(p) { if (p.h === 0 && !p.act) p.vh = JUMP }
const canMove = p => !p.act && p.h === 0 && p.stun <= 0 && !p.kb
const speed = p => SPD * (ball.owner === p ? 0.92 : 1) * (p.boost > 0 ? 1.45 : 1)

function step(p, dx, dz, spd, dt) {
  p.mv = !!(dx || dz)
  if (!p.mv) return
  p.x += dx * spd * dt; p.z += dz * spd * dt * 0.85
  if (Math.abs(dx) > 0.15) p.dir = Math.sign(dx)
  p.run += dt
}
function toward(p, tx, tz, spd, dt) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz)
  if (d < 5) return void (p.mv = false)
  const k = Math.min(1, d / 30) / d
  step(p, dx * k, dz * k, spd, dt)
}

function pass(p, m) {
  Object.assign(ball, { st: 'pass', owner: null, to: m, x: p.x + p.dir * 12, z: p.z, h: 40, tried: new Set([p]) })
  p.cool = 0.25
}
/** 스틱 방향에 가장 가까운 동료. 방향이 없으면 비어 있고 골대에 가까운 동료 */
function mateFor(p, dx = 0, dz = 0) {
  const mates = team(p.team).filter(m => m !== p), h = goal(p.team)
  const fit = Math.hypot(dx, dz) > 0.3
    ? m => ((m.x - p.x) * dx + (m.z - p.z) * dz) / (dist(m, p) || 1)
    : m => Math.min(open(m), 120) - dist(m, h) * 0.5 - dist(m, p) * 0.2
  return mates.reduce((a, b) => fit(b) > fit(a) ? b : a)
}

// 드리블(크로스오버) — 짧게 튀어 나가며 공을 반대 손으로. 붙어 있던 수비는 가끔 발목이 꺾여 넘어진다
function crossover(p, ax, az) {
  if (p.cdx > 0 || p.act || p.h > 0) return
  let dx = ax, dz = az
  if (!dx && !dz) { const q = nearest(team(1 - p.team), p); dx = side(p.team) * 0.6; dz = p.z > q.z ? 1 : -1 }   // 방향이 없으면 가장 가까운 수비를 옆으로 제친다
  const d = Math.hypot(dx, dz)
  Object.assign(p, { act: 'cross', t: 0, cx: dx / d * SPD * 2.4, cz: dz / d * SPD * 2.4 * 0.85, cdx: 0.9, hand: -p.hand })
  if (Math.abs(dx) > 0.15) p.dir = Math.sign(dx)
  for (const q of team(1 - p.team)) if (dist(q, p) < 45 && rnd() < 0.4) { knock(q, 0, 0, 0.9); say('ANKLES!', 0.7) }
}

function dunkFrom(p, mega) {
  Object.assign(p, { act: 'dunk', t: 0, from: { x: p.x, z: p.z }, dur: mega ? 0.6 : 0.4, peak: mega ? 130 : 88 })
  p.dir = Math.sign(goal(p.team).x - p.x) || p.dir
}
function shoot(p) {
  if (p.act || p.h > 0) return
  const h = goal(p.team)
  p.dir = Math.sign(h.x - p.x) || p.dir
  if (dist(p, h) < 90) dunkFrom(p, false)
  else Object.assign(p, { act: 'shot', t: 0, rel: false, vh: JUMP * (p.sure ? 1.15 : 1) })
  // 가까운 수비는 조금 늦게 뛰어 막으러 온다(1P 가 움직이는 선수는 직접 뛴다)
  if (!p.sure) for (const q of ps) if (q.team !== p.team && q !== ctl && dist(q, p) < 60 && rnd() < 0.75) q.block = 0.05 + rnd() * 0.22
}
const blocker = (p, r) => ps.find(q => q.team !== p.team && q.h > 22 && dist(q, p) < r)

function letGo(p) {   // 점프슛을 놓는 순간
  const h = goal(p.team), d = dist(p, h), sure = p.sure
  p.sure = false
  if (!sure) { const b = blocker(p, 40); if (b && rnd() < 0.45) return swat(p, b) }
  let pr = d < 160 ? 0.62 : d < 237 ? 0.5 : d < 300 ? 0.38 : 0.12
  const c = open(p)
  pr *= c < 30 ? 0.55 : c < 55 ? 0.8 : 1
  const three = d > 237 || Math.abs(p.z - h.z) > 220
  Object.assign(ball, { st: 'shot', owner: null, x: p.x + p.dir * 6, z: p.z, h: p.h + 74, t: 0, T: 0.7 + d / 900, make: sure || rnd() < pr, pts: three ? 3 : 2, team: p.team, hoop: h, arc: 60 + d * 0.3, sure, by: p })
  Object.assign(ball, { sx: ball.x, sz: ball.z, sh: ball.h })
}
function slam(p) {    // 덩크가 림에 닿는 순간
  const sure = p.sure, mega = p.dur > 0.5, h = goal(p.team)
  p.sure = false
  if (!sure) { const b = blocker(p, 34); if (b && rnd() < 0.3) return swat(p, b) }
  h.shake = 0.6
  shake = Math.max(shake, mega ? 18 : 8)
  if (mega) {   // 충격파 — 골밑 상대가 다 넘어진다
    rings.push({ x: h.x, z: h.z, t: 0 })
    for (const q of team(1 - p.team)) { const d = dist(q, h); if (d < 170) knock(q, (q.x - h.x) / (d || 1) * 300, (q.z - h.z) / (d || 1) * 300, 1.3) }
  }
  if (sure || rnd() < 0.9) return made(p.team, 2, mega ? 'MEGA SLAM!' : 'SLAM DUNK!', p)
  miss(h)
}

function steal(p, o) {
  if (p.cool > 0) return
  p.cool = 0.5; p.reach = 0.2
  if (!guarded(o) && rnd() < (p.team === 0 ? 0.32 : 0.2)) { grab(p, 'STEAL!'); p.ult = Math.min(1, p.ult + 0.2) }
  else p.stun = 0.3
}

// 궁극기 — 게이지가 차 있으면 컷인(느린 화면) 뒤에 fire(). 공을 가지면 포지션의 기술, 수비면 공 가진 상대에게 날아가는 스틸 대시
function ultimate(p) {
  if (p.ult < 1 || cut || p.act || p.h > 0 || p.stun > 0) return false
  const off = ball.owner === p
  if (off && p.i === 4 && dist(p, goal(p.team)) > 300) { if (p.team === 0) say('골밑에서 써요', 0.8); return false }
  if (!off) { const o = ball.owner; if (!o || o.team === p.team || o.sure || dist(p, o) > 320) return false }
  p.ult = 0
  cut = { p, off, t: 0 }
  shake = Math.max(shake, 4)
  return true
}
function fire(p, off) {
  if (!off) return void Object.assign(p, { act: 'rush', t: 0 })
  if (ball.owner !== p) return   // 그새 뺏겼다
  const opp = team(1 - p.team)
  if (p.i === 0) { for (const q of opp) if (dist(q, p) < 110) knock(q, 0, 0, 1.6); p.boost = 2.5; say('ANKLE BREAKER!') }
  if (p.i === 1) { p.sure = true; shoot(p) }
  if (p.i === 2) Object.assign(p, { act: 'air', t: 0, sure: true })
  if (p.i === 3) {
    for (const q of opp) { const d = dist(q, p); if (d < 150) knock(q, (q.x - p.x) / (d || 1) * 340, (q.z - p.z) / (d || 1) * 340, 1.3) }
    p.boost = 2; shake = Math.max(shake, 10); say('BULLDOZER!')
  }
  if (p.i === 4) { p.sure = true; dunkFrom(p, true) }
}

// 몸 — 쿨타임 · 게이지 · 점프 · 동작. 동작 중 공을 뺏겼으면(ball.owner 가 아니면) 놓지 않는다
function body(p, dt) {
  for (const k of ['cool', 'stun', 'fall', 'boost', 'cdx', 'sq', 'reach']) p[k] = Math.max(0, p[k] - dt)
  p.ult = Math.min(1, p.ult + dt * ULT_FILL * (p.team ? 0.8 : 1))   // CPU 는 조금 느리게 찬다
  if (ball.owner === p) p.dp += dt * (p.mv ? 11 : 7)
  if (p.act === 'cross' || p.act === 'air' || p.act === 'rush' || p.boost > 0 || p.kb) {   // 잔상
    if ((p.tt -= dt) <= 0) { p.tt = 0.035; p.trail.unshift({ x: p.x, z: p.z, h: p.h }); p.trail.length = Math.min(p.trail.length, 5) }
  } else p.trail.pop()
  if (p.kb) { p.x += p.kb.vx * dt; p.z += p.kb.vz * dt; if ((p.kb.t -= dt) <= 0) p.kb = null }
  const h = goal(p.team)
  if (p.act === 'cross') {
    p.x += p.cx * dt; p.z += p.cz * dt; p.run += dt * 1.5
    if ((p.t += dt) >= 0.26) p.act = null
    return
  }
  if (p.act === 'air') {   // 에어 워크 — 골대 앞까지 날아간다
    const d = dist(p, h), v = 620 * dt
    if (d < 80) return dunkFrom(p, false)
    p.x += (h.x - p.x) / d * v; p.z += (h.z - p.z) / d * v; p.run += dt * 2
    return
  }
  if (p.act === 'rush') {  // 스틸 대시 — 공을 끝까지 쫓는다. 패스하면 날아가는 공을, 받으면 받은 사람을
    const o = ball.owner, tg = o || ball, d = dist(p, tg), v = 700 * dt
    if (o ? o.team === p.team || o.sure : ball.st !== 'pass' && ball.st !== 'loose') return void (p.act = null)
    if ((p.t += dt) > 1.5) return void (p.act = null)
    if (d < 22) { p.act = null; return grab(p, 'STEAL!') }
    p.x += (tg.x - p.x) / d * v; p.z += (tg.z - p.z) / d * v; p.dir = Math.sign(tg.x - p.x) || p.dir; p.run += dt * 2
    return
  }
  if (p.act === 'dunk') {
    p.t += dt
    const u = Math.min(1, p.t / p.dur)
    p.x = p.from.x + (h.x - side(p.team) * 16 - p.from.x) * u; p.z = p.from.z + (h.z - p.from.z) * u
    p.h = p.peak * Math.sin(u * Math.PI / 2)
    if (u >= 1) { p.act = 'land'; p.vh = 0; if (ball.owner === p) slam(p) }
    return
  }
  if (p.act === 'shot' && !p.rel && (p.t += dt) >= 0.3) { p.rel = true; if (ball.owner === p) letGo(p) }
  if (p.h > 0 || p.vh > 0) {
    p.vh -= GRAV * dt; p.h += p.vh * dt
    if (p.h <= 0) {
      if (p.act === 'land') burst(p.x, p.z, 2, 8, '#e3cfa3')
      p.h = 0; p.vh = 0; p.sq = 0.14
      if (p.act) p.act = null
    }
  }
}

// ---------------------------------------------------------------- 1P · CPU

function user(dt) {
  const p = ctl, [ax, az] = axis()
  if (canMove(p)) step(p, ax, az, speed(p), dt)
  else p.mv = false
  if (cut || input.ul && ultimate(p)) return
  if (ball.owner === p) {
    if (input.dr) crossover(p, ax, az)
    else if (input.pa) pass(p, mateFor(p, ax, az))
    else if (input.sh) shoot(p)
    return
  }
  if (input.sh) jump(p)
  if (input.dr) { const o = ball.owner; if (o && o.team === 1 && dist(p, o) < 34) steal(p, o); else p.reach = 0.2 }
  if (input.pa) ctl = nearest(team(0), ball)   // 공에 가장 가까운 선수로 바꾼다
}

function ai(p, dt) {
  if (p.block > 0 && (p.block -= dt) <= 0) jump(p)
  if (!canMove(p)) return void (p.mv = false)
  if (ball.owner === p) return handle(p, dt)
  const mine = team(p.team).sort((a, b) => dist(a, ball) - dist(b, ball))
  if (ball.st === 'loose' && mine.indexOf(p) < 2) {   // 굴러다니는 공은 팀마다 가까운 둘이 쫓는다
    if (dist(p, ball) < 30 && ball.h > 45 && ball.h < 130) jump(p)
    return toward(p, ball.x, ball.z, SPD, dt)
  }
  if (ball.st === 'shot' && (p.i >= 3 || dist(p, ball.hoop) < 130)) {   // 슛이 뜨면 빅맨 · 가까운 선수는 리바운드 자리로
    const h = ball.hoop, d = dist(p, h) || 1
    return toward(p, h.x + (p.x - h.x) / d * 55, h.z + (p.z - h.z) / d * 55, SPD, dt)
  }
  if (p.team === offense) {
    const h = goal(p.team), s = side(p.team), [back, lat] = SPOT[p.i]
    if (p.cut > 0) { p.cut -= dt; return toward(p, h.x - s * 45, h.z + p.cz, SPD, dt) }   // 골밑으로 컷인
    if (ball.owner?.team === p.team && rnd() < dt * 0.15) { p.cut = 1.3; p.cz = (rnd() - 0.5) * 80 }
    return toward(p, h.x - s * back, h.z + lat, SPD * 0.9, dt)
  }
  // 대인 수비 — 자기 사람과 골대 사이. 공 가진 사람은 붙어서 가끔 스틸, CPU 는 게이지가 차면 스틸 대시
  const man = ps.find(q => q.team !== p.team && q.i === p.i), h = goal(man.team), d = dist(man, h) || 1, gap = man === ball.owner ? 24 : 42
  toward(p, man.x + (h.x - man.x) / d * gap, man.z + (h.z - man.z) / d * gap, SPD * 0.93, dt)
  p.dir = Math.sign(ball.x - p.x) || p.dir
  if (man !== ball.owner) return
  if (p.team === 1 && p.ult >= 1 && dist(p, man) < 220 && rnd() < dt * 0.5) ultimate(p)
  else if (dist(p, man) < 32 && rnd() < dt * 0.4) steal(p, man)
}

// CPU 의 공 가진 선수 — 골대로 몰고 가다 비면 쏘고, 막히면 제치거나 패스. 게이지가 차면 포지션에 맞는 자리에서 궁극기
function handle(p, dt) {
  const h = goal(p.team), s = side(p.team), d = dist(p, h), c = open(p)
  if (p.wz == null || rnd() < dt * 0.5) p.wz = (rnd() - 0.5) * 220
  toward(p, h.x - s * (d > 300 ? 120 : 40), h.z + (d > 200 ? p.wz : p.wz * 0.3), speed(p) * 0.93, dt)
  if ((p.think -= dt) > 0) return
  p.think = 0.3 + rnd() * 0.4
  const wantUlt = [c < 40, d > 200 && d < 420, d > 150, c < 50, d < 280][p.i]
  if (p.ult >= 1 && wantUlt && rnd() < 0.6 && ultimate(p)) return
  if (c < 30 && p.cdx <= 0 && rnd() < 0.35) return crossover(p, 0, 0)
  if (d < 90 || shot < 2.5 || d < 300 && c > 55 && rnd() < (d < 237 ? 0.5 : 0.3)) shoot(p)
  else if (rnd() < (c < 28 ? 0.5 : 0.18)) pass(p, mateFor(p))
}

// ---------------------------------------------------------------- 공

/** 공 자리 — 들고 있으면 손, 움직이면 바닥까지 튕긴다(|cos| 라 바닥에서 꺾여 올라온다) */
function hand(p) {
  if (p.act === 'shot' || p.act === 'dunk') return [p.x + p.dir * 4, p.z, p.h + 78]
  if (p.act === 'air') return [p.x + p.dir * 12, p.z, p.h + 44]
  if (p.act === 'cross') return [p.x + p.dir * 10, p.z + p.hand * (16 * Math.min(1, p.t / 0.26) - 8), 6]   // 낮게 몸 앞을 가로지른다
  return [p.x + p.dir * 12, p.z + p.hand * 5, 2 + 32 * Math.abs(Math.cos(p.dp))]
}

function moveBall(dt) {
  ball.rot += dt * (ball.st === 'held' ? 5 : 14)
  if (ball.st === 'shot' || ball.st === 'pass' || ball.st === 'loose' && ball.h > 8) { ball.trail.unshift({ x: ball.x, z: ball.z, h: ball.h }); ball.trail.length = Math.min(ball.trail.length, 7) }
  else ball.trail.length = 0
  if (ball.st === 'held') {
    [ball.x, ball.z, ball.h] = hand(ball.owner)
  } else if (ball.st === 'pass') {   // 받는 사람을 따라간다. 지나가는 길의 상대는 한 번씩 가로챌 기회
    const m = ball.to, dx = m.x - ball.x, dz = m.z - ball.z, d = Math.hypot(dx, dz), v = 560 * dt
    if (d <= v + 8) return grab(m)
    ball.x += dx / d * v; ball.z += dz / d * v; ball.h += (40 - ball.h) * Math.min(1, dt * 6)
    for (const q of ps) {
      if (q.team === m.team || ball.tried.has(q) || dist(q, ball) >= 18 || q.stun > 0) continue
      ball.tried.add(q)
      if (rnd() < 0.3) return grab(q, 'STEAL!')
    }
  } else if (ball.st === 'shot') {
    ball.t += dt
    const u = Math.min(1, ball.t / ball.T), h = ball.hoop
    ball.x = ball.sx + (h.x - ball.sx) * u; ball.z = ball.sz + (h.z - ball.sz) * u
    ball.h = ball.sh + (RIM + 8 - ball.sh) * u + ball.arc * 4 * u * (1 - u)
    if (u >= 1) ball.make ? made(ball.team, ball.pts, ball.sure && ball.pts === 3 ? 'DEEP THREE!' : '', ball.by) : miss(h)
  } else if (ball.st === 'loose' || ball.st === 'drop') {
    ball.vh -= GRAV * dt; ball.h += ball.vh * dt
    if (ball.h <= 0) { ball.h = 0; ball.vh = Math.abs(ball.vh) > 60 ? -ball.vh * 0.55 : 0 }
    if (ball.h === 0) { const f = Math.exp(-2 * dt); ball.vx *= f; ball.vz *= f }
    ball.x += ball.vx * dt; ball.z += ball.vz * dt
    if (ball.x < 0 || ball.x > CL) { ball.vx *= -0.6; ball.x = clamp(ball.x, 0, CL) }
    if (ball.z < 0 || ball.z > CW) { ball.vz *= -0.6; ball.z = clamp(ball.z, 0, CW) }
    if (ball.st === 'loose') for (const p of ps) if (p.cool <= 0 && p.stun <= 0 && dist(p, ball) < 20 && ball.h < 52 + p.h) return grab(p)
  }
}

// ---------------------------------------------------------------- 한 프레임

function update(rdt) {
  tnow += rdt
  shake = shake > 0.3 ? shake * Math.exp(-7 * rdt) : 0
  if (msg && (msg.t -= rdt) <= 0) msg = null
  if (mode === 'over') wait -= rdt
  if (cut && (cut.t += rdt) >= 0.9) { const c = cut; cut = null; fire(c.p, c.off) }
  const dt = cut ? rdt * 0.08 : rdt   // 컷인 동안은 거의 멈춘다
  if (mode === 'tip') { for (const p of ps) body(p, dt); tipOff(dt) }
  else if (mode === 'play' || mode === 'dead') {
    if (mode === 'play') {
      clock -= dt
      if ((ball.st === 'held' || ball.st === 'pass') && (shot -= dt) <= 0) { say('SHOT CLOCK'); grab(nearest(team(1 - offense), ball)) }
    }
    for (const p of ps) body(p, dt)
    user(dt)
    for (const p of ps) if (p !== ctl) ai(p, dt)
    const through = p => p.act === 'dunk' || p.act === 'air' || p.act === 'rush'
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {   // 겹치지 않게 밀어낸다
      const a = ps[i], b = ps[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz)
      if (d > 0 && d < 20 && !through(a) && !through(b)) { const m = (20 - d) / 2 / d; a.x -= dx * m; a.z -= dz * m; b.x += dx * m; b.z += dz * m }
    }
    for (const p of ps) { p.x = clamp(p.x, 10, CL - 10); p.z = clamp(p.z, 8, CW - 8) }
    moveBall(dt)
    if (mode === 'dead' && (wait -= dt) <= 0) clock <= 0 ? end() : inbound(offense)
    // 시간이 끝나도 떠 있는 슛 · 덩크 · 궁극기는 끝까지 본다(버저비터)
    if (mode === 'play' && clock <= 0) { clock = 0; if (ball.st !== 'shot' && !ball.owner?.act && !cut) end() }
  }
  for (const q of parts) {
    q.vh -= GRAV * 0.6 * dt; q.x += q.vx * dt; q.z += q.vz * dt; q.h += q.vh * dt; q.t -= dt
    if (q.h < 0) { q.h = 0; q.vh *= -0.3 }
  }
  parts = parts.filter(q => q.t > 0)
  for (const r of rings) r.t += dt
  rings = rings.filter(r => r.t < 0.6)
  for (const h of HOOP) h.shake = Math.max(0, h.shake - rdt)
  if (ps.length) camX = clamp(camX + (ball.x - camX) * Math.min(1, rdt * 4), 300, CL - 300)
  for (const k in input) input[k] = false
}

// ---------------------------------------------------------------- 그리기

function poly(pts, fill, stroke, close) {
  g.beginPath()
  pts.forEach(([x, z, h = 0], i) => { const [sx, sy] = P(x, z, h); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy) })
  if (close) g.closePath()
  if (fill) { g.fillStyle = fill; g.fill() }
  if (stroke) { g.strokeStyle = stroke; g.stroke() }
}
const arc = (cx, cz, r, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cz + r * Math.sin(a)] })
const oval = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2) }
const face = (f, x, y, size) => { if (f.img?.complete && f.img.naturalWidth) g.drawImage(f.img, x, y, size, size) }

const CROWD = Array.from({ length: 360 }, (_, i) => ({ x: -260 + rnd() * (CL + 520), row: i % 4, c: ['#e8c07a', '#c5523b', '#3d6fb5', '#e9e2d0', '#6b4b8a', '#2f8a6a', '#d98a3a'][i % 7], ph: rnd() * 6 }))
function backdrop() {
  const sky = g.createLinearGradient(0, 50, 0, TOP)
  sky.addColorStop(0, '#141a28'); sky.addColorStop(1, '#2a3550')
  g.fillStyle = sky; g.fillRect(0, 50, W, TOP)
  const hype = msg ? 4 : 1   // 득점 · 궁극기 때는 관중이 들썩인다
  for (const c of CROWD) {   // 관중 — 코트보다 느리게 흐른다
    const x = W / 2 + (c.x - camX) * 0.9, y = 64 + c.row * 12 - Math.max(0, Math.sin(tnow * 3.5 * hype + c.ph)) * hype
    g.fillStyle = c.c; g.fillRect(x - 6, y + 4, 12, 10)
    g.fillStyle = '#d9a77c'; oval(x, y, 5, 5); g.fill()
  }
  g.fillStyle = '#0e1422'; g.fillRect(0, 110, W, 26)
  g.font = '800 15px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  for (let i = -2; i < 7; i++) {
    g.fillStyle = i % 2 ? '#f5a623' : '#e9edf5'
    g.fillText(i % 2 ? 'SUPER SLAM' : 'TNAB VIPERS', W / 2 + (i * 260 - camX) * 1.05, 123)
  }
}

function court() {
  poly([[-400, -20], [CL + 400, -20], [CL + 400, CW + 60], [-400, CW + 60]], '#7c4f28', null, true)
  const [, y0] = P(0, 0), [, y1] = P(0, CW), wood = g.createLinearGradient(0, y0, 0, y1)
  wood.addColorStop(0, '#d29a62'); wood.addColorStop(1, '#c07a43')
  poly([[0, 0], [CL, 0], [CL, CW], [0, CW]], wood, null, true)
  g.lineWidth = 1
  for (let z = 20; z < CW; z += 20) poly([[0, z], [CL, z]], null, 'rgba(90,45,15,.16)')
  const line = 'rgba(255,255,255,.92)', a = Math.asin(220 / 237)
  for (const [bx, s, h] of [[0, 1, HOOP[0]], [CL, -1, HOOP[1]]]) {
    const key = [[bx, 190], [bx + s * 190, 190], [bx + s * 190, 310], [bx, 310]]
    poly(key, 'rgba(205,72,38,.85)', null, true)
    g.lineWidth = 2.5
    poly(key, null, line, true)
    poly(arc(bx + s * 190, 250, 60, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : Math.PI * 1.5), null, line)
    const r = s > 0 ? arc(h.x, 250, 237, -a, a, 40) : arc(h.x, 250, 237, Math.PI + a, Math.PI - a, 40)
    poly([[bx, 30], ...r, [bx, 470]], null, line)
  }
  g.lineWidth = 2.5
  poly([[0, 0], [CL, 0], [CL, CW], [0, CW]], null, line, true)
  poly([[CL / 2, 0], [CL / 2, CW]], null, line)
  poly(arc(CL / 2, 250, 60, 0, Math.PI * 2, 40), 'rgba(245,166,35,.35)', line)
  for (const r of rings) {   // 메가 슬램 충격파
    const k = r.t / 0.6, [rx, ry, u] = P(r.x, r.z)
    g.strokeStyle = `rgba(255,220,120,${1 - k})`; g.lineWidth = 6 * (1 - k) + 1
    oval(rx, ry, (30 + 220 * k) * u, (10 + 77 * k) * u); g.stroke()
  }
}

function drawHoop(h) {
  const s = h.x < CL / 2 ? -1 : 1, bx = h.x + s * 12, px = h.x + s * 70, wob = Math.sin(tnow * 70) * 4 * h.shake
  g.lineWidth = 6; g.lineCap = 'round'
  poly([[px, 250, 0], [px, 250, 135], [bx, 250, 122]], null, '#4a505c')
  g.lineCap = 'butt'; g.lineWidth = 2
  poly([[bx, 222, 134 + wob / 3], [bx, 278, 134 + wob / 3], [bx, 278, 92 + wob / 3], [bx, 222, 92 + wob / 3]], 'rgba(240,244,250,.9)', '#2b2f38', true)
  poly([[bx, 239, 118], [bx, 261, 118], [bx, 261, 100], [bx, 239, 100]], null, '#d6323a', true)
  const [x, y0, u] = P(h.x, h.z, RIM), y = y0 + wob
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2
  for (let i = 0; i < 8; i++) {   // 그물 — 흔들릴 때는 아래가 출렁인다
    const t = i / 8 * Math.PI * 2
    g.beginPath(); g.moveTo(x + Math.cos(t) * 15 * u, y + Math.sin(t) * 5 * u); g.lineTo(x + Math.cos(t) * 8 * u + wob, y + (22 + wob) * u); g.stroke()
  }
  g.strokeStyle = '#ff5a1f'; g.lineWidth = 3
  oval(x, y, 15 * u, 5 * u); g.stroke()
}

function drawPlayer(p) {
  const [x, y, u] = P(p.x, p.z, p.h), [fx, fy] = P(p.x, p.z), T = TEAMS[sides[p.team]]
  p.trail.forEach((s, j) => {   // 잔상
    const [gx, gy, gu] = P(s.x, s.z, s.h)
    g.globalAlpha = 0.32 * (1 - j / p.trail.length); g.fillStyle = T.color
    g.fillRect(gx - 11 * gu, gy - 58 * gu, 22 * gu, 50 * gu); oval(gx, gy - 70 * gu, 11 * gu, 11 * gu); g.fill()
  })
  g.globalAlpha = 1
  if (p.ult >= 1) { g.fillStyle = `rgba(255,210,63,${0.3 + 0.2 * Math.sin(tnow * 9)})`; oval(fx, fy, 24 * u, 9 * u); g.fill() }   // 궁극기 준비
  const sh = Math.max(0.5, 1 - p.h / 160)
  g.fillStyle = 'rgba(0,0,0,.3)'; oval(fx, fy, 15 * u * sh, 5 * u * sh); g.fill()
  if (p === ctl) { g.strokeStyle = '#ffd23f'; g.lineWidth = 3; oval(fx, fy, 19 * u, 7 * u); g.stroke() }

  const running = (p.mv || p.act === 'cross' || p.act === 'air' || p.act === 'rush') && p.h === 0 && !p.fall, s = running ? Math.sin(p.run * 15) : 0
  const dash = p.act === 'cross' || p.act === 'air' || p.act === 'rush' || p.boost > 0
  const lean = p.fall || !running ? 0 : (dash ? 0.3 : 0.17) * p.dir, L = hh => lean * hh * u   // 달릴 때 윗몸을 앞으로 기울인다
  const holding = ball.owner === p, up = p.act === 'shot' || p.act === 'dunk' || p.h > 0 && !holding
  g.save()
  g.translate(x, y - Math.abs(s) * 3 * u)
  if (p.fall > 0) g.rotate(-p.dir * 1.35)   // 넘어졌다
  else if (p.sq > 0) g.scale(1 + p.sq * 1.2, 1 - p.sq * 1.2)   // 착지 — 잠깐 눌린다
  // 다리 · 신발 — 공중에서는 접는다
  const legs = p.h > 0 ? [[-8, -24, 15, 0], [3, -27, 15, 0]] : [[-7, -22, 22, s * 6], [2, -22, 22, -s * 6]]
  for (const [lx, ly, len, sw] of legs) {
    g.fillStyle = SKIN; g.fillRect((lx + sw) * u, ly * u, 5 * u, len * u)
    g.fillStyle = '#f2f2f2'; g.fillRect((lx - 1 + sw) * u, (ly + len - 3) * u, 7 * u, 3 * u)
  }
  g.fillStyle = T.dark; g.fillRect(-10 * u + L(28), -34 * u, 20 * u, 13 * u)
  g.fillStyle = T.color; g.fillRect(-11 * u + L(46), -58 * u, 22 * u, 25 * u)
  g.fillStyle = '#fff'; g.font = `800 ${11 * u}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(p.f.num, L(46), -45 * u)
  // 팔 — 어깨에서 손까지
  const sy = -54 * u, ls = -9 * u + L(54), rs = 9 * u + L(54), front = p.dir > 0 ? rs : ls, back = p.dir > 0 ? ls : rs
  const arm = (ax, hx, hy) => { g.beginPath(); g.moveTo(ax, sy); g.lineTo(hx, hy); g.stroke() }
  g.strokeStyle = SKIN; g.lineWidth = 4.5 * u; g.lineCap = 'round'
  if (p.act === 'dunk') { arm(back, p.dir * 4 * u, -96 * u); arm(front, p.dir * 16 * u, -100 * u) }   // 림으로 뻗는다
  else if (up) { arm(ls, -7 * u, -86 * u); arm(rs, 7 * u, -86 * u) }
  else if (holding && p.act !== 'air') {   // 공 쪽 손은 튀어 오르는 공을 따라 오르내린다
    arm(front, (ball.x - p.x) * u, (ball.z - p.z) * 0.7 - (Math.max(ball.h, 24) + 7) * u)
    arm(back, back - p.dir * 4 * u - s * 5 * u, -33 * u)
  } else if (holding) { arm(ls, p.dir * 10 * u, -46 * u); arm(rs, p.dir * 14 * u, -48 * u) }
  else if (p.reach > 0) { arm(front, p.dir * 27 * u + L(44), -46 * u); arm(back, back - p.dir * 6 * u, -34 * u) }   // 스틸 — 손을 뻗는다
  else { arm(ls, ls - 4 * u - s * 7 * u, -33 * u); arm(rs, rs + 4 * u + s * 7 * u, -33 * u) }
  g.lineCap = 'butt'
  const r = 12 * u, hx = L(70)
  if (p.f.img?.complete && p.f.img.naturalWidth) g.drawImage(p.f.img, hx - r, -70 * u - r, 2 * r, 2 * r)
  else { g.fillStyle = SKIN; oval(hx, -70 * u, r, r); g.fill() }
  g.restore()
  if (p.fall > 0) {   // 머리 위로 별이 돈다
    g.fillStyle = '#ffd23f'; g.font = `${11 * u}px system-ui, sans-serif`
    for (let i = 0; i < 3; i++) { const a = tnow * 7 + i * 2.1; g.fillText('★', fx - p.dir * 62 * u + Math.cos(a) * 12 * u, fy - 30 * u + Math.sin(a) * 4 * u) }
  } else if (p === ctl && p.team === 0) {
    const tx = x + L(70), ty = y - 90 * u
    g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(tx - 6, ty - 4); g.lineTo(tx + 6, ty - 4); g.lineTo(tx, ty + 4); g.fill()
    g.font = '800 13px system-ui, sans-serif'; g.fillText('1P', tx, ty - 13)
  }
  if (holding) drawBall()
}

function drawBall() {
  const [x, y, u] = P(ball.x, ball.z, ball.h), [fx, fy] = P(ball.x, ball.z), r = 6.5 * u
  ball.trail.forEach((s, j) => {   // 날아가는 공의 꼬리 — 궁극기 슛은 무지개
    const [tx, ty] = P(s.x, s.z, s.h), k = 1 - j / ball.trail.length
    g.globalAlpha = 0.4 * k; g.fillStyle = ball.sure ? `hsl(${(j * 45 + tnow * 600) % 360} 95% 60%)` : '#ffb36b'
    oval(tx, ty, r * k, r * k); g.fill()
  })
  g.globalAlpha = 1
  const sh = Math.max(0.4, 1 - ball.h / 150)
  g.fillStyle = 'rgba(0,0,0,.3)'; oval(fx, fy, 6 * u * sh, 2 * u * sh); g.fill()
  g.save(); g.translate(x, y)
  if (ball.h < 4) g.scale(1.15, 0.8)   // 바닥에 닿는 순간 찌그러진다
  g.rotate(ball.rot)
  g.fillStyle = '#e8742a'; oval(0, 0, r, r); g.fill()
  g.strokeStyle = '#6e2f0c'; g.lineWidth = 1.2; g.stroke()
  g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.moveTo(0, -r); g.lineTo(0, r); g.stroke()
  g.beginPath(); g.ellipse(0, 0, r * 0.5, r, 0, 0, Math.PI * 2); g.stroke()
  g.restore()
}

function text(s, x, y, size, fill = '#ffd23f', stroke = '#2a1400') {
  g.font = `900 ${size}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.lineJoin = 'round'; g.lineWidth = size / 7; g.strokeStyle = stroke; g.strokeText(s, x, y)
  g.fillStyle = fill; g.fillText(s, x, y)
}

function hud() {
  g.fillStyle = '#0a0d14'; g.fillRect(0, 0, W, 50)
  const box = (x, label, value) => {
    g.fillStyle = '#000'; g.fillRect(x, 5, 92, 40); g.strokeStyle = '#c9a227'; g.lineWidth = 2; g.strokeRect(x, 5, 92, 40)
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = '#ff9d00'; g.font = '700 22px ui-monospace, Menlo, Consolas, monospace'; g.fillText(value, x + 46, 21)
    g.fillStyle = '#e9edf5'; g.font = '700 9px system-ui, sans-serif'; g.fillText(label, x + 46, 38)
  }
  box(8, 'SHOT', String(Math.ceil(shot)).padStart(2, '0'))
  const c = Math.ceil(clock)
  box(W - 100, 'TIME', `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`)
  const pad = n => String(n).padStart(3, '0')
  g.font = '800 22px ui-monospace, Menlo, Consolas, monospace'; g.textBaseline = 'middle'
  g.textAlign = 'right'; g.fillStyle = TEAMS[sides[0]].color; g.fillText(TEAMS[sides[0]].name, W / 2 - 66, 26)
  g.textAlign = 'center'; g.fillStyle = '#ffd23f'; g.fillText(`${pad(score[0])}-${pad(score[1])}`, W / 2, 26)
  g.textAlign = 'left'; g.fillStyle = TEAMS[sides[1]].color; g.fillText(TEAMS[sides[1]].name, W / 2 + 66, 26)
  // 1P 팀 궁극기 게이지 — 얼굴 둘레가 차오른다. 지금 움직이는 선수의 궁극기 이름을 옆에
  const mine = team(0), x0 = W / 2 - 150
  mine.forEach((p, i) => {
    const cx = x0 + i * 46, cy = H - 24, ready = p.ult >= 1
    g.fillStyle = 'rgba(0,0,0,.6)'; oval(cx, cy, 19, 19); g.fill()
    face(p.f, cx - 15, cy - 15, 30)
    g.lineWidth = 3.5; g.strokeStyle = ready ? `hsl(${45 + 10 * Math.sin(tnow * 10)} 100% ${60 + 15 * Math.sin(tnow * 10)}%)` : '#6f9bff'
    g.beginPath(); g.arc(cx, cy, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.ult); g.stroke()
    if (p === ctl) { g.strokeStyle = '#ffd23f'; g.lineWidth = 2; oval(cx, cy, 22, 22); g.stroke() }
  })
  if (ctl?.team === 0) {
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '800 15px system-ui, sans-serif'
    g.fillStyle = ctl.ult >= 1 ? '#ffd23f' : '#e9edf5'
    g.fillText(`${ULT[ctl.i]}${ctl.ult >= 1 ? ' — 준비!' : ` ${Math.floor(ctl.ult * 100)}%`}`, x0 + 5 * 46 - 10, H - 24)
  }
}

function cutIn() {   // 궁극기 컷인 — 팀 색 띠가 왼쪽에서 들어와 얼굴 · 기술 이름을 보여 주고 오른쪽으로 빠진다
  const { p, t } = cut, T = TEAMS[sides[p.team]], k = Math.min(1, t / 0.15), out = Math.max(0, (t - 0.72) / 0.18)
  g.fillStyle = `rgba(0,0,0,${0.5 * (1 - out)})`; g.fillRect(0, 50, W, H - 50)
  g.save(); g.translate((k - 1) * W + out * W, 0)
  g.fillStyle = T.dark; g.beginPath(); g.moveTo(0, 176); g.lineTo(W, 146); g.lineTo(W, 376); g.lineTo(0, 406); g.fill()
  g.fillStyle = T.color; g.beginPath(); g.moveTo(0, 190); g.lineTo(W, 160); g.lineTo(W, 362); g.lineTo(0, 392); g.fill()
  g.fillStyle = 'rgba(255,255,255,.35)'
  for (let i = 0; i < 16; i++) g.fillRect(((i * 137 + t * 2600) % (W + 240)) - 240, 175 + (i * 53) % 210, 90 + (i * 31) % 120, 2)   // 속도선
  g.fillStyle = '#fff'; oval(185, 276, 104, 104); g.fill()
  face(p.f, 85, 176, 200)
  text('ULTIMATE', 620, 205, 22, '#fff', T.dark)
  text(p.f.name, 620, 250, 36, '#fff', '#120a06')
  text(`${ULT[p.i]}!`, 620, 318, 64)
  g.restore()
}

function selectScreen() {
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#3a2414'); bg.addColorStop(1, '#1d120a')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  text('★ TEAM SELECT ★', W / 2, 42, 34, '#8ef08a', '#0d2a10')
  CARDS.forEach(([cx, cy], i) => {
    const T = TEAMS[i], c = g.createLinearGradient(cx, cy, cx, cy + CARD_H)
    c.addColorStop(0, T.color); c.addColorStop(1, T.dark)
    g.fillStyle = c; g.fillRect(cx, cy, CARD_W, CARD_H)
    T.five.forEach((f, j) => {
      const x = cx + 15 + j * 81, y = cy + 14
      face(f, x, y, 76)
      g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillStyle = '#fff'; g.font = '700 12px system-ui, sans-serif'; g.fillText(f.name.length > 6 ? `${f.name.slice(0, 6)}…` : f.name, x + 38, y + 88)
      g.fillStyle = '#ffe08a'; g.font = '700 10.5px system-ui, sans-serif'; g.fillText(ULT[j], x + 38, y + 104)
    })
    text(T.name, cx + CARD_W / 2, cy + 168, 32, '#fff', '#120a06')
    g.lineWidth = i === pick ? 6 : 2; g.strokeStyle = i === pick ? '#ffd23f' : 'rgba(0,0,0,.5)'; g.strokeRect(cx, cy, CARD_W, CARD_H)
    if (i === pick) { g.fillStyle = '#ffd23f'; g.fillRect(cx, cy, 40, 24); g.fillStyle = '#2a1400'; g.font = '900 15px system-ui, sans-serif'; g.fillText('1P', cx + 20, cy + 13) }
  })
  g.fillStyle = '#e9edf5'; g.font = '600 15px system-ui, sans-serif'
  g.fillText('방향키로 고르고 C(슛) · Enter 로 시작 — 휴대폰은 팀을 한 번 더 누르세요', W / 2, 528)
}

function draw() {
  if (mode === 'load') { g.fillStyle = '#0b0e14'; g.fillRect(0, 0, W, H); return text('LOADING…', W / 2, H / 2, 32) }
  if (mode === 'select') return selectScreen()
  g.save()
  if (shake) g.translate((rnd() - 0.5) * shake, (rnd() - 0.5) * shake)
  backdrop(); court()
  const items = [...ps.map(p => [p.z, () => drawPlayer(p)]), ...HOOP.map(h => [h.z - 0.5, () => drawHoop(h)])]
  if (!ball.owner) items.push([ball.z + 0.1, drawBall])
  for (const [, d] of items.sort((a, b) => a[0] - b[0])) d()
  for (const q of parts) { const [x, y, u] = P(q.x, q.z, q.h); g.globalAlpha = Math.min(1, q.t * 2.5); g.fillStyle = q.c; g.fillRect(x - 1.6 * u, y - 1.6 * u, 3.2 * u, 3.2 * u) }
  g.globalAlpha = 1
  g.restore()
  hud()
  if (cut) cutIn()
  if (msg && !cut) { const k = Math.min(1, (msg.t0 - msg.t) * 8); g.globalAlpha = Math.min(1, msg.t * 3); text(msg.text, W / 2, 230, 58 * (0.6 + 0.4 * k)); g.globalAlpha = 1 }   // 튀어나오듯 커진다
  if (mode === 'tip') text('공이 올라갈 때 슛 버튼(C)으로 점프!', W / 2, 470, 22, '#fff')
  if (mode === 'over') {
    g.fillStyle = 'rgba(0,0,0,.62)'; g.fillRect(0, 50, W, H - 50)
    text('GAME OVER', W / 2, 170, 64)
    text(`${TEAMS[sides[0]].name} ${score[0]} - ${score[1]} ${TEAMS[sides[1]].name}`, W / 2, 255, 34, '#fff')
    const [a, b] = score
    text(a > b ? 'YOU WIN!' : a < b ? 'YOU LOSE' : 'DRAW', W / 2, 335, 50, a > b ? '#8ef08a' : a < b ? '#ff6b6b' : '#ffd23f')
    text('다시 하기 — Enter · 화면 누르기', W / 2, 430, 20, '#e9edf5')
  }
}

let last = 0, ulShown = -1
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0)
  last = t
  update(dt); draw()
  const ul = (mode === 'play' || mode === 'dead') && ctl?.team === 0 ? Math.floor(ctl.ult * 50) / 50 : 0   // 휴대폰 궁극기 버튼 둘레 게이지
  if (ul !== ulShown) { ulShown = ul; ulBtn.style.setProperty('--g', ul); ulBtn.classList.toggle('ready', ul >= 1) }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// 팀마다 포지션 1~5 에서 한 명씩 — 팀끼리 겹치지 않게 포지션 목록의 같은 순번
await loadData()
const kr = data.players.filter(p => p.server === 'kr'), imgs = new Map()
const img = src => src && (imgs.get(src) || imgs.set(src, Object.assign(new Image(), { src })).get(src))
TEAMS.forEach((T, ti) => {
  T.five = [1, 2, 3, 4, 5].map((pos, i) => {
    const list = kr.filter(p => p.pos === pos), p = list[ti % list.length]
    return { name: p ? p.short || p.name : `${pos}번`, img: img(p?.img), num: NUMS[i] }
  })
})
mode = 'select'
