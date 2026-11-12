// 향우회 — 캐릭터별 커뮤니티: 게시판(분류 · 답변 상태 · 캐릭터 필터, 최신순) · 글(질문답변은 쓴 사람이 댓글 하나를 채택) · 내공 랭킹 · 내 글에 달린 댓글(알림).
// 게시판 공용 부분은 board.js, 알림을 3분마다 묻는 것은 auth.js 의 watchReplies(사이트 어느 페이지에서나)
import { mountTop, loadKakao, faceOf, shareFace } from './app.js?v=f44b46d8'
import { api, notifyOn, setNotify, watchReplies, SUPABASE_URL } from './auth.js?v=653410db'
import { $, h, P, ago, loadData, startAuth, loggedIn, charGrid, listView, itemView, showItem, auth, me } from './board.js?v=9a40ea1b'

let cfg, catName   // data/club.json · 분류 id → 이름
const SEEN = 'club.seen'   // 알림 탭에서 마지막으로 본 댓글 id — 탭의 빨간 숫자
const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch {} },
}
const postUrl = x => `${location.origin}/club/?p=${x.id}`
const catTag = id => h('span', { className: `vd-cat is-${id}` }, catName.get(id) || id)
const stateTag = x => x.category === 'qna' && h('span', { className: `cl-state${x.adopted ? ' is-done' : ''}` }, x.adopted ? '답변완료' : '답변대기')
/** 오늘 쓴 글은 시:분, 올해는 월.일, 그 전은 연.월.일 (DC 갤러리처럼) */
const when = ms => {
  const d = new Date(ms), now = new Date(), p = n => String(n).padStart(2, '0')
  if (d.toDateString() === now.toDateString()) return `${p(d.getHours())}:${p(d.getMinutes())}`
  return `${d.getFullYear() === now.getFullYear() ? '' : `${String(d.getFullYear()).slice(2)}.`}${p(d.getMonth() + 1)}.${p(d.getDate())}`
}
/** 목록 한 줄: 번호 · 분류 · 제목 [댓글] 상태 · 향우회 · 글쓴이 · 작성일 · 조회 · 추천 — 줄 머리는 club/index.html 의 .cl-head */
const row = x => {
  const char = P(x.chars[0])
  return h('a', { className: 'cl-row', href: `?p=${x.id}` },
    h('span', { className: 'cl-no' }, x.id),
    h('span', { className: 'cl-cat' }, catTag(x.category)),
    h('span', { className: 'cl-title' }, h('b', {}, x.title), x.images.length > 0 && h('i', { title: `사진 ${x.images.length}장` }, '🖼'), x.comments > 0 && h('em', {}, `[${x.comments}]`), stateTag(x)),
    h('span', { className: 'cl-who', title: `${char.name} 향우회` }, h('img', { src: faceOf(char), alt: '' }), char.short || char.name),
    h('span', { className: 'cl-author' }, x.author),
    h('span', { className: 'cl-date', title: new Date(x.createdAt).toLocaleString('ko-KR') }, when(x.createdAt)),
    h('span', { className: 'cl-views' }, x.views),
    h('span', { className: 'cl-likes' }, x.likes))
}

// ---------------------------------------------------------------- 그림 — 웹용으로 줄여 올리고(Storage 공개 버킷 club) 이름만 글 · 댓글에

const imgUrl = name => `${SUPABASE_URL}/storage/v1/object/public/club/${name}`
const SIDE = 1280, TARGET = 200 * 1024   // 긴 변 1280px · 200KB 아래로(서버 한도 300KB)

/** 그림 파일 → WebP(안 되는 브라우저는 JPEG) Blob. 긴 변 1280px · 품질 0.75 에서 시작해 200KB 를 넘으면 0.8배씩 줄인다.
 *  다시 그리므로 사진 속 위치 정보(EXIF)는 빠지고, 움직이는 GIF 는 첫 장면만 남는다 */
async function shrink(file) {
  let bmp
  try { bmp = await createImageBitmap(file) } catch { throw new Error('이 그림은 읽을 수 없어요 — PNG · JPEG · WebP 로 올려 주세요') }
  let scale = Math.min(1, SIDE / Math.max(bmp.width, bmp.height)), blob
  for (let i = 0; i < 6; i++) {
    const c = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(bmp.width * scale)), height: Math.max(1, Math.round(bmp.height * scale)) })
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.75))
    if (blob?.type !== 'image/webp') blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8))   // 옛 사파리는 WebP 로 못 굽는다
    if (blob.size <= TARGET) break
    scale *= 0.8
  }
  bmp.close()
  return blob
}

