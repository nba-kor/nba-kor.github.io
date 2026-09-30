// 전술판 — 하프코트 3:3 배치 / 동선 / 프리셋(기본 + 커스텀) / 재생 / 공유(링크 · 카카오톡)
import { loadPlayers, mountFilters, chipEl, faceOf, startDrag, mountTop, decodeState, encodeState, share, POS_KO, KAKAO_JS_KEY, loadKakao, shareKakao, kakaoList } from './app.js?v=722e4f3b'
import { drawCourt, renderTokens, presetTokens, play } from './court.js?v=d269750e'
import { api } from './auth.js?v=5d44380b'
import { h, startAuth, loggedIn, authFirst, auth, me } from './board.js?v=27243310'

const STORE = 'dc.tactics'

const svg = document.getElementById('court')
const $ = s => document.querySelector(s)

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// ---------------------------------------------------------------- 상태

/** token: { key, side:'off'|'def', label, playerId|null, x, y, routes:[{kind,pts}] }
 *  presetId: 기본 전술 id | 'c:<커스텀 id>' | 'edit'(고친 보드, 등록 전) · base: 고치기 시작한 기본 전술 id(등록할 때 같이 보낸다) */
let state = { presetId: '', tokens: [] }
let customs = []          // 커스텀 전술 목록(좋아요순) — { id, title, author, likes, preset }
const detail = new Map()  // 커스텀 id → GET /api/tactics/<id> 결과(보드 · 설명 · 내가 좋아요 했는지)
let data = { players: [], byId: new Map() }
let pool = []            // 현재 필터가 적용된 선수 목록
let tactics = { presets: [] }
let mode = 'move'        // 'move' | 'route'
let routeKind = 'move'   // 'move' | 'pass' | 'screen'
let side = 'off'         // 새 선수를 놓을 진영
let selected = null      // token key
let animating = false

const tokensOf = s => state.tokens.filter(t => t.side === s)
const customId = v => /^c:\d+$/.test(v || '') ? v.slice(2) : null

/** 보드를 고쳤다 = 위치 · 동선 · 선수 수가 바뀌었다(선수만 바꿔 끼운 건 아니다). 커스텀 전술 등록 칸이 열린다 */
function edited() {
  if (state.presetId === 'edit') return
  const c = customId(state.presetId)
  state.base = c ? customs.find(x => String(x.id) === c)?.preset ?? null : tactics.presets.some(p => p.id === state.presetId) ? state.presetId : null
  state.presetId = 'edit'
  fillPresets()
}
const save = () => { if (!animating) localStorage.setItem(STORE, JSON.stringify(state)) }

// ---------------------------------------------------------------- 렌더

function render() {
  renderTokens(svg, state.tokens, data.byId, selected)

  // 같은 선수를 공격·수비에 하나씩 둘 수 있다. 양쪽에 다 올라가면 목록에서 잠근다.
  const sides = new Map()
  for (const t of state.tokens) if (t.playerId) sides.set(t.playerId, (sides.get(t.playerId) || new Set()).add(t.side))
  document.querySelectorAll('#roster-chips .chip').forEach(c => {
    const n = sides.get(c.dataset.id)?.size || 0
    c.classList.toggle('used', n >= 2)
    c.classList.toggle('half', n === 1)
  })
  renderSelected()
  save()
}

function renderSelected() {
  const box = $('#sel-info')
  const t = state.tokens.find(t => t.key === selected)
  const p = t && t.playerId && data.byId.get(t.playerId)
  if (!t) { box.innerHTML = '<p class="empty" style="padding:0">코트 위 선수를 눌러 선택하세요.</p>'; return }
  if (!p) {   // 이름표는 공유 링크로 들어온 남의 글자일 수 있다 — HTML 로 넣지 않는다
    box.innerHTML = '<p class="empty" style="padding:0"><b></b> — 선수를 끌어다 놓으세요.</p>'
    box.querySelector('b').textContent = t.label
    return
  }
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
  // 인게임에서 같은 선수를 양 팀이 동시에 쓸 수 있으므로, 중복 제거는 같은 진영 안에서만 한다.
  const to = target ? target.side : side
  state.tokens.forEach(t => { if (t.playerId === playerId && t.side === to) t.playerId = null })
  if (target) { target.playerId = playerId; render(); return }
  const key = nextKey(side)
  edited()
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
      else edited()
      render()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  } else {
    const move = e => { const [x, y] = toNorm(e.clientX, e.clientY); if (x === t.x && y === t.y) return; moveToken(t, x, y); edited(); render() }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
})

// ---------------------------------------------------------------- 재생

// 재생 중에는 토큰 좌표가 계속 바뀐다 — 드래그와 저장을 막아 중간 좌표가 남지 않게 한다.
async function playBoard() {
  if (animating) return
  const run = play(svg, state.tokens, render)
  if (!run) return
  animating = true
  await run
  animating = false
  save()
}

