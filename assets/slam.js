// 덩크 아케이드 — 5:5 풀코트 오락실 농구(1P vs CPU). 머리 메뉴의 「게임」.
// 90년대 오락실 농구(Super Slams) 느낌만 빌린 새 게임이다. 원작 롬 · 그림 · 팀 이름은 쓰지 않는다 — 롬은 저작물이라 이 공개 사이트에 둘 수 없다.
// 선수 얼굴은 덩크 시티 선수(data/players.json). 1P 는 오른쪽 골대를 공격한다. 온라인 1:1 · 대전 기록은 아래 「온라인 1:1」. 궁극기는 20명이 다 다르다(SKILLS) — 게이지가 차면 쓴다.
// 키: 방향키 · WASD 이동, 드리블 Z · J, 패스 X · K, 슛 C · L · 스페이스, 궁극기 V · U. 수비 때는 스틸 · 선수 바꾸기 · 블록 · 수비 궁극기. 휴대폰은 캔버스 아래 스틱 · 버튼.
// ponytail: 파울 · 자유투 · 아웃 오브 바운즈 · 하프코트 바이얼레이션 · 소리 없음 — 공은 코트 끝에서 튕겨 나온다
import { mountTop, POS, copyLink } from './app.js?v=fb02b445'
import { loadData, data, startAuth, me as who, loggedIn, h, ago } from './board.js?v=4233415a'
import { sb, api } from './auth.js?v=1fbb8e2f'
import { TEAMS, NUMS, NBA_NUM, lineup, cutHead, skinOf, SKIN } from './vipers.js?v=c92ed58c'

mountTop('/slam/')
startAuth('', () => {})   // 머리의 로그인 · 이름 줄 — 다른 페이지와 같다

const cv = document.getElementById('slam'), main = cv.getContext('2d')
let g = main   // 그리는 곳 — 미리 그려 두는 그림(bake)을 만들 때만 잠깐 바뀐다
const W = 960, H = 540

const CL = 940, CW = 500, RIM = 100                 // 코트 길이 · 너비 · 림 높이(월드 단위 = 0.1피트)
const HOOP = [{ x: 52, z: 250, shake: 0 }, { x: 888, z: 250, shake: 0 }]
const S = 1.45, TOP = 150                            // 화면 배율 · 코트 먼 쪽 줄의 화면 y
const GAME = 90, SHOT = 30, SPD = 175, GRAV = 1100, JUMP = 360
const ULT_FILL = 1 / 32                                                        // 초당 — 32초면 찬다
const SPOT = [[270, 0], [210, -150], [210, 150], [75, -100], [65, 100]]   // 공격 골대에서 [뒤로, 옆으로] — 포지션 1~5
// 포지션 1~5 능력치 — 보통(1)에 곱하는 값. dunk = 덩크가 되는 골대 거리(그 밖 140 까지는 레이업)
const STATS = [
  { note: '가장 빠르고 스틸 · 패스가 좋다. 덩크는 골대 바로 앞에서만', spd: 1.08, mid: 1, three: 1.05, dunk: 55, jump: 0.95, block: 0.7, steal: 1.4, reb: 0.8, pass: 1.2 },
  { note: '3점 · 중거리가 가장 잘 들어간다', spd: 1.04, mid: 1.12, three: 1.3, dunk: 65, jump: 1, block: 0.8, steal: 1.1, reb: 0.85, pass: 1 },
  { note: '점프가 높고 멀리서도 덩크(윈드밀 · 360 · 토마호크)', spd: 1, mid: 1.05, three: 1, dunk: 110, jump: 1.1, block: 1, steal: 1, reb: 1, pass: 1 },
  { note: '힘이 좋아 리바운드 · 골밑 덩크가 강하다', spd: 0.95, mid: 0.95, three: 0.75, dunk: 105, jump: 1.05, block: 1.2, steal: 0.85, reb: 1.3, pass: 0.95 },
  { note: '블록 · 리바운드 최고, 느리고 3점은 약하다', spd: 0.9, mid: 0.85, three: 0.5, dunk: 115, jump: 1, block: 1.5, steal: 0.7, reb: 1.5, pass: 0.9 },
]
const st = p => STATS[p.i]
const DUNK_STYLES = [['two', 'reverse'], ['two', 'reverse'], ['windmill', 'spin', 'tomahawk', 'reverse'], ['tomahawk', 'two'], ['two', 'tomahawk']]   // 포지션마다 나오는 덩크
const DUNK_MSG = { two: 'SLAM DUNK!', tomahawk: 'TOMAHAWK!', windmill: 'WINDMILL!', spin: '360 DUNK!', reverse: 'REVERSE DUNK!' }
const CARDS = [[40, 80], [490, 80], [40, 305], [490, 305]], CARD_W = 430, CARD_H = 205

let mode = 'load', pick = 0, sides = [0, 1]          // sides = [1P 팀, CPU 팀] (TEAMS 번호)
let ps = [], ball = {}, score = [0, 0], clock = GAME, shot = SHOT, offense = 0, ctls = [null, null], msg = null, wait = 0, tip = null, camX = CL / 2
let cut = null, parts = [], rings = [], shake = 0, tnow = 0   // 궁극기 컷인 · 파편 · 충격파 · 화면 흔들림 · 시계(초)
let net = null, myT = 0   // 온라인 1:1(아래 「온라인 1:1」) · 내 팀 — 혼자 · 방장은 0, 들어온 사람은 1

const rnd = Math.random
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const sm = t => t * t * (3 - 2 * t)   // 부드럽게(smoothstep) — 0~1
/** 키프레임 — [[시각, 값]…] 사이를 부드럽게 잇는다. 값은 수나 [앞, 높이] */
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [t1, b] = keys[i]
    if (t > t1) continue
    const [t0, a] = keys[i - 1], k = sm((t - t0) / (t1 - t0))
    return Array.isArray(a) ? [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k] : a + (b - a) * k
  }
  return keys[keys.length - 1][1]
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const goal = t => HOOP[t === 0 ? 1 : 0]              // 공격하는 골대
const side = t => t === 0 ? 1 : -1                   // 공격 방향 x 부호
const team = t => ps.filter(p => p.team === t)
const nearest = (list, o) => list.reduce((a, b) => dist(b, o) < dist(a, o) ? b : a)
const open = p => Math.min(...ps.filter(q => q.team !== p.team).map(q => dist(q, p)))   // 가장 가까운 수비까지
let msgN = 0
const say = (text, t = 1.1) => { msg = { text, t, t0: t, id: ++msgN } }
const guarded = o => o.act === 'air' || o.act === 'cross' || o.act === 'dunk' || o.act === 'lay' || o.act === 'hang' || o.act === 'spin' || o.sure || o.ghost > 0   // 이 동작 중에는 스틸이 안 된다
/** 월드 → 화면. 가까울수록(z 가 클수록) 크게 — [x, y, 월드 1 의 픽셀]. 온라인으로 들어온 사람(myT 1)은 좌우를 뒤집어 자기도 오른쪽으로 공격한다 */
function P(x, z, h = 0) { const u = S * (0.8 + 0.4 * z / CW); return [W / 2 + ((myT ? CL - x : x) - camX) * u, TOP + z * 0.7 - h * u, u] }

// ---------------------------------------------------------------- 입력

const keys = new Set(), joy = { x: 0, z: 0 }, input = { dr: false, pa: false, sh: false, ul: false }
const rin = { dr: false, pa: false, sh: false, ul: false }, inputs = [input, rin]   // 팀마다 이번 프레임에 누른 버튼 — 2팀은 온라인 상대(방장이 받는다)
let rax = [0, 0]   // 온라인 상대의 스틱(월드 방향)
const KEYS = { KeyZ: 'dr', KeyJ: 'dr', KeyX: 'pa', KeyK: 'pa', KeyC: 'sh', KeyL: 'sh', Space: 'sh', KeyV: 'ul', KeyU: 'ul' }

