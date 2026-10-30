// 스트리트 3:3 — 하프코트 3D 길거리 농구(1P vs CPU). 머리 메뉴 「게임」의 둘째(첫째는 덩크 아케이드).
// 덩크 시티 · 슬램덩크 모바일처럼 — 하프라인 뒤 높은 카메라가 골대를 보고, 선수는 만화풍 3D(셀 셰이딩 + 윤곽선, 얼굴은 덩크 시티 얼굴 그림).
// 코트 배치는 전술판(court.js)과 같은 하프코트 — 단위도 같다(0.1피트, 골대가 위 y=0 쪽). 3D 는 three.js(CDN), 점수판 · 글자는 위에 겹친 2D 캔버스.
// 움직임은 덩크 시티 3:3 에서 빌렸다 — 고른 선수 한 명만 끝까지 움직이고 동료 둘은 CPU. 슛은 누르고 있다 초록 칸에서 놓고,
// 드리블 기술(크로스오버 · 스텝백 · 스핀), 스크린 부르기, 공 달라 · 컷 · 앨리웁, 스틸 · 블록 · 스위치, 리바운드는 떨어질 자리가 바닥에 뜬다.
// 규칙은 길거리 3:3 — 11점 먼저(3점 라인 안 1점 · 밖 2점) · 3분 · 공격 12초. 수비 리바운드 · 스틸 뒤에는 3점 라인 밖으로 빼야(클리어) 슛.
// 키: 방향키 · WASD 이동(위가 골대), 슛 C · L · 스페이스(누르고 있다 놓는다), 패스 X · K, 기술 Z · J, 스크린 V · U. 휴대폰은 스틱 · 버튼.
// ponytail: 파울 · 아웃 오브 바운즈 없음(코트 끝에서 멈춘다) · 소리 없음 · 온라인 없음 · 몸은 도형을 이은 것(모델 파일 없음)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js'
import { mountTop, faceOf } from './app.js?v=fb02b445'
import { loadData, data, startAuth } from './board.js?v=4233415a'
import { TEAMS, NUMS, NBA_NUM, lineup, cutHead, skinOf } from './vipers.js?v=c92ed58c'
import { CW, CH, R3, RIM_H, RIM, BRK, sm, K, wx, wz, RIM_Z, scene, part, floorMat, rimG, net, scenery, BALL, ballMat, hairOf, rigOf, NP, Q, trunk, arm, leg, arms, legs, yaw, dunkPose, setRig } from './court3d.js?v=8016bbac'

mountTop('/street/')
startAuth('', () => {})   // 머리의 로그인 · 이름 줄 — 다른 페이지와 같다

const glC = document.getElementById('street3d'), hudC = document.getElementById('street'), g = hudC.getContext('2d')
const W = 960, H = 540                                     // 겹친 2D 화면(점수판 · 글자 · 선수 고르기)
const GAME = 180, WIN = 11, SHOT = 12                      // 3분 · 11점 먼저 · 공격 12초
const SPD = 165, ACC = 1500, GRAV = 1100, JUMP = 300, R = 14, GREEN = 0.85   // R = 몸 반지름
const SLOTS = [1, 3, 5]                                     // 팀 다섯 중 가드 · 포워드 · 센터
const ROLE = ['가드', '포워드', '센터']
// 가드 · 포워드 · 센터 능력치 — 보통 1. dunk = 덩크가 되는 골대 거리(0 이면 레이업만), size = 몸집 · 손 닿는 높이
const STATS = [
  { note: '가장 빠르고 드리블 기술(발목 꺾기) · 스틸 · 패스 · 2점 슛이 좋다. 덩크는 못 하고 레이업', spd: 1.08, mid: 1.02, three: 1.12, dunk: 0, jump: 0.9, block: 0.6, steal: 1.4, reb: 0.8, handle: 1.35, pass: 1.2, size: 0.92 },
  { note: '점프가 가장 높고 달려들면 멀리서도 덩크. 슛 · 수비가 고르다', spd: 1.02, mid: 1.05, three: 1, dunk: 85, jump: 1.15, block: 1, steal: 1, reb: 1, handle: 1, pass: 1, size: 1 },
  { note: '블록 · 리바운드 · 스크린이 가장 좋다. 느리고 2점 슛(3점 라인 밖)은 약하다', spd: 0.9, mid: 0.88, three: 0.55, dunk: 70, jump: 1, block: 1.5, steal: 0.7, reb: 1.5, handle: 0.65, pass: 0.9, size: 1.12 },
]
// 공격 자리 — 꼭대기 · 날개 · 코너 · 골밑 양쪽 · 자유투 줄. 가드는 꼭대기 · 날개, 포워드는 날개 · 코너, 센터는 골밑
const SPOTS = [[250, 330], [80, 225], [420, 225], [42, 78], [458, 78], [175, 112], [325, 112], [250, 190]]
const LIKES = [[0, 1, 2], [1, 2, 3, 4], [5, 6, 7]]
const DUNKS = ['SLAM DUNK!', 'TOMAHAWK!', 'WINDMILL!', 'REVERSE!']   // 덩크 동작도 이 순서(dunkPose)

