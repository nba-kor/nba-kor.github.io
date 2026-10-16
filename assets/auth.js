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

/** withToken = 로그인 토큰을 붙인다. 공개 GET 에는 붙이지 않는다 — Authorization 헤더가 붙으면 preflight 로 함수 호출이 두 배가 된다.
 *  guest = { id: 'g<번호>', pw } — 팀원모집 비회원이 자기 팀을 관리할 때 */
export async function api(path, { method = 'GET', body, withToken, guest } = {}) {
  let r
  const token = withToken && (await sb?.auth.getSession())?.data.session?.access_token   // getSession 이 만료된 토큰을 갱신해 준다
  // 헤더는 latin1 만 실린다 — 한글 비밀번호는 퍼센트 인코딩
  const authorization = token ? `Bearer ${token}` : guest && `Guest ${guest.id}:${encodeURIComponent(guest.pw)}`
  try {
    r = await fetch(`${API_ORIGIN}/api${path}`, {
      method, cache: 'no-store',
      headers: { ...(body && { 'content-type': 'application/json' }), ...(authorization && { authorization }) },
      body: body && JSON.stringify(body),
    })
  } catch { throw new Error(NO_SERVER) }
  const j = await r.json().catch(() => null)
  // 정적 호스팅이 대신 답한 404·502 HTML 등은 서버가 없는 것으로 본다
  if (!j) throw new Error(NO_SERVER)
  if (!r.ok) throw Object.assign(new Error(j.error || NO_SERVER), { status: r.status })
  return j
}

// 이 브라우저에서 디스코드 승인을 끝낸 적이 있으면 다음부터 승인 화면을 건너뛴다(디스코드 prompt=none — Supabase 가 그대로 넘긴다)
const AUTHORIZED = 'dc.recruit.discordAuthorized', QUIET_TRY = 'dc.recruit.quietLogin'
const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch {} },
  del: k => { try { localStorage.removeItem(k) } catch {} },
}

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

/** 디스코드 · 카카오 중 고르는 창. 페이지마다 HTML 을 두지 않게 처음 부를 때 만든다 */
export function chooseLogin() {
  if (!sb) return
  let dlg = document.getElementById('login-dialog')
  if (!dlg) {
    dlg = Object.assign(document.createElement('dialog'), { id: 'login-dialog', className: 'rc-dialog rc-login-dialog' })
    dlg.innerHTML = `<form method="dialog"><header><h2>로그인</h2><button value="" aria-label="닫기">✕</button></header>
      <div class="rc-login-opts"><button value="discord" class="rc-login">디스코드로 로그인</button><button value="kakao" class="rc-login is-kakao">카카오로 로그인</button>
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

// 로그아웃하면 다음 로그인은 승인 화면부터 — 다른 디스코드 계정으로 바꾸려는 경우일 수 있다
export const logout = () => { store.del(AUTHORIZED); return sb.auth.signOut() }
