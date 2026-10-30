// 덩크 광장 — 덩크 시티 선수가 되어 길거리 코트에 모이는 곳. 걸어 다니며 채팅 · 몸짓(제스처) · 슛. 머리 메뉴 「게임」 아래 줄의 넷째.
// 장면(코트 · 골대 · 배경)은 스트리트 3:3 과 같다(court3d.js). 사람은 Quaternius Ultimate Modular Men · Women(CC0, assets/quaternius) 몸에
//   고른 덩크 시티 선수 얼굴 그림을 입힌 머리 — 피부 · 머리색 · 등번호도 그 선수, 유니폼은 팀 색(아일라만 여자 몸). 손 인사 · 걷기 · 달리기는 모델 동작, 나머지는 팔 · 다리 · 허리를 덧놓는다. 로그인하면 같은 방(?room=, 기본 main)의 사람들과 Supabase Realtime 채널 plaza-<방>에서 만난다 —
//   누가 있나(presence: 이름 · 캐릭터 · 팀)와 짧은 알림(broadcast: 이동 · 점프 · 슛 · 몸짓 · 채팅)만 오간다. 로그인 안 하면 혼자 논다.
// 이동은 스틱 · 방향키가 바뀔 때만 보낸다(자리 · 속도 · 방향) — 받는 쪽이 같은 걸음으로 이어 걷고, 어긋난 만큼 부드럽게 당긴다. 멈춰 있으면 아무것도 안 보낸다
//   (Realtime 무료 한도: 초당 100 · 한 달 200만 메시지 — 받는 사람마다 센다).
// 슛은 쏜 사람 브라우저가 들어가는지 정해 같이 보낸다 — 모두 같은 장면을 본다. 공은 사람마다 하나(주고받기 없음).
// 키: 방향키 · WASD 이동(위가 골대), 슛 스페이스 · C, 점프 X, 몸짓 1~7, 채팅 Enter. 휴대폰은 스틱 · 버튼.
// ponytail: 채팅은 저장 · 검열 없음(그때 방에 있는 사람만 본다) · 보낸 사람 아이디 · 이름은 보내는 화면이 적는 값이라 화면 코드를 고치면 속일 수 있다(덩크 아케이드 온라인과 같다) ·
//   방 인원 제한 없음(메시지가 사람 수의 제곱으로 는다 — 붐비면 ?room= 으로 나눈다) · 몸끼리 부딪히지 않는다 · 소리 없음
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js'
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js'   // 'three' 는 페이지의 importmap 이 위 주소로 — three 가 한 벌만 뜬다
import { clone as cloneRig } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/SkeletonUtils.js'
import { mountTop, faceOf } from './app.js?v=fb02b445'
import { loadData, data, kr, startAuth, me as who, auth, loggedIn, charGrid, h } from './board.js?v=4233415a'
import { sb } from './auth.js?v=1fbb8e2f'
import { TEAMS, NUMS, NBA_NUM, cutHead, skinOf, SKIN } from './vipers.js?v=c92ed58c'
import { R3, RIM, sm, wx, wz, LIFT, RIM_Y, RIM_Z, scene, part, toon, tex, floorMat, rimG, net as hoopNet, scenery, BALL, ballMat, hairOf, yaw } from './court3d.js?v=8016bbac'

mountTop('/plaza/')

const $ = id => document.getElementById(id)
const glC = $('plaza3d'), hudC = $('plaza'), g = hudC.getContext('2d')
const W = 960, H = 540                                   // 겹친 2D 화면(이름 · 말풍선 · 채팅 줄)
const SPD = 160, GRAV = 1100, JUMP = 300                 // 단위는 코트와 같다(0.1피트)
const X0 = -100, X1 = 600, Y0 = -95, Y1 = 600            // 걸을 수 있는 곳 — 철망 안 아스팔트까지
const POLE = { x: 250, y: -41 }                          // 골대 기둥
const DUNKS = ['SLAM DUNK!', 'TOMAHAWK!', 'WINDMILL!', 'REVERSE!']   // style — 0 · 3 은 두 손, 1 · 2 는 한 손, 3 은 돌아서
// 몸짓 — T 초 동안(0 이면 움직일 때까지). 동작은 animate
const EMO = [['👋', '손 인사', 2.2], ['👏', '박수', 2.2], ['💪', '알통', 2], ['🙌', '환호', 2.2], ['🕺', '춤', 3.6], ['🙇', '꾸벅', 1.6], ['🧘', '앉기', 0]]
const ROOM = (new URLSearchParams(location.search).get('room') || '').replace(/[^\w-]/g, '').slice(0, 20) || 'main'

const rnd = Math.random
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const num = (v, a, b) => Number.isFinite(v) ? clamp(v, a, b) : a           // 받은 값 — 숫자가 아니면 버린다
const r1 = v => Math.round(v * 10) / 10
const toRim = p => Math.hypot(p.x - RIM.x, p.y - RIM.y)
const clean = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80)
const store = { get() { try { return JSON.parse(localStorage.getItem('plaza.v1')) || {} } catch { return {} } }, set(v) { try { localStorage.setItem('plaza.v1', JSON.stringify(v)) } catch {} } }

let me = null, tnow = 0, logs = [], pops = []   // me = 내 선수(선수 데이터를 받은 뒤)
const others = new Map(), early = new Map()   // 아이디 → 사람 · presence 보다 먼저 온 이동
const crew = new THREE.Group()
scene.add(crew)
const meRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 40).rotateX(-Math.PI / 2), floorMat(0xffd23f))
meRing.position.y = 0.015
scene.add(meRing)

function person(id, name, c, team) {
  const bm = part(scene, BALL, ballMat)
  bm.visible = false
  return { id, name, c, team, f: null, ready: false, x: 200 + rnd() * 100, y: 300 + rnd() * 80, h: 0, vh: 0, vx: 0, vy: 0, dir: -Math.PI / 2, ax: 0, ay: 0, cx: 0, cy: 0,
    act: null, t: 0, T: 0, up: false, done: false, mk: false, a: 0, d0: 0, x0: 0, y0: 0, x1: 0, y1: 0, style: 0, spin: 0, emo: null, said: null,
    m: null, bm, ball: { st: 'hand', t: 0, T: 0, p0: new THREE.Vector3(), v: new THREE.Vector3(), mk: false, a: 0, arc: 0 } }
}
const everyone = () => [me, ...others.values()]
const log = (name, text, c = '#c9d1d9') => { logs.push({ name, text, c, at: tnow }); if (logs.length > 30) logs.shift() }
const pop = (p, text, c = '#fff') => pops.push({ p, text, c, t: 1.3 })

