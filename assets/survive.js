// 덩크 서바이버(/survive/) — 뱀파이어 서바이버즈류 생존 게임. 몰려오는 수비를 피해 다니기만 하면 스킬은 알아서 나간다(최대 30분).
//   캐릭터 10명 — 덩크 시티 선수, 시작 스킬 · 고유 특성이 다르다(CHARS). 르브론 말고 9명은 업적으로 연다(ACH 의 char).
//   레벨이 오를 때마다 랜덤 상자: 셋 중 하나를 고른다. 가끔 잭팟이 터지면 셋 다(openBox).
//   맵 3개(MAPS) — 스트리트 파크(끝없는 동네) · 아레나(위아래가 관중석) · 네온 루프탑(수비가 단단하다).
//   업적 · 기록은 이 브라우저(localStorage)에 두고, 로그인하면 계정(/api/survive)과 합쳐 같이 쓴다 — 다른 기기에서도 이어진다.
// 그림은 2D 캔버스 하나. 사람 · 공 · 아이콘 · 바닥은 처음에 한 번 그려 두고(sprite) 옮겨 그린다. 메뉴 · 상자는 캔버스 위에 겹친 HTML(#sv-ui).
import { mountTop, faceOf } from './app.js?v=fb02b445'
import { api, chooseLogin } from './auth.js?v=1fbb8e2f'
import { loadData, P, startAuth, auth, me, h } from './board.js?v=4233415a'
import { cutHead, skinOf, NBA_NUM } from './vipers.js?v=c92ed58c'

mountTop('/survive/')

const TAU = Math.PI * 2, rnd = Math.random
const clamp = (v, a, b) => v < a ? a : v > b ? b : v
const fmt = s => `${String(s / 60 | 0).padStart(2, '0')}:${String(s % 60 | 0).padStart(2, '0')}`
const MAX_T = 30 * 60   // 30분 버티면 끝(클리어)
const VIEW = 560        // 화면의 짧은 쪽에 보이는 월드 크기 — 휴대폰을 세워도 눕혀도 둘레가 이만큼은 보인다
const MAX_FOES = 380   // 한 화면 수비 수 한도 — 휴대폰 그리기 비용

// ---------------------------------------------------------------- 표

// 캐릭터 — 덩크 시티 선수 id(얼굴 · 이름은 data/players.json). w = 시작 스킬, c = [유니폼, 보조색], mod = 고유 특성
const CHARS = [
  { id: 'james', w: 'pass', c: ['#fdb927', '#552583'], hp: 120, trait: '킹', note: '레벨 10마다 공격력 +10% (최대 +50%)', mod: { king: 1 } },
  { id: 'klfd', w: 'three', c: ['#1d428a', '#ffc72c'], hp: 100, trait: '셰프', note: '치명타 확률 +15% · 치명타 피해 2.5배', mod: { crit: 0.15, critX: 0.5 } },
  { id: 'yns', w: 'dunk', c: ['#00471b', '#eee1c6'], hp: 120, trait: '그릭 프릭', note: '최대 체력 +40% · 이동 속도 +10%', mod: { hp: 0.4, move: 0.1 } },
  { id: 'yjq', w: 'bounce', c: ['#0e2240', '#fec524'], hp: 120, trait: '조커', note: '모든 스킬 투사체 +1 · 이동 속도 -10%', mod: { amount: 1, move: -0.1 } },
  { id: 'lkdqq', w: 'fade', c: ['#00538c', '#b8c4ca'], hp: 110, trait: '매직', note: '잭팟 확률 2배 · 행운 +20%', mod: { jackpot: 1, luck: 0.2 } },
  { id: 'ebd', w: 'block', c: ['#006bb6', '#ed174c'], hp: 140, trait: '프로세스', note: '받는 피해 -2 · 초당 체력 0.5 회복', mod: { armor: 2, regen: 0.5 } },
  { id: 'weisblk', w: 'press', c: ['#007ac1', '#ef3b24'], hp: 110, trait: '트리플 더블', note: '이동 속도 +25% · 지속 시간 +15%', mod: { move: 0.25, dur: 0.15 } },
  { id: 'wsblk', w: 'alley', c: ['#0c2340', '#c8102e'], hp: 130, trait: '헤비 덩커', note: '최대 체력 +20% · 몸에 닿은 수비를 밀쳐 내며 피해', mod: { hp: 0.2, body: 1 } },
  { id: 'durant', w: 'buzzer', c: ['#1d1160', '#e56020'], hp: 100, trait: '이지 머니', note: '범위 +20% · 투사체 속도 +20%', mod: { area: 0.2, speed: 0.2 } },
  { id: 'bl', w: 'nolook', c: ['#00788c', '#1d1160'], hp: 100, trait: '쇼타임', note: '경험치 +25% · 쿨타임 -5%', mod: { growth: 0.25, cdr: 0.05 } },
]

// 스킬 — cd 쿨타임(초) · dmg 피해 · n 개수 · area 크기 배수 · spd 속도 배수 · dur 지속(초) · pierce 맞힐 수 있는 수 · bounce 튕김.
// ups[i] = 레벨 i+2 가 될 때 더하는 것(최고 레벨 8)
const WEAP = {
  pass: { name: '체스트 패스', note: '가장 가까운 수비에게 빠른 패스', cd: 1.15, dmg: 10, pierce: 1, ups: [{ n: 1 }, { dmg: 5 }, { cd: -0.2 }, { n: 1 }, { dmg: 5 }, { pierce: 1 }, { dmg: 10 }] },
  three: { name: '3점슛', note: '멀리 있는 수비에게 높이 쏴 떨어진 자리를 스플래시', cd: 2.2, dmg: 22, ups: [{ n: 1 }, { area: 0.2 }, { dmg: 10 }, { n: 1 }, { cd: -0.4 }, { dmg: 12 }, { n: 1, area: 0.2 }] },
  dunk: { name: '덩크', note: '뛰어올라 내리꽂으면 둘레에 충격파 — 밀쳐 낸다', cd: 3.2, dmg: 26, ups: [{ area: 0.15 }, { dmg: 10 }, { cd: -0.5 }, { area: 0.15 }, { dmg: 12 }, { n: 1 }, { dmg: 18, area: 0.15 }] },
  bounce: { name: '바운스 패스', note: '맞으면 옆 수비에게 튕겨 간다', cd: 1.6, dmg: 9, pierce: 1, bounce: 3, ups: [{ bounce: 1 }, { dmg: 4 }, { n: 1 }, { bounce: 2 }, { dmg: 5 }, { cd: -0.3 }, { bounce: 2, dmg: 6 }] },
  block: { name: '블록슛', note: '두 손이 몸 둘레를 돌며 쳐 낸다 — 날아오는 호루라기도 막는다', cd: 2.2, dmg: 12, n: 2, dur: 3.2, ups: [{ n: 1 }, { area: 0.25, spd: 0.25 }, { dmg: 5 }, { n: 1 }, { dur: 1 }, { n: 1 }, { dmg: 8, dur: 1 }] },
  press: { name: '풀코트 프레스', note: '둘레의 수비를 계속 압박 — 피해를 주고 느리게, 안에 들어온 호루라기도 느리게', cd: 0.45, dmg: 4, ups: [{ area: 0.15 }, { dmg: 2 }, { area: 0.15 }, { cd: -0.09 }, { dmg: 2 }, { area: 0.15 }, { dmg: 4 }] },
  alley: { name: '앨리웁', note: '하늘에서 공이 떨어져 그 자리를 내리찍는다', cd: 2.6, dmg: 18, n: 2, ups: [{ n: 1 }, { dmg: 6 }, { area: 0.2 }, { n: 1 }, { cd: -0.5 }, { n: 1 }, { dmg: 12 }] },
  fade: { name: '스텝백 슛', note: '보는 쪽으로 꿰뚫는 슛', cd: 0.95, dmg: 8, pierce: 2, ups: [{ n: 1 }, { dmg: 4 }, { n: 1 }, { pierce: 2 }, { n: 1 }, { dmg: 5 }, { cd: -0.3 }] },
  cross: { name: '크로스오버', note: '옆으로 길게 휘둘러 베는 드리블', cd: 1.4, dmg: 13, ups: [{ n: 1 }, { dmg: 5 }, { area: 0.15 }, { dmg: 5 }, { cd: -0.3 }, { area: 0.2 }, { dmg: 9 }] },
  nolook: { name: '노룩 패스', note: '던지면 되돌아오는 패스 — 오가며 계속 맞힌다', cd: 1.8, dmg: 10, ups: [{ dmg: 4 }, { n: 1 }, { area: 0.25 }, { dmg: 5 }, { n: 1 }, { spd: 0.3 }, { n: 1 }] },
  hook: { name: '스카이훅', note: '높이 떴다 떨어지는 큰 공 — 여럿을 꿰뚫는다', cd: 1.7, dmg: 18, pierce: 3, ups: [{ n: 1 }, { dmg: 6 }, { area: 0.2 }, { pierce: 2 }, { n: 1 }, { dmg: 8 }, { n: 1 }] },
  buzzer: { name: '버저비터', note: '화면 안 수비에게 번개처럼 꽂힌다', cd: 2.8, dmg: 20, n: 2, ups: [{ n: 1 }, { dmg: 8 }, { area: 0.25 }, { n: 1 }, { cd: -0.5 }, { n: 1 }, { dmg: 14 }] },
  screen: { name: '스크린', note: '근처에 동료가 스크린을 서서 걸린 수비를 묶고 때린다 — 안에 들어온 호루라기도 느리게', cd: 4, dmg: 6, dur: 2.5, ups: [{ n: 1 }, { dmg: 3 }, { dur: 1 }, { area: 0.2 }, { n: 1 }, { dmg: 4 }, { dur: 1, area: 0.2 }] },
}
const GAP = { pass: 0.09, three: 0.18, dunk: 0.36, bounce: 0.12, alley: 0.14, fade: 0.07, cross: 0.14, nolook: 0.16, hook: 0.12, buzzer: 0.1, screen: 0.1 }   // 한 번에 여러 개면 사이 간격
const UP = { n: v => `개수 +${v}`, dmg: v => `피해 +${v}`, cd: v => `쿨타임 ${v}초`, area: v => `범위 +${Math.round(v * 100)}%`, spd: v => `속도 +${Math.round(v * 100)}%`, dur: v => `지속 +${v}초`, pierce: v => `관통 +${v}`, bounce: v => `튕김 +${v}` }
// 돌파 — 최고 레벨(8) 스킬에 한 번씩. 피해는 그대로 두고 쓰는 법이 바뀐다(w.br). 수비가 아주 가끔 떨어뜨리는 챔피언 반지를 주우면 고른다(ringable)
const BREAK = {
  pass: { name: '투핸드 패스', note: '두 공이 나란히 날아간다 — 한 번에 2배' },
  three: { name: '로고 스리', note: '떨어진 자리가 한 번 더, 더 크게 터진다' },
  dunk: { name: '토마호크', note: '내리꽂은 뒤 1.5배 큰 충격파가 한 번 더' },
  bounce: { name: '핀볼 패스', note: '처음 튕길 때 공이 둘로 갈라져 두 수비에게' },
  block: { name: '철벽', note: '두 손이 쉬지 않고 끝없이 돈다' },
  press: { name: '존 프레스', note: '범위 +30% · 안에 든 수비는 훨씬 느리게(25%)' },
  alley: { name: '스카이 워크', note: '하늘에서 떨어지는 공이 2배' },
  fade: { name: '더블 스텝백', note: '등 뒤로도 한 발씩 — 앞뒤를 같이 꿰뚫는다' },
  cross: { name: '앵클 브레이커', note: '양옆을 한 번에 베고, 맞은 수비는 넘어져 잠깐 못 움직인다' },
  nolook: { name: '고스트 패스', note: '돌아온 공을 다른 수비에게 한 번 더 던진다' },
  hook: { name: '드림 셰이크', note: '공이 1.4배 커지고 꿰뚫는 수가 2배' },
  buzzer: { name: '위닝 샷', note: '번개가 옆 수비 둘에게 이어진다' },
  screen: { name: '무빙 스크린', note: '스크린을 선 동료가 나를 따라다닌다' },
}

// 아이템(지니면 계속 듣는 것) — 레벨마다 note 만큼
const PASS = {
  weight: { name: '웨이트 트레이닝', note: '공격력 +10%', max: 5 },
  knee: { name: '무릎 보호대', note: '받는 피해 -1', max: 5 },
  cardio: { name: '체력 훈련', note: '최대 체력 +20%', max: 5 },
  ice: { name: '아이스 배스', note: '초당 체력 +0.2 회복', max: 5 },
  notes: { name: '전술 노트', note: '쿨타임 -8%', max: 5 },
  span: { name: '윙스팬', note: '범위 +10%', max: 5 },
  shoes: { name: '농구화', note: '이동 속도 +10%', max: 5 },
  handle: { name: '볼 핸들링', note: '투사체 속도 +10%', max: 5 },
  stamina: { name: '스태미나', note: '지속 시간 +10%', max: 5 },
  double: { name: '더블 클러치', note: '모든 스킬 투사체 +1', max: 2 },
  vision: { name: '코트 비전', note: '경험치 줍는 거리 +30%', max: 5 },
  clutch: { name: '클러치', note: '행운 +10% (잭팟 · 치명타 · 떨어지는 것)', max: 5 },
  rookie: { name: '루키 패기', note: '경험치 +8%', max: 5 },
}
const FILL = { drink: { name: '스포츠 드링크', note: '체력 40% 회복' }, cheer: { name: '팬 응원', note: '이번 판 공격력 +2% (최대 +50%)' } }   // 더 올릴 게 없을 때

// 수비 — r 몸 반지름 · hp(시간이 갈수록 세진다) · spd 이동 · dmg 닿으면 · xp 떨어뜨리는 경험치
const FOES = {
  rookie: { r: 12, hp: 9, spd: 62, dmg: 7, xp: 1 },
  fan: { r: 10, hp: 5, spd: 95, dmg: 5, xp: 1 },
  ref: { r: 12, hp: 18, spd: 57, dmg: 7, xp: 2 },   // 심판 — 멀리서 호루라기를 던진다. 20분부터 나온다
  big: { r: 18, hp: 52, spd: 47, dmg: 12, xp: 3 },
  mascot: { r: 26, hp: 420, spd: 55, dmg: 16, xp: 25 },   // 정예 — 아이템을 떨어뜨린다
  boss: { r: 32, hp: 1300, spd: 66, dmg: 22, xp: 120 },   // 올스타 수비수 — 5분마다, 멈칫(갈 길이 붉게) 하고 돌진. 트로피 상자를 떨어뜨린다
}

// 맵 — hp · spd 수비 배수, xp 경험치 배수, wall 위아래 벽(아레나)
const MAPS = [
  { id: 'park', name: '스트리트 파크', note: '노을 진 동네 농구장 — 사방이 끝없이 트였다', hp: 1, spd: 1, xp: 1 },
  { id: 'arena', name: '아레나', note: '마루 코트 — 위아래가 관중석이라 좌우로만 트였다', hp: 1, spd: 1, xp: 1.1, wall: 460 },
  { id: 'roof', name: '네온 루프탑', note: '밤의 옥상 — 수비가 더 단단하고 빠르다 · 경험치 +25%', hp: 1.4, spd: 1.12, xp: 1.25 },
]

// 업적 — char = 여는 캐릭터, stat · goal = 모든 판을 합친 기록
const ACH = [
  { id: 'run1', name: '데뷔전', note: '아무 맵에서 한 판 하기' },
  { id: 'surv5', name: '1쿼터 생존', note: '5분 버티기', char: 'yns' },
  { id: 'boss1', name: '올스타 격파', note: '올스타 수비수(보스) 쓰러뜨리기', char: 'ebd' },
  { id: 'kill1000', name: '천 명 돌파', note: '한 판에 1,000명 쓰러뜨리기', char: 'weisblk' },
  { id: 'jackpot1', name: '잭팟!', note: '레벨 업 상자에서 잭팟 터뜨리기', char: 'lkdqq' },
  { id: 'lv20', name: '성장세', note: '한 판에 레벨 20 찍기', char: 'yjq' },
  { id: 'surv15', name: '3쿼터 생존', note: '15분 버티기', char: 'durant' },
  { id: 'arena10', name: '아레나 데뷔', note: '아레나에서 10분 버티기', char: 'bl' },
  { id: 'three8', name: '스플래시', note: '3점슛을 최고 레벨(8)로', char: 'klfd' },
  { id: 'dunk8', name: '포스터라이즈', note: '덩크를 최고 레벨(8)로', char: 'wsblk' },
  { id: 'surv10', name: '하프타임', note: '10분 버티기' },
  { id: 'surv20', name: '4쿼터 생존', note: '20분 버티기' },
  { id: 'surv30', name: '풀타임', note: '30분 끝까지 버티기' },
  { id: 'clear_park', name: '동네 전설', note: '스트리트 파크에서 30분' },
  { id: 'clear_arena', name: '아레나의 왕', note: '아레나에서 30분' },
  { id: 'clear_roof', name: '네온 레전드', note: '네온 루프탑에서 30분' },
  { id: 'roof10', name: '옥상의 밤', note: '네온 루프탑에서 10분 버티기' },
  { id: 'lv50', name: '슈퍼스타', note: '한 판에 레벨 50 찍기' },
  { id: 'kill5000', name: '수비 붕괴', note: '한 판에 5,000명 쓰러뜨리기' },
  { id: 'kills30k', name: '레전드', note: '모두 합쳐 30,000명 쓰러뜨리기', stat: 'kills', goal: 30000 },
  { id: 'jackpot10', name: '행운의 사나이', note: '잭팟 모두 합쳐 10번', stat: 'jackpots', goal: 10 },
  { id: 'boss10', name: '올스타 사냥꾼', note: '보스 모두 합쳐 10마리', stat: 'bosses', goal: 10 },
  { id: 'runs10', name: '개근상', note: '모두 합쳐 10판', stat: 'runs', goal: 10 },
  { id: 'full6', name: '올라운더', note: '한 판에 스킬 6개 채우기' },
  { id: 'max6', name: '완성형', note: '스킬 6개를 모두 최고 레벨로' },
  { id: 'nohit', name: '노 터치', note: '3분 동안 한 번도 안 맞기' },
  { id: 'allchar', name: '드림팀', note: '10명 모두로 한 판씩' },
]
const SURV = [[300, 'surv5'], [600, 'surv10'], [900, 'surv15'], [1200, 'surv20']]

const nameOf = c => P(c.id).name
const lockOf = c => { const a = ACH.find(x => x.char === c.id); return a && !save.ach[a.id] ? a : null }

// ---------------------------------------------------------------- 저장 — 업적 · 기록. 이 브라우저 + (로그인하면) 계정
const LS = 'survive.v1'
const okKey = k => /^[a-z0-9_]{1,32}$/.test(k)
const clean = o => Object.fromEntries(Object.entries(o && typeof o === 'object' && !Array.isArray(o) ? o : {}).filter(([k, v]) => okKey(k) && Number.isSafeInteger(v) && v >= 0))
let save = { ach: {}, stats: {} }
try { const v = JSON.parse(localStorage.getItem(LS)); save = { ach: clean(v?.ach), stats: clean(v?.stats) } } catch {}
/** 서버(server/index.mjs mergeSurvive)와 같은 규칙 — 업적은 둘 다(먼저 단 시각), 기록은 큰 쪽 */
function merge(a, b) {
  const ach = { ...a.ach }, stats = { ...a.stats }
  for (const [k, v] of Object.entries(b.ach)) ach[k] = k in ach ? Math.min(ach[k], v) : v
  for (const [k, v] of Object.entries(b.stats)) stats[k] = Math.max(stats[k] ?? 0, v)
  return { ach, stats }
}
const keep = () => { try { localStorage.setItem(LS, JSON.stringify(save)) } catch {} }
let pushT = 0
function persist(now = false) {
  keep()
  if (auth !== 'in') return
  clearTimeout(pushT)
  pushT = setTimeout(push, now ? 0 : 3000)   // 업적이 몰려 열려도 한 번에
}
async function push() {
  try { const v = await api('/survive', { method: 'PUT', body: save, withToken: true }); save = merge(save, { ach: clean(v.ach), stats: clean(v.stats) }); keep() } catch {}
}
/** 로그인 상태가 정해지면 — 계정 것을 받아 합치고, 이 브라우저에만 있던 게 있으면 올린다. 로그인 전에 끝낸 판이 있으면 랭킹에 */
async function pull() {
  refresh()
  RANK = null; loadRank()
  if (auth !== 'in') return
  let run = null
  try { run = JSON.parse(localStorage.getItem(PENDING)); localStorage.removeItem(PENDING) } catch {}
  if (run && Date.now() - run.at < 2 * 3600_000) submit({ map: run.map, hero: run.hero, secs: run.secs, kills: run.kills, lvl: run.lvl }).then(msg => msg && notice(msg))
  try {
    const v = await api('/survive', { withToken: true }), srv = { ach: clean(v.ach), stats: clean(v.stats) }
    const extra = Object.keys(save.ach).some(k => !(k in srv.ach)) || Object.entries(save.stats).some(([k, n]) => n > (srv.stats[k] ?? 0))
    save = merge(save, srv); keep()
    if (extra) push()
    refresh()
  } catch {}
}

