// 슈퍼 슬램 — 5:5 풀코트 오락실 농구(1P vs CPU). 숨긴 메뉴 — 마이페이지 관리자 메뉴에서만 링크한다.
// 90년대 오락실 농구(Super Slams) 느낌만 빌린 새 게임이다. 원작 롬 · 그림 · 팀 이름은 쓰지 않는다 — 롬은 저작물이라 이 공개 사이트에 둘 수 없다.
// 선수 얼굴은 덩크 시티 선수(data/players.json). 1P 는 오른쪽 골대를 공격한다. 궁극기는 20명이 다 다르다(SKILLS) — 게이지가 차면 쓴다.
// 키: 방향키 · WASD 이동, 드리블 Z · J, 패스 X · K, 슛 C · L · 스페이스, 궁극기 V · U. 수비 때는 스틸 · 선수 바꾸기 · 블록 · 스틸 대시. 휴대폰은 캔버스 아래 스틱 · 버튼.
// ponytail: 파울 · 자유투 · 아웃 오브 바운즈 · 하프코트 바이얼레이션 · 소리 없음 — 공은 코트 끝에서 튕겨 나온다
import { mountTop, POS } from './app.js?v=fb02b445'
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
const guarded = o => o.act === 'air' || o.act === 'cross' || o.act === 'dunk' || o.act === 'spin' || o.sure || o.ghost > 0   // 이 동작 중에는 스틸이 안 된다
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
  showTab(pick)
  ps = [0, 1].flatMap(t => TEAMS[sides[t]].five.map((f, i) => ({
    team: t, i, f, x: 0, z: 0, h: 0, vh: 0, dir: side(t), run: 0, mv: false, act: null, t: 0,
    cool: 0, stun: 0, fall: 0, think: 0, cut: 0, block: 0, reach: 0, ult: rnd() * 0.3, boost: 0, cdx: 0, dp: 0, hand: 1, sq: 0, kb: null, sure: false, trail: [], tt: 0,
    ghost: 0, hot: 0, slow: 0, ice: 0, big: 0, conf: 0, mirror: 0, wt: 0, poster: false, four: false, hook: false, vx: 0, vz: 0, fd: side(t), joints: {},
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
  Object.assign(ball, { st: 'held', owner: p, to: null, rebound: false, sure: false, oop: false, chain: null, safe: false })
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
  Object.assign(pg, { x: h.x + side(1 - t) * 30, z: h.z + 70, h: 0, vh: 0, vx: 0, vz: 0, act: null, stun: 0, fall: 0, kb: null })
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

// ---------------------------------------------------------------- 궁극기 — 팀마다 포지션 1~5, 20명이 다 다르다
// need = 골대까지 이 거리 안에서만 쓴다. cpu(골대까지, 가장 가까운 수비까지) = CPU 가 쓰는 때. 수비 때 궁극기는 모두 스틸 대시

const close = (d, c) => c < 50, far = d => d > 200 && d < 460, drive = d => d > 150, any = () => true
const SKILLS = [
  [   // VIPERS_T — 힘으로
    { name: '앵클 브레이커', desc: '주변 수비가 넘어지고 빨라진다', cpu: close, fx: p => { down(p, 110, 1.6); p.boost = 2.5; say('ANKLE BREAKER!') } },
    { name: '딥 쓰리', desc: '어디서 던져도 꼭 들어가는 슛', cpu: far, fx: p => sureShot(p) },
    { name: '에어 워크', desc: '골대까지 날아가 덩크', cpu: drive, fx: p => Object.assign(p, { act: 'air', t: 0, sure: true }) },
    { name: '불도저', desc: '주변 수비를 밀쳐 낸다', cpu: close, fx: p => { push(p, p, 150, 340, 1.3); p.boost = 2; shake = Math.max(shake, 10); say('BULLDOZER!') } },
    { name: '메가 슬램', desc: '골밑에서 충격파 덩크', need: 300, cpu: d => d < 280, fx: p => { p.sure = true; dunkFrom(p, true) } },
  ],
  [   // VIPERS_N — 기술로
    { name: '팬텀 드리블', desc: '4초 동안 뺏기지 않고 수비를 통과한다', cpu: close, fx: p => { p.ghost = 4; say('PHANTOM!') } },
    { name: '핫 핸드', desc: '6초 동안 점프슛이 다 들어간다', cpu: d => d < 380, fx: p => { p.hot = 6; say('ON FIRE!') } },
    { name: '앨리웁 쇼', desc: '골밑 동료에게 띄워 주면 그대로 덩크', cpu: any, fx: p => oop(p) },
    { name: '회오리 스핀', desc: '돌면서 주변 수비를 날려 버린다', cpu: close, fx: p => { Object.assign(p, { act: 'spin', t: 0 }); push(p, p, 100, 300, 1.1); p.boost = 1.5 } },
    { name: '스카이 훅', desc: '아무도 못 막는 높은 훅슛', need: 330, cpu: d => d < 300, fx: p => { p.hook = true; sureShot(p) } },
  ],
  [   // VIPERS_A — 얼음 · 시간
    { name: '아이스 타임', desc: '주변 수비를 2초 동안 얼린다', cpu: close, fx: p => { freeze(p, 220, 2.2); rings.push({ x: p.x, z: p.z, t: 0, c: '170,225,255' }); say('FREEZE!') } },
    { name: '포 포인트', desc: '3점 밖에서 꼭 들어가는 4점 슛', cpu: d => d > 240 && d < 460, fx: p => { p.four = true; sureShot(p) } },
    { name: '블링크 덩크', desc: '골대 앞으로 순간이동해 덩크', cpu: drive, fx: p => blink(p) },
    { name: '슬로우 필드', desc: '5초 동안 상대 모두가 느려진다', cpu: any, fx: p => { for (const q of opp(p)) q.slow = 5; rings.push({ x: p.x, z: p.z, t: 0, c: '120,190,255', big: true }); say('SLOW!') } },
    { name: '자이언트', desc: '6초 동안 커져서 먼 데서도 덩크', cpu: any, fx: p => { p.big = 6; shake = Math.max(shake, 6); say('GIANT!') } },
  ],
  [   // VIPERS_B — 그림자
    { name: '미러 이미지', desc: '분신으로 상대를 3초 동안 헷갈리게 한다', cpu: close, fx: p => { for (const q of opp(p)) q.conf = 3.5; p.mirror = 3.5; p.boost = 2; say('WHO?!') } },
    { name: '체인 패스', desc: '동료 넷을 거친 공을 마지막이 꼭 넣는다', cpu: far, fx: p => chain(p) },
    { name: '포스터라이저', desc: '길을 막는 수비를 넘어뜨리며 덩크', cpu: drive, fx: p => Object.assign(p, { act: 'air', t: 0, sure: true, poster: true }) },
    { name: '블랙홀', desc: '상대를 뒤쪽 한 점으로 빨아들인다', cpu: close, fx: p => blackhole(p) },
    { name: '어스퀘이크', desc: '땅을 내리쳐 주변 상대를 모두 넘어뜨린다', cpu: close, fx: p => { down(p, 420, 1.5); p.sq = 0.3; shake = Math.max(shake, 22); rings.push({ x: p.x, z: p.z, t: 0, c: '220,160,90', big: true }); say('EARTHQUAKE!') } },
  ],
]
const skillOf = p => SKILLS[sides[p.team]][p.i]
const opp = p => team(1 - p.team)

function down(p, r, t) { for (const q of opp(p)) if (dist(q, p) < r) knock(q, 0, 0, t) }
function push(from, p, r, f, t) { for (const q of opp(p)) { const d = dist(q, from); if (d < r) knock(q, (q.x - from.x) / (d || 1) * f, (q.z - from.z) / (d || 1) * f, t) } }
function freeze(p, r, t) { for (const q of opp(p)) if (dist(q, p) < r) Object.assign(q, { stun: t, ice: t, act: null, mv: false }) }
function sureShot(p) { p.sure = true; shoot(p) }
function oop(p) {   // 골대에 가장 가까운 동료에게 높이 띄운다 — 가로챌 수 없다
  pass(p, nearest(team(p.team).filter(m => m !== p), goal(p.team)))
  Object.assign(ball, { oop: true, safe: true })
  say('ALLEY-OOP!')
}
function chain(p) {   // 동료 넷을 아무 순서로 — 빠르고 가로챌 수 없다
  const rest = team(p.team).filter(m => m !== p).sort(() => rnd() - 0.5)
  pass(p, rest.shift())
  Object.assign(ball, { chain: rest, safe: true })
  say('CHAIN PASS!')
}
function blink(p) {
  const h = goal(p.team)
  burst(p.x, p.z, 40, 18, ['#7ff3ff', '#fff'])
  Object.assign(p, { x: h.x - side(p.team) * 50, z: h.z + 10, sure: true })
  burst(p.x, p.z, 40, 18, ['#7ff3ff', '#fff'])
  dunkFrom(p, false)
}
function blackhole(p) {   // 공격 방향 반대쪽 한 점으로 — 골밑이 빈다
  const at = { x: clamp(p.x - side(p.team) * 260, 30, CL - 30), z: 250 }
  for (const q of opp(p)) { const d = dist(q, at); if (d > 20) knock(q, (at.x - q.x) / d * Math.min(800, d * 2.6), (at.z - q.z) / d * Math.min(800, d * 2.6), 1.4) }
  for (const q of opp(p)) q.fall = 0   // 넘어지지 않고 빨려 가서 멍하니 선다
  rings.push({ x: at.x, z: at.z, t: 0, c: '170,90,255', in: true, big: true })
  say('BLACK HOLE!')
}

// ---------------------------------------------------------------- 동작

function jump(p) { if (p.h === 0 && !p.act) p.vh = JUMP }
const canMove = p => !p.act && p.h === 0 && p.stun <= 0 && !p.kb
const speed = p => SPD * (ball.owner === p ? 0.92 : 1)

/** 방향(dx, dz — 길이 1 이하)으로 달린다. 속도는 바로 붙지 않고 0.2초쯤에 걸쳐 붙고 줄어든다 — 출발 · 멈춤 · 방향 전환이 부드럽다 */
function step(p, dx, dz, spd, dt) {
  spd *= (p.boost > 0 ? 1.45 : 1) * (p.ghost > 0 ? 1.3 : 1) * (p.big > 0 ? 1.15 : 1) * (p.slow > 0 ? 0.45 : 1)   // 궁극기 효과
  const k = 1 - Math.exp(-dt * 11)
  p.vx += (dx * spd - p.vx) * k; p.vz += (dz * spd * 0.85 - p.vz) * k
  p.x += p.vx * dt; p.z += p.vz * dt
  const v = Math.hypot(p.vx, p.vz)
  p.mv = v > 20
  if (Math.abs(p.vx) > 45) p.dir = Math.sign(p.vx)   // 실제로 그쪽으로 움직일 때만 돈다 — 제자리에서 방향이 떨리지 않게
  p.run += dt * Math.min(1.3, v / SPD)   // 걸음 박자도 속도를 따라간다
}
function toward(p, tx, tz, spd, dt) {   // 가까워질수록 천천히 — 도착하면 선다
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), k = d < 4 ? 0 : Math.min(1, d / 40) / d
  step(p, dx * k, dz * k, spd, dt)
}
const stop = p => { p.vx = p.vz = 0; p.mv = false }

function pass(p, m) {
  Object.assign(ball, { st: 'pass', owner: null, to: m, x: p.x + p.dir * 12, z: p.z, h: 40, tried: new Set([p]), oop: false, chain: null, safe: false })
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
  p.vx = p.cx; p.vz = p.cz   // 끝나면 이 속도에서 서서히 준다
  if (Math.abs(dx) > 0.15) p.dir = Math.sign(dx)
  for (const q of team(1 - p.team)) if (dist(q, p) < 45 && rnd() < 0.4) { knock(q, 0, 0, 0.9); say('ANKLES!', 0.7) }
}

function dunkFrom(p, mega) {
  Object.assign(p, { act: 'dunk', t: 0, from: { x: p.x, z: p.z }, dur: mega ? 0.6 : 0.4, peak: mega ? 130 : 88, vx: 0, vz: 0 })
  p.dir = Math.sign(goal(p.team).x - p.x) || p.dir
}
function shoot(p) {
  if (p.act || p.h > 0) return
  const h = goal(p.team)
  p.dir = Math.sign(h.x - p.x) || p.dir
  if (dist(p, h) < (p.big > 0 ? 200 : 90)) dunkFrom(p, false)   // 자이언트는 멀리서도 덩크
  else Object.assign(p, { act: 'shot', t: 0, rel: false, vh: JUMP * (p.sure ? 1.15 : 1), vx: 0, vz: 0 })
  // 가까운 수비는 조금 늦게 뛰어 막으러 온다(1P 가 움직이는 선수는 직접 뛴다)
  if (!p.sure) for (const q of ps) if (q.team !== p.team && q !== ctl && dist(q, p) < 60 && rnd() < 0.75) q.block = 0.05 + rnd() * 0.22
}
const blocker = (p, r) => ps.find(q => q.team !== p.team && q.h > 22 && dist(q, p) < r)

function letGo(p) {   // 점프슛을 놓는 순간
  const h = goal(p.team), d = dist(p, h), sure = p.sure || p.hot > 0, { four, hook } = p
  p.sure = p.four = p.hook = false
  if (!sure) { const b = blocker(p, 40); if (b && rnd() < 0.45) return swat(p, b) }
  let pr = d < 160 ? 0.62 : d < 237 ? 0.5 : d < 300 ? 0.38 : 0.12
  const c = open(p)
  pr *= c < 30 ? 0.55 : c < 55 ? 0.8 : 1
  const three = d > 237 || Math.abs(p.z - h.z) > 220
  Object.assign(ball, {
    st: 'shot', owner: null, x: p.x + p.dir * 6, z: p.z, h: p.h + 74, t: 0, T: 0.7 + d / 900, make: sure || rnd() < pr, pts: three ? (four ? 4 : 3) : 2, team: p.team, hoop: h,
    arc: hook ? 150 + d * 0.4 : 60 + d * 0.3, sure, by: p, msg: four && three ? '4 POINTS!' : hook ? 'SKY HOOK!' : sure && three ? 'DEEP THREE!' : '',
  })
  Object.assign(ball, { sx: ball.x, sz: ball.z, sh: ball.h })
}
function slam(p) {    // 덩크가 림에 닿는 순간
  const sure = p.sure || p.big > 0, mega = p.dur > 0.5, h = goal(p.team)
  p.sure = p.poster = false
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
  const off = ball.owner === p, need = skillOf(p).need
  if (off && need && dist(p, goal(p.team)) > need) { if (p.team === 0) say('골대 가까이에서 써요', 0.8); return false }
  if (!off) { const o = ball.owner; if (!o || o.team === p.team || o.sure || dist(p, o) > 320) return false }
  p.ult = 0
  cut = { p, off, t: 0 }
  shake = Math.max(shake, 4)
  return true
}
function fire(p, off) {
  if (!off) return void Object.assign(p, { act: 'rush', t: 0 })
  if (ball.owner === p) skillOf(p).fx(p)   // 그새 뺏겼으면 그냥 지나간다
}

// 몸 — 쿨타임 · 게이지 · 점프 · 동작. 동작 중 공을 뺏겼으면(ball.owner 가 아니면) 놓지 않는다
function body(p, dt) {
  for (const k of ['cool', 'stun', 'fall', 'boost', 'cdx', 'sq', 'reach', 'ghost', 'hot', 'slow', 'ice', 'big', 'conf', 'mirror']) p[k] = Math.max(0, p[k] - dt)
  if (p.hot > 0 && rnd() < dt * 30) parts.push({ x: p.x + (rnd() - 0.5) * 16, z: p.z, h: 30 + rnd() * 50, vx: 0, vz: 0, vh: 260, t: 0.3, c: rnd() < 0.5 ? '#ff7a1a' : '#ffd23f' })   // 핫 핸드 — 불꽃
  p.ult = Math.min(1, p.ult + dt * ULT_FILL * (p.team ? 0.8 : 1))   // CPU 는 조금 느리게 찬다
  if (ball.owner === p) p.dp += dt * (7 + 4 * Math.min(1, Math.hypot(p.vx, p.vz) / SPD))
  p.fd += (p.dir - p.fd) * (1 - Math.exp(-dt * 16))   // 몸 돌리기 — 방향이 바뀌면 0.1초쯤에 걸쳐 돈다
  if (p.act === 'cross' || p.act === 'air' || p.act === 'rush' || p.boost > 0 || p.kb) {   // 잔상
    if ((p.tt -= dt) <= 0) { p.tt = 0.035; p.trail.unshift({ x: p.x, z: p.z, h: p.h }); p.trail.length = Math.min(p.trail.length, 5) }
  } else p.trail.pop()
  if (p.kb) { p.x += p.kb.vx * dt; p.z += p.kb.vz * dt; if ((p.kb.t -= dt) <= 0) p.kb = null }
  const h = goal(p.team)
  if (p.act === 'cross') {
    p.x += p.cx * dt; p.z += p.cz * dt; p.run += dt * 1.2
    if ((p.t += dt) >= 0.26) p.act = null
    return
  }
  if (p.act === 'spin') { if ((p.t += dt) >= 0.45) p.act = null; return }
  if (p.act === 'air') {   // 에어 워크 · 앨리웁 · 포스터라이저 — 골대 앞까지 날아간다
    const d = dist(p, h), v = 620 * dt
    if (p.poster) for (const q of team(1 - p.team)) if (!q.fall && dist(q, p) < 36) knock(q, 0, (q.z > p.z ? 1 : -1) * 320, 1.3)   // 길을 막는 수비는 옆으로 쓰러진다
    if (d < 80) return dunkFrom(p, false)
    p.vx = (h.x - p.x) / d * 620; p.vz = (h.z - p.z) / d * 620
    p.x += p.vx * dt; p.z += p.vz * dt; p.run += dt * 2; p.dir = Math.sign(p.vx) || p.dir
    return
  }
  if (p.act === 'rush') {  // 스틸 대시 — 공을 끝까지 쫓는다. 패스하면 날아가는 공을, 받으면 받은 사람을
    const o = ball.owner, tg = o || ball, d = dist(p, tg), v = 700 * dt
    if (o ? o.team === p.team || o.sure || o.ghost > 0 : ball.st !== 'pass' && ball.st !== 'loose' || ball.safe) return void (p.act = null)
    if ((p.t += dt) > 1.5) return void (p.act = null)
    if (d < 22) { p.act = null; return grab(p, 'STEAL!') }
    p.vx = (tg.x - p.x) / d * 700; p.vz = (tg.z - p.z) / d * 700
    p.x += p.vx * dt; p.z += p.vz * dt; p.dir = Math.sign(tg.x - p.x) || p.dir; p.run += dt * 2
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
  const p = ctl, [x, z] = axis(), ax = p.conf > 0 ? -x : x, az = p.conf > 0 ? -z : z   // 미러 이미지에 걸리면 방향이 뒤집힌다
  if (canMove(p)) step(p, ax, az, speed(p), dt)
  else if (!p.act) stop(p)   // 대시 · 덩크 같은 동작은 body() 가 속도를 맡는다
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
  if (!canMove(p)) { if (!p.act) stop(p); return }
  if (ball.owner === p) return handle(p, dt)
  if (p.conf > 0) {   // 미러 이미지 — 분신을 쫓아 엉뚱한 데로 간다
    if ((p.wt -= dt) <= 0) { p.wt = 0.7; p.wx = rnd() * CL; p.wz = rnd() * CW }
    return toward(p, p.wx, p.wz, SPD * 0.8, dt)
  }
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
  if (Math.abs(ball.x - p.x) > 14) p.dir = Math.sign(ball.x - p.x)   // 공을 본다 — 공이 바로 앞이면 그대로(좌우로 떨지 않게)
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
  if (p.ult >= 1 && skillOf(p).cpu(d, c) && rnd() < 0.6 && ultimate(p)) return
  if (p.hot > 0 && d > 90 && d < 420) return shoot(p)   // 핫 핸드 동안은 보이면 쏜다
  if (c < 30 && p.cdx <= 0 && rnd() < 0.35) return crossover(p, 0, 0)
  if (d < 90 || shot < 2.5 || d < 300 && c > 55 && rnd() < (d < 237 ? 0.5 : 0.3)) shoot(p)
  else if (rnd() < (c < 28 ? 0.5 : 0.18)) pass(p, mateFor(p))
}

// ---------------------------------------------------------------- 공

/** 공 자리 — 들고 있으면 손, 움직이면 바닥까지 튕긴다(|cos| 라 바닥에서 꺾여 올라온다) */
function hand(p) {
  if (p.act === 'shot' || p.act === 'dunk') return [p.x + p.dir * 4, p.z, p.h + 94]   // 머리 위 — 두 손 위
  if (p.act === 'air') return [p.x + p.dir * 12, p.z, p.h + 50]   // 가슴 앞에 두 손으로
  if (p.act === 'cross') return [p.x + p.fd * 10, p.z + p.hand * (16 * Math.min(1, p.t / 0.26) - 8), 6]   // 낮게 몸 앞을 가로지른다
  return [p.x + p.fd * 12, p.z + p.hand * 5, 2 + 32 * Math.abs(Math.cos(p.dp))]   // 몸이 도는 만큼 공도 앞으로 돌아온다
}

function moveBall(dt) {
  ball.rot += dt * (ball.st === 'held' ? 5 : 14)
  if (ball.st === 'shot' || ball.st === 'pass' || ball.st === 'loose' && ball.h > 8) { ball.trail.unshift({ x: ball.x, z: ball.z, h: ball.h }); ball.trail.length = Math.min(ball.trail.length, 7) }
  else ball.trail.length = 0
  if (ball.st === 'held') {
    [ball.x, ball.z, ball.h] = hand(ball.owner)
  } else if (ball.st === 'pass') {   // 받는 사람을 따라간다. 지나가는 길의 상대는 한 번씩 가로챌 기회
    const m = ball.to, dx = m.x - ball.x, dz = m.z - ball.z, d = Math.hypot(dx, dz), v = (ball.safe ? 900 : 560) * dt
    if (d <= v + 8) {
      const { oop, chain } = ball
      grab(m)
      if (oop) Object.assign(m, { act: 'air', t: 0, sure: true })   // 앨리웁 — 받자마자 골대로 날아간다
      else if (chain?.length) { pass(m, chain.shift()); Object.assign(ball, { chain, safe: true }) }
      else if (chain) { Object.assign(m, { act: null, h: 0, vh: 0, sure: true }); shoot(m) }   // 체인 패스의 마지막 — 꼭 넣는다
      return
    }
    ball.x += dx / d * v; ball.z += dz / d * v; ball.h += ((ball.oop ? 120 : 40) - ball.h) * Math.min(1, dt * 6)
    if (!ball.safe) for (const q of ps) {
      if (q.team === m.team || ball.tried.has(q) || dist(q, ball) >= 18 || q.stun > 0) continue
      ball.tried.add(q)
      if (rnd() < 0.3) return grab(q, 'STEAL!')
    }
  } else if (ball.st === 'shot') {
    ball.t += dt
    const u = Math.min(1, ball.t / ball.T), h = ball.hoop
    ball.x = ball.sx + (h.x - ball.sx) * u; ball.z = ball.sz + (h.z - ball.sz) * u
    ball.h = ball.sh + (RIM + 8 - ball.sh) * u + ball.arc * 4 * u * (1 - u)
    if (u >= 1) ball.make ? made(ball.team, ball.pts, ball.msg, ball.by) : miss(h)
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
    const through = p => p.act === 'dunk' || p.act === 'air' || p.act === 'rush' || p.ghost > 0
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
  for (const r of rings) {   // 충격파 — 블랙홀은 안으로 빨려 든다
    const k = r.in ? 1 - r.t / 0.6 : r.t / 0.6, [rx, ry, u] = P(r.x, r.z), R = (30 + (r.big ? 420 : 220) * k) * u
    g.strokeStyle = `rgba(${r.c || '255,220,120'},${r.in ? k : 1 - k})`; g.lineWidth = 6 * (1 - k) + 1
    oval(rx, ry, R, R * 0.35); g.stroke()
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

/** 두 마디 팔다리 — a 에서 b 로, 관절은 bend(±1) 쪽으로 꺾인다. 닿지 않으면 쭉 편다. [관절, 끝] */
function limb(ax, ay, bx, by, l1, l2, bend) {
  const dx = bx - ax, dy = by - ay, n = Math.hypot(dx, dy) || 1, d = Math.min(n, l1 + l2 - 0.01), ux = dx / n, uy = dy / n
  const k = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - k * k))
  return [[ax + ux * k - uy * h * bend, ay + uy * k + ux * h * bend], [ax + ux * d, ay + uy * d]]
}
/** 관절 — 두 해 가운데 pole 에 가까운 쪽(팔꿈치는 아래 · 뒤, 무릎은 앞)을 고르고, 그 자리를 부드럽게 따라간다(한 번에 뒤집히지 않게). 몸 좌표를 u 로 나눠 기억한다 */
function joint(p, key, a, b, l1, l2, pole, u, k) {
  const [A, B] = [1, -1].map(s => limb(a[0], a[1], b[0], b[1], l1, l2, s))
  const [j, end] = Math.hypot(A[0][0] - pole[0], A[0][1] - pole[1]) <= Math.hypot(B[0][0] - pole[0], B[0][1] - pole[1]) ? A : B
  return [ease(p, key, j, u, k), end]
}
function ease(p, key, [tx, ty], u, k) {
  const m = p.joints[key] ||= [tx / u, ty / u]
  m[0] += (tx / u - m[0]) * k; m[1] += (ty / u - m[1]) * k
  return [m[0] * u, m[1] * u]
}
function line(pts, w, c) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.stroke() }
function shape(pts, c) { g.fillStyle = c; g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath(); g.fill() }

function drawPlayer(p) {
  const [x, y, u] = P(p.x, p.z, p.h), [fx, fy] = P(p.x, p.z), T = TEAMS[sides[p.team]], big = p.big > 0 ? 1.4 : 1
  const skin = p.f.skin || SKIN, shade = p.f.shade || '#8f5f3e'
  p.trail.forEach((s, j) => {   // 잔상
    const [gx, gy, gu] = P(s.x, s.z, s.h)
    g.globalAlpha = 0.3 * (1 - j / p.trail.length); g.fillStyle = T.color
    g.fillRect(gx - 9 * gu, gy - 62 * gu, 18 * gu, 56 * gu); oval(gx, gy - 74 * gu, 9 * gu, 10 * gu); g.fill()
  })
  g.globalAlpha = 1
  if (p.mirror > 0) for (const dz of [-38, 38]) {   // 미러 이미지 — 양옆의 분신
    const [mx, my, mu] = P(p.x + Math.sin(tnow * 6 + dz) * 8, p.z + dz, p.h)
    g.globalAlpha = 0.45; g.fillStyle = T.color; g.fillRect(mx - 9 * mu, my - 62 * mu, 18 * mu, 56 * mu)
    if (p.f.head) g.drawImage(p.f.head, mx - 12 * mu, my - 88 * mu, 24.5 * mu, 26 * mu)
    g.globalAlpha = 1
  }
  if (p.slow > 0) { g.strokeStyle = 'rgba(120,190,255,.85)'; g.lineWidth = 2; oval(fx, fy + 2, 18 * u, 6.5 * u); g.stroke() }
  if (p.hot > 0 || p.ghost > 0) { g.fillStyle = p.hot > 0 ? 'rgba(255,120,30,.35)' : 'rgba(90,230,200,.3)'; oval(fx, fy, 26 * u, 10 * u); g.fill() }
  if (p.ult >= 1) { g.fillStyle = `rgba(255,210,63,${0.3 + 0.2 * Math.sin(tnow * 9)})`; oval(fx, fy, 24 * u, 9 * u); g.fill() }   // 궁극기 준비
  const sh = Math.max(0.5, 1 - p.h / 160) * big
  g.fillStyle = 'rgba(0,0,0,.3)'; oval(fx, fy, 14 * u * sh, 4.6 * u * sh); g.fill()
  if (p === ctl) { g.strokeStyle = '#ffd23f'; g.lineWidth = 3; oval(fx, fy, 19 * u * big, 7 * u * big); g.stroke() }

  // 몸 좌표 — at(옆, 키 높이). 윗몸일수록 달리는 쪽으로 기울어진다(기울기는 실제 속도를 따른다)
  const v = Math.hypot(p.vx, p.vz), a = p.h > 0 || p.fall ? 0 : Math.min(1, v / SPD), ph = p.run * 15, f = p.fd, fs = f >= 0 ? 1 : -1
  const kh = 1 - Math.exp(-drawDt * 20), kj = 1 - Math.exp(-drawDt * 28), kb = 1 - Math.exp(-drawDt * 45)   // 손 · 관절 · 공 쪽 손이 따라가는 빠르기
  const lean = p.fall ? 0 : clamp(p.vx / SPD, -1.3, 1.3) * 0.16, at = (px, hh) => [px * u + lean * hh * u, -hh * u]
  const holding = ball.owner === p, up = p.act === 'shot' || p.act === 'dunk' || p.h > 0 && !holding
  const guard = !holding && ball.owner && ball.owner.team !== p.team && dist(p, ball.owner) < 70   // 공 가진 상대 앞의 수비
  g.save()
  g.translate(x, y - Math.abs(Math.sin(ph)) * 2.5 * u * a)   // 걸을 때 몸이 오르내린다
  if (big > 1) g.scale(big, big)   // 자이언트
  if (p.ghost > 0) g.globalAlpha = 0.55   // 팬텀 — 반투명
  if (p.act === 'spin') { const c = Math.cos(p.t / 0.45 * Math.PI * 4); g.scale(Math.abs(c) < 0.15 ? 0.15 : c, 1) }   // 회오리 — 제자리에서 두 바퀴
  if (p.fall > 0) g.rotate(-p.dir * 1.35)   // 넘어졌다
  else if (p.sq > 0) g.scale(1 + p.sq * 1.2, 1 - p.sq * 1.2)   // 착지 — 잠깐 눌린다
  g.lineCap = 'round'; g.lineJoin = 'round'
  // 다리 — 엉덩이 · 무릎 · 발. 걸음마다 발이 앞뒤로 오가고 뒤로 갈 때 들린다. 공중에서는 접는다. 먼 다리는 어둡게
  const leg = (k, col) => {
    const hip = at(k ? 2.6 : -2.6, 37), s = Math.sin(ph + k * Math.PI)
    const foot = p.h > 0 || p.act === 'dunk' ? [hip[0] + f * (k ? 7 : -2) * u, (k ? -13 : -7) * u]
      : [(k ? 2.6 : -2.6) * u * (1 - Math.abs(f)) + f * s * 10 * u * a, -Math.max(0, -Math.cos(ph + k * Math.PI)) * 7 * u * a]
    const [knee, end] = joint(p, `k${k}`, hip, foot, 19 * u, 18.5 * u, [hip[0] + f * 14 * u, hip[1] + 18 * u], u, kj)
    line([hip, knee], 6.4 * u, col); line([knee, end], 5.2 * u, col)
    line([[end[0], end[1] - 5 * u], [end[0], end[1] - 1.8 * u]], 4.8 * u, '#f2f2f2')   // 양말
    g.fillStyle = '#fafafa'; oval(end[0] + f * 2.2 * u, end[1] - 1.5 * u, 4.8 * u, 2.3 * u); g.fill()   // 운동화
    g.fillStyle = T.dark; g.fillRect(end[0] + f * 2.2 * u - 4.8 * u, end[1] - 0.5 * u, 9.6 * u, 1.1 * u)
  }
  // 팔 — 어깨는 왼쪽 · 오른쪽 그대로이고 몸이 향한 쪽이 앞 팔. 손은 목표 자리를, 팔꿈치는 아래 · 뒤를 부드럽게 따라간다
  const arm = (side, target, col, k) => {
    const s0 = at(side * 7.4, 60), hand = ease(p, `h${side}`, target, u, k)
    const [el, end] = joint(p, `e${side}`, s0, hand, 13.5 * u, 13 * u, [s0[0] - f * 10 * u, s0[1] + 16 * u], u, kj)
    line([s0, el], 5 * u, col); line([el, end], 4.3 * u, col)
    g.fillStyle = col; oval(end[0], end[1], 2.5 * u, 2.5 * u); g.fill()
  }
  const sw = Math.sin(ph) * 9 * u * a, rise = Math.abs(Math.sin(ph)) * 3 * u * a
  let near, far   // 손 자리
  if (p.act === 'dunk') { near = at(fs * 12, 102); far = at(fs * 5, 97) }   // 림으로 뻗는다
  else if (up) { near = at(fs * 3, 90); far = at(-fs * 2, 88) }   // 슛 · 블록 — 머리 위로
  else if (holding && p.act === 'air') { near = at(fs * 10, 52); far = at(fs * 8, 50) }   // 가슴 앞에 두 손으로
  else if (holding) {   // 공 쪽 손은 튀어 오르는 공을 따라 오르내린다(무릎 아래로는 안 내려간다). 다른 손은 공을 감싼다
    near = [(ball.x - p.x) * u / big, ((ball.z - p.z) * 0.7 - (Math.max(ball.h, 26) + 5) * u) / big]
    far = at(fs * 11, 46)   // 다른 팔은 몸 앞으로 내밀어 공을 감싼다(몸에 가려 손만 보인다)
  }
  else if (p.reach > 0) { near = at(fs * 26, 48); far = at(-fs * 6, 38) }   // 스틸 — 손을 뻗는다
  else if (guard) { near = at(fs * 17, 70); far = at(fs * 13, 42) }   // 수비 — 한 손은 들어 앞을 막고 한 손은 낮게(옆에서 보니 둘 다 몸 앞)
  else { near = [at(fs * 9.5, 35)[0] + fs * sw, -(35 * u + rise)]; far = [at(-fs * 8.5, 35)[0] - fs * sw, -(35 * u + rise)] }   // 몸 옆에 늘어뜨리고, 걸을 때는 다리와 엇갈려 흔든다
  arm(-fs, far, shade, kh)
  leg(0, shade)
  leg(1, skin)
  shape([at(-8.8, 42), at(8.8, 42), at(10.4, 27), at(1, 26), at(0, 29), at(-1, 26), at(-10.4, 27)], T.dark)   // 반바지
  line([at(-9.6, 41), at(-10.3, 28)], 1.4 * u, T.color); line([at(9.6, 41), at(10.3, 28)], 1.4 * u, T.color)
  shape([at(-3.6, 64), at(-9.6, 62.5), at(-7.8, 54), at(-8.4, 40.5), at(8.4, 40.5), at(7.8, 54), at(9.6, 62.5), at(3.6, 64), at(0, 58.5)], T.color)   // 민소매 상의
  g.globalAlpha *= 0.85
  line([at(-3.6, 64), at(0, 58.5), at(3.6, 64)], 1 * u, '#fff'); line([at(-9.6, 62.5), at(-7.8, 54)], 1 * u, '#fff'); line([at(9.6, 62.5), at(7.8, 54)], 1 * u, '#fff')
  g.globalAlpha /= 0.85
  g.fillStyle = '#fff'; g.font = `800 ${8.5 * u}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(p.f.num, ...at(0, 50))
  line([at(0, 62), at(0, 67)], 5.2 * u, skin)   // 목
  const [hx, hy] = at(0, 75)   // 머리 — 배경을 지운 얼굴 그림(cutHead)
  if (p.f.head) g.drawImage(p.f.head, hx - 12.25 * u, hy - 13.2 * u, 24.5 * u, 26 * u)
  else { g.fillStyle = skin; oval(hx, hy, 8 * u, 9 * u); g.fill() }
  arm(fs, near, skin, holding && !up ? kb : kh)
  if (p.ice > 0) { g.fillStyle = 'rgba(170,225,255,.55)'; g.strokeStyle = '#e8f7ff'; g.lineWidth = 1.5; g.fillRect(-15 * u, -92 * u, 30 * u, 94 * u); g.strokeRect(-15 * u, -92 * u, 30 * u, 94 * u) }   // 얼음
  g.restore()
  g.globalAlpha = 1
  g.textAlign = 'center'; g.textBaseline = 'middle'
  if (p.conf > 0) { g.fillStyle = '#c58bff'; g.font = `900 ${16 * u}px system-ui, sans-serif`; g.fillText('?', x, y - 100 * u * big) }
  if (p.fall > 0) {   // 머리 위로 별이 돈다
    g.fillStyle = '#ffd23f'; g.font = `${11 * u}px system-ui, sans-serif`
    for (let i = 0; i < 3; i++) { const t = tnow * 7 + i * 2.1; g.fillText('★', x - p.dir * 73 * u * big + Math.cos(t) * 12 * u, y - 26 * u + Math.sin(t) * 4 * u) }
  } else if (p === ctl && p.team === 0) {
    const tx = x + lean * 75 * u, ty = y - 96 * u * big
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
    g.fillText(`${skillOf(ctl).name}${ctl.ult >= 1 ? ' — 준비!' : ` ${Math.floor(ctl.ult * 100)}%`}`, x0 + 5 * 46 - 10, H - 24)
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
  text(`${skillOf(p).name}!`, 620, 318, 58)
  text(skillOf(p).desc, 620, 362, 18, '#fff', T.dark)
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
      g.fillStyle = '#ffe08a'; g.font = '700 10.5px system-ui, sans-serif'; g.fillText(SKILLS[i][j].name, x + 38, y + 104)
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

let last = 0, ulShown = -1, drawDt = 0
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0)
  last = t; drawDt = dt
  update(dt); draw()
  const ul = (mode === 'play' || mode === 'dead') && ctl?.team === 0 ? Math.floor(ctl.ult * 50) / 50 : 0   // 휴대폰 궁극기 버튼 둘레 게이지
  if (ul !== ulShown) { ulShown = ul; ulBtn.style.setProperty('--g', ul); ulBtn.classList.toggle('ready', ul >= 1) }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// 얼굴 배지(둥근 그림)에서 머리만 — 바깥 고리에서 시작해 노란 배경색만 번져 지우고(flood fill), 흰 고리 · 아래 옷은 머리 모양 타원으로 잘라 낸다
function cutHead(img) {
  const c = Object.assign(document.createElement('canvas'), { width: 180, height: 180 }), x = c.getContext('2d', { willReadFrequently: true })
  x.drawImage(img, 0, 0, 180, 180)
  const d = x.getImageData(0, 0, 180, 180), px = d.data, seen = new Uint8Array(180 * 180), q = []
  const bg = k => { const i = k * 4, r = px[i], gg = px[i + 1], b = px[i + 2]; return r > 228 && gg > 165 && gg < 238 && b < 185 && r - b > 70 }
  for (let k = 0; k < 180 * 180; k++) { const r = Math.hypot(k % 180 - 90, (k / 180 | 0) - 90); if (r > 74 && r < 84 && bg(k)) { seen[k] = 1; q.push(k) } }
  while (q.length) {
    const k = q.pop(), cx = k % 180
    px[k * 4 + 3] = 0
    for (const n of [cx > 0 ? k - 1 : -1, cx < 179 ? k + 1 : -1, k - 180, k + 180]) if (n >= 0 && n < 180 * 180 && !seen[n] && bg(n)) { seen[n] = 1; q.push(n) }
  }
  x.putImageData(d, 0, 0)
  const h = Object.assign(document.createElement('canvas'), { width: 124, height: 132 }), hx = h.getContext('2d')
  hx.beginPath(); hx.ellipse(62, 66, 60, 64, 0, 0, Math.PI * 2); hx.clip()
  hx.drawImage(c, 28, 18, 124, 132, 0, 0, 124, 132)
  return h
}
/** 몸 피부색 — 양 광대의 색 가운데 밝은 쪽(수염 · 그늘을 피한다). [피부, 먼 팔다리용 어두운 색] */
function skinOf(img) {
  const c = Object.assign(document.createElement('canvas'), { width: 180, height: 180 }), x = c.getContext('2d', { willReadFrequently: true })
  x.drawImage(img, 0, 0, 180, 180)
  const got = []
  for (const cx of [66, 114]) {
    const px = x.getImageData(cx - 5, 84, 10, 12).data
    for (let i = 0; i < px.length; i += 4) { const [r, gg, b] = px.slice(i, i + 3); if (r > gg && gg > b && r - b > 25 && r > 60 && r < 252) got.push([r, gg, b]) }
  }
  if (!got.length) return [SKIN, '#8f5f3e']
  const [r, gg, b] = got.sort((m, n) => m[0] + m[1] + m[2] - n[0] - n[1] - n[2])[Math.floor(got.length * 0.65)]
  return [`rgb(${r},${gg},${b})`, `rgb(${r * 0.78 | 0},${gg * 0.78 | 0},${b * 0.78 | 0})`]
}

// 팀마다 포지션 1~5 에서 한 명씩 — 팀끼리 겹치지 않게 포지션 목록의 같은 순번
await loadData()
const kr = data.players.filter(p => p.server === 'kr')
TEAMS.forEach((T, ti) => {
  T.five = [1, 2, 3, 4, 5].map((pos, i) => {
    const list = kr.filter(p => p.pos === pos), p = list[ti % list.length], f = { name: p ? p.short || p.name : `${pos}번`, num: NUMS[i], img: null }
    if (p?.img) {
      f.img = new Image()
      f.img.onload = () => { try { f.head = cutHead(f.img); [f.skin, f.shade] = skinOf(f.img) } catch {} }   // 실패하면 동그란 머리 · 기본 피부색
      f.img.src = p.img
    }
    return f
  })
})

// 페이지 아래 「팀별 궁극기」 — 팀마다 탭, 그 팀 다섯 명의 궁극기 카드. 경기를 시작하면 고른 팀 탭으로
const tabs = document.getElementById('skill-tabs'), panel = document.getElementById('skills')
function showTab(ti) {
  for (const [i, b] of [...tabs.children].entries()) b.setAttribute('aria-selected', String(i === ti))
  panel.setAttribute('aria-label', `${TEAMS[ti].name} 궁극기`)
  panel.replaceChildren(...TEAMS[ti].five.map((f, j) => {
    const sk = SKILLS[ti][j], card = Object.assign(document.createElement('div'), { className: 'slam-skill' })
    card.innerHTML = '<img alt=""><div><small></small><b></b><p></p></div>'
    if (f.img) card.querySelector('img').src = f.img.src
    card.querySelector('small').textContent = `${POS[j + 1]} · ${f.name}`
    card.querySelector('b').textContent = sk.name
    card.querySelector('p').textContent = `${sk.desc}${sk.need ? ' (골대 가까이에서만)' : ''}`
    return card
  }))
}
tabs.replaceChildren(...TEAMS.map((T, ti) => {
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: T.name, onclick: () => showTab(ti) })
  b.setAttribute('role', 'tab'); b.style.setProperty('--team', T.color)
  return b
}))
showTab(0)
mode = 'select'
