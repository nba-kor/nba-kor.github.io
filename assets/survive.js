// 덩크 서바이버(/survive/) — 뱀파이어 서바이버즈류 생존 게임. 몰려오는 수비를 피해 다니기만 하면 스킬은 알아서 나간다(최대 30분).
//   캐릭터 10명 — 덩크 시티 선수, 시작 스킬 · 고유 특성이 다르다(CHARS). 르브론 말고 9명은 업적으로 연다(ACH 의 char).
//   레벨이 오를 때마다 랜덤 상자: 셋 중 하나를 고른다. 가끔 잭팟이 터지면 셋 다(openBox).
//   맵 4개(MAPS) — 스트리트 파크(끝없는 동네) · 아레나(위아래가 관중석) · 네온 루프탑(수비가 단단하다) · 챌린지(시간 제한 없이 기록에 도전).
//   15분부터 변수 기술(EVENTS — 폭격 · 러시)과 중간보스, 20분부터 상태이상 보스(STATUS), 25분부터는 1분마다 다른 보스(PLAN · BOSS) — 서 있기만 하면 못 버틴다.
//   업적 · 기록은 이 브라우저(localStorage)에 두고, 로그인하면 계정(/api/survive)과 합쳐 같이 쓴다 — 다른 기기에서도 이어진다.
// 그림은 2D 캔버스 하나. 사람 · 공 · 아이콘 · 바닥은 처음에 한 번 그려 두고(sprite) 옮겨 그린다. 메뉴 · 상자는 캔버스 위에 겹친 HTML(#sv-ui).
import { mountTop, faceOf } from './app.js?v=fb02b445'
import { api, chooseLogin } from './auth.js?v=01106c22'
import { loadData, P, startAuth, auth, me, h } from './board.js?v=f9551348'
import { cutHead, skinOf, NBA_NUM } from './vipers.js?v=8939ed12'

mountTop('/survive/')

const TAU = Math.PI * 2, rnd = Math.random
const clamp = (v, a, b) => v < a ? a : v > b ? b : v
const fmt = s => `${String(s / 60 | 0).padStart(2, '0')}:${String(s % 60 | 0).padStart(2, '0')}`
const MAX_T = 30 * 60   // 30분 버티면 끝(클리어)
const VIEW = 560        // 화면의 짧은 쪽에 보이는 월드 크기 — 휴대폰을 세워도 눕혀도 둘레가 이만큼은 보인다
const MAX_FOES = 380   // 한 화면 수비 수 한도 — 휴대폰 그리기 비용

// ---------------------------------------------------------------- 표

// 캐릭터 — 덩크 시티 선수 id(얼굴 · 이름은 data/players.json). w = 시작 스킬, c = [유니폼, 보조색], fit = 그 팀 유니폼(side 옆줄 · sock 양말 · shoe 신발 · pin 세로 줄무늬), mod = 고유 특성
const CHARS = [
  { id: 'james', w: 'pass', c: ['#fdb927', '#552583'], fit: { side: '#552583', shoe: '#552583' }, hp: 120, trait: '킹', note: '레벨 10마다 공격력 +10% (최대 +50%)', mod: { king: 1 } },
  { id: 'klfd', w: 'three', c: ['#1d428a', '#ffc72c'], fit: { side: '#ffc72c', shoe: '#f4f4f4' }, hp: 100, trait: '셰프', note: '치명타 확률 +15% · 치명타 피해 2.5배', mod: { crit: 0.15, critX: 0.5 } },
  { id: 'yns', w: 'dunk', c: ['#00471b', '#eee1c6'], fit: { side: '#eee1c6', shoe: '#eee1c6' }, hp: 120, trait: '그릭 프릭', note: '최대 체력 +40% · 이동 속도 +10%', mod: { hp: 0.4, move: 0.1 } },
  { id: 'yjq', w: 'bounce', c: ['#0e2240', '#fec524'], fit: { side: '#8b2131', sock: '#0e2240', shoe: '#fec524' }, hp: 120, trait: '조커', note: '모든 스킬 투사체 +1 · 이동 속도 -10%', mod: { amount: 1, move: -0.1 } },
  { id: 'lkdqq', w: 'fade', c: ['#00538c', '#b8c4ca'], fit: { side: '#002b5e', shoe: '#f4f4f4' }, hp: 110, trait: '매직', note: '잭팟 확률 2배 · 행운 +20%', mod: { jackpot: 1, luck: 0.2 } },
  { id: 'ebd', w: 'block', c: ['#006bb6', '#ed174c'], fit: { side: '#ed174c', shoe: '#002b5c' }, hp: 140, trait: '프로세스', note: '받는 피해 -2 · 초당 체력 0.5 회복', mod: { armor: 2, regen: 0.5 } },
  { id: 'weisblk', w: 'press', c: ['#007ac1', '#ef3b24'], fit: { side: '#002d62', sock: '#002d62', shoe: '#ef3b24' }, hp: 110, trait: '트리플 더블', note: '이동 속도 +25% · 지속 시간 +15%', mod: { move: 0.25, dur: 0.15 } },
  { id: 'wsblk', w: 'alley', c: ['#0c2340', '#c8102e'], fit: { side: '#85714d', sock: '#0c2340', shoe: '#c8102e' }, hp: 130, trait: '헤비 덩커', note: '최대 체력 +20% · 몸에 닿은 수비를 밀쳐 내며 피해', mod: { hp: 0.2, body: 1 } },
  { id: 'durant', w: 'buzzer', c: ['#1d1160', '#e56020'], fit: { side: '#e56020', sock: '#17141f', shoe: '#17141f' }, hp: 100, trait: '이지 머니', note: '범위 +20% · 투사체 속도 +20%', mod: { area: 0.2, speed: 0.2 } },
  { id: 'bl', w: 'nolook', c: ['#00788c', '#1d1160'], fit: { side: '#1d1160', sock: '#00788c', shoe: '#c6f432', pin: 'rgba(29,17,96,.38)' }, hp: 100, trait: '쇼타임', note: '경험치 +25% · 쿨타임 -5%', mod: { growth: 0.25, cdr: 0.05 } },
  { id: 'sga', w: 'euro', c: ['#f4f4f4', '#007ac1'], fit: { side: '#ef3b24', shoe: '#17141f' }, hp: 110, trait: '미드레인지 장인', note: '이동 속도 +15% · 치명타 확률 +10%', mod: { move: 0.15, crit: 0.1 } },
  { id: 'dqq', w: 'rebound', c: ['#5d76a9', '#12173f'], fit: { side: '#12173f', sock: '#12173f', shoe: '#12173f' }, hp: 150, trait: '빅 스티브', note: '최대 체력 +30% · 받는 피해 -1 · 경험치 줍는 거리 +40%', mod: { hp: 0.3, armor: 1, magnet: 0.4 } },
  { id: 'blqz', w: 'steal', c: ['#c8102e', '#1d42ba'], fit: { side: '#1d42ba', shoe: '#1d42ba' }, hp: 110, trait: 'PG-13', note: '보스 · 중간보스 · 정예에게 주는 피해 +30% · 쿨타임 -5%', mod: { bossX: 0.3, cdr: 0.05 } },
  { id: 'kl', w: 'outlet', c: ['#ffc72c', '#1d428a'], fit: { side: '#1d428a', sock: '#1d428a', shoe: '#f4f4f4' }, hp: 100, trait: '37점 쿼터', note: '투사체 속도 +25% · 범위 +10% · 쿨타임 -5%', mod: { speed: 0.25, area: 0.1, cdr: 0.05 } },
  { id: 'dlz', w: 'shotclock', c: ['#ce1141', '#111111'], fit: { side: '#111111', sock: '#111111', shoe: '#ce1141' }, hp: 110, trait: '클러치 킹', note: '체력이 절반 아래면 공격력 +30% · 쿨타임 -5%', mod: { clutch: 0.3, cdr: 0.05 } },
  { id: 'klks', w: 'cross', c: ['#f4f4f4', '#c8102e'], fit: { side: '#1d42ba', shoe: '#c8102e' }, hp: 100, trait: '식스맨', note: '리롤 · 스킵 · 제외를 한 번씩 더 · 이동 속도 +10%', mod: { boxes: 1, move: 0.1 } },
  { id: 'nwsj', w: 'hook', c: ['#002b5e', '#b8c4ca'], fit: { side: '#00538c', shoe: '#00538c' }, hp: 130, trait: '언블로커블', note: '범위 +15% · 치명타 확률 +10%', mod: { area: 0.15, crit: 0.1 } },
  { id: 'bm', w: 'screen', c: ['#111111', '#d4213d'], fit: { side: '#f9a01b', sock: '#111111', shoe: '#d4213d' }, hp: 140, trait: '핸드오프', note: '지속 시간 +25% · 받는 피해 -1', mod: { dur: 0.25, armor: 1 } },
]

// 스킬 — cd 쿨타임(초) · dmg 피해 · n 개수 · area 크기 배수 · spd 속도 배수 · dur 지속(초) · pierce 맞힐 수 있는 수 · bounce 튕김.
// ups[i] = 레벨 i+2 가 될 때 더하는 것(최고 레벨 8)
const WEAP = {
  pass: { name: '체스트 패스', note: '가장 가까운 수비에게 빠른 패스', cd: 1.15, dmg: 10, pierce: 1, ups: [{ n: 1 }, { dmg: 5 }, { cd: -0.2 }, { n: 1 }, { dmg: 5 }, { pierce: 1 }, { dmg: 10 }] },
  three: { name: '3점슛', note: '멀리 있는 수비에게 높이 쏴 떨어진 자리를 스플래시', cd: 2.2, dmg: 22, ups: [{ n: 1 }, { area: 0.2 }, { dmg: 10 }, { n: 1 }, { cd: -0.4 }, { dmg: 12 }, { n: 1, area: 0.2 }] },
  dunk: { name: '덩크', note: '뛰어올라 내리꽂으면 둘레에 충격파 — 밀쳐 낸다', cd: 3.2, dmg: 26, ups: [{ area: 0.15 }, { dmg: 10 }, { cd: -0.5 }, { area: 0.15 }, { dmg: 12 }, { n: 1 }, { dmg: 18, area: 0.15 }] },
  bounce: { name: '바운스 패스', note: '맞으면 옆 수비에게 튕겨 간다', cd: 1.6, dmg: 9, pierce: 1, bounce: 3, ups: [{ bounce: 1 }, { dmg: 4 }, { n: 1 }, { bounce: 2 }, { dmg: 5 }, { cd: -0.3 }, { bounce: 2, dmg: 6 }] },
  block: { name: '블록슛', note: '두 손이 몸 둘레를 돌며 쳐 낸다 — 날아오는 호루라기를 가끔(10%) 막는다', cd: 2.2, dmg: 9, n: 2, dur: 3.2, ups: [{ n: 1 }, { area: 0.15, spd: 0.25 }, { dmg: 3 }, { n: 1 }, { dur: 1 }, { n: 1 }, { dmg: 4, dur: 1 }] },
  press: { name: '풀코트 프레스', note: '둘레의 수비를 계속 압박해 피해를 준다', cd: 0.45, dmg: 4, ups: [{ area: 0.1 }, { dmg: 1 }, { area: 0.1 }, { cd: -0.08 }, { dmg: 2 }, { area: 0.1 }, { dmg: 2 }] },
  alley: { name: '앨리웁', note: '하늘에서 공이 떨어져 그 자리를 내리찍는다', cd: 2.6, dmg: 18, n: 2, ups: [{ n: 1 }, { dmg: 6 }, { area: 0.2 }, { n: 1 }, { cd: -0.5 }, { n: 1 }, { dmg: 12 }] },
  fade: { name: '스텝백 슛', note: '물러서며 꿰뚫는 슛 — 보스 · 정예를 먼저 겨누고 1.4배로 맞힌다(없으면 보는 쪽)', cd: 0.95, dmg: 11, pierce: 2, ups: [{ n: 1 }, { dmg: 6 }, { n: 1 }, { pierce: 2 }, { n: 1 }, { dmg: 8 }, { cd: -0.3 }] },
  cross: { name: '크로스오버', note: '옆으로 길게 휘둘러 베는 드리블', cd: 1.4, dmg: 13, ups: [{ n: 1 }, { dmg: 5 }, { area: 0.15 }, { dmg: 5 }, { cd: -0.3 }, { area: 0.2 }, { dmg: 9 }] },
  nolook: { name: '노룩 패스', note: '던지면 되돌아오는 패스 — 오가며 계속 맞힌다', cd: 1.8, dmg: 10, ups: [{ dmg: 4 }, { n: 1 }, { area: 0.25 }, { dmg: 5 }, { n: 1 }, { spd: 0.3 }, { n: 1 }] },
  hook: { name: '스카이훅', note: '높이 떴다 떨어지는 큰 공 — 여럿을 꿰뚫는다', cd: 1.7, dmg: 18, pierce: 3, ups: [{ n: 1 }, { dmg: 6 }, { area: 0.2 }, { pierce: 2 }, { n: 1 }, { dmg: 8 }, { n: 1 }] },
  buzzer: { name: '버저비터', note: '화면 안 수비에게 번개처럼 꽂힌다', cd: 2.8, dmg: 20, n: 2, ups: [{ n: 1 }, { dmg: 8 }, { area: 0.25 }, { n: 1 }, { cd: -0.5 }, { n: 1 }, { dmg: 14 }] },
  screen: { name: '스크린', note: '근처에 동료가 스크린을 서서 걸린 수비를 묶고 때린다 — 안에 들어온 호루라기도 느리게', cd: 4, dmg: 6, dur: 2.5, ups: [{ n: 1 }, { dmg: 2 }, { dur: 1 }, { area: 0.15 }, { n: 1 }, { dmg: 3 }, { dur: 1, area: 0.15 }] },
  rebound: { name: '리바운드', note: '화면 가장자리에 튕기며 날아다니는 공 — 지나가는 수비를 계속 맞힌다', cd: 3.2, dmg: 11, dur: 3, ups: [{ dmg: 4 }, { n: 1 }, { dur: 1 }, { area: 0.25 }, { n: 1 }, { dmg: 6 }, { dur: 1.5, n: 1 }] },
  euro: { name: '유로스텝', note: '움직이면 지나간 자리에 잔상이 남아 밟은 수비를 때린다 — 서 있으면 안 나간다', cd: 0.2, dmg: 6, dur: 1.4, ups: [{ dmg: 2 }, { area: 0.2 }, { dur: 0.5 }, { dmg: 3 }, { area: 0.2 }, { dur: 0.6 }, { dmg: 5 }] },
  steal: { name: '스틸', note: '가장 강한 수비(보스 · 정예 먼저)의 공을 낚아채는 큰 한 방', cd: 1.9, dmg: 38, ups: [{ dmg: 14 }, { n: 1 }, { cd: -0.3 }, { dmg: 18 }, { n: 1 }, { cd: -0.3 }, { dmg: 30 }] },
  outlet: { name: '아웃렛 패스', note: '화면을 가로지르는 빛줄기 — 줄 위의 수비를 모두 꿰뚫는다', cd: 2.4, dmg: 20, ups: [{ dmg: 7 }, { area: 0.25 }, { n: 1 }, { cd: -0.4 }, { dmg: 9 }, { area: 0.25 }, { n: 1, dmg: 10 }] },
  shotclock: { name: '샷 클락', note: '수비가 가장 많이 몰린 곳에 24초 시계를 띄운다 — 0이 되면 버저와 함께 크게 터진다', cd: 3.2, dmg: 22, ups: [{ dmg: 7 }, { area: 0.15 }, { n: 1 }, { cd: -0.4 }, { dmg: 9 }, { area: 0.15 }, { n: 1, dmg: 10 }] },
}
const GAP = { pass: 0.09, three: 0.18, dunk: 0.36, bounce: 0.12, alley: 0.14, fade: 0.07, cross: 0.14, nolook: 0.16, hook: 0.12, buzzer: 0.1, screen: 0.1, rebound: 0.2, steal: 0.12, outlet: 0.15, shotclock: 0.2 }   // 한 번에 여러 개면 사이 간격
const UP = { n: v => `개수 +${v}`, dmg: v => `피해 +${v}`, cd: v => `쿨타임 ${v}초`, area: v => `범위 +${Math.round(v * 100)}%`, spd: v => `속도 +${Math.round(v * 100)}%`, dur: v => `지속 +${v}초`, pierce: v => `관통 +${v}`, bounce: v => `튕김 +${v}` }
// 돌파 — 최고 레벨(8) 스킬에 한 번씩. 피해는 그대로 두고 쓰는 법이 바뀐다(w.br). 수비가 아주 가끔 떨어뜨리는 챔피언 반지를 주우면 고른다(ringable)
const BREAK = {
  pass: { name: '투핸드 패스', note: '두 공이 나란히 날아간다 — 한 번에 2배' },
  three: { name: '로고 스리', note: '떨어진 자리가 한 번 더, 더 크게 터진다' },
  dunk: { name: '토마호크', note: '내리꽂은 뒤 1.5배 큰 충격파가 한 번 더' },
  bounce: { name: '핀볼 패스', note: '처음 튕길 때 공이 둘로 갈라져 두 수비에게' },
  block: { name: '철벽', note: '두 손이 쉬지 않고 끝없이 돈다' },
  press: { name: '존 프레스', note: '압박하는 범위가 30% 넓어진다' },
  alley: { name: '스카이 워크', note: '하늘에서 떨어지는 공이 2배' },
  fade: { name: '더블 스텝백', note: '등 뒤로도 한 발씩 — 앞뒤를 같이 꿰뚫는다' },
  cross: { name: '앵클 브레이커', note: '양옆을 한 번에 베고, 맞은 수비는 넘어져 잠깐 못 움직인다' },
  nolook: { name: '고스트 패스', note: '돌아온 공을 다른 수비에게 한 번 더 던진다' },
  hook: { name: '드림 셰이크', note: '공이 1.4배 커지고 꿰뚫는 수가 2배' },
  buzzer: { name: '위닝 샷', note: '번개가 옆 수비 둘에게 이어진다' },
  screen: { name: '무빙 스크린', note: '스크린을 선 동료가 나를 따라다닌다' },
  rebound: { name: '풋백', note: '벽에 튕길 때마다 그 자리가 터진다' },
  euro: { name: '유로 갤럽', note: '잔상이 두 배 오래 남고, 밟은 수비를 느리게 한다' },
  steal: { name: '락다운', note: '낚아챈 수비는 5초 동안 받는 피해 +30%' },
  outlet: { name: '터치다운 패스', note: '빛줄기가 세 갈래로 퍼진다' },
  shotclock: { name: '샷 클락 리셋', note: '터진 자리 둘레에 작은 시계 셋이 흩어져 한 번 더 터진다' },
}
// 시너지 — 짝인 두 스킬을 다 가지면 둘 다 세진다(wstat). 스킬마다 짝은 하나
const SYN = [
  ['킥아웃', { pass: { pierce: 1, dmg: 5 }, three: { n: 1 } }],
  ['앨리웁 덩크', { alley: { n: 1 }, dunk: { area: 0.2, dmg: 10 } }],
  ['속공', { rebound: { n: 1 }, outlet: { n: 1 } }],
  ['트랩 수비', { press: { area: 0.2 }, steal: { n: 1 } }],
  ['크로스오버 스텝백', { cross: { area: 0.2, dmg: 5 }, fade: { n: 1 } }],
  ['쇼타임', { bounce: { bounce: 2, dmg: 3 }, nolook: { n: 1 } }],
  ['트윈 타워', { block: { n: 1 }, hook: { n: 1 } }],
  ['픽 앤 롤', { screen: { n: 1, dur: 1 }, euro: { area: 0.25 } }],
  ['클러치 타임', { buzzer: { n: 1 }, shotclock: { area: 0.2 } }],
]
const synOf = id => SYN.find(s => id in s[1])
const mateOf = id => Object.keys(synOf(id)?.[1] || {}).find(k => k !== id)
const synText = ([, u]) => Object.entries(u).map(([id, up]) => `${WEAP[id].name} ${Object.entries(up).map(([k, v]) => UP[k](v)).join(' · ')}`).join(' / ')

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
  big: { r: 18, hp: 52, spd: 47, dmg: 10, xp: 3 },
  mascot: { r: 26, hp: 420, spd: 55, dmg: 16, xp: 25 },   // 정예 — 아이템을 떨어뜨린다
  rusher: { r: 11, hp: 14, spd: 0, dmg: 14, xp: 1 },   // 풀코트 러시 — 줄지어 화면을 가로지른다(느려지지도 밀리지도 않는다)
  // 보스(BOSS) — 피는 시간에 따라 완만하게(spawn), 대신 서 있으면 맞는 기술을 쓴다. 트로피 상자를 떨어뜨린다
  boss: { r: 32, hp: 1300, spd: 66, dmg: 22, xp: 120 },
  shooter: { r: 28, hp: 900, spd: 64, dmg: 16, xp: 100 },
  center: { r: 36, hp: 1400, spd: 50, dmg: 24, xp: 120 },
  coach: { r: 30, hp: 1100, spd: 60, dmg: 18, xp: 120 },
  chief: { r: 30, hp: 1200, spd: 62, dmg: 18, xp: 120 },
  mvp: { r: 36, hp: 2200, spd: 72, dmg: 26, xp: 300 },
}
// line = 나올 때 외치는 말, st = 거는 상태이상(20분부터, 보스마다 1분에 한 번)
const BOSS = {
  boss: { name: '올스타 수비수', line: '막아 보시지!', note: '멈칫(갈 길이 붉게)한 뒤 그 방향으로 돌진 — 옆으로 피하기' },
  shooter: { name: '샤프슈터', line: '스플래시!', note: '거리를 두고 농구공을 부채꼴로 던진다 — 블록슛 손 · 프레스로 못 막는다' },
  center: { name: '골밑 지배자', line: '골밑은 내 거다!', note: '뛰어올라 내 자리에 내려찍는다 — 붉은 원에서 벗어나기' },
  coach: { name: '감독', line: '작전 타임!', note: '슬로우 · 약화 · 약체화 · 봉인을 차례로 건다 · 선수들을 불러 둘레를 에워싼다', st: ['slow', 'weak', 'frail', 'seal'] },
  chief: { name: '수석 심판', line: '테크니컬 파울!', note: '레드카드를 사방으로 뿌린다(손 · 프레스로 못 막는다) · 약체화 · 봉인을 건다', st: ['frail', 'seal'] },
  mvp: { name: 'MVP', line: '이게 MVP다!', note: '돌진 · 농구공 · 내려찍기를 번갈아 쓰고 상태이상도 건다', st: ['slow', 'weak', 'frail', 'seal'] },
}
// 보스가 나오는 때 — [초, 종류, 중간보스면 1]. 25분부터는 1분마다 다른 보스. 챌린지는 30분 뒤로도 1분마다 여럿(spawner)
const PLAN = [[300, 'boss'], [600, 'boss'], [900, 'boss'], [1020, 'shooter', 1], [1140, 'center', 1], [1200, 'coach'], [1320, 'shooter', 1], [1440, 'center', 1],
  [1500, 'shooter'], [1560, 'center'], [1620, 'coach'], [1680, 'chief'], [1740, 'mvp']]
// 상태이상 — 10초. 쿨링 스프레이로 푼다
const STATUS = {
  slow: { name: '슬로우', note: '이동 속도 -40%', col: '#5ab0ff' },
  weak: { name: '약화', note: '주는 피해 -40%', col: '#ff9f43' },
  frail: { name: '약체화', note: '받는 피해 +50%', col: '#ff4d6d' },
  seal: { name: '봉인', note: '주력 스킬(주황 아이콘) 하나를 못 쓴다', col: '#b6f26b' },
}
const ST_T = 10

// 맵 — hp · spd 수비 배수, xp 경험치 배수, wall 위아래 벽(아레나)
const MAPS = [
  { id: 'park', name: '스트리트 파크', note: '노을 진 동네 농구장 — 사방이 끝없이 트였다', hp: 1, spd: 1, xp: 1 },
  { id: 'arena', name: '아레나', note: '마루 코트 — 위아래가 관중석이라 좌우로만 트였다', hp: 1, spd: 1, xp: 1.1, wall: 460 },
  { id: 'roof', name: '네온 루프탑', note: '밤의 옥상 — 수비가 더 단단하고 빠르다 · 경험치 +25%', hp: 1.4, spd: 1.12, xp: 1.25 },
  { id: 'chal', name: '챌린지', note: '시간 제한 없음 — 버틸수록 수비가 세지고 보스가 늘어난다 · 최고 기록에 도전', hp: 1, spd: 1, xp: 1.2, endless: true },
  { id: 'neon', name: '네온 시티', note: '포인트 사냥터 — 자동사냥(공격형 · 수비형)을 켤 수 있다 · 랭킹 · 업적 없음', hp: 1, spd: 1, xp: 1, farm: true },
]
/** 네온 시티(farm)는 다른 세 맵(스트리트 파크 · 아레나 · 네온 루프탑)에서 10분 넘게 버텨야 열린다 — 아직인 맵 목록(다 됐으면 null) */
const farmLock = () => { const left = ['park', 'arena', 'roof'].filter(id => (save.stats[`best_${id}`] || 0) < 600); return left.length ? left : null }

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
  { id: 'jackpot10', name: '행운의 사나이', note: '잭팟 모두 합쳐 10번', stat: 'jackpots', goal: 10, skin: 'ball_lucky' },
  { id: 'boss10', name: '올스타 사냥꾼', note: '보스 모두 합쳐 10마리', stat: 'bosses', goal: 10 },
  { id: 'runs10', name: '개근상', note: '모두 합쳐 10판', stat: 'runs', goal: 10 },
  { id: 'full6', name: '올라운더', note: '한 판에 스킬 6개 채우기' },
  { id: 'max6', name: '완성형', note: '스킬 6개를 모두 최고 레벨로' },
  { id: 'nohit', name: '노 터치', note: '3분 동안 한 번도 안 맞기' },
  { id: 'allchar', name: '드림팀', note: `${CHARS.length}명 모두로 한 판씩` },
  { id: 'surv25', name: '클러치 타임', note: '25분 버티기', char: 'sga' },
  { id: 'mid3', name: '주전 사냥꾼', note: '한 판에 중간보스 3마리 쓰러뜨리기', char: 'dqq' },
  { id: 'chal10', name: '챌린저', note: '챌린지에서 10분 버티기', char: 'blqz' },
  { id: 'break1', name: '한계 돌파', note: '스킬을 처음 돌파하기', char: 'kl' },
  { id: 'break3', name: '돌파의 경지', note: '한 판에 스킬 3개 돌파하기' },
  { id: 'cleanse1', name: '쿨링 다운', note: '쿨링 스프레이로 상태이상 풀기' },
  { id: 'mvp1', name: 'MVP 격파', note: 'MVP 쓰러뜨리기', skin: 'ball_crown' },
  { id: 'bossrush', name: '보스 러시', note: '25분부터 나오는 보스 다섯을 한 판에 모두 쓰러뜨리기' },
  { id: 'chal30', name: '무한의 지배자', note: '챌린지에서 30분 버티기', skin: 'ball_infinity' },
  { id: 'clock8', name: '24초의 지배자', note: '샷 클락을 최고 레벨(8)로', char: 'dlz' },
  { id: 'syn1', name: '케미스트리', note: '시너지 처음 완성하기' },
  { id: 'syn3', name: '드림 케미', note: '한 판에 시너지 3개 완성하기' },
  { id: 'cross8', name: '크로스오버 킹', note: '크로스오버를 최고 레벨(8)로', char: 'klks' },
  { id: 'hook8', name: '스카이훅 마스터', note: '스카이훅을 최고 레벨(8)로', char: 'nwsj' },
  { id: 'screen8', name: '철벽 스크리너', note: '스크린을 최고 레벨(8)로', char: 'bm' },
]
// 스킬 최고 레벨 업적 — 캐릭터를 여는 것(3점슛 · 덩크 · 샷 클락 · 크로스오버 · 스카이훅 · 스크린)도, 모두 그 스킬의 레전드 이펙트를 준다
const LV8 = w => w === 'shotclock' ? 'clock8' : `${w}8`
for (const w of Object.keys(WEAP)) {
  const a = ACH.find(x => x.id === LV8(w))
  if (a) a.skin = `fx_${w}_legend`
  else ACH.push({ id: LV8(w), name: `${WEAP[w].name} 마스터`, note: `${WEAP[w].name} 최고 레벨(8) 찍기`, skin: `fx_${w}_legend` })
}
const SURV = [[300, 'surv5'], [600, 'surv10'], [900, 'surv15'], [1200, 'surv20'], [1500, 'surv25']]

