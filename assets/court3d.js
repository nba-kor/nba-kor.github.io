// 3D 길거리 하프코트 — 스트리트 3:3(street.js) · 덩크 광장(plaza.js)이 같이 쓴다. 장면(코트 · 골대 · 철망 · 건물 · 노을), 만화풍 선수 몸(rigOf), 관절 자세(Q · setRig).
// 코트 단위는 전술판(court.js)과 같다(0.1피트) — 위가 골대(y=0 쪽), 아래가 하프라인. 3D 는 three.js(CDN, 버전 고정 — 쓰는 페이지도 같은 주소로 불러 한 벌만 뜬다)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js'
import { SKIN } from './vipers.js?v=c92ed58c'

export const CW = 500, CH = 470, R3 = 237.5, RIM_H = 100          // 코트 너비 · 길이 · 3점 반지름 · 림 높이
export const RIM = { x: 250, y: 52.5, shake: 0 }
export const BRK = RIM.y + Math.sqrt(R3 * R3 - 220 * 220)          // 코너 3점 직선이 끝나는 y
export const sm = t => t * t * (3 - 2 * t)

export const K = 0.03048                                     // 게임 단위(0.1피트) → 미터
export const wx = x => (x - 250) * K, wz = y => y * K         // 코트 → 3D — x 는 가운데가 0, z 는 골대 쪽 끝줄이 0(카메라는 하프라인 뒤)
export const LIFT = K * 0.8                                   // 선수가 뛴 높이는 조금 줄여 보인다(공 · 림은 그대로)
export const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0x3a2d5a, 32, 75)
scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x4d3b31, 1.5))
const sun = new THREE.DirectionalLight(0xffe0bd, 2.6)   // 해 질 녘 — 왼쪽 앞 위에서
sun.position.set(-7, 16, 13); sun.target.position.set(0, 0, 6); scene.add(sun, sun.target)
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 2, far: 45 }); sun.shadow.camera.updateProjectionMatrix()

// 셀 셰이딩 — 세 단계 밝기 + 뒤집은 껍데기로 그린 윤곽선(만화풍 모바일 농구 게임처럼)
const GRAD = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat)
GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter; GRAD.needsUpdate = true
export const toon = (color, map = null) => new THREE.MeshToonMaterial({ color, map, gradientMap: GRAD })
const INK = new THREE.ShaderMaterial({ side: THREE.BackSide,
  vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * 0.014, 1.0); }',
  fragmentShader: 'void main() { gl_FragColor = vec4(0.07, 0.05, 0.06, 1.0); }' })
export function part(parent, geo, mat, x = 0, y = 0, z = 0, ink = true) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z); m.castShadow = true; parent.add(m)
  if (ink) m.add(new THREE.Mesh(geo, INK))
  return m
}
export function tex(w, h, draw) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h })
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}
const rng = (s => () => (s = s * 16807 % 2147483647) / 2147483647)(7)   // 배경은 늘 같은 모양