// ---------------------------------------------------------------- 몸 — Quaternius Ultimate Modular Men · Women(CC0) + 덩크 시티 얼굴

// 몸 파일은 원본에서 머리를 빼고 동작 넷(Idle · Walk · Run · Wave)만 남겨 만든 것(tools/plaza-bodies.mjs). 남자는 Beach 몸 · 반바지 + Casual_2 운동화, 여자는 Casual.
// 재질 이름 — Skin(피부) · Jersey(상의) · Shorts(하의) · Trim(반바지 줄)을 사람마다 칠한다. 머리는 고른 선수 얼굴 그림을 공에 입혀 머리 뼈에 붙인다
const BODY = { m: '/assets/quaternius/male.glb', f: '/assets/quaternius/female.glb' }, FEMALE = new Set(['al'])   // 국내 서버 여자 선수는 아일라뿐
const loader = new GLTFLoader(), kits = new Map()
const kit = sex => kits.get(sex) ?? kits.set(sex, loader.loadAsync(BODY[sex]).then(study)).get(sex)
const local = (bone, v) => bone.worldToLocal(v.clone())   // 모델 자리 → 뼈 기준(처음 자세에서)
/** 처음 자세에서 머리 · 등판 · 가슴 번호를 붙일 자리(뼈 기준)와 엉덩이 높이를 잰다 */
function study(g) {
  g.scene.updateMatrixWorld(true)
  const bone = n => g.scene.getObjectByName(n), head = bone('Head'), chest = bone('Chest'), at = o => o.getWorldPosition(new THREE.Vector3())
  const hp = at(head), box = new THREE.Box3(), P = new THREE.Vector3()
  g.scene.traverse(o => {   // 가슴 높이 몸통 앞뒤
    if (!o.isSkinnedMesh || o.material.name !== 'Jersey') return
    const pos = o.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) { P.fromBufferAttribute(pos, i); if (Math.abs(P.x) < 0.1 && P.y > hp.y - 0.32 && P.y < hp.y - 0.12) box.expandByPoint(P) }
  })
  const R = 0.14, cy = (box.min.y + box.max.y) / 2   // 머리 반지름(미터)
  const unturn = o => o.getWorldQuaternion(new THREE.Quaternion()).invert()   // 붙인 것이 모델 축을 따르게
  return { g, R, hipY: at(bone('Hips')).y,
    head: { pos: local(head, new THREE.Vector3(0, hp.y + R * 0.92, hp.z + 0.03)), q: unturn(head) },
    back: { pos: local(chest, new THREE.Vector3(0, cy, box.min.z - 0.012)), q: unturn(chest) },
    front: { pos: local(chest, new THREE.Vector3(0, cy + 0.04, box.max.z + 0.012)), q: unturn(chest) } }
}
// 등 — 이름 · 큰 번호, 가슴 — 작은 번호(바탕은 비운다)
const backTex = (T, num, name) => tex(256, 160, (c, w) => {
  c.textAlign = 'center'; c.lineJoin = 'round'; c.strokeStyle = T.dark; c.fillStyle = '#fff'
  c.font = '800 30px system-ui, sans-serif'; c.lineWidth = 7; c.strokeText(name, w / 2, 38); c.fillText(name, w / 2, 38)
  c.font = '900 104px system-ui, sans-serif'; c.lineWidth = 12; c.strokeText(num, w / 2, 146); c.fillText(num, w / 2, 146)
})
const chestTex = (T, num) => tex(128, 128, (c, w) => { c.textAlign = 'center'; c.lineJoin = 'round'; c.strokeStyle = T.dark; c.fillStyle = '#fff'; c.font = '900 76px system-ui, sans-serif'; c.lineWidth = 10; c.strokeText(num, w / 2, 96); c.fillText(num, w / 2, 96) })
function build(p, k, f) {
  const model = cloneRig(k.g.scene), T = TEAMS[p.team] ?? TEAMS[0], female = FEMALE.has(p.c)
  const paint = { Skin: f.skin || SKIN, Jersey: T.color, Shorts: female ? T.dark : T.color, Trim: T.trim }
  model.traverse(o => { if (o.isMesh) { o.material = toon(paint[o.material.name] ?? o.material.color); o.castShadow = true; o.frustumCulled = false } })
  const b = {}
  model.traverse(o => { if (o.isBone) b[o.name] = o })
  const stick = (bone, obj, at) => { obj.position.copy(at.pos); obj.quaternion.copy(at.q); bone.add(obj); return obj }
  // 머리 — 공(머리카락 색) 앞쪽에 얼굴 그림을 감싼다(스트리트 3:3 과 같은 방식) + 목
  const hd = stick(b.Head, new THREE.Group(), k.head), R = k.R
  part(hd, new THREE.SphereGeometry(R, 24, 18), toon(f.hair || '#2a1d16'))
  if (f.head) { const t = new THREE.CanvasTexture(f.head); t.colorSpace = THREE.SRGBColorSpace; hd.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.024, 30, 20, Math.PI / 2 - 1.8, 3.6), Object.assign(toon(0xffffff, t), { alphaTest: 0.5 }))) }
  part(hd, new THREE.CylinderGeometry(R * 0.36, R * 0.42, R * 0.9, 12), toon(f.skin || SKIN), 0, -R * 0.95, -0.02, false)
  const decal = (t, w, hh, at, ry) => stick(b.Chest, new THREE.Mesh(new THREE.PlaneGeometry(w, hh), Object.assign(toon(0xffffff, t), { alphaTest: 0.4 })), at).rotateY(ry)
  decal(backTex(T, String(f.num), p.name.slice(0, 10)), 0.27, 0.17, k.back, Math.PI)
  decal(chestTex(T, String(f.num)), 0.11, 0.11, k.front, 0)
  const root = new THREE.Group()
  root.add(model)
  const mixer = new THREE.AnimationMixer(model), acts = {}
  for (const c of k.g.animations) acts[c.name] = mixer.clipAction(c)
  return { root, model, mixer, acts, cur: null, b, hd, k, w: {}, dir: {} }
}
/** 몸 — 고른 선수(얼굴 그림 · 피부 · 머리색 · 등번호)와 팀(유니폼 색)으로. 다 만든 뒤 옛 몸과 바꾼다(그동안은 옛 몸 그대로) */
function dress(p) {
  const P0 = data.byId.get(p.c), img = new Image()
  const f = p.next = { img, num: NBA_NUM[P0?.id] ?? NUMS[(P0?.pos || 1) - 1] }
  const done = async () => {
    try { f.head = cutHead(img); [f.skin] = skinOf(img); f.hair = hairOf(f.head) } catch {}   // 실패하면 얼굴 없는 머리 · 기본 피부색
    const k = await kit(FEMALE.has(p.c) ? 'f' : 'm').catch(e => console.warn('캐릭터 모델을 못 받았어요', e))
    if (p.next !== f || !k) return   // 그새 또 바꿨거나 나갔다
    const m = build(p, k, f)
    if (p.m) crew.remove(p.m.root)
    crew.add(m.root)
    p.m = m; p.f = f; p.ready = true
  }
  img.onload = img.onerror = done
  if (P0) img.src = faceOf(P0)
  else done()
}
function drop(p) {
  if (p.m) crew.remove(p.m.root)
  p.m = p.f = p.next = null; p.ready = false; scene.remove(p.bm)
}