// ---------------------------------------------------------------- 스킨 — 판이 끝날 때 쌓이는 포인트로 사거나(price) 업적으로 받는다(ach)
// kind: fx 스킬 이펙트(스킬마다, 어느 캐릭터든) · ball 드리블하는 공(공용) · fit 옷(공용 — 업적 옷은 그 캐릭터만). tier 1 노멀 · 2 레어 · 3 유니크 · 4 레전더리
const TIER = [null, { name: '노멀', col: '#aab4c3' }, { name: '레어', col: '#4dabf7' }, { name: '유니크', col: '#c77dff' }, { name: '레전더리', col: '#ffb400' }]
const THEME = [null,   // 스킬 이펙트 — 등급마다 한 벌(모든 스킬에). 높을수록 빛 · 꼬리 · 터짐이 화려하다
  { id: 'ice', name: '아이스', c: '#7fe3ff', c2: '#e8fbff', price: 600 },
  { id: 'fire', name: '인페르노', c: '#ff5a1f', c2: '#ffd23f', price: 1500 },
  { id: 'galaxy', name: '갤럭시', c: '#c77dff', c2: '#ffffff', price: 3500 },
  { id: 'legend', name: '레전드', c: '#ffcf3f', c2: '#fff7d6' },   // 레전더리 — 그 스킬을 최고 레벨로(업적)
]
// 업적 옷 — 그 캐릭터로 10분(쉬움)은 그 선수가 다른 팀 · 예전에 입던 유니폼 [이름, 상의, 보조색, fit], 챌린지 60분은 레전더리(검은 옷에 빛나는 팀 색 · 오라)
const LEGACY = {
  james: ['클리블랜드 와인', '#6f263d', '#ffb81c', { side: '#041e42', shoe: '#ffb81c' }],
  klfd: ['워리어스 화이트', '#f4f4f4', '#1d428a', { side: '#ffc72c', shoe: '#1d428a' }],
  yns: ['크림 시티', '#eee1c6', '#00471b', { side: '#0077c0', shoe: '#00471b' }],
  yjq: ['레인보우 클래식', '#f4f4f4', '#418fde', { side: '#fdb927', shoe: '#418fde' }],
  lkdqq: ['레이커스 퍼플', '#552583', '#fdb927', { side: '#fdb927', shoe: '#fdb927' }],
  ebd: ['하드우드 클래식', '#f4f4f4', '#ed174c', { side: '#006bb6', shoe: '#ed174c' }],
  weisblk: ['로키츠 레드', '#ce1141', '#c4ced4', { side: '#111111', shoe: '#ce1141' }],
  wsblk: ['듀크 블루', '#003087', '#f4f4f4', { side: '#f4f4f4', shoe: '#f4f4f4' }],
  durant: ['브루클린 블랙', '#151515', '#f4f4f4', { side: '#f4f4f4', sock: '#151515', shoe: '#f4f4f4' }],
  bl: ['호네츠 퍼플', '#1d1160', '#00a3b4', { side: '#a1a1a4', shoe: '#00a3b4', pin: 'rgba(0,163,180,.35)' }],
  sga: ['캐나다 레드', '#d80621', '#f4f4f4', { side: '#f4f4f4', shoe: '#f4f4f4' }],
  dqq: ['썬더 블루', '#007ac1', '#ef3b24', { side: '#002d62', shoe: '#ef3b24' }],
  blqz: ['페이서스 네이비', '#002d62', '#fdbb30', { side: '#bec0c2', shoe: '#fdbb30' }],
  kl: ['매버릭스 블루', '#00538c', '#b8c4ca', { side: '#002b5e', shoe: '#f4f4f4' }],
  dlz: ['랩터스 퍼플', '#753bbd', '#c8102e', { side: '#111111', shoe: '#753bbd' }],
  klks: ['호크스 레드', '#e03a3e', '#c1d32f', { side: '#26282a', shoe: '#c1d32f' }],
  nwsj: ['독일 대표팀', '#f4f4f4', '#111111', { side: '#dd0000', shoe: '#ffce00' }],
  bm: ['마이애미 바이스', '#151515', '#ff70c4', { side: '#41b6e6', shoe: '#ff70c4' }],
}
/** 레전더리 옷의 빛 — 팀 두 색 중 더 진한(채도 높은) 쪽을 밝게 */
const neonOf = c => { const ch = col => { const v = rgbOf(col); return Math.max(...v) - Math.min(...v) }; return brighten(ch(c.c[0]) >= ch(c.c[1]) ? c.c[0] : c.c[1], 150) }
const SKIN_LIST = [
  ...Object.keys(WEAP).flatMap(w => [1, 2, 3, 4].map(t => ({ id: `fx_${w}_${THEME[t].id}`, kind: 'fx', w, tier: t, name: `${WEAP[w].name} ${THEME[t].name}`, price: THEME[t].price, ach: t === 4 ? LV8(w) : undefined }))),
  { id: 'ball_soccer', kind: 'ball', tier: 1, name: '축구공', price: 500 },
  { id: 'ball_beach', kind: 'ball', tier: 1, name: '비치볼', price: 700 },
  { id: 'ball_gold', kind: 'ball', tier: 2, name: '황금 농구공', price: 1800, glow: 'gold' },
  { id: 'ball_fire', kind: 'ball', tier: 3, name: '불꽃 농구공', price: 5000, glow: 'fire' },
  { id: 'ball_galaxy', kind: 'ball', tier: 3, name: '갤럭시 볼', price: 5500, glow: 'galaxy' },
  { id: 'ball_storm', kind: 'ball', tier: 3, name: '번개 공', price: 5500, glow: 'storm' },
  { id: 'ball_lucky', kind: 'ball', tier: 3, name: '행운의 공', ach: 'jackpot10', glow: 'lucky' },
  { id: 'ball_crown', kind: 'ball', tier: 3, name: '왕관 공', ach: 'mvp1', glow: 'crown' },
  { id: 'ball_infinity', kind: 'ball', tier: 4, name: '무한의 공', ach: 'chal30', glow: 'rainbow' },
  { id: 'ball_cat', kind: 'ball', tier: 3, name: '고양이', price: 4000, pet: 1 },
  { id: 'ball_dog', kind: 'ball', tier: 3, name: '강아지', price: 4000, pet: 1 },
  { id: 'ball_panda', kind: 'ball', tier: 3, name: '판다', price: 4500, pet: 1 },
  { id: 'fit_practice', kind: 'fit', tier: 1, name: '연습복', price: 800, look: { jersey: '#eef0f3', trim: '#3a3f4a', shorts: '#4a505c', side: '#3a3f4a', shoe: '#2a2f3a', tee: 1 } },
  { id: 'fit_hoodie', kind: 'fit', tier: 1, name: '후드티', price: 900, look: { jersey: '#6b7280', trim: '#e5e7eb', shorts: '#1f2937', side: '#e5e7eb', sock: '#1f2937', shoe: '#f4f4f4', tee: 1, hood: 1 } },
  { id: 'fit_retro', kind: 'fit', tier: 1, name: '레트로 유니폼', price: 900, look: { jersey: '#f3e3b0', trim: '#c0392b', shorts: '#f3e3b0', side: '#2b59c3', shoe: '#f4f4f4', bands: 1 } },
  { id: 'fit_allstar', kind: 'fit', tier: 2, name: '올스타 유니폼', price: 2200, look: { jersey: '#1d4ed8', trim: '#ffffff', shorts: '#1d4ed8', side: '#e63946', shoe: '#e63946', star: 1 } },
  { id: 'fit_xmas', kind: 'fit', tier: 2, name: '크리스마스 유니폼', price: 2200, look: { jersey: '#c8102e', trim: '#ffffff', shorts: '#0b6623', side: '#ffffff', shoe: '#0b6623', bands: 1 } },
  { id: 'fit_gold', kind: 'fit', tier: 2, name: '골드 유니폼', price: 2600, look: { jersey: '#e6b422', trim: '#5a3a00', shorts: '#e6b422', side: '#5a3a00', shoe: '#e6b422', shine: 1 } },
  { id: 'fit_flame', kind: 'fit', tier: 3, name: '불꽃 유니폼', price: 6000, look: { jersey: '#1c1414', trim: '#ff6a00', shorts: '#1c1414', side: '#ff3d00', sock: '#1c1414', shoe: '#ff6a00' }, aura: ['flame', '#ff6a00', '#ffd23f'] },
  { id: 'fit_angel', kind: 'fit', tier: 3, name: '천상의 유니폼', price: 6500, look: { jersey: '#ffffff', trim: '#e9b23a', shorts: '#ffffff', side: '#e9b23a', shoe: '#ffffff', shine: 1 }, aura: ['halo', '#ffd23f', '#fff6c8'] },
  { id: 'fit_storm', kind: 'fit', tier: 3, name: '번개 유니폼', price: 6500, look: { jersey: '#1b2a6b', trim: '#7ff3ff', shorts: '#1b2a6b', side: '#7ff3ff', sock: '#1b2a6b', shoe: '#7ff3ff' }, aura: ['storm', '#7ff3ff', '#ffffff'] },
  ...CHARS.flatMap(c => { const [name, j, t, fit] = LEGACY[c.id], neon = neonOf(c); return [
    { id: `fit_${c.id}_x`, kind: 'fit', tier: 2, char: c.id, ach: `ez_${c.id}`, name, look: { jersey: j, trim: t, shorts: j, ...fit } },
    { id: `fit_${c.id}_l`, kind: 'fit', tier: 4, char: c.id, ach: `leg_${c.id}`, name: `${c.trait} 레전드`, look: { jersey: '#0d0f16', trim: neon, shorts: '#0d0f16', side: neon, sock: '#0d0f16', shoe: neon, shine: 1 }, aura: ['legend', neon, '#fff3c4'] }] }),
]
const SKIN = Object.fromEntries(SKIN_LIST.map(k => [k.id, k]))
for (const c of CHARS) ACH.push(   // 업적 스킨 — 캐릭터마다 쉬운 것 하나 · 레전더리 하나
  { id: `ez_${c.id}`, get name() { return `${P(c.id).short || nameOf(c)}의 클래식` }, get note() { return `${nameOf(c)} 캐릭터로 10분 버티기` }, skin: `fit_${c.id}_x` },
  { id: `leg_${c.id}`, get name() { return `${P(c.id).short || nameOf(c)} 레전드` }, get note() { return `${nameOf(c)} 캐릭터로 챌린지 60분 버티기` }, skin: `fit_${c.id}_l` })

const nameOf = c => P(c.id).name
const lockOf = c => { const a = ACH.find(x => x.char === c.id); return a && !save.ach[a.id] ? a : null }
// ---- 포인트 · 가진 스킨 · 입은 스킨. 산 스킨은 업적 저장에 own_스킨 = 낸 값(계정과 합칠 때 둘 다 남는다), 포인트 = 쌓인 것(stats.pts) - 낸 값 합
const owns = k => !!(k.ach ? save.ach[k.ach] : save.ach[`own_${k.id}`])
const points = () => (save.stats.pts || 0) - Object.entries(save.ach).reduce((n, [k, v]) => k.startsWith('own_') ? n + v : n, 0)
function buy(k) {
  if (owns(k) || k.ach || points() < k.price) return false
  save.ach[`own_${k.id}`] = k.price; persist(true)
  if (auth === 'in') api('/survive/buy', { method: 'POST', body: { skin: k.id, price: k.price }, withToken: true }).then(() => loadRank(), () => {})   // 구매 내역(리더보드)
  return true
}
/** 한 판의 포인트 — 처치 · 레벨 · 버틴 시간에 비례(30분 생존은 1.5배) */
function runPts(win) { const p = { kills: G.kills / 150 | 0, lvl: G.lvl * 2, time: G.t / 6 | 0 }; return { ...p, total: Math.round((p.kills + p.lvl + p.time) * (win ? 1.5 : 1)) } }
// 입은 스킨 — 옷 · 공은 캐릭터마다, 이펙트는 스킬마다(이 브라우저에 — 내 정보 페이지와 같이 쓴다). 가진 것만, 업적 옷은 그 캐릭터만
const EQ = 'survive.equip', equip = { fit: {}, ball: {}, fx: {} }
try { const v = JSON.parse(localStorage.getItem(EQ)); for (const k in equip) if (v?.[k] && typeof v[k] === 'object') Object.assign(equip[k], v[k]) } catch {}
const worn = (k, key) => { const x = SKIN[equip[k][key]]; return x && owns(x) && (!x.char || x.char === key) ? x : null }
function wearSkin(k, key, id) { if (id) equip[k][key] = id; else delete equip[k][key]; try { localStorage.setItem(EQ, JSON.stringify(equip)) } catch {} }

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
  if (run && Date.now() - run.at < 2 * 3600_000) submit({ map: run.map, hero: run.hero, secs: run.secs, kills: run.kills, lvl: run.lvl, skills: run.skills }).then(msg => msg && notice(msg))
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
/** 아주 어두우면 밝기를 min 까지 올린다 — 팔다리 피부(어두운 바닥 · 테두리에 손발이 묻히지 않게) · 레전더리 옷의 빛 */
function brighten(col, min = 96) { const [r, g, b] = rgbOf(col), l = 0.3 * r + 0.59 * g + 0.11 * b; return l >= min ? col : shade(col, min / Math.max(l, 8)) }
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function hash(i, j, s) { let x = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041) | 0; x = Math.imul(x ^ x >>> 13, 1274126177); return ((x ^ x >>> 16) >>> 0) / 4294967296 }

const HEAD_K = 0.86   // 선수 얼굴 그림 크기(예전 22.4 × 23.8 에 곱한다)
/** 얼굴 그림의 턱 — 맨 아래 불투명 줄(b, 높이 비율)과 그 위 턱 둘레의 가운데(f, 너비 비율). 비스듬히 본 얼굴도 턱이 몸의 목 위에 오게 */
function chinOf(head) {
  const W = head.width, H = head.height, d = head.getContext('2d').getImageData(0, 0, W, H).data, on = (x, y) => d[(y * W + x) * 4 + 3] > 128
  let last = H - 1
  while (last > 0 && ![...Array(W).keys()].some(x => on(x, last))) last--
  let sx = 0, n = 0
  for (let y = Math.max(0, last - 20); y <= last; y++) for (let x = 0; x < W; x++) if (on(x, y)) { sx += x; n++ }
  return { f: n ? sx / n / W : 0.5, b: (last + 1) / H }
}
/** 사람 — 발밑 (0,0), 오른쪽을 본다(키 약 52). o = { jersey, trim, shorts, skin, hair, hs 머리 모양, shoe, frame 0~3, wide, kind, num, mirror, head(얼굴 그림) }
 *  걸음 네 칸 — 0 · 2 는 두 발을 벌리고 1 · 3 은 뒷발을 들어 앞으로(몸이 살짝 뜬다). 앞(오른쪽) 팔다리는 밝게, 뒤는 어둡게 */
function person(c, o) {
  const k = o.kind, wd = o.wide || 1, sk = brighten(o.skin), skD = shade(sk, 0.76), f = o.frame || 0, sock = o.sock || '#f5f5f5', side = o.side || o.trim
  const sw = [1, 0, -1, 0][f], bob = f % 2 ? -1.1 : 0
  const leg = (x, dx, up, front) => {
    rr(c, x + dx - 2.1, -12.5 - up, 4.3, 10.5, 2.1, front ? sk : skD)
    rr(c, x + dx - 2.2, -6 - up, 4.5, 3.4, 1.1, front ? sock : shade(sock, 0.84))
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
  if (o.bands) { rr(c, -7.2 * wd, -12, 14.4 * wd, 1.2, 0, o.trim); rr(c, -7.2 * wd, -10.4, 14.4 * wd, 0.9, 0, side) }   // 레트로 — 반바지 끝 두 줄
  rr(c, 4.6 * wd, -17, 1.7, 7.6, 0.8, side)
  // 몸통(민소매)
  const j = o.jersey, tg = c.createLinearGradient(-7 * wd, -30, 7 * wd, -16)
  tg.addColorStop(0, shade(j, 1.16)); tg.addColorStop(0.55, j); tg.addColorStop(1, shade(j, 0.76))
  c.fillStyle = tg; c.beginPath(); c.roundRect(-7.5 * wd, -30.2, 15 * wd, 13.8, [4.4, 4.4, 2.4, 2.4]); c.fill()
  if (o.shine) {   // 광택 — 비스듬한 빛줄기
    c.save(); c.clip(); c.fillStyle = 'rgba(255,255,255,.38)'; c.beginPath(); c.moveTo(-5 * wd, -31); c.lineTo(-1.6 * wd, -31); c.lineTo(-6.4 * wd, -16); c.lineTo(-9.8 * wd, -16); c.fill(); c.restore()
  }
  if (o.bands) rr(c, -7.5 * wd, -18.2, 15 * wd, 1.1, 0, o.trim)
  if (k === 'ref') {   // 심판 — 검정 세로 줄무늬
    c.save(); c.beginPath(); c.roundRect(-7.5 * wd, -30.2, 15 * wd, 13.8, [4.4, 4.4, 2.4, 2.4]); c.clip()
    for (let x = -7.5 * wd + 1.6; x < 7.5 * wd; x += 3.8) rr(c, x, -31, 1.9, 16, 0, '#17191f')
    c.restore()
  } else {
    if (o.pin) {   // 세로 줄무늬(호네츠) — 상의 · 반바지
      c.save(); c.beginPath(); c.roundRect(-7.5 * wd, -30.2, 15 * wd, 13.8, [4.4, 4.4, 2.4, 2.4]); c.roundRect(-7.2 * wd, -18.6, 14.4 * wd, 9.4, [2, 2, 2.8, 2.8]); c.clip()
      for (let x = -7 * wd; x < 7.5 * wd; x += 2.6) rr(c, x, -31, 0.7, 22, 0, o.pin)
      c.restore()
    }
    rr(c, 5.5 * wd, -26.5, 1.8, 10, 0.9, side)   // 옆 판
    c.strokeStyle = o.trim; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-3.6, -30); c.lineTo(0.4, -25.4); c.lineTo(4.4, -30); c.stroke()
  }
  if (o.hood) { ell(c, 0.6, -31.2, 8, 3.4, shade(o.jersey, 0.8)); rr(c, -1.8, -29.6, 0.8, 4.6, 0.4, o.trim); rr(c, 2.6, -29.6, 0.8, 4.6, 0.4, o.trim) }   // 후드 — 목 뒤에 모자, 끈 둘
  else { c.fillStyle = sk; c.beginPath(); c.moveTo(-3, -30.2); c.lineTo(3.8, -30.2); c.lineTo(0.4, -26.2); c.closePath(); c.fill() }
  ell(c, 0.6, -29.8, 6.2, 1.6, 'rgba(0,0,0,.22)')   // 턱 그늘
  if (o.extra === 'tie') { c.fillStyle = '#f4f4f4'; c.beginPath(); c.moveTo(-3.4, -30.2); c.lineTo(4.2, -30.2); c.lineTo(0.4, -22); c.closePath(); c.fill(); rr(c, -0.7, -29.6, 2.2, 9, 0.8, '#d6323a') }   // 감독 — 셔츠 · 넥타이
  else if (k === 'boss') star(c, 0.6, -22.4, 4.6, o.trim)
  else if (o.num != null) {   // 번호 — 왼쪽을 볼 때(mirror)도 바로
    c.save(); if (o.mirror) c.scale(-1, 1)
    c.font = '900 6.6px system-ui, sans-serif'; c.textAlign = 'center'; c.lineJoin = 'round'; c.lineWidth = 1.3; c.strokeStyle = shade(j, 0.55)
    const x = o.mirror ? -0.6 : 0.6; c.strokeText(String(o.num), x, -18.6); c.fillStyle = o.trim; c.fillText(String(o.num), x, -18.6)
    c.restore()
  }
  if (o.star) { star(c, -4.4 * wd, -27, 1.9, o.trim); star(c, -3.6 * wd, -12.6, 1.7, side) }   // 올스타 — 가슴 · 반바지에 별
  const up = k === 'fan' || k === 'screen'   // 팬(폼 손가락) · 스크린 서는 동료는 앞 손을 머리 위로 — 머리 다음에 그린다
  if (!up) arm(c, o, 6.2 * wd, -sw * 0.55, sk, true)
  if (o.extra === 'ball') ballAt(c, 8.6 * wd, -15.4, 4.8)   // 샤프슈터 — 손에 공
  if (o.extra === 'card') { c.save(); c.translate(8.6 * wd, -17); c.rotate(0.25); rr(c, -2.6, -4, 5.2, 7.4, 0.8, '#e63946'); c.restore() }   // 수석 심판 — 레드카드
  if (o.head) {   // 선수 얼굴 그림(cutHead) — 거의 다 왼쪽을 보고 있어서 뒤집어 몸과 같은 쪽을 보게. 조금 작게, 턱(o.chin)이 목 위에 오게
    const w = 22.4 * HEAD_K, hh = 23.8 * HEAD_K, a = o.chin || { f: 0.5, b: 0.9 }
    rr(c, -2.4, -33.6, 4.8, 5, 1.6, skD); c.save(); c.scale(-1, 1); c.drawImage(o.head, -0.3 - a.f * w, -29.4 - a.b * hh, w, hh); c.restore()
  }   // 선수 얼굴 그림(cutHead) — 거의 다 왼쪽을 보고 있어서 뒤집어 몸과 같은 쪽을 보게
  else face(c, o)
  if (o.extra === 'crown') { c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(-6.4, -48); c.lineTo(-7.4, -56); c.lineTo(-3.4, -52.4); c.lineTo(0.6, -58); c.lineTo(4.6, -52.4); c.lineTo(8.6, -56); c.lineTo(7.6, -48); c.closePath(); c.fill(); ell(c, 0.6, -51.4, 1.3, 1.3, '#e63946') }   // MVP — 왕관
  if (up) arm(c, o, 6.2 * wd, Math.PI + (k === 'fan' ? 0.35 : 0.15), sk, true)
  c.restore()
}
/** 팔 — 어깨(x, -27.6)에서 ang 만큼 돈다(0 = 아래로, π = 위로). 손 · 손목 밴드 · 팬의 폼 손가락 */
function arm(c, o, x, ang, col, front) {
  const w = 3.8 * Math.min(1.25, o.wide || 1)
  c.save(); c.translate(x, -27.6); c.rotate(ang)
  rr(c, -w / 2, -1.2, w, 12.6, w / 2, col)
  ell(c, 0, 12, 2.4, 2.4, col)
  if (o.tee) rr(c, -w / 2 - 0.7, -1.8, w + 1.4, 5.6, 1.8, front ? o.jersey : shade(o.jersey, 0.8))   // 반소매
  if (front && (o.kind === 'me' || o.kind === 'boss')) rr(c, -w / 2 - 0.2, 7.6, w + 0.4, 1.9, 0.6, o.kind === 'boss' ? '#ffd23f' : o.trim)
  if (front && o.kind === 'fan') { rr(c, -3.4, 10, 6.8, 8.6, 2.4, '#ffd23f'); rr(c, -1.3, 16.4, 2.6, 7, 1.3, '#ffd23f'); txt(c, '#1', 0, 16.4, 3.4, '#1a1200') }
  c.restore()
}
/** 그린 얼굴(수비) — 머리 모양 hs: 0 짧은 머리 · 1 아프로 · 2 하이 탑 · 3 민머리 · 4 콘로우 */
function face(c, o) {
  const sk = brighten(o.skin), k = o.kind, hc = o.hair, hs = o.hs || 0
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
function ballPaint(c, r, gold = false, pal = gold ? ['#fff6c8', '#d99a1f', '#5a3500'] : ['#ffb35e', '#d4600f', '#3a1a05']) {   // gold — 돌파한 스킬의 금빛 공, pal — [밝은 · 어두운 · 줄] 공 스킨
  const g = c.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r); g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1])
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill()
  c.strokeStyle = pal[2]; c.lineWidth = r * 0.13
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
  rusher: [{ jersey: '#ff3f6c', trim: '#ffd23f', kind: 'fan' }, { jersey: '#ff7a1a', trim: '#fff', kind: 'fan' }],
  shooter: [{ jersey: '#1d428a', trim: '#ffc72c', wide: 1.1, kind: 'boss', extra: 'ball' }],
  center: [{ jersey: '#2d2f36', trim: '#e04848', wide: 1.45, kind: 'boss' }],
  coach: [{ jersey: '#2b2f3a', trim: '#f4f4f4', shorts: '#2b2f3a', wide: 1.15, kind: 'boss', extra: 'tie' }],
  chief: [{ jersey: '#f4f4f4', trim: '#16181d', shorts: '#16181d', hair: '#16181d', hs: 0, wide: 1.2, kind: 'ref', extra: 'card' }],
  mvp: [{ jersey: '#ffd23f', trim: '#7b3fbf', wide: 1.3, kind: 'boss', extra: 'crown' }],
}
const pickOf = a => a[rnd() * a.length | 0]
let SPR = null, BALL, BIG, HAND, BALLG, BIGG, HANDG, BALLSK, TB, TH, GEMS, ITEMS, WHISTLE, CARD, K = 2   // K = 사람 그림의 단위당 픽셀 — 화면 배율에 맞춰 판마다(작게 그려 두고 키우면 흐리고, 크게 그려 두고 줄이면 느리다)
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
  BALLSK = { ball_soccer: sprite(20, 20, 10, 10, c => soccer(c, 7.5), K * 1.3), ball_beach: sprite(20, 20, 10, 10, c => beach(c, 7.5), K * 1.3), ball_gold: BALLG,
    ...Object.fromEntries(['fire', 'galaxy', 'storm', 'lucky', 'crown', 'rainbow'].map(k => [`ball_${{ rainbow: 'infinity' }[k] || k}`, sprite(20, 28, 10, 18, c => glowBall(c, 7.5, k), K * 1.3)])),
    ball_cat: sprite(28, 26, 14, 14, c => pet(c, 'cat'), K * 1.3), ball_dog: sprite(28, 26, 14, 14, c => pet(c, 'dog'), K * 1.3), ball_panda: sprite(28, 26, 14, 14, c => pet(c, 'panda'), K * 1.3) }
  const tinted = (sp, col) => { const t = mk(sp.c.width, sp.c.height), x = t.getContext('2d'); x.drawImage(sp.c, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = rgba(col, 0.55); x.fillRect(0, 0, t.width, t.height); return { ...sp, c: t } }
  TB = THEME.map(th => th && [tinted(BALL, th.c), tinted(BIG, th.c)])   // 스킬 이펙트 스킨 — 그 색으로 물든 공
  const hand = (s, band) => c => {
    ell(c, 0, 3, 7.4, 8, s)
    for (let i = 0; i < 4; i++) rr(c, -7 + i * 3.6, -12 + Math.abs(i - 1.5) * 1.6, 3.1, 11, 1.5, s)
    rr(c, 5.2, -1, 7.5, 3.4, 1.7, s); rr(c, -6, 9.5, 12, 3.5, 1, band)
  }
  HAND = sprite(28, 34, 14, 17, hand('#f7d6b5', '#d6323a'), K * 1.2)
  HANDG = sprite(28, 34, 14, 17, hand('#ffe08a', '#7b3fbf'), K * 1.2, '#2a1245')   // 돌파 — 금빛 장갑
  TH = THEME.map(th => th && sprite(28, 34, 14, 17, hand(th.c, th.c2), K * 1.2))   // 블록슛 · 스틸 손 — 이펙트 스킨 색 장갑
  GEMS = [['#5ab0ff', '#1d5fd1'], ['#62e38a', '#14924a'], ['#ff6b6b', '#c0262d']].map(([a, b], i) => sprite(16, 22, 8, 11, c => {
    const s = 1 + i * 0.25; c.scale(s, s)
    const g = c.createLinearGradient(-4, -6, 4, 6); g.addColorStop(0, a); g.addColorStop(1, b)
    c.fillStyle = g; c.beginPath(); c.moveTo(0, -7); c.lineTo(4.6, 0); c.lineTo(0, 7); c.lineTo(-4.6, 0); c.closePath(); c.fill()
    c.fillStyle = '#ffffffaa'; c.beginPath(); c.moveTo(0, -5.5); c.lineTo(2.2, -0.5); c.lineTo(0, 0.6); c.closePath(); c.fill()
  }, K * 1.2))
  ITEMS = Object.fromEntries(Object.entries(ITEM_ART).map(([k, f]) => [k, sprite(30, 30, 15, 15, f, K * 1.2)]))
  WHISTLE = sprite(20, 14, 10, 7, c => { c.scale(0.7, 0.7); ITEM_ART.whistle(c) }, K * 1.2)
  CARD = sprite(14, 18, 7, 9, c => { rr(c, -4.5, -6.5, 9, 13, 1.2, '#e63946'); rr(c, -3, -5, 6, 3, 0.6, '#ff8a92') }, K * 1.2)
}
// 줍는 것 — 드링크(회복) · 호루라기(경험치를 다 끌어온다) · 타임아웃(수비가 멈춘다) · 버저(화면 안 수비를 쓸어 낸다) · 트로피 상자(보스)
const ITEM_ART = {
  drink: c => { rr(c, -5, -9, 10, 18, 3, '#2ec4ff'); rr(c, -2.6, -12.5, 5.2, 4, 1, '#f4f4f4'); rr(c, -5, -3.5, 10, 6, 0, '#ff8a00'); rr(c, -3.6, -7.5, 1.6, 12, 0.8, '#ffffff88') },
  whistle: c => { rr(c, -10, -2.6, 9, 5.2, 1.6, '#aab4c3'); ell(c, 2, 0, 7, 5.4, '#d3dbe6'); ell(c, 3, -1.2, 2, 2, '#3a4048'); c.strokeStyle = '#ffd23f'; c.lineWidth = 1.4; c.beginPath(); c.arc(8.4, 2.4, 3, 0, TAU); c.stroke() },
  clock: c => { ell(c, 0, 0, 10, 10, '#3a7bd5'); ell(c, 0, 0, 7.6, 7.6, '#fff'); c.strokeStyle = '#16181d'; c.lineWidth = 1.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -5.5); c.moveTo(0, 0); c.lineTo(3.6, 1.6); c.stroke(); rr(c, -2, -13, 4, 3, 1, '#3a7bd5') },
  buzzer: c => { ell(c, 0, 4, 11, 5, '#4b4f58'); rr(c, -11, 0, 22, 4, 1, '#4b4f58'); ell(c, 0, 0, 8, 6, '#e63946'); ell(c, -2.4, -2, 3, 1.8, '#ffffff88') },
  chest: c => { rr(c, -11, -5, 22, 13, 2, '#c98a1f'); rr(c, -11, -11, 22, 7, 3, '#f2c14e'); rr(c, -11, -1, 22, 2, 0, '#7a4b12'); rr(c, -2.4, -4, 4.8, 5, 1, '#7a4b12'); star(c, 0, -7.6, 2.6, '#fff6c8') },
  spray: c => {   // 쿨링 스프레이 — 상태이상 해제
    rr(c, -5.5, -8, 11, 18, 3, '#3fa9f5'); rr(c, -5.5, -2, 11, 5, 0, '#e9f6ff'); rr(c, -3, -12.5, 6, 5, 1.4, '#f4f4f4'); rr(c, 2, -12, 5, 2.4, 1, '#cfd5de')
    for (const [x, y, r] of [[10, -12, 1.6], [13, -9, 1.2], [12.5, -14.5, 1.1]]) ell(c, x, y, r, r, '#bfe9ff')
    rr(c, -3.8, -6.5, 1.6, 13, 0.8, '#ffffff66')
  },
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
  rebound: c => { rr(c, 18, -26, 6, 52, 2, '#cfd5de'); c.strokeStyle = '#7ff3ff'; c.lineWidth = 3; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(-24, -20); c.lineTo(16, 0); c.lineTo(-20, 22); c.stroke(); c.setLineDash([]); ballAt(c, -16, 16, 10) },
  euro: c => { for (const [x, a] of [[-18, 0.3], [-6, 0.55]]) { c.globalAlpha = a; ell(c, x, -2, 9, 15, '#7ff3ff') } c.globalAlpha = 1; ell(c, 8, -2, 9, 15, '#fff'); ballAt(c, 16, 14, 7) },
  steal: c => { c.save(); c.rotate(-0.5); blit(c, HAND, -6, 4, 1.25); c.restore(); ballAt(c, 14, -12, 10); lines(c, [[-26, 18, -16, 10], [-28, 6, -18, 2]], '#ffd23f', 3) },
  shotclock: c => { rr(c, -25, -19, 50, 34, 7, '#14171d'); rr(c, -21, -15, 42, 26, 4, '#2a0d10'); txt(c, '24', 0, 7, 22, '#ff3b3b'); rr(c, -4, 15, 8, 9, 2, '#5a6270') },
  outlet: c => { const g = c.createLinearGradient(-30, 0, 30, 0); g.addColorStop(0, '#7ff3ff00'); g.addColorStop(1, '#ffffff'); c.fillStyle = g; c.beginPath(); c.moveTo(-30, -4); c.lineTo(22, -9); c.lineTo(22, 9); c.lineTo(-30, 4); c.closePath(); c.fill(); ballAt(c, 18, 0, 11) },
  drink: c => { c.scale(2, 2); ITEM_ART.drink(c) },
  cheer: c => { c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(-20, -8); c.lineTo(8, -20); c.lineTo(8, 20); c.lineTo(-20, 8); c.closePath(); c.fill(); rr(c, -24, -8, 6, 16, 2, '#e4572e'); lines(c, [[14, -12, 22, -18], [16, 0, 26, 0], [14, 12, 22, 18]], '#fff', 3) },
}
// 공 스킨 — 축구공 · 비치볼 · 동물(고양이 · 강아지 · 판다, 오른쪽을 본다)
function soccer(c, r) {
  ell(c, 0, 0, r, r, '#f4f4f4')
  c.save(); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.clip(); c.fillStyle = '#1c1f26'
  const pent = (x, y, q, a0) => { c.beginPath(); for (let i = 0; i < 5; i++) { const a = a0 + i * TAU / 5; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q) } c.fill() }
  pent(0, 0, r * 0.38, -Math.PI / 2)
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + Math.PI / 5 + i * TAU / 5; pent(Math.cos(a) * r, Math.sin(a) * r, r * 0.34, a) }
  c.restore(); ell(c, -r * 0.35, -r * 0.42, r * 0.28, r * 0.2, 'rgba(255,255,255,.55)')
}
/** 빛나는 공 스킨 그림 — 불꽃 · 갤럭시 · 번개 · 행운(클로버) · 왕관 · 무한(무지개) */
function glowBall(c, r, k) {
  if (k === 'rainbow') { const g = c.createConicGradient(0, 0, 0); HUES.forEach((h, i) => g.addColorStop(i / 12, h)); g.addColorStop(1, HUES[0]); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); ballPaint(c, r, false, ['rgba(255,255,255,.5)', 'rgba(255,255,255,0)', '#ffffff']) }
  else ballPaint(c, r, false, { fire: ['#ffe27a', '#d42a00', '#4a0a00'], galaxy: ['#a678ff', '#1a0840', '#e6d6ff'], storm: ['#8fe8ff', '#1b2a6b', '#e9fbff'], lucky: ['#a8f0b8', '#1f8a43', '#0b3d1c'], crown: ['#fff6c8', '#d99a1f', '#5a3500'] }[k])
  if (k === 'galaxy') for (const [x, y] of [[-3, -2], [2.6, 3], [3.4, -3.6], [-1.6, 4], [0.8, -4.6]]) ell(c, x, y, 0.55, 0.55, '#fff')
  if (k === 'lucky') { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ell(c, Math.cos(a) * 1.9, Math.sin(a) * 1.9, 1.8, 1.8, '#f4fff6') } rr(c, -0.35, 1.5, 0.7, 3, 0.3, '#f4fff6') }
  if (k === 'crown') { c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(-5, -r + 1); c.lineTo(-5.6, -r - 5); c.lineTo(-2.4, -r - 2.4); c.lineTo(0, -r - 6.4); c.lineTo(2.4, -r - 2.4); c.lineTo(5.6, -r - 5); c.lineTo(5, -r + 1); c.fill(); ell(c, 0, -r - 2, 0.9, 0.9, '#e63946') }
}
function beach(c, r) {
  ['#e63946', '#ffd23f', '#2b8cff', '#f4f4f4', '#3ccf6e', '#ff8c1a'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, i * TAU / 6, (i + 1) * TAU / 6); c.fill() })
  ell(c, 0, 0, r * 0.22, r * 0.22, '#f4f4f4'); ell(c, -r * 0.38, -r * 0.42, r * 0.26, r * 0.18, 'rgba(255,255,255,.6)')
}
function pet(c, k) {
  const body = { cat: '#f2a03d', dog: '#e6c592', panda: '#f6f6f2' }[k], dark = { cat: '#c46f17', dog: '#8a5a2b', panda: '#1d1d22' }[k]
  if (k === 'cat') { c.strokeStyle = body; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.arc(-8.6, 2, 4.4, Math.PI * 0.5, Math.PI * 1.5); c.stroke() }   // 꼬리
  ell(c, 0, 0, 9.6, 8.8, body)
  if (k === 'cat') for (const s of [-1, 1]) { c.fillStyle = body; c.beginPath(); c.moveTo(s * 3 + 1, -7); c.lineTo(s * 7.6 + 1, -12.6); c.lineTo(s * 8.6 + 1, -4.6); c.fill(); c.fillStyle = '#ffb3c6'; c.beginPath(); c.moveTo(s * 5 + 1, -7.4); c.lineTo(s * 7.4 + 1, -10.6); c.lineTo(s * 7.8 + 1, -6.4); c.fill() }
  if (k === 'dog') for (const s of [-1, 1]) ell(c, s * 8 + 1, -2, 2.8, 5.4, dark)
  if (k === 'panda') { for (const s of [-1, 1]) ell(c, s * 6.4 + 1, -7.4, 3, 3, dark); for (const s of [-1, 1]) ell(c, s * 3.2 + 2.4, -1.4, 2.4, 3, dark) }
  if (k === 'cat') for (const x of [-1.4, 1.2, 3.8]) rr(c, x, -8.6, 1.1, 3, 0.5, dark)   // 이마 줄무늬
  for (const s of [-1, 1]) { ell(c, s * 3.2 + 2.4, -1.4, 1.3, 1.5, k === 'panda' ? '#fff' : '#1d1d22'); ell(c, s * 3.2 + 2.8, -1.9, 0.45, 0.45, '#fff') }
  ell(c, 2.6, 2.4, 1.5, 1.1, k === 'cat' ? '#ff7a9c' : '#1d1d22')
  if (k === 'dog') ell(c, 2.6, 5, 1.3, 1.7, '#ff7a9c')
  if (k === 'cat') { c.strokeStyle = 'rgba(60,40,20,.7)'; c.lineWidth = 0.5; c.beginPath(); for (const s of [-1, 1]) for (const d of [-1, 1]) { c.moveTo(2.6 + s * 2.6, 2.8); c.lineTo(2.6 + s * 7.6, 2.8 + d * 1.6) } c.stroke() }
  ell(c, -3.6, -4.4, 2.6, 1.6, 'rgba(255,255,255,.35)')
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
/** 날아가는 공 그림 — 돌파는 금빛, 이펙트 스킨이면 그 색으로 물든 공 */
const ballOf = (b, big = false) => b.sk ? TB[b.sk][big ? 1 : 0] : b.br ? (big ? BIGG : BALLG) : big ? BIG : BALL

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
  } else if (map.id === 'neon') {   // 네온 시티 — 검은 바닥 · 가는 네온 격자
    A.tile = tile(c => {
      c.fillStyle = '#07060f'; c.fillRect(0, 0, T, T)
      c.strokeStyle = 'rgba(160,80,255,.16)'; c.lineWidth = 1; for (let i = 0; i <= T; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, T); c.moveTo(0, i); c.lineTo(T, i); c.stroke() }
      c.strokeStyle = 'rgba(60,230,255,.22)'; c.lineWidth = 1.6; for (let i = 0; i <= T; i += 128) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, T); c.moveTo(0, i); c.lineTo(T, i); c.stroke() }
      specks(c, r, 700, ['#7ff3ff14', '#ff6bd514', '#00000040'])
    })
  } else if (map.id === 'chal') {   // 챌린지 — 검은 결승 코트 마루
    A.tile = tile(c => {
      for (let y = 0; y < T; y += 16) {
        let x = -r() * 200
        while (x < T) { const L = 90 + r() * 150; c.fillStyle = shade('#2a2433', 0.82 + r() * 0.3); c.fillRect(x, y, L, 16); c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(x, y, 1.2, 16); x += L }
        c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(0, y, T, 1)
      }
      specks(c, r, 900, ['#ffd23f12', '#00000030'])
    })
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
  court(c, x, y, L, D, 'rgba(255,255,255,.85)', '#c4553c')
}
/** 코트 선 — 길이 L 을 94피트로 본 실제 비율(림은 끝줄에서 5.25 · 페인트존 19 × 16 · 자유투 원 6 · 3점 23.75, 코너 22 · 가운데 원 6피트)이라 선끼리 안 겹친다.
 *  paint 면 페인트존을, mid 면 가운데 원 안을 칠한다(로고는 부르는 쪽이 위에) */
