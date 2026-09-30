// 게시판 공용 — 잠재력추천 · 영상이 같이 쓴다: 로그인 표시, 캐릭터 고르기, 목록 카드 틀, 글 머리(추천 · 공유 · 수정 · 삭제), 댓글
import { loadPlayers, faceOf, POS, KAKAO_JS_KEY, shareKakao, copyLink } from './app.js?v=722e4f3b'
import { api, initAuth, login, logout, session, IN_KAKAO } from './auth.js?v=5d44380b'

export const $ = (s, root = document) => root.querySelector(s)
/** DOM 생성. 문자열 자식은 텍스트 노드가 되므로 사용자 입력을 그대로 넣어도 안전하다. */
export const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) k in n ? n[k] = v : n.setAttribute(k, v)
  n.append(...kids.flat().filter(k => k != null && k !== false))
  return n
}
export const ago = ms => {
  const m = Math.floor((Date.now() - ms) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`
  if (m < 43200) return `${Math.floor(m / 1440)}일 전`
  return new Date(ms).toLocaleDateString('ko-KR')
}

// ---------------------------------------------------------------- 선수

export let data, kr   // kr = 한국 서버 출시 선수, 포지션 순
export const P = id => data.byId.get(id) || { id, name: id, short: id, pos: 0 }
export async function loadData() {
  data = await loadPlayers()
  kr = data.players.filter(p => p.server === 'kr').sort((a, b) => a.pos - b.pos)
}
export const faces = ids => h('div', { className: 'rc-faces' }, ids.map(id => h('img', { src: faceOf(P(id)), alt: P(id).name, title: P(id).name })))

// ---------------------------------------------------------------- 로그인

export let auth = 'loading', me = null   // me = { id, name } — 로그인했을 때
let authReady, needText, onChange
export const authFirst = new Promise(r => { authReady = r })

async function loadMe() {
  if (!await session()) return setAuth('out')
  try {
    const v = await api('/me', { withToken: true })
    setAuth('in', { id: v.user.id, name: v.profile?.name || v.user.name })
  } catch (e) { setAuth(e.status === 401 ? 'out' : 'error') }
}

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
  need.textContent = auth === 'out' ? `${needText}${IN_KAKAO ? ' 로그인을 누르면 평소 쓰는 브라우저로 열려요.' : ''}` : ''
  need.hidden = !need.textContent
  if (state !== 'loading') onChange?.()   // 추천 여부 · 내 글 버튼이 로그인에 따라 달라진다
}

/** need = 로그아웃 상태에서 목록 위에 띄울 안내, change = 로그인 상태가 정해지거나 바뀔 때마다 */
export function startAuth(need, change) {
  needText = need
  onChange = change
  setAuth('loading')
  initAuth(loadMe).then(ok => ok || setAuth('down'))
}

/** 쓰기 전에: 로그인이 안 돼 있으면 로그인으로 보내고 false */
export async function loggedIn() {
  await authFirst
  if (auth === 'in') return true
  if (auth === 'out') login()
  else alert('로그인 정보를 확인하지 못했어요 — 새로고침해 보세요')
  return false
}

// ---------------------------------------------------------------- 캐릭터 고르기 (필터 · 글쓰기 공용)

/** 포지션 탭 + 초상화 격자. pick(id) 는 누를 때마다, isOn(id) 로 선택 표시. 포지션 탭은 onPos(pos) 로도 알린다 */
export function charGrid({ isOn, pick, onPos }) {
  let pos = 0
  const tabs = [0, 1, 2, 3, 4, 5].map(i => h('button', { type: 'button', className: 'rc-fbtn', 'data-pos': i, onclick: () => { pos = i; onPos?.(i); sync() } }, i ? POS[i] : '전체'))
  const btns = kr.map(p => h('button', { type: 'button', className: 'pt-face', title: p.name, onclick: () => { pick(p.id); sync() } },
    h('img', { src: faceOf(p), alt: '', loading: 'lazy' }), h('span', {}, p.short || p.name)))
  const sync = () => {
    tabs.forEach((b, i) => b.setAttribute('aria-pressed', i === pos))
    btns.forEach((b, i) => { b.hidden = pos > 0 && kr[i].pos !== pos; b.setAttribute('aria-pressed', isOn(kr[i].id)) })
  }
  sync()
  return Object.assign(h('div', { className: 'pt-chars' }, h('div', { className: 'rc-filter' }, tabs), h('div', { className: 'pt-grid' }, btns)), { sync })
}

// ---------------------------------------------------------------- 목록

/**
 * 목록 화면: 정렬 버튼([data-sort]) · 포지션/캐릭터 필터(#filter-chars) · 카드(#list). load(qs) 가 [글] 을 돌려주고 card(글) 가 카드를 만든다.
 * extra() = 게시판만의 필터를 쿼리에 더한다. 돌려주는 reload() 로 그 필터가 바뀌었을 때 다시 읽는다
 */
export function listView({ load, card, empty, extra = () => ({}) }) {
  const filter = { sort: 'likes', pos: 0, char: '' }
  let seq = 0
  async function reload() {
    for (const b of document.querySelectorAll('[data-sort]')) b.setAttribute('aria-pressed', b.dataset.sort === filter.sort)
    const box = $('#list'), my = ++seq
    const qs = new URLSearchParams({ sort: filter.sort, ...(filter.char ? { char: filter.char } : filter.pos && { pos: filter.pos }), ...extra() })
    let items
    try { items = await load(qs) }
    catch (e) { if (my === seq) box.replaceChildren(h('p', { className: 'rc-note rc-bad' }, e.message)); return }
    if (my !== seq) return
    const who = filter.char ? `${P(filter.char).name} ` : filter.pos ? `${POS[filter.pos]} ` : ''
    box.replaceChildren(...items.length ? items.map(card) : [h('p', { className: 'rc-note' }, empty(who))])
  }
  for (const b of document.querySelectorAll('[data-sort]')) b.onclick = () => { filter.sort = b.dataset.sort; reload() }
  $('#filter-chars').append(charGrid({
    isOn: id => filter.char === id,
    pick: id => { filter.char = filter.char === id ? '' : id; reload() },
    onPos: pos => { filter.pos = pos; filter.char = ''; reload() },
  }))
  reload()
  return reload
}

/** 목록 카드 틀: 제목 · 작성자 · (게시판만의 내용) · 캐릭터 얼굴 · 추천/댓글 수 */
export const card = (href, x, ...middle) => h('a', { className: 'rc-tcard pt-card', href },
  h('div', { className: 'rc-tcard-head' }, h('b', {}, x.title)),
  h('p', {}, h('b', {}, x.author), ` · ${ago(x.createdAt)}`),
  ...middle,
  x.chars.length > 0 && faces(x.chars),
  h('p', { className: 'pt-counts' }, `👍 ${x.likes} · 💬 ${x.comments}`))

// ---------------------------------------------------------------- 글

async function del(path, ask) {
  if (!confirm(ask)) return false
  try { await api(path, { method: 'DELETE', withToken: true }); return true }
  catch (e) { alert(e.message); return false }
}

/**
 * 글 화면 틀: 머리(작성자 · 제목 · 추천 · 카카오 공유 · 링크 복사 · 수정 · 삭제) + 본문(body) + 댓글.
 * path = '/builds/3' 같은 API 경로, share = { payload(), title, url }, reload() = 댓글을 달거나 지운 뒤 다시 읽기
 */
export function itemView({ path, item: x, liked, comments, body, share, onEdit, listUrl, reload }) {
  const mine = auth === 'in' && me.id === x.authorId

  const likeBtn = h('button', { type: 'button', className: 'pt-like' })
  const paintLike = n => { likeBtn.textContent = `👍 추천 ${n}`; likeBtn.setAttribute('aria-pressed', liked) }
  paintLike(x.likes)
  likeBtn.onclick = async () => {
    if (!await loggedIn()) return
    likeBtn.disabled = true
    try { const v = await api(`${path}/like`, { method: 'POST', withToken: true }); liked = v.liked; paintLike(v.likes) }
    catch (e) { alert(e.message) }
    finally { likeBtn.disabled = false }
  }

  const form = h('form', { className: 'pt-cform', novalidate: true },
    h('textarea', { name: 'body', rows: 2, maxLength: 500, placeholder: auth === 'in' ? '댓글을 남겨 주세요' : '댓글은 디스코드 로그인 후 쓸 수 있어요' }),
    h('div', { className: 'rc-actions' }, h('button', { type: 'submit', className: 'primary' }, '댓글 달기')),
    h('p', { className: 'rc-form-err', role: 'alert', hidden: true }))
  form.onsubmit = async e => {
    e.preventDefault()
    if (!await loggedIn()) return
    const ta = $('textarea', form), msg = $('.rc-form-err', form), btn = $('[type=submit]', form)
    if (!ta.value.trim()) return ta.focus()
    btn.disabled = true
    try { await api(`${path}/comments`, { method: 'POST', withToken: true, body: { body: ta.value } }); reload() }
    catch (e) { msg.textContent = e.message; msg.hidden = false }
    finally { btn.disabled = false }
  }

  return [
    h('div', { className: 'rc-team-head pt-head' },
      h('div', {},
        h('p', { className: 'rc-kicker' }, h('b', {}, x.author), ` · ${ago(x.createdAt)}${x.updatedAt > x.createdAt + 60000 ? ' (수정됨)' : ''}`),
        h('h1', {}, x.title)),
      h('div', { className: 'rc-share-bar' }, likeBtn,
        h('button', { type: 'button', onclick: e => shareKakao(e.currentTarget, share.payload, share) }, KAKAO_JS_KEY ? '카카오톡 공유' : '공유하기'),
        h('button', { type: 'button', onclick: e => copyLink(e.currentTarget, share.url) }, '링크 복사'),
        mine && h('button', { type: 'button', onclick: onEdit }, '수정'),
        mine && h('button', { type: 'button', className: 'danger', onclick: async () => { if (await del(path, '이 글을 지울까요? 추천 · 댓글도 같이 지워져요')) location.href = listUrl } }, '삭제'))),
    ...body,
    h('section', { className: 'card' },
      h('h3', {}, `댓글 ${comments.length}`),
      h('ul', { className: 'pt-comments' }, comments.map(c => h('li', {},
        h('div', {}, h('b', {}, c.author), h('small', { className: 'rc-muted' }, ` ${ago(c.createdAt)}`),
          auth === 'in' && me.id === c.authorId && h('button', { type: 'button', className: 'pt-cdel', onclick: async () => { if (await del(`${path}/comments/${c.id}`, '댓글을 지울까요?')) reload() } }, '삭제')),
        h('p', {}, c.body)))),
      form),
  ]
}

/** 글 하나 읽어 보여 주기. 404 는 "없는 글" 로. 로그인 상태가 바뀌면 다시 부른다(내 글 버튼 · 추천 여부) */
let showSeq = 0
export async function showItem(path, render) {
  const my = ++showSeq, err = $('#item-error'), box = $('#item-body')
  $('#item-view').hidden = false
  await authFirst
  let r
  try { r = await api(path, { withToken: auth === 'in' }) }
  catch (e) {
    if (my !== showSeq) return
    err.textContent = e.status === 404 ? '없는 글이에요 — 지워졌을 수 있어요' : e.message
    err.hidden = false
    box.replaceChildren()
    return
  }
  if (my !== showSeq) return
  err.hidden = true
  box.replaceChildren(...render(r))
}