const rnd = Math.random
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
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
let wait = 0, next = null, clear = false, sudden = false, fade = 0, slow = 0
let msg = null, pops = [], parts = [], shake = 0, tnow = 0
const say = (text, t = 1.1) => { msg = { text, t, t0: t } }
const pop = (p, text, c = '#fff') => pops.push({ x: p.x, y: p.y, h: (p.h ?? 0) + 85, text, c, t: 0.9 })
function burst(x, y, n, c, h = 0) {
  for (let i = 0; i < n; i++) { const a = rnd() * 6.3, v = 60 + rnd() * 160; parts.push({ x, y, h, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vh: 40 + rnd() * 160, t: 0.35 + rnd() * 0.3, c: Array.isArray(c) ? c[i % c.length] : c }) }
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
  if (mode === 'select' && c.startsWith('Arrow')) {   // 왼쪽 · 오른쪽 = 팀, 위 · 아래 = 선수
    const ti = pick / 3 | 0, i = pick % 3
    pick = c === 'ArrowLeft' ? (ti + 3) % 4 * 3 + i : c === 'ArrowRight' ? (ti + 1) % 4 * 3 + i : ti * 3 + (c === 'ArrowUp' ? (i + 2) % 3 : (i + 1) % 3)
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
// 선수 고르기 — 팀마다 한 줄(가드 · 포워드 · 센터). 카드를 누르고, 고른 카드를 한 번 더 누르면 시작. 끝난 화면은 누르면 선수 고르기로
const COL_X = 36, COL_W = 225, ROW_Y = 96, ROW_H = 138
hudC.addEventListener('pointerdown', e => {
  const r = hudC.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H
  if (mode === 'select') {
    const col = Math.floor((x - COL_X) / COL_W), row = Math.floor((y - ROW_Y) / ROW_H)
    if (col >= 0 && col < 4 && row >= 0 && row < 3) { const i = col * 3 + row; i === pick ? start() : pick = i }
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
// 전체 화면 — 덩크 아케이드과 같다(되는 브라우저는 진짜 전체 화면 · 휴대폰은 가로로, 안 되는 아이폰은 화면을 꽉 채운 칸 .full 을 보이는 칸에 맞춘다)
const stage = glC.closest('.slam-stage'), fsBtn = document.getElementById('btn-fs'), vv = window.visualViewport
function fit() {
  const s = stage.style, on = vv && stage.classList.contains('full'), k = on ? vv.scale : 1
  s.left = on ? `${vv.offsetLeft}px` : ''; s.top = on ? `${vv.offsetTop}px` : ''
  s.width = on ? `${vv.width * k}px` : ''; s.height = on ? `${vv.height * k}px` : ''
  s.transform = on && k !== 1 ? `scale(${1 / k})` : ''
}
vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit)
const setFull = on => { stage.classList.toggle('full', on); fsBtn.setAttribute('aria-label', on ? '전체 화면 끄기' : '전체 화면'); fit() }
fsBtn.addEventListener('click', async () => {
  fsBtn.blur()   // 버튼에 포커스가 남으면 키 입력을 게임이 못 받는다
  if (document.fullscreenElement) return document.exitFullscreen()
  const on = !stage.classList.contains('full')
  if (on && stage.requestFullscreen) try { await stage.requestFullscreen({ navigationUI: 'hide' }); screen.orientation?.lock?.('landscape').catch(() => {}) } catch {}
  setFull(on)
})
document.addEventListener('fullscreenchange', () => setFull(!!document.fullscreenElement))

// ---------------------------------------------------------------- 경기 흐름

function start() {
  const ti = pick / 3 | 0, others = [0, 1, 2, 3].filter(i => i !== ti)
  sides = [ti, others[rnd() * 3 | 0]]
  ps = [0, 1].flatMap(t => TEAMS[sides[t]].three.map((f, i) => ({
    team: t, i, f, x: 250, y: 300, h: 0, vh: 0, vx: 0, vy: 0, dir: -Math.PI / 2, want: [0, 0], act: null, t: 0, T: 0,
    stun: 0, cool: 0, space: 0, call: 0, cut: 0, hold: 0, screen: 0, react: 0, rx: null, goal: null, goalT: 0, spot: null, think: 0,
    man: null, side: 1, meter: -1, rel: 0, auto: false, up: false, done: false, grade: null, gradeT: 0, hit: new Set(),
    ph: 0, cheer: 0, follow: 0, style: 0, spin: 0, P: new Float32Array(NP),
  })))
  dress()
  me = ps[pick % 3]
  score = [0, 0]; clock = GAME; sudden = false; parts = []; pops = []
  for (const k in input) input[k] = false
  holding = false
  check(rnd() < 0.5 ? 0 : 1)
}
const later = (t, fn) => { mode = 'dead'; wait = t; next = fn; for (const p of ps) p.want = [0, 0] }
function place(p, x, y) { Object.assign(p, { x, y, h: 0, vh: 0, vx: 0, vy: 0, act: null, stun: 0, hold: 0, screen: 0, call: 0, cut: 0, goal: null, spot: null, think: 0, meter: -1, cheer: 0, follow: 0 }) }
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
  if (r < ch) { fall(d, 1.1); say('ANKLE BREAKER!', 1.2); burst(d.x, d.y, 10, '#ffd23f', 20); slow = 0.35 }
  else if (r < ch + 0.4) { d.stun = Math.max(d.stun, 0.35); pop(p, text, '#7fffc8') }
}
function cut(p, ax, ay) {   // 공 없이 — 스틱 쪽(안 밀었으면 골대 쪽)으로 치고 들어간다. 골밑으로 컷하면 동료가 앨리웁을 띄운다
  if (p.act || p.h > 0 || p.cool > 0) return
  const [dx, dy] = Math.hypot(ax, ay) > 0.3 ? unit(ax, ay) : unit(RIM.x - p.x, RIM.y - p.y)
  act(p, 'dash', 0.32); p.vx = dx * 320; p.vy = dy * 320; p.cut = 1.4; p.cool = 0.5
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
  Object.assign(p, { grade, gradeT: 0.9, meter: -1, act: 'air', auto: false, follow: 0.6 })
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
  act(p, 'dunk', 0.75); Object.assign(p, { x0: p.x, y0: p.y, x1: RIM.x + ux * 11, y1: RIM.y + uy * 11, vx: 0, vy: 0, oop, style: oop ? 0 : rnd() * DUNKS.length | 0 })
}
function slamIn(p) {   // 덩크가 림에 닿는 순간 — 골밑에서 뛴 수비가 가끔 막는다
  const b = opp(p).find(q => q.h > 25 && toRim(q) < 34)
  if (b && rnd() < 0.35 * st(b).block * (p.oop ? 0.6 : 1)) return swat(p, b)
  made(p.team, 1, p.oop ? 'ALLEY-OOP!' : DUNKS[p.style], p)
  shake = 0.25; slow = 0.5
  for (const q of opp(p)) if (toRim(q) < 40 && (q.h > 10 || dist(q, p) < 26)) { fall(q, 0.9); pop(q, 'POSTERIZED', '#ff8a8a') }   // 막으러 뛰었거나 바로 밑에 있던 수비
}
function swat(p, b) {   // 블록 — 공이 골대 반대쪽으로 튄다
  const [ux, uy] = unit(p.x - RIM.x, p.y - RIM.y)
  ball = { st: 'loose', owner: null, x: p.x, y: p.y, h: p.h + 70, vx: ux * 200 + (rnd() - 0.5) * 140, vy: uy * 200 + (rnd() - 0.5) * 140, vh: 80, team: p.team, wait: 0.25 }
  Object.assign(p, { act: p.h > 0 ? 'air' : null, meter: -1, vh: Math.min(p.vh, 0) })
  say('BLOCKED!', 1); pop(b, 'BLOCK', '#5fd4ff'); burst(p.x, p.y, 12, ['#5fd4ff', '#fff'], p.h + 70); shake = 0.15
}
function made(t, pts, text, by) {
  score[t] += pts
  RIM.shake = 1; burst(RIM.x, RIM.y, 14, ['#fff', TEAMS[sides[t]].color], RIM_H)
  pop({ x: RIM.x, y: RIM.y, h: 30 }, `+${pts}`, '#ffd23f')
  if (by) by.cheer = 1.4
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
    if (!clear && hd && r < 0.22 && toRim(p) > 110) { p.cut = 1.4; return }
    if (!clear && hd && hd !== me && r < 0.36 && open(hd) < 40) { Object.assign(p, { goal: screenSpot(hd), goalT: 2.5 }); return }
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
    if (p.t > 0.1 && !p.up) { p.up = true; p.vh = 130 }
    if ((p.auto && p.meter >= p.rel) || p.meter >= 1.3) letGo(p)
  } else if (p.act === 'lay') {
    const k = Math.min(1, p.t / p.T)
    p.x = p.x0 + (p.x1 - p.x0) * sm(k); p.y = p.y0 + (p.y1 - p.y0) * sm(k); p.h = 32 * Math.sin(Math.PI * k)
    if (k >= 0.6 && !p.done) { p.done = true; layIn(p) }
  } else if (p.act === 'dunk') {
    const k = Math.min(1, p.t / 0.42)   // 0.42초에 림 — 그 뒤는 매달린다
    p.x = p.x0 + (p.x1 - p.x0) * sm(k); p.y = p.y0 + (p.y1 - p.y0) * sm(k); p.h = 34 * Math.sin(k * Math.PI / 2) - (p.t > 0.42 ? 4 * sm(Math.min(1, (p.t - 0.42) / 0.2)) : 0)
    if (k >= 1 && !p.done) { p.done = true; slamIn(p) }
  }
  if (!p.T || p.t < p.T) return
  if (p.act === 'dunk' || p.act === 'lay') { p.act = p.h > 0 ? 'air' : null; p.vh = 0 }
  else p.act = null
}
function body(p, dt) {
  for (const k of ['stun', 'cool', 'space', 'call', 'cut', 'hold', 'screen', 'react', 'gradeT', 'goalT', 'cheer', 'follow']) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt)
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
  // 보는 쪽 — 달리면 가는 쪽, 수비는 공 쪽(공 가진 상대에 붙었으면 옆으로 미끄러지며), 슛은 골대 쪽
  const v = Math.hypot(p.vx, p.vy), stance = offense !== p.team && !p.act && ball.owner && dist(p, ball.owner) < 90
  const to = busy(p) ? Math.atan2(RIM.y - p.y, RIM.x - p.x) : stance || (v <= 30 && offense !== p.team) ? Math.atan2(ball.y - p.y, ball.x - p.x) : v > 30 ? Math.atan2(p.vy, p.vx) : p.dir
  p.dir += ((to - p.dir + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, 14 * dt)
  p.ph += v * dt * 0.052   // 걸음 — 빠를수록 빨리
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
  pops = pops.filter(a => a.t > 0); parts = parts.filter(a => a.t > 0)
  shake = Math.max(0, shake - dt); RIM.shake = Math.max(0, RIM.shake - dt * 3); fade = Math.max(0, fade - dt)
}

// ---------------------------------------------------------------- 3D 장면 — 코트 · 몸 · 자세는 court3d.js(덩크 광장과 같이 쓴다)

let renderer = null
try { renderer = new THREE.WebGLRenderer({ canvas: glC, antialias: true, powerPreference: 'high-performance' }) } catch {}
const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 200)
if (renderer) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap }

