// 티어표 — 드래그로 선수를 티어에 올리고 링크로 공유. 올리면 게시판(?list 목록 · ?t=<id> 글 · ?edit=<id> 고치기)에 뜬다. 게시판 공용 부분은 board.js
import { mountFilters, chipEl, startDrag, mountTop, decodeState, share, faceOf, loadKakao, kakaoList, shareFace } from './app.js?v=2ce73e96'
import { api } from './auth.js?v=5d44380b'
import { h, P, data, loadData, startAuth, loggedIn, listView, card, itemView, showItem } from './board.js?v=469f0b18'

const STORE = 'dc.tiers'
const DEFAULT = () => ({
  title: '내 티어표',
  rows: [
    { label: 'S', color: '#ff7f7f', ids: [] },
    { label: 'A', color: '#ffbf7f', ids: [] },
    { label: 'B', color: '#ffdf7f', ids: [] },
    { label: 'C', color: '#bfff7f', ids: [] },
    { label: 'D', color: '#7fdfff', ids: [] },
  ],
})
const PALETTE = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fff7f', '#7fdfff', '#bf9fff']

const $ = s => document.querySelector(s)
let state = DEFAULT()
let pool = []
let editing = null   // ?edit=<id> 로 고치는 내 글 번호

const save = () => localStorage.setItem(STORE, JSON.stringify(state))
const placed = () => new Set(state.rows.flatMap(r => r.ids))
const removeId = id => state.rows.forEach(r => { r.ids = r.ids.filter(x => x !== id) })
const toRows = tiers => tiers.map(t => ({ label: t.label, color: t.color, ids: [...t.ids] }))

/** 드롭 지점 기준 삽입 위치. 같은 줄에서 칩 중앙보다 왼쪽이면 그 앞에 넣는다.
 *  같은 티어 안에서 순서를 바꿀 때 자기 자신은 세지 않아야 한 칸씩 밀리지 않는다. */
function indexAt(container, x, y, dragId) {
  const kids = [...container.querySelectorAll('.chip')].filter(c => c.dataset.id !== dragId)
  for (let i = 0; i < kids.length; i++) {
    const r = kids[i].getBoundingClientRect()
    if (y < r.bottom && x < r.left + r.width / 2) return i
  }
  return kids.length
}

function attachDrag(el, id) {
  el.addEventListener('pointerdown', ev => startDrag(ev, el, {
    onDrop: (x, y, under) => {
      const row = under?.closest?.('.tier-drop')
      const toPool = under?.closest?.('#pool')
      if (!row && !toPool) return
      const idx = row ? indexAt(row, x, y, id) : -1
      removeId(id)
      if (row) state.rows[+row.dataset.row].ids.splice(idx, 0, id)
      render()
    },
  }))
}

function render() {
  const board = $('#board')
  board.textContent = ''
  state.rows.forEach((row, i) => {
    const el = document.createElement('div')
    el.className = 'tier-row'
    el.innerHTML = `
      <input class="tier-label" value="" aria-label="${i + 1}번째 티어 이름">
      <div class="tier-drop" data-row="${i}"></div>
      <div class="tier-ctl">
        <button data-up title="위로">▲</button>
        <button data-down title="아래로">▼</button>
        <button data-del title="이 티어 삭제">✕</button>
      </div>`
    const label = el.querySelector('.tier-label')
    label.value = row.label
    label.style.background = row.color
    label.oninput = () => { row.label = label.value; save() }

    const drop = el.querySelector('.tier-drop')
    for (const id of row.ids) {
      const p = data.byId.get(id)
      if (!p) continue
      const c = chipEl(p)
      attachDrag(c, id)
      drop.appendChild(c)
    }
    el.querySelector('[data-up]').onclick = () => { if (i) { [state.rows[i - 1], state.rows[i]] = [state.rows[i], state.rows[i - 1]]; render() } }
    el.querySelector('[data-down]').onclick = () => { if (i < state.rows.length - 1) { [state.rows[i + 1], state.rows[i]] = [state.rows[i], state.rows[i + 1]]; render() } }
    el.querySelector('[data-del]').onclick = () => { state.rows.splice(i, 1); render() }
    board.appendChild(el)
  })

  const on = placed()
  const chips = $('#pool-chips')
  chips.textContent = ''
  const rest = pool.filter(p => !on.has(p.id))
  if (!rest.length) chips.innerHTML = '<p class="empty">목록이 비었습니다. 필터를 바꾸거나 티어에서 선수를 내려보세요.</p>'
  for (const p of rest) {
    const c = chipEl(p)
    attachDrag(c, p.id)
    chips.appendChild(c)
  }
  $('#title').value = state.title
  save()
}

/** 읽기 전용 티어표 — 글 화면 */
const staticBoard = tiers => h('div', { className: 'tier-board' }, tiers.map(t => h('div', { className: 'tier-row' },
  h('div', { className: 'tier-label', style: `background:${t.color}` }, t.label),
  h('div', { className: 'tier-drop' }, t.ids.filter(id => data.byId.has(id)).map(id => chipEl(P(id)))))))

/** 목록 카드의 작은 티어표 — 줄마다 이름 + 얼굴 8개까지 */
const miniBoard = tiers => h('div', { className: 'tl-mini' }, tiers.filter(t => t.ids.length).slice(0, 5).map(t => h('div', {},
  h('b', { style: `background:${t.color}` }, t.label),
  t.ids.slice(0, 8).map(id => h('img', { src: faceOf(P(id)), alt: '', title: P(id).name, loading: 'lazy' })),
  t.ids.length > 8 && h('small', {}, `+${t.ids.length - 8}`))))

// ---------------------------------------------------------------- 편집기

