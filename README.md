# NBA 덩크 시티 한국 서버 도구함

「NBA 덩크 시티」(Dunk City Dynasty) 한국 서버 유저를 위한 팬 제작 정적 사이트.
빌드 도구 없이 HTML + CSS + ES 모듈로만 돌아가며 GitHub Pages에 그대로 올라간다.
팀원모집만 예외로 API 가 Supabase Edge Function 으로 따로 돈다([팀원모집](#팀원모집) 참고).

| URL | 파일 | 설명 |
| --- | --- | --- |
| `/` | `index.html` | 소개 / 선수 현황 |
| `/tactics/` | `tactics/index.html` | **전술판** — 하프코트 3:3 배치, 동선 드로잉, 기본 전술 프리셋 14종, 재생 |
| `/tiers/` | `tiers/index.html` | **티어표** — S~D 프리셋에 선수를 드래그, 티어 추가/이름 변경, 링크 공유 |
| `/recruit/` | `recruit/index.html` | **팀원모집** — 디스코드 로그인 · 방 만들기·가입(TNAB 봇과 같은 목록), 디스코드 알림 + 빈 음성채널 배정, 카카오톡 공유, 3시간 뒤 자동 삭제 |
| `/discord/` | `discord/index.html` | 카카오 카드의 **디스코드** 버튼이 거쳐 가는 곳. `discord://` 앱 주소로 넘긴다 — `discord.com` 으로 곧장 보내면 브라우저에 세션이 없어 매번 로그인해야 한다. 서버 · 채널은 `data/recruit.json` 의 `discord` 에서 읽는다 |

주소에 `.html` 이 드러나지 않도록 디렉터리 + `index.html` 구조를 쓴다.
그래서 페이지가 루트가 아닌 깊이에 있어도 되도록 정적 자원은 전부 **루트 절대경로**(`/assets/...`,
`/data/...`)로 참조한다. `data/*.json` 의 `img` 값도 같은 이유로 `/assets/players/...` 형태다.
사이트를 하위 경로에 올리려면 이 접두사를 바꿔야 한다.

## 선수 데이터

선수 정보와 얼굴 이미지는 **한 곳에서만** 관리하고 모든 페이지가 같이 쓴다.

```
data/players.json     한국 서버 출시 선수 39명 (자동 생성 — 직접 수정 금지)
data/upcoming.json    미출시 선수 54명, 중국 서버 기준 (직접 관리)
assets/players/*.png  얼굴 이미지 (id.png, 181x180 원형)
assets/share/*.jpg    카카오톡 공유용 얼굴 (300x300, 위 PNG 로 생성 — 얼굴을 바꾸면 다시 만든다)
```

**93명 전원 얼굴 이미지가 있다.** 한국 출시 선수는 공식 홈페이지의 카드 이미지를 그대로 쓰고,
미출시 선수는 중국 서버 공식 사이트의 전신 아트에서 얼굴만 잘라낸 것이다(`tools/cn-faces`).
이미지가 없는 선수가 생기면 이름 이니셜 아바타가 자동 생성되므로 화면은 깨지지 않는다.

### 신규 선수 반영

한국 서버에 선수가 추가되면 공식 홈페이지를 다시 긁어온다. `data/players.json` 은 팀원모집 함수에도 묶여 있으므로
함수도 다시 배포한다([운영 배포](#운영-배포) 4번) — 안 하면 새 캐릭터로 낸 모집 · 가입이 400 으로 거절된다.

```sh
node tools/update-players.mjs
```

출처가 둘이고 서로 교차 검증한다.

1. **"슈퍼스타 라인업"** (`dunkcitymobile.com/kr/`) — 한글 이름·포지션·신체·별명·소개글·얼굴 이미지가
   전부 들어있지만 **인게임 로스터 전체가 실려 있지는 않다.**
2. **"각 아이템 및 선수 획득 확률 상세 안내"** 공지 — 이름과 확률뿐이지만 인게임 로스터가 전부 나온다.

1번으로 만들고 2번으로 검증한다. 2번에만 있는 선수는 `EXTRA` 표에서 채우고(현재 클락슨·듀란트),
`EXTRA` 에도 없으면 콘솔에 경고가 뜬다. 표기가 다른 경우(`탐슨`↔`톰슨` 등)는 `ALIAS` 에서 맞춘다.
이 교차 검증이 없어서 클락슨과 듀란트가 빠졌던 적이 있으니 경고는 무시하지 말 것.

영문명은 공식 사이트에 없어서 `EN` 표에서 관리한다 — 새 id가 나오면 스크립트가 콘솔에 알려준다.

### 미출시 선수

`data/upcoming.json` 의 `players` 배열에 직접 넣는다. 파일 안에 `schema` 필드로
형식이 적혀 있다. 얼굴 이미지가 없으면 이름 이니셜 아바타가 자동 생성되므로,
`assets/players/<id>.png` 를 넣어주기 전까지도 그대로 쓸 수 있다.

현재 54명이 들어 있다. 중국 서버 공식 아트 배포 데이터가 전 캐릭터 95종을 담고 있어,
거기서 한국 서버 39명을 뺀 명단이다. 그 목록에 없는 항목은 `unverified` 로 따로 빼 두었다
(LLM 조사 단계에서 나왔지만 공식 데이터로 확인되지 않은 오리지널 캐릭터 4명).

### 얼굴 이미지 · 신체 데이터

```sh
node tools/cn-faces/fetch.mjs
```

중국 서버 공식 사이트에서 세 가지를 가져와 `assets/players/` 와 `upcoming.json` 을 채운다.

| 소스 | 내용 |
| --- | --- |
| 홈페이지 "巨星云集" 캐러셀 CSS | 한 명씩 깔끔하게 렌더된 전신 아트 51명분 (1순위) |
| 아트 스테이션 배포 JSON | 중국 서버 전 캐릭터 95종의 `role_pic` (캐러셀에 없는 선수 보충) |
| 홈페이지 HTML 선수 카드 | 키 · 몸무게 · 생일 · 중국 별명 |

아트 스테이션 배포 URL은 `ccc.hi.163.com/qmx-ugc-server/ccc-table-conf/fed-url` 에서 받아온다.
어느 쪽이든 전신 렌더라 얼굴을 직접 잘라야 해서 OpenCV 얼굴 검출(`crop.py`)을 쓴다. 준비:

```sh
uv venv tools/cn-faces/.venv
VIRTUAL_ENV=tools/cn-faces/.venv uv pip install "opencv-python-headless<5" numpy pillow
```

검출이 빗나가 엉뚱한 데가 잘리면 `tools/cn-faces/tune.json` 에 좌표를 비율로 적어준다.

```jsonc
{ "ttm": { "face": [0.525, 0.32, 0.12], "dy": 0.22 } }   // 중심x, 중심y, 얼굴폭 (모두 0~1)
```

키는 캐러셀 id(`ttm`) 또는 우리 선수 id(`zach-lavine`) 둘 다 쓴다.
모르는 새 캐릭터가 나오면 스크립트가 경고하니 `CN2EN` / `ART2EN` 표에 한 줄 추가하면 된다.
(캐러셀 id 별 한자 이름은 중국 사이트 PC CSS 의 `<id>-name.png` 이미지로 확인할 수 있다.)
전술판·티어표 양쪽의 **"미출시 선수 포함"** 체크박스로 켜고 끌 수 있고,
이 체크 상태는 두 페이지가 공유한다.

해당 선수가 한국에 정식 출시되면 `upcoming.json` 에서 지우고
`node tools/update-players.mjs` 를 실행하면 공식 데이터로 자동 편입된다.

## 전술 프리셋

`data/tactics.json` 에 좌표까지 전부 데이터로 들어 있다.
좌표계는 `x` 0(왼쪽 사이드라인)~1(오른쪽), `y` 0(엔드라인·골밑)~1(하프라인).
프리셋을 추가하려면 `presets` 배열에 항목 하나를 더 넣는다. 팀원모집 함수에도 묶여 있으므로 함수도 다시 배포한다([운영 배포](#운영-배포) 4번).

```jsonc
{
  "id": "my-play", "name": "내 전술", "tag": "공격", "desc": "설명",
  "offense": [{ "label": "볼 핸들러", "pos": [1, 2], "at": [0.5, 0.66],
                "routes": [{ "kind": "move", "pts": [[0.5, 0.66], [0.44, 0.24]] }] }],
  "defense": [{ "label": "온볼 수비", "pos": [1, 2], "at": [0.5, 0.52] }]
}
```

`pos` 는 선호 포지션(1=PG 2=SG 3=SF 4=PF 5=C)으로, 프리셋 적용 시 선수를 자동 배정하는 데 쓴다
(팀원모집의 전술 애니메이션도 같은 방식으로 팀원 대표 캐릭터를 앉힌다).
`kind` 는 `move`(드리블·컷) / `pass`(패스) / `screen`(스크린).
코트 그리기와 재생은 `assets/court.js` 에 있어 전술판과 팀원모집이 같이 쓴다.

## 팀원모집

`/recruit/` — 3:3 이라 팀장 포함 3명이 한 팀이다. **웹 화면과 TNAB 디스코드 봇이 같은 파티 목록을 쓴다** — 웹에서 만든 팀에 봇으로 가입하거나 그 반대도 된다.
규칙 · 검증 · 권한 · 알림은 전부 Edge Function 한 곳(`server/index.mjs`)에 있다.

1. **디스코드로 로그인**한다(Supabase Auth). 봇은 디스코드 계정 그대로 쓴다. 신원 = 디스코드 계정이라 방 비밀번호 · 브라우저 토큰은 없다.
2. **내 프로필**을 한 번 등록한다: 게임 계정(닉네임·티어·캐릭터) 1~3줄 + 개인 마이크 O/X. 첫 줄 캐릭터가 대표다.
   표시 이름은 디스코드 이름을 그대로 쓴다. 프로필을 고치면 들어가 있는 파티에도 바로 반영된다.
3. **팀장**이 방을 만든다 — 방 제목(선택) · 마이크 **필수 / 듣코가능 / 필요없음** · 즐겜/빡겜 · 메모(선택, 줄바꿈 가능) · 전술(선택).
4. API 가 팀을 저장하고 **빈 음성채널을 끝 방부터** 하나 잡아, 디스코드 웹훅으로 "모집 시작" + 음성채널 링크를 보낸다.
   알림 제목은 방 제목(없으면 전술 이름), 첫 줄은 `🎙️ 마이크 필수 · 빡겜 · 전술 픽 앤 롤`, 팀원 줄은 `**이름** (골드) · PG 라멜로 볼 외 2개 · 마이크 O`, 메모는 따로 붙는다.
5. 팀장이 **카카오톡 공유**로 카톡방에 링크를 뿌린다. 리스트 메시지로, 제목은 `🟢 방 이름 · 1/3 모집 중`(다 차면 `✅ … · 매칭 완료`),
   항목마다 왼쪽에 `👑 닉네임`(계정이 여럿이면 `+2`)과 `SG · 전성기 · 마이크 O`, 오른쪽에 대표 캐릭터 얼굴, 남은 자리는 `빈 자리`로 채운다.
   버튼은 **웹사이트**(이 팀 화면)와 **디스코드**(`/discord/` 를 거쳐 앱의 #매칭-현황) 둘. **TNAB 봇이 카톡방에 자동으로 보내는 카드와 같은 모양이다** —
   `assets/recruit.js` 의 `kakaoPayload` 와 봇의 `tnab/kakao_share.py` `build_party_share_options` 중 한쪽만 고치면 같은 팀이 두 가지로 보인다.
6. **팀원**이 링크로 들어오면(로그인 없이도 볼 수 있다) 방 정보 · 전술 설명 · 전술 애니메이션 · 로스터를 보고 버튼 하나로 가입한다.
   가입할 때마다 디스코드 알림, 3명이 차면 "모집 완료" 알림에서 **그 파티원 3명만 멘션**한다.

**1인 1파티** — 한 사람은 한 팀에만 있을 수 있다(DB 의 `unique(discord_user_id)`). 다른 팀을 만들거나 가입하면 기존 팀에서 자동으로 빠지고,
**기존 팀의 팀장이었으면 기존 팀은 해제**된다. 응답의 `left` 로 어디서 빠졌는지 알려 주고, 옛 팀에도 이탈 · 해제 알림이 간다.

**목록 순서** — 모집 중인 방이 먼저, 다 찬 방은 맨 뒤. 각각 먼저 만든 방이 위라 새 방은 모집 중 목록 맨 아래에 붙는다.
다 찬 방에서 누가 나가거나 방출되면 다시 모집 중이 되어 원래 자리로 돌아온다.

**관리** — 팀장은 **팀 해제**(방 삭제) · **방출** · **연장**을 할 수 있고, 팀원은 **나가기**만 할 수 있다. 팀장이 빠지면(나가기) 방이 해제된다.
디스코드 서버 관리자는 봇으로 남의 팀도 해제할 수 있다(봇이 디스코드 권한을 확인하고 `X-Discord-Admin: 1` 을 붙인다). 나가기 · 방출 · 해제도 디스코드 알림이 간다.

**자동 삭제 · 연장** — 방은 만든(또는 연장한) 지 **3시간이 지나면 사라진다**(목록 · 팀 화면 · 가입 모두 즉시. DB 행은 다음에 누가 방을 만들거나 가입할 때 같이 지운다).
**연장**은 남은 시간을 **지금부터 다시 3시간**으로 되돌린다 — 더해지지 않아 최대 3시간이다.

**화면 편의** — 자주 쓰는 계정 구성을 **프리셋**으로 이 브라우저에 5개까지 저장해 한 번에 채운다(`dc.recruit.presets`).
캐릭터 고르기 창 위의 **포지션 뱃지**(전체 · PG · SG · SF · PF · C)로 목록을 거른다.

인원 · 계정 수 · 만료 시간(3시간) · 티어 · 즐겜/빡겜 · 방 마이크 이름 · 글자 수 제한 · 프리셋 수 · 디스코드 서버(`discord`)는 `data/recruit.json` 하나에 있고 API · 화면 · 봇이 같이 읽는다
(봇은 `https://nba-kor.github.io/data/recruit.json` 을 받는다. 고치면 함수도 다시 배포한다 — [운영 배포](#운영-배포) 4번).
캐릭터는 한국 출시 선수(`data/players.json`)만 고를 수 있다.

### API

운영 주소는 `https://lgchgqxjjlapszmxarun.supabase.co/functions/v1/recruit/api/...`, 로컬(docker compose)은 `http://localhost:8000/api/...`.
모든 본문은 JSON, 오류는 `{ "error": "한국어 문구" }`. **디스코드 ID 는 어디서나 문자열**이다(JS number 는 snowflake 정밀도를 잃는다).

- 팀: `{ id, room: { title, mic: required|listen|off, mode: fun|serious, memo }, tactic, voice: { id, name, url } | null, status: open|full, size, createdAt, expiresAt, members }` — 목록은 `tactic.board` 를 뺀다
- 팀원: `{ userId, name, mic: boolean, entries: [{ nick, tier, char }], leader, joinedAt }` — 팀장 먼저, 들어온 순
- 프로필: `{ userId, name, mic, entries, updatedAt }`
- `left`: `null` 또는 `{ teamId, disbanded }` — 1인 1파티로 빠진 기존 팀(`disbanded` = 팀장이라 해제됨)

| 요청 | 권한 | 결과 |
| --- | --- | --- |
| `GET /api/health` | – | `{ ok, voice, login }` — `voice` 는 디스코드 봇 토큰 · 서버 ID, `login` 은 publishable key 가 있는지 |
| `GET /api/teams` | – | 만료 전 방, 모집 중 → 다 찬 순, 각각 오래된 순, 최대 100개 |
| `GET /api/teams/:id` | – | 팀. 없거나 만료 → 404 |
| `GET /api/me` | 로그인 | `{ user: { id, name }, profile \| null, teamId \| null }` |
| `PUT /api/me/profile` | 로그인 | `{ mic, entries }` → `{ profile }`. 이름은 본문이 아니라 신원(디스코드)에서 |
| `POST /api/teams` | 로그인 | `{ room: { title?, mic, mode, memo? }, tactic }` → 201 `{ team, left }`. 프로필이 없으면 428 |
| `POST /api/teams/quick` | 로그인 | 가장 오래된 모집 중 팀(내 팀 제외)에 가입 → 201 `{ team, left }`. 없으면 404 |
| `POST /api/teams/:id/members` | 로그인 | 본인 가입(본문 없음) → 201 `{ team, left }`. 없거나 만료 404 · 다 참 · 이미 이 팀 409 · 프로필 없음 428 |
| `DELETE /api/teams/:id/members/:userId` | 본인 = 나가기, 팀장 = 방출 | `{ ok: true, team }`. 팀장이 대상이면 해제되고 `team: null` |
| `DELETE /api/teams/:id` | 팀장, 봇 + `X-Discord-Admin: 1` | 팀 해제(삭제) → `{ ok: true }` |
| `POST /api/teams/:id/extend` | 팀장 | 만료 = 지금 + 3시간 → `{ team }` |

**신원**은 두 가지다. 없거나 틀리면 401 「디스코드로 로그인해 주세요」.

- **웹**: `Authorization: Bearer <Supabase access token>`. 함수가 `GET ${SUPABASE_URL}/auth/v1/user`(publishable key)로 확인하고,
  디스코드 ID 는 `identities` 의 `discord` 항목에서만 꺼낸다 — `user_metadata` 는 사용자가 고칠 수 있어 쓰지 않는다. 디스코드 신원이 없는 계정은 401,
  Auth 가 응답하지 않으면 503 「로그인 서버에 연결할 수 없어요」. 확인 결과는 워커마다 토큰 해시로 60초 기억한다(로그아웃한 토큰도 최대 60초는 통한다).
- **봇**: `Authorization: Bot <TNAB_BOT_KEY>` + `X-Discord-User: <17~20자리 ID>` + `X-Discord-Name: <퍼센트 인코딩한 UTF-8, 1~80자>` + 선택 `X-Discord-Admin: 1`.
  키가 맞으면 헤더의 ID 를 믿는다. 서버 키가 32자보다 짧거나 없으면 봇 인증은 꺼진다. ID · 이름 형식이 틀리면 400.

PUT · POST · DELETE 는 신원을 확인한 뒤 **한 사람(디스코드 ID) 당 10분에 30번**까지다(웹 · 봇 합산, 넘으면 429).
CORS 는 `CORS_ORIGIN` 에 적은 화면 주소만 허용한다(preflight 는 함수가 직접 204 로 답한다). 봇은 서버끼리 부르므로 CORS 와 상관없다.

### 구조

```
GitHub Pages (recruit/index.html · assets/recruit.js)      TNAB 디스코드 봇 (Python, 다른 PC)
   │  Supabase Auth 디스코드 로그인 → Bearer 토큰              │  Bot 키 + X-Discord-User
   └──────────────┬───────────────────────────────────────┘
                  ▼  https://lgchgqxjjlapszmxarun.supabase.co/functions/v1/recruit/api/...
Supabase Edge Function 'recruit'   신원 확인 · 검증 · 1인 1파티 · 요청 수 제한 · 디스코드 웹훅/채널 목록 · secret key
   │  Data API (/rest/v1, secret key)          │  /auth/v1/user (publishable key)
   ▼                                           ▼
Supabase Postgres                  Supabase Auth (Discord provider)
recruit_profiles · recruit_teams · recruit_members · recruit_hits + RPC
```

```
recruit/index.html                    화면 (정적)
assets/recruit.js                     화면 로직 — 맨 위에 API_ORIGIN · KAKAO_JS_KEY 설정
assets/share/*.jpg                    카카오톡 공유용 얼굴 (tools/share-faces.py 가 생성)
server/index.mjs                      API 본체 createHandler(Request → Response). 웹 표준 + node:crypto 만 써서 Deno · Node 둘 다 돈다. npm 의존성 없음
server/discord.mjs                    웹훅 알림 큐 · 음성채널 후보(디스코드 REST)
server/test.mjs                       API 테스트 (Node 에서 createHandler 를 직접 부른다)
supabase/functions/recruit/index.mjs  Edge Function 입구 — 비밀값 · waitUntil 을 넘기고 server/index.mjs 를 부른다
supabase/config.toml                  함수 배포 설정 (verify_jwt = false)
supabase/migrations/                  DB 스키마 (Supabase 클라우드와 로컬 docker compose 가 같은 파일을 쓴다)
tools/edge-main/index.mjs             로컬 docker compose 에서 함수를 띄우는 edge-runtime 메인 서비스
.github/workflows/keep-alive.yml      무료 프로젝트 일시정지 막기 (하루 두 번 목록 읽기)
```

배포 CLI 는 `supabase/functions/recruit/index.mjs` 에서 시작해 `import` 를 따라가며 `server/*.mjs` 와 `data/recruit.json` · `players.json` · `tactics.json` 까지 함수에 묶는다.
그래서 API 코드는 데이터를 `readFileSync` 가 아니라 `import ... with { type: 'json' }` 으로 읽는다.

항상 켜진 서버가 없다. 요청이 오면 함수 워커가 뜨고, 워커는 여러 개가 동시에 돌거나 수시로 바뀐다. 그래서 메모리에 믿고 두는 상태가 없다(로그인 확인 60초 기억만) —
요청 수 제한은 `recruit_hits` 표를 DB 함수(`recruit_hit`) 한 문장으로 세고, 팀 만들기(`recruit_create_team`) · 가입(`recruit_join_team`)은
**하나의 DB 잠금 안에서** 만료 청소 → 기존 팀에서 빠지기 → 음성채널 고르기 또는 정원 확인 → 넣기를 한 트랜잭션으로 한다.
여러 명이 동시에 눌러도 3명을 넘지 않고, 같은 사람이 만들기와 가입을 동시에 보내도 두 팀에 남지 않고, 두 팀이 같은 음성채널을 받지 않는다.

웹 화면과 봇은 Supabase DB 에 직접 붙지 않고, 함수만 secret key 로 Data API 를 부른다. 표는 RLS 를 켜고 `anon` · `authenticated` 권한을 전부 거둬 두어서
publishable key 나 로그인 토큰으로는 표를 읽거나 쓸 수 없다. 저장하는 건 디스코드 ID · 이름 · 웹 계정 id · 게임 계정 · 방 설정뿐이다.

| 필요한 것 | 정적 사이트로 안 되는 이유 |
| --- | --- |
| 모집 중인 팀 목록 · 가입 · 인원 마감 · 1인 1파티 | 여러 사람(웹 · 봇)이 같은 상태를 봐야 한다 → Supabase. 검증 · 요청 수 제한 없이 브라우저에 DB 를 열 수는 없다 |
| 디스코드 알림 · 음성채널 목록 · 봇 인증 | 웹훅 URL · 봇 토큰 · 봇 키는 그 자체가 비밀번호다. 브라우저 코드에 넣으면 누구나 채널에 글을 쓰거나 남의 이름으로 파티를 만들 수 있다 |

### 설정

함수 비밀값(운영) — `.env.example` 을 `.env` 로 복사해 채우고 `npx supabase secrets set` 으로 올린다. `.env` 는 커밋되지 않는다.

| 키 | 설명 |
| --- | --- |
| `CORS_ORIGIN` | 화면 주소, 쉼표로 여러 개. 운영은 `https://nba-kor.github.io`. 여기 없는 Origin 의 브라우저는 응답을 못 읽는다. docker compose 는 `http://localhost:8000` 고정 |
| `SITE_URL` | 알림 속 팀 링크 · 썸네일 이미지의 기준 주소. 운영은 `https://nba-kor.github.io` |
| `TNAB_BOT_KEY` | TNAB 봇 전용 키(32자 이상, `openssl rand -base64 33`). 봇 PC 의 `.env` 에도 같은 값. 비우면 봇 요청은 401 |
| `DISCORD_WEBHOOK_URL` | 알림 보낼 웹훅. 비우면 알림 없음 |
| `DISCORD_BOT_TOKEN` | 음성채널 목록을 읽을 봇 토큰 |
| `DISCORD_GUILD_ID` | 디스코드 서버 ID. 봇 토큰과 둘 다 있어야 음성채널을 배정한다 |
| `DISCORD_VOICE_CATEGORY_ID` | 이 카테고리 안의 음성채널만 배정. 비우면 서버의 모든 음성채널 |

`SUPABASE_URL` · `SUPABASE_SECRET_KEYS` · `SUPABASE_PUBLISHABLE_KEYS`(키들의 JSON, 그중 `default` 를 쓴다)는 Supabase 가 함수에 직접 넣어 준다 —
`SUPABASE_` 로 시작하는 이름은 비밀값으로 올릴 수도 없다. 로컬 docker compose 는 `SUPABASE_URL` · `SUPABASE_SECRET_KEY`(로컬 전용 키) · 로컬 전용 `TNAB_BOT_KEY` 를 `compose.yaml` 에 적어 둔다.
배포할 때만 쓰는 `SUPABASE_ACCESS_TOKEN`(개인 토큰 `sbp_...`)도 `.env` 에 둘 수 있지만 함수 비밀값은 아니다(docker compose 도 `.env` 에서 `DISCORD_*` 만 컨테이너에 넣는다).
디스코드 값은 전부 비워도 모집 자체는 된다 — 알림과 음성채널 배정만 빠진다.

### Supabase 설정

1. [Supabase](https://supabase.com/dashboard) 프로젝트(Free, `lgchgqxjjlapszmxarun`).
2. 스키마를 넣는다. 파일은 순서대로 세 개다 — `20260914000000_recruit.sql`(표 · 가입 함수), `20260915000000_recruit_edge.sql`(요청 수 기록 · 방 배정 함수 교체),
   `20260916000000_recruit_accounts.sql`(디스코드 계정 · 프로필 · 1인 1파티로 교체). 앞의 두 개는 이미 넣었다.
   **세 번째는 옛 팀 · 팀원 표를 통째로 지운다** — 넣기 직전에 SQL Editor 에서 `select count(*) from recruit_teams` 가 0 인지 확인하고, 파일을 통째로 붙여 넣고 Run 한다
   (`begin; … commit;` 으로 감싸져 있어 중간에 실패하면 아무것도 바뀌지 않는다).
   SQL Editor 로 넣은 내용은 CLI 의 마이그레이션 기록에 남지 않는다 — 나중에 `npx supabase db push` 로 바꾸려면 먼저
   `npx supabase link --project-ref lgchgqxjjlapszmxarun`(DB 비밀번호를 묻는다) 뒤 `npx supabase migration repair 20260914000000 20260915000000 20260916000000 --status applied` 로 기록을 맞춘다. 한 방법만 계속 쓴다.
3. **Project Settings > API Keys** 에 secret key(`sb_secret_...`) · publishable key(`sb_publishable_...`)가 있는지 본다. 없는 오래된 프로젝트면 같은 화면에서 새 키를 만든다
   (예전 `anon` · `service_role` JWT 는 2026년 말에 없어질 예정). 함수는 두 키를 `SUPABASE_SECRET_KEYS` · `SUPABASE_PUBLISHABLE_KEYS` 로 받으므로 따로 복사할 필요는 없다
   (**Edge Functions > Secrets** 에 보이면 된다). publishable key 는 화면(`assets/recruit.js`)의 로그인에도 쓴다 — 브라우저에 공개되는 키다.
4. **디스코드 로그인** — [Discord Developer Portal](https://discord.com/developers/applications) 의 애플리케이션 **OAuth2 > Redirects** 에
   `https://lgchgqxjjlapszmxarun.supabase.co/auth/v1/callback` 을 넣고 Client ID · Client Secret 을 복사한다.
   Supabase **Authentication > Sign In / Providers > Discord** 를 켜고 둘을 넣는다(이메일 없는 디스코드 계정도 되게 이메일 필수는 끈다).
   **Authentication > URL Configuration** 의 Site URL 은 `https://nba-kor.github.io/recruit/`, Redirect URLs 에 `https://nba-kor.github.io/recruit/` · `http://localhost:8000/recruit/`.
   Client Secret 은 함수 비밀값이 아니다 — `.env` 에 두고 `secrets set` 으로 올리지 않는다.

secret key 는 RLS 를 건너뛰는 관리자 키다. `assets/recruit.js` 같은 브라우저 코드나 저장소에 넣지 않는다.
공개 GitHub 저장소에 올라간 secret key 는 Supabase 가 찾아내 자동으로 폐기한다.

스키마를 바꿀 때는 `supabase/migrations/<타임스탬프>_<이름>.sql` 을 새로 만들어 `begin; … commit;` 으로 감싸고, 위에서 고른 방법으로 클라우드에 넣는다.
새 표나 함수에는 기존 파일처럼 `enable row level security` · `revoke ... from public, anon, authenticated` · `grant ... to service_role` 을 꼭 같이 쓴다
(프로젝트에 따라 새 표가 자동 공개되기도, service_role 에도 권한이 없기도 하다).

### Discord 설정

**웹훅 (알림)** — 알림 받을 텍스트 채널의 채널 편집 > 연동 > 웹후크 > 새 웹후크 → URL 복사 → `DISCORD_WEBHOOK_URL`.
웹이든 봇이든 만들기 · 가입 · 모집 완료 · 나가기 · 방출 · 해제가 모두 이 웹훅 하나로 간다(봇은 파티 알림을 따로 보내지 않는다).
멘션 파싱은 기본으로 끄므로 이름에 `@everyone` 을 넣어도 울리지 않는다. **모집 완료만** 그 파티원 ID 를 `allowed_mentions.users` 로 골라 멘션한다.
알림은 워커마다 차례로 보낸다. 디스코드가 잠깐 막아(429) 한 워커가 기다리는 사이 다른 워커가 받은 가입 · 모집 완료 알림이 먼저 도착할 수 있다.

**봇 (음성채널 목록)** — 함수에는 게이트웨이에 붙어 있는 봇 프로세스가 없다. 팀을 만들 때 REST 로 채널 목록과 서버 정보(잠수 채널)를 한 번 읽는다(워커마다 1분 기억).
TNAB 봇(다른 PC)과 같은 애플리케이션의 봇 토큰을 써도 된다.

1. [Discord Developer Portal](https://discord.com/developers/applications) > New Application > **Bot** > Reset Token → `DISCORD_BOT_TOKEN`.
2. **OAuth2 > URL Generator** 에서 scope `bot`, 권한은 **View Channels** 하나만 골라 서버에 초대한다(TNAB 봇으로 이미 들어가 있으면 건너뛴다).
   (`https://discord.com/oauth2/authorize?client_id=<애플리케이션 ID>&scope=bot&permissions=1024` 와 같다.)
3. **음성채널 카테고리에서 봇이 채널 보기 권한을 갖게 한다.** 비공개 카테고리면 카테고리 권한에 봇 역할을 추가해야 한다.
   디스코드는 **2026-11-16 부터** 봇이 볼 수 없는 채널을 채널 목록에서 아예 뺀다 — 권한이 없으면 배정할 방이 하나도 없다.
4. 사용자 설정 > 고급 > 개발자 모드를 켜고, 서버 아이콘 우클릭 > ID 복사 → `DISCORD_GUILD_ID`,
   음성채널 카테고리 우클릭 > ID 복사 → `DISCORD_VOICE_CATEGORY_ID`.

`/api/health` 의 `voice` 가 `true` 면 봇 토큰 · 서버 ID 가 설정된 것이다(토큰이 맞는지는 팀을 만들어 봐야 안다 — 틀리면 함수 로그에 `디스코드 채널 목록 실패 401`).

**끝 방 고르는 법** — 팀을 만들 때 한 번만 고른다. 후보는

- `DISCORD_VOICE_CATEGORY_ID` 카테고리 안의 음성채널 (비우면 전체) 중 봇이 볼 수 있는 방
- 서버 설정의 잠수(AFK) 채널이 아닌 것
- 만료 전인 다른 방(모집 중 · 다 참)이 이미 잡아 둔 방이 아닌 것 — 방이 해제 · 만료되면 다시 후보가 된다

이고, 그중 **채널 목록에서 가장 아래** 방(`position` 이 가장 큰 방, 같으면 나중에 만든 방)을 고른다.
**"빈 방" 은 모집 중인 다른 팀이 안 잡은 방이라는 뜻이다** — 함수는 음성채널에 실제로 누가 있는지 알 수 없다.
그래서 모집 전용 음성채널을 한 카테고리에 모아 두고 그 카테고리를 지정하는 게 좋다.
`position` 은 카테고리가 다르면 화면 순서와 어긋날 수 있다는 점도 카테고리를 지정하는 이유다.
빈 방이 없거나 봇이 없거나 디스코드가 응답하지 않으면 음성채널 없이 팀이 만들어지고, 알림에 "빈 음성채널이 없어요" 가 나간다.

### 카카오 설정

1. [Kakao Developers](https://developers.kakao.com) 에서 앱을 만들고 **앱 > 플랫폼 키 > JavaScript 키** 를 복사해
   `assets/recruit.js` 맨 위 `KAKAO_JS_KEY` 에 넣는다. JavaScript 키는 원래 브라우저에 공개되는 키라 커밋해도 되고,
   아래에 등록한 도메인에서만 쓸 수 있다. 키가 비어 있으면 공유 버튼은 기기 공유창이나 링크 복사로 대신한다.
2. 도메인을 **두 군데** 등록한다. 이름이 비슷하지만 서로 별개다.

   | 위치 | 넣을 값 | 용도 |
   | --- | --- | --- |
   | JavaScript 키 > **JavaScript SDK 도메인** | `https://nba-kor.github.io`, `http://localhost:8000` | 이 주소의 페이지에서만 SDK 를 쓸 수 있다 |
   | **제품 링크 관리 > 웹 도메인** | `https://nba-kor.github.io` | 메시지 속 링크 · 버튼은 여기 등록된 도메인만 열린다. **없는 도메인은 앱 기본 도메인으로 바뀐다** — 그래서 "디스코드" 버튼도 `discord.com` 이 아니라 사이트의 `/discord/` 를 가리킨다 |

3. `node tools/stamp-assets.mjs` 후 커밋.

로컬(`http://localhost:8000`)에서는 공유창이 뜨는지까지만 확인한다. 카카오 서버가 localhost 의 이미지를 가져갈 수 없어
썸네일이 비고, 링크도 그 PC 에서만 열린다. 실제 메시지 모양은 운영 주소에서 본다.

공유 이미지는 200x200 이상이어야 하고 투명한 부분이 검게 나올 수 있어서, 원형 얼굴 PNG 를 불투명한 배경에 얹은
300x300 JPG 를 따로 쓴다(`assets/share/`, 빈 자리는 `empty.jpg`). 한국 출시 캐릭터만 만든다. **얼굴을 추가 · 교체했으면(`node tools/update-players.mjs` 로 출시 캐릭터가 늘었을 때 포함) 다시 만든다:**

```sh
tools/cn-faces/.venv/bin/python tools/share-faces.py   # 위 "얼굴 이미지" 의 venv (Pillow 만 쓴다)
```

카카오는 이미지를 URL 기준으로 캐시하므로, 같은 파일명으로 바꾼 이미지는 한동안 옛 모습으로 보일 수 있다.

### 운영 배포

화면은 GitHub Pages(main), API 는 Supabase Edge Function 이다. 함수를 먼저 올리고 확인한 뒤 main 에 올린다 —
`assets/recruit.js` 는 `nba-kor.github.io` 에서 열리면 자동으로 함수 주소(`API_ORIGIN`)를 부른다.
**옛 화면(비밀번호 방식)과 새 함수는 서로 맞지 않는다** — 2~4번과 6번 사이에 잠깐 모집이 안 된다.

3 · 4번의 CLI 는 로그인 대신 [개인 토큰](https://supabase.com/dashboard/account/tokens)(`sbp_...`)을 쓴다. 시작 전에 터미널에서 한 번 넣어 둔다
(`.env` 의 `SUPABASE_ACCESS_TOKEN=` 에 채워 둬도 된다 — 비밀값으로는 올라가지 않는다). `supabase link` 는 필요 없다.

```sh
export SUPABASE_ACCESS_TOKEN=sbp_...
```

1. [Supabase 설정](#supabase-설정) 4번의 디스코드 로그인을 켠다.
2. [Supabase 설정](#supabase-설정) 2번의 세 번째 마이그레이션을 넣는다(팀 0개 확인 뒤).
3. 비밀값을 올린다(`.env` 에 채운 값. `SUPABASE_` 로 시작하는 줄은 CLI 가 건너뛴다). 올린 뒤 다시 배포할 필요는 없다.
   `TNAB_BOT_KEY` 는 이 PC 에서 새로 만들어 `.env` 와 봇 PC 의 `.env` 에만 넣는다(채팅 · 메신저로 보내지 않는다).
   **Node 서버 시절에 만든 `.env` 는 그대로 올리지 않는다** — `CORS_ORIGIN` 이 비었거나 `SITE_URL` 이 localhost 면 운영 화면이 API 응답을 못 읽고
   (「모집 서버에 연결할 수 없어요」) 알림 링크가 localhost 로 간다. `cp .env.example .env` 로 다시 만들고 디스코드 값만 옮겨 채운다.

   ```sh
   npx supabase secrets set --project-ref lgchgqxjjlapszmxarun --env-file .env
   ```

4. 함수를 배포한다. Docker 가 켜져 있으면 이 PC 에서 번들을 만들고(`supabase/edge-runtime` 이미지), 꺼져 있으면 서버에서 만든다.
   `supabase/config.toml` 의 `verify_jwt = false` 가 같이 올라간다 — 봇은 `Authorization: Bot ...` 을 싣고 공개 GET 은 키 없이 부르므로, 켜져 있으면 게이트웨이가 401 로 막는다.
   웹 로그인 토큰은 함수가 Auth 에 직접 확인한다.

   ```sh
   npx supabase functions deploy recruit --project-ref lgchgqxjjlapszmxarun
   ```

5. 확인:

   ```sh
   F=https://lgchgqxjjlapszmxarun.supabase.co/functions/v1/recruit/api
   curl -s $F/health                                        # {"ok":true,"voice":true|false,"login":true}
   curl -s $F/teams                                         # {"teams":[...]}
   curl -s $F/me                                            # {"error":"디스코드로 로그인해 주세요"} (401)
   curl -si -X OPTIONS $F/me/profile -H 'Origin: https://nba-kor.github.io' -H 'Access-Control-Request-Method: PUT' | grep -i access-control
   # → access-control-allow-origin: https://nba-kor.github.io 가 나와야 한다. 아무것도 안 나오면 CORS_ORIGIN 비밀값이 틀렸다 — 3번만 다시 한다(재배포 불필요)
   ```

   봇 키 확인(키를 셸 기록에 남기지 않게 `.env` 에서 읽는다. `/me` 는 아무것도 저장하지 않는다):

   ```sh
   set -a; . ./.env; set +a
   B=(-H "Authorization: Bot $TNAB_BOT_KEY" -H 'X-Discord-User: 100000000000000001' -H 'X-Discord-Name: smoke' -H 'content-type: application/json')
   curl -s "${B[@]}" $F/me                                  # {"user":{"id":"100000000000000001","name":"smoke"},...}
   ```

   함수 로그는 대시보드 **Edge Functions > recruit > Logs**. 실제 디스코드 로그인 · 프로필 저장 · 만들기 · 가입 · 해제는 배포 뒤 화면에서 한 번 해 본다.

6. `node tools/stamp-assets.mjs` 후 main 에 커밋 · 푸시.

코드(`server/*.mjs` · `supabase/functions/`)를 고치면 4번만 다시 한다. `data/*.json` 을 고쳐도(선수 추가 등) 함수에 묶여 있으므로 **함수도 다시 배포**한다.

### Supabase 무료 플랜 주의

- **함수 호출은 한 달 50만 번**(오류 응답 포함, preflight 는 제외). 화면은 탭이 보일 때만 목록을 1분마다, 팀 화면을 20초마다 새로 읽고, 봇은 30초마다 목록을 읽는다.
  넘으면 경고 뒤 모든 요청이 402 로 막힐 수 있다 — 대시보드 **Usage** 에서 본다.
- 요청 하나에 **CPU 2초 · 메모리 256MB**, 워커는 최대 150초.
- 로그인 사용자(Auth MAU)는 무료 플랜 한도(5만) 안이면 따로 신경 쓸 게 없다. 로그인 토큰 확인은 워커마다 60초 기억해 Auth 호출을 줄인다.
- **7일 동안 DB 요청이 뜸하면 프로젝트가 일시정지된다.** 그동안 팀원모집은 「모집 서버 DB 에 연결할 수 없어요」만 보인다.
  `.github/workflows/keep-alive.yml` 이 하루 두 번(UTC 03:17 · 15:17) 모집 목록을 읽어 막는다. GitHub 은 **저장소에 60일 동안 활동이 없으면 예약 실행을 끈다** —
  Actions 탭에서 다시 켜거나 커밋을 하나 올린다. 정지 전에 Supabase 가 경고 메일을 보내고, 정지되면 대시보드에서 Restore 로 되살린다.
- DB 는 500MB 까지다(넘으면 읽기 전용). 방 하나는 몇 KB 이고 만료된 방 · 요청 수 기록은 방을 만들 때마다 지우므로 쌓이지 않는다. 프로필은 사람마다 한 줄 남는다.
- **자동 백업이 없다.** 직접 받아 둔다(`npx supabase link --project-ref lgchgqxjjlapszmxarun` 을 한 상태에서). 디스코드 ID · 이름 · 게임 닉네임이 들어 있으니 저장소 밖에 둔다 —
  로컬 nginx 가 저장소 루트를 통째로 서비스한다.

  ```sh
  npx supabase db dump --linked -f ../recruit-schema.sql               # 기본은 스키마만
  npx supabase db dump --linked --data-only -f ../recruit-data.sql
  ```

### 테스트

```sh
docker compose up -d                 # 로컬 Supabase(db · rest)
node --test server/test.mjs          # 호스트의 Node 22+ 로. 환경변수는 필요 없다
```

`server/index.mjs` 의 `createHandler` 를 HTTP 서버 없이 `Request` 로 직접 부른다. 로컬에는 Supabase Auth 가 없어서 웹 로그인(`/auth/v1/user`) · 웹훅 · 디스코드 채널 목록은
가짜 fetch 가 받는다 — `.env` 나 디스코드 계정은 필요 없다. 봇 신원은 테스트 전용 봇 키로 헤더를 만든다.
DB 테스트는 `http://localhost:54321`(compose 가 이 PC 에만 여는 로컬 Data API)에 `compose.yaml` 의 로컬 service_role 키로 붙는다.
compose 가 떠 있지 않으면 DB 가 필요 없는 테스트(신원 · 검증 · CORS · 413 · 알림 · 음성채널 후보 · Data API 오류 처리)만 돌고 나머지는 이유를 달고 건너뛴다.
`SUPABASE_URL` · `SUPABASE_SECRET_KEY` 로 대상을 바꿀 수 있지만 `localhost` · `127.0.0.1` · `web` · `rest` 가 아니면 DB 테스트를 돌리지 않는다.

테스트마다 먼 미래(2100년 이후) 시계를 써서 화면의 모집 목록에는 섞이지 않는다. 대신 그 시계로 방을 만들 때 만료 청소가 돌아
**로컬 DB 에 있던 지금 시각의 방은 지워진다**(로컬 전용 데이터라 괜찮다). 디스코드 ID 는 실행마다 새로 만들어 프로필이 로컬 DB 에 쌓인다.
만료 · 연장 · 요청 수 제한은 시계를 돌려 확인하고, 워커 여러 개가 동시에 받는 경우는 핸들러를 여러 개 만들어 흉내 낸다.

**봇 통합 테스트(로컬)** — `compose.yaml` 의 `TNAB_BOT_KEY` 는 로컬 전용 공개 값이다. TNAB 봇을 `RECRUIT_API_URL=http://localhost:8000/api` · 그 키로 띄우면 로컬 함수에 붙는다.
로컬에는 웹 로그인이 없으므로(`/api/health` 의 `login: false`) 웹 쪽 동작은 봇 헤더로 흉내 낸다:

```sh
K=local-dev-tnab-bot-key-0916-not-a-secret-xxxxxxxx
curl -s -H "Authorization: Bot $K" -H 'X-Discord-User: 100000000000000001' -H 'X-Discord-Name: %EB%B3%B4%EB%85%B8' http://localhost:8000/api/me
```

## 배포 전: 캐시 무효화

```sh
node tools/stamp-assets.mjs
```

GitHub Pages 는 모든 파일에 `Cache-Control: max-age=600` 만 준다. 그래서 CSS·JS 를 고쳐도
최대 10분간 브라우저가 옛 파일을 쓴다. 이 스크립트가 파일 내용의 해시를 참조 뒤에 `?v=` 로 붙여,
내용이 바뀌면 URL 도 바뀌게 만든다.

```html
<link rel="stylesheet" href="/assets/style.css?v=d6bc232a">
```

`assets/*.css` 나 `assets/*.js` 를 고쳤으면 **커밋 전에 한 번 돌린다.** 여러 번 돌려도 결과는 같고,
바뀌지 않은 파일의 해시는 그대로라 불필요한 diff 가 생기지 않는다.

| 대상 | 파일 |
| --- | --- |
| 페이지 | `index.html`, `tactics/index.html`, `tiers/index.html`, `recruit/index.html` |
| 자원 | `assets/style.css`, `app.js`, `court.js`, `tactics.js`, `tiers.js`, `recruit.js` |

다른 스크립트가 import 하는 모듈은 import 구문에도 버전이 박히고, 그걸 박은 결과로 다시 해시를 낸다.
`app.js` → `court.js` → `tactics.js` · `recruit.js` (그리고 `app.js` → `tiers.js`) 순으로 번지므로
`app.js` 만 고쳐도 줄줄이 새 URL 이 된다. JS 파일이나 페이지를 새로 만들면 스크립트의 `ASSETS` · `PAGES` 에
넣는다 — `ASSETS` 는 import 되는 쪽이 앞이어야 하고, 순서가 틀리면 에러로 알려준다.

HTML 자체도 `max-age=600` 이라 새 HTML 이 퍼지기까지는 여전히 최대 10분이 걸린다. 정적 호스팅에서
더 줄일 방법은 없다. 선수 얼굴 이미지는 대상이 아니다 — `data/*.json` 은 `fetch` 에서
`cache: 'no-cache'` 로 매번 확인하지만, 이미지 파일 자체는 이름이 같으면 최대 10분 묵을 수 있다.

## 로컬에서 보기

ES 모듈과 `fetch` 를 쓰므로 `file://` 로는 열리지 않는다. 루트 절대경로를 쓰므로
**저장소 루트에서** 서버를 띄워야 한다.

```sh
cp .env.example .env            # 처음 한 번. 디스코드 알림까지 볼 게 아니면 건너뛰어도 된다
docker compose up -d            # http://localhost:8000/tactics/ · http://localhost:8000/recruit/   (끄기: docker compose down)
```

| 서비스 | 하는 일 |
| --- | --- |
| `web` (nginx) | 저장소를 그대로 마운트해 `:8000` 으로 서비스하고 `/api/` 는 `api` 의 `/recruit/api/` 로 넘긴다(운영 게이트웨이와 같은 경로). 로컬 Data API(`/rest/v1/` → `rest`)는 따로 **`127.0.0.1:54321`** 에만 연다 — `:8000` 에는 없어서 같은 네트워크의 다른 기기가 DB 에 닿지 못한다 |
| `api` (supabase/edge-runtime) | 운영과 같은 Edge Function 런타임으로 `supabase/functions/recruit` 를 돌린다(`tools/edge-main` 이 게이트웨이 대신 워커를 만든다). `.env` 의 디스코드 값을 읽되 Supabase 주소 · 키 · `CORS_ORIGIN` · `SITE_URL` · 로컬 전용 `TNAB_BOT_KEY` 는 `compose.yaml` 의 값으로 고정(Supabase Auth 는 없어 웹 로그인은 안 된다) — 로컬에서 클라우드 DB 를 건드리지 않는다 |
| `db` (supabase/postgres) | Supabase 가 쓰는 Postgres 이미지. 데이터는 `supabase-db` 볼륨 |
| `rest` (PostgREST) | Supabase Data API 와 같은 PostgREST. 로컬 전용 JWT 비밀값 · 키는 `compose.yaml` 에 적혀 있다. `api` 는 `http://web:8080`, 호스트의 스크립트 · 테스트는 `http://localhost:54321` 로 부른다 |

`db` 이미지는 처음 받을 때 크다(디스크 약 1.7GB). 빈 볼륨으로 처음 뜰 때 `supabase/migrations/*.sql` 을 이름 순서대로 적용하고, 그 뒤로는 다시 돌리지 않는다.
마이그레이션을 새로 추가했으면 `docker compose down -v && docker compose up -d` (로컬 모집 데이터가 지워진다) 또는
`docker compose exec db psql -U postgres -h localhost -d postgres -f /migrations/<파일>`.

화면 파일은 고치고 새로고침하면 바로 반영된다(캐시 끔). 함수 워커는 재사용되므로 `server/*.mjs` · `data/*.json` 을 고쳤으면 `docker compose restart api`.
`.env` 를 고쳤으면 `docker compose up -d` 를 다시 돌린다. `compose.yaml` 의 nginx 설정을 고쳤으면
`docker compose up -d --force-recreate web` (`up -d` · `restart` 로는 반영되지 않는다). 모집한 방은 3시간이 지나면 사라지고, 당장 비우려면 `docker compose down -v`.
요청 수 제한(한 사람 당 쓰기 10분에 30번)은 DB 에 남으므로 스크립트로 몰아서 시험하다 막히면
`docker compose exec db psql -U postgres -h localhost -d postgres -c 'delete from recruit_hits'`.

Docker 가 없으면 `python3 -m http.server 8000 --bind 127.0.0.1` 도 되지만(저장소를 통째로 서비스하므로 `.env` 가 있으면 밖에 열지 않는다), 브라우저 캐시 때문에 고친 CSS·JS 가
늦게 보일 수 있고 팀원모집은 API 가 없어 동작하지 않는다.

## 라이선스 / 출처

팬 제작 비공식 도구. 선수 정보와 이미지의 저작권은 NetEase / NBA 등 원저작자에게 있으며,
[공식 홈페이지](https://www.dunkcitymobile.com/kr/)에서 가져온다.