// ---------------------------------------------------------------- 움직임 — 나와 남이 같은 걸음(받은 방향 · 버튼으로 이어 걷는다)

function walk(p, dt) {
  if (p.act) acting(p, dt)
  const glued = p.act === 'lay' || p.act === 'dunk'   // 레이업 · 덩크는 acting 이 자리 · 높이를 정한다
  if (!glued) {
    if (p.h > 0 || p.vh > 0) { p.vh -= GRAV * (p.act === 'shoot' ? 0.4 : 1) * dt; p.h = Math.max(0, p.h + p.vh * dt); if (p.h === 0) p.vh = 0 }
    if (p.h === 0) {   // 땅에서만 방향을 튼다 — 뛰면 그대로 날아간다
      const go = !p.act, k = 1 - Math.exp(-10 * dt)
      p.vx += ((go ? p.ax * SPD : 0) - p.vx) * k; p.vy += ((go ? p.ay * SPD : 0) - p.vy) * k
    }
    p.x += p.vx * dt; p.y += p.vy * dt
  }
  if (p.cx || p.cy) {   // 받은 자리와 어긋난 만큼 — 조금씩 당긴다
    const k = 1 - Math.exp(-6 * dt)
    p.x += p.cx * k; p.y += p.cy * k; p.cx -= p.cx * k; p.cy -= p.cy * k
    if (Math.abs(p.cx) + Math.abs(p.cy) < 0.5) p.cx = p.cy = 0
  }
  p.x = clamp(p.x, X0, X1); p.y = clamp(p.y, Y0, Y1)
  const dx = p.x - POLE.x, dy = p.y - POLE.y, d = Math.hypot(dx, dy)
  if (d < 20) { p.x = POLE.x + dx / (d || 1) * 20; p.y = POLE.y + dy / (d || 1) * 20 }
  const v = Math.hypot(p.vx, p.vy)
  const to = p.act ? Math.atan2(RIM.y - p.y, RIM.x - p.x) : v > 30 ? Math.atan2(p.vy, p.vx) : p.dir
  p.dir += ((to - p.dir + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, 14 * dt)
  if (p.emo) { p.emo.t += dt; if (p.ax || p.ay || (p.emo.T && p.emo.t > p.emo.T)) p.emo = null }   // 움직이면 몸짓을 그만둔다
  if (p.said && (p.said.t -= dt) <= 0) p.said = null
  moveBall(p, dt)
}
function acting(p, dt) {
  p.t += dt
  if (p.act === 'shoot') {   // 웅크렸다 뛰어 머리 위에서 놓는다
    if (p.t > 0.12 && !p.up) { p.up = true; p.vh = 200 }
    if (p.t > 0.38 && !p.done) { p.done = true; release(p, 0.45 + p.d0 / 700, 0.6 + p.d0 * 0.006) }
  } else if (p.act === 'lay') {
    const k = Math.min(1, p.t / p.T)
    p.x = p.x0 + (p.x1 - p.x0) * sm(k); p.y = p.y0 + (p.y1 - p.y0) * sm(k); p.h = 32 * Math.sin(Math.PI * k)
    if (k >= 0.6 && !p.done) { p.done = true; release(p, 0.3, 0.25) }
  } else if (p.act === 'dunk') {   // 0.42초에 림 — 그 뒤는 매달린다
    const k = Math.min(1, p.t / 0.42)
    p.x = p.x0 + (p.x1 - p.x0) * sm(k); p.y = p.y0 + (p.y1 - p.y0) * sm(k); p.h = 46 * Math.sin(k * Math.PI / 2) - (p.t > 0.42 ? 4 * sm(Math.min(1, (p.t - 0.42) / 0.2)) : 0)
    if (k >= 1 && !p.done) { p.done = true; Object.assign(p.ball, { st: 'drop', t: 0, kind: 'dunk' }); p.ball.p0.set(0, RIM_Y - 0.1, RIM_Z); p.ball.v.set(0, -2, 0.3); RIM.shake = 1; scored(p) }
  }
  if (p.t >= p.T) { if (p.act !== 'shoot') p.vh = 0; p.act = null }
}

/** 슛 — k: 0 점프슛 · 1 레이업 · 2 덩크. 들어가는지(mk) · 덩크 종류(style) · 빗나가 튀는 쪽(a)은 쏜 사람이 정한다 */
function shoot(p, k, mk, style, a) {
  const dx = p.x - RIM.x, dy = p.y - RIM.y, d = Math.hypot(dx, dy) || 1, r = k === 2 ? 11 : 22
  Object.assign(p, { act: ['shoot', 'lay', 'dunk'][k], t: 0, T: [0.9, 0.55, 0.85][k], up: false, done: false, mk, style, a, d0: d, emo: null, vx: 0, vy: 0,
    x0: p.x, y0: p.y, x1: RIM.x + dx / d * r, y1: RIM.y + dy / d * r })
}
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), RIMV = new THREE.Vector3(0, RIM_Y + 0.05, RIM_Z)
function release(p, T, arc) {
  const b = p.ball
  ballAt(p, b.p0)
  Object.assign(b, { st: 'fly', t: 0, T, mk: p.mk, a: p.a, arc, kind: p.act })
}
function moveBall(p, dt) {
  const b = p.ball
  if (b.st === 'fly' && (b.t += dt) >= b.T) {   // 림에 닿았다 — 들어가면 그물 아래로, 아니면 골대 반대쪽으로 튄다
    b.st = 'drop'; b.t = 0; RIM.shake = b.mk ? 0.5 : 1
    if (b.mk) { b.p0.set(0, RIM_Y - 0.1, RIM_Z); b.v.set(0, -1.5, 0.3); scored(p) }
    else { b.p0.set(Math.cos(b.a) * 0.24, RIM_Y + 0.08, RIM_Z + Math.abs(Math.sin(b.a)) * 0.24); b.v.set(Math.cos(b.a) * 1.8, 2.6, Math.abs(Math.sin(b.a)) * 1.8 + 0.8); missed(p) }
  } else if (b.st === 'drop') {
    b.v.y -= 9.8 * dt; b.p0.addScaledVector(b.v, dt)
    if (b.p0.y < 0.14) { b.p0.y = 0.14; b.v.y = Math.abs(b.v.y) * 0.6; b.v.x *= 0.8; b.v.z *= 0.8 }
    if ((b.t += dt) > 1.6) b.st = 'hand'
  }
}
function scored(p) {
  const k = p.ball.kind
  pop(p, k === 'dunk' ? DUNKS[p.style] : k === 'lay' ? 'NICE!' : p.d0 > R3 ? '3점!' : 'SWISH!', '#ffd23f')
  if (p === me) { me.made = (me.made || 0) + 1; me.streak = (me.streak || 0) + 1; if (me.streak > 2) pop(me, `${me.streak}연속!`, '#3fb950') }
}
function missed(p) { pop(p, '아깝다!', '#9aa4b1'); if (p === me) me.streak = 0 }
function jump(p) { if (p.h === 0 && !p.act) { p.vh = JUMP; p.emo = null } }
function gesture(p, k) { if (!p.act && p.h === 0 && EMO[k]) p.emo = { k, t: 0, T: EMO[k][2] } }
function say(p, s) { if ((s = clean(s))) { p.said = { s, t: 6 }; log(p.name, s, p === me ? '#ffd23f' : '#fff') } }

