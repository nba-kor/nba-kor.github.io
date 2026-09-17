// 팀원모집 — 디스코드 로그인 · 내 프로필 · 모집 목록 · 팀 만들기(방 설정) · 팀 화면(전술 애니메이션 / 로스터 / 가입 / 팀장 관리) · 카카오톡 공유
import { loadPlayers, faceOf, mountTop, POS, POS_KO } from './app.js?v=6bf8da50'
import { drawCourt, renderTokens, presetTokens, play } from './court.js?v=081a7b3e'

// ---------------------------------------------------------------- 설정

// API = Supabase Edge Function 'recruit'. GitHub Pages 는 API 를 돌릴 수 없어 운영에서는 함수 주소로 부르고,
// 그 밖(로컬 docker compose 의 nginx 가 /api/ 를 같은 함수로 넘긴다)에서는 같은 도메인의 /api
const API_ORIGIN = location.hostname === 'nba-kor.github.io' ? 'https://lgchgqxjjlapszmxarun.supabase.co/functions/v1/recruit' : ''
const KAKAO_JS_KEY = '8f89f3ef476f72827c9a875ad0c23a72'    // Kakao Developers > 앱 > 플랫폼 키 > JavaScript 키. 비우면 공유 버튼이 링크 복사로 대체된다.
// 카카오 카드의 '디스코드' 버튼이 여는 #매칭-현황 채널. TNAB 봇이 현황판을 올리는 채널과 같아야 한다(봇 .env 의 DISCORD_GUILD_ID · MATCH_DASHBOARD_CHANNEL_ID).
// 이 주소도 카카오 '제품 링크 관리 > 웹 도메인' 에 https://discord.com 이 등록돼 있어야 열린다 — 없으면 카카오가 앱 기본 도메인으로 바꿔 버린다
const DISCORD_URL = 'https://discord.com/channels/1548921970974920764/1549349444045246586'
// 디스코드 로그인 = Supabase Auth. publishable key 는 브라우저에 두라고 만든 공개 키다(표는 RLS 로 막혀 있어 이 키로는 아무것도 못 읽는다)
const SUPABASE_URL = 'https://lgchgqxjjlapszmxarun.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NlTRTkRjbTv0iCHhNB8pZA_2Ov5In9Z'
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'   // 버전 고정. 동적 import 라 CDN 이 죽어도 목록·팀 화면은 뜬다

const PRESETS_KEY = 'dc.recruit.presets' // [{ name, entries }] — 자주 쓰는 캐릭터 구성, 최대 cfg.maxPresets 개
const LEFT_KEY = 'dc.recruit.left'       // 팀을 만들고 팀 화면으로 넘어갈 때 "기존 파티에서 빠졌어요" 를 들고 간다 (sessionStorage)
const MOVE_ASK = '기존 파티에서 빠지고 이동할까요? (팀장이면 기존 파티는 해제돼요)'
const NO_SERVER = '모집 서버에 연결할 수 없어요'
const STATUS = { open: '모집 중', full: '모집 완료' }
const LINK_RE = /:\/\/|www\.|discord\.gg/i   // 서버와 같은 규칙 — 이름에 링크 금지

const $ = (s, root = document) => root.querySelector(s)
/** DOM 생성. 문자열 자식은 텍스트 노드가 되므로 사용자 입력을 그대로 넣어도 안전하다. */
const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) k in n ? n[k] = v : n.setAttribute(k, v)
  n.append(...kids.flat().filter(k => k != null && k !== false))
  return n
}
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d } catch { return d } }
const saveJson = (k, v) => localStorage.setItem(k, JSON.stringify(v))
const getJson = p => fetch(p, { cache: 'no-cache' }).then(r => r.json())
const ago = ms => {
  const m = Math.floor((Date.now() - ms) / 60000)
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : `${Math.floor(m / 60)}시간 전`
}
/** "2시간 41분 남음" — 분을 올림해서 막 만든 방이 "3시간 남음" 으로 보이게 한다 */
const remain = at => {
  const m = Math.ceil((at - Date.now()) / 60000)
  return m <= 0 ? '곧 삭제돼요' : `${m >= 60 ? `${Math.floor(m / 60)}시간 ` : ''}${m % 60 ? `${m % 60}분 ` : ''}남음`
}

let data, cfg, tactics, kr, errSeq = 0

/** 데이터에서 빠진 캐릭터여도 화면이 깨지지 않게 이니셜 아바타로 버틴다. */
const P = id => data.byId.get(id) || { id, name: id, short: id, pos: 0 }
const presetOf = id => tactics.presets.find(p => p.id === id)
const charLine = e => { const p = P(e.char); return `${POS[p.pos] || '?'} · ${p.name}` }
const titleOf = t => t.room.title || t.tactic.name || '전술 자유'
const goneMsg = () => '없는 팀이에요 — 해제됐거나 시간이 다 돼 삭제됐어요'   // 연장한 팀은 3시간보다 오래 산다
const MIC_TAG = { required: '마이크 필수', listen: '듣코가능', off: '마이크 필요없음' }
const roomBadges = room => [
  h('span', { className: `rc-tag mic-${room.mic}` }, MIC_TAG[room.mic] || room.mic),
  h('span', { className: `rc-tag is-${room.mode}` }, cfg.modes[room.mode] || room.mode),
]

