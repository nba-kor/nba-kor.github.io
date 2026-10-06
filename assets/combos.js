// 조합표 — 3명 조합 게시판: 목록(추천순 · 최신순 · 포지션 · 캐릭터 필터) · 글(선수별 추천 잠재력 · 상대하기 편한/힘든 캐릭터 · 조합 · 추천 · 댓글) · 쓰기 · 고치기.
// 게시판 공용 부분은 board.js. 추천 잠재력은 잠재력추천 글 번호만 저장하고, 보여 줄 때 ?ids= 로 한 번에 읽는다(지워진 글은 빠진다)
import { mountTop, loadKakao, faceOf, kakaoList, shareFace, POS } from './app.js?v=3de4668d'
import { api } from './auth.js?v=5d44380b'
import { $, h, P, loadData, startAuth, loggedIn, charGrid, listView, card, itemView, showItem } from './board.js?v=a9bf1646'

let cat, pot   // data/potentials.json(추천 잠재력 아이콘)
const VS_MAX = 10   // 서버 COMBO_VS 와 같다 — 쪽마다 캐릭터 수 · 조합(3명 세트) 수
const SIDES = [['easy', '😀 상대하기 편한', '편함'], ['hard', '😣 상대하기 힘든', '힘듦']]
const OTHER = { easy: 'hard', hard: 'easy' }
const comboUrl = c => `${location.origin}/combos/?c=${c.id}`
const mini = ids => h('span', { className: 'cb-mini' }, ids.map(id => h('img', { src: faceOf(P(id)), alt: P(id).name, title: P(id).name })))
/** 고른 잠재력추천 글을 한 번에 — Map(번호 → 글) */
const buildsOf = async ids => ids.length ? new Map((await api(`/builds?ids=${ids}`)).builds.map(x => [x.id, x])) : new Map()
/** 상대 조합(3명 세트) 한 줄. del 이 있으면 삭제 버튼 */
const setRow = (ids, del) => h('div', { className: 'cb-ref' }, mini(ids), h('b', {}, ids.map(id => P(id).name).join(' · ')),
  del && h('button', { type: 'button', className: 'cb-del', 'aria-label': '이 조합 삭제', onclick: del }, '삭제'))

/** 잠재력 빌드 요약: 색마다 가장 많이 쓴 잠재력 아이콘 ×칸 수 */
const buildIcons = slots => cat.colors.map(({ id: color }) => {
  const n = new Map()
  for (const id of slots[color] || []) if (pot.has(id)) n.set(id, (n.get(id) || 0) + 1)
  const [id, k] = [...n].sort((a, b) => b[1] - a[1])[0] || []
  return id && h('span', { title: `${pot.get(id).name} ×${k}` }, h('img', { src: `/assets/potentials/${id}.png`, alt: '', className: 'pt-icon' }), h('small', {}, `×${k}`))
})

// ---------------------------------------------------------------- 목록

const vsLines = c => SIDES.map(([k, , short]) => {
  const s = c.matchups[k]
  return (s.chars.length || s.combos.length) > 0 && h('p', { className: 'cb-vs-line' },
    h('small', { className: `is-${k}` }, short), mini(s.chars), s.combos.length > 0 && h('small', {}, `조합 ${s.combos.length}`))
})

const showList = () => {
  $('#list-view').hidden = false
  $('#new').onclick = async () => { if (await loggedIn()) openForm() }
  listView({
    load: async qs => (await api(`/combos?${qs}`)).combos,
    card: c => card(`?c=${c.id}`, c, vsLines(c)),
    empty: who => `아직 ${who}조합이 없어요. 첫 조합을 올려 보세요!`,
  })
}

// ---------------------------------------------------------------- 카카오톡 공유

let builds = new Map()   // 보고 있는 글이 고른 잠재력추천 글 — 카톡 카드에 빌드 제목을 넣는다

