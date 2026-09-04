// 티어표 — 드래그로 선수를 티어에 올리고 링크로 공유
import { loadPlayers, mountFilters, chipEl, startDrag, mountTop, decodeState, share } from './app.js?v=6bf8da50'

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
let data = { players: [], byId: new Map() }
let pool = []

const save = () => localStorage.setItem(STORE, JSON.stringify(state))
const placed = () => new Set(state.rows.flatMap(r => r.ids))
const removeId = id => state.rows.forEach(r => { r.ids = r.ids.filter(x => x !== id) })

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

const boot = async () => {
  data = await loadPlayers()
  mountTop('/tiers/', data.updatedAt)

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
  render()
}

boot()