// ---------------------------------------------------------------- 내 입력

const keys = new Set(), joy = { x: 0, y: 0 }
function axis() {
  const k = c => keys.has(c) ? 1 : 0
  const x = joy.x + k('ArrowRight') + k('KeyD') - k('ArrowLeft') - k('KeyA'), y = joy.y + k('ArrowDown') + k('KeyS') - k('ArrowUp') - k('KeyW')
  const d = Math.hypot(x, y)
  if (d < 0.2) return [0, 0]
  const a = Math.round(Math.atan2(y, x) / (Math.PI / 8)) * (Math.PI / 8), m = d > 0.6 ? 1 : 0.5   // 16방향 · 두 빠르기 — 조금씩 흔들려도 다시 보내지 않게
  return [r1(Math.cos(a) * m), r1(Math.sin(a) * m)]
}
function tryShoot() {
  const p = me
  if (p.act || p.h > 0 || p.ball.st !== 'hand' || !p.ready) return
  const d = toRim(p), k = d < 75 ? 2 : d < 120 ? 1 : 0
  const mk = rnd() < (k === 2 ? 0.97 : k === 1 ? 0.85 : clamp(0.9 - (d - 120) * 0.003, 0.06, 0.8)), style = rnd() * 4 | 0, a = r1(rnd() * Math.PI * 2)
  shoot(p, k, mk, style, a)
  send({ t: 'sh', x: r1(p.x), y: r1(p.y), k, mk, s: style, a })
}
function tryJump() { if (me.h === 0 && !me.act) { jump(me); send({ t: 'jp', x: r1(me.x), y: r1(me.y) }) } }
function tryGesture(k) { gesture(me, k); if (me.emo) send({ t: 'em', k }) }
addEventListener('keydown', e => {
  const c = e.code
  if (e.target.closest?.('input, textarea, select, button, a, dialog')) return
  if (c === 'Enter') { e.preventDefault(); if (!$('chat').hidden) chatIn.focus(); return }
  if (/^Digit[1-7]$/.test(c)) return void (e.repeat || tryGesture(+c[5] - 1))
  if (!/^(Arrow\w+|Key[WASDCX]|Space)$/.test(c)) return
  e.preventDefault()
  keys.add(c)
  if (e.repeat) return
  if (c === 'Space' || c === 'KeyC') tryShoot()
  else if (c === 'KeyX') tryJump()
})
addEventListener('keyup', e => keys.delete(e.code))
addEventListener('blur', () => keys.clear())
const stick = $('stick'), knob = stick.firstElementChild
function steer(e) {
  const r = stick.getBoundingClientRect(), Rr = r.width / 2
  let x = (e.clientX - r.left - Rr) / Rr, y = (e.clientY - r.top - Rr) / Rr
  const d = Math.hypot(x, y)
  if (d > 1) { x /= d; y /= d }
  joy.x = x; joy.y = y
  knob.style.transform = `translate(${x * Rr * 0.55}px, ${y * Rr * 0.55}px)`
}
const letGo = () => { joy.x = joy.y = 0; knob.style.transform = '' }
stick.addEventListener('pointerdown', e => { stick.setPointerCapture(e.pointerId); steer(e) })
stick.addEventListener('pointermove', e => stick.hasPointerCapture(e.pointerId) && steer(e))
stick.addEventListener('pointerup', letGo)
stick.addEventListener('pointercancel', letGo)
for (const [id, fn] of [['btn-sh', tryShoot], ['btn-jp', tryJump]]) $(id).addEventListener('pointerdown', e => { e.preventDefault(); fn() })
$('emo').replaceChildren(...EMO.map(([icon, name], k) => {
  const b = h('button', { type: 'button', title: `${name} (${k + 1})`, 'aria-label': name }, icon)
  b.addEventListener('click', () => { b.blur(); tryGesture(k) })   // 버튼에 포커스가 남으면 방향키를 게임이 못 받는다
  return b
}))
// 채팅 — Enter 로 칸에 들어가고, 보내면 칸에서 나와 다시 움직인다
const chatIn = $('chat-in')
let lastChat = -9
$('chat').addEventListener('submit', e => {
  e.preventDefault()
  const s = clean(chatIn.value)
  chatIn.value = ''; chatIn.blur()
  if (!s || tnow - lastChat < 0.8) return
  lastChat = tnow
  say(me, s); send({ t: 'ch', s })
})
chatIn.addEventListener('keydown', e => { if (e.key === 'Escape') chatIn.blur() })
chatIn.addEventListener('focus', () => keys.clear())
$('pz-login').addEventListener('click', () => loggedIn())

