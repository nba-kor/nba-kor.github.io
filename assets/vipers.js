// 바이퍼스 네 팀 · 선수 고르기 · 등번호 — 슈퍼 슬램(slam.js) · 스트리트 3:3(street.js)이 같이 쓴다
export const TEAMS = [
  { name: 'VIPERS_T', color: '#d6323a', dark: '#7d1520', trim: '#18181c' },   // trim = 보조색(테두리 · 허리 · 옆 줄)
  { name: 'VIPERS_N', color: '#1f9d6b', dark: '#0d5a3c', trim: '#f2c14e' },
  { name: 'VIPERS_A', color: '#2f6fd0', dark: '#173c7a', trim: '#f4f6fb' },
  { name: 'VIPERS_B', color: '#8b4fd0', dark: '#4a2483', trim: '#cfd4de' },
]
export const NUMS = [1, 7, 10, 23, 34]   // 실제 등번호를 모르는 선수(덩크 시티에만 있는 선수)는 포지션 번호
// 등번호 — 실제 NBA 등번호(가장 잘 알려진 번호). 선수 id 로 — 국내 서버에 아직 없는 선수(upcoming)도 들어오면 바로 쓴다
export const NBA_NUM = {
  lkdqq: 77, bl: 1, weisblk: 0, sga: 2, klfd: 30, hcyh: 17, 'tyrese-haliburton': 0,
  djse: 17, bk: 1, sskl: 30, klks: 11, clarkson: '00', kl: 11,
  hwd: 20, dlz: 10, james: 23, ml: 24, wjs: 22, kjm: 23, durant: 35, blqz: 13, 'jimmy-butler': 22,
  nwsj: 41, mkds: 24, yns: 34, wsblk: 1, kmlyhx: '00', lke: 1,
  yjq: 15, bm: 13, pts: 52, dqq: 12, nejq: 27, ebd: 21, bldml: 6, kpl: 15, 'brook-lopez': 11, 'anthony-davis': 3,
  'derrick-rose': 1, 'rajon-rondo': 9, 'jamal-murray': 27, 'jeremy-lin': 17, 'jason-kidd': 5, 'jrue-holiday': 21, 'kyrie-irving': 11, 'chris-paul': 3, 'tony-parker': 9,
  'dwyane-wade': 3, 'ray-allen': 20, 'manu-ginobili': 20, 'anthony-edwards': 5, 'allen-iverson': 3, 'zach-lavine': 8, 'james-harden': 13, 'tyler-herro': 14, 'tracy-mcgrady': 1, 'cj-mccollum': 3,
  'dillon-brooks': 24, 'metta-world-peace': 37, 'mikal-bridges': 25, 'brandon-ingram': 14, 'jaylen-brown': 7, 'kawhi-leonard': 2, 'paul-pierce': 34,
  'dennis-rodman': 91, 'draymond-green': 23, 'lauri-markkanen': 23, 'blake-griffin': 32, 'aaron-gordon': 50, 'jaren-jackson-jr': 13, 'jayson-tatum': 0,
  'karl-malone': 32, 'karl-anthony-towns': 32, 'tim-duncan': 21, 'pascal-siakam': 43,
  'myles-turner': 33, 'ben-wallace': 3, 'victor-wembanyama': 1, 'shaquille-o-neal': 34, 'alonzo-mourning': 33, 'pau-gasol': 16, 'hakeem-olajuwon': 34,
}
// 팀마다 포지션 1~5 에서 한 명씩 — 팀끼리 겹치지 않게 포지션 목록(kr = 국내 서버 선수)의 같은 순번. 없으면 undefined
export const lineup = (kr, ti) => [1, 2, 3, 4, 5].map(pos => { const list = kr.filter(p => p.pos === pos); return list[ti % list.length] })
export const SKIN = '#b9825a'   // 얼굴에서 피부색을 못 뽑으면
// 얼굴 배지(둥근 그림)에서 머리만 — 바깥 고리에서 시작해 노란 배경색만 번져 지우고(flood fill), 흰 고리 · 아래 옷은 머리 모양 타원으로 잘라 낸다
export function cutHead(img) {
  const c = Object.assign(document.createElement('canvas'), { width: 180, height: 180 }), x = c.getContext('2d', { willReadFrequently: true })
  x.drawImage(img, 0, 0, 180, 180)
  const d = x.getImageData(0, 0, 180, 180), px = d.data, seen = new Uint8Array(180 * 180), q = []
  const bg = k => { const i = k * 4, r = px[i], gg = px[i + 1], b = px[i + 2]; return r > 228 && gg > 165 && gg < 238 && b < 185 && r - b > 70 }
  for (let k = 0; k < 180 * 180; k++) { const r = Math.hypot(k % 180 - 90, (k / 180 | 0) - 90); if (r > 74 && r < 84 && bg(k)) { seen[k] = 1; q.push(k) } }
  while (q.length) {
    const k = q.pop(), cx = k % 180
    px[k * 4 + 3] = 0
    for (const n of [cx > 0 ? k - 1 : -1, cx < 179 ? k + 1 : -1, k - 180, k + 180]) if (n >= 0 && n < 180 * 180 && !seen[n] && bg(n)) { seen[n] = 1; q.push(n) }
  }
  x.putImageData(d, 0, 0)
  const h = Object.assign(document.createElement('canvas'), { width: 124, height: 132 }), hx = h.getContext('2d')
  hx.beginPath(); hx.ellipse(62, 66, 60, 64, 0, 0, Math.PI * 2); hx.clip()
  hx.drawImage(c, 28, 18, 124, 132, 0, 0, 124, 132)
  return h
}
/** 몸 피부색 — 양 광대의 색 가운데 밝은 쪽(수염 · 그늘을 피한다). [피부, 먼 팔다리용 어두운 색] */
export function skinOf(img) {
  const c = Object.assign(document.createElement('canvas'), { width: 180, height: 180 }), x = c.getContext('2d', { willReadFrequently: true })
  x.drawImage(img, 0, 0, 180, 180)
  const got = []
  for (const cx of [66, 114]) {
    const px = x.getImageData(cx - 5, 84, 10, 12).data
    for (let i = 0; i < px.length; i += 4) { const [r, gg, b] = px.slice(i, i + 3); if (r > gg && gg > b && r - b > 25 && r > 60 && r < 252) got.push([r, gg, b]) }
  }
  if (!got.length) return [SKIN, '#8f5f3e']
  const [r, gg, b] = got.sort((m, n) => m[0] + m[1] + m[2] - n[0] - n[1] - n[2])[Math.floor(got.length * 0.65)]
  return [`rgb(${r},${gg},${b})`, `rgb(${r * 0.78 | 0},${gg * 0.78 | 0},${b * 0.78 | 0})`]
}

