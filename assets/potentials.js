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

/** 게임 화면처럼 색마다 10칸. 칸마다 잠재력 이름 + 옵션(최대 레벨 기준) */
function slotsView(slots) {
  return h('div', { className: 'pt-slots' }, cat.colors.map(c => h('section', { className: `pt-color is-${c.id}` },
    h('h3', {}, c.name),
    h('ol', {}, slots[c.id].map(id => {
      if (!id) return h('li', { className: 'is-empty' }, '빈 칸')
      const p = pot.get(id)
      return h('li', {}, h('b', {}, p?.name || id), p && h('small', {}, statLine(p)))
    })))))
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
    h('section', { className: 'card' }, h('h3', {}, '잠재력 ', h('small', { className: 'rc-muted' }, `전부 ${cat.statsLevel}레벨(MAX) 기준`)), totalsView(b.slots), slotsView(b.slots)),
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
  // 칸마다 잠재력 고르기. 보통 한 색을 한 잠재력으로 다 채우므로 색마다 「일괄 선택」이 10칸을 한 번에 바꾼다
  const total = h('div')
  const retotal = () => total.replaceChildren(totalsView(readForm(form).slots))
  const options = (color, cur) => [h('option', { value: '' }, '— 빈 칸 —'),
    ...cat.potentials.filter(p => p.color === color).map(p => h('option', { value: p.id, selected: cur === p.id }, `${p.name} — ${statLine(p)}`))]
  $('#form-slots').replaceChildren(total, ...cat.colors.map(c => {
    const sels = Array.from({ length: cat.slots }, (_, i) =>
      h('select', { 'aria-label': `${c.name} ${i + 1}번 잠재력`, onchange: retotal }, options(c.id, b?.slots[c.id][i])))
    const all = h('select', { className: 'pt-all', 'aria-label': `${c.name} 10칸 일괄 선택`, onchange: () => {
      for (const s of sels) s.value = all.value
      all.selectedIndex = 0
      retotal()
    } }, h('option', { value: '', disabled: true, selected: true }, '일괄 선택 ▾'), options(c.id).slice(1), h('option', { value: '' }, '모두 비우기'))
    return h('section', { className: `pt-color is-${c.id}` },
      h('h3', {}, c.name, all),
      h('ol', {}, sels.map(s => h('li', { 'data-color': c.id }, s))))
  }))
  retotal()
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
  const slots = Object.fromEntries(cat.colors.map(c => [c.id, []]))
  for (const li of form.querySelectorAll('#form-slots li')) {
    slots[li.dataset.color].push($('select', li).value || null)
  }
  return { title: form.elements.title.value, chars: [...form.chars], body: form.elements.body.value, slots }
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
