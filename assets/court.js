// 하프코트 렌더 · 재생 공통 모듈 — 전술판과 팀원모집이 같은 그림과 애니메이션을 쓴다.
import { faceOf } from './app.js?v=6bf8da50'

const NS = 'http://www.w3.org/2000/svg'
export const W = 500, H = 470     // 1 unit = 0.1ft, 하프코트 50ft x 47ft
const HOOP = [250, 52.5]
const R3 = 237.5                  // 3점 라인 반지름
const R_TOKEN = 21
const COLOR = { off: '#4d9eff', def: '#ff5d5d', screen: '#f5a623' }

const mk = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v)
  return n
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const toSvg = ([x, y]) => [x * W, y * H]

const arc = (cx, cy, r, a0, a1, n = 72) => 'M' + Array.from({ length: n + 1 }, (_, i) => {
  const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180
  return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
}).join('L')

// ---------------------------------------------------------------- 코트

export function drawCourt(svg) {
  svg.textContent = ''
  const defs = mk('defs')
  const clip = mk('clipPath', { id: 'tclip' })
  clip.appendChild(mk('circle', { r: R_TOKEN - 2 }))
  defs.appendChild(clip)
  for (const [id, c] of [['off', COLOR.off], ['def', COLOR.def], ['scr', COLOR.screen]]) {
    const m = mk('marker', {
      id: `arw-${id}`, viewBox: '0 0 10 10', refX: 9, refY: 5,
      markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse',
    })
    m.appendChild(mk('path', { d: 'M0,0 L10,5 L0,10 z', fill: c }))
    defs.appendChild(m)
  }
  svg.appendChild(defs)

  const g = mk('g', { id: 'lines', fill: 'none', stroke: 'var(--court-line)', 'stroke-width': 2 })
  const add = (tag, a) => g.appendChild(mk(tag, a))
  svg.appendChild(mk('rect', { x: 0, y: 0, width: W, height: H, fill: 'var(--court)' }))
  add('rect', { x: 1, y: 1, width: W - 2, height: H - 2 })
  add('rect', { x: 170, y: 0, width: 160, height: 190 })                       // 페인트존
  add('path', { d: arc(250, 190, 60, 0, 360) })                                // 자유투 서클
  add('path', { d: arc(HOOP[0], HOOP[1], 40, 0, 180) })                        // 제한구역
  add('path', { d: 'M220,40 L280,40', 'stroke-width': 5 })                     // 백보드
  add('path', { d: arc(HOOP[0], HOOP[1], 7.5, 0, 360), 'stroke-width': 3, stroke: 'var(--accent)' }) // 림
  const brk = Math.sqrt(R3 * R3 - 220 * 220)                                   // 코너 3점 직선 구간
  const a = Math.atan2(brk, 220) * 180 / Math.PI
  add('path', { d: `M30,0 L30,${(HOOP[1] + brk).toFixed(1)}` })
  add('path', { d: arc(HOOP[0], HOOP[1], R3, a, 180 - a) })
  add('path', { d: `M470,0 L470,${(HOOP[1] + brk).toFixed(1)}` })
  add('path', { d: arc(250, H, 60, 180, 360) })                                // 센터 서클
  svg.appendChild(g)

  svg.appendChild(mk('g', { id: 'routes' }))
  svg.appendChild(mk('g', { id: 'tokens' }))
  svg.appendChild(mk('g', { id: 'labels', 'pointer-events': 'none' }))  // 이름표는 토큰 위에 그려 가려지지 않게
  svg.appendChild(mk('g', { id: 'ball' }))
}

// ---------------------------------------------------------------- 렌더

