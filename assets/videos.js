// 영상 — 유튜브 링크 게시판: 목록(분류 · 추천순/최신순 · 포지션 · 캐릭터 필터) · 글(영상 · 추천 · 댓글) · 올리기 · 고치기. 게시판 공용 부분은 board.js
import { mountTop, loadKakao, faceOf } from './app.js?v=3de4668d'
import { api } from './auth.js?v=5d44380b'
import { $, h, P, loadData, startAuth, loggedIn, charGrid, listView, card, itemView, showItem } from './board.js?v=a9bf1646'

let cfg, catName   // data/videos.json · 분류 id → 이름
// 서버(server/index.mjs 의 YOUTUBE)와 같은 규칙 — 여기서는 미리보기 · 제목 채우기용이고, 최종 확인은 서버가 한다
const YOUTUBE = /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/
const thumb = (id, size = 'mqdefault') => `https://i.ytimg.com/vi/${id}/${size}.jpg`   // mq 320×180 · hq 480×360
const videoUrl = v => `${location.origin}/videos/?v=${v.id}`
const catTag = id => h('span', { className: `vd-cat is-${id}` }, catName.get(id) || id)

// ---------------------------------------------------------------- 목록

let cat = new URLSearchParams(location.search).get('cat') || ''   // 홈의 "최신 강의 더 보기" 가 ?cat=lecture 로 온다

function showList() {
  $('#list-view').hidden = false
  $('#new').onclick = async () => { if (await loggedIn()) openForm() }
  const reload = listView({
    load: async qs => (await api(`/videos?${qs}`)).videos,
    card: v => card(`?v=${v.id}`, v,
      h('div', { className: 'vd-thumb' }, h('img', { src: thumb(v.youtube), alt: '', loading: 'lazy' }), catTag(v.category))),
    empty: who => `아직 ${who}${cat ? `${catName.get(cat)} ` : ''}영상이 없어요. 첫 영상을 올려 보세요!`,
    extra: () => cat ? { cat } : {},
  })
  const tabs = [['', '전체'], ...cfg.categories.map(c => [c.id, c.name])].map(([id, name]) => h('button', {
    type: 'button', onclick: () => { cat = id; paint(); reload() },
  }, name))
  const paint = () => tabs.forEach((b, i) => b.setAttribute('aria-pressed', (i ? cfg.categories[i - 1].id : '') === cat))
  paint()
  $('#filter-cats').append(...tabs)
}

// ---------------------------------------------------------------- 카카오톡 공유

/** 피드 카드: 유튜브 썸네일 + 제목 + 분류 · 나온 캐릭터 */
function kakaoPayload(v) {
  const url = videoUrl(v), link = { mobileWebUrl: url, webUrl: url }
  const who = v.chars.map(id => P(id).name).join(' · ')
  return {
    objectType: 'feed',
    content: {
      title: `🎬 ${v.title}`,
      description: [catName.get(v.category), who, `${v.author} 님이 올림`].filter(Boolean).join(' · '),
      imageUrl: thumb(v.youtube, 'hqdefault'), imageWidth: 480, imageHeight: 360, link,
    },
    buttons: [{ title: '영상 보기', link }],
  }
}

// ---------------------------------------------------------------- 글

let view = 'list', videoId

const showVideo = () => showItem(`/videos/${videoId}`, ({ video: v, liked, comments, prev, next }) => {
  document.title = `${v.title} · 영상 · NBA덩크시티-TNAB`
  return itemView({
    path: `/videos/${v.id}`, item: v, liked, comments, listUrl: '/videos/', reload: showVideo, onEdit: () => openForm(v),
    share: { payload: () => kakaoPayload(v), title: `${v.title} · 영상`, url: videoUrl(v) },
    body: [
      h('div', { className: 'vd-player' }, h('iframe', {
        src: `https://www.youtube-nocookie.com/embed/${v.youtube}`, title: v.title, loading: 'lazy', allowFullscreen: true,
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
        referrerPolicy: 'strict-origin-when-cross-origin',
      })),
      // 이전 = 바로 전에 올라온 영상, 다음 = 바로 뒤에 올라온 영상
      h('nav', { className: 'vd-nav', 'aria-label': '이전 · 다음 영상' },
        [[prev, '← 이전 영상', 'is-prev'], [next, '다음 영상 →', 'is-next']].map(([n, label, cls]) => n
          ? h('a', { className: cls, href: `?v=${n.id}` }, h('small', {}, label), h('b', {}, n.title))
          : h('span', { className: `${cls} is-none` }, h('small', {}, label), h('b', {}, n === null ? '없어요' : '')))),
      h('section', { className: 'card' },
        h('p', { className: 'vd-meta' }, catTag(v.category),
          h('a', { href: `https://www.youtube.com/watch?v=${v.youtube}`, target: '_blank', rel: 'noopener' }, '유튜브에서 보기 ↗')),
        v.chars.length > 0 && h('div', { className: 'pt-charnames' }, v.chars.map(id => h('span', {}, h('img', { src: faceOf(P(id)), alt: '' }), P(id).name))),
        v.body && h('p', { className: 'pt-body' }, v.body)),
    ],
  })
})

