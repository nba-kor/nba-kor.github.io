// 전술판 / 티어표 공통 모듈 — 선수 데이터 로딩, 목록 렌더, 포인터 드래그.

export const POS = ['', 'PG', 'SG', 'SF', 'PF', 'C']
export const POS_KO = ['', '포인트가드', '슈팅가드', '스몰포워드', '파워포워드', '센터']

const FILTER_KEY = 'dc.filter'

/** data/players.json(한국 출시) + data/upcoming.json(미출시)을 합쳐서 반환. */
export async function loadPlayers() {
  const j = async (p, fallback) => fetch(p, { cache: 'no-cache' }).then(r => r.json()).catch(() => fallback)
  const [kr, up] = await Promise.all([
    j('data/players.json', { players: [], updatedAt: '' }),
    j('data/upcoming.json', { players: [] }),
  ])
  const players = [...kr.players, ...up.players.map(p => ({ ...p, server: p.server || 'cn' }))]
  return { updatedAt: kr.updatedAt, players, byId: new Map(players.map(p => [p.id, p])) }
}

export const loadFilter = () => ({
  pos: 0, q: '', upcoming: false,
  ...(JSON.parse(localStorage.getItem(FILTER_KEY) || '{}')),
})
export const saveFilter = f => localStorage.setItem(FILTER_KEY, JSON.stringify(f))

export function applyFilter(players, f) {
  const q = f.q.trim().toLowerCase()
  return players.filter(p =>
    (f.upcoming || p.server === 'kr') &&
    (!f.pos || p.pos === f.pos) &&
    (!q || (p.name + p.short + (p.en || '') + (p.nickname || '')).toLowerCase().includes(q)))
}

/** 얼굴 이미지가 없는 선수(주로 미출시)는 이름 이니셜 아바타로 대체한다. */
export function faceOf(p) {
  if (p.img) return p.img
  const n = p.short || p.name || '?'
  const t = /[가-힣一-龥ぁ-ヿ]/.test(n) ? n.slice(0, 1) : n.slice(0, 2)   // 한글·한자는 한 글자면 충분
  const hue = [...(p.id || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" rx="36" fill="hsl(${hue},38%,32%)"/>` +
    `<text x="36" y="46" font-size="26" font-family="sans-serif" font-weight="700" fill="#e6edf3" text-anchor="middle">${t}</text></svg>`)
}

export function chipEl(p) {
  const el = document.createElement('div')
  el.className = 'chip'
  el.dataset.id = p.id
  el.dataset.server = p.server
  el.title = `${p.name}${p.en ? ` (${p.en})` : ''} · ${POS_KO[p.pos]}${p.height ? ` · ${p.height}cm` : ''}`
  el.innerHTML = `<img src="${faceOf(p)}" alt="" loading="lazy"><span class="nm"></span><span class="pos pos-${p.pos}"></span>`
  el.querySelector('.nm').textContent = p.short || p.name
  el.querySelector('.pos').textContent = POS[p.pos]
  return el
}

/**
 * 필터 UI(포지션 탭 / 검색 / 미출시 체크박스)를 붙이고, 변경 시 onChange(filtered)를 호출한다.
 * 필터 상태는 localStorage에 공유 저장되어 전술판·티어표가 같은 설정을 쓴다.
 */
export function mountFilters(root, players, onChange) {
  const f = loadFilter()
  root.innerHTML = `
    <div class="pos-tabs">
      ${[0, 1, 2, 3, 4, 5].map(i => `<button data-pos="${i}">${i ? POS[i] : '전체'}</button>`).join('')}
    </div>
    <input type="search" placeholder="선수 검색" value="">
    <label class="check"><input type="checkbox"> 미출시 선수 포함</label>`
  const search = root.querySelector('input[type=search]')
  const check = root.querySelector('input[type=checkbox]')
  search.value = f.q
  check.checked = f.upcoming

  const sync = () => {
    root.querySelectorAll('[data-pos]').forEach(b => b.classList.toggle('on', +b.dataset.pos === f.pos))
    saveFilter(f)
    onChange(applyFilter(players, f))
  }
  root.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => { f.pos = +b.dataset.pos; sync() })
  search.oninput = () => { f.q = search.value; sync() }
  check.onchange = () => { f.upcoming = check.checked; sync() }
  sync()
  return () => sync()
}

/**
 * 포인터 기반 드래그(마우스 + 터치 공용).
 * ghost 를 만들어 손가락을 따라다니게 하고, 놓는 순간 onDrop(x, y, elementUnderPointer)을 부른다.
 */
export function startDrag(ev, source, { onDrop, onMove }) {
  if (ev.button > 0) return
  const touch = ev.pointerType !== 'mouse'
  const sx = ev.clientX, sy = ev.clientY
  let ghost = null, timer = 0

  const at = e => {
    ghost.style.left = `${e.clientX}px`
    ghost.style.top = `${e.clientY}px`
  }
  const begin = e => {
    clearTimeout(timer)
    ghost = source.cloneNode(true)
    ghost.classList.add('ghost')
    ghost.classList.remove('used')
    document.body.appendChild(ghost)
    try { source.setPointerCapture(ev.pointerId) } catch { /* 무시 */ }
    at(e)
  }
  const stop = () => {
    clearTimeout(timer)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', stop)
    ghost?.remove()
    ghost = null
  }
  // 터치에서는 목록 세로 스크롤과 충돌하지 않도록 "꾹 누르거나 가로로 끌면" 드래그가 시작된다.
  const move = e => {
    if (!ghost) {
      const dx = e.clientX - sx, dy = e.clientY - sy
      if (!touch) { if (Math.hypot(dx, dy) > 5) begin(e); else return }
      else if (Math.abs(dx) > 8 && Math.abs(dx) >= Math.abs(dy)) begin(e)
      else if (Math.hypot(dx, dy) > 10) return stop()   // 세로 스크롤로 판단
      else return
    }
    e.preventDefault()
    at(e)
    onMove?.(e)
  }
  const up = e => {
    const dragged = !!ghost
    stop()
    if (dragged) onDrop(e.clientX, e.clientY, document.elementFromPoint(e.clientX, e.clientY))
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', stop)
  if (touch) timer = setTimeout(() => begin(ev), 220)
}

/** 상단 네비게이션 + 데이터 갱신일 표시. */
export function mountTop(current, updatedAt) {
  const el = document.querySelector('.top .stamp')
  if (el && updatedAt) el.textContent = `선수 데이터 ${updatedAt} 기준`
  document.querySelectorAll('.top nav a').forEach(a => {
    if (a.getAttribute('href') === current) a.setAttribute('aria-current', 'page')
  })
}

/** URL 해시로 상태 공유. 한글이 들어가므로 UTF-8 → base64url. */
export const encodeState = o => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const decodeState = s => {
  try {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(b, c => c.charCodeAt(0))))
  } catch { return null }
}

export async function share(state) {
  const url = `${location.origin}${location.pathname}#${encodeState(state)}`
  history.replaceState(null, '', `#${encodeState(state)}`)
  try {
    await navigator.clipboard.writeText(url)
    alert('공유 링크를 복사했습니다.')
  } catch {
    prompt('공유 링크', url)
  }
}