function press(k) {
  if (mode === 'wait') return
  if (mode === 'select') return net ? ready() : start()
  if (mode === 'over') return void (wait <= 0 && (mode = 'select'))   // 끝나자마자 연타로 결과를 건너뛰지 않게
  if (net && !net.host) { net.n[BTN.indexOf(k)]++; net.press = true; return }   // 들어온 사람 — 방장에게 보낸다(guestInput)
  input[k] = true
}
const setPick = i => { if (net?.ready[0]) return; pick = i; if (net?.peer) send({ t: 'pick', p: i }) }   // 온라인은 준비하면 못 바꾼다
addEventListener('keydown', e => {
  const c = e.code
  if (e.target.closest?.('input, textarea, select, button, a') || !/^(Arrow\w+|Key[WASDZXCVJKLU]|Space|Enter)$/.test(c)) return
  e.preventDefault()
  keys.add(c)
  if (e.repeat) return
  if (mode === 'select' && c.startsWith('Arrow')) {
    const col = c === 'ArrowLeft' ? 0 : c === 'ArrowRight' ? 1 : pick % 2, row = c === 'ArrowUp' ? 0 : c === 'ArrowDown' ? 1 : pick >> 1
    setPick(row * 2 + col)
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
    if (i >= 0) i === pick ? press('sh') : setPick(i)
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
// 전체 화면 — 되는 브라우저는 진짜 전체 화면(휴대폰은 가로로 돌린다), 안 되는 아이폰은 화면을 꽉 채운 칸(.full)
const stage = cv.closest('.slam-stage'), fsBtn = document.getElementById('btn-fs')
// 아이폰은 가로로 돌리면 화면을 확대해 버리고(.full 은 핀치가 막혀 못 줄인다) meta 의 maximum-scale 도 듣지 않는다 —
// 그래서 .full 을 지금 보이는 칸(visualViewport)에 놓고 확대된 만큼 줄여, 확대돼 있어도 확대 안 된 화면처럼 보이게 한다
const vv = window.visualViewport
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
  if (!net) { const others = [0, 1, 2, 3].filter(i => i !== pick); sides = [pick, others[Math.floor(rnd() * others.length)]] }   // 온라인은 두 사람이 고른 팀
  showTab(sides[myT])
  ps = [0, 1].flatMap(t => TEAMS[sides[t]].five.map((f, i) => ({
    team: t, i, f, x: 0, z: 0, h: 0, vh: 0, dir: side(t), run: 0, mv: false, act: null, t: 0,
    cool: 0, stun: 0, fall: 0, think: 0, cut: 0, block: 0, reach: 0, ult: rnd() * 0.3, boost: 0, acc: 1, cheer: 0, ch: null, wow: 0, sad: 0, throw: 0, f0: 1, vh0: 0, cdx: 0, dp: 0, hand: 1, sq: 0, kb: null, sure: false, trail: [], tt: 0,
    ghost: 0, wall: 0, slow: 0, ice: 0, big: 0, conf: 0, mirror: 0, wt: 0, poster: false, four: false, hook: false, vx: 0, vz: 0, fd: side(t), joints: {},
  })))
  score = [0, 0]; clock = GAME; shot = SHOT; offense = 0
  cut = null; parts = []; rings = []; shake = 0
  for (const k in input) input[k] = false
  const at = [[370, 250], [415, 120], [415, 380], [330, 170], [456, 250]]
  for (const p of ps) { const [x, z] = at[p.i]; p.x = p.team ? CL - x : x; p.z = p.team ? CW - z : z }
  ball = { st: 'tip', x: 470, z: 250, h: 60, owner: null, trail: [], rot: 0 }
  ctls = [0, 1].map(t => t === 0 || net ? ps.find(p => p.team === t && p.i === 4) : null)   // 사람이 움직이는 선수 — 혼자면 2팀은 CPU(null)
  for (const k in rin) rin[k] = false
  tip = { t: 0, at: [null, null], cpu: 0.28 + (rnd() - 0.5) * 0.4 }
  mode = 'tip'
  say('TIP OFF', 1.2)
}

// 점프볼 — 공이 꼭대기(0.6초)에 갈 때 맞춰 뛰어야 한다. 점프는 0.33초에 가장 높으니 0.28초쯤 누르면 딱 맞다
function tipOff(dt) {
  tip.t += dt
  ball.h = 60 + 300 * tip.t - 250 * tip.t ** 2
  for (const t of [0, 1]) if (tip.at[t] == null && (ctls[t] ? inputs[t].sh : tip.t >= tip.cpu)) { tip.at[t] = tip.t; jump(ps.find(p => p.team === t && p.i === 4)) }
  if (tip.t < 0.95) return
  const off = t => tip.at[t] == null ? 9 : Math.abs(tip.at[t] - 0.28), win = off(0) < off(1) ? 0 : 1
  offense = win
  Object.assign(ball, { st: 'pass', h: 110, to: ps.find(p => p.team === win && p.i === 0), tried: new Set(ps) })
  mode = 'play'
}

function grab(p, why) {
  const turn = p.team !== offense
  if (turn || ball.rebound) shot = SHOT
  if (turn) fresh(1 - p.team)
  offense = p.team
  Object.assign(ball, { st: 'held', owner: p, to: null, rebound: false, sure: false, oop: false, chain: null, safe: false, tg: null })
  if (p.act === 'rush') p.act = null
  p.sure = false; p.dp = 0
  p.think = 0.3 + rnd() * 0.3
  for (const t of [0, 1]) if (ctls[t]) ctls[t] = p.team === t ? p : nearest(team(t), p)   // 공을 잡은 쪽은 그 선수, 다른 쪽은 가장 가까운 선수
  if (why) say(why)
}

function made(t, pts, text, by) {
  score[t] += pts
  say(text || (pts === 3 ? '3 POINTS!' : '2 POINTS'))
  const h = goal(t)
  burst(h.x, h.z, RIM, 40, ['#ffd23f', '#ff9d00', '#fff'])
  rings.push({ x: h.x, z: h.z, t: 0, c: '255,210,63' })
  h.shake = Math.max(h.shake, 0.3)
  if (by) { by.ult = Math.min(1, by.ult + 0.3); by.cheer = 1.2; by.ch = by.act === 'hang' ? 'flex' : pts >= 3 ? 'three' : 'pump' }   // 넣은 선수는 세리머니
  for (const q of team(1 - t)) { const wow = by?.act === 'hang' && dist(q, h) < 170; q.wow = wow ? 1.1 : 0; q.sad = wow ? 0 : 1.3 }   // 덩크를 당한 골밑 수비는 놀라고, 나머지는 실망
  Object.assign(ball, { st: 'drop', owner: null, x: h.x, z: h.z, h: RIM - 4, vx: 0, vz: 0, vh: -60 })
  offense = 1 - t; fresh(t)
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
  toBall()
}

function swat(p, b) {
  Object.assign(ball, { st: 'loose', owner: null, x: p.x, z: p.z, h: p.h + 70, vx: -side(p.team) * (120 + rnd() * 120), vz: (rnd() - 0.5) * 200, vh: 60, rebound: false })
  b.ult = Math.min(1, b.ult + 0.2); b.cheer = 1.3; b.ch = 'wag'; p.sad = 1   // 막은 선수는 손가락을 흔들고(무톰보), 막힌 선수는 실망
  toBall()
  shake = Math.max(shake, 5)
  say('BLOCK!')
}

const toBall = () => { for (const t of [0, 1]) if (ctls[t]) ctls[t] = nearest(team(t), ball) }   // 사람이 움직이는 선수를 공에 가장 가까운 선수로
const end = () => { mode = 'over'; msg = null; cut = null; wait = 1.5; report() }

// ---------------------------------------------------------------- 효과

function burst(x, z, h, n, c) {
  if (net?.host && net.peer && net.fx.length < 30) net.fx.push([x, z, h, n, c])
  for (let i = 0; i < n; i++) parts.push({ x, z, h, vx: (rnd() - 0.5) * 300, vz: (rnd() - 0.5) * 200, vh: 80 + rnd() * 320, t: 0.45 + rnd() * 0.4, c: Array.isArray(c) ? c[i % c.length] : c })
}
/** 넘어뜨린다 — 밀려나는 속도(vx, vz)는 없어도 된다 */
function knock(q, vx, vz, t) {
  q.stun = q.fall = q.f0 = t
  q.act = null
  q.kb = vx || vz ? { vx, vz, t: 0.35 } : null
  burst(q.x, q.z, 4, 6, '#e3cfa3')
}

// ---------------------------------------------------------------- 궁극기 — 팀마다 포지션 1~5, 20명이 다 다르다
// 공격 궁극기는 공을 잡았을 때만, 수비 궁극기(def)는 수비 때만 쓴다. need = 골대까지 이 거리 안에서만 · reach = 공 가진 상대가 이 안에 있어야.
// cpu = CPU 가 쓰는 때 — 공격은 (골대까지, 가장 가까운 수비까지), 수비는 (공 가진 상대까지, 그 상대가 골대까지)

const close = (d, c) => c < 50, far = d => d > 200 && d < 460, drive = d => d > 150, any = () => true
const SKILLS = [
  [   // VIPERS_T — 힘으로
    { name: '앵클 브레이커', desc: '주변 수비가 넘어지고 빨라진다', cpu: close, fx: p => { down(p, 110, 1.6); p.boost = 2.5; say('ANKLE BREAKER!') } },
    { name: '딥 쓰리', desc: '어디서 던져도 꼭 들어가는 슛', cpu: far, fx: p => sureShot(p) },
    { name: '체이스 다운', def: true, desc: '빨라져서 쫓아가고, 5초 동안 뛰어서 막으면 두 배 거리에서도 꼭 막는다', cpu: (d, g) => g < 320, fx: p => { p.wall = 5; p.boost = 2.5; say('CHASE DOWN!') } },
    { name: '불도저', def: true, reach: 320, desc: '공 가진 상대에게 돌진해 둘레까지 밀쳐 넘어뜨리고 공을 뺏는다', cpu: d => d < 260, fx: p => { Object.assign(p, { act: 'rush', t: 0 }); say('BULLDOZER!') } },
    { name: '메가 슬램', desc: '골밑에서 충격파 덩크', need: 300, cpu: d => d < 280, fx: p => { p.sure = true; dunkFrom(p, true) } },
  ],
  [   // VIPERS_N — 기술로
    { name: '팬텀 드리블', desc: '4초 동안 뺏기지 않고 수비를 통과한다', cpu: close, fx: p => { p.ghost = 4; say('PHANTOM!') } },
    { name: '픽포켓', def: true, reach: 320, desc: '공 가진 상대 앞으로 순간이동해 공을 낚아챈다 — 뺏긴 상대는 잠깐 멈칫한다', cpu: d => d < 280, fx: p => pickpocket(p) },
    { name: '앨리웁 쇼', desc: '골밑 동료에게 띄워 주면 그대로 덩크', cpu: any, fx: p => oop(p) },
    { name: '회오리 스핀', def: true, reach: 150, desc: '돌면서 둘레 상대를 날려 버린다 — 휘말린 상대는 공을 놓친다', cpu: d => d < 110, fx: p => { Object.assign(p, { act: 'spin', t: 0 }); fumbleNear(p, 150); push(p, p, 140, 300, 1.1); say('TORNADO!') } },
    { name: '스카이 훅', desc: '아무도 못 막는 높은 훅슛', need: 330, cpu: d => d < 300, fx: p => { p.hook = true; sureShot(p) } },
  ],
  [   // VIPERS_A — 얼음 · 시간
    { name: '아이스 타임', def: true, reach: 240, desc: '둘레 상대를 2초 동안 얼린다 — 얼어붙은 상대의 공은 손만 대도 뺏는다', cpu: d => d < 200, fx: p => { freeze(p, 240, 2.2); rings.push({ x: p.x, z: p.z, t: 0, c: '170,225,255' }); say('FREEZE!') } },
    { name: '포 포인트', desc: '3점 밖에서 꼭 들어가는 4점 슛', cpu: d => d > 240 && d < 460, fx: p => { p.four = true; sureShot(p) } },
    { name: '블링크 덩크', desc: '골대 앞으로 순간이동해 덩크', cpu: drive, fx: p => blink(p) },
    { name: '슬로우 필드', def: true, desc: '5초 동안 상대 모두가 느려진다', cpu: (d, g) => g < 420, fx: p => { for (const q of opp(p)) q.slow = 5; rings.push({ x: p.x, z: p.z, t: 0, c: '120,190,255', big: true }); say('SLOW!') } },
    { name: '자이언트', desc: '6초 동안 커져서 먼 데서도 덩크', cpu: any, fx: p => { p.big = 6; shake = Math.max(shake, 6); say('GIANT!') } },
  ],
  [   // VIPERS_B — 그림자
    { name: '미러 이미지', desc: '분신으로 상대를 3초 동안 헷갈리게 한다', cpu: close, fx: p => { for (const q of opp(p)) q.conf = 3.5; p.mirror = 3.5; p.boost = 2; say('WHO?!') } },
    { name: '체인 패스', desc: '동료 넷을 거친 공을 마지막이 꼭 넣는다', cpu: far, fx: p => chain(p) },
    { name: '포스터라이저', desc: '길을 막는 수비를 넘어뜨리며 덩크', cpu: drive, fx: p => Object.assign(p, { act: 'air', t: 0, sure: true, poster: true }) },
    { name: '블랙홀', def: true, desc: '상대를 골대에서 먼 한 점으로 빨아들인다 — 공 가진 상대는 공을 놓친다', cpu: (d, g) => g < 300, fx: p => blackhole(p) },
    { name: '어스퀘이크', def: true, desc: '땅을 내리쳐 둘레 상대를 모두 넘어뜨린다 — 공 가진 상대는 공을 놓친다', cpu: d => d < 300, fx: p => { fumbleNear(p, 420); down(p, 420, 1.5); p.sq = 0.3; shake = Math.max(shake, 22); rings.push({ x: p.x, z: p.z, t: 0, c: '220,160,90', big: true }); say('EARTHQUAKE!') } },
  ],
]
const skillOf = p => SKILLS[sides[p.team]][p.i]
const opp = p => team(1 - p.team)

function down(p, r, t) { for (const q of opp(p)) if (dist(q, p) < r) knock(q, 0, 0, t) }
function push(from, p, r, f, t) { for (const q of opp(p)) { const d = dist(q, from); if (d < r) knock(q, (q.x - from.x) / (d || 1) * f, (q.z - from.z) / (d || 1) * f, t) } }
function freeze(p, r, t) { for (const q of opp(p)) if (dist(q, p) < r) Object.assign(q, { stun: t, ice: t, act: null, mv: false }) }
function sureShot(p) { p.sure = true; shoot(p) }
/** 공을 놓친다 — 손에서 튀어 나와 굴러간다(놓친 사람은 잠깐 못 줍는다) */
function fumble(o) {
  const [x, z, h] = hand(o)
  Object.assign(ball, { st: 'loose', owner: null, x, z, h, vx: (rnd() - 0.5) * 180, vz: (rnd() - 0.5) * 180, vh: 170, rebound: false, sure: false })
  o.cool = 0.6; o.sure = false
  toBall()
}
const fumbleNear = (p, r) => { const o = ball.owner; if (o && o.team !== p.team && dist(o, p) < r) fumble(o) }
function oop(p) {   // 골대에 가장 가까운 동료에게 높이 띄운다 — 가로챌 수 없다
  pass(p, nearest(team(p.team).filter(m => m !== p), goal(p.team)))
  Object.assign(ball, { oop: 'ult', safe: true })
  say('ALLEY-OOP!')
}
function chain(p) {   // 동료 넷을 아무 순서로 — 빠르고 가로챌 수 없다
  const rest = team(p.team).filter(m => m !== p).sort(() => rnd() - 0.5)
  pass(p, rest.shift())
  Object.assign(ball, { chain: rest, safe: true, oop: false })
  say('CHAIN PASS!')
}
function pickpocket(p) {   // 공 가진 상대 앞(그 상대가 가는 골대 쪽)으로 순간이동해 낚아챈다
  const o = ball.owner
  if (!o || o.team === p.team || o.sure || o.ghost > 0) return
  burst(p.x, p.z, 40, 14, ['#7fffc8', '#fff'])
  Object.assign(p, { x: o.x + side(o.team) * 26, z: o.z, act: null })
  burst(p.x, p.z, 40, 14, ['#7fffc8', '#fff'])
  o.stun = 0.8
  grab(p, 'PICKPOCKET!')
}
function blink(p) {
  const h = goal(p.team)
  burst(p.x, p.z, 40, 18, ['#7ff3ff', '#fff'])
  Object.assign(p, { x: h.x - side(p.team) * 50, z: h.z + 10, sure: true })
  burst(p.x, p.z, 40, 18, ['#7ff3ff', '#fff'])
  dunkFrom(p, false)
}
function blackhole(p) {   // 상대를 그 골대에서 먼 한 점(공 가진 사람 뒤쪽)으로 — 골밑이 빈다. 공 가진 상대는 공을 놓친다
  const o = 1 - p.team, c = ball.owner?.team === o ? ball.owner : nearest(opp(p), goal(o)), at = { x: clamp(c.x - side(o) * 260, 30, CL - 30), z: 250 }
  fumbleNear(p, Infinity)
  for (const q of opp(p)) { const d = dist(q, at); if (d > 20) knock(q, (at.x - q.x) / d * Math.min(800, d * 2.6), (at.z - q.z) / d * Math.min(800, d * 2.6), 1.4) }
  for (const q of opp(p)) q.fall = 0   // 넘어지지 않고 빨려 가서 멍하니 선다
  rings.push({ x: at.x, z: at.z, t: 0, c: '170,90,255', in: true, big: true })
  say('BLACK HOLE!')
}

// ---------------------------------------------------------------- 동작

function jump(p) { if (p.h === 0 && !p.act) p.vh = JUMP * st(p).jump }
const canMove = p => !p.act && p.h === 0 && p.stun <= 0 && !p.kb
const speed = p => SPD * (ball.owner === p ? 0.85 : 1)   // 공을 들면 조금 느리다
// 수비 가속 — 수비로 바뀔 때마다 선수마다 한 번(acc). 1초 동안 빨라진다
const fresh = t => { for (const q of team(t)) q.acc = 1 }
function accel(p) { p.acc = 0; p.boost = Math.max(p.boost, 1); burst(p.x, p.z, 4, 10, '#e3cfa3') }

/** 방향(dx, dz — 길이 1 이하)으로 달린다. 속도는 바로 붙지 않고 0.2초쯤에 걸쳐 붙고 줄어든다 — 출발 · 멈춤 · 방향 전환이 부드럽다 */
function step(p, dx, dz, spd, dt) {
  spd *= st(p).spd * (p.boost > 0 ? 1.45 : 1) * (p.ghost > 0 ? 1.3 : 1) * (p.big > 0 ? 1.15 : 1) * (p.slow > 0 ? 0.45 : 1)   // 궁극기 효과
  const k = 1 - Math.exp(-dt * 11)
  p.vx += (dx * spd - p.vx) * k; p.vz += (dz * spd * 0.85 - p.vz) * k
  p.x += p.vx * dt; p.z += p.vz * dt
  p.mv = Math.hypot(p.vx, p.vz) > 20
  if (Math.abs(p.vx) > 45) p.dir = Math.sign(p.vx)   // 실제로 그쪽으로 움직일 때만 돈다 — 제자리에서 방향이 떨리지 않게
}
function toward(p, tx, tz, spd, dt) {   // 가까워질수록 천천히 — 도착하면 선다
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), k = d < 4 ? 0 : Math.min(1, d / 40) / d
  step(p, dx * k, dz * k, spd, dt)
}
const stop = p => { p.vx = p.vz = 0; p.mv = false }

function pass(p, m) {
  const h = goal(p.team), dm = dist(m, h), lob = dm < 170 && (m.cut > 0 || dm < 120) && dm < dist(p, h) - 40   // 골밑으로 들어가는 동료 — 높이 띄우는 앨리웁
  Object.assign(ball, { st: 'pass', owner: null, to: m, x: p.x + p.dir * 12, z: p.z, h: 40, tried: new Set([p]), oop: lob && 'lob', chain: null, safe: false, sp: 560 * st(p).pass })
  p.cool = 0.25; p.throw = 0.22   // 두 손으로 밀어 내는 몸짓
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

// 덩크 — 땅에서 뛰면 DUNK_G 초 웅크렸다 뛴다. 높이 솟았다가 내려오며 림에 꽂는다(그때 몸 높이 DUNK_H — 손이 림에 온다). 넣으면 잠깐 림에 매달린다(hang)
const DUNK_G = 0.07, DUNK_H = 12
const du = p => clamp((p.t - DUNK_G) / p.dur, 0, 1)   // 덩크가 얼마나 지났나(0~1)
function dunkFrom(p, mega) {   // 덩크 종류는 포지션마다 — 윈드밀 · 360 은 조금 더 오래 난다
  const list = DUNK_STYLES[p.i], style = mega ? 'two' : list[Math.floor(rnd() * list.length)], long = style === 'windmill' || style === 'spin'
  Object.assign(p, { act: 'dunk', t: p.h > 0 ? DUNK_G : 0, from: { x: p.x, z: p.z, h: p.h }, dur: mega ? 0.6 : long ? 0.5 : 0.42, peak: mega ? 120 : long ? 92 : 84, vx: 0, vz: 0, style, mega })
  p.dir = Math.sign(goal(p.team).x - p.x) || p.dir
  if (style === 'reverse') p.dir = -p.dir   // 리버스 — 골대를 등지고 머리 너머로
}
function shoot(p) {
  if (p.act || p.h > 0) return
  const h = goal(p.team), d = dist(p, h)
  p.dir = Math.sign(h.x - p.x) || p.dir
  p.clutch = p.decided = false
  if (d < (p.big > 0 ? 200 : st(p).dunk)) dunkFrom(p, false)   // 덩크 거리는 포지션마다(자이언트는 멀리서도)
  else if (d < 140 && !p.sure) Object.assign(p, { act: 'lay', t: 0, from: { x: p.x, z: p.z }, dur: 0.42, vx: 0, vz: 0 })   // 그 안쪽은 레이업
  else Object.assign(p, { act: 'shot', t: 0, rel: false, vh: 0, vh0: JUMP * st(p).jump * (p.sure ? 1.15 : 1), vx: 0, vz: 0 })   // SHOT_DIP 초 무릎을 굽혔다 뛴다
  // 가까운 수비는 조금 늦게 뛰어 막으러 온다(1P 가 움직이는 선수는 직접 뛴다)
  if (!p.sure) for (const q of ps) if (q.team !== p.team && ctls[q.team] !== q && (q.wall > 0 ? dist(q, p) < 120 : dist(q, p) < 60 && rnd() < 0.75)) q.block = 0.05 + rnd() * 0.22
}
const blocker = (p, r) => ps.find(q => q.team !== p.team && q.h > 22 && dist(q, p) < r * (q.wall > 0 ? 2 : 1))   // 체이스 다운(wall)은 두 배 거리에서 꼭 막는다
const SHOT_DIP = 0.06

function letGo(p) {   // 점프슛을 놓는 순간
  const h = goal(p.team), d = dist(p, h), sure = p.sure, { four, hook, clutch } = p
  p.sure = p.four = p.hook = p.clutch = false
  if (!sure) { const b = blocker(p, 40); if (b && (b.wall > 0 || rnd() < 0.45 * st(b).block * (clutch ? 0.35 : 1))) return swat(p, b) }   // 더블 클러치는 먼저 뛴 수비를 피한다
  const c = open(p), three = d > 237 || Math.abs(p.z - h.z) > 220
  const pr = Math.min(0.92, (d < 160 ? 0.62 : d < 237 ? 0.5 : d < 300 ? 0.38 : 0.12) * (c < 30 ? 0.55 : c < 55 ? 0.8 : 1) * (three ? st(p).three : st(p).mid) * (clutch ? 0.85 : 1))
  const [bx, bz, bh] = hand(p)
  Object.assign(ball, {
    st: 'shot', owner: null, x: bx, z: bz, h: bh, t: 0, T: 0.7 + d / 900, make: sure || rnd() < pr, pts: three ? (four ? 4 : 3) : 2, team: p.team, hoop: h,
    arc: hook ? 150 + d * 0.4 : 60 + d * 0.3, sure, by: p, msg: four && three ? '4 POINTS!' : hook ? 'SKY HOOK!' : sure && three ? 'DEEP THREE!' : clutch ? 'DOUBLE CLUTCH!' : '',
  })
  Object.assign(ball, { sx: ball.x, sz: ball.z, sh: ball.h })
}
function layIn(p) {   // 레이업 — 림 바로 앞에서 살짝 올려 놓는다
  const h = goal(p.team), clutch = p.clutch, c = open(p), [x, z, bh] = hand(p)
  p.clutch = false
  const b = blocker(p, 38)
  if (b && (b.wall > 0 || rnd() < 0.35 * st(b).block * (clutch ? 0.35 : 1))) return swat(p, b)
  const pr = 0.8 * st(p).mid * (c < 25 ? 0.75 : c < 45 ? 0.9 : 1) * (clutch ? 0.92 : 1)
  Object.assign(ball, { st: 'shot', owner: null, x, z, h: bh, sx: x, sz: z, sh: bh, t: 0, T: 0.32, make: rnd() < pr, pts: 2, team: p.team, hoop: h, arc: 16, sure: false, by: p, msg: clutch ? 'DOUBLE CLUTCH!' : '' })
}
/** 더블 클러치 — 공중에서 슛을 한 번 더: 공을 내렸다 반대 손으로 다시 올려 늦게 놓는다 */
function clutch(p) {
  if (p.clutch || p.sure || p.rel) return
  p.clutch = true; p.hand = -p.hand
  if (p.act === 'lay') p.dur += 0.16
}
function slam(p) {    // 덩크가 림에 닿는 순간
  const sure = p.sure || p.big > 0, mega = p.mega, lob = p.lob, h = goal(p.team)
  p.sure = p.poster = p.lob = false
  if (!sure) { const b = blocker(p, 34); if (b && (b.wall > 0 || rnd() < 0.3 * st(b).block)) { p.act = 'land'; return swat(p, b) } }   // 막히면 매달리지 않고 떨어진다
  h.shake = 0.6
  shake = Math.max(shake, mega ? 18 : 8)
  if (mega) {   // 충격파 — 골밑 상대가 다 넘어진다
    rings.push({ x: h.x, z: h.z, t: 0 })
    for (const q of team(1 - p.team)) { const d = dist(q, h); if (d < 170) knock(q, (q.x - h.x) / (d || 1) * 300, (q.z - h.z) / (d || 1) * 300, 1.3) }
  }
  if (sure || rnd() < (lob ? 0.85 : 0.9)) return made(p.team, 2, mega ? 'MEGA SLAM!' : lob ? 'ALLEY-OOP!' : DUNK_MSG[p.style], p)
  miss(h)
}

function steal(p, o) {
  if (p.cool > 0) return
  p.cool = 0.5; p.reach = 0.2
  if (!guarded(o) && (o.ice > 0 || rnd() < (ctls[p.team] ? 0.32 : 0.2) * st(p).steal)) { grab(p, 'STEAL!'); p.ult = Math.min(1, p.ult + 0.2) }   // 얼어붙은 상대는 손만 대도
  else p.stun = 0.3
}

// 궁극기 — 게이지가 차 있고 때가 맞으면 컷인(느린 화면) 뒤에 fire(). 공격 궁극기는 공을 잡았을 때, 수비 궁극기는 수비 때만
const ultReady = p => p.ult >= 1 && (skillOf(p).def ? offense !== p.team : ball.owner === p)
function ultimate(p) {
  if (p.ult < 1 || cut || p.act || p.h > 0 || p.stun > 0) return false
  const sk = skillOf(p), o = ball.owner, no = m => { if (ctls[p.team] === p) say(m, 0.8); return false }
  if (sk.def) {
    if (offense === p.team) return no('수비 궁극기 — 수비 때 써요')
    if (sk.reach && !(o && o.team !== p.team && !o.sure && dist(p, o) < sk.reach)) return no('공 가진 상대 가까이에서 써요')
  } else {
    if (o !== p) return no(offense === p.team ? '공을 잡고 써요' : '공격 궁극기 — 공격 때 써요')
    if (sk.need && dist(p, goal(p.team)) > sk.need) return no('골대 가까이에서 써요')
  }
  p.ult = 0
  cut = { p, off: !sk.def, t: 0 }
  shake = Math.max(shake, 4)
  return true
}
function fire(p, off) {
  flash = 0.22
  if (off ? ball.owner === p : offense !== p.team) skillOf(p).fx(p)   // 그새 공을 뺏겼거나 공격으로 바뀌었으면 그냥 지나간다
}

// 몸 — 쿨타임 · 게이지 · 점프 · 동작. 동작 중 공을 뺏겼으면(ball.owner 가 아니면) 놓지 않는다
function body(p, dt) {
  for (const k of ['cool', 'stun', 'fall', 'boost', 'cdx', 'sq', 'reach', 'ghost', 'wall', 'slow', 'ice', 'big', 'conf', 'mirror', 'cheer', 'wow', 'sad', 'throw']) p[k] = Math.max(0, p[k] - dt)
  p.ult = Math.min(1, p.ult + dt * ULT_FILL * (ctls[p.team] ? 1 : 0.8))   // CPU 는 조금 느리게 찬다
  look(p, dt)
  if (p.kb) { p.x += p.kb.vx * dt; p.z += p.kb.vz * dt; if ((p.kb.t -= dt) <= 0) p.kb = null }
  const h = goal(p.team)
  if (p.act === 'cross') {
    p.x += p.cx * dt; p.z += p.cz * dt
    if ((p.t += dt) >= 0.26) p.act = null
    return
  }
  if (p.act === 'spin') { if ((p.t += dt) >= 0.45) p.act = null; return }
  if (p.act === 'air') {   // 에어 워크 · 앨리웁 · 포스터라이저 — 골대 앞까지 날아간다
    const d = dist(p, h), v = 620 * dt
    if (p.poster) for (const q of team(1 - p.team)) if (!q.fall && dist(q, p) < 36) knock(q, 0, (q.z > p.z ? 1 : -1) * 320, 1.3)   // 길을 막는 수비는 옆으로 쓰러진다
    p.h += (34 - p.h) * Math.min(1, dt * 5)   // 떠올라 날아간다
    if (d < 80) return dunkFrom(p, false)
    p.vx = (h.x - p.x) / d * 620; p.vz = (h.z - p.z) / d * 620
    p.x += p.vx * dt; p.z += p.vz * dt; p.dir = Math.sign(p.vx) || p.dir
    return
  }
  if (p.act === 'rush') {  // 불도저 — 공을 끝까지 쫓아 닿으면 둘레까지 밀쳐 넘어뜨리고 뺏는다. 패스하면 날아가는 공을, 받으면 받은 사람을
    const o = ball.owner, tg = o || ball, d = dist(p, tg)
    if (o ? o.team === p.team || o.sure || o.ghost > 0 : ball.st !== 'pass' && ball.st !== 'loose' || ball.safe) return void (p.act = null)
    if ((p.t += dt) > 1.5) return void (p.act = null)
    if (d < 22) { p.act = null; push(p, p, 110, 320, 1.2); shake = Math.max(shake, 10); return grab(p, 'STEAL!') }
    p.vx = (tg.x - p.x) / d * 700; p.vz = (tg.z - p.z) / d * 700
    p.x += p.vx * dt; p.z += p.vz * dt; p.dir = Math.sign(tg.x - p.x) || p.dir
    return
  }
  if (p.act === 'lay') {   // 레이업 — 림 앞까지 떠 가서 끝에 놓는다
    p.t += dt
    const u = Math.min(1, p.t / p.dur), k = Math.min(1, u * 1.3), tx = h.x - side(p.team) * 34
    p.x = p.from.x + (tx - p.from.x) * k; p.z = p.from.z + (h.z - p.from.z) * k
    p.h = 50 * Math.sin(Math.min(1, u) * Math.PI / 2)
    airMind(p)
    if (u >= 1) { if (ball.owner === p) layIn(p); p.act = 'land'; p.vh = 0 }   // 놓는 순간의 손(공) 자리에서 — 'land' 로 바꾸기 전에
    return
  }
  if (p.act === 'dunk') {
    p.t += dt
    const u = du(p)
    p.x = p.from.x + (h.x - side(p.team) * 16 - p.from.x) * u; p.z = p.from.z + (h.z - p.from.z) * u
    p.h = p.from.h * (1 - u) + DUNK_H * u + p.peak * Math.sin(u * Math.PI)
    if (u >= 1) { if (ball.owner === p) { Object.assign(p, { act: 'hang', t: 0, vh: 0 }); slam(p) } else Object.assign(p, { act: 'land', vh: 0 }) }
    return
  }
  if (p.act === 'hang') { if ((p.t += dt) >= 0.24) Object.assign(p, { act: 'land', vh: 0 }); return }   // 림에 매달렸다가 내려온다
  if (p.act === 'shot') {
    p.t += dt
    if (p.vh0 && p.t >= SHOT_DIP) { p.vh = p.vh0; p.vh0 = 0 }
    airMind(p)
    if (!p.rel && p.t >= (p.clutch ? 0.5 : 0.3) + SHOT_DIP) { p.rel = true; if (ball.owner === p) letGo(p) }
  }
  if (p.h > 0 || p.vh > 0) {
    p.vh -= GRAV * dt; p.h += p.vh * dt
    if (p.h <= 0) {
      if (p.act === 'land') burst(p.x, p.z, 2, 8, '#e3cfa3')
      p.h = 0; p.vh = 0; p.sq = 0.14
      if (p.act) p.act = null
    }
  }
}

/** 보이기만 하는 것 — 체이스 다운 불꽃 · 드리블 박자 · 몸 돌리기 · 잔상. 온라인으로 들어온 사람 화면은 이것만 돌린다(watch) */
function look(p, dt) {
  if (p.wall > 0 && rnd() < dt * 30) parts.push({ x: p.x + (rnd() - 0.5) * 16, z: p.z, h: 30 + rnd() * 50, vx: 0, vz: 0, vh: 260, t: 0.3, c: rnd() < 0.5 ? '#ff7a1a' : '#ffd23f' })   // 체이스 다운 — 불꽃
  const a = Math.hypot(p.vx, p.vz) / SPD
  if (ball.owner === p) p.dp += dt * (7 + 4 * Math.min(1, a))
  if (p.act === 'air' || p.act === 'rush') p.run += dt * 3.4   // 걸음 박자(바퀴) — 날아가는 동안에도 다리는 달린다
  else if (p.h === 0 && a > 0.05) p.run += dt * (1.5 + 1.3 * Math.min(a, 1.5)) * (p.vx * p.dir < -30 ? -1 : 1)   // 빠를수록 잦다. 뒷걸음은 거꾸로
  p.fd += (p.dir - p.fd) * (1 - Math.exp(-dt * 16))   // 몸 돌리기 — 방향이 바뀌면 0.1초쯤에 걸쳐 돈다
  if (p.act === 'cross' || p.act === 'air' || p.act === 'rush' || p.boost > 0 || p.kb) {   // 잔상
    if ((p.tt -= dt) <= 0) { p.tt = 0.035; p.trail.unshift({ x: p.x, z: p.z, h: p.h }); p.trail.length = Math.min(p.trail.length, 5) }
  } else p.trail.pop()
}

// CPU — 슛 · 레이업으로 떴는데 블록이 오면 더블 클러치나 점프 패스
function airMind(p) {
  if (ctls[p.team] || p.decided || p.t < 0.12 || ball.owner !== p || p.sure) return
  p.decided = true
  if (!blocker(p, 50)) return
  if (rnd() < 0.45) clutch(p)
  else if (rnd() < 0.4) { pass(p, mateFor(p)); say('JUMP PASS!', 0.7) }
}

// ---------------------------------------------------------------- 사람 · CPU

/** 사람이 움직이는 선수 p — [x, z] = 스틱(월드 방향), input = 이번 프레임에 누른 버튼 */
function user(p, [x, z], input, dt) {
  const ax = p.conf > 0 ? -x : x, az = p.conf > 0 ? -z : z   // 미러 이미지에 걸리면 방향이 뒤집힌다
  if (canMove(p)) step(p, ax, az, speed(p), dt)
  else if (!p.act) stop(p)   // 대시 · 덩크 같은 동작은 body() 가 속도를 맡는다
  if (cut || input.ul && ultimate(p)) return
  if (ball.owner === p && (p.act === 'shot' || p.act === 'lay')) {   // 공중 — 슛을 한 번 더 누르면 더블 클러치, 패스면 점프 패스
    if (input.sh) clutch(p)
    else if (input.pa) { pass(p, mateFor(p, ax, az)); say('JUMP PASS!', 0.7) }
    return
  }
  if (ball.owner === p) {
    if (p.stun > 0) return   // 얼었거나 휘청이면 공을 다루지 못한다
    if (input.dr) crossover(p, ax, az)
    else if (input.pa) pass(p, mateFor(p, ax, az))
    else if (input.sh) shoot(p)
    return
  }
  if (!p.act && !(p.stun > 0)) {   // 동작 중 · 휘청일 때는 점프 · 스틸이 안 된다
    if (input.sh) jump(p)
    if (input.dr) { const o = ball.owner; if (o && o.team !== p.team && dist(p, o) < 34) steal(p, o); else if (p.team !== offense && p.acc && canMove(p)) accel(p); else p.reach = 0.2 }   // 스틸이 안 닿으면 가속
  }
  if (input.pa) ctls[p.team] = nearest(team(p.team), ball)   // 공에 가장 가까운 선수로 바꾼다
}

function ai(p, dt) {
  if (p.block > 0 && (p.block -= dt) <= 0) jump(p)
  if (!canMove(p)) { if (!p.act) stop(p); return }
  if (ball.owner === p) return handle(p, dt)
  if (p.conf > 0) {   // 미러 이미지 — 분신을 쫓아 엉뚱한 데로 간다
    if ((p.wt -= dt) <= 0) { p.wt = 0.7; p.wx = rnd() * CL; p.wz = rnd() * CW }
    return toward(p, p.wx, p.wz, SPD * 0.8, dt)
  }
  const mine = team(p.team).sort((a, b) => dist(a, ball) / st(a).reb - dist(b, ball) / st(b).reb)   // 리바운드 좋은 선수가 먼저 쫓는다
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
    if (ball.owner?.team === p.team && rnd() < dt * (p.i >= 2 ? 0.25 : 0.12)) { p.cut = 1.3; p.cz = (rnd() - 0.5) * 80 }   // 포워드 · 센터가 더 자주 파고든다(앨리웁)
    return toward(p, h.x - s * back, h.z + lat, SPD * 0.9, dt)
  }
  // 대인 수비 — 자기 사람과 골대 사이. 공 가진 사람은 붙어서 가끔 스틸, CPU 는 게이지가 차면 수비 궁극기
  const man = ps.find(q => q.team !== p.team && q.i === p.i), h = goal(man.team), d = dist(man, h) || 1, gap = man === ball.owner ? 24 : 42
  toward(p, man.x + (h.x - man.x) / d * gap, man.z + (h.z - man.z) / d * gap, SPD * 0.93, dt)
  if (Math.abs(ball.x - p.x) > 14) p.dir = Math.sign(ball.x - p.x)   // 공을 본다 — 공이 바로 앞이면 그대로(좌우로 떨지 않게)
  const o = ball.owner, sk = skillOf(p)   // CPU 팀의 수비 궁극기 — 그 기술에 맞는 때(cpu)에
  if (!ctls[p.team] && sk.def && p.ult >= 1 && o && o.team !== p.team && sk.cpu(dist(p, o), dist(o, goal(o.team))) && rnd() < dt * 0.7 && ultimate(p)) return
  if (man !== o) return
  if (p.acc && dist(p, man) > 50 && dist(man, h) < dist(p, h)) return accel(p)   // 제쳐졌으면 가속으로 따라간다
  if (dist(p, man) < 32 && rnd() < dt * 0.4) steal(p, man)
}

// CPU 의 공 가진 선수 — 골대로 몰고 가다 비면 쏘고, 막히면 제치거나 패스. 게이지가 차면 포지션에 맞는 자리에서 궁극기
function handle(p, dt) {
  const h = goal(p.team), s = side(p.team), d = dist(p, h), c = open(p)
  if (p.wz == null || rnd() < dt * 0.5) p.wz = (rnd() - 0.5) * 220
  toward(p, h.x - s * (d > 300 ? 120 : 40), h.z + (d > 200 ? p.wz : p.wz * 0.3), speed(p) * 0.93, dt)
  if ((p.think -= dt) > 0) return
  p.think = 0.3 + rnd() * 0.4
  if (p.ult >= 1 && !skillOf(p).def && skillOf(p).cpu(d, c) && rnd() < 0.6 && ultimate(p)) return
  if (c < 30 && p.cdx <= 0 && rnd() < 0.35) return crossover(p, 0, 0)
  if (d < 140 || shot < 2.5 || d < 300 && c > 55 && rnd() < (d < 237 ? 0.5 * st(p).mid : 0.3 * st(p).three)) shoot(p)
  else if (rnd() < (c < 28 ? 0.5 : 0.18) * st(p).pass) pass(p, mateFor(p))
}

// ---------------------------------------------------------------- 공

/** 손에 든 공(= 앞 손) 자리 — 몸 기준 [앞으로, 위로]. 점프슛은 dip 에서 공을 내렸다 이마 위(셋 포인트)로, 레이업은 림으로 뻗고,
 *  덩크는 종류마다 다른 길로 들어 올렸다가 림에 내리꽂는다(끝 = 림 높이). 더블 클러치는 내렸다 다시 올린다 */
const SHOT_HAND = [[0, [10, 50]], [0.06, [10, 45]], [0.2, [7, 80]], [0.32, [6, 92]], [0.4, [15, 98]]]
const LAY_HAND = [[0, [9, 46]], [0.45, [12, 70]], [1, [17, 96]]]
const DUNK_HAND = {
  two: [[0, [10, 52]], [0.5, [5, 98]], [0.82, [7, 102]], [1, [14, 86]]],
  spin: [[0, [10, 52]], [0.4, [4, 96]], [0.85, [6, 100]], [1, [14, 86]]],
  tomahawk: [[0, [10, 54]], [0.55, [-13, 96]], [0.8, [-6, 104]], [1, [16, 86]]],   // 머리 뒤로 젖혔다 내리꽂는다
  reverse: [[0, [10, 52]], [0.5, [4, 100]], [0.85, [-4, 102]], [1, [-14, 86]]],   // 등진 채 머리 너머 뒤로
}
function pose(p) {
  const dip = s => p.clutch ? Math.sin(clamp(s, 0, 1) * Math.PI) : 0
  if (p.act === 'shot') { const k = dip((p.t - 0.22) / 0.34), [fw, up] = kf(p.t, SHOT_HAND); return [fw + 8 * k, up - 40 * k] }
  if (p.act === 'lay') { const u = Math.min(1, p.t / p.dur), k = dip((u - 0.3) / 0.55), [fw, up] = kf(u, LAY_HAND); return [fw, up - 36 * k] }
  if (p.act === 'hang') return [p.style === 'reverse' ? -14 : 14, 86]
  const u = du(p)
  if (p.style === 'windmill') { const th = 0.5 - sm(u) * (0.5 + 1.27 * Math.PI); return [2 + Math.sin(th) * 24, 72 - Math.cos(th) * 24] }   // 앞 아래 → 뒤 → 머리 위 → 앞으로 한 바퀴
  return kf(u, DUNK_HAND[p.style] || DUNK_HAND.two)
}
function hand(p) {
  if (p.act === 'shot' || p.act === 'dunk' || p.act === 'lay' || p.act === 'hang') { const [fw, up] = pose(p); return [p.x + p.fd * fw, p.z, p.h + up + 4] }
  if (cut?.p === p && !p.act) return [p.x + p.fd * 9, p.z, p.h + 88]   // 궁극기 — 공을 머리 위로 치켜든다
  if (p.act === 'air') return [p.x + p.dir * 12, p.z, p.h + 50]   // 가슴 앞에 두 손으로
  if (p.act === 'cross') return [p.x + p.fd * 10, p.z + p.hand * (16 * Math.min(1, p.t / 0.26) - 8), 6]   // 낮게 몸 앞을 가로지른다
  return [p.x + p.fd * 12, p.z + p.hand * 5, 2 + 32 * Math.abs(Math.cos(p.dp))]   // 몸이 도는 만큼 공도 앞으로 돌아온다
}

/** view = 온라인으로 들어온 사람 화면 — 공을 다음 장면까지 움직이기만 한다(잡기 · 가로채기 · 득점은 방장이 정해 보낸다) */
function moveBall(dt, view) {
  ball.rot += dt * (ball.st === 'held' ? 5 : 14)
  if (ball.st === 'shot' || ball.st === 'pass' || ball.st === 'loose' && ball.h > 8) { ball.trail.unshift({ x: ball.x, z: ball.z, h: ball.h }); ball.trail.length = Math.min(ball.trail.length, 7) }
  else ball.trail.length = 0
  if (ball.st === 'held') {
    if (ball.owner) {   // 손 자리가 확 바뀌면(잡는 순간 · 드리블 → 슛) 그 차이(off)를 남겼다가 빨리 줄여 공이 부드럽게 손으로 간다
      const t = hand(ball.owner), q = ball.tg, o = ball.off ||= [0, 0, 0], k = Math.exp(-dt * 16)
      if (!q) { o[0] = ball.x - t[0]; o[1] = ball.z - t[1]; o[2] = ball.h - t[2] }
      else if (Math.hypot(t[0] - q[0], t[1] - q[1], t[2] - q[2]) > 18) for (let i = 0; i < 3; i++) o[i] += q[i] - t[i]
      for (let i = 0; i < 3; i++) o[i] *= k
      ball.tg = t; ball.x = t[0] + o[0]; ball.z = t[1] + o[1]; ball.h = t[2] + o[2]
    }
  } else if (ball.st === 'pass') {   // 받는 사람을 따라간다. 지나가는 길의 상대는 한 번씩 가로챌 기회
    if (!ball.to) return
    const m = ball.to, dx = m.x - ball.x, dz = m.z - ball.z, d = Math.hypot(dx, dz), v = (ball.safe ? 900 : ball.sp || 560) * dt
    if (d <= v + 8) {
      if (view) return
      const { oop, chain } = ball
      grab(m)
      if (chain?.length) { pass(m, chain.shift()); Object.assign(ball, { chain, safe: true, oop: false }) }
      else if (chain) { Object.assign(m, { act: null, h: 0, vh: 0, sure: true }); shoot(m) }   // 체인 패스의 마지막 — 꼭 넣는다
      else if (oop) Object.assign(m, { act: 'air', t: 0, [oop === 'ult' ? 'sure' : 'lob']: true })   // 앨리웁 — 받자마자 골대로 날아가 덩크(궁극기면 꼭 들어간다)
      return
    }
    ball.x += dx / d * v; ball.z += dz / d * v; ball.h += ((ball.oop ? 120 : 40) - ball.h) * Math.min(1, dt * 6)
    if (!ball.safe && !view) for (const q of ps) {
      if (q.team === m.team || ball.tried.has(q) || dist(q, ball) >= 18 || q.stun > 0) continue
      ball.tried.add(q)
      if (rnd() < (ball.oop ? 0.1 : 0.3) * st(q).steal) return grab(q, 'STEAL!')   // 높이 띄운 앨리웁은 잘 안 잘린다
    }
  } else if (ball.st === 'shot' && ball.hoop) {
    ball.t += dt
    const u = Math.min(1, ball.t / ball.T), h = ball.hoop
    ball.x = ball.sx + (h.x - ball.sx) * u; ball.z = ball.sz + (h.z - ball.sz) * u
    ball.h = ball.sh + (RIM + 8 - ball.sh) * u + ball.arc * 4 * u * (1 - u)
    if (u >= 1 && !view) ball.make ? made(ball.team, ball.pts, ball.msg, ball.by) : miss(h)
  } else if (ball.st === 'loose' || ball.st === 'drop') {
    ball.vh -= GRAV * dt; ball.h += ball.vh * dt
    if (ball.h <= 0) { ball.h = 0; ball.vh = Math.abs(ball.vh) > 60 ? -ball.vh * 0.55 : 0 }
    if (ball.h === 0) { const f = Math.exp(-2 * dt); ball.vx *= f; ball.vz *= f }
    ball.x += ball.vx * dt; ball.z += ball.vz * dt
    if (ball.x < 0 || ball.x > CL) { ball.vx *= -0.6; ball.x = clamp(ball.x, 0, CL) }
    if (ball.z < 0 || ball.z > CW) { ball.vz *= -0.6; ball.z = clamp(ball.z, 0, CW) }
    if (ball.st === 'loose' && !view) for (const p of ps) if (p.cool <= 0 && p.stun <= 0 && dist(p, ball) < 20 * st(p).reb && ball.h < 52 + p.h) return grab(p)   // 리바운드 좋은 선수는 손이 길다
  }
}

// ---------------------------------------------------------------- 온라인 1:1
// 방장이 방을 만들면 4자리 코드. 들어온 사람과 Supabase Realtime 채널(slam-<코드>)에서 만나 WebRTC 로 둘을 직접 잇는다 —
// 경기 중 오가는 장면 · 버튼은 직접 연결로 보낸다(Realtime 무료 한도: 초당 100 · 한 달 200만 메시지). 직접 안 이어지는 망이면 채널로 조금 드물게.
// 경기 계산은 방장 브라우저만 한다(방장 = 1P · 1팀). 들어온 사람(2P · 2팀)은 스틱 · 버튼만 보내고, 방장이 보낸 장면을 부드럽게 이어 그린다(watch).
// 둘 다 로그인해야 하고, 끝나면 둘이 각자 결과를 올려 서로 맞으면 기록된다(/api/slam — 최근 대전 · 랭킹).
// ponytail: 방 코드가 겹치는지 따로 보지 않는다(9천 개 중 하나) · 끊기면 그 경기는 기록 없이 끝난다 · 직접 연결은 STUN 만(TURN 없음)

const BTN = ['dr', 'pa', 'sh', 'ul'], PLAY = new Set(['tip', 'play', 'dead', 'over'])
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }]
// 장면에 싣는 선수 값(x · z · h 뒤에) · 공 값(잡은 선수 · 받을 선수 · 골대 번호 뒤에)
const SYNC = ['vx', 'vz', 'vh', 'dir', 'act', 't', 'dur', 'style', 'hand', 'clutch', 'fall', 'f0', 'sq', 'big', 'ice', 'ghost', 'wall', 'slow', 'mirror', 'conf', 'ult', 'reach', 'boost', 'kb', 'acc', 'cheer', 'ch', 'wow', 'sad', 'throw']
const BSYNC = ['st', 'x', 'z', 'h', 'vx', 'vz', 'vh', 'sure', 'oop', 'safe', 'sx', 'sz', 'sh', 't', 'T', 'arc', 'sp']
const r2 = v => typeof v === 'number' ? Math.round(v * 100) / 100 : v ?? 0
let rq = 0, rn = [0, 0, 0, 0]   // 방장: 받은 상대 입력의 마지막 순번 · 버튼마다 누른 횟수
const $ = id => document.getElementById(id)
const direct = () => net?.dc?.readyState === 'open'
const send = m => net?.ch.send({ type: 'broadcast', event: 'm', payload: { ...m, f: who.id } })   // Realtime 채널 — 드문 알림
const stream = m => direct() ? net.dc.send(JSON.stringify(m)) : send(m)                          // 장면 · 버튼 — 직접 연결이 있으면 그리로

