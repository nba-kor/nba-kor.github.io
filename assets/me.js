// 마이페이지 — 프로필(표시 이름 · 마이크) · 게임 계정 · 보유 캐릭터 · 아레나 신청 이력 · 로그인 연결(카카오 연결 · 해제) · 탈퇴 · (관리자) 숨긴 메뉴 · (마스터) 사이트 접근 비밀번호 · 변경 기록
import { mountTop, copyLink } from './app.js?v=fb02b445'
import { api, session, hasProvider, linkKakao, unlinkKakao, withdraw, saveGate, chooseLogin, KAKAO_SVG } from './auth.js?v=1fbb8e2f'
import { $, h, loadData, startAuth, auth, me } from './board.js?v=4233415a'
import { accountsOf, accountRow, editAccount, applyEdit, personFields, saveProfile, arenaCfg, weekLabel } from './profile.js?v=a465db33'

await loadData()
mountTop('/me/')
const arena = await arenaCfg()
const CHOICE = Object.fromEntries([...arena.slots.map(s => [s.id, s.short]), ...arena.extra.map(c => [c.id, c.label])])

const card = (title, ...kids) => h('section', { className: 'card mp-card' }, h('h2', {}, title), ...kids)
const errBox = () => h('p', { className: 'rc-form-err', role: 'alert', hidden: true })
const show = (box, msg) => { box.textContent = msg; box.hidden = !msg }

// 아직 저장 안 한 계정 고치기(프로필이 없을 때만 생긴다)가 있으면 떠나기 전에 묻는다
let dirty = false
addEventListener('beforeunload', e => { if (dirty) e.preventDefault() })

function render() {
  const box = $('#me-body')
  if (auth === 'loading') return box.replaceChildren(h('p', { className: 'rc-muted' }, '로그인 확인 중…'))
  if (auth !== 'in') return box.replaceChildren(card('마이페이지',
    h('p', { className: 'rc-note' }, '로그인하면 내 프로필 · 게임 계정 · 보유 캐릭터를 등록하고 아레나전에 신청할 수 있어요.'),
    h('div', { className: 'rc-actions' }, h('button', { type: 'button', className: 'primary rc-big', onclick: chooseLogin }, '로그인'))))
  if (me.admin) memberStore.load()
  box.replaceChildren(...[profileCard(), historyCard(), linkCard(), me.admin && adminCard(), me.admin && attendanceCard(), me.admin && membersCard(), me.master && gateCard(), me.master && auditCard(), quitCard()].filter(Boolean))   // replaceChildren 은 false 를 글자로 찍는다
}

// ------------------------------------------------ 프로필 + 계정