/** 리스트 카드: 선수 3줄(포지션 · 추천 빌드) → 상성(있을 때) → 조합 설명(있을 때). 3줄뿐이면 kakaoList 가 기본 카드로 보낸다 */
function kakaoPayload(c) {
  const url = comboUrl(c), names = ids => ids.map(id => P(id).name).join(' · ')
  const { easy, hard } = c.matchups, body = c.body.replace(/\s+/g, ' ').trim()
  const rows = [
    ...c.chars.map((id, i) => ({
      title: P(id).name, desc: [POS[P(id).pos], builds.get(c.builds[i]) && `💡 ${builds.get(c.builds[i]).title}`].filter(Boolean).join(' · '), img: shareFace(id),
    })),
    SIDES.some(([k]) => c.matchups[k].chars.length || c.matchups[k].combos.length) && {
      title: '상대 상성',
      desc: SIDES.map(([k, , short]) => {
        const s = c.matchups[k], what = [names(s.chars), s.combos.length && `조합 ${s.combos.length}`].filter(Boolean).join(' · ')
        return what && `${short} ${what}`
      }).filter(Boolean).join(' / '),
      img: shareFace([easy, hard].flatMap(s => [...s.chars, ...s.combos.flat()])[0]),
    },
    body && { title: '조합 설명', desc: body, img: `${location.origin}/assets/og.jpg` },
  ].filter(Boolean)
  return kakaoList({
    header: `🧩 ${c.title} · 조합표`, url, rows,
    buttons: [{ title: '조합 보기', url }, { title: '조합 목록', url: `${location.origin}/combos/` }],
  })
}

// ---------------------------------------------------------------- 글

let view = 'list', comboId

/** bs = 읽어 온 잠재력추천 글(아직이면 undefined) */
function playerView(id, bid, bs) {
  const p = P(id), b = bs?.get(bid)
  return h('div', { className: 'cb-player' },
    h('img', { src: faceOf(p), alt: '' }),
    h('div', {}, h('b', {}, p.name), h('small', {}, ` ${POS[p.pos]}`),
      !bid ? h('p', { className: 'rc-muted' }, '추천 잠재력 없음')
      : !bs ? h('p', { className: 'rc-muted' }, '추천 잠재력 불러오는 중…')
      : !b ? h('p', { className: 'rc-muted' }, '추천 잠재력 글이 지워졌어요')
      : h('a', { className: 'cb-build', href: `/potentials/?b=${b.id}` },
        h('span', {}, `💡 ${b.title}`, h('small', {}, ` 👍${b.likes}`)), h('span', { className: 'pt-sum-icons' }, buildIcons(b.slots)))))
}

const sideView = (k, label, s) => h('div', { className: `cb-side is-${k}` },
  h('h4', {}, `${label} 캐릭터 · 조합`),
  s.chars.length > 0 && h('div', { className: 'pt-charnames' }, s.chars.map(id => h('span', {}, h('img', { src: faceOf(P(id)), alt: '' }), P(id).name))),
  s.combos.map(ids => setRow(ids)),
  !s.chars.length && !s.combos.length && h('p', { className: 'rc-muted' }, '없음'))

const showCombo = () => showItem(`/combos/${comboId}`, ({ combo: c, liked, comments }) => {
  document.title = `${c.title} · 조합표 · NBA덩크시티-TNAB`
  const players = h('div', { className: 'cb-players' })
  const paint = bs => players.replaceChildren(...c.chars.map((id, i) => playerView(id, c.builds[i], bs)))
  paint()
  builds = new Map()
  buildsOf(c.builds.filter(Boolean)).then(bs => { builds = bs; paint(bs) }, () => paint(new Map()))
  return itemView({
    path: `/combos/${c.id}`, item: c, liked, comments, listUrl: '/combos/', reload: showCombo, onEdit: () => openForm(c),
    share: { payload: () => kakaoPayload(c), title: `${c.title} · 조합표`, url: comboUrl(c) },
    body: [
      h('section', { className: 'card' }, h('h3', {}, '조합'), players, c.body && h('p', { className: 'pt-body' }, c.body)),
      h('section', { className: 'card' }, h('h3', {}, '상대 상성'), h('div', { className: 'cb-vs' }, SIDES.map(([k, label]) => sideView(k, label, c.matchups[k])))),
    ],
  })
})