/** 방 만들기(code 없이) · 들어가기 */
async function openRoom(code) {
  if (!await loggedIn()) return
  if (!sb || !who) return roomUI('로그인 정보를 확인하지 못했어요 — 새로고침해 보세요')
  leave()
  const host = !code
  code ||= String(1000 + Math.floor(rnd() * 9000))
  const ch = sb.channel(`slam-${code}`, { config: { broadcast: { self: false } } })
  net = { host, code, ch, peer: null, pick: null, ready: [false, false], seen: Date.now(), n: [0, 0, 0, 0], q: 0, fx: [], at: 0, sent: 0, last: '', rec: '' }
  myT = host ? 0 : 1
  ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload, false))
  ch.subscribe(st => {
    if (net?.ch !== ch) return
    if (st === 'SUBSCRIBED') { net.seen = Date.now(); if (!host) send({ t: 'hi', n: who.name, p: pick }) }
    else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') leave('연결하지 못했어요 — 잠시 뒤 다시 해 보세요')
  })
  mode = 'wait'
  roomUI()
}
function leave(note) {
  if (net) {
    const { ch, pc } = net
    send({ t: 'bye' })
    net = null; myT = 0
    pc?.close(); sb.removeChannel(ch)
    if (mode !== 'load') { mode = 'select'; msg = cut = null }
  }
  roomUI(note)
}
addEventListener('pagehide', () => leave())

