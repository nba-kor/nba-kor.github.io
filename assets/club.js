// 향우회 — 캐릭터별 커뮤니티: 게시판(분류 · 답변 상태 · 캐릭터 필터, 최신순) · 글(질문답변은 쓴 사람이 댓글 하나를 채택) · 내공 랭킹 · 내 글에 달린 댓글(알림).
// 게시판 공용 부분은 board.js, 알림을 3분마다 묻는 것은 auth.js 의 watchReplies(사이트 어느 페이지에서나)
import { mountTop, loadKakao, faceOf, shareFace } from './app.js?v=fb02b445'
import { api, notifyOn, setNotify, watchReplies } from './auth.js?v=01106c22'
import { $, h, P, ago, loadData, startAuth, loggedIn, charGrid, listView, card, itemView, showItem, auth, me } from './board.js?v=f9551348'

let cfg, catName   // data/club.json · 분류 id → 이름
const SEEN = 'club.seen'   // 알림 탭에서 마지막으로 본 댓글 id — 탭의 빨간 숫자
const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch {} },
}
const postUrl = x => `${location.origin}/club/?p=${x.id}`
const catTag = id => h('span', { className: `vd-cat is-${id}` }, catName.get(id) || id)
const stateTag = x => x.category === 'qna' && h('span', { className: `cl-state${x.adopted ? ' is-done' : ''}` }, x.adopted ? '답변완료' : '답변대기')

const q = new URLSearchParams(location.search)
const view = /^\d+$/.test(q.get('p') || '') ? 'post' : q.has('rank') ? 'rank' : q.has('alerts') ? 'alerts' : 'list'
const SECTION = { list: '#list-view', rank: '#rank-view', alerts: '#alerts-view', post: '#item-view' }

// ---------------------------------------------------------------- 게시판

let cat = q.get('cat') || '', state = ''   // state = open 답변대기 | done 답변완료 (질문답변일 때만)

function showList() {
  const reload = listView({
    sort: 'new',
    load: async qs => (await api(`/club?${qs}`)).club,
    card: x => card(`?p=${x.id}`, x, h('p', { className: 'cl-tags' }, catTag(x.category), stateTag(x))),
    empty: who => `아직 ${who}${cat ? `${catName.get(cat)} ` : ''}글이 없어요. 첫 글을 써 보세요!`,
    extra: () => ({ ...(cat && { cat }), ...(cat === 'qna' && state && { state }) }),
  })
  const pills = (box, items, get, set) => {
    const btns = items.map(([id, name]) => h('button', { type: 'button', onclick: () => { set(id); paint(); reload() } }, name))
    const paint = () => btns.forEach((b, i) => b.setAttribute('aria-pressed', items[i][0] === get()))
    paint()
    $(box).replaceChildren(...btns)
    return paint
  }
  const paintState = pills('#filter-state', [['', '전체'], ['open', '답변대기'], ['done', '답변완료']], () => state, id => { state = id })
  pills('#filter-cats', [['', '전체'], ...cfg.categories.map(c => [c.id, c.name])], () => cat, id => {
    cat = id
    state = ''
    paintState()
    $('#filter-state').hidden = cat !== 'qna'
  })
  $('#filter-state').hidden = cat !== 'qna'
}

// ---------------------------------------------------------------- 내공 랭킹

function showRank() {
  let char = '', seq = 0
  $('#rank-points').textContent = `+${cfg.points}`
  const load = async () => {
    const my = ++seq, box = $('#rank-list')
    $('#rank-title').textContent = `${char ? `${P(char).name} 향우회` : '전체'} 내공 랭킹`
    let ranking
    try { ({ ranking } = await api(`/club/ranking${char ? `?char=${char}` : ''}`)) }
    catch (e) { if (my === seq) box.replaceChildren(h('p', { className: 'rc-note rc-bad' }, e.message)); return }
    if (my !== seq) return
    box.replaceChildren(ranking.length ? h('ol', { className: 'cl-rank' }, ranking.map(r => h('li', { className: r.rank <= 3 ? `is-top${r.rank}` : '' },
      h('span', { className: 'cl-rank-no' }, ['🥇', '🥈', '🥉'][r.rank - 1] || r.rank),
      h('b', {}, r.name),
      h('small', { className: 'rc-muted' }, `채택 ${r.adopted}`),
      h('em', {}, `${r.points.toLocaleString()} 내공`))))
      : h('p', { className: 'rc-note' }, `아직 ${char ? `${P(char).name} 향우회에서 ` : ''}채택된 답변이 없어요. 질문답변 글에 답해 보세요!`))
  }
  $('#rank-chars').append(charGrid({ isOn: id => char === id, pick: id => { char = char === id ? '' : id; load() } }))
  load()
}