// ---------------------------------------------------------------- 올리기 · 고치기

let editing = null   // 고치는 글(없으면 새 글)
const form = () => $('#video-form')

function openForm(v = null) {
  editing = v
  const f = form(), el = f.elements, chars = new Set(v?.chars || [])
  $('#form-title').textContent = v ? '영상 수정' : '영상 올리기'
  el.url.value = v ? `https://youtu.be/${v.youtube}` : ''
  el.title.value = v?.title || ''
  el.body.value = v?.body || ''
  $('.rc-form-err', f).hidden = true
  $('#form-cats').replaceChildren(...cfg.categories.map(c => h('label', {},
    h('input', { type: 'radio', name: 'category', value: c.id, checked: (v?.category || cfg.categories[0].id) === c.id }), h('span', {}, c.name))))
  $('#form-chars').replaceChildren(charGrid({
    isOn: id => chars.has(id),
    pick: id => { if (chars.has(id)) chars.delete(id); else if (chars.size < cfg.maxChars) chars.add(id) },
  }))
  f.chars = chars
  preview()
  $('#list-view').hidden = true
  $('#item-view').hidden = true
  $('#form-view').hidden = false
  scrollTo(0, 0)
}

/** 주소가 바뀌면 썸네일을 보여 주고, 제목이 비어 있으면 유튜브(oEmbed — CORS 허용)에서 받아 채운다 */
let oembedSeq = 0
async function preview() {
  const el = form().elements, box = $('#form-preview'), id = YOUTUBE.exec(el.url.value.trim())?.[1]
  box.hidden = !id
  if (!id) return box.replaceChildren()
  box.replaceChildren(h('img', { src: thumb(id), alt: '' }))
  if (el.title.value.trim()) return
  const my = ++oembedSeq
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`)
    const j = r.ok ? await r.json() : null
    if (my === oembedSeq && j?.title && !el.title.value.trim()) el.title.value = [...j.title].slice(0, 60).join('')
    if (my === oembedSeq && !r.ok) box.append(h('small', { className: 'rc-err' }, '영상을 찾지 못했어요 — 비공개거나 지워진 영상일 수 있어요'))
  } catch {}   // 제목 채우기는 편의일 뿐 — 실패하면 직접 쓰면 된다
}

function closeForm() {
  $('#form-view').hidden = true
  $(view === 'video' ? '#item-view' : '#list-view').hidden = false
}

function bindForm() {
  const f = form(), el = f.elements
  el.url.addEventListener('input', preview)
  $('#form-cancel').onclick = closeForm
  f.onsubmit = async e => {
    e.preventDefault()
    const btn = $('[type=submit]', f), err = $('.rc-form-err', f)
    const v = { url: el.url.value, title: el.title.value, category: el.category.value, chars: [...f.chars], body: el.body.value }
    const bad = !YOUTUBE.test(v.url.trim()) ? '유튜브 영상 주소를 넣어 주세요' : !v.title.trim() ? '제목을 입력해 주세요' : ''
    err.textContent = bad
    err.hidden = !bad
    if (bad || btn.disabled) return
    btn.disabled = true
    try {
      const { video } = await api(editing ? `/videos/${editing.id}` : '/videos', { method: editing ? 'PUT' : 'POST', withToken: true, body: v })
      location.href = `/videos/?v=${video.id}`
    } catch (e) { err.textContent = e.message; err.hidden = false }
    finally { btn.disabled = false }
  }
}

// ---------------------------------------------------------------- 초기화

const boot = async () => {
  ;[, cfg] = await Promise.all([loadData(), fetch('/data/videos.json', { cache: 'no-cache' }).then(r => r.json())])
  catName = new Map(cfg.categories.map(c => [c.id, c.name]))
  if (!catName.has(cat)) cat = ''
  mountTop('/videos/')
  loadKakao()
  bindForm()
  const id = new URLSearchParams(location.search).get('v')
  if (/^\d+$/.test(id || '')) { view = 'video'; videoId = id }
  startAuth('영상을 올리거나 추천 · 댓글을 달려면 디스코드 로그인이 필요해요.', () => view === 'video' && showVideo())
  if (view === 'list') showList()
}

boot()
