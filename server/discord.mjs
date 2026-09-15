// 디스코드 연동 — 웹훅 알림 큐, 음성채널 상태(순수 리듀서), 게이트웨이 연결.
// 봇은 음성채널이 비었는지 보기만 한다. 알림은 봇이 아니라 웹훅으로 보낸다(권한이 가장 적게 든다).

const POS = ['', 'PG', 'SG', 'SF', 'PF', 'C']
const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json'
const HIDDEN = 1 << 17                                        // CHANNEL_OBFUSCATED — 봇이 볼 수 없는 채널
const FATAL = new Set([4004, 4010, 4011, 4012, 4013, 4014])   // 토큰·인텐트 문제 — 다시 붙어도 똑같이 끊긴다
const MIN_DELAY = 5_000, MAX_DELAY = 300_000                  // IDENTIFY 하루 1000번을 넘기면 토큰이 초기화된다
const COLOR = { start: 0xf5a623, join: 0x4d9eff, full: 0x35c6a7 }

/** 유저가 쓴 글자가 마크다운·멘션으로 해석되지 않게 한다. */
export const esc = s => String(s).replace(/[\\*_~`|>#\-\[\]()<@:]/g, '\\$&')
export const channelUrl = (guildId, channelId) => `https://discord.com/channels/${guildId}/${channelId}`
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------------------------------------------------------------- 웹훅 알림

/**
 * 팀 알림을 순서대로 하나씩 보낸다. API 응답과는 따로 돈다 — 실패해도 로그만 남긴다.
 * idle() 은 지금까지 넣은 알림이 다 끝나면 풀린다(테스트·종료 시 대기용).
 */
export function createNotifier({ webhookUrl, siteUrl, guildId, players, modes = {}, log = console.log }) {
  let url = null
  try { if (webhookUrl) (url = new URL(webhookUrl)).searchParams.set('wait', 'true') }
  catch { url = null; log('DISCORD_WEBHOOK_URL 형식이 잘못돼 디스코드 알림을 끕니다') }
  if (!webhookUrl) log('DISCORD_WEBHOOK_URL 이 없어 디스코드 알림을 보내지 않습니다')
  const site = (siteUrl || 'http://localhost:8000').replace(/\/+$/, '')
  let queue = Promise.resolve()

  const post = body => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'DiscordBot (https://nba-kor.github.io, 1.0)' },
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
      // 긴 차단(전역 · Cloudflare 는 몇 시간도 온다)을 기다리면 뒤 알림과 종료까지 줄줄이 묶인다 — 이 알림만 버린다
      if (wait > 30) return log(`디스코드 웹훅 429 — ${wait}초 기다려야 해서 이 알림은 보내지 않습니다`)
      await sleep(wait * 1000)
      res = await post(body)
    }
    if (res.status === 404) { url = null; log('디스코드 웹훅이 삭제됐어요(404) — 재시작 전까지 알림을 끕니다') }
    else if (!res.ok) log(`디스코드 웹훅 실패 ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  }

  // embed 는 큐 안에서 만든다 — 만들다 터져도 API 응답은 이미 나갔고 로그만 남는다.
  // 넘기는 팀 뷰는 요청마다 새로 만든 객체라 나중에 만들어도 그 시점 스냅샷 그대로다.
  const enqueue = make => {
    if (!url) return
    queue = queue
      .then(() => send({ username: 'NBA 덩크 시티 팀원모집', embeds: [make()], allowed_mentions: { parse: [] } }))
      .catch(e => log(`디스코드 웹훅 오류: ${e.message}`))
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
    idle: () => queue,
  }
}

// ---------------------------------------------------------------- 음성채널 상태

/**
 * 게이트웨이 이벤트를 받아 길드의 음성채널·접속자를 추적하는 순수 리듀서. 소켓과 분리해 테스트한다.
 * ready 는 GUILD_CREATE 로 전체 상태를 받은 뒤에만 true — 끊긴 동안의 상태는 믿지 않는다.
 */
export function createVoiceState({ guildId, categoryId = '' }) {
  let ready = false, afk = null
  const channels = new Map()   // id -> { id, name, position, parent }  (볼 수 있는 음성채널만)
  const users = new Map()      // userId -> channelId

  const setChannel = c => {
    if (c.type === 2 && !(c.flags & HIDDEN)) channels.set(c.id, { id: c.id, name: c.name, position: c.position, parent: c.parent_id })
    else channels.delete(c.id)
  }
  const reset = () => { ready = false; afk = null; channels.clear(); users.clear() }

  return {
    get ready() { return ready },
    reset,
    apply(t, d) {
      if (!d) return
      switch (t) {
        case 'GUILD_CREATE':
          if (d.id !== guildId || d.unavailable) return
          reset()
          afk = d.afk_channel_id ?? null
          for (const c of d.channels || []) setChannel(c)
          for (const v of d.voice_states || []) if (v.channel_id) users.set(v.user_id, v.channel_id)
          ready = true
          return
        case 'GUILD_UPDATE':
          if (d.id === guildId) afk = d.afk_channel_id ?? null
          return
        case 'GUILD_DELETE':   // 장애(unavailable)든 추방이든 더는 상태를 믿을 수 없다
          if (d.id === guildId) reset()
          return
        case 'CHANNEL_CREATE':
        case 'CHANNEL_UPDATE':
          if (d.guild_id ? d.guild_id === guildId : channels.has(d.id)) setChannel(d)
          return
        case 'CHANNEL_DELETE':
          if (d.guild_id ? d.guild_id !== guildId : !channels.has(d.id)) return
          channels.delete(d.id)
          for (const [u, c] of users) if (c === d.id) users.delete(u)
          return
        case 'VOICE_STATE_UPDATE':
          if (d.guild_id !== guildId) return
          if (d.channel_id) users.set(d.user_id, d.channel_id)
          else users.delete(d.user_id)
      }
    },
    /** 아무도 없는 음성채널, 끝 방부터(position 큰 순, 같으면 id 큰 순). */
    emptyChannels() {
      if (!ready) return []
      const busy = new Set(users.values())
      return [...channels.values()]
        .filter(c => c.id !== afk && !busy.has(c.id) && (!categoryId || c.parent === categoryId))
        .sort((a, b) => (b.position ?? 0) - (a.position ?? 0) || (BigInt(b.id) > BigInt(a.id) ? 1 : -1))
    },
  }
}

// ---------------------------------------------------------------- 게이트웨이

/**
 * 게이트웨이에 붙어 디스패치(op 0)를 onDispatch(t, d) 로 넘긴다. 연결마다 새로 IDENTIFY 한다(RESUME 안 함 —
 * 음성 상태는 GUILD_CREATE 로 통째로 다시 받으면 되니 놓친 이벤트를 이어받을 필요가 없다).
 * 연결이 끝나면 onDisconnect() 를 부르고 MIN_DELAY 부터 두 배씩 기다렸다 다시 붙는다.
 */
export function connectGateway({ token, intents = 129, onDispatch, onDisconnect = () => {}, log = console.log, url = GATEWAY }) {
  let ws, beat, retry, seq = null, acked = true, readyAt = 0, delay = MIN_DELAY, stopped = false

  const send = (op, d) => ws.send(JSON.stringify({ op, d }))

  // 연결 하나를 끝낸다. 핸들러를 먼저 떼서 한 연결에 한 번만 불리고, 닫기 핸드셰이크가
  // 안 끝나는 죽은 연결(ACK 없음)도 onclose 를 기다리지 않고 바로 재연결을 잡는다.
  function down(code) {
    const old = ws
    old.onopen = old.onmessage = old.onclose = null
    clearInterval(beat)
    if (old.readyState < 2) old.close(stopped ? 1000 : 4000)   // Node WebSocket 은 1000·3000~4999 만 받는다(1001 은 throw)
    onDisconnect()
    if (stopped) return
    if (FATAL.has(code)) return log(`디스코드 게이트웨이 종료 ${code} — 토큰·인텐트를 확인하세요. 재연결하지 않습니다`)
    if (readyAt && Date.now() - readyAt > MAX_DELAY) delay = MIN_DELAY   // 한동안 잘 붙어 있었으면 처음부터
    log(`디스코드 게이트웨이 끊김(${code}) — ${delay / 1000}초 뒤 재연결`)
    retry = setTimeout(connect, delay)
    delay = Math.min(delay * 2, MAX_DELAY)
  }

  const heartbeat = () => {
    if (!acked) return down(4000)   // 지난 박동에 ACK 가 없었다 = 좀비 연결
    acked = false
    send(1, seq)
  }

  function connect() {
    seq = null; acked = true; readyAt = 0
    ws = new WebSocket(url)
    ws.onmessage = e => {
      let msg
      try { msg = JSON.parse(e.data) } catch { return }
      if (!msg || typeof msg !== 'object') return   // null 을 구조 분해하면 throw → 프로세스(API)가 통째로 죽는다
      const { op, d, s, t } = msg
      if (s != null) seq = s
      if (op === 10 && d?.heartbeat_interval > 0) {   // 깨진 HELLO 는 무시 — IDENTIFY 가 없으니 디스코드가 끊고 재연결한다
        const every = d.heartbeat_interval
        beat = setTimeout(() => { heartbeat(); beat = setInterval(heartbeat, every) }, every * Math.random())   // 첫 박동은 흩뿌린다
        send(2, { token, intents, properties: { os: 'linux', browser: 'nba-kor', device: 'nba-kor' } })
      } else if (op === 11) acked = true
      else if (op === 1) send(1, seq)
      else if (op === 7 || op === 9) down(4000)   // RECONNECT / INVALID_SESSION — 새로 IDENTIFY
      else if (op === 0) {
        if (t === 'READY') { readyAt = Date.now(); log('디스코드 게이트웨이 연결됨') }
        try { onDispatch(t, d) } catch (err) { log(`게이트웨이 이벤트 처리 오류(${t}): ${err.message}`) }
      }
    }
    ws.onclose = e => down(e.code)   // CloseEvent 전역이 없는 Node 22 도 있어 e.code 만 읽는다
    ws.onerror = () => {}            // 뒤이어 close 가 온다
  }

  connect()
  return {
    close() {
      stopped = true
      clearTimeout(retry)
      if (ws.onclose) down(1000)
    },
  }
}
