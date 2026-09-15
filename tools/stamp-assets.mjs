#!/usr/bin/env node
// CSS·JS 참조 뒤에 내용 해시를 ?v=xxxxxxxx 로 붙여 브라우저 캐시를 무효화한다.
//
//   node tools/stamp-assets.mjs
//
// GitHub Pages 는 모든 파일에 Cache-Control: max-age=600 만 준다. 그래서 스타일이나 스크립트를
// 고쳐도 최대 10분간 옛 파일이 그대로 쓰일 수 있다. 파일 내용이 바뀌면 URL 도 바뀌게 만들어
// 그 창을 없앤다. assets/*.css|js 나 HTML 을 고친 뒤 커밋 전에 한 번 돌리면 된다.
// 여러 번 돌려도 결과는 같다(기존 ?v= 를 먼저 떼고 다시 붙인다).
//
// 한계: HTML 자체도 max-age=600 이라 새 HTML 이 퍼지기까지는 최대 10분이 걸린다.
// 그 이후부터는 자원이 즉시 갱신된다. 선수 얼굴 이미지는 여기서 다루지 않는다
// (data/*.json 은 fetch 에서 cache: 'no-cache' 로 이미 매번 확인한다).

import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PAGES = ['index.html', 'tactics/index.html', 'tiers/index.html', 'recruit/index.html']
// import 되는 쪽이 먼저 와야 한다 — 그 해시를 import 구문에 심은 뒤에 import 하는 쪽의 해시를 낸다.
//   app.js → court.js → tactics.js · recruit.js,   app.js → tiers.js
const ASSETS = ['app.js', 'court.js', 'style.css', 'tactics.js', 'tiers.js', 'recruit.js']

const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 8)
/** 이미 붙어 있는 ?v= 를 떼어 스크립트를 몇 번 돌려도 같은 결과가 나오게 한다. */
const strip = s => s
  .replace(/(\/assets\/[\w.-]+\.(?:css|js))\?v=[0-9a-f]+/g, '$1')
  .replace(/(\.\/[\w.-]+\.js)\?v=[0-9a-f]+/g, '$1')

const read = async f => strip(await readFile(`${ROOT}/${f}`, 'utf8'))

// 1) 자원 파일: import 에 버전을 심은 뒤 그 결과로 해시를 낸다. 그래서 app.js 만 바뀌어도
//    court.js 의 해시가 바뀌고, 다시 그걸 import 하는 tactics.js · recruit.js 까지 새로 받는다.
const v = {}
for (const f of ASSETS) {
  let src = await read(`assets/${f}`)
  src = src.replace(/(from\s+['"]\.\/)([\w.-]+\.js)(['"])/g, (m, a, dep, b) => {
    // 순서가 틀리면 버전 없이 import 되어 조용히 옛 파일을 쓰게 되니 여기서 막는다
    if (!v[dep]) throw new Error(`assets/${f} 가 ${dep} 를 import 한다 — ASSETS 에서 ${dep} 를 ${f} 앞에 둘 것`)
    return `${a}${dep}?v=${v[dep]}${b}`
  })
  await writeFile(`${ROOT}/assets/${f}`, src)
  v[f] = hash(src)
}

// 2) HTML 참조 갱신
let changed = 0
for (const page of PAGES) {
  const before = await readFile(`${ROOT}/${page}`, 'utf8')
  const after = strip(before).replace(
    /\/assets\/([\w.-]+\.(?:css|js))/g,
    (m, f) => (v[f] ? `/assets/${f}?v=${v[f]}` : m))
  if (after !== before) changed++
  await writeFile(`${ROOT}/${page}`, after)
}

console.log('캐시 버전 갱신:')
for (const [f, h] of Object.entries(v)) console.log(`  assets/${f.padEnd(11)} ?v=${h}`)
console.log(`HTML ${changed}/${PAGES.length}개 수정`)
