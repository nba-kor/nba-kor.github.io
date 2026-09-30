// 잠재력추천 — 빌드 목록(추천순 · 최신순 · 포지션 · 캐릭터 필터) · 글(30칸 판 · 추천 · 댓글) · 쓰기 · 고치기. 게시판 공용 부분은 board.js
import { mountTop, loadKakao, faceOf, kakaoList, POS_KO } from './app.js?v=bc0f3e71'
import { api } from './auth.js?v=5d44380b'
import { $, h, P, loadData, startAuth, loggedIn, charGrid, listView, card, itemView, showItem } from './board.js?v=55ac9956'

let cat, pot
const plus = v => `+${+v.toFixed(2)}`   // 0.15 × 10 같은 합에 붙는 부동소수점 꼬리를 뗀다
const statLine = p => p.stats.map(([k, v]) => `${k} ${plus(v)}`).join(' · ')
// 칸 순서 = 빨강 1→10, 초록 1→10, 파랑 1→10. DB(jsonb)는 키 순서를 바꾸므로 늘 cat.colors 순서로 돈다
const ordered = slots => cat.colors.flatMap(c => slots[c.id] || [])
/** 30칸 능력치 합계, 큰 것부터 — [[이름, 값]]. 같으면 판에서 먼저 나온 능력치가 앞(정렬은 안정적이고 Map 은 넣은 순서) */
function totals(slots) {
  const sum = new Map()
  for (const id of ordered(slots)) for (const [k, v] of pot.get(id)?.stats || []) sum.set(k, (sum.get(k) || 0) + v)
  return [...sum].sort((a, b) => Math.round(b[1] * 100) - Math.round(a[1] * 100))   // 0.1+0.2 같은 꼬리로 같은 값이 갈리지 않게
}
const totalsView = slots => {
  const t = totals(slots)
  return h('div', { className: 'pt-total' }, h('b', {}, '능력치 합계'),
    t.length ? t.map(([k, v]) => h('span', {}, k, h('em', {}, plus(v)))) : h('span', { className: 'rc-muted' }, '잠재력을 넣으면 여기에 합계가 나와요'))
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

/** 목록 카드 요약: 색마다 가장 많이 쓴 잠재력 아이콘 하나씩 + 능력치 합계 상위 4 뱃지(나머지는 +N).
 *  같은 색에서 칸 수가 같으면 앞 칸에 먼저 넣은 것, 색끼리 칸 수가 같으면 빨강 → 초록 → 파랑 */
const TOP_STATS = 4
function summaryView(slots) {
  const icons = cat.colors.map(c => {
    const n = new Map()
    for (const id of slots[c.id] || []) if (pot.has(id)) n.set(id, (n.get(id) || 0) + 1)
    const [id, k] = [...n].sort((a, b) => b[1] - a[1])[0] || []
    return id && { p: pot.get(id), k }
  }).filter(Boolean).sort((a, b) => b.k - a.k)
  const t = totals(slots), rest = t.slice(TOP_STATS)
  return h('div', { className: 'pt-sum' },
    h('div', { className: 'pt-sum-icons' }, icons.map(({ p, k }) => h('span', { title: `${p.name} ×${k} — ${statLine(p)}` }, potIcon(p), h('small', {}, `×${k}`)))),
    h('div', { className: 'pt-sum-stats' }, t.slice(0, TOP_STATS).map(([k, v]) => h('span', {}, k, h('em', {}, plus(v)))),
      rest.length > 0 && h('span', { className: 'pt-more', title: rest.map(([k, v]) => `${k} ${plus(v)}`).join(' · ') }, `+${rest.length}`)))
}

const potIcon = p => h('img', { src: iconOf(p.id), alt: '', className: 'pt-icon', loading: 'lazy' })
/** 쓴 잠재력을 종류별로: 아이콘 · 이름 ×칸 수 · 옵션 */
function usedView(slots) {
  const n = new Map()
  for (const id of ordered(slots)) if (pot.has(id)) n.set(id, (n.get(id) || 0) + 1)
  return h('ul', { className: 'pt-used' }, [...n].map(([id, k]) => {
    const p = pot.get(id)
    return h('li', { className: `is-${p.color}` }, potIcon(p), h('div', {}, h('b', {}, p.name, h('span', {}, ` ×${k}`)), h('small', {}, statLine(p))))
  }))
}

// ---------------------------------------------------------------- 목록

const showList = () => {
  $('#list-view').hidden = false
  $('#new').onclick = async () => { if (await loggedIn()) openForm() }
  listView({
    load: async qs => (await api(`/builds?${qs}`)).builds,
    card: b => card(`?b=${b.id}`, b, b.slots && summaryView(b.slots)),
    empty: who => `아직 ${who}빌드가 없어요. 첫 빌드를 올려 보세요!`,
  })
}

// ---------------------------------------------------------------- 카카오톡 공유

const buildUrl = b => `${location.origin}/potentials/?b=${b.id}`
/** 리스트 카드 5줄: 추천 캐릭터 + 능력치 합계 상위 3 → 빨강 · 초록 · 파랑 대표 잠재력 → 남는 줄은 그다음 많이 쓴 잠재력 · 다른 추천 캐릭터.
 *  줄이 모자라면 kakaoList 가 4줄 · 기본 3줄 카드로 내린다 */
function kakaoPayload(b) {
  const url = buildUrl(b), img = id => `${location.origin}/assets/potentials/share/${id}.jpg`
  const count = new Map()
  for (const id of ordered(b.slots)) if (pot.has(id)) count.set(id, (count.get(id) || 0) + 1)
  const row = id => { const p = pot.get(id); return { title: `${p.name} ×${count.get(id)}`, desc: statLine(p), img: img(id) } }
  // 색마다 가장 많이 쓴 것(같으면 앞 칸 — Map 은 넣은 순서, 정렬은 안정적) → 나머지는 많이 쓴 순
  const byCount = [...count].sort((x, y) => y[1] - x[1]).map(([id]) => id)
  const tops = cat.colors.map(c => byCount.find(id => pot.get(id).color === c.id)).filter(Boolean)
  const top = totals(b.slots).slice(0, 3).map(([k, v]) => `${k} ${plus(v)}`).join(' · ')
  const rows = [
    { title: `추천: ${b.chars.map(id => P(id).name).join(' · ')}`, desc: top, img: `${location.origin}/assets/share/${b.chars[0]}.jpg` },
    ...tops.map(row),
    ...byCount.filter(id => !tops.includes(id)).map(row),
    ...b.chars.slice(1).map(id => ({ title: `추천 캐릭터 · ${P(id).name}`, desc: POS_KO[P(id).pos] || '', img: `${location.origin}/assets/share/${id}.jpg` })),
  ]
  return kakaoList({
    // 머리는 한 줄이고 사용자 정의 템플릿에서는 이모지가 깨진다 — 제목만. 버튼은 둘이 나란히라 5자 이내
    header: b.title, url, rows,
    buttons: [{ title: '빌드 보기', url }, { title: '빌드 목록', url: `${location.origin}/potentials/` }],
  })
}

// ---------------------------------------------------------------- 글

let view = 'list', buildId

const showBuild = () => showItem(`/builds/${buildId}`, ({ build: b, liked, comments }) => {
  document.title = `${b.title} · 잠재력추천 · NBA덩크시티-TNAB`
  return itemView({
    path: `/builds/${b.id}`, item: b, liked, comments, listUrl: '/potentials/', reload: showBuild, onEdit: () => openForm(b),
    share: { payload: () => kakaoPayload(b), title: `${b.title} · 잠재력추천`, url: buildUrl(b) },
    body: [
      h('section', { className: 'card' },
        h('h3', {}, '추천 캐릭터'),
        h('div', { className: 'pt-charnames' }, b.chars.map(id => h('span', {}, h('img', { src: faceOf(P(id)), alt: '' }), P(id).name))),
        b.body && h('p', { className: 'pt-body' }, b.body)),
      h('section', { className: 'card' }, h('h3', {}, '잠재력 ', h('small', { className: 'rc-muted' }, `전부 ${cat.statsLevel}레벨(MAX) 기준`)),
        h('div', { className: 'pt-build' }, boardView(b.slots), h('div', {}, totalsView(b.slots), usedView(b.slots)))),
    ],
  })
})

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
  $('#item-view').hidden = true
  $('#form-view').hidden = false
  scrollTo(0, 0)
}

function closeForm() {
  $('#form-view').hidden = true
  $(view === 'build' ? '#item-view' : '#list-view').hidden = false
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
  const [, potentials] = await Promise.all([loadData(), fetch('/data/potentials.json', { cache: 'no-cache' }).then(r => r.json())])
  cat = potentials
  pot = new Map(cat.potentials.map(p => [p.id, p]))
  mountTop('/potentials/')
  loadKakao()
  bindForm()
  const id = new URLSearchParams(location.search).get('b')
  if (/^\d+$/.test(id || '')) { view = 'build'; buildId = id }
  startAuth('빌드를 쓰거나 추천 · 댓글을 달려면 디스코드 로그인이 필요해요.', () => view === 'build' && showBuild())
  if (view === 'list') showList()
}

boot()