function roomUI(note = '') {
  for (const id of ['room-new', 'room-code', 'room-join']) $(id).hidden = !!net
  $('room-leave').hidden = !net
  $('room-link').hidden = !net?.host || !!net.peer
  $('room-msg').textContent = note || (!net ? '로그인하면 친구와 1:1 로 붙을 수 있어요. 방을 만들어 코드(링크)를 알려 주거나, 받은 코드를 넣으세요. 이긴 기록은 아래 랭킹에 올라가요.'
    : !net.peer ? net.host ? `방 코드 ${net.code} — 상대에게 알려 주세요. 들어오면 팀 선택으로 넘어가요` : `방 ${net.code} 에 들어가는 중…`
    : `방 ${net.code} · ${net.peer.name} 님과 연결됨(${direct() ? '직접 연결' : '서버 경유'}) — ${net.host ? '1P' : '2P'}`)
}

function onMsg(m, viaDc) {
  if (!net || !m || typeof m.t !== 'string') return
  if (!viaDc) {
    if (m.t === 'hi') return hello(m)
    if (m.t === 'full') return m.to === who.id && leave(m.why || '방이 꽉 찼어요')
    if (!net.peer || m.f !== net.peer.id) return   // 이 방의 상대가 아닌 사람
  }
  net.seen = Date.now()
  if (m.t === 's') applySnap(m)
  else if (m.t === 'i') remoteInput(m)
  else if (m.t === 'sdp') signal(m.d)
  else if (m.t === 'pick') net.pick = m.p
  else if (m.t === 'ready') { net.pick = m.p; net.ready[1] = true; maybeStart() }
  else if (m.t === 'clash') { net.ready[0] = false; say('상대도 같은 팀을 골랐어요 — 다른 팀을 골라 주세요', 2.2) }
  else if (m.t === 'start' && !net.host) { sides = m.s; net.match = m.m; begin() }
  else if (m.t === 'bye') leave('상대가 나갔어요')
}
/** 인사 — 들어온 사람이 보내고 방장이 받아 준다(방장은 한 명만 받는다). 같은 계정끼리는 안 된다 */
function hello(m) {
  const peer = { id: String(m.f), name: String(m.n || '상대').slice(0, 20) }
  if (net.host && !m.to) {
    if (m.f === who.id || net.peer && net.peer.id !== peer.id) return send({ t: 'full', to: m.f, why: m.f === who.id ? '같은 계정끼리는 붙을 수 없어요' : '' })
    const again = net.peer?.id === peer.id   // 답을 못 받아 다시 보낸 인사
    net.peer = peer; net.seen = Date.now()
    if (!again) { net.pick = m.p; net.ready = [false, false]; rq = 0; rn = [0, 0, 0, 0]; mode = 'select'; rtc() }
    send({ t: 'hi', to: peer.id, n: who.name, p: pick })
  } else if (!net.host && m.to === who.id && !net.peer) {
    net.peer = peer; net.pick = m.p; net.seen = Date.now(); mode = 'select'
  }
  roomUI()
}
/** WebRTC — 방장이 제안을, 들어온 사람이 답을 만든다. 후보(ICE)는 다 모은 뒤 설명에 담아 한 번에 보낸다(메시지 둘) */
async function rtc(offer) {
  try {
    const pc = net.pc = new RTCPeerConnection({ iceServers: ICE })
    const wire = dc => { net.dc = dc; dc.onmessage = e => { try { onMsg(JSON.parse(e.data), true) } catch {} }; dc.onopen = dc.onclose = () => net?.dc === dc && roomUI() }   // 나간 뒤 닫힘은 안내를 덮지 않게
    if (offer) { pc.ondatachannel = e => wire(e.channel); await pc.setRemoteDescription(offer); await pc.setLocalDescription(await pc.createAnswer()) }
    else { wire(pc.createDataChannel('g', { ordered: false, maxRetransmits: 0 })); await pc.setLocalDescription(await pc.createOffer()) }
    await new Promise(r => { pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && r(); if (pc.iceGatheringState === 'complete') r(); setTimeout(r, 2500) })
    if (net?.pc === pc) send({ t: 'sdp', d: pc.localDescription.toJSON() })
  } catch (e) { console.warn('직접 연결을 못 해 서버 경유로 해요', e) }
}
function signal(d) {
  if (d?.type === 'offer' && !net.host) { net.pc?.close(); rtc(d) }
  else if (d?.type === 'answer' && net.host) net.pc?.setRemoteDescription(d).catch(() => {})
}

// 팀 고르기 — 둘 다 「준비」하면 방장이 시작을 알린다. 같은 팀은 안 된다
function ready() {
  if (!net.peer || net.ready[0]) return
  if (net.ready[1] && net.pick === pick) return say('상대가 이미 고른 팀이에요', 1.5)
  net.ready[0] = true
  send({ t: 'ready', p: pick })
  maybeStart()
}
function maybeStart() {
  if (!net.host || !net.ready[0] || !net.ready[1] || mode !== 'select') return
  if (net.pick === pick) { net.ready[1] = false; return send({ t: 'clash' }) }
  sides = [pick, net.pick]
  net.match = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  send({ t: 'start', s: sides, m: net.match })
  begin()
}
function begin() { net.ready = [false, false]; net.rec = ''; start() }

// 방장 → 들어온 사람: 장면(초당 15번, 서버 경유면 10번)
function snap() {
  const at = o => o ? ps.indexOf(o) : -1, fx = net.fx
  net.fx = []
  return {
    t: 's', m: mode, c: r2(clock), sc: r2(shot), s: score, o: offense, w: r2(wait), k: ctls.map(at), tp: tip ? r2(tip.t) : 0,
    p: ps.map(p => [r2(p.x), r2(p.z), r2(p.h), ...SYNC.map(k => k === 'kb' ? p.kb ? 1 : 0 : r2(p[k]))]),
    b: [at(ball.owner), at(ball.to), ball.hoop ? HOOP.indexOf(ball.hoop) : -1, ...BSYNC.map(k => r2(ball[k]))],
    g: msg && [msg.id, msg.text, msg.t0, r2(msg.t)], u: cut && [at(cut.p), cut.off ? 1 : 0, r2(cut.t)], fx,
    r: rings.map(r => [r2(r.x), r2(r.z), r2(r.t), r.c || '', r.in ? 1 : 0, r.big ? 1 : 0]), e: [r2(shake), ...HOOP.map(h => r2(h.shake))],
  }
}
function applySnap(s) {
  if (net.host || !PLAY.has(s.m) || mode === 'select' || mode === 'wait' || s.p?.length !== ps.length) return   // 결과 화면에서 팀 선택으로 넘어갔으면 그만 받는다
  const was = mode
  mode = s.m; clock = s.c; shot = s.sc; score = s.s; offense = s.o; wait = s.w
  ctls = s.k.map(i => ps[i] || null)
  s.p.forEach((v, i) => {
    const p = ps[i], [x, z, hh] = v
    SYNC.forEach((k, j) => { p[k] = v[j + 3] })
    if (p.nx == null || Math.hypot(x - p.x, z - p.z) > 120) { p.x = x; p.z = z; p.h = hh }   // 처음 · 순간이동(인바운드 · 블링크)은 바로
    p.nx = x; p.nz = z; p.nh = hh
  })
  const [oi, ti, hi, ...bv] = s.b
  BSYNC.forEach((k, j) => { ball[k] = bv[j] })
  ball.owner = ps[oi] || null; ball.to = ps[ti] || null; ball.hoop = HOOP[hi] || null
  if (tip) tip.t = s.tp
  if (s.g && s.g[0] !== msg?.id) msg = { id: s.g[0], text: String(s.g[1]), t0: s.g[2], t: s.g[3] }
  if (cut && !s.u) flash = 0.22   // 궁극기가 터졌다
  cut = s.u ? cut?.p === ps[s.u[0]] ? cut : { p: ps[s.u[0]], off: !!s.u[1], t: s.u[2] } : null
  for (const f of s.fx) burst(...f)
  rings = s.r.map(([x, z, t, c, i, b]) => ({ x, z, t, c: c || undefined, in: !!i, big: !!b }))
  shake = Math.max(shake, s.e[0]); HOOP.forEach((o, i) => { o.shake = Math.max(o.shake, s.e[i + 1]) })
  if (mode === 'over') { msg = null; if (was !== 'over') report() }
}
/** 들어온 사람 화면 — 계산 없이 받은 장면을 따라간다. 다음 장면이 올 때까지 속도대로 미리 움직이고, 그린 자리는 부드럽게 맞춘다 */
function watch(rdt) {
  tnow += rdt
  shake = shake > 0.3 ? shake * Math.exp(-7 * rdt) : 0
  if (msg && (msg.t -= rdt) <= 0) msg = null
  if (mode === 'over') wait -= rdt
  if (cut) cut.t += rdt
  flash = Math.max(0, flash - rdt)
  const dt = cut ? rdt * 0.08 : rdt, k = 1 - Math.exp(-rdt * 20)
  for (const p of ps) {
    if (p.nx == null) continue
    p.nx += p.vx * dt; p.nz += p.vz * dt
    const scripted = p.act === 'dunk' || p.act === 'lay' || p.act === 'hang' || p.act === 'air' || p.act === 'rush'   // 높이를 정해 두고 움직이는 동작 — 떨어뜨려 미리 움직이지 않는다
    if (!scripted && (p.nh > 0 || p.vh > 0)) { p.vh -= GRAV * dt; p.nh = Math.max(0, p.nh + p.vh * dt) }
    p.x += (p.nx - p.x) * k; p.z += (p.nz - p.z) * k; p.h += (p.nh - p.h) * k
    if (p.act) p.t += dt
    for (const q of ['sq', 'cheer', 'wow', 'sad', 'throw', 'reach']) p[q] = Math.max(0, p[q] - dt)
    look(p, dt)
  }
  if (mode === 'tip') { tip.t += dt; ball.h = 60 + 300 * tip.t - 250 * tip.t ** 2 }
  else moveBall(dt, true)
  effects(dt, rdt)
}
// 들어온 사람 → 방장: 스틱 · 버튼. 버튼은 누른 횟수를 쌓아 보내 하나가 빠져도 다음 것에 실린다(직접 연결은 다시 보내지 않는다)
function guestInput() {
  const [x, z] = axis(), n = net.n, key = `${r2(x)},${r2(z)}`
  if (!net.press && (key === net.last ? tnow - net.sent < 0.25 : tnow - net.sent < (direct() ? 0.033 : 0.1))) return
  net.press = false; net.last = key; net.sent = tnow
  stream({ t: 'i', q: ++net.q, x: r2(-x), z: r2(z), n })   // 화면이 뒤집혀 있어 오른쪽 = 월드 왼쪽
}
function remoteInput(m) {
  if (!net.host || !(m.q > rq)) return   // 늦게 온 옛 입력은 버린다
  rq = m.q
  rax = [clamp(+m.x || 0, -1, 1), clamp(+m.z || 0, -1, 1)]
  BTN.forEach((k, j) => { const c = +m.n?.[j] || 0; if (c > rn[j]) { rin[k] = true; rn[j] = c } })
}
// 끊김 — 2초마다 신호. 들어온 사람은 방장 답이 올 때까지 인사를 다시 보낸다
setInterval(() => {
  if (!net) return
  if (!net.peer) {
    if (net.host) return
    if (Date.now() - net.seen > 9000) return leave('방을 찾지 못했어요 — 코드를 확인해 주세요')
    return send({ t: 'hi', n: who.name, p: pick })
  }
  if (Date.now() - net.seen > 10000) return leave('상대와 연결이 끊겼어요')
  stream({ t: 'ping' })
  roomUI()
}, 2000)