/** withToken = 로그인 토큰을 붙인다. 공개 GET 에는 붙이지 않는다 — Authorization 헤더가 붙으면 preflight 로 함수 호출이 두 배가 된다 */
async function api(path, { method = 'GET', body, withToken } = {}) {
  let r
  const token = withToken && (await sb?.auth.getSession())?.data.session?.access_token   // getSession 이 만료된 토큰을 갱신해 준다
  try {
    r = await fetch(`${API_ORIGIN}/api${path}`, {
      method, cache: 'no-store',
      headers: { ...(body && { 'content-type': 'application/json' }), ...(token && { authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body),
    })
  } catch { throw new Error(NO_SERVER) }
  const j = await r.json().catch(() => null)
  // 정적 호스팅이 대신 답한 404·502 HTML 등은 서버가 없는 것으로 본다
  if (!j) throw new Error(NO_SERVER)
  if (!r.ok) throw Object.assign(new Error(j.error || NO_SERVER), { status: r.status })   // 404 = 해제·만료로 사라진 팀
  return j
}

/** 제출 중에는 버튼을 잠그고, 실패하면 폼은 그대로 둔 채 메시지만 띄운다. */
async function submit(form, call) {
  const btn = $('[type=submit]', form), err = $('.rc-form-err', form), label = btn.textContent
  if (btn.disabled) return null
  btn.disabled = true
  btn.textContent = '보내는 중…'
  err.hidden = true
  try { return await call() }
  catch (e) { err.textContent = e.message; err.hidden = false; return null }
  finally { btn.disabled = false; btn.textContent = label }
}

const leftMsg = left => left && (left.disbanded ? '기존 파티를 해제하고 옮겼어요' : '기존 파티에서 빠지고 옮겼어요')

// ---------------------------------------------------------------- 로그인 (Supabase Auth · Discord)

let sb = null         // supabase 클라이언트 — 못 불러오면 null 로 남고 로그인만 안 된다
let auth = 'loading'  // loading · down(SDK 못 불러옴) · out · in · error(로그인은 됐는데 /api/me 실패)
let me = null         // auth === 'in' 이면 GET /api/me — { user: { id, name }, profile, teamId }
let meSeq = 0, uid
const meSubs = []     // me 가 바뀌면 부를 화면 갱신
let meReady
const meFirst = new Promise(r => { meReady = r })

function setAuth(state, v = null) {
  auth = state
  me = v
  meReady()
  renderAuth()
  for (const f of meSubs) f()
}

async function loadMe() {
  const seq = ++meSeq
  const session = sb && (await sb.auth.getSession()).data.session
  if (seq !== meSeq) return
  if (!session) return setAuth(sb ? 'out' : 'down')
  try {
    const v = await api('/me', { withToken: true })
    if (seq === meSeq) setAuth('in', v)
  } catch (e) {
    if (seq === meSeq) setAuth(e.status === 401 ? 'out' : 'error')   // 401 = 토큰이 무효 — 다시 로그인하면 된다
  }
}

async function initAuth() {
  try {
    const { createClient } = await import(SUPABASE_JS)
    sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { flowType: 'pkce' } })
  } catch (e) {
    console.warn('로그인 모듈을 불러오지 못했어요', e)
    return setAuth('down')
  }
  // 로그인을 취소하면 ?error=... 가 남는다 — 다음 로그인의 redirectTo 에 딸려 가지 않게 걷는다 (?code 는 SDK 가 걷는다)
  const url = new URL(location.href)
  const failed = url.searchParams.has('error'), wantLogin = url.searchParams.has('login')
  if (failed || wantLogin) {
    for (const k of ['error', 'error_code', 'error_description', 'login']) url.searchParams.delete(k)
    history.replaceState(history.state, '', url)
  }
  // 승인 화면을 건너뛰려다(prompt=none) 실패했으면 — 디스코드 쪽 승인이 풀렸거나 로그인이 끊긴 것 — 한 번만 승인 화면으로 다시 간다
  const quietFailed = failed && store.get(QUIET_TRY)
  store.del(QUIET_TRY)
  if (quietFailed) { store.del(AUTHORIZED); return login() }
  sb.auth.onAuthStateChange((event, session) => {
    if (session) store.set(AUTHORIZED, '1')   // 세션이 있다 = 이 브라우저에서 디스코드 승인을 끝냈다
    const id = session?.user?.id
    if (event !== 'INITIAL_SESSION' && id === uid) return   // 토큰 갱신 · 탭 복귀 때마다 /api/me 를 다시 읽지 않는다
    uid = id
    setTimeout(loadMe)   // 콜백 안에서 SDK 를 다시 부르면 잠금에 걸린다 — 한 박자 미룬다
  })
  // 카카오톡에서 "로그인"을 눌러 바깥 브라우저로 넘어온 경우(?login=1) — 로그인이 안 돼 있으면 바로 이어서 로그인한다
  if (wantLogin && !(await sb.auth.getSession()).data.session) login()
}

// 이 브라우저에서 디스코드 승인을 끝낸 적이 있으면 다음부터 승인 화면을 건너뛴다(디스코드 prompt=none — Supabase 가 그대로 넘긴다)
const AUTHORIZED = 'dc.recruit.discordAuthorized', QUIET_TRY = 'dc.recruit.quietLogin'
const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch {} },
  del: k => { try { localStorage.removeItem(k) } catch {} },
}
const UA = navigator.userAgent
const IN_KAKAO = /KAKAOTALK/i.test(UA)
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(UA)