// ---------------------------------------------------------------- 알림

/** 알림 탭 옆 빨간 숫자 — 마지막으로 알림 탭을 본 뒤 내 글에 달린 댓글 수 */
async function badge() {
  if (auth !== 'in') return
  try {
    const { alerts } = await api('/club/alerts', { withToken: true }), n = alerts.filter(a => a.id > (+store.get(SEEN) || 0)).length
    $('#alert-count').textContent = n
    $('#alert-count').hidden = !n
  } catch {}
}

async function showAlerts() {
  const box = $('#alerts-list'), btn = $('#notify-btn')
  if (auth !== 'in') { btn.hidden = true; return box.replaceChildren(h('p', { className: 'rc-note' }, '로그인하면 내 글에 달린 댓글을 여기서 볼 수 있어요')) }
  let alerts
  try { ({ alerts } = await api('/club/alerts', { withToken: true })) }
  catch (e) { return box.replaceChildren(h('p', { className: 'rc-note rc-bad' }, e.message)) }
  const seen = +store.get(SEEN) || 0
  store.set(SEEN, String(Math.max(seen, alerts[0]?.id ?? 0)))
  box.replaceChildren(alerts.length ? h('ul', { className: 'cl-alerts' }, alerts.map(a => h('li', { className: a.id > seen ? 'is-new' : '' },
    h('a', { href: `?p=${a.postId}` },
      h('p', {}, h('b', {}, a.author), ' 님이 「', h('b', {}, a.title), '」에 댓글 · ', h('small', { className: 'rc-muted' }, ago(a.createdAt))),
      h('p', { className: 'cl-alert-body' }, a.body)))))
    : h('p', { className: 'rc-note' }, '아직 내 글에 달린 댓글이 없어요'))

  btn.hidden = false
  const paint = () => { btn.textContent = notifyOn() ? '🔔 알림 켜짐 — 끄기' : '🔕 윈도우 알림 켜기'; btn.className = notifyOn() ? '' : 'primary' }
  paint()
  btn.onclick = async () => {
    if (notifyOn()) { setNotify(false); return paint() }
    if (typeof Notification === 'undefined') return alert('이 브라우저는 알림을 지원하지 않아요 — PC 크롬 · 엣지에서 켜 주세요')
    if (await Notification.requestPermission() !== 'granted') return alert('알림이 막혀 있어요 — 주소창 왼쪽의 사이트 설정에서 알림을 허용해 주세요')
    try { new Notification('🔔 향우회 알림을 켰어요', { body: '내 글에 댓글이 달리면 이렇게 알려 드려요', icon: '/assets/icon.png?v=2' }) }
    catch { return alert('이 브라우저(휴대폰)는 알림을 띄울 수 없어요 — PC 크롬 · 엣지에서 켜 주세요') }
    setNotify(true, alerts[0]?.id ?? 0)   // 지금까지 달린 댓글은 알리지 않는다
    watchReplies()
    paint()
  }
}

// ---------------------------------------------------------------- 카카오톡 공유

/** 피드 카드: 향우회 캐릭터 얼굴 + 분류 · 제목 */
function kakaoPayload(x) {
  const url = postUrl(x), link = { mobileWebUrl: url, webUrl: url }, char = P(x.chars[0])
  return {
    objectType: 'feed',
    content: {
      title: `[${catName.get(x.category)}] ${x.title}`, description: `${char.name} 향우회 · ${x.author} 님`,
      imageUrl: shareFace(char.id), imageWidth: 300, imageHeight: 300, link,
    },
    buttons: [{ title: '글 보기', link }],
  }
}

// ---------------------------------------------------------------- 글

const postId = q.get('p')

async function adopt(x, c) {
  if (!confirm(`${c.author} 님의 답변을 채택할까요?\n답변한 사람에게 내공 +${cfg.points}. 채택은 바꿀 수 없고, 이 질문은 더 고치거나 지울 수 없어요.`)) return
  try { await api(`/club/${x.id}/adopt`, { method: 'POST', withToken: true, body: { comment: c.id } }); showPost() }
  catch (e) { alert(e.message) }
}