// ---------------------------------------------------------------- 쓰기 · 고치기

let editing = null, draft
const buildLists = new Map()   // 캐릭터 → 그 캐릭터를 추천한 잠재력추천 글(추천순) — 폼을 다시 열어도 한 번만 읽는다

function openForm(c = null) {
  editing = c
  const f = $('#combo-form'), el = f.elements
  $('#form-title').textContent = c ? '조합 수정' : '조합 등록'
  el.title.value = c?.title || ''
  el.body.value = c?.body || ''
  $('.rc-form-err', f).hidden = true
  draft = {
    chars: [...(c?.chars || [])],   // 고른 순서 = 추천 잠재력과 짝
    builds: new Map(c?.chars.map((id, i) => [id, c.builds[i]])),
    vs: Object.fromEntries(SIDES.map(([k]) => [k, { chars: new Set(c?.matchups[k].chars), combos: (c?.matchups[k].combos || []).map(x => [...x]) }])),
  }
  const { chars, vs } = draft

  // 선수 3명 + 선수마다 잠재력추천 글 고르기
  const buildPicker = id => {
    const sel = h('select', { 'aria-label': `${P(id).name} 추천 잠재력`, onchange: () => { draft.builds.set(id, +sel.value || null); link() } },
      h('option', { value: '' }, '잠재력추천 불러오는 중…'))
    const open = h('a', { target: '_blank', rel: 'noopener' }, '보기 ↗')
    const link = () => { open.hidden = !draft.builds.get(id); open.href = `/potentials/?b=${draft.builds.get(id)}` }
    if (!buildLists.has(id)) buildLists.set(id, api(`/builds?char=${id}&sort=likes`).then(r => r.builds, () => { buildLists.delete(id); return null }))
    buildLists.get(id).then(list => {
      const cur = draft.builds.get(id)
      sel.replaceChildren(...[h('option', { value: '' }, !list ? '잠재력추천을 불러오지 못했어요' : list.length ? '추천 잠재력 선택 안 함' : '이 캐릭터의 잠재력추천 글이 아직 없어요'),
        ...(list || []).map(b => h('option', { value: b.id }, `${b.title} · 👍${b.likes} · ${b.author}`)),
        cur && !list?.some(b => b.id === cur) && h('option', { value: cur }, `고른 빌드 #${cur}`)].filter(Boolean))   // 추천순 100개 밖이거나 지워진 글
      sel.value = cur || ''
    })
    link()
    return h('div', { className: 'cb-bpick' }, h('img', { src: faceOf(P(id)), alt: '' }), h('b', {}, P(id).name), sel, open)
  }
  const paintBuilds = () => $('#form-builds').replaceChildren(...chars.map(buildPicker))
  $('#form-chars').replaceChildren(charGrid({
    isOn: id => chars.includes(id),
    pick: id => { const i = chars.indexOf(id); if (i >= 0) chars.splice(i, 1); else if (chars.length < 3) chars.push(id); paintBuilds() },
  }))
  paintBuilds()

  // 상대하기 편한 · 힘든 — 한 캐릭터 · 조합은 한쪽에만. 「조합 만들기」 에서는 누른 세 명이 조합 하나가 된다
  const grids = {}, mode = { easy: 'chars', hard: 'chars' }, tray = { easy: [], hard: [] }
  const key = ids => [...ids].sort().join()
  const paintSide = k => {
    const s = vs[k], t = tray[k]
    grids[k].sync()
    for (const b of $(`#form-${k}-mode`).children) b.setAttribute('aria-pressed', b.value === mode[k])
    $(`#form-${k}-combos`).replaceChildren(...[
      mode[k] === 'set' && h('p', { className: 'rc-hint' }, s.combos.length >= VS_MAX ? `조합은 ${VS_MAX}개까지예요 — 지우고 다시 만들어 주세요`
        : t.length ? `만드는 중: ${t.map(id => P(id).name).join(' · ')} — ${3 - t.length}명 더 고르세요` : `세 명을 누르면 조합이 추가돼요 (${s.combos.length}/${VS_MAX})`),
      ...s.combos.map((ids, i) => setRow(ids, () => { s.combos.splice(i, 1); paintSide(k) })),
    ].filter(Boolean))
  }
  const pick = (k, id) => {
    const s = vs[k], o = vs[OTHER[k]], t = tray[k]
    if (mode[k] === 'chars') {
      if (s.chars.has(id)) s.chars.delete(id)
      else if (s.chars.size < VS_MAX) { s.chars.add(id); o.chars.delete(id) }
    } else {
      const i = t.indexOf(id)
      if (i >= 0) t.splice(i, 1)
      else if (s.combos.length < VS_MAX) t.push(id)
      if (t.length === 3) {
        if (!s.combos.some(x => key(x) === key(t))) { s.combos.push([...t]); o.combos = o.combos.filter(x => key(x) !== key(t)) }
        t.length = 0
      }
    }
    SIDES.forEach(([x]) => paintSide(x))
  }
  for (const [k] of SIDES) {
    $(`#form-${k}-chars`).replaceChildren(grids[k] = charGrid({ isOn: id => mode[k] === 'chars' ? vs[k].chars.has(id) : tray[k].includes(id), pick: id => pick(k, id) }))
    for (const b of $(`#form-${k}-mode`).children) b.onclick = () => { mode[k] = b.value; tray[k] = []; paintSide(k) }
  }
  SIDES.forEach(([k]) => paintSide(k))

  $('#list-view').hidden = true
  $('#item-view').hidden = true
  $('#form-view').hidden = false
  scrollTo(0, 0)
}