/**
 * 그림 고르기 — 📷 버튼 · 붙여넣기(클립보드) · 끌어 놓기. 넣는 즉시 줄여서 올리고 이름만 들고 있다.
 * kept = 고치는 글에 이미 있던 그림(빼도 바로 지우지 않는다 — 저장하면 서버가 지운다). 새로 올린 것을 빼면 바로 지운다
 */
function imagePicker(max, kept = []) {
  const items = kept.map(name => ({ name, kept: true }))
  const input = h('input', { type: 'file', accept: 'image/*', multiple: max > 1, hidden: true, onchange: () => { add([...input.files]); input.value = '' } })
  const btn = h('button', { type: 'button', className: 'cl-attach-btn', onclick: () => input.click() })
  const thumbs = h('div', { className: 'cl-thumbs' }), err = h('small', { className: 'rc-err', hidden: true })
  const paint = () => {
    btn.textContent = `📷 사진 ${items.length}/${max}`
    btn.disabled = items.length >= max
    thumbs.replaceChildren(...items.map(it => h('span', { className: `cl-thumb${it.busy ? ' is-busy' : ''}` },
      h('img', { src: it.url || imgUrl(it.name), alt: '' }),
      !it.busy && h('button', { type: 'button', 'aria-label': '사진 빼기', onclick: () => drop1(it) }, '✕'))))
  }
  async function add(files) {
    files = files.filter(f => f.type.startsWith('image/'))
    if (!files.length || !await loggedIn()) return
    err.hidden = true
    if (files.length > max - items.length) { err.textContent = `사진은 ${max}장까지 붙일 수 있어요`; err.hidden = false }
    for (const f of files.slice(0, max - items.length)) {
      const it = { url: URL.createObjectURL(f), busy: true }
      items.push(it)
      paint()
      try { it.name = (await api('/club/images', { method: 'POST', withToken: true, raw: await shrink(f) })).name }
      catch (e) { items.splice(items.indexOf(it), 1); err.textContent = e.message; err.hidden = false }
      it.busy = false
      paint()
    }
  }
  const forget = it => api(`/club/images/${it.name}`, { method: 'DELETE', withToken: true }).catch(() => {})
  function drop1(it) {
    items.splice(items.indexOf(it), 1)
    paint()
    if (!it.kept) forget(it)
  }
  paint()
  return {
    el: h('div', { className: 'cl-attach' }, thumbs, h('div', { className: 'cl-attach-row' }, btn, input, err)),
    values: () => items.filter(it => it.name && !it.busy).map(it => it.name),
    busy: () => items.some(it => it.busy),
    discard: () => items.filter(it => !it.kept && it.name).forEach(forget),   // 글쓰기를 취소했다
    paste: e => {
      const files = [...e.clipboardData?.files || []].filter(f => f.type.startsWith('image/'))
      if (!files.length) return
      if (!e.clipboardData.types.includes('text/plain')) e.preventDefault()   // 글자와 같이 온 그림(문서 복사)은 글자도 붙인다
      add(files)
    },
    drop: e => { const files = [...e.dataTransfer?.files || []]; if (files.length) { e.preventDefault(); add(files) } },
  }
}

/** 글 · 댓글의 그림 — 누르면 원본 크기로 새 탭 */
const gallery = (names, small = false) => names?.length > 0 && h('div', { className: `cl-imgs${small ? ' is-small' : ''}` },
  names.map(n => h('a', { href: imgUrl(n), target: '_blank', rel: 'noopener' }, h('img', { src: imgUrl(n), alt: '', loading: 'lazy' }))))

const q = new URLSearchParams(location.search)
const view = /^\d+$/.test(q.get('p') || '') ? 'post' : q.has('rank') ? 'rank' : q.has('alerts') ? 'alerts' : 'list'
const SECTION = { list: '#list-view', rank: '#rank-view', alerts: '#alerts-view', post: '#item-view' }

// ---------------------------------------------------------------- 게시판

let cat = q.get('cat') || '', state = ['open', 'done'].includes(q.get('state')) ? q.get('state') : ''   // state = open 답변대기 | done 답변완료 (질문답변일 때만)

