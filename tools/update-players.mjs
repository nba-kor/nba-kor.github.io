#!/usr/bin/env node
// 공식 홈페이지(https://www.dunkcitymobile.com/kr/)의 "슈퍼스타 라인업" 데이터를 긁어
// data/players.json 과 assets/players/<id>.png 를 갱신한다.
//
//   node tools/update-players.mjs
//
// 신규 선수가 한국 서버에 추가되면 이 스크립트만 다시 돌리면 된다.
// 미출시(중국/글로벌 서버) 선수는 data/upcoming.json 에서 직접 관리한다.

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = 'https://www.dunkcitymobile.com/kr/'
const UA = { 'User-Agent': 'Mozilla/5.0', Referer: HOME }

// 공식 사이트는 영문명을 제공하지 않아 id -> 영문명만 수동 매핑한다.
// 새 id가 나타나면 여기에 한 줄 추가 (없어도 동작하며 en 이 빈 문자열이 된다).
const EN = {
  nwsj: 'Dirk Nowitzki', weisblk: 'Russell Westbrook', klfd: 'Stephen Curry',
  james: 'LeBron James', hcyh: 'Yuki Kawamura', yns: 'Giannis Antetokounmpo',
  lkdqq: 'Luka Doncic', yjq: 'Nikola Jokic', sga: 'Shai Gilgeous-Alexander',
  ebd: 'Joel Embiid', al: 'Aila', bk: 'Devin Booker', kl: 'Klay Thompson',
  blqz: 'Paul George', dlz: 'DeMar DeRozan', bl: 'LaMelo Ball',
  wjs: 'Andrew Wiggins', wsblk: 'Zion Williamson', bm: 'Bam Adebayo',
  klks: 'Jamal Crawford', dqq: 'Steven Adams', djse: 'Dennis Schroder',
  bldml: 'Kristaps Porzingis', kpl: 'Clint Capela', sskl: 'Seth Curry',
  hwd: 'Gordon Hayward', kmlyhx: 'Jonathan Kuminga', nejq: 'Jusuf Nurkic',
  kjm: 'Cameron Johnson', lke: 'Kyle Anderson', mkds: 'Antonio McDyess',
  ml: 'Morris Peterson', pts: 'Brad Miller', fz: 'Fu Zhi', hs: 'Hong Shou',
  zc: 'Zhou Chang', hla: 'Julio',
}

const get = async (url, bin = false) => {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return bin ? Buffer.from(await res.arrayBuffer()) : res.text()
}

const num = s => { const m = String(s).match(/[\d.]+/); return m ? +m[0] : null }
const isoDate = s => {
  const m = String(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''
}

const home = await get(HOME)
const bundleUrl = home.match(/https:\/\/[^"']+\/js\/kr\/index_[0-9a-f]+\.js/)?.[0]
if (!bundleUrl) throw new Error('index 번들 URL을 찾지 못했습니다. 사이트 구조가 바뀐 듯합니다.')
const publicPath = bundleUrl.replace(/js\/kr\/index_[0-9a-f]+\.js$/, '')
const js = await get(bundleUrl)

// webpack 모듈 id -> assets/<name>_<hash>.png
const mod = {}
for (const m of js.matchAll(/"?([A-Za-z0-9+/_$-]{2,8})"?:function\([a-z],[a-z],([a-z])\)\{[a-z]\.exports=\2\.p\+"(assets\/[^"]+)"\}/g)) mod[m[1]] = m[3]
// require.context: "./m/superstars/player/card-klfd.png" -> 모듈 id
const ctx = {}
for (const m of js.matchAll(/"(\.\/[^"]+\.(?:png|jpg|webp))":"([^"]+)"/g)) ctx[m[1]] = m[2]
const asset = p => (mod[ctx[p]] ? publicPath + mod[ctx[p]] : null)

const ROSTER = /\{id:"([a-z0-9]+)",name:"([^"]*)",short_name:"([^"]*)",height:"([^"]*)",weight:"([^"]*)",birthday:"([^"]*)",nickname:"([^"]*)",video:"([^"]*)",position:(\d+),desc:"([^"]*)"\}/g
const seen = new Set()
const players = []
for (const m of js.matchAll(ROSTER)) {
  const [, id, name, short, height, weight, birthday, nickname, , position, desc] = m
  if (!/[가-힣]/.test(name + desc) || seen.has(id)) continue // 같은 번들에 일본어판도 들어있다
  seen.add(id)
  players.push({
    id,
    name,
    short,
    en: EN[id] || '',
    pos: +position, // 1=PG 2=SG 3=SF 4=PF 5=C
    height: num(height),
    weight: num(weight),
    birthday: isoDate(birthday),
    nickname,
    desc: desc.replace(/\s+/g, ' ').trim(),
    img: `assets/players/${id}.png`,
    server: 'kr',
  })
}
if (!players.length) throw new Error('선수 데이터를 찾지 못했습니다. 사이트 구조가 바뀐 듯합니다.')

await mkdir(`${ROOT}/assets/players`, { recursive: true })
let downloaded = 0
for (const p of players) {
  const url = asset(`./m/superstars/player/card-${p.id}.png`)
  if (!url) { console.warn(`  ! 이미지 없음: ${p.id} (${p.name})`); continue }
  await writeFile(`${ROOT}/assets/players/${p.id}.png`, await get(url, true))
  downloaded++
}

await writeFile(`${ROOT}/data/players.json`, JSON.stringify({
  updatedAt: new Date().toISOString().slice(0, 10),
  source: HOME,
  note: '자동 생성 파일 — 직접 수정하지 말고 tools/update-players.mjs 를 다시 실행하세요.',
  players,
}, null, 2) + '\n')

console.log(`선수 ${players.length}명, 이미지 ${downloaded}장 갱신 완료`)
const missing = players.filter(p => !p.en).map(p => `${p.id}(${p.name})`)
if (missing.length) console.log(`영문명 미매핑 → tools/update-players.mjs 의 EN 에 추가: ${missing.join(', ')}`)