/** token: { key, side:'off'|'def', label, playerId|null, x, y, routes:[{kind,pts}] } */
export function renderTokens(svg, tokens, byId, selected = null) {
  const rg = svg.querySelector('#routes'), tg = svg.querySelector('#tokens'), lg = svg.querySelector('#labels')
  rg.textContent = ''
  tg.textContent = ''
  lg.textContent = ''

  for (const t of tokens) {
    for (const r of t.routes) {
      if (r.pts.length < 2) continue
      const c = r.kind === 'screen' ? COLOR.screen : COLOR[t.side]
      const mid = r.kind === 'screen' ? 'scr' : t.side
      rg.appendChild(mk('polyline', {
        points: r.pts.map(p => toSvg(p).map(n => n.toFixed(1)).join(',')).join(' '),
        fill: 'none', stroke: c, 'stroke-width': 3.5, 'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-dasharray': r.kind === 'pass' ? '9 8' : null,
        'marker-end': r.kind === 'screen' ? null : `url(#arw-${mid})`,
        opacity: .95,
      }))
      if (r.kind === 'screen') {                 // 스크린 표시: 끝에 수직 막대
        const [p1, p0] = [r.pts.at(-1), r.pts.at(-2)].map(toSvg)
        const [dx, dy] = [p1[0] - p0[0], p1[1] - p0[1]]
        const L = Math.hypot(dx, dy) || 1, k = 15
        rg.appendChild(mk('line', {
          x1: p1[0] - dy / L * k, y1: p1[1] + dx / L * k,
          x2: p1[0] + dy / L * k, y2: p1[1] - dx / L * k,
          stroke: COLOR.screen, 'stroke-width': 4, 'stroke-linecap': 'round',
        }))
      }
    }
  }

  for (const t of tokens) {
    const [x, y] = toSvg([t.x, t.y])
    const g = mk('g', { class: 'token' + (selected === t.key ? ' sel' : ''), transform: `translate(${x},${y})` })
    g.dataset.key = t.key
    g.appendChild(mk('circle', { r: R_TOKEN, fill: '#0b0f16' }))
    const p = t.playerId && byId.get(t.playerId)
    if (p) g.appendChild(mk('image', { href: faceOf(p), x: -R_TOKEN, y: -R_TOKEN, width: R_TOKEN * 2, height: R_TOKEN * 2, 'clip-path': 'url(#tclip)' }))
    g.appendChild(mk('circle', { class: 'ring', r: R_TOKEN - 1.5, fill: 'none', stroke: COLOR[t.side], 'stroke-width': 3 }))
    if (!p) {
      const n = mk('text', { 'text-anchor': 'middle', y: 7, 'font-size': 20, 'font-weight': 800, fill: COLOR[t.side] })
      n.textContent = t.key.slice(-1)
      g.appendChild(n)
    }
    tg.appendChild(g)

    const cap = mk('text', {
      x: clamp(x, 46, W - 46), y: y + R_TOKEN + 16, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 600,
      fill: '#e6edf3', 'paint-order': 'stroke', stroke: '#0d1117', 'stroke-width': 5, 'stroke-linejoin': 'round',
    })
    cap.textContent = p ? (p.short || p.name) : t.label
    lg.appendChild(cap)
  }
}

/** data/tactics.json 프리셋 → 토큰. ids[i] 는 i번째 슬롯 선수(없으면 빈 토큰). 동선은 깊은 복사. */
export function presetTokens(preset, offIds = [], defIds = []) {
  const build = (slots, s, ids) => slots.map((sl, i) => ({
    key: `${s[0]}${i + 1}`, side: s, label: sl.label, playerId: ids[i] || null,
    x: sl.at[0], y: sl.at[1],
    routes: (sl.routes || []).map(r => ({ kind: r.kind, pts: r.pts.map(p => p.slice()) })),
  }))
  return [...build(preset.offense, 'off', offIds), ...build(preset.defense, 'def', defIds)]
}

// ---------------------------------------------------------------- 재생

const ease = u => u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2
function pointAt(pts, u) {
  if (pts.length < 2) return pts[0]
  const segs = pts.slice(1).map((p, i) => dist(pts[i], p))
  const total = segs.reduce((a, b) => a + b, 0)
  if (!total) return pts[0]
  let d = u * total
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const k = segs[i] ? clamp(d / segs[i], 0, 1) : 1
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]
    }
    d -= segs[i]
  }
}

/**
 * 토큰 x/y 를 직접 바꿔 가며 동선대로 움직이고 매 프레임 redraw() 를 부른다.
 * 끝나고 700ms 뒤 제자리로 돌려 한 번 더 그린 다음 resolve. 움직일 게 없으면 null.
 * 도중에 저장하면 중간 좌표가 남으므로 저장 막기는 호출하는 쪽 몫이다.
 */
export function play(svg, tokens, redraw) {
  const runs = tokens
    .map(t => ({ t, pts: t.routes.filter(r => r.kind !== 'pass').flatMap(r => r.pts) }))
    .filter(r => r.pts.length > 1)
  const passes = tokens.flatMap(t => t.routes.filter(r => r.kind === 'pass')).map(r => r.pts)
  if (!runs.length && !passes.length) return null

  const home = tokens.map(t => [t.x, t.y])
  const ballG = svg.querySelector('#ball')
  const ball = mk('circle', { r: 9, fill: '#f5a623', stroke: '#1a1200', 'stroke-width': 2 })
  if (passes.length) ballG.appendChild(ball)

  return new Promise(resolve => {
    const D = 2600, t0 = performance.now()
    const step = now => {
      const u = clamp((now - t0) / D, 0, 1), e = ease(u)
      for (const r of runs) { const p = pointAt(r.pts, e);[r.t.x, r.t.y] = p }
      if (passes.length) {
        const idx = clamp(Math.floor(e * passes.length), 0, passes.length - 1)
        const local = e * passes.length - idx
        const [bx, by] = toSvg(pointAt(passes[idx], local))
        ball.setAttribute('cx', bx); ball.setAttribute('cy', by)
      }
      redraw()
      if (u < 1) requestAnimationFrame(step)
      else setTimeout(() => {
        tokens.forEach((t, i) => { [t.x, t.y] = home[i] })
        ballG.textContent = ''
        redraw()
        resolve()
      }, 700)
    }
    requestAnimationFrame(step)
  })
}
