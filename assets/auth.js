// 디스코드 · 카카오 로그인(Supabase Auth) + API 호출 — 팀원모집 · 게시판이 같이 쓴다.
// 세션은 같은 도메인의 localStorage 에 남으므로 한 페이지에서 로그인하면 다른 페이지도 로그인돼 있다.

// API = Supabase Edge Function 'recruit'. GitHub Pages 는 API 를 돌릴 수 없어 운영에서는 함수 주소로 부르고,
// 그 밖(로컬 docker compose 의 nginx 가 /api/ 를 같은 함수로 넘긴다)에서는 같은 도메인의 /api
const API_ORIGIN = location.hostname === 'nba-kor.github.io' ? 'https://lgchgqxjjlapszmxarun.supabase.co/functions/v1/recruit' : ''
// publishable key 는 브라우저에 두라고 만든 공개 키다(표는 RLS 로 막혀 있어 이 키로는 아무것도 못 읽는다)
const SUPABASE_URL = 'https://lgchgqxjjlapszmxarun.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NlTRTkRjbTv0iCHhNB8pZA_2Ov5In9Z'
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'   // 버전 고정. 동적 import 라 CDN 이 죽어도 공개 화면은 뜬다
const NO_SERVER = '서버에 연결할 수 없어요'

export const IN_KAKAO = /KAKAOTALK/i.test(navigator.userAgent)
export const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

export let sb = null   // supabase 클라이언트 — 못 불러오면 null 로 남고 로그인만 안 된다
let currentUser = null   // 마지막 세션의 사용자 — 머리 아래 이름 줄의 디스코드 · 카카오 표시

/** withToken = 로그인 토큰을 붙인다. 공개 GET 에는 붙이지 않는다 — Authorization 헤더가 붙으면 preflight 로 함수 호출이 두 배가 된다.
 *  guest = { id: 'g<번호>', pw } — 팀원모집 비회원이 자기 팀을 관리할 때 */
export async function api(path, { method = 'GET', body, withToken, guest } = {}) {
  let r
  const token = withToken && (await sb?.auth.getSession())?.data.session?.access_token   // getSession 이 만료된 토큰을 갱신해 준다
  // 헤더는 latin1 만 실린다 — 한글 비밀번호는 퍼센트 인코딩
  const authorization = token ? `Bearer ${token}` : guest && `Guest ${guest.id}:${encodeURIComponent(guest.pw)}`
  const g = gateToken()   // 접근 비밀번호 토큰은 주소에 — 헤더로 보내면 공개 GET 도 preflight 가 붙는다
  try {
    r = await fetch(`${API_ORIGIN}/api${path}${g ? `${path.includes('?') ? '&' : '?'}g=${encodeURIComponent(g)}` : ''}`, {
      method, cache: 'no-store',
      headers: { ...(body && { 'content-type': 'application/json' }), ...(authorization && { authorization }) },
      body: body && JSON.stringify(body),
    })
  } catch { throw new Error(NO_SERVER) }
  const j = await r.json().catch(() => null)
  // 정적 호스팅이 대신 답한 404·502 HTML 등은 서버가 없는 것으로 본다
  if (!j) throw new Error(NO_SERVER)
  if (!r.ok) {
    if (j.gate) { store.del(GATE); showGate() }   // 그새 마스터가 비밀번호를 바꿨다
    throw Object.assign(new Error(j.error || NO_SERVER), { status: r.status })
  }
  return j
}

// 이 브라우저에서 디스코드 승인을 끝낸 적이 있으면 다음부터 승인 화면을 건너뛴다(디스코드 prompt=none — Supabase 가 그대로 넘긴다)
const AUTHORIZED = 'dc.recruit.discordAuthorized', QUIET_TRY = 'dc.recruit.quietLogin'
const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch {} },
  del: k => { try { localStorage.removeItem(k) } catch {} },
}

