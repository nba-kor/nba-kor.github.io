#!/usr/bin/env node
// 중국 서버 공식 사이트(qmx.163.com)에서 미출시 선수의 얼굴 이미지와 신체 데이터를 가져온다.
//
//   node tools/cn-faces/fetch.mjs
//   node tools/cn-faces/fetch.mjs --download   # 원본만 내려받고 끝
//
// 소스가 셋이다.
//  1) 홈페이지 "巨星云集" 캐러셀 아트 — 한 명씩 깔끔하게 렌더된 전신 이미지. 51명분.
//  2) 아트 스테이션 배포 데이터 — 중국 서버 전 캐릭터(95종)의 role_pic. 1)에 없는 선수를 여기서 채운다.
//     한 장에 여러 포즈가 같이 들어있는 경우가 있어 1)을 우선한다.
//  3) 홈페이지 HTML 의 선수 카드 — 키·몸무게·생일·별명.
//
// 어느 쪽이든 전신 렌더라 얼굴을 직접 잘라야 한다. crop.py 준비:
//   uv venv tools/cn-faces/.venv
//   VIRTUAL_ENV=tools/cn-faces/.venv uv pip install "opencv-python-headless<5" numpy pillow
//
// 얼굴이 엉뚱하게 잘리면 tune.json 에 좌표를 비율(0~1)로 적어준다.
//   { "<중국 캐러셀 id 또는 우리 선수 id>": { "face": [중심x, 중심y, 얼굴폭] } }

import { writeFile, mkdir, readFile, copyFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const RAW = `${HERE}/raw`, CUT = `${HERE}/cut`          // 캐러셀 아트
const ART = `${HERE}/art`, ART_CUT = `${HERE}/art-cut`  // 아트 스테이션 role_pic
const CN_M = 'https://qmx.163.com/m/'
const CN_PC = 'https://qmx.163.com/'
const ART_API = 'https://ccc.hi.163.com/qmx-ugc-server/ccc-table-conf/fed-url'
const UA = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }
const UA_PC = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }   // PC 페이지는 모바일 UA 로 받으면 /m/ 로 넘어간다

// 캐러셀 이미지 id -> 영문 선수명. 같은 사이트의 <id>-name.png(한자 이름 이미지)로 확인했다.
// 모바일과 PC 가 같은 선수를 다른 id 로 부르는 경우가 있어 양쪽을 다 넣어 뒀다.
const CN2EN = {
  allen: 'Guo Ailun', alun: 'Allen Iverson', ane: "Shaquille O'Neal", baoluo: 'Chris Paul',
  bhls: 'Ben Wallace', blcglf: 'Blake Griffin', bljse: 'Pau Gasol', btl: 'Jimmy Butler',
  csp: 'Metta World Peace', dengken: 'Tim Duncan', dk: 'Dirk Nowitzki', dongqiqi: 'Luka Doncic',
  dulante: 'Kevin Durant', dws: 'Anthony Davis', enbide: 'Joel Embiid', hadeng: 'James Harden',
  hajimu: 'Hakeem Olajuwon', hanxu: 'Han Xu', hdl: 'Jrue Holiday', hlbd: 'Tyrese Haliburton',
  hz: 'Anthony Edwards', jide: 'Jason Kidd', jlbl: 'Jaylen Brown', kaer: 'Karl Malone',
  kczz: null,                                   // 克城之子·詹姆斯 — 르브론 얼터너티브 카드, 제외
  kuli: 'Stephen Curry', kw: 'Kevin Durant', ldm: 'Dennis Rodman', lk: 'Luka Doncic',
  lm: 'Li Meng', lnd: 'Kawhi Leonard', longduo: 'Rajon Rondo', ls: 'Derrick Rose',
  lsh: 'Jeremy Lin', lyr: 'Li Yueru', mkg: 'Tracy McGrady', mkgld: 'Tracy McGrady',
  mn: 'Alonzo Mourning', ngl: 'Nikola Jokic', nwzj: 'Dirk Nowitzki', ow: 'Kyrie Irving',
  pake: 'Tony Parker', piersi: 'Paul Pierce', 'ray-allen': 'Ray Allen',
  tangpusen: 'Klay Thompson', ts: 'Karl-Anthony Towns', ttm: 'Jayson Tatum',
  wbym: 'Victor Wembanyama', wd: 'Dwyane Wade', wsblk: 'Russell Westbrook',
  yangnisi: 'Giannis Antetokounmpo', yhs: 'Yang Hansen', yjl: 'Yi Jianlian',
  ylsd: 'Shai Gilgeous-Alexander', yns: 'Giannis Antetokounmpo', yuejiqi: 'Nikola Jokic',
  zhanmusi: 'LeBron James', zms: 'LeBron James',
  glf: 'Blake Griffin', hld: 'Jrue Holiday', hdhz: 'Anthony Edwards',
  hjm: 'Hakeem Olajuwon', hx: 'Han Xu', kl: 'Klay Thompson',
}