// ---------------------------------------------------------------- 그림 도구 — 한 번 그려 두고(sprite) 옮겨 그린다
const mk = (w, H) => Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.ceil(w)), height: Math.max(1, Math.ceil(H)) })
const ell = (c, x, y, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill() }
const rr = (c, x, y, w, H, r, col) => { c.fillStyle = col; c.beginPath(); c.roundRect(x, y, w, H, r); c.fill() }
function tint(src, col) { const t = mk(src.width, src.height), c = t.getContext('2d'); c.drawImage(src, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = col; c.fillRect(0, 0, t.width, t.height); return t }
/** paint(c) 를 단위 좌표로 그린 그림 — (ox, oy) 가 기준점(사람은 발밑). k = 단위당 픽셀. line 이 있으면 둘레에 윤곽선 */
function sprite(w, H, ox, oy, paint, k = K, line = '#151922') {
  const a = mk(w * k, H * k), c = a.getContext('2d')
  c.setTransform(k, 0, 0, k, ox * k, oy * k); paint(c)
  if (!line) return { c: a, w, h: H, ox, oy }
  const out = mk(a.width, a.height), o = out.getContext('2d'), sil = tint(a, line), d = Math.max(1.2, k * 0.6)
  for (let i = 0; i < 8; i++) o.drawImage(sil, Math.cos(i * TAU / 8) * d, Math.sin(i * TAU / 8) * d)
  o.drawImage(a, 0, 0)
  return { c: out, w, h: H, ox, oy }
}
function flip(s) { const t = mk(s.c.width, s.c.height), c = t.getContext('2d'); c.scale(-1, 1); c.drawImage(s.c, -t.width, 0); return { ...s, c: t, ox: s.w - s.ox } }
const white = s => ({ ...s, c: tint(s.c, '#fff') })
const blit = (c, s, x, y, k = 1) => c.drawImage(s.c, x - s.ox * k, y - s.oy * k, s.w * k, s.h * k)
function star(c, x, y, r, col) {
  c.fillStyle = col; c.beginPath()
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q) }
  c.closePath(); c.fill()
}
/** '#rgb' · '#rrggbb' · 'rgb(r,g,b)'(얼굴에서 뽑은 피부색) → [r, g, b] */
function rgbOf(col) {
  if (col[0] !== '#') return col.match(/[\d.]+/g).slice(0, 3).map(Number)
  const x = col.length === 4 ? [...col.slice(1)].map(d => d + d).join('') : col.slice(1), n = parseInt(x, 16)
  return [n >> 16, n >> 8 & 255, n & 255]
}
function shade(col, f) { const [r, g, b] = rgbOf(col); return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})` }
const rgba = (col, a) => { const [r, g, b] = rgbOf(col); return `rgba(${r},${g},${b},${a})` }
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function hash(i, j, s) { let x = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041) | 0; x = Math.imul(x ^ x >>> 13, 1274126177); return ((x ^ x >>> 16) >>> 0) / 4294967296 }

/** 사람 — 발밑 (0,0), 오른쪽을 본다(키 약 52). o = { jersey, trim, shorts, skin, hair, hs 머리 모양, shoe, frame 0~3, wide, kind, num, mirror, head(얼굴 그림) }
 *  걸음 네 칸 — 0 · 2 는 두 발을 벌리고 1 · 3 은 뒷발을 들어 앞으로(몸이 살짝 뜬다). 앞(오른쪽) 팔다리는 밝게, 뒤는 어둡게 */
function person(c, o) {
  const k = o.kind, wd = o.wide || 1, sk = o.skin, skD = shade(sk, 0.76), f = o.frame || 0
  const sw = [1, 0, -1, 0][f], bob = f % 2 ? -1.1 : 0
  const leg = (x, dx, up, front) => {
    rr(c, x + dx - 2.1, -12.5 - up, 4.3, 10.5, 2.1, front ? sk : skD)
    rr(c, x + dx - 2.2, -6 - up, 4.5, 3.4, 1.1, front ? '#f5f5f5' : '#cfd3da')
    rr(c, x + dx - 2.2, -5.5 - up, 4.5, 0.9, 0.4, o.trim)
    rr(c, x + dx - 2.6, -3.7 - up, 7.2, 3.2, [1.6, 2.4, 1, 1], front ? o.shoe : shade(o.shoe, 0.72))
    rr(c, x + dx - 2.8, -1.3 - up, 7.6, 1.4, 0.7, front ? '#fff' : '#c9cdd4')
  }
  leg(-2.4, -sw * 2.6, f === 1 ? 1.8 : 0, false)
  leg(2.3, sw * 2.6, f === 3 ? 1.8 : 0, true)
  c.save(); c.translate(0, bob)
  arm(c, o, -6.4 * wd, k === 'screen' ? Math.PI - 0.15 : sw * 0.55, skD, false)
  // 반바지 — 빛 받는 쪽이 밝게, 옆줄 · 허리 밴드
  const sg = c.createLinearGradient(-7 * wd, 0, 7 * wd, 0); sg.addColorStop(0, shade(o.shorts, 1.12)); sg.addColorStop(1, shade(o.shorts, 0.74))
  c.fillStyle = sg; c.beginPath(); c.roundRect(-7.2 * wd, -18.6, 14.4 * wd, 9.4, [2, 2, 2.8, 2.8]); c.fill()
  rr(c, -7.2 * wd, -18.6, 14.4 * wd, 1.7, 0.8, shade(o.shorts, 0.7))
  rr(c, 4.6 * wd, -17, 1.7, 7.6, 0.8, o.trim)
  // 몸통(민소매)
  const j = o.jersey, tg = c.createLinearGradient(-7 * wd, -30, 7 * wd, -16)
  tg.addColorStop(0, shade(j, 1.16)); tg.addColorStop(0.55, j); tg.addColorStop(1, shade(j, 0.76))
  c.fillStyle = tg; c.beginPath(); c.roundRect(-7.5 * wd, -30.2, 15 * wd, 13.8, [4.4, 4.4, 2.4, 2.4]); c.fill()
  if (k === 'ref') {   // 심판 — 검정 세로 줄무늬
    c.save(); c.beginPath(); c.roundRect(-7.5 * wd, -30.2, 15 * wd, 13.8, [4.4, 4.4, 2.4, 2.4]); c.clip()
    for (let x = -7.5 * wd + 1.6; x < 7.5 * wd; x += 3.8) rr(c, x, -31, 1.9, 16, 0, '#17191f')
    c.restore()
  } else {
    rr(c, 5.5 * wd, -26.5, 1.8, 10, 0.9, o.trim)   // 옆 판
    c.strokeStyle = o.trim; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-3.6, -30); c.lineTo(0.4, -25.4); c.lineTo(4.4, -30); c.stroke()
  }
  c.fillStyle = sk; c.beginPath(); c.moveTo(-3, -30.2); c.lineTo(3.8, -30.2); c.lineTo(0.4, -26.2); c.closePath(); c.fill()
  ell(c, 0.6, -29.8, 6.2, 1.6, 'rgba(0,0,0,.22)')   // 턱 그늘
  if (k === 'boss') star(c, 0.6, -22.4, 4.6, o.trim)
  else if (o.num != null) {   // 번호 — 왼쪽을 볼 때(mirror)도 바로
    c.save(); if (o.mirror) c.scale(-1, 1)
    c.font = '900 6.6px system-ui, sans-serif'; c.textAlign = 'center'; c.lineJoin = 'round'; c.lineWidth = 1.3; c.strokeStyle = shade(j, 0.55)
    const x = o.mirror ? -0.6 : 0.6; c.strokeText(String(o.num), x, -18.6); c.fillStyle = o.trim; c.fillText(String(o.num), x, -18.6)
    c.restore()
  }
  const up = k === 'fan' || k === 'screen'   // 팬(폼 손가락) · 스크린 서는 동료는 앞 손을 머리 위로 — 머리 다음에 그린다
  if (!up) arm(c, o, 6.2 * wd, -sw * 0.55, sk, true)
  if (o.head) { rr(c, -2.4, -33.6, 4.8, 5, 1.6, skD); c.drawImage(o.head, -10.8, -52.6, 22.4, 23.8) }   // 선수 얼굴 그림(cutHead)
  else face(c, o)
  if (up) arm(c, o, 6.2 * wd, Math.PI + (k === 'fan' ? 0.35 : 0.15), sk, true)
  c.restore()
}
/** 팔 — 어깨(x, -27.6)에서 ang 만큼 돈다(0 = 아래로, π = 위로). 손 · 손목 밴드 · 팬의 폼 손가락 */
function arm(c, o, x, ang, col, front) {
  const w = 3.8 * Math.min(1.25, o.wide || 1)
  c.save(); c.translate(x, -27.6); c.rotate(ang)
  rr(c, -w / 2, -1.2, w, 12.6, w / 2, col)
  ell(c, 0, 12, 2.4, 2.4, col)
  if (front && (o.kind === 'me' || o.kind === 'boss')) rr(c, -w / 2 - 0.2, 7.6, w + 0.4, 1.9, 0.6, o.kind === 'boss' ? '#ffd23f' : o.trim)
  if (front && o.kind === 'fan') { rr(c, -3.4, 10, 6.8, 8.6, 2.4, '#ffd23f'); rr(c, -1.3, 16.4, 2.6, 7, 1.3, '#ffd23f'); txt(c, '#1', 0, 16.4, 3.4, '#1a1200') }
  c.restore()
}
/** 그린 얼굴(수비) — 머리 모양 hs: 0 짧은 머리 · 1 아프로 · 2 하이 탑 · 3 민머리 · 4 콘로우 */
function face(c, o) {
  const sk = o.skin, k = o.kind, hc = o.hair, hs = o.hs || 0
  rr(c, -2.4, -33.6, 4.8, 5, 1.6, shade(sk, 0.7))
  if (hs === 1) for (const [x, y, r] of [[-5.4, -46.4, 5.4], [0.6, -49, 5.8], [6.2, -46.6, 5], [-7.8, -41.4, 4.2], [8.4, -42, 3.6]]) ell(c, x, y, r, r, hc)
  if (hs === 2) rr(c, -8.6, -53.4, 18.6, 12, [2.6, 2.6, 0, 0], hc)
  const g = c.createRadialGradient(-2, -43.4, 1, 0.6, -39.4, 11); g.addColorStop(0, shade(sk, 1.14)); g.addColorStop(0.7, sk); g.addColorStop(1, shade(sk, 0.8))
  c.fillStyle = g; c.beginPath(); c.ellipse(0.6, -39.4, 9.4, 10, 0, 0, TAU); c.fill()
  ell(c, -7.4, -38.6, 1.9, 2.6, shade(sk, 0.84))   // 귀
  if (hs === 0 || hs === 4 || k === 'ref') { c.fillStyle = k === 'ref' ? '#16181d' : hc; c.beginPath(); c.ellipse(0.6, -41.8, 9.7, 8, 0, Math.PI, TAU); c.fill(); if (k !== 'ref') rr(c, -8.6, -42.4, 3, 5, 1.4, hc) }
  if (hs === 4 && k !== 'ref') { c.strokeStyle = shade(hc, 1.6); c.lineWidth = 0.7; c.beginPath(); for (const x of [-4, -0.5, 3, 6.5]) { c.moveTo(x - 1, -49); c.lineTo(x - 2.4, -42) } c.stroke() }
  if (hs === 1 || hs === 2) { c.fillStyle = hc; c.beginPath(); c.ellipse(0.6, -42.6, 9.6, 6.4, 0, Math.PI, TAU); c.fill() }
  if (hs === 3) ell(c, -2.4, -45.4, 2.8, 1.6, 'rgba(255,255,255,.35)')
  if (k === 'ref') rr(c, 5, -43.8, 9.6, 2.4, 1.2, '#16181d')   // 모자 챙
  for (const x of [1.6, 6.4]) { ell(c, x, -38.4, 1.95, 2.4, '#fff'); ell(c, x + 0.6, -38.1, 1.15, 1.55, '#1b1b1b'); ell(c, x + 0.95, -38.8, 0.45, 0.45, '#fff') }
  c.strokeStyle = '#1c140e'; c.lineWidth = 1.5; c.lineCap = 'round'
  c.beginPath(); c.moveTo(-0.6, -41.7); c.lineTo(3, -40.6); c.moveTo(4.8, -40.6); c.lineTo(8.2, -41.9); c.stroke()   // 화난 눈썹
  ell(c, 9, -35.8, 1.3, 1.6, shade(sk, 0.9))   // 코
  if (k === 'big') { c.fillStyle = hc; c.beginPath(); c.ellipse(2.2, -33.4, 7.6, 4.8, 0, 0, Math.PI); c.fill() }   // 턱수염
  if (k === 'fan') { ell(c, 4.6, -32.2, 2.3, 2.7, '#5a1f24'); ell(c, 4.6, -31.1, 1.4, 1, '#d35b6b'); rr(c, 5.2, -36.2, 3.8, 1.3, 0.6, o.trim) }   // 소리 지르는 입 · 볼 페인트
  else { rr(c, 2.3, -33, 5.2, 1.9, 0.9, '#5a1f24'); rr(c, 2.7, -32.9, 4.4, 0.7, 0.3, '#fff') }   // 이를 악문다
  if (k === 'ref') { c.strokeStyle = '#d6d6d6'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(8.6, -31); c.lineTo(3, -28.8); c.stroke(); ell(c, 9, -31, 1.6, 1.2, '#ffd23f') }   // 호루라기
  if (k === 'big' || k === 'boss') rr(c, -9, -47, 19.4, 3.1, 1.4, k === 'boss' ? '#d6323a' : '#f4f4f4')   // 머리띠
}
/** 마스코트(정예) — 털북숭이: 털 테두리 · 큰 눈 · 웃는 입 */
function mascot(c, o) {
  const f = o.frame || 0, sw = [1, 0, -1, 0][f], bob = f % 2 ? -1.4 : 0
  ell(c, -6 - sw * 2.4, -2.6, 6, 3.4, shade(o.dark, 0.85)); ell(c, 6 + sw * 2.4, -2.6, 6, 3.4, o.dark)
  c.save(); c.translate(0, bob)
  ell(c, -15.4, -19 + sw * 2.4, 4.8, 7.6, shade(o.body, 0.75))
  const g = c.createRadialGradient(-5, -27, 2, 0, -18, 19); g.addColorStop(0, shade(o.body, 1.25)); g.addColorStop(1, shade(o.body, 0.8))
  c.fillStyle = g; c.beginPath()
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, x = Math.cos(a) * 15, y = -18 + Math.sin(a) * 15.6; c.moveTo(x + 2.8, y); c.arc(x, y, 2.8, 0, TAU) }
  c.moveTo(15, -18); c.ellipse(0, -18, 15, 15.6, 0, 0, TAU); c.fill()
  ell(c, 0, -13.5, 9.6, 10, o.belly)
  for (const s of [-1, 1]) { ell(c, s * 10.4, -33.4, 4.8, 4.8, o.body); ell(c, s * 10.4, -33.4, 2.3, 2.3, o.belly) }
  for (const x of [-4, 5.2]) { ell(c, x, -24, 4.6, 5.2, '#fff'); ell(c, x + 1.2, -23.4, 2.3, 2.9, '#151515'); ell(c, x + 1.9, -24.6, 0.9, 0.9, '#fff') }
  c.fillStyle = '#3a0f1e'; c.beginPath(); c.arc(1, -16.4, 5, 0.1 * Math.PI, 0.9 * Math.PI); c.closePath(); c.fill()
  rr(c, -3.2, -16.2, 8.4, 1.6, 0.6, '#fff')
  rr(c, -10, -9.4, 20, 4, 2, o.band)
  ell(c, 15.4, -19 - sw * 2.4, 4.8, 7.6, o.body)
  c.restore()
}
function ballPaint(c, r, gold = false) {   // gold — 돌파한 스킬의 금빛 공
  const g = c.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r); g.addColorStop(0, gold ? '#fff6c8' : '#ffb35e'); g.addColorStop(1, gold ? '#d99a1f' : '#d4600f')
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill()
  c.strokeStyle = gold ? '#5a3500' : '#3a1a05'; c.lineWidth = r * 0.13
  c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.moveTo(0, -r); c.lineTo(0, r); c.stroke()
  c.beginPath(); c.arc(-r * 1.25, 0, r * 0.85, -0.9, 0.9); c.stroke(); c.beginPath(); c.arc(r * 1.25, 0, r * 0.85, Math.PI - 0.9, Math.PI + 0.9); c.stroke()
}

// 수비 겉모습 — 종류마다 몇 벌. 피부 · 머리색은 그때그때
const SKINS = ['#f1c7a1', '#d9a47a', '#b57a52', '#8a5636', '#64391f'], HAIRS = ['#1d140e', '#3b2618', '#6b4a2a', '#c99a4e', '#2a2a2a']
const LOOK = {
  rookie: [{ jersey: '#9aa3b5', trim: '#4d5466', num: 12 }, { jersey: '#b85a4a', trim: '#f3e2d0', num: 4 }, { jersey: '#4f7a5b', trim: '#e9e3c9', num: 8 }, { jersey: '#33507e', trim: '#f2c14e', num: 21 }],
  fan: [{ jersey: '#e4572e', trim: '#fff' }, { jersey: '#2e86de', trim: '#fff' }, { jersey: '#9b59b6', trim: '#ffd23f' }],
  ref: [{ jersey: '#f4f4f4', trim: '#16181d', shorts: '#16181d', hair: '#16181d', hs: 0 }],
  big: [{ jersey: '#2d2f36', trim: '#e04848', wide: 1.25, num: 50 }, { jersey: '#5a3d8a', trim: '#f2c14e', wide: 1.25, num: 33 }],
  mascot: [{ body: '#7b3fbf', belly: '#d9c2f2', dark: '#3b1d5e', band: '#ffd23f' }, { body: '#d9622b', belly: '#f6d9b8', dark: '#6b2a0c', band: '#2e86de' }],
  boss: [{ jersey: '#f5c542', trim: '#1a1a1a', wide: 1.2 }],
}
const pickOf = a => a[rnd() * a.length | 0]
let SPR = null, BALL, BIG, HAND, BALLG, BIGG, HANDG, GEMS, ITEMS, WHISTLE, K = 2   // K = 사람 그림의 단위당 픽셀 — 화면 배율에 맞춰 판마다(작게 그려 두고 키우면 흐리고, 크게 그려 두고 줄이면 느리다)
function sprites(k = 2) {
  K = k; SPR = {}
  for (const [type, looks] of Object.entries(LOOK)) {
    const m = type === 'mascot', s = FOES[type].r / (m ? 16 : 12), [w, H, ox, oy] = m ? [44, 48, 22, 44] : [36, 66, 18, 62]
    SPR[type] = looks.map(L => {
      const o = { shoe: pickOf(['#25282f', '#e9ecf2', '#c0392b']), shorts: L.jersey, hair: pickOf(HAIRS), hs: type === 'boss' ? 3 : rnd() * 5 | 0, skin: pickOf(SKINS), kind: type, ...L }
      // 걸음 네 칸 — 번호가 있으면 왼쪽 그림도 따로 그려 번호가 뒤집히지 않게
      const paint = (frame, mirror) => sprite(w * s, H * s, ox * s, oy * s, c => { c.scale(s, s); if (mirror) c.scale(-1, 1); (m ? mascot : person)(c, { ...o, frame, mirror }) })
      const R = [0, 1, 2, 3].map(f => paint(f)), Lf = o.num != null ? [0, 1, 2, 3].map(f => paint(f, true)) : R.map(flip)
      return { R, L: Lf, WR: white(R[0]), WL: white(Lf[0]), col: L.jersey || L.body }
    })
  }
  BALL = sprite(20, 20, 10, 10, c => ballPaint(c, 7.5), K * 1.3)
  BIG = sprite(28, 28, 14, 14, c => ballPaint(c, 11.5), K * 1.3)
  BALLG = sprite(20, 20, 10, 10, c => ballPaint(c, 7.5, true), K * 1.3, '#2a1245')
  BIGG = sprite(28, 28, 14, 14, c => ballPaint(c, 11.5, true), K * 1.3, '#2a1245')
  const hand = (s, band) => c => {
    ell(c, 0, 3, 7.4, 8, s)
    for (let i = 0; i < 4; i++) rr(c, -7 + i * 3.6, -12 + Math.abs(i - 1.5) * 1.6, 3.1, 11, 1.5, s)
    rr(c, 5.2, -1, 7.5, 3.4, 1.7, s); rr(c, -6, 9.5, 12, 3.5, 1, band)
  }
  HAND = sprite(28, 34, 14, 17, hand('#f7d6b5', '#d6323a'), K * 1.2)
  HANDG = sprite(28, 34, 14, 17, hand('#ffe08a', '#7b3fbf'), K * 1.2, '#2a1245')   // 돌파 — 금빛 장갑
  GEMS = [['#5ab0ff', '#1d5fd1'], ['#62e38a', '#14924a'], ['#ff6b6b', '#c0262d']].map(([a, b], i) => sprite(16, 22, 8, 11, c => {
    const s = 1 + i * 0.25; c.scale(s, s)
    const g = c.createLinearGradient(-4, -6, 4, 6); g.addColorStop(0, a); g.addColorStop(1, b)
    c.fillStyle = g; c.beginPath(); c.moveTo(0, -7); c.lineTo(4.6, 0); c.lineTo(0, 7); c.lineTo(-4.6, 0); c.closePath(); c.fill()
    c.fillStyle = '#ffffffaa'; c.beginPath(); c.moveTo(0, -5.5); c.lineTo(2.2, -0.5); c.lineTo(0, 0.6); c.closePath(); c.fill()
  }, K * 1.2))
  ITEMS = Object.fromEntries(Object.entries(ITEM_ART).map(([k, f]) => [k, sprite(30, 30, 15, 15, f, K * 1.2)]))
  WHISTLE = sprite(20, 14, 10, 7, c => { c.scale(0.7, 0.7); ITEM_ART.whistle(c) }, K * 1.2)
}
// 줍는 것 — 드링크(회복) · 호루라기(경험치를 다 끌어온다) · 타임아웃(수비가 멈춘다) · 버저(화면 안 수비를 쓸어 낸다) · 트로피 상자(보스)
const ITEM_ART = {
  drink: c => { rr(c, -5, -9, 10, 18, 3, '#2ec4ff'); rr(c, -2.6, -12.5, 5.2, 4, 1, '#f4f4f4'); rr(c, -5, -3.5, 10, 6, 0, '#ff8a00'); rr(c, -3.6, -7.5, 1.6, 12, 0.8, '#ffffff88') },
  whistle: c => { rr(c, -10, -2.6, 9, 5.2, 1.6, '#aab4c3'); ell(c, 2, 0, 7, 5.4, '#d3dbe6'); ell(c, 3, -1.2, 2, 2, '#3a4048'); c.strokeStyle = '#ffd23f'; c.lineWidth = 1.4; c.beginPath(); c.arc(8.4, 2.4, 3, 0, TAU); c.stroke() },
  clock: c => { ell(c, 0, 0, 10, 10, '#3a7bd5'); ell(c, 0, 0, 7.6, 7.6, '#fff'); c.strokeStyle = '#16181d'; c.lineWidth = 1.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -5.5); c.moveTo(0, 0); c.lineTo(3.6, 1.6); c.stroke(); rr(c, -2, -13, 4, 3, 1, '#3a7bd5') },
  buzzer: c => { ell(c, 0, 4, 11, 5, '#4b4f58'); rr(c, -11, 0, 22, 4, 1, '#4b4f58'); ell(c, 0, 0, 8, 6, '#e63946'); ell(c, -2.4, -2, 3, 1.8, '#ffffff88') },
  chest: c => { rr(c, -11, -5, 22, 13, 2, '#c98a1f'); rr(c, -11, -11, 22, 7, 3, '#f2c14e'); rr(c, -11, -1, 22, 2, 0, '#7a4b12'); rr(c, -2.4, -4, 4.8, 5, 1, '#7a4b12'); star(c, 0, -7.6, 2.6, '#fff6c8') },
  ring: c => {   // 챔피언 반지 — 돌파
    c.strokeStyle = '#b07415'; c.lineWidth = 4.4; c.beginPath(); c.ellipse(0, 4, 8.6, 7.4, 0, 0, TAU); c.stroke()
    c.strokeStyle = '#ffe066'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(0, 4, 8.6, 7.4, 0, Math.PI * 0.1, Math.PI * 0.9); c.stroke()
    rr(c, -8.5, -9, 17, 8, 3, '#f2c14e'); rr(c, -8.5, -3, 17, 2, 1, '#b07415')
    const g = c.createLinearGradient(-5, -14, 5, -3); g.addColorStop(0, '#f0d9ff'); g.addColorStop(1, '#7b3fbf')
    c.fillStyle = g; c.beginPath(); c.moveTo(0, -14.5); c.lineTo(6.5, -8.5); c.lineTo(0, -2.5); c.lineTo(-6.5, -8.5); c.closePath(); c.fill()
    ell(c, -2, -10, 1.5, 1.1, '#fff'); for (const x of [-7, 7]) star(c, x, -6, 2, '#fff6c8')
  },
}

// ---------------------------------------------------------------- 아이콘 — 스킬 · 아이템(HUD · 상자 카드 · 아래 설명)
const ICON = {}, ICON_URL = {}
const GLYPH = {
  pass: c => { lines(c, [[-26, -6, -12, -6], [-28, 2, -12, 2], [-24, 10, -12, 10]]); ballAt(c, 6, 2, 13) },
  three: c => { c.setLineDash([5, 4]); arcLine(c, -22, 18, 10, -18, -26); c.setLineDash([]); ballAt(c, 14, -16, 10); txt(c, '3', -12, 14, 24) },
  dunk: c => { ballAt(c, 0, -14, 11); c.strokeStyle = '#ff7a1a'; c.lineWidth = 4; c.beginPath(); c.ellipse(0, 6, 16, 5, 0, 0, TAU); c.stroke(); lines(c, [[-12, 9, -8, 22], [0, 11, 0, 24], [12, 9, 8, 22]], '#fff', 2) },
  bounce: c => { c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(-26, -14); c.lineTo(-12, 16); c.lineTo(2, -10); c.lineTo(14, 12); c.stroke(); ballAt(c, 16, 10, 10) },
  block: c => { blit(c, HAND, 0, 0, 1.6) },
  press: c => { for (const [r, a] of [[24, '#ff5d5d44'], [17, '#ff5d5d77'], [10, '#ff5d5d']]) ell(c, 0, 0, r, r, a); ballAt(c, 0, 0, 7) },
  alley: c => { ballAt(c, 0, -16, 10); lines(c, [[0, -4, 0, 12], [-6, 6, 0, 13], [6, 6, 0, 13]], '#fff', 3.4); c.strokeStyle = '#ff7a1a'; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 20, 14, 4, 0, 0, TAU); c.stroke() },
  fade: c => { lines(c, [[-28, -8, -6, -8], [-30, 0, -6, 0], [-28, 8, -6, 8]], '#ffd23f', 3); ballAt(c, 10, 0, 12) },
  cross: c => { c.strokeStyle = '#fff'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.arc(0, -4, 20, Math.PI * 1.05, Math.PI * 1.95); c.stroke(); c.beginPath(); c.arc(0, 4, 20, Math.PI * 0.05, Math.PI * 0.95); c.stroke(); ballAt(c, 0, 0, 8) },
  nolook: c => { c.strokeStyle = '#7ff3ff'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.arc(0, 0, 18, -Math.PI * 0.9, Math.PI * 0.6); c.stroke(); lines(c, [[-6, 17, 0, 14], [-6, 17, -1, 22]], '#7ff3ff', 4); ballAt(c, -14, -10, 9) },
  hook: c => { c.strokeStyle = '#fff'; c.lineWidth = 3; c.setLineDash([5, 4]); arcLine(c, -22, 22, 18, 10, -34); c.setLineDash([]); ballAt(c, 2, -18, 12) },
  buzzer: c => { c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(6, -28); c.lineTo(-12, 4); c.lineTo(0, 4); c.lineTo(-6, 28); c.lineTo(14, -6); c.lineTo(2, -6); c.closePath(); c.fill() },
  screen: c => { rr(c, -6, -26, 12, 12, 6, '#f1c7a1'); rr(c, -10, -14, 20, 26, 5, '#5ab0ff'); rr(c, -17, -30, 6, 22, 3, '#f1c7a1'); rr(c, 11, -30, 6, 22, 3, '#f1c7a1'); rr(c, -9, 12, 7, 14, 3, '#f1c7a1'); rr(c, 2, 12, 7, 14, 3, '#f1c7a1') },
  weight: c => { rr(c, -18, -3, 36, 6, 3, '#cfd5de'); for (const x of [-22, -16, 10, 16]) rr(c, x, -12, 6, 24, 2, '#5a6270') },
  knee: c => { rr(c, -12, -22, 24, 44, 10, '#2a2f3a'); rr(c, -12, -6, 24, 12, 4, '#ffd23f') },
  cardio: c => { c.fillStyle = '#ff4d6d'; c.beginPath(); c.moveTo(0, 20); c.bezierCurveTo(-30, 0, -16, -26, 0, -10); c.bezierCurveTo(16, -26, 30, 0, 0, 20); c.fill(); lines(c, [[-16, 0, -6, 0], [-6, 0, -2, -8], [-2, -8, 3, 8], [3, 8, 6, 0], [6, 0, 16, 0]], '#fff', 2.6) },
  ice: c => { rr(c, -16, -16, 32, 32, 7, '#a9e3ff'); rr(c, -12, -12, 14, 8, 3, '#ffffffcc'); lines(c, [[-8, 8, 8, -8], [-8, -8, 8, 8], [-11, 0, 11, 0]], '#3d8fd6', 2.4) },
  notes: c => { rr(c, -16, -22, 32, 44, 4, '#e9e3c9'); rr(c, -6, -26, 12, 7, 2, '#8a8f99'); txt(c, 'X', -6, 4, 16, '#d6323a'); txt(c, 'O', 7, 16, 16, '#1d5fd1') },
  span: c => { lines(c, [[-26, 0, 26, 0], [-26, 0, -18, -7], [-26, 0, -18, 7], [26, 0, 18, -7], [26, 0, 18, 7]], '#fff', 4); rr(c, -6, -14, 12, 28, 6, '#5ab0ff') },
  shoes: c => { c.fillStyle = '#e63946'; c.beginPath(); c.moveTo(-24, 10); c.lineTo(-22, -12); c.lineTo(-8, -12); c.lineTo(4, -2); c.lineTo(22, 2); c.quadraticCurveTo(28, 10, 22, 12); c.closePath(); c.fill(); rr(c, -26, 10, 52, 6, 3, '#fff') },
  handle: c => { ballAt(c, 0, 0, 12); c.strokeStyle = '#7ff3ff'; c.lineWidth = 3.4; c.beginPath(); c.arc(0, 0, 21, -0.4, Math.PI * 1.1); c.stroke() },
  stamina: c => { c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(-14, -22); c.lineTo(14, -22); c.lineTo(0, 0); c.lineTo(14, 22); c.lineTo(-14, 22); c.lineTo(0, 0); c.closePath(); c.fill(); rr(c, -16, -25, 32, 4, 2, '#8a5a2a'); rr(c, -16, 21, 32, 4, 2, '#8a5a2a') },
  double: c => { txt(c, '×2', 0, 12, 30) },
  vision: c => { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, 0, 24, 13, 0, 0, TAU); c.fill(); ell(c, 0, 0, 9, 9, '#1d5fd1'); ell(c, 0, 0, 4, 4, '#111') },
  clutch: c => { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ell(c, Math.cos(a) * 10, Math.sin(a) * 10, 9, 9, '#3ccf6e') } ell(c, 0, 0, 5, 5, '#2a9a50') },
  rookie: c => { star(c, 0, 0, 22, '#ffd23f'); txt(c, 'XP', 0, 6, 14, '#5a3a00') },
  drink: c => { c.scale(2, 2); ITEM_ART.drink(c) },
  cheer: c => { c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(-20, -8); c.lineTo(8, -20); c.lineTo(8, 20); c.lineTo(-20, 8); c.closePath(); c.fill(); rr(c, -24, -8, 6, 16, 2, '#e4572e'); lines(c, [[14, -12, 22, -18], [16, 0, 26, 0], [14, 12, 22, 18]], '#fff', 3) },
}
function ballAt(c, x, y, r) { c.save(); c.translate(x, y); ballPaint(c, r); c.restore() }
function lines(c, ls, col = '#fff', w = 3) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); for (const [a, b, d, e] of ls) { c.moveTo(a, b); c.lineTo(d, e) } c.stroke() }
function arcLine(c, x0, y0, x1, y1, top) { c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, top, x1, y1); c.stroke() }
function txt(c, s, x, y, size, col = '#fff') { c.font = `900 ${size}px system-ui, sans-serif`; c.textAlign = 'center'; c.lineWidth = size * 0.2; c.strokeStyle = '#0b0e14'; c.lineJoin = 'round'; c.strokeText(s, x, y); c.fillStyle = col; c.fillText(s, x, y) }
function icons() {
  const BG = { w: ['#ff9f43', '#c0390b'], p: ['#4dabf7', '#1c4f9c'], f: ['#51cf66', '#1d7a34'] }
  for (const id of [...Object.keys(WEAP), ...Object.keys(PASS), ...Object.keys(FILL)]) {
    const kind = id in WEAP ? 'w' : id in PASS ? 'p' : 'f', a = mk(64, 64), c = a.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 64)
    g.addColorStop(0, BG[kind][0]); g.addColorStop(1, BG[kind][1])
    rr(c, 1, 1, 62, 62, 12, '#0b0e14'); c.fillStyle = g; c.beginPath(); c.roundRect(3, 3, 58, 58, 10); c.fill()
    c.fillStyle = '#ffffff22'; c.beginPath(); c.roundRect(3, 3, 58, 26, [10, 10, 4, 4]); c.fill()
    c.save(); c.translate(32, 32); c.scale(0.92, 0.92); GLYPH[id](c); c.restore()
    ICON[id] = a; ICON_URL[id] = a.toDataURL()
  }
  for (const id in WEAP) {   // 돌파 — 같은 그림을 금테 · 보라 밤하늘 · 빛살 위에(ICON['pass+'])
    const a = mk(64, 64), c = a.getContext('2d'), rim = c.createLinearGradient(0, 0, 64, 64), g = c.createRadialGradient(32, 26, 3, 32, 32, 42)
    rim.addColorStop(0, '#fff6c8'); rim.addColorStop(0.4, '#e9b23a'); rim.addColorStop(0.7, '#9a6312'); rim.addColorStop(1, '#ffe08a')
    g.addColorStop(0, '#7a3fc4'); g.addColorStop(0.6, '#2c1252'); g.addColorStop(1, '#120720')
    rr(c, 0, 0, 64, 64, 13, '#0b0e14'); c.fillStyle = rim; c.beginPath(); c.roundRect(1.5, 1.5, 61, 61, 12); c.fill()
    c.fillStyle = g; c.beginPath(); c.roundRect(5, 5, 54, 54, 9); c.fill()
    c.save(); c.clip(); c.translate(32, 32); c.fillStyle = 'rgba(255,214,90,.13)'
    for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(-6, -48); c.lineTo(6, -48); c.fill() }
    c.restore()
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; c.drawImage(glow('#ffc94a'), 8, 8, 48, 48); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'
    c.save(); c.translate(32, 33); c.scale(0.86, 0.86); GLYPH[id](c); c.restore()
    c.fillStyle = '#ffffff1e'; c.beginPath(); c.roundRect(5, 5, 54, 22, [9, 9, 3, 3]); c.fill()
    star(c, 53, 11, 7.5, '#5a3500'); star(c, 53, 11, 6, '#fff3b0')
    ICON[`${id}+`] = a; ICON_URL[`${id}+`] = a.toDataURL()
  }
}
const iconOf = w => w.br ? `${w.id}+` : w.id

// ---------------------------------------------------------------- 맵 그림 — 바닥 타일(512) · 바닥 그림(코트) · 소품
const T = 512, wrap9 = fn => { for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) fn(ox, oy) }
function tile(paint, k = 1.25) { const a = mk(T * k, T * k), c = a.getContext('2d'); c.scale(k, k); paint(c); return a }
function specks(c, r, n, cols, size = 2.2) {
  const all = Array.from({ length: n }, () => [r() * T, r() * T, 0.6 + r() * size, cols[r() * cols.length | 0]])
  wrap9((ox, oy) => { for (const [x, y, s, col] of all) { c.fillStyle = col; c.fillRect(x + ox, y + oy, s, s) } })
}
const ART = {}
function art(map) {
  if (ART[map.id]) return ART[map.id]
  const r = rng(map.id.length * 977), A = { props: [] }
  if (map.id === 'park') {
    A.tile = tile(c => {
      c.fillStyle = '#43474f'; c.fillRect(0, 0, T, T)
      const blobs = Array.from({ length: 16 }, () => [r() * T, r() * T, 40 + r() * 90, r() < 0.5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.025)'])
      wrap9((ox, oy) => { for (const [x, y, s, col] of blobs) ell(c, x + ox, y + oy, s, s * 0.6, col) })
      specks(c, r, 2600, ['#ffffff14', '#00000026', '#ffffff0c', '#5a5f68'])
      c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1
      for (let i = 0; i < 5; i++) { let x = 60 + r() * 390, y = 60 + r() * 390; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 34; y += (r() - 0.5) * 34; c.lineTo(x, y) } c.stroke() }
    })
    const sh = c => ell(c, 4, 1, 22, 7, 'rgba(0,0,0,.28)')
    A.props = [
      sprite(96, 96, 48, 70, c => { ell(c, 10, 2, 34, 11, 'rgba(0,0,0,.3)'); rr(c, -3.5, -24, 7, 24, 2, '#5b3a22'); for (const [x, y, s, col] of [[-14, -44, 22, '#2f6b35'], [14, -46, 22, '#2f6b35'], [0, -60, 23, '#3a7d40'], [-6, -58, 11, '#4f9a53'], [10, -50, 9, '#4f9a53']]) ell(c, x, y, s, s * 0.92, col) }, 1.6, null),
      sprite(64, 34, 32, 26, c => { sh(c); rr(c, -24, -8, 3, 8, 1, '#3d3d3d'); rr(c, 21, -8, 3, 8, 1, '#3d3d3d'); rr(c, -27, -14, 54, 6, 2, '#9c6b3c'); rr(c, -27, -22, 54, 5, 2, '#b07a46') }, 1.8, null),
      sprite(26, 30, 13, 26, c => { ell(c, 3, 0, 10, 4, 'rgba(0,0,0,.28)'); rr(c, -9, -4, 18, 4, 1, '#e8590c'); c.fillStyle = '#ff7a1a'; c.beginPath(); c.moveTo(-6, -3); c.lineTo(0, -22); c.lineTo(6, -3); c.closePath(); c.fill(); rr(c, -3.6, -13, 7.2, 3, 1, '#fff') }, 2, null),
      sprite(30, 36, 15, 30, c => { ell(c, 4, 0, 12, 4, 'rgba(0,0,0,.28)'); rr(c, -9, -22, 18, 22, 3, '#4a5560'); ell(c, 0, -22, 10, 4, '#5d6b78'); rr(c, -9, -14, 18, 2, 0, '#3b444d') }, 2, null),
      sprite(42, 40, 21, 32, c => { ell(c, 4, 0, 18, 5, 'rgba(0,0,0,.28)'); rr(c, -16, -12, 32, 12, 2, '#6b4a2a'); for (const x of [-10, 0, 10]) ballAt(c, x, -16, 5.6) }, 2, null),
    ]
  } else if (map.id === 'arena') {
    A.tile = tile(c => {
      for (let y = 0; y < T; y += 16) {
        let x = -r() * 200
        while (x < T) { const L = 90 + r() * 150; c.fillStyle = shade('#c99459', 0.86 + r() * 0.22); c.fillRect(x, y, L, 16); c.fillStyle = 'rgba(70,35,10,.35)'; c.fillRect(x, y, 1.2, 16); c.fillStyle = 'rgba(90,50,20,.08)'; for (let k = 0; k < 3; k++) c.fillRect(x, y + 3 + r() * 10, L, 0.8); x += L }
        c.fillStyle = 'rgba(70,35,10,.3)'; c.fillRect(0, y, T, 1)
      }
      const g = c.createLinearGradient(0, 0, T, T); g.addColorStop(0, 'rgba(255,255,255,.06)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.04)')
      c.fillStyle = g; c.fillRect(0, 0, T, T)
    })
    const SH = ['#d6323a', '#2f6fd0', '#f4f4f4', '#1f9d6b', '#f2c14e', '#2b2f3a', '#8b4fd0']
    A.stand = tile(c => {
      c.fillStyle = '#171a24'; c.fillRect(0, 0, T, 300)
      for (let row = 0; row < 7; row++) {
        const y = 16 + row * 40
        c.fillStyle = row % 2 ? '#222636' : '#262b3c'; c.fillRect(0, y, T, 38)
        for (let x = 8; x < T; x += 16) {
          if (r() < 0.86) { rr(c, x - 6, y + 15, 12, 18, 4, SH[r() * SH.length | 0]); ell(c, x, y + 11, 5, 5.6, SKINS[r() * SKINS.length | 0]); ell(c, x, y + 8, 5, 3, HAIRS[r() * HAIRS.length | 0]) }
          else rr(c, x - 6, y + 17, 12, 13, 2, '#3a4157')
        }
      }
      rr(c, 0, 6, T, 4, 2, '#9aa3b5')
    }, 1)
  } else {
    A.tile = tile(c => {
      for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 4; gy++) { c.fillStyle = shade('#252a3a', 0.85 + r() * 0.25); c.fillRect(gx * 128 + 1.5, gy * 128 + 1.5, 125, 125) }
      c.fillStyle = '#12141c'; for (let i = 0; i <= 4; i++) { c.fillRect(i * 128 - 1.5, 0, 3, T); c.fillRect(0, i * 128 - 1.5, T, 3) }
      specks(c, r, 1600, ['#ffffff0d', '#00000033'])
      const pud = Array.from({ length: 5 }, () => [r() * T, r() * T, 30 + r() * 50, r() < 0.5 ? 'rgba(255,60,200,.07)' : 'rgba(40,220,255,.07)'])
      wrap9((ox, oy) => { for (const [x, y, s, col] of pud) ell(c, x + ox, y + oy, s, s * 0.45, col) })
      c.save(); c.lineWidth = 3
      c.shadowBlur = 16; c.shadowColor = '#22e4ff'; c.strokeStyle = '#8ff6ff'; c.beginPath(); c.moveTo(0, 256); c.lineTo(T, 256); c.stroke()
      c.shadowColor = '#ff3fd4'; c.strokeStyle = '#ff9be9'; c.beginPath(); c.moveTo(256, 0); c.lineTo(256, T); c.stroke()
      c.restore()
    })
    const sh = (w = 24) => c => ell(c, 6, 1, w, 7, 'rgba(0,0,0,.4)')
    A.props = [
      sprite(60, 50, 30, 40, c => { sh(26)(c); rr(c, -22, -26, 44, 26, 3, '#8d96a1'); rr(c, -22, -34, 44, 10, 3, '#b3bcc6'); ell(c, -8, -29, 7, 3.5, '#4d545c'); for (let x = 4; x < 20; x += 4) rr(c, x, -22, 2, 16, 1, '#6b737d') }, 1.8, null),
      sprite(52, 70, 26, 60, c => { sh(22)(c); rr(c, -18, -46, 36, 46, 8, '#5d4b3d'); ell(c, 0, -46, 18, 6, '#77614f'); rr(c, -18, -30, 36, 3, 0, '#3e3128'); rr(c, -18, -14, 36, 3, 0, '#3e3128') }, 1.8, null),
      sprite(22, 26, 11, 20, c => { sh(9)(c); rr(c, -5, -16, 10, 16, 4, '#79818b'); ell(c, 0, -16, 8, 3, '#a0a8b1') }, 2, null),
      sprite(110, 50, 55, 25, c => { c.shadowBlur = 10; c.shadowColor = '#ff3fd4'; c.font = 'italic 900 34px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeStyle = '#ff9be9'; c.lineWidth = 2.6; c.strokeText('DUNK', 0, 0) }, 1.8, null),
      sprite(70, 50, 35, 25, c => { rr(c, -30, -20, 60, 40, 3, '#22394f'); rr(c, -30, -20, 60, 40, 3, '#22394f'); c.strokeStyle = '#6aa8d8'; c.lineWidth = 1.2; c.strokeRect(-30, -20, 60, 40); lines(c, [[-20, 12, -6, -12], [-10, 14, 4, -10]], '#ffffff30', 3) }, 1.8, null),
    ]
  }
  return ART[map.id] = A
}
// 스트리트 파크의 코트 — 큰 칸(1300×900)마다 반쯤. 시작 자리(0,0)에는 늘 하나
const courtAt = (mi, mj) => (mi === 0 && mj === 0) || hash(mi, mj, 5) < 0.45 ? { x: mi * 1300, y: mj * 900 } : null
function parkCourt(c, x, y) {
  const L = 560, D = 320, l = x - L / 2, t = y - D / 2
  rr(c, l - 18, t - 18, L + 36, D + 36, 6, '#24507a'); c.fillStyle = '#2f6c9e'; c.fillRect(l, t, L, D)
  c.fillStyle = '#c4553c'; c.fillRect(l, y - 55, 125, 110); c.fillRect(l + L - 125, y - 55, 125, 110)
  courtLines(c, x, y, L, D, 125, 55, 165, 'rgba(255,255,255,.85)')
}
function courtLines(c, x, y, L, D, key, kw, r3, col) {
  const l = x - L / 2, rt = x + L / 2
  c.strokeStyle = col; c.lineWidth = 3.4
  c.strokeRect(l, y - D / 2, L, D); c.strokeRect(l, y - kw, key, kw * 2); c.strokeRect(rt - key, y - kw, key, kw * 2)
  c.beginPath(); c.moveTo(x, y - D / 2); c.lineTo(x, y + D / 2); c.stroke()
  for (const [cx0, a] of [[x, 0], [l + key, -1], [rt - key, 1]]) { c.beginPath(); a ? c.arc(cx0, y, kw * 0.85, a < 0 ? -Math.PI / 2 : Math.PI / 2, a < 0 ? Math.PI / 2 : Math.PI * 1.5) : c.arc(cx0, y, kw * 0.85, 0, TAU); c.stroke() }
  for (const s of [1, -1]) {
    const bx = s > 0 ? l : rt, rx = bx + s * 26, sy = Math.min(r3 * 0.94, D / 2 - 12), ang = Math.asin(sy / r3)
    c.beginPath(); c.moveTo(bx, y - sy); c.lineTo(rx + s * Math.cos(ang) * r3, y - sy)
    s > 0 ? c.arc(rx, y, r3, -ang, ang) : c.arc(rx, y, r3, Math.PI + ang, Math.PI - ang, true)
    c.lineTo(bx, y + sy); c.stroke()
    c.lineWidth = 4.4; c.beginPath(); c.moveTo(bx + s * 10, y - 22); c.lineTo(bx + s * 10, y + 22); c.stroke(); c.lineWidth = 3.4
    c.strokeStyle = '#ff7a1a'; c.beginPath(); c.arc(rx, y, 8, 0, TAU); c.stroke(); c.strokeStyle = col
  }
}
/** 바닥 — (x0, y0) 부터 w × h 안. 미리보기 캔버스도 같은 걸 쓴다 */
function floor(c, map, x0, y0, w, H, t = 0) {
  const A = art(map), i0 = Math.floor(x0 / T), j0 = Math.floor(y0 / T)
  if (map.id === 'arena') {
    const W = map.wall
    c.save(); c.beginPath(); c.rect(x0, -W, w, 2 * W); c.clip()
    for (let j = j0; j * T < y0 + H; j++) for (let i = i0; i * T < x0 + w; i++) c.drawImage(A.tile, i * T, j * T, T + 0.6, T + 0.6)
    for (let k = Math.floor((x0 - 700) / 1400); k * 1400 - 700 < x0 + w; k++) {
      const x = k * 1400
      c.fillStyle = '#7c1d2c'; c.fillRect(x - 640, -90, 210, 180); c.fillRect(x + 430, -90, 210, 180)
      ell(c, x, 0, 78, 78, '#7c1d2c'); c.font = 'italic 900 40px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f2c14e'; c.fillText('TNAB', x, 2)
      courtLines(c, x, 0, 1280, 740, 210, 90, 250, 'rgba(255,255,255,.9)')
    }
    c.restore()
    for (const s of [1, -1]) {   // 관중석(위는 뒤집어서) · 전광판 띠
      c.save(); c.scale(1, s)
      for (let i = i0; i * T < x0 + w; i++) c.drawImage(A.stand, 0, 0, T, 300, i * T, W + 16, T + 0.6, 300)
      c.fillStyle = '#0b0d13'; c.fillRect(x0, W + 316, w, 2000)
      const g = c.createLinearGradient(0, W, 0, W + 16); g.addColorStop(0, '#11131c'); g.addColorStop(1, '#262b3c'); c.fillStyle = g; c.fillRect(x0, W, w, 16)
      c.restore()
      c.font = '900 11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = (t * 2 | 0) % 2 ? '#ffd23f' : '#7ff3ff'
      for (let x = Math.floor(x0 / 160) * 160; x < x0 + w + 160; x += 160) c.fillText('TNAB VIPERS', x, s * (W + 8))
    }
    return
  }
  for (let j = j0; j * T < y0 + H; j++) for (let i = i0; i * T < x0 + w; i++) c.drawImage(A.tile, i * T, j * T, T + 0.6, T + 0.6)
  if (map.id === 'park') {
    for (let mi = Math.floor((x0 - 400) / 1300); mi * 1300 - 400 < x0 + w; mi++) for (let mj = Math.floor((y0 - 260) / 900); mj * 900 - 260 < y0 + H; mj++) { const ct = courtAt(mi, mj); if (ct) parkCourt(c, ct.x, ct.y) }
  } else {
    for (let mi = Math.floor((x0 - 200) / 1100); mi * 1100 - 200 < x0 + w; mi++) for (let mj = Math.floor((y0 - 200) / 1100); mj * 1100 - 200 < y0 + H; mj++) {
      if (!((mi === 0 && mj === 0) || hash(mi, mj, 9) < 0.3)) continue
      const x = mi * 1100, y = mj * 1100
      c.strokeStyle = '#f2c14e'; c.lineWidth = 7; c.beginPath(); c.arc(x, y, 110, 0, TAU); c.stroke()
      c.setLineDash([18, 14]); c.lineWidth = 3; c.beginPath(); c.arc(x, y, 140, 0, TAU); c.stroke(); c.setLineDash([])
      c.font = '900 120px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f2c14ecc'; c.fillText('H', x, y + 6)
    }
  }
  const C = 340
  for (let i = Math.floor((x0 - 60) / C); i * C < x0 + w + 60; i++) for (let j = Math.floor((y0 - 60) / C); j * C < y0 + H + 80; j++) {
    if (hash(i, j, 3) > 0.42) continue
    const x = i * C + 40 + hash(i, j, 4) * (C - 80), y = j * C + 40 + hash(i, j, 6) * (C - 80)
    if (map.id === 'park') { const ct = courtAt(Math.round(x / 1300), Math.round(y / 900)); if (ct && Math.abs(x - ct.x) < 330 && Math.abs(y - ct.y) < 210) continue }
    else if (Math.hypot(x - Math.round(x / 1100) * 1100, y - Math.round(y / 1100) * 1100) < 170) continue
    blit(c, A.props[hash(i, j, 8) * A.props.length | 0], x, y)
  }
}

// ---------------------------------------------------------------- 화면 · 입력
const cv = document.getElementById('sv'), cx = cv.getContext('2d'), ui = document.getElementById('sv-ui'), toasts = document.getElementById('sv-toasts')
const pauseBtn = document.getElementById('sv-pause'), stage = cv.closest('.slam-stage'), fsBtn = document.getElementById('btn-fs'), vv = window.visualViewport
// 캔버스 픽셀 한도 — 전체 화면(큰 모니터 · 고해상도 휴대폰)에서 devicePixelRatio 를 그대로 쓰면 그릴 픽셀이 몇 배(1920×1080×2² ≈ 830만)로 늘어 끊겼다.
// 한도 안에서만 키우고, 느린 기기는 판 중에 한도를 더 줄인다(frame). 사람 그림도 그 배율로 다시 그린다(kOf)
let BUDGET = 2.2e6, SC = 1, VW = VIEW, VH = VIEW, still = 2
const kOf = () => clamp(Math.round(SC * 4) / 4, 1.25, 2.75)
function size() {
  const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2, Math.sqrt(BUDGET / Math.max(1, r.width * r.height)))
  cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d))
  SC = Math.min(cv.width, cv.height) / VIEW; VW = cv.width / SC; VH = cv.height / SC
  still = 2
  if (G && Math.abs(kOf() - K) >= 0.5) { sprites(kOf()); pl.spr = playerSprites(G.ch) }
}
new ResizeObserver(size).observe(cv)

const key = { u: 0, d: 0, l: 0, r: 0 }, joy = { on: false, id: null, x: 0, y: 0, ox: 0, oy: 0, px: 0, py: 0 }
const KEYS = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' }
addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea, select')) return
  const k = KEYS[e.code]
  if (k) key[k] = 1
  if ((k || e.code === 'Space') && mode === 'play') e.preventDefault()   // 판 중에는 페이지가 움직이지 않게
  if (e.code === 'Escape' || e.code === 'KeyP') { if (mode === 'play') { pause(); e.preventDefault() } else if (mode === 'pause') resume() }
  if (mode === 'box') boxKey(e)
})
addEventListener('keyup', e => { const k = KEYS[e.code]; if (k) key[k] = 0 })
const calm = () => { for (const k in key) key[k] = 0; joy.on = false; joy.id = null; joy.x = joy.y = 0 }
addEventListener('blur', () => { calm(); if (mode === 'play') pause() })
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') pause() })
// 손가락 스틱 — 화면 아무 데나 누른 자리가 가운데. 멀리 끌면 원이 손가락을 따라온다
cv.addEventListener('pointerdown', e => {
  if (mode !== 'play') return
  cv.setPointerCapture(e.pointerId)
  const r = cv.getBoundingClientRect()
  Object.assign(joy, { on: true, id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top, x: 0, y: 0 }); joy.px = joy.ox; joy.py = joy.oy
})
cv.addEventListener('pointermove', e => {
  if (e.pointerId !== joy.id) return
  const r = cv.getBoundingClientRect(), R = 46
  let dx = e.clientX - r.left - joy.ox, dy = e.clientY - r.top - joy.oy
  const d = Math.hypot(dx, dy)
  if (d > R) { joy.ox += dx * (1 - R / d); joy.oy += dy * (1 - R / d); dx *= R / d; dy *= R / d }
  joy.px = joy.ox + dx; joy.py = joy.oy + dy
  joy.x = d > 6 ? dx / R : 0; joy.y = d > 6 ? dy / R : 0
})
const lift = e => { if (e.pointerId === joy.id) { joy.on = false; joy.id = null; joy.x = joy.y = 0 } }
cv.addEventListener('pointerup', lift); cv.addEventListener('pointercancel', lift)
pauseBtn.addEventListener('click', () => { pauseBtn.blur(); pause() })
// 전체 화면 — 덩크 아케이드과 같다. 이 게임은 세워도 눕혀도 되니 방향은 묶지 않는다
function fit() {
  const s = stage.style, on = vv && stage.classList.contains('full'), k = on ? vv.scale : 1
  s.left = on ? `${vv.offsetLeft}px` : ''; s.top = on ? `${vv.offsetTop}px` : ''
  s.width = on ? `${vv.width * k}px` : ''; s.height = on ? `${vv.height * k}px` : ''
  s.transform = on && k !== 1 ? `scale(${1 / k})` : ''
}
vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit)
const setFull = on => { stage.classList.toggle('full', on); fsBtn.setAttribute('aria-label', on ? '전체 화면 끄기' : '전체 화면'); fit() }
fsBtn.addEventListener('click', async () => {
  fsBtn.blur()
  if (document.fullscreenElement) return document.exitFullscreen()
  const on = !stage.classList.contains('full')
  if (on && stage.requestFullscreen) try { await stage.requestFullscreen({ navigationUI: 'hide' }) } catch {}
  setFull(on)
})
document.addEventListener('fullscreenchange', () => setFull(!!document.fullscreenElement))

// ---------------------------------------------------------------- 한 판
let mode = 'load', G = null, pl = null, S = null, menuChar = 0, menuMap = 0, shake = 0, tnow = 0
const cam = { x: 0, y: 0 }
const need = lv => lv < 20 ? 5 + (lv - 1) * 7 : lv < 40 ? 138 + (lv - 20) * 12 : 378 + (lv - 40) * 16   // 다음 레벨까지 경험치

function start() {
  const ch = CHARS[menuChar], map = MAPS[menuMap]
  if (kOf() !== K) sprites(kOf())
  pl = { x: 0, y: 0, r: 12, hp: 1, inv: 0, face: [1, 0], fx: 1, jump: 0, moving: false, spr: playerSprites(ch) }
  G = {
    ch, map, t: 0, foes: [], shots: [], eshots: [], gems: [], items: [], fx: [], parts: [], nums: [], weapons: [], passives: {},
    kills: 0, lvl: 1, xp: 0, next: need(1), queue: [], cheer: 0, jackpots: 0, bosses: 0, lastHit: 0, freeze: 0, spawnT: 0.5,
    nextBoss: 300, nextMascot: 140, nextSwarm: 100, got: [], dying: 0, bodyT: 0, banner: null,
  }
  S = null; addWeapon(ch.w); stats(); pl.hp = S.maxHp
  cam.x = cam.y = 0; calm()
  mode = 'play'; ui.hidden = true; ui.classList.remove('is-box'); pauseBtn.hidden = false
}
function playerSprites(ch) {
  const o = { jersey: ch.c[0], trim: ch.c[1], shorts: ch.c[0], skin: ch.skin || '#b9825a', hair: '#1d140e', shoe: '#f4f4f4', num: NBA_NUM[ch.id] ?? '', head: ch.head, kind: 'me' }
  const paint = (frame, mirror) => sprite(36, 66, 18, 62, c => { if (mirror) c.scale(-1, 1); person(c, { ...o, frame, mirror }) })
  return { R: [0, 1, 2, 3].map(f => paint(f)), L: [0, 1, 2, 3].map(f => paint(f, true)), mate: sprite(36, 66, 18, 62, c => person(c, { ...o, jersey: ch.c[1], trim: ch.c[0], shorts: ch.c[1], head: null, kind: 'screen' })) }
}
function stats() {
  const m = G.ch.mod, L = id => G.passives[id] || 0, old = S?.maxHp
  S = {
    might: 1 + 0.1 * L('weight') + 0.02 * Math.min(25, G.cheer) + (m.king ? Math.min(0.5, (G.lvl / 10 | 0) * 0.1) : 0),
    armor: L('knee') + (m.armor || 0),
    maxHp: Math.round(G.ch.hp * (1 + 0.2 * L('cardio') + (m.hp || 0))),
    regen: 0.2 * L('ice') + (m.regen || 0),
    cdr: Math.max(0.45, 1 - 0.08 * L('notes') - (m.cdr || 0)),
    area: 1 + 0.1 * L('span') + (m.area || 0),
    move: 1 + 0.1 * L('shoes') + (m.move || 0),
    speed: 1 + 0.1 * L('handle') + (m.speed || 0),
    dur: 1 + 0.1 * L('stamina') + (m.dur || 0),
    amount: L('double') + (m.amount || 0),
    magnet: 80 * (1 + 0.3 * L('vision')),
    luck: 1 + 0.1 * L('clutch') + (m.luck || 0),
    growth: (1 + 0.08 * L('rookie') + (m.growth || 0)) * G.map.xp,
    crit: 0.03 + (m.crit || 0) + 0.02 * L('clutch'),
    critX: 2 + (m.critX || 0),
    body: !!m.body,
  }
  if (old && S.maxHp > old) pl.hp += S.maxHp - old
}
function wstat(w) {
  const d = WEAP[w.id], st = { cd: d.cd, dmg: d.dmg, n: d.n || 1, area: 1, spd: 1, dur: d.dur || 0, pierce: d.pierce || 0, bounce: d.bounce || 0 }
  for (const up of d.ups.slice(0, w.lv - 1)) for (const k in up) st[k] += up[k]
  return st
}
function addWeapon(id) { const w = { id, lv: 1, t: 0.3, q: 0, qt: 0, n: 0, ang: 0, on: 0, list: [] }; w.st = wstat(w); G.weapons.push(w) }

// 수비 찾기 — 72 칸 격자(매 프레임 다시). near = 몸이 원에 닿는 수비마다(fn 이 true 면 그만)
const CELL = 72, grid = new Map(), gk = (gx, gy) => (gx + 32768) * 65536 + gy + 32768
function regrid() {
  grid.clear()
  for (const e of G.foes) { if (e.dead) continue; const k = gk(Math.floor(e.x / CELL), Math.floor(e.y / CELL)); const a = grid.get(k); a ? a.push(e) : grid.set(k, [e]) }
}
function near(x, y, r, fn) {
  const R = r + 34, x0 = Math.floor((x - R) / CELL), x1 = Math.floor((x + R) / CELL), y0 = Math.floor((y - R) / CELL), y1 = Math.floor((y + R) / CELL)
  for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
    const a = grid.get(gk(gx, gy)); if (!a) continue
    for (const e of a) { if (e.dead) continue; const dx = e.x - x, dy = e.y - y, q = r + e.r; if (dx * dx + dy * dy < q * q && fn(e)) return }
  }
}
function closest(n, x = pl.x, y = pl.y, skip = null, max = 1e9) {
  const out = []
  for (const e of G.foes) {
    if (e.dead || skip?.has(e)) continue
    const d = (e.x - x) ** 2 + (e.y - y) ** 2
    if (d > max * max || (out.length >= n && d >= out[out.length - 1][1])) continue
    out.push([e, d]); out.sort((a, b) => a[1] - b[1]); if (out.length > n) out.pop()
  }
  return out.map(o => o[0])
}
const onScreen = (e, m = 0) => Math.abs(e.x - cam.x) < VW / 2 + m && Math.abs(e.y - cam.y) < VH / 2 + m
const toward = (e, x = pl.x, y = pl.y) => { const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d] }
const wallY = y => G.map.wall ? clamp(y, -G.map.wall + 14, G.map.wall - 14) : y

// ---- 스킬 — 한 발씩(여러 개면 GAP 간격으로)
const SHOT = {
  pass(w, st, i, A, D) {
    const e = alive(w.list[i % (w.list.length || 1)]) || closest(1)[0], [dx, dy] = e ? toward(e) : pl.face, o = { v: 560 * st.spd * S.speed, r: 7, dmg: D, pierce: st.pierce, kb: 60, br: w.br }
    if (!w.br) return ball(dx, dy, o)
    for (const s of [-8, 8]) ball(dx, dy, { ...o, x: pl.x - dy * s, y: pl.y + dx * s })   // 돌파 — 나란히 두 공
  },
  bounce(w, st, i, A, D) { const e = alive(w.list[i % (w.list.length || 1)]) || closest(1)[0]; ball(...(e ? toward(e) : pl.face), { v: 500 * st.spd * S.speed, r: 7, dmg: D, pierce: 1, bounce: st.bounce, kb: 40, col: '#7ff3ff', br: w.br }) },
  fade(w, st, i, A, D) {   // 보는 쪽으로 — 앞 60° 안에 수비가 있으면 그쪽을 겨눈다. 돌파면 등 뒤로도
    let [fx, fy] = pl.face
    const e = closest(6, pl.x, pl.y, null, 420).find(e => { const [dx, dy] = toward(e); return dx * fx + dy * fy > 0.5 })
    if (e) [fx, fy] = toward(e)
    const o = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 8
    for (const s of w.br ? [1, -1] : [1]) ball(fx * s, fy * s, { v: 740 * st.spd * S.speed, r: 6, dmg: D, pierce: st.pierce, kb: 30, x: pl.x - fy * o, y: pl.y + fx * o, life: 1, col: '#ffd23f', br: w.br })
  },
  three(w, st, i, A, D) {
    const far = G.foes.filter(e => !e.dead && onScreen(e) && (e.x - pl.x) ** 2 + (e.y - pl.y) ** 2 > 150 * 150), e = far.length ? pickOf(far) : closest(1)[0], T0 = 0.6 / Math.sqrt(st.spd * S.speed)
    const x1 = e ? e.x + e.vx * T0 : pl.x + pl.face[0] * 260, y1 = e ? e.y + e.vy * T0 : pl.y + pl.face[1] * 260
    G.shots.push({ k: 'arc', x0: pl.x, y0: pl.y, x1, y1: wallY(y1), x: pl.x, y: pl.y, t: 0, T: T0, H: 120, R: 54 * A, dmg: D, a: 0, br: w.br })
  },
  dunk(w, st, i, A, D) {
    pl.jump = 0.3; G.shots.push({ k: 'ring', x: pl.x, y: pl.y, t: -0.26, T: 0.32, R: 92 * A, dmg: D, hit: new Set(), br: w.br })
    if (w.br) G.shots.push({ k: 'ring', x: pl.x, y: pl.y, t: -0.64, T: 0.42, R: 138 * A, dmg: D, hit: new Set(), br: true, after: true })   // 돌파 — 큰 여진
  },
  alley(w, st, i, A, D) {
    const c = closest(10)
    for (let k = w.br ? 2 : 1; k--;) {
      const e = pickOf(c.length ? c : [null])
      G.shots.push({ k: 'drop', x: e ? e.x : pl.x + (rnd() - 0.5) * 320, y: wallY(e ? e.y : pl.y + (rnd() - 0.5) * 320), t: -k * 0.12, T: 0.5, R: 46 * A, dmg: D, br: w.br })
    }
  },
  cross(w, st, i, A, D) { for (const s of w.br ? [1, -1] : [i % 2 ? -1 : 1]) G.shots.push({ k: 'slash', side: s * pl.fx, t: 0, T: 0.22, W: 135 * A, H: 42 * A, dmg: D, x: pl.x, y: pl.y, done: false, br: w.br }) },
  nolook(w, st, i, A, D) { const e = closest(i + 1)[i] || closest(1)[0], [dx, dy] = e ? toward(e) : pl.face, s = st.spd * S.speed; G.shots.push({ k: 'boom', x: pl.x, y: pl.y, dx, dy, v: 600 * s, v0: 600 * s, acc: -800 * s, r: 10 * A, dmg: D, hit: new Map(), t: 0, life: 2.4, a: 0, br: w.br }) },
  hook(w, st, i, A, D) { G.shots.push({ k: 'hook', x: pl.x, y: pl.y, vx: (rnd() - 0.5) * 300 + pl.fx * 40, vy: -(520 + rnd() * 120) * Math.sqrt(st.spd * S.speed), r: 12 * A * (w.br ? 1.4 : 1), dmg: D, pierce: st.pierce * (w.br ? 2 : 1), hit: new Set(), t: 0, life: 2.2, a: 0, br: w.br }) },
  buzzer(w, st, i, A, D) {   // 화면 안 아무 수비에게 위에서 지그재그로. 돌파면 옆 수비 둘에게 이어서
    const c = G.foes.filter(e => !e.dead && onScreen(e)); if (!c.length) return
    const R = 32 * A, done = new Set()
    let e = pickOf(c), px = e.x + (rnd() - 0.5) * 60, py = e.y - 440
    for (let k = w.br ? 3 : 1; k-- && e;) {
      const { x, y } = e
      near(x, y, R, f => { hurt(f, D, x, y, 80) })
      fx({ k: 'bolt', x, y, R, pts: zig(px, py, x, y - 6), T: 0.3, br: w.br }); fx({ k: 'crack', x, y, R: R * 0.9, T: 0.6 })
      done.add(e); px = x; py = y - 6; e = closest(1, x, y, done, 240)[0]
    }
    shake = Math.max(shake, 2)
  },
  screen(w, st, i, A, D) { const a = rnd() * TAU, d = 50 + rnd() * 90, ox = Math.cos(a) * d, oy = Math.sin(a) * d; G.shots.push({ k: 'zone', x: pl.x + ox, y: wallY(pl.y + oy), ox, oy, R: 48 * A, dmg: D, tick: 0, t: 0, life: st.dur * S.dur, br: w.br }) },
}
const alive = e => e && !e.dead ? e : null
/** T 초 동안 속도 k 배 — 더 느린 게 걸려 있으면 그게 끝날 때까지 약한 건 무시(앵클 브레이커 0 · 존 프레스 0.25 · 보통 0.55) */
const slow = (e, T, k) => { if (e.slow <= 0 || k <= e.sk) { e.sk = k; e.slow = Math.max(e.slow, T) } }
function ball(dx, dy, o) { G.shots.push({ k: 'ball', x: o.x ?? pl.x, y: o.y ?? pl.y, vx: dx * o.v, vy: dy * o.v, r: o.r, dmg: o.dmg, pierce: o.pierce, bounce: o.bounce || 0, life: o.life || 1.3, t: 0, a: 0, hit: new Set(), kb: o.kb, col: o.col, br: o.br }) }
/** 번개 — (x0, y0) 에서 (x1, y1) 까지 지그재그 아홉 점. 끝으로 갈수록 덜 흔들린다 */
function zig(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, pts = [[x0, y0]]
  for (let i = 1; i < 8; i++) { const u = i / 8, j = (rnd() - 0.5) * 0.08 * L * (1 - u); pts.push([x0 + dx * u - dy / L * j, y0 + dy * u + dx / L * j]) }
  pts.push([x1, y1])
  return pts
}

function weapons(dt) {
  for (const w of G.weapons) {
    const st = w.st, A = st.area * S.area, D = st.dmg * S.might
    if (w.id === 'press') {   // 풀코트 프레스 — 쿨타임마다 둘레 전부
      w.R = 72 * A * (w.br ? 1.3 : 1)
      if ((w.t -= dt) <= 0) { w.t = Math.max(0.2, st.cd * S.cdr); near(pl.x, pl.y, w.R, e => { hurt(e, D, pl.x, pl.y, 30); slow(e, 0.5, w.br ? 0.25 : 0.55) }) }
      continue
    }
    if (w.id === 'block') {   // 블록슛 — 켜져 있는 동안 손이 돈다
      w.ang += dt * 3.4 * st.spd * S.speed
      const n = st.n + S.amount, R = 80 * A, r = 11 * Math.sqrt(A)
      if (w.br) {   // 돌파 — 쉬지 않고 계속. 손 개수가 바뀌면(더블 클러치) 새로 쥐고, 범위 · 피해는 늘 지금 것
        if (w.hands?.length !== n) {
          for (const b of G.shots) if (b.w === w) b.dead = true
          w.hands = Array.from({ length: n }, (_, i) => ({ k: 'orb', w, i, n, life: Infinity, hit: new Map(), x: pl.x, y: pl.y, br: true }))
          G.shots.push(...w.hands)
        }
        for (const b of w.hands) { b.R = R; b.r = r; b.dmg = D }
      } else if (w.on > 0) { if ((w.on -= dt) <= 0) w.t = st.cd * S.cdr }
      else if ((w.t -= dt) <= 0) {
        w.on = st.dur * S.dur
        for (let i = 0; i < n; i++) G.shots.push({ k: 'orb', w, i, n, R, r, dmg: D, life: w.on, hit: new Map(), x: pl.x, y: pl.y })
      }
      continue
    }
    if (w.q > 0) { if ((w.qt -= dt) <= 0) { SHOT[w.id](w, st, w.n - w.q, A, D); w.q--; w.qt = GAP[w.id] } }
    else if ((w.t -= dt) <= 0) {
      w.n = w.q = st.n + S.amount; w.qt = 0; w.t = st.cd * S.cdr
      w.list = w.id === 'pass' || w.id === 'bounce' ? closest(w.n) : []
    }
  }
}

// ---- 수비
function spawn(type, x, y) {
  const F = FOES[type], m = G.t / 60, hp = F.hp * (1 + m * 0.1 + m ** 3 * 0.0011) * G.map.hp   // 초반은 완만하게, 15분 뒤로 가파르게(10분 3배 · 20분 12배 · 30분 33배)
  const e = {
    type, v: rnd() * SPR[type].length | 0, x: 0, y: 0, r: F.r, hp, max: hp, spd: F.spd * G.map.spd * (0.9 + rnd() * 0.2), dmg: F.dmg * (1 + m * 0.07), xp: F.xp,
    vx: 0, vy: 0, kx: 0, ky: 0, flash: 0, slow: 0, fx: 1, seed: rnd() * 10, cd: 1 + rnd() * 2, st: 'walk', stT: 3, dx: 0, dy: 0, age: 0,
    elite: type === 'mascot', boss: type === 'boss', heavy: type === 'big' || type === 'mascot',
  }
  if (x === undefined) ring(e); else { e.x = x; e.y = wallY(y) }
  G.foes.push(e)
  return e
}
/** 화면 바로 바깥 — ahead 면 가는 쪽 앞에 */
function ring(e, ahead = false) {
  const hw = VW / 2 + 40, hh = VH / 2 + 50
  const a = ahead ? Math.atan2(pl.face[1], pl.face[0]) + (rnd() - 0.5) * 2.2 : rnd() * TAU, c = Math.cos(a), s = Math.sin(a)
  const t = Math.min(hw / Math.max(1e-6, Math.abs(c)), hh / Math.max(1e-6, Math.abs(s)))
  e.x = pl.x + c * t; e.y = pl.y + s * t
  if (G.map.wall && Math.abs(e.y) > G.map.wall - 14) { e.y = wallY(e.y); e.x = pl.x + (c >= 0 ? hw : -hw) }
}
function spawner(dt) {
  const m = G.t / 60, want = Math.min(MAX_FOES, 22 + m * 14 + m * m * 0.45)
  if ((G.spawnT -= dt) <= 0) {
    G.spawnT = Math.max(0.09, 0.55 - m * 0.02)
    const n = Math.min(want - G.foes.length, 1 + (m / 1.8 | 0))
    for (let i = 0; i < n; i++) {
      const w = [['rookie', 1], ['fan', m >= 1 ? 0.5 + m * 0.03 : 0], ['ref', m >= 20 ? 0.1 + (m - 20) * 0.035 : 0], ['big', m >= 3 ? 0.25 + m * 0.025 : 0]]
      let q = rnd() * w.reduce((s, x) => s + x[1], 0), type = 'rookie'
      for (const [k, v] of w) if ((q -= v) < 0) { type = k; break }
      spawn(type)
    }
  }
  if (G.t >= G.nextBoss && G.nextBoss < MAX_T) { spawn('boss'); G.nextBoss += 300; say('올스타 수비수 등장!', 2.4, '#ff6b6b'); shake = 8 }
  if (G.t >= G.nextMascot) { spawn('mascot'); G.nextMascot += m < 15 ? 60 : 35 }
  if (G.t >= G.nextSwarm) {   // 팬이 사방에서 둘러싼다
    const n = 18 + (m * 2.5 | 0), R = Math.max(VW, VH) * 0.62
    for (let i = 0; i < n; i++) { const a = i / n * TAU; spawn('fan', pl.x + Math.cos(a) * R, pl.y + Math.sin(a) * R) }
    G.nextSwarm += 120; say('팬들이 몰려온다!', 1.8)   // 보스(5분마다)와 겹치지 않게 100초부터 2분마다
  }
}
function foes(dt) {
  const far = Math.max(VW, VH) * 0.85 + 120, frozen = G.freeze > 0
  for (const e of G.foes) {
    if (e.dead) continue
    e.flash -= dt; e.age += dt
    let dx = pl.x - e.x, dy = pl.y - e.y
    const d = Math.hypot(dx, dy) || 1
    dx /= d; dy /= d
    if (!e.boss && d > far) { ring(e, true); continue }   // 너무 멀어진 수비는 앞쪽으로 다시
    e.slow -= dt
    if (frozen) { e.vx = e.vy = 0 }
    else if (e.boss) boss(e, dt, dx, dy)
    else { const sp = e.spd * (e.slow > 0 ? e.sk : 1); e.vx = dx * sp; e.vy = dy * sp }
    // 서로 밀어 겹치지 않게
    near(e.x, e.y, e.r * 0.6, o => { if (o === e) return; const ox = e.x - o.x, oy = e.y - o.y, q = Math.hypot(ox, oy) || 0.01, push = (e.r * 0.6 + o.r - q) * 0.35; e.x += ox / q * push; e.y += oy / q * push })
    e.x += (e.vx + e.kx) * dt; e.y = wallY(e.y + (e.vy + e.ky) * dt)
    const f = Math.exp(-9 * dt); e.kx *= f; e.ky *= f
    if (Math.abs(dx) > 0.15) e.fx = dx > 0 ? 1 : -1
    if (!frozen && e.type === 'ref' && d < 330 && (e.cd -= dt) <= 0) { e.cd = 2.6 + rnd(); G.eshots.push({ x: e.x, y: e.y, vx: dx * 210, vy: dy * 210, t: 0, life: 2.6, dmg: e.dmg + 1, a: 0 }) }
    if (d < e.r + pl.r - 2) {
      if (!frozen) ouch(e.dmg * (e.st === 'dash' ? 1.5 : 1))
      if (S.body && (e.bodyT ?? 0) < G.t) { e.bodyT = G.t + 0.5; hurt(e, 14 * S.might, pl.x, pl.y, 280) }   // 자이언 — 밀쳐 내기
    }
  }
}
// 올스타 수비수 — 걷다가 멈칫(붉게) 하고 그 방향으로 돌진
function boss(e, dt, dx, dy) {
  e.stT -= dt
  if (e.st === 'walk') { e.vx = dx * e.spd; e.vy = dy * e.spd; if (e.stT <= 0) { e.st = 'wind'; e.stT = 0.7; e.dx = dx; e.dy = dy } }
  else if (e.st === 'wind') { e.vx = e.vy = 0; e.flash = 0.05 * ((G.t * 12 | 0) % 2); if (e.stT <= 0) { e.st = 'dash'; e.stT = 0.75 } }
  else { e.vx = e.dx * e.spd * 4; e.vy = e.dy * e.spd * 4; if (e.stT <= 0) { e.st = 'walk'; e.stT = 2.6 + rnd() * 1.4 } }
}
function hurt(e, dmg, ox, oy, kb = 0) {
  if (e.dead) return
  const crit = rnd() < S.crit
  dmg = Math.max(1, Math.round(dmg * (crit ? S.critX : 1) * (0.9 + rnd() * 0.2)))
  e.hp -= dmg; e.flash = 0.1
  if (G.fx.length < 150 && (crit || rnd() < 0.45)) fx({ k: 'spark', x: e.x + (rnd() - 0.5) * e.r, y: e.y - e.r * 2 + (rnd() - 0.5) * e.r, s: crit ? 36 : 20, a: rnd() * TAU, T: 0.22 })
  if (kb && !e.boss) { const dx = e.x - ox, dy = e.y - oy, d = Math.hypot(dx, dy) || 1, k = kb / (e.heavy ? 3 : 1); e.kx += dx / d * k; e.ky += dy / d * k }
  num(e.x, e.y - e.r * 3.4, dmg, crit ? 'crit' : '')
  if (e.hp <= 0) kill(e)
}
function kill(e) {
  e.dead = true; G.kills++
  gem(e.x, e.y, e.xp)
  const col = SPR[e.type][e.v].col
  if (G.fx.length < 180) fx({ k: 'puff', x: e.x, y: e.y, r: e.r * 1.5, a: rnd() * TAU, T: 0.45 })
  for (let i = 0; i < (e.boss ? 40 : e.elite ? 16 : 4); i++) { const a = rnd() * TAU, s = 40 + rnd() * (e.boss ? 260 : 120); part(e.x, e.y - e.r * 1.5, Math.cos(a) * s, Math.sin(a) * s - 60, i % 3 ? col : '#fff', 0.35 + rnd() * 0.35, 2 + rnd() * (e.boss ? 4 : 2.5)) }
  if (e.elite) { item(e.x, e.y); for (let i = 0; i < 3; i++) gem(e.x + (rnd() - 0.5) * 40, e.y + (rnd() - 0.5) * 40, 5) }
  else if (!e.boss && rnd() < 0.004 * S.luck) item(e.x, e.y, rnd() < 0.6 ? 'drink' : 'whistle')
  if (rnd() < (e.boss ? 0.3 : e.elite ? 0.1 : 0.0004) * S.luck && ringable()) item(e.x, e.y + 14, 'ring')
  if (e.boss) { G.bosses++; item(e.x, e.y, 'chest'); gain('boss1'); say('올스타 격파!', 2.2, '#ffd23f'); shake = 10; fx({ k: 'ring', x: e.x, y: e.y, R: 180, T: 0.6, col: '#ffd23f' }); fx({ k: 'flash', x: e.x, y: e.y - 40, R: 160, col: '#ffd23f', T: 0.6 }) }
  if (G.kills === 1000) gain('kill1000')
  if (G.kills === 5000) gain('kill5000')
}
function ouch(d) {
  if (pl.inv > 0 || G.dying) return
  d = Math.max(1, Math.round(d - S.armor)); pl.hp -= d; pl.inv = 0.4; G.lastHit = G.t; shake = Math.max(shake, 4)
  num(pl.x, pl.y - 58, d, 'hurt')
  if (pl.hp <= 0) { pl.hp = 0; G.dying = 1.2; say('K.O.', 1.5, '#ff6b6b') }
}

// ---- 경험치 · 줍는 것
function gem(x, y, v) {
  if (G.gems.length >= 360) {   // 너무 많으면 가장 먼(두고 온) 것을 여기로 옮겨 합친다 — 경험치는 그대로, 줍기 쉬운 데로
    let far = G.gems[0], fd = -1
    for (const g of G.gems) { const d = (g.x - pl.x) ** 2 + (g.y - pl.y) ** 2; if (d > fd) { fd = d; far = g } }
    Object.assign(far, { x, y, v: far.v + v, pull: false, sp: 0 })
    return
  }
  G.gems.push({ x: x + (rnd() - 0.5) * 8, y: y + (rnd() - 0.5) * 8, v, pull: false, sp: 0 })
}
function item(x, y, k) {
  if (!k) { const q = rnd(); k = q < 0.4 ? 'drink' : q < 0.65 ? 'whistle' : q < 0.8 ? 'clock' : 'buzzer' }
  G.items.push({ x, y: wallY(y), k, t: 0 })
}
/** 챔피언 반지를 더 떨어뜨려도 되나 — 돌파 안 한 최고 레벨 스킬이 바닥 · 대기 중인 반지보다 많을 때만 */
const ringable = () => G.weapons.filter(w => w.lv === 8 && !w.br).length > G.items.filter(i => i.k === 'ring' && !i.dead).length + G.queue.filter(q => q === 'break').length
const USE = {
  drink: () => { const v = Math.round(S.maxHp * 0.3); pl.hp = Math.min(S.maxHp, pl.hp + v); num(pl.x, pl.y - 58, `+${v}`, 'heal') },
  whistle: () => { for (const g of G.gems) g.pull = true; say('휘슬 — 경험치를 다 모은다', 1.2) },
  clock: () => { G.freeze = 6; say('타임아웃!', 1.4, '#7ff3ff') },
  buzzer: () => {
    fx({ k: 'white', T: 0.4 }); shake = 8; say('버저!', 1.2, '#ff6b6b')
    for (const e of G.foes) if (!e.dead && onScreen(e, 40)) { if (e.boss) hurt(e, 300 * S.might, pl.x, pl.y); else kill(e) }
  },
  chest: () => G.queue.push('chest'),
  ring: () => G.queue.push('break'),
}
function gainXp(v) {
  G.xp += v * S.growth
  while (G.xp >= G.next) {
    G.xp -= G.next; G.lvl++; G.next = need(G.lvl); G.queue.push('level')
    if (G.lvl >= 20) gain('lv20')
    if (G.lvl >= 50) gain('lv50')
    if (G.ch.mod.king && G.lvl % 10 === 0) stats()
  }
}

// ---- 한 프레임
function step(dt) {
  G.t += dt
  const dead = G.dying > 0
  if (dead && (G.dying -= dt / 0.3) <= 0) return finish(false)   // 쓰러지는 동안은 느린 화면(dt 는 0.3배로 들어온다)
  if (G.t >= MAX_T && !dead) return finish(true)
  // 나
  let mx = key.r - key.l + joy.x, my = key.d - key.u + joy.y
  const m = Math.hypot(mx, my)
  pl.moving = m > 0.12 && !dead
  if (pl.moving) {
    pl.face = [mx / m, my / m]
    if (m > 1) { mx /= m; my /= m }
    if (Math.abs(mx) > 0.2) pl.fx = mx > 0 ? 1 : -1
    const sp = 150 * S.move
    pl.x += mx * sp * dt; pl.y = G.map.wall ? clamp(pl.y + my * sp * dt, -G.map.wall + 14, G.map.wall - 14) : pl.y + my * sp * dt
  }
  pl.inv -= dt; pl.jump = Math.max(0, pl.jump - dt)
  if (!dead) pl.hp = Math.min(S.maxHp, pl.hp + S.regen * dt)
  G.freeze = Math.max(0, G.freeze - dt)
  cam.x += (pl.x - cam.x) * Math.min(1, dt * 8); cam.y += (pl.y - cam.y) * Math.min(1, dt * 8)
  if (G.map.wall) cam.y = clamp(cam.y, -Math.max(0, G.map.wall + 200 - VH / 2), Math.max(0, G.map.wall + 200 - VH / 2))
  regrid()
  if (!dead) { spawner(dt); weapons(dt) }
  foes(dt)
  shots(dt)
  // 심판 호루라기 — 블록슛 손에 막히고, 프레스 · 스크린 바닥 안에서는 느리게(사라지는 시간도 같이 늦춰 결국 날아온다)
  const press = G.weapons.find(w => w.id === 'press'), guard = G.eshots.length ? G.shots.filter(b => b.k === 'orb' || b.k === 'zone') : []
  const inside = (b, x, y, R) => ((b.x - x) / R) ** 2 + ((b.y - y) / (R * 0.8)) ** 2 < 1   // 바닥은 납작한 타원
  for (const b of G.eshots) {
    let sp = press?.R && inside(b, pl.x, pl.y, press.R) ? 0.3 : 1
    for (const o of guard) {
      if (o.k === 'zone') { if (inside(b, o.x, o.y, o.R)) sp = 0.3 }
      else if ((b.x - o.x) ** 2 + (b.y - o.y) ** 2 < (o.r + 24) ** 2) {   // 손이 크게 휘둘러 잡는다 — 몸 판정보다 넉넉히
        b.dead = true; fx({ k: 'flash', x: b.x, y: b.y - 18, R: 30, col: '#ffe2c0', T: 0.25 })
        for (let i = 0; i < 5; i++) { const a = rnd() * TAU; part(b.x, b.y - 18, Math.cos(a) * 120, Math.sin(a) * 80 - 60, i % 2 ? '#ffd23f' : '#fff', 0.3, 2) }
        break
      }
    }
    if (b.dead) continue
    b.t += dt * sp; b.a += dt * 10 * sp
    if (G.freeze <= 0) { b.x += b.vx * dt * sp; b.y += b.vy * dt * sp }
    if ((b.x - pl.x) ** 2 + (b.y - pl.y) ** 2 < (pl.r + 5) ** 2) { ouch(b.dmg); b.dead = true }
    if (b.t > b.life) b.dead = true
  }
  // 경험치 · 아이템 줍기
  for (const g of G.gems) {
    const dx = pl.x - g.x, dy = pl.y - g.y, d = Math.hypot(dx, dy) || 1
    if (g.pull || d < S.magnet) { g.pull = true; g.sp = Math.min(1000, g.sp + 1500 * dt + 120 * dt); const s = Math.min(d, g.sp * dt); g.x += dx / d * s; g.y += dy / d * s }
    if (d < pl.r + 8 && !dead) { g.dead = true; gainXp(g.v) }
  }
  for (const it of G.items) { it.t += dt; if (!dead && (it.x - pl.x) ** 2 + (it.y - pl.y) ** 2 < (pl.r + 16) ** 2) { it.dead = true; USE[it.k](); fx({ k: 'flash', x: pl.x, y: pl.y - 20, R: 70, col: '#ffffff', T: 0.35 }) } }
  // 효과
  for (const p of G.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.vx *= 0.97; if (p.t > p.T) p.dead = true }
  for (const f of G.fx) { f.t += dt; if (f.t > f.T) f.dead = true }
  for (const n of G.nums) { n.t += dt; if (n.t > 0.7) n.dead = true }
  if (G.banner && (G.banner.t += dt) > G.banner.T) G.banner = null
  shake = Math.max(0, shake - dt * 30)
  for (const a of [G.foes, G.shots, G.eshots, G.gems, G.items, G.parts, G.fx, G.nums]) prune(a)
  sortY(G.foes)
  // 업적 — 버틴 시간
  if (!dead) {
    for (const [s, id] of SURV) if (G.t >= s) gain(id)
    if (G.t >= 600 && G.map.id === 'arena') gain('arena10')
    if (G.t >= 600 && G.map.id === 'roof') gain('roof10')
    if (G.t - G.lastHit >= 180) gain('nohit')
  }
  if (G.queue.length && !dead) openBox()
}
function prune(a) { let j = 0; for (const x of a) if (!x.dead) a[j++] = x; a.length = j }
function sortY(a) { for (let i = 1; i < a.length; i++) { const e = a[i]; let j = i - 1; while (j >= 0 && a[j].y > e.y) { a[j + 1] = a[j]; j-- } a[j + 1] = e } }

function shots(dt) {
  for (const b of G.shots) {
    b.t += dt
    switch (b.k) {
      case 'ball': {   // 패스 · 바운스 · 스텝백
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += dt * 14
        if (b.t > b.life) { b.dead = true; break }
        near(b.x, b.y, b.r, e => {
          if (b.hit.has(e)) return
          b.hit.add(e); hurt(e, b.dmg, b.x - b.vx * 0.05, b.y - b.vy * 0.05, b.kb)
          if (b.bounce > 0) {   // 옆 수비에게 튕겨 간다 — 돌파면 처음 한 번은 둘로 갈라져 두 수비에게
            const ns = closest(b.br && !b.split ? 2 : 1, e.x, e.y, b.hit, 230), v = Math.hypot(b.vx, b.vy)
            if (ns.length) {
              b.bounce--; b.split = true
              ns.forEach((n, k) => { const o = k ? { ...b, hit: new Set(b.hit) } : b, [dx, dy] = toward(n, b.x, b.y); o.vx = dx * v; o.vy = dy * v; o.t = 0; o.life = 0.8; if (k) G.shots.push(o) })
              return true
            }
          }
          if (--b.pierce <= 0) { b.dead = true; return true }
        })
        break
      }
      case 'arc': {   // 3점슛 — 포물선, 떨어진 자리 스플래시
        const u = Math.min(1, b.t / b.T); b.x = b.x0 + (b.x1 - b.x0) * u; b.y = b.y0 + (b.y1 - b.y0) * u; b.a += dt * 10
        if (u >= 1) {
          splash(b.x1, b.y1, b.R, b.dmg, '#ff9f43', false, b.br); b.dead = true
          if (b.br) G.shots.push({ k: 'echo', x: b.x1, y: b.y1, t: 0, T: 0.32, R: b.R * 1.35, dmg: b.dmg })   // 돌파 — 한 번 더 크게
        }
        break
      }
      case 'echo':
        if (b.t >= b.T) { splash(b.x, b.y, b.R, b.dmg, '#ffd23f', true, true); shake = Math.max(shake, 3); b.dead = true }
        break
      case 'drop':   // 앨리웁 — 하늘에서
        if (b.t >= b.T) { splash(b.x, b.y, b.R, b.dmg, '#ffd23f', true, b.br); shake = Math.max(shake, 3); b.dead = true }
        break
      case 'ring': {   // 덩크 충격파 — 반지름이 커지며 닿은 수비를 한 번씩
        if (b.t < 0) { b.x = pl.x; b.y = pl.y; break }
        if (!b.boom) {   // 꽂히는 순간 — 바닥이 갈라지고 먼지 · SLAM!
          b.boom = true; shake = Math.max(shake, b.after ? 9 : 6)
          for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; part(b.x, b.y, Math.cos(a) * 220, Math.sin(a) * 120 - 40, '#d9c4a0', 0.4, 3) }
          fx({ k: 'crack', x: b.x, y: b.y, R: b.R * 0.75, T: 1.2 }); fx({ k: 'text', x: b.x, y: b.y - (b.after ? 84 : 64), s: b.after ? 'TOMAHAWK!' : 'SLAM!', col: b.br ? '#ffd23f' : '#ffb35e', T: 0.8 })
        }
        const R = b.R * Math.min(1, b.t / b.T)
        near(b.x, b.y, R, e => { if (!b.hit.has(e)) { b.hit.add(e); hurt(e, b.dmg, b.x, b.y, 440) } })
        if (b.t > b.T + 0.18) b.dead = true
        break
      }
      case 'orb': {   // 블록슛 손
        const a = b.w.ang + b.i / b.n * TAU
        b.x = pl.x + Math.cos(a) * b.R; b.y = pl.y + Math.sin(a) * b.R; b.ang = a
        if ((b.life -= dt) <= 0) { b.dead = true; break }
        near(b.x, b.y, b.r, e => { const t = b.hit.get(e); if (t === undefined || G.t - t > 0.45) { b.hit.set(e, G.t); hurt(e, b.dmg, pl.x, pl.y, 240) } })
        break
      }
      case 'slash': {   // 크로스오버 — 처음 한 번 옆으로 길게
        b.x = pl.x; b.y = pl.y
        if (!b.done) {
          b.done = true
          const x0 = Math.min(pl.x, pl.x + b.side * b.W), x1 = Math.max(pl.x, pl.x + b.side * b.W), y0 = pl.y - 12 - b.H / 2, y1 = pl.y - 12 + b.H / 2
          near((x0 + x1) / 2, (y0 + y1) / 2, b.W / 2 + b.H / 2, e => { if (e.x + e.r > x0 && e.x - e.r < x1 && e.y + e.r > y0 && e.y - e.r < y1) { hurt(e, b.dmg, pl.x, pl.y - 12, 120); if (b.br && !e.boss) slow(e, 0.7, 0) } })
        }
        if (b.t > b.T) b.dead = true
        break
      }
      case 'boom': {   // 노룩 패스 — 갔다가 돌아온다
        b.v += b.acc * dt; b.x += b.dx * b.v * dt; b.y += b.dy * b.v * dt; b.a += dt * 16
        if (b.br && !b.again && b.t >= 1.5) {   // 돌파 — 던진 자리로 돌아온 공을 근처 다른 수비에게 한 번 더(1.5초 = 되돌아오는 때)
          const e = pickOf(closest(4, b.x, b.y)), [dx, dy] = e ? toward(e, b.x, b.y) : [-b.dx, -b.dy]
          Object.assign(b, { again: true, t: 0, v: b.v0, dx, dy }); b.hit.clear()
        }
        if (b.t > b.life) { b.dead = true; break }
        near(b.x, b.y, b.r, e => { const t = b.hit.get(e); if (t === undefined || G.t - t > 0.5) { b.hit.set(e, G.t); hurt(e, b.dmg, b.x - b.dx * Math.sign(b.v), b.y - b.dy * Math.sign(b.v), 70) } })
        break
      }
      case 'hook': {   // 스카이훅 — 위로 떴다 떨어진다
        b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.a += dt * 8
        if (b.t > b.life) { b.dead = true; break }
        near(b.x, b.y, b.r, e => { if (b.hit.has(e)) return; b.hit.add(e); hurt(e, b.dmg, b.x, b.y - 20, 90); if (--b.pierce <= 0) { b.dead = true; return true } })
        break
      }
      case 'zone':   // 스크린 — 걸린 수비를 묶고 때린다. 돌파면 나를 따라다닌다
        if (b.br) { b.x = pl.x + b.ox; b.y = wallY(pl.y + b.oy) }
        if ((b.tick -= dt) <= 0) { b.tick = 0.3; near(b.x, b.y, b.R, e => { hurt(e, b.dmg, b.x, b.y, 0); slow(e, 0.4, 0.55) }) }
        if (b.t > b.life) b.dead = true
        break
    }
  }
}
function splash(x, y, R, dmg, col, crack = false, br = false) {
  near(x, y, R, e => { hurt(e, dmg, x, y, 160) })
  fx({ k: 'ring', x, y, R, T: 0.35, col }); fx({ k: 'flash', x, y: y - 8, R: R * 0.9, col, T: 0.3 })
  if (br) { fx({ k: 'ring', x, y, R: R * 1.15, T: 0.5, col: '#c77dff' }); fx({ k: 'flash', x, y: y - 8, R: R * 1.2, col: '#9b5cff', T: 0.45 }) }
  if (crack) fx({ k: 'crack', x, y, R: R * 0.8, T: 0.9 })
  for (let i = 0; i < 8; i++) { const a = rnd() * TAU; part(x, y, Math.cos(a) * 140, Math.sin(a) * 90 - 80, i % 2 ? col : '#fff', 0.35, 2.4) }
}
const fx = f => { f.t = 0; G.fx.push(f) }
function part(x, y, vx, vy, col, T, r) { if (G.parts.length < 360) G.parts.push({ x, y, vx, vy, col, t: 0, T, r }) }
function num(x, y, v, kind) { if (G.nums.length > 70) G.nums.shift(); G.nums.push({ x: x + (rnd() - 0.5) * 10, y, v, kind, t: 0 }) }
function say(s, T = 1.6, col = '#fff') { G.banner = { s, t: 0, T, col } }

// ---------------------------------------------------------------- 레벨 업 상자 — 셋 중 하나, 잭팟이면 셋 다
function offers() {
  const pool = [], has = id => G.weapons.find(w => w.id === id)
  let wFree = 6 - G.weapons.length, pFree = 6 - Object.keys(G.passives).length
  for (const w of G.weapons) if (w.lv < 8) pool.push({ t: 'w', id: w.id, wt: 1.1 })
  if (wFree > 0) for (const id in WEAP) if (!has(id)) pool.push({ t: 'w', id, wt: 0.8, fresh: true })
  for (const id in G.passives) if (G.passives[id] < PASS[id].max) pool.push({ t: 'p', id, wt: 0.9 })
  if (pFree > 0) for (const id in PASS) if (!(id in G.passives)) pool.push({ t: 'p', id, wt: 0.6, fresh: true })
  const out = []
  while (out.length < 3 && pool.length) {
    let q = rnd() * pool.reduce((s, o) => s + o.wt, 0), i = 0
    while ((q -= pool[i].wt) > 0 && i < pool.length - 1) i++
    const o = pool.splice(i, 1)[0]
    if (o.fresh && (o.t === 'w' ? wFree : pFree) <= 0) continue   // 빈 칸보다 많은 새것은 안 준다(잭팟이면 셋 다 받으니)
    if (o.fresh) o.t === 'w' ? wFree-- : pFree--
    out.push(o)
  }
  while (out.length < 3) out.push({ t: 'f', id: out.some(o => o.id === 'drink') && G.cheer < 25 ? 'cheer' : 'drink' })
  return out
}
/** 챔피언 반지 — 돌파 안 한 최고 레벨 스킬 중 셋까지 */
const breaks = () => G.weapons.filter(w => w.lv === 8 && !w.br).sort(() => rnd() - 0.5).slice(0, 3).map(w => ({ t: 'b', id: w.id }))
function label(o) {
  if (o.t === 'b') return { name: BREAK[o.id].name, lv: `${WEAP[o.id].name} 돌파`, note: BREAK[o.id].note }
  if (o.t === 'f') return { name: FILL[o.id].name, lv: '보너스', note: FILL[o.id].note }
  if (o.t === 'w') { const w = G.weapons.find(x => x.id === o.id), d = WEAP[o.id]; return w ? { name: d.name, lv: `Lv ${w.lv} → ${w.lv + 1}`, note: Object.entries(d.ups[w.lv - 1]).map(([k, v]) => UP[k](v)).join(' · ') } : { name: d.name, lv: '새 스킬', note: d.note } }
  const lv = G.passives[o.id]; return { name: PASS[o.id].name, lv: lv ? `Lv ${lv} → ${lv + 1}` : '새 아이템', note: PASS[o.id].note }
}
function take(o) {
  if (o.t === 'b') {
    G.weapons.find(x => x.id === o.id).br = true
    say(`돌파 — ${BREAK[o.id].name}`, 2.6, '#ffd23f'); shake = 8
    fx({ k: 'ring', x: pl.x, y: pl.y, R: 170, T: 0.9, col: '#ffd23f' }); fx({ k: 'ring', x: pl.x, y: pl.y, R: 120, T: 0.7, col: '#c77dff' }); fx({ k: 'flash', x: pl.x, y: pl.y - 30, R: 150, col: '#9b5cff', T: 0.9 })
  } else if (o.t === 'w') {
    const w = G.weapons.find(x => x.id === o.id)
    if (w) { w.lv++; w.st = wstat(w) } else addWeapon(o.id)
    if (o.id === 'three' && w?.lv === 8) gain('three8')
    if (o.id === 'dunk' && w?.lv === 8) gain('dunk8')
    if (G.weapons.length === 6) { gain('full6'); if (G.weapons.every(x => x.lv === 8)) gain('max6') }
  } else if (o.t === 'p') { G.passives[o.id] = (G.passives[o.id] || 0) + 1; stats() }
  else if (o.id === 'drink') pl.hp = Math.min(S.maxHp, pl.hp + S.maxHp * 0.4)
  else { G.cheer++; stats() }
}
let BOX = null
function openBox() {
  const src = G.queue.shift(), chest = src === 'chest', brk = src === 'break'
  const jack = !brk && rnd() < (chest ? 0.5 : 0.07 * S.luck * (G.ch.mod.jackpot ? 2 : 1))
  const opts = brk ? breaks() : offers()
  if (!opts.length) return   // 반지를 주웠는데 돌파할 스킬이 없으면(ringable 이 막아 거의 없다) 그냥 지나간다
  mode = 'box'; calm(); pauseBtn.hidden = true
  const cards = opts.map((o, i) => {
    const L = label(o)
    return h('button', { type: 'button', className: `sv-card sv-card-${o.t}`, style: `--i:${i}`, onclick: () => choose(i) },
      h('img', { src: ICON_URL[o.t === 'b' ? `${o.id}+` : o.id], alt: '' }), h('small', {}, L.lv), h('b', {}, L.name), h('span', {}, L.note), h('kbd', {}, String(i + 1)))
  })
  const root = h('div', { className: `sv-box${jack ? ' is-jackpot' : ''}${chest ? ' is-chest' : ''}${brk ? ' is-break' : ''}` },
    h('div', { className: 'sv-rays' }),
    h('p', { className: 'sv-box-title' }, brk ? '돌파' : chest ? '트로피 상자!' : `LEVEL ${G.lvl - G.queue.filter(q => q === 'level').length}`),
    h('div', { className: 'sv-chest' }, h('i', { className: 'sv-glow' }), h('i', { className: 'sv-base' }), h('i', { className: 'sv-lid' }), h('i', { className: 'sv-lock' })),
    h('p', { className: 'sv-jack' }, 'JACKPOT!!'),
    h('div', { className: 'sv-cards' }, cards),
    h('p', { className: 'sv-hint' }, jack ? '셋 다 가져요!' : brk ? '챔피언 반지 — 돌파할 스킬을 고르세요(스킬마다 한 번)' : '하나를 고르세요'),
    jack && h('div', { className: 'sv-confetti', 'aria-hidden': 'true' }, Array.from({ length: 46 }, () => h('i', { style: `--x:${rnd() * 100}%;--d:${(rnd() * 0.6).toFixed(2)}s;--t:${(1.6 + rnd() * 1.4).toFixed(2)}s;--r:${(rnd() * 900 - 450) | 0}deg;--c:${pickOf(['#ffd23f', '#ff6b6b', '#5ab0ff', '#62e38a', '#fff', '#ff9be9'])}` }))))
  ui.replaceChildren(root); ui.hidden = false; ui.classList.add('is-box')
  const box = BOX = { opts, jack, opened: false, ready: false, open }
  const timer = setTimeout(open, jack || brk ? 1400 : 600)
  ui.onpointerdown = e => { if (BOX !== box) return; if (!box.opened) { open(); e.preventDefault() } else if (jack && box.ready) next() }
  const ready = () => { if (BOX !== box) return; box.ready = true; root.classList.add('is-ready'); jack || root.querySelector('.sv-card')?.focus({ preventScroll: true }) }
  function open() {   // 이 상자가 아직 떠 있을 때만 — 시간이 다 돼서든 눌러서든 한 번
    if (box.opened || BOX !== box) return
    clearTimeout(timer); box.opened = true; root.classList.add('is-open')
    if (jack) { G.jackpots++; gain('jackpot1'); opts.forEach(take); ui.append(h('i', { className: 'sv-flash' })); setTimeout(ready, 1100) }
    else setTimeout(ready, 380)
  }
}
function choose(i) { if (!BOX?.ready || BOX.jack) return; take(BOX.opts[i]); next() }
function next() {
  BOX = null; ui.classList.remove('is-box'); ui.onpointerdown = null
  if (G.queue.length) return openBox()
  ui.hidden = true; mode = 'play'; pauseBtn.hidden = false
  fx({ k: 'pillar', T: 0.7 }); fx({ k: 'ring', x: pl.x, y: pl.y, R: 90, T: 0.5, col: '#7ff3ff' })   // 레벨 업 빛기둥
}
function boxKey(e) {
  if (!BOX) return
  if (!BOX.opened && ['Enter', 'Space'].includes(e.code)) { BOX.open(); e.preventDefault() }
  else if (BOX.jack && BOX.ready && ['Enter', 'Space', 'Escape'].includes(e.code)) { next(); e.preventDefault() }
  else if (/^Digit[1-3]$/.test(e.code)) { choose(+e.code.slice(5) - 1); e.preventDefault() }
}

// ---------------------------------------------------------------- 그리기
// 효과용 그림 — 빛(glow, 'lighter' 로 더해 그린다) · 반짝이 · 바닥 갈라짐 · 숫자. 매 프레임 그라데이션을 만들지 않게 미리
const GLOW = {}
function glow(col) {
  if (GLOW[col]) return GLOW[col]
  const a = mk(64, 64), c = a.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.28, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0))
  c.fillStyle = g; c.fillRect(0, 0, 64, 64)
  return GLOW[col] = a
}
const bloom = (c, col, x, y, R) => c.drawImage(glow(col), x - R, y - R, R * 2, R * 2)
const SPARK = (() => {   // 네 갈래 반짝이
  const a = mk(48, 48), c = a.getContext('2d')
  c.drawImage(glow('#ffffff'), 8, 8, 32, 32)
  c.fillStyle = '#fff'; c.beginPath()
  for (let i = 0; i < 8; i++) { const r = i % 2 ? 2.4 : 23, q = i * Math.PI / 4; c.lineTo(24 + Math.cos(q) * r, 24 + Math.sin(q) * r) }
  c.closePath(); c.fill()
  return a
})()
const CRACK = (() => {   // 덩크 · 앨리웁이 꽂힌 바닥
  const a = mk(200, 110), c = a.getContext('2d'), r = rng(42)
  c.translate(100, 55); c.scale(1, 0.55)
  const g = c.createRadialGradient(0, 0, 4, 0, 0, 90); g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, 90, 0, TAU); c.fill()
  c.strokeStyle = 'rgba(15,12,10,.75)'; c.lineCap = 'round'
  for (let i = 0; i < 9; i++) {
    let a0 = i / 9 * TAU + r() * 0.5, x = 0, y = 0, w = 3.4
    c.beginPath(); c.moveTo(0, 0)
    for (let k = 0; k < 5; k++) { a0 += (r() - 0.5) * 0.7; x += Math.cos(a0) * (12 + r() * 10); y += Math.sin(a0) * (12 + r() * 10); c.lineWidth = w; c.lineTo(x, y); w *= 0.75 }
    c.stroke()
  }
  return a
})()
// 피해 숫자 — 글자를 한 번 그려 두고 칸만 옮겨 그린다(strokeText 가 판 후반 그리기에서 가장 비싸다)
const DIGITS = '0123456789+'
function atlas(col, px) {
  const m = mk(1, 1).getContext('2d'); m.font = `900 ${px}px system-ui, sans-serif`
  const ws = [...DIGITS].map(ch => Math.ceil(m.measureText(ch).width)), pad = Math.ceil(px * 0.2), cell = Math.max(...ws) + pad * 2
  const a = mk(cell * DIGITS.length, px * 1.5), c = a.getContext('2d')
  c.font = m.font; c.textBaseline = 'middle'; c.textAlign = 'center'; c.lineJoin = 'round'; c.lineWidth = px * 0.26; c.strokeStyle = '#0b0e14'; c.fillStyle = col
  ;[...DIGITS].forEach((ch, i) => { c.strokeText(ch, i * cell + cell / 2, a.height / 2); c.fillText(ch, i * cell + cell / 2, a.height / 2) })
  return { a, cell, ws, pad, px }
}
const NUMS = { '': atlas('#ffffff', 28), crit: atlas('#ffd23f', 34), hurt: atlas('#ff6b6b', 30), heal: atlas('#62e38a', 30) }
function digits(c, s, x, y, size, kind) {
  const A = NUMS[kind] || NUMS[''], k = size / A.px, idx = [...s].map(ch => DIGITS.indexOf(ch)).filter(i => i >= 0)
  let w = 0; for (const i of idx) w += A.ws[i] * k
  let px = x - w / 2
  for (const i of idx) { c.drawImage(A.a, i * A.cell + A.cell / 2 - A.ws[i] / 2 - A.pad, 0, A.ws[i] + A.pad * 2, A.a.height, px - A.pad * k, y - A.a.height * k / 2, (A.ws[i] + A.pad * 2) * k, A.a.height * k); px += A.ws[i] * k }
}

function render() {
  const W = cv.width, H = cv.height
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = '#0b0e14'; cx.fillRect(0, 0, W, H)
  const X = cam.x + (shake ? (rnd() - 0.5) * shake : 0), Y = cam.y + (shake ? (rnd() - 0.5) * shake : 0)
  cx.setTransform(SC, 0, 0, SC, W / 2 - X * SC, H / 2 - Y * SC)
  floor(cx, G ? G.map : MAPS[menuMap], X - VW / 2, Y - VH / 2, VW, VH, tnow)
  if (!G) return
  world(cx)
  hud()
}
function world(c) {
  const t = G.t
  // ---- 바닥에 깔리는 것: 갈라진 자국 · 프레스 · 스크린 구역 · 충격파 · 고리 · 내 발밑 고리
  for (const f of G.fx) if (f.k === 'crack') { c.globalAlpha = Math.min(1, (f.T - f.t) * 1.5); c.drawImage(CRACK, f.x - f.R, f.y - f.R * 0.55, f.R * 2, f.R * 1.1) }
  c.globalAlpha = 1
  const press = G.weapons.find(w => w.id === 'press')
  if (press?.R) {
    const R = press.R, p = 1 - Math.max(0, press.t) / Math.max(0.2, press.st.cd * S.cdr)   // 다음 압박까지 차오른다
    const rgb = press.br ? '255,190,60' : '255,70,70', g = c.createRadialGradient(pl.x, pl.y, R * 0.15, pl.x, pl.y, R); g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${0.12 + p * 0.16})`)
    c.fillStyle = g; c.beginPath(); c.ellipse(pl.x, pl.y, R, R * 0.8, 0, 0, TAU); c.fill()
    c.strokeStyle = press.br ? 'rgba(255,225,140,.85)' : 'rgba(255,150,150,.7)'; c.lineWidth = 2; c.setLineDash([12, 9]); c.lineDashOffset = -t * 50; c.stroke(); c.setLineDash([])
    if (press.br) { c.strokeStyle = 'rgba(199,125,255,.6)'; c.lineWidth = 1.6; c.setLineDash([4, 10]); c.lineDashOffset = t * 30; c.beginPath(); c.ellipse(pl.x, pl.y, R * 0.92, R * 0.74, 0, 0, TAU); c.stroke(); c.setLineDash([]) }
  }
  for (const b of G.shots) if (b.k === 'zone') {
    const a = Math.min(1, (b.life - b.t) * 3), u = (b.t * 3.3) % 1
    c.globalAlpha = a; c.fillStyle = b.br ? 'rgba(255,200,70,.16)' : 'rgba(90,176,255,.15)'; c.beginPath(); c.ellipse(b.x, b.y, b.R, b.R * 0.8, 0, 0, TAU); c.fill()
    c.strokeStyle = b.br ? '#ffd23f' : '#7fc8ff'; c.lineWidth = 2; c.setLineDash([8, 6]); c.lineDashOffset = t * 30; c.stroke(); c.setLineDash([])
    c.globalAlpha = a * (1 - u); c.beginPath(); c.ellipse(b.x, b.y, b.R * u, b.R * u * 0.8, 0, 0, TAU); c.stroke(); c.globalAlpha = 1
  }
  for (const b of G.shots) if (b.k === 'ring' && b.t >= 0) {   // 덩크 충격파 — 두 겹 고리
    const u = Math.min(1, b.t / b.T), R = b.R * (0.15 + u * 0.85)
    c.globalAlpha = 1 - u * 0.8; c.strokeStyle = b.br ? '#fff3b0' : '#fff'; c.lineWidth = 9 * (1 - u) + 2; c.beginPath(); c.ellipse(b.x, b.y, R, R * 0.78, 0, 0, TAU); c.stroke()
    c.strokeStyle = b.br ? '#c77dff' : '#ffb35e'; c.lineWidth = 4; c.beginPath(); c.ellipse(b.x, b.y, R * 0.78, R * 0.6, 0, 0, TAU); c.stroke(); c.globalAlpha = 1
  }
  for (const f of G.fx) if (f.k === 'ring') {
    const u = f.t / f.T; c.globalAlpha = 1 - u; c.strokeStyle = f.col; c.lineWidth = 5 * (1 - u) + 1; c.beginPath(); c.ellipse(f.x, f.y, f.R * (0.3 + u * 0.7), f.R * (0.24 + u * 0.56), 0, 0, TAU); c.stroke()
  }
  c.globalAlpha = 1
  // 내 발밑 — 유니폼 색 고리 + 도는 빛
  const ring = G.ch.c[0] === '#fdb927' ? '#ffd23f' : shade(G.ch.c[0], 1.6)
  c.strokeStyle = rgba(ring, 0.55); c.lineWidth = 2.4; c.beginPath(); c.ellipse(pl.x, pl.y, 17, 6.6, 0, 0, TAU); c.stroke()
  c.strokeStyle = '#fff'; c.lineWidth = 2.6; c.beginPath(); c.ellipse(pl.x, pl.y, 17, 6.6, 0, t * 3, t * 3 + 1.1); c.stroke()
  // ---- 아이템 · 경험치
  for (const it of G.items) {
    if (it.k === 'ring') {   // 챔피언 반지 — 멀리서도 보이게 빛기둥
      const g = c.createLinearGradient(0, it.y - 220, 0, it.y); g.addColorStop(0, 'rgba(199,125,255,0)'); g.addColorStop(1, `rgba(255,214,90,${0.4 + Math.sin(it.t * 4) * 0.12})`)
      c.fillStyle = g; c.fillRect(it.x - 9, it.y - 220, 18, 220)
    }
    blit(c, ITEMS[it.k], it.x, it.y - 12 - (0.5 + Math.sin(it.t * 5) * 0.5) * 3)
  }
  for (const g of G.gems) if (onScreen(g, 20)) blit(c, GEMS[g.v < 3 ? 0 : g.v < 10 ? 1 : 2], g.x, g.y - 4 - Math.sin(t * 4 + g.x) * 1.5)
  // ---- 그림자 — 한 번에
  c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath()
  const shadow = (x, y, r) => { c.moveTo(x + r, y); c.ellipse(x, y, r, r * 0.38, 0, 0, TAU) }
  shadow(pl.x, pl.y, 11 * (1 - Math.min(0.4, pl.jump * 1.4)))
  for (const e of G.foes) if (onScreen(e, 60)) shadow(e.x, e.y, e.r * 1.05)
  for (const b of G.shots) if (b.k === 'arc' || b.k === 'drop') shadow(b.x, b.y, 6 + (b.k === 'drop' ? b.t / b.T * 6 : 0))
  c.fill()
  // ---- 사람 — 위(먼 쪽)부터. 나는 내 발 높이 차례에
  let drawn = false
  for (const e of G.foes) {
    if (!drawn && e.y > pl.y) { drawMe(c); drawn = true }
    if (!onScreen(e, 60)) continue
    const s = SPR[e.type][e.v], R = e.fx > 0
    const img = e.flash > 0 ? (R ? s.WR : s.WL) : (R ? s.R : s.L)[G.freeze > 0 ? 0 : (t * 8 + e.seed | 0) & 3]
    if (e.boss && e.st === 'wind') {   // 돌진 예고 — 갈 길을 붉게
      const L = e.spd * 4 * 0.75
      c.strokeStyle = `rgba(255,60,60,${0.35 + Math.sin(t * 30) * 0.15})`; c.lineWidth = e.r * 1.4; c.lineCap = 'round'
      c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.x + e.dx * L, e.y + e.dy * L); c.stroke()
      label2(c, '!', e.x, e.y - e.r * 4.6, 30, '#ff4d4d')
    }
    if (e.age < 0.3) c.globalAlpha = e.age / 0.3   // 나타날 때 스르륵
    blit(c, img, e.x, e.y)
    c.globalAlpha = 1
    if ((e.elite || e.boss) && e.hp < e.max) { const w = e.r * 2.2; c.fillStyle = '#000a'; c.fillRect(e.x - w / 2, e.y + 6, w, 4); c.fillStyle = e.boss ? '#ffd23f' : '#ff6b6b'; c.fillRect(e.x - w / 2, e.y + 6, w * Math.max(0, e.hp / e.max), 4) }
  }
  if (!drawn) drawMe(c)
  // ---- 날아가는 것
  for (const b of G.shots) {
    if (b.k === 'ball' || b.k === 'boom' || b.k === 'hook') {
      const big = b.k === 'hook', s = big ? (b.br ? BIGG : BIG) : b.br ? BALLG : BALL, k = big ? b.r / 11.5 : b.k === 'boom' ? b.r / 8 : 1
      const vx = b.k === 'boom' ? b.dx * b.v : b.vx, vy = b.k === 'boom' ? b.dy * b.v : b.vy
      for (let i = 3; i >= 1; i--) { c.globalAlpha = 0.16 * (4 - i) / 3; blit(c, s, b.x - vx * 0.018 * i, b.y - 16 - vy * 0.018 * i, k) }   // 잔상
      c.globalAlpha = 1
      c.save(); c.translate(b.x, b.y - 16); c.rotate(b.a); blit(c, s, 0, 0, k); c.restore()
    } else if (b.k === 'arc') {
      const u = Math.min(1, b.t / b.T), z = 4 * b.H * u * (1 - u)
      c.save(); c.translate(b.x, b.y - 16 - z); c.rotate(b.a); blit(c, b.br ? BALLG : BALL, 0, 0, 1 + z / 240); c.restore()
    } else if (b.k === 'drop') {
      const u = Math.min(1, b.t / b.T), R = b.R * (1.3 - u * 0.3)
      c.strokeStyle = b.br ? `rgba(199,125,255,${0.3 + u * 0.6})` : `rgba(255,210,63,${0.3 + u * 0.6})`; c.lineWidth = 2.4; c.beginPath(); c.ellipse(b.x, b.y, R, R * 0.5, 0, 0, TAU); c.stroke()
      c.setLineDash([6, 6]); c.lineDashOffset = t * 40; c.beginPath(); c.ellipse(b.x, b.y, R * 0.6, R * 0.3, 0, 0, TAU); c.stroke(); c.setLineDash([])
      blit(c, b.br ? BALLG : BALL, b.x, b.y - 16 - (1 - u) * 300, 1.3)
    } else if (b.k === 'orb') {
      for (let i = 2; i >= 0; i--) {   // 손 잔상
        const a = b.w.ang - i * 0.22 + b.i / b.n * TAU
        c.globalAlpha = i ? 0.14 / i : 1
        c.save(); c.translate(pl.x + Math.cos(a) * b.R, pl.y + Math.sin(a) * b.R - 14); c.rotate(a + Math.PI / 2); blit(c, b.br ? HANDG : HAND, 0, 0, Math.min(1.6, b.r / 10)); c.restore()
      }
      c.globalAlpha = 1
    } else if (b.k === 'slash') {   // 크로스오버 — 초승달 궤적
      const u = b.t / b.T, y = pl.y - 12, x0 = pl.x + b.side * 8, x1 = pl.x + b.side * b.W, mx = (x0 + x1) / 2
      const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, b.br ? 'rgba(255,243,176,.95)' : 'rgba(255,255,255,.95)'); g.addColorStop(1, b.br ? 'rgba(199,125,255,.95)' : 'rgba(127,243,255,.9)')
      c.globalAlpha = 1 - u * u; c.fillStyle = g
      c.beginPath(); c.moveTo(x0, y - b.H * 0.1); c.quadraticCurveTo(mx, y - b.H * (0.95 + u * 0.3), x1, y); c.quadraticCurveTo(mx, y - b.H * 0.3, x0, y + b.H * 0.1); c.fill()
      c.beginPath(); c.moveTo(x0, y + 2); c.quadraticCurveTo(mx, y + b.H * 0.75, x1, y + 4); c.quadraticCurveTo(mx, y + b.H * 0.25, x0, y + 2); c.fill()
      c.globalAlpha = 1
      blit(c, b.br ? BALLG : BALL, x0 + (x1 - x0) * Math.min(1, u * 1.6), y + 4, 0.8)
    } else if (b.k === 'zone') blit(c, pl.spr.mate, b.x, b.y)
  }
  for (const b of G.eshots) { c.save(); c.translate(b.x, b.y - 18); c.rotate(b.a); blit(c, WHISTLE, 0, 0); c.restore() }
  for (const f of G.fx) if (f.k === 'puff') {   // 쓰러질 때 연기
    const u = f.t / f.T; c.globalAlpha = 0.55 * (1 - u)
    for (let i = 0; i < 3; i++) { const a = f.a + i * 2.1, d = f.r * u * 0.9; c.drawImage(glow('#ffffff'), f.x + Math.cos(a) * d - f.r, f.y - f.r * 1.2 + Math.sin(a) * d * 0.6 - f.r, f.r * 2, f.r * 2) }
  }
  c.globalAlpha = 1
  // ---- 빛 — 더해 그린다(lighter)
  c.globalCompositeOperation = 'lighter'
  for (const it of G.items) { c.globalAlpha = 0.45 + Math.sin(it.t * 5) * 0.25; bloom(c, it.k === 'ring' ? '#b46bff' : it.k === 'chest' ? '#ffb400' : '#9fd8ff', it.x, it.y - 12, it.k === 'ring' ? 40 : 26) }
  for (const e of G.foes) if (e.boss && onScreen(e, 80)) { c.globalAlpha = e.st === 'wind' ? 0.45 : 0.22 + Math.sin(t * 6) * 0.08; bloom(c, e.st === 'wind' ? '#ff3030' : '#ffb400', e.x, e.y - e.r * 0.8, e.r * 2.4) }
  c.globalAlpha = 1
  for (const b of G.shots) {
    if (b.k === 'ball') { c.globalAlpha = 0.7; bloom(c, b.col || '#ff8a2a', b.x, b.y - 16, 15) }
    else if (b.k === 'boom') { c.globalAlpha = 0.8; bloom(c, '#3fe0ff', b.x, b.y - 16, b.r * 2.2) }
    else if (b.k === 'hook') { c.globalAlpha = 0.55; bloom(c, '#ffffff', b.x, b.y - 16, b.r * 2.2) }
    else if (b.k === 'arc') { const u = Math.min(1, b.t / b.T); c.globalAlpha = 0.7; bloom(c, '#ff8a2a', b.x, b.y - 16 - 4 * b.H * u * (1 - u), 16) }
    else if (b.k === 'drop') {   // 불꼬리
      const u = Math.min(1, b.t / b.T), y = b.y - 16 - (1 - u) * 300
      for (let i = 0; i < 5; i++) { c.globalAlpha = 0.6 - i * 0.1; bloom(c, i < 2 ? '#ffd23f' : '#ff5a1a', b.x + Math.sin(t * 40 + i) * 2, y - i * 13, 14 - i * 1.6) }
    } else if (b.k === 'orb') { c.globalAlpha = 0.45; bloom(c, '#ffe2c0', b.x, b.y - 14, 18) }
    else if (b.k === 'ring' && b.t >= 0) { const u = Math.min(1, b.t / b.T); c.globalAlpha = 0.6 * (1 - u); bloom(c, b.br ? '#ffc94a' : '#ffb35e', b.x, b.y - 6, b.R * (0.4 + u * 0.6)) }
    if (!b.br || b.k === 'ring' || b.k === 'echo') continue
    // 돌파 — 보랏빛 기운을 한 겹 더
    c.globalAlpha = 0.35 + Math.sin(t * 9 + b.x * 0.05) * 0.1
    if (b.k === 'orb') bloom(c, '#b46bff', b.x, b.y - 14, 30)
    else if (b.k === 'zone') bloom(c, '#ffc94a', b.x, b.y - 30, 44)
    else if (b.k === 'slash') bloom(c, '#b46bff', pl.x + b.side * b.W * 0.5, pl.y - 12, b.W * 0.6)
    else if (b.k === 'drop') bloom(c, '#b46bff', b.x, b.y - 16 - (1 - Math.min(1, Math.max(0, b.t) / b.T)) * 300, 30)
    else if (b.k === 'arc') { const u = Math.min(1, b.t / b.T); bloom(c, '#b46bff', b.x, b.y - 16 - 4 * b.H * u * (1 - u), 26) }
    else bloom(c, '#b46bff', b.x, b.y - 16, (b.r || 7) * 3.4)
  }
  for (const f of G.fx) {
    const u = f.t / f.T
    if (f.k === 'bolt') {   // 버저비터 — 지그재그 번개
      c.globalAlpha = 1 - u
      c.strokeStyle = f.br ? 'rgba(180,107,255,.5)' : 'rgba(255,225,110,.45)'; c.lineWidth = 11; c.lineJoin = 'round'; c.beginPath(); f.pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke()
      c.strokeStyle = f.br ? '#fff3c4' : '#fffbe6'; c.lineWidth = 3; c.stroke()
      bloom(c, f.br ? '#c77dff' : '#ffe066', f.x, f.y, f.R * (1.6 - u * 0.6))
    } else if (f.k === 'spark') { c.globalAlpha = 1 - u; const s = f.s * (1 - u * 0.5); c.save(); c.translate(f.x, f.y); c.rotate(f.a + u * 2); c.drawImage(SPARK, -s / 2, -s / 2, s, s); c.restore() }
    else if (f.k === 'flash') { c.globalAlpha = 0.8 * (1 - u); bloom(c, f.col, f.x, f.y, f.R * (0.6 + u)) }
    else if (f.k === 'pillar') {   // 레벨 업 — 빛기둥
      const a = 1 - u, w = 26 * (1 - u * 0.5), g = c.createLinearGradient(0, pl.y - 260, 0, pl.y)
      g.addColorStop(0, 'rgba(127,243,255,0)'); g.addColorStop(1, `rgba(127,243,255,${0.55 * a})`)
      c.globalAlpha = 1; c.fillStyle = g; c.fillRect(pl.x - w / 2, pl.y - 260, w, 260)
      c.globalAlpha = a; bloom(c, '#7ff3ff', pl.x, pl.y - 10, 50)
    }
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'
  for (const p of G.parts) { c.globalAlpha = 1 - p.t / p.T; c.fillStyle = p.col; c.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r) }
  c.globalAlpha = 1
  // ---- 글자: 피해 숫자(그려 둔 글자) · 덩크 같은 외침
  for (const n of G.nums) {
    const u = n.t / 0.7, pop = n.t < 0.08 ? 1 + (0.08 - n.t) * 6 : 1, sz = (n.kind === 'crit' ? 16 : n.kind ? 13 : 10) * pop
    c.globalAlpha = u < 0.7 ? 1 : (1 - u) / 0.3
    digits(c, String(n.v), n.x, n.y - u * 22, sz, n.kind)
  }
  for (const f of G.fx) if (f.k === 'text') {
    const u = f.t / f.T, sc = u < 0.15 ? 0.6 + u / 0.15 * 0.6 : 1.2 - Math.min(0.2, (u - 0.15)), a = u < 0.7 ? 1 : (1 - u) / 0.3
    c.globalAlpha = a; c.save(); c.translate(f.x, f.y - u * 18); c.rotate(-0.08); label2(c, f.s, 0, 0, 15 * sc, f.col); c.restore()
  }
  c.globalAlpha = 1
}
function drawMe(c) {
  const s = pl.spr, fr = pl.moving ? (G.t * 10 | 0) & 3 : 0, img = (pl.fx > 0 ? s.R : s.L)[fr]
  const jz = pl.jump > 0 ? Math.sin((1 - pl.jump / 0.3) * Math.PI) * 30 : 0
  if (G.dying) { c.save(); c.globalAlpha = Math.max(0, G.dying); c.translate(pl.x, pl.y); c.rotate((1 - G.dying) * 1.4 * pl.fx); blit(c, img, 0, 0); c.restore(); return }
  if (pl.inv > 0 && (G.t * 18 | 0) % 2) c.globalAlpha = 0.45
  blit(c, img, pl.x, pl.y - jz)
  c.globalAlpha = 1
  if (!jz) { const bz = Math.abs(Math.sin(G.t * 9)) * 13; blit(c, BALL, pl.x + pl.fx * 11, pl.y - 3 - bz, 0.75) }   // 드리블
  const w = 30, f = pl.hp / S.maxHp   // 체력
  c.fillStyle = '#000b'; c.fillRect(pl.x - w / 2 - 1, pl.y + 8, w + 2, 5)
  c.fillStyle = f > 0.5 ? '#62e38a' : f > 0.25 ? '#ffd23f' : '#ff4d4d'; c.fillRect(pl.x - w / 2, pl.y + 9, w * f, 3)
}
function label2(c, s, x, y, size, col) { c.font = `900 ${size}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineJoin = 'round'; c.lineWidth = size * 0.24; c.strokeStyle = '#0b0e14'; c.strokeText(s, x, y); c.fillStyle = col; c.fillText(s, x, y) }
let VIG = null, VIGR = null   // 화면 가장자리 그늘(체력이 낮으면 붉게) — 크기가 바뀔 때만 다시
function hud() {
  const c = cx, W = cv.width, H = cv.height, u = Math.min(W, H) / 360
  c.setTransform(1, 0, 0, 1, 0, 0)
  if (!VIG || VIG.width !== W || VIG.height !== H) {
    VIG = mk(W, H); const v = VIG.getContext('2d'), g = v.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75)
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.42)'); v.fillStyle = g; v.fillRect(0, 0, W, H)
    VIGR = tint(VIG, '#c00000')
  }
  c.drawImage(VIG, 0, 0)
  if (G.freeze > 0) { c.fillStyle = 'rgba(90,170,255,.14)'; c.fillRect(0, 0, W, H) }
  for (const f of G.fx) if (f.k === 'white') { c.fillStyle = `rgba(255,255,255,${0.8 * (1 - f.t / f.T)})`; c.fillRect(0, 0, W, H) }
  if (pl.hp < S.maxHp * 0.3 || G.dying) { c.globalAlpha = 0.6 + Math.sin(tnow * 6) * 0.3; c.drawImage(VIGR, 0, 0); c.globalAlpha = 1 }
  // 경험치 · 레벨
  const bh = 7 * u
  c.fillStyle = '#05070bd0'; c.fillRect(0, 0, W, bh)
  const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#2a7fff'); g.addColorStop(1, '#5ef2ff')
  c.fillStyle = g; c.fillRect(0, 0, W * Math.min(1, G.xp / G.next), bh)
  c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(0, 0, W * Math.min(1, G.xp / G.next), bh * 0.35)
  label2(c, `LV ${G.lvl}`, W - 22 * u, bh * 0.82, 6 * u, '#fff')
  // 시계 · 처치
  label2(c, fmt(G.t), W / 2, bh + 16 * u, 14 * u, G.t > MAX_T - 60 ? '#ffd23f' : '#fff')
  label2(c, `처치 ${G.kills.toLocaleString()}`, W / 2, bh + 25 * u, 6.2 * u, '#c9d1e0')
  // 스킬 · 아이템
  let x = 4 * u, y = bh + 4 * u
  const s = 12 * u
  for (const w of G.weapons) {   // 최고 레벨은 금테, 돌파는 금빛 아이콘에 보랏빛이 숨 쉰다
    c.drawImage(ICON[iconOf(w)], x, y, s, s)
    if (w.br) { c.strokeStyle = `rgba(199,125,255,${0.55 + Math.sin(tnow * 4) * 0.35})`; c.lineWidth = 1.4 * u; c.beginPath(); c.roundRect(x - u, y - u, s + 2 * u, s + 2 * u, 3 * u); c.stroke() }
    else if (w.lv === 8) { c.strokeStyle = '#ffd23f'; c.lineWidth = 1.2 * u; c.beginPath(); c.roundRect(x, y, s, s, 2.4 * u); c.stroke() }
    else label2(c, String(w.lv), x + s - 2.4 * u, y + s - 0.6 * u, 5.4 * u, '#fff')
    x += s + 1.6 * u
  }
  x = 4 * u; y += s + 2 * u
  const s2 = 9 * u
  for (const id in G.passives) { c.drawImage(ICON[id], x, y, s2, s2); label2(c, String(G.passives[id]), x + s2 - 2 * u, y + s2 - 0.4 * u, 4.4 * u, '#fff'); x += s2 + 1.4 * u }
  // 보스 체력
  const b = G.foes.find(e => e.boss && !e.dead)
  if (b) {
    const bw = Math.min(W * 0.6, 200 * u), bx = (W - bw) / 2, by = bh + 37 * u
    c.fillStyle = '#000c'; c.fillRect(bx - u, by - u, bw + 2 * u, 6 * u)
    const bg = c.createLinearGradient(bx, 0, bx + bw, 0); bg.addColorStop(0, '#ff8a00'); bg.addColorStop(1, '#ffd23f')
    c.fillStyle = bg; c.fillRect(bx, by, bw * Math.max(0, b.hp / b.max), 4 * u)
    label2(c, '올스타 수비수', W / 2, by - 1.6 * u, 5.4 * u, '#ffd23f')
  }
  if (G.banner) {
    const B = G.banner, a = Math.min(1, B.t * 6, (B.T - B.t) * 3), sc = 1 + Math.max(0, 0.25 - B.t) * 1.6
    c.globalAlpha = Math.max(0, a); label2(c, B.s, W / 2, H * 0.36, 17 * u * sc, B.col); c.globalAlpha = 1
  }
  if (joy.on) {
    const k = cv.width / (cv.getBoundingClientRect().width || 1)
    c.globalAlpha = 0.5; c.strokeStyle = '#fff'; c.lineWidth = 2 * k; c.beginPath(); c.arc(joy.ox * k, joy.oy * k, 46 * k, 0, TAU); c.stroke()
    c.fillStyle = '#fff'; c.beginPath(); c.arc(joy.px * k, joy.py * k, 20 * k, 0, TAU); c.fill(); c.globalAlpha = 1
  }
}

// ---------------------------------------------------------------- 메뉴 · 업적 · 결과 (HTML)
const btn = (label, onclick, cls = '') => h('button', { type: 'button', className: `sv-btn${cls ? ` ${cls}` : ''}`, onclick }, label)
const row = (...b) => h('div', { className: 'sv-row' }, b)
function show(keepScroll, ...kids) {
  const top = ui.scrollTop
  ui.classList.remove('is-box'); ui.onpointerdown = null; ui.replaceChildren(...kids); ui.hidden = false
  ui.scrollTop = keepScroll ? top : 0
  if (!keepScroll) ui.querySelector('.is-main')?.focus({ preventScroll: true })
}
const saveNote = () => auth === 'in' ? `업적이 ${me?.name ?? ''} 계정에 저장돼요 — 다른 기기에서도 이어져요` : '로그인하지 않으면 업적은 이 브라우저에만 남아요. 로그인하면 계정에 합쳐져요'
function title() {
  mode = 'menu'; G = null; pauseBtn.hidden = true
  const got = ACH.filter(a => save.ach[a.id]).length
  show(false, h('div', { className: 'sv-title' },
    h('p', { className: 'sv-logo' }, h('span', {}, 'DUNK'), h('span', {}, 'SURVIVOR')),
    h('p', { className: 'sv-sub' }, '몰려오는 수비를 피해 30분을 버텨라'),
    row(btn('게임 시작', chars, 'is-main'), btn('랭킹', ranks), btn(`업적 ${got} / ${ACH.length}`, achs)),
    h('p', { className: 'sv-note' }, saveNote())))
}
function chars(keep = false) {
  mode = 'menu'; G = null; pauseBtn.hidden = true
  const ch = CHARS[menuChar], lock = lockOf(ch), W = WEAP[ch.w]
  show(keep === true, h('div', { className: 'sv-panel sv-wide' },
    h('p', { className: 'sv-h' }, '캐릭터 고르기'),
    h('div', { className: 'sv-chars' }, CHARS.map((c, i) => {
      const l = lockOf(c)
      return h('button', { type: 'button', className: `sv-char${l ? ' is-locked' : ''}`, 'aria-pressed': String(i === menuChar), onclick: () => { menuChar = i; chars(true) }, ondblclick: () => !l && maps() },
        h('img', { src: faceOf(P(c.id)), alt: '' }), h('b', {}, P(c.id).short || nameOf(c)), h('small', {}, l ? '잠김' : c.trait))
    })),
    h('div', { className: 'sv-pick' },
      h('img', { src: ICON_URL[ch.w], alt: '' }),
      h('div', {},
        h('b', {}, nameOf(ch), h('small', {}, ` #${NBA_NUM[ch.id] ?? ''} · 체력 ${ch.hp}`)),
        h('p', {}, h('em', {}, `시작 스킬 「${W.name}」`), ` ${W.note}`),
        h('p', {}, h('em', {}, `특성 「${ch.trait}」`), ` ${ch.note}`),
        lock && h('p', { className: 'sv-lockmsg' }, `잠김 — 업적 「${lock.name}」을 달성하면 열려요: ${lock.note}`))),
    row(btn('← 처음으로', title), Object.assign(btn('맵 고르기 →', maps, 'is-main'), { disabled: !!lock }))))
}
const PREVIEW = {}
function preview(m) {
  if (PREVIEW[m.id]) return PREVIEW[m.id]
  const a = mk(320, 180), c = a.getContext('2d'), s = 320 / 900
  c.setTransform(s, 0, 0, s, 160, 90); floor(c, m, -450, -250, 900, 500)
  return PREVIEW[m.id] = a
}
function maps(keep = false) {
  show(keep === true, h('div', { className: 'sv-panel sv-wide' },
    h('p', { className: 'sv-h' }, '맵 고르기'),
    h('div', { className: 'sv-maps' }, MAPS.map((m, i) => {
      const best = save.stats[`best_${m.id}`]
      return h('button', { type: 'button', className: 'sv-map', 'aria-pressed': String(i === menuMap), onclick: () => { menuMap = i; maps(true) }, ondblclick: start },
        preview(m), h('b', {}, m.name), h('small', {}, m.note), h('small', { className: 'sv-best' }, best ? `최고 ${fmt(best)}` : '아직 기록 없음'))
    })),
    row(btn('← 캐릭터', () => chars()), btn('시작!', start, 'is-main'))))
}
function progress(a) {
  if (a.stat) return `${Math.min(a.goal, save.stats[a.stat] || 0).toLocaleString()} / ${a.goal.toLocaleString()}`
  if (a.id === 'allchar') return `${CHARS.filter(c => save.stats[`p_${c.id}`]).length} / ${CHARS.length}`
  return ''
}
function achList() {
  return h('ul', { className: 'sv-achs' }, ACH.map(a => {
    const at = save.ach[a.id], c = a.char && CHARS.find(x => x.id === a.char), pr = !at && progress(a)
    return h('li', { className: at ? 'is-done' : '' },
      h('span', { className: 'sv-medal', 'aria-label': at ? '달성' : '아직' }, at ? '★' : '☆'),
      h('div', {}, h('b', {}, a.name), h('small', {}, a.note, pr && ` (${pr})`), c && h('small', { className: 'sv-reward' }, `${at ? '열림' : '해금'} · ${nameOf(c)}`)),
      c && h('img', { src: faceOf(P(c.id)), alt: '' }))
  }))
}
// ---- 랭킹 — 맵마다 오래 버틴 순(같으면 많이 쓰러뜨린 순), 사람마다 최고 기록 한 줄. 로그인하면 판이 끝날 때 올라간다
const PENDING = 'survive.pending'   // 로그인 안 하고 끝낸 판(더 나은 것 하나) — 로그인하고 돌아오면 올린다(2시간 안)
let RANK = null, rankTab = 0, guideTab = 0
const better = (a, b) => !b || a.secs > b.secs || (a.secs === b.secs && a.kills > b.kills)
async function loadRank() {
  try { RANK = await api('/survive/ranking', { withToken: auth === 'in' }) } catch { RANK = { error: true } }
  if (mode === 'menu' && ui.querySelector('.sv-h')?.textContent === '랭킹') ranks(true)
  guideRank()
}
function rankList(tab, set) {
  const m = MAPS[tab], rows = RANK?.ranking?.[m.id] || [], mine = RANK?.mine?.[m.id], isMe = r => mine && r.rank === mine.rank && r.name === me?.name
  return h('div', { className: 'sv-rank' },
    h('div', { className: 'sv-tabs', role: 'tablist' }, MAPS.map((x, i) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === tab), onclick: () => set(i) }, x.name))),
    !RANK ? h('p', { className: 'sv-note' }, '불러오는 중…')
      : RANK.error ? h('p', { className: 'sv-note' }, '랭킹을 불러오지 못했어요')
      : !rows.length ? h('p', { className: 'sv-note' }, '아직 기록이 없어요 — 첫 기록의 주인공이 되어 보세요')
      : h('ol', { className: 'sv-ranks' }, rows.map(r => h('li', { className: [r.rank <= 3 && `is-top${r.rank}`, isMe(r) && 'is-me'].filter(Boolean).join(' ') },
        h('b', { className: 'sv-rk' }, String(r.rank)), h('img', { src: faceOf(P(r.hero)), alt: '' }), h('span', { className: 'sv-rn' }, r.name),
        h('span', { className: 'sv-rt' }, fmt(r.secs)), h('small', {}, `처치 ${r.kills.toLocaleString()} · Lv ${r.lvl} · ${nameOf({ id: r.hero })}`)))),
    mine && !rows.some(isMe) && h('p', { className: 'sv-mine' }, `내 기록 ${mine.rank}위 · ${fmt(mine.secs)} · 처치 ${mine.kills.toLocaleString()}`),
    auth !== 'in' && h('p', { className: 'sv-note' }, '로그인하면 판이 끝날 때 내 기록이 랭킹에 올라가요 ', h('button', { type: 'button', className: 'sv-link', onclick: chooseLogin }, '로그인')))
}
function ranks(keep = false) {
  show(keep === true, h('div', { className: 'sv-panel sv-wide' }, h('p', { className: 'sv-h' }, '랭킹'), rankList(rankTab, i => { rankTab = i; ranks(true) }), row(btn('← 처음으로', title, 'is-main'))))
  if (!RANK) loadRank()
}
const guideRank = () => { if (ready) document.getElementById('sv-guide-rank').replaceChildren(rankList(guideTab, i => { guideTab = i; guideRank() })) }
/** 한 판 올리기 → 알릴 말(실패하면 null). el 이 있으면 거기에 쓴다 */
async function submit(run, el) {
  const name = MAPS.find(m => m.id === run.map).name
  try {
    const v = await api('/survive/run', { method: 'POST', body: run, withToken: true })
    const msg = v.best ? `새 최고 기록! ${name} ${v.mine.rank}위` : `${name} 내 최고 ${fmt(v.mine.secs)} · ${v.mine.rank}위`
    el?.classList.toggle('is-best', v.best); el?.replaceChildren(msg)
    RANK = null; loadRank()
    return msg
  } catch (e) { el?.replaceChildren(`랭킹에 올리지 못했어요 — ${e.message}`); return null }
}
function achs() { show(false, h('div', { className: 'sv-panel sv-wide' }, h('p', { className: 'sv-h' }, `업적 ${ACH.filter(a => save.ach[a.id]).length} / ${ACH.length}`), h('p', { className: 'sv-note' }, saveNote()), achList(), row(btn('← 처음으로', title, 'is-main')))) }
function build() {
  return h('div', { className: 'sv-build' },
    G.weapons.map(w => h('span', { className: w.br ? 'is-break' : '' }, h('img', { src: ICON_URL[iconOf(w)], alt: '' }), w.br ? `${BREAK[w.id].name} · 돌파` : `${WEAP[w.id].name} Lv ${w.lv}`)),
    Object.entries(G.passives).map(([id, lv]) => h('span', {}, h('img', { src: ICON_URL[id], alt: '' }), `${PASS[id].name} Lv ${lv}`)))
}
function pause() {
  if (mode !== 'play' || !G) return
  mode = 'pause'; calm(); pauseBtn.hidden = true
  show(false, h('div', { className: 'sv-panel' }, h('p', { className: 'sv-h' }, '일시정지'), h('p', { className: 'sv-note' }, `${G.ch && nameOf(G.ch)} · ${G.map.name} · ${fmt(G.t)}`), build(),
    row(btn('계속', resume, 'is-main'), btn('그만두기', () => finish(false, true)))))
}
function resume() { if (mode !== 'pause') return; mode = 'play'; ui.hidden = true; pauseBtn.hidden = false }
function finish(win, quit = false) {
  if (mode === 'over') return
  mode = 'over'; pauseBtn.hidden = true; calm()
  const st = save.stats, add = (k, v) => { st[k] = (st[k] || 0) + v }
  add('kills', G.kills); add('runs', 1); add('jackpots', G.jackpots); add('bosses', G.bosses)
  st[`best_${G.map.id}`] = Math.max(st[`best_${G.map.id}`] || 0, G.t | 0)
  st[`p_${G.ch.id}`] = 1
  gain('run1')
  if (win) { gain('surv30'); gain(`clear_${G.map.id}`) }
  for (const a of ACH) if (a.stat && (st[a.stat] || 0) >= a.goal) gain(a.id)
  if (CHARS.every(c => st[`p_${c.id}`])) gain('allchar')
  persist(true)
  // 랭킹 — 로그인했으면 바로 올리고, 아니면 이 판을 남겨 뒀다가 로그인하고 돌아오면(pull)
  const run = { map: G.map.id, hero: G.ch.id, secs: G.t | 0, kills: G.kills, lvl: G.lvl }, rankMsg = h('p', { className: 'sv-rankmsg' })
  if (run.secs >= 10) {
    if (auth === 'in') { rankMsg.textContent = '랭킹에 기록을 올리는 중…'; submit(run, rankMsg) }
    else {
      try { const old = JSON.parse(localStorage.getItem(PENDING)); if (better(run, old?.map === run.map ? old : null)) localStorage.setItem(PENDING, JSON.stringify({ ...run, at: Date.now() })) } catch {}
      rankMsg.append('로그인하면 이 기록이 랭킹에 올라가요 ', h('button', { type: 'button', className: 'sv-link', onclick: chooseLogin }, '로그인'))
    }
  }
  const unlocked = G.got.filter(a => a.char)
  show(false, h('div', { className: `sv-panel sv-over${win ? ' is-win' : ''}` },
    h('p', { className: 'sv-h sv-big' }, win ? '30분 생존!' : quit ? '경기 포기' : 'K.O.'),
    h('p', { className: 'sv-note' }, `${nameOf(G.ch)} · ${G.map.name}`),
    h('dl', { className: 'sv-stats' }, [['버틴 시간', fmt(G.t)], ['레벨', G.lvl], ['처치', G.kills.toLocaleString()], ['잭팟', G.jackpots], ['보스', G.bosses]].map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, String(v))))),
    rankMsg,
    build(),
    G.got.length > 0 && h('div', { className: 'sv-got' }, h('b', {}, `새 업적 ${G.got.length}개`), h('ul', {}, G.got.map(a => h('li', {}, `★ ${a.name}`, a.char && h('em', {}, ` — ${nameOf(CHARS.find(c => c.id === a.char))} 해금!`))))),
    unlocked.length > 0 && h('div', { className: 'sv-unlock' }, unlocked.map(a => { const c = CHARS.find(x => x.id === a.char); return h('img', { src: faceOf(P(c.id)), alt: nameOf(c), title: nameOf(c) }) })),
    row(btn('다시 하기', start, 'is-main'), btn('캐릭터 고르기', () => chars()), btn('처음으로', title))))
}
function gain(id) {
  if (save.ach[id]) return
  save.ach[id] = Date.now()
  const a = ACH.find(x => x.id === id), c = a.char && CHARS.find(x => x.id === a.char)
  G?.got.push(a)
  const el = h('div', { className: 'sv-toast' }, c ? h('img', { src: faceOf(P(c.id)), alt: '' }) : h('span', { className: 'sv-medal' }, '★'),
    h('div', {}, h('small', {}, '업적 달성'), h('b', {}, a.name), c && h('small', { className: 'sv-reward' }, `캐릭터 해금 — ${nameOf(c)}`)))
  toasts.append(el); setTimeout(() => el.remove(), 4200)
  while (toasts.children.length > 3) toasts.firstElementChild.remove()
  persist()
  guideAchs()
}
function notice(msg) {
  const el = h('div', { className: 'sv-toast' }, h('span', { className: 'sv-medal' }, '★'), h('div', {}, h('small', {}, '랭킹'), h('b', {}, msg)))
  toasts.append(el); setTimeout(() => el.remove(), 4200)
}
/** 저장이 바뀌었을 때(로그인 · 다른 기기 것을 합침) 지금 메뉴 · 아래 업적 목록을 다시 */
function refresh() {
  guideAchs()
  if (mode !== 'menu') return
  const h2 = ui.querySelector('.sv-h')?.textContent || ''
  if (h2.startsWith('캐릭터')) chars(true); else if (h2.startsWith('맵')) maps(true); else if (h2.startsWith('업적')) achs(); else if (h2 === '랭킹') ranks(true); else title()
}

