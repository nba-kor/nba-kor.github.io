// 슈퍼 슬램 — 5:5 풀코트 오락실 농구(1P vs CPU). 숨긴 메뉴 — 마이페이지 관리자 메뉴에서만 링크한다.
// 90년대 오락실 농구(Super Slams) 느낌만 빌린 새 게임이다. 원작 롬 · 그림 · 팀 이름은 쓰지 않는다 — 롬은 저작물이라 이 공개 사이트에 둘 수 없다.
// 선수 얼굴은 덩크 시티 선수(data/players.json). 1P 는 오른쪽 골대를 공격한다.
// 키보드: 방향키 · WASD 이동, Z · J 패스/스틸, X · K · 스페이스 슛/블록. 휴대폰: 캔버스 아래 스틱 · 버튼.
// ponytail: 파울 · 자유투 · 아웃 오브 바운즈 · 하프코트 바이얼레이션 · 소리 없음 — 공은 코트 끝에서 튕겨 나온다
import { mountTop } from './app.js?v=fb02b445'
import { loadData, data, startAuth } from './board.js?v=4233415a'

mountTop('/slam/')
startAuth('', () => {})   // 머리의 로그인 · 이름 줄 — 다른 페이지와 같다

const cv = document.getElementById('slam'), g = cv.getContext('2d')
const W = 960, H = 540, DPR = Math.min(2, devicePixelRatio || 1)
cv.width = W * DPR; cv.height = H * DPR; g.scale(DPR, DPR)

const CL = 940, CW = 500, RIM = 100                 // 코트 길이 · 너비 · 림 높이(월드 단위 = 0.1피트)
const HOOP = [{ x: 52, z: 250 }, { x: 888, z: 250 }]
const S = 1.45, TOP = 150                            // 화면 배율 · 코트 먼 쪽 줄의 화면 y
const GAME = 180, SHOT = 30, SPD = 175, GRAV = 1100, JUMP = 360
const TEAMS = [
  { name: 'VIPERS', color: '#d6323a', dark: '#7d1520' },
  { name: 'COBRAS', color: '#1f9d6b', dark: '#0d5a3c' },
  { name: 'PYTHONS', color: '#2f6fd0', dark: '#173c7a' },
  { name: 'MAMBAS', color: '#8b4fd0', dark: '#4a2483' },
]
const NUMS = [1, 7, 10, 23, 34]
const SPOT = [[270, 0], [210, -150], [210, 150], [75, -100], [65, 100]]   // 공격 골대에서 [뒤로, 옆으로] — 포지션 1~5
const SKIN = '#b9825a'
const CARDS = [[40, 80], [490, 80], [40, 305], [490, 305]], CARD_W = 430, CARD_H = 205

let mode = 'load', pick = 0, sides = [0, 1]          // sides = [1P 팀, CPU 팀] (TEAMS 번호)
let ps = [], ball = {}, score = [0, 0], clock = GAME, shot = SHOT, offense = 0, ctl = null, msg = null, wait = 0, tip = null, camX = CL / 2

const rnd = Math.random
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const goal = t => HOOP[t === 0 ? 1 : 0]              // 공격하는 골대
const side = t => t === 0 ? 1 : -1                   // 공격 방향 x 부호
const team = t => ps.filter(p => p.team === t)
const nearest = (list, o) => list.reduce((a, b) => dist(b, o) < dist(a, o) ? b : a)
const open = p => Math.min(...ps.filter(q => q.team !== p.team).map(q => dist(q, p)))   // 가장 가까운 수비까지
const say = (text, t = 1.1) => { msg = { text, t } }
/** 월드 → 화면. 가까울수록(z 가 클수록) 크게 — [x, y, 월드 1 의 픽셀] */
function P(x, z, h = 0) { const u = S * (0.8 + 0.4 * z / CW); return [W / 2 + (x - camX) * u, TOP + z * 0.7 - h * u, u] }

// ---------------------------------------------------------------- 입력

const keys = new Set(), joy = { x: 0, z: 0 }, input = { a: false, b: false }
const A_KEYS = ['KeyZ', 'KeyJ'], B_KEYS = ['KeyX', 'KeyK', 'Space', 'Enter']