// 바닥 표시 — 1P 고리 · 리바운드 떨어질 자리 · 클리어 때 깜빡이는 3점 라인
const meRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 40).rotateX(-Math.PI / 2), floorMat(0xffd23f))
const landRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 32).rotateX(-Math.PI / 2), floorMat(0xffffff))
const clearLine = (() => {
  const a0 = Math.atan2(BRK - RIM.y, 220), pts = [[30, 0], [30, BRK]]
  for (let i = 1; i < 40; i++) { const a = Math.PI - a0 - (Math.PI - 2 * a0) * i / 40; pts.push([RIM.x + R3 * Math.cos(a), RIM.y + R3 * Math.sin(a)]) }
  pts.push([470, BRK], [470, 0])
  const curve = new THREE.CurvePath()
  for (let i = 1; i < pts.length; i++) curve.add(new THREE.LineCurve3(new THREE.Vector3(wx(pts[i - 1][0]), 0.02, wz(pts[i - 1][1])), new THREE.Vector3(wx(pts[i][0]), 0.02, wz(pts[i][1]))))
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.06, 5), floorMat(0xffd23f))
})()
meRing.position.y = landRing.position.y = 0.015
scene.add(meRing, landRing, clearLine)
const ballM = part(scene, BALL, ballMat)
const crew = new THREE.Group()
scene.add(crew)