// 캐릭터 · 팀 고르기 — 이 브라우저에 기억한다
function pickChar() {
  let dlg = $('pz-dialog')
  if (!dlg) {
    const grid = charGrid({ isOn: id => id === me.c, pick: id => change({ c: id }) })
    const teams = TEAMS.map((T, i) => h('button', { type: 'button', className: 'pz-team', style: `--team:${T.color}`, onclick: () => { change({ team: i }); sync() } }, T.name))
    const sync = () => { teams.forEach((b, i) => b.setAttribute('aria-pressed', i === me.team)); grid.sync() }
    dlg = h('dialog', { id: 'pz-dialog', className: 'rc-dialog pz-dialog' },
      h('header', {}, h('h2', {}, '내 캐릭터'), h('button', { type: 'button', 'aria-label': '닫기', onclick: () => dlg.close() }, '✕')),
      h('div', { className: 'rc-chars' }, h('h3', {}, '유니폼 색'), h('div', { className: 'pz-teams' }, teams), h('h3', {}, '선수 — 몸 · 피부 · 머리색 · 등번호 · 이름표 얼굴'), grid))
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close() })
    document.body.append(dlg)
    dlg.sync = sync
  }
  dlg.sync()
  dlg.showModal()
}
function change(v) {
  Object.assign(me, v)
  store.set({ c: me.c, team: me.team })
  dress(me)
  net?.live && net.ch.track(meta())
}
$('btn-char').addEventListener('click', e => { e.currentTarget.blur(); pickChar() })

// ---------------------------------------------------------------- 같은 방 사람들 — Supabase Realtime

let net = null   // { ch, live, synced }
let sent = { ax: 0, ay: 0 }, sentAt = -9, helloT = 0
const meta = () => ({ n: me.name, c: me.c, tm: me.team })
const send = m => net?.live && net.ch.send({ type: 'broadcast', event: 'm', payload: { ...m, f: who.id } })
const sendMove = () => { send({ t: 'mv', x: r1(me.x), y: r1(me.y), vx: r1(me.vx), vy: r1(me.vy), ax: me.ax, ay: me.ay }); sent = { ax: me.ax, ay: me.ay }; sentAt = tnow }

function connect() {
  if (net || !sb || !who || !me) return
  if (me.name !== who.name) { me.name = who.name; dress(me) }   // 등에 내 이름
  const ch = sb.channel(`plaza-${ROOM}`, { config: { broadcast: { self: false }, presence: { key: who.id } } })
  net = { ch, live: false, synced: false }
  ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload))
  ch.on('presence', { event: 'sync' }, () => net?.ch === ch && roster(ch.presenceState()))
  ch.on('presence', { event: 'join' }, ({ key }) => { if (key !== who.id) { clearTimeout(helloT); helloT = setTimeout(sendMove, 300) } })   // 새로 온 사람에게 내 자리를
  ch.subscribe(async st => {
    if (net?.ch !== ch) return
    net.live = st === 'SUBSCRIBED'
    if (net.live) { await ch.track(meta()); sendMove() }
  })
}
function leave() {
  if (!net) return
  sb.removeChannel(net.ch)
  net = null
  for (const p of others.values()) drop(p)
  others.clear()
}
addEventListener('pagehide', leave)

/** presence — 들어온 사람은 만들고, 캐릭터 · 팀 · 이름이 바뀌면 다시 입히고, 없어진 사람은 지운다 */
function roster(state) {
  const ids = new Set(Object.keys(state).filter(k => k !== who.id))
  for (const id of ids) {
    const m = state[id].at(-1), name = clean(m.n).slice(0, 20) || '이름 없음', c = data.byId.has(m.c) ? m.c : kr[0].id, team = num(m.tm, 0, 3) | 0
    let p = others.get(id)
    if (!p) {
      others.set(id, p = person(id, name, c, team))
      const e = early.get(id)
      if (e) { moved(p, e, true); early.delete(id) }
      if (net.synced) log('', `${name} 님이 들어왔어요`, '#9aa4b1')
      dress(p)
    } else if (p.c !== c || p.team !== team || p.name !== name) { Object.assign(p, { c, team, name }); dress(p) }
  }
  for (const [id, p] of others) if (!ids.has(id)) { others.delete(id); drop(p); log('', `${p.name} 님이 나갔어요`, '#9aa4b1') }
  if (!net.synced) { net.synced = true; log('', `광장 「${ROOM}」에 들어왔어요 — 지금 ${ids.size + 1}명`, '#9aa4b1') }
}
function onMsg(m) {
  if (!m || typeof m.t !== 'string' || m.f === who?.id) return
  const p = others.get(String(m.f))
  if (!p) { if (m.t === 'mv') { if (early.size > 50) early.clear(); early.set(String(m.f), m) } return }
  if (m.t === 'mv') moved(p, m)
  else if (m.t === 'jp') { moved(p, m, true); jump(p) }
  else if (m.t === 'sh') { moved(p, m, true); shoot(p, num(m.k, 0, 2) | 0, !!m.mk, num(m.s, 0, 3) | 0, num(m.a, 0, 7)) }
  else if (m.t === 'em') gesture(p, num(m.k, 0, EMO.length - 1) | 0)
  else if (m.t === 'ch') say(p, m.s)
}
function moved(p, m, snap) {
  const x = num(m.x, X0, X1), y = num(m.y, Y0, Y1)
  if (snap || Math.hypot(x - p.x, y - p.y) > 80) { p.x = x; p.y = y; p.cx = p.cy = 0 } else { p.cx = x - p.x; p.cy = y - p.y }
  if (m.t !== 'mv') return
  p.vx = num(m.vx, -SPD, SPD); p.vy = num(m.vy, -SPD, SPD); p.ax = num(m.ax, -1, 1); p.ay = num(m.ay, -1, 1)
}

// ---------------------------------------------------------------- 동작 — 모델에 든 동작(서기 · 걷기 · 달리기 · 손 인사) 위에 팔 · 다리 · 허리를 덧놓는다

