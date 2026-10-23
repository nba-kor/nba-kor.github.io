// 마이페이지 — 프로필(표시 이름 · 마이크) · 게임 계정 · 보유 캐릭터 · 아레나 신청 이력 · 로그인 연결 · (관리자) 숨긴 메뉴 · (마스터) 사이트 접근 비밀번호
import { mountTop, copyLink } from './app.js?v=c4085f32'
import { api, session, hasProvider, linkKakao, saveGate, chooseLogin, KAKAO_SVG } from './auth.js?v=e2ffcda1'
import { $, h, loadData, startAuth, auth, me } from './board.js?v=6ff260c0'
import { accountsOf, accountRow, editAccount, applyEdit, personFields, saveProfile, arenaCfg, weekLabel } from './profile.js?v=0ce01e56'

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
  box.replaceChildren(...[profileCard(), historyCard(), linkCard(), me.admin && adminCard(), me.master && gateCard()].filter(Boolean))   // replaceChildren 은 false 를 글자로 찍는다
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
  return card('아레나 신청 이력', list, h('div', { className: 'rc-actions' }, h('a', { className: 'btn primary', href: '/arena/' }, '이번 주 신청하기')))
}

// ------------------------------------------------ 로그인 연결 — 디스코드 계정에 카카오를 붙이면 카카오로도 같은 계정에 들어온다

function linkCard() {
  const p = h('p', { className: 'rc-note rc-links' }, '확인 중…')
  session().then(s => {
    const user = s?.user, discord = hasProvider(user, 'discord'), kakao = hasProvider(user, 'kakao')
    p.replaceChildren(...!discord ? ['카카오로 로그인 중이에요.']
      : kakao ? ['디스코드 · 카카오 어느 쪽으로 로그인해도 이 계정이에요.']
      : ['카카오를 연결하면 카카오톡 안에서도 바로 로그인돼요. ', h('button', { type: 'button', className: 'rc-sso is-kakao is-sm', onclick: linkKakao, innerHTML: `${KAKAO_SVG}카카오 로그인 연결` })])
  })
  return card('로그인 연결', p)
}

// ------------------------------------------------ 관리자 — 숨긴 메뉴

const adminCard = () => card('관리자 메뉴',
  h('ul', { className: 'mp-admin' },
    h('li', {}, h('a', { href: '/arena/#plan' }, '아레나 편성'), h('small', {}, '신청한 계정을 끌어서 시간대별 팀에 배치')),
    h('li', {}, h('a', { href: '/recruit/' }, '팀원모집'), h('small', {}, '당분간 메뉴에서 숨겨 둔 기능 — 주소로는 누구나 들어올 수 있어요'))))

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

startAuth('', render)
render()