// 결과 올리기 — 방장은 끝날 때, 들어온 사람은 끝난 장면을 받을 때. 두 결과가 맞으면 서버가 기록한다
async function report() {
  if (!net?.peer || !net.match) return
  const n = net, body = { match: n.match, opp: n.peer.id, host: n.host, teams: [...sides], score: [...score] }
  n.rec = '대전 기록에 올리는 중…'
  try { await api('/slam', { method: 'POST', body, withToken: true }); n.rec = '대전 기록에 올렸어요' }
  catch (e) { n.rec = `기록하지 못했어요 — ${e.message}` }
  setTimeout(records, 2500)
}
/** 페이지 아래 대전 랭킹 · 최근 대전 */
async function records() {
  try {
    const { ranking, recent } = await api('/slam')
    $('rank').replaceChildren(...ranking.length ? ranking.map((r, i) => h('tr', {}, h('th', {}, String(i + 1)), h('td', {}, r.name),
      ...[r.wins, r.losses, r.draws].map(v => h('td', { className: 'num' }, String(v))), h('td', { className: 'num' }, `${Math.round(r.wins / r.games * 100)}%`)))
      : [h('tr', {}, h('td', { colSpan: 6, className: 'slam-none' }, '아직 기록이 없어요 — 첫 승리를 올려 보세요'))])
    const side = (s, win) => h('span', { className: win ? 'win' : '' }, h('b', {}, s.name), ` ${TEAMS[s.team]?.name ?? ''}`)
    $('recent').replaceChildren(...recent.length ? recent.map(m => h('li', {}, h('time', {}, ago(m.at)),
      side(m.home, m.home.score > m.away.score), h('strong', {}, `${m.home.score} : ${m.away.score}`), side(m.away, m.away.score > m.home.score)))
      : [h('li', { className: 'slam-none' }, '아직 대전이 없어요')])
  } catch (e) { $('recent').replaceChildren(h('li', { className: 'slam-none' }, `기록을 불러오지 못했어요 — ${e.message}`)) }
}
$('room-new').onclick = () => openRoom()
$('room-join').onclick = () => { const c = $('room-code').value.trim(); /^\d{4}$/.test(c) ? openRoom(c) : roomUI('방 코드 4자리를 넣어 주세요') }
$('room-code').onkeydown = e => { if (e.key === 'Enter') $('room-join').click() }
$('room-leave').onclick = () => leave()
$('room-link').onclick = e => copyLink(e.currentTarget, `${location.origin}/slam/?room=${net.code}`)

// ---------------------------------------------------------------- 한 프레임

function update(rdt) {
  tnow += rdt
  shake = shake > 0.3 ? shake * Math.exp(-7 * rdt) : 0
  if (msg && (msg.t -= rdt) <= 0) msg = null
  if (mode === 'over') wait -= rdt
  flash = Math.max(0, flash - rdt)
  if (cut && (cut.t += rdt) >= 0.9) { const c = cut; cut = null; fire(c.p, c.off) }
  const dt = cut ? rdt * 0.08 : rdt   // 컷인 동안은 거의 멈춘다
  if (mode === 'tip') { for (const p of ps) body(p, dt); tipOff(dt) }
  else if (mode === 'play' || mode === 'dead') {
    if (mode === 'play') {
      clock -= dt
      if ((ball.st === 'held' || ball.st === 'pass') && (shot -= dt) <= 0) { say('SHOT CLOCK'); grab(nearest(team(1 - offense), ball)) }
    }
    for (const p of ps) body(p, dt)
    for (const t of [0, 1]) if (ctls[t]) user(ctls[t], t ? rax : axis(), inputs[t], dt)   // 2팀 사람 = 온라인 상대(방장이 받은 스틱 · 버튼)
    for (const p of ps) if (ctls[p.team] !== p) ai(p, dt)
    const through = p => p.act === 'dunk' || p.act === 'hang' || p.act === 'air' || p.act === 'rush' || p.ghost > 0
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
  effects(dt, rdt)
  for (const k in input) input[k] = rin[k] = false
}

/** 파편 · 충격파 · 골대 흔들림 · 카메라 플래시 · 카메라 — 경기 계산과 상관없이 화면만 */
function effects(dt, rdt) {
  for (const q of parts) {
    q.vh -= GRAV * 0.6 * dt; q.x += q.vx * dt; q.z += q.vz * dt; q.h += q.vh * dt; q.t -= dt
    if (q.h < 0) { q.h = 0; q.vh *= -0.3 }
  }
  parts = parts.filter(q => q.t > 0)
  for (const r of rings) r.t += dt
  rings = rings.filter(r => r.t < 0.6)
  for (const h of HOOP) h.shake = Math.max(0, h.shake - rdt)
  for (const f of flashes) f.t -= rdt
  flashes = flashes.filter(f => f.t > 0)
  if (ps.length) camX = clamp(camX + ((myT ? CL - ball.x : ball.x) - camX) * Math.min(1, rdt * 4), 300, CL - 300)
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

// 해상도 — 느린 기기는 경기 중에 낮춘다(frame). 바뀌면 미리 그려 둔 그림(바닥 · 전광판 · 조명)도 다시 그린다
let dpr = 0, floorC = null, ledC = null, glowC = null
function resize(d) { dpr = d; cv.width = W * d; cv.height = H * d; main.setTransform(d, 0, 0, d, 0, 0); floorC = ledC = glowC = null }
resize(Math.min(2, devicePixelRatio || 1))
/** 한 번 그려 두는 그림 — 화면 좌표 (x0, y0) 부터 w × h 를 fn 으로 그린다(그동안 g 가 그 그림을 가리킨다) */
function bake(x0, y0, w, h, fn) {
  const c = Object.assign(document.createElement('canvas'), { width: Math.ceil(w * dpr), height: Math.ceil(h * dpr) })
  g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr)
  try { fn() } finally { g = main }
  return c
}
/** 가운데가 진하고 가장자리로 사라지는 동그라미 한 장 — 카메라 플래시 · 선수 그림자에 늘려 쓴다 */
function blob(rgb) {
  const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(1, `rgba(${rgb},0)`)
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64)
  return c
}
const GLOW = blob('255,255,255'), SHADOW = blob('0,0,0')

const CROWD_C = ['#e8c07a', '#c5523b', '#3d6fb5', '#e9e2d0', '#6b4b8a', '#2f8a6a', '#d98a3a']
const CROWD = Array.from({ length: 360 }, (_, i) => ({ x: -260 + rnd() * (CL + 520), row: i % 4, j: i % 7, ph: rnd() * 6, sx: 0, sy: 0 }))
const LED_P = 546   // 전광판 글자가 되풀이되는 길이(글자 간격 273 × 2)
function backdrop() {
  const sky = g.createLinearGradient(0, 50, 0, TOP)
  sky.addColorStop(0, '#141a28'); sky.addColorStop(1, '#2a3550')
  g.fillStyle = sky; g.fillRect(0, 50, W, TOP)
  const hype = msg ? 4 : 1   // 득점 · 궁극기 때는 관중이 들썩인다
  for (const c of CROWD) { c.sx = W / 2 + (c.x - camX) * 0.9; c.sy = 64 + c.row * 12 - Math.max(0, Math.sin(tnow * 3.5 * hype + c.ph)) * hype }   // 관중 — 코트보다 느리게 흐른다
  const seen = c => c.sx > -8 && c.sx < W + 8
  CROWD_C.forEach((col, j) => { g.fillStyle = col; g.beginPath(); for (const c of CROWD) if (c.j === j && seen(c)) g.rect(c.sx - 6, c.sy + 4, 12, 10); g.fill() })   // 옷 색마다 한 번에
  g.fillStyle = '#d9a77c'; g.beginPath(); for (const c of CROWD) if (seen(c)) { g.moveTo(c.sx + 5, c.sy); g.arc(c.sx, c.sy, 5, 0, Math.PI * 2) } g.fill()
  if (rnd() < (msg ? 0.6 : 0.08)) flashes.push({ x: rnd() * W, y: 60 + rnd() * 46, t: 0.12 })   // 카메라 플래시 — 득점 때 많이
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.95
  for (const f of flashes) { const r = 14 * f.t / 0.12; g.drawImage(GLOW, f.x - r, f.y - r, r * 2, r * 2) }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1
  ledC ||= bake(0, 110, W + LED_P, 26, () => {   // 전광판 — 빛나는 글자 띠를 한 번 그려 두고 흘린다
    const led = g.createLinearGradient(0, 110, 0, 136)
    led.addColorStop(0, '#0b1020'); led.addColorStop(1, '#151c30')
    g.fillStyle = led; g.fillRect(0, 110, W + LED_P, 26)
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 110, W + LED_P, 1)
    g.font = '800 15px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    for (let i = -2; i < 5; i++) { g.fillStyle = i % 2 ? '#f5a623' : '#e9edf5'; g.shadowColor = g.fillStyle; g.shadowBlur = 8; g.fillText(i % 2 ? 'DUNK ARCADE' : 'TNAB VIPERS', W / 2 + i * 273, 123) }
  })
  g.drawImage(ledC, -(((camX * 1.05 + tnow * 30) % LED_P + LED_P) % LED_P), 110, W + LED_P, 26)
}
/** 천장 조명 빛줄기 + 가장자리 어둡게 — 화면에 고정이라 한 번 그려 두고 덮는다 */
function overlay() {
  glowC ||= bake(0, 50, W, H - 50, () => {
    for (const lx of [W * 0.22, W * 0.5, W * 0.78]) {
      const lg = g.createLinearGradient(0, 50, 0, H)
      lg.addColorStop(0, 'rgba(255,245,215,.09)'); lg.addColorStop(1, 'rgba(255,245,215,0)')
      g.fillStyle = lg; g.beginPath(); g.moveTo(lx - 30, 50); g.lineTo(lx + 30, 50); g.lineTo(lx + 170, H); g.lineTo(lx - 170, H); g.fill()
    }
    const v = g.createRadialGradient(W / 2, H / 2 + 30, H * 0.3, W / 2, H / 2, W * 0.62)
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.42)')
    g.fillStyle = v; g.fillRect(0, 50, W, H - 50)
  })
  g.drawImage(glowC, 0, 50, W, H - 50)
}

// 코트 바닥 — 카메라가 가운데(C0)일 때 한 번 그려 두고, 카메라가 움직이면 기울여 옮긴다.
// 원근 때문에 가까운 줄(아래)일수록 많이 움직이는데, 줄의 화면 높이와 움직이는 양이 정비례라 화면에서는 기울이기(shear) 한 번과 같다
const C0 = CL / 2, FM = 320, FY = TOP - 16
function floor() {
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
  const [cx, cy, cu] = P(CL / 2, 250)   // 센터 로고 — 바닥에 눕힌 글자
  g.save(); g.translate(cx, cy); g.scale(1, 0.42); g.globalAlpha = 0.3
  g.font = `900 ${34 * cu}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText('VIPERS', 0, 0)
  g.restore()
  for (const lx of [CL * 0.22, CL * 0.5, CL * 0.78]) {   // 조명이 비친 광택
    const [gx, gy, gu] = P(lx, 210), R = 230 * gu, sg = g.createRadialGradient(gx, gy, 0, gx, gy, R)
    sg.addColorStop(0, 'rgba(255,240,210,.2)'); sg.addColorStop(1, 'rgba(255,240,210,0)')
    g.save(); g.translate(gx, gy); g.scale(1, 0.38); g.translate(-gx, -gy); g.fillStyle = sg; g.beginPath(); g.arc(gx, gy, R, 0, Math.PI * 2); g.fill(); g.restore()
  }
}
function court() {
  floorC ||= bake(-FM, FY, W + FM * 2, H - FY, () => { const c = camX; camX = C0; try { floor() } finally { camX = c } })
  const d = camX - C0, k = -d * S * 0.4 / (0.7 * CW)
  g.save(); g.transform(1, 0, k, 1, -d * S * 0.8 - k * TOP, 0); g.drawImage(floorC, -FM, FY, W + FM * 2, H - FY); g.restore()
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
  g.lineCap = 'butt'; g.lineWidth = 2.5
  const w = wob / 3
  poly([[bx, 220, 136 + w], [bx, 280, 136 + w], [bx, 280, 92 + w], [bx, 220, 92 + w]], 'rgba(200,228,255,.32)', '#f4f8ff', true)   // 유리 백보드
  poly([[bx, 222, 134 + w], [bx, 236, 134 + w], [bx, 228, 96 + w]], 'rgba(255,255,255,.18)', null, true)   // 유리 반짝임
  g.lineWidth = 2
  poly([[bx, 239, 118], [bx, 261, 118], [bx, 261, 100], [bx, 239, 100]], null, '#ff6a2a', true)
  poly([[bx, 220, 92 + w], [bx, 280, 92 + w], [bx, 280, 88 + w], [bx, 220, 88 + w]], '#1c2433', null, true)   // 아래 패드
  const [sx, sy, su] = P(bx, 250, 146)   // 백보드 위 샷클락
  g.fillStyle = '#05070c'; g.fillRect(sx - 11 * su, sy - 6 * su, 22 * su, 11 * su)
  g.fillStyle = '#ff3b2f'; g.font = `700 ${8 * su}px ui-monospace, Menlo, Consolas, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(String(Math.ceil(shot)).padStart(2, '0'), sx, sy)
  const [x, y0, u] = P(h.x, h.z, RIM), y = y0 + wob
  g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.1
  for (let i = 0; i < 12; i++) {   // 그물 — 흔들릴 때는 아래가 출렁인다
    const t = i / 12 * Math.PI * 2, sway = Math.sin(tnow * 9 + i) * h.shake * 3
    g.beginPath(); g.moveTo(x + Math.cos(t) * 15 * u, y + Math.sin(t) * 5 * u); g.lineTo(x + Math.cos(t) * 8 * u + wob + sway, y + (22 + wob) * u); g.stroke()
  }
  for (const k of [0.45, 0.8]) { g.beginPath(); g.ellipse(x + wob * k, y + (22 + wob) * u * k, (15 - 7 * k) * u, (5 - 2 * k) * u, 0, 0, Math.PI * 2); g.stroke() }
  g.strokeStyle = '#d4410f'; g.lineWidth = 4
  oval(x, y, 15 * u, 5 * u); g.stroke()
  g.strokeStyle = '#ff9a5a'; g.lineWidth = 1.4   // 림 위쪽 빛
  g.beginPath(); g.ellipse(x, y - 1, 15 * u, 5 * u, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke()
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
  if (!reflecting) { m[0] += (tx / u - m[0]) * k; m[1] += (ty / u - m[1]) * k }   // 바닥 반사를 그릴 때는 그대로
  return [m[0] * u, m[1] * u]
}
function line(pts, w, c) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.stroke() }
function shape(pts, c, edge, ew) {
  g.fillStyle = c; g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath(); g.fill()
  if (edge) { g.strokeStyle = edge; g.lineWidth = ew; g.stroke() }
}
const EDGE = 'rgba(25,12,6,.38)'   // 팔다리 · 옷 윤곽선
const PC = ['#ffd23f', '#5fd4ff']   // 1P · 2P 표시 색

/** 머리 — 배경을 지운 얼굴 그림(cutHead). 얼굴 그림은 거의 다 왼쪽을 보고 있어서 오른쪽으로 갈 때 뒤집는다.
 *  fd 가 0.1초쯤에 걸쳐 바뀌니 그동안 얼굴이 좁아졌다 넓어지며 고개를 돌린다 */