function press(k) {
  if (mode === 'select') return start()
  if (mode === 'over') return void (wait <= 0 && (mode = 'select'))   // 끝나자마자 연타로 결과를 건너뛰지 않게
  input[k] = true
}
addEventListener('keydown', e => {
  const c = e.code
  if (e.target.closest?.('input, textarea, select, button, a') || !/^(Arrow\w+|Key[WASDZJXK]|Space|Enter)$/.test(c)) return
  e.preventDefault()
  keys.add(c)
  if (e.repeat) return
  if (mode === 'select' && c.startsWith('Arrow')) {
    const col = c === 'ArrowLeft' ? 0 : c === 'ArrowRight' ? 1 : pick % 2, row = c === 'ArrowUp' ? 0 : c === 'ArrowDown' ? 1 : pick >> 1
    pick = row * 2 + col
  } else if (A_KEYS.includes(c)) press('a')
  else if (B_KEYS.includes(c)) press('b')
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
const stick = document.getElementById('stick'), knob = stick.firstElementChild
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
for (const [id, k] of [['btn-a', 'a'], ['btn-b', 'b']]) document.getElementById(id).addEventListener('pointerdown', e => { e.preventDefault(); press(k) })

// ---------------------------------------------------------------- 경기 흐름

function start() {
  const others = [0, 1, 2, 3].filter(i => i !== pick)
  sides = [pick, others[Math.floor(rnd() * others.length)]]
  ps = [0, 1].flatMap(t => TEAMS[sides[t]].five.map((f, i) => ({ team: t, i, f, x: 0, z: 0, h: 0, vh: 0, dir: side(t), run: 0, mv: false, act: null, t: 0, cool: 0, stun: 0, think: 0, cut: 0, block: 0 })))
  score = [0, 0]; clock = GAME; shot = SHOT; offense = 0
  input.a = input.b = false
  const at = [[370, 250], [415, 120], [415, 380], [330, 170], [456, 250]]
  for (const p of ps) { const [x, z] = at[p.i]; p.x = p.team ? CL - x : x; p.z = p.team ? CW - z : z }
  ball = { st: 'tip', x: 470, z: 250, h: 60, owner: null }
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
  if (input.b && tip.me == null) { tip.me = tip.t; jump(ctl) }
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
  Object.assign(ball, { st: 'held', owner: p, to: null, rebound: false })
  p.think = 0.3 + rnd() * 0.3
  ctl = p.team === 0 ? p : nearest(team(0), p)
  if (why) say(why)
}

function made(t, pts, text) {
  score[t] += pts
  say(text || (pts === 3 ? '3 POINTS!' : '2 POINTS'))
  const h = goal(t)
  Object.assign(ball, { st: 'drop', owner: null, x: h.x, z: h.z, h: RIM - 4, vx: 0, vz: 0, vh: -60 })
  offense = 1 - t
  mode = 'dead'; wait = 1.2
}

// 득점한 골대 밑에서 상대 1번이 공을 잡고 시작
function inbound(t) {
  const h = goal(1 - t), pg = ps.find(p => p.team === t && p.i === 0)
  Object.assign(pg, { x: h.x + side(1 - t) * 30, z: h.z + 70, h: 0, vh: 0, act: null })
  shot = SHOT; mode = 'play'
  grab(pg)
}

function miss(h) {
  const s = Math.sign(h.x - CL / 2)
  Object.assign(ball, { st: 'loose', owner: null, x: h.x - s * 12, z: h.z, h: RIM + 4, vx: -s * (50 + rnd() * 140), vz: (rnd() - 0.5) * 260, vh: 150 + rnd() * 100, rebound: true })
  ctl = nearest(team(0), ball)
}

function swat(p) {
  Object.assign(ball, { st: 'loose', owner: null, x: p.x, z: p.z, h: p.h + 70, vx: -side(p.team) * (120 + rnd() * 120), vz: (rnd() - 0.5) * 200, vh: 60, rebound: false })
  ctl = nearest(team(0), ball)
  say('BLOCK!')
}

const end = () => { mode = 'over'; msg = null; wait = 1.5 }

// ---------------------------------------------------------------- 동작

function jump(p) { if (p.h === 0 && !p.act) p.vh = JUMP }

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

function shoot(p) {
  if (p.act || p.h > 0) return
  const h = goal(p.team)
  p.act = dist(p, h) < 90 ? 'dunk' : 'shot'
  p.t = 0; p.rel = false; p.from = { x: p.x, z: p.z }
  p.dir = Math.sign(h.x - p.x) || p.dir
  if (p.act === 'shot') p.vh = JUMP
  // 가까운 수비는 조금 늦게 뛰어 막으러 온다(1P 가 움직이는 선수는 직접 뛴다)
  for (const q of ps) if (q.team !== p.team && q !== ctl && dist(q, p) < 60 && rnd() < 0.75) q.block = 0.05 + rnd() * 0.22
}
const blocker = (p, r) => ps.find(q => q.team !== p.team && q.h > 22 && dist(q, p) < r)

function letGo(p) {   // 점프슛을 놓는 순간
  const h = goal(p.team), d = dist(p, h)
  if (blocker(p, 40) && rnd() < 0.45) return swat(p)
  let pr = d < 160 ? 0.62 : d < 237 ? 0.5 : d < 300 ? 0.38 : 0.12
  const c = open(p)
  pr *= c < 30 ? 0.55 : c < 55 ? 0.8 : 1
  const three = d > 237 || Math.abs(p.z - h.z) > 220
  Object.assign(ball, { st: 'shot', owner: null, x: p.x + p.dir * 6, z: p.z, h: p.h + 72, t: 0, T: 0.7 + d / 900, make: rnd() < pr, pts: three ? 3 : 2, team: p.team, hoop: h, arc: 60 + d * 0.3 })
  Object.assign(ball, { sx: ball.x, sz: ball.z, sh: ball.h })
}
function slam(p) {    // 덩크가 림에 닿는 순간
  if (blocker(p, 34) && rnd() < 0.3) return swat(p)
  if (rnd() < 0.9) return made(p.team, 2, 'SLAM DUNK!')
  miss(goal(p.team))
}

function steal(p, o) {
  if (p.cool > 0) return
  p.cool = 0.5
  if (rnd() < (p.team === 0 ? 0.32 : 0.2)) grab(p, 'STEAL!')
  else p.stun = 0.3
}

// 몸 — 쿨타임 · 점프 · 슛 동작. 동작 중 공을 뺏겼으면(ball.owner 가 아니면) 놓지 않는다
function body(p, dt) {
  p.cool = Math.max(0, p.cool - dt); p.stun = Math.max(0, p.stun - dt)
  if (p.act === 'dunk') {
    p.t += dt
    const h = goal(p.team), u = Math.min(1, p.t / 0.4)
    p.x = p.from.x + (h.x - side(p.team) * 16 - p.from.x) * u; p.z = p.from.z + (h.z - p.from.z) * u
    p.h = 88 * Math.sin(u * Math.PI / 2)
    if (u >= 1) { p.act = 'land'; p.vh = 0; if (ball.owner === p) slam(p) }
    return
  }
  if (p.act === 'shot' && !p.rel && (p.t += dt) >= 0.3) { p.rel = true; if (ball.owner === p) letGo(p) }
  if (p.h > 0 || p.vh > 0) {
    p.vh -= GRAV * dt; p.h += p.vh * dt
    if (p.h <= 0) { p.h = 0; p.vh = 0; if (p.act) p.act = null }
  }
}

// ---------------------------------------------------------------- 1P · CPU

function user(dt) {
  const p = ctl, [ax, az] = axis()
  if (!p.act && p.h === 0 && p.stun <= 0) step(p, ax, az, SPD * (ball.owner === p ? 0.92 : 1), dt)
  else p.mv = false
  if (ball.owner === p) {
    if (input.a) pass(p, mateFor(p, ax, az))
    else if (input.b) shoot(p)
    return
  }
  if (input.b) jump(p)
  if (input.a) {   // 공 가진 상대가 가까우면 스틸, 아니면 공에 가장 가까운 선수로 바꾼다
    const o = ball.owner
    if (o && o.team === 1 && dist(p, o) < 34) steal(p, o)
    else ctl = nearest(team(0), ball)
  }
}

function ai(p, dt) {
  if (p.block > 0 && (p.block -= dt) <= 0) jump(p)
  if (p.act || p.h > 0 || p.stun > 0) return void (p.mv = false)
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
  // 대인 수비 — 자기 사람과 골대 사이. 공 가진 사람은 붙어서 가끔 스틸
  const man = ps.find(q => q.team !== p.team && q.i === p.i), h = goal(man.team), d = dist(man, h) || 1, gap = man === ball.owner ? 24 : 42
  toward(p, man.x + (h.x - man.x) / d * gap, man.z + (h.z - man.z) / d * gap, SPD * 0.93, dt)
  p.dir = Math.sign(ball.x - p.x) || p.dir
  if (man === ball.owner && dist(p, man) < 32 && rnd() < dt * 0.4) steal(p, man)
}

// CPU 의 공 가진 선수 — 골대로 몰고 가다 비면 쏘고, 막히면 패스
function handle(p, dt) {
  const h = goal(p.team), s = side(p.team), d = dist(p, h), c = open(p)
  if (p.wz == null || rnd() < dt * 0.5) p.wz = (rnd() - 0.5) * 220
  toward(p, h.x - s * (d > 300 ? 120 : 40), h.z + (d > 200 ? p.wz : p.wz * 0.3), SPD * 0.86, dt)
  if ((p.think -= dt) > 0) return
  p.think = 0.3 + rnd() * 0.4
  if (d < 90 || shot < 2.5 || d < 300 && c > 55 && rnd() < (d < 237 ? 0.5 : 0.3)) shoot(p)
  else if (rnd() < (c < 28 ? 0.5 : 0.18)) pass(p, mateFor(p))
}

// ---------------------------------------------------------------- 공

function hand(p) {
  if (p.act === 'shot' || p.act === 'dunk') return [p.x + p.dir * 4, p.z, p.h + 74]
  return [p.x + p.dir * 13, p.z + 3, p.mv ? 5 + 28 * Math.abs(Math.sin(p.run * 9)) : 32]
}

function moveBall(dt) {
  if (ball.st === 'held') {
    [ball.x, ball.z, ball.h] = hand(ball.owner)
  } else if (ball.st === 'pass') {   // 받는 사람을 따라간다. 지나가는 길의 상대는 한 번씩 가로챌 기회
    const m = ball.to, dx = m.x - ball.x, dz = m.z - ball.z, d = Math.hypot(dx, dz), v = 560 * dt
    if (d <= v + 8) return grab(m)
    ball.x += dx / d * v; ball.z += dz / d * v; ball.h += (40 - ball.h) * Math.min(1, dt * 6)
    for (const q of ps) {
      if (q.team === m.team || ball.tried.has(q) || dist(q, ball) >= 18) continue
      ball.tried.add(q)
      if (rnd() < 0.3) return grab(q, 'STEAL!')
    }
  } else if (ball.st === 'shot') {
    ball.t += dt
    const u = Math.min(1, ball.t / ball.T), h = ball.hoop
    ball.x = ball.sx + (h.x - ball.sx) * u; ball.z = ball.sz + (h.z - ball.sz) * u
    ball.h = ball.sh + (RIM + 8 - ball.sh) * u + ball.arc * 4 * u * (1 - u)
    if (u >= 1) ball.make ? made(ball.team, ball.pts) : miss(h)
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

function update(dt) {
  if (msg && (msg.t -= dt) <= 0) msg = null
  if (mode === 'over') wait -= dt
  if (mode === 'tip') { for (const p of ps) body(p, dt); tipOff(dt) }
  else if (mode === 'play' || mode === 'dead') {
    if (mode === 'play') {
      clock -= dt
      if ((ball.st === 'held' || ball.st === 'pass') && (shot -= dt) <= 0) { say('SHOT CLOCK'); grab(nearest(team(1 - offense), ball)) }
    }
    for (const p of ps) body(p, dt)
    user(dt)
    for (const p of ps) if (p !== ctl) ai(p, dt)
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {   // 겹치지 않게 밀어낸다
      const a = ps[i], b = ps[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz)
      if (d > 0 && d < 20 && a.act !== 'dunk' && b.act !== 'dunk') { const m = (20 - d) / 2 / d; a.x -= dx * m; a.z -= dz * m; b.x += dx * m; b.z += dz * m }
    }
    for (const p of ps) { p.x = clamp(p.x, 10, CL - 10); p.z = clamp(p.z, 8, CW - 8) }
    moveBall(dt)
    if (mode === 'dead' && (wait -= dt) <= 0) clock <= 0 ? end() : inbound(offense)
    // 시간이 끝나도 떠 있는 슛 · 덩크는 끝까지 본다(버저비터)
    if (mode === 'play' && clock <= 0) { clock = 0; if (ball.st !== 'shot' && !ball.owner?.act) end() }
  }
  if (ps.length) camX = clamp(camX + (ball.x - camX) * Math.min(1, dt * 4), 300, CL - 300)
  input.a = input.b = false
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

const CROWD = Array.from({ length: 360 }, (_, i) => ({ x: -260 + rnd() * (CL + 520), row: i % 4, c: ['#e8c07a', '#c5523b', '#3d6fb5', '#e9e2d0', '#6b4b8a', '#2f8a6a', '#d98a3a'][i % 7] }))
function backdrop() {
  const sky = g.createLinearGradient(0, 50, 0, TOP)
  sky.addColorStop(0, '#141a28'); sky.addColorStop(1, '#2a3550')
  g.fillStyle = sky; g.fillRect(0, 50, W, TOP)
  for (const c of CROWD) {   // 관중 — 코트보다 느리게 흐른다
    const x = W / 2 + (c.x - camX) * 0.9, y = 64 + c.row * 12
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
}

function drawHoop(h) {
  const s = h.x < CL / 2 ? -1 : 1, bx = h.x + s * 12, px = h.x + s * 70
  g.lineWidth = 6; g.lineCap = 'round'
  poly([[px, 250, 0], [px, 250, 135], [bx, 250, 122]], null, '#4a505c')
  g.lineCap = 'butt'; g.lineWidth = 2
  poly([[bx, 222, 134], [bx, 278, 134], [bx, 278, 92], [bx, 222, 92]], 'rgba(240,244,250,.9)', '#2b2f38', true)
  poly([[bx, 239, 118], [bx, 261, 118], [bx, 261, 100], [bx, 239, 100]], null, '#d6323a', true)
  const [x, y, u] = P(h.x, h.z, RIM)
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2
  for (let i = 0; i < 8; i++) {   // 그물
    const t = i / 8 * Math.PI * 2
    g.beginPath(); g.moveTo(x + Math.cos(t) * 15 * u, y + Math.sin(t) * 5 * u); g.lineTo(x + Math.cos(t) * 8 * u, y + 22 * u); g.stroke()
  }
  g.strokeStyle = '#ff5a1f'; g.lineWidth = 3
  oval(x, y, 15 * u, 5 * u); g.stroke()
}

function drawPlayer(p) {
  const [x, y, u] = P(p.x, p.z, p.h), [fx, fy] = P(p.x, p.z), T = TEAMS[sides[p.team]]
  g.fillStyle = 'rgba(0,0,0,.3)'; oval(fx, fy, 15 * u, 5 * u); g.fill()
  if (p === ctl) { g.strokeStyle = '#ffd23f'; g.lineWidth = 3; oval(fx, fy, 19 * u, 7 * u); g.stroke() }
  const sw = p.mv && p.h === 0 ? Math.sin(p.run * 14) * 4 * u : 0, up = p.act === 'shot' || p.act === 'dunk' || p.h > 0
  g.fillStyle = SKIN
  g.fillRect(x - 7 * u + sw, y - 22 * u, 5 * u, 22 * u); g.fillRect(x + 2 * u - sw, y - 22 * u, 5 * u, 22 * u)
  g.fillStyle = '#f2f2f2'
  g.fillRect(x - 8 * u + sw, y - 3 * u, 7 * u, 3 * u); g.fillRect(x + 1 * u - sw, y - 3 * u, 7 * u, 3 * u)
  g.fillStyle = T.dark; g.fillRect(x - 10 * u, y - 34 * u, 20 * u, 13 * u)
  g.fillStyle = SKIN
  if (up) { g.fillRect(x - 12 * u, y - 80 * u, 4 * u, 28 * u); g.fillRect(x + 8 * u, y - 80 * u, 4 * u, 28 * u) }
  else { g.fillRect(x - 14 * u, y - 55 * u, 4 * u, 22 * u); g.fillRect(x + 10 * u, y - 55 * u, 4 * u, 22 * u) }
  g.fillStyle = T.color; g.fillRect(x - 11 * u, y - 58 * u, 22 * u, 25 * u)
  g.fillStyle = '#fff'; g.font = `800 ${11 * u}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(p.f.num, x, y - 45 * u)
  const r = 12 * u, img = p.f.img
  if (img?.complete && img.naturalWidth) g.drawImage(img, x - r, y - 70 * u - r, 2 * r, 2 * r)
  else { g.fillStyle = SKIN; oval(x, y - 70 * u, r, r); g.fill() }
  if (p === ctl && p.team === 0) {
    const ty = y - 88 * u
    g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(x - 6, ty - 4); g.lineTo(x + 6, ty - 4); g.lineTo(x, ty + 4); g.fill()
    g.font = '800 13px system-ui, sans-serif'; g.fillText('1P', x, ty - 13)
  }
  if (ball.owner === p) drawBall()
}

function drawBall() {
  const [x, y, u] = P(ball.x, ball.z, ball.h), [fx, fy] = P(ball.x, ball.z)
  g.fillStyle = 'rgba(0,0,0,.3)'; oval(fx, fy, 6 * u, 2 * u); g.fill()
  g.fillStyle = '#e8742a'; oval(x, y, 6.5 * u, 6.5 * u); g.fill()
  g.strokeStyle = '#6e2f0c'; g.lineWidth = 1.2; g.stroke()
  g.beginPath(); g.moveTo(x - 6.5 * u, y); g.lineTo(x + 6.5 * u, y); g.moveTo(x, y - 6.5 * u); g.lineTo(x, y + 6.5 * u); g.stroke()
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
  g.font = '800 24px ui-monospace, Menlo, Consolas, monospace'; g.textBaseline = 'middle'
  g.textAlign = 'right'; g.fillStyle = TEAMS[sides[0]].color; g.fillText(TEAMS[sides[0]].name, W / 2 - 66, 26)
  g.textAlign = 'center'; g.fillStyle = '#ffd23f'; g.fillText(`${pad(score[0])}-${pad(score[1])}`, W / 2, 26)
  g.textAlign = 'left'; g.fillStyle = TEAMS[sides[1]].color; g.fillText(TEAMS[sides[1]].name, W / 2 + 66, 26)
}

function scene() {
  const items = [...ps.map(p => [p.z, () => drawPlayer(p)]), ...HOOP.map(h => [h.z - 0.5, () => drawHoop(h)])]
  if (!ball.owner) items.push([ball.z + 0.1, drawBall])
  for (const [, d] of items.sort((a, b) => a[0] - b[0])) d()
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
      const x = cx + 15 + j * 81, y = cy + 22
      if (f.img?.complete && f.img.naturalWidth) g.drawImage(f.img, x, y, 76, 76)
      g.fillStyle = '#fff'; g.font = '700 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(f.name.length > 6 ? `${f.name.slice(0, 6)}…` : f.name, x + 38, y + 92)
    })
    text(T.name, cx + CARD_W / 2, cy + 165, 34, '#fff', '#120a06')
    g.lineWidth = i === pick ? 6 : 2; g.strokeStyle = i === pick ? '#ffd23f' : 'rgba(0,0,0,.5)'; g.strokeRect(cx, cy, CARD_W, CARD_H)
    if (i === pick) { g.fillStyle = '#ffd23f'; g.fillRect(cx, cy, 40, 24); g.fillStyle = '#2a1400'; g.font = '900 15px system-ui, sans-serif'; g.fillText('1P', cx + 20, cy + 13) }
  })
  g.fillStyle = '#e9edf5'; g.font = '600 15px system-ui, sans-serif'
  g.fillText('방향키로 고르고 X · Enter 로 시작 — 휴대폰은 팀을 한 번 더 누르세요', W / 2, 528)
}

function draw() {
  if (mode === 'load') { g.fillStyle = '#0b0e14'; g.fillRect(0, 0, W, H); return text('LOADING…', W / 2, H / 2, 32) }
  if (mode === 'select') return selectScreen()
  backdrop(); court(); scene(); hud()
  if (msg) { g.globalAlpha = Math.min(1, msg.t * 3); text(msg.text, W / 2, 230, 58); g.globalAlpha = 1 }
  if (mode === 'tip') text('공이 올라갈 때 슛 버튼으로 점프!', W / 2, 505, 22, '#fff')
  if (mode === 'over') {
    g.fillStyle = 'rgba(0,0,0,.62)'; g.fillRect(0, 50, W, H - 50)
    text('GAME OVER', W / 2, 170, 64)
    text(`${TEAMS[sides[0]].name} ${score[0]} - ${score[1]} ${TEAMS[sides[1]].name}`, W / 2, 255, 34, '#fff')
    const [a, b] = score
    text(a > b ? 'YOU WIN!' : a < b ? 'YOU LOSE' : 'DRAW', W / 2, 335, 50, a > b ? '#8ef08a' : a < b ? '#ff6b6b' : '#ffd23f')
    text('다시 하기 — Enter · 화면 누르기', W / 2, 430, 20, '#e9edf5')
  }
}

let last = 0
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0)
  last = t
  update(dt); draw()
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
