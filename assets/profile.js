// 내 프로필의 게임 계정 · 보유 캐릭터 — 마이페이지 · 아레나 신청 · 홈이 같이 쓴다.
// 프로필은 캐릭터 줄 목록(entries: [{ nick, tier, char, roles?, breakthrough? }]) 그대로 저장한다 — 같은 게임 닉네임 줄들이 한 계정, 첫 줄의 계정이 본계정.
// 계정의 주력 포지션(roles: 1 · 2순위)은 그 계정의 줄마다 같은 값을 넣고 첫 줄 것을 읽는다. 돌파(breakthrough 1~7)는 캐릭터 줄마다.
// 팀원모집(숨김) · 디스코드 알림도 이 줄을 읽으므로 모양을 바꾸지 않았다. 티어는 더 받지 않는다(예전에 적은 값은 계정에 남겨 둔다)
import { faceOf } from './app.js?v=915be0c5'
import { api } from './auth.js?v=e2ffcda1'
import { h, P, me, charGrid } from './board.js?v=3a1e630f'

const json = p => fetch(p, { cache: 'no-cache' }).then(r => r.json())
let recruitP, arenaP
export const recruitCfg = () => recruitP ||= json('/data/recruit.json')   // maxEntries — 서버와 같은 값
export const arenaCfg = () => arenaP ||= json('/data/arena.json')
const A = await arenaCfg()   // 주력 포지션 · 돌파 단계

// 주력 포지션 — 스코어러 > 중열 > 센터(집계표 순서 = data/arena.json 의 roles 순서)
export const ROLES = A.roles
export const ALLPOS = 'allpos'   // 올포 — 스코어러 · 중열 · 센터 다. 1순위로만 고르고 2순위는 없다
export const roleLabel = id => ROLES.find(r => r.id === id)?.label || '포지션 미정'
const LINK_RE = /:\/\/|www\.|discord\.gg/i   // 서버와 같은 규칙 — 이름에 링크 금지

/** entries → [{ nick, tier, roles, chars, bt: { 캐릭터: 돌파 } }] — 처음 나온 순서, 첫 계정이 본계정 */
export function accountsOf(entries = []) {
  const map = new Map()
  for (const e of entries) {
    if (!map.has(e.nick)) map.set(e.nick, { nick: e.nick, tier: e.tier || '', roles: e.roles || [], chars: [], bt: {} })
    const a = map.get(e.nick)
    a.chars.push(e.char)
    if (e.breakthrough) a.bt[e.char] = e.breakthrough
  }
  return [...map.values()]
}
export const entriesOf = accounts => accounts.flatMap(a => a.chars.map(char => ({
  nick: a.nick, tier: a.tier || '', char, ...(a.roles?.length && { roles: a.roles }), ...(a.bt?.[char] && { breakthrough: a.bt[char] }),
})))
const countChars = accounts => accounts.reduce((n, a) => n + a.chars.length, 0)

/** '엠비드 5돌 · 요키치' — bt = { 캐릭터: 돌파 } */
export const charNames = (chars, bt = {}) => chars.map(id => `${P(id).short || P(id).name}${bt[id] ? ` ${bt[id]}돌` : ''}`).join(' · ')
export const charFaces = (chars, max = 4) => h('span', { className: 'ac-faces' },
  chars.slice(0, max).map(id => h('img', { src: faceOf(P(id)), alt: '', title: P(id).name, loading: 'lazy' })),
  chars.length > max && h('em', {}, `+${chars.length - max}`))
/** 주력 포지션 뱃지 — 1순위는 채움 · 2순위는 테두리(색은 한 가지) */
export const roleTags = roles => h('span', { className: 'ac-roles' }, roles?.length
  ? roles.map((r, i) => h('span', { className: i ? '' : 'is-first', title: `${i + 1}순위` }, roleLabel(r)))
  : h('span', { className: 'is-none' }, '포지션 미정'))

/** 계정 한 줄: (체크) 본계정/부계정 · 닉네임 · 주력 포지션 · 캐릭터(돌파) · 얼굴 · (✎) */
export function accountRow(a, i, { checked, onCheck, onEdit } = {}) {
  const body = [
    h('span', { className: `ac-kind${i ? '' : ' is-main'}` }, i ? '부계정' : '본계정'),
    h('span', { className: 'ac-text' }, h('b', {}, a.nick, roleTags(a.roles)), h('small', {}, charNames(a.chars, a.bt))),
    charFaces(a.chars),
  ]
  const li = h('li', { className: 'ac-row' })
  if (onCheck) {
    const box = h('input', { type: 'checkbox', checked: !!checked, onchange: () => onCheck(box.checked) })
    li.append(h('label', { className: 'ac-pick' }, box, ...body))
  } else li.append(h('div', { className: 'ac-pick' }, ...body))
  if (onEdit) li.append(h('button', { type: 'button', className: 'ac-edit', title: '수정', 'aria-label': `${a.nick} 수정`, onclick: onEdit }, '✎'))
  return li
}