function dress() { crew.clear(); for (const p of ps) crew.add(rigOf(p.f, TEAMS[sides[p.team]], p.i).root) }

// ---------------------------------------------------------------- 자세 — 상태마다 목표 자세(Q)를 정하고 따라갈 빠르기를 돌려준다(court3d.js 의 setRig)

function poseOf(p) {
  const v = Math.hypot(p.vx, p.vy), A = p.act, has = ball.owner === p && ball.st === 'held', bi = p.side > 0 ? 0 : 1, run = Math.min(1, v / 170)
  const D = offense !== p.team
  p.spin = 0
  trunk(0.06); arms(0.12, 0.14, 0.3); legs(0.12, 0.06, 0.25)
  if (v > 25 && p.h === 0) {   // 달리기 — 팔다리가 엇갈린다
    const a = 0.25 + 0.5 * run
    for (const [i, q] of [[0, p.ph], [1, p.ph + Math.PI]]) { leg(i, 0.12 + a * Math.sin(q), 0.04, 0.25 + 1.4 * a * Math.max(0, Math.cos(q))); arm(i, 0.1 - 0.9 * a * Math.sin(q), 0.12, 1.25) }
    trunk(0.1 + 0.25 * run)
  }
  if (D && ball.owner && !ball.owner.act && dist(p, ball.owner) < 90 && p.h === 0) {   // 공 가진 상대 앞 — 낮게 벌려 서서 옆으로 미끄러진다
    const w = v > 25 ? 0.14 * Math.sin(p.ph * 1.4) : 0
    trunk(0.32, 0, 0, -0.15); leg(0, 0.5, 0.3 + w, 1.0); leg(1, 0.5, 0.3 - w, 1.0); arms(0.5, 1.2, 0.45)
  } else if (D && v < 60 && p.h === 0) { trunk(0.2); legs(0.3, 0.14, 0.6); arms(0.3, 0.55, 0.6) }
  if (has && !A) {   // 드리블 — 공 치는 손은 공과 같이 오르내리고 반대 팔은 막는다
    const b = Math.abs(Math.sin(tnow * 7.5))
    arm(bi, 0.55, 0.3, 0.45 + 0.6 * (1 - b)); arm(1 - bi, 0.85, 0.35, 1.0); Q[0] += 0.1
    if (v < 25) legs(0.35, 0.12, 0.7)
  }
  if (!has && ball.st === 'pass' && ball.to === p) arms(1.25, 0.15, 0.35)
  if (p.call > 0 && !has) arm(0, 2.9 + 0.12 * Math.sin(tnow * 14), 0.3, 0.15)
  if (p.screen > 0) { trunk(0.05); legs(0.3, 0.26, 0.6); arms(0.55, -0.42, 1.9) }
  if (p.hold > 0) { trunk(-0.3); arms(0.7, 0.5, 0.5) }
  if (p.cheer > 0 && !A && p.h === 0) arms(2.8 + 0.25 * Math.sin(tnow * 14), 0.5, 0.5)
  if (A === 'shoot') {
    if (p.t < 0.1) { trunk(0.12, 0, 0, -0.1); legs(0.55, 0.08, 1.1); arms(1.0, 0.1, 1.7) }   // 웅크려 공을 가슴에
    else { trunk(-0.02, 0, 0, -0.3); leg(0, 0.05, 0.05, 0.15); leg(1, 0.12, 0.05, 0.3); arm(0, 2.7, 0.08, 1.6); arm(1, 2.45, 0.35, 1.3) }   // 머리 위로
    return 22
  }
  if (p.follow > 0 && p.h > 0) { trunk(0, 0, 0, -0.3); legs(0.1, 0.05, 0.2); arm(0, 2.9, 0.05, 0.05); arm(1, 2.3, 0.5, 0.35); return 22 }   // 팔을 뻗은 채 손목을 꺾는다
  if (A === 'lay') { const k = p.t / p.T; trunk(0.05, 0, 0, -0.3); leg(0, 1.5, 0.05, 1.7); leg(1, -0.15, 0.05, 0.3); arm(0, 1.4 + 1.6 * k, 0.1, 1.3 * (1 - k)); arm(1, 0.8, 0.5, 0.8); return 22 }
  if (A === 'dunk') { dunkPose(p); return 24 }
  if (A === 'cross') {   // 크로스오버 — 가는 쪽으로 몸을 기울이며 공을 낮게 바꾼다
    const y = yaw(p), lat = p.vx * -Math.cos(y) + p.vy * Math.sin(y)
    trunk(0.28, 0.38 * Math.sign(lat)); legs(0.45, 0.3, 0.95); arms(0.35, 0.45, 0.4); return 24
  }
  if (A === 'spin') { p.spin = Math.PI * 2 * sm(p.t / p.T) * (p.side > 0 ? 1 : -1); trunk(0.2); legs(0.4, 0.1, 0.8); arms(0.6, 0.2, 1.2); return 24 }
  if (A === 'step') { trunk(-0.12); leg(0, -0.25, 0.08, 0.4); leg(1, 0.45, 0.08, 0.8); arms(1.0, 0.1, 1.6); return 22 }
  if (A === 'dash') { const q = p.ph; trunk(0.4); leg(0, 0.2 + 0.8 * Math.sin(q), 0.04, 0.4 + 1.2 * Math.max(0, Math.cos(q))); leg(1, 0.2 - 0.8 * Math.sin(q), 0.04, 0.4 + 1.2 * Math.max(0, -Math.cos(q))); arm(0, -0.8 * Math.sin(q), 0.12, 1.3); arm(1, 0.8 * Math.sin(q), 0.12, 1.3); return 22 }
  if (A === 'steal') { trunk(0.55); arm(0, 1.35, 0.05, 0.05); arm(1, 0.3, 0.4, 0.6); leg(0, 0.75, 0.05, 0.9); leg(1, -0.35, 0.05, 0.3); return 24 }
  if (A === 'fall') {   // 발목이 꺾였다 — 빙글 돌다 주저앉는다
    const k = p.t / p.T, s = sm(Math.min(1, k * 2.5))
    p.spin = Math.PI * 2 * sm(Math.min(1, k / 0.4))
    trunk(-0.45 * s, 0, 0, 0, s); legs(0.12 + 1.25 * s, 0.2, 0.25); arms(-0.6 * s, 0.35, 0.1); return 16
  }
  if (p.h > 0) { arms(3.0, 0.2, 0.1); leg(0, 0.25, 0.05, 0.6); leg(1, 0.1, 0.05, 0.4); return 20 }   // 점프 — 블록 · 리바운드는 두 팔을 쭉
  return v > 25 ? 20 : 10
}
// 공 — 들고 있으면 손에서(드리블은 손과 바닥 사이를 오간다), 아니면 게임 좌표 그대로
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3()
function ballAt(out) {
  const b = ball
  if (b.st !== 'held') return out.set(wx(b.x), Math.max(0.14, b.h * K), wz(b.y))
  const o = b.owner, Rg = o.f.rig, A = o.act, bi = o.side > 0 ? 0 : 1
  Rg.hand[0].getWorldPosition(V1); Rg.hand[1].getWorldPosition(V2)
  if ((A === 'shoot' && o.t < 0.1) || A === 'step' || A === 'spin') return out.addVectors(V1, V2).multiplyScalar(0.5).add(V2.set(Math.sin(yaw(o)) * 0.12, 0, Math.cos(yaw(o)) * 0.12))
  if (A === 'shoot' || (A === 'dunk' && (o.style === 0 || o.style === 3))) return out.addVectors(V1, V2).multiplyScalar(0.5).setY(Math.max(V1.y, V2.y) + 0.12)
  if (A === 'lay' || A === 'dunk') return out.copy(V1).setY(V1.y + 0.12)
  if (A === 'cross') { const k = sm(Math.min(1, o.t / o.T)); out.lerpVectors(bi ? V1 : V2, bi ? V2 : V1, k); return out.setY(0.2 + 0.5 * Math.abs(k - 0.5)) }
  const y = yaw(o), h = bi ? V2 : V1, d = Math.abs(Math.sin(tnow * 7.5))
  return out.set(h.x + Math.sin(y) * 0.1, h.y - 0.12 - (h.y - 0.26) * d, h.z + Math.cos(y) * 0.1)
}