function play(m, name, speed = 1) {
  const a = m.acts[name]
  a.timeScale = speed
  if (m.cur === a) return
  a.reset().play()
  if (m.cur) m.cur.crossFadeTo(a, 0.2, false)
  m.cur = a
}
// 덧놓기는 「이 뼈가 모델 기준 이쪽을 향하게」(뼈 → 다음 뼈 방향). 모델은 +z 를 보고 +x 가 왼쪽 — 오른팔 · 오른다리는 x 가 -
const CHAIN = { armR: ['UpperArmR', 'LowerArmR', 'WristR'], armL: ['UpperArmL', 'LowerArmL', 'WristL'], legR: ['UpperLegR', 'LowerLegR', 'FootR'], legL: ['UpperLegL', 'LowerLegL', 'FootL'], spine: ['Abdomen', 'Chest', 'Neck'] }
const P1 = new THREE.Vector3(), P2 = new THREE.Vector3(), D1 = new THREE.Vector3(), QA = new THREE.Quaternion(), QB = new THREE.Quaternion(), QM = new THREE.Quaternion()
function point(m, bone, child, dir, w) {
  bone.getWorldPosition(P1); child.getWorldPosition(P2)
  QA.setFromUnitVectors(P2.sub(P1).normalize(), D1.copy(dir).normalize().applyQuaternion(QM))
  bone.getWorldQuaternion(QB); QA.multiply(QB)                                  // 새 월드 회전
  bone.quaternion.slerp(bone.parent.getWorldQuaternion(QB).invert().multiply(QA), w)
  bone.updateMatrixWorld(true)
}
const v = (x, y, z) => new THREE.Vector3(x, y, z)
const mirror = d => d.map(u => v(-u.x, u.y, u.z))   // 오른쪽 → 왼쪽
function animate(p, dt) {
  const m = p.m, sp = Math.hypot(p.vx, p.vy), E = p.emo, A = p.act, t = E?.t ?? 0, want = {}
  p.spin = 0; m.model.position.y = 0
  play(m, E?.k === 0 ? 'Wave' : !A && p.h === 0 && sp > 110 ? 'Run' : !A && p.h === 0 && sp > 20 ? 'Walk' : 'Idle', sp > 110 ? sp / 160 : sp > 20 ? sp / 70 : 1)
  m.mixer.update(dt)
  const arms = (r1, r2, l1 = null, l2 = null) => { want.armR = [r1, r2]; want.armL = l1 ? [l1, l2] : mirror([r1, r2]) }
  const tuck = () => { want.legR = [v(-0.08, -0.8, 0.6), v(0, -0.9, -0.45)]; want.legL = mirror(want.legR) }   // 공중 — 무릎을 굽힌다
  if (A === 'shoot') {
    if (p.t < 0.12) arms(v(-0.3, -0.6, 0.7), v(0.4, 0.5, 0.75))                 // 공을 가슴에
    else if (!p.done) arms(v(-0.2, 0.75, 0.6), v(0.1, 0.9, 0.4))                // 이마 위로
    else arms(v(-0.1, 0.85, 0.5), v(0, 0.5, 0.85), v(0.3, 0.7, 0.6), v(0.1, 0.8, 0.5))   // 손목을 꺾고 팔을 뻗은 채
  } else if (A === 'lay') { arms(v(-0.15, 0.95, 0.25), v(-0.05, 1, 0.1), v(0.3, 0.1, 0.95), v(0.2, 0.4, 0.9)); want.legR = [v(0, -0.2, 0.98), v(0, -1, 0.1)]; want.legL = [v(0.05, -0.95, -0.3), v(0, -0.9, -0.4)] }
  else if (A === 'dunk') {
    const one = p.style === 1 || p.style === 2
    arms(v(-0.15, 0.92, 0.35), v(-0.05, 1, 0.15), one ? v(0.4, 0.2, 0.9) : null, one ? v(0.2, 0.4, 0.9) : null); tuck()
    if (p.style === 3) p.spin = Math.PI * sm(Math.min(1, p.t / 0.42))
  } else if (p.h > 0) { arms(v(-0.35, 0.9, 0.2), v(-0.15, 1, 0.1)); tuck() }   // 점프 — 두 팔을 번쩍
  else if (E) {
    const s = Math.sin(t * 7)
    if (E.k === 1) { const c = Math.abs(Math.sin(t * 9)); arms(v(-0.22, -0.5, 0.84), v(0.3 + 0.45 * c, 0.3, 0.86)) }   // 박수 — 두 손을 앞에서 모았다 벌린다
    else if (E.k === 2) arms(v(-1, 0.05, 0.1), v(-0.12, 1, 0.15 + 0.25 * Math.sin(t * 8)))                          // 알통 — 팔을 옆으로, 아래팔을 세운다
    else if (E.k === 3) { const c = 0.15 * Math.sin(t * 14); arms(v(-0.45, 0.88 + c, 0.15), v(-0.2, 1, 0.05)); m.model.position.y = 0.06 * Math.abs(Math.sin(t * 7)) }   // 환호 — 두 팔 번쩍, 들썩
    else if (E.k === 4) {                                                                                               // 춤 — 허리를 흔들며 팔을 번갈아
      want.spine = [v(0.3 * s, 1, 0.1), v(0.15 * s, 1, 0)]
      arms(v(-0.7, 0.2 + 0.6 * s, 0.5), v(-0.2, 0.9, 0.3), v(0.7, 0.2 - 0.6 * s, 0.5), v(0.2, 0.9, 0.3))
      m.model.position.y = 0.05 * Math.abs(Math.sin(t * 7)); p.spin = 0.4 * Math.sin(t * 3.5)
    } else if (E.k === 5) { const k = sm(Math.min(1, t / 0.35)) * (t > 1.15 ? Math.max(0, 1 - (t - 1.15) / 0.4) : 1); want.spine = [v(0, Math.cos(0.5 * k), Math.sin(0.5 * k)), v(0, Math.cos(0.9 * k), Math.sin(0.9 * k))] }   // 꾸벅
    else if (E.k === 6) {                                                                                               // 앉기 — 바닥에 다리를 뻗고 손으로 뒤를 짚는다
      m.model.position.y = -(m.k.hipY - 0.14)
      want.legR = [v(-0.12, 0, 1), v(-0.08, -0.12, 1)]; want.legL = mirror(want.legR); want.spine = [v(0, 1, -0.12), v(0, 1, -0.05)]
      arms(v(-0.3, -0.75, -0.55), v(-0.1, -0.95, -0.25))
    }
  } else if (p.ball.st === 'hand') want.armR = [v(-0.25, -0.9, 0.35), v(-0.1, -0.35 - 0.45 * (1 - Math.abs(Math.sin(tnow * 7.5))), 0.85)]   // 드리블 — 손이 공과 같이 오르내린다
  m.root.position.set(wx(p.x), p.h * LIFT, wz(p.y)); m.root.rotation.y = yaw(p) + p.spin   // 몸을 먼저 놓고 뼈를 돌린다
  m.model.getWorldQuaternion(QM)
  const k = 1 - Math.exp(-12 * dt)
  for (const key in CHAIN) {
    const w0 = m.w[key] ?? 0
    m.w[key] = w0 + ((want[key] ? 1 : 0) - w0) * k
    if (want[key]) m.dir[key] = want[key]
    if (m.w[key] < 0.002) continue
    const [a, b, c] = CHAIN[key].map(n => m.b[n])
    point(m, a, b, m.dir[key][0], m.w[key]); point(m, b, c, m.dir[key][1], m.w[key])
  }
}
const hand = (p, side, out) => p.m.b[`Middle1${side}`].getWorldPosition(out)   // 손바닥 가운데쯤
/** 공 자리 — 슛 · 덩크 · 점프는 손에, 몸짓 중에는 발 옆 바닥에, 아니면 드리블(손과 바닥 사이) */
function ballAt(p, out) {
  const b = p.ball
  if (b.st === 'fly') { const u = Math.min(1, b.t / b.T); return out.lerpVectors(b.p0, RIMV, u).setY(out.y + b.arc * 4 * u * (1 - u)) }
  if (b.st === 'drop') return out.copy(b.p0)
  if (!p.ready) return out.set(wx(p.x), 1.6, wz(p.y))
  const y = yaw(p), A = p.act
  if (p.emo) return out.set(wx(p.x) + Math.cos(y) * 0.45, 0.14, wz(p.y) - Math.sin(y) * 0.45)
  hand(p, 'R', V1); hand(p, 'L', V2)
  if (A === 'lay' || (A === 'dunk' && (p.style === 1 || p.style === 2))) return out.copy(V1).setY(V1.y + 0.1)
  if (A === 'shoot' || A === 'dunk' || p.h > 0) return out.addVectors(V1, V2).multiplyScalar(0.5).setY(Math.max(V1.y, V2.y) + 0.1)
  const d = Math.abs(Math.sin(tnow * 7.5))
  return out.set(V1.x + Math.sin(y) * 0.06, V1.y - 0.12 - (V1.y - 0.26) * d, V1.z + Math.cos(y) * 0.06)
}