function showList() {
  const reload = listView({
    sort: 'new', pageSize: 30, remember: true,
    load: async qs => { const r = await api(`/club?${qs}`); return { items: r.club, total: r.total } },
    card: row,
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
      h('p', { className: 'cl-alert-body' }, a.body || '📷 사진')))))
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
/** 조회수는 이 탭에서 그 글을 처음 열 때만 올린다(새로고침 · 로그인 뒤 다시 읽기는 빼고) */
let counted = false
function viewOnce() {
  if (counted) return ''
  counted = true
  try { if (sessionStorage.getItem(`club.v${postId}`)) return ''; sessionStorage.setItem(`club.v${postId}`, '1') } catch {}
  return '?view=1'
}

async function adopt(x, c) {
  if (!confirm(`${c.author} 님의 답변을 채택할까요?\n답변한 사람에게 내공 +${cfg.points}. 채택은 바꿀 수 없고, 이 질문은 더 고치거나 지울 수 없어요.`)) return
  try { await api(`/club/${x.id}/adopt`, { method: 'POST', withToken: true, body: { comment: c.id } }); showPost() }
  catch (e) { alert(e.message) }
}

const showPost = () => showItem(`/club/${postId}${viewOnce()}`, ({ post: x, liked, comments }) => {
  document.title = `${x.title} · 향우회 · TNAB Vipers`
  const char = P(x.chars[0]), best = comments.find(c => c.id === x.adopted)
  const asking = x.category === 'qna' && !x.adopted && auth === 'in' && me.id === x.authorId   // 채택할 수 있는 사람이 보고 있다
  return itemView({
    path: `/club/${x.id}`, item: x, liked, listUrl: '/club/', reload: showPost, onEdit: () => openForm(x), locked: !!x.adopted,
    comments: [best, ...comments.filter(c => c !== best)].filter(Boolean).map(c => ({ ...c, locked: c === best })),   // 채택된 답변이 맨 위
    commentTail: c => c.locked ? h('span', { className: 'cl-best' }, `✅ 채택된 답변 · 내공 +${cfg.points}`)
      : asking && c.authorId !== me.id && h('button', { type: 'button', className: 'cl-adopt', onclick: () => adopt(x, c) }, '채택'),
    commentExtra: c => gallery(c.images, true), attach: imagePicker(cfg.images.comment),
    share: { payload: () => kakaoPayload(x), title: `${x.title} · 향우회`, url: postUrl(x) },
    body: [h('section', { className: 'card' },
      h('p', { className: 'cl-tags' }, catTag(x.category), stateTag(x), h('span', { className: 'cl-club' }, h('img', { src: faceOf(char), alt: '' }), `${char.name} 향우회`),
        h('span', { className: 'cl-hits' }, `조회 ${x.views} · 추천 ${x.likes}`)),
      h('p', { className: 'pt-body' }, x.body),
      gallery(x.images),
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
  f.picker = imagePicker(cfg.images.post, x?.images || [])
  $('#form-images').replaceChildren(f.picker.el)
  for (const s of ['#club-head', ...Object.values(SECTION)]) $(s).hidden = true
  $('#form-view').hidden = false
  scrollTo(0, 0)
}

function closeForm() {
  form().picker.discard()
  $('#form-view').hidden = true
  $('#club-head').hidden = view === 'post'
  $(SECTION[view]).hidden = false
}

function bindForm() {
  const f = form(), el = f.elements
  $('#form-cancel').onclick = closeForm
  f.addEventListener('paste', e => f.picker?.paste(e))
  f.addEventListener('dragover', e => e.preventDefault())
  f.addEventListener('drop', e => f.picker?.drop(e))
  f.onsubmit = async e => {
    e.preventDefault()
    const btn = $('[type=submit]', f), err = $('.rc-form-err', f)
    const v = { category: el.category.value, chars: f.char ? [f.char] : [], title: el.title.value, body: el.body.value, images: f.picker.values() }
    const bad = !v.chars.length ? '향우회 캐릭터를 골라 주세요' : !v.title.trim() ? '제목을 입력해 주세요' : !v.body.trim() ? '내용을 입력해 주세요'
      : f.picker.busy() ? '사진을 올리는 중이에요 — 잠깐만 기다려 주세요' : ''
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
  // 「← 목록」 은 들어온 목록(그 쪽 · 필터)으로
  let ref = null
  try { ref = new URL(document.referrer) } catch {}
  if (view === 'post' && ref?.origin === location.origin && ref.pathname === '/club/' && !ref.searchParams.has('p')) $('#item-view .rc-back').href = ref.href
  startAuth('글을 쓰거나 추천 · 댓글을 달려면 로그인이 필요해요.', () => {
    if (view === 'post') showPost()
    else if (view === 'alerts') showAlerts()
    else badge()
  })
  if (view === 'list') showList()
  if (view === 'rank') showRank()
}

boot()