// ---------------------------------------------------------------- 카메라 · 그리기

const camP = new THREE.Vector3(0, 9, 24), camL = new THREE.Vector3(0, 1, 6), cw = new THREE.Vector3(), lw = new THREE.Vector3()
function aim(dt) {   // 하프라인 뒤 높은 곳에서 골대 쪽 — 공을 따라 옆으로 돈다. 덩크는 골대로 다가간다(느린 화면)
  if (!ps.length || mode === 'select' || mode === 'load') { const a = tnow * 0.12; cw.set(Math.sin(a) * 15, 8.5, 7 + Math.cos(a) * 15); lw.set(0, 1.5, 4) }
  else {
    const bx = wx(ball.x ?? 250), bz = wz(ball.y ?? 300), dunking = slow > 0 && ps.some(p => p.act === 'dunk' || (p.h > 0 && toRim(p) < 40))
    if (dunking) { cw.set(bx * 0.5 + 1.8, 4.4, RIM_Z + 6.8); lw.set(0, 2.5, RIM_Z) }
    else { cw.set(bx * 0.45, 6.0, clamp(bz + 8.6, 14.5, 19.5)); lw.set(bx * 0.65, 1.55, clamp(bz - 1.8, 3.2, 8.6)) }
  }
  const k = 1 - Math.exp(-(slow > 0 ? 4 : 2.6) * dt)
  camP.lerp(cw, k); camL.lerp(lw, k)
  camera.position.copy(camP)
  if (shake) camera.position.add(V1.set(rnd() - 0.5, rnd() - 0.5, 0).multiplyScalar(shake * 0.6))
  camera.lookAt(camL)
}
let dpr = 0, cssW = 0, cssH = 0, maxD = 2
function size() {
  const d = Math.min(devicePixelRatio || 1, maxD), w = glC.clientWidth, h = glC.clientHeight
  if (!w || (d === dpr && w === cssW && h === cssH)) return
  dpr = d; cssW = w; cssH = h
  hudC.width = W * d; hudC.height = H * d
  if (!renderer) return
  renderer.setPixelRatio(d); renderer.setSize(w, h, false)
  camera.aspect = w / h; camera.updateProjectionMatrix()
}
function render(dt) {
  size()
  if (!renderer) return
  for (const p of ps) setRig(p, dt, poseOf(p))
  scene.updateMatrixWorld()
  if (ball.st && ps.length) { ballAt(ballM.position); ballM.rotation.x += dt * (ball.st === 'held' ? 6 : 12) }
  ballM.visible = !!ball.st && ps.length > 0 && mode !== 'select'
  meRing.visible = !!me && mode !== 'select' && ps.length > 0
  if (meRing.visible) { meRing.position.x = wx(me.x); meRing.position.z = wz(me.y); meRing.material.opacity = 0.65 + 0.3 * Math.sin(tnow * 6) }
  landRing.visible = ball.st === 'loose' && !ball.dead && !!ball.land && mode === 'play'
  if (landRing.visible) { landRing.position.x = wx(ball.land.x); landRing.position.z = wz(ball.land.y); landRing.material.color.set(ball.vh < 0 && ball.h < 150 ? 0xffffff : 0x9fb3c8) }
  clearLine.visible = clear && mode === 'play'
  clearLine.material.opacity = 0.5 + 0.4 * Math.sin(tnow * 8)
  rimG.rotation.x = Math.sin(tnow * 50) * RIM.shake * 0.05; net.scale.y = 1 + RIM.shake * 0.35 * Math.sin(tnow * 30)
  aim(dt)
  renderer.render(scene, camera)
}

