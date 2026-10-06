// 조합표 — 3명 조합 게시판: 목록(추천순 · 최신순 · 포지션 · 캐릭터 필터) · 글(선수별 추천 잠재력 · 추천 티어 · 상대하기 편한/힘든 캐릭터 · 조합 · 추천 · 댓글) · 쓰기 · 고치기.
// 게시판 공용 부분은 board.js. 추천 잠재력 · 상대 조합은 글 번호만 저장하고, 보여 줄 때 ?ids= 로 한 번에 읽는다(지워진 글은 빠진다)
import { mountTop, loadKakao, faceOf, kakaoList, shareFace, POS } from './app.js?v=3de4668d'
import { api } from './auth.js?v=5d44380b'
import { $, h, P, loadData, startAuth, loggedIn, charGrid, listView, card, itemView, showItem } from './board.js?v=a9bf1646'

let cfg, cat, pot   // data/recruit.json(추천 티어) · data/potentials.json(추천 잠재력 아이콘)
const VS_MAX = 10   // 서버 COMBO_VS 와 같다
const SIDES = [['easy', '😀 상대하기 편한', '편함'], ['hard', '😣 상대하기 힘든', '힘듦']]
const OTHER = { easy: 'hard', hard: 'easy' }
const comboUrl = c => `${location.origin}/combos/?c=${c.id}`
const mini = ids => h('span', { className: 'cb-mini' }, ids.map(id => h('img', { src: faceOf(P(id)), alt: P(id).name, title: P(id).name })))
const tierTags = tiers => tiers.length > 0 && h('span', { className: 'cb-tiers' }, tiers.map(t => h('span', {}, t)))
/** 고른 글을 한 번에 — Map(번호 → 글) */
const byIds = async (board, ids) => ids.length ? new Map((await api(`/${board}?ids=${ids}`))[board].map(x => [x.id, x])) : new Map()

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
    card: c => card(`?c=${c.id}`, c, tierTags(c.tiers), vsLines(c)),
    empty: who => `아직 ${who}조합이 없어요. 첫 조합을 올려 보세요!`,
  })
}

// ---------------------------------------------------------------- 카카오톡 공유

let builds = new Map()   // 보고 있는 글이 고른 잠재력추천 글 — 카톡 카드에 빌드 제목을 넣는다

