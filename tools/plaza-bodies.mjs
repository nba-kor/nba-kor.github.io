#!/usr/bin/env node
// 덩크 광장 몸 파일(assets/quaternius/male.glb · female.glb)을 만든다 — Quaternius Ultimate Modular Men · Women(CC0) 원본에서
// 머리를 빼고(얼굴은 화면이 덩크 시티 그림으로 붙인다) 쓰는 동작(Idle · Walk · Run · Wave)만 남긴다. 남자는 Beach 몸(민소매) · 다리(반바지) + Casual_2 발(운동화),
// 여자는 Casual. 재질 이름을 Jersey(상의) · Shorts(하의) · Trim(반바지 줄)로 바꿔 plaza.js 가 팀 색으로 칠한다.
//
//   원본: https://quaternius.com/packs/ultimatemodularcharacters.html · ultimatemodularwomen.html 의 glTF(Male/Beach.glb · Male/Casual_2.glb · Female/Casual.glb)
//   mkdir /tmp/gt && cd /tmp/gt && npm i @gltf-transform/core@4 @gltf-transform/functions@4
//   NODE_PATH=/tmp/gt/node_modules node tools/plaza-bodies.mjs <원본 폴더(Male · Female 이 든 곳)>
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
const HOW = '사용: NODE_PATH=<gltf-transform 을 설치한 곳>/node_modules node tools/plaza-bodies.mjs <원본 폴더(Male/Beach.glb · Male/Casual_2.glb · Female/Casual.glb 가 든 곳)> — 파일 맨 위 설명 참고'
const src = process.argv[2], out = new URL('../assets/quaternius/', import.meta.url).pathname
if (!src || !['Male/Beach.glb', 'Male/Casual_2.glb', 'Female/Casual.glb'].every(f => existsSync(`${src}/${f}`))) { console.error(HOW); process.exit(1) }
const require = createRequire(`${resolve(process.env.NODE_PATH || '.')}/`)
let NodeIO, mergeDocuments, prune, unpartition
try { ({ NodeIO } = require('@gltf-transform/core')); ({ mergeDocuments, prune, unpartition } = require('@gltf-transform/functions')) } catch { console.error(`@gltf-transform 을 못 찾았어요. ${HOW}`); process.exit(1) }

const io = new NodeIO(), KEEP = new Set(['Idle', 'Walk', 'Run', 'Wave'])
const drop = a => { a.listChannels().forEach(c => c.dispose()); a.listSamplers().forEach(s => s.dispose()); a.dispose() }   // 동작만 지우면 그 안의 데이터가 남는다
async function load(f) { const d = await io.read(f); for (const a of d.getRoot().listAnimations()) if (!KEEP.has(a.getName())) drop(a); return d }
const orphans = d => { for (const a of d.getRoot().listAccessors()) if (a.listParents().every(p => p.propertyType === 'Root')) a.dispose() }
const node = (d, name) => d.getRoot().listNodes().find(n => n.getName() === name)
function rename(d, meshNode, names) { for (const p of node(d, meshNode).getMesh().listPrimitives()) { const m = p.getMaterial(), to = names[m.getName()]; if (to) p.setMaterial(m.clone().setName(to)) } }

const m = await load(`${src}/Male/Beach.glb`)
node(m, 'Beach_Head').dispose(); node(m, 'Beach_Feet').dispose()
const shoes = await io.read(`${src}/Male/Casual_2.glb`)
for (const a of shoes.getRoot().listAnimations()) drop(a)
const before = new Set(m.getRoot().listNodes())
mergeDocuments(m, shoes)
const feet = node(m, 'Casual2_Feet')
feet.setSkin(node(m, 'Beach_Body').getSkin()); node(m, 'CharacterArmature').addChild(feet)   // 뼈 순서가 같아 그대로 붙는다
for (const n of m.getRoot().listNodes()) if (!before.has(n) && n !== feet) n.dispose()
for (const s of m.getRoot().listScenes().slice(1)) s.dispose()
rename(m, 'Beach_Body', { LightBrown: 'Jersey' }); rename(m, 'Beach_Legs', { Red_Dark: 'Shorts', White: 'Trim' }); rename(m, 'Casual2_Feet', { Red_Dark: 'Shoe', White: 'Sole' })
await m.transform(prune(), unpartition()); orphans(m)
await io.write(`${out}male.glb`, m)

const f = await load(`${src}/Female/Casual.glb`)
node(f, 'Casual_Head').dispose()
rename(f, 'Casual_Body', { White: 'Jersey' }); rename(f, 'Casual_Legs', { Orange: 'Shorts' })
await f.transform(prune()); orphans(f)
await io.write(`${out}female.glb`, f)
console.log('assets/quaternius/male.glb · female.glb')