// ---------------------------------------------------------------- 확대 / 축소

// 코트 폭은 CSS 가 화면 높이에 맞춰 정하고(--court-chrome), 여기서는 배율만 곱한다.
// 배율이 1을 넘으면 .court-view 가 스크롤되므로 좌표 계산(getBoundingClientRect)은 그대로 맞는다.
const ZOOM_KEY = 'dc.zoom'
let zoom = 1
function setZoom(z) {
  zoom = Math.round(clamp(z, .5, 2.5) * 100) / 100
  document.documentElement.style.setProperty('--zoom', zoom)
  $('#zoom-fit').textContent = `${Math.round(zoom * 100)}%`
  localStorage.setItem(ZOOM_KEY, zoom)
}

function mountZoom() {
  $('#zoom-in').onclick = () => setZoom(zoom * 1.15)
  $('#zoom-out').onclick = () => setZoom(zoom / 1.15)
  $('#zoom-fit').onclick = () => setZoom(1)
  $('.court-view').addEventListener('wheel', e => {   // Ctrl(⌘) + 휠
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))
  }, { passive: false })
  setZoom(+localStorage.getItem(ZOOM_KEY) || 1)
}

// ---------------------------------------------------------------- 프리셋

/** 프리셋 자동 배정. 되도록 서로 다른 선수를 쓰되, 목록이 모자라면 상대 진영과 겹쳐서라도 채운다. */
function autoAssign(slots, used, sideUsed = new Set()) {
  return slots.map(s => {
    const p = pool.find(x => !used.has(x.id) && s.pos.includes(x.pos))
      || pool.find(x => !used.has(x.id))
      || pool.find(x => !sideUsed.has(x.id) && s.pos.includes(x.pos))
      || pool.find(x => !sideUsed.has(x.id))
    if (p) { used.add(p.id); sideUsed.add(p.id) }
    return p ? p.id : null
  })
}

async function applyPreset(id, keep) {
  if (customId(id)) return applyCustom(id, keep)
  const pr = tactics.presets.find(p => p.id === id)
  if (!pr) return
  const held = s => state.tokens.filter(t => t.side === s).map(t => t.playerId)
  const used = new Set(keep ? state.tokens.map(t => t.playerId).filter(Boolean) : [])
  const offIds = keep ? held('off') : autoAssign(pr.offense, used, new Set())
  const defIds = keep ? held('def') : autoAssign(pr.defense, used, new Set())
  state = { presetId: id, tokens: presetTokens(pr, offIds, defIds) }
  selected = null
  fillPresets()
  render()
}

// ---------------------------------------------------------------- 커스텀 전술

async function loadCustoms() {
  try { customs = (await api('/tactics?sort=likes')).tactics } catch { customs = [] }   // 못 읽어도 기본 전술은 쓴다
  fillPresets()
}

/** 커스텀 하나를 읽는다(보드 · 설명 · 좋아요 여부). 로그인이 바뀌면 fresh 로 다시 */
async function customOf(id, fresh) {
  if (!fresh && detail.has(id)) return detail.get(id)
  await authFirst
  const d = await api(`/tactics/${id}`, { withToken: auth === 'in' })
  detail.set(id, d)
  return d
}

async function applyCustom(v, keep) {
  let d
  try { d = await customOf(customId(v)) } catch (e) { return alert(e.message) }
  const held = new Map(state.tokens.map(t => [t.key, t.playerId]))
  state = { presetId: v, tokens: structuredClone(d.tactic.board.tokens).map(t => keep ? { ...t, playerId: held.get(t.key) ?? null } : t) }
  selected = null
  fillPresets()
  render()
}

/** 선택 상자: 기본(공격 · 수비) → 커스텀(좋아요순). 고친 보드면 맨 위에 "직접 수정한 전술" */
function fillPresets() {
  const sel = $('#preset'), keep = sel.value
  const opt = (value, label) => h('option', { value }, label)
  sel.replaceChildren(...[
    state.presetId === 'edit' && opt('edit', '✏️ 직접 수정한 전술 (등록 전)'),
    ...['공격', '수비'].map(tag => h('optgroup', { label: `${tag} 전술` }, tactics.presets.filter(p => p.tag === tag).map(p => opt(p.id, p.name)))),
    customs.length > 0 && h('optgroup', { label: '커스텀 전술' }, customs.map(c => opt(`c:${c.id}`, `${c.title} · 👍${c.likes}`))),
  ].filter(Boolean))
  // 방금 보드를 바꿨으면 그 전술을, 아니면 사람이 보던 항목을 그대로
  sel.value = state.presetId && [...sel.options].some(o => o.value === state.presetId) ? state.presetId : keep
  if (!sel.value) sel.selectedIndex = 0
  $('#register').hidden = state.presetId !== 'edit'
  showDesc()
}