function profileCard() {
  let prof = me.profile, accounts = accountsOf(prof?.entries)
  const person = personFields(prof)
  const err = errBox(), ok = h('span', { className: 'rc-muted', role: 'status' })
  const list = h('ul', { className: 'ac-list' })
  const head = h('small', {})
  const saveBtn = h('button', { type: 'submit', className: 'primary' }, '프로필 저장')

  const paint = () => {
    head.textContent = accounts.length ? `본계정 1 · 부계정 ${accounts.length - 1} · 캐릭터 ${accounts.reduce((n, a) => n + a.chars.length, 0)}개` : ''
    list.replaceChildren(...accounts.length ? accounts.map((a, i) => accountRow(a, i, { onEdit: () => edit(a) }))
      : [h('li', { className: 'ac-empty' }, '아직 계정이 없어요 — 「+ 계정 추가」 로 게임 닉네임과 캐릭터를 넣어 주세요')])
  }
  async function save(next, { name, mic } = prof || {}) {
    show(err, ''); ok.textContent = ''
    saveBtn.disabled = true
    try {
      prof = await saveProfile({ name, mic, accounts: next })
      accounts = accountsOf(prof.entries)
      dirty = false
      ok.textContent = '저장했어요'
      setTimeout(() => { ok.textContent = '' }, 2000)
      return true
    } catch (e) { show(err, e.message); return false }
    finally { saveBtn.disabled = false; paint() }
  }
  // 프로필이 있으면 계정을 고칠 때마다 바로 저장한다(아레나 신청도 같은 계정을 본다). 처음이면 「프로필 저장」 까지 모아 둔다
  async function edit(a) {
    const r = await editAccount(a, accounts)
    if (!r) return
    const next = applyEdit(accounts, a, r)
    if (prof) return save(next)
    accounts = next
    dirty = true
    paint()
  }
  paint()

  const form = h('form', { className: 'mp-form', novalidate: true },
    person.el,
    h('div', { className: 'ac-head-row' }, h('h3', {}, '게임 계정 · 보유 캐릭터 ', head)),
    list,
    h('div', { className: 'rc-add' }, h('button', { type: 'button', onclick: () => edit(null) }, '+ 계정 추가')),
    h('p', { className: 'rc-muted' }, '첫 계정이 본계정이에요. 계정을 고치면 아레나 신청에도 바로 반영돼요.'),
    err,
    h('div', { className: 'rc-actions' }, ok, saveBtn))
  form.onsubmit = async e => {
    e.preventDefault()
    const v = person.read()
    if (!v) return
    if (!accounts.length) return show(err, '계정을 하나 이상 넣어 주세요')
    await save(accounts, v)
  }
  return card(prof ? '내 프로필' : '프로필 만들기', form)
}

// ------------------------------------------------ 아레나 신청 이력

function historyCard() {
  const list = h('ul', { className: 'mp-history' }, h('li', { className: 'rc-muted' }, '불러오는 중…'))
  api('/arena/mine', { withToken: true }).then(({ history, current }) => {
    list.replaceChildren(...history.length ? history.map(r => h('li', {},
      h('a', { href: `/arena/?w=${r.week}` }, weekLabel(r.week), r.week === current && h('em', {}, '이번 주')),
      h('span', {}, r.slots.map(s => CHOICE[s] || s).join(' · ')),
      r.nicks.length > 0 && h('small', {}, `계정 ${r.nicks.join(', ')}`),
      h('small', { className: r.assigned.length ? 'is-on' : '' }, r.assigned.length
        ? `배정 ${r.assigned.map(a => `${CHOICE[a.slot] || a.slot} ${a.team}팀(${a.nick})`).join(' · ')}` : '배정 없음')))
      : [h('li', { className: 'rc-muted' }, '아직 신청한 적이 없어요.')])
  }).catch(e => list.replaceChildren(h('li', { className: 'rc-bad' }, e.message)))
  return card('아레나 신청 이력', list, h('div', { className: 'rc-actions' }, h('a', { className: 'btn primary', href: '/arena/#signup' }, '이번 주 신청하기')))
}

// ------------------------------------------------ 로그인 연결 — 디스코드 계정에 카카오를 붙이면 카카오로도 같은 계정에 들어온다. 붙인 카카오는 뗄 수 있다
// 디스코드는 못 뗀다 — 계정 ID 가 디스코드 ID 라 떼면 프로필 · 글과 끊긴다. 카카오로만 로그인한 계정은 카카오가 곧 계정이라 탈퇴로

function linkCard() {
  const p = h('p', { className: 'rc-note rc-links' }, '확인 중…'), err = errBox()
  const paint = async () => {
    const user = (await session())?.user, discord = hasProvider(user, 'discord'), kakao = hasProvider(user, 'kakao')
    const off = h('button', { type: 'button', className: 'danger', onclick: async () => {
      if (!confirm('카카오 로그인 연결을 끊을까요?\n다음부터는 디스코드로만 이 계정에 들어올 수 있어요. 카카오로 로그인하면 따로 새 계정이 돼요.')) return
      off.disabled = true; show(err, '')
      try { await unlinkKakao(); paint() } catch (e) { show(err, e.message); off.disabled = false }
    } }, '카카오 연결 해제')
    p.replaceChildren(...!discord ? ['카카오로 로그인 중이에요. 카카오로만 들어오는 계정이라 연결을 끊으려면 탈퇴해야 해요.']
      : kakao ? ['디스코드 · 카카오 어느 쪽으로 로그인해도 이 계정이에요. ', off]
      : ['카카오를 연결하면 카카오톡 안에서도 바로 로그인돼요. ', h('button', { type: 'button', className: 'rc-sso is-kakao is-sm', onclick: linkKakao, innerHTML: `${KAKAO_SVG}카카오 로그인 연결` })])
  }
  paint()
  return card('로그인 연결', p, err)
}