// 코트 — 전술판과 같은 선. 길거리 코트처럼 파란 칠 · 주황 페인트존, 아스팔트 결
function courtTex() {
  return tex(1024, 963, (c, w) => {
    const u = w / CW, a0 = Math.atan2(BRK - RIM.y, 220)
    c.scale(u, u)
    c.fillStyle = '#2b62a0'; c.fillRect(0, 0, CW, CH)
    c.fillStyle = '#3373b5'; c.beginPath(); c.moveTo(30, 0); c.lineTo(30, BRK); c.arc(RIM.x, RIM.y, R3, Math.PI - a0, a0, true); c.lineTo(470, 0); c.fill()
    c.fillStyle = '#d9662c'; c.fillRect(170, 0, 160, 190)
    c.beginPath(); c.arc(250, CH, 60, Math.PI, 0); c.fill()
    for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + rng() * 0.05})`; c.fillRect(rng() * CW, rng() * CH, 1 + rng() * 2, 1 + rng() * 2) }
    c.strokeStyle = '#f3efe6'; c.lineWidth = 2.4
    c.strokeRect(1.2, 1.2, CW - 2.4, CH - 2.4); c.strokeRect(170, 0, 160, 190)
    c.beginPath(); c.arc(250, 190, 60, 0, Math.PI * 2); c.stroke()
    c.beginPath(); c.arc(RIM.x, RIM.y, 40, 0, Math.PI); c.stroke()
    c.beginPath(); c.moveTo(30, 0); c.lineTo(30, BRK); c.arc(RIM.x, RIM.y, R3, Math.PI - a0, a0, true); c.lineTo(470, 0); c.stroke()
    c.beginPath(); c.arc(250, CH, 60, Math.PI, 0); c.stroke()
    c.font = 'italic 900 38px system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffffff2e'; c.fillText('VIPERS', 250, 300)
  })
}
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d)
export const RIM_Z = wz(RIM.y), RIM_Y = RIM_H * K
export const rimG = new THREE.Group(), net = new THREE.Group()
export function scenery() {
  scene.background = tex(4, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h)
    for (const [k, col] of [[0, '#141236'], [0.45, '#4b2e6b'], [0.75, '#c4567a'], [1, '#ffb36b']]) gr.addColorStop(k, col)
    c.fillStyle = gr; c.fillRect(0, 0, w, h)
  })
  const flat = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m }
  const asphalt = tex(256, 256, (c, w, h) => { c.fillStyle = '#34363d'; c.fillRect(0, 0, w, h); for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${rng() * 0.08})`; c.fillRect(rng() * w, rng() * h, 2, 2) } })
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping; asphalt.repeat.set(20, 20)
  flat(new THREE.PlaneGeometry(90, 90), toon(0xffffff, asphalt), 0, -0.01, 8)
  flat(new THREE.PlaneGeometry(CW * K, CH * K), toon(0xffffff, courtTex()), 0, 0, CH * K / 2)
  // 골대 — 기둥 · 백보드 · 림 · 그물(백보드 앞면은 전술판의 y=40)
  const steel = toon(0x2f3640)
  part(scene, new THREE.CylinderGeometry(0.11, 0.13, 3.9, 12), steel, 0, 1.95, -1.25)
  part(scene, BOX(0.14, 0.14, 2.45), steel, 0, 3.55, -0.05)
  const board = tex(256, 150, (c, w, h) => { c.fillStyle = '#f4f6fa'; c.fillRect(0, 0, w, h); c.strokeStyle = '#1b1f27'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10); c.strokeStyle = '#d6323a'; c.lineWidth = 7; c.strokeRect(w / 2 - 42, h - 76, 84, 60) })
  part(scene, BOX(1.83, 1.07, 0.06), toon(0xffffff, board), 0, 3.42, wz(40) - 0.03)
  rimG.position.set(0, RIM_Y, RIM_Z); scene.add(rimG)
  const rim = part(rimG, new THREE.TorusGeometry(0.23, 0.022, 8, 28), toon(0xff5a14)); rim.rotation.x = Math.PI / 2
  part(rimG, BOX(0.06, 0.04, 0.2), toon(0xff5a14), 0, -0.01, -0.3, false)
  const netT = tex(128, 64, (c, w, h) => { c.strokeStyle = '#ffffff'; c.lineWidth = 3; for (let x = -h; x < w + h; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + h, h); c.moveTo(x + h, 0); c.lineTo(x, h); c.stroke() } })
  netT.wrapS = THREE.RepeatWrapping; netT.repeat.set(2, 1)
  net.add(new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.14, 0.42, 18, 1, true).translate(0, -0.21, 0), new THREE.MeshBasicMaterial({ map: netT, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide })))
  rimG.add(net)
  // 뒤 벽 그라피티 · 철망 · 가로등 · 건물
  const wall = tex(1024, 160, (c, w, h) => {
    c.fillStyle = '#3b2630'; c.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 16) for (let x = (y / 16 % 2) * 20; x < w; x += 40) { c.fillStyle = `rgba(0,0,0,${0.12 + rng() * 0.15})`; c.fillRect(x, y, 38, 14) }
    c.font = 'italic 900 78px system-ui, sans-serif'; c.textAlign = 'center'; c.lineJoin = 'round'
    const gr = c.createLinearGradient(0, 50, 0, 130); gr.addColorStop(0, '#d9b04a'); gr.addColorStop(1, '#b8435f')
    c.globalAlpha = 0.8; c.lineWidth = 12; c.strokeStyle = '#141014'; c.strokeText('TNAB VIPERS', w * 0.3, 118); c.fillStyle = gr; c.fillText('TNAB VIPERS', w * 0.3, 118)
  })
  part(scene, BOX(24, 2.8, 0.4), toon(0xffffff, wall), 0, 1.4, -5.2, false)
  const mesh = tex(64, 64, (c, w, h) => { c.strokeStyle = '#c7ced8'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h); c.moveTo(w, 0); c.lineTo(0, h); c.stroke() })
  mesh.wrapS = mesh.wrapT = THREE.RepeatWrapping
  const fence = (len, x, z, ry) => {
    const t = mesh.clone(); t.repeat.set(len / 0.45, 4.4 / 0.45); t.needsUpdate = true
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 4.4), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, color: 0x9aa3b4 }))
    m.position.set(x, 2.2, z); m.rotation.y = ry; scene.add(m)
    for (let k = -len / 2; k <= len / 2; k += 3.5) part(scene, new THREE.CylinderGeometry(0.05, 0.05, 4.5, 6), steel, x + Math.cos(ry) * k, 2.25, z - Math.sin(ry) * k, false)
  }
  fence(24, 0, -3.6, 0); fence(23, -11.5, 7.9, Math.PI / 2); fence(23, 11.5, 7.9, Math.PI / 2)
  for (const x of [-11, 11]) {
    part(scene, new THREE.CylinderGeometry(0.08, 0.1, 7, 8), steel, x, 3.5, -3.3, false)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1b8 }))
    bulb.position.set(x * 0.93, 6.9, -3.3); scene.add(bulb)
  }
  const win = tex(64, 128, (c, w, h) => { c.fillStyle = '#1d1a33'; c.fillRect(0, 0, w, h); for (let y = 6; y < h; y += 12) for (let x = 5; x < w; x += 12) { c.fillStyle = rng() < 0.32 ? `hsl(${38 + rng() * 20},90%,${60 + rng() * 20}%)` : '#2a2648'; c.fillRect(x, y, 6, 7) } })
  win.wrapS = win.wrapT = THREE.RepeatWrapping
  for (let i = 0; i < 16; i++) {
    const w = 6 + rng() * 8, h = 9 + rng() * 22, d = 6 + rng() * 6, t = win.clone()
    t.repeat.set(w / 6, h / 10); t.needsUpdate = true
    const b = new THREE.Mesh(BOX(w, h, d), new THREE.MeshBasicMaterial({ map: t, color: 0xb9b2e6 }))
    b.position.set(-42 + i * 5.6 + rng() * 3, h / 2, -12 - rng() * 18); scene.add(b)
  }
}

