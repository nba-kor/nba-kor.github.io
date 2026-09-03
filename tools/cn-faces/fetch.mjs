#!/usr/bin/env node
// 중국 서버 공식 사이트(qmx.163.com)에서 선수 아트를 받아 얼굴만 잘라
// assets/players/<id>.png 로 넣고 data/upcoming.json 의 img 를 채운다.
//
//   node tools/cn-faces/fetch.mjs            # 내려받기 + 매칭 (crop.py 가 준비돼 있어야 함)
//   node tools/cn-faces/fetch.mjs --download # 원본만 내려받기
//
// 중국 사이트는 전신 렌더만 제공해서 얼굴을 직접 잘라야 한다. crop.py 준비:
//   uv venv tools/cn-faces/.venv
//   VIRTUAL_ENV=tools/cn-faces/.venv uv pip install "opencv-python-headless<5" numpy pillow
//
// 새 선수가 중국 사이트에 추가되면 이 스크립트를 다시 돌리고, 얼굴이 엉뚱하게 잘리면
// tune.json 에 {"<중국id>": {"face": [중심x, 중심y, 얼굴폭]}} 를 비율(0~1)로 적어준다.

import { writeFile, mkdir, readFile, copyFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const RAW = `${HERE}/raw`, CUT = `${HERE}/cut`
const CN_HOME = 'https://qmx.163.com/m/'
const UA = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }

// 중국 사이트 이미지 id -> 영문 선수명.
// 같은 사이트의 <id>-name.png (한자 이름 이미지)를 눈으로 확인해 만든 표다.
// 새 id 가 나오면 https://qmx.163.com/ 의 PC CSS 에서 <id>-name.png 를 열어보고 한 줄 추가.
const CN2EN = {
  allen: 'Guo Ailun', alun: 'Allen Iverson', ane: "Shaquille O'Neal", baoluo: 'Chris Paul',
  bhls: 'Ben Wallace', blcglf: 'Blake Griffin', bljse: 'Pau Gasol', btl: 'Jimmy Butler',
  csp: 'Metta World Peace', dengken: 'Tim Duncan', dk: 'Dirk Nowitzki', dongqiqi: 'Luka Doncic',
  dulante: 'Kevin Durant', dws: 'Anthony Davis', enbide: 'Joel Embiid', hadeng: 'James Harden',
  hajimu: 'Hakeem Olajuwon', hanxu: 'Han Xu', hdl: 'Jrue Holiday', hlbd: 'Tyrese Haliburton',
  hz: 'Anthony Edwards', jide: 'Jason Kidd', jlbl: 'Jaylen Brown', kaer: 'Karl Malone',
  kczz: null,                                   // 克城之子·詹姆스 — 르브론 얼터너티브 카드, 제외
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
}

const get = async (url, bin = false) => {
  const r = await fetch(url, { headers: UA })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return bin ? Buffer.from(await r.arrayBuffer()) : r.text()
}

// ---------------------------------------------------------------- 원본 내려받기

await mkdir(RAW, { recursive: true })
const home = await get(CN_HOME)
const cssUrl = home.match(/https:\/\/qmx\.res\.netease\.com\/[^"']+\/css\/index_[0-9a-f]+\.css/)?.[0]
if (!cssUrl) throw new Error('중국 사이트 CSS를 찾지 못했습니다. 사이트 구조가 바뀐 듯합니다.')
const css = await get(cssUrl)

const urls = [...new Set(css.match(/https:\/\/[^ "')]*\/img\/p-[a-z0-9-]+_[0-9a-f]{8}\.png/g) || [])]
console.log(`선수 아트 ${urls.length}개 발견`)
let got = 0, unknown = []
for (const u of urls) {
  const id = u.replace(/.*\/img\/p-/, '').replace(/_[0-9a-f]{8}\.png$/, '')
  if (!(id in CN2EN)) unknown.push(id)
  if (!existsSync(`${RAW}/${id}.png`)) { await writeFile(`${RAW}/${id}.png`, await get(u, true)); got++ }
}
console.log(`새로 받은 원본 ${got}개`)
if (unknown.length) console.warn(`  ! 누구인지 모르는 id: ${unknown.join(', ')} → CN2EN 에 추가하세요`)
if (process.argv.includes('--download')) process.exit(0)

// ---------------------------------------------------------------- 얼굴 자르기

const py = [`${HERE}/.venv/bin/python`, 'python3'].find(p => p === 'python3' || existsSync(p))
try {
  execFileSync(py, [`${HERE}/crop.py`, RAW, CUT, `${HERE}/tune.json`], { stdio: 'inherit' })
} catch (e) {
  console.error('crop.py 실행 실패 — 파일 상단의 venv 준비 방법을 확인하세요.')
  process.exit(1)
}

// ---------------------------------------------------------------- 매칭 & 반영

const upPath = `${ROOT}/data/upcoming.json`
const up = JSON.parse(await readFile(upPath, 'utf8'))
const krIds = new Set(JSON.parse(await readFile(`${ROOT}/data/players.json`, 'utf8')).players.map(p => p.id))
const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '')
const byEn = new Map(up.players.map(p => [norm(p.en), p]))

const cut = new Set((await readdir(CUT)).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)))
let applied = 0
const done = new Set()
for (const [cn, en] of Object.entries(CN2EN)) {
  if (!en || !cut.has(cn)) continue
  const p = byEn.get(norm(en))
  if (!p || done.has(p.id)) continue
  await copyFile(`${CUT}/${cn}.png`, `${ROOT}/assets/players/${p.id}.png`)
  p.img = `assets/players/${p.id}.png`
  done.add(p.id); applied++
}

// 좌표 배열은 한 줄로 유지하는 포매터
const fmt = v => Array.isArray(v)
  ? `[\n${v.map(x => '    ' + fmt(x)).join(',\n')}\n  ]`
  : (v && typeof v === 'object'
    ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(', ')} }`
    : JSON.stringify(v))
await writeFile(upPath, `{\n  ${Object.entries(up).map(([k, v]) =>
  `${JSON.stringify(k)}: ${k === 'players' ? fmt(v) : k === 'schema' ? JSON.stringify(v, null, 4).replace(/\n/g, '\n  ') : JSON.stringify(v)}`)
  .join(',\n  ')}\n}\n`)

const missing = up.players.filter(p => !p.img)
console.log(`미출시 선수 얼굴 ${applied}명 적용, 아직 없는 선수 ${missing.length}명`)
if (missing.length) console.log(`  ${missing.map(p => p.name).join(', ')}`)
const krOnly = Object.entries(CN2EN).filter(([cn, en]) => en && cut.has(cn) && !byEn.has(norm(en)))
console.log(`  · 한국 서버에 이미 있는 선수라 건너뜀: ${krOnly.length}개 id`)
console.log(`  · 한국 로스터 중 얼굴 없는 선수는 tools/update-players.mjs 의 EXTRA 에서 img 를 지정하세요 (현재 ${[...krIds].length}명 중 일부)`)
