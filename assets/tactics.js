// 전술판 — 하프코트 3:3 배치 / 동선 / 프리셋 / 재생
import { loadPlayers, mountFilters, chipEl, faceOf, startDrag, mountTop, decodeState, share, POS_KO } from './app.js'

const NS = 'http://www.w3.org/2000/svg'
const W = 500, H = 470            // 1 unit = 0.1ft, 하프코트 50ft x 47ft
const HOOP = [250, 52.5]
const R3 = 237.5                  // 3점 라인 반지름
const R_TOKEN = 21
const COLOR = { off: '#4d9eff', def: '#ff5d5d', screen: '#f5a623' }
const STORE = 'dc.tactics'

const svg = document.getElementById('court')
const $ = s => document.querySelector(s)

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

// ---------------------------------------------------------------- 상태

/** token: { key, side:'off'|'def', label, playerId|null, x, y, routes:[{kind,pts}] } */
let state = { presetId: '', tokens: [] }
let data = { players: [], byId: new Map() }
let pool = []            // 현재 필터가 적용된 선수 목록
let tactics = { presets: [] }
let mode = 'move'        // 'move' | 'route'
let routeKind = 'move'   // 'move' | 'pass' | 'screen'
let side = 'off'         // 새 선수를 놓을 진영
let selected = null      // token key
let animating = false

const tokensOf = s => state.tokens.filter(t => t.side === s)
const save = () => { if (!animating) localStorage.setItem(STORE, JSON.stringify(state)) }

// ---------------------------------------------------------------- 코트