const showPost = () => showItem(`/club/${postId}`, ({ post: x, liked, comments }) => {
  document.title = `${x.title} · 향우회 · TNAB Vipers`
  const char = P(x.chars[0]), best = comments.find(c => c.id === x.adopted)
  const asking = x.category === 'qna' && !x.adopted && auth === 'in' && me.id === x.authorId   // 채택할 수 있는 사람이 보고 있다
  return itemView({
    path: `/club/${x.id}`, item: x, liked, listUrl: '/club/', reload: showPost, onEdit: () => openForm(x), locked: !!x.adopted,
    comments: [best, ...comments.filter(c => c !== best)].filter(Boolean).map(c => ({ ...c, locked: c === best })),   // 채택된 답변이 맨 위
    commentTail: c => c.locked ? h('span', { className: 'cl-best' }, `✅ 채택된 답변 · 내공 +${cfg.points}`)
      : asking && c.authorId !== me.id && h('button', { type: 'button', className: 'cl-adopt', onclick: () => adopt(x, c) }, '채택'),
    share: { payload: () => kakaoPayload(x), title: `${x.title} · 향우회`, url: postUrl(x) },
    body: [h('section', { className: 'card' },
      h('p', { className: 'cl-tags' }, catTag(x.category), stateTag(x), h('span', { className: 'cl-club' }, h('img', { src: faceOf(char), alt: '' }), `${char.name} 향우회`)),
      h('p', { className: 'pt-body' }, x.body),
      asking && comments.some(c => c.authorId !== me.id) && h('p', { className: 'rc-note cl-hint' }, `마음에 드는 답변에 「채택」 을 눌러 주세요 — 답변한 사람에게 내공 +${cfg.points}`))],
  })
})

// ---------------------------------------------------------------- 글쓰기 · 고치기

let editing = null   // 고치는 글(없으면 새 글)
const form = () => $('#post-form')

function openForm(x = null) {
  editing = x
  const f = form(), el = f.elements
  f.char = x?.chars[0] || ''
  $('#form-title').textContent = x ? '글 수정' : '글쓰기'
  el.title.value = x?.title || ''
  el.body.value = x?.body || ''
  $('.rc-form-err', f).hidden = true
  $('#form-cats').replaceChildren(...cfg.categories.map(c => h('label', {},
    h('input', { type: 'radio', name: 'category', value: c.id, checked: (x?.category || cfg.categories[0].id) === c.id }), h('span', {}, c.name))))
  $('#form-chars').replaceChildren(charGrid({ isOn: id => f.char === id, pick: id => { f.char = id } }))
  for (const s of ['#club-head', ...Object.values(SECTION)]) $(s).hidden = true
  $('#form-view').hidden = false
  scrollTo(0, 0)
}

function closeForm() {
  $('#form-view').hidden = true
  $('#club-head').hidden = view === 'post'
  $(SECTION[view]).hidden = false
}

function bindForm() {
  const f = form(), el = f.elements
  $('#form-cancel').onclick = closeForm
  f.onsubmit = async e => {
    e.preventDefault()
    const btn = $('[type=submit]', f), err = $('.rc-form-err', f)
    const v = { category: el.category.value, chars: f.char ? [f.char] : [], title: el.title.value, body: el.body.value }
    const bad = !v.chars.length ? '향우회 캐릭터를 골라 주세요' : !v.title.trim() ? '제목을 입력해 주세요' : !v.body.trim() ? '내용을 입력해 주세요' : ''
    err.textContent = bad
    err.hidden = !bad
    if (bad || btn.disabled) return
    btn.disabled = true
    try {
      const { post } = await api(editing ? `/club/${editing.id}` : '/club', { method: editing ? 'PUT' : 'POST', withToken: true, body: v })
      location.href = `/club/?p=${post.id}`
    } catch (e) { err.textContent = e.message; err.hidden = false }
    finally { btn.disabled = false }
  }
}

// ---------------------------------------------------------------- 초기화

const boot = async () => {
  ;[, cfg] = await Promise.all([loadData(), fetch('/data/club.json', { cache: 'no-cache' }).then(r => r.json())])
  catName = new Map(cfg.categories.map(c => [c.id, c.name]))
  if (!catName.has(cat)) cat = ''
  mountTop('/club/')
  loadKakao()
  bindForm()
  $('#new').onclick = async () => { if (await loggedIn()) openForm() }
  document.querySelector(`.cl-tabs [data-view="${view}"]`)?.setAttribute('aria-current', 'page')
  $('#club-head').hidden = view === 'post'
  $(SECTION[view]).hidden = view === 'post'   // 글은 showItem 이 연다
  startAuth('글을 쓰거나 추천 · 댓글을 달려면 로그인이 필요해요.', () => {
    if (view === 'post') showPost()
    else if (view === 'alerts') showAlerts()
    else badge()
  })
  if (view === 'list') showList()
  if (view === 'rank') showRank()
}

boot()