/**
 * 계정 하나 고치기 · 추가(acct = null) — 닉네임 · 본계정 · 주력 포지션 1 · 2순위 · 보유 캐릭터(계정마다 제한 없음, 프로필 전체 maxEntries 개) · 돌파.
 * accounts = 지금 목록 — 닉네임 겹침 · 전체 캐릭터 수를 본다. 돌려주는 값: { acct, main } (main = 본계정으로) | 'delete' | null(취소)
 */
export async function editAccount(acct, accounts) {
  const { maxEntries } = await recruitCfg()
  const others = accounts.filter(a => a !== acct), room = maxEntries - countChars(others)
  const isMain = acct ? accounts[0] === acct : !accounts.length
  let chars = acct ? [...acct.chars] : []
  const bt = { ...acct?.bt }

  const nick = h('input', { type: 'text', maxLength: 20, value: acct?.nick || '', placeholder: '게임 닉네임(특수문자 그대로)', autocomplete: 'off', spellcheck: false, 'aria-label': '게임 닉네임' })
  const main = h('input', { type: 'checkbox', checked: isMain, disabled: isMain })
  const roleSel = (k, none) => {
    const sel = h('select', { 'aria-label': `주력 포지션 ${k + 1}순위` }, h('option', { value: '', disabled: !k }, none), ROLES.filter(r => !k || r.id !== ALLPOS).map(r => h('option', { value: r.id }, r.label)))
    sel.value = acct?.roles?.[k] || ''
    return sel
  }
  const role1 = roleSel(0, '1순위 선택'), role2 = roleSel(1, '2순위 없음')
  const solo = () => { if ((role2.disabled = role1.value === ALLPOS)) role2.value = '' }   // 1순위가 올포면 2순위는 못 고른다
  role1.onchange = solo
  solo()
  const err = h('p', { className: 'rc-form-err', role: 'alert', hidden: true })
  const picked = h('div', { className: 'ac-picked' })
  const count = h('small', {})
  const say = msg => { err.textContent = msg; err.hidden = false }
  const paint = () => {
    count.textContent = `${chars.length}개 · 앞 캐릭터가 대표(누르면 맨 앞으로) · 돌파는 선택`
    picked.replaceChildren(...chars.length ? chars.map((id, k) => {
      const lv = h('select', { 'aria-label': `${P(id).name} 돌파`, onchange: () => { bt[id] = +lv.value || undefined } },
        h('option', { value: '' }, '돌파 -'), Array.from({ length: A.breakthrough }, (_, n) => h('option', { value: n + 1 }, `${n + 1}돌`)))
      lv.value = bt[id] || ''
      return h('span', { className: 'ac-pchip' },
        h('button', { type: 'button', title: k ? '눌러서 대표(맨 앞)로' : '대표 캐릭터', onclick: () => { chars = [id, ...chars.filter(c => c !== id)]; paint() } },
          h('img', { src: faceOf(P(id)), alt: '' }), h('span', {}, P(id).short || P(id).name), !k && h('em', {}, '대표')),
        lv)
    }) : [h('span', { className: 'rc-muted' }, '아래에서 이 계정이 가진 캐릭터를 모두 눌러 주세요')])
  }
  const grid = charGrid({
    isOn: id => chars.includes(id),
    pick: id => {
      if (chars.includes(id)) chars = chars.filter(c => c !== id)
      else if (chars.length >= room) return say(`캐릭터는 프로필 전체에 ${maxEntries}개까지예요`)
      else chars = [...chars, id]
      err.hidden = true
      paint()
    },
  })
  paint()

  const dlg = h('dialog', { className: 'rc-dialog ac-dialog' })
  let result = null
  const done = r => { result = r; dlg.close() }
  const form = h('form', { method: 'dialog', novalidate: true },
    h('header', {}, h('h2', {}, acct ? '계정 수정' : '계정 추가'), h('button', { type: 'button', 'aria-label': '닫기', onclick: () => done(null) }, '✕')),
    h('div', { className: 'ac-body' },
      h('div', { className: 'ac-top' }, nick, h('label', { className: 'check' }, main, '본계정')),
      h('div', { className: 'ac-top' }, h('span', { className: 'ac-head' }, '주력 포지션'), role1, role2),
      h('p', { className: 'ac-head' }, '보유 캐릭터 ', count),
      picked, grid, err),
    h('footer', { className: 'ac-foot' },
      acct && accounts.length > 1 && h('button', { type: 'button', className: 'danger', onclick: () => confirm(`「${acct.nick}」 계정을 지울까요?`) && done('delete') }, '계정 삭제'),
      h('span', { className: 'spacer' }),
      h('button', { type: 'button', onclick: () => done(null) }, '취소'),
      h('button', { type: 'submit', className: 'primary' }, '완료')))
  form.onsubmit = e => {
    e.preventDefault()
    const n = nick.value.trim()
    const bad = !n || [...n].length > 20 ? '게임 닉네임을 20자 이내로 입력해 주세요' : LINK_RE.test(n) ? '닉네임에 링크는 넣을 수 없어요'
      : others.some(a => a.nick === n) ? '같은 닉네임의 계정이 이미 있어요' : ''
    if (bad) { say(bad); return nick.focus() }
    if (!role1.value) { say('주력 포지션 1순위를 골라 주세요'); return role1.focus() }
    if (!chars.length) return say('캐릭터를 하나 이상 골라 주세요')
    const roles = [role1.value, ...role2.value && role2.value !== role1.value ? [role2.value] : []]
    done({ acct: { nick: n, tier: acct?.tier || '', roles, chars, bt: Object.fromEntries(chars.filter(c => bt[c]).map(c => [c, bt[c]])) }, main: main.checked })
  }
  dlg.append(form)
  dlg.addEventListener('cancel', e => e.preventDefault())   // ✕ · 취소 · 완료로만 닫는다 — 바깥을 누르거나 Esc 로 고치던 것이 날아가지 않게
  document.body.append(dlg)
  dlg.showModal()
  if (!acct) nick.focus()
  return new Promise(res => dlg.addEventListener('close', () => { dlg.remove(); res(result) }, { once: true }))
}