// ------------------------------------------------ 탈퇴 — 되돌릴 수 없어서 「탈퇴」 를 직접 쳐야 한다. 슈퍼관리자는 못 한다(서버도 막는다)

function quitCard() {
  const err = errBox()
  const btn = h('button', { type: 'button', className: 'danger', disabled: !!me.master, onclick: async () => {
    if (prompt('탈퇴하면 되돌릴 수 없어요. 계속하려면 「탈퇴」 라고 입력해 주세요')?.trim() !== '탈퇴') return
    btn.disabled = true; show(err, '')
    try { await withdraw() } catch (e) { show(err, e.message); btn.disabled = false }
  } }, '탈퇴하기')
  return card('회원 탈퇴',
    h('p', { className: 'rc-note' }, '프로필 · 게임 계정 · 아레나 신청 · 팀원모집 자리 · 로그인 정보(디스코드 · 카카오 연결)가 지워지고 되돌릴 수 없어요. 이끌던 모집 팀은 해제돼요.'),
    h('p', { className: 'rc-muted' }, '작성한 글 · 댓글은 지워지지 않아요 — 지우려면 탈퇴 전에 직접 지워 주세요. 다시 로그인하면 새 계정으로 시작해요.'),
    me.master && h('p', { className: 'rc-muted' }, '슈퍼관리자는 탈퇴할 수 없어요.'),
    err, h('div', { className: 'rc-actions' }, btn))
}

// ------------------------------------------------ 관리자 — 숨긴 메뉴

const adminCard = () => card('관리자 메뉴',
  h('ul', { className: 'mp-admin' },
    h('li', {}, h('a', { href: '/arena/plan/' }, '아레나 편성'), h('small', {}, '신청한 계정을 끌어서 시간대별 팀에 배치')),
    h('li', {}, h('a', { href: '#attendance' }, '아레나 출석 현황'), h('small', {}, '몇 주 연속 참석 · 몇 주째 미참석 — 아래')),
    h('li', {}, h('a', { href: '#members' }, '멤버 관리'), h('small', {}, '관리자 임명 · 해제 · 탈퇴 — 아래')),
    h('li', {}, h('a', { href: '/recruit/' }, '팀원모집'), h('small', {}, '당분간 메뉴에서 숨겨 둔 기능 — 주소로는 누구나 들어올 수 있어요')),
    h('li', {}, h('a', { href: '/slam/' }, '슈퍼 슬램'), h('small', {}, '5:5 오락실 농구 게임(1P vs CPU) — 메뉴에서 숨겨 둔 페이지')),
    me.master && h('li', {}, h('a', { href: '#audit' }, '변경 기록'), h('small', {}, '누가 언제 무엇을 바꿨는지 — 아래(슈퍼관리자만)'))))

// ------------------------------------------------ 관리자 — 멤버 관리(프로필이 있는 사람). 슈퍼관리자(마스터) · 본인은 못 바꾼다 — 서버도 막는다