async function showEditor() {
  $('#edit-view').hidden = false
  mountFilters(document.querySelector('#pool .filters'), data.players, list => { pool = list; render() })

  $('#title').oninput = () => { state.title = $('#title').value; save() }
  $('#add-row').onclick = () => {
    state.rows.push({ label: `T${state.rows.length + 1}`, color: PALETTE[state.rows.length % PALETTE.length], ids: [] })
    render()
  }
  $('#clear').onclick = () => { state.rows.forEach(r => r.ids = []); render() }
  $('#reset').onclick = () => {
    if (!confirm('티어표를 처음 상태로 되돌립니다. 계속할까요?')) return
    state = DEFAULT(); location.hash = ''; render()
  }
  $('#share').onclick = () => share(state)

  const fromHash = location.hash.length > 1 && decodeState(location.hash.slice(1))
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null')
  if (fromHash?.rows) state = fromHash
  else if (saved?.rows) state = saved

  // ?edit=<id> — 내 글을 편집기로 불러온다. 올리기가 새 글 대신 그 글을 고친다
  const editId = new URLSearchParams(location.search).get('edit')
  if (/^\d+$/.test(editId || '')) {
    try {
      const { tier: t } = await api(`/tiers/${editId}`)
      state = { title: t.title, rows: toRows(t.tiers) }
      editing = t
      $('#publish').textContent = '수정 저장'
    } catch (e) { alert(e.message) }
  }
  render()
  bindPublish()
}

function bindPublish() {
  const f = $('#pub-form'), el = f.elements, err = $('.rc-form-err', f)
  $('#publish').onclick = async () => {
    if (!await loggedIn()) return
    el.title.value = state.title
    el.body.value = editing?.body || ''
    err.hidden = true
    f.hidden = false
    el.title.focus()
  }
  $('#pub-cancel').onclick = () => { f.hidden = true }
  f.onsubmit = async e => {
    e.preventDefault()
    const btn = $('[type=submit]', f)
    if (btn.disabled) return
    btn.disabled = true
    const body = { title: el.title.value, body: el.body.value, tiers: state.rows }
    try {
      const { tier } = await api(editing ? `/tiers/${editing.id}` : '/tiers', { method: editing ? 'PUT' : 'POST', withToken: true, body })
      location.href = `/tiers/?t=${tier.id}`
    } catch (e) { err.textContent = e.message; err.hidden = false }
    finally { btn.disabled = false }
  }
}

// ---------------------------------------------------------------- 목록

function showList() {
  $('#list-view').hidden = false
  listView({
    sort: 'new',
    load: async qs => (await api(`/tiers?${qs}`)).tiers,
    card: t => card(`?t=${t.id}`, { ...t, chars: [] }, miniBoard(t.tiers)),
    empty: () => '아직 올라온 티어표가 없어요. 첫 티어표를 올려 보세요!',
  })
}

// ---------------------------------------------------------------- 카카오톡 공유

const tierUrl = t => `${location.origin}/tiers/?t=${t.id}`
/** 리스트 카드: 선수가 있는 티어 줄(얼굴 = 그 줄 첫 한국 서버 선수) + 티어 4줄까지 + 마지막 줄 작성자 · 설명 */
function kakaoPayload(t) {
  const url = tierUrl(t), og = `${location.origin}/assets/og.jpg`
  const rows = t.tiers.filter(x => x.ids.length).slice(0, 4).map(x => {
    const kr = x.ids.find(id => P(id).server === 'kr')
    return { title: `${x.label} 티어`, desc: x.ids.map(id => P(id).short || P(id).name).join(' · '), img: kr ? shareFace(kr) : og }
  })
  rows.push({ title: `${t.author} 님의 티어표`, desc: t.body?.replace(/\s+/g, ' ').trim() || `👍 ${t.likes} · 💬 ${t.comments}`, img: og })
  return kakaoList({
    header: `🏆 ${t.title} · 티어표`, url, rows,
    buttons: [{ title: '티어표', url }, { title: '목록', url: `${location.origin}/tiers/?list` }],
  })
}

// ---------------------------------------------------------------- 글

let tierId
const showTier = () => showItem(`/tiers/${tierId}`, ({ tier: t, liked, comments }) => {
  document.title = `${t.title} · 티어표 · NBA덩크시티-TNAB`
  const take = () => {
    if (placed().size && !confirm('지금 만들던 티어표를 이 티어표로 바꿀까요?')) return
    state = { title: t.title, rows: toRows(t.tiers) }
    save()
    location.href = '/tiers/'
  }
  return itemView({
    path: `/tiers/${t.id}`, item: t, liked, comments, listUrl: '/tiers/?list', reload: showTier,
    onEdit: () => { location.href = `/tiers/?edit=${t.id}` },
    share: { payload: () => kakaoPayload(t), title: `${t.title} · 티어표`, url: tierUrl(t) },
    body: [
      h('section', { className: 'card' },
        staticBoard(t.tiers),
        t.body && h('p', { className: 'pt-body' }, t.body),
        h('div', { className: 'rc-actions' }, h('button', { type: 'button', onclick: take }, '내 티어표로 가져와 고치기'))),
    ],
  })
})

// ---------------------------------------------------------------- 초기화

const boot = async () => {
  await loadData()
  mountTop('/tiers/', data.updatedAt)
  loadKakao()
  const q = new URLSearchParams(location.search), id = q.get('t')
  const view = /^\d+$/.test(id || '') ? 'tier' : q.has('list') ? 'list' : 'edit'
  if (view === 'tier') tierId = id
  startAuth('티어표를 올리거나 추천 · 댓글을 달려면 디스코드 로그인이 필요해요.', () => view === 'tier' && showTier())
  if (view === 'list') showList()
  if (view === 'edit') showEditor()
}

boot()