function court(c, x, y, L, D, col, paint, mid, lw = 3.4) {
  const u = L / 94, l = x - L / 2, rt = x + L / 2, key = 19 * u, kw = 8 * u, fr = 6 * u, r3 = 23.75 * u, sy = Math.min(22 * u, D / 2 - 3 * u), ang = Math.asin(sy / r3)
  if (paint) { c.fillStyle = paint; c.fillRect(l, y - kw, key, kw * 2); c.fillRect(rt - key, y - kw, key, kw * 2) }
  c.strokeStyle = col; c.lineWidth = lw
  c.strokeRect(l, y - D / 2, L, D); c.strokeRect(l, y - kw, key, kw * 2); c.strokeRect(rt - key, y - kw, key, kw * 2)
  c.beginPath(); c.moveTo(x, y - D / 2); c.lineTo(x, y + D / 2); c.stroke()
  if (mid) ell(c, x, y, fr, fr, mid)
  c.beginPath(); c.arc(x, y, fr, 0, TAU); c.stroke()
  for (const s of [1, -1]) {
    const bx = s > 0 ? l : rt, rx = bx + s * 5.25 * u, fx = bx + s * key   // 끝줄 · 림 · 자유투 줄
    c.beginPath(); s > 0 ? c.arc(fx, y, fr, -Math.PI / 2, Math.PI / 2) : c.arc(fx, y, fr, Math.PI / 2, Math.PI * 1.5); c.stroke()
    c.beginPath(); c.moveTo(bx, y - sy); c.lineTo(rx + s * Math.cos(ang) * r3, y - sy)
    s > 0 ? c.arc(rx, y, r3, -ang, ang) : c.arc(rx, y, r3, Math.PI + ang, Math.PI - ang, true)
    c.lineTo(bx, y + sy); c.stroke()
    c.lineWidth = lw * 1.3; c.beginPath(); c.moveTo(bx + s * 4 * u, y - 3 * u); c.lineTo(bx + s * 4 * u, y + 3 * u); c.stroke(); c.lineWidth = lw   // 백보드
    c.strokeStyle = '#ff7a1a'; c.beginPath(); c.arc(rx, y, Math.max(6, 0.9 * u), 0, TAU); c.stroke(); c.strokeStyle = col
  }
}
/** 바닥 — (x0, y0) 부터 w × h 안. 미리보기 캔버스도 같은 걸 쓴다 */
function floor(c, map, x0, y0, w, H, t = 0) {
  const A = art(map), i0 = Math.floor(x0 / T), j0 = Math.floor(y0 / T)
  if (map.id === 'arena') {
    const W = map.wall
    c.save(); c.beginPath(); c.rect(x0, -W, w, 2 * W); c.clip()
    for (let j = j0; j * T < y0 + H; j++) for (let i = i0; i * T < x0 + w; i++) c.drawImage(A.tile, i * T, j * T, T + 0.6, T + 0.6)
    for (let k = Math.floor((x0 - 710) / 1420); k * 1420 - 710 < x0 + w; k++) {   // 코트(1280 × 740)마다 사이 140
      const x = k * 1420
      court(c, x, 0, 1280, 740, 'rgba(255,255,255,.9)', '#7c1d2c', '#7c1d2c')
      c.font = 'italic 900 40px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f2c14e'; c.fillText('TNAB', x, 2)
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
  if (map.id === 'neon') {   // 네온 코트 — 넓게 번진 빛(굵고 흐린 선) 위에 가는 선, 코트마다 하늘 · 분홍이 번갈아 숨 쉰다
    for (let mi = Math.floor((x0 - 710) / 1420); mi * 1420 - 710 < x0 + w; mi++) for (let mj = Math.floor((y0 - 440) / 880); mj * 880 - 440 < y0 + H; mj++) {
      const x = mi * 1420, y = mj * 880, pink = (mi + mj) & 1, rgb = pink ? '255,90,220' : '60,230,255', a = 0.55 + Math.sin(t * 2 + mi + mj * 1.7) * 0.25
      court(c, x, y, 1280, 740, `rgba(${rgb},${0.16 * a})`, null, null, 16)
      court(c, x, y, 1280, 740, `rgba(${rgb},${0.9 * a + 0.1})`, null, null, 2.6)
      c.font = 'italic 900 64px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = `rgba(${rgb},${0.5 * a})`; c.fillText('NEON', x, y + 4)
    }
    return
  }
  if (map.id === 'chal') {   // 금빛 줄 코트 · 가운데 ∞
    for (let mi = Math.floor((x0 - 710) / 1420); mi * 1420 - 710 < x0 + w; mi++) for (let mj = Math.floor((y0 - 440) / 880); mj * 880 - 440 < y0 + H; mj++) {   // 코트(1280 × 740)마다 사이 140 — 가로세로 같게
      const x = mi * 1420, y = mj * 880
      court(c, x, y, 1280, 740, 'rgba(255,210,63,.7)', null, '#3b1d5e')
      c.font = '900 120px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffd23fd0'; c.fillText('∞', x, y + 6)
    }
    return
  }
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
addEventListener('blur', () => { calm(); if (mode === 'play' && !G?.auto) pause() })
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && !G?.auto) pause() })
// 자동사냥 중 탭을 가리면 브라우저가 그림(requestAnimationFrame)을 멈춘다 — 그동안은 1초마다 지난 시간만큼 판을 돌린다(한 번에 1분까지)
let hidAt = 0
setInterval(() => {
  if (!document.hidden || mode !== 'play' || !G?.auto) { hidAt = 0; return }
  const now = performance.now()
  let left = Math.min(60, hidAt ? (now - hidAt) / 1000 : 1); hidAt = now
  while (left > 0 && mode === 'play') { const d = Math.min(1 / 30, left); step(d); left -= d }
}, 1000)
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
const need = lv => Math.round((1 + 0.2 * Math.min(1, (lv - 1) / 15)) * (lv < 20 ? 5 + (lv - 1) * 7 : 138 + (lv - 20) * 12 + (lv - 20) ** 2))   // 다음 레벨까지 경험치 — 처음엔 예전 그대로, Lv 16 부터 1.2배. 20부터는 오를수록 더 많이, 늘어나는 폭도 커진다(30 → 430 · 40 → 934 · 50 → 1678)

// 자동사냥(네온 시티) — 켜짐 · 공격형(atk) | 수비형(def). 이 브라우저에 기억한다
const AUTO_KEY = 'survive.auto', autoSet = { on: true, mode: 'atk', again: true }   // again — 판이 끝나면 다시 시작
try { Object.assign(autoSet, JSON.parse(localStorage.getItem(AUTO_KEY)) || {}) } catch {}
const keepAuto = () => { try { localStorage.setItem(AUTO_KEY, JSON.stringify(autoSet)) } catch {} }
/** 판 하나 — 입은 스킨(옷 · 공 · 이펙트)으로. demo 면 상점 미리 보기 판(고른 스킨 · 업적 없음) */
function newGame(ch, map, demo = null) {
  if (kOf() !== K) sprites(kOf())
  const fit = demo ? SKIN[demo.fit] : worn('fit', ch.id), ball = demo ? demo.ball : worn('ball', ch.id)?.id
  pl = { x: 0, y: 0, r: 12, hp: 1, inv: 0, face: [1, 0], fx: 1, jump: 0, moving: false, spr: playerSprites(ch, fit?.look) }
  const auto = map.farm && !demo && autoSet.on ? autoSet.mode : null
  G = {
    demo, ball, aura: fit?.aura,   // 미리 보기 · 드리블 공 스킨 · 옷 오라
    auto, autoUsed: !!auto, home: { x: 0, y: 0 }, autoA: 0, roam: null, roamT: 0,   // 자동사냥 — 'atk' | 'def' | null, 한 번이라도 켰으면 업적 · 랭킹 없음
    ch, map, t: 0, foes: [], shots: [], eshots: [], gems: [], items: [], fx: [], parts: [], nums: [], weapons: [], passives: {},
    kills: 0, lvl: 1, xp: 0, next: need(1), queue: [], cheer: 0, jackpots: 0, bosses: 0, lastHit: 0, freeze: 0, spawnT: 0.5,
    nextMascot: 140, nextSwarm: 100, got: [], dying: 0, bodyT: 0, banner: null,
    haz: [], sts: {}, pi: 0, nextEvt: 930, nextWave: 1800, mids: 0, late: 0, breaks: 0,   // 바닥 경고(폭격 · 러시 · 착지) · 상태이상(끝나는 시각) · PLAN 다음 차례
    rr: 2 + (ch.mod.boxes || 0), skips: 2 + (ch.mod.boxes || 0), bans: 2 + (ch.mod.boxes || 0), banned: new Set(),   // 상자에서 쓰는 리롤 · 스킵 · 제외(한 판에 두 번씩) · 제외한 카드(t + id)
  }
  S = null; addWeapon(demo?.w || ch.w); stats(); pl.hp = S.maxHp
  cam.x = cam.y = 0; calm()
}
function start() {
  newGame(CHARS[menuChar], MAPS[menuMap])
  mode = 'play'; ui.hidden = true; ui.classList.remove('is-box', 'is-shop'); pauseBtn.hidden = false; autoUI()
}
/** 상점 미리 보기 — 그 캐릭터 · 스킨으로 판을 띄워 둘레의 수비(안 죽고 안 움직인다) 앞에서 원을 그리며 스킬을 쓴다 */
function demo(o) {
  newGame(CHARS[o.ci], MAPS[menuMap], o)
  const w = G.weapons[0]; w.lv = o.lv; w.st = wstat(w)
  Object.assign(G, { spawnT: 1e9, pi: PLAN.length, nextMascot: 1e9, nextSwarm: 1e9, nextEvt: 1e9, nextWave: 1e9, next: 1e12 })
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + 0.3, d = i % 2 ? 125 : 85, e = spawn('rookie', Math.cos(a) * d, Math.sin(a) * d * 0.8); e.hp = e.max = 1e12 }
}
const ZOOM = 1.6
function demoStep(dt) {
  G.freeze = 9; pl.inv = 1e9; if (G.t > 600) G.t = 1
  step(dt)
  const a = G.t * 1.1, port = VH > VW * 1.1
  pl.x = Math.cos(a) * 26; pl.y = Math.sin(a) * 14; pl.moving = true; pl.fx = Math.sin(a) <= 0 ? 1 : -1; pl.face = [pl.fx, 0]
  cam.x = pl.x + (port ? 0 : VW / ZOOM * 0.29); cam.y = pl.y + (port ? VH / ZOOM * 0.3 : 0)   // 패널이 덮지 않는 쪽에 내가 보이게(1.6배로 가까이)
}
function playerSprites(ch, look) {
  const o = { jersey: ch.c[0], trim: ch.c[1], shorts: ch.c[0], skin: ch.skin || '#b9825a', hair: '#1d140e', shoe: '#f4f4f4', num: NBA_NUM[ch.id] ?? '', head: ch.head, chin: ch.chin, kind: 'me', ...ch.fit, ...look }
  const paint = (frame, mirror) => sprite(36, 66, 18, 62, c => { if (mirror) c.scale(-1, 1); person(c, { ...o, frame, mirror }) })
  return { R: [0, 1, 2, 3].map(f => paint(f)), L: [0, 1, 2, 3].map(f => paint(f, true)), mate: sprite(36, 66, 18, 62, c => person(c, { ...o, ...ch.fit, jersey: ch.c[1], trim: ch.c[0], shorts: ch.c[1], side: ch.c[0], pin: null, tee: 0, hood: 0, shine: 0, star: 0, bands: 0, head: null, kind: 'screen' })) }
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
    magnet: 80 * (1 + 0.3 * L('vision') + (m.magnet || 0)),
    luck: 1 + 0.1 * L('clutch') + (m.luck || 0),
    growth: 0.8 * (1 + 0.08 * L('rookie') + (m.growth || 0)) * G.map.xp,   // 줍는 경험치 — 기본 0.8배
    crit: 0.03 + (m.crit || 0) + 0.02 * L('clutch'),
    critX: 2 + (m.critX || 0),
    body: !!m.body,
    bossX: 1 + (m.bossX || 0),   // 보스 · 중간보스 · 정예에게
  }
  if (old && S.maxHp > old) pl.hp += S.maxHp - old
}
function wstat(w) {
  const d = WEAP[w.id], st = { cd: d.cd, dmg: d.dmg, n: d.n || 1, area: 1, spd: 1, dur: d.dur || 0, pierce: d.pierce || 0, bounce: d.bounce || 0 }
  for (const up of d.ups.slice(0, w.lv - 1)) for (const k in up) st[k] += up[k]
  const s = synOf(w.id)
  if (s && G.weapons.some(x => x.id === mateOf(w.id))) for (const k in s[1][w.id]) st[k] += s[1][w.id][k]
  return st
}
function addWeapon(id) {
  const w = { id, lv: 1, t: 0.3, q: 0, qt: 0, n: 0, ang: 0, on: 0, list: [], sk: G.demo ? G.demo.fx?.[id] || 0 : worn('fx', id)?.tier || 0 }   // sk — 스킬 이펙트 스킨 등급(미리 보기면 고른 것)
  w.st = wstat(w); G.weapons.push(w)
  const m = G.weapons.find(x => x.id === mateOf(id))
  if (m) {   // 짝이 이미 있으면 둘 다 세진다
    m.st = wstat(m); say(`시너지 — ${synOf(id)[0]}`, 2.4, '#ffb366'); gain('syn1')
    if (SYN.filter(s => Object.keys(s[1]).every(k => G.weapons.some(x => x.id === k))).length >= 3) gain('syn3')
  }
}

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
  fade(w, st, i, A, D) {   // 화면 안 · 520 안의 보스 · 정예가 먼저(등지고 물러서도 돌아 쏜다), 없으면 보는 쪽 — 앞 60° 안 수비를 겨눈다. 돌파면 등 뒤로도
    let [fx, fy] = pl.face, e = null, bd = 520 * 520
    for (const f of G.foes) if (!f.dead && (f.boss || f.elite) && onScreen(f, 30)) { const d = (f.x - pl.x) ** 2 + (f.y - pl.y) ** 2; if (d < bd) { bd = d; e = f } }
    e ||= closest(6, pl.x, pl.y, null, 420).find(e => { const [dx, dy] = toward(e); return dx * fx + dy * fy > 0.5 })
    if (e) [fx, fy] = toward(e)
    const o = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 8
    for (const s of w.br ? [1, -1] : [1]) ball(fx * s, fy * s, { v: 740 * st.spd * S.speed, r: 6, dmg: D, pierce: st.pierce, kb: 30, x: pl.x - fy * o, y: pl.y + fx * o, life: 1, col: '#ffd23f', br: w.br, bx: 1.4 })
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
  shotclock(w, st, i, A, D) {   // 가까운 수비 12명 중 둘레에 수비가 가장 많은 자리(이미 시계가 떠 있는 자리는 빼고). 1초 뒤 터진다
    const R = 62 * A
    let best = null, bn = 0
    for (const e of closest(12, pl.x, pl.y, null, 420)) {
      if (G.shots.some(b => b.k === 'shotclock' && (b.x - e.x) ** 2 + (b.y - e.y) ** 2 < R * R)) continue
      let n = 0; near(e.x, e.y, R, () => { n++ })
      if (n > bn) { bn = n; best = e }
    }
    const x = best ? best.x : pl.x + pl.face[0] * 140, y = best ? best.y : pl.y + pl.face[1] * 140
    G.shots.push({ k: 'shotclock', x, y: wallY(y), t: 0, T: 1, R, dmg: D, br: w.br })
  },
  screen(w, st, i, A, D) { const a = rnd() * TAU, d = 50 + rnd() * 90, ox = Math.cos(a) * d, oy = Math.sin(a) * d; G.shots.push({ k: 'zone', x: pl.x + ox, y: wallY(pl.y + oy), ox, oy, R: 45 * A, dmg: D, tick: 0, t: 0, life: st.dur * S.dur, br: w.br }) },
  rebound(w, st, i, A, D) { const a = rnd() * TAU, v = 380 * st.spd * S.speed; G.shots.push({ k: 'rebound', x: pl.x, y: pl.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 9 * A, dmg: D, hit: new Map(), t: 0, life: st.dur * S.dur, a: 0, br: w.br }) },
  steal(w, st, i, A, D) {   // 가장 강한 수비에게 손을 뻗는다 — 돌파면 5초 동안 받는 피해 +30%
    const e = alive(w.list[i]) || strongest(1)[0]; if (!e) return
    hurt(e, D, pl.x, pl.y, 60); if (w.br) e.mark = G.t + 5
    fx({ k: 'grab', x0: pl.x, y0: pl.y - 18, x: e.x, y: e.y - e.r * 1.6, T: 0.3, br: w.br })
  },
  outlet(w, st, i, A, D) {   // 화면 안 아무 수비 쪽으로 빛줄기 — 돌파면 세 갈래
    const c = G.foes.filter(e => !e.dead && onScreen(e)), e = c.length ? pickOf(c) : null, a = e ? Math.atan2(e.y - pl.y, e.x - pl.x) : Math.atan2(pl.face[1], pl.face[0])
    for (const da of w.br ? [-0.32, 0, 0.32] : [0]) beam(pl.x, pl.y - 14, a + da, Math.max(VW, VH) * 0.9, 15 * A, D, w.br)
  },
}
/** 화면 안 강한 순 n — 보스 > 정예 > 남은 피 */
function strongest(n) {
  const v = e => (e.boss ? 2e9 : e.elite ? 1e9 : 0) + e.hp
  return G.foes.filter(e => !e.dead && onScreen(e, 30)).sort((a, b) => v(b) - v(a)).slice(0, n)
}
/** 빛줄기 — (x, y) 에서 a 쪽으로 길이 L · 반폭 W 안의 수비를 모두 */
function beam(x, y, a, L, W, D, br) {
  const dx = Math.cos(a), dy = Math.sin(a)
  for (const e of G.foes) {
    if (e.dead) continue
    const ex = e.x - x, ey = e.y - e.r - y, u = ex * dx + ey * dy
    if (u > 0 && u < L && Math.abs(ex * dy - ey * dx) < W + e.r) hurt(e, D, x, y, 50)
  }
  fx({ k: 'beam', x, y, a, L, W, T: 0.32, br })
}
const alive = e => e && !e.dead ? e : null
/** T 초 동안 속도 k 배 — 더 느린 게 걸려 있으면 그게 끝날 때까지 약한 건 무시(앵클 브레이커 0 · 스크린 · 유로 갤럽 0.7). 보스 · 중간보스 · 흥분한 수비는 안 걸린다 */
const slow = (e, T, k) => { if (e.boss || e.rage > G.t) return; if (e.slow <= 0 || k <= e.sk) { e.sk = k; e.slow = Math.max(e.slow, T) } }
function ball(dx, dy, o) { G.shots.push({ k: 'ball', x: o.x ?? pl.x, y: o.y ?? pl.y, vx: dx * o.v, vy: dy * o.v, r: o.r, dmg: o.dmg, pierce: o.pierce, bounce: o.bounce || 0, life: o.life || 1.3, t: 0, a: 0, hit: new Set(), kb: o.kb, col: o.col, br: o.br, bx: o.bx || 1 }) }   // bx — 보스 · 정예에게 배수(스텝백)
/** 번개 — (x0, y0) 에서 (x1, y1) 까지 지그재그 아홉 점. 끝으로 갈수록 덜 흔들린다 */
function zig(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, pts = [[x0, y0]]
  for (let i = 1; i < 8; i++) { const u = i / 8, j = (rnd() - 0.5) * 0.08 * L * (1 - u); pts.push([x0 + dx * u - dy / L * j, y0 + dy * u + dx / L * j]) }
  pts.push([x1, y1])
  return pts
}

function weapons(dt) {
  for (const w of G.weapons) {
    const s0 = G.shots.length, f0 = G.fx.length
    weapon1(w, dt)
    if (!w.sk) continue
    for (let i = s0; i < G.shots.length; i++) G.shots[i].sk ??= w.sk   // 스킬 이펙트 스킨 — 이번에 나온 것에 등급(THEME)을
    const f1 = G.fx.length
    for (let i = f0; i < f1; i++) { const f = G.fx[i]; f.sk ??= w.sk; if (f.k === 'bolt' || f.k === 'grab') burst(f); else if (f.k === 'beam') burst({ ...f, x: f.x + Math.cos(f.a) * f.L * 0.5, y: f.y + Math.sin(f.a) * f.L * 0.5 }) }
  }
}
function weapon1(w, dt) {
  if (w === G.seal && sick('seal')) return
  const st = w.st, A = st.area * S.area, D = st.dmg * S.might * (G.ch.mod.clutch && pl.hp < S.maxHp / 2 ? 1 + G.ch.mod.clutch : 1)   // 클러치 킹 — 체력 절반 아래
  if (w.id === 'press') {   // 풀코트 프레스 — 쿨타임마다 둘레 전부
    w.R = 70 * A * (w.br ? 1.3 : 1)
    if ((w.t -= dt) <= 0) { w.t = Math.max(0.2, st.cd * S.cdr); near(pl.x, pl.y, w.R, e => { hurt(e, D, pl.x, pl.y, 30) }) }
    return
  }
  if (w.id === 'block') {   // 블록슛 — 켜져 있는 동안 손이 돈다
    w.ang += dt * 3.4 * st.spd * S.speed
    const n = st.n + S.amount, R = 80 * A, r = 10 * Math.sqrt(A)
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
    return
  }
  if (w.id === 'euro') {   // 유로스텝 — 움직일 때만 발자국마다 잔상
    if ((w.t -= dt) <= 0 && pl.moving) { w.t = Math.max(0.1, st.cd * S.cdr); G.shots.push({ k: 'trail', x: pl.x, y: pl.y, R: 22 * A, dmg: D, t: 0, life: st.dur * S.dur * (w.br ? 2 : 1), tick: 0, fx: pl.fx, fr: (G.t * 10 | 0) & 3, br: w.br }) }
    return
  }
  if (w.q > 0) { if ((w.qt -= dt) <= 0) { SHOT[w.id](w, st, w.n - w.q, A, D); w.q--; w.qt = GAP[w.id] } }
  else if ((w.t -= dt) <= 0) {
    w.n = w.q = st.n + S.amount; w.qt = 0; w.t = st.cd * S.cdr
    w.list = w.id === 'pass' || w.id === 'bounce' ? closest(w.n) : w.id === 'steal' ? strongest(w.n) : []
  }
}