// 2D 겹친 화면 — 점수판 · 이름 · 슛 게이지 · 튀는 글자 · 선수 고르기
const V = new THREE.Vector3()
const scr = (x, y, z) => { V.set(x, y, z).project(camera); return [(V.x + 1) / 2 * W, (1 - V.y) / 2 * H, V.z < 1] }
const circle = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2) }
function text(s, x, y, size, fill = '#fff', align = 'center', italic = false) {
  g.font = `${italic ? 'italic ' : ''}900 ${size}px system-ui, sans-serif`; g.textAlign = align; g.lineJoin = 'round'
  g.lineWidth = Math.max(3, size / 4.5); g.strokeStyle = '#0b0e14'; g.strokeText(s, x, y); g.fillStyle = fill; g.fillText(s, x, y)
}
function above(p) { p.f.rig.head.getWorldPosition(V2); return scr(V2.x, V2.y + 0.34, V2.z) }
function meter(p, x, y) {   // 1P 슛 게이지 — 초록 칸에서 놓으면 PERFECT
  const hgt = 74, w = greenW(p), m = Math.min(p.meter, 1.3) / 1.3, gy = y - (GREEN + w) / 1.3 * hgt, gh = w * 2 / 1.3 * hgt
  g.fillStyle = '#0b0e14dd'; g.fillRect(x - 3, y - hgt - 3, 16, hgt + 6)
  g.fillStyle = '#2ea04366'; g.fillRect(x, gy, 10, gh)
  g.fillStyle = Math.abs(p.meter - GREEN) < w ? '#3fb950' : '#ffd23f'; g.fillRect(x, y - m * hgt, 10, m * hgt)
  g.strokeStyle = '#3fb950'; g.lineWidth = 2; g.strokeRect(x - 1.5, gy, 13, gh)
}
function scoreboard() {
  const x0 = W / 2 - 200, y0 = 6
  g.fillStyle = '#0b0e14cc'; g.beginPath(); g.roundRect(x0, y0, 400, 40, 10); g.fill()
  for (const t of [0, 1]) {
    const T = TEAMS[sides[t]], L = t === 0, s = L ? 1 : -1, xe = L ? x0 : x0 + 400
    g.fillStyle = T.color; g.fillRect(L ? xe : xe - 7, y0, 7, 40)
    text(T.name + (t === me.team ? ' · 1P' : ''), xe + s * 15, y0 + 18, 11, T.color, L ? 'left' : 'right')
    if (offense === t && mode === 'play') text('● 공격', xe + s * 15, y0 + 33, 10, '#f5a623', L ? 'left' : 'right')
    text(String(score[t]), W / 2 + -s * 58, y0 + 30, 25, '#fff')
  }
  const m = Math.floor(clock / 60), sec = Math.floor(clock % 60)
  text(sudden ? 'SUDDEN' : `${m}:${String(sec).padStart(2, '0')}`, W / 2, y0 + 19, 16, '#fff')
  text(`${Math.max(0, Math.ceil(shot))}초 · ${WIN}점`, W / 2, y0 + 34, 10, shot < 4.5 ? '#ff6b6b' : '#9aa4b1')
}
function selectScreen() {
  g.fillStyle = 'rgba(8,10,18,.6)'; g.fillRect(0, 0, W, H)
  text('스트리트 3:3 — 내 선수를 고르세요', W / 2, 52, 26, '#ffd23f', 'center', true)
  TEAMS.forEach((T, ti) => {
    const x0 = COL_X + ti * COL_W, w = COL_W - 12
    text(T.name, x0 + w / 2, 84, 17, T.color)
    T.three.forEach((f, i) => {
      const y0 = ROW_Y + i * ROW_H, h = ROW_H - 10, on = pick === ti * 3 + i
      g.fillStyle = on ? '#3a3114ee' : '#151a24e6'; g.strokeStyle = on ? '#ffd23f' : T.color + '88'; g.lineWidth = on ? 3 : 1.5
      g.beginPath(); g.roundRect(x0, y0, w, h, 12); g.fill(); g.stroke()
      const cx = x0 + 56, cy = y0 + h / 2
      g.fillStyle = T.dark; circle(cx, cy, 44); g.fill()
      if (f.img.complete && f.img.naturalWidth) { g.save(); circle(cx, cy, 41); g.clip(); g.drawImage(f.img, cx - 44, cy - 44, 88, 88); g.restore() }
      g.strokeStyle = T.color; g.lineWidth = 3; circle(cx, cy, 42); g.stroke()
      g.textAlign = 'left'; g.fillStyle = '#e6edf3'; g.font = '800 15px system-ui, sans-serif'
      g.fillText(f.name.length > 7 ? f.name.slice(0, 7) + '…' : f.name, x0 + 110, y0 + 52)
      g.fillStyle = '#9aa4b1'; g.font = '700 12px system-ui, sans-serif'; g.fillText(`${ROLE[i]} · #${f.num}`, x0 + 110, y0 + 74)
    })
  })
  text('고른 선수를 한 번 더 누르면 시작 · Enter', W / 2, H - 12, 13, '#c9d1d9')
}
function hud() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H)
  if (!renderer) { g.fillStyle = '#0b0e14'; g.fillRect(0, 0, W, H); return text('이 브라우저는 3D(WebGL)를 그리지 못해요', W / 2, H / 2, 18, '#e6edf3') }
  if (mode === 'load') return text('불러오는 중…', W / 2, H / 2, 18, '#e6edf3')
  if (mode === 'select') return selectScreen()
  for (const p of ps) {
    const [x, y, ok] = above(p)
    if (!ok) continue
    g.globalAlpha = p === me ? 1 : 0.8
    text(p === me ? `1P ${p.f.name}` : p.f.name, x, y, p === me ? 13 : 11, p === me ? '#ffd23f' : TEAMS[sides[p.team]].color)
    if (p.call > 0) text('패스!', x, y - 16, 14, '#ffd23f')
    if (p.gradeT > 0) text(p.grade, x, y - 18 - (0.9 - p.gradeT) * 24, 16, { PERFECT: '#3fb950', GOOD: '#ffd23f' }[p.grade] ?? '#ff8a8a', 'center', true)
    if (p === me && p.act === 'shoot' && p.meter >= 0) meter(p, x + 34, y + 70)
  }
  g.globalAlpha = 1
  for (const a of parts) { const [x, y, ok] = scr(wx(a.x), a.h * K, wz(a.y)); if (ok) { g.globalAlpha = Math.min(1, a.t * 3); g.fillStyle = a.c; g.fillRect(x - 2.5, y - 2.5, 5, 5) } }
  for (const a of pops) { const [x, y, ok] = scr(wx(a.x), a.h * K, wz(a.y)); if (ok) { g.globalAlpha = Math.min(1, a.t * 2.5); text(a.text, x, y - (0.9 - a.t) * 30, 14, a.c, 'center', true) } }
  g.globalAlpha = 1
  scoreboard()
  if (clear && mode === 'play') text(offense === me.team ? 'CLEAR — 3점 라인 밖으로' : `${TEAMS[sides[offense]].name} CLEAR 중`, W / 2, H - 16, 15, '#ffd23f')
  if (msg) { const k = msg.t / msg.t0; g.globalAlpha = Math.min(1, k * 4); text(msg.text, W / 2, 210 - (1 - k) * 12, msg.text.length > 14 ? 30 : 48, '#ffd23f', 'center', true); g.globalAlpha = 1 }
  if (fade > 0) { g.fillStyle = `rgba(8,10,16,${fade / 0.35})`; g.fillRect(0, 0, W, H) }
  if (mode === 'over') {
    const win = score[me.team] > score[1 - me.team]
    g.fillStyle = '#0b0e14b8'; g.fillRect(0, 0, W, H)
    text(win ? 'YOU WIN!' : 'YOU LOSE', W / 2, 240, 64, win ? '#ffd23f' : '#ff8a8a', 'center', true)
    text(`${TEAMS[sides[0]].name} ${score[0]} - ${score[1]} ${TEAMS[sides[1]].name}`, W / 2, 292, 22, '#fff')
    if (wait <= 0) text('누르면 다시', W / 2, 336, 15, '#9aa4b1')
  }
}