// ---------------------------------------------------------------- 그리기

let renderer = null
try { renderer = new THREE.WebGLRenderer({ canvas: glC, antialias: true, powerPreference: 'high-performance' }) } catch {}
const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 200)
if (renderer) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap }
const camP = new THREE.Vector3(0, 9, 24), camL = new THREE.Vector3(0, 1, 6), cw = new THREE.Vector3(), lw = new THREE.Vector3()
function aim(dt) {   // 내 선수 뒤 위에서 골대 쪽을 본다. 처음(불러오는 중)은 코트를 돈다
  if (!me?.ready) { const a = tnow * 0.12; cw.set(Math.sin(a) * 15, 8.5, 7 + Math.cos(a) * 15); lw.set(0, 1.5, 4) }
  else { const x = wx(me.x), z = wz(me.y); cw.set(x * 0.85, 3.7, z + 5.6); lw.set(x * 0.95, 1.45, z - 2.4) }
  const k = 1 - Math.exp(-3 * dt)
  camP.lerp(cw, k); camL.lerp(lw, k)
  camera.position.copy(camP); camera.lookAt(camL)
}
let dpr = 0, cssW = 0, cssH = 0, maxD = 2
function size() {
  const d = Math.min(devicePixelRatio || 1, maxD), w = glC.clientWidth, hh = glC.clientHeight
  if (!w || (d === dpr && w === cssW && hh === cssH)) return
  dpr = d; cssW = w; cssH = hh
  hudC.width = W * d; hudC.height = H * d
  if (!renderer) return
  renderer.setPixelRatio(d); renderer.setSize(w, hh, false)
  camera.aspect = w / hh; camera.updateProjectionMatrix()
}
function render(dt) {
  size()
  if (!renderer) return
  const list = me ? everyone() : []
  for (const p of list) if (p.ready) animate(p, dt)
  scene.updateMatrixWorld()
  for (const p of list) { p.bm.visible = p.ready; if (p.ready) { ballAt(p, p.bm.position); p.bm.rotation.x += dt * 8 } }
  meRing.visible = !!me?.ready
  if (meRing.visible) { meRing.position.x = wx(me.x); meRing.position.z = wz(me.y); meRing.material.opacity = 0.55 + 0.3 * Math.sin(tnow * 5) }
  RIM.shake = Math.max(0, RIM.shake - dt * 3)
  rimG.rotation.x = Math.sin(tnow * 50) * RIM.shake * 0.05; hoopNet.scale.y = 1 + RIM.shake * 0.35 * Math.sin(tnow * 30)
  aim(dt)
  renderer.render(scene, camera)
}