// 바닥 표시(고리 · 선) — 바닥에 겹쳐 그린다
export const floorMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
const ballTex = tex(256, 128, (c, w, h) => {
  c.fillStyle = '#e8742a'; c.fillRect(0, 0, w, h)
  c.strokeStyle = '#2a1206'; c.lineWidth = 5
  for (const x of [0, w / 4, w / 2, w * 3 / 4, w]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke() }
  c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke()
})
export const BALL = new THREE.SphereGeometry(0.14, 20, 14), ballMat = toon(0xffffff, ballTex)

// ---------------------------------------------------------------- 선수 몸

// 몸은 도형을 이어 만든다 — 2m 선수 기준(포지션마다 키 · 몸집을 곱한다). 팔다리는 관절마다 묶음이라 각도만 돌리면 된다
const GEO = {
  // 윗몸 — 허리는 좁고 가슴 · 어깨가 넓게 깎아(돌림체) 앞뒤로 눌렀다. 바지는 무릎까지 오는 농구 바지
  torso: new THREE.LatheGeometry([[0.15, 0], [0.16, 0.1], [0.178, 0.25], [0.192, 0.38], [0.196, 0.46], [0.18, 0.535], [0.13, 0.585], [0.07, 0.615]].map(([x, y]) => new THREE.Vector2(x, y)), 26).scale(1.3, 1, 0.7),
  shorts: new THREE.LatheGeometry([[0.222, -0.21], [0.226, -0.15], [0.212, -0.04], [0.2, 0.07]].map(([x, y]) => new THREE.Vector2(x, y)), 22).scale(1.12, 1, 0.84),
  belt: new THREE.CylinderGeometry(0.205, 0.2, 0.05, 22).scale(1.12, 1, 0.84),
  pant: new THREE.CylinderGeometry(0.122, 0.116, 0.36, 14).translate(0, -0.16, 0),
  neck: new THREE.CylinderGeometry(0.064, 0.074, 0.16, 12),
  head: new THREE.SphereGeometry(0.165, 24, 18),
  face: new THREE.SphereGeometry(0.169, 30, 20, Math.PI / 2 - 1.8, 3.6),   // 앞쪽 206° — 얼굴 그림을 감싼다
  delt: new THREE.SphereGeometry(0.08, 12, 10),
  upper: new THREE.CapsuleGeometry(0.066, 0.19, 4, 12).translate(0, -0.16, 0),
  fore: new THREE.CapsuleGeometry(0.056, 0.19, 4, 12).translate(0, -0.15, 0),
  hand: new THREE.SphereGeometry(0.072, 12, 10).scale(0.85, 1.1, 0.7),
  thigh: new THREE.CapsuleGeometry(0.09, 0.29, 4, 12).translate(0, -0.23, 0),
  shin: new THREE.CapsuleGeometry(0.068, 0.3, 4, 12).translate(0, -0.21, 0),
  sock: new THREE.CylinderGeometry(0.073, 0.07, 0.16, 12).translate(0, -0.34, 0),
  shoe: new THREE.CapsuleGeometry(0.072, 0.15, 4, 12).rotateX(Math.PI / 2).scale(1, 0.72, 1).translate(0, -0.03, 0.055),   // 둥근 운동화
}
const jerseyTex = (T, num, name) => tex(256, 128, (c, w, h) => {
  c.fillStyle = T.color; c.fillRect(0, 0, w, h)
  c.fillStyle = T.trim; c.fillRect(0, 0, w, 8)
  for (const x of [w / 4, w * 3 / 4]) c.fillRect(x - 7, 0, 14, h)                      // 옆 판(보조색)
  c.textAlign = 'center'; c.lineJoin = 'round'; c.strokeStyle = T.dark; c.fillStyle = '#fff'
  c.font = '900 62px system-ui, sans-serif'; c.lineWidth = 8; c.strokeText(num, w / 2, 102); c.fillText(num, w / 2, 102)   // 등 — 큰 번호 · 이름
  c.font = '800 17px system-ui, sans-serif'; c.lineWidth = 4; c.strokeText(name, w / 2, 36); c.fillText(name, w / 2, 36)
  c.font = '900 30px system-ui, sans-serif'; c.lineWidth = 6
  for (const x of [0, w]) { c.strokeText(num, x, 64); c.fillText(num, x, 64) }        // 가슴 — 그림 양 끝이 앞에서 만난다
})
export function hairOf(head) {   // 머리 꼭대기 색 — 덜 밝은 쪽(머리카락)
  const px = head.getContext('2d').getImageData(40, 6, 44, 16).data, got = []
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) got.push([px[i], px[i + 1], px[i + 2]])
  if (got.length < 20) return '#2a1d16'
  const [r, gg, b] = got.sort((m, n) => m[0] + m[1] + m[2] - n[0] - n[1] - n[2])[Math.floor(got.length * 0.3)]
  return `rgb(${r},${gg},${b})`
}
// 선수 몸 — f = { name, num, head(얼굴 캔버스), skin, hair } 에 한 번 만들어 둔다(f.rig). T = 팀(유니폼 색), i = 체형 0 가드 · 1 포워드 · 2 센터
export function rigOf(f, T, i) {
  if (f.rig) return f.rig
  const S = [0.95, 1, 1.05][i], wd = [0.94, 1, 1.1][i]
  const skin = toon(f.skin || SKIN), kit = toon(T.color), sock = toon(0xf2f2f2), shoe = toon(i === 1 ? 0x1d1d22 : 0xf6f6f6)
  const root = new THREE.Group(), hips = new THREE.Group(), spine = new THREE.Group(), head = new THREE.Group()
  root.scale.set(S * wd, S, S * wd); root.add(hips)
  part(hips, GEO.shorts, kit, 0, -0.1, 0); part(hips, GEO.belt, toon(T.trim), 0, 0.03, 0, false)
  spine.position.y = 0.06; hips.add(spine)
  part(spine, GEO.torso, toon(0xffffff, jerseyTex(T, String(f.num), f.name)))
  part(spine, GEO.neck, skin, 0, 0.64, 0, false)
  head.position.y = 0.8; spine.add(head)
  part(head, GEO.head, toon(f.hair || '#2a1d16'))
  if (f.head) { const t = new THREE.CanvasTexture(f.head); t.colorSpace = THREE.SRGBColorSpace; head.add(new THREE.Mesh(GEO.face, new THREE.MeshToonMaterial({ map: t, gradientMap: GRAD, alphaTest: 0.5 }))) }
  const R = { root, hips, spine, head, sh: [], el: [], hand: [], hp: [], kn: [], an: [] }
  for (const [i, xs] of [[0, -1], [1, 1]]) {   // 0 = 오른쪽(-x), 1 = 왼쪽 — 선수는 +z 를 본다
    const sh = new THREE.Group(), el = new THREE.Group(), hp = new THREE.Group(), kn = new THREE.Group(), an = new THREE.Group()
    sh.position.set(xs * 0.26, 0.5, 0); spine.add(sh); part(sh, GEO.delt, skin, 0, -0.01, 0, false); part(sh, GEO.upper, skin)
    el.position.y = -0.31; sh.add(el); part(el, GEO.fore, skin)
    R.hand[i] = part(el, GEO.hand, skin, 0, -0.33, 0)
    hp.position.set(xs * 0.1, -0.05, 0); hips.add(hp); part(hp, GEO.thigh, skin); part(hp, GEO.pant, kit)
    kn.position.y = -0.46; hp.add(kn); part(kn, GEO.shin, skin); part(kn, GEO.sock, sock, 0, 0, 0, false)
    an.position.y = -0.42; kn.add(an); part(an, GEO.shoe, shoe)
    R.sh[i] = sh; R.el[i] = el; R.hp[i] = hp; R.kn[i] = kn; R.an[i] = an
  }
  return f.rig = R
}