function drawCourt() {
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

function render() {
  const rg = svg.querySelector('#routes'), tg = svg.querySelector('#tokens'), lg = svg.querySelector('#labels')
  rg.textContent = ''
  tg.textContent = ''
  lg.textContent = ''

  for (const t of state.tokens) {
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

  for (const t of state.tokens) {
    const [x, y] = toSvg([t.x, t.y])
    const g = mk('g', { class: 'token' + (selected === t.key ? ' sel' : ''), transform: `translate(${x},${y})` })
    g.dataset.key = t.key
    g.appendChild(mk('circle', { r: R_TOKEN, fill: '#0b0f16' }))
    const p = t.playerId && data.byId.get(t.playerId)
    if (p) g.appendChild(mk("image", { href: faceOf(p), x: -R_TOKEN, y: -R_TOKEN, width: R_TOKEN * 2, height: R_TOKEN * 2, 'clip-path': 'url(#tclip)' }))
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

  const used = new Set(state.tokens.map(t => t.playerId).filter(Boolean))
  document.querySelectorAll('#roster-chips .chip').forEach(c => c.classList.toggle('used', used.has(c.dataset.id)))
  renderSelected()
  save()
}

function renderSelected() {
  const box = $('#sel-info')
  const t = state.tokens.find(t => t.key === selected)
  const p = t && t.playerId && data.byId.get(t.playerId)
  if (!t) { box.innerHTML = '<p class="empty" style="padding:0">코트 위 선수를 눌러 선택하세요.</p>'; return }
  if (!p) { box.innerHTML = `<p class="empty" style="padding:0"><b>${t.label}</b> — 선수를 끌어다 놓으세요.</p>`; return }
  const spec = [POS_KO[p.pos], p.height && `${p.height}cm`, p.weight && `${p.weight}kg`].filter(Boolean).join(' · ')
  box.innerHTML = `
    <div class="who"><img src="${faceOf(p)}" alt=""><div>
      <b></b><small></small></div></div>
    <div class="spec"></div>
    <p class="bio"></p>`
  box.querySelector('b').textContent = p.name
  box.querySelector('small').textContent = [t.label, p.en].filter(Boolean).join(' · ')
  box.querySelector('.spec').textContent = p.nickname ? `${spec} · “${p.nickname}”` : spec
  box.querySelector('.bio').textContent = p.desc || ''
}

// ---------------------------------------------------------------- 배치

const nextKey = s => {
  const used = new Set(tokensOf(s).map(t => t.key))
  return [1, 2, 3].map(i => `${s[0]}${i}`).find(k => !used.has(k))
}

function place(playerId, nx, ny, target) {
  state.tokens.forEach(t => { if (t.playerId === playerId) t.playerId = null })
  if (target) { target.playerId = playerId; render(); return }
  const key = nextKey(side)
  if (key) {
    state.tokens.push({ key, side, label: side === 'off' ? `공격 ${key[1]}` : `수비 ${key[1]}`, playerId, x: nx, y: ny, routes: [] })
  } else {
    const t = tokensOf(side).sort((a, b) => dist([a.x, a.y], [nx, ny]) - dist([b.x, b.y], [nx, ny]))[0]
    t.playerId = playerId
    moveToken(t, nx, ny)
  }
  render()
}

const r3 = v => Math.round(v * 1000) / 1000     // 저장·공유 링크가 길어지지 않도록

/** 선수를 옮기면 그 선수의 동선도 같이 따라온다 — 안 그러면 화살표가 엉뚱한 데서 시작한다. */
function moveToken(t, nx, ny) {
  const dx = nx - t.x, dy = ny - t.y
  t.x = nx; t.y = ny
  for (const r of t.routes) r.pts = r.pts.map(([x, y]) => [r3(x + dx), r3(y + dy)])
}
const toNorm = (cx, cy) => {
  const r = svg.getBoundingClientRect()
  return [r3(clamp((cx - r.left) / r.width, .04, .96)), r3(clamp((cy - r.top) / r.height, .04, .96))]
}
const tokenAt = target => {
  const g = target?.closest?.('.token')
  return g ? state.tokens.find(t => t.key === g.dataset.key) : null
}

// ---------------------------------------------------------------- 코트 위 조작

svg.addEventListener('pointerdown', ev => {
  if (animating) return
  const t = tokenAt(ev.target)
  if (!t) return
  ev.preventDefault()
  selected = t.key
  render()

  if (mode === 'route') {
    const pts = [[t.x, t.y]]
    const move = e => {
      const p = toNorm(e.clientX, e.clientY)
      if (dist(p, pts.at(-1)) < .02) return
      pts.push(p)
      t.routes = t.routes.filter(r => r !== draft)
      draft.pts = pts.slice()
      t.routes.push(draft)
      render()
    }
    const draft = { kind: routeKind, pts }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (draft.pts.length < 2) t.routes = t.routes.filter(r => r !== draft)
      render()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  } else {
    const move = e => { const [x, y] = toNorm(e.clientX, e.clientY); moveToken(t, x, y); render() }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
})

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

function play() {
  if (animating) return
  const runs = state.tokens
    .map(t => ({ t, pts: t.routes.filter(r => r.kind !== 'pass').flatMap(r => r.pts) }))
    .filter(r => r.pts.length > 1)
  const passes = state.tokens.flatMap(t => t.routes.filter(r => r.kind === 'pass')).map(r => r.pts)
  if (!runs.length && !passes.length) return

  animating = true
  const home = state.tokens.map(t => [t.x, t.y])
  const ballG = svg.querySelector('#ball')
  const ball = mk('circle', { r: 9, fill: '#f5a623', stroke: '#1a1200', 'stroke-width': 2 })
  if (passes.length) ballG.appendChild(ball)

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
    render()
    if (u < 1) requestAnimationFrame(step)
    else setTimeout(() => {
      state.tokens.forEach((t, i) => { [t.x, t.y] = home[i] })
      ballG.textContent = ''
      animating = false
      render()
    }, 700)
  }
  requestAnimationFrame(step)
}

// ---------------------------------------------------------------- 프리셋

function autoAssign(slots, used) {
  return slots.map(s => {
    const p = pool.find(x => !used.has(x.id) && s.pos.includes(x.pos)) || pool.find(x => !used.has(x.id))
    if (p) used.add(p.id)
    return p ? p.id : null
  })
}

function applyPreset(id, keep) {
  const pr = tactics.presets.find(p => p.id === id)
  if (!pr) return
  const held = s => state.tokens.filter(t => t.side === s).map(t => t.playerId)
  const used = new Set(keep ? state.tokens.map(t => t.playerId).filter(Boolean) : [])
  const offIds = keep ? held('off') : autoAssign(pr.offense, used)
  const defIds = keep ? held('def') : autoAssign(pr.defense, used)
  const build = (slots, s, ids) => slots.map((sl, i) => ({
    key: `${s[0]}${i + 1}`, side: s, label: sl.label, playerId: ids[i] || null,
    x: sl.at[0], y: sl.at[1],
    routes: (sl.routes || []).map(r => ({ kind: r.kind, pts: r.pts.map(p => p.slice()) })),
  }))
  state = { presetId: id, tokens: [...build(pr.offense, 'off', offIds), ...build(pr.defense, 'def', defIds)] }
  selected = null
  $('#preset-desc').textContent = pr.desc
  render()
}

// ---------------------------------------------------------------- 초기화

const boot = async () => {
  data = await loadPlayers()
  mountTop('tactics.html', data.updatedAt)
  tactics = await fetch('data/tactics.json', { cache: 'no-cache' }).then(r => r.json())

  $('#preset').innerHTML = ['공격', '수비'].map(tag =>
    `<optgroup label="${tag} 전술">${tactics.presets.filter(p => p.tag === tag)
      .map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</optgroup>`).join('')

  drawCourt()

  const chips = $('#roster-chips')
  mountFilters(document.querySelector('.roster .filters'), data.players, list => {
    pool = list
    chips.textContent = ''
    if (!list.length) chips.innerHTML = '<p class="empty">조건에 맞는 선수가 없습니다.</p>'
    for (const p of list) {
      const c = chipEl(p)
      c.addEventListener('pointerdown', ev => startDrag(ev, c, {
        onDrop: (x, y, under) => {
          if (!under || !svg.contains(under)) return
          const [nx, ny] = toNorm(x, y)
          place(p.id, nx, ny, tokenAt(under))
        },
      }))
      chips.appendChild(c)
    }
    render()
  })

  const group = (sel, fn) => document.querySelectorAll(sel).forEach(b => b.onclick = () => {
    document.querySelectorAll(sel).forEach(o => o.classList.remove('on'))
    b.classList.add('on'); fn(b)
  })
  group('[data-mode]', b => mode = b.dataset.mode)
  group('[data-kind]', b => routeKind = b.dataset.kind)
  group('[data-side]', b => side = b.dataset.side)

  $('#apply-preset').onclick = () => applyPreset($('#preset').value, false)
  $('#apply-keep').onclick = () => applyPreset($('#preset').value, true)
  $('#preset').onchange = () => {
    const pr = tactics.presets.find(p => p.id === $('#preset').value)
    $('#preset-desc').textContent = pr ? pr.desc : ''
  }
  $('#play').onclick = play
  $('#clear-routes').onclick = () => {
    const t = state.tokens.find(t => t.key === selected)
    if (t) { t.routes = []; render() }
  }
  $('#remove-token').onclick = () => {
    state.tokens = state.tokens.filter(t => t.key !== selected)
    selected = null; render()
  }
  $('#reset').onclick = () => {
    if (!confirm('코트를 비웁니다. 계속할까요?')) return
    state = { presetId: '', tokens: [] }; selected = null
    location.hash = ''; render()
  }
  $('#share').onclick = () => share(state)

  const fromHash = location.hash.length > 1 && decodeState(location.hash.slice(1))
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null')
  if (fromHash?.tokens) { state = fromHash; render() }
  else if (saved?.tokens?.length) { state = saved; render() }
  else applyPreset('pnr', false)

  if (state.presetId) $('#preset').value = state.presetId
  $('#preset').onchange()
}

boot()