function login() {
  if (!sb) return
  // 카카오톡 인앱 브라우저에는 디스코드 로그인이 안 돼 있어 아이디 · 비밀번호를 매번 쳐야 한다 — 평소 쓰는 브라우저로 넘겨 거기서 로그인한다
  if (IN_KAKAO) {
    const next = new URL(location.href)
    next.searchParams.set('login', '1')
    location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(next)}`
    // 카톡 버전에 따라 바깥 브라우저가 안 열리면 화면이 그대로 보인다 — 그때는 여기서 로그인한다
    setTimeout(() => { if (document.visibilityState === 'visible') oauth() }, 1500)
    return
  }
  return oauth()
}

function oauth() {
  const quiet = store.get(AUTHORIZED) === '1'
  if (quiet) store.set(QUIET_TRY, '1')
  return sb.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: `${location.origin}/recruit/${location.search}`, ...(quiet && { queryParams: { prompt: 'none' } }) },
  })
}

// 로그아웃하면 다음 로그인은 승인 화면부터 — 다른 디스코드 계정으로 바꾸려는 경우일 수 있다
const logout = () => { store.del(AUTHORIZED); return sb.auth.signOut() }

function renderAuth() {
  const btn = (label, onclick, props = {}) => h('button', { type: 'button', onclick, ...props }, label)
  $('#auth').replaceChildren(...{
    loading: [h('span', { className: 'rc-muted' }, '로그인 확인 중…')],
    down: [h('span', { className: 'rc-muted', title: '로그인 모듈을 불러오지 못했어요. 새로고침해 보세요' }, '로그인 불가')],
    out: [btn('디스코드 로그인', login, { className: 'rc-login' })],
    error: [h('span', { className: 'rc-muted rc-bad' }, '로그인 확인 실패'), btn('다시 시도', loadMe)],
    in: me && [h('b', { className: 'rc-uname', title: '디스코드 계정' }, me.user.name), btn('내 프로필', () => openProfile()), btn('로그아웃', logout)],
  }[auth])
  const need = $('#need')
  need.textContent = auth === 'down' ? '로그인을 불러오지 못해 지금은 팀을 만들거나 가입할 수 없어요. 새로고침해 보세요.'
    : auth !== 'out' ? ''
    : `팀을 만들거나 가입하려면 디스코드 로그인이 필요해요. ${IN_KAKAO ? '로그인을 누르면 평소 쓰는 브라우저로 열려요(카카오톡 안에서는 매번 비밀번호를 쳐야 해서요).'
      : IS_MOBILE ? '' : 'PC에서는 디스코드 로그인 화면의 QR 코드를 휴대폰 디스코드 앱으로 찍으면 비밀번호 없이 로그인돼요.'}`.trim()
  need.hidden = !need.textContent
  $('#new-team').disabled = auth === 'down'
}

/**
 * 만들기 · 가입 직전 확인. 로그인과 프로필이 준비됐으면 최신 me, 아니면 로그인으로 보내거나(리다이렉트) 프로필 폼을 열고 null.
 * 1인 1파티 확인창이 틀리지 않게 me(teamId) 는 매번 다시 읽는다.
 */
async function ready(again, why) {
  await meFirst
  if (auth === 'down') return null
  if (auth === 'out') { await login(); return null }
  await loadMe()
  if (auth === 'out') { await login(); return null }
  if (auth !== 'in') throw new Error('로그인 정보를 확인하지 못했어요 — 잠시 뒤 다시 눌러 주세요')
  if (!me.profile) { openProfile(again, why); return null }
  return me
}

/** 팀장 정보 · 가입 폼에 들어가는 "내 프로필" 요약 */
function meCard() {
  const box = h('div', { className: 'rc-mecard' })
  const act = (label, onclick) => h('button', { type: 'button', onclick }, label)
  if (auth === 'loading') box.append(h('p', { className: 'rc-muted' }, '로그인 확인 중…'))
  else if (auth === 'down') box.append(h('p', { className: 'rc-muted' }, '로그인을 불러오지 못해 지금은 쓸 수 없어요.'))
  else if (auth === 'out') box.append(h('p', { className: 'rc-muted' }, '디스코드로 로그인하면 내 프로필로 바로 만들고 가입해요.'), act('디스코드 로그인', login))
  else if (auth === 'error') box.append(h('p', { className: 'rc-muted rc-bad' }, '로그인 정보를 확인하지 못했어요.'), act('다시 시도', loadMe))
  else if (!me.profile) box.append(h('p', { className: 'rc-muted' }, h('b', {}, me.user.name), ' 님, 게임 계정과 마이크를 적은 프로필을 먼저 등록해 주세요.'), act('프로필 등록', () => openProfile()))
  else {
    const e = me.profile.entries[0], p = P(e.char), n = me.profile.entries.length - 1
    box.append(h('img', { src: faceOf(p), alt: '' }),
      h('div', {},
        h('div', { className: 'rc-acct-name' }, h('b', {}, me.user.name), micTag(me.profile.mic)),
        h('small', {}, `${e.nick} · ${e.tier} · ${charLine(e)}${n ? ` 외 ${n}개` : ''}`)),
      act('프로필 수정', () => openProfile()))
  }
  return box
}
const micTag = on => h('span', { className: `rc-tag ${on ? 'mic-on' : 'mic-no'}` }, on ? '마이크 O' : '마이크 X')
const renderMeCards = () => { for (const s of document.querySelectorAll('[data-mecard]')) s.replaceChildren(meCard()) }

// ---------------------------------------------------------------- 코트 (보기 전용)

function viewer(svg) {
  let tokens = [], busy = false
  const redraw = () => renderTokens(svg, tokens, data.byId)
  drawCourt(svg)
  return {
    show(t) { tokens = t; redraw() },
    // 재생은 토큰 좌표를 직접 바꾸므로 겹쳐 돌리지 않는다
    async play() {
      const run = !busy && play(svg, tokens, redraw)
      if (!run) return
      busy = true
      await run
      busy = false
    },
  }
}

const tacticDesc = (preset, board) => {
  const pr = presetOf(preset)
  if (!board) return pr?.desc || ''
  return `전술판에서 직접 짠 전술${pr ? `\n기반 전술 · ${pr.name} — ${pr.desc}` : ''}`
}

// ---------------------------------------------------------------- 캐릭터 선택 모달

let filterPos   // 모달 위 포지션 뱃지 — 0 = 전체

function buildPicker() {
  const dlg = $('#char-dialog')
  const secs = [1, 2, 3, 4, 5].map(pos => h('section', { 'data-pos': pos },
    h('h3', {}, h('span', { className: `rc-pos pos-${pos}` }, POS[pos]), POS_KO[pos]),
    h('div', { className: 'rc-char-grid' }, kr.filter(p => p.pos === pos).map(p =>
      h('button', { className: 'rc-char', value: p.id, title: p.name },
        h('img', { src: faceOf(p), alt: '', loading: 'lazy' }), h('span', {}, p.short || p.name))))))
  $('.rc-chars', dlg).append(...secs)
  // form method=dialog 안이라 type=button 이 없으면 누르는 순간 모달이 닫힌다
  const btns = [0, 1, 2, 3, 4, 5].map(pos => h('button', { type: 'button', className: 'rc-fbtn', 'data-pos': pos }, pos ? POS[pos] : '전체'))
  filterPos = pos => {
    for (const b of btns) b.setAttribute('aria-pressed', +b.dataset.pos === pos)
    for (const s of secs) s.hidden = pos > 0 && +s.dataset.pos !== pos
    dlg.scrollTop = 0
  }
  for (const b of btns) b.onclick = () => filterPos(+b.dataset.pos)
  $('.rc-filter', dlg).append(...btns)
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close() })   // 바깥(backdrop) 누르면 닫기
}

/** 고른 캐릭터 id, 취소하면 ''. taken = 같은 계정의 다른 줄에서 이미 고른 캐릭터. */
function pickChar(taken, current) {
  const dlg = $('#char-dialog')
  for (const b of dlg.querySelectorAll('.rc-char')) {
    b.disabled = taken.has(b.value)
    b.classList.toggle('cur', b.value === current)
  }
  dlg.returnValue = ''
  dlg.showModal()
  filterPos(0)
  return new Promise(res => dlg.addEventListener('close', () => res(dlg.returnValue), { once: true }))
}

// ---------------------------------------------------------------- 내 프로필 폼

const nameErr = (s, max, empty, what = '이름') => !s ? empty : [...s].length > max ? `${max}자 이내로 입력하세요` : LINK_RE.test(s) ? `${what}에 링크는 넣을 수 없어요` : ''

/** 칸에 오류를 붙이고 bad 에 모은다. 같은 <label> 안의 메시지는 이름으로 이미 읽힌다 — 밖에 있는 메시지만 이어 준다 */
function flagErr(bad, ctl, box, msg) {
  ctl.setAttribute('aria-invalid', 'true')
  if (!box.closest('label')?.contains(ctl)) ctl.setAttribute('aria-describedby', box.id ||= `rc-err-${++errSeq}`)
  box.textContent = [box.textContent, msg].filter(Boolean).join(' · ')
  box.hidden = false
  bad.push(ctl)
}
function unflag(root) {
  for (const e of root.querySelectorAll('.rc-err')) { e.textContent = ''; e.hidden = true }
  for (const c of root.querySelectorAll('[aria-invalid]')) { c.removeAttribute('aria-invalid'); c.removeAttribute('aria-describedby') }
}

/** 프리셋 · 프로필은 옛 데이터일 수 있다 — 모양이 틀리면 버리고, 사라진 캐릭터·티어는 빈칸으로 둔다 (옛 프리셋의 디스코드 닉네임은 버린다) */
function cleanPerson(v) {
  if (!Array.isArray(v?.entries) || !v.entries.length) return null
  const str = s => typeof s === 'string' ? s : ''
  return {
    entries: v.entries.slice(0, cfg.maxEntries).map(e => ({
      nick: str(e?.nick), tier: cfg.tiers.includes(e?.tier) ? e.tier : '', char: kr.some(p => p.id === e?.char) ? e.char : '',
    })),
  }
}
const loadPresets = () => {
  const v = load(PRESETS_KEY, [])
  return (Array.isArray(v) ? v : []).flatMap(p => {
    const c = typeof p?.name === 'string' && cleanPerson(p)
    return c ? [{ name: p.name, ...c }] : []
  }).slice(0, cfg.maxPresets)
}

function personForm(el) {
  const list = $('.rc-entries', el)
  $('.rc-entries-head small', el).textContent = `최대 ${cfg.maxEntries}개 · 첫 줄이 대표`

  // row: { kind: 'main'|'same'|'sub', nick, tier, char } — 'same' 줄은 대표 계정의 닉네임·티어를 따른다
  let rows = [{ kind: 'main', nick: '', tier: '', char: '' }]
  /** cleanPerson 을 거친 { entries } 로 폼을 채운다 (내 프로필 · 프리셋) */
  function fill(v) {
    unflag(list)
    rows = v.entries.map((e, i) => ({ kind: !i ? 'main' : e.nick === v.entries[0].nick ? 'same' : 'sub', ...e }))
    render()
  }
  const main = () => ({ nick: rows[0].nick.trim(), tier: rows[0].tier })
  const acct = r => r.kind === 'sub' ? { nick: r.nick.trim(), tier: r.tier } : main()
  const taken = i => new Set(rows.filter((r, j) => j !== i && r.char && acct(r).nick === acct(rows[i]).nick).map(r => r.char))

  // 대표 계정이 바뀌면 본인계정 줄의 "↳ 닉네임 · 티어" 를 맞춘다
  function sync() {
    const m = main()
    for (const s of list.querySelectorAll('.rc-same')) s.textContent = `↳ ${m.nick || '대표 닉네임'} · ${m.tier || '티어 미선택'}`
  }

  function rowEl(r, i) {
    const p = r.char && P(r.char)
    const li = h('li', { className: `rc-entry is-${r.kind}` })
    const slotBtn = h('button', { type: 'button', className: 'rc-slot', 'aria-haspopup': 'dialog', 'aria-label': p ? `캐릭터 변경 (${p.name})` : '캐릭터 선택' },
      p ? h('img', { src: faceOf(p), alt: '' }) : h('span', { className: 'rc-hole' }),
      p ? h('span', {}, h('b', {}, p.name), h('small', {}, `${POS[p.pos] || ''} ${POS_KO[p.pos] || ''}`)) : h('span', {}, '캐릭터 선택'))
    slotBtn.onclick = async () => {
      const id = await pickChar(taken(i), r.char)
      if (!id) return slotBtn.focus()
      r.char = id
      render()
      $('.rc-slot', list.children[i]).focus()
    }
    li.append(slotBtn)

    if (r.kind === 'same') li.append(h('p', { className: 'rc-same' }))
    else {
      const nick = h('input', { type: 'text', name: 'nick', autocomplete: 'off', value: r.nick,
        placeholder: i ? '부계정 닉네임' : '게임 닉네임', 'aria-label': i ? '부계정 게임 닉네임' : '대표 게임 닉네임' })
      nick.oninput = () => { r.nick = nick.value; sync() }
      const tier = h('select', { name: 'tier', 'aria-label': '티어' },
        h('option', { value: '', disabled: true }, '티어 선택'), cfg.tiers.map(t => h('option', { value: t }, t)))
      tier.value = r.tier
      tier.onchange = () => { r.tier = tier.value; sync() }
      li.append(nick, tier)
    }

    li.append(i
      ? h('button', { type: 'button', className: 'rc-x', 'aria-label': '이 줄 삭제', onclick: () => { rows.splice(i, 1); render() } }, '✕')
      : h('span', { className: 'rc-main', title: '대표 계정 · 대표 캐릭터' }, '대표'),
    h('small', { className: 'rc-err', hidden: true }))
    return li
  }

  function render() {
    list.replaceChildren(...rows.map(rowEl))
    for (const b of el.querySelectorAll('[data-add]')) b.disabled = rows.length >= cfg.maxEntries
    sync()
  }

  for (const b of el.querySelectorAll('[data-add]')) b.onclick = () => {
    if (rows.length >= cfg.maxEntries) return
    rows.push({ kind: b.dataset.add, nick: '', tier: '', char: '' })
    render()
    const li = list.lastElementChild
    if (b.dataset.add === 'same') $('.rc-slot', li).click()   // 본인계정은 캐릭터만 고르면 끝이라 바로 모달을 연다
    else $('[name=nick]', li).focus()
  }
  render()

  /** 검증을 통과하면 { entries }, 아니면 칸마다 메시지를 띄우고 null. focus = 첫 오류 칸으로 옮길지 */
  function read(focus = true) {
    unflag(list)
    const bad = [], flag = (...a) => flagErr(bad, ...a)
    const seen = new Set()
    rows.forEach((r, i) => {
      const li = list.children[i], box = $('.rc-err', li), a = acct(r)
      if (!r.char) flag($('.rc-slot', li), box, '캐릭터를 선택하세요')
      if (r.kind !== 'same') {
        const m = nameErr(a.nick, 20, '게임 닉네임을 입력하세요')
        if (m) flag($('[name=nick]', li), box, m)
        if (!a.tier) flag($('[name=tier]', li), box, '티어를 선택하세요')
      }
      const key = `${a.nick}\n${r.char}`
      if (r.char && seen.has(key)) flag($('.rc-slot', li), box, '같은 계정에 같은 캐릭터가 이미 있어요')
      seen.add(key)
    })
    if (bad.length) { if (focus) bad[0].focus(); return null }
    return { entries: rows.map(r => ({ ...acct(r), char: r.char })) }
  }

  // 프리셋 — 칩을 누르면 그 구성으로 채우고, ✕ 로 지운다. 저장은 검증을 통과한 구성만 (불러오면 바로 낼 수 있게)
  const chips = $('.rc-chips', el), saveBtn = $('.rc-preset-save', el)
  function presets() {
    const all = loadPresets()
    // 꽉 차서 저장 버튼이 잠긴 이유 — title 은 터치 화면에서 안 보인다
    $('.rc-presets-head small', el).textContent = all.length >= cfg.maxPresets ? `${all.length}/${cfg.maxPresets} · 하나를 지워야 저장돼요` : `${all.length}/${cfg.maxPresets}`
    chips.replaceChildren(...all.map((pr, k) => {
      const p = pr.entries[0].char && P(pr.entries[0].char)
      return h('li', { className: 'rc-chip' },
        h('button', { type: 'button', className: 'rc-chip-use', title: '이 구성으로 채우기', onclick: () => fill(pr) },
          p ? h('img', { src: faceOf(p), alt: '' }) : h('span', { className: 'rc-hole' }), h('span', {}, pr.name)),
        h('button', { type: 'button', className: 'rc-chip-x', 'aria-label': `프리셋 삭제: ${pr.name}`, onclick: () => {
          all.splice(k, 1)
          saveJson(PRESETS_KEY, all)
          presets()
          saveBtn.focus()   // 누른 칩이 사라져도 포커스가 body 로 떨어지지 않게
        } }, '✕'))
    }))
    saveBtn.disabled = all.length >= cfg.maxPresets
    saveBtn.title = saveBtn.disabled ? `프리셋은 ${cfg.maxPresets}개까지예요 — 하나를 지우고 저장하세요` : ''
  }
  saveBtn.onclick = () => {
    const v = read()
    if (!v) return
    const n = v.entries.length - 1, def = `${P(v.entries[0].char).name}${n ? ` 외 ${n}` : ''}`
    const name = prompt('프리셋 이름', def)
    if (name == null) return
    const nm = [...(name.trim() || def)].slice(0, 20).join('')
    const all = loadPresets().filter(p => p.name !== nm)   // 같은 이름이면 덮어쓴다
    if (all.length >= cfg.maxPresets) return
    saveJson(PRESETS_KEY, [...all, { name: nm, ...v }])
    presets()
  }
  presets()

  return { read, fill }
}

/** 고치면 그 칸(.rc-fld · .rc-seg)의 오류를 바로 걷는다(라디오도 input 이 온다) — 칸마다 컨트롤이 하나인 곳에만 쓴다 */
function clearOnInput(root) {
  root.addEventListener('input', e => {
    const w = e.target.closest('.rc-fld, .rc-seg'), er = w && $('.rc-err', w)
    if (!er || er.hidden) return
    er.hidden = true
    er.textContent = ''
    for (const c of w.querySelectorAll('[aria-invalid]')) { c.removeAttribute('aria-invalid'); c.removeAttribute('aria-describedby') }
  })
}

let profileAfter = null   // 프로필을 저장한 뒤 이어서 할 일 (만들기 · 가입)
let person

function profileForm() {
  const form = $('#profile-form'), sec = $('#profile')
  person = personForm($('.rc-person', form))
  clearOnInput($('.rc-seg', form))
  $('#profile-cancel').onclick = () => { sec.hidden = true; profileAfter = null }
  form.onsubmit = async e => {
    e.preventDefault()
    const box = $('.rc-seg', form), mic = $('[name=mic]:checked', form), bad = []
    unflag(box)
    if (!mic) flagErr(bad, $('[name=mic]', form), $('.rc-err', box), '마이크 사용 여부를 고르세요')
    const v = person.read(!bad.length)
    if (bad.length) bad[0].focus()
    if (bad.length || !v) return
    const res = await submit(form, async () => {
      if (auth !== 'in') throw new Error('디스코드로 로그인해 주세요')
      return api('/me/profile', { method: 'PUT', withToken: true, body: { mic: mic.value === '1', entries: v.entries } })
    })
    if (!res) return
    sec.hidden = true
    const next = profileAfter
    profileAfter = null
    setAuth('in', { ...me, profile: res.profile })
    next?.()
  }
}

/** 프로필 폼을 연다. after = 저장하면 이어서 부를 함수, why = 왜 열렸는지 한 줄 */
function openProfile(after = null, why = '') {
  if (auth !== 'in') return
  const form = $('#profile-form'), sec = $('#profile')
  profileAfter = after
  $('#profile-name').textContent = me.user.name
  $('#profile-why').textContent = why
  $('#profile-why').hidden = !why
  $('.rc-form-err', form).hidden = true
  unflag(form)
  for (const r of form.querySelectorAll('[name=mic]')) r.checked = me.profile ? r.value === (me.profile.mic ? '1' : '0') : false
  const saved = cleanPerson(me.profile)
  if (saved) person.fill(saved)
  sec.hidden = false
  sec.scrollIntoView({ block: 'start' })
  ;($('[name=mic]:checked', form) || $('[name=mic]', form)).focus({ preventScroll: true })
}

// ---------------------------------------------------------------- 모집 목록 + 팀 만들기

// 순서는 서버가 정한다 (모집 중 먼저, 각각 오래된 방부터) — 여기서 다시 정렬하지 않는다
function teamCard(t) {
  const lead = t.members[0]?.entries[0]
  const holes = Math.max(0, t.size - t.members.length)
  return h('a', { className: `rc-tcard is-${t.status}`, href: `?t=${t.id}` },
    h('div', { className: 'rc-tcard-head' },
      h('b', {}, titleOf(t)),
      h('span', { className: `rc-status is-${t.status}` }, `${STATUS[t.status]} ${t.members.length}/${t.size}`)),
    h('p', { className: 'rc-badges' }, roomBadges(t.room),
      t.room.title && h('span', { className: 'rc-tactic' }, `전술 · ${t.tactic.name || '자유'}`)),   // 제목이 없으면 제목이 곧 전술이다
    h('div', { className: 'rc-faces' },
      t.members.map(m => { const p = P(m.entries[0].char); return h('img', { src: faceOf(p), alt: p.name, title: `${m.entries[0].nick} · ${p.name}`, loading: 'lazy' }) }),
      Array.from({ length: holes }, () => h('span', { className: 'rc-hole', title: '빈 자리' }))),
    lead && h('p', {}, '팀장 ', h('b', {}, lead.nick), ` · ${lead.tier}`),
    h('p', {}, t.voice && h('span', { className: 'rc-vc', title: '음성채널' }, t.voice.name), t.voice && ' · ', remain(t.expiresAt)))
}

function showList() {
  $('#list-view').hidden = false
  const box = $('#team-list')
  let quick = true   // 잠깐 난 서버 오류는 1분을 기다리지 않고 5초 뒤 한 번만 다시 읽는다(계속 실패하면 원래 주기로)
  const refresh = async () => {
    try {
      const { teams } = await api('/teams')
      quick = true
      box.replaceChildren(...(teams.length ? teams.map(teamCard)
        : [h('p', { className: 'rc-note' }, '지금 모집 중인 팀이 없어요. 첫 팀을 만들어 보세요.')]))
    } catch (e) {
      box.replaceChildren(h('p', { className: 'rc-note rc-bad' }, e.message))
      if (quick && (!e.status || e.status >= 500)) { quick = false; setTimeout(refresh, 5000) }
    }
  }
  refresh()
  // 함수 호출은 무료 플랜 월 50만 번(오류 응답도 센다) — 목록은 1분마다, 탭이 보일 때만. 다시 보이면 바로 새로 읽는다
  setInterval(() => document.hidden || refresh(), 60000)
  document.addEventListener('visibilitychange', () => document.hidden || refresh())

  let built = false
  const sec = $('#create'), open = $('#new-team')
  meSubs.push(renderMeCards)
  open.onclick = async () => {
    if (!await ready(open.onclick, '팀을 만들기 전에 프로필을 먼저 등록해 주세요').catch(e => alert(e.message))) return
    if (!built) { createForm(); built = true }
    renderMeCards()
    sec.hidden = false
    open.hidden = true
    sec.scrollIntoView({ block: 'start' })
    $('[name=title]', sec).focus({ preventScroll: true })   // 방 설정이 폼 맨 위
  }
  $('#create-cancel').onclick = () => { sec.hidden = true; open.hidden = false; open.focus() }
}

// 전술판은 포인터가 조금만 움직여도 점을 찍어 긴 동선 하나가 서버 한도(80점)를 넘는다. 32점이면 6명 × 8동선이 꽉 차도
// 본문 한도(32KB) 안에 든다. 고르게 솎아서 처음·끝 점(화살표·스크린 방향)은 남긴다.
const PTS = 32
const thin = pts => pts?.length > PTS ? Array.from({ length: PTS }, (_, i) => pts[Math.round(i * (pts.length - 1) / (PTS - 1))]) : pts
const thinRoutes = t => Array.isArray(t?.routes) ? { ...t, routes: t.routes.map(r => ({ ...r, pts: thin(r?.pts) })) } : t

/** 방 설정 — 제목·마이크(3단계)·즐겜/빡겜·메모. read() → { room, bad } */
function roomForm() {
  const box = $('#room'), L = cfg.limits, f = n => $(`[name=${n}]`, box)
  const seg = (name, opts) => Object.entries(opts).map(([k, v]) =>
    h('label', {}, h('input', { type: 'radio', name, value: k, required: true }), h('span', {}, v)))
  $('[data-mics]', box).append(...seg('mic', cfg.mics))
  $('[data-modes]', box).append(...seg('mode', cfg.modes))
  const memo = f('memo'), count = $('.rc-count', box)
  memo.oninput = () => {
    const n = [...memo.value].length
    count.textContent = `${n}/${L.memo}`
    count.classList.toggle('rc-bad', n > L.memo)
  }
  memo.oninput()
  clearOnInput(box)

  return () => {
    unflag(box)
    const bad = [], err = ctl => $('.rc-err', ctl.closest('.rc-fld, .rc-seg'))
    const title = f('title').value.trim(), note = memo.value.trim()
    const mic = $('[name=mic]:checked', box), mode = $('[name=mode]:checked', box)
    const tErr = nameErr(title, L.title, '', '방 제목')
    if (tErr) flagErr(bad, f('title'), err(f('title')), tErr)
    if (!mic) flagErr(bad, f('mic'), err(f('mic')), '마이크 조건을 고르세요')
    if (!mode) flagErr(bad, f('mode'), err(f('mode')), '즐겜·빡겜 중 하나를 고르세요')
    // 메모만 줄바꿈을 허용한다 (탭 등 다른 제어문자는 서버가 거절)
    const mErr = /[\u0000-\u0009\u000b-\u001f\u007f]/.test(note) ? '메모에 쓸 수 없는 문자가 있어요' : nameErr(note, L.memo, '', '메모')
    if (mErr) flagErr(bad, memo, err(memo), mErr)
    return { bad, room: { title, mic: mic?.value, mode: mode?.value, memo: note } }
  }
}

function createForm() {
  const form = $('#create-form'), sel = $('#tactic'), nameIn = $('#board-name')
  const readRoom = roomForm()

  const board = load('dc.tactics', null)
  const hasBoard = Array.isArray(board?.tokens) && board.tokens.length > 0
  sel.append(h('option', { value: '' }, '전술 선택 안 함'), ...['공격', '수비'].map(tag => h('optgroup', { label: `${tag} 전술` },
    tactics.presets.filter(p => p.tag === tag).map(p => h('option', { value: p.id }, p.name)))))
  if (hasBoard) {
    sel.append(h('optgroup', { label: '내 전술판' }, h('option', { value: 'board' }, '전술판에 저장된 보드 불러오기')))
    nameIn.value = presetOf(board.presetId)?.name || '커스텀 전술'
  }

  const preview = $('#tactic-preview'), court = viewer($('svg', preview))
  $('.rc-play', preview).onclick = () => court.play()
  sel.onchange = () => {
    const v = sel.value, isBoard = v === 'board'
    $('#board-name-fld').hidden = !isBoard
    preview.hidden = !v
    $('#tactic-desc').textContent = v ? tacticDesc(isBoard ? board.presetId : v, isBoard) : '전술 없이 모여도 괜찮아요. 팀 화면에는 「전술 자유」로 표시됩니다.'
    if (v) court.show(isBoard ? structuredClone(board.tokens) : presetTokens(presetOf(v)))
  }
  sel.onchange()

  form.onsubmit = async e => {
    e.preventDefault()
    const nameBox = $('.rc-err', $('#board-name-fld'))
    nameBox.hidden = true
    nameIn.removeAttribute('aria-invalid')
    const { room, bad } = readRoom()
    const isBoard = sel.value === 'board'
    const nErr = isBoard && nameIn.value.trim() && nameErr(nameIn.value.trim(), 30, '')
    if (nErr) {
      nameBox.textContent = nErr
      nameBox.hidden = false
      nameIn.setAttribute('aria-invalid', 'true')
    }
    // 화면 위에서부터 첫 오류로 — 방 설정 → 전술 이름
    if (bad.length) bad[0].focus()
    else if (nErr) nameIn.focus()
    if (bad.length || nErr) return

    const tactic = isBoard
      ? { preset: presetOf(board.presetId) ? board.presetId : null, board: { tokens: board.tokens.map(thinRoutes) }, name: nameIn.value.trim() }
      : { preset: sel.value || null, board: null }
    const again = () => form.requestSubmit()
    const res = await submit(form, async () => {
      const cur = await ready(again, '팀을 만들기 전에 프로필을 먼저 등록해 주세요')
      if (!cur || (cur.teamId && !confirm(MOVE_ASK))) return null
      try { return await api('/teams', { method: 'POST', withToken: true, body: { room, tactic } }) }
      catch (e) { if (e.status === 428) { openProfile(again, e.message); return null } throw e }
    })
    if (!res) return
    try { if (res.left) sessionStorage.setItem(LEFT_KEY, leftMsg(res.left)) } catch {}
    location.assign(`?t=${encodeURIComponent(res.team.id)}`)
  }
}

// ---------------------------------------------------------------- 팀 화면

/** 프리셋 공격 슬롯에 팀원 대표 캐릭터를 선호 포지션 순으로 배정하고, 남은 슬롯은 남은 팀원으로 채운다. */
function teamTokens(t) {
  if (t.tactic.board) return t.tactic.board.tokens.map(k => ({ ...k, routes: k.routes || [] }))
  const pr = presetOf(t.tactic.preset)
  if (!pr) return null
  const pool = t.members.map(m => m.entries[0].char)
  const ids = pr.offense.map(s => {
    const i = pool.findIndex(c => s.pos.includes(P(c).pos))
    return i < 0 ? null : pool.splice(i, 1)[0]
  })
  return presetTokens(pr, ids.map(c => c || pool.shift() || null), [])
}

const teamUrl = t => `${location.origin}/recruit/?t=${t.id}`

/** 카카오 리스트 템플릿. 항목은 2~3개여야 하므로 빈 자리로 teamSize 를 채운다.
 *  TNAB 봇이 카톡방에 자동으로 보내는 카드와 **같은 모양이어야 한다** — 한쪽만 고치면 같은 팀이 두 가지로 보인다.
 *  봇 쪽 원본: tnab/kakao_share.py 의 build_party_share_options (제목 · 항목 · 빈 자리 문구 · 버튼 두 개) */
function kakaoPayload(t) {
  const url = teamUrl(t), link = { mobileWebUrl: url, webUrl: url }
  const img = id => `${location.origin}/assets/share/${id}.jpg`
  const lead = t.members.find(m => m.leader)
  const name = t.room.title || (lead ? `${lead.entries[0].nick} 파티` : '이름 없는 파티')
  const items = t.members.map(m => {
    const e = m.entries[0], n = m.entries.length - 1
    return {
      // 캐릭터 이름은 넣지 않는다 — 오른쪽 얼굴이 대신하고, 설명 줄은 한 줄에서 잘린다
      title: `${m.leader ? '👑 ' : ''}${e.nick}${n ? ` +${n}` : ''}`,
      description: `${POS[P(e.char).pos] || '?'} · ${e.tier} · 마이크 ${m.mic ? 'O' : 'X'}`,
      imageUrl: img(e.char), link,
    }
  })
  while (items.length < cfg.teamSize) items.push({ title: '빈 자리', description: '눌러서 합류하기', imageUrl: img('empty'), link })
  return {
    objectType: 'list',
    headerTitle: t.status === 'full' ? `✅ ${name} · 매칭 완료` : `🟢 ${name} · ${t.members.length}/${t.size} 모집 중`,
    headerLink: link,
    contents: items.slice(0, cfg.teamSize),
    buttons: [{ title: '웹사이트', link }, { title: '디스코드', link: { mobileWebUrl: DISCORD_URL, webUrl: DISCORD_URL } }],
  }
}

async function copyLink(btn, url) {
  try {
    await navigator.clipboard.writeText(url)
    const label = btn.textContent
    btn.textContent = '복사했어요'
    setTimeout(() => { btn.textContent = label }, 1600)
  } catch {
    prompt('팀 링크', url)
  }
}

/** 팀이 없어졌을 때(해제·만료) — 팀 화면을 걷고 목록으로 가는 길만 남긴다 */
function showGone(msg) {
  $('#team-body').hidden = true
  $('#team-error').hidden = true
  const box = $('#team-gone')
  $('p', box).textContent = msg
  box.hidden = false
  box.focus()   // 누른 버튼(해제 · 방출)이 #team-body 와 같이 사라진다 — 포커스가 body 로 떨어지지 않게
  document.title = '팀원모집 · NBA 덩크 시티 한국 서버'
}

async function showTeam(id) {
  $('#team-view').hidden = false
  let team, dead = false
  try {
    if (!/^[A-Za-z0-9_-]{8}$/.test(id)) throw Object.assign(new Error(), { status: 404 })
    team = await api(`/teams/${id}`)
  } catch (e) {
    if (e.status === 404) return showGone(goneMsg())
    $('#team-error').textContent = e.message
    $('#team-error').hidden = false
    // 서버나 그 DB 가 잠깐 내려간 거면(재시작 · 503) 링크로 들어온 사람이 새로고침하지 않아도 다시 붙는다. 없는 팀은 다시 안 묻는다.
    // 오류 응답도 호출 수에 세므로 팀 화면 폴링처럼 20초마다, 탭이 보일 때만
    if (!e.status || e.status >= 500) setTimeout(function retry() { document.hidden ? setTimeout(retry, 20000) : showTeam(id) }, 20000)
    return
  }
  $('#team-error').hidden = true
  $('#team-body').hidden = false
  const end = msg => { dead = true; showGone(msg) }

  const courtBox = $('#team-court'), court = viewer($('svg', courtBox))
  let courtKey = ''
  $('.rc-play', courtBox).onclick = () => court.play()
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTimeout(() => court.play(), 600)
    setInterval(() => document.hidden || dead || court.play(), 4500)
  }

  // 로그인한 내가 이 팀의 누구인지 — 디스코드 ID(문자열)로 비교한다
  const mine = () => auth === 'in' && team.members.find(m => m.userId === me.user.id) || null
  const notMine = () => { if (me?.teamId === team.id) me.teamId = null }

  // 팀원 본인의 나가기
  const leave = async (btn, m) => {
    if (!confirm('이 팀에서 나갈까요?')) return
    const msg = $('#team-msg')
    msg.hidden = true
    btn.disabled = true
    try {
      const res = await api(`/teams/${team.id}/members/${m.userId}`, { method: 'DELETE', withToken: true })
      notMine()
      if (!res.team) return end(goneMsg())
      team = res.team
      render()
    } catch (e) {
      if (e.status === 404) return end(goneMsg())
      msg.textContent = e.message
      msg.hidden = false
      btn.disabled = false
    }
  }

  function roster(mm) {
    const items = team.members.map(m => {
      const self = mm === m
      const head = h('div', { className: 'rc-mhead' },
        m.leader && h('span', { className: 'rc-badge' }, '팀장'),
        self && h('span', { className: 'rc-badge me' }, '나'),
        h('b', { title: '디스코드 이름' }, m.name), micTag(m.mic))
      if (self && !m.leader) head.append(h('button', { type: 'button', className: 'danger', onclick: e => leave(e.currentTarget, m) }, '나가기'))
      return h('li', { className: `rc-member${self ? ' is-me' : ''}` }, head,
        h('ul', { className: 'rc-accts' }, m.entries.map((e, i) => {
          const p = P(e.char)
          return h('li', { className: 'rc-acct' },
            h('img', { src: faceOf(p), alt: '' }),
            h('div', {},
              h('div', { className: 'rc-acct-name' }, h('b', {}, e.nick), h('span', { className: 'rc-tier', 'data-tier': e.tier }, e.tier),
                !i && m.entries.length > 1 && h('span', { className: 'rc-main' }, '대표')),
              h('small', {}, h('span', { className: `rc-pos pos-${p.pos}` }, POS[p.pos] || '?'), p.name)))
        })))
    })
    for (let i = team.members.length; i < team.size; i++) items.push(h('li', { className: 'rc-member rc-empty' }, h('span', { className: 'rc-hole' }), '빈 자리'))
    $('#team-roster').replaceChildren(...items)
  }

  // ---- 팀장 관리: 로그인한 팀장에게만 (연장 · 팀 해제 · 방출)
  const box = $('#manage'), mErr = $('#manage-err')
  $('[data-ttl]', box).textContent = cfg.ttlHours

  function manage(mm) {
    box.hidden = !mm?.leader
    if (box.hidden) return
    $('#kicks').replaceChildren(...team.members.filter(m => !m.leader).map(m => {
      const p = P(m.entries[0].char)
      return h('li', {}, h('img', { src: faceOf(p), alt: '' }), h('b', {}, m.name),
        h('button', { type: 'button', className: 'danger', 'aria-label': `${m.name} 방출`, onclick: e => kick(e.currentTarget, m) }, '방출'))
    }))
  }

  /** 팀장 권한 요청 — 오류(403 · 429 포함)는 관리 칸 안에 띄운다. 성공하면 응답, 아니면 null */
  async function asLeader(btn, ask, path, method) {
    if (ask && !confirm(ask)) return null
    mErr.hidden = true
    $('#manage-ok').hidden = true
    btn.disabled = true
    try {
      return await api(path, { method, withToken: true })
    } catch (e) {
      // 404 는 팀이 없거나(해제 · 만료) 방출할 팀원이 이미 나갔거나다 — 팀을 다시 읽어 없을 때만 끝낸다
      if (e.status === 404) { await refresh(); if (dead) return null }
      mErr.textContent = e.message
      mErr.hidden = false
      return null
    } finally {
      btn.disabled = false
    }
  }
  async function kick(btn, m) {
    const res = await asLeader(btn, `${m.name} 님을 방출할까요?`, `/teams/${team.id}/members/${m.userId}`, 'DELETE')
    if (!res) return
    if (!res.team) { notMine(); return end('팀을 해제했어요.') }
    team = res.team
    render()
  }
  $('#extend').onclick = async e => {
    const res = await asLeader(e.currentTarget, null, `/teams/${team.id}/extend`, 'POST')
    if (!res) return
    team = res.team
    render()
    // 남은 시간은 화면 맨 위라 여기서 안 보인다. '3시간 남음'을 박아 두면 시간이 흘러 틀려지니 삭제 시각으로 적는다
    $('#manage-ok').textContent = `연장했어요 · ${new Date(team.expiresAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}에 삭제돼요`
    $('#manage-ok').hidden = false
  }
  $('#disband').onclick = async e => {
    if (await asLeader(e.currentTarget, '팀을 해제할까요? 팀이 바로 삭제되고 되돌릴 수 없어요.', `/teams/${team.id}`, 'DELETE')) { notMine(); end('팀을 해제했어요.') }
  }

  const tick = () => {
    const ms = team.expiresAt - Date.now()
    $('#team-left').textContent = remain(team.expiresAt)
    $('#team-left').classList.toggle('is-soon', ms < 30 * 60000)   // 30분 안 남으면 연장하라고 눈에 띄게
  }

  function render() {
    if (dead) return
    const mm = mine(), name = titleOf(team)
    document.title = `${name} · 팀원모집 · NBA 덩크 시티 한국 서버`
    $('#team-title').textContent = name
    $('#team-status').textContent = `${STATUS[team.status]} ${team.members.length}/${team.size}`
    $('#team-status').className = `rc-status is-${team.status}`
    $('#team-meta').textContent = `${ago(team.createdAt)} 시작`
    tick()
    $('#team-badges').replaceChildren(...roomBadges(team.room))
    $('#team-memo').textContent = team.room.memo
    $('#team-memo').hidden = !team.room.memo

    $('#team-tactic').textContent = team.tactic.name || '전술 자유'
    $('#team-desc').textContent = tacticDesc(team.tactic.preset, !!team.tactic.board) || '정해진 전술 없이 자유롭게 합을 맞추는 팀이에요.'
    const tokens = teamTokens(team)
    courtBox.hidden = !tokens
    const key = JSON.stringify(tokens?.map(t => t.playerId))
    if (tokens && key !== courtKey) { courtKey = key; court.show(tokens) }   // 팀원이 바뀔 때만 다시 그려 재생을 끊지 않는다

    roster(mm)
    manage(mm)

    const v = team.voice
    $('#team-voice').replaceChildren(v
      ? h('div', { className: 'rc-voice-row' }, h('b', { className: 'rc-vc' }, v.name),
        /^https:\/\/discord\.com\//.test(v.url) && h('a', { className: 'rc-discord', href: v.url, target: '_blank', rel: 'noopener' }, '디스코드에서 열기'))
      : h('p', { className: 'rc-muted' }, '배정된 음성채널이 없어요 — 디스코드에서 자유롭게 모여주세요.'))

    const cta = team.status === 'open' && !!mm?.leader
    $('#lead-cta').hidden = !cta
    $('#share-bar').hidden = cta

    $('#join').hidden = !(team.status === 'open' && !mm)
    renderMeCards()
    $('#join-closed').hidden = !(!mm && team.status === 'full')
    $('#join-closed').textContent = '팀이 다 찼어요. 누가 나가면 다시 모집해요 — 모집 목록에서 다른 팀도 찾아보세요.'
  }

  const refresh = async () => {
    if (dead) return
    try { team = await api(`/teams/${team.id}`); render() }
    catch (e) { if (e.status === 404) end(goneMsg()) }   // 그새 해제·만료됐다. 다른 실패는 다음 주기에 다시
  }

  for (const b of document.querySelectorAll('[data-share=kakao]')) {
    b.textContent ||= KAKAO_JS_KEY ? '카카오톡 공유' : '공유하기'
    // sendDefault 는 클릭 핸들러 안에서 동기로 불러야 PC 팝업이 차단되지 않는다 — 앞에 await 를 두지 말 것
    b.onclick = () => {
      if (window.Kakao?.isInitialized?.()) {
        try { return Kakao.Share.sendDefault(kakaoPayload(team)) } catch (e) { console.warn(e) }
      }
      if (navigator.share) return navigator.share({ title: `${titleOf(team)} · 팀원모집`, url: teamUrl(team) }).catch(() => {})
      copyLink(b, teamUrl(team))
    }
  }
  for (const b of document.querySelectorAll('[data-share=copy]')) b.onclick = () => copyLink(b, teamUrl(team))

  const ok = $('#team-ok')
  const flash = msg => {
    ok.textContent = msg || ''
    ok.hidden = !msg
    clearTimeout(flash.t)
    flash.t = setTimeout(() => { ok.hidden = true }, 8000)
  }
  try { flash(sessionStorage.getItem(LEFT_KEY)); sessionStorage.removeItem(LEFT_KEY) } catch {}

  const joinForm = $('#join-form'), again = () => joinForm.requestSubmit()
  joinForm.onsubmit = async e => {
    e.preventDefault()
    let failed = false
    const res = await submit(joinForm, async () => {
      const cur = await ready(again, '팀에 가입하기 전에 프로필을 먼저 등록해 주세요')
      if (!cur || mine()) return null
      if (cur.teamId && cur.teamId !== team.id && !confirm(MOVE_ASK)) return null
      try { return await api(`/teams/${team.id}/members`, { method: 'POST', withToken: true }) }
      catch (e) {
        if (e.status === 428) { openProfile(again, e.message); return null }
        failed = true
        throw e
      }
    })
    if (!res) { if (failed) refresh(); return }   // 그새 팀이 찼거나 사라졌을 수 있다 — 찼으면 가입 폼이 내려간다
    me.teamId = res.team.id
    team = res.team
    render()
    flash(leftMsg(res.left))
    $('#team-roster').scrollIntoView({ block: 'center' })
    $('#team-roster').focus({ preventScroll: true })   // 가입 폼이 사라져도 포커스가 body 로 떨어지지 않게
  }

  // 다 찬 팀도 계속 본다 — 누가 나가거나 방출되면 다시 모집 중이 되는데, 알림이 없어 이 화면이 유일한 신호다
  render()
  meSubs.push(render)   // 로그인 · 로그아웃 · 프로필 수정이 로스터 · 가입 · 관리에 바로 보이게
  setInterval(() => document.hidden || refresh(), 20000)   // 팀 화면은 20초 — 가입 · 방출이 바로 보여야 한다(호출 수는 목록 주석 참고)
  setInterval(() => dead || tick(), 20000)   // 남은 시간은 분 단위라 20초면 충분 — 만료는 위 새로 읽기 · 다시 보일 때 새로 읽기가 404 로 알아챈다
  document.addEventListener('visibilitychange', () => document.hidden || refresh())
}

// ---------------------------------------------------------------- 초기화

const boot = async () => {
  const [players, recruit, presets] = await Promise.all([loadPlayers(), getJson('/data/recruit.json'), getJson('/data/tactics.json')])
  data = players
  cfg = recruit
  tactics = presets
  mountTop('/recruit/', data.updatedAt)
  kr = data.players.filter(p => p.server === 'kr')

  // SDK 는 클릭 전에 미리 받아 둔다 (클릭 때 받으면 sendDefault 가 동기 호출이 못 된다)
  if (KAKAO_JS_KEY) document.head.append(h('script', {
    src: 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js',
    integrity: 'sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy',
    crossOrigin: 'anonymous',
    onload: () => { if (!Kakao.isInitialized()) Kakao.init(KAKAO_JS_KEY) },
  }))

  buildPicker()
  profileForm()
  renderAuth()
  initAuth()
  const id = new URLSearchParams(location.search).get('t')
  if (id) showTeam(id)
  else showList()
}

boot()