// ---------------------------------------------------------------- 아래 설명 — 캐릭터 · 스킬 · 아이템 · 업적 표
function guide() {
  const tr = (...cells) => h('tr', {}, cells)
  const named = (img, text, cls = 'sv-face') => h('th', {}, h('img', { className: cls, src: img, alt: '' }), text)
  document.getElementById('sv-guide-chars').replaceChildren(...CHARS.map(c => {
    const a = ACH.find(x => x.char === c.id)
    return tr(named(faceOf(P(c.id)), nameOf(c)), h('td', {}, WEAP[c.w].name), h('td', {}, h('b', {}, c.trait), ` — ${c.note}`), h('td', {}, a ? `업적 「${a.name}」 — ${a.note}` : '처음부터'))
  }))
  document.getElementById('sv-guide-skills').replaceChildren(...Object.entries(WEAP).map(([id, d]) => tr(named(ICON_URL[id], d.name, 'sv-ico'), h('td', {}, d.note))))
  document.getElementById('sv-guide-breaks').replaceChildren(...Object.entries(BREAK).map(([id, d], i) => h('li', { style: `--i:${i}` },
    h('img', { src: ICON_URL[`${id}+`], alt: '' }), h('div', {}, h('small', {}, `${WEAP[id].name} 돌파`), h('b', {}, d.name), h('span', {}, d.note)))))
  document.getElementById('sv-ring').src = ITEMS.ring.c.toDataURL()
  document.getElementById('sv-guide-items').replaceChildren(...Object.entries(PASS).map(([id, d]) => tr(named(ICON_URL[id], d.name, 'sv-ico'), h('td', {}, `${d.note} (최대 Lv ${d.max})`))))
  guideAchs()
}
let ready = false   // 선수 데이터(이름 · 얼굴)를 읽은 뒤
const guideAchs = () => { if (ready) document.getElementById('sv-guide-achs').replaceChildren(achList()) }