/** editAccount 결과를 목록에 반영한 새 목록. 본계정으로 고른 계정은 맨 앞 */
export function applyEdit(accounts, acct, r) {
  if (r === 'delete') return accounts.filter(a => a !== acct)
  const next = acct ? accounts.map(a => a === acct ? r.acct : a) : [...accounts, r.acct]
  return r.main ? [r.acct, ...next.filter(a => a !== r.acct)] : next
}

/** 표시 이름 · 마이크 칸 — 마이페이지, 그리고 아직 프로필이 없을 때 아레나 신청. read() = { name, mic } | null(오류 표시) */
export function personFields(prof) {
  const name = h('input', { type: 'text', maxLength: 32, value: prof?.name || me?.user?.name || '', autocomplete: 'off', spellcheck: false })
  const mic = v => h('label', {}, h('input', { type: 'radio', name: 'mic', value: v, checked: prof ? prof.mic === (v === '1') : false }), h('span', {}, v === '1' ? '마이크 O' : '마이크 X'))
  const err = h('small', { className: 'rc-err', hidden: true })
  const el = h('div', { className: 'ac-person' },
    h('label', { className: 'rc-fld' }, h('span', {}, '표시 이름'), name, h('small', { className: 'rc-hint' }, '편성표 · 게시판에 이 이름이 보여요')),
    h('fieldset', { className: 'rc-seg' }, h('legend', {}, '마이크'), h('div', { className: 'rc-seg-opts' }, mic('1'), mic('0'))),
    err)
  const read = () => {
    const n = name.value.trim(), m = el.querySelector('[name=mic]:checked')
    const msg = !n || [...n].length > 32 ? '표시 이름을 32자 이내로 입력해 주세요' : LINK_RE.test(n) ? '이름에 링크는 넣을 수 없어요' : !m ? '마이크 사용 여부를 골라 주세요' : ''
    err.textContent = msg
    err.hidden = !msg
    if (msg) { (m ? name : el.querySelector('[name=mic]')).focus(); return null }
    return { name: n, mic: m.value === '1' }
  }
  return { el, read }
}

/** 프로필 저장(PUT /api/me/profile). 성공하면 me.profile 도 바꾼다 */
export async function saveProfile({ name, mic, accounts }) {
  const r = await api('/me/profile', { method: 'PUT', withToken: true, body: { name, mic, entries: entriesOf(accounts) } })
  me.profile = r.profile
  me.name = r.profile.name
  return r.profile
}

/** 아레나 주('YYYY-MM-DD' 토요일) → '10/24(토) ~ 10/25(일)' */
export function weekLabel(week) {
  const d = new Date(`${week}T00:00:00Z`), f = (x, day) => `${x.getUTCMonth() + 1}/${x.getUTCDate()}(${day})`
  return `${f(d, '토')} ~ ${f(new Date(d.getTime() + 86_400_000), '일')}`
}
