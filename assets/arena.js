// 아레나 운영(/arena/) — 이번 주 참가 신청 · 편성 결과(누구나) · 참여 그래프 · 카카오 공유(편성표 이미지)
// 아레나 편성(/arena/plan/) — 관리자가 끌어서 · 눌러서 배치. 같은 모듈이 주소를 보고 둘 중 하나를 그린다
import { mountTop, faceOf, startDrag, pickMenu, loadKakao } from './app.js?v=fb02b445'
import { api, chooseLogin, IS_MOBILE } from './auth.js?v=1fbb8e2f'
import { $, h, P, loadData, startAuth, auth, me } from './board.js?v=4233415a'
import { accountsOf, accountRow, editAccount, applyEdit, personFields, saveProfile, arenaCfg, weekLabel, charNames, roleTags, roleLabel, ROLES, ALLPOS } from './profile.js?v=a465db33'

await loadData()
mountTop('/arena/')
loadKakao()
const A = await arenaCfg()
const SLOTS = A.slots
const LABEL = Object.fromEntries([...SLOTS.map(s => [s.id, s.label]), ...A.extra.map(c => [c.id, c.label])])
const TAG = Object.fromEntries([...SLOTS.map(s => [s.id, s.short.replaceAll(' ', '').replace('차', '')]), ...A.extra.map(c => [c.id, c.short.replaceAll(' ', '')])])   // 토1 · 토1.5 · 토FA
// 색은 강조색(주황) 하나 + 회색 — 시간대 · 포지션 · 계정 수는 글자로 구분한다. 카톡 이미지도 같은 색(팀 줄은 화면 카드처럼 밝은 회색 바탕 · 검은 글자)
const ACCENT = '#f5a623'
// 같은 날 시간이 겹치는 두 시간대(서버와 같은 규칙) — 1.5차는 1차 · 2차와 겹친다
const minutes = t => +t.slice(0, 2) * 60 + +t.slice(3)
const SLOT = Object.fromEntries(SLOTS.map(s => [s.id, s]))
const FAS = A.extra.filter(c => c.day != null), FA_DAY = Object.fromEntries(FAS.map(c => [c.id, c.day]))
const clash = (x, y) => { const a = SLOT[x], b = SLOT[y]; return a.day === b.day && minutes(a.time) < minutes(b.end) && minutes(b.time) < minutes(a.end) }
// 배치 현황 · 팀 고르기 메뉴의 FA — 직접 고른 시간대가 먼저, 그날 FA 를 골랐으면 직접 고른 시간대와 안 겹치는 그날 시간대(FA 만 골랐으면 그날 전부)
const viaFa = (slots, s) => !slots.includes(s.id) && slots.some(x => FA_DAY[x] === s.day) && !slots.some(x => SLOT[x] && clash(x, s.id))
// 집계 순서(관리자 매뉴얼): 소유자의 참가 계정 수 많은 순 → 1순위 포지션(스코어러 > 중열 > 센터) → 계정 이름(가나다 · 영문)
const roleRank = a => { const i = ROLES.findIndex(r => r.id === a.roles[0]); return i < 0 ? ROLES.length : i }
const byTally = (x, y) => y.count - x.count || roleRank(x) - roleRank(y) || x.n.localeCompare(y.n, 'ko')
/** 계정 이름 — 마우스를 올리면 소유자의 참가 계정 수 */
const nickEl = (a, tag = 'b') => h(tag, { className: 'ar-cnt', title: `${a.owner} 님 참가 계정 ${a.count}개` }, a.n)