let last = 0, ema = 16, slowT = 0
function frame(t) {
  const ms = t - last, real = Math.min(0.05, ms / 1000 || 0)
  last = t
  const dt = slow > 0 ? real * 0.3 : real   // 덩크 · 발목 꺾기는 잠깐 느린 화면
  slow = Math.max(0, slow - real)
  update(dt)
  for (const a of parts) { a.vh -= 600 * dt; a.h = Math.max(0, a.h + a.vh * dt) }
  render(dt)
  hud()
  // 느린 기기 — 경기 중 1.5초 넘게 45fps 밑이면 해상도를 한 단계 낮춘다(2 → 1.5 → 1.25 → 1, 1 이면 그림자도 끈다)
  if (ms > 0 && ms < 100 && mode === 'play') {
    ema += (ms - ema) * 0.08; slowT = ema > 22 ? slowT + ms / 1000 : 0
    if (slowT > 1.5 && maxD > 1) { maxD = maxD > 1.5 ? 1.5 : maxD > 1.25 ? 1.25 : 1; slowT = 0; ema = 16; if (maxD === 1 && renderer) { renderer.shadowMap.enabled = false; scene.traverse(o => o.material && (o.material.needsUpdate = true)) } }
  }
  requestAnimationFrame(frame)
}
if (renderer) scenery()
requestAnimationFrame(frame)

await loadData()
const kr = data.players.filter(p => p.server === 'kr')
TEAMS.forEach((T, ti) => {
  const five = lineup(kr, ti)
  T.three = SLOTS.map(pos => {
    const p = five[pos - 1], img = new Image(), f = { name: p ? p.short || p.name : `${pos}번`, num: NBA_NUM[p?.id] ?? NUMS[pos - 1], img }
    img.onload = () => { try { f.head = cutHead(img); [f.skin] = skinOf(img); f.hair = hairOf(f.head) } catch {} }   // 실패하면 얼굴 없는 머리 · 기본 피부색
    if (p) img.src = faceOf(p)
    return f
  })
})
// 포지션 특성 표 — STATS 의 설명
document.getElementById('pos-table').replaceChildren(...STATS.map((S, i) => {
  const tr = document.createElement('tr')
  tr.append(Object.assign(document.createElement('th'), { textContent: ROLE[i] }), Object.assign(document.createElement('td'), { textContent: S.note }))
  return tr
}))
mode = 'select'