// 아트 스테이션 제목(한자) -> 영문 선수명. 중국 서버 전 캐릭터 목록이기도 하다.
const ART2EN = {
  阿德巴约: 'Bam Adebayo', 阿隆戈登: 'Aaron Gordon', 艾弗森: 'Allen Iverson', 艾拉: 'Aila',
  爱德华兹: 'Anthony Edwards', 奥拉朱旺: 'Hakeem Olajuwon', 巴特勒: 'Jimmy Butler',
  保罗乔治: 'Paul George', 保罗: 'Chris Paul', 本华莱士: 'Ben Wallace',
  波尔津吉斯: 'Kristaps Porzingis', 布克: 'Devin Booker', 布拉德米勒: 'Brad Miller',
  布里奇斯: 'Mikal Bridges', 慈世平: 'Metta World Peace', 戴维斯: 'Anthony Davis',
  德罗赞: 'DeMar DeRozan', 邓肯: 'Tim Duncan', 狄龙布鲁克斯: 'Dillon Brooks',
  东契奇: 'Luka Doncic', 杜兰特: 'Kevin Durant', 恩比德: 'Joel Embiid',
  风城玫瑰罗斯: null, 傅值: 'Fu Zhi', 富尼耶: 'Evan Fournier', 格里芬: 'Blake Griffin',
  格林: 'Draymond Green', 郭艾伦: 'Guo Ailun', 哈登: 'James Harden',
  哈里伯顿: 'Tyrese Haliburton', 海沃德: 'Gordon Hayward', 韩旭: 'Han Xu', 洪寿: 'Hong Shou',
  胡里奥: 'Julio', 霍乐迪: 'Jrue Holiday', 基德: 'Jason Kidd', 加索尔: 'Pau Gasol',
  贾伦杰克逊: 'Jaren Jackson Jr.', 杰伦布朗: 'Jaylen Brown', 卡梅隆约翰逊: 'Cameron Johnson',
  卡佩拉: 'Clint Capela', 克城之子詹姆斯: null, 克拉克森: 'Jordan Clarkson',
  克劳福德: 'Jamal Crawford', 库里: 'Stephen Curry', 库明加: 'Jonathan Kuminga',
  '拉简·隆多': 'Rajon Rondo', '拉梅洛·鲍尔': 'LaMelo Ball', 拉文: 'Zach LaVine',
  雷阿伦: 'Ray Allen', 李凯尔: 'Kyle Anderson', 李梦: 'Li Meng', 李月汝: 'Li Yueru',
  林书豪: 'Jeremy Lin', 伦纳德: 'Kawhi Leonard', 罗德曼: 'Dennis Rodman', 罗斯: 'Derrick Rose',
  洛佩兹: 'Brook Lopez', 马尔卡宁: 'Lauri Markkanen', 马龙: 'Karl Malone',
  麦科勒姆: 'CJ McCollum', 麦克戴斯: 'Antonio McDyess', 麦克格雷迪: 'Tracy McGrady',
  米宝: null, 莫宁: 'Alonzo Mourning', 穆雷: 'Jamal Murray', 努尔基奇: 'Jusuf Nurkic',
  诺维茨基: 'Dirk Nowitzki', 欧文: 'Kyrie Irving', 帕克: 'Tony Parker', 皮尔斯: 'Paul Pierce',
  皮特森: 'Morris Peterson', 塞斯库里: 'Seth Curry', '沙奎尔·奥尼尔': "Shaquille O'Neal",
  施罗德: 'Dennis Schroder', 塔图姆: 'Jayson Tatum', 汤普森: 'Klay Thompson',
  唐斯: 'Karl-Anthony Towns', 特纳: 'Myles Turner', 威金斯: 'Andrew Wiggins',
  威斯布鲁克: 'Russell Westbrook', 韦德: 'Dwyane Wade', 文班亚马: 'Victor Wembanyama',
  西亚卡姆: 'Pascal Siakam', 希罗: 'Tyler Herro', 锡安: 'Zion Williamson',
  亚当斯: 'Steven Adams', 亚历山大: 'Shai Gilgeous-Alexander', 扬尼斯: 'Giannis Antetokounmpo',
  杨瀚森: 'Yang Hansen', 易建联: 'Yi Jianlian', 英格拉姆: 'Brandon Ingram',
  约基奇: 'Nikola Jokic', 詹姆斯: 'LeBron James', 周长: 'Zhou Chang',
}