// 2D 겹친 화면 — 이름 · 말풍선 · 몸짓 · 튀는 글자 · 채팅 줄
const V = new THREE.Vector3()
const scr = (x, y, z) => { V.set(x, y, z).project(camera); return [(V.x + 1) / 2 * W, (1 - V.y) / 2 * H, V.z < 1] }
function text(s, x, y, size, fill = '#fff', align = 'center', italic = false) {
  g.font = `${italic ? 'italic ' : ''}900 ${size}px system-ui, sans-serif`; g.textAlign = align; g.lineJoin = 'round'
  g.lineWidth = Math.max(3, size / 4.5); g.strokeStyle = '#0b0e14'; g.strokeText(s, x, y); g.fillStyle = fill; g.fillText(s, x, y)
}
function above(p) { p.m.hd.getWorldPosition(V2); return scr(V2.x, V2.y + p.m.k.R + 0.22, V2.z) }
function bubble(s, x, y) {   // 말풍선 — 글자 단위로 줄을 바꾼다(한글은 띄어쓰기가 드물다), 네 줄까지
  g.font = '700 13px system-ui, sans-serif'
  const lines = []
  let line = ''
  for (const ch of s) if (line && g.measureText(line + ch).width > 190) { lines.push(line); line = ch } else line += ch
  lines.push(line)
  if (lines.length > 4) { lines.length = 4; lines[3] = lines[3].slice(0, -1) + '…' }
  const w = Math.max(...lines.map(l => g.measureText(l).width)) + 18, hh = lines.length * 17 + 10, top = y - hh - 9
  g.fillStyle = '#fffffff2'; g.beginPath(); g.roundRect(x - w / 2, top, w, hh, 9); g.moveTo(x - 6, y - 10); g.lineTo(x + 6, y - 10); g.lineTo(x, y - 3); g.fill()
  g.fillStyle = '#11141b'; g.textAlign = 'center'
  lines.forEach((l, i) => g.fillText(l, x, top + 18 + i * 17))
}
function hud() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H)
  if (!renderer) { g.fillStyle = '#0b0e14'; g.fillRect(0, 0, W, H); return text('이 브라우저는 3D(WebGL)를 그리지 못해요', W / 2, H / 2, 18, '#e6edf3') }
  if (!me) return text('불러오는 중…', W / 2, H / 2, 18, '#e6edf3')
  const all = everyone().filter(p => p.ready).sort((a, b) => a.y - b.y)   // 먼 사람부터 — 가까운 말풍선이 위로
  for (const p of all) {
    const [x, y, ok] = above(p)
    if (!ok) continue
    const fs = p === me ? 13 : 12, img = p.f.img
    text(p.name, x + 10, y, fs, p === me ? '#ffd23f' : '#fff')   // 이름 왼쪽에 고른 덩크 시티 선수 얼굴
    const ix = x + 10 - g.measureText(p.name).width / 2 - 12
    if (img.complete && img.naturalWidth) { g.save(); g.beginPath(); g.arc(ix, y - 4, 9, 0, Math.PI * 2); g.clip(); g.drawImage(img, ix - 9, y - 13, 18, 18); g.restore() }
    let top = y - 16
    if (p.emo && p.emo.t < 1.8) { g.font = '26px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(EMO[p.emo.k][0], x, top - 2); top -= 30 }
    if (p.said) { g.globalAlpha = Math.min(1, p.said.t * 2); bubble(p.said.s, x, top + 4); g.globalAlpha = 1 }
  }
  for (const a of pops) {
    if (!a.p.ready) continue
    const [x, y, ok] = above(a.p)
    if (ok) { g.globalAlpha = Math.min(1, a.t * 2.5); text(a.text, x, y - 30 - (1.3 - a.t) * 30, 17, a.c, 'center', true) }
  }
  g.globalAlpha = 1
  // 왼쪽 위 — 방 · 사람 수 · 넣은 공, 그 아래 채팅 줄(30초 뒤 흐려진다)
  const n = others.size + 1
  text(!net ? (auth === 'in' ? '연결 중…' : '혼자 연습 중 — 로그인하면 다른 사람들과 만나요') : net.live ? `덩크 광장 · ${ROOM} · ${n}명` : '광장에 들어가는 중…', 14, 26, 14, '#ffd23f', 'left')
  if (me.made) text(`넣은 공 ${me.made}`, 14, 46, 12, '#c9d1d9', 'left')
  const shown = logs.slice(-6)
  shown.forEach((l, i) => {
    const age = tnow - l.at, y = 72 + i * 19
    if (age > 40) return
    g.globalAlpha = age > 30 ? 1 - (age - 30) / 10 : 1
    const s = l.name ? `${l.name}: ${l.text}` : l.text
    text(s.length > 46 ? s.slice(0, 45) + '…' : s, 14, y, 12.5, l.c, 'left')
  })
  g.globalAlpha = 1
}

// 느린 기기 — 1.5초 넘게 45fps 밑이면 해상도를 한 단계 낮춘다(2 → 1.5 → 1.25 → 1, 1 이면 그림자도 끈다). 스트리트 3:3 과 같다
let last = 0, ema = 16, slowT = 0
function frame(t) {
  const ms = t - last, dt = Math.min(0.05, ms / 1000 || 0)
  last = t; tnow += dt
  if (me) {
    [me.ax, me.ay] = document.activeElement === chatIn ? [0, 0] : axis()
    for (const p of everyone()) walk(p, dt)
    const moving = me.ax || me.ay, changed = me.ax !== sent.ax || me.ay !== sent.ay
    if ((changed && tnow - sentAt > 0.12) || (moving && tnow - sentAt > 2)) sendMove()   // 바뀔 때 · 걷는 동안 2초마다(어긋남 바로잡기)
  }
  for (const a of pops) a.t -= dt
  pops = pops.filter(a => a.t > 0)
  render(dt)
  hud()
  if (ms > 0 && ms < 100 && me) {
    ema += (ms - ema) * 0.08; slowT = ema > 22 ? slowT + ms / 1000 : 0
    if (slowT > 1.5 && maxD > 1) { maxD = maxD > 1.5 ? 1.5 : maxD > 1.25 ? 1.25 : 1; slowT = 0; ema = 16; if (maxD === 1 && renderer) { renderer.shadowMap.enabled = false; scene.traverse(o => o.material && (o.material.needsUpdate = true)) } }
  }
  requestAnimationFrame(frame)
}

// 전체 화면 — 스트리트 3:3 과 같다(되는 브라우저는 진짜 전체 화면 · 휴대폰은 가로로, 안 되는 아이폰은 화면을 꽉 채운 칸 .full 을 보이는 칸에 맞춘다)
const stage = glC.closest('.slam-stage'), fsBtn = $('btn-fs'), vv = window.visualViewport
function fit() {
  const s = stage.style, on = vv && stage.classList.contains('full'), k = on ? vv.scale : 1
  s.left = on ? `${vv.offsetLeft}px` : ''; s.top = on ? `${vv.offsetTop}px` : ''
  s.width = on ? `${vv.width * k}px` : ''; s.height = on ? `${vv.height * k}px` : ''
  s.transform = on && k !== 1 ? `scale(${1 / k})` : ''
}
vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit)
const setFull = on => { stage.classList.toggle('full', on); fsBtn.setAttribute('aria-label', on ? '전체 화면 끄기' : '전체 화면'); fit() }
fsBtn.addEventListener('click', async () => {
  fsBtn.blur()
  if (document.fullscreenElement) return document.exitFullscreen()
  const on = !stage.classList.contains('full')
  if (on && stage.requestFullscreen) try { await stage.requestFullscreen({ navigationUI: 'hide' }); screen.orientation?.lock?.('landscape').catch(() => {}) } catch {}
  setFull(on)
})
document.addEventListener('fullscreenchange', () => setFull(!!document.fullscreenElement))

if (renderer) scenery()
requestAnimationFrame(frame)
// 로그인하면 방에 들어가고 채팅 칸을, 안 했으면 로그인 버튼을 보인다
startAuth('', () => {
  $('chat').hidden = auth !== 'in'; $('pz-login').hidden = auth !== 'out'
  auth === 'in' ? connect() : leave()
})

await loadData()
const saved = store.get()
me = person('me', '나', data.byId.has(saved.c) ? saved.c : kr[rnd() * kr.length | 0].id, num(saved.team ?? rnd() * 4, 0, 3) | 0)   // 처음 오면 선수 · 유니폼은 아무거나
dress(me)
if (auth === 'in') connect()   // 로그인 확인이 선수 데이터보다 먼저 끝났으면
