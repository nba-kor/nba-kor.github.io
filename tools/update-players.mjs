#!/usr/bin/env node
// 공식 홈페이지(https://www.dunkcitymobile.com/kr/)에서 선수 데이터를 긁어
// data/players.json 과 assets/players/<id>.png 를 갱신한다.
//
//   node tools/update-players.mjs
//
// 데이터 출처가 둘이다.
//  1) 홈페이지 "슈퍼스타 라인업" — 한글 이름·포지션·신체·별명·소개글·얼굴 이미지가 다 들어있지만
//     인게임 로스터 전체가 실려 있지는 않다.
//  2) 공지 "각 아이템 및 선수 획득 확률 상세 안내" — 이름과 확률뿐이지만 인게임 로스터가 전부 나온다.
// 그래서 1)로 만들고 2)로 교차 검증한다. 2)에만 있는 선수는 아래 EXTRA 에서 채우고,
// EXTRA 에도 없으면 경고를 띄운다. (이 교차 검증이 없어서 클락슨·듀란트가 빠졌던 적이 있다.)
//
// 미출시(중국·글로벌 서버) 선수는 data/upcoming.json 에서 따로 관리한다.

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = 'https://www.dunkcitymobile.com/kr/'
const NEWS = 'https://www.dunkcitymobile.com/kr/news/'
const UA = { 'User-Agent': 'Mozilla/5.0', Referer: HOME }

// 공식 사이트가 영문명을 주지 않아 id -> 영문명만 수동 매핑한다.
// 새 id가 나오면 스크립트가 콘솔에 알려주니 한 줄 추가하면 된다.
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
  zc: 'Zhou Chang', hla: 'Julio', dlt: 'Jamal Murray',
}

// 확률 공지 표기 ↔ 라인업 표기가 다른 선수
const ALIAS = {
  탐슨: '톰슨', 아담스: '애덤스', '유서프 너키치': '누르키치',
  SGA: '알렉산더', '카메론 존슨': '존슨',
}

// 확률 공지에만 있고 라인업 페이지에는 없는 선수. 공식 프로필·이미지가 없어 최소 정보만 채운다.
// 나중에 라인업에 정식 등재되면 그쪽 데이터가 우선한다.
// img 는 중국 서버 공식 사이트에서 가져온 얼굴 (tools/cn-faces 참고). 없으면 이니셜 아바타가 뜬다.
const EXTRA = [
  { id: 'clarkson', name: '조던 클락슨', short: '클락슨', en: 'Jordan Clarkson', pos: 2, img: 'assets/players/clarkson.png' },
  { id: 'durant', name: '케빈 듀란트', short: '듀란트', en: 'Kevin Durant', pos: 3, img: 'assets/players/durant.png' },
]

const get = async (url, bin = false) => {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return bin ? Buffer.from(await res.arrayBuffer()) : res.text()
}
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/​/g, '').replace(/\s+/g, ' ').trim()
const num = s => { const m = String(s).match(/[\d.]+/); return m ? +m[0] : null }
const isoDate = s => {
  const m = String(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''
}

// ---------------------------------------------------------------- 1) 라인업

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

// ---------------------------------------------------------------- 2) 확률 공지로 교차 검증

/** 확률 공개 공지의 "[선수] ... 보급 상자" 표에서 선수 이름만 뽑는다. 실패하면 null. */
async function rosterFromDropRates() {
  try {
    const idx = await get(NEWS)
    const link = [...idx.matchAll(/href="(https:\/\/[^"]*\/kr\/news\/[^"]+)"[\s\S]{0,600}?class="news-title">([^<]+)</g)]
      .find(m => /확률/.test(m[2]))
    if (!link) return null
    const page = await get(link[1])
    const NOT_A_PLAYER = /재능|골드|재료|코어|조각|상자|아이템 이름|블랙 카드|유니폼|코스튬/
    const names = new Set()
    const parts = page.split(/(<table[\s\S]*?<\/table>)/)
    parts.forEach((part, i) => {
      if (!part.startsWith('<table') || !strip(parts[i - 1] || '').includes('[선수]')) return
      for (const row of part.match(/<tr[\s\S]*?<\/tr>/g) || []) {
        const cells = [...row.matchAll(/<td[\s\S]*?<\/td>/g)].map(c => strip(c[0]))
        if (cells.length >= 2 && cells[0] && /^[\d.]+%$/.test(cells[1]) && !NOT_A_PLAYER.test(cells[0])) names.add(cells[0])
      }
    })
    return names.size ? { url: link[1], names: [...names] } : null
  } catch (e) {
    console.warn(`  ! 확률 공지 확인 실패 (${e.message}) — 라인업 데이터만 사용합니다.`)
    return null
  }
}

const rates = await rosterFromDropRates()
const warnings = []
if (!rates) {
  warnings.push('확률 공개 공지를 찾지 못해 인게임 로스터 교차 검증을 건너뛰었습니다.')
} else {
  const have = new Set(players.flatMap(p => [p.short, p.name]))
  const missing = rates.names.map(n => ALIAS[n] || n).filter(n => !have.has(n))
  for (const n of missing) {
    const e = EXTRA.find(x => x.short === n || x.name === n)
    if (e) players.push({
      height: null, weight: null, birthday: '', nickname: '',
      desc: '공식 홈페이지 라인업에는 없지만 인게임에서 획득할 수 있는 선수입니다. (선수 획득 확률 공지 기준)',
      server: 'kr', ...e,
    })
    else warnings.push(`확률 공지에 있는 "${n}" 이(가) 데이터에 없습니다 → tools/update-players.mjs 의 EXTRA 또는 ALIAS 에 추가하세요.`)
  }
  const onlyLineup = players.filter(p => !rates.names.some(n => (ALIAS[n] || n) === p.short))
  if (onlyLineup.length) console.log(`  · 확률 표에는 없는 선수(상자 밖 획득으로 추정): ${onlyLineup.map(p => p.short).join(', ')}`)
}

players.sort((a, b) => a.pos - b.pos || a.name.localeCompare(b.name, 'ko'))

// ---------------------------------------------------------------- 저장

await mkdir(`${ROOT}/assets/players`, { recursive: true })
let downloaded = 0
for (const p of players) {
  const url = asset(`./m/superstars/player/card-${p.id}.png`)
  if (!url) continue                       // EXTRA 선수는 라인업 카드가 없다 (EXTRA 의 img 를 그대로 쓴다)
  await writeFile(`${ROOT}/assets/players/${p.id}.png`, await get(url, true))
  p.img = `assets/players/${p.id}.png`
  downloaded++
}

await writeFile(`${ROOT}/data/players.json`, JSON.stringify({
  updatedAt: new Date().toISOString().slice(0, 10),
  source: HOME,
  crossCheck: rates?.url || null,
  note: '자동 생성 파일 — 직접 수정하지 말고 tools/update-players.mjs 를 다시 실행하세요.',
  players,
}, null, 2) + '\n')

console.log(`선수 ${players.length}명, 이미지 ${downloaded}장 갱신 완료`)
const noEn = players.filter(p => !p.en).map(p => `${p.id}(${p.name})`)
if (noEn.length) console.log(`영문명 미매핑 → EN 에 추가: ${noEn.join(', ')}`)
for (const w of warnings) console.warn(`  ! ${w}`)