// ---------------------------------------------------------------- 접근 비밀번호
// 켜져 있으면 처음 한 번 넣는다. 맞히면 서버가 준 토큰을 이 브라우저에 두고 다음부터는 묻지 않는다 — 마스터가 비밀번호를 바꾸면
// 토큰도 바뀌어 다시 묻는다(하루에 한 번 서버에 확인하고, 그 사이에도 API 가 거절하면 바로).
// ponytail: GitHub Pages 라 HTML · JS · data/*.json 은 주소만 알면 누구나 받는다 — 화면을 가리고 API(모집 · 게시판 · 프로필)를 막을 뿐이다.
// 완전히 막으려면 사이트를 로그인이 붙는 호스팅(Cloudflare Access 등) 뒤로 옮겨야 한다
const GATE = 'dc.gate', GATE_AT = 'dc.gate.at', DAY = 86_400_000   // 토큰(꺼져 있으면 'off') · 마지막으로 서버에 확인한 시각. HTML 머리의 한 줄 스크립트도 GATE 를 본다
const gateToken = () => { const v = store.get(GATE); return v && v !== 'off' ? v : '' }
/** 비밀번호를 맞혔을 때 · 마스터가 바꾼 뒤(바꾼 사람의 브라우저는 새 토큰으로 그대로 들어와 있다) */
export const saveGate = token => { store.set(GATE, token || 'off'); store.set(GATE_AT, String(Date.now())) }
const unlock = () => { document.documentElement.classList.remove('gated'); document.querySelector('.gate')?.remove() }

function showGate() {
  document.documentElement.classList.add('gated')
  if (document.querySelector('.gate')) return
  const box = Object.assign(document.createElement('div'), { className: 'gate' })
  box.innerHTML = `<form class="gate-card" novalidate>
    <img src="/assets/icon.png?v=2" alt="">
    <h1>TNAB <span>Vipers</span></h1>
    <p>접근 비밀번호를 입력해 주세요</p>
    <input type="text" name="code" maxlength="32" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="접근 비밀번호">
    <button class="primary">들어가기</button>
    <p class="gate-err" role="alert" hidden></p></form>`
  const form = box.firstElementChild, err = form.querySelector('.gate-err'), btn = form.querySelector('button')
  form.onsubmit = async e => {
    e.preventDefault()
    const code = form.code.value.trim()
    if (!code) return form.code.focus()
    btn.disabled = true
    try {
      saveGate((await api('/gate', { method: 'POST', body: { code } })).token)
      unlock()
    } catch (e) {
      err.textContent = e.message
      err.hidden = false
      form.code.select()
    } finally { btn.disabled = false }
  }
  document.body.append(box)
  form.code.focus()
}

/** 하루에 한 번: 켜져 있는지 · 들고 있는 토큰이 아직 맞는지. 아무것도 없으면(처음 온 브라우저) 바로 */
async function checkGate() {
  const v = store.get(GATE)
  if (v && Date.now() - (+store.get(GATE_AT) || 0) < DAY) return
  let r = null
  try {
    const res = await fetch(`${API_ORIGIN}/api/gate${gateToken() ? `?g=${encodeURIComponent(gateToken())}` : ''}`, { cache: 'no-store' })
    r = res.ok ? await res.json() : null
  } catch {}
  // ponytail: 서버에 닿지 않으면 연다 — 정적 화면(전술판 · 티어표)은 서버 없이도 돌고, 화면 가리기는 어차피 우회할 수 있다
  if (!r) return unlock()
  if (!r.on) { saveGate(null); return unlock() }
  if (r.ok && v) { store.set(GATE_AT, String(Date.now())); return unlock() }
  store.del(GATE)
  showGate()
}
checkGate()

/**
 * SDK 를 불러와 세션을 지켜본다. 로그인한 사람이 바뀔 때(처음 포함)마다 onUser() — 토큰 갱신 · 탭 복귀로는 부르지 않는다.
 * SDK 를 못 불러오면 false.
 */
