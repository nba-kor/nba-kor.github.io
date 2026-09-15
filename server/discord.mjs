// 디스코드 연동 — 웹훅 알림 큐와 음성채널 후보 목록(REST). 게이트웨이 봇은 없다(Edge Function 은 계속 붙어 있을 수 없다).
// 알림은 봇이 아니라 웹훅으로 보낸다(권한이 가장 적게 든다). 봇 토큰은 채널 목록(과 잠수 채널)을 읽는 데만 쓴다.

const POS = ['', 'PG', 'SG', 'SF', 'PF', 'C']
const COLOR = { start: 0xf5a623, join: 0x4d9eff, full: 0x35c6a7 }
const UA = 'DiscordBot (https://nba-kor.github.io, 1.0)'   // 형식이 틀린 User-Agent 는 Cloudflare 가 막는다
const ROOMS_MS = 60_000

/** 유저가 쓴 글자가 마크다운·멘션으로 해석되지 않게 한다. */
export const esc = s => String(s).replace(/[\\*_~`|>#\-\[\]()<@:]/g, '\\$&')
export const channelUrl = (guildId, channelId) => `https://discord.com/channels/${guildId}/${channelId}`
/** 로그용 오류 문구. Deno 의 fetch 오류는 요청 URL 을 통째로 싣는다(웹훅 토큰 · 토큰 해시 쿼리) — 주소는 뺀다 */
export const errText = e => String(e?.message ?? e).replace(/https?:\/\/[^\s)]+/g, '<url>')
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------------------------------------------------------------- 웹훅 알림

/**
 * 팀 알림을 하나씩 보낸다. API 응답과는 따로 돈다 — 실패해도 로그만 남긴다.
 * 큐 promise 를 알림마다 waitUntil 에 넘긴다 — Edge Function 은 응답을 보낸 뒤에도 그게 끝날 때까지 워커를 살려 둔다.
 * ponytail: 큐는 워커(isolate) 하나 안에서만 순서를 지킨다 — 429 로 기다리는 사이 다른 워커가 받은 가입 · 완료 알림이 먼저 나갈 수 있다.
 * 순서가 중요해지면 DB outbox 로(429 재시도를 빼면 알림이 사라진다)
 */
export function createNotifier({ webhookUrl, siteUrl, guildId, players, modes = {}, fetch = globalThis.fetch, waitUntil = p => p, log = console.log }) {
  let url = null
  try { if (webhookUrl) (url = new URL(webhookUrl)).searchParams.set('wait', 'true') }
  catch { url = null; log('DISCORD_WEBHOOK_URL 형식이 잘못돼 디스코드 알림을 끕니다') }
  if (!webhookUrl) log('DISCORD_WEBHOOK_URL 이 없어 디스코드 알림을 보내지 않습니다')
  const site = (siteUrl || 'http://localhost:8000').replace(/\/+$/, '')
  let queue = Promise.resolve()

  const post = body => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),   // 응답 없는 웹훅 하나가 큐 전체를 막지 않게
  })

  async function send(body) {
    if (!url) return
    let res = await post(body)
    if (res.status === 429) {   // 한 번만 기다렸다 다시 보낸다
      // 둘 다 없으면 parseFloat(null) = NaN → 1초 (Number(null) 은 0 이라 곧바로 다시 429 를 맞는다)
      const parsed = parseFloat((await res.json().catch(() => ({}))).retry_after ?? res.headers.get('retry-after'))
      const wait = parsed >= 0 ? parsed : 1
      // 긴 차단(전역 · Cloudflare 는 몇 시간도 온다)을 기다리면 뒤 알림이 줄줄이 묶이고 워커 시간(150초)도 넘긴다 — 이 알림만 버린다
      if (wait > 30) return log(`디스코드 웹훅 429 — ${wait}초 기다려야 해서 이 알림은 보내지 않습니다`)
      await sleep(wait * 1000)
      res = await post(body)
    }
    if (res.status === 404) { url = null; log('디스코드 웹훅이 삭제됐어요(404) — 이 워커가 끝날 때까지 알림을 끕니다') }
    else if (!res.ok) log(`디스코드 웹훅 실패 ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  }

  // embed 는 큐 안에서 만든다 — 만들다 터져도 API 응답은 이미 나갔고 로그만 남는다.
  // 넘기는 팀 뷰는 요청마다 새로 만든 객체라 나중에 만들어도 그 시점 스냅샷 그대로다.
  const enqueue = make => {
    if (!url) return
    queue = queue
      .then(() => send({ username: 'NBA 덩크 시티 팀원모집', embeds: [make()], allowed_mentions: { parse: [] } }))
      .catch(e => log(`디스코드 웹훅 오류: ${errText(e)}`))
    waitUntil(queue)
  }

  // 길이는 index.mjs 검증에서 묶어 둬서 embed 한도(제목 256 · 설명 4096 · 필드 1024)를 넘지 않는다.
  // 제목에서는 역슬래시 이스케이프가 그대로 보일 수 있다 — 이스케이프 대신 마크다운 기호를 뺀다(프리셋 이름엔 없다)
  const subject = t => [t.room.title, t.tactic.name].map(s => s.replace(/[\\*_~`|<>@#]/g, '').trim()).find(Boolean) || '전술 자유'
  const meta = t => `${t.room.mic ? '🎙️ 마이크 O' : '🔇 마이크 X'} · ${modes[t.room.mode] ?? ''} · 전술 ${esc(t.tactic.name) || '자유'}`
  const line = m => {
    const [e] = m.entries, p = players.get(e.char) || { pos: 0, name: e.char }
    const more = m.entries.length - 1
    return `**${esc(e.nick)}** (${e.tier}) · ${esc(m.discord)}\n${`${POS[p.pos]} ${p.name}`.trim()}${more ? ` 외 ${more}개` : ''}`
  }
  const voiceField = (t, lead) => ({
    name: '음성채널',
    value: t.voice
      ? `<#${t.voice.id}>${lead}\n[바로 들어가기](${channelUrl(guildId, t.voice.id)})`
      : '빈 음성채널이 없어요 — 자유롭게 모여주세요',
  })
  // 설명은 방 정보 한 줄로 시작하고, 메모가 있으면 '메모' 필드로 붙인다
  const embed = (t, color, title, description, fields = []) => ({
    title, url: `${site}/recruit/?t=${t.id}`, color,
    description: `${meta(t)}\n\n${description}`,
    fields: t.room.memo ? [...fields, { name: '메모', value: esc(t.room.memo) }] : fields,
  })

  return {
    teamCreated: t => enqueue(() => ({
      ...embed(t, COLOR.start, `🏀 팀원 모집 시작 · ${subject(t)}`, `${line(t.members[0])}\n\n모집 ${t.members.length}/${t.size}`, [voiceField(t, '')]),
      thumbnail: { url: `${site}/assets/players/${t.members[0].entries[0].char}.png` },
    })),
    memberJoined: (t, memberId) => enqueue(() => t.members.length >= t.size
      ? embed(t, COLOR.full, `🎉 모집 완료 · ${subject(t)}`, t.members.map(line).join('\n\n'), [voiceField(t, ' 로 모여주세요')])
      : embed(t, COLOR.join, `✅ 팀원 합류 · ${subject(t)} (${t.members.length}/${t.size})`, line(t.members.find(m => m.id === memberId)))),
  }
}

// ---------------------------------------------------------------- 음성채널 후보

// ponytail: 워커(isolate) 하나 안에서만 1분 기억한다. 워커가 여럿이면 각자 한 번씩 부른다 — 429 가 실제로 보이면 DB 에 캐시할 것
let memo = null

/**
 * 음성채널 후보, 끝 방부터(position 큰 순, 같으면 id 큰 순) [{ id, name }]. 팀 만들 때만 부른다. 서버의 잠수(AFK) 채널은 뺀다.
 * 누가 들어가 있는지는 REST 로 알 수 없다 — "빈 방" 은 만료 전 팀이 안 잡은 방이고, 그 판단은 recruit_create_team 이 한다.
 * 봇이 없거나 실패하면 [] (팀은 음성채널 없이 만든다). 봇이 볼 수 없는 채널은 디스코드가 목록에서 뺀다(2026-11-16~).
 */
export async function voiceRooms({ botToken, guildId, categoryId = '', fetch = globalThis.fetch, now = Date.now, log = console.log }) {
  if (!botToken || !guildId) return []
  const key = `${guildId} ${categoryId}`
  if (memo?.key === key && now() - memo.at < ROOMS_MS) return memo.rooms
  const get = path => fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}${path}`, {
    headers: { authorization: `Bot ${botToken}`, 'user-agent': UA },
    signal: AbortSignal.timeout(3000),
  })
  try {
    // 잠수 채널은 채널 목록에선 평범한 음성채널이라 서버 정보(afk_channel_id)로 거른다. 서버 정보를 못 읽으면 거르지 않고 넘어간다
    const [res, afk] = await Promise.all([get('/channels'), get('').then(r => r.json()).then(g => g?.afk_channel_id ?? null, () => null)])
    const list = res.ok ? await res.json() : null
    if (!Array.isArray(list)) log(`디스코드 채널 목록 실패 ${res.status} — 1분 동안 음성채널 없이 만듭니다`)
    const rooms = (Array.isArray(list) ? list : [])
      .filter(c => c?.type === 2 && c.id !== afk && /^\d{1,20}$/.test(c.id) && typeof c.name === 'string' && (!categoryId || c.parent_id === categoryId))
      .sort((a, b) => (b.position ?? 0) - (a.position ?? 0) || (BigInt(b.id) > BigInt(a.id) ? 1 : -1))
      .map(c => ({ id: c.id, name: c.name }))
    // 401 · 403 · 429 도 1분 기억한다 — 바로 다시 불러도 같고, 틀린 요청이 쌓이면 Cloudflare 가 봇을 막는다
    memo = { key, at: now(), rooms }
    return rooms
  } catch (e) {
    log(`디스코드 채널 목록 오류: ${errText(e)}`)   // 시간 초과 · 연결 실패는 기억하지 않는다(다음 팀 만들 때 다시)
    return []
  }
}