const key = (u, n) => `${u}\n${n}`
const addDays = (w, n) => new Date(Date.parse(`${w}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const slotWhen = (week, s) => `${weekLabel(week).split(' ~ ')[s.day]} ${s.time} ~ ${s.end}`
const errBox = () => h('p', { className: 'rc-form-err', role: 'alert', hidden: true })
const show = (box, msg) => { box.textContent = msg; box.hidden = !msg }

const PLAN_PAGE = location.pathname.startsWith('/arena/plan')   // 편성 페이지 — 이번 주만
let week = PLAN_PAGE ? '' : new URLSearchParams(location.search).get('w') || ''   // '' = 이번 주(서버가 정한다)
let data = null      // GET /api/arena — { week, current, signups, plan, planAt, missing }
let plan = {}        // 편성표 사본 { 시간대: [[{ u, n }]] } — 관리자가 고친다
let accts = new Map()   // 신청한 계정 key → { u, n, owner(본계 닉네임), roles, chars, bt, slots, count(소유자의 참가 계정 수), i(그 사람 계정 중 프로필 순서, 0 = 대표) }
let tab = 'all'
// 편성 대기 목록 필터 — 시간대 · 포지션, 여러 개 고르면 하나라도 맞는 계정. 비어 있으면 미배정 · 전체
const poolPick = new Set(), rolePick = new Set()
// 편성의 「자세히 보기」 — 칩마다 캐릭터(레벨)가 펼쳐진다. 처음엔 켜져 있고, 끄면 이 브라우저에 기억한다
const DETAIL_KEY = 'dc.arena.detail'
let detail = (() => { try { return localStorage.getItem(DETAIL_KEY) !== '0' } catch { return true } })()
// 편성 대기 목록의 계정 칸 높이(px) — 아래 막대를 끌어 바꾸고 이 브라우저에 기억한다. 0 = 기본(CSS)
const POOL_H_KEY = 'dc.arena.poolH'
let poolH = (() => { try { return +localStorage.getItem(POOL_H_KEY) || 0 } catch { return 0 } })()
let draft = null     // 신청 폼 상태 — 다시 그려도 남는다. 신청 · 취소하면 서버 값으로 다시 채운다

async function load() {
  try { data = await api(`/arena${week ? `?w=${week}` : ''}`) }
  catch (e) { show($('#ar-error'), e.message); return }
  show($('#ar-error'), '')
  week = data.week
  plan = structuredClone(data.plan)
  accts = new Map(data.signups.flatMap(s => s.accounts.map((a, i) => [key(s.userId, a.nick), { u: s.userId, n: a.nick, owner: s.owner, roles: a.roles, chars: a.chars, bt: a.bt, slots: s.slots, count: s.accounts.length, i }])))
  render()
}

const canEdit = () => auth === 'in' && me?.admin && data?.week === data?.current
function render() {
  if (!data) return
  $('#week-label').textContent = `${weekLabel(week)}${week === data.current ? ' · 이번 주' : ''}`
  const prev = $('#week-prev'), next = $('#week-next')   // 편성 페이지에는 없다
  if (prev) {
    prev.href = `?w=${addDays(week, -7)}`
    next.href = `?w=${addDays(week, 7)}`
    next.hidden = week >= data.current
  }
  if (!PLAN_PAGE) { renderSignup(); openFromLink() }
  renderPlan()
}

// ================================================================ 참가 신청

/** 페이지에는 신청 상태 요약 + 「신청하기 / 신청 수정」 — 폼은 모달(openSignup) */
function renderSignup() {
  const sec = $('#signup')
  sec.hidden = week !== data.current
  if (sec.hidden) return
  if (auth === 'loading') return sec.replaceChildren(h('p', { className: 'rc-muted' }, '로그인 확인 중…'))
  if (auth !== 'in') return sec.replaceChildren(
    h('h2', {}, '참가 신청'),
    h('p', { className: 'rc-note' }, '로그인하면 내 프로필의 게임 계정으로 이번 주 아레나전에 신청할 수 있어요.'),
    h('div', { className: 'rc-actions' }, h('button', { type: 'button', className: 'primary rc-big', onclick: chooseLogin }, '로그인')))

  const mine = mineOf(), absent = mine?.slots.includes('absent')
  sec.replaceChildren(
    h('div', { className: 'ar-form-head' }, h('h2', {}, '참가 신청'),
      h('span', { className: `ar-state${mine ? ' is-on' : ''}` }, mine ? `신청 완료 · ${mine.slots.map(s => TAG[s] || LABEL[s]).join(' ')}` : '미신청')),
    h('p', { className: 'rc-note' }, !mine ? '아직 이번 주 신청을 안 했어요. 참석할 시간과 계정을 골라 신청해 주세요.'
      : absent ? `사유불참${mine.memo ? ` · ${mine.memo}` : ''}`
      : `계정 ${mine.accounts.map(a => a.nick).join(', ')}${mine.memo ? ` · 메모 ${mine.memo}` : ''}`),
    mine && !absent ? myTeams() : '',   // replaceChildren 은 undefined 를 글자로 넣는다
    h('div', { className: 'rc-actions' },
      mine && h('button', { type: 'button', className: 'danger', onclick: cancel }, '신청 취소'),
      h('button', { type: 'button', className: 'primary rc-big', onclick: openSignup }, mine ? '신청 수정' : '신청하기')))
  renderForm()   // 모달이 열려 있으면 새로 읽은 값으로(적던 것은 draft 에 남아 있다)
}

/** 내 배정 — 시간대마다 어느 팀에 어느 계정으로, 같은 팀은 누구(참가 계정 · 본계정 · 포지션). 편성표는 누구나 보니 여기서도 그대로 보여 준다 */
function myTeams() {
  const who = a => a.owner === a.n ? [h('b', {}, a.n), h('small', {}, ' 본계정')] : [h('b', {}, a.n), h('small', {}, ` 본계 ${a.owner}`)]
  const rows = SLOTS.flatMap(s => teamsOf(s.id).flatMap((tm, ti) => {
    const self = tm.find(x => x.u === me.id)
    if (!self) return []
    const a = accts.get(key(self.u, self.n)) || { n: self.n, owner: self.n, roles: [] }
    const mates = tm.filter(x => x !== self).map(x => accts.get(key(x.u, x.n))).filter(Boolean)
    const lead = m => m.u === tm[0].u && m.n === tm[0].n && leadTag()
    const row = h('li', {},
      h('div', { className: 'ar-mine-slot' }, h('b', {}, `${s.label} ${ti + 1}팀`), h('small', {}, slotWhen(week, s))),
      h('div', { className: 'ar-mine-me' }, h('span', { className: 'ar-mine-k' }, '내 계정'), ...who(a), roleTags(a.roles), lead(self)),
      h('div', { className: 'ar-mine-mates' }, h('span', { className: 'ar-mine-k' }, '같은 팀'),
        mates.length ? mates.map(m => h('span', { className: 'ar-mate' }, ...who(m), roleTags(m.roles), lead(m))) : h('span', { className: 'rc-muted' }, '아직 혼자예요')))
    return [row]
  }))
  return h('div', { className: 'ar-mine' }, h('p', { className: 'ar-mine-title' }, '내 배정'),
    rows.length ? h('ul', {}, rows) : h('p', { className: 'rc-muted' }, '아직 배정 전이에요 — 운영진이 편성하면 여기에 팀과 팀원이 보여요'))
}

// 신청 모달 — ✕ · 신청 완료로만 닫는다. 바깥을 누르거나 Esc 로는 안 닫혀 적던 것이 날아가지 않는다.
// 머리 · 몸통은 한 번만 만들고 폼만 바꿔 끼운다 — 체크할 때마다 다시 그려도 모달 스크롤이 맨 위로 튀지 않게
let dlg = null, dlgBody = null
function openSignup() {
  if (!dlg) {
    dlgBody = h('div', { className: 'ar-dlg-body recruit ar' })   // body 에 붙어 main(.recruit) 밖이라 폼 스타일을 같이 받게
    dlg = h('dialog', { className: 'rc-dialog ar-signup-dialog', 'aria-labelledby': 'signup-title' },
      h('header', {}, h('h2', { id: 'signup-title' }, '이번 주 참가 신청'), h('button', { type: 'button', 'aria-label': '닫기', onclick: () => dlg.close() }, '✕')),
      dlgBody)
    dlg.addEventListener('cancel', e => e.preventDefault())   // Esc
    document.body.append(dlg)
  }
  draft = null   // 열 때마다 서버에 저장된 신청에서 시작
  dlg.showModal()
  dlg.scrollTop = 0
  renderForm()
}
// 홈 · 마이페이지의 「신청하기」(/arena/#signup) — 로그인이 확인되면 한 번 연다
function openFromLink() {
  if (location.hash !== '#signup' || auth !== 'in' || !data || week !== data.current || PLAN_PAGE) return
  history.replaceState(null, '', location.pathname + location.search)
  openSignup()
}

function renderForm() {
  if (!dlg?.open) return
  const mine = mineOf()
  if (!draft) {
    const accounts = accountsOf(me.profile?.entries)
    draft = { accounts, slots: new Set(mine?.slots.filter(s => LABEL[s])), nicks: new Set(mine ? mine.accounts.map(a => a.nick) : accounts.slice(0, 1).map(a => a.nick)), memo: mine?.memo || '' }   // 없어진 시간대(잠깐 있던 1차 올포)는 빼야 다시 저장된다
    // 처음 신청이면 지난번에 낸 계정을 기본으로
    if (!mine) api('/arena/mine', { withToken: true }).then(r => {
      const last = r.history.find(x => x.week !== week && x.nicks.length)
      if (!last || mineOf() || !draft) return
      const have = new Set(draft.accounts.map(a => a.nick)), pick = last.nicks.filter(n => have.has(n))
      if (pick.length) { draft.nicks = new Set(pick); renderForm() }
    }).catch(() => {})
  }
  const d = draft, absent = d.slots.has('absent'), err = errBox()

  const opt = (c, sub) => {
    const box = h('input', { type: 'checkbox', checked: d.slots.has(c.id), onchange: () => {
      if (box.checked) {
        if (c.id === 'absent') d.slots.clear()
        else d.slots.delete('absent')
        d.slots.add(c.id)
      } else d.slots.delete(c.id)
      renderForm()
    } })
    return h('label', { className: 'ar-opt' }, box, h('span', {}, c.label), sub && h('small', {}, sub))
  }

  // 계정 — 프로필이 있으면 고칠 때마다 프로필에 바로 저장한다(마이페이지와 같은 계정). 없으면 신청할 때 프로필도 같이 만든다
  const person = me.profile ? null : d.person ||= personFields(null)   // 다시 그려도 적던 이름이 남게 한 번만 만든다
  async function edit(a) {
    const r = await editAccount(a, d.accounts)
    if (!r) return
    const next = applyEdit(d.accounts, a, r)
    if (me.profile) {
      try { d.accounts = accountsOf((await saveProfile({ name: me.profile.name, mic: me.profile.mic, accounts: next })).entries) }
      catch (e) { return show(err, e.message) }
    } else d.accounts = next
    if (r === 'delete') d.nicks.delete(a.nick)
    else {
      if (a && a.nick !== r.acct.nick && d.nicks.delete(a.nick)) d.nicks.add(r.acct.nick)   // 닉네임을 바꿔도 고른 채로
      if (!a) d.nicks.add(r.acct.nick)   // 새 계정은 바로 고른다
    }
    renderForm()
  }
  const list = h('ul', { className: `ac-list${absent ? ' is-off' : ''}` }, d.accounts.length
    ? d.accounts.map((a, i) => accountRow(a, i, { checked: d.nicks.has(a.nick), onCheck: on => { on ? d.nicks.add(a.nick) : d.nicks.delete(a.nick); renderForm() }, onEdit: () => edit(a) }))
    : h('li', { className: 'ac-empty' }, '등록된 계정이 없어요 — 「+ 계정 추가」 로 게임 닉네임과 캐릭터를 넣어 주세요'))
  const picked = d.accounts.filter(a => d.nicks.has(a.nick)).length, allOn = picked === d.accounts.length
  // 계정이 둘 이상이면 한 번에 고르거나 빼기
  const toggleAll = d.accounts.length > 1 && h('button', { type: 'button', className: 'ar-all', disabled: absent,
    onclick: () => { d.nicks = new Set(allOn ? [] : d.accounts.map(a => a.nick)); renderForm() } }, allOn ? '전체 해제' : '전체 선택')
  const memo = h('input', { type: 'text', maxLength: A.memo, value: d.memo, placeholder: absent ? '불참 사유 (선택)' : '예) 2차는 늦게 들어가요', oninput: () => { d.memo = memo.value } })

  const submit = h('button', { type: 'submit', className: 'primary rc-big' }, mine ? '신청 수정' : '신청하기')
  const form = h('form', { className: 'ar-form', novalidate: true },
    h('h3', {}, '1. 참석 가능한 시간'),
    h('div', { className: 'ar-opts' }, SLOTS.map(s => opt(s, `${s.time} ~ ${s.end === A.closeAt ? '종료' : s.end}`))),
    h('div', { className: 'ar-opts is-extra' }, A.extra.map(c => opt(c))),
    h('p', { className: 'rc-muted' }, '여러 개 선택 가능 · 1.5차는 20:00 부터 종료까지 · 실제 배정은 운영진이 진행해요'),
    h('div', { className: 'ar-acc-head' }, h('h3', {}, '2. 이번 주 참가 계정 ', h('small', { className: 'ar-count' }, absent ? '불참' : `${picked}개 계정`)), toggleAll),
    person && h('div', { className: 'ar-first' }, h('p', { className: 'rc-muted' }, '처음이에요 — 프로필에 쓸 이름과 마이크도 한 번 정해 주세요'), person.el),
    list,
    h('div', { className: 'rc-add' }, h('button', { type: 'button', onclick: () => edit(null) }, '+ 계정 추가')),
    h('p', { className: 'rc-muted' }, '아레나전에 실제로 쓸 계정만 골라 주세요. 계정 · 포지션 · 캐릭터는 내 프로필에 저장되어 다음 주에도 그대로예요'),
    h('label', { className: 'rc-fld ar-memo' }, h('span', {}, absent ? '불참 사유' : '메모 ', h('small', {}, '선택')), memo),
    err,
    h('div', { className: 'rc-actions' },
      mine && h('button', { type: 'button', className: 'danger', onclick: cancel }, '신청 취소'),
      submit))
  form.onsubmit = async e => {
    e.preventDefault()
    const slots = [...d.slots], nicks = d.accounts.filter(a => d.nicks.has(a.nick)).map(a => a.nick)
    const noRole = !absent && d.accounts.find(a => d.nicks.has(a.nick) && !a.roles.length)
    const bad = !slots.length ? '참석할 시간을 골라 주세요' : !d.accounts.length ? '계정을 하나 이상 등록해 주세요'
      : !absent && !nicks.length ? '참가할 계정을 골라 주세요' : noRole ? `「${noRole.nick}」 계정의 주력 포지션을 정해 주세요 — ✎ 로 고쳐요` : ''
    if (bad) return show(err, bad)
    const p = person && person.read()
    if (person && !p) return
    submit.disabled = true
    try {
      if (p) await saveProfile({ ...p, accounts: d.accounts })
      await api('/arena/signup', { method: 'PUT', withToken: true, body: { slots, nicks: absent ? [] : nicks, memo: d.memo } })
      draft = null
      dlg.close()
      await load()
    } catch (e) { show(err, e.message) }
    finally { submit.disabled = false }
  }
  dlgBody.replaceChildren(form)
}
const mineOf = () => data?.signups.find(s => s.userId === me?.id)

async function cancel() {
  if (!confirm('이번 주 아레나 신청을 취소할까요? 편성표에서도 빠져요')) return
  try { await api('/arena/signup', { method: 'DELETE', withToken: true }) }
  catch (e) { return alert(e.message) }
  draft = null
  dlg?.close()
  load()
}

// ================================================================ 편성 결과

/** 계정 → [{ slot, team }] 배정 */
function placements() {
  const at = new Map()
  for (const s of SLOTS) (plan[s.id] || []).forEach((tm, i) => tm.forEach(a => {
    const k = key(a.u, a.n)
    at.set(k, [...at.get(k) || [], { slot: s.id, team: i + 1 }])
  }))
  return at
}
const teamsOf = id => (plan[id] || []).filter(t => t.length)

function renderPlan() {
  const sec = $('#plan')
  sec.hidden = false
  const at = placements()
  const players = data.signups.filter(s => !s.slots.includes('absent'))
  const placedUsers = new Set([...at.keys()].map(k => k.split('\n')[0]))
  const nTeams = SLOTS.reduce((n, s) => n + teamsOf(s.id).length, 0), edit = PLAN_PAGE && canEdit()
  const stat = (label, n, unit, cls = '') => h('div', { className: `ar-stat ${cls}` }, h('small', {}, label), h('b', {}, n, h('span', {}, unit)))

  const head = h('div', { className: 'ar-plan-head' },
    h('div', {}, !PLAN_PAGE && h('h2', {}, '아레나전 편성 결과'), h('p', { className: 'rc-muted' }, `${PLAN_PAGE ? '' : `${weekLabel(week)} · `}총 ${nTeams}팀 · 팀당 ${A.teamSize}명`)),   // 편성 페이지는 제목 · 주가 위에 있다
    h('div', { className: 'ar-tools' },
      !PLAN_PAGE && nTeams > 0 && shareButtons(),
      edit && nTeams > 0 && h('button', { type: 'button', onclick: saveExcel }, '엑셀 저장'),   // 편성 페이지 · 관리자만
      PLAN_PAGE ? h('a', { className: 'btn', href: '/arena/' }, '← 신청 · 결과 보기')
        : canEdit() && h('a', { className: 'btn primary', href: '/arena/plan/' }, '편성하기')))

  const stats = h('div', { className: 'ar-stats' },
    stat('참가 신청', players.length, '명'),
    stat('배정 완료', players.filter(s => placedUsers.has(s.userId)).length, '명', 'is-ok'),
    stat('대기', players.filter(s => !placedUsers.has(s.userId)).length, '명', 'is-wait'),
    stat('참가 계정', accts.size, '개'))

  // 편성 페이지인데 관리자가 아니면(로그인 확인 중 · 일반 멤버) 안내만
  if (PLAN_PAGE && !edit) return sec.replaceChildren(head, h('p', { className: 'card rc-note' },
    auth === 'loading' ? '로그인 확인 중…' : auth !== 'in' ? '관리자로 로그인해야 편성할 수 있어요.' : '관리자만 편성할 수 있어요.'))
  sec.replaceChildren(head, stats, ...edit ? editor() : [tallyCard(), missingCard(), teamsCard(), membersCard(at), chartCard(), mixCard()].filter(Boolean))
  if (nTeams && !edit) queueShot()
}

/** 집계표(관리자 매뉴얼) — 신청 시간대별로 사람마다 한 줄(본계정), 집계 순서(계정 수 → 1순위 포지션 → 본계정 닉네임).
 *  부계정은 「상세」 로 펼친다 — 최종 명단은 팀별 편성 명단이다. 사유불참은 사유 */
let tallyTab = 'all'
const opened = new Set()   // 상세를 펼친 줄 '<시간대>:<userId>' — 누른 시간대의 그 사람만 펼친다
// 사람의 대표 계정 = 신청한 계정 중 프로필 순서가 가장 앞(대개 본계정)
const lead = s => accts.get(key(s.userId, s.accounts[0].nick))
const byOwner = (x, y) => byTally({ ...lead(x), n: x.owner }, { ...lead(y), n: y.owner })
function tallyCard() {
  const groups = [...SLOTS, ...A.extra].map(c => {
    const who = data.signups.filter(s => s.slots.includes(c.id))
    return { c, who, rows: who.filter(s => s.accounts.length).sort(byOwner) }
  })
  const tabs = h('div', { className: 'ar-tabs', role: 'tablist' }, [{ id: 'all', short: '전체' }, ...SLOTS, ...A.extra].map(c => {
    const g = groups.find(x => x.c.id === c.id)
    return h('button', { type: 'button', role: 'tab', 'aria-selected': tallyTab === c.id, onclick: () => { tallyTab = c.id; renderPlan() } },
      g ? `${c.short} (${g.who.length})` : '전체')
  }))
  const acctCells = a => [h('td', {}, roleTags(a.roles)), h('td', { className: 'ar-chars-cell', title: charNames(a.chars, a.bt) }, charNames(a.chars, a.bt))]
  const personRows = (s, i, slot) => {
    const a = lead(s), more = s.accounts.length > 1, id = `${slot}:${s.userId}`, open = more && opened.has(id)
    const toggle = more && h('button', { type: 'button', className: 'ar-more', 'aria-expanded': open, onclick: () => { open ? opened.delete(id) : opened.add(id); renderPlan() } },
      open ? '접기' : [h('span', { className: 'ar-long' }, '상세 '), `+${s.accounts.length - 1}`])   // 휴대폰은 「+3」 만
    const owner = h('b', { className: 'ar-cnt' }, s.owner), count = h('span', { className: 'ar-cnt' }, `${a.count}개`)
    return [
      h('tr', {}, h('td', {}, i + 1), h('td', { className: 'ar-nick' }, owner, a.n !== s.owner && h('small', {}, `참가 ${a.n}`), h('small', { className: 'ar-inline-chars' }, charNames(a.chars, a.bt))), ...acctCells(a), h('td', {}, count), h('td', {}, toggle)),
      ...open ? s.accounts.slice(1).map(x => {
        const sub = accts.get(key(s.userId, x.nick))
        return h('tr', { className: 'ar-sub' }, h('td', {}), h('td', { className: 'ar-nick' }, h('span', { className: 'ac-kind' }, '부계정'), ` ${sub.n}`, h('small', { className: 'ar-inline-chars' }, charNames(sub.chars, sub.bt))), ...acctCells(sub), h('td', {}), h('td', {}))
      }) : [],
    ]
  }
  const sections = groups.filter(g => tallyTab === 'all' || tallyTab === g.c.id).map(({ c, who, rows }) => {
    const sec = h('div', { className: 'ar-slot' },
      h('div', { className: 'ar-slot-head' }, h('b', {}, c.short), h('span', {}, c.id === 'absent' ? `${who.length}명` : `${who.length}명 · ${who.reduce((n, s) => n + s.accounts.length, 0)}계정`),
        SLOT[c.id] && h('small', {}, slotWhen(week, SLOT[c.id]))),
      c.id === 'absent'
        ? h('p', { className: 'ar-absent' }, who.map(s => s.memo ? `${s.owner}(${s.memo})` : s.owner).join(', ') || '-')
        : rows.length ? h('div', { className: 'ar-table-wrap' }, h('table', { className: 'ar-table ar-tally' },
          h('thead', {}, h('tr', {}, ['#', '본계정', '포지션', '보유 캐릭터', '계정 수', ''].map(t => h('th', {}, t)))),
          h('tbody', {}, rows.flatMap((x, i) => personRows(x, i, c.id)))))   // 사람마다 [본계정 줄, 펼친 부계정 줄들]
          : h('p', { className: 'rc-muted ar-none' }, '아직 없어요'))
    return sec
  })
  return h('section', { className: 'card ar-card' }, h('h3', {}, '집계표'), tabs, sections)
}

/** 이번 주 미신청 — 프로필(게임 계정)은 있는데 이번 주 신청이 없는 사람의 본계정 닉네임 */
function missingCard() {
  if (week !== data.current) return null
  const names = [...data.missing].sort((a, b) => a.localeCompare(b, 'ko'))
  return h('section', { className: 'card ar-card' },
    h('h3', {}, `이번 주 미신청 ${names.length}명`),
    names.length ? h('ol', { className: 'ar-missing' }, names.map(n => h('li', {}, n))) : h('p', { className: 'rc-muted' }, '모두 신청했어요'))
}

/** 멤버별 배치 현황 — 행 = 사람(본계정), 칸 = 시간대마다 몇 팀. 한 사람은 한 시간대에 한 팀뿐이라(겹치는 시간대 규칙) 부계정 배치도 그 줄에 — 뱃지에 마우스를 올리면 뛰는 계정 */
function membersCard(at) {
  const order = data.signups.filter(s => s.accounts.length).map(s => ({ s, where: s.accounts.flatMap(a => (at.get(key(s.userId, a.nick)) || []).map(w => ({ ...w, n: a.nick }))) }))
  const rank = x => Math.min(1e6, ...x.where.map(w => SLOTS.findIndex(s => s.id === w.slot) * 100 + w.team))
  order.sort((x, y) => rank(x) - rank(y) || byOwner(x.s, y.s))
  const body = order.map(({ s: p, where }, i) => h('tr', {},
    h('td', {}, i + 1),
    h('td', { className: 'ar-nick' }, h('b', { className: 'ar-cnt', title: p.accounts.map(a => a.nick).join(', ') }, p.owner), p.accounts.length > 1 && h('small', {}, `계정 ${p.accounts.length}개`)),
    SLOTS.map(s => {
      const w = where.find(x => x.slot === s.id)
      return h('td', {}, w ? h('span', { className: 'ar-badge', title: w.n }, `${w.team}팀`)
        : p.slots.includes(s.id) ? h('span', { className: 'ar-want', title: '신청' }, h('span', { className: 'ar-long' }, '신청'), h('span', { className: 'ar-short' }, '○'))   // 휴대폰은 ○
        : viaFa(p.slots, s) ? h('span', { className: 'ar-want', title: 'FA (시간 미정 · 용병)' }, 'FA') : h('span', { className: 'ar-dash' }, '-'))
    }),
    h('td', {}, h('span', { className: `ar-st${where.length ? ' is-ok' : ''}` }, where.length ? '확정' : '대기'))))
  return h('section', { className: 'card ar-card' },
    h('h3', {}, '멤버별 배치 현황'),
    body.length ? h('div', { className: 'ar-table-wrap' }, h('table', { className: 'ar-table' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, '본계정'), SLOTS.map(s => h('th', {}, h('span', { className: 'ar-long' }, s.short), h('span', { className: 'ar-short' }, TAG[s.id]))), h('th', {}, '상태'))),
      h('tbody', {}, body)))
      : h('p', { className: 'rc-muted' }, '아직 참가 신청이 없어요.'))
}

/** 팀별 편성 명단 — 탭: 전체 · 시간대 */
function teamsCard() {
  const tabs = h('div', { className: 'ar-tabs', role: 'tablist' },
    [{ id: 'all', short: '전체' }, ...SLOTS].map(s => h('button', { type: 'button', role: 'tab', 'aria-selected': tab === s.id, onclick: () => { tab = s.id; renderPlan() } },
      s.id === 'all' ? '전체' : `${s.short} (${teamsOf(s.id).length}팀)`)))
  const blocks = SLOTS.filter(s => tab === 'all' || tab === s.id).map(s => {
    const teams = teamsOf(s.id)
    const el = h('div', { className: 'ar-slot' },
      h('div', { className: 'ar-slot-head' }, h('b', {}, s.short), h('span', {}, `(${teams.length}팀)`), h('small', {}, slotWhen(week, s))),
      teams.length ? h('div', { className: 'ar-teams' }, teams.map((tm, i) => h('div', { className: 'ar-team' },
        h('div', { className: 'ar-team-head' }, `${s.short} - ${i + 1}팀`),
        h('div', { className: 'ar-members' }, tm.map((x, j) => memberCard(accts.get(key(x.u, x.n)) || { u: x.u, n: x.n, owner: '', chars: [] }, j === 0))))))
        : h('p', { className: 'rc-muted ar-none' }, '아직 편성 전이에요'))
    return el
  })
  return h('section', { className: 'card ar-card' }, h('h3', {}, '팀별 편성 명단'), tabs, blocks)
}

// 팀장 = 그 팀에 처음 넣은 계정(팀 배열의 맨 앞). 팀장을 빼면 다음 사람이 팀장이 된다
const leadTag = () => h('span', { className: 'ar-lead' }, '팀장')

function memberCard(a, lead) {
  const mine = auth === 'in' && a.u === me?.id
  const el = h('div', { className: `ar-member${mine ? ' is-me' : ''}${lead ? ' is-lead' : ''}` },
    lead && leadTag(),
    a.chars[0] ? h('img', { src: faceOf(P(a.chars[0])), alt: '' }) : h('span', { className: 'rc-hole' }),
    h('div', { className: 'ar-who' }, a.count ? nickEl(a) : h('b', {}, a.n), h('small', {}, a.owner && a.owner !== a.n ? a.owner : ''), a.roles && roleTags(a.roles)),
    charTags(a, 3))   // 캐릭터가 많으면 앞 3개 + 나머지 수
  return el
}

/** 캐릭터 뱃지(레벨). max 를 주면 앞 max 개 + 나머지 수 */
function charTags(a, max = Infinity) {
  return h('div', { className: 'ar-chars' }, a.chars.slice(0, max).map(id => h('span', {}, `${P(id).short || P(id).name}${a.bt?.[id] ? ` ${a.bt[id]}렙` : ''}`)), a.chars.length > max && h('em', { title: charNames(a.chars.slice(max), a.bt) }, `+${a.chars.length - max}`))
}

/** 막대 한 줄 — 이름 · 비율(0~1) · 뒤에 붙는 수. 막대는 CSS 로만 그린다 */
function barRow(label, ratio, rest) {
  const pct = `${Math.round(ratio * 100)}%`, fill = h('i', {})
  fill.style.width = pct
  return h('div', { className: 'ar-bar' }, h('span', { className: 'ar-bar-label' }, label), h('span', { className: 'ar-bar-track' }, fill),
    h('span', { className: 'ar-bar-val' }, h('b', {}, pct), ` ${rest}`))
}

/** 도넛 — parts = [[이름, 수]], 합이 n(100%)일 때만 쓴다. 색은 강조색을 차례로 옅게, 「미정」은 회색 */
function donut(parts, n, unit) {
  const color = (i, label) => label === '미정' ? 'var(--muted)' : `color-mix(in srgb, var(--accent) ${100 - i * 24}%, var(--panel-2))`
  const pct = k => `${Math.round(k / n * 100)}%`
  let at = 0
  const ring = h('div', { className: 'ar-donut', role: 'img', 'aria-label': parts.map(([label, k]) => `${label} ${pct(k)}`).join(', ') }, h('b', {}, n), h('small', {}, unit))
  ring.style.background = `conic-gradient(${parts.map(([label, k], i) => `${color(i, label)} ${at}% ${at += k / n * 100}%`).join(', ')})`
  return h('div', { className: 'ar-donut-wrap' }, ring, h('ul', { className: 'ar-donut-key' }, parts.map(([label, k], i) => {
    const dot = h('i', {})
    dot.style.background = color(i, label)
    return h('li', {}, dot, h('span', {}, label), h('b', {}, pct(k)), h('small', {}, `${k}${unit}`))
  })))
}

/** 요일 · 시간대별 참여 — 이번 주 신청한 사람(사유불참 빼고) 중 그 시간대를 고른 비율 */
function chartCard() {
  const players = data.signups.filter(s => !s.slots.includes('absent')), n = players.length
  const pct = k => n ? Math.round(k / n * 100) : 0
  const bar = (id, label) => {
    const who = players.filter(s => s.slots.includes(id)), accounts = who.reduce((k, s) => k + s.accounts.length, 0)
    return barRow(label, n && who.length / n, `${who.length}명 · ${accounts}계정`)
  }
  const days = ['토요일', '일요일'].map((name, day) => {
    const any = players.filter(p => p.slots.some(x => (SLOT[x]?.day ?? FA_DAY[x]) === day)).length
    return h('div', { className: 'ar-chart-day' },
      h('div', { className: 'ar-chart-head' }, h('b', {}, name), h('small', {}, `${any}명 참여 · ${pct(any)}%`)),
      SLOTS.filter(s => s.day === day).map(s => bar(s.id, `${s.short.split(' ').slice(1).join(' ')} ${s.time}`)),
      A.extra.filter(c => c.day === day).map(c => bar(c.id, 'FA 시간 미정')))
  })
  const absent = data.signups.length - n
  return h('section', { className: 'card ar-card' },
    h('h3', {}, '요일 · 시간대별 참여'),
    h('p', { className: 'rc-muted' }, n ? `참가 신청 ${n}명 기준(한 사람이 여러 시간대를 고를 수 있어 합이 100% 를 넘어요)${absent ? ` · 사유불참 ${absent}명 제외` : ''}` : '아직 참가 신청이 없어요'),
    n > 0 && h('div', { className: 'ar-chart' }, days))
}

/** 포지션 · 캐릭터 비율 — 이번 주 참가 계정(사유불참은 계정이 없다) 기준. 포지션은 1순위, 캐릭터는 계정마다 고른 주력 캐릭터 */
function mixCard() {
  const list = [...accts.values()], n = list.length
  if (!n) return null
  const roles = [...ROLES, { id: undefined, label: '미정' }].map(r => [r.label, list.filter(a => a.roles[0] === r.id).length]).filter(([, k]) => k)
  const count = new Map()
  for (const a of list) for (const id of a.chars) count.set(id, (count.get(id) || 0) + 1)
  const name = id => P(id).short || P(id).name
  const chars = [...count].sort((x, y) => y[1] - x[1] || name(x[0]).localeCompare(name(y[0]), 'ko'))
  const head = (title, sub) => h('div', { className: 'ar-chart-head' }, h('b', {}, title), h('small', {}, sub))
  return h('section', { className: 'card ar-card' },
    h('h3', {}, '포지션 · 캐릭터 비율'),
    h('p', { className: 'rc-muted' }, `참가 계정 ${n}개 기준 · 캐릭터는 한 계정이 여럿 고를 수 있어 합이 100% 를 넘어요`),
    h('div', { className: 'ar-chart ar-mix' },
      h('div', { className: 'ar-chart-day' }, head('포지션', '1순위'), donut(roles, n, '계정')),
      h('div', { className: 'ar-chart-day' }, head('캐릭터', `${chars.length}종`),
        h('div', { className: 'ar-mix-chars' }, chars.map(([id, k]) => barRow([h('img', { src: faceOf(P(id)), alt: '' }), h('span', {}, name(id))], k / n, `${k}계정`))))))
}

// ================================================================ 편성(관리자) — 끌어다 놓거나, 눌러서 고른다. 바꿀 때마다 저장

const status = h('p', { className: 'ar-status', role: 'status' })
const say = (msg, bad = false) => { status.textContent = msg; status.classList.toggle('is-bad', bad) }

function editor() {
  const busy = (slot, u) => SLOTS.some(s => clash(slot, s.id) && teamsOf(s.id).some(tm => tm.some(x => x.u === u)))   // 겹치는 시간대에 이미 있다
  const at = placements()
  // 사람끼리 모은다 — 사람 순서는 대표 계정(프로필에서 가장 앞)의 집계 순서, 그 안은 프로필 순서(본계정 → 부계정)
  const leads = new Map([...accts.values()].filter(a => a.i === 0).map(a => [a.u, a]))
  const all = [...accts.values()].sort((x, y) => x.u === y.u ? x.i - y.i : byTally(leads.get(x.u), leads.get(y.u)) || x.u.localeCompare(y.u))
  // 시간대 필터 — 그 칸을 직접 고른 사람만(FA 는 FA 칸에서만), 겹치는 시간대에 이미 들어갔으면 뺀다.
  // FA 는 그날 넣을 시간대가 남은 사람만 — 1차 · 2차 둘 다(또는 1.5차) 뛰면 빠진다
  const fits = (a, id) => a.slots.includes(id) && (id in FA_DAY ? SLOTS.some(s => s.day === FA_DAY[id] && !busy(s.id, a.u)) : !busy(id, a.u))
  const bySlot = poolPick.size ? all.filter(a => [...poolPick].some(id => fits(a, id))) : all.filter(a => !at.has(key(a.u, a.n)))
  // 포지션 필터 — 1순위나 2순위가 그 포지션인 계정(올포는 모든 포지션). 고른 포지션이 1순위인 계정이 있는 사람이 먼저(사람 묶음은 그대로 — 안정 정렬)
  const plays = (a, r) => a.roles.includes(r) || a.roles[0] === ALLPOS
  const pool = !rolePick.size ? bySlot : bySlot.filter(a => [...rolePick].some(r => plays(a, r)))
  const top = new Set(pool.filter(a => rolePick.has(a.roles[0])).map(a => a.u))
  pool.sort((x, y) => top.has(y.u) - top.has(x.u))
  // 한 사람의 계정이 둘 이상 남았으면 한 칸에 묶는다 — 같은 시간대엔 그중 한 계정만 뛴다
  const groups = []
  for (const a of pool) {
    if (groups.at(-1)?.[0].u !== a.u) groups.push([])
    groups.at(-1).push(a)
  }
  // 누르면 켜고 끈다 · 미배정 / 전체는 모두 끈다
  const pick = (set, id) => () => { id === 'all' ? set.clear() : set.has(id) ? set.delete(id) : set.add(id); renderPlan() }
  const on = (set, id) => id === 'all' ? !set.size : set.has(id)
  const roleTabs = h('div', { className: 'ar-tabs ar-role-tabs' }, [{ id: 'all', label: '전체' }, ...ROLES].map(r => {
    const n = r.id === 'all' ? bySlot.length : bySlot.filter(a => plays(a, r.id)).length
    return h('button', { type: 'button', 'aria-selected': on(rolePick, r.id), onclick: pick(rolePick, r.id) }, `${r.label} ${n}`)
  }))
  const poolTabs = h('div', { className: 'ar-tabs' }, [{ id: 'all', short: '미배정' }, ...SLOTS, ...FAS].map(s =>
    h('button', { type: 'button', 'aria-selected': on(poolPick, s.id), onclick: pick(poolPick, s.id) }, s.short)))
  // 계정 칸만 따로 세로 스크롤(필터는 그대로) · 아래 막대를 위아래로 끌어 높이 조절
  const chips = h('div', { className: 'ar-chips' }, groups.length ? groups.map(g => g.length > 1 ? h('div', { className: 'ar-group', title: `${g[0].owner} 님 계정` }, g.map(a => chip(a, null))) : chip(g[0], null))
    : h('span', { className: 'rc-muted' }, '없어요'))
  if (poolH) chips.style.height = `${poolH}px`
  const grip = h('div', { className: 'ar-grip', title: '위아래로 끌어 높이 조절', 'aria-hidden': 'true' })
  grip.onpointerdown = e => {
    e.preventDefault()
    const y0 = e.clientY, h0 = chips.offsetHeight
    grip.setPointerCapture(e.pointerId)
    grip.onpointermove = m => { poolH = Math.max(80, Math.round(h0 + m.clientY - y0)); chips.style.height = `${poolH}px` }
    grip.onpointerup = grip.onpointercancel = () => {
      grip.onpointermove = null
      try { localStorage.setItem(POOL_H_KEY, poolH) } catch {}
    }
  }
  const poolBox = h('section', { className: 'card ar-pool', 'data-drop': 'pool' },
    h('div', { className: 'ar-pool-head' }, h('h3', {}, '배치할 계정'), h('small', { className: 'rc-muted' }, '끌어서 배치하거나, 눌러서 팀을 고르세요'),
      h('button', { type: 'button', className: 'ar-detail-btn', 'aria-pressed': detail, onclick: () => {
        detail = !detail
        try { localStorage.setItem(DETAIL_KEY, detail ? '1' : '0') } catch {}
        renderPlan()
      } }, detail ? '간단히 보기' : '자세히 보기')),
    poolTabs,
    roleTabs,
    h('p', { className: 'rc-muted' }, !poolPick.size ? '어느 시간대에도 안 들어간 계정 · 사람별로 묶어 본계정 → 부계정, 사람 순서는 집계 순서(계정 수 → 포지션 → 이름) · 필터는 여러 개 고를 수 있어요'
      : `${[...poolPick].map(id => TAG[id]).join(' · ')} 중 하나라도 신청한 사람 · 겹치는 시간대에 이미 들어갔으면 빠져요(FA 는 그날 넣을 시간대가 남은 사람)`),
    chips, grip)
  const grid = h('div', { className: 'ar-edit-grid' }, SLOTS.map(s => {
    const teams = teamsOf(s.id)
    const box = h('div', { className: 'ar-slot ar-edit' },
      h('div', { className: 'ar-slot-head' }, h('b', {}, s.label), h('small', {}, `${s.time} · ${teams.length}팀`)),
      teams.map((tm, i) => h('div', { className: `ar-drop${tm.length >= A.teamSize ? ' is-full' : ''}`, 'data-drop': `${s.id}:${i}` },
        h('div', { className: 'ar-drop-head' }, `${i + 1}팀`, h('small', {}, `${tm.length}/${A.teamSize}`)),
        tm.map((x, j) => chip(accts.get(key(x.u, x.n)), { slot: s.id, ti: i }, j === 0)))),
      h('div', { className: 'ar-drop is-new', 'data-drop': `${s.id}:new` }, '+ 새 팀 — 여기에 놓기'))
    return box
  }))
  return [poolBox, status, grid, picksCard()]
}

/** 편성 페이지 맨 아래 — 신청 현황. 신청한 사람마다 한 줄: 고른 시간대 · FA · 불참(고른 그대로) · 참가 계정 · 메모(불참은 사유).
 *  칸은 요일 순(토 1 · 1.5 · 2 · FA → 일 … → 불참), 줄은 불참이 맨 아래 · 그 밖은 본계정 가나다 */
function picksCard() {
  const cols = [...SLOTS, ...A.extra].sort((x, y) => (x.day ?? 9) - (y.day ?? 9))
  const isOut = s => s.slots.includes('absent')
  const rows = [...data.signups].sort((x, y) => isOut(x) - isOut(y) || x.owner.localeCompare(y.owner, 'ko'))
  const excel = () => saveCsv([['본계정', ...cols.map(c => c.short), '참가 계정', '메모'],
    ...rows.map(s => [s.owner, ...cols.map(c => s.slots.includes(c.id) ? 'O' : ''), s.accounts.map(a => a.nick).join(', '), s.memo])], `vipers-arena-signups-${week}.csv`)
  return h('section', { className: 'card ar-card' },
    h('div', { className: 'ar-picks-head' }, h('h3', {}, `신청 현황 ${rows.length}명`, h('small', { className: 'rc-muted' }, ` · 불참 ${rows.filter(isOut).length}명`)),
      rows.length > 0 && h('button', { type: 'button', onclick: excel }, '엑셀 저장')),
    rows.length ? h('div', { className: 'ar-table-wrap' }, h('table', { className: 'ar-table ar-picks' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, '본계정'), cols.map(c => h('th', { title: c.label }, TAG[c.id])), h('th', {}, '참가 계정'), h('th', {}, '메모'))),
      h('tbody', {}, rows.map((s, i) => h('tr', {},
        h('td', {}, i + 1),
        h('td', { className: 'ar-nick' }, h('b', {}, s.owner)),
        cols.map(c => h('td', {}, s.slots.includes(c.id) ? h('span', { className: 'ar-pick', title: c.label }, '✓') : '')),
        h('td', { className: 'ar-nick' }, s.accounts.map(a => a.nick).join(', ') || '-'),
        h('td', { className: 'ar-picks-memo' }, s.memo))))))
      : h('p', { className: 'rc-muted' }, '아직 신청이 없어요'))
}

function chip(a, from, lead = false) {
  // 부계정이면 본계정 닉네임을 따로 한 줄 — 누구 계정인지 먼저 보이게. 「자세히 보기」 면 캐릭터(레벨)까지
  const el = h('div', { className: `ar-chip${detail ? ' is-detail' : ''}${lead ? ' is-lead' : ''}`, tabIndex: 0, title: `${a.owner} · ${a.roles.map(r => ROLES.find(x => x.id === r)?.label).join(' / ')} · ${charNames(a.chars, a.bt)}` },
    lead && leadTag(),
    h('img', { src: faceOf(P(a.chars[0])), alt: '', draggable: false }),
    h('span', { className: 'ar-chip-body' }, h('span', { className: 'ar-chip-top' }, nickEl(a), roleTags(a.roles)),   // 주력 포지션 1 · 2순위
      a.owner !== a.n && h('span', { className: 'ar-owner' }, '본계 ', h('b', {}, a.owner)),
      h('small', {}, `계정 ${a.count} · `, a.slots.map(s => TAG[s]).filter(Boolean).join(' ')),   // 소유자의 참가 계정 수(집계 순서 1번) · 신청 시간대
      detail && charTags(a)))
  el.onpointerdown = e => startDrag(e, el, { onDrop: (x, y, target) => move(a, from, target?.closest('[data-drop]')?.dataset.drop) })
  el.onclick = () => menu(a, from)
  el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menu(a, from) } }
  return el
}

/** a 를 from(팀 자리, 없으면 대기 목록)에서 to('pool' | '<시간대>:<팀 번호>' | '<시간대>:new')로 */
function move(a, from, to) {
  if (!to || (!from && to === 'pool')) return
  const next = structuredClone(plan), same = x => x.u === a.u && x.n === a.n
  if (from) next[from.slot][from.ti] = next[from.slot][from.ti].filter(x => !same(x))
  if (to !== 'pool') {
    const [slot, t] = to.split(':'), teams = next[slot] ||= []
    if (SLOTS.some(o => clash(slot, o.id) && (next[o.id] || []).some(tm => tm.some(x => x.u === a.u)))) return say(`${a.owner} 님은 겹치는 시간대에 이미 들어가 있어요`, true)
    const ti = t === 'new' ? teams.length : +t, team = teams[ti] ||= []
    if (team.length >= A.teamSize) return say(`${ti + 1}팀은 이미 ${A.teamSize}명이에요`, true)
    team.push({ u: a.u, n: a.n })
  }
  plan = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.filter(tm => tm.length)]).filter(([, v]) => v.length))
  renderPlan()
  save()
}

function menu(a, from) {
  const items = []
  if (from) items.push({ label: '빼기 (대기로)', pick: () => move(a, from, 'pool') })
  for (const s of SLOTS) {
    const teams = teamsOf(s.id)
    if (SLOTS.some(o => clash(s.id, o.id) && teamsOf(o.id).some((tm, ti) => tm.some(x => x.u === a.u && !(from?.slot === o.id && from.ti === ti && x.n === a.n))))) continue   // 겹치는 시간대에 이미 있다
    // 배치 현황과 같은 기준 — 직접 고른 시간대는 그대로, FA 로 되는 시간대는 「FA」, 그 밖은 「신청 안 함」
    const note = a.slots.includes(s.id) ? '' : viaFa(a.slots, s) ? ' · FA' : ' · 신청 안 함'
    teams.forEach((tm, ti) => {
      if (tm.length < A.teamSize && !(from?.slot === s.id && from.ti === ti)) items.push({ label: `${s.short} · ${ti + 1}팀 (${tm.length}/${A.teamSize})${note}`, pick: () => move(a, from, `${s.id}:${ti}`) })
    })
    items.push({ label: `${s.short} · 새 팀${note}`, pick: () => move(a, from, `${s.id}:new`) })
  }
  // 메뉴 머리 아래에 포지션 · 캐릭터 — 어느 캐릭터로 뛸 수 있는지 보고 고른다
  pickMenu({ name: a.n, img: faceOf(P(a.chars[0])) }, `${a.owner === a.n ? '본계정' : `본계 ${a.owner}`} · 신청 ${a.slots.map(s => TAG[s] || LABEL[s]).join(' ')}`, items,
    h('div', { className: 'pm-detail' }, roleTags(a.roles), charTags(a)))
}

// 저장은 한 번에 하나 — 그 사이에 또 바꾸면 끝난 뒤 한 번 더. 그새 다른 관리자가 저장했거나 신청이 바뀌었으면(409) 새로 불러온다
let saving = false, again = false
async function save() {
  if (saving) { again = true; return }
  saving = true
  say('저장 중…')
  try {
    const r = await api('/arena/plan', { method: 'PUT', withToken: true, body: { week, version: data.planAt, plan } })
    data.planAt = r.planAt
    data.plan = r.plan
    say('저장했어요')
  } catch (e) {
    again = false
    say(e.message, true)
    if (e.status === 409) await load()
  } finally {
    saving = false
    if (again) { again = false; save() }
  }
}

// ================================================================ 카카오 공유 — 편성표를 그림으로 그려 카카오에 올리고 그 그림으로 카드를 보낸다

const shotKey = () => `${week}:${data.planAt}`
let shot = null, shotTimer = 0   // { key, blob, w, h, url? }
// 그림은 미리 그려 둔다 — 버튼을 누른 그 순간에 보내야 PC 팝업 · 휴대폰 공유창이 막히지 않는다
const queueShot = () => { clearTimeout(shotTimer); shotTimer = setTimeout(() => snapshot().catch(e => console.warn(e)), 400) }

function shareButtons() {
  const ready = shot?.key === shotKey() && shot.url
  const kakao = h('button', { type: 'button', className: 'is-kakao', onclick: e => shareKakao(e.currentTarget) }, ready ? '카톡으로 보내기' : '카톡 공유')
  const img = h('button', { type: 'button', onclick: e => saveImage(e.currentTarget) }, IS_MOBILE ? '이미지 공유' : '이미지 저장')
  return h('span', { className: 'ar-share' }, kakao, img)
}

async function snapshot() {
  const k = shotKey()
  if (shot?.key === k) return shot
  const c = await drawPlan()
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9))
  if (k !== shotKey()) return snapshot()   // 그리는 사이에 편성이 바뀌었다
  return shot = { key: k, blob, w: c.width, h: c.height }
}

function sendCard(s) {
  const url = `${location.origin}/arena/?w=${week}`, link = { mobileWebUrl: url, webUrl: url }
  const nTeams = SLOTS.reduce((n, x) => n + teamsOf(x.id).length, 0)
  Kakao.Share.sendDefault({
    objectType: 'feed',
    content: { title: `VIPERS 아레나전 편성 결과 · ${weekLabel(week)}`, description: `${SLOTS.filter(x => teamsOf(x.id).length).map(x => `${x.short} ${teamsOf(x.id).length}팀`).join(' · ')} · 총 ${nTeams}팀`, imageUrl: s.url, imageWidth: s.w, imageHeight: s.h, link },
    buttons: [{ title: '편성표 보기', link }],
  })
}

async function shareKakao(btn) {
  if (!window.Kakao?.isInitialized?.()) return saveImage(btn)   // SDK 를 못 불러왔으면 그림 공유 · 저장으로
  if (shot?.key === shotKey() && shot.url) return sendCard(shot)   // 누른 그 순간에 보낸다
  const label = btn.textContent
  btn.disabled = true
  btn.textContent = '그림 올리는 중…'
  try {
    const s = await snapshot()
    const r = await Kakao.Share.uploadImage({ file: [new File([s.blob], `arena-${week}.jpg`, { type: 'image/jpeg' })] })
    s.url = r.infos.original.url
    btn.textContent = '카톡으로 보내기'   // PC 는 기다린 뒤에 열면 팝업이 막힌다 — 한 번 더 눌러 보낸다
    if (IS_MOBILE) sendCard(s)
  } catch (e) {
    console.warn(e)
    btn.textContent = label
    alert('카카오에 그림을 올리지 못했어요 — 「이미지 저장」 으로 받아 카톡에 직접 올려 주세요')
  } finally { btn.disabled = false }
}

async function saveImage(btn) {
  btn.disabled = true
  try {
    const s = await snapshot(), file = new File([s.blob], `vipers-arena-${week}.jpg`, { type: 'image/jpeg' })
    // 휴대폰: 공유창에서 카카오톡을 고르면 사진으로 바로 보낸다
    if (IS_MOBILE && navigator.canShare?.({ files: [file] })) {
      try { return await navigator.share({ files: [file], title: 'VIPERS 아레나전 편성 결과' }) }
      catch (e) { if (e.name === 'AbortError') return }
    }
    download(file, file.name)
  } finally { btn.disabled = false }
}

const download = (blob, name) => {
  const a = h('a', { href: URL.createObjectURL(blob), download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

/** 엑셀(CSV) 내려받기 — BOM 을 붙여야 엑셀이 한글을 읽는다.
 *  = + - @ 로 시작하는 닉네임은 엑셀이 수식으로 실행하므로 앞에 ' 를 붙인다 */
function saveCsv(rows, name) {
  const cell = v => `"${String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`
  download(new Blob(['\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' }), name)
}

/** 편성 명단 엑셀 — 계정 한 줄 */
function saveExcel() {
  const rows = [['시간대', '일시', '팀', '팀장', '닉네임', '본계정', '포지션', '캐릭터']]
  for (const s of SLOTS) teamsOf(s.id).forEach((tm, i) => tm.forEach((x, j) => {
    const a = accts.get(key(x.u, x.n))
    rows.push([s.short, slotWhen(week, s), `${i + 1}팀`, j ? '' : '팀장', x.n, a?.owner, a?.roles.map(roleLabel).join(' · '), a && charNames(a.chars, a.bt)])
  }))
  saveCsv(rows, `vipers-arena-${week}.csv`)
}

/** 편성표 그림 — 한 줄에 하루(1차 · 1.5차 · 2차). 팀 한 줄에 3명(얼굴 · 닉네임 · 캐릭터) */
async function drawPlan() {
  const rows = [...new Set(SLOTS.map(s => s.day))].map(d => SLOTS.filter(s => s.day === d))
  const PER = Math.max(...rows.map(r => r.length)), PAD = 28, GAP = 16, COL = 437, W = PAD * 2 + PER * COL + GAP * (PER - 1), ROW = 58, HEAD = 40, Z = 2
  const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif'
  const blockH = s => HEAD + Math.max(1, teamsOf(s.id).length) * (ROW + 6) + 8
  const H = 112 + rows.reduce((n, r) => n + Math.max(...r.map(blockH)) + GAP, 0) + 30

  // 얼굴은 같은 도메인 그림이라 캔버스가 더럽혀지지 않는다
  const ids = [...new Set(SLOTS.flatMap(s => teamsOf(s.id).flat().map(x => accts.get(key(x.u, x.n))?.chars[0]).filter(Boolean)))]
  const faces = new Map(await Promise.all(ids.map(async id => {
    const img = new Image()
    img.src = faceOf(P(id))
    try { await img.decode(); return [id, img] } catch { return [id, null] }
  })))

  const c = h('canvas', { width: W * Z, height: H * Z }), g = c.getContext('2d')
  g.scale(Z, Z)
  const box = (x, y, w, hh, r, fill) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, hh, r) : g.rect(x, y, w, hh); g.fillStyle = fill; g.fill() }
  const text = (s, x, y, size, color, weight = 400, max = 1e4, align = 'left') => {
    g.font = `${weight} ${size}px ${FONT}`
    g.fillStyle = color
    g.textAlign = align
    let t = String(s)
    if (g.measureText(t).width > max) { while (t && g.measureText(`${t}…`).width > max) t = t.slice(0, -1); t += '…' }
    g.fillText(t, x, y)
  }

  box(0, 0, W, H, 0, '#0d1117')
  text('VIPERS ARENA', PAD, 50, 30, ACCENT, 800)
  text('아레나전 편성 결과', PAD + g.measureText('VIPERS ARENA').width + 14, 50, 22, '#e6edf3', 700)
  const nTeams = SLOTS.reduce((n, s) => n + teamsOf(s.id).length, 0)
  text(`${weekLabel(week)} · 총 ${nTeams}팀 · 팀당 ${A.teamSize}명`, PAD, 82, 15, '#8b97a8')

  let y = 104
  for (const r of rows) {
    r.forEach((s, ci) => {
      const x = PAD + ci * (COL + GAP), color = ACCENT, teams = teamsOf(s.id)
      box(x, y, COL, blockH(s), 12, '#161b22')
      box(x, y + 10, 4, 22, 2, color)
      text(s.short, x + 14, y + 28, 18, color, 800)
      text(`${s.time} ~ ${s.end} · ${teams.length}팀`, x + COL - 14, y + 28, 13, '#8b97a8', 400, 200, 'right')
      if (!teams.length) text('편성 전', x + 14, y + HEAD + 30, 14, '#8b97a8')
      teams.forEach((tm, ti) => {
        const ty = y + HEAD + ti * (ROW + 6)
        box(x + 8, ty, COL - 16, ROW, 9, '#dfe3e8')
        text(`${ti + 1}팀`, x + 30, ty + ROW / 2 + 5, 14, '#16181d', 800, 40, 'center')
        const cw = (COL - 16 - 44) / A.teamSize
        tm.forEach((m, mi) => {
          const a = accts.get(key(m.u, m.n)), cx = x + 8 + 44 + mi * cw, img = faces.get(a?.chars[0])
          g.save()
          g.beginPath(); g.arc(cx + 15, ty + ROW / 2, 15, 0, Math.PI * 2); g.fillStyle = '#cfd5dc'; g.fill(); g.clip()
          if (img) g.drawImage(img, cx, ty + ROW / 2 - 15, 30, 30)
          g.restore()
          g.beginPath(); g.arc(cx + 15, ty + ROW / 2, 15.5, 0, Math.PI * 2); g.strokeStyle = '#bcc4ce'; g.lineWidth = 2; g.stroke()
          if (mi === 0) { box(cx + 1, ty + ROW / 2 + 9, 28, 14, 7, ACCENT); text('팀장', cx + 15, ty + ROW / 2 + 20, 10, '#1a1200', 800, 40, 'center') }   // 팀장은 얼굴 아래 뱃지
          text(m.n, cx + 36, ty + 25, 13.5, '#16181d', 700, cw - 40)
          text(a ? charNames(a.chars, a.bt) : '', cx + 36, ty + 43, 11, '#586272', 400, cw - 40)
        })
      })
    })
    y += Math.max(...r.map(blockH)) + GAP
  }
  text('nba-kor.github.io/arena', PAD, H - 18, 12, '#8b97a8')
  text('TNAB Vipers', W - PAD, H - 18, 12, '#8b97a8', 700, 200, 'right')
  return c
}

// ================================================================ 시작

if (location.hash === '#plan' && !PLAN_PAGE) location.replace('/arena/plan/')   // 예전 주소(편성이 같은 페이지에 있던 때)
startAuth('', () => { draft = null; render() })   // 로그인 상태가 정해지거나 바뀌면 신청 폼 · 편성 버튼을 다시
await load()
// 탭으로 돌아오면 다시 읽는다 — 다른 관리자의 편성 · 새 신청. 편성 페이지는 내 저장과 겹치지 않게 건너뛴다
document.addEventListener('visibilitychange', () => { if (!document.hidden && !PLAN_PAGE && !saving) load() })