function head(p, f, x, y, u) {
  if (!p.f.head) return
  const sx = Math.abs(f) < 0.3 ? (f < 0 ? 0.3 : -0.3) : -f
  g.save(); g.translate(x, y); g.scale(sx, 1); g.drawImage(p.f.head, -12.25 * u, -13.2 * u, 24.5 * u, 26 * u); g.restore()
}

// ---------------------------------------------------------------- 몸짓
// 선수는 자세 하나(엉덩이 높이 hip · 윗몸 숙이기 bend · 어깨 sh · 두 손 · 두 발)를 상태마다 정하고(rig) 그 자세를 부드럽게 따라간다(settle).
// 동작(점프슛 · 레이업 · 덩크 · 크로스오버 · 궁극기)은 키프레임(kf)으로 — 준비(웅크리기) → 도약 → 정점 → 마무리(팔로 스루 · 착지)가 있다.
// 걷기 · 달리기는 걸음 박자(p.run)대로 디딘 발이 몸 속도만큼 뒤로 밀리고(미끄러지지 않게) 든 발이 앞으로 나간다. 팔은 다리와 엇갈려 흔든다.
// 몸 단위: 앞(fw) = 보는 쪽, 높이 = 발바닥에서. 서 있으면 엉덩이 37 · 어깨 60 · 머리 75. 손은 몸에 붙은 자리(숙이고 웅크린 만큼 따라간다),
// 공 길(pose — abs), 또는 'ball'(튀는 공을 따라간다)

/** 지금 상태의 자세. k = 따라가는 빠르기(초당) */
function rig(p, holding) {
  const a = Math.min(1.5, Math.hypot(p.vx, p.vz) / SPD), run = Math.min(1, a), ph = p.run * Math.PI * 2, air = p.h > 0, act = p.act, o = ball.owner
  const br = Math.sin(tnow * 2.3 + p.i * 1.7)   // 숨쉬기
  const R = { hip: 36.4 + br * 0.25, bend: 0.8, sh: br * 0.35, sl: p.fall ? 0 : clamp((myT ? -1 : 1) * p.vx / SPD, -1.3, 1.3) * 0.1, nh: [9.5, 35], fh: [-8.5, 35], nf: [2.5, 0], ff: [-2.5, 0], hd: [0, 0], k: 10 }
  const set = v => Object.assign(R, v)
  /** 걸음 — [먼 발, 가까운 발]. 박자의 앞 절반은 디딤(L → -L, 몸 속도만큼 뒤로), 뒤 절반은 듦(들어 올려 앞으로) */
  const gait = (L, lift) => [0, 1].map(k => { const c = ((p.run + k / 2) % 1 + 1) % 1; return c < 0.5 ? [L * (1 - 4 * c), 0] : [-L + 2 * L * sm(c * 2 - 1), lift * Math.sin((c * 2 - 1) * Math.PI)] })
  if (p.fall > 0) set(p.fall < 0.3   // 넘어짐 — 몸은 drawPlayer 가 눕힌다. 팔다리를 벌리고, 일어날 때는 웅크린다
    ? { hip: 31, bend: 5, nh: [10, 36], fh: [-4, 36], nf: [6, 0], ff: [-5, 0], k: 14 }
    : { hip: 33, bend: 1, nh: [14, 66], fh: [-12, 62], nf: [7, 7], ff: [-1, 10], k: 12 })
  else if (act === 'shot') {   // 점프슛 — 무릎을 굽혀(dip) 공을 낮췄다가 뛰며 이마 위로, 정점에서 손목을 꺾어 놓고 팔을 뻗은 채(팔로 스루) 내려온다
    const t = p.t, q = holding ? pose(p) : null
    set({ abs: true, hip: kf(t, [[0, 36], [0.05, 32.5], [0.1, 37]]), bend: kf(t, [[0, 2], [0.06, 3.5], [0.18, 0.4], [0.36, -1.6]]),
      nh: q || [15, 98], fh: q ? [q[0] - 5, q[1] - 4] : [5, 84], k: 40,
      nf: kf(t, [[0, [2, 0]], [0.06, [3, 0]], [0.14, [0, 4]], [0.36, [3, 8]]]), ff: kf(t, [[0, [-2, 0]], [0.06, [-3, 0]], [0.14, [-2, 3]], [0.36, [0, 6]]]) })
  }
  else if (act === 'lay') {   // 레이업 — 한 발로 뛰어 반대 무릎을 끌어올리고 공을 든 손을 림으로 쭉 뻗는다. 다른 팔은 옆으로 벌려 균형
    const u = Math.min(1, p.t / p.dur)
    set({ abs: true, hip: 37, bend: kf(u, [[0, 3.5], [1, 1]]), nh: holding ? pose(p) : [16, 96], fh: kf(u, [[0, [-5, 52]], [0.6, [-11, 70]], [1, [-10, 76]]]), k: 40,
      nf: kf(u, [[0, [5, 2]], [0.35, [10, 16]], [1, [9, 19]]]), ff: kf(u, [[0, [-4, 0]], [0.3, [-6, 2]], [1, [-3, 1]]]) })
  }
  else if (act === 'dunk') {   // 덩크 — 웅크렸다 터지듯 뛰어 다리를 접고, 공을 들어 올렸다가 림에 내리꽂는다. 종류마다 팔 · 다리가 다르다
    const q = pose(p), st = p.style
    if (p.t < DUNK_G) { const g0 = sm(p.t / DUNK_G); set({ abs: true, hip: 37 - 6 * g0, bend: 2 + 4 * g0, nh: q, fh: [q[0] - 5, q[1] - 3], nf: [5, 0], ff: [-4, 0], k: 45 }) }
    else {
      const u = du(p), legs = DUNK_LEGS[st] || DUNK_LEGS.two
      set({ abs: true, hip: 37, k: 45, nh: q, nf: kf(u, legs[0]), ff: kf(u, legs[1]),
        bend: st === 'tomahawk' ? kf(u, [[0, 4], [0.55, -4], [0.9, 5]]) : st === 'reverse' ? kf(u, [[0, 2], [0.6, -3], [1, -1]]) : kf(u, [[0, 5], [0.5, 0], [0.92, 3]]),
        fh: st === 'tomahawk' ? kf(u, [[0, [6, 60]], [0.55, [15, 72]], [1, [10, 64]]])   // 반대 팔은 앞으로 내밀어 균형
          : st === 'windmill' ? [4 - q[0], 144 - q[1]]   // 공과 엇갈려 반대쪽을 돈다
          : [q[0] - 5, q[1] - 3] })   // 두 손으로
    }
  }
  else if (act === 'hang') {   // 림에 매달려 — 두 손은 림, 다리는 흔들리다 멎는다
    const q = pose(p), sw = Math.sin(p.t * 15) * Math.exp(-p.t * 4) * 7
    set({ abs: true, hip: 37, bend: -1.5, nh: q, fh: [q[0] - 3 * Math.sign(q[0]), q[1]], nf: [2 + sw, 0], ff: [-1 + sw * 0.8, 0], k: 40 })
  }
  else if (act === 'land') set({ hip: 36, bend: 2, nh: [13, 62], fh: [-7, 60], nf: [4, 5], ff: [-3, 3], k: 18 })   // 덩크 · 레이업 뒤 떨어지는 중
  else if (act === 'air') {   // 에어 워크 — 몸을 앞으로 눕혀 날아간다. 다리는 뒤로 차며 달린다
    const [b0, b1] = gait(12, 10)
    set({ hip: 37, bend: 8, nh: holding ? 'ball' : [16, 60], fh: [12, 50], nf: [b1[0] - 5, b1[1] + 6], ff: [b0[0] - 8, b0[1] + 4], k: 25 })
  }
  else if (act === 'rush') { const [b0, b1] = gait(15, 9); set({ hip: 34, bend: 9, nh: [22, 54], fh: [19, 50], nf: b1, ff: b0, k: 25 }) }   // 불도저 — 숙이고 두 팔을 앞으로
  else if (act === 'spin') set({ hip: 34, bend: 0, nh: [17, 63], fh: [-17, 63], nf: [3, 0], ff: [-2, 4], k: 30 })   // 회오리 — 두 팔을 벌려 돈다
  else if (act === 'cross') {   // 크로스오버 — 낮게 웅크려 옆으로 크게 디디며 공을 반대 손으로
    const u = Math.min(1, p.t / 0.26)
    set({ hip: 31.5, bend: 4.5, nh: 'ball', fh: [12, 48], k: 30, nf: kf(u, [[0, [4, 0]], [0.5, [13, 6]], [1, [10, 0]]]), ff: kf(u, [[0, [-4, 0]], [0.5, [-9, 2]], [1, [-8, 0]]]) })
  }
  else if (cut?.p === p) {   // 궁극기 — 웅크려 기를 모았다가 두 팔을 펴며 터뜨린다(공이 있으면 머리 위로). 다 펴면 떨며 버틴다
    const t = cut.t, tr = t > 0.45 ? Math.sin(tnow * 48) * 0.7 : 0
    set({ hip: kf(t, [[0, 36], [0.2, 31], [0.42, 38]]), bend: kf(t, [[0, 1], [0.2, 5], [0.42, -2.5]]), nf: [7, 0], ff: [-7, 0], hd: [0, t > 0.4 ? 1.5 : -1], k: 26,
      nh: holding ? 'ball' : kf(t, [[0, [9, 40]], [0.2, [5, 52]], [0.42, [21, 84 + tr]]]), fh: kf(t, [[0, [-8, 40]], [0.2, [-3, 52]], [0.42, [-19, 82 - tr]]]) })
  }
  else if (air) set({ hip: 37, bend: -0.5, nh: holding ? 'ball' : [6, 100], fh: [-1, 97], nf: [3, p.vh > 0 ? 2 : 7], ff: [-3, p.vh > 0 ? 1 : 5], k: 18 })   // 블록 · 리바운드 · 점프볼 — 두 팔을 머리 위로
  else if (p.reach > 0) set({ hip: 31.5, bend: 6, nh: [27, 46], fh: [-7, 52], nf: [13, 0], ff: [-9, 0], k: 32 })   // 스틸 — 앞발을 내디디며 낮게 손을 뻗는다
  else if (p.throw > 0) { const e = sm(Math.min(1, (1 - p.throw / 0.22) * 2.2)); set({ hip: 35, bend: 2.5 + e, nh: [11 + 13 * e, 50], fh: [8 + 11 * e, 48], nf: [8, 0], ff: [-5, 0], k: 30 }) }   // 패스 — 두 손으로 밀어 낸다
  else if (p.stun > 0 && !(p.ice > 0)) set({ hip: 35, bend: -2.5, nh: [12 + 4 * Math.sin(tnow * 22), 56], fh: [-12, 58 + 3 * Math.sin(tnow * 19)], k: 20 })   // 휘청 — 뒤로 젖히고 팔을 휘젓는다
  else if (p.cheer > 0 && !holding) {   // 세리머니 — 덩크는 두 팔 알통, 3점은 두 팔을 V 로, 블록은 손가락을 흔들고(무톰보), 그 밖은 주먹을 치켜든다
    const w = Math.sin(tnow * 8), pump = Math.abs(w)
    set(p.ch === 'flex' ? { hip: 35 - pump * 0.6, bend: -1, nh: [15, 68 + 3 * pump], fh: [-14, 68 + 3 * pump], nf: [7, 0], ff: [-6, 0], hd: [0, 1.5], k: 16 }
      : p.ch === 'three' ? { hip: 36.5, bend: -2, nh: [16, 93], fh: [-14, 91], hd: [0, 2], k: 14 }
      : p.ch === 'wag' ? { hip: 36, bend: -1, nh: [9 + 5 * Math.sin(tnow * 16), 90], fh: [9, 48], hd: [0, 1], k: 24 }
      : { hip: 36.5 - pump, bend: -1.5, nh: [10, 80 + 14 * pump], fh: [10, 52], hd: [0, 1.5], k: 18 })
  }
  else if (p.wow > 0 && !holding) set({ hip: 36.5, bend: -3.5, nh: [19, 68], fh: [-15, 68], nf: [4, 0], ff: [-6, 0], hd: [-1, 2], k: 18 })   // 놀람 — 뒤로 젖히며 두 팔을 벌린다(머리 위에 !)
  else if (!holding && o && o.team !== p.team && dist(p, o) < 70) {   // 수비 자세 — 낮고 넓게 서서 한 손은 높이 한 손은 낮게. 움직일 때는 발을 엇갈리지 않고 미끄러지듯
    const w = Math.sin(tnow * 7 + p.i), mv = a > 0.06, lift = s => Math.max(0, Math.sin(s)) * 3
    set({ hip: 32.5, bend: 3, nh: [16, 71 + w * 1.5], fh: [14, 42 - w], k: 12, nf: mv ? [7 + 3 * Math.sin(ph), lift(ph)] : [7, 0], ff: mv ? [-6 + 3 * Math.sin(ph + 1.3), lift(ph + 1.3)] : [-6, 0] })
  }
  else if (a > 0.06) {   // 걷기 · 달리기 — 빠를수록 보폭이 크고 몸을 숙이며, 팔꿈치를 굽혀 크게 흔든다. 디딜 때 몸이 살짝 내려간다
    const cad = 1.5 + 1.3 * a, L = Math.min(18, (Math.abs(p.vx) + 0.35 * Math.abs(p.vz)) / (4 * cad)), [ff, nf] = gait(L, 3 + 7 * run), s = L > 0.5 ? nf[0] / L : 0, sw = 2 + 4 * run
    // 팔은 제 쪽 옆에서 — 앞으로 갈 때 팔꿈치를 굽혀 올라오고 뒤로 갈 때 내려간다(몸을 가로지르지 않게). 가까운 다리가 뒤면 가까운 팔이 앞
    set({ nf, ff, hip: 36.2 - 1.4 * run - 1.5 * run * (0.5 + 0.5 * Math.cos(p.run * Math.PI * 4)), bend: p.vx * p.dir < -30 ? 0 : 0.8 + 3.2 * run, k: 16,
      nh: [14.5 - s * (1.5 + 3.5 * run), 37 + 7 * run - s * sw], fh: [-14.5 + s * (1.5 + 3.5 * run), 37 + 7 * run + s * sw] })
    if (holding) set({ nh: 'ball', fh: [11, 46], bend: R.bend + 1.5 })   // 드리블하며 달린다 — 다른 팔로 공을 감싼다
  }
  else if (holding) set({ hip: 34 - 0.8 * (1 - Math.abs(Math.cos(p.dp))), bend: 2.4, nh: 'ball', fh: [11, 46], nf: [5, 0], ff: [-4, 0], k: 14 })   // 제자리 드리블 — 무릎을 굽히고 공이 바닥을 칠 때 몸도 살짝
  if (p.sad > 0 && !holding && !act && !air && !(p.fall > 0) && !(p.cheer > 0)) {   // 실망 — 고개를 떨구고, 서 있으면 무릎을 짚는다
    if (a < 0.06) set({ hip: 31.5, bend: 10, nh: [14, 26], fh: [3, 26], nf: [6, 0], ff: [-5, 0], k: 8 })
    R.hd = [0, -2.5]
  }
  if (p.sq > 0 && !air) { R.hip -= p.sq * 30; R.bend += p.sq * 12 }   // 착지 — 무릎으로 받는다
  if (!R.abs) {   // 몸에 붙은 손 — 숙이고 웅크린 만큼 따라간다
    const rel = h => [h[0] + R.bend * (h[1] - 37) / 23, h[1] + R.hip - 37]
    if (R.nh !== 'ball') R.nh = rel(R.nh)
    R.fh = rel(R.fh)
  }
  return R
}
// 덩크 다리 — [가까운 발, 먼 발] 키프레임(몸 밑 기준). 투핸드 · 360 은 무릎을 접고, 토마호크는 앞뒤로, 윈드밀은 크게 벌리고, 리버스는 뒤로 찬다
const DUNK_LEGS = {
  two: [[[0, [3, 0]], [0.3, [9, 21]], [0.85, [8, 18]], [1, [4, 6]]], [[0, [-3, 0]], [0.3, [3, 15]], [0.85, [2, 14]], [1, [-1, 4]]]],
  tomahawk: [[[0, [3, 0]], [0.35, [7, 22]], [1, [5, 8]]], [[0, [-3, 0]], [0.35, [-9, 12]], [1, [-3, 4]]]],
  windmill: [[[0, [3, 0]], [0.4, [12, 14]], [1, [6, 6]]], [[0, [-3, 0]], [0.4, [-11, 7]], [1, [-4, 3]]]],
  reverse: [[[0, [3, 0]], [0.4, [-4, 14]], [1, [-2, 6]]], [[0, [-3, 0]], [0.4, [-10, 10]], [1, [-5, 4]]]],
}
DUNK_LEGS.spin = DUNK_LEGS.two

/** 자세를 부드럽게 따라간다. 손은 화면 왼쪽 · 오른쪽 팔(h-1 · h1)로 기억해 몸을 돌 때도 손이 건너간다.
 *  한 프레임에 한 번만 움직인다(바닥 반사 · 궁극기 때 다시 그려도). 얼면 그대로 멈춘다. [자세, 이번에 움직였나] */