const get = async (url, bin = false, headers = UA) => {
  const r = await fetch(url, { headers })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return bin ? Buffer.from(await r.arrayBuffer()) : r.text()
}
const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '')
const num = s => { const m = String(s).match(/[\d.]+/); return m ? +m[0] : null }
const isoDate = s => {
  const m = String(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''
}
const crop = (src, dst) => {
  const py = [`${HERE}/.venv/bin/python`, 'python3'].find(p => p === 'python3' || existsSync(p))
  execFileSync(py, [`${HERE}/crop.py`, src, dst, `${HERE}/tune.json`], { stdio: 'inherit' })
}

const up = JSON.parse(await readFile(`${ROOT}/data/upcoming.json`, 'utf8'))
const byEn = new Map(up.players.map(p => [norm(p.en), p]))

// ---------------------------------------------------------------- 1) 캐러셀 아트

await mkdir(RAW, { recursive: true })
const mHome = await get(CN_M)
const cssUrl = mHome.match(/https:\/\/qmx\.res\.netease\.com\/[^"']+\/css\/index_[0-9a-f]+\.css/)?.[0]
if (!cssUrl) throw new Error('중국 모바일 사이트 CSS를 찾지 못했습니다. 사이트 구조가 바뀐 듯합니다.')
const css = await get(cssUrl)
const carousel = [...new Set(css.match(/https:\/\/[^ "')]*\/img\/p-[a-z0-9-]+_[0-9a-f]{8}\.png/g) || [])]
const unknown = []
for (const u of carousel) {
  const id = u.replace(/.*\/img\/p-/, '').replace(/_[0-9a-f]{8}\.png$/, '')
  if (!(id in CN2EN)) unknown.push(id)
  if (!existsSync(`${RAW}/${id}.png`)) await writeFile(`${RAW}/${id}.png`, await get(u, true))
}
console.log(`캐러셀 아트 ${carousel.length}장`)
if (unknown.length) console.warn(`  ! 누구인지 모르는 캐러셀 id: ${unknown.join(', ')} → CN2EN 에 추가하세요`)

// ---------------------------------------------------------------- 2) 아트 스테이션

await mkdir(ART, { recursive: true })
const fedUrl = JSON.parse(await get(ART_API)).data?.fed_url
if (!fedUrl) throw new Error('아트 스테이션 배포 URL을 찾지 못했습니다.')
const table = JSON.parse(await get(fedUrl))['ugc-art'] || {}
const artRows = Object.values(table)
const artUnknown = []
const artNeed = new Map()   // 우리 선수 id -> role_pic URL
for (const r of artRows) {
  const title = String(r.title || '').replace('素材', '').trim()
  if (!(title in ART2EN)) { artUnknown.push(title); continue }
  const en = ART2EN[title]
  if (!en || !r.role_pic) continue
  const p = byEn.get(norm(en))
  if (p) artNeed.set(p.id, r.role_pic)
}
console.log(`아트 스테이션 캐릭터 ${artRows.length}종 (중국 서버 전체 로스터)`)
if (artUnknown.length) console.warn(`  ! 매핑 없는 제목: ${artUnknown.join(', ')} → ART2EN 에 추가하세요`)
for (const [id, u] of artNeed) if (!existsSync(`${ART}/${id}.png`)) await writeFile(`${ART}/${id}.png`, await get(u, true))

if (process.argv.includes('--download')) process.exit(0)

// ---------------------------------------------------------------- 3) 얼굴 자르기 & 반영

crop(RAW, CUT)
crop(ART, ART_CUT)

const cut = new Set((await readdir(CUT)).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)))
const artCut = new Set((await readdir(ART_CUT)).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)))

let fromCarousel = 0, fromArt = 0
const done = new Set()
for (const [cn, en] of Object.entries(CN2EN)) {          // 캐러셀 우선 (단일 인물이라 깔끔하다)
  if (!en || !cut.has(cn)) continue
  const p = byEn.get(norm(en))
  if (!p || done.has(p.id)) continue
  await copyFile(`${CUT}/${cn}.png`, `${ROOT}/assets/players/${p.id}.png`)
  p.img = `/assets/players/${p.id}.png`
  done.add(p.id); fromCarousel++
}
for (const p of up.players) {                            // 남은 선수는 아트 스테이션으로
  if (done.has(p.id) || !artCut.has(p.id)) continue
  await copyFile(`${ART_CUT}/${p.id}.png`, `${ROOT}/assets/players/${p.id}.png`)
  p.img = `/assets/players/${p.id}.png`
  done.add(p.id); fromArt++
}

// ---------------------------------------------------------------- 4) 신체 데이터

const pcHome = await get(CN_PC, false, UA_PC)
let stats = 0
for (const block of pcHome.split(/(?=class="item item-)/)) {
  const cid = block.match(/^class="item item-([a-z0-9-]+)"/)?.[1]
  const en = cid && CN2EN[cid]
  const p = en && byEn.get(norm(en))
  if (!p) continue
  const d = Object.fromEntries([...block.matchAll(/<sup>(身高|生日|体重|昵称)<\/sup><\/span><sub>([^<]*)<\/sub>/g)].map(m => [m[1], m[2].trim()]))
  if (!d['身高']) continue
  p.height = num(d['身高']); p.weight = num(d['体重'])
  p.birthday = isoDate(d['生日']); p.nicknameCn = d['昵称'] || ''
  stats++
}

const fmt = v => Array.isArray(v)
  ? (v.length ? `[\n${v.map(x => '    ' + fmt(x)).join(',\n')}\n  ]` : '[]')
  : (v && typeof v === 'object'
    ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(', ')} }`
    : JSON.stringify(v))
await writeFile(`${ROOT}/data/upcoming.json`, `{\n  ${Object.entries(up).map(([k, v]) =>
  `${JSON.stringify(k)}: ${k === 'players' ? fmt(v) : (k === 'schema' || k === 'unverified') ? JSON.stringify(v, null, 4).replace(/\n/g, '\n  ') : JSON.stringify(v)}`)
  .join(',\n  ')}\n}\n`)

const missing = up.players.filter(p => !p.img)
console.log(`\n얼굴 적용: 캐러셀 ${fromCarousel}명 + 아트 스테이션 ${fromArt}명 = ${done.size}/${up.players.length}명`)
console.log(`신체 데이터: ${stats}명`)
if (missing.length) console.log(`얼굴 없는 선수 ${missing.length}명: ${missing.map(p => p.name).join(', ')}`)

// 한국 로스터 중 공식 라인업 카드가 없는 선수도 여기서 얼굴을 만들 수 있다
const kr = JSON.parse(await readFile(`${ROOT}/data/players.json`, 'utf8')).players.filter(p => !p.img)
for (const p of kr) {
  const title = Object.keys(ART2EN).find(t => ART2EN[t] && norm(ART2EN[t]) === norm(p.en))
  if (title) console.log(`  · 한국 로스터 "${p.name}" 은 아트 스테이션에 있습니다 — assets/players/${p.id}.png 생성 후 update-players.mjs 의 EXTRA 에 img 를 지정하세요`)
}