export async function initAuth(onUser) {
  try {
    const { createClient } = await import(SUPABASE_JS)
    sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { flowType: 'pkce' } })
  } catch (e) {
    console.warn('로그인 모듈을 불러오지 못했어요', e)
    return false
  }
  // 로그인을 취소하면 ?error=... 가 남는다 — 다음 로그인의 redirectTo 에 딸려 가지 않게 걷는다 (?code 는 SDK 가 걷는다)
  const url = new URL(location.href)
  const failed = url.searchParams.get('error'), why = url.searchParams.get('error_description'), wantLogin = url.searchParams.has('login')
  if (failed || wantLogin) {
    for (const k of ['error', 'error_code', 'error_description', 'login']) url.searchParams.delete(k)
    history.replaceState(history.state, '', url)
  }
  // 승인 화면을 건너뛰려다(prompt=none) 실패했으면 — 디스코드 쪽 승인이 풀렸거나 로그인이 끊긴 것 — 한 번만 승인 화면으로 다시 간다
  const quietFailed = failed && store.get(QUIET_TRY)
  store.del(QUIET_TRY)
  if (quietFailed) { store.del(AUTHORIZED); login('discord'); return true }
  // 직접 취소(access_denied)가 아닌 실패 — 이미 다른 계정에 붙은 카카오를 연결하려 했을 때 등 — 는 이유를 보여 준다
  if (failed && failed !== 'access_denied') setTimeout(() => alert(`로그인 · 연결에 실패했어요${why ? `\n${why}` : ''}`))
  let uid
  sb.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user ?? null
    if (session?.user?.identities?.some(i => i.provider === 'discord')) store.set(AUTHORIZED, '1')   // 이 브라우저에서 디스코드 승인을 끝냈다
    const id = session?.user?.id
    if (event !== 'INITIAL_SESSION' && id === uid) return
    uid = id
    // 콜백 안에서 SDK 를 다시 부르면 잠금에 걸린다 — 한 박자 미룬다
    setTimeout(async () => { await askNickname(session?.user); onUser() })
  })
  // 카카오톡에서 "로그인"을 눌러 바깥 브라우저로 넘어온 경우(?login=1) — 로그인이 안 돼 있으면 바로 이어서 디스코드 로그인한다
  if (wantLogin && !(await sb.auth.getSession()).data.session) login('discord')
  return true
}

const LINK_RE = /:\/\/|www\.|discord\.gg/i   // 서버와 같은 규칙 — 이름에 링크 금지
export const hasProvider = (user, p) => !!user?.identities?.some(i => i.provider === p)

/** 카카오로만 로그인한 사람에게 처음 한 번 닉네임을 받는다 — 카카오 닉네임은 대개 실명이라 서버가 쓰지 않고 user_metadata.nickname 을 쓴다.
 *  취소하면 「카카오 사용자」 로 보이고 다음에 다시 묻는다 */
async function askNickname(user) {
  if (!hasProvider(user, 'kakao') || hasProvider(user, 'discord') || user.user_metadata?.nickname) return
  let msg = '사이트에서 쓸 닉네임을 정해 주세요 (1~32자)\n팀원모집 · 게시판에 이 이름이 보여요. 팀원모집 프로필에서 바꿀 수 있어요.'
  for (;;) {
    const v = prompt(msg)
    if (v == null) return
    const s = v.trim()
    if (s && [...s].length <= 32 && !LINK_RE.test(s)) {
      const { error } = await sb.auth.updateUser({ data: { nickname: s } })
      if (error) return alert(`닉네임을 저장하지 못했어요: ${error.message}`)
      await sb.auth.refreshSession()   // 새 토큰 — 서버가 토큰마다 60초 기억하는 옛 이름을 건너뛴다
      return
    }
    msg = `${s ? '32자 이내로, 링크 없이' : '닉네임을'} 입력해 주세요`
  }
}

export const session = async () => sb && (await sb.auth.getSession()).data.session

// 로그인 버튼 아이콘 — 디스코드는 simple-icons(CC0), 카카오는 카카오 로그인 디자인 가이드의 말풍선 심볼
const DISCORD_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>'
export const KAKAO_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5C6.75 3.5 2.5 6.86 2.5 11c0 2.66 1.75 4.99 4.4 6.32l-.9 3.3c-.08.29.25.52.5.35l3.95-2.6c.5.06 1.03.1 1.55.1 5.25 0 9.5-3.36 9.5-7.5S17.25 3.5 12 3.5z"/></svg>'