// ---------------------------------------------------------------- 돌리기
let last = 0, ema = 16, slowT = 0, lastMode = ''
function frame(ts) {
  const ms = last ? ts - last : 16
  last = ts
  let dt = Math.min(0.05, ms / 1000)
  tnow += dt
  if (mode === 'play' && G) { if (G.dying > 0) dt *= 0.3; step(dt) }
  else if (!G) cam.x += dt * 24
  if (mode !== lastMode) { lastMode = mode; still = 2 }
  if (mode === 'play' || !G || still-- > 0) render()   // 멈춰 있는 동안(상자 · 일시정지 · 결과)은 다시 그리지 않는다 — 상자 연출(HTML)이 부드럽게
  // 느린 기기 — 판 중에 1.5초 넘게 45fps 밑이면 픽셀 한도를 30%씩 줄인다(50만까지)
  if (mode === 'play' && ms < 100) {
    ema += (ms - ema) * 0.08; slowT = ema > 22 ? slowT + ms / 1000 : 0
    if (slowT > 1.5 && BUDGET > 5e5) { BUDGET *= 0.7; slowT = 0; ema = 16; size() }
  }
  requestAnimationFrame(frame)
}

sprites(); icons()
requestAnimationFrame(frame)
await loadData()
for (const ch of CHARS) {   // 얼굴 그림 → 머리 · 피부색
  const img = new Image()
  img.onload = () => { try { ch.head = cutHead(img); [ch.skin] = skinOf(img) } catch {} }
  img.src = faceOf(P(ch.id))
}
ready = true
guide()
title()
loadRank()
startAuth('', pull)