function closeForm() {
  $('#form-view').hidden = true
  $(view === 'combo' ? '#item-view' : '#list-view').hidden = false
}

function bindForm() {
  const f = $('#combo-form'), el = f.elements
  $('#form-cancel').onclick = closeForm
  f.onsubmit = async e => {
    e.preventDefault()
    const btn = $('[type=submit]', f), err = $('.rc-form-err', f)
    const v = {
      title: el.title.value, body: el.body.value, chars: draft.chars, builds: draft.chars.map(id => draft.builds.get(id) ?? null),
      matchups: Object.fromEntries(SIDES.map(([k]) => [k, { chars: [...draft.vs[k].chars], combos: draft.vs[k].combos }])),
    }
    const bad = !v.title.trim() ? '조합 이름을 입력해 주세요' : v.chars.length !== 3 ? '조합 선수를 3명 골라 주세요' : ''
    err.textContent = bad
    err.hidden = !bad
    if (bad || btn.disabled) return
    btn.disabled = true
    try {
      const { combo } = await api(editing ? `/combos/${editing.id}` : '/combos', { method: editing ? 'PUT' : 'POST', withToken: true, body: v })
      location.href = `/combos/?c=${combo.id}`
    } catch (e) { err.textContent = e.message; err.hidden = false }
    finally { btn.disabled = false }
  }
}

// ---------------------------------------------------------------- 초기화

const json = f => fetch(f, { cache: 'no-cache' }).then(r => r.json())
const boot = async () => {
  ;[, cat] = await Promise.all([loadData(), json('/data/potentials.json')])
  pot = new Map(cat.potentials.map(p => [p.id, p]))
  mountTop('/combos/')
  loadKakao()
  bindForm()
  const id = new URLSearchParams(location.search).get('c')
  if (/^\d+$/.test(id || '')) { view = 'combo'; comboId = id }
  startAuth('조합을 올리거나 추천 · 댓글을 달려면 디스코드 로그인이 필요해요.', () => view === 'combo' && showCombo())
  if (view === 'list') showList()
}

boot()