const ROLE_KO = { master: '슈퍼관리자', admin: '관리자', member: '멤버' }
// 멤버 목록(GET /api/members) — 출석 현황 · 멤버 관리가 같이 쓴다. 바꾸면 다시 읽어 두 카드를 다시 그린다
const memberStore = {
  list: null, error: '', subs: new Set(),
  async load() {
    try { this.list = (await api('/members', { withToken: true })).members; this.error = '' }
    catch (e) { this.error = e.message }
    for (const f of this.subs) f()
  },
}
/** 목록이 오면(또는 바뀌면) paint() — 아직이면 「불러오는 중」, 실패하면 문구 */
const watchMembers = (box, paint) => {
  const draw = () => memberStore.error ? box.replaceChildren(h('p', { className: 'rc-bad' }, memberStore.error))
    : memberStore.list ? paint(memberStore.list) : box.replaceChildren(h('p', { className: 'rc-muted' }, '불러오는 중…'))
  const f = () => box.isConnected ? draw() : memberStore.subs.delete(f)   // 다시 그려 떨어져 나간 카드는 구독을 푼다
  memberStore.subs.add(f)
  draw()
}

// ------------------------------------------------ 관리자 — 아레나 출석 현황. 출석 = 그 주에 참가 신청(사유불참 빼고). 이번 주에 아직 안 했으면 지난주까지로 센다

function attendanceCard() {
  const box = h('div', {})
  const table = (rows, cols) => h('div', { className: 'ar-table-wrap' }, h('table', { className: 'ar-table mp-attend' },
    h('thead', {}, h('tr', {}, ['#', '본계정', '이번 주', ...cols.map(c => c[0])].map(t => h('th', {}, t)))),
    h('tbody', {}, rows.map((m, i) => h('tr', {}, h('td', {}, i + 1),
      h('td', { className: 'ar-nick' }, h('b', {}, m.main), m.name !== m.main && h('small', {}, m.name)),
      h('td', {}, h('span', { className: `mp-now is-${m.attend.now || 'none'}` }, { in: '신청', absent: '사유불참' }[m.attend.now] || '미신청')),
      ...cols.map(c => h('td', {}, c[1](m))))))))
  watchMembers(box, list => {
    const going = list.filter(m => m.attend.streak).sort((a, b) => b.attend.streak - a.attend.streak || a.main.localeCompare(b.main, 'ko'))
    const away = list.filter(m => !m.attend.streak).sort((a, b) => b.attend.missed - a.attend.missed || a.main.localeCompare(b.main, 'ko'))
    const last = m => m.lastWeek ? weekLabel(m.lastWeek).split(' ~ ')[0] : '-'
    box.replaceChildren(
      h('h3', { className: 'mp-sub' }, `참석 중 ${going.length}명`),
      going.length ? table(going, [['연속', m => h('b', { className: 'mp-streak' }, `${m.attend.streak}주 연속`)], ['총 참석', m => `${m.attend.total}회`]]) : h('p', { className: 'rc-muted' }, '없어요'),
      h('h3', { className: 'mp-sub' }, `미참석 ${away.length}명`),
      away.length ? table(away, [['미참석', m => m.attend.missed ? h('b', { className: 'mp-missed' }, `${m.attend.missed}주째`) : '-'], ['총 참석', m => `${m.attend.total}회`], ['최근 신청', last]]) : h('p', { className: 'rc-muted' }, '없어요'))
  })
  const el = card('아레나 출석 현황', box,
    h('p', { className: 'rc-muted' }, '출석 = 그 주에 참가 신청(사유불참 빼고). 이번 주에 아직 신청하지 않았으면 지난주까지로 세요. 가입하기 전 주는 미참석으로 세지 않아요. 관리자만 보여요.'))
  el.id = 'attendance'
  return el
}