// ---- 수비
const HPK = [1, 1.4, 1.8, 2.3, 4.3, 13, 26]   // 보통 수비 피 배수(시너지만큼 5 ~ 20분을 단단하게) — 0 · 5 · 10 … 30분, 사이는 잇는다
const hpK = m => { const i = Math.min(5, m / 5 | 0); return HPK[i] + (HPK[i + 1] - HPK[i]) * Math.min(1, m / 5 - i) }
function spawn(type, x, y) {
  const F = FOES[type], m = G.t / 60, mm = Math.min(m, 30), big = type in BOSS
  // 피 — 보통 수비는 HPK(성장이 느려진 만큼 10 ~ 20분은 완만하게, 다 키우는 25분쯤부터 가파르게), 보스는 완만하게(5분 2.25배 · 25분 7.25배 — 잘 짠 빌드면 30초 안팎).
  // 둘 다 30분에서 멈춘다(챌린지는 피 대신 세기 · 빠르기 · 보스 수가 오른다)
  const hp = F.hp * (big ? 1 + mm * 0.25 : hpK(mm)) * G.map.hp
  const dmgK = (1 + m * 0.055) * (m >= 25 && !big ? 1.4 : 1), spdK = 1 + Math.min(0.3, Math.max(0, m - 25) * 0.015)   // 25분부터 더 세고 빠르게(빠르기는 +30% 까지)
  const e = {
    type, v: rnd() * SPR[type].length | 0, x: 0, y: 0, r: F.r, hp, max: hp, spd: F.spd * G.map.spd * (0.9 + rnd() * 0.2) * spdK, dmg: F.dmg * dmgK, xp: F.xp,
    vx: 0, vy: 0, kx: 0, ky: 0, flash: 0, slow: 0, held: 0, rage: 0, fx: 1, seed: rnd() * 10, cd: 1 + rnd() * 2, st: 'walk', stT: 3, dx: 0, dy: 0, age: 0, z: 0,
    elite: type === 'mascot', boss: big, kind: big ? type : null, heavy: type === 'big' || type === 'mascot',
  }
  if (x === undefined) ring(e); else { e.x = x; e.y = wallY(y) }
  G.foes.push(e)
  return e
}
/** 보스 · 중간보스(작고 피 40%) — 나오면서 한마디 */
function summon(kind, mid = false) {
  const e = spawn(kind), B = BOSS[kind]
  if (mid) { e.mid = true; e.max *= 0.4; e.hp = e.max; e.r *= 0.8; e.sc = 0.8; e.xp = Math.round(e.xp * 0.3) }
  Object.assign(e, { castT: G.t + 6 + rnd() * 4, sti: 0, patT: 2.5 + rnd(), pat: 0, late: !mid && G.t >= 1500 })   // castT = 다음 상태이상(시각), patT = 다음 기술까지
  bubble(e, B.line, '#fff')
  say(mid ? `중간보스 — ${B.name}` : `${B.name} 등장!`, 2.2, mid ? '#ffb35e' : '#ff6b6b'); shake = Math.max(shake, mid ? 4 : 8)
  return e
}
const bubble = (e, s, col) => fx({ k: 'shout', e, s, col, T: 1.8 })
/** 화면 바로 바깥 — ahead 면 가는 쪽 앞에 */
function ring(e, ahead = false) {
  const hw = VW / 2 + 40, hh = VH / 2 + 50
  const a = ahead ? Math.atan2(pl.face[1], pl.face[0]) + (rnd() - 0.5) * 2.2 : rnd() * TAU, c = Math.cos(a), s = Math.sin(a)
  const t = Math.min(hw / Math.max(1e-6, Math.abs(c)), hh / Math.max(1e-6, Math.abs(s)))
  e.x = pl.x + c * t; e.y = pl.y + s * t
  if (G.map.wall && Math.abs(e.y) > G.map.wall - 14) { e.y = wallY(e.y); e.x = pl.x + (c >= 0 ? hw : -hw) }
}
function spawner(dt) {
  const m = G.t / 60, want = Math.min(MAX_FOES, (22 + m * 10 + m * m * 0.45) * (m >= 25 ? 1.3 : 1))
  if ((G.spawnT -= dt) <= 0) {
    G.spawnT = Math.max(m >= 25 ? 0.06 : 0.09, 0.55 - m * 0.02)
    const n = Math.min(want - G.foes.length, 1 + (m / 1.8 | 0))
    for (let i = 0; i < n; i++) {
      const w = [['rookie', 1], ['fan', m >= 1 ? 0.5 + m * 0.03 : 0], ['ref', m >= 20 ? 0.1 + (m - 20) * 0.035 : 0], ['big', m >= 4 ? 0.1 + m * 0.03 : 0]]
      let q = rnd() * w.reduce((s, x) => s + x[1], 0), type = 'rookie'
      for (const [k, v] of w) if ((q -= v) < 0) { type = k; break }
      spawn(type)
    }
  }
  while (G.pi < PLAN.length && G.t >= PLAN[G.pi][0]) { const [, kind, mid] = PLAN[G.pi++]; summon(kind, !!mid) }
  if (G.map.endless && G.t >= G.nextWave) {   // 챌린지 — 30분부터 1분마다 보스(8분마다 하나씩 늘어 다섯까지) + 중간보스
    G.nextWave += 60
    for (let i = Math.min(5, 1 + ((m - 30) / 8 | 0)); i--;) summon(pickOf(Object.keys(BOSS)))
    summon(pickOf(['shooter', 'center']), true)
  }
  if (G.t >= G.nextMascot) { spawn('mascot'); G.nextMascot += m < 15 ? 60 : 35 }
  if (G.t >= G.nextSwarm) {   // 팬이 사방에서 둘러싼다
    const n = 18 + (m * 2.5 | 0), R = Math.max(VW, VH) * 0.62
    for (let i = 0; i < n; i++) { const a = i / n * TAU; spawn('fan', pl.x + Math.cos(a) * R, pl.y + Math.sin(a) * R) }
    G.nextSwarm += 120; say('팬들이 몰려온다!', 1.8)   // 보스(5분마다)와 겹치지 않게 100초부터 2분마다
  }
  if (G.t >= G.nextEvt) { event(m); G.nextEvt = G.t + (m < 20 ? 30 + rnd() * 12 : m < 25 ? 22 + rnd() * 8 : Math.max(7, 15 - (m - 25) * 0.25) + rnd() * 4) }
}
// ---- 변수 기술 — 15분부터 가끔, 25분부터 훨씬 자주 · 세게. 블록슛 손 · 프레스로는 못 막는다 — 보고 피해야 한다
/** 보고 피하는 기술의 피해 — 최대 체력의 f(빌드와 상관없이 한 번 실수는 아프고, 서 있으면 계속 맞는다). 챌린지는 30분 뒤로 더 아파진다 */
const pct = f => S.maxHp * f * (1 + Math.max(0, G.t / 60 - 30) * 0.03)
function event(m) {
  if (m < 17 || rnd() < 0.55) {   // 하프코트 폭격 — 붉은 원이 다 차면 공이 떨어진다. 첫 원은 내 발밑
    const n = Math.min(16, 5 + ((m - 15) / 2 | 0)), dmg = pct(0.13 + clamp((m - 15) / 15, 0, 1) * 0.07)
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, d = i ? 40 + rnd() * 220 : 0; G.haz.push({ k: 'bomb', x: pl.x + Math.cos(a) * d, y: wallY(pl.y + Math.sin(a) * d), R: 60, t: -i * 0.1, T: 1.3, dmg }) }
    say('하프코트 폭격!', 1.2, '#ff6b6b')
  } else {   // 풀코트 러시 — 한쪽에서 줄지어 달려온다. 초록 줄(빈자리)로 피하기
    const horiz = !!G.map.wall || rnd() < 0.5
    G.haz.push({ k: 'rush', t: 0, T: 1.2, horiz, dir: rnd() < 0.5 ? 1 : -1, gap: (horiz ? cam.y : cam.x) + (rnd() - 0.5) * (horiz ? VH : VW) * 0.6, dmg: pct(m >= 25 ? 0.17 : 0.14) })
    say('풀코트 러시!', 1.2, '#ff6b6b')
  }
}
function rushNow(z) {
  const H = z.horiz, from = H ? cam.x - z.dir * (VW / 2 + 30) : cam.y - z.dir * (VH / 2 + 30), c = H ? cam.y : cam.x, half = (H ? VH : VW) / 2 + 20
  for (let q = c - half; q <= c + half; q += 36) {
    if (Math.abs(q - z.gap) < 58 || (H && G.map.wall && Math.abs(q) > G.map.wall - 14)) continue
    const e = spawn('rusher', H ? from - z.dir * rnd() * 16 : q, H ? q : from - z.dir * rnd() * 16)
    e.rush = [H ? z.dir * 400 : 0, H ? 0 : z.dir * 400]; e.dmg = z.dmg
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
    if (e.rush) {   // 러시 — 곧장 가로지른다(느려지지도 밀리지도 않는다). 화면을 한참 지나면 사라진다
      if (!frozen) { e.x += e.rush[0] * dt; e.y = wallY(e.y + e.rush[1] * dt) }
      e.fx = e.rush[0] < 0 ? -1 : 1
      if (Math.abs(e.x - cam.x) > VW + 200 || Math.abs(e.y - cam.y) > VH + 200) e.dead = true
      else if (!frozen && d < e.r + pl.r - 2) ouch(e.dmg)
      continue
    }
    if (!e.boss && d > far) { ring(e, true); continue }   // 너무 멀어진 수비는 앞쪽으로 다시
    e.slow -= dt
    if (frozen && !e.leap) { e.vx = e.vy = 0 }
    else if (e.boss) bossAI(e, dt, dx, dy, d)
    else {   // 흥분 — 10분부터, 1.6초 넘게 느려져 있으면(스크린 · 유로 갤럽 잔상 · 넘어뜨리기) 붉게 달아올라 3초 동안 안 느려지고 안 밀리고 1.3배로 달려든다(마스코트는 안 한다)
      e.held = e.slow > 0 && G.t >= 600 && !e.elite ? e.held + dt : Math.max(0, e.held - dt)
      if (e.held > 1.6) { e.held = 0; e.rage = G.t + 3; e.slow = 0; e.kx = e.ky = 0; if (G.fx.length < 150) fx({ k: 'text', x: e.x, y: e.y - e.r * 3.2, s: '!', col: '#ff4d4d', T: 0.5 }) }
      const sp = e.spd * (e.rage > G.t ? 1.3 : e.slow > 0 ? e.sk : 1); e.vx = dx * sp; e.vy = dy * sp
    }
    // 서로 밀어 겹치지 않게
    near(e.x, e.y, e.r * 0.6, o => { if (o === e) return; const ox = e.x - o.x, oy = e.y - o.y, q = Math.hypot(ox, oy) || 0.01, push = (e.r * 0.6 + o.r - q) * 0.35; e.x += ox / q * push; e.y += oy / q * push })
    e.x += (e.vx + e.kx) * dt; e.y = wallY(e.y + (e.vy + e.ky) * dt)
    const f = Math.exp(-9 * dt); e.kx *= f; e.ky *= f
    if (Math.abs(dx) > 0.15) e.fx = dx > 0 ? 1 : -1
    if (!frozen && e.type === 'ref' && d < 330 && (e.cd -= dt) <= 0) { e.cd = 2.6 + rnd(); G.eshots.push({ x: e.x, y: e.y, vx: dx * 210, vy: dy * 210, t: 0, life: 2.6, dmg: e.dmg + 1, a: 0 }) }
    if (d < e.r + pl.r - 2 && e.z < 20) {   // 뛰어오른 보스는 안 닿는다
      if (!frozen) ouch((e.boss ? Math.max(e.dmg, pct(e.mid ? 0.08 : 0.1)) : e.dmg) * (e.st === 'dash' ? 1.5 : 1))   // 보스 · 중간보스는 최대 체력의 8 · 10% 보다는 아프게
      if (S.body && (e.bodyT ?? 0) < G.t) { e.bodyT = G.t + 0.5; hurt(e, 14 * S.might, pl.x, pl.y, 280) }   // 자이언 — 밀쳐 내기
    }
  }
}
// 올스타 수비수(MVP 돌진도) — 걷다가 멈칫(붉게) 하고 그 방향으로 돌진
function boss(e, dt, dx, dy) {
  e.stT -= dt
  if (e.st === 'walk') { e.vx = dx * e.spd; e.vy = dy * e.spd; if (e.stT <= 0) { e.st = 'wind'; e.stT = 0.7; e.dx = dx; e.dy = dy } }
  else if (e.st === 'wind') { e.vx = e.vy = 0; e.flash = 0.05 * ((G.t * 12 | 0) % 2); if (e.stT <= 0) { e.st = 'dash'; e.stT = 0.75 } }
  else { e.vx = e.dx * e.spd * 4; e.vy = e.dy * e.spd * 4; if (e.stT <= 0) { e.st = 'walk'; e.stT = 2.6 + rnd() * 1.4 } }
}
// 보스 — 종류마다 다른 기술(BOSS). 기술 전에는 멈춰 깜빡인다(act) — 보고 피할 수 있게
function bossAI(e, dt, dx, dy, d) {
  const B = BOSS[e.kind]
  if (e.leap) return leapStep(e, dt)
  if (e.act) { e.vx = e.vy = 0; e.flash = 0.05 * ((G.t * 12 | 0) % 2); if ((e.act.t -= dt) <= 0) { const a = e.act; e.act = null; ACT[a.k](e, a) } return }
  if (e.kind !== 'boss' && e.st !== 'walk') return boss(e, dt, dx, dy)   // MVP 돌진 중
  if (B.st && G.t >= 1200 && G.t >= e.castT) {   // 상태이상 — 20분부터, 1분에 한 번. 이름을 외치고 0.8초 뒤 물결이 퍼진다
    e.castT = G.t + 60
    const id = e.kind === 'coach' ? B.st[e.sti++ % B.st.length] : pickOf(B.st)
    e.act = { k: 'wave', id, t: 0.8 }; bubble(e, `${STATUS[id].name}!`, STATUS[id].col)
    return
  }
  if (e.kind === 'boss') return boss(e, dt, dx, dy)
  // 걷기 — 슈터는 거리를 두고 옆으로 돈다, 감독은 조금 떨어져서, 나머지는 다가온다
  const sp = e.spd, keep = e.kind === 'shooter' ? 250 : e.kind === 'coach' ? 190 : 0
  if (keep && d < keep - 40) { e.vx = -dx * sp; e.vy = -dy * sp }
  else if (keep && d < keep + 60) { const s = e.seed > 5 ? 1 : -1; e.vx = -dy * sp * s; e.vy = dx * sp * s }
  else { e.vx = dx * sp; e.vy = dy * sp }
  if ((e.patT -= dt) > 0) return
  switch (e.kind) {
    case 'shooter': e.patT = e.mid ? 3.2 : 2.3; e.act = { k: 'volley', n: e.mid ? 3 : G.t >= 1500 ? 6 : 5, t: 0.45 }; break
    case 'center': e.patT = e.mid ? 5.5 : 4; leap(e); break
    case 'coach': e.patT = 11; e.act = { k: 'squad', t: 0.6 }; bubble(e, '압박해!', '#fff'); break
    case 'chief': e.patT = 3.4; e.act = { k: 'cards', t: 0.5 }; break
    case 'mvp': e.patT = 2.6; [() => Object.assign(e, { st: 'wind', stT: 0.7, dx, dy }), () => { e.act = { k: 'volley', n: 7, t: 0.4 } }, () => leap(e)][e.pat++ % 3](); break
  }
}
const ACT = {
  volley(e, a) {   // 농구공을 부채꼴로 — 손 · 프레스로 못 막는다
    const q0 = Math.atan2(pl.y - e.y, pl.x - e.x), v = e.mid ? 230 : 265
    for (let i = 0; i < a.n; i++) { const q = q0 + (i - (a.n - 1) / 2) * 0.17; G.eshots.push({ k: 'ball', x: e.x, y: e.y, vx: Math.cos(q) * v, vy: Math.sin(q) * v, t: 0, life: 3.2, dmg: pct(e.mid ? 0.07 : 0.09), a: 0, r: 8 }) }
  },
  cards(e) {   // 레드카드를 사방으로 — 매번 반 칸씩 돌려서
    const n = 14, o = (e.pat++ % 2) * Math.PI / n
    for (let i = 0; i < n; i++) { const q = o + i / n * TAU; G.eshots.push({ k: 'card', x: e.x, y: e.y, vx: Math.cos(q) * 175, vy: Math.sin(q) * 175, t: 0, life: 3.4, dmg: pct(0.06), a: q, r: 6 }) }
  },
  squad() {   // 선수들을 불러 나를 에워싼다
    const n = G.t >= 1500 ? 12 : 8
    for (let i = 0; i < n; i++) { const q = i / n * TAU; spawn('rookie', pl.x + Math.cos(q) * 230, pl.y + Math.sin(q) * 230) }
  },
  wave(e, a) { fx({ k: 'wave', x: e.x, y: e.y, R: 340, T: 0.8, st: a.id, col: STATUS[a.id].col }) },
}
/** 골밑 지배자 — 내 자리(움직이면 조금 앞)에 뛰어내린다. 바닥의 붉은 원이 다 차면 쿵(G.haz 'land') */
function leap(e) {
  const x = pl.x + (pl.moving ? pl.face[0] * 50 : 0), y = wallY(pl.y + (pl.moving ? pl.face[1] * 50 : 0)), T = e.mid ? 1.15 : 1
  e.leap = { x0: e.x, y0: e.y, x1: x, y1: y, t: 0, T }
  G.haz.push({ k: 'land', e, x, y, R: e.mid ? 85 : 110, t: 0, T, dmg: pct(e.mid ? 0.18 : 0.26) })
}
function leapStep(e, dt) {
  const L = e.leap, u = Math.min(1, (L.t += dt) / L.T)
  e.vx = e.vy = 0; e.x = L.x0 + (L.x1 - L.x0) * u; e.y = L.y0 + (L.y1 - L.y0) * u; e.z = Math.sin(u * Math.PI) * 140
  if (u >= 1) { e.leap = null; e.z = 0 }
}
// ---- 상태이상 — 10초. 머리 위에 이름 · 화면 위에 표시(hud). 걸리면 쿨링 스프레이가 가끔 근처에 떨어진다
const sick = id => G.sts[id] > G.t
function afflict(id) {
  const st = STATUS[id]
  G.sts[id] = G.t + ST_T
  let s = st.name
  if (id === 'seal') {   // 봉인 — 주력 스킬 하나(G.seal)를 못 쓴다. 나가 있던 블록슛 손 · 프레스 바닥 · 남은 연사도 거둔다
    const w = G.seal = pickOf(G.weapons); s += ` — ${WEAP[w.id].name}`
    for (const b of G.shots) if (b.w === w) b.dead = true
    w.hands = null; w.on = 0; w.R = 0; w.q = 0
  }
  fx({ k: 'text', x: pl.x, y: pl.y - 70, s, col: st.col, T: 1.6 }); fx({ k: 'flash', x: pl.x, y: pl.y - 20, R: 70, col: st.col, T: 0.5 })
}
function hurt(e, dmg, ox, oy, kb = 0) {
  if (e.dead || e.rush) return   // 러시는 스킬에 안 맞는다 — 막을 수 없고 피하는 수밖에
  const crit = rnd() < S.crit
  dmg *= (sick('weak') ? 0.6 : 1) * (e.boss || e.elite ? S.bossX : 1) * (e.mark > G.t ? 1.3 : 1)   // 약화 · 폴 조지 · 락다운
  dmg = Math.max(1, Math.round(dmg * (crit ? S.critX : 1) * (0.9 + rnd() * 0.2)))
  e.hp -= dmg; e.flash = 0.1
  if (G.fx.length < 150 && (crit || rnd() < 0.45)) fx({ k: 'spark', x: e.x + (rnd() - 0.5) * e.r, y: e.y - e.r * 2 + (rnd() - 0.5) * e.r, s: crit ? 36 : 20, a: rnd() * TAU, T: 0.22 })
  if (kb && !e.heavy && !e.boss && !(e.rage > G.t)) { const dx = e.x - ox, dy = e.y - oy, d = Math.hypot(dx, dy) || 1; e.kx += dx / d * kb; e.ky += dy / d * kb }   // 밀리는 건 작은 수비(신인 · 팬 · 심판)만
  num(e.x, e.y - e.r * 3.4, dmg, crit ? 'crit' : '')
  if (e.hp <= 0) kill(e)
}
function kill(e) {
  e.dead = true; G.kills++
  gem(e.x, e.y, e.xp)
  const col = SPR[e.type][e.v].col
  if (G.fx.length < 180) fx({ k: 'puff', x: e.x, y: e.y, r: e.r * 1.5, a: rnd() * TAU, T: 0.45 })
  for (let i = 0; i < (e.boss ? 40 : e.elite ? 16 : 4); i++) { const a = rnd() * TAU, s = 40 + rnd() * (e.boss ? 260 : 120); part(e.x, e.y - e.r * 1.5, Math.cos(a) * s, Math.sin(a) * s - 60, i % 3 ? col : '#fff', 0.35 + rnd() * 0.35, 2 + rnd() * (e.boss ? 4 : 2.5)) }
  if (e.elite || e.mid) { if (rnd() < 0.33 * S.luck) item(e.x, e.y); for (let i = 0; i < 3; i++) gem(e.x + (rnd() - 0.5) * 40, e.y + (rnd() - 0.5) * 40, e.mid ? 10 : 5) }
  else if (!e.boss && rnd() < 0.0013 * S.luck) item(e.x, e.y, rnd() < 0.6 ? 'drink' : 'whistle')   // 아이템은 예전의 1/3 — 마스코트 · 중간보스 33%, 보통 수비 0.13%
  else if (!e.boss && G.t >= 1200 && rnd() < 0.0005 * S.luck) item(e.x, e.y, 'spray')
  if (rnd() < (e.boss ? (e.mid ? 0.033 : 0.067) : e.elite ? 0.018 : 0.000037) * S.luck && ringable()) item(e.x, e.y + 14, 'ring')   // 챔피언 반지도 예전의 1/3
  if (e.boss) {
    const B = BOSS[e.kind]
    if (e.mid) { if (++G.mids >= 3) gain('mid3'); say(`${B.name} 격파!`, 1.6, '#ffb35e') }
    else {
      G.bosses++; item(e.x, e.y, 'chest'); gain('boss1'); if (e.kind === 'mvp') gain('mvp1'); if (e.late && ++G.late >= 5) gain('bossrush')
      say(`${B.name} 격파!`, 2.2, '#ffd23f')
    }
    shake = e.mid ? 6 : 10; fx({ k: 'ring', x: e.x, y: e.y, R: e.mid ? 120 : 180, T: 0.6, col: '#ffd23f' }); fx({ k: 'flash', x: e.x, y: e.y - 40, R: e.mid ? 110 : 160, col: '#ffd23f', T: 0.6 })
  }
  if (G.kills === 1000) gain('kill1000')
  if (G.kills === 5000) gain('kill5000')
}
function ouch(d) {
  if (pl.inv > 0 || G.dying) return
  d = Math.max(1, Math.round(d * (sick('frail') ? 1.5 : 1) - S.armor)); pl.hp -= d; pl.inv = 0.4; G.lastHit = G.t; shake = Math.max(shake, 4)
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
  if (!k) { const q = rnd(); k = G.t >= 1200 && q < 0.2 ? 'spray' : q < 0.4 ? 'drink' : q < 0.65 ? 'whistle' : q < 0.8 ? 'clock' : 'buzzer' }   // 20분부터 쿨링 스프레이도
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
  spray: () => {   // 쿨링 스프레이 — 상태이상을 모두 푼다(걸린 게 없으면 체력 15%)
    if (Object.values(G.sts).some(t => t > G.t)) { G.sts = {}; gain('cleanse1'); say('상태이상 해제!', 1.4, '#7fd8ff') }
    else { const v = Math.round(S.maxHp * 0.15); pl.hp = Math.min(S.maxHp, pl.hp + v); num(pl.x, pl.y - 58, `+${v}`, 'heal') }
  },
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
  if (G.t >= MAX_T && !dead && !G.map.endless && !G.demo) return finish(true)   // 챌린지는 끝이 없다
  // 나
  let mx = key.r - key.l + joy.x, my = key.d - key.u + joy.y
  if (G.auto && !dead && !mx && !my) [mx, my] = autoDir()   // 자동사냥 — 키 · 손가락을 대면 그동안은 내가
  const m = Math.hypot(mx, my)
  pl.moving = m > 0.12 && !dead
  if (pl.moving) {
    pl.face = [mx / m, my / m]
    if (m > 1) { mx /= m; my /= m }
    if (Math.abs(mx) > 0.2) pl.fx = mx > 0 ? 1 : -1
    const sp = 150 * S.move * (sick('slow') ? 0.6 : 1)
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
  // 바닥 경고 — 폭격 · 착지는 원이 다 차면 터지고(안에 있으면 맞는다), 러시는 줄지어 나온다
  for (const z of G.haz) {
    if ((z.t += dt) < z.T) continue
    z.dead = true
    if (z.k === 'rush') { rushNow(z); continue }
    if (((pl.x - z.x) / (z.R + 4)) ** 2 + ((pl.y - z.y) / ((z.R + 4) * 0.8)) ** 2 < 1) ouch(z.dmg)
    fx({ k: 'ring', x: z.x, y: z.y, R: z.R, T: 0.4, col: z.k === 'land' ? '#ff9f43' : '#ff4d4d' }); fx({ k: 'flash', x: z.x, y: z.y - 10, R: z.R, col: '#ff6b3a', T: 0.35 }); fx({ k: 'crack', x: z.x, y: z.y, R: z.R * 0.8, T: 1 })
    for (let i = 0; i < 8; i++) { const a = rnd() * TAU; part(z.x, z.y, Math.cos(a) * 160, Math.sin(a) * 90 - 80, i % 2 ? '#ff7a1a' : '#fff', 0.35, 2.6) }
    shake = Math.max(shake, z.k === 'land' ? 8 : 4)
  }
  // 날아오는 것 — 심판 호루라기만 블록슛 손에 10% 로 막히고 스크린 바닥 안에서 느리게(사라지는 시간도 같이 늦춰 결국 날아온다). 보스의 농구공 · 레드카드는 피하는 수밖에
  const guard = G.eshots.length ? G.shots.filter(b => b.k === 'orb' || b.k === 'zone') : []
  const inside = (b, x, y, R) => ((b.x - x) / R) ** 2 + ((b.y - y) / (R * 0.8)) ** 2 < 1   // 바닥은 납작한 타원
  for (const b of G.eshots) {
    const soft = !b.k
    let sp = 1
    if (soft) for (const o of guard) {
      if (o.k === 'zone') { if (inside(b, o.x, o.y, o.R)) sp = 0.3 }
      else if (!b.tried && (b.x - o.x) ** 2 + (b.y - o.y) ** 2 < (o.r + 24) ** 2) {   // 손에 처음 닿을 때 한 번 10% — 놓치면 그대로 지나간다
        b.tried = true
        if (rnd() >= 0.1) continue
        b.dead = true; fx({ k: 'flash', x: b.x, y: b.y - 18, R: 30, col: '#ffe2c0', T: 0.25 })
        for (let i = 0; i < 5; i++) { const a = rnd() * TAU; part(b.x, b.y - 18, Math.cos(a) * 120, Math.sin(a) * 80 - 60, i % 2 ? '#ffd23f' : '#fff', 0.3, 2) }
        break
      }
    }
    if (b.dead) continue
    b.t += dt * sp; b.a += dt * 10 * sp
    if (G.freeze <= 0) { b.x += b.vx * dt * sp; b.y += b.vy * dt * sp }
    if ((b.x - pl.x) ** 2 + (b.y - pl.y) ** 2 < (pl.r + (b.r || 5)) ** 2) { ouch(b.dmg); b.dead = true }
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
  for (const f of G.fx) {
    f.t += dt; if (f.t > f.T) f.dead = true
    if (f.k === 'wave' && !f.done && !dead && Math.hypot(pl.x - f.x, (pl.y - f.y) / 0.8) <= f.R * Math.min(1, f.t / f.T)) { f.done = true; afflict(f.st) }   // 상태이상 물결이 나에게 닿으면
  }
  for (const n of G.nums) { n.t += dt; if (n.t > 0.7) n.dead = true }
  if (G.banner && (G.banner.t += dt) > G.banner.T) G.banner = null
  shake = Math.max(0, shake - dt * 30)
  for (const a of [G.foes, G.shots, G.eshots, G.gems, G.items, G.parts, G.fx, G.nums, G.haz]) prune(a)
  sortY(G.foes)
  // 업적 — 버틴 시간
  if (!dead) {
    for (const [s, id] of SURV) if (G.t >= s) gain(id)
    if (G.t >= 600 && G.map.id === 'arena') gain('arena10')
    if (G.t >= 600 && G.map.id === 'roof') gain('roof10')
    if (G.map.endless && G.t >= 600) gain('chal10')
    if (G.map.endless && G.t >= 1800) gain('chal30')
    if (G.t >= 600) gain(`ez_${G.ch.id}`)
    if (G.map.endless && G.t >= 3600) gain(`leg_${G.ch.id}`)
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
          b.hit.add(e); hurt(e, b.dmg * (e.boss || e.elite ? b.bx : 1), b.x - b.vx * 0.05, b.y - b.vy * 0.05, b.kb)
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
          splash(b.x1, b.y1, b.R, b.dmg, tc(b, '#ff9f43'), false, b.br); b.dead = true
          if (b.br) G.shots.push({ k: 'echo', x: b.x1, y: b.y1, t: 0, T: 0.32, R: b.R * 1.35, dmg: b.dmg, sk: b.sk })   // 돌파 — 한 번 더 크게
        }
        break
      }
      case 'echo':
        if (b.t >= b.T) { splash(b.x, b.y, b.R, b.dmg, tc(b, '#ffd23f'), true, true); shake = Math.max(shake, 3); b.dead = true }
        break
      case 'shotclock':   // 샷 클락 — 0이 되면 터진다. 돌파면 둘레에 작은 시계 셋이 흩어져 한 번 더
        if (b.t >= b.T) {
          splash(b.x, b.y, b.R, b.dmg, tc(b, b.br ? '#ffd23f' : '#ff4d4d'), !b.mini, b.br); shake = Math.max(shake, b.mini ? 1 : 3); b.dead = true
          if (b.br && !b.mini) for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + rnd(), d = b.R * 0.9; G.shots.push({ k: 'shotclock', x: b.x + Math.cos(a) * d, y: wallY(b.y + Math.sin(a) * d * 0.8), t: 0, T: 0.45, R: b.R * 0.55, dmg: b.dmg * 0.6, br: true, mini: true, sk: b.sk }) }
        }
        break
      case 'drop':   // 앨리웁 — 하늘에서
        if (b.t >= b.T) { splash(b.x, b.y, b.R, b.dmg, tc(b, '#ffd23f'), true, b.br); shake = Math.max(shake, 3); b.dead = true }
        break
      case 'ring': {   // 덩크 충격파 — 반지름이 커지며 닿은 수비를 한 번씩
        if (b.t < 0) { b.x = pl.x; b.y = pl.y; break }
        if (!b.boom) {   // 꽂히는 순간 — 바닥이 갈라지고 먼지 · SLAM!
          b.boom = true; shake = Math.max(shake, b.after ? 9 : 6)
          for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; part(b.x, b.y, Math.cos(a) * 220, Math.sin(a) * 120 - 40, '#d9c4a0', 0.4, 3) }
          fx({ k: 'crack', x: b.x, y: b.y, R: b.R * 0.75, T: 1.2 }); fx({ k: 'text', x: b.x, y: b.y - (b.after ? 84 : 64), s: b.after ? 'TOMAHAWK!' : 'SLAM!', col: tc(b, b.br ? '#ffd23f' : '#ffb35e'), T: 0.8 })
        }
        const R = b.R * Math.min(1, b.t / b.T)
        near(b.x, b.y, R, e => { if (!b.hit.has(e)) { b.hit.add(e); hurt(e, b.dmg, b.x, b.y, 220) } })
        if (b.t > b.T + 0.18) b.dead = true
        break
      }
      case 'orb': {   // 블록슛 손
        const a = b.w.ang + b.i / b.n * TAU
        b.x = pl.x + Math.cos(a) * b.R; b.y = pl.y + Math.sin(a) * b.R; b.ang = a
        if ((b.life -= dt) <= 0) { b.dead = true; break }
        near(b.x, b.y, b.r, e => { const t = b.hit.get(e); if (t === undefined || G.t - t > 0.45) { b.hit.set(e, G.t); hurt(e, b.dmg, pl.x, pl.y, 190) } })
        break
      }
      case 'slash': {   // 크로스오버 — 처음 한 번 옆으로 길게
        b.x = pl.x; b.y = pl.y
        if (!b.done) {
          b.done = true
          const x0 = Math.min(pl.x, pl.x + b.side * b.W), x1 = Math.max(pl.x, pl.x + b.side * b.W), y0 = pl.y - 12 - b.H / 2, y1 = pl.y - 12 + b.H / 2
          near((x0 + x1) / 2, (y0 + y1) / 2, b.W / 2 + b.H / 2, e => { if (e.x + e.r > x0 && e.x - e.r < x1 && e.y + e.r > y0 && e.y - e.r < y1) { hurt(e, b.dmg, pl.x, pl.y - 12, 120); if (b.br) slow(e, 0.35, 0) } })
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
      case 'trail':   // 유로스텝 잔상 — 밟은 수비를 때린다(돌파면 느리게)
        if ((b.tick -= dt) <= 0) { b.tick = 0.3; near(b.x, b.y, b.R, e => { hurt(e, b.dmg, b.x, b.y, 0); if (b.br) slow(e, 0.5, 0.7) }) }
        if (b.t > b.life) b.dead = true
        break
      case 'rebound': {   // 리바운드 — 화면 가장자리(아레나는 벽)에 튕긴다. 돌파면 튕긴 자리가 터진다
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += dt * 12
        const hx = VW / 2 - b.r, hy = VH / 2 - b.r - 10, wall = G.map.wall ? G.map.wall - b.r : Infinity
        let hit = false
        const ox = b.x - cam.x, oy = b.y - cam.y
        if (Math.abs(ox) > hx) { b.x = cam.x + Math.sign(ox) * hx; b.vx = -Math.sign(ox) * Math.abs(b.vx); hit = true }
        if (Math.abs(oy) > hy) { b.y = cam.y + Math.sign(oy) * hy; b.vy = -Math.sign(oy) * Math.abs(b.vy); hit = true }
        if (Math.abs(b.y) > wall) { b.y = Math.sign(b.y) * wall; b.vy = -Math.sign(b.y) * Math.abs(b.vy); hit = true }
        if (hit && b.br) splash(b.x, b.y, b.r * 5, b.dmg, '#7ff3ff', false, true)
        if (b.t > b.life) { b.dead = true; break }
        near(b.x, b.y, b.r, e => { const t = b.hit.get(e); if (t === undefined || G.t - t > 0.4) { b.hit.set(e, G.t); hurt(e, b.dmg, b.x, b.y, 60) } })
        break
      }
      case 'zone':   // 스크린 — 걸린 수비를 묶고 때린다. 돌파면 나를 따라다닌다
        if (b.br) { b.x = pl.x + b.ox; b.y = wallY(pl.y + b.oy) }
        if ((b.tick -= dt) <= 0) { b.tick = 0.3; near(b.x, b.y, b.R, e => { hurt(e, b.dmg, b.x, b.y, 0); slow(e, 0.4, 0.7) }) }
        if (b.t > b.life) b.dead = true
        break
    }
    if (!b.sk) continue
    if (b.sk >= 2 && FLY.has(b.k) && b.t > 0) { (b.tr ||= []).push(thPos(b, true)); if (b.tr.length > (b.sk === 4 ? 13 : 7)) b.tr.shift() }   // 혜성 꼬리(레어부터)
    if (b.dead) { if (!b.burst && b.k !== 'trail' && b.k !== 'orb' && b.k !== 'echo') { b.burst = 1; burst(b) } }
    else if (b.t > 0 && rnd() < dt * [0, 14, 28, 34, 70][b.sk]) dot(b)
  }
}
// ---- 스킬 이펙트 스킨 — 아이스(노멀) 하얀 서리 · 인페르노(레어) 솟는 불티 · 갤럭시(유니크) 무지개 별빛. 빛 그림 캐시가 늘지 않게 무지개는 12색
const HUES = Array.from({ length: 12 }, (_, i) => { const f = n => { const k = (n + i / 30 * 12) % 12; return Math.round(255 * (0.68 - 0.32 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))) }; return `rgb(${f(0)},${f(8)},${f(4)})` })
/** 이펙트 스킨이면 그 색, 아니면 원래 색(def) — trgb 는 rgba() 에 넣을 'r,g,b' */
const tc = (o, def, alt = false) => o.sk ? thCol(o.sk, (o.x || 0) * 0.02, alt) : def
const trgb = (o, def, alt = false) => o.sk ? rgbOf(thCol(o.sk, (o.x || 0) * 0.02, alt)).join(',') : def
const FLY = new Set(['ball', 'boom', 'hook', 'rebound', 'arc', 'drop', 'orb'])   // 날아가는 것 — 혜성 꼬리 · 도는 별
const thCol = (sk, seed = 0, alt = false) => sk === 3 ? HUES[((G.t * 4 + seed) % 12 + 12) % 12 | 0] : alt ? THEME[sk].c2 : THEME[sk].c
/** 그 스킬의 빛이 있는 자리 — 날아가는 공은 그 높이, 고리 · 구역은 가운데(at) 또는 그 안 아무 데나 */
function thPos(b, at = false) {
  const u = Math.min(1, Math.max(0, b.t) / (b.T || 1))
  switch (b.k) {
    case 'arc': return [b.x, b.y - 16 - 4 * b.H * u * (1 - u)]
    case 'drop': return [b.x, b.y - 16 - (1 - u) * 300]
    case 'orb': return [b.x, b.y - 14]
    case 'trail': case 'echo': return [b.x, b.y]
    case 'slash': return [pl.x + b.side * b.W * (at ? 0.55 : 0.2 + rnd() * 0.8), pl.y - 12]
    case 'ring': case 'zone': case 'shotclock': { if (at) return [b.x, b.y]; const a = rnd() * TAU, r = b.k === 'ring' ? b.R * (0.15 + u * 0.85) : b.R * Math.sqrt(rnd()); return [b.x + Math.cos(a) * r, b.y + Math.sin(a) * r * 0.8] }
    default: return [b.x, b.y - 16]
  }
}
/** 레전드 — 도는 문양 고리(두 겹 점선 · 눈금) */
function rune(c, x, y, R, col) {
  const t = G.t
  c.globalAlpha = 0.85; c.strokeStyle = col; c.lineWidth = 2
  c.setLineDash([10, 6]); c.lineDashOffset = -t * 60; c.beginPath(); c.ellipse(x, y, R * 1.14, R * 0.91, 0, 0, TAU); c.stroke()
  c.lineDashOffset = t * 40; c.beginPath(); c.ellipse(x, y, R * 0.86, R * 0.69, 0, 0, TAU); c.stroke(); c.setLineDash([])
  c.lineWidth = 1.6; c.beginPath()
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * 0.8; c.moveTo(x + Math.cos(a) * R * 0.86, y + Math.sin(a) * R * 0.69); c.lineTo(x + Math.cos(a) * R * 1.14, y + Math.sin(a) * R * 0.91) }
  c.stroke()
}
/** 고리 · 구역 테두리 한 점 — 레어는 일렁이는 불꽃, 유니크부터는 도는 별 */
function edge(c, k, x, y, R, a, col, seed) {
  const px = x + Math.cos(a) * R, py = y + Math.sin(a) * R * 0.8
  if (k === 2) { const h = (G.t * 2.2 + seed * 0.37) % 1; c.globalAlpha = 0.6 * (1 - h); bloom(c, h < 0.4 ? THEME[2].c2 : col, px, py - h * 16, 9 - h * 4) }
  else { c.globalAlpha = 0.9; c.drawImage(SPARK, px - 6, py - 6, 12, 12); c.globalAlpha = 0.5; bloom(c, col, px, py, 8) }
}
function dot(b) {   // 꼬리 한 알
  const [x, y] = thPos(b), k = b.sk, c1 = thCol(k, x * 0.02), c2 = thCol(k, 0, true)
  if (k === 1) part(x, y, (rnd() - 0.5) * 30, (rnd() - 0.5) * 30, rnd() < 0.5 ? c1 : c2, 0.45, 2)
  else if (k === 2) part(x, y, (rnd() - 0.5) * 40, -40 - rnd() * 70, rnd() < 0.6 ? c1 : c2, 0.55, 2.6)
  else { part(x, y, (rnd() - 0.5) * 50, (rnd() - 0.5) * (k === 4 ? 30 : 50) - (k === 4 ? 50 : 0), rnd() < 0.6 ? c1 : c2, 0.6, 2.4); if (G.fx.length < 150 && rnd() < (k === 4 ? 0.7 : 0.5)) fx({ k: 'spark', x, y, s: 9 + rnd() * (k === 4 ? 12 : 8), a: rnd() * TAU, T: 0.4 }) }
}
function burst(b) {   // 맞은 자리 · 끝난 자리 — 등급이 높을수록 크게
  if (G.fx.length > 170) return
  const k = b.sk, [x, y] = b.k === 'arc' ? [b.x1 ?? b.x, b.y1 ?? b.y] : b.k === 'bolt' || b.k === 'grab' || b.k === 'beam' ? [b.x, b.y] : thPos(b, true), R = Math.min(90, b.R || (b.r || 8) * 3), c1 = thCol(k, x * 0.02), c2 = thCol(k, 0, true)
  fx({ k: 'ring', x, y, R: R * (0.7 + k * 0.2), T: 0.3 + k * 0.08, col: c1 })
  if (k >= 2) fx({ k: 'flash', x, y: y - 8, R: R * 0.6, col: c2, T: 0.3 })
  if (k === 2) fx({ k: 'burn', x, y, R: Math.max(16, R * 0.6), T: 0.8, col: c1, c2 })   // 인페르노 — 맞은 자리에 불길이 잠깐
  if (k >= 3) fx({ k: 'rays', x, y: y - 6, R: R * 1.2, T: 0.45, col: c1 })   // 갤럭시 · 레전드 — 별빛 폭발
  if (k === 4) {   // 레전드 — 하늘에서 번개 · 큰 빛기둥 · 두 겹 충격파 · 금가루
    fx({ k: 'zap', x, y, T: 0.35, pts: zig(x + (rnd() - 0.5) * 70, y - 280, x, y - 6), col: c1 })
    fx({ k: 'colm', x, y, T: 0.75, col: c1, w: 30 }); fx({ k: 'ring', x, y, R: R * 1.6, T: 0.6, col: c2 }); fx({ k: 'ring', x, y, R: R * 2.2, T: 0.8, col: c1 })
    for (let i = 0; i < 8; i++) part(x + (rnd() - 0.5) * R, y - 4, (rnd() - 0.5) * 60, -120 - rnd() * 140, rnd() < 0.5 ? c1 : c2, 0.8, 2.6)
    shake = Math.max(shake, 2)
  }
  if (k >= 3) { fx({ k: 'ring', x, y, R: R * 0.5, T: 0.4, col: c2 }); for (let i = 0; i < 4; i++) fx({ k: 'spark', x: x + (rnd() - 0.5) * R, y: y - 6 + (rnd() - 0.5) * R * 0.6, s: 12 + rnd() * 10, a: rnd() * TAU, T: 0.45 }) }
  for (let i = 0; i < 3 + k * 3; i++) { const a = rnd() * TAU, v = 60 + rnd() * 100; part(x, y - 6, Math.cos(a) * v, Math.sin(a) * v * 0.6 - (k === 2 ? 70 : 20), rnd() < 0.5 ? c1 : c2, 0.45, 2.2) }
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

// ---------------------------------------------------------------- 자동사냥(네온 시티) — 16 방향 + 제자리 중 위험이 가장 적은 곳(밸런스 시뮬레이션의 봇)
// 공격형: 넓게 돌아다니며 보석 · 아이템을 쓸어 담는다. 수비형: 처음 자리 둘레에서만, 아이템은 모아 뒀다가 필요할 때만 줍고 그 밖에는 밟지 않는다
const statusOn = () => Object.keys(STATUS).some(sick)
function needItem(k, close, bossNear) {   // 수비형 — 이 아이템을 지금 주울까
  if (k === 'ring' || k === 'chest') return true
  if (k === 'drink') return pl.hp < S.maxHp * 0.45
  if (k === 'whistle') return G.gems.length > 60
  if (k === 'clock') return close >= 12 || bossNear
  if (k === 'buzzer') return close >= 16 || pl.hp < S.maxHp * 0.35
  if (k === 'spray') return statusOn()
  return false
}
function autoDir() {
  const P = pl, def = G.auto === 'def'
  const rushes = G.haz.filter(z => z.k === 'rush'), bombs = G.haz.filter(z => z.k !== 'rush')
  const cand = G.foes.filter(e => !e.dead && Math.abs(e.x - P.x) < 330 && Math.abs(e.y - P.y) < 330)
  const danger = (x, y) => {
    let v = 0
    for (const e of cand) {
      let ex = e.x + e.vx * 0.15, ey = e.y + e.vy * 0.15, w = e.type === 'big' ? 2.2 : e.type === 'mascot' ? 3 : 1
      if (e.rush) { ex += e.rush[0] * 0.25; ey += e.rush[1] * 0.25; w = 6 }
      else if (e.boss) { w = e.st === 'dash' || e.st === 'wind' ? 8 : 4; if (e.st === 'wind' || e.st === 'dash') { const u = Math.max(0, (x - e.x) * e.dx + (y - e.y) * e.dy), px = e.x + e.dx * u, py = e.y + e.dy * u; if (u < 300 && Math.hypot(x - px, y - py) < e.r + 30) v += 40 } }
      const d = Math.hypot(x - ex, y - ey); if (d < 200) v += w * (36 / (d + 8)) ** 2
    }
    for (const z of bombs) { const q = ((x - z.x) / (z.R + 26)) ** 2 + ((y - z.y) / ((z.R + 26) * 0.8)) ** 2; if (q < 1) v += 60 * (1.2 - q) }
    for (const z of rushes) { const q = z.horiz ? Math.abs(y - z.gap) : Math.abs(x - z.gap); if (q > 34) v += 30 + q * 0.02 }
    for (const e of G.eshots) { const d = Math.min(Math.hypot(x - e.x - e.vx * 0.3, y - e.y - e.vy * 0.3), Math.hypot(x - e.x, y - e.y)); if (d < 90) v += 6 * (30 / (d + 6)) ** 2 }
    if (G.map.wall && Math.abs(y) > G.map.wall - 30) v += 5
    return v
  }
  let g = null, gd = def ? 170 : 340
  for (const q of G.gems) { const d = Math.hypot(q.x - P.x, q.y - P.y); if (d < gd) { gd = d; g = q } }
  const close = cand.filter(e => !e.boss && Math.hypot(e.x - P.x, e.y - P.y) < 70).length, bossNear = cand.some(e => e.boss && Math.hypot(e.x - P.x, e.y - P.y) < 150)
  const want = it => def ? needItem(it.k, close, bossNear) : it.k !== 'drink' || P.hp < S.maxHp * 0.85
  if (!def && (!G.roam || G.t > G.roamT || Math.hypot(G.roam.x - P.x, G.roam.y - P.y) < 60)) {   // 공격형 — 갈 곳을 몇 초마다 새로(넓게 돈다)
    const a = rnd() * TAU, d = 300 + rnd() * 400; G.roam = { x: P.x + Math.cos(a) * d, y: P.y + Math.sin(a) * d }; G.roamT = G.t + 6
  }
  let best = [0, 0], bv = Infinity
  for (let i = -1; i < 16; i++) {
    const dx = i < 0 ? 0 : Math.cos(i / 16 * TAU), dy = i < 0 ? 0 : Math.sin(i / 16 * TAU), nx = P.x + dx * 40, ny = P.y + dy * 40
    let v = danger(nx, ny) + 0.6 * danger(P.x + dx * 90, P.y + dy * 90)
    if (g) v -= (def ? 0.5 : 0.9) * Math.max(0, (dx * (g.x - P.x) + dy * (g.y - P.y)) / (gd || 1))
    for (const it of G.items) {
      const d = Math.hypot(it.x - P.x, it.y - P.y) || 1, big = it.k === 'ring' || it.k === 'chest'
      if (want(it)) { if (big || d < 420) v -= (big ? 3 : 1.6) * Math.max(0, (dx * (it.x - P.x) + dy * (it.y - P.y)) / d) }
      else if (def && Math.hypot(nx - it.x, ny - it.y) < 36) v += 6   // 모아 둘 아이템은 밟지 않는다
    }
    if (def) { const hd = Math.hypot(nx - G.home.x, ny - G.home.y); if (hd > 230) v += (hd - 230) * 0.05 }   // 수비형 — 처음 자리 둘레에서만
    else if (!g) v -= 0.7 * Math.max(0, (dx * (G.roam.x - P.x) + dy * (G.roam.y - P.y)) / (Math.hypot(G.roam.x - P.x, G.roam.y - P.y) || 1))
    v -= 0.25 * (dx * Math.cos(G.autoA) + dy * Math.sin(G.autoA))
    if (i < 0) v += 0.4
    if (v < bv) { bv = v; best = [dx, dy] }
  }
  if (best[0] || best[1]) G.autoA = Math.atan2(best[1], best[0])
  return best
}
// 자동사냥 — 상자에서 고르기. 공격형은 움직이며 쓰는 스킬(유로스텝 · 덩크 · 크로스오버 · 프레스 …) · 이동 속도 · 자석, 수비형은 몸을 지키는 스킬(블록슛 · 프레스 · 스크린 …) · 체력 · 방어
const AUTO_W = {
  atk: { euro: 3.2, dunk: 3, cross: 2.8, press: 2.6, block: 2.5, rebound: 2.5, nolook: 2.4, bounce: 2.3, buzzer: 2.2, outlet: 2.2, three: 2.1, alley: 2.1, shotclock: 2.1, pass: 2, fade: 2, hook: 2, steal: 1.8, screen: 1.6 },
  def: { block: 3.2, press: 3.1, screen: 3, dunk: 2.8, shotclock: 2.7, alley: 2.5, buzzer: 2.4, three: 2.4, rebound: 2.3, hook: 2.3, outlet: 2.2, steal: 2.2, nolook: 2.1, bounce: 2, cross: 2, pass: 1.8, fade: 1.8, euro: 0.8 },
}
const AUTO_P = {
  atk: { shoes: 2.6, vision: 2.4, double: 2.4, rookie: 2.2, notes: 2.2, span: 2, weight: 2, handle: 1.8, stamina: 1.6, cardio: 1.5, clutch: 1.4, knee: 1.3, ice: 1.2 },
  def: { knee: 2.6, cardio: 2.6, ice: 2.4, notes: 2.3, span: 2.3, double: 2.2, weight: 2.1, stamina: 2, vision: 1.6, handle: 1.4, rookie: 1.4, clutch: 1.4, shoes: 1.2 },
}
function autoScore(o) {
  const m = G.auto || 'atk'
  if (o.t === 'b') return AUTO_W[m][o.id] || 2
  if (o.t === 'f') return o.id === 'drink' && pl.hp < S.maxHp * 0.5 ? 2.5 : 1.2
  if (o.t === 'p') return (AUTO_P[m][o.id] || 1.5) + (o.fresh ? 0 : 0.3)
  const own = G.weapons.find(w => w.id === o.id), mate = mateOf(o.id)
  return (AUTO_W[m][o.id] || 2) + (own ? 0.5 : 0) + (!own && mate && G.weapons.some(w => w.id === mate) ? 0.6 : 0)
}
function autoBox(box) {   // 리롤 · 제외 · 스킵도 쓴다 — 셋 다 별로면 리롤, 안 맞는 새 스킬은 칸이 모자라기 전에 제외, 그래도 별로면 스킵
  if (BOX !== box || !box.ready || !G.auto) return
  if (box.jack) return box.act('take')
  for (let guard = 0; guard < 8 && BOX === box; guard++) {
    const sc = box.opts.map(autoScore), best = Math.max(...sc), bi = sc.indexOf(best)
    if (box.brk) return box.pick(bi)
    if (best < 2 && G.rr > 0) { box.act('rr'); continue }
    const bad = box.opts.findIndex((o, i) => o.t === 'w' && o.fresh && sc[i] < 1.9)
    if (bad >= 0 && bad !== bi && G.bans > 0 && G.weapons.length >= 3) { box.act('bans'); box.pick(bad); continue }
    if (best < 1.5 && G.skips > 0) return box.act('skips')
    return box.pick(bi)
  }
  if (BOX === box) box.pick(0)
}
/** 판 중 자동사냥 버튼(네온 시티) — 끔 → 공격형 → 수비형 → 끔 */
const autoBtn = h('button', { type: 'button', className: 'sv-icon sv-autobtn', hidden: true, onclick: () => {
  if (!G?.map.farm) return
  G.auto = !G.auto ? 'atk' : G.auto === 'atk' ? 'def' : null
  if (G.auto) { G.autoUsed = true; G.home = { x: pl.x, y: pl.y }; autoSet.on = true; autoSet.mode = G.auto } else autoSet.on = false
  keepAuto(); autoUI()
} })
pauseBtn.before(autoBtn)
function autoUI() {
  autoBtn.hidden = !(G?.map.farm && (mode === 'play' || mode === 'box' || mode === 'pause'))
  autoBtn.textContent = !G?.auto ? '자동 끔' : G.auto === 'atk' ? '자동 · 공격형' : '자동 · 수비형'
  autoBtn.classList.toggle('is-on', !!G?.auto)
}
// ---------------------------------------------------------------- 레벨 업 상자 — 셋 중 하나, 잭팟이면 셋 다
/** keep — 그대로 둘 카드(제외로 한 장만 바꿀 때). 제외한 카드 · keep 에 있는 카드는 안 나온다 */
function offers(keep = []) {
  const pool = [], has = id => G.weapons.find(w => w.id === id)
  const add = o => G.banned.has(o.t + o.id) || keep.some(k => k.t === o.t && k.id === o.id) || pool.push(o)
  let wFree = 6 - G.weapons.length - keep.filter(o => o.fresh && o.t === 'w').length, pFree = 6 - Object.keys(G.passives).length - keep.filter(o => o.fresh && o.t === 'p').length
  for (const w of G.weapons) if (w.lv < 8) add({ t: 'w', id: w.id, wt: 1.1 })
  if (wFree > 0) for (const id in WEAP) if (!has(id)) add({ t: 'w', id, wt: 0.8, fresh: true })
  for (const id in G.passives) if (G.passives[id] < PASS[id].max) add({ t: 'p', id, wt: 0.9 })
  if (pFree > 0) for (const id in PASS) if (!(id in G.passives)) add({ t: 'p', id, wt: 0.6, fresh: true })
  const out = [...keep]
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
    gain('break1'); if (++G.breaks >= 3) gain('break3')
    say(`돌파 — ${BREAK[o.id].name}`, 2.6, '#ffd23f'); shake = 8
    fx({ k: 'ring', x: pl.x, y: pl.y, R: 170, T: 0.9, col: '#ffd23f' }); fx({ k: 'ring', x: pl.x, y: pl.y, R: 120, T: 0.7, col: '#c77dff' }); fx({ k: 'flash', x: pl.x, y: pl.y - 30, R: 150, col: '#9b5cff', T: 0.9 })
  } else if (o.t === 'w') {
    const w = G.weapons.find(x => x.id === o.id)
    if (w) { w.lv++; w.st = wstat(w) } else addWeapon(o.id)
    if (w?.lv === 8) gain(LV8(o.id))
    if (G.weapons.length === 6) { gain('full6'); if (G.weapons.every(x => x.lv === 8)) gain('max6') }
  } else if (o.t === 'p') { G.passives[o.id] = (G.passives[o.id] || 0) + 1; stats() }
  else if (o.id === 'drink') pl.hp = Math.min(S.maxHp, pl.hp + S.maxHp * 0.4)
  else { G.cheer++; stats() }
}
/** 새 스킬 카드 아래 — 시너지 이름 · 짝 스킬(가지고 있으면 「보유중」) · 효과 */
function synCard(o) {
  const s = o.t === 'w' && !G.weapons.some(w => w.id === o.id) && synOf(o.id)
  if (!s) return null
  const m = mateOf(o.id), own = G.weapons.some(w => w.id === m)
  return h('div', { className: `sv-syn${own ? ' is-own' : ''}` }, h('strong', {}, `시너지 · ${s[0]}`), h('p', {}, `짝: ${WEAP[m].name}`, own && h('mark', {}, '보유중')), h('p', {}, synText(s)))
}
let BOX = null
const ACTS = [['rr', '리롤'], ['skips', '스킵'], ['bans', '제외']]
function openBox() {
  const src = G.queue.shift(), chest = src === 'chest', brk = src === 'break'
  const opts = brk ? breaks() : offers()
  if (!opts.length) return   // 반지를 주웠는데 돌파할 스킬이 없으면(ringable 이 막아 거의 없다) 그냥 지나간다
  // 잭팟 — 레벨 업 1% · 챔피언 반지 20%(돌파할 스킬이 둘 이상일 때, 셋까지 한 번에) — 행운 배수 · 돈치치 2배. 트로피 상자는 50%
  const jack = (!brk || opts.length > 1) && rnd() < (chest ? 0.5 : (brk ? 0.2 : 0.01) * S.luck * (G.ch.mod.jackpot ? 2 : 1))
  mode = 'box'; calm(); pauseBtn.hidden = true
  const card = (o, i) => {
    const L = label(o)
    return h('button', { type: 'button', className: `sv-card sv-card-${o.t}`, style: `--i:${i}`, onclick: () => pick(i) },
      h('img', { src: ICON_URL[o.t === 'b' ? `${o.id}+` : o.id], alt: '' }), h('small', {}, L.lv), h('b', {}, L.name), h('span', {}, L.note), synCard(o), h('kbd', {}, String(i + 1)))
  }
  const cards = h('div', { className: 'sv-cards' }, opts.map(card)), hint = h('p', { className: 'sv-hint' })
  // 리롤 · 스킵 · 제외 — 반지(돌파) 상자에는 없다. 잭팟이면 「셋 다 받기」를 눌러야 받는다
  const btns = brk ? [] : ACTS.map(([k, s], j) => h('button', { type: 'button', className: 'sv-act', onclick: () => act(k) }, s, h('em'), h('kbd', {}, String(j + 4))))
  const takeBtn = jack && h('button', { type: 'button', className: 'sv-act sv-act-take', onclick: () => act('take') }, brk ? '모두 돌파' : '셋 다 받기')
  const root = h('div', { className: `sv-box${jack ? ' is-jackpot' : ''}${chest ? ' is-chest' : ''}${brk ? ' is-break' : ''}` },
    h('div', { className: 'sv-rays' }),
    h('p', { className: 'sv-box-title' }, brk ? '돌파' : chest ? '트로피 상자!' : `LEVEL ${G.lvl - G.queue.filter(q => q === 'level').length}`),
    h('div', { className: 'sv-chest' }, h('i', { className: 'sv-glow' }), h('i', { className: 'sv-base' }), h('i', { className: 'sv-lid' }), h('i', { className: 'sv-lock' })),
    h('p', { className: 'sv-jack' }, 'JACKPOT!!'),
    cards, hint,
    (!brk || jack) && h('div', { className: 'sv-acts' }, takeBtn, btns),
    jack && h('div', { className: 'sv-confetti', 'aria-hidden': 'true' }, Array.from({ length: 46 }, () => h('i', { style: `--x:${rnd() * 100}%;--d:${(rnd() * 0.6).toFixed(2)}s;--t:${(1.6 + rnd() * 1.4).toFixed(2)}s;--r:${(rnd() * 900 - 450) | 0}deg;--c:${pickOf(['#ffd23f', '#ff6b6b', '#5ab0ff', '#62e38a', '#fff', '#ff9be9'])}` }))))
  ui.replaceChildren(root); ui.hidden = false; ui.classList.add('is-box')
  const box = BOX = { opts, jack, brk, opened: false, ready: false, ban: false, open, pick, act }
  const sync = () => {
    root.classList.toggle('is-ban', box.ban)
    hint.textContent = box.ban ? '이번 게임에서 뺄 카드를 고르세요(다시 누르면 취소)' : jack ? (brk ? '챔피언 반지 잭팟 — 모두 돌파해요!' : '셋 다 가져요!') : brk ? '챔피언 반지 — 돌파할 스킬을 고르세요(스킬마다 한 번)' : '하나를 고르세요'
    btns.forEach((b, j) => { const k = ACTS[j][0]; b.querySelector('em').textContent = G[k]; b.disabled = !G[k]; b.classList.toggle('is-on', box.ban && k === 'bans') })
  }
  sync()
  const timer = setTimeout(open, jack || brk ? 1400 : 600)
  ui.onpointerdown = e => { if (BOX === box && !box.opened) { open(); e.preventDefault() } }
  const ready = () => { if (BOX !== box) return; box.ready = true; root.classList.add('is-ready'); (takeBtn || root.querySelector('.sv-card'))?.focus({ preventScroll: true }); if (G.auto) setTimeout(() => autoBox(box), 650) }
  if (G.auto && document.hidden) { open(); box.ready = true; return autoBox(box) }   // 가려진 탭 — 기다리지 않고 바로 고른다
  function open() {   // 이 상자가 아직 떠 있을 때만 — 시간이 다 돼서든 눌러서든 한 번
    if (box.opened || BOX !== box) return
    clearTimeout(timer); box.opened = true; root.classList.add('is-open')
    if (jack) { G.jackpots++; gain('jackpot1'); ui.append(h('i', { className: 'sv-flash' })); setTimeout(ready, 1100) }
    else setTimeout(ready, 380)
  }
  function pick(i) {
    const o = box.opts[i]
    if (!o || !box.ready || BOX !== box) return
    if (box.ban) {   // 제외 — 이번 게임에서 안 나오고, 그 자리에 새 카드
      if (o.t === 'f') return
      G.bans--; G.banned.add(o.t + o.id); box.ban = false
      box.opts = offers(box.opts.filter(x => x !== o)); box.opts.splice(i, 0, box.opts.pop())
      cards.children[i].replaceWith(card(box.opts[i], i)); return sync()
    }
    if (jack) return
    take(o); next()
  }
  function act(k) {
    if (!box.ready || BOX !== box || brk && k !== 'take') return
    if (k === 'take') { box.opts.forEach(take); return next() }
    if (!G[k]) return
    if (k === 'bans') { box.ban = !box.ban; return sync() }
    G[k]--
    if (k === 'skips') return next()
    box.opts = offers(); box.ban = false; cards.replaceChildren(...box.opts.map(card)); sync()   // 리롤 — 셋 다 새로
  }
}
function next() {
  BOX = null; ui.classList.remove('is-box'); ui.onpointerdown = null
  if (G.queue.length) return openBox()
  ui.hidden = true; mode = 'play'; pauseBtn.hidden = false
  fx({ k: 'pillar', T: 0.7 }); fx({ k: 'ring', x: pl.x, y: pl.y, R: 90, T: 0.5, col: '#7ff3ff' })   // 레벨 업 빛기둥
}
function boxKey(e) {
  if (!BOX || e.repeat) return
  if (!BOX.opened && ['Enter', 'Space'].includes(e.code)) { BOX.open(); e.preventDefault() }
  else if (BOX.jack && ['Enter', 'Space'].includes(e.code) && !e.target.closest?.('button')) { BOX.act('take'); e.preventDefault() }
  else if (/^Digit[1-6]$/.test(e.code)) { const i = +e.code.slice(5) - 1; i < 3 ? BOX.pick(i) : BOX.act(ACTS[i - 3][0]); e.preventDefault() }
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
  const X = cam.x + (shake ? (rnd() - 0.5) * shake : 0), Y = cam.y + (shake ? (rnd() - 0.5) * shake : 0), z = G?.demo ? ZOOM : 1, sc = SC * z
  cx.setTransform(sc, 0, 0, sc, W / 2 - X * sc, H / 2 - Y * sc)
  floor(cx, G ? G.map : MAPS[menuMap], X - VW / z / 2, Y - VH / z / 2, VW / z, VH / z, tnow)
  if (!G) return
  world(cx)
  if (!G.demo) hud()
}
function world(c) {
  const t = G.t
  // ---- 바닥에 깔리는 것: 갈라진 자국 · 프레스 · 스크린 구역 · 충격파 · 고리 · 내 발밑 고리
  for (const f of G.fx) if (f.k === 'crack') { c.globalAlpha = Math.min(1, (f.T - f.t) * 1.5); c.drawImage(CRACK, f.x - f.R, f.y - f.R * 0.55, f.R * 2, f.R * 1.1) }
  c.globalAlpha = 1
  const press = G.weapons.find(w => w.id === 'press')
  if (press?.R) {
    const R = press.R, p = 1 - Math.max(0, press.t) / Math.max(0.2, press.st.cd * S.cdr)   // 다음 압박까지 차오른다
    const rgb = trgb(press, press.br ? '255,190,60' : '255,70,70'), g = c.createRadialGradient(pl.x, pl.y, R * 0.15, pl.x, pl.y, R); g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${0.12 + p * 0.16})`)
    c.fillStyle = g; c.beginPath(); c.ellipse(pl.x, pl.y, R, R * 0.8, 0, 0, TAU); c.fill()
    c.strokeStyle = press.sk ? tc(press, '', true) : press.br ? 'rgba(255,225,140,.85)' : 'rgba(255,150,150,.7)'; c.lineWidth = 2; c.setLineDash([12, 9]); c.lineDashOffset = -t * 50; c.stroke(); c.setLineDash([])
    if (press.br) { c.strokeStyle = 'rgba(199,125,255,.6)'; c.lineWidth = 1.6; c.setLineDash([4, 10]); c.lineDashOffset = t * 30; c.beginPath(); c.ellipse(pl.x, pl.y, R * 0.92, R * 0.74, 0, 0, TAU); c.stroke(); c.setLineDash([]) }
  }
  for (const b of G.shots) if (b.k === 'zone') {
    const a = Math.min(1, (b.life - b.t) * 3), u = (b.t * 3.3) % 1
    c.globalAlpha = a; c.fillStyle = `rgba(${trgb(b, b.br ? '255,200,70' : '90,176,255')},.17)`; c.beginPath(); c.ellipse(b.x, b.y, b.R, b.R * 0.8, 0, 0, TAU); c.fill()
    c.strokeStyle = tc(b, b.br ? '#ffd23f' : '#7fc8ff'); c.lineWidth = 2; c.setLineDash([8, 6]); c.lineDashOffset = t * 30; c.stroke(); c.setLineDash([])
    c.globalAlpha = a * (1 - u); c.beginPath(); c.ellipse(b.x, b.y, b.R * u, b.R * u * 0.8, 0, 0, TAU); c.stroke(); c.globalAlpha = 1
  }
  for (const b of G.shots) if (b.k === 'shotclock') {   // 샷 클락 — 바닥 원, 테두리가 시계 방향으로 줄어든다
    const u = Math.min(1, b.t / b.T), rgb = trgb(b, b.br ? '255,210,63' : '255,77,77')
    c.fillStyle = `rgba(${rgb},${0.1 + u * 0.16})`; c.beginPath(); c.ellipse(b.x, b.y, b.R, b.R * 0.8, 0, 0, TAU); c.fill()
    c.strokeStyle = `rgba(${rgb},.9)`; c.lineWidth = 3; c.beginPath(); c.ellipse(b.x, b.y, b.R, b.R * 0.8, 0, -Math.PI / 2 + TAU * u, Math.PI * 1.5); c.stroke()
  }
  for (const b of G.shots) if (b.k === 'ring' && b.t >= 0) {   // 덩크 충격파 — 두 겹 고리
    const u = Math.min(1, b.t / b.T), R = b.R * (0.15 + u * 0.85)
    c.globalAlpha = 1 - u * 0.8; c.strokeStyle = tc(b, b.br ? '#fff3b0' : '#fff', true); c.lineWidth = 9 * (1 - u) + 2; c.beginPath(); c.ellipse(b.x, b.y, R, R * 0.78, 0, 0, TAU); c.stroke()
    c.strokeStyle = tc(b, b.br ? '#c77dff' : '#ffb35e'); c.lineWidth = 4; c.beginPath(); c.ellipse(b.x, b.y, R * 0.78, R * 0.6, 0, 0, TAU); c.stroke(); c.globalAlpha = 1
  }
  for (const f of G.fx) if (f.k === 'ring') {
    const u = f.t / f.T; c.globalAlpha = 1 - u; c.strokeStyle = f.col; c.lineWidth = 5 * (1 - u) + 1; c.beginPath(); c.ellipse(f.x, f.y, f.R * (0.3 + u * 0.7), f.R * (0.24 + u * 0.56), 0, 0, TAU); c.stroke()
  }
  for (const f of G.fx) if (f.k === 'wave') {   // 상태이상 물결 — 이 고리 밖이면 안 걸린다
    const u = Math.min(1, f.t / f.T), R = f.R * u
    c.globalAlpha = 1 - u * 0.4; c.fillStyle = rgba(f.col, 0.13); c.strokeStyle = f.col; c.lineWidth = 6; c.beginPath(); c.ellipse(f.x, f.y, R, R * 0.8, 0, 0, TAU); c.fill(); c.stroke()
  }
  c.globalAlpha = 1
  // 바닥 경고 — 폭격 · 착지는 붉은 원이 차오르고, 러시는 들어오는 쪽 화살표와 빈자리(초록 줄)
  for (const z of G.haz) {
    const u = clamp(z.t / z.T, 0, 1)
    if (z.k === 'rush') {
      const H = z.horiz, x0 = cam.x - VW / 2, y0 = cam.y - VH / 2
      c.fillStyle = `rgba(80,255,140,${0.18 + Math.sin(t * 16) * 0.06})`; H ? c.fillRect(x0, z.gap - 52, VW, 104) : c.fillRect(z.gap - 52, y0, 104, VH)
      c.strokeStyle = 'rgba(120,255,170,.9)'; c.lineWidth = 2; c.setLineDash([10, 8]); c.lineDashOffset = -t * 40; c.beginPath()
      for (const o of [-52, 52]) H ? (c.moveTo(x0, z.gap + o), c.lineTo(x0 + VW, z.gap + o)) : (c.moveTo(z.gap + o, y0), c.lineTo(z.gap + o, y0 + VH))
      c.stroke(); c.setLineDash([])
      c.globalAlpha = 0.6 + Math.sin(t * 20) * 0.3
      for (let q = -2; q <= 2; q++) H ? label2(c, z.dir > 0 ? '▶' : '◀', cam.x - z.dir * (VW / 2 - 26), cam.y + q * VH * 0.2 + 8, 26, '#ff4d4d') : label2(c, z.dir > 0 ? '▼' : '▲', cam.x + q * VW * 0.2, cam.y - z.dir * (VH / 2 - 34), 26, '#ff4d4d')
      c.globalAlpha = 1
      continue
    }
    if (z.t <= 0) continue
    const R = z.R
    c.fillStyle = `rgba(255,50,50,${0.1 + u * 0.15})`; c.beginPath(); c.ellipse(z.x, z.y, R, R * 0.8, 0, 0, TAU); c.fill()
    c.strokeStyle = `rgba(255,90,90,${0.55 + u * 0.45})`; c.lineWidth = 2.2; c.stroke()
    c.fillStyle = `rgba(255,70,40,${0.2 + u * 0.3})`; c.beginPath(); c.ellipse(z.x, z.y, R * u, R * u * 0.8, 0, 0, TAU); c.fill()
    lines(c, [[z.x - 9, z.y, z.x + 9, z.y], [z.x, z.y - 7, z.x, z.y + 7]], 'rgba(255,225,225,.85)', 1.6)
  }
  for (const b of G.shots) if (b.k === 'trail') {   // 유로스텝 잔상 — 바닥 빛 + 내 그림자(희미하게)
    const a = Math.max(0, 1 - b.t / b.life)
    c.globalAlpha = 0.3 * a; c.fillStyle = tc(b, b.br ? '#ffd23f' : '#7ff3ff'); c.beginPath(); c.ellipse(b.x, b.y, b.R, b.R * 0.45, 0, 0, TAU); c.fill()
    c.globalAlpha = 0.28 * a; blit(c, (b.fx > 0 ? pl.spr.R : pl.spr.L)[b.fr], b.x, b.y)
  }
  c.globalAlpha = 1
  let si = 0   // 상태이상 — 발밑에 그 색 고리
  for (const id in STATUS) if (sick(id)) { const r = 22 + si++ * 5; c.strokeStyle = rgba(STATUS[id].col, 0.6 + Math.sin(t * 8) * 0.3); c.lineWidth = 2.6; c.beginPath(); c.ellipse(pl.x, pl.y, r, r * 0.4, 0, 0, TAU); c.stroke() }
  // 내 발밑 — 유니폼 색 고리 + 도는 빛
  const ring = G.ch.c[0] === '#fdb927' ? '#ffd23f' : brighten(G.ch.c[0], 40) === G.ch.c[0] ? shade(G.ch.c[0], 1.6) : G.ch.c[1]   // 아주 어두운 유니폼(히트 검정)은 보조색
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
  c.strokeStyle = `rgba(255,40,40,${0.8 + Math.sin(t * 20) * 0.2})`; c.lineWidth = 3.4; c.beginPath()   // 흥분한 수비 — 발밑에 붉은 고리
  for (const e of G.foes) if (e.rage > G.t && onScreen(e, 60)) { c.moveTo(e.x + e.r * 1.25, e.y); c.ellipse(e.x, e.y, e.r * 1.25, e.r * 0.48, 0, 0, TAU) }
  c.stroke()
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
    blit(c, img, e.x, e.y - e.z, e.sc || 1)
    c.globalAlpha = 1
    if ((e.elite || e.boss) && e.hp < e.max) { const w = e.r * 2.2; c.fillStyle = '#000a'; c.fillRect(e.x - w / 2, e.y + 6, w, 4); c.fillStyle = e.boss ? '#ffd23f' : '#ff6b6b'; c.fillRect(e.x - w / 2, e.y + 6, w * Math.max(0, e.hp / e.max), 4) }
  }
  if (!drawn) drawMe(c)
  // ---- 날아가는 것
  for (const b of G.shots) {
    if (b.k === 'ball' || b.k === 'boom' || b.k === 'hook') {
      const big = b.k === 'hook', s = ballOf(b, big), k = big ? b.r / 11.5 : b.k === 'boom' ? b.r / 8 : 1
      const vx = b.k === 'boom' ? b.dx * b.v : b.vx, vy = b.k === 'boom' ? b.dy * b.v : b.vy
      for (let i = 3; i >= 1; i--) { c.globalAlpha = 0.16 * (4 - i) / 3; blit(c, s, b.x - vx * 0.018 * i, b.y - 16 - vy * 0.018 * i, k) }   // 잔상
      c.globalAlpha = 1
      c.save(); c.translate(b.x, b.y - 16); c.rotate(b.a); blit(c, s, 0, 0, k); c.restore()
    } else if (b.k === 'arc') {
      const u = Math.min(1, b.t / b.T), z = 4 * b.H * u * (1 - u)
      c.save(); c.translate(b.x, b.y - 16 - z); c.rotate(b.a); blit(c, ballOf(b), 0, 0, 1 + z / 240); c.restore()
    } else if (b.k === 'drop') {
      const u = Math.min(1, b.t / b.T), R = b.R * (1.3 - u * 0.3)
      c.strokeStyle = `rgba(${trgb(b, b.br ? '199,125,255' : '255,210,63')},${0.3 + u * 0.6})`; c.lineWidth = 2.4; c.beginPath(); c.ellipse(b.x, b.y, R, R * 0.5, 0, 0, TAU); c.stroke()
      c.setLineDash([6, 6]); c.lineDashOffset = t * 40; c.beginPath(); c.ellipse(b.x, b.y, R * 0.6, R * 0.3, 0, 0, TAU); c.stroke(); c.setLineDash([])
      blit(c, ballOf(b), b.x, b.y - 16 - (1 - u) * 300, 1.3)
    } else if (b.k === 'orb') {
      for (let i = 2; i >= 0; i--) {   // 손 잔상
        const a = b.w.ang - i * 0.22 + b.i / b.n * TAU
        c.globalAlpha = i ? 0.14 / i : 1
        c.save(); c.translate(pl.x + Math.cos(a) * b.R, pl.y + Math.sin(a) * b.R - 14); c.rotate(a + Math.PI / 2); blit(c, b.sk ? TH[b.sk] : b.br ? HANDG : HAND, 0, 0, Math.min(1.6, b.r / 10)); c.restore()
      }
      c.globalAlpha = 1
    } else if (b.k === 'slash') {   // 크로스오버 — 초승달 궤적
      const u = b.t / b.T, y = pl.y - 12, x0 = pl.x + b.side * 8, x1 = pl.x + b.side * b.W, mx = (x0 + x1) / 2
      const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(${trgb(b, b.br ? '255,243,176' : '255,255,255', true)},.95)`); g.addColorStop(1, `rgba(${trgb(b, b.br ? '199,125,255' : '127,243,255')},.95)`)
      c.globalAlpha = 1 - u * u; c.fillStyle = g
      c.beginPath(); c.moveTo(x0, y - b.H * 0.1); c.quadraticCurveTo(mx, y - b.H * (0.95 + u * 0.3), x1, y); c.quadraticCurveTo(mx, y - b.H * 0.3, x0, y + b.H * 0.1); c.fill()
      c.beginPath(); c.moveTo(x0, y + 2); c.quadraticCurveTo(mx, y + b.H * 0.75, x1, y + 4); c.quadraticCurveTo(mx, y + b.H * 0.25, x0, y + 2); c.fill()
      c.globalAlpha = 1
      blit(c, ballOf(b), x0 + (x1 - x0) * Math.min(1, u * 1.6), y + 4, 0.8)
    } else if (b.k === 'shotclock') {   // 전광판 — 24 에서 0 까지 빠르게
      const y = b.y - (b.mini ? 30 : 46), s = b.mini ? 0.7 : 1
      rr(c, b.x - 17 * s, y - 15 * s, 34 * s, 22 * s, 4, '#14171dee'); label2(c, String(Math.ceil(24 * Math.max(0, 1 - b.t / b.T))), b.x, y + 3 * s, 17 * s, b.br ? '#ffd23f' : '#ff3b3b')
    } else if (b.k === 'zone') blit(c, pl.spr.mate, b.x, b.y)
    else if (b.k === 'rebound') { c.save(); c.translate(b.x, b.y - 16); c.rotate(b.a); blit(c, ballOf(b), 0, 0, b.r / 7.5); c.restore() }
  }
  for (const b of G.eshots) { c.save(); c.translate(b.x, b.y - 18); c.rotate(b.a); blit(c, b.k === 'ball' ? BALL : b.k === 'card' ? CARD : WHISTLE, 0, 0, b.k === 'ball' ? 1.3 : 1); c.restore() }
  for (const f of G.fx) if (f.k === 'puff') {   // 쓰러질 때 연기
    const u = f.t / f.T; c.globalAlpha = 0.55 * (1 - u)
    for (let i = 0; i < 3; i++) { const a = f.a + i * 2.1, d = f.r * u * 0.9; c.drawImage(glow('#ffffff'), f.x + Math.cos(a) * d - f.r, f.y - f.r * 1.2 + Math.sin(a) * d * 0.6 - f.r, f.r * 2, f.r * 2) }
  }
  c.globalAlpha = 1
  // ---- 빛 — 더해 그린다(lighter)
  c.globalCompositeOperation = 'lighter'
  for (const it of G.items) { c.globalAlpha = 0.45 + Math.sin(it.t * 5) * 0.25; bloom(c, it.k === 'ring' ? '#b46bff' : it.k === 'chest' ? '#ffb400' : '#9fd8ff', it.x, it.y - 12, it.k === 'ring' ? 40 : 26) }
  for (const e of G.foes) if (e.boss && onScreen(e, 80)) { const w = e.st === 'wind' || e.act; c.globalAlpha = w ? 0.45 : 0.22 + Math.sin(t * 6) * 0.08; bloom(c, w ? '#ff3030' : '#ffb400', e.x, e.y - e.z - e.r * 0.8, e.r * 2.4) }
  for (const b of G.eshots) if (b.k) { c.globalAlpha = 0.6; bloom(c, '#ff3b3b', b.x, b.y - 18, 18) }   // 못 막는 것은 붉게
  c.globalAlpha = 1
  for (const b of G.shots) {
    if (b.k === 'ball') { c.globalAlpha = 0.7; bloom(c, tc(b, b.col || '#ff8a2a'), b.x, b.y - 16, 15) }
    else if (b.k === 'boom') { c.globalAlpha = 0.8; bloom(c, tc(b, '#3fe0ff'), b.x, b.y - 16, b.r * 2.2) }
    else if (b.k === 'hook') { c.globalAlpha = 0.55; bloom(c, tc(b, '#ffffff'), b.x, b.y - 16, b.r * 2.2) }
    else if (b.k === 'arc') { const u = Math.min(1, b.t / b.T); c.globalAlpha = 0.7; bloom(c, tc(b, '#ff8a2a'), b.x, b.y - 16 - 4 * b.H * u * (1 - u), 16) }
    else if (b.k === 'drop') {   // 불꼬리
      const u = Math.min(1, b.t / b.T), y = b.y - 16 - (1 - u) * 300
      for (let i = 0; i < 5; i++) { c.globalAlpha = 0.6 - i * 0.1; bloom(c, i < 2 ? tc(b, '#ffd23f', true) : tc(b, '#ff5a1a'), b.x + Math.sin(t * 40 + i) * 2, y - i * 13, 14 - i * 1.6) }
    } else if (b.k === 'orb') { c.globalAlpha = b.sk ? 0.75 : 0.45; bloom(c, tc(b, '#ffe2c0'), b.x, b.y - 14, b.sk ? 26 : 18) }
    else if (b.k === 'ring' && b.t >= 0) { const u = Math.min(1, b.t / b.T); c.globalAlpha = 0.6 * (1 - u); bloom(c, tc(b, b.br ? '#ffc94a' : '#ffb35e'), b.x, b.y - 6, b.R * (0.4 + u * 0.6)) }
    else if (b.k === 'rebound') { c.globalAlpha = 0.6; bloom(c, tc(b, '#7ff3ff'), b.x, b.y - 16, b.r * 2.4) }
    if (!b.br || b.k === 'ring' || b.k === 'echo' || b.k === 'trail') continue
    // 돌파 — 보랏빛 기운을 한 겹 더
    c.globalAlpha = 0.35 + Math.sin(t * 9 + b.x * 0.05) * 0.1
    if (b.k === 'orb') bloom(c, '#b46bff', b.x, b.y - 14, 30)
    else if (b.k === 'zone') bloom(c, '#ffc94a', b.x, b.y - 30, 44)
    else if (b.k === 'slash') bloom(c, '#b46bff', pl.x + b.side * b.W * 0.5, pl.y - 12, b.W * 0.6)
    else if (b.k === 'drop') bloom(c, '#b46bff', b.x, b.y - 16 - (1 - Math.min(1, Math.max(0, b.t) / b.T)) * 300, 30)
    else if (b.k === 'arc') { const u = Math.min(1, b.t / b.T); bloom(c, '#b46bff', b.x, b.y - 16 - 4 * b.H * u * (1 - u), 26) }
    else bloom(c, '#b46bff', b.x, b.y - 16, (b.r || 7) * 3.4)
  }
  for (const b of G.shots) if (b.sk && b.t >= 0) {   // 스킬 이펙트 스킨 — 그 색 빛을 한 겹 더
    const k = b.sk, col = thCol(k, b.x * 0.02), [x, y] = thPos(b, true)
    c.globalAlpha = [0, 0.45, 0.6, 0.72, 0.8][k]
    if (b.k === 'ring' || b.k === 'zone' || b.k === 'shotclock') {
      const R = b.k === 'ring' ? b.R * (0.15 + Math.min(1, b.t / b.T) * 0.85) : b.R
      c.strokeStyle = col; c.lineWidth = 1.5 + k; c.beginPath(); c.ellipse(b.x, b.y, R, R * 0.8, 0, 0, TAU); c.stroke()
      if (k >= 3) { c.setLineDash([6, 8]); c.lineDashOffset = -t * 40; c.beginPath(); c.ellipse(b.x, b.y, R * 1.12, R * 0.9, 0, 0, TAU); c.stroke(); c.setLineDash([]) }
    } else if (b.k === 'trail') { c.globalAlpha *= Math.max(0, 1 - b.t / b.life); bloom(c, col, b.x, b.y, b.R * 1.3) }
    else if (b.k === 'slash') bloom(c, col, x, y, b.W * 0.5)
    else { bloom(c, col, x, y, (b.r || 8) * (1.8 + k * 0.7)); if (k >= 3) { c.globalAlpha = 0.85; bloom(c, '#ffffff', x, y, (b.r || 8) * 0.9) } }
    if (k < 2) continue
    const r = b.r || 8
    if (b.tr) b.tr.forEach(([px, py], i, a) => { const q = (i + 1) / a.length; c.globalAlpha = 0.55 * q; bloom(c, i % 2 ? thCol(k, px * 0.02, true) : col, px, py, r * (0.8 + q * 1.4)) })   // 혜성 꼬리
    if (b.k === 'ring' || b.k === 'zone' || b.k === 'shotclock' || b.k === 'trail') {   // 테두리 — 불꽃(레어) · 도는 별(유니크부터)
      const R = b.k === 'ring' ? b.R * (0.15 + Math.min(1, b.t / b.T) * 0.85) : b.k === 'trail' ? b.R * 0.7 : b.R, n = b.k === 'trail' ? 3 : 8
      for (let i = 0; i < n; i++) edge(c, k, b.x, b.y, R, i / n * TAU + t * (k >= 3 ? 1.6 : 0.4), col, b.x * 0.02 + i)
      if (k === 4 && b.k !== 'trail') rune(c, b.x, b.y, R, col)
    }
    if (k >= 3 && FLY.has(b.k)) { const n = k === 4 ? 3 : 2; for (let i = 0; i < n; i++) { const a = t * 8 + i * TAU / n + b.x * 0.05, d = r * (k === 4 ? 2.3 : 1.9), z = k === 4 ? 16 : 12; c.globalAlpha = 0.95; c.drawImage(SPARK, x + Math.cos(a) * d - z / 2, y + Math.sin(a) * d * 0.7 - z / 2, z, z) } }   // 도는 별
    if (k === 4 && FLY.has(b.k)) {   // 레전드 — 하얗게 타는 심 · 둘레에 튀는 금빛 전기
      c.globalAlpha = 0.5; bloom(c, '#fff7d6', x, y, r * 4.2)
      c.globalAlpha = 0.9; c.strokeStyle = '#fff7d6'; c.lineWidth = 1.3; c.lineJoin = 'round'
      for (let j = 0; j < 2; j++) { const a = rnd() * TAU; let px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; c.beginPath(); c.moveTo(px, py); for (let q = 0; q < 3; q++) { px += Math.cos(a) * 6 + (rnd() - 0.5) * 7; py += Math.sin(a) * 6 + (rnd() - 0.5) * 7; c.lineTo(px, py) } c.stroke() }
    }
  }
  const pw = G.weapons.find(w => w.id === 'press' && w.sk && w.R)
  if (pw) {
    c.globalAlpha = 0.55; c.strokeStyle = thCol(pw.sk); c.lineWidth = 2 + pw.sk; c.beginPath(); c.ellipse(pl.x, pl.y, pw.R, pw.R * 0.8, 0, 0, TAU); c.stroke()
    if (pw.sk >= 2) for (let i = 0; i < 10; i++) edge(c, pw.sk, pl.x, pl.y, pw.R, i / 10 * TAU + t * (pw.sk >= 3 ? 1.2 : 0.3), thCol(pw.sk, i), i)
    if (pw.sk === 4) rune(c, pl.x, pl.y, pw.R, thCol(4))
  }
  for (const f of G.fx) {   // 불길 · 별빛 폭발 · 빛기둥(이펙트 스킨 터짐)
    const u = f.t / f.T
    if (f.k === 'burn') for (let i = 0; i < 5; i++) { const h = (u * 1.4 + i * 0.21) % 1; c.globalAlpha = 0.6 * (1 - u) * (1 - h); bloom(c, i % 2 ? f.c2 : f.col, f.x + Math.cos(i * 1.3) * f.R * 0.6, f.y - 4 - h * f.R, f.R * (0.6 - h * 0.3)) }
    else if (f.k === 'rays') { c.globalAlpha = 1 - u; c.strokeStyle = f.col; c.lineWidth = 2.4 * (1 - u) + 0.6; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + 0.3; c.moveTo(f.x + Math.cos(a) * f.R * u * 0.4, f.y + Math.sin(a) * f.R * u * 0.3); c.lineTo(f.x + Math.cos(a) * f.R * (0.35 + u * 0.75), f.y + Math.sin(a) * f.R * (0.3 + u * 0.55)) } c.stroke() }
    else if (f.k === 'colm') { const H = f.w ? 260 : 140, w = (f.w || 18) * (1 - u * 0.5), g = c.createLinearGradient(0, f.y - H, 0, f.y); g.addColorStop(0, rgba(f.col, 0)); g.addColorStop(1, rgba(f.col, 0.6)); c.globalAlpha = 1 - u; c.fillStyle = g; c.fillRect(f.x - w / 2, f.y - H, w, H); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(f.x - w / 8, f.y - H, w / 4, H) }
    else if (f.k === 'zap') { c.globalAlpha = 1 - u; c.lineJoin = 'round'; c.strokeStyle = rgba(f.col, 0.55); c.lineWidth = 12; c.beginPath(); f.pts.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.stroke(); c.strokeStyle = '#fffbe6'; c.lineWidth = 3.5; c.stroke(); bloom(c, f.col, f.x, f.y - 6, 46) }
  }
  for (const f of G.fx) if (f.sk) {   // 번개 · 빛줄기 · 손 자국도 그 색
    const u = f.t / f.T, col = thCol(f.sk, f.x * 0.02)
    c.globalAlpha = 1 - u; c.strokeStyle = col
    if (f.k === 'bolt') { c.lineWidth = 3 + f.sk * 2; c.lineJoin = 'round'; c.beginPath(); f.pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke() }
    else if (f.k === 'beam') { c.save(); c.translate(f.x, f.y); c.rotate(f.a); c.fillStyle = col; c.globalAlpha = 0.5 * (1 - u); c.fillRect(0, -f.W * 0.5, f.L, f.W); c.restore() }
    else if (f.k === 'grab') { c.lineWidth = 4 + f.sk; c.beginPath(); c.moveTo(f.x0, f.y0); c.lineTo(f.x, f.y); c.stroke() }
  }
  for (const f of G.fx) {
    const u = f.t / f.T
    if (f.k === 'bolt') {   // 버저비터 — 지그재그 번개
      c.globalAlpha = 1 - u
      c.strokeStyle = `rgba(${trgb(f, f.br ? '180,107,255' : '255,225,110')},.5)`; c.lineWidth = 11; c.lineJoin = 'round'; c.beginPath(); f.pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke()
      c.strokeStyle = tc(f, f.br ? '#fff3c4' : '#fffbe6', true); c.lineWidth = 3; c.stroke()
      bloom(c, tc(f, f.br ? '#c77dff' : '#ffe066'), f.x, f.y, f.R * (1.6 - u * 0.6))
    } else if (f.k === 'spark') { c.globalAlpha = 1 - u; const s = f.s * (1 - u * 0.5); c.save(); c.translate(f.x, f.y); c.rotate(f.a + u * 2); c.drawImage(SPARK, -s / 2, -s / 2, s, s); c.restore() }
    else if (f.k === 'flash') { c.globalAlpha = 0.8 * (1 - u); bloom(c, f.col, f.x, f.y, f.R * (0.6 + u)) }
    else if (f.k === 'beam') {   // 아웃렛 패스 — 빛줄기
      const col = trgb(f, f.br ? '255,200,80' : '127,243,255'), k = 1 - u * 0.6, g = c.createLinearGradient(0, -f.W, 0, f.W)
      g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.5, `rgba(${col},.95)`); g.addColorStop(1, `rgba(${col},0)`)
      c.save(); c.translate(f.x, f.y); c.rotate(f.a); c.globalAlpha = 1 - u; c.fillStyle = g; c.fillRect(0, -f.W * k, f.L, f.W * 2 * k)
      c.fillStyle = '#fff'; c.fillRect(0, -2 * k, f.L, 4 * k); c.restore()
    } else if (f.k === 'grab') {   // 스틸 — 뻗은 손 자국
      c.globalAlpha = 1 - u; c.strokeStyle = tc(f, f.br ? '#ffd23f' : '#ffe2c0'); c.lineWidth = 5 * (1 - u) + 1; c.lineCap = 'round'; c.beginPath(); c.moveTo(f.x0, f.y0); c.lineTo(f.x, f.y); c.stroke()
      bloom(c, tc(f, f.br ? '#b46bff' : '#ffb35e'), f.x, f.y, 34)
    }
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
  for (const f of G.fx) if (f.k === 'grab') { c.globalAlpha = 1 - f.t / f.T; c.save(); c.translate(f.x, f.y); c.rotate(Math.atan2(f.y - f.y0, f.x - f.x0) + Math.PI / 2); blit(c, f.sk ? TH[f.sk] : f.br ? HANDG : HAND, 0, 0, 1.3); c.restore() }
  // 보스 말풍선 — 나올 때 한마디(흰 풍선), 상태이상은 그 이름을 외친다(검은 풍선 · 그 색 글자)
  for (const f of G.fx) if (f.k === 'shout') {
    const e = f.e, u = f.t / f.T, st = f.col !== '#fff', x = e.x, y = e.y - e.z - e.r * (e.sc || 1) * 4.4 - 6, size = st ? 19 : 14
    c.globalAlpha = u < 0.08 ? u / 0.08 : u > 0.8 ? (1 - u) / 0.2 : 1
    c.font = `900 ${size}px system-ui, sans-serif`; const w = c.measureText(f.s).width + size * 1.2, h = size * 1.7
    c.fillStyle = st ? '#151922' : '#fff'; c.beginPath(); c.roundRect(x - w / 2, y - h - 7, w, h, h / 2); c.moveTo(x - 6, y - 8); c.lineTo(x + 6, y - 8); c.lineTo(x, y); c.fill()
    if (st) { c.strokeStyle = f.col; c.lineWidth = 2; c.beginPath(); c.roundRect(x - w / 2, y - h - 7, w, h, h / 2); c.stroke() }
    c.fillStyle = st ? f.col : '#1a1d26'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(f.s, x, y - 7 - h / 2)
  }
  c.globalAlpha = 1
}
function drawMe(c) {
  const s = pl.spr, fr = pl.moving ? (G.t * 10 | 0) & 3 : 0, img = (pl.fx > 0 ? s.R : s.L)[fr]
  const jz = pl.jump > 0 ? Math.sin((1 - pl.jump / 0.3) * Math.PI) * 30 : 0
  if (G.dying) { c.save(); c.globalAlpha = Math.max(0, G.dying); c.translate(pl.x, pl.y); c.rotate((1 - G.dying) * 1.4 * pl.fx); blit(c, img, 0, 0); c.restore(); return }
  if (G.aura) aura(c, G.aura, pl.x, pl.y - jz, false)
  if (pl.inv > 0 && pl.inv < 99 && (G.t * 18 | 0) % 2) c.globalAlpha = 0.45
  blit(c, img, pl.x, pl.y - jz)
  c.globalAlpha = 1
  if (G.aura) aura(c, G.aura, pl.x, pl.y - jz, true)
  if (!jz) {   // 드리블 — 공 스킨이면 그 공 · 동물(튈 때 살짝 눌린다)
    const bz = Math.abs(Math.sin(G.t * 9)) * 13, bx = pl.x + pl.fx * 11, by = pl.y - 3 - bz, sp = G.ball && BALLSK[G.ball]
    if (!sp) blit(c, BALL, bx, by, 0.75)
    else {
      const q = 1 - Math.max(0, 1 - bz / 4) * 0.18
      c.save(); c.translate(bx, by + 4); c.scale(pl.fx * (2 - q), q); blit(c, sp, 0, -4, SKIN[G.ball].pet ? 0.85 : 0.75); c.restore()
      const gk = SKIN[G.ball].glow
      if (gk) ballGlow(c, gk, bx, by)
    }
  }
  const w = 30, f = pl.hp / S.maxHp   // 체력
  c.fillStyle = '#000b'; c.fillRect(pl.x - w / 2 - 1, pl.y + 8, w + 2, 5)
  c.fillStyle = f > 0.5 ? '#62e38a' : f > 0.25 ? '#ffd23f' : '#ff4d4d'; c.fillRect(pl.x - w / 2, pl.y + 9, w * f, 3)
}
/** 빛나는 공 — 드리블할 때 빛 · 불티 · 별빛 · 번개 · 무지개 꼬리 */
function ballGlow(c, k, x, y) {
  const t = G.t, col = { gold: '#ffd23f', fire: '#ff6a00', storm: '#7ff3ff', lucky: '#62e38a', crown: '#ffd23f' }[k] || HUES[(t * 6 | 0) % 12]
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = k === 'gold' ? 0.5 : 0.65; bloom(c, col, x, y, k === 'gold' ? 14 : 18); c.restore()
  if (k === 'gold') return
  if (k === 'fire' && rnd() < 0.6) part(x + (rnd() - 0.5) * 8, y - 4, (rnd() - 0.5) * 20, -50 - rnd() * 40, rnd() < 0.5 ? '#ff6a00' : '#ffd23f', 0.5, 2)
  if ((k === 'galaxy' || k === 'crown') && G.fx.length < 150 && rnd() < 0.15) fx({ k: 'spark', x: x + (rnd() - 0.5) * 16, y: y + (rnd() - 0.5) * 16, s: 7 + rnd() * 6, a: rnd() * TAU, T: 0.35 })
  if (k === 'lucky' && rnd() < 0.3) part(x + (rnd() - 0.5) * 10, y, (rnd() - 0.5) * 30, -30 - rnd() * 30, rnd() < 0.5 ? '#62e38a' : '#fff', 0.5, 1.8)
  if (k === 'rainbow' && rnd() < 0.8) part(x, y, (rnd() - 0.5) * 20, (rnd() - 0.5) * 20, HUES[rnd() * 12 | 0], 0.45, 2.2)
  if (k === 'storm' && (t * 14 | 0) % 4 === 0) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = '#e9fbff'; c.lineWidth = 1; c.beginPath(); let px = x, py = y; c.moveTo(px, py); for (let i = 0; i < 3; i++) { px += (rnd() - 0.5) * 12; py += (rnd() - 0.5) * 12; c.lineTo(px, py) } c.stroke(); c.restore() }
}
/** 옷 오라 — 유니크(불꽃 · 후광 · 번개) · 레전더리(바닥 문양 · 빛기둥 · 별빛 · 발자국). front 면 몸 앞에 */
function aura(c, [k, c1, c2], x, y, front) {
  const t = G.t
  c.save(); c.globalCompositeOperation = 'lighter'
  if (k === 'flame') {
    if (!front) for (let i = 0; i < 5; i++) { const h = (t * 1.6 + i / 5) % 1; c.globalAlpha = 0.55 * (1 - h); bloom(c, i % 2 ? c1 : c2, x + Math.sin(t * 7 + i * 1.9) * 8, y - 10 - h * 46, 17 - h * 9) }
    else if (rnd() < 0.5) part(x + (rnd() - 0.5) * 18, y - 8 - rnd() * 30, (rnd() - 0.5) * 20, -60 - rnd() * 50, rnd() < 0.5 ? c1 : c2, 0.6, 2.2)
  } else if (k === 'halo') {
    if (!front) {
      c.globalAlpha = 0.32 + Math.sin(t * 3) * 0.08; bloom(c, c2, x, y - 26, 46)
      c.fillStyle = rgba(c2, 0.13); for (let i = 0; i < 8; i++) { const a = t * 0.6 + i * TAU / 8; c.beginPath(); c.moveTo(x, y - 26); c.lineTo(x + Math.cos(a - 0.12) * 56, y - 26 + Math.sin(a - 0.12) * 56); c.lineTo(x + Math.cos(a + 0.12) * 56, y - 26 + Math.sin(a + 0.12) * 56); c.fill() }
    } else { const hy = y - 57 + Math.sin(t * 3) * 1.5; c.globalAlpha = 0.95; c.strokeStyle = c1; c.lineWidth = 2.2; c.beginPath(); c.ellipse(x, hy, 9, 3, 0, 0, TAU); c.stroke(); c.globalAlpha = 0.6; bloom(c, c1, x, hy, 15) }
  } else if (k === 'storm') {
    if (!front) { c.globalAlpha = 0.3 + Math.sin(t * 17) * 0.1; bloom(c, c1, x, y - 24, 40) }
    else if ((t * 14 | 0) % 3 === 0) {
      c.globalAlpha = 0.9; c.strokeStyle = c2; c.lineWidth = 1.4; c.lineJoin = 'round'
      for (let j = 0; j < 2; j++) { const a = rnd() * TAU; let px = x + Math.cos(a) * 6, py = y - 24 + Math.sin(a) * 14; c.beginPath(); c.moveTo(px, py); for (let i = 0; i < 4; i++) { px += Math.cos(a) * 5 + (rnd() - 0.5) * 6; py += Math.sin(a) * 5 + (rnd() - 0.5) * 6; c.lineTo(px, py) } c.stroke() }
      c.globalAlpha = 0.5; bloom(c, c1, x, y - 24, 22)
    }
  } else if (k === 'legend') {
    if (!front) {
      const g = c.createLinearGradient(0, y - 110, 0, y); g.addColorStop(0, rgba(c1, 0)); g.addColorStop(1, rgba(c1, 0.32)); c.globalAlpha = 0.7 + Math.sin(t * 2.4) * 0.3; c.fillStyle = g; c.fillRect(x - 15, y - 110, 30, 110)
      c.globalAlpha = 0.85; c.lineWidth = 2
      for (const [R, col, dir] of [[26, c1, 1], [33, c2, -1]]) { c.strokeStyle = col; c.setLineDash([7, 5]); c.lineDashOffset = dir * t * 30; c.beginPath(); c.ellipse(x, pl.y, R, R * 0.38, 0, 0, TAU); c.stroke() }
      c.setLineDash([]); c.globalAlpha = 0.38 + Math.sin(t * 4) * 0.1; bloom(c, c1, x, y - 22, 52)
      const fl = Math.sin(t * 3) * 0.18   // 빛 날개 — 등 뒤로 두 쪽, 천천히 퍼덕인다
      for (const sd of [-1, 1]) {
        c.save(); c.translate(x, y - 32); c.scale(sd, 1); c.rotate(-0.15 + fl); c.globalAlpha = 0.9
        const wg = c.createLinearGradient(0, 0, 40, -24); wg.addColorStop(0, rgba(c1, 0.75)); wg.addColorStop(1, rgba(c2, 0.05))
        c.fillStyle = wg; c.beginPath(); c.moveTo(2, 0); c.quadraticCurveTo(18, -32, 44, -30); c.quadraticCurveTo(33, -17, 40, -11); c.quadraticCurveTo(25, -8, 33, 2); c.quadraticCurveTo(15, 4, 2, 7); c.fill()
        c.strokeStyle = rgba(c2, 0.7); c.lineWidth = 1; c.stroke(); c.restore()
      }
    }
    for (let i = 0; i < 3; i++) {   // 몸을 도는 빛 구슬 셋 — 뒤로 갈 때는 몸 뒤에
      const a = t * 2.4 + i * TAU / 3, sn = Math.sin(a)
      if ((sn >= 0) !== front) continue
      c.globalAlpha = 0.95; bloom(c, i % 2 ? c2 : c1, x + Math.cos(a) * 24, y - 18 + sn * 8, 10); c.drawImage(SPARK, x + Math.cos(a) * 24 - 5, y - 18 + sn * 8 - 5, 10, 10)
    }
    if (front) {
      c.globalAlpha = 0.35 + Math.sin(t * 5) * 0.2; bloom(c, c1, x, y - 22, 17)
      c.globalAlpha = 0.9; star(c, x + 0.6, y - 60 + Math.sin(t * 3) * 1.5, 4.2, c2); c.globalAlpha = 0.6; bloom(c, c2, x, y - 60, 13)
      if (G.fx.length < 150 && rnd() < 0.3) fx({ k: 'spark', x: x + (rnd() - 0.5) * 34, y: y - 6 - rnd() * 52, s: 9 + rnd() * 9, a: rnd() * TAU, T: 0.5 })
      if (pl.moving && (t * 7 | 0) !== (G.stepT | 0)) { G.stepT = t * 7; fx({ k: 'ring', x, y: pl.y, R: 16, T: 0.5, col: c1 }) }   // 발자국 빛
    }
  }
  c.restore()
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
  label2(c, fmt(G.t), W / 2, bh + 16 * u, 14 * u, !G.map.endless && G.t > MAX_T - 60 ? '#ffd23f' : '#fff')
  label2(c, `처치 ${G.kills.toLocaleString()}`, W / 2, bh + 25 * u, 6.2 * u, '#c9d1e0')
  // 스킬 · 아이템
  let x = 4 * u, y = bh + 4 * u
  const s = 12 * u
  for (const w of G.weapons) {   // 최고 레벨은 금테, 돌파는 금빛 아이콘에 보랏빛이 숨 쉰다
    c.drawImage(ICON[iconOf(w)], x, y, s, s)
    if (w.br) { c.strokeStyle = `rgba(199,125,255,${0.55 + Math.sin(tnow * 4) * 0.35})`; c.lineWidth = 1.4 * u; c.beginPath(); c.roundRect(x - u, y - u, s + 2 * u, s + 2 * u, 3 * u); c.stroke() }
    else if (w.lv === 8) { c.strokeStyle = '#ffd23f'; c.lineWidth = 1.2 * u; c.beginPath(); c.roundRect(x, y, s, s, 2.4 * u); c.stroke() }
    else label2(c, String(w.lv), x + s - 2.4 * u, y + s - 0.6 * u, 5.4 * u, '#fff')
    if (w === G.seal && sick('seal')) {   // 봉인 — 어둡게 덮고 그 색 X
      c.fillStyle = '#000b'; c.fillRect(x, y, s, s); c.strokeStyle = STATUS.seal.col; c.lineWidth = 1.6 * u
      c.beginPath(); c.moveTo(x + 2 * u, y + 2 * u); c.lineTo(x + s - 2 * u, y + s - 2 * u); c.moveTo(x + s - 2 * u, y + 2 * u); c.lineTo(x + 2 * u, y + s - 2 * u); c.stroke()
      c.beginPath(); c.roundRect(x, y, s, s, 2.4 * u); c.stroke()
    }
    x += s + 1.6 * u
  }
  x = 4 * u; y += s + 2 * u
  const s2 = 9 * u
  for (const id in G.passives) { c.drawImage(ICON[id], x, y, s2, s2); label2(c, String(G.passives[id]), x + s2 - 2 * u, y + s2 - 0.4 * u, 4.4 * u, '#fff'); x += s2 + 1.4 * u }
  // 보스 체력 — 먼저 나온 보스, 여럿이면 「외 n」(중간보스는 발밑 막대만)
  const bs = G.foes.filter(e => e.boss && !e.mid && !e.dead), b = bs[0]
  if (b) {
    const bw = Math.min(W * 0.6, 200 * u), bx = (W - bw) / 2, by = bh + 37 * u
    c.fillStyle = '#000c'; c.fillRect(bx - u, by - u, bw + 2 * u, 6 * u)
    const bg = c.createLinearGradient(bx, 0, bx + bw, 0); bg.addColorStop(0, '#ff8a00'); bg.addColorStop(1, '#ffd23f')
    c.fillStyle = bg; c.fillRect(bx, by, bw * Math.max(0, b.hp / b.max), 4 * u)
    label2(c, BOSS[b.kind].name + (bs.length > 1 ? ` 외 ${bs.length - 1}` : ''), W / 2, by - 1.6 * u, 5.4 * u, '#ffd23f')
  }
  // 상태이상 — 이름 · 남은 초 · 줄어드는 막대
  const sts = Object.keys(STATUS).filter(sick)
  if (sts.length) {
    const cw = 50 * u, ch = 11 * u, gap = 3 * u, y0 = bh + (b ? 45 : 31) * u
    let x0 = W / 2 - (sts.length * cw + (sts.length - 1) * gap) / 2
    for (const id of sts) {
      const st = STATUS[id], left = G.sts[id] - G.t
      c.globalAlpha = left < 2 && (tnow * 6 | 0) % 2 ? 0.5 : 1   // 곧 풀리면 깜빡
      c.fillStyle = '#0b0e14e0'; c.strokeStyle = st.col; c.lineWidth = u; c.beginPath(); c.roundRect(x0, y0, cw, ch, 3 * u); c.fill(); c.stroke()
      c.fillStyle = st.col; c.fillRect(x0 + 2 * u, y0 + ch - 2.4 * u, (cw - 4 * u) * left / ST_T, 1.4 * u)
      label2(c, `${st.name} ${Math.ceil(left)}초`, x0 + cw / 2, y0 + ch * 0.6, 5.4 * u, st.col)
      x0 += cw + gap
    }
    c.globalAlpha = 1
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
  mode = 'menu'; G = null; pauseBtn.hidden = true; ui.classList.remove('is-shop'); autoUI()
  const got = ACH.filter(a => save.ach[a.id]).length
  show(false, h('div', { className: 'sv-title' },
    h('p', { className: 'sv-logo' }, h('span', {}, 'DUNK'), h('span', {}, 'SURVIVOR')),
    h('p', { className: 'sv-sub' }, '몰려오는 수비를 피해 30분을 버텨라'),
    row(btn('게임 시작', chars, 'is-main'), btn(`상점 · ${points().toLocaleString()} P`, () => shop()), btn('마이페이지', () => shop(true)), btn('리더보드', ranks), btn(`업적 ${got} / ${ACH.length}`, achs), btn(['패치 노트', notesNew() && h('i', { className: 'sv-new' }, 'NEW')], notes)),
    h('p', { className: 'sv-note' }, saveNote())))
}
function chars(keep = false) {
  mode = 'menu'; G = null; pauseBtn.hidden = true; ui.classList.remove('is-shop'); autoUI()
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
  const cur = MAPS[menuMap], lock = cur.farm && farmLock()
  const seg = (opts, v, set) => h('div', { className: 'sv-seg', role: 'tablist' }, opts.map(([n, x]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(x === v), onclick: () => { set(x); keepAuto(); maps(true) } }, n)))
  show(keep === true, h('div', { className: 'sv-panel sv-wide' },
    h('p', { className: 'sv-h' }, '맵 고르기'),
    h('div', { className: 'sv-maps' }, MAPS.map((m, i) => {
      const best = save.stats[`best_${m.id}`], lk = m.farm && farmLock()
      return h('button', { type: 'button', className: `sv-map${lk ? ' is-locked' : ''}`, 'aria-pressed': String(i === menuMap), onclick: () => { menuMap = i; maps(true) }, ondblclick: () => !lk && start() },
        preview(m), h('b', {}, m.name), h('small', {}, m.note), h('small', { className: 'sv-best' }, lk ? '잠김' : m.farm ? '포인트 사냥터' : best ? `최고 ${fmt(best)}` : '아직 기록 없음'))
    })),
    cur.farm && (lock ? h('p', { className: 'sv-lockmsg' }, `잠김 — 스트리트 파크 · 아레나 · 네온 루프탑에서 각각 10분 넘게 버티면 열려요(남은 맵: ${lock.map(mapName).join(' · ')})`)
      : h('div', { className: 'sv-autoset' },   // 자동사냥 — 켬 · 끔, 공격형 · 수비형(판 중에도 위의 버튼으로 바꾼다)
        h('b', {}, '자동사냥'), seg([['켬', true], ['끔', false]], autoSet.on, v => { autoSet.on = v }),
        autoSet.on && seg([['공격형', 'atk'], ['수비형', 'def']], autoSet.mode, v => { autoSet.mode = v }),
        autoSet.on && h('span', { className: 'sv-autoset-again' }, '끝나면 다시 시작', seg([['켬', true], ['끔', false]], autoSet.again, v => { autoSet.again = v })),
        h('small', {}, !autoSet.on ? '직접 움직여요 — 판 중에도 위의 「자동」 버튼으로 켤 수 있어요'
          : autoSet.mode === 'atk' ? '넓게 돌아다니며 보석 · 아이템을 쓸어 담아요 — 움직이며 쓰는 스킬 위주로 고르고 리롤 · 스킵 · 제외도 써요'
          : '처음 자리 둘레에서만 버텨요 — 아이템은 모아 뒀다가 필요할 때만 줍고, 몸을 지키는 스킬 위주로 골라요'),
        h('small', {}, '자동사냥을 켠 판은 포인트만 받고 업적 · 랭킹에는 안 들어가요'))),
    row(btn('← 캐릭터', () => chars()), Object.assign(btn('시작!', start, 'is-main'), { disabled: !!lock }))))
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
      h('div', {}, h('b', {}, a.name), h('small', {}, a.note, pr && ` (${pr})`), c && h('small', { className: 'sv-reward' }, `${at ? '열림' : '해금'} · ${nameOf(c)}`), a.skin && h('small', { className: 'sv-reward' }, `${at ? '받음' : '보상'} · 스킨 「${SKIN[a.skin].name}」`)),
      c && h('img', { src: faceOf(P(c.id)), alt: '' }))
  }))
}
// ---- 상점 · 옷장 — 포인트로 스킨을 사고(옷장은 가진 것만) 캐릭터마다 입힌다. 고른 스킨은 뒤의 미리 보기 판에 바로 보인다
let closetOn = false   // 마이페이지 — 상점과 같은 화면에 가진 스킨만(사지 않고 입히기만)
const SHOP_TABS = [['fx', '스킬 이펙트'], ['ball', '농구공'], ['fit', '옷'], ['ach', '업적 스킨']]
const FX_NOTE = [, '서리 빛 · 하얀 알갱이', '불꽃 혜성 꼬리 · 테두리에 타는 불꽃 · 맞은 자리에 남는 불길', '무지개 혜성 꼬리 · 공 둘레를 도는 별 · 맞은 자리 별빛 폭발', '두 배 긴 금빛 꼬리 · 도는 별 셋 · 튀는 금빛 전기 · 도는 문양 고리 · 맞은 자리에 하늘에서 번개 · 큰 빛기둥 · 두 겹 충격파']
const AURA_NOTE = { flame: '몸에서 불꽃이 피어오른다', halo: '머리 위 후광 · 뒤에 빛살', storm: '몸 둘레에 번개가 튄다', legend: '금빛 날개 · 도는 빛 구슬 · 바닥에 도는 문양 · 빛기둥 · 별빛 · 걸을 때 빛 발자국' }
let shopTab = 'fx', shopCi = 0, shopW = null, shopSel = 'base'
const slotOf = tab => tab === 'fx' ? 'fx' : tab === 'ball' ? 'ball' : 'fit'
function shopItems(ch) {   // 업적 스킨 탭 — 이 캐릭터의 옷 · 업적 공 · 고른 스킬의 레전드 이펙트
  const all = shopTab === 'fx' ? SKIN_LIST.filter(k => k.kind === 'fx' && k.w === shopW) : shopTab === 'ball' ? SKIN_LIST.filter(k => k.kind === 'ball')
    : shopTab === 'fit' ? SKIN_LIST.filter(k => k.kind === 'fit' && !k.ach) : SKIN_LIST.filter(k => k.ach && (k.kind === 'fx' ? k.w === shopW : !k.char || k.char === ch.id))
  return [...shopTab === 'ach' ? [] : ['base'], ...all.filter(k => !closetOn || owns(k))]
}
const THUMB = new Map()
const kindOf = k => k === 'base' ? slotOf(shopTab) : k.kind
function thumb(k, ch) {   // 카드 그림 — 이펙트는 스킬 아이콘(등급 색 테), 공은 그 공, 옷은 그 캐릭터가 입은 모습
  const kind = kindOf(k)
  if (kind === 'fx') return h('img', { src: ICON_URL[k === 'base' ? shopW : k.w], alt: '' })
  const key = `${kind}|${k === 'base' ? 'base' : k.id}|${ch.id}`
  let cv0 = THUMB.get(key)
  if (!cv0) {
    const sp = kind === 'ball' ? (k === 'base' ? BALL : BALLSK[k.id])
      : sprite(36, 66, 18, 62, c => person(c, { jersey: ch.c[0], trim: ch.c[1], shorts: ch.c[0], skin: ch.skin || '#b9825a', hair: '#1d140e', shoe: '#f4f4f4', num: NBA_NUM[ch.id] ?? '', head: ch.head, chin: ch.chin, kind: 'me', ...ch.fit, ...(k === 'base' ? null : k.look) }))
    cv0 = sp.c.toDataURL(); THUMB.set(key, cv0)
  }
  return h('img', { src: cv0, alt: '', className: kind === 'ball' ? 'is-ball' : 'is-fit' })
}
function shop(closet = false, keep = false) {
  if (!keep) shopSel = null
  closetOn = closet
  const ch = CHARS[shopCi], lock = lockOf(ch)
  shopW ||= ch.w
  const keyOf = kind => kind === 'fx' ? shopW : ch.id, wornOf = k => { const kind = kindOf(k); return worn(kind, kind === 'fx' && k !== 'base' ? k.w : keyOf(kind)) }
  const items = shopItems(ch), base0 = worn(slotOf(shopTab), keyOf(slotOf(shopTab)))
  if (shopSel === null || !items.some(k => (k === 'base' ? 'base' : k.id) === shopSel)) shopSel = (items.includes(base0) && base0.id) || (items[0] === 'base' ? 'base' : items[0]?.id) || 'base'
  const sel = shopSel === 'base' ? null : SKIN[shopSel], slot = sel ? sel.kind : slotOf(shopTab), key = slot === 'fx' && sel ? sel.w : keyOf(slot), wornNow = worn(slot, key), fxNow = { [ch.w]: worn('fx', ch.w)?.tier || 0 }
  mode = 'shop'; pauseBtn.hidden = true
  const fxw = sel?.kind === 'fx' ? sel.w : shopTab === 'fx' ? shopW : null   // 이펙트를 볼 스킬(최고 레벨로)
  demo({ ci: shopCi, lv: fxw ? 8 : 3, w: fxw, fx: fxw ? { [fxw]: sel?.kind === 'fx' ? sel.tier : 0 } : fxNow,
    fit: slot === 'fit' ? sel?.id : worn('fit', ch.id)?.id, ball: slot === 'ball' ? sel?.id : worn('ball', ch.id)?.id })
  const pick = id => { shopSel = id; shop(closet, true) }
  const card = k => {
    const id = k === 'base' ? 'base' : k.id, own = k === 'base' || owns(k), on = k === 'base' ? !wornOf(k) : wornOf(k)?.id === id
    const name = k === 'base' ? { fx: '기본 이펙트', ball: '농구공', fit: '팀 유니폼' }[slotOf(shopTab)] : shopTab === 'fx' ? THEME[k.tier].name : k.name
    return h('button', { type: 'button', className: `sv-item${k === 'base' ? '' : ` is-t${k.tier}`}${k !== 'base' && k.kind === 'fx' ? ` is-${THEME[k.tier].id}` : ''}`, 'aria-pressed': String(id === shopSel), onclick: () => pick(id) },
      h('span', { className: 'sv-item-art' }, thumb(k, ch)),
      k !== 'base' && h('small', { className: 'sv-tier' }, TIER[k.tier].name),
      h('b', {}, name),
      h('small', { className: 'sv-item-st' }, on ? '착용 중' : own ? '보유' : k.ach ? '업적 보상' : `${k.price.toLocaleString()} P`))
  }
  // 고른 것 — 설명 · 사기 · 입기(이펙트는 캐릭터와 상관없다 — 잠긴 캐릭터여도 된다), 공용 스킨(공 · 옷)은 모든 캐릭터에 한 번에
  const lk = slot !== 'fx' && lock, put = (id, all) => { for (const c of all ? CHARS : [ch]) wearSkin(slot, slot === 'fx' ? key : c.id, id); shop(closet, true) }
  let act = null
  if (!sel) act = wornNow ? btn('기본으로', () => put(null), 'is-main') : h('span', { className: 'sv-shop-on' }, '착용 중')
  else if (owns(sel)) act = wornNow?.id === sel.id ? btn('벗기', () => put(null)) : Object.assign(btn('착용', () => put(sel.id), 'is-main'), { disabled: !!lk })
  else if (sel.ach) act = h('span', { className: 'sv-shop-lock' }, `업적 「${ACH.find(a => a.id === sel.ach).name}」 — ${ACH.find(a => a.id === sel.ach).note}`)
  else act = Object.assign(btn(`구매 · ${sel.price.toLocaleString()} P`, () => { if (buy(sel)) { put(sel.id); notice(`「${sel.name}」 — 바로 입혔어요`, '구매') } }, 'is-main'), { disabled: !!lk || points() < sel.price })
  const shared = slot !== 'fx' && (sel ? owns(sel) && !sel.char : true), allOn = CHARS.every(c => (equip[slot][c.id] || null) === (sel?.id || null))
  const allBtn = shared && Object.assign(btn(sel ? '모든 캐릭터에 입히기' : '모든 캐릭터 기본으로', () => { put(sel?.id || null, true); notice(sel ? `모든 캐릭터에 「${sel.name}」` : `모든 캐릭터가 ${slot === 'ball' ? '농구공' : '팀 유니폼'}으로`, '일괄 적용') }), { disabled: allOn })
  const why = sel && !owns(sel) && !sel.ach && (lk ? '잠긴 캐릭터예요 — 캐릭터를 먼저 열어야 살 수 있어요' : points() < sel.price ? `포인트가 ${(sel.price - points()).toLocaleString()} 모자라요 — 판을 끝내면 쌓여요` : '')
  const note = !sel ? '' : sel.kind === 'fx' ? `${WEAP[sel.w].name} — ${FX_NOTE[sel.tier]}` : sel.kind === 'ball' ? (sel.pet ? `드리블할 때 공 대신 ${sel.name}가 통통` : `드리블하는 공이 ${sel.name}로${sel.glow && sel.glow !== 'gold' ? ' — 빛 · 꼬리가 따라다녀요' : ''}`) : [sel.char ? `${nameOf(ch)} 전용` : '모든 캐릭터', sel.aura && AURA_NOTE[sel.aura[0]]].filter(Boolean).join(' · ')
  const who = slot === 'fx' ? '' : `${nameOf(ch)}${lock ? ' (잠김)' : ''} · `
  ui.classList.add('is-shop')
  const old = ui.querySelector('.sv-shop'), pos = old && [old.scrollTop, old.querySelector('.sv-shop-chars')?.scrollLeft, old.querySelector('.sv-shop-skills')?.scrollLeft]
  show(keep, h('div', { className: 'sv-shop' },
    // 머리(위에 붙어 있다) — 나가기 · 상점 | 마이페이지 · 포인트
    h('div', { className: 'sv-shop-head' },
      h('button', { type: 'button', className: 'sv-exit', onclick: () => { ui.classList.remove('is-shop'); title() } }, '← 나가기'),
      h('div', { className: 'sv-seg', role: 'tablist' }, [['상점', false], ['마이페이지', true]].map(([n, c]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(c === closet), onclick: () => c !== closet && shop(c) }, n))),
      h('span', { className: 'sv-pts-pill' }, `${points().toLocaleString()} P`)),
    closet && h('p', { className: 'sv-mine' }, `모은 것 ${(save.stats.pts || 0).toLocaleString()} P · 쓴 것 ${((save.stats.pts || 0) - points()).toLocaleString()} P · 남은 것 ${points().toLocaleString()} P`),
    h('div', { className: 'sv-tabs', role: 'tablist' }, SHOP_TABS.map(([id, name]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(id === shopTab), onclick: () => { shopTab = id; shop(closet) } }, name))),
    shopTab !== 'fx' && h('div', { className: 'sv-shop-chars' }, CHARS.map((c, i) => h('button', { type: 'button', className: lockOf(c) ? 'is-locked' : '', 'aria-pressed': String(i === shopCi), title: nameOf(c), onclick: () => { shopCi = i; shopW = null; shop(closet) } }, h('img', { src: faceOf(P(c.id)), alt: nameOf(c) })))),
    (shopTab === 'fx' || shopTab === 'ach') && h('div', { className: 'sv-shop-skills' }, Object.keys(WEAP).map(w => h('button', { type: 'button', 'aria-pressed': String(w === shopW), title: WEAP[w].name, onclick: () => { shopW = w; shop(closet) } }, h('img', { src: ICON_URL[w], alt: WEAP[w].name })))),
    h('div', { className: 'sv-items' }, items.map(card)),
    items.length <= (shopTab === 'ach' ? 0 : 1) && h('p', { className: 'sv-note' }, closet ? '아직 가진 스킨이 없어요 — 상점에서 포인트로 사요' : '이 캐릭터의 업적 스킨이 없어요'),
    // 고른 것(아래에 붙어 있다) — 설명 · 사기 · 입기 · 모든 캐릭터에
    h('div', { className: 'sv-shop-sel' },
      h('div', {}, h('b', {}, sel ? sel.name : '기본', sel && h('small', { className: `sv-tier is-t${sel.tier}` }, TIER[sel.tier].name)), h('small', {}, `${who}${note || (slot === 'fx' ? `${WEAP[shopW].name} 기본` : slot === 'ball' ? '농구공' : '그 팀 유니폼')}`), why && h('small', { className: 'sv-shop-why' }, why)),
      h('div', { className: 'sv-shop-acts' }, act, allBtn))))
  const box = ui.querySelector('.sv-shop'), strips = [box.querySelector('.sv-shop-chars'), box.querySelector('.sv-shop-skills')]
  if (pos) { box.scrollTop = pos[0]; strips.forEach((el, i) => { if (el && pos[i + 1] != null) el.scrollLeft = pos[i + 1] }) }
  else for (const el of strips) { const on = el?.querySelector('[aria-pressed="true"]'); if (on) el.scrollLeft = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2 }   // 처음 열 때 — 고른 것이 가운데
}
// ---- 랭킹 — 맵마다 오래 버틴 순(같으면 많이 쓰러뜨린 순), 사람마다 최고 기록 한 줄. 로그인하면 판이 끝날 때 올라간다
const PENDING = 'survive.pending'   // 로그인 안 하고 끝낸 판(더 나은 것 하나) — 로그인하고 돌아오면 올린다(2시간 안)
let RANK = null, LOG = null, rankSt = { view: 'rank', tab: 0 }, guideSt = { view: 'rank', tab: 0 }
const better = (a, b) => !b || a.secs > b.secs || (a.secs === b.secs && a.kills > b.kills)
async function loadRank() {   // 랭킹 · 최근 기록 · 구매 내역(/api/survive/log) — 로그인했으면 내 것도
  const tok = auth === 'in'
  await Promise.all([
    api('/survive/ranking', { withToken: tok }).then(v => { RANK = v }, () => { RANK = { error: true } }),
    api('/survive/log', { withToken: tok }).then(v => { LOG = v }, () => { LOG = { error: true } })])
  if (mode === 'menu' && ui.querySelector('.sv-h')?.textContent === '리더보드') ranks(true)
  guideRank()
}
const ago = at => { const m = (Date.now() - at) / 60000 | 0; return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${m / 60 | 0}시간 전` : `${m / 1440 | 0}일 전` }
const mapName = id => MAPS.find(m => m.id === id)?.name || id
const VIEWS = [['rank', '랭킹'], ['runs', '최근 기록'], ['mine', '내 기록'], ['buys', '구매 내역']]
/** 리더보드 — 랭킹(맵마다 최고) · 최근 기록(모두, 포인트) · 내 기록 · 구매 내역(나 · 모두) */
function board(st, set) {
  return h('div', { className: 'sv-board' },
    h('div', { className: 'sv-tabs sv-views', role: 'tablist' }, VIEWS.map(([id, name]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(id === st.view), onclick: () => set({ ...st, view: id }) }, name))),
    st.view === 'rank' ? rankList(st.tab, i => set({ ...st, tab: i })) : st.view === 'buys' ? buyList() : runList(st.view === 'mine'))
}
const loginNote = msg => h('p', { className: 'sv-note' }, msg, ' ', h('button', { type: 'button', className: 'sv-link', onclick: chooseLogin }, '로그인'))
const logState = () => !LOG ? h('p', { className: 'sv-note' }, '불러오는 중…') : LOG.error ? h('p', { className: 'sv-note' }, '기록을 불러오지 못했어요') : null
function runList(mine) {
  const spent = (save.stats.pts || 0) - points()
  const sum = mine && h('p', { className: 'sv-mine' }, `내 포인트 — 모은 것 ${(save.stats.pts || 0).toLocaleString()} P · 쓴 것 ${spent.toLocaleString()} P · 남은 것 ${points().toLocaleString()} P`)
  if (mine && auth !== 'in') return h('div', {}, sum, loginNote('로그인하면 판마다 기록 · 받은 포인트가 남아요'))
  const rows = mine ? LOG?.mine?.runs || [] : LOG?.runs || []
  return h('div', {}, sum, logState() || (!rows.length ? h('p', { className: 'sv-note' }, mine ? '아직 올린 판이 없어요' : '아직 기록이 없어요')
    : h('ol', { className: 'sv-log' }, rows.map(r => h('li', {},
      h('img', { src: faceOf(P(r.hero)), alt: '' }),
      h('div', {}, h('b', {}, mine ? `${mapName(r.map)} · ${fmt(r.secs)}` : r.name), h('small', {}, `${mine ? '' : `${mapName(r.map)} · ${fmt(r.secs)} · `}처치 ${r.kills.toLocaleString()} · Lv ${r.lvl} · ${nameOf({ id: r.hero })}`)),
      h('span', { className: 'sv-log-pts' }, `+${r.pts.toLocaleString()} P`), h('small', { className: 'sv-ago' }, ago(r.at)))))),
    !mine && auth !== 'in' && loginNote('로그인하면 판이 끝날 때 기록이 올라가요'))
}
function buyRow(x, who) {   // 구매 한 줄 — 스킨 이름(등급 색) · 종류 · 값 · 누가 · 언제
  const k = SKIN[x.skin]
  return h('li', {}, h('span', { className: `sv-tier is-t${k?.tier || 1}` }, k ? TIER[k.tier].name : '스킨'),
    h('div', {}, h('b', {}, k?.name || x.skin), h('small', {}, [k && { fx: '스킬 이펙트', ball: '농구공', fit: '옷' }[k.kind], who && x.name].filter(Boolean).join(' · '))),
    h('span', { className: 'sv-log-pts is-spent' }, `${x.price.toLocaleString()} P`), x.at && h('small', { className: 'sv-ago' }, ago(x.at)))
}
function buyList() {
  // 내 구매 — 로그인했으면 계정 기록, 아니면 이 브라우저에서 산 것(언제는 모른다)
  const mineRows = auth === 'in' ? LOG?.mine?.buys || [] : Object.entries(save.ach).filter(([k]) => k.startsWith('own_')).map(([k, v]) => ({ skin: k.slice(4), price: v }))
  return h('div', {},
    h('p', { className: 'sv-sub2' }, `내 구매 ${mineRows.length}개 · 쓴 포인트 ${((save.stats.pts || 0) - points()).toLocaleString()} P`),
    auth === 'in' && logState() || (mineRows.length ? h('ol', { className: 'sv-log' }, mineRows.map(x => buyRow(x, false))) : h('p', { className: 'sv-note' }, '아직 산 스킨이 없어요 — 상점에서 포인트로 사요')),
    h('p', { className: 'sv-sub2' }, '최근 구매 — 모두'),
    logState() || (LOG.buys.length ? h('ol', { className: 'sv-log' }, LOG.buys.map(x => buyRow(x, true))) : h('p', { className: 'sv-note' }, '아직 구매가 없어요')),
    auth !== 'in' && loginNote('로그인하면 산 스킨이 구매 내역에 올라가요'))
}
const RMAPS = MAPS.filter(m => !m.farm)   // 랭킹 맵 — 포인트 사냥터(네온 시티)는 없다
function rankList(tab, set) {
  const m = RMAPS[tab], rows = RANK?.ranking?.[m.id] || [], mine = RANK?.mine?.[m.id], isMe = r => mine && r.rank === mine.rank && r.name === me?.name
  return h('div', { className: 'sv-rank' },
    h('div', { className: 'sv-tabs', role: 'tablist' }, RMAPS.map((x, i) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === tab), onclick: () => set(i) }, x.name))),
    !RANK ? h('p', { className: 'sv-note' }, '불러오는 중…')
      : RANK.error ? h('p', { className: 'sv-note' }, '랭킹을 불러오지 못했어요')
      : !rows.length ? h('p', { className: 'sv-note' }, '아직 기록이 없어요 — 첫 기록의 주인공이 되어 보세요')
      : h('ol', { className: 'sv-ranks' }, rows.map(r => h('li', { className: [r.rank <= 3 && `is-top${r.rank}`, isMe(r) && 'is-me'].filter(Boolean).join(' ') },
        h('b', { className: 'sv-rk' }, String(r.rank)), h('img', { src: faceOf(P(r.hero)), alt: '' }), h('span', { className: 'sv-rn' }, r.name),
        h('span', { className: 'sv-rt' }, fmt(r.secs)), h('small', {}, `처치 ${r.kills.toLocaleString()} · Lv ${r.lvl} · ${nameOf({ id: r.hero })}`),
        r.skills?.length > 0 && h('span', { className: 'sv-rs' }, r.skills.filter(k => ICON_URL[k]).map(k => { const n = k.endsWith('+') ? `${BREAK[k.slice(0, -1)].name} · 돌파` : WEAP[k].name; return h('img', { src: ICON_URL[k], alt: n, title: n }) }))))),
    mine && !rows.some(isMe) && h('p', { className: 'sv-mine' }, `내 기록 ${mine.rank}위 · ${fmt(mine.secs)} · 처치 ${mine.kills.toLocaleString()}`),
    auth !== 'in' && h('p', { className: 'sv-note' }, '로그인하면 판이 끝날 때 내 기록이 랭킹에 올라가요 ', h('button', { type: 'button', className: 'sv-link', onclick: chooseLogin }, '로그인')))
}
function ranks(keep = false) {
  show(keep === true, h('div', { className: 'sv-panel sv-wide' }, h('p', { className: 'sv-h' }, '리더보드'), board(rankSt, st => { rankSt = st; ranks(true) }), row(btn('← 처음으로', title, 'is-main'))))
  if (!RANK) loadRank()
}
const guideRank = () => { if (ready) document.getElementById('sv-guide-rank').replaceChildren(board(guideSt, st => { guideSt = st; guideRank() })) }
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
  if (mode === 'over' || G.demo) return
  mode = 'over'; pauseBtn.hidden = true; calm(); autoUI()
  const st = save.stats, add = (k, v) => { st[k] = (st[k] || 0) + v }, rec = !G.autoUsed   // 자동사냥을 켠 판은 포인트만 — 기록 · 업적은 안 센다
  if (rec) {
    add('kills', G.kills); add('runs', 1); add('jackpots', G.jackpots); add('bosses', G.bosses)
    st[`best_${G.map.id}`] = Math.max(st[`best_${G.map.id}`] || 0, G.t | 0)
    st[`p_${G.ch.id}`] = 1
  }
  gain('run1')
  if (win) { gain('surv30'); gain(`clear_${G.map.id}`) }
  const pt = runPts(win); add('pts', pt.total)   // 포인트 — 상점에서 스킨을 산다
  if (rec) for (const a of ACH) if (a.stat && (st[a.stat] || 0) >= a.goal) gain(a.id)
  if (rec && CHARS.every(c => st[`p_${c.id}`])) gain('allchar')
  persist(true)
  // 랭킹 — 로그인했으면 바로 올리고, 아니면 이 판을 남겨 뒀다가 로그인하고 돌아오면(pull)
  const run = { map: G.map.id, hero: G.ch.id, secs: G.t | 0, kills: G.kills, lvl: G.lvl, skills: G.weapons.map(iconOf) }, rankMsg = h('p', { className: 'sv-rankmsg' })
  if (G.map.farm) rankMsg.textContent = `포인트 사냥터라 랭킹에는 올라가지 않아요${G.autoUsed ? ' — 자동사냥 판은 업적도 없어요' : ''}`
  else if (run.secs >= 10) {
    if (auth === 'in') { rankMsg.textContent = '랭킹에 기록을 올리는 중…'; submit(run, rankMsg) }
    else {
      try { const old = JSON.parse(localStorage.getItem(PENDING)); if (better(run, old?.map === run.map ? old : null)) localStorage.setItem(PENDING, JSON.stringify({ ...run, at: Date.now() })) } catch {}
      rankMsg.append('로그인하면 이 기록이 랭킹에 올라가요 ', h('button', { type: 'button', className: 'sv-link', onclick: chooseLogin }, '로그인'))
    }
  }
  const unlocked = G.got.filter(a => a.char), again = G.auto && G.map.farm && autoSet.again && !quit && h('p', { className: 'sv-again', role: 'status' })
  show(false, h('div', { className: `sv-panel sv-over${win ? ' is-win' : ''}` },
    h('p', { className: 'sv-h sv-big' }, quit ? '경기 포기' : G.map.endless ? `챌린지 ${fmt(G.t)}` : win ? '30분 생존!' : 'K.O.'),
    h('p', { className: 'sv-note' }, `${nameOf(G.ch)} · ${G.map.name}`),
    h('dl', { className: 'sv-stats' }, [['버틴 시간', fmt(G.t)], ['레벨', G.lvl], ['처치', G.kills.toLocaleString()], ['잭팟', G.jackpots], ['보스', G.bosses], ['중간보스', G.mids], ['돌파', G.breaks]].map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, String(v))))),
    h('p', { className: 'sv-pts' }, h('b', {}, `+${pt.total.toLocaleString()} P`), ` 처치 ${pt.kills} · 레벨 ${pt.lvl} · 시간 ${pt.time}${win ? ' · 30분 생존 1.5배' : ''} — 지금 ${points().toLocaleString()} P`),
    rankMsg,
    build(),
    G.got.length > 0 && h('div', { className: 'sv-got' }, h('b', {}, `새 업적 ${G.got.length}개`), h('ul', {}, G.got.map(a => h('li', {}, `★ ${a.name}`, a.char && h('em', {}, ` — ${nameOf(CHARS.find(c => c.id === a.char))} 해금!`), a.skin && h('em', {}, ` — 스킨 「${SKIN[a.skin].name}」`))))),
    unlocked.length > 0 && h('div', { className: 'sv-unlock' }, unlocked.map(a => { const c = CHARS.find(x => x.id === a.char); return h('img', { src: faceOf(P(c.id)), alt: nameOf(c), title: nameOf(c) }) })),
    again,
    row(btn('다시 하기', start, 'is-main'), btn('캐릭터 고르기', () => chars()), btn('처음으로', title))))
  if (again) {   // 자동사냥 — 5초 뒤 같은 캐릭터 · 맵 · 모드로 다시(탭이 가려져 있으면 바로)
    let n = document.hidden ? 0 : 5
    const tick = () => {
      if (mode !== 'over' || !again.isConnected) return clearInterval(iv)
      if (n <= 0) { clearInterval(iv); return setTimeout(start) }
      again.replaceChildren(`자동사냥 — ${n}초 뒤에 다시 시작해요 `, h('button', { type: 'button', className: 'sv-link', onclick: () => { clearInterval(iv); again.textContent = '자동 재시작을 멈췄어요' } }, '멈추기'))
      n--
    }
    const iv = setInterval(tick, 1000); tick()
  }
}
function gain(id) {
  if (save.ach[id] || G?.demo || G?.autoUsed) return   // 상점 미리 보기 · 자동사냥을 켠 판은 업적이 없다
  save.ach[id] = Date.now()
  const a = ACH.find(x => x.id === id), c = a.char && CHARS.find(x => x.id === a.char)
  G?.got.push(a)
  const el = h('div', { className: 'sv-toast' }, c ? h('img', { src: faceOf(P(c.id)), alt: '' }) : h('span', { className: 'sv-medal' }, '★'),
    h('div', {}, h('small', {}, '업적 달성'), h('b', {}, a.name), c && h('small', { className: 'sv-reward' }, `캐릭터 해금 — ${nameOf(c)}`), a.skin && h('small', { className: 'sv-reward' }, `스킨 — ${SKIN[a.skin].name}`)))
  toasts.append(el); setTimeout(() => el.remove(), 4200)
  while (toasts.children.length > 3) toasts.firstElementChild.remove()
  persist()
  guideAchs()
}
function notice(msg, head = '랭킹') {
  const el = h('div', { className: 'sv-toast' }, h('span', { className: 'sv-medal' }, '★'), h('div', {}, h('small', {}, head), h('b', {}, msg)))
  toasts.append(el); setTimeout(() => el.remove(), 4200)
}
/** 저장이 바뀌었을 때(로그인 · 다른 기기 것을 합침) 지금 메뉴 · 아래 업적 목록을 다시 */
function refresh() {
  guideAchs()
  if (mode === 'shop') return shop(closetOn, true)
  if (mode !== 'menu') return
  const h2 = ui.querySelector('.sv-h')?.textContent || ''
  if (h2.startsWith('캐릭터')) chars(true); else if (h2.startsWith('맵')) maps(true); else if (h2.startsWith('업적')) achs(); else if (h2 === '리더보드') ranks(true); else if (h2 === '패치 노트') notes(); else title()
}

// ---------------------------------------------------------------- 패치 노트 — 새 것이 위. 게임을 고치면 맨 위에 한 덩어리(아래 「패치 노트」 탭 · 첫 화면 버튼)
const NOTES = [
  { date: '2026-11-02', title: '새 맵 — 네온 시티(포인트 사냥터)', items: [
    '네온 시티 — 숨 쉬듯 빛나는 네온 코트. 스트리트 파크 · 아레나 · 네온 루프탑에서 각각 10분 넘게 버티면 열려요',
    '자동사냥 — 맵을 고를 때 켬 · 끔과 공격형(기본) · 수비형을 고르고, 판 중에는 위의 「자동」 버튼으로 바꿔요. 키 · 손가락을 대면 그동안은 직접 움직여요',
    '공격형 — 넓게 돌아다니며 보석 · 아이템을 쓸어 담고, 움직이며 쓰는 스킬(유로스텝 · 덩크 · 크로스오버 · 프레스 …) · 이동 속도 · 자석 위주로 골라요. 리롤 · 스킵 · 제외도 알아서 써요',
    '수비형 — 처음 자리 둘레에서만 버티고, 아이템은 밟지 않고 모아 뒀다가 필요할 때만(체력이 낮을 때 드링크, 둘러싸이면 타임아웃 · 버저, 상태이상이면 스프레이 …) 주워요. 몸을 지키는 스킬(블록슛 · 프레스 · 스크린 …) · 체력 · 방어 위주',
    '자동사냥 중에는 다른 창 · 탭으로 가도 일시정지되지 않고 계속 돌아요(멈추려면 일시정지 버튼)',
    '판이 끝나면 5초 뒤 같은 캐릭터 · 모드로 다시 시작해요(맵 고르기에서 「끝나면 다시 시작」을 끄거나, 결과 화면의 「멈추기」 · 그만두기로 멈춰요)',
    '포인트 사냥터라 랭킹에는 안 올라가요. 자동사냥을 켠 판은 포인트만 받고 업적 · 기록에는 안 들어가요'] },
  { date: '2026-11-02', title: '캐릭터 목 · 옷깃', items: [
    '선수 얼굴 그림의 턱 아래(그림 속 목 · 옷깃 · 어깨 옷)를 잘라 얼굴만 써요 — 몸 그림의 목 · 유니폼에 바로 이어져요(커리의 흰 옷깃, 요키치의 빨간 옷깃, 탐슨의 보라 옷깃 등이 사라졌어요)',
    '얼굴을 조금 작게(86%) 하고, 비스듬히 본 얼굴도 턱이 몸의 목 위에 오게 맞췄어요 — 머리가 어깨 위에 자연스럽게 얹혀요'] },
  { date: '2026-11-02', title: '레전더리를 더 화려하게', items: [
    '레전드 스킬 이펙트 — 날아가는 공은 두 배 긴 금빛 꼬리 · 둘레를 도는 별 셋 · 튀는 금빛 전기, 고리 · 구역에는 도는 문양 고리, 맞은 자리에는 하늘에서 번개가 내리꽂히고 큰 빛기둥 · 두 겹 충격파 · 솟는 금가루',
    '레전더리 옷 — 등 뒤에 퍼덕이는 금빛 날개, 몸을 도는 빛 구슬 셋이 더해졌어요'] },
  { date: '2026-11-02', title: '상점 · 마이페이지 화면', items: [
    '위에 「← 나가기」 · 「상점 | 마이페이지」 · 포인트가 늘 붙어 있어요(목록을 내려도 그대로)',
    '고른 스킨의 사기 · 입기 버튼은 아래에 늘 붙어 있어요',
    '옷 · 농구공은 「모든 캐릭터에 입히기」로 한 번에(「모든 캐릭터 기본으로」도)',
    '스킬 이펙트 탭에는 선수 얼굴 줄을 뺐어요 — 이펙트는 캐릭터와 상관없어요'] },
  { date: '2026-11-02', title: '리더보드', items: [
    '「랭킹」이 「리더보드」로 — 랭킹 · 최근 기록 · 내 기록 · 구매 내역 탭',
    '최근 기록 — 모두의 최근 판(맵 · 버틴 시간 · 처치 · 레벨 · 캐릭터 · 받은 포인트). 내 기록 — 내 최근 판과 내 포인트(모은 것 · 쓴 것 · 남은 것)',
    '구매 내역 — 내가 산 스킨 · 쓴 포인트, 그리고 모두의 최근 구매(누가 무엇을 얼마에)',
    '로그인했을 때 끝낸 판 · 산 스킨부터 올라가요'] },
  { date: '2026-11-02', title: '상점 손보기 · 새 스킨', items: [
    '이펙트 등급이 색만 다르지 않게 — 레어(인페르노)부터 혜성 꼬리 · 고리 테두리에 타는 불꽃 · 맞은 자리에 남는 불길, 유니크(갤럭시)는 공 둘레를 도는 별 · 별빛 폭발',
    '블록슛 손 · 스틸 손 · 프레스 바닥 · 스크린 구역 · 덩크 고리 · 유로스텝 잔상 · 앨리웁 표시 · 버저비터 번개 · 아웃렛 빛줄기 · 샷 클락 원도 스킨 색으로 — 어느 스킬이든 바뀐 게 눈에 보여요',
    '새 이펙트 등급 「레전드」(레전더리) — 스킬마다 하나, 그 스킬을 최고 레벨로 만드는 업적으로 받아요(금빛 혜성 꼬리 · 별빛 폭발 · 빛기둥). 최고 레벨 업적이 없던 스킬 12개에 업적을 더했어요',
    '유니크 농구공 — 불꽃 농구공 · 갤럭시 볼 · 번개 공(드리블할 때 빛 · 불티 · 별빛 · 번개)',
    '업적 농구공 — 행운의 공(잭팟 10번) · 왕관 공(MVP 격파) · 무한의 공(챌린지 30분, 레전더리 — 무지개 꼬리)',
    '「업적 스킨」 탭에 그 캐릭터의 옷 · 업적 공 · 고른 스킬의 레전드 이펙트가 함께 나와요',
    '휴대폰 — 캐릭터 · 스킬 줄이 위아래로 움직이지 않고, 고를 때 스크롤이 맨 앞으로 돌아가지 않아요'] },
  { date: '2026-11-02', title: '상점 · 스킨', items: [
    '판이 끝나면 포인트가 쌓여요 — 처치 · 레벨 · 버틴 시간만큼(30분 생존은 1.5배). 결과 화면에 얼마 받았는지 나와요',
    '첫 화면의 「상점」에서 포인트로 스킨을 사요 — 고르면 뒤 화면에서 그 캐릭터가 바로 입고 스킬을 써 보여요(잠긴 캐릭터로는 못 사요)',
    '스킬 이펙트 — 스킬마다 세 가지: 아이스(노멀) · 인페르노(레어) · 갤럭시(유니크). 등급이 높을수록 빛 · 꼬리 · 터짐이 화려해요',
    '농구공 — 드리블하는 공이 축구공 · 비치볼 · 황금 농구공으로, 비싼 동물 스킨은 고양이 · 강아지 · 판다가 통통 튀어요(모든 캐릭터)',
    '옷 — 연습복 · 후드티 · 레트로(노멀), 올스타 · 크리스마스 · 골드(레어), 불꽃 · 천상(후광) · 번개(유니크 — 몸에 효과가 붙어요). 모든 캐릭터',
    '업적 스킨 — 캐릭터마다 그 캐릭터로 10분 버티면 그 선수가 예전 · 다른 팀에서 입던 유니폼, 챌린지 60분이면 레전더리 옷(빛나는 옷 · 바닥 문양 · 빛기둥 · 별빛 · 빛 발자국)',
    '첫 화면의 「마이페이지」 — 산 스킨을 캐릭터마다 입혀 보고 고를 수 있어요(스킬 이펙트도 미리 보기로)'] },
  { date: '2026-11-02', title: '새 캐릭터 셋 · 팀 유니폼', items: [
    '새 캐릭터 — 자말 크로포드(크로스오버 · 「식스맨」 리롤 · 스킵 · 제외 한 번씩 더, 이동 속도 +10%), 더크 노비츠키(스카이훅 · 「언블로커블」 범위 +15% · 치명타 +10%), 밤 아데바요(스크린 · 「핸드오프」 지속 +25% · 받는 피해 -1). 각각 그 스킬을 최고 레벨로 만드는 업적(크로스오버 킹 · 스카이훅 마스터 · 철벽 스크리너)으로 열어요',
    '캐릭터마다 그 선수의 팀 유니폼 — 반바지 옆줄 · 양말 · 신발 색이 팀마다 달라요(라멜로 볼은 호네츠 세로 줄무늬, 알렉산더는 썬더 홈 흰 유니폼, 아데바요는 히트 검정)',
    '피부가 아주 어두운 캐릭터 · 수비의 팔다리를 조금 밝게 — 어두운 바닥에서도 손발이 보여요'] },
  { date: '2026-11-02', title: '새 캐릭터 — 더마 드로잔', items: [
    '더마 드로잔 — 시작 스킬 샷 클락, 특성 「클러치 킹」: 체력이 절반 아래면 공격력 +30% · 쿨타임 -5%. 업적 「24초의 지배자」(샷 클락을 최고 레벨로)로 열어요',
    '새 업적 — 「케미스트리」(시너지 처음 완성하기) · 「드림 케미」(한 판에 시너지 3개)'] },
  { date: '2026-11-02', title: '스텝백 슛 강화', items: [
    '스텝백 슛이 화면 안의 보스 · 정예(마스코트)를 먼저 겨눠요 — 등지고 물러서면서도 돌아서 쏴요(없으면 예전처럼 보는 쪽)',
    '보스 · 정예에게는 1.4배로 맞혀요. 피해도 8 → 11, 레벨 업 +4 → +6 · +5 → +8(Lv 8 이 17 → 25)',
    '보스 하나를 상대로 Lv 8 피해가 보스가 앞에 있으면 79 → 164, 등 뒤에 있으면 0 → 160 — 스틸(200쯤) 다음이에요'] },
  { date: '2026-11-02', title: '챔피언 반지 잭팟', items: [
    '챔피언 반지에도 잭팟이 생겼어요 — 5번에 1번(행운 배수 · 돈치치 2배), 돌파할 스킬이 둘 이상이면 나온 스킬(셋까지)을 한 번에 모두 돌파해요. 운이 좋으면 반지가 드물어도 다 돌파할 수 있어요'] },
  { date: '2026-11-02', title: '아이템이 덜 떨어져요', items: [
    '수비가 떨어뜨리는 아이템(생수 · 호루라기 · 타임아웃 · 버저 · 쿨링 스프레이)이 예전의 1/3 — 마스코트 · 중간보스는 늘 → 3번에 1번, 보통 수비는 0.4% → 0.13%(20분부터 스프레이 0.15% → 0.05%). 행운은 그대로 곱해져요',
    '챔피언 반지도 1/3 — 보통 수비 0.011% → 0.0037% · 마스코트 5.5% → 1.8% · 중간보스 10% → 3.3% · 보스 20% → 6.7%. 돌파가 훨씬 늦어져요',
    '보스 트로피 상자는 그대로 늘 나와요',
    '상태이상에 걸렸을 때 근처에 쿨링 스프레이가 생기던 것(60%)은 없앴어요 — 미리 떨어진 스프레이를 챙겨 두세요'] },
  { date: '2026-11-02', title: '새 스킬 — 샷 클락', items: [
    '새 스킬 「샷 클락」 — 수비가 가장 많이 몰린 곳에 24초 시계를 띄우고, 1초 뒤 0이 되면 버저와 함께 크게 터져요',
    '돌파는 「샷 클락 리셋」 — 터진 자리 둘레에 작은 시계 셋이 흩어져 한 번 더 터져요',
    '버저비터의 짝이 생겼어요 — 시너지 「클러치 타임」(버저비터 + 샷 클락): 버저비터 개수 +1 / 샷 클락 범위 +20%. 이제 모든 스킬에 짝이 있어요'] },
  { date: '2026-11-02', title: '스킬 시너지', items: [
    '스킬(주황색)마다 짝이 하나씩 생겼어요 — 짝인 두 스킬을 다 가지면 둘 다 세져요(8쌍, 버저비터만 짝이 없어요)',
    '킥아웃(체스트 패스 + 3점슛) · 앨리웁 덩크(앨리웁 + 덩크) · 속공(리바운드 + 아웃렛 패스) · 트랩 수비(풀코트 프레스 + 스틸) · 크로스오버 스텝백(크로스오버 + 스텝백 슛) · 쇼타임(바운스 패스 + 노룩 패스) · 트윈 타워(블록슛 + 스카이훅) · 픽 앤 롤(스크린 + 유로스텝)',
    '레벨 업 상자의 새 스킬 카드에 짝 · 효과가 나오고, 짝을 이미 가지고 있으면 「보유중」. 효과는 아래 「스킬 · 돌파」 탭에 전부',
    '시너지로 쉬워지는 만큼 5 ~ 20분 수비를 더 단단하게 — 피가 5분 1.25 → 1.4배 · 10분 1.5 → 1.8배 · 15분 2.1 → 2.3배 · 20분 4 → 4.3배'] },
  { date: '2026-11-02', title: '리롤 · 스킵 · 제외', items: [
    '레벨 업 상자에서 한 게임에 두 번씩 쓸 수 있어요 — 리롤(카드 셋을 새로) · 스킵(이번엔 안 고르기) · 제외(카드 하나를 골라 이번 게임에서 다시 안 나오게, 그 자리엔 새 카드)',
    '잭팟 · 트로피 상자에서도 써요. 잭팟은 이제 「셋 다 받기」를 눌러야 받아요(리롤 · 제외로 바꾼 뒤 받거나, 스킵으로 안 받을 수도). 챔피언 반지(돌파) 상자에는 없어요',
    '키보드는 4 리롤 · 5 스킵 · 6 제외'] },
  { date: '2026-11-02', title: '성장 더 느리게 · 넉백 · 잭팟', items: [
    '줍는 경험치를 20% 줄이고, 레벨 업에 필요한 경험치를 늘렸어요(Lv 16 부터 20% — 처음 몇 레벨은 그대로) — 스킬을 다 키우는 때가 17분쯤에서 22분쯤으로',
    '잭팟이 아주 드물어졌어요 — 기본 확률 7% → 1%(행운 · 돈치치 2배는 그대로, 트로피 상자는 50% 그대로)',
    '블록슛 피해를 약하게 — 12 → 9, 레벨 업 피해 +4 → +3 · +6 → +4',
    '스킬에 밀려나는 건 이제 작은 수비(신인 · 팬 · 심판)뿐이에요. 빅맨 · 마스코트 · 보스는 밀리지 않아요',
    '대신 성장이 느려진 만큼 20분 전 수비를 조금 덜 몰려오고 덜 단단하게 했어요 — 빅맨은 4분부터 더 적게, 몸통 피해 12 → 10, 보스 피도 조금. 25분부터는 수비 피해가 1.25배 → 1.4배'] },
  { date: '2026-11-01', title: '코트 선 정리', items: ['아레나 · 챌린지 바닥의 코트 선(자유투 원 · 3점 선)이 겹쳐 보이던 것을 고쳤어요 — 실제 코트 비율로 다시 그렸어요(스트리트 파크도)', '챌린지 바닥의 코트 사이 간격을 가로세로 같게'] },
  { date: '2026-11-01', title: '수비를 묶는 스킬 조정 · 패치 노트', items: [
    '풀코트 프레스가 더는 수비를 느리게 하지 않아요(돌파 「존 프레스」도). 안에 들어온 호루라기도 느려지지 않아요. 존 프레스는 압박 범위 +30%',
    '덩크 충격파가 밀쳐 내는 거리를 절반으로',
    '블록슛 손이 날아오는 호루라기를 막는 건 이제 10% 확률',
    '패치 노트 — 첫 화면 「패치 노트」 · 아래 「패치 노트」 탭. 아래 설명을 탭으로 나눴어요'] },
  { date: '2026-11-01', title: '성장 속도 · 난이도 조정', items: [
    'Lv 20 부터 다음 레벨까지 필요한 경험치가 점점 더 많이 늘어나요 — 스킬을 다 키우는 때가 15분쯤에서 17분쯤으로, 돌파를 다 하는 때는 25분쯤',
    '챔피언 반지가 더 드물게 떨어져요',
    '풀코트 프레스 · 스크린 · 블록슛 · 앵클 브레이커처럼 수비를 묶는 스킬을 약하게',
    '흥분 — 10분부터 오래 느려져 있던 수비는 발밑이 붉게 달아올라 3초 동안 느려지지도 밀리지도 않고 더 빨리 달려들어요',
    '풀코트 러시는 스킬에 맞지 않고, 보스 · 중간보스는 느려지지 않아요',
    '하프코트 폭격 · 내려찍기 · 러시 · 보스의 농구공이 더 아파요(최대 체력 비례). 보스 몸통에 닿아도 최대 체력의 8 ~ 10% 넘게',
    '10 ~ 20분 수비 체력은 느려진 성장에 맞춰 완만하게'] },
  { date: '2026-11-01', title: '상태이상 「봉인」', items: ['감독 · 수석 심판 · MVP 가 봉인을 걸어요 — 10초 동안 주력 스킬 하나를 못 써요(아이콘에 X). 쿨링 스프레이로 풀려요'] },
  { date: '2026-11-01', title: '얼굴 방향 · 랭킹 스킬', items: ['움직일 때 얼굴이 반대쪽을 보던 캐릭터를 고쳤어요', '랭킹에서 그 기록의 스킬을 볼 수 있어요(돌파는 금테)'] },
  { date: '2026-11-01', title: '보스 · 변수 기술 · 챌린지', items: [
    '15분부터 변수 기술(하프코트 폭격 · 풀코트 러시) — 가만히 서 있으면 못 버텨요',
    '보스 6종 — 17분부터 중간보스, 25분부터는 1분마다 다른 보스',
    '상태이상(슬로우 · 약화 · 약체화)과 쿨링 스프레이',
    '챌린지 맵 — 시간 제한 없이 최고 기록',
    '스킬 4개(리바운드 · 유로스텝 · 스틸 · 아웃렛 패스) · 캐릭터 4명 · 업적 9개'] },
  { date: '2026-11-01', title: '스킬 돌파', items: ['최고 레벨(8) 스킬은 챔피언 반지를 주우면 한 번씩 돌파해요 — 피해는 그대로, 쓰는 법이 바뀌어요'] },
  { date: '2026-10-29', title: '심판 등장', items: ['20분부터 심판이 멀리서 호루라기를 던져요'] },
  { date: '2026-10-29', title: '랭킹', items: ['맵마다 랭킹 — 로그인하면 판이 끝날 때 기록이 올라가요', '난이도를 올리고 사람 그림 · 효과를 다시 그렸어요'] },
  { date: '2026-10-29', title: '덩크 서바이버 공개', items: ['30분 생존 · 캐릭터 10명 · 스킬 13 · 아이템 13 · 맵 3 · 업적 27'] },
]
const NOTES_SEEN = 'survive.notes'   // 본 패치 노트 수(이 브라우저) — 늘면 첫 화면 버튼에 NEW
const noteList = () => h('div', { className: 'sv-notes' }, NOTES.map(n => h('section', {}, h('h3', {}, h('time', {}, n.date), n.title), h('ul', {}, n.items.map(x => h('li', {}, x))))))
const notesNew = () => { try { return +(localStorage.getItem(NOTES_SEEN) || 0) < NOTES.length } catch { return false } }
function notes() {
  try { localStorage.setItem(NOTES_SEEN, String(NOTES.length)) } catch {}
  show(false, h('div', { className: 'sv-panel sv-wide' }, h('p', { className: 'sv-h' }, '패치 노트'), noteList(), row(btn('← 처음으로', title, 'is-main'))))
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
  document.getElementById('sv-guide-syn').replaceChildren(...SYN.map(s => tr(h('th', {}, h('b', {}, s[0])), h('td', {}, Object.keys(s[1]).map(id => WEAP[id].name).join(' + ')), h('td', {}, synText(s)))))
  document.getElementById('sv-guide-breaks').replaceChildren(...Object.entries(BREAK).map(([id, d], i) => h('li', { style: `--i:${i}` },
    h('img', { src: ICON_URL[`${id}+`], alt: '' }), h('div', {}, h('small', {}, `${WEAP[id].name} 돌파`), h('b', {}, d.name), h('span', {}, d.note)))))
  document.getElementById('sv-ring').src = ITEMS.ring.c.toDataURL()
  const when = kind => PLAN.filter(p => p[1] === kind).map(([t, , mid]) => `${t / 60}분${mid ? '(중간보스)' : ''}`).join(' · ')
  document.getElementById('sv-guide-bosses').replaceChildren(...Object.entries(BOSS).map(([kind, B]) => tr(named(SPR[kind][0].R[0].c.toDataURL(), B.name, 'sv-boss'), h('td', {}, when(kind)), h('td', {}, B.note))))
  document.getElementById('sv-guide-status').replaceChildren(...Object.values(STATUS).map(st => tr(h('th', {}, h('b', { style: `color:${st.col}` }, st.name)), h('td', {}, `${st.note} · ${ST_T}초`))))
  document.getElementById('sv-spray').src = ITEMS.spray.c.toDataURL()
  document.getElementById('sv-guide-notes').replaceChildren(noteList())
  document.getElementById('sv-guide-items').replaceChildren(...Object.entries(PASS).map(([id, d]) => tr(named(ICON_URL[id], d.name, 'sv-ico'), h('td', {}, `${d.note} (최대 Lv ${d.max})`))))
  guideAchs()
}
// 설명 탭 — 주소 끝 #sv-g-… 이면 그 탭부터
const gtabs = document.querySelector('.sv-gtabs')
function gtab(id) {
  for (const b of gtabs.children) { const on = b.getAttribute('aria-controls') === id; b.setAttribute('aria-selected', String(on)); document.getElementById(b.getAttribute('aria-controls')).hidden = !on }
}
gtabs.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) gtab(b.getAttribute('aria-controls')) })
if (document.getElementById(location.hash.slice(1))?.classList.contains('sv-gpanel')) gtab(location.hash.slice(1))
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
  else if (mode === 'shop' && G) demoStep(dt)
  else if (!G) cam.x += dt * 24
  if (mode !== lastMode) { lastMode = mode; still = 2 }
  if (mode === 'play' || mode === 'shop' || !G || still-- > 0) render()   // 멈춰 있는 동안(상자 · 일시정지 · 결과)은 다시 그리지 않는다 — 상자 연출(HTML)이 부드럽게
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
  img.onload = () => {
    try { ch.head = cutHead(img, true); ch.chin = chinOf(ch.head); [ch.skin] = skinOf(img) } catch {}
    THUMB.clear(); if (mode === 'shop' && CHARS[shopCi] === ch) shop(closetOn, true)   // 상점 · 마이페이지가 얼굴보다 먼저 떴으면 다시
  }
  img.src = faceOf(P(ch.id))
}
ready = true
guide()
title()
loadRank()
startAuth('', pull)