/** 디스코드 · 카카오 중 고르는 창. 페이지마다 HTML 을 두지 않게 처음 부를 때 만든다 */
export function chooseLogin() {
  if (!sb) return
  let dlg = document.getElementById('login-dialog')
  if (!dlg) {
    dlg = Object.assign(document.createElement('dialog'), { id: 'login-dialog', className: 'rc-dialog rc-login-dialog' })
    dlg.innerHTML = `<form method="dialog"><header><h2>로그인</h2><button value="" aria-label="닫기">✕</button></header>
      <div class="rc-login-opts"><button value="discord" class="rc-sso">${DISCORD_SVG}디스코드로 로그인</button><button value="kakao" class="rc-sso is-kakao">${KAKAO_SVG}카카오로 로그인</button>
      <p class="rc-muted">디스코드 계정에 카카오를 연결하면(팀원모집 · 내 프로필) 둘 중 아무거나로 같은 계정에 들어와요.</p></div></form>`
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close() })   // 바깥(backdrop)을 누르면 닫기
    dlg.addEventListener('close', () => { if (dlg.returnValue) login(dlg.returnValue) })
    document.body.append(dlg)
  }
  dlg.returnValue = ''
  dlg.showModal()
}

export function login(provider) {
  if (!sb) return
  // 카카오톡 인앱 브라우저에는 디스코드 로그인이 안 돼 있어 아이디 · 비밀번호를 매번 쳐야 한다 — 평소 쓰는 브라우저로 넘겨 거기서 로그인한다.
  // 카카오 로그인은 카카오톡 안에서 바로 된다
  if (provider === 'discord' && IN_KAKAO) {
    const next = new URL(location.href)
    next.searchParams.set('login', '1')
    location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(next)}`
    // 카톡 버전에 따라 바깥 브라우저가 안 열리면 화면이 그대로 보인다 — 그때는 여기서 로그인한다
    setTimeout(() => { if (document.visibilityState === 'visible') oauth(provider) }, 1500)
    return
  }
  return oauth(provider)
}

// 돌아올 주소는 지금 페이지. Supabase Auth 의 Redirect URLs 에 페이지마다 들어 있어야 한다(README)
const back = () => `${location.origin}${location.pathname}${location.search}`

function oauth(provider) {
  const quiet = provider === 'discord' && store.get(AUTHORIZED) === '1'
  if (quiet) store.set(QUIET_TRY, '1')
  return sb.auth.signInWithOAuth({ provider, options: { redirectTo: back(), ...(quiet && { queryParams: { prompt: 'none' } }) } })
}

/** 로그인한 계정에 카카오를 붙인다 — 다음부터 카카오로 로그인해도 같은 계정이다. Supabase 의 Manual linking 을 켜 둬야 한다(README).
 *  이미 다른 계정(카카오로 따로 로그인한 적이 있는 등)에 붙은 카카오면 돌아와서 이유를 띄운다 */
export async function linkKakao() {
  const { error } = await sb.auth.linkIdentity({ provider: 'kakao', options: { redirectTo: back() } })
  if (error) alert(`카카오를 연결하지 못했어요: ${error.message}`)
}

/** 머리 아래 줄에 지금 누구로 들어와 있는지. 버튼 옆에 두면 좁은 화면에서 이름이 잘려서 줄을 따로 둔다. name 이 없으면 줄을 뺀다 */
export function showWho(name, { guest = false } = {}) {
  const top = document.querySelector('.top')
  let row = top?.querySelector('.rc-whoami')
  if (!top || !name) return row?.remove()
  if (!row) top.append(row = Object.assign(document.createElement('div'), { className: 'rc-whoami' }))
  const icons = guest ? '' : (hasProvider(currentUser, 'discord') ? `<i>${DISCORD_SVG}</i>` : '') + (hasProvider(currentUser, 'kakao') ? `<i class="is-kakao">${KAKAO_SVG}</i>` : '')
  row.innerHTML = `<span title="${guest ? '비회원 — 이 기기에만 저장된 프로필' : '로그인한 계정'}">${icons}<b></b>${guest ? '<small>비회원</small>' : ''}</span>`
  row.querySelector('b').textContent = name   // 이름은 사용자 입력 — 글자로만 넣는다
}

// 로그아웃하면 다음 로그인은 승인 화면부터 — 다른 디스코드 계정으로 바꾸려는 경우일 수 있다. 끝나면 홈으로
export const logout = async () => { store.del(AUTHORIZED); await sb.auth.signOut(); location.assign('/') }