// ---------------------------------------------------------------- 자세

// 자세 = 관절 각도 17개 — [윗몸 숙임, 옆 기울기, 비틀기, 고개, 주저앉기, 오른팔(앞 · 옆 · 팔꿈치), 왼팔(…), 오른다리(앞 · 옆 · 무릎), 왼다리(…)]
// 상태마다 목표 자세(Q)를 정하고 지금 자세(p.P)가 부드럽게 따라간다. 엉덩이 높이는 더 뻗은 다리가 바닥에 닿게 정한다
export const NP = 17, Q = new Float32Array(NP)
export const trunk = (lean, side = 0, twist = 0, head = 0, sit = 0) => { Q[0] = lean; Q[1] = side; Q[2] = twist; Q[3] = head; Q[4] = sit }
export const arm = (i, sf, sa, e) => { Q[5 + i * 3] = sf; Q[6 + i * 3] = sa; Q[7 + i * 3] = e }
export const leg = (i, tf, ta, k) => { Q[11 + i * 3] = tf; Q[12 + i * 3] = ta; Q[13 + i * 3] = k }
export const arms = (sf, sa, e) => { arm(0, sf, sa, e); arm(1, sf, sa, e) }
export const legs = (tf, ta, k) => { leg(0, tf, ta, k); leg(1, tf, ta, k) }
export const yaw = p => Math.atan2(Math.cos(p.dir), Math.sin(p.dir))
export function dunkPose(p) {   // 덩크 — 웅크렸다 솟아(종류마다 팔이 다르다) 림에 꽂고 매달린다
  const t = p.t, k = sm(Math.min(1, t / 0.42))
  if (t < 0.07) { trunk(0.3); legs(0.6, 0.08, 1.2); arms(0.9, 0.2, 1.5); return }
  if (t > 0.42) {
    const w = Math.sin((t - 0.42) * 12) * 0.1
    trunk(-0.1 + w, 0, 0, -0.25); leg(0, 0.35 + w, 0.1, 0.7); leg(1, 0.15 - w, 0.1, 0.4)
    if (p.style === 2) { arm(0, -3.28, 0.1, 0.1); arm(1, 1.2, 0.6, 0.6) }
    else if (p.style === 1) { arm(0, 3.0, 0.1, 0.1); arm(1, 1.2, 0.6, 0.6) }
    else arms(3.0, 0.14, 0.1)
    if (p.style === 3) p.spin = Math.PI
    return
  }
  trunk(0.05, 0, 0, -0.35); leg(0, 1.0, 0.1, 1.8); leg(1, 0.35, 0.1, 0.9)
  if (p.style === 1) { arm(0, k < 0.7 ? 3.6 : 2.8, 0.05, k < 0.7 ? 1.3 : 0.1); arm(1, 1.4, 0.6, 0.6) }          // 토마호크 — 머리 뒤로 젖혔다 내리꽂는다
  else if (p.style === 2) { arm(0, 1.4 - 4.68 * k, 0.25, 0.1); arm(1, 1.0, 0.7, 0.5); leg(1, -0.2, 0.25, 0.6) }   // 윈드밀 — 팔을 뒤로 크게 돌린다
  else { arms(1.3 + 1.7 * k, 0.12, 0.6 * (1 - k)); if (p.style === 3) p.spin = Math.PI * k }                   // 투핸드 · 리버스(등지고)
}
// p.P(지금 자세)가 Q(목표 자세 — 부르기 전에 채운다)를 rate 빠르기로 따라간다. p = { f, P, x, y, h, dir, spin }
export function setRig(p, dt, rate) {
  const Rg = p.f.rig, P = p.P, k = 1 - Math.exp(-rate * dt)
  for (let i = 0; i < NP; i++) P[i] += (Q[i] - P[i]) * k
  Rg.spine.rotation.set(P[0], P[2], P[1]); Rg.head.rotation.x = P[3]
  let top = 0
  for (const i of [0, 1]) {
    const xs = i ? 1 : -1, tf = P[11 + i * 3], ta = P[12 + i * 3], kk = P[13 + i * 3]
    Rg.sh[i].rotation.set(-P[5 + i * 3], 0, xs * P[6 + i * 3]); Rg.el[i].rotation.x = -P[7 + i * 3]
    Rg.hp[i].rotation.set(-tf, 0, xs * ta); Rg.kn[i].rotation.x = kk; Rg.an[i].rotation.x = tf - kk   // 발은 바닥과 나란히
    top = Math.max(top, (0.46 * Math.cos(tf) + 0.42 * Math.cos(tf - kk)) * Math.cos(ta))
  }
  Rg.hips.position.y = (top + 0.13) * (1 - P[4]) + 0.3 * P[4]
  Rg.root.position.set(wx(p.x), p.h * LIFT, wz(p.y)); Rg.root.rotation.y = yaw(p) + p.spin
}