function membersCard() {
  let list = []
  const q = h('input', { type: 'search', placeholder: '본계정 닉네임 · 이름 검색', 'aria-label': '멤버 검색', oninput: () => paint() })
  const head = h('small', { className: 'rc-muted' })
  const box = h('div', {}, h('p', { className: 'rc-muted' }, '불러오는 중…'))
  async function act(m, method, body, ask) {
    if (!confirm(ask)) return
    try { await api(`/members/${m.userId}`, { method, withToken: true, body }); await memberStore.load() }
    catch (e) { alert(e.message) }
  }
  const buttons = m => m.role === 'master' ? h('span', { className: 'rc-muted' }, '-')
    : m.userId === me.id ? h('span', { className: 'rc-muted' }, '나')
    : h('span', { className: 'mp-acts' },
      m.role === 'admin'
        ? h('button', { type: 'button', onclick: () => act(m, 'PUT', { role: 'member' }, `「${m.main}」 님을 일반 멤버로 바꿀까요?`) }, '멤버로')
        : h('button', { type: 'button', onclick: () => act(m, 'PUT', { role: 'admin' }, `「${m.main}」 님을 관리자로 임명할까요?\n아레나 편성 · 멤버 관리를 할 수 있게 돼요.`) }, '관리자로'),
      h('button', { type: 'button', className: 'danger', onclick: () => act(m, 'DELETE', undefined, `「${m.main}」 님을 탈퇴시킬까요?\n프로필 · 게임 계정 · 아레나 신청이 지워져요. 다시 로그인하면 새로 가입할 수 있어요.`) }, '탈퇴'))
  function paint() {
    const k = q.value.trim().toLowerCase()
    const rows = list.filter(m => !k || `${m.main} ${m.name}`.toLowerCase().includes(k))
    head.textContent = `${list.length}명 · 관리자 ${list.filter(m => m.role !== 'member').length}명`
    box.replaceChildren(rows.length ? h('div', { className: 'ar-table-wrap' }, h('table', { className: 'ar-table mp-members' },
      h('thead', {}, h('tr', {}, ['#', '본계정', '등급', '계정', '최근 신청', ''].map(t => h('th', {}, t)))),
      h('tbody', {}, rows.map((m, i) => h('tr', {},
        h('td', {}, i + 1),
        h('td', { className: 'ar-nick' }, h('b', {}, m.main), m.name !== m.main && h('small', {}, m.name)),
        h('td', {}, h('span', { className: `mp-role is-${m.role}` }, ROLE_KO[m.role])),
        h('td', {}, `${m.accounts}개`),
        h('td', {}, m.lastWeek ? weekLabel(m.lastWeek).split(' ~ ')[0] : '-'),
        h('td', {}, buttons(m)))))))
      : h('p', { className: 'rc-muted' }, k ? '찾는 멤버가 없어요' : '아직 멤버가 없어요'))
  }
  watchMembers(box, l => { list = l; paint() })
  const el = card('멤버 관리', h('div', { className: 'mp-members-head' }, q, head), box,
    h('p', { className: 'rc-muted' }, '멤버 = 프로필(게임 계정)을 등록한 사람. 슈퍼관리자는 바꾸거나 탈퇴시킬 수 없어요. 탈퇴하면 프로필 · 게임 계정 · 아레나 신청 · 관리자 권한이 지워져요.'))
  el.id = 'members'
  return el
}

// ------------------------------------------------ 마스터 — 사이트 접근 비밀번호 보기 · 바꾸기

