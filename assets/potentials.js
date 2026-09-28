// 잠재력추천 — 빌드 목록(추천순 · 최신순 · 포지션 · 캐릭터 필터) · 글(30칸 · 추천 · 댓글) · 쓰기 · 고치기
import { loadPlayers, faceOf, mountTop, POS } from './app.js?v=1af68f91'
import { api, initAuth, login, logout, session, IN_KAKAO } from './auth.js?v=5d44380b'

const $ = (s, root = document) => root.querySelector(s)
/** DOM 생성. 문자열 자식은 텍스트 노드가 되므로 사용자 입력을 그대로 넣어도 안전하다. */
const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) k in n ? n[k] = v : n.setAttribute(k, v)
  n.append(...kids.flat().filter(k => k != null && k !== false))
  return n
}
const ago = ms => {
  const m = Math.floor((Date.now() - ms) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`
  if (m < 43200) return `${Math.floor(m / 1440)}일 전`
  return new Date(ms).toLocaleDateString('ko-KR')
}

let data, cat, kr, pot
let auth = 'loading', me = null   // me = { id, name } — 로그인했을 때
const P = id => data.byId.get(id) || { id, name: id, short: id, pos: 0 }
const plus = v => `+${+v.toFixed(2)}`   // 0.15 × 10 같은 합에 붙는 부동소수점 꼬리를 뗀다
const statLine = p => p.stats.map(([k, v]) => `${k} ${plus(v)}`).join(' · ')
/** 30칸 능력치 합계, 큰 것부터 — [[이름, 값]] */
function totals(slots) {
  const sum = new Map()
  for (const id of Object.values(slots).flat()) for (const [k, v] of pot.get(id)?.stats || []) sum.set(k, (sum.get(k) || 0) + v)
  return [...sum].sort((a, b) => b[1] - a[1])
}
const totalsView = slots => {
  const t = totals(slots)
  return h('div', { className: 'pt-total' }, h('b', {}, '능력치 합계'),
    t.length ? t.map(([k, v]) => h('span', {}, k, h('em', {}, plus(v)))) : h('span', { className: 'rc-muted' }, '잠재력을 넣으면 여기에 합계가 나와요'))
}

// ---------------------------------------------------------------- 로그인

async function loadMe() {
  if (!await session()) return setAuth('out')
  try {
    const v = await api('/me', { withToken: true })
    setAuth('in', { id: v.user.id, name: v.profile?.name || v.user.name })
  } catch (e) { setAuth(e.status === 401 ? 'out' : 'error') }
}
let authReady
const authFirst = new Promise(r => { authReady = r })
function setAuth(state, v = null) {
  auth = state
  me = v
  if (state !== 'loading') authReady()
  const btn = (label, onclick, props = {}) => h('button', { type: 'button', onclick, ...props }, label)
  $('#auth').replaceChildren(...{
    loading: [h('span', { className: 'rc-muted' }, '로그인 확인 중…')],
    down: [h('span', { className: 'rc-muted', title: '로그인 모듈을 불러오지 못했어요. 새로고침해 보세요' }, '로그인 불가')],
    out: [btn('디스코드 로그인', login, { className: 'rc-login' })],
    error: [h('span', { className: 'rc-muted rc-bad' }, '로그인 확인 실패'), btn('다시 시도', loadMe)],
    in: me && [h('b', { className: 'rc-uname' }, me.name), btn('로그아웃', logout)],
  }[auth])
  const need = $('#need')
  need.textContent = auth === 'out' ? `빌드를 쓰거나 추천 · 댓글을 달려면 디스코드 로그인이 필요해요.${IN_KAKAO ? ' 로그인을 누르면 평소 쓰는 브라우저로 열려요.' : ''}` : ''
  need.hidden = !need.textContent
  if (view === 'build' && state !== 'loading') showBuild()   // 추천 여부 · 내 글 버튼이 로그인에 따라 달라진다 — 첫 표시도 여기서
}

/** 쓰기 전에: 로그인이 안 돼 있으면 로그인으로 보내고 false */
async function loggedIn() {
  await authFirst
  if (auth === 'in') return true
  if (auth === 'out') login()
  else alert('로그인 정보를 확인하지 못했어요 — 새로고침해 보세요')
  return false
}

// ---------------------------------------------------------------- 캐릭터 고르기 (필터 · 글쓰기 공용)

/** 포지션 탭 + 초상화 격자. pick(id) 는 누를 때마다, isOn(id) 로 선택 표시. 포지션 탭은 onPos(pos) 로도 알린다 */
function charGrid({ isOn, pick, onPos }) {
  let pos = 0
  const tabs = [0, 1, 2, 3, 4, 5].map(i => h('button', { type: 'button', className: 'rc-fbtn', 'data-pos': i, onclick: () => { pos = i; onPos?.(i); sync() } }, i ? POS[i] : '전체'))
  const faces = kr.map(p => h('button', { type: 'button', className: 'pt-face', title: p.name, onclick: () => { pick(p.id); sync() } },
    h('img', { src: faceOf(p), alt: '', loading: 'lazy' }), h('span', {}, p.short || p.name)))
  const sync = () => {
    tabs.forEach((b, i) => b.setAttribute('aria-pressed', i === pos))
    faces.forEach((b, i) => { b.hidden = pos > 0 && kr[i].pos !== pos; b.setAttribute('aria-pressed', isOn(kr[i].id)) })
  }
  sync()
  return Object.assign(h('div', { className: 'pt-chars' }, h('div', { className: 'rc-filter' }, tabs), h('div', { className: 'pt-grid' }, faces)), { sync })
}

// ---------------------------------------------------------------- 30칸 보기

// 인게임 잠재력 판. 칸 좌표는 게임 캡처(1155×660)에서 그대로 땄다 — 색마다 바깥 줄 6칸 + 안쪽 줄 4칸
const NODES = {
  red: [[140, 194], [200, 140], [276, 116], [353, 116], [425, 140], [487, 194], [206, 230], [272, 189], [353, 189], [419, 230]],
  green: [[91, 275], [79, 352], [93, 429], [132, 498], [192, 547], [266, 573], [156, 313], [157, 389], [195, 459], [264, 499]],
  blue: [[536, 276], [548, 353], [531, 431], [495, 500], [433, 548], [360, 574], [470, 315], [470, 390], [432, 459], [362, 499]],
}
const CHAINS = [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9]]
const iconOf = id => `/assets/potentials/${id}.png`
const svg = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  n.append(...kids.flat().filter(Boolean))
  return n
}

/** 판 하나. sel = { color, i } 고른 칸(글쓰기), onNode(color, i) = 칸을 눌렀을 때 */
function boardView(slots, { sel, onNode } = {}) {
  const C = [312, 345]
  return svg('svg', { viewBox: '12 44 600 600', class: 'pt-board', role: 'img', 'aria-label': '잠재력 판' },
    svg('circle', { cx: C[0], cy: C[1], r: 298, class: 'pt-b-blob' }),
    [[40, 210], [585, 210], [312, 645]].map(([x, y]) => svg('line', { x1: C[0], y1: C[1], x2: x, y2: y, class: 'pt-b-div' })),
    svg('circle', { cx: C[0], cy: C[1] - 5, r: 50, class: 'pt-b-logo' }),
    svg('path', { d: `M${C[0] - 14},${C[1] - 18} v22 M${C[0] + 14},${C[1] - 18} v22`, class: 'pt-b-logo' }),
    cat.colors.map(({ id: color, name }) => svg('g', { class: `pt-b-${color}` },
      CHAINS.map(ch => svg('polyline', { points: ch.map(i => NODES[color][i].join(',')).join(' '), class: 'pt-b-line' })),
      NODES[color].map(([x, y], i) => {
        const p = pot.get(slots[color][i]), on = sel?.color === color && sel.i === i
        const g = svg('g', { class: `pt-b-node${p ? ' is-full' : ''}${on ? ' is-sel' : ''}` },
          svg('title', {}, `${name} ${i + 1}번 · ${p ? `${p.name} (${statLine(p)})` : '빈 칸'}`),
          svg('circle', { cx: x, cy: y, r: 27, class: 'pt-b-dot' }),
          p && svg('image', { href: iconOf(p.id), x: x - 27, y: y - 27, width: 54, height: 54 }),
          svg('circle', { cx: x, cy: y, r: on ? 32 : 27, class: 'pt-b-ring' }))
        if (onNode) {
          Object.assign(g.dataset, { color, i })
          g.setAttribute('tabindex', '0')
          g.setAttribute('role', 'button')
          g.onclick = () => onNode(color, i)
          g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNode(color, i) } }
        }
        return g
      }))))
}

const potIcon = p => h('img', { src: iconOf(p.id), alt: '', className: 'pt-icon', loading: 'lazy' })
/** 쓴 잠재력을 종류별로: 아이콘 · 이름 ×칸 수 · 옵션 */
function usedView(slots) {
  const n = new Map()
  for (const id of Object.values(slots).flat()) if (pot.has(id)) n.set(id, (n.get(id) || 0) + 1)
  return h('ul', { className: 'pt-used' }, [...n].map(([id, k]) => {
    const p = pot.get(id)
    return h('li', { className: `is-${p.color}` }, potIcon(p), h('div', {}, h('b', {}, p.name, h('span', {}, ` ×${k}`)), h('small', {}, statLine(p))))
  }))
}

const faces = ids => h('div', { className: 'rc-faces' }, ids.map(id => h('img', { src: faceOf(P(id)), alt: P(id).name, title: P(id).name })))

// ---------------------------------------------------------------- 목록

const filter = { sort: 'likes', pos: 0, char: '' }
let listSeq = 0

async function showList() {
  $('#list-view').hidden = false
  $('#new-build').onclick = async () => { if (await loggedIn()) openForm() }
  for (const b of document.querySelectorAll('[data-sort]')) {
    b.onclick = () => { filter.sort = b.dataset.sort; loadList() }
  }
  $('#filter-chars').append(charGrid({
    isOn: id => filter.char === id,
    pick: id => { filter.char = filter.char === id ? '' : id; loadList() },
    onPos: pos => { filter.pos = pos; filter.char = ''; loadList() },
  }))
  loadList()
}

async function loadList() {
  for (const b of document.querySelectorAll('[data-sort]')) b.setAttribute('aria-pressed', b.dataset.sort === filter.sort)
  const box = $('#build-list'), seq = ++listSeq
  const qs = new URLSearchParams({ sort: filter.sort, ...(filter.char ? { char: filter.char } : filter.pos && { pos: filter.pos }) })
  let builds
  try { ({ builds } = await api(`/builds?${qs}`)) }
  catch (e) { if (seq === listSeq) box.replaceChildren(h('p', { className: 'rc-note rc-bad' }, e.message)); return }
  if (seq !== listSeq) return
  const who = filter.char ? `${P(filter.char).name} ` : filter.pos ? `${POS[filter.pos]} ` : ''
  box.replaceChildren(...builds.length ? builds.map(b => h('a', { className: 'rc-tcard pt-card', href: `?b=${b.id}` },
    h('div', { className: 'rc-tcard-head' }, h('b', {}, b.title)),
    h('p', {}, h('b', {}, b.author), ` · ${ago(b.createdAt)}`),
    b.slots && boardView(b.slots),
    faces(b.chars),
    h('p', { className: 'pt-counts' }, `👍 ${b.likes} · 💬 ${b.comments}`)))
    : [h('p', { className: 'rc-note' }, `아직 ${who}빌드가 없어요. 첫 빌드를 올려 보세요!`)])
}

// ---------------------------------------------------------------- 글

let view = 'list', buildId, buildSeq = 0

async function showBuild() {
  const seq = ++buildSeq, err = $('#build-error'), box = $('#build-body')
  $('#build-view').hidden = false
  await authFirst
  let r
  try { r = await api(`/builds/${buildId}`, { withToken: auth === 'in' }) }
  catch (e) {
    if (seq !== buildSeq) return
    err.textContent = e.status === 404 ? '없는 글이에요 — 지워졌을 수 있어요' : e.message
    err.hidden = false
    box.replaceChildren()
    return
  }
  if (seq !== buildSeq) return
  err.hidden = true
  const { build: b, comments } = r
  let liked = r.liked
  const mine = auth === 'in' && me.id === b.authorId
  document.title = `${b.title} · 잠재력추천 · NBA덩크시티-TNAB`

  const likeBtn = h('button', { type: 'button', className: 'pt-like' })
  const paintLike = n => { likeBtn.textContent = `👍 추천 ${n}`; likeBtn.setAttribute('aria-pressed', liked) }
  paintLike(b.likes)
  likeBtn.onclick = async () => {
    if (!await loggedIn()) return
    likeBtn.disabled = true
    try { const v = await api(`/builds/${b.id}/like`, { method: 'POST', withToken: true }); liked = v.liked; paintLike(v.likes) }
    catch (e) { alert(e.message) }
    finally { likeBtn.disabled = false }
  }

  const del = async (path, ask) => {
    if (!confirm(ask)) return false
    try { await api(path, { method: 'DELETE', withToken: true }); return true }
    catch (e) { alert(e.message); return false }
  }

  const commentForm = h('form', { className: 'pt-cform', novalidate: true },
    h('textarea', { name: 'body', rows: 2, maxLength: 500, placeholder: auth === 'in' ? '댓글을 남겨 주세요' : '댓글은 디스코드 로그인 후 쓸 수 있어요' }),
    h('div', { className: 'rc-actions' }, h('button', { type: 'submit', className: 'primary' }, '댓글 달기')),
    h('p', { className: 'rc-form-err', role: 'alert', hidden: true }))
  commentForm.onsubmit = async e => {
    e.preventDefault()
    if (!await loggedIn()) return
    const ta = $('textarea', commentForm), msg = $('.rc-form-err', commentForm), btn = $('[type=submit]', commentForm)
    if (!ta.value.trim()) return ta.focus()
    btn.disabled = true
    try { await api(`/builds/${b.id}/comments`, { method: 'POST', withToken: true, body: { body: ta.value } }); showBuild() }
    catch (e) { msg.textContent = e.message; msg.hidden = false }
    finally { btn.disabled = false }
  }

  box.replaceChildren(
    h('div', { className: 'rc-team-head pt-head' },
      h('div', {},
        h('p', { className: 'rc-kicker' }, h('b', {}, b.author), ` · ${ago(b.createdAt)}${b.updatedAt > b.createdAt + 60000 ? ' (수정됨)' : ''}`),
        h('h1', {}, b.title)),
      h('div', { className: 'rc-share-bar' }, likeBtn,
        mine && h('button', { type: 'button', onclick: () => openForm(b) }, '수정'),
        mine && h('button', { type: 'button', className: 'danger', onclick: async () => { if (await del(`/builds/${b.id}`, '이 빌드를 지울까요? 추천 · 댓글도 같이 지워져요')) location.href = '/potentials/' } }, '삭제'))),
    h('section', { className: 'card' },
      h('h3', {}, '추천 캐릭터'),
      h('div', { className: 'pt-charnames' }, b.chars.map(id => h('span', {}, h('img', { src: faceOf(P(id)), alt: '' }), P(id).name))),
      b.body && h('p', { className: 'pt-body' }, b.body)),
    h('section', { className: 'card' }, h('h3', {}, '잠재력 ', h('small', { className: 'rc-muted' }, `전부 ${cat.statsLevel}레벨(MAX) 기준`)),
      h('div', { className: 'pt-build' }, boardView(b.slots), h('div', {}, totalsView(b.slots), usedView(b.slots)))),
    h('section', { className: 'card' },
      h('h3', {}, `댓글 ${comments.length}`),
      h('ul', { className: 'pt-comments' }, comments.map(c => h('li', {},
        h('div', {}, h('b', {}, c.author), h('small', { className: 'rc-muted' }, ` ${ago(c.createdAt)}`),
          auth === 'in' && me.id === c.authorId && h('button', { type: 'button', className: 'pt-cdel', onclick: async () => { if (await del(`/builds/${b.id}/comments/${c.id}`, '댓글을 지울까요?')) showBuild() } }, '삭제')),
        h('p', {}, c.body)))),
      commentForm))
}

// ---------------------------------------------------------------- 쓰기 · 고치기

let editing = null   // 고치는 글(없으면 새 글)

function openForm(b = null) {
  editing = b
  const form = $('#build-form'), chars = new Set(b?.chars || [])
  $('#form-title').textContent = b ? '빌드 수정' : '빌드 작성'
  form.elements.title.value = b?.title || ''
  form.elements.body.value = b?.body || ''
  $('.rc-form-err', form).hidden = true
  const grid = charGrid({
    isOn: id => chars.has(id),
    pick: id => { if (chars.has(id)) chars.delete(id); else if (chars.size < 5) chars.add(id) },
  })
  $('#form-chars').replaceChildren(grid)
  form.chars = chars
  // 판에서 칸을 누르고 → 오른쪽에서 옵션 필터(여러 개 = 하나라도 있으면)로 좁혀 잠재력을 누른다.
  // 보통 한 색을 한 잠재력으로 다 채우므로 잠재력마다 「10칸 모두」가 있다
  const slots = form.slots = Object.fromEntries(cat.colors.map(c => [c.id, [...(b?.slots[c.id] || Array(cat.slots).fill(null))]]))
  let sel = { color: cat.colors[0].id, i: 0 }
  const stats = new Set()
  const box = $('#form-slots')
  const nextEmpty = (color, from) => {
    for (let k = 1; k <= cat.slots; k++) { const i = (from + k) % cat.slots; if (!slots[color][i]) return i }
    return from
  }
  const put = (id, all) => {
    if (all) slots[sel.color].fill(id)
    else { slots[sel.color][sel.i] = id; if (id) sel = { ...sel, i: nextEmpty(sel.color, sel.i) } }
    render()
  }
  const colorName = id => cat.colors.find(c => c.id === id).name
  function render() {
    const hit = p => !stats.size || p.stats.some(([k]) => stats.has(k))
    const best = p => Math.max(0, ...p.stats.filter(([k]) => stats.has(k)).map(([, v]) => v))
    const list = cat.potentials.filter(p => p.color === sel.color && hit(p)).sort((a, b) => best(b) - best(a))
    const cur = pot.get(slots[sel.color][sel.i])
    box.replaceChildren(totalsView(slots), h('div', { className: 'pt-builder' },
      h('div', { className: 'pt-board-wrap' }, boardView(slots, { sel, onNode: (color, i) => { sel = { color, i }; render() } })),
      h('div', { className: `pt-picker is-${sel.color}` },
        h('div', { className: 'pt-tabs', role: 'group', 'aria-label': '색깔' }, cat.colors.map(c => h('button', {
          type: 'button', className: `is-${c.id}`, 'aria-pressed': c.id === sel.color,
          onclick: () => { sel = { color: c.id, i: slots[c.id][0] ? nextEmpty(c.id, 0) : 0 }; render() },
        }, `${c.name} ${slots[c.id].filter(Boolean).length}/${cat.slots}`))),
        h('p', { className: 'pt-cur' }, h('b', {}, `${colorName(sel.color)} ${sel.i + 1}번 칸`), cur ? ` · ${cur.name}` : ' · 비어 있음',
          cur && h('button', { type: 'button', onclick: () => put(null) }, '이 칸 비우기'),
          slots[sel.color].some(Boolean) && h('button', { type: 'button', onclick: () => put(null, true) }, `${colorName(sel.color)} 모두 비우기`)),
        h('div', { className: 'pt-stats', role: 'group', 'aria-label': '옵션 필터' }, cat.statOrder.map(k => h('button', {
          type: 'button', 'aria-pressed': stats.has(k), onclick: () => { stats.has(k) ? stats.delete(k) : stats.add(k); render() },
        }, k)), stats.size > 0 && h('button', { type: 'button', className: 'pt-stats-clear', onclick: () => { stats.clear(); render() } }, '필터 해제')),
        h('ul', { className: 'pt-pots' }, list.length ? list.map(p => h('li', { className: p.id === cur?.id ? 'is-cur' : '' },
          h('button', { type: 'button', className: 'pt-pot', onclick: () => put(p.id) },
            potIcon(p), h('span', {}, h('b', {}, p.name), h('small', {}, p.stats.map(([k, v]) => h('i', { className: stats.has(k) ? 'is-hit' : '' }, `${k} ${plus(v)}`))))),
          h('button', { type: 'button', className: 'pt-all', onclick: () => put(p.id, true) }, '10칸 모두')))
          : h('li', { className: 'rc-muted' }, `${colorName(sel.color)}에는 이 옵션이 붙은 잠재력이 없어요`)))))
  }
  render()
  $('#list-view').hidden = true
  $('#build-view').hidden = true
  $('#form-view').hidden = false
  scrollTo(0, 0)
}

function closeForm() {
  $('#form-view').hidden = true
  $(view === 'build' ? '#build-view' : '#list-view').hidden = false
}

function readForm(form) {
  return { title: form.elements.title.value, chars: [...form.chars], body: form.elements.body.value, slots: form.slots }
}

function bindForm() {
  const form = $('#build-form')
  $('#form-cancel').onclick = closeForm
  form.onsubmit = async e => {
    e.preventDefault()
    const btn = $('[type=submit]', form), err = $('.rc-form-err', form), v = readForm(form)
    const bad = !v.title.trim() ? '제목을 입력해 주세요' : !v.chars.length ? '추천 캐릭터를 1명 이상 골라 주세요'
      : !Object.values(v.slots).flat().some(Boolean) ? '잠재력을 한 칸 이상 넣어 주세요' : ''
    err.textContent = bad
    err.hidden = !bad
    if (bad || btn.disabled) return
    btn.disabled = true
    try {
      const { build } = await api(editing ? `/builds/${editing.id}` : '/builds', { method: editing ? 'PUT' : 'POST', withToken: true, body: v })
      location.href = `/potentials/?b=${build.id}`
    } catch (e) { err.textContent = e.message; err.hidden = false }
    finally { btn.disabled = false }
  }
}

// ---------------------------------------------------------------- 초기화

const boot = async () => {
  const [players, potentials] = await Promise.all([loadPlayers(), fetch('/data/potentials.json', { cache: 'no-cache' }).then(r => r.json())])
  data = players
  cat = potentials
  pot = new Map(cat.potentials.map(p => [p.id, p]))
  kr = data.players.filter(p => p.server === 'kr').sort((a, b) => a.pos - b.pos)
  mountTop('/potentials/')
  bindForm()
  setAuth('loading')
  initAuth(loadMe).then(ok => ok || setAuth('down'))
  const id = new URLSearchParams(location.search).get('b')
  if (/^\d+$/.test(id || '')) { view = 'build'; buildId = id; $('#build-view').hidden = false }
  else showList()
}

boot()