/** 고른 항목의 설명. 커스텀은 설명 · 한 줄 띄고 작성자 · 좋아요(내 것은 삭제도) */
let descSeq = 0
async function showDesc(fresh) {
  const v = $('#preset').value, desc = $('#preset-desc'), meta = $('#custom-meta'), my = ++descSeq
  const isEdit = v === 'edit'
  $('#apply-preset').disabled = $('#apply-keep').disabled = isEdit
  meta.hidden = true
  if (!customId(v)) { desc.textContent = isEdit ? '코트에서 고친 전술이에요. 아래에서 이름과 설명을 붙여 등록할 수 있어요.' : tactics.presets.find(p => p.id === v)?.desc || ''; return }
  desc.textContent = '불러오는 중…'
  let d
  try { d = await customOf(customId(v), fresh) } catch (e) { if (my === descSeq) desc.textContent = e.message; return }
  if (my !== descSeq) return
  const t = d.tactic
  let liked = d.liked
  desc.textContent = t.body
  const like = h('button', { type: 'button', className: 'tc-like' })
  const paint = n => { like.textContent = `👍 좋아요 ${n}`; like.setAttribute('aria-pressed', liked) }
  paint(t.likes)
  like.onclick = async () => {
    if (!await loggedIn()) return
    like.disabled = true
    try {
      const r = await api(`/tactics/${t.id}/like`, { method: 'POST', withToken: true })
      liked = d.liked = r.liked
      t.likes = r.likes
      paint(r.likes)
      const c = customs.find(x => x.id === t.id)
      if (c) { c.likes = r.likes; customs.sort((a, b) => b.likes - a.likes || b.id - a.id) }
      const o = $(`#preset option[value="c:${t.id}"]`)
      if (o) o.textContent = `${t.title} · 👍${r.likes}`   // 순서는 다음에 열 때 — 고르는 중에 항목이 움직이지 않게
    } catch (e) { alert(e.message) }
    finally { like.disabled = false }
  }
  const mine = auth === 'in' && me.id === t.authorId
  meta.replaceChildren(h('p', {}, '작성자 ', h('b', {}, t.author)), h('div', { className: 'row' }, like,
    mine && h('button', { type: 'button', className: 'danger', onclick: () => removeCustom(t) }, '삭제')))
  meta.hidden = false
}

async function removeCustom(t) {
  if (!confirm(`「${t.title}」을(를) 지울까요? 좋아요도 같이 지워져요`)) return
  try { await api(`/tactics/${t.id}`, { method: 'DELETE', withToken: true }) } catch (e) { return alert(e.message) }
  detail.delete(String(t.id))
  if (state.presetId === `c:${t.id}`) { state.base = t.preset; state.presetId = 'edit' }   // 보드는 그대로 — 다시 등록할 수 있다
  await loadCustoms()
}

function bindRegister() {
  const f = $('#register'), el = f.elements, err = $('.rc-form-err', f)
  f.onsubmit = async e => {
    e.preventDefault()
    const btn = $('[type=submit]', f)
    const bad = !state.tokens.length ? '코트에 선수를 한 명 이상 올려 주세요' : !el.title.value.trim() ? '전술 이름을 입력해 주세요' : !el.body.value.trim() ? '전술 설명을 입력해 주세요' : ''
    err.textContent = bad
    err.hidden = !bad
    if (bad || btn.disabled || !await loggedIn()) return
    btn.disabled = true
    try {
      const { tactic } = await api('/tactics', {
        method: 'POST', withToken: true,
        body: { title: el.title.value, body: el.body.value, preset: state.base ?? null, board: { tokens: state.tokens } },
      })
      detail.set(String(tactic.id), { tactic, liked: false, comments: [] })
      state.presetId = `c:${tactic.id}`
      f.reset()
      await loadCustoms()
      save()
    } catch (e) { err.textContent = e.message; err.hidden = false }
    finally { btn.disabled = false }
  }
}

// ---------------------------------------------------------------- 카카오톡 공유

const KAKAO_URL_MAX = 2000   // ponytail: 카카오 링크 길이 한도는 문서에 없다 — 동선이 긴 보드는 주소가 길어져 막힐 수 있어 넘으면 등록을 권한다

/** 등록된 커스텀(안 고친 것)은 짧은 ?c= 주소, 나머지는 보드를 통째로 담은 # 주소 */
function boardUrl() {
  const c = customId(state.presetId)
  return c ? `${location.origin}/tactics/?c=${c}` : `${location.origin}/tactics/#${encodeState(state)}`
}
const boardTitle = () => {
  const c = customId(state.presetId)
  return c ? customs.find(x => String(x.id) === c)?.title || '커스텀 전술'
    : tactics.presets.find(p => p.id === state.presetId)?.name || '직접 짠 전술'
}

