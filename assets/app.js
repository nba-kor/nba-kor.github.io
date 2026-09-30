// 전술판 / 티어표 공통 모듈 — 선수 데이터 로딩, 목록 렌더, 포인터 드래그.

// 우클릭 메뉴를 막는다. 터치에서는 길게 누르기 메뉴도 같이 막혀,
// 칩을 꾹 눌러 드래그를 시작할 때 OS 메뉴가 끼어들지 않는 이점도 있다.
addEventListener('contextmenu', e => e.preventDefault())

export const POS = ['', 'PG', 'SG', 'SF', 'PF', 'C']
export const POS_KO = ['', '포인트가드', '슈팅가드', '스몰포워드', '파워포워드', '센터']

const FILTER_KEY = 'dc.filter'

/** data/players.json(한국 출시) + data/upcoming.json(미출시)을 합쳐서 반환. */
export async function loadPlayers() {
  const j = async (p, fallback) => fetch(p, { cache: 'no-cache' }).then(r => r.json()).catch(() => fallback)
  const [kr, up] = await Promise.all([
    j('/data/players.json', { players: [], updatedAt: '' }),
    j('/data/upcoming.json', { players: [] }),
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
  // 좁은 화면에서는 메뉴를 햄버거 버튼 뒤로 접는다(보이고 말고는 CSS 가 정한다).
  const top = document.querySelector('.top')
  const btn = Object.assign(document.createElement('button'), { className: 'menu-btn', textContent: '☰' })
  btn.setAttribute('aria-label', '메뉴')
  btn.setAttribute('aria-expanded', 'false')
  btn.onclick = () => btn.setAttribute('aria-expanded', top.classList.toggle('open'))
  top.append(btn)
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

// ---------------------------------------------------------------- 공유 (팀원모집 · 잠재력추천)

// Kakao Developers > 앱 > 플랫폼 키 > JavaScript 키. 비우면 공유 버튼이 기기 공유 · 링크 복사로 대체된다.
export const KAKAO_JS_KEY = '8f89f3ef476f72827c9a875ad0c23a72'

/** SDK 는 클릭 전에 미리 받아 둔다 (클릭 때 받으면 sendDefault 가 동기 호출이 못 된다) */
export function loadKakao() {
  if (!KAKAO_JS_KEY) return
  const s = Object.assign(document.createElement('script'), {
    src: 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js',
    integrity: 'sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy',
    crossOrigin: 'anonymous',
    onload: () => { if (!Kakao.isInitialized()) Kakao.init(KAKAO_JS_KEY) },
  })
  document.head.append(s)
}

// 카카오 디벨로퍼스 > 메시지 템플릿 빌더의 사용자 정의 리스트(4줄 · 5줄). 기본 리스트 템플릿은 3줄이 최대라 따로 만들었다.
// 변수: HEADER · HEADER_PATH · TITLEn · DESCn · IMGn · PATHn · BTN1 · BTN1_PATH · BTN2 · BTN2_PATH (링크는 사이트 도메인 뒤 경로만)
// 템플릿을 고치거나 지우면 여기 번호도 같이 — 비우면 그 줄 수는 기본 3줄 카드로 보낸다
// 버튼 두 개는 나란히라 이름이 5자를 넘으면 두 줄로 접힌다
export const KAKAO_LIST_TEMPLATES = { 4: 137568, 5: 137513 }

/**
 * 리스트 카드. 줄이 4~5개면 사용자 정의 템플릿, 그보다 적거나 주소에 # 가 있으면(템플릿 링크는 경로 · 쿼리만 받는다) 기본 리스트(3줄).
 * rows: [{ title, desc, img, url }] — 5개 넘으면 앞 5개. buttons: [{ title, url }] 2개(사용자 정의 템플릿은 버튼 2개로 만들었다)
 */
export function kakaoList({ header, url, rows, buttons }) {
  const n = Math.min(rows.length, 5), id = KAKAO_LIST_TEMPLATES[n]
  const path = u => { const x = new URL(u, location.origin); return (x.pathname + x.search).replace(/^\//, '') }
  if (id && ![url, ...rows.map(r => r.url), ...buttons.map(b => b.url)].some(u => u?.includes('#'))) {
    const args = { HEADER: header, HEADER_PATH: path(url) }
    rows.slice(0, n).forEach((r, i) => Object.assign(args, {
      [`TITLE${i + 1}`]: r.title, [`DESC${i + 1}`]: r.desc || ' ', [`IMG${i + 1}`]: r.img, [`PATH${i + 1}`]: path(r.url || url),
    }))
    buttons.forEach((b, i) => Object.assign(args, { [`BTN${i + 1}`]: b.title, [`BTN${i + 1}_PATH`]: path(b.url) }))
    return { templateId: id, templateArgs: args }
  }
  const link = u => ({ mobileWebUrl: u, webUrl: u })
  return {
    objectType: 'list', headerTitle: header, headerLink: link(url),
    contents: rows.slice(0, 3).map(r => ({ title: r.title, description: r.desc, imageUrl: r.img, link: link(r.url || url) })),
    buttons: buttons.map(b => ({ title: b.title, link: link(b.url) })),
  }
}

/** 카카오톡 공유. SDK 가 없으면 기기 공유창, 그것도 없으면 링크 복사.
 *  클릭 핸들러 안에서 동기로 불러야 PC 팝업이 차단되지 않는다 — 앞에 await 를 두지 말 것 */
export function shareKakao(btn, payload, { title, url }) {
  if (window.Kakao?.isInitialized?.()) {
    try {
      const p = payload()   // 사용자 정의 템플릿이면 { templateId, templateArgs }
      return p.templateId ? Kakao.Share.sendCustom(p) : Kakao.Share.sendDefault(p)
    } catch (e) { console.warn(e) }
  }
  if (navigator.share) return navigator.share({ title, url }).catch(() => {})
  copyLink(btn, url)
}

export async function copyLink(btn, url) {
  try {
    await navigator.clipboard.writeText(url)
    const label = btn.textContent
    btn.textContent = '복사했어요'
    setTimeout(() => { btn.textContent = label }, 1600)
  } catch {
    prompt('링크', url)
  }
}