/** 리스트 카드: 선수 3줄(포지션 · 추천 빌드) → 추천 티어 · 상성(있을 때) → 조합 설명(있을 때). 3줄뿐이면 kakaoList 가 기본 카드로 보낸다 */
function kakaoPayload(c) {
  const url = comboUrl(c), names = ids => ids.map(id => P(id).name).join(' · ')
  const { easy, hard } = c.matchups, body = c.body.replace(/\s+/g, ' ').trim()
  const rows = [
    ...c.chars.map((id, i) => ({
      title: P(id).name, desc: [POS[P(id).pos], builds.get(c.builds[i]) && `💡 ${builds.get(c.builds[i]).title}`].filter(Boolean).join(' · '), img: shareFace(id),
    })),
    (c.tiers.length || easy.chars.length || hard.chars.length) > 0 && {
      title: c.tiers.length ? `추천 티어: ${c.tiers.join(' · ')}` : '상대 상성',
      desc: [easy.chars.length && `편함 ${names(easy.chars)}`, hard.chars.length && `힘듦 ${names(hard.chars)}`].filter(Boolean).join(' / '),
      img: shareFace(easy.chars[0] || hard.chars[0] || c.chars[0]),
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

/** cs = 읽어 온 상대 조합 글(아직이면 undefined) */
const sideView = (k, label, s, cs) => h('div', { className: `cb-side is-${k}` },
  h('h4', {}, `${label} 캐릭터 · 조합`),
  s.chars.length > 0 && h('div', { className: 'pt-charnames' }, s.chars.map(id => h('span', {}, h('img', { src: faceOf(P(id)), alt: '' }), P(id).name))),
  (cs ? s.combos.map(id => cs.get(id)).filter(Boolean) : []).map(x => h('a', { className: 'cb-ref', href: `?c=${x.id}` }, mini(x.chars), h('b', {}, x.title))),
  !s.chars.length && !s.combos.length && h('p', { className: 'rc-muted' }, '없음'))

const showCombo = () => showItem(`/combos/${comboId}`, ({ combo: c, liked, comments }) => {
  document.title = `${c.title} · 조합표 · NBA덩크시티-TNAB`
  const players = h('div', { className: 'cb-players' }), vs = h('div', { className: 'cb-vs' })
  const paint = (bs, cs) => {
    players.replaceChildren(...c.chars.map((id, i) => playerView(id, c.builds[i], bs)))
    vs.replaceChildren(...SIDES.map(([k, label]) => sideView(k, label, c.matchups[k], cs)))
  }
  paint()
  builds = new Map()
  Promise.all([byIds('builds', c.builds.filter(Boolean)), byIds('combos', [...c.matchups.easy.combos, ...c.matchups.hard.combos])])
    .then(([bs, cs]) => { builds = bs; paint(bs, cs) }, () => paint(new Map(), new Map()))
  return itemView({
    path: `/combos/${c.id}`, item: c, liked, comments, listUrl: '/combos/', reload: showCombo, onEdit: () => openForm(c),
    share: { payload: () => kakaoPayload(c), title: `${c.title} · 조합표`, url: comboUrl(c) },
    body: [
      h('section', { className: 'card' }, h('h3', {}, '조합'), players,
        c.tiers.length > 0 && h('p', { className: 'cb-tier-line' }, h('b', {}, '추천 티어'), tierTags(c.tiers)),
        c.body && h('p', { className: 'pt-body' }, c.body)),
      h('section', { className: 'card' }, h('h3', {}, '상대 상성'), vs),
    ],
  })
})

// ---------------------------------------------------------------- 쓰기 · 고치기

let editing = null, draft, formSeq = 0
const buildLists = new Map()   // 캐릭터 → 그 캐릭터를 추천한 잠재력추천 글(추천순) — 폼을 다시 열어도 한 번만 읽는다

function openForm(c = null) {
  editing = c
  const f = $('#combo-form'), el = f.elements, my = ++formSeq
  $('#form-title').textContent = c ? '조합 수정' : '조합 등록'
  el.title.value = c?.title || ''
  el.body.value = c?.body || ''
  $('.rc-form-err', f).hidden = true
  draft = {
    chars: [...(c?.chars || [])],   // 고른 순서 = 추천 잠재력과 짝
    builds: new Map(c?.chars.map((id, i) => [id, c.builds[i]])),
    vs: Object.fromEntries(SIDES.map(([k]) => [k, { chars: new Set(c?.matchups[k].chars), combos: new Set(c?.matchups[k].combos) }])),
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

  $('#form-tiers').replaceChildren(...cfg.tiers.map(t => h('label', {},
    h('input', { type: 'checkbox', name: 'tiers', value: t, checked: !!c?.tiers.includes(t) }), h('span', {}, t))))

  // 상대하기 편한 · 힘든 — 한 캐릭터 · 조합은 한쪽에만
  const toggle = (k, kind, id) => {
    const s = vs[k][kind]
    if (s.has(id)) s.delete(id)
    else if (s.size < VS_MAX) { s.add(id); vs[OTHER[k]][kind].delete(id) }
  }
  const grids = {}, comboBtns = { easy: [], hard: [] }
  const paintCombos = () => SIDES.forEach(([k]) => comboBtns[k].forEach(b => b.setAttribute('aria-pressed', vs[k].combos.has(+b.value))))
  for (const [k] of SIDES) {
    $(`#form-${k}-chars`).replaceChildren(grids[k] = charGrid({ isOn: id => vs[k].chars.has(id), pick: id => { toggle(k, 'chars', id); grids[OTHER[k]].sync() } }))
    $(`#form-${k}-combos`).replaceChildren(h('p', { className: 'rc-muted' }, '조합 목록 불러오는 중…'))
  }
  // ponytail: 추천순 100개만 고를 수 있다(이미 고른 건 목록 밖이어도 남는다). 조합이 많아지면 검색을 붙인다
  api('/combos?sort=likes').then(r => {
    if (my !== formSeq) return
    const list = r.combos.filter(x => x.id !== c?.id)
    for (const [k] of SIDES) {
      comboBtns[k] = list.map(x => h('button', { type: 'button', className: 'cb-ref', value: x.id, onclick: () => { toggle(k, 'combos', x.id); paintCombos() } },
        mini(x.chars), h('b', {}, x.title)))
      $(`#form-${k}-combos`).replaceChildren(...comboBtns[k].length ? comboBtns[k] : [h('p', { className: 'rc-muted' }, '아직 고를 수 있는 다른 조합이 없어요')])
    }
    paintCombos()
  }, e => { if (my === formSeq) for (const [k] of SIDES) $(`#form-${k}-combos`).replaceChildren(h('p', { className: 'rc-muted rc-bad' }, e.message)) })

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
      tiers: [...f.querySelectorAll('[name=tiers]:checked')].map(i => i.value),
      matchups: Object.fromEntries(SIDES.map(([k]) => [k, { chars: [...draft.vs[k].chars], combos: [...draft.vs[k].combos] }])),
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
  ;[, cfg, cat] = await Promise.all([loadData(), json('/data/recruit.json'), json('/data/potentials.json')])
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