/** 리스트 카드: 코트의 선수(공격 먼저) 한 줄씩 — 4~5명이면 사용자 정의 4 · 5줄, 6명이면 5번째 줄에 남은 선수를 묶는다.
 *  등록 안 한 보드(# 주소)는 kakaoList 가 기본 3줄로 내린다. 선수가 2명 미만이면 사이트 대표 이미지 한 장짜리 피드 카드 */
function kakaoPayload() {
  const url = boardUrl(), title = `🏀 ${boardTitle()} · 전술판`
  const who = state.tokens.filter(t => data.byId.get(t.playerId)?.server === 'kr').sort((a, b) => (a.side === 'def') - (b.side === 'def'))
  if (who.length < 2) {
    const link = { mobileWebUrl: url, webUrl: url }
    return { objectType: 'feed', content: { title, description: '하프코트 3:3 전술 — 눌러서 동선 재생', imageUrl: `${location.origin}/assets/og.jpg`, link }, buttons: [{ title: '전술 보기', link }] }
  }
  const face = id => `${location.origin}/assets/share/${id}.jpg`, side = t => t.side === 'off' ? '공격' : '수비'
  const rows = who.map(t => ({ title: `${data.byId.get(t.playerId).name} · ${t.label}`, desc: side(t), img: face(t.playerId) }))
  if (who.length > 5) {
    const rest = who.slice(4)
    rows.splice(4, Infinity, { title: rest.map(t => data.byId.get(t.playerId).name).join(' · '), desc: [...new Set(rest.map(side))].join(' · '), img: face(rest[0].playerId) })
  }
  return kakaoList({
    header: title, url, rows,
    buttons: [{ title: '전술 보기', url }, { title: '팀원 모집', url: `${location.origin}/recruit/` }],   // 나란히 두 개라 5자 이내
  })
}

// ---------------------------------------------------------------- 초기화

const boot = async () => {
  data = await loadPlayers()
  mountTop('/tactics/', data.updatedAt)
  tactics = await fetch('/data/tactics.json', { cache: 'no-cache' }).then(r => r.json())

  loadKakao()
  bindRegister()

  drawCourt(svg)
  mountZoom()

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
  $('#preset').onchange = () => showDesc()
  $('#play').onclick = playBoard
  $('#clear-routes').onclick = () => {
    const t = state.tokens.find(t => t.key === selected)
    if (t?.routes.length) { t.routes = []; edited(); render() }
  }
  $('#remove-token').onclick = () => {
    if (!state.tokens.some(t => t.key === selected)) return
    edited()
    state.tokens = state.tokens.filter(t => t.key !== selected)
    selected = null; render()
  }
  $('#reset').onclick = () => {
    if (!confirm('코트를 비웁니다. 계속할까요?')) return
    state = { presetId: '', tokens: [] }; selected = null
    location.hash = ''; fillPresets(); render()
  }
  $('#share').onclick = () => share(state)
  $('#kakao').textContent = KAKAO_JS_KEY ? '카카오톡 공유' : '공유하기'
  $('#kakao').onclick = e => {
    if (boardUrl().length > KAKAO_URL_MAX) return alert('동선이 많아 카카오톡으로 보내기엔 주소가 너무 길어요. 커스텀 전술로 등록하면 짧은 주소로 보낼 수 있어요 (「공유 링크」 복사는 돼요).')
    shareKakao(e.currentTarget, kakaoPayload, { title: `${boardTitle()} · 전술판`, url: boardUrl() })
  }

  // 로그인은 등록 · 좋아요에만 필요하다. 로그인 상태가 정해지거나 바뀌면 보던 커스텀의 좋아요 여부 · 내 것 표시를 다시 읽는다
  startAuth('등록하려면 디스코드 로그인이 필요해요.', () => customId($('#preset').value) && showDesc(true))

  // ?c=<id> — 카톡 · 링크로 받은 커스텀 전술. 보드는 그 전술 그대로(선수 포함)
  const shared = new URLSearchParams(location.search).get('c')
  const fromHash = location.hash.length > 1 && decodeState(location.hash.slice(1))
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null')
  await loadCustoms()
  if (/^\d+$/.test(shared || '')) {
    history.replaceState(null, '', location.pathname)   // 새로고침 때 고친 보드를 덮어쓰지 않게 — 한 번 불러오면 저장된 보드로 이어 간다
    await applyCustom(`c:${shared}`, false)
  } else if (fromHash?.tokens) { state = fromHash; render() }
  else if (saved?.tokens?.length) { state = saved; render() }
  else applyPreset('pnr', false)
  fillPresets()
}

boot()