function settle(p, R, f, fs, bh) {
  const fresh = p.pzN !== drawN && !reflecting, e = s => fresh && !(p.ice > 0) ? 1 - Math.exp(-drawDt * s) : 0
  const tg = { hip: R.hip, bend: R.bend, sh: R.sh, sl: R.sl, hd: R.hd, [`h${fs}`]: R.nh === 'ball' ? bh : [fs * R.nh[0], R.nh[1]], [`h${-fs}`]: [fs * R.fh[0], R.fh[1]], f1: [f * R.nf[0], R.nf[1]], f0: [f * R.ff[0], R.ff[1]] }
  const Z = p.pz ||= structuredClone(tg), kd = e(R.k), kb = e(45), kf_ = e(Math.max(R.k, 30)), kh = e(9)
  if (fresh) p.pzN = drawN
  for (const key in tg) {
    const m = key === `h${fs}` && R.nh === 'ball' ? kb : key[0] === 'f' ? kf_ : key === 'hd' ? kh : kd, a = Z[key], b = tg[key]
    if (Array.isArray(b)) { a[0] += (b[0] - a[0]) * m; a[1] += (b[1] - a[1]) * m } else Z[key] = a + (b - a) * m
  }
  return [Z, fresh]
}

/** 궁극기 — 발밑에서 퍼지는 고리 · 솟는 빛기둥 · 돌며 올라가는 불티 */
function aura(fx, fy, u) {
  const k = Math.min(1, cut.t / 0.25), c = '255,214,90'
  g.save(); g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 3; i++) { const r = (cut.t * 1.6 + i / 3) % 1; g.strokeStyle = `rgba(${c},${(1 - r) * 0.85 * k})`; g.lineWidth = 2.5; oval(fx, fy, (14 + r * 46) * u, (5 + r * 16) * u); g.stroke() }
  const pg = g.createLinearGradient(0, fy, 0, fy - 130 * u)
  pg.addColorStop(0, `rgba(${c},${0.5 * k})`); pg.addColorStop(1, `rgba(${c},0)`)
  g.fillStyle = pg; g.beginPath(); g.ellipse(fx, fy - 65 * u, 24 * u, 65 * u, 0, 0, Math.PI * 2); g.fill()
  g.fillStyle = `rgba(${c},${0.9 * k})`; g.beginPath()
  for (let i = 0; i < 14; i++) {
    const q = (tnow * 0.9 + i / 14) % 1, an = tnow * 5 + i * 2.4, r = (16 + 8 * Math.sin(i)) * u * (1 - q * 0.4), sx = fx + Math.cos(an) * r, sy = fy - q * 120 * u + Math.sin(an) * r * 0.3
    g.moveTo(sx + 1.8 * u, sy); g.arc(sx, sy, 1.8 * u * (1 - q) + 0.3, 0, Math.PI * 2)
  }
  g.fill()
  g.restore()
}
/** 집중선 — 화면 가장자리에서 그 선수 쪽으로 가늘어지는 흰 줄(매 프레임 조금씩 흔들린다) */
function focus(cx, cy, k) {
  g.fillStyle = `rgba(255,255,255,${0.32 * k})`; g.beginPath()
  for (let i = 0; i < 48; i++) {
    const a = (i + rnd() * 0.6) / 48 * Math.PI * 2, r0 = 170 + rnd() * 90, w = 0.008 + rnd() * 0.016
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.8); g.lineTo(cx + Math.cos(a - w) * 1100, cy + Math.sin(a - w) * 1100); g.lineTo(cx + Math.cos(a + w) * 1100, cy + Math.sin(a + w) * 1100)
  }
  g.fill()
}

// 체형 — 포지션 1~5. 가드는 날렵하게, 포워드는 어깨가 넓고 다리가 탄탄하게, 센터는 몸통이 두껍고 손발이 크게.
// w = 몸통 · 엉덩이 폭, sh = 어깨 폭, t = 팔다리 굵기, e = 손 · 발 크기. 키와 관절 자리는 모두 같다(공 · 림 · 부딪힘은 그대로)
const BUILD = [
  { w: 0.86, sh: 0.9, t: 0.84, e: 1 },
  { w: 0.9, sh: 0.94, t: 0.88, e: 1 },
  { w: 1.04, sh: 1.08, t: 1.04, e: 1.06 },
  { w: 1.14, sh: 1.16, t: 1.14, e: 1.12 },
  { w: 1.26, sh: 1.22, t: 1.24, e: 1.2 },
]
/** 장비 — 선수마다 다르게(선수 id 로 정해져 온라인 두 화면이 같다). 팔 토시(가까운 팔) · 손목 밴드 · 양말 길이 · 운동화 색 */
function gearOf(key) {
  let h = 7
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const pick = n => { const v = h % n; h = Math.floor(h / n); return v }
  return { sleeve: pick(5), wrist: pick(3), sock: pick(3), shoe: pick(3) }   // 토시 0 검정 · 1 흰색 · 그 밖 없음, 밴드 0 없음 · 1 흰색 · 2 보조색, 양말 0 짧게 · 1 흰 긴 · 2 검정 긴, 신발 0 흰 · 1 검정 · 2 팀색
}
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]