function gateCard() {
  const input = h('input', { type: 'text', maxLength: 32, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: '새 비밀번호' })
  const now = h('p', { className: 'rc-note' }), err = h('small', { className: 'rc-err', hidden: true })
  const paint = () => {
    const g = me.gate, when = g && new Date(g.changedAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    now.replaceChildren(...g
      ? ['지금 비밀번호 ', h('b', { className: 'rc-gate-code' }, g.code), ' ', h('button', { type: 'button', onclick: e => copyLink(e.currentTarget, g.code) }, '복사'), h('small', {}, ` · ${when} 바꿈`)]
      : ['꺼져 있어요 — 누구나 들어와요. 비밀번호를 정하면 켜져요.'])
  }
  paint()
  input.oninput = () => { err.hidden = true }
  const save = async e => {
    const code = input.value.trim(), btn = e.currentTarget
    if (!code) return input.focus()
    if (!confirm(`사이트 접근 비밀번호를 「${code}」(으)로 바꿀까요?\n다른 사람은 새 비밀번호를 다시 입력해야 해요.`)) return
    btn.disabled = true
    try {
      const r = await api('/gate', { method: 'PUT', body: { code }, withToken: true })
      saveGate(r.token)
      me.gate = { code: r.code, changedAt: r.changedAt }
      input.value = ''
      paint()
    } catch (e) { err.textContent = e.message; err.hidden = false }
    finally { btn.disabled = false }
  }
  // 숫자 6자리 — 카톡으로 알려 주고 휴대폰으로 치기 쉽게. 직접 정한 글자도 된다
  const random = () => { input.value = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, '0'); err.hidden = true }
  return card('사이트 접근 비밀번호',
    h('div', { className: 'rc-gate-admin' },
      now,
      h('div', { className: 'rc-gate-row' }, input, h('button', { type: 'button', onclick: random }, '랜덤 생성'), h('button', { type: 'button', className: 'primary', onclick: save }, '바꾸기')),
      h('small', { className: 'rc-hint' }, '4~32자. 바꾸면 다른 사람은 새 비밀번호를 한 번 다시 입력해야 해요(이 기기는 그대로 들어와 있어요). 마스터만 보여요.'),
      err))
}

// ------------------------------------------------ 마스터 — 변경 기록(감사 로그). 사이트에서 무언가를 바꾼 일마다 누가 · 언제 · 무엇을 · 바뀐 내용, 최근 것부터

function auditCard() {
  let logs = [], next = null, who = null   // who = { id, name } — 그 사람 기록만
  const box = h('div', { className: 'mp-audit' }, h('p', { className: 'rc-muted' }, '불러오는 중…'))
  const filter = h('p', { className: 'mp-audit-who' }), err = errBox()
  const more = h('button', { type: 'button', hidden: true, onclick: () => load(true) }, '더 보기')
  const when = ms => new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  const only = l => { who = { id: l.userId, name: l.userName || l.userId }; load() }
  async function load(append = false) {
    more.disabled = true
    try {
      const q = new URLSearchParams({ ...(append && { before: next }), ...(who && { who: who.id }) })
      const r = await api(`/audit?${q}`, { withToken: true })
      logs = append ? [...logs, ...r.logs] : r.logs
      next = r.next
      show(err, '')
    } catch (e) { show(err, e.message) }
    more.disabled = false
    paint()
  }
  function paint() {
    filter.replaceChildren(...who ? [h('b', {}, who.name), ' 님 기록만 보는 중 ', h('button', { type: 'button', onclick: () => { who = null; load() } }, '전체 보기')] : [])
    box.replaceChildren(...logs.length ? logs.map(l => h('article', { className: 'mp-log' },
      h('div', { className: 'mp-log-head' },
        h('time', {}, when(l.at)),
        l.userId ? h('button', { type: 'button', className: 'mp-log-who', title: '이 사람 기록만 보기', onclick: () => only(l) }, l.userName || l.userId) : h('span', { className: 'rc-muted' }, '비회원'),
        h('b', { title: l.action }, l.label || l.action),
        l.target && h('span', { className: 'mp-log-target' }, l.target)),
      l.detail.length > 0 && h('ul', {}, l.detail.map(d => h('li', {}, d)))))
      : [h('p', { className: 'rc-muted' }, '기록이 없어요')])
    more.hidden = !next
  }
  load()
  const el = card('변경 기록', filter, box, err, h('div', { className: 'rc-actions' }, more),
    h('p', { className: 'rc-muted' }, '프로필 · 아레나 신청 · 편성 · 멤버 관리 · 게시판 · 접근 비밀번호 등 사이트에서 무언가를 바꾼 일이 최근 것부터 나와요. 이름을 누르면 그 사람 기록만 봐요. 슈퍼관리자만 보여요.'))
  el.id = 'audit'
  return el
}

startAuth('', render)
render()