/** 선수 한 명. refl = 바닥 반사용(그림자 · 표시 · 공은 빼고 몸만) */
function drawPlayer(p, refl) {
  const [x, y, u] = P(p.x, p.z, p.h), [fx, fy] = P(p.x, p.z), T = TEAMS[sides[p.team]], big = p.big > 0 ? 1.4 : 1, F = myT ? -1 : 1   // F = 화면이 뒤집혔으면 -1
  const skin = p.f.skin || SKIN, shade = p.f.shade || '#8f5f3e'
  if (!refl) {
    p.trail.forEach((s, j) => {   // 잔상
      const [gx, gy, gu] = P(s.x, s.z, s.h)
      g.globalAlpha = 0.3 * (1 - j / p.trail.length); g.fillStyle = T.color
      g.fillRect(gx - 9 * gu, gy - 62 * gu, 18 * gu, 56 * gu); oval(gx, gy - 74 * gu, 9 * gu, 10 * gu); g.fill()
    })
    g.globalAlpha = 1
    if (p.mirror > 0) for (const dz of [-38, 38]) {   // 미러 이미지 — 양옆의 분신
      const [mx, my, mu] = P(p.x + Math.sin(tnow * 6 + dz) * 8, p.z + dz, p.h)
      g.globalAlpha = 0.45; g.fillStyle = T.color; g.fillRect(mx - 9 * mu, my - 62 * mu, 18 * mu, 56 * mu)
      head(p, F * p.fd, mx, my - 75 * mu, mu)
      g.globalAlpha = 1
    }
    if (p.slow > 0) { g.strokeStyle = 'rgba(120,190,255,.85)'; g.lineWidth = 2; oval(fx, fy + 2, 18 * u, 6.5 * u); g.stroke() }
    if (p.wall > 0 || p.ghost > 0) { g.fillStyle = p.wall > 0 ? 'rgba(255,120,30,.35)' : 'rgba(90,230,200,.3)'; oval(fx, fy, 26 * u, 10 * u); g.fill() }
    if (ultReady(p)) { g.fillStyle = skillOf(p).def ? `rgba(127,232,255,${0.3 + 0.2 * Math.sin(tnow * 9)})` : `rgba(255,210,63,${0.3 + 0.2 * Math.sin(tnow * 9)})`; oval(fx, fy, 24 * u, 9 * u); g.fill() }   // 지금 쓸 수 있는 궁극기
    if (cut?.p === p) aura(fx, fy, u)
    const rs = 16 * u * Math.max(0.5, 1 - p.h / 160) * big   // 그림자 — 높이 뜰수록 작고 옅게
    g.globalAlpha = 0.45 - Math.min(0.25, p.h / 400); g.drawImage(SHADOW, fx - rs, fy - rs * 0.34, rs * 2, rs * 0.68); g.globalAlpha = 1
    if (ctls[p.team] === p) { g.strokeStyle = PC[p.team]; g.lineWidth = 3; oval(fx, fy, 19 * u * big, 7 * u * big); g.stroke() }   // 사람이 움직이는 선수
  }

  const f = F * p.fd, fs = f >= 0 ? 1 : -1, holding = ball.owner === p
  const [bx, by] = P(ball.x, ball.z, Math.max(ball.h, p.h + 26)), bh = [(bx - x) / u / big, (y - by) / u / big + 5]   // 공 쪽 손 — 공 위에(무릎 아래로는 안 내려간다)
  const [Z, fresh] = settle(p, rig(p, holding), f, fs, bh), kj = fresh ? 1 - Math.exp(-drawDt * 28) : 0   // kj = 팔꿈치 · 무릎이 따라가는 빠르기
  const at = (px, hh) => [(px + Z.sl * hh) * u, -hh * u]   // 발바닥 기준 — 손 · 발
  const up = (px, hh) => { const r = hh - 37, yy = Z.hip + r + Z.sh * clamp((hh - 45) / 15, 0, 1); return [(px + fs * Z.bend * r / 23 + Z.sl * yy) * u, -yy * u] }   // 윗몸 — 엉덩이를 축으로 숙이고 엉덩이 높이를 따라 내려온다
  g.save()
  g.translate(x, y)
  if (big > 1) g.scale(big, big)   // 자이언트
  if (p.ghost > 0) g.globalAlpha *= 0.55   // 팬텀 — 반투명
  let turn = 1   // 도는 중 등이 보이면 음수 — 등번호는 거울처럼 뒤집히지 않게 다시 뒤집는다
  if (p.act === 'spin' || p.act === 'dunk' && p.style === 'spin') {   // 회오리 · 360 덩크 — 제자리에서 돈다
    const c = Math.cos(p.act === 'spin' ? p.t / 0.45 * Math.PI * 4 : du(p) * Math.PI * 2)
    g.scale(turn = Math.abs(c) < 0.15 ? 0.15 * Math.sign(c || 1) : c, 1)
  }
  if (p.fall > 0) {   // 넘어짐 — 0.22초에 걸쳐 뒤로 넘어가 바닥에서 한 번 튀고, 마지막 0.3초에 일어난다
    const e = Math.max(0, (p.f0 || 1) - p.fall), k = e < 0.22 ? 1 - (1 - e / 0.22) ** 3 : p.fall < 0.3 ? sm(p.fall / 0.3) : 1, b = e > 0.22 && e < 0.38 ? Math.sin((e - 0.22) / 0.16 * Math.PI) * 0.07 : 0
    g.rotate(-F * p.dir * 1.35 * (k - b))
  }
  else if (p.sq > 0) g.scale(1 + p.sq * 0.5, 1 - p.sq * 0.5)   // 착지 — 잠깐 눌린다
  g.lineCap = 'round'; g.lineJoin = 'round'
  const B = BUILD[p.i], G = p.f.gear || {}, tu = B.t * u, eu = B.e * u
  const shoe = ['#fafafa', '#1d1d22', T.color][G.shoe || 0], sole = G.shoe ? '#f2f2f2' : T.dark
  const leg = (k, col) => {   // 엉덩이 · 무릎 · 발 — 무릎은 앞으로 꺾인다. 먼 다리는 어둡게
    const hp = up((k ? 2.6 : -2.6) * B.w * (1 - Math.abs(f)), 37), ft = at(...Z[`f${k}`])
    const [knee, end] = joint(p, `k${k}`, hp, ft, 19 * u, 18.5 * u, [hp[0] + f * 14 * u, hp[1] + 18 * u], u, kj)
    line([hp, knee, end], 7.8 * tu, EDGE); line([hp, knee], 6.4 * tu, col); line([knee, end], 5.2 * tu, col)
    const ank = [end[0], end[1] - 1.8 * u]   // 양말 — 짧게(발목) · 길게(종아리까지)
    line([ank, G.sock ? mix(ank, knee, 0.5) : [end[0], end[1] - 5 * u]], 5 * tu, G.sock === 2 ? '#1d1d22' : '#f2f2f2')
    g.fillStyle = shoe; oval(end[0] + f * 2.2 * eu, end[1] - 1.5 * eu, 4.8 * eu, 2.3 * eu); g.fill()   // 운동화
    g.strokeStyle = EDGE; g.lineWidth = 0.8 * u; g.stroke()
    g.fillStyle = sole; g.fillRect(end[0] + f * 2.2 * eu - 4.8 * eu, end[1] - 0.5 * u, 9.6 * eu, 1.1 * u)
  }
  const arm = (s, col) => {   // s = 화면 왼쪽(-1) · 오른쪽(1) 팔. 어깨는 윗몸을 따라가고, 팔꿈치는 아래 · 뒤로 꺾인다
    const s0 = up(s * 7.4 * B.sh, 60), hd = at(...Z[`h${s}`])
    const [el, end] = joint(p, `e${s}`, s0, hd, 13.5 * u, 13 * u, [s0[0] - f * 10 * u, s0[1] + 16 * u], u, kj)
    line([s0, el, end], 6.2 * tu, EDGE); line([s0, el], 5 * tu, col); line([el, end], 4.3 * tu, col)
    if (s === fs && G.sleeve < 2) { const c = G.sleeve ? '#f2f2f2' : '#1d1d22'; line([mix(s0, el, 0.4), el], 5 * tu, c); line([el, mix(el, end, 0.86)], 4.3 * tu, c) }   // 팔 토시
    if (G.wrist) line([mix(el, end, 0.74), mix(el, end, 0.88)], 5.2 * tu, G.wrist === 1 ? '#f2f2f2' : T.trim)   // 손목 밴드
    g.fillStyle = col; oval(end[0], end[1], 2.5 * eu, 2.5 * eu); g.fill()
  }
  arm(-fs, shade)   // 먼 팔 — 몸 뒤
  leg(0, shade)
  leg(1, skin)
  const w = B.w, sw = B.sh
  shape([up(-8.8 * w, 42), up(8.8 * w, 42), up(10.4 * w, 27), up(1, 26), up(0, 29), up(-1, 26), up(-10.4 * w, 27)], T.dark, EDGE, 0.9 * u)   // 반바지 — 허리 띠 · 옆 줄은 보조색
  line([up(-9.6 * w, 40.6), up(-10.3 * w, 28)], 2 * u, T.trim); line([up(9.6 * w, 40.6), up(10.3 * w, 28)], 2 * u, T.trim)
  line([up(-8.6 * w, 41.2), up(8.6 * w, 41.2)], 1.6 * u, T.trim)
  const [, jt] = up(0, 64), [, jb] = up(0, 40), jg = g.createLinearGradient(0, jt, 0, jb)   // 상의 — 아래로 갈수록 살짝 어둡게
  jg.addColorStop(0, T.color); jg.addColorStop(0.55, T.color); jg.addColorStop(1, T.dark)
  shape([up(-3.6, 64), up(-9.6 * sw, 62.5), up(-7.8 * w, 54), up(-8.4 * w, 40.5), up(8.4 * w, 40.5), up(7.8 * w, 54), up(9.6 * sw, 62.5), up(3.6, 64), up(0, 58.5)], jg, EDGE, 0.9 * u)   // 민소매 상의
  for (const s of [-1, 1]) shape([up(s * 7.8 * w, 54), up(s * 8.4 * w, 40.5), up(s * 6.6 * w, 40.5), up(s * 6.3 * w, 53)], T.trim)   // 옆 판 — 몸 윤곽이 보이게
  line([up(-3.6, 64), up(0, 58.5), up(3.6, 64)], 1.4 * u, T.trim); line([up(-9.6 * sw, 62.5), up(-7.8 * w, 54)], 1.4 * u, T.trim); line([up(9.6 * sw, 62.5), up(7.8 * w, 54)], 1.4 * u, T.trim)   // 목 · 진동 둘레
  g.font = `900 ${9 * u}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'   // 등번호 — 테두리를 둘러 어느 색 위에서도 읽히게
  g.save(); g.translate(...up(0, 50)); if (turn < 0) g.scale(-1, 1); g.strokeStyle = T.dark; g.lineWidth = 2 * u; g.strokeText(p.f.num, 0, 0); g.fillStyle = '#fff'; g.fillText(p.f.num, 0, 0); g.restore()
  line([up(0, 62), up(0, 67)], 5.2 * tu, skin)   // 목
  const [hx, hy] = up(0, 75), hdx = hx + Z.hd[0] * u, hdy = hy - Z.hd[1] * u   // 머리 — 몸보다 살짝 늦게 따라온다
  if (p.f.head) head(p, f, hdx, hdy, u)
  else { g.fillStyle = skin; oval(hdx, hdy, 8 * u, 9 * u); g.fill() }
  arm(fs, skin)   // 가까운 팔 — 몸 앞
  if (p.ice > 0) { g.fillStyle = 'rgba(170,225,255,.55)'; g.strokeStyle = '#e8f7ff'; g.lineWidth = 1.5; g.fillRect(-15 * u, -92 * u, 30 * u, 94 * u); g.strokeRect(-15 * u, -92 * u, 30 * u, 94 * u) }   // 얼음
  g.restore()
  if (refl) return
  g.textAlign = 'center'; g.textBaseline = 'middle'
  if (p.conf > 0) { g.fillStyle = '#c58bff'; g.font = `900 ${16 * u}px system-ui, sans-serif`; g.fillText('?', x, y - 100 * u * big) }
  else if (p.wow > 0) { g.fillStyle = '#fff'; g.font = `900 ${16 * u}px system-ui, sans-serif`; g.fillText('!', x + up(0, 98)[0] * big, y - (98 + 6 * Math.min(1, (1.1 - p.wow) * 8)) * u * big) }   // 놀람 — 톡 튀어 오른다
  if (p.fall > 0.3 && (p.f0 || 1) - p.fall > 0.25) {   // 누워 있는 동안 머리 위로 별이 돈다
    g.fillStyle = '#ffd23f'; g.font = `${11 * u}px system-ui, sans-serif`
    for (let i = 0; i < 3; i++) { const t = tnow * 7 + i * 2.1; g.fillText('★', x - F * p.dir * 73 * u * big + Math.cos(t) * 12 * u, y - 26 * u + Math.sin(t) * 4 * u) }
  } else if (ctls[p.team] === p) {   // 1P · 2P(온라인 상대)
    const tx = x + up(0, 96)[0] * big, ty = y - 96 * u * big
    g.fillStyle = PC[p.team]; g.beginPath(); g.moveTo(tx - 6, ty - 4); g.lineTo(tx + 6, ty - 4); g.lineTo(tx, ty + 4); g.fill()
    g.font = '800 13px system-ui, sans-serif'; g.fillText(p.team ? '2P' : '1P', tx, ty - 13)
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
  const bg = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r)   // 위 왼쪽에서 빛을 받은 공
  bg.addColorStop(0, '#ffb27a'); bg.addColorStop(0.55, '#e3681f'); bg.addColorStop(1, '#8c3a0e')
  g.fillStyle = bg; oval(0, 0, r, r); g.fill()
  g.rotate(ball.rot)
  g.strokeStyle = 'rgba(60,22,4,.85)'; g.lineWidth = 1.1
  g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.stroke()
  g.beginPath(); g.arc(-r * 1.25, 0, r * 0.95, -0.9, 0.9); g.stroke()
  g.beginPath(); g.arc(r * 1.25, 0, r * 0.95, Math.PI - 0.9, Math.PI + 0.9); g.stroke()
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
  const L = myT, R = 1 - myT   // 내 팀이 왼쪽(들어온 사람은 화면도 뒤집혀 있다)
  g.textAlign = 'right'; g.fillStyle = TEAMS[sides[L]].color; g.fillText(TEAMS[sides[L]].name, W / 2 - 66, 26)
  g.textAlign = 'center'; g.fillStyle = '#ffd23f'; g.fillText(`${pad(score[L])}-${pad(score[R])}`, W / 2, 26)
  g.textAlign = 'left'; g.fillStyle = TEAMS[sides[R]].color; g.fillText(TEAMS[sides[R]].name, W / 2 + 66, 26)
  // 내 팀 궁극기 게이지 — 얼굴 둘레가 차오른다. 지금 움직이는 선수의 궁극기 이름을 옆에
  const mine = team(myT), x0 = W / 2 - 150, ctl = ctls[myT]
  mine.forEach((p, i) => {
    const cx = x0 + i * 46, cy = H - 24, ready = p.ult >= 1, hue = skillOf(p).def ? 190 : 45, w = Math.sin(tnow * 10)
    g.fillStyle = 'rgba(0,0,0,.6)'; oval(cx, cy, 19, 19); g.fill()
    face(p.f, cx - 15, cy - 15, 30)
    g.lineWidth = 3.5; g.strokeStyle = !ready ? '#6f9bff' : ultReady(p) ? `hsl(${hue + 10 * w} 100% ${62 + 14 * w}%)` : `hsla(${hue} 60% 70% / .55)`   // 다 찼어도 때가 아니면 흐리게
    g.beginPath(); g.arc(cx, cy, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.ult); g.stroke()
    if (p === ctl) { g.strokeStyle = '#ffd23f'; g.lineWidth = 2; oval(cx, cy, 22, 22); g.stroke() }
    if (offense !== myT && p.acc) { g.fillStyle = '#5fff9a'; oval(cx + 15, cy - 15, 5, 5); g.fill() }   // 수비 가속이 남았다
  })
  if (ctl) {
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '800 15px system-ui, sans-serif'
    const sk = skillOf(ctl), now = ultReady(ctl)
    g.fillStyle = now ? sk.def ? '#9ff0ff' : '#ffd23f' : '#e9edf5'
    g.fillText(`${sk.name}(${sk.def ? '수비' : '공격'})${ctl.ult < 1 ? ` ${Math.floor(ctl.ult * 100)}%` : now ? ' — 준비!' : sk.def ? ' — 수비 때' : ' — 공을 잡으면'}`, x0 + 5 * 46 - 10, H - 24)
  }
}

/** 궁극기 컷인 — 선수가 기를 모은 뒤(0.16초) 팀 색 띠가 튀어 들어와(easeOutBack) 얼굴 · 기술 이름을 보여 주고 빠진다. 띠는 선수를 가리지 않게 위나 아래로 */
function cutIn() {
  const { p, t } = cut, T = TEAMS[sides[p.team]], sk = skillOf(p)
  if (t < 0.16) return
  const x = Math.min(1, (t - 0.16) / 0.2), k = 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2, out = sm(clamp((t - 0.74) / 0.14, 0, 1))
  const [, py] = P(p.x, p.z, p.h + 45)
  g.save(); g.translate((k - 1) * W + out * W * 1.1, py > H / 2 + 20 ? 64 : 318)   // 선수가 아래쪽이면 띠는 위로
  g.fillStyle = T.dark; g.beginPath(); g.moveTo(0, 22); g.lineTo(W, 0); g.lineTo(W, 136); g.lineTo(0, 158); g.fill()
  g.fillStyle = T.color; g.beginPath(); g.moveTo(0, 32); g.lineTo(W, 10); g.lineTo(W, 126); g.lineTo(0, 148); g.fill()
  g.fillStyle = 'rgba(255,255,255,.3)'
  for (let i = 0; i < 14; i++) g.fillRect(((i * 137 + t * 2600) % (W + 240)) - 240, 20 + (i * 47) % 116, 80 + (i * 31) % 120, 2)   // 속도선
  const sx = (t - 0.3) * 2600 % (W + 400) - 200   // 빛이 한 번 쓸고 지나간다
  g.fillStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.moveTo(sx, 10); g.lineTo(sx + 60, 10); g.lineTo(sx - 20, 150); g.lineTo(sx - 80, 150); g.fill()
  g.fillStyle = '#fff'; oval(150, 79, 66, 66); g.fill()
  g.strokeStyle = sk.def ? '#7fe8ff' : '#ffd23f'; g.lineWidth = 5; g.stroke()
  face(p.f, 86, 15, 128)
  text(`${sk.def ? 'DEFENSE' : 'OFFENSE'} ULTIMATE · ${p.f.name}`, 560, 38, 17, '#fff', T.dark)
  const pop = 1 + 0.3 * Math.max(0, 1 - (t - 0.22) / 0.14)   // 기술 이름은 크게 튀어나왔다 자리 잡는다
  g.save(); g.translate(560, 84); g.scale(pop, pop); text(`${sk.name}!`, 0, 0, 50, sk.def ? '#9ff0ff' : '#ffd23f'); g.restore()
  text(sk.desc, 560, 126, 15, '#fff', T.dark)
  g.restore()
}

function selectScreen() {
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#3a2414'); bg.addColorStop(1, '#1d120a')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  text(net ? `ONLINE 1:1 · 방 ${net.code}` : '★ TEAM SELECT ★', W / 2, 38, 34, '#8ef08a', '#0d2a10')
  g.font = '700 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = '#ffe08a'; g.fillText('■ 공격 궁극기 — 공을 잡았을 때', W / 2 - 110, 66); g.fillStyle = '#9ff0ff'; g.fillText('■ 수비 궁극기 — 수비 때', W / 2 + 110, 66)
  const tag = (cx, cy, label, color, dx = 0) => { g.fillStyle = color; g.fillRect(cx + dx, cy, 40, 24); g.fillStyle = '#2a1400'; g.font = '900 15px system-ui, sans-serif'; g.fillText(label, cx + dx + 20, cy + 13) }
  CARDS.forEach(([cx, cy], i) => {
    const T = TEAMS[i], c = g.createLinearGradient(cx, cy, cx, cy + CARD_H)
    c.addColorStop(0, T.color); c.addColorStop(1, T.dark)
    g.fillStyle = c; g.fillRect(cx, cy, CARD_W, CARD_H)
    T.five.forEach((f, j) => {
      const x = cx + 15 + j * 81, y = cy + 14
      face(f, x, y, 76)
      g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillStyle = '#fff'; g.font = '700 12px system-ui, sans-serif'; g.fillText(f.name.length > 6 ? `${f.name.slice(0, 6)}…` : f.name, x + 38, y + 88)
      g.fillStyle = SKILLS[i][j].def ? '#9ff0ff' : '#ffe08a'; g.font = '700 10.5px system-ui, sans-serif'; g.fillText(SKILLS[i][j].name, x + 38, y + 104)
    })
    text(T.name, cx + CARD_W / 2, cy + 168, 32, '#fff', '#120a06')
    const theirs = net?.peer && net.pick === i
    g.lineWidth = i === pick || theirs ? 6 : 2; g.strokeStyle = i === pick ? PC[myT] : theirs ? PC[1 - myT] : 'rgba(0,0,0,.5)'; g.strokeRect(cx, cy, CARD_W, CARD_H)
    if (i === pick) tag(cx, cy, myT ? '2P' : '1P', PC[myT])
    if (theirs) tag(cx, cy, myT ? '1P' : '2P', PC[1 - myT], i === pick ? 44 : 0)
    if (net) [[i === pick, 0], [theirs, 1]].forEach(([on, k]) => { if (on && net.ready[k]) text('READY', cx + CARD_W - 52, cy + 188 - 22 * k, 18, PC[k ? 1 - myT : myT], '#120a06') })   // k 0 = 나, 1 = 상대
  })
  g.fillStyle = '#e9edf5'; g.font = '600 15px system-ui, sans-serif'
  g.fillText(!net ? '방향키로 고르고 C(슛) · Enter 로 시작 — 휴대폰은 팀을 한 번 더 누르세요'
    : `vs ${net.peer?.name ?? '?'} — ${net.ready[0] ? `상대를 기다리는 중${net.ready[1] ? '' : '(팀 고르는 중)'}` : `팀을 고르고 C(슛) · Enter 로 준비${net.ready[1] ? ' — 상대는 준비 완료' : ''}`}`, W / 2, 528)
  if (msg) text(msg.text, W / 2, 300, 26, '#fff', '#120a06')
}

function draw() {
  if (mode === 'load') { g.fillStyle = '#0b0e14'; g.fillRect(0, 0, W, H); return text('LOADING…', W / 2, H / 2, 32) }
  if (mode === 'select') return selectScreen()
  if (mode === 'wait') {   // 온라인 — 상대를 기다린다
    g.fillStyle = '#1d120a'; g.fillRect(0, 0, W, H)
    text(net?.host ? `방 코드 ${net.code}` : `방 ${net?.code ?? ''}`, W / 2, H / 2 - 30, 64, '#ffd23f')
    return text(net?.host ? '상대가 이 코드로 들어오길 기다리는 중…' : '방에 들어가는 중…', W / 2, H / 2 + 40, 24, '#fff')
  }
  g.save()
  if (shake) g.translate((rnd() - 0.5) * shake, (rnd() - 0.5) * shake)
  const zk = cut ? sm(Math.min(1, cut.t / 0.22)) * (1 - sm(clamp((cut.t - 0.72) / 0.18, 0, 1))) : 0   // 궁극기 — 카메라가 그 선수에게 다가갔다가 터질 때 물러난다
  let zx = 0, zy = 0
  if (zk) { [zx, zy] = P(cut.p.x, cut.p.z, cut.p.h + 45); const z = 1 + 0.3 * zk; g.translate(zx, zy); g.scale(z, z); g.translate(-zx, -zy) }
  backdrop(); court()
  if (dpr >= 1.5) {   // 바닥에 비친 선수 — 발밑을 축으로 뒤집어 눌러 흐리게(코트 안에서만). 해상도를 낮춘 느린 기기는 뺀다
    g.save()
    g.beginPath(); [[0, 0], [CL, 0], [CL, CW], [0, CW]].forEach(([wx, wz], i) => { const [sx, sy] = P(wx, wz); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy) }); g.clip()
    reflecting = true
    for (const p of ps) { const [, fy] = P(p.x, p.z); g.save(); g.globalAlpha = 0.14; g.translate(0, fy * 1.55); g.scale(1, -0.55); drawPlayer(p, true); g.restore() }
    reflecting = false
    g.restore()
  }
  const items = [...ps.map(p => [p.z, () => drawPlayer(p)]), ...HOOP.map(h => [h.z - 0.5, () => drawHoop(h)])]
  if (!ball.owner) items.push([ball.z + 0.1, drawBall])
  for (const [, d] of items.sort((a, b) => a[0] - b[0])) d()
  g.globalCompositeOperation = 'lighter'   // 빛나는 파편
  for (const q of parts) { const [x, y, u] = P(q.x, q.z, q.h); g.globalAlpha = Math.min(1, q.t * 2.5); g.fillStyle = q.c; oval(x, y, 2 * u, 2 * u); g.fill() }
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  if (zk) {   // 궁극기 — 둘레는 어둡게 하고 집중선, 그 선수만 밝게 다시 그린다
    g.fillStyle = `rgba(4,6,14,${0.62 * zk})`; g.fillRect(-W, -H, W * 3, H * 3)
    focus(zx, zy, zk)
    drawPlayer(cut.p)
  }
  g.restore()
  overlay()
  if (flash > 0) { g.fillStyle = `rgba(255,250,235,${Math.min(0.8, flash * 3.6)})`; g.fillRect(0, 50, W, H - 50) }   // 궁극기가 터지는 순간 번쩍
  hud()
  if (cut) cutIn()
  if (msg && !cut) { const k = Math.min(1, (msg.t0 - msg.t) * 8); g.globalAlpha = Math.min(1, msg.t * 3); text(msg.text, W / 2, 230, 58 * (0.6 + 0.4 * k)); g.globalAlpha = 1 }   // 튀어나오듯 커진다
  if (mode === 'tip') text('공이 올라갈 때 슛 버튼(C)으로 점프!', W / 2, 470, 22, '#fff')
  if (mode === 'over') {
    g.fillStyle = 'rgba(0,0,0,.62)'; g.fillRect(0, 50, W, H - 50)
    text('GAME OVER', W / 2, 170, 64)
    const L = myT, R = 1 - myT, a = score[L], b = score[R]   // 내 팀이 앞
    text(`${TEAMS[sides[L]].name} ${a} - ${b} ${TEAMS[sides[R]].name}`, W / 2, 255, 34, '#fff')
    text(a > b ? 'YOU WIN!' : a < b ? 'YOU LOSE' : 'DRAW', W / 2, 335, 50, a > b ? '#8ef08a' : a < b ? '#ff6b6b' : '#ffd23f')
    if (net?.peer) text(`vs ${net.peer.name}${net.rec ? ` — ${net.rec}` : ''}`, W / 2, 388, 20, '#fff')
    text(net ? '팀 선택으로 — Enter · 화면 누르기' : '다시 하기 — Enter · 화면 누르기', W / 2, 430, 20, '#e9edf5')
  }
}

let flashes = []
let last = 0, ulShown = -1, ulNow = false, drawDt = 0, drawN = 0, reflecting = false, flash = 0, ema = 16, slowT = 0   // reflecting = 바닥 반사를 그리는 중(자세를 움직이지 않는다) · flash = 궁극기 번쩍임
function frame(t) {
  const ms = t - last, dt = Math.min(0.05, ms / 1000 || 0)
  last = t; drawDt = dt; drawN++
  if (net && !net.host && PLAY.has(mode)) { watch(dt); guestInput() }   // 들어온 사람은 받은 장면을 그리고 버튼을 보낸다
  else update(dt)
  if (net?.host && net.peer && PLAY.has(mode) && (mode !== 'over' || wait > -2) && tnow - net.at >= (direct() ? 1 / 15 : 1 / 10)) { net.at = tnow; stream(snap()) }
  draw()
  // 느린 기기 — 경기 중 1.5초 넘게 45fps 밑이면 해상도를 한 단계 낮춘다(2 → 1.5 → 1.25 → 1). 다시 올리지는 않는다
  if (ms > 0 && ms < 100 && (mode === 'play' || mode === 'dead')) {
    ema += (ms - ema) * 0.08; slowT = ema > 22 ? slowT + ms / 1000 : 0
    if (slowT > 1.5 && dpr > 1) { resize(dpr > 1.5 ? 1.5 : dpr > 1.25 ? 1.25 : 1); slowT = 0; ema = 16 }
  }
  const c = (mode === 'play' || mode === 'dead') && ctls[myT], ul = c ? Math.floor(c.ult * 50) / 50 : 0, now = !!c && ultReady(c)   // 휴대폰 궁극기 버튼 — 둘레 게이지, 지금 쓸 수 있으면 빛난다
  if (ul !== ulShown || now !== ulNow) { ulShown = ul; ulNow = now; ulBtn.style.setProperty('--g', ul); ulBtn.classList.toggle('ready', now) }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

await loadData()
const kr = data.players.filter(p => p.server === 'kr')
TEAMS.forEach((T, ti) => {
  T.five = lineup(kr, ti).map((p, i) => {
    const pos = i + 1, f = { name: p ? p.short || p.name : `${pos}번`, num: NBA_NUM[p?.id] ?? NUMS[i], img: null, gear: gearOf(p?.id || `${ti}-${pos}`) }
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
    card.querySelector('small').textContent = `${POS[j + 1]} · ${f.name} · ${sk.def ? '수비 궁극기 — 수비 때' : '공격 궁극기 — 공을 잡았을 때'}`
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
// 포지션 특성 표 — STATS 의 설명
document.getElementById('pos-table').replaceChildren(...STATS.map((S, i) => {
  const tr = document.createElement('tr'), th = Object.assign(document.createElement('th'), { textContent: POS[i + 1] }), td = Object.assign(document.createElement('td'), { textContent: S.note })
  tr.append(th, td)
  return tr
}))
mode = 'select'
roomUI(); records()
const inv = new URL(location.href).searchParams.get('room')   // 받은 링크(?room=1234)로 왔으면 바로 들어간다(로그인이 안 돼 있으면 로그인부터)
if (/^\d{4}$/.test(inv ?? '')) { $('room-code').value = inv; openRoom(inv) }
