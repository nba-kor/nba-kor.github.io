# NBA 덩크 시티 한국 서버 도구함

「NBA 덩크 시티」(Dunk City Dynasty) 한국 서버 유저를 위한 팬 제작 정적 사이트.
빌드 도구 없이 HTML + CSS + ES 모듈로만 돌아가며 GitHub Pages에 그대로 올라간다.
팀원모집만 예외로 API 서버(`server/`)가 따로 필요하다([팀원모집](#팀원모집) 참고).

| URL | 파일 | 설명 |
| --- | --- | --- |
| `/` | `index.html` | 소개 / 선수 현황 |
| `/tactics/` | `tactics/index.html` | **전술판** — 하프코트 3:3 배치, 동선 드로잉, 기본 전술 프리셋 14종, 재생 |
| `/tiers/` | `tiers/index.html` | **티어표** — S~D 프리셋에 선수를 드래그, 티어 추가/이름 변경, 링크 공유 |
| `/recruit/` | `recruit/index.html` | **팀원모집** — 방 만들기·가입, 디스코드 알림 + 빈 음성채널 배정, 카카오톡 공유, 3시간 뒤 자동 삭제 |

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

한국 서버에 선수가 추가되면 공식 홈페이지를 다시 긁어오면 끝이다.

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
프리셋을 추가하려면 `presets` 배열에 항목 하나를 더 넣으면 된다.

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

`/recruit/` — 3:3 이라 팀장 포함 3명이 한 팀이다.

1. **팀장**이 방을 만든다.
   - **방 설정**: 방 제목(선택) · 마이크 O/X · 즐겜/빡겜 · 메모(선택, 줄바꿈 가능) · **비밀번호**(4~20자, 필수).
   - 원하는 전술(선택) + 디스코드 닉네임 + 게임 계정(닉네임·티어·캐릭터) 1~3줄.
     첫 줄 캐릭터가 대표다. `+ 본인계정 캐릭터` 는 캐릭터만 고르고 닉네임·티어는 첫 줄 것을 쓰고,
     `+ 다중계정` 은 부계정 닉네임·티어·캐릭터를 따로 받는다.
     "게임 닉네임이 디스코드 닉네임과 같아요" 를 체크하면 닉네임을 두 번 쓰지 않아도 된다.
2. 서버가 팀을 저장하고 **빈 음성채널을 끝 방부터** 하나 잡아, 디스코드 웹훅으로 "모집 시작" + 음성채널 링크를 보낸다.
   알림 제목은 방 제목(없으면 전술 이름), 첫 줄은 `🎙️ 마이크 O · 빡겜 · 전술 픽 앤 롤`, 메모는 따로 붙는다.
3. 팀장이 **카카오톡 공유**로 카톡방에 링크를 뿌린다. 리스트 메시지로, 제목은 팀 전술(없으면 방 제목),
   항목마다 왼쪽에 닉네임과 `PG · 라멜로 볼 외 2개`, 오른쪽에 대표 캐릭터 얼굴, 버튼은 "팀 가입".
4. **팀원**이 링크로 들어오면 방 정보·전술 설명·전술 애니메이션·로스터를 보고 같은 폼으로 가입한다.
   가입할 때마다 디스코드 알림, 3명이 차면 "모집 완료" 알림.

**목록 순서** — 모집 중인 방이 먼저, 다 찬 방은 맨 뒤. 각각 먼저 만든 방이 위라 새 방은 모집 중 목록 맨 아래에 붙는다.
다 찬 방에서 누가 나가거나 방출되면 다시 모집 중이 되어 원래 자리로 돌아온다.

**관리** — 팀장은 **팀 해제**(방 삭제) · **방출** · **연장**을 할 수 있다. 방을 만든 브라우저는 저장된 팀장 토큰으로 바로,
다른 기기에서는 방을 만들 때 넣은 **비밀번호**로 한다. 팀원은 자기 브라우저에서 **나가기**만 할 수 있다.
팀장이 빠지면(나가기 · 방출) 방이 해제된다. 비밀번호는 서버에 솔트를 붙인 scrypt 해시로만 저장되고,
10분 동안 한 IP 가 한 방에 5번 틀리면 그 IP 만, 여러 IP 를 합쳐 20번 틀리면 그 방 전체가 10분 동안 비밀번호로 열리지 않는다(토큰 관리는 그대로 된다). 누가 일부러 틀려도 팀장이 바로 잠기지 않게 IP 단위로 먼저 막는다.

**자동 삭제 · 연장** — 방은 만든(또는 연장한) 지 **3시간이 지나면 사라진다**(목록 · 팀 화면 · 가입 모두 즉시, DB 행은 서버가 5분마다 지운다).
팀장 관리의 **연장** 버튼(팀장 토큰 또는 비밀번호)은 남은 시간을 **지금부터 다시 3시간**으로 되돌린다 — 더해지지 않아 최대 3시간이다.

**화면 편의** — 자주 쓰는 구성(디스코드 닉네임 · 계정 · 캐릭터)을 **프리셋**으로 이 브라우저에 5개까지 저장해 한 번에 채운다(`dc.recruit.presets`).
캐릭터 고르기 창 위의 **포지션 뱃지**(전체 · PG · SG · SF · PF · C)로 목록을 거른다.

인원·계정 수·만료 시간(3시간)·티어 · 즐겜/빡겜 이름 · 글자 수 제한 · 프리셋 수는 `data/recruit.json` 하나에 있고 서버와 화면이 같이 읽는다.
캐릭터는 한국 출시 선수(`data/players.json`)만 고를 수 있다.

### API

모든 본문은 JSON, 오류는 `{ "error": "한국어 문구" }`. 팀 모양은 `{ id, room: { title, mic, mode, memo }, tactic, voice, status: open|full, size, createdAt, expiresAt, members }` 하나뿐이다(목록은 `tactic.board` 를 뺀다).

| 요청 | 권한 | 결과 |
| --- | --- | --- |
| `GET /api/health` | – | `{ ok, voice }` — `voice` 는 봇이 서버 상태를 받았는지 |
| `GET /api/teams` | – | 만료 전 방, 모집 중 → 다 찬 순, 각각 오래된 순, 최대 100개 |
| `GET /api/teams/:id` | – | 팀. 없거나 만료 → 404 |
| `POST /api/teams` | – | `{ room: { title?, mic, mode, memo?, password }, tactic, member }` → 201 `{ team, member: { id, token } }` |
| `POST /api/teams/:id/members` | – | 가입 `member` → 201 `{ team, member }`. 없거나 만료 404 · 다 참 · 같은 디스코드 닉네임 409 |
| `DELETE /api/teams/:id` | 팀장 | 팀 해제(삭제) → `{ ok: true }` |
| `DELETE /api/teams/:id/members/:memberId` | 팀장, 또는 본인 토큰 | 방출 · 나가기 → `{ ok: true, team }`. 팀장이 대상이면 해제되고 `team: null` |
| `POST /api/teams/:id/extend` | 팀장 | 만료 = 지금 + 3시간 → `{ team }` |

팀장 권한은 `Authorization: Bearer <팀장 토큰>` 또는 본문 `{ "password": "..." }` (DELETE 도 본문을 보낸다). 토큰 없음 401, 권한 없음 · 틀린 비밀번호 403,
비밀번호 연속 실패 429. POST · DELETE(연장 포함)는 IP 당 10분에 30번까지다.

### 구조

```
recruit/index.html    화면 (정적)
assets/recruit.js     화면 로직 — 맨 위에 API_ORIGIN · KAKAO_JS_KEY 설정
assets/share/*.jpg    카카오톡 공유용 얼굴 (tools/share-faces.py 가 생성)
server/index.mjs      API 서버 (/api) — Node 내장 모듈만 쓴다(http · crypto · fetch), npm 의존성 없음
server/discord.mjs    웹훅 알림 · 음성채널 추적(게이트웨이 봇)
server/test.mjs       서버 테스트
supabase/migrations/  DB 스키마 (Supabase 클라우드와 로컬 docker compose 가 같은 파일을 쓴다)
```

저장소는 **Supabase(무료 플랜)** 의 Postgres 다. 브라우저는 Supabase 에 직접 붙지 않고, API 서버만 secret key 로
Data API(`/rest/v1`)를 부른다. 표는 RLS 를 켜고 `anon` · `authenticated` 권한을 전부 거둬 두어서
publishable(anon) key 로는 아무것도 읽거나 쓸 수 없다. 가입 인원 확인과 저장은 DB 함수(`recruit_join_team`) 하나가
팀 행을 잠근 채 처리하므로 여러 명이 동시에 눌러도 3명을 넘지 않는다. 목록의 "모집 중 먼저" 는 계산 필드
`recruit_member_count` 로 거른다. 저장하는 건 닉네임 · 계정 · 방 설정과 토큰 · 비밀번호의 해시뿐이다.

나머지 페이지와 달리 서버가 필요한 이유는 셋이다.

| 필요한 것 | 정적 사이트로 안 되는 이유 |
| --- | --- |
| 모집 중인 팀 목록 · 가입 · 인원 마감 | 여러 사람이 같은 상태를 봐야 한다 → Supabase. 검증 · 요청 수 제한 없이 브라우저에 DB 를 열 수는 없다 |
| 디스코드 알림 | 웹훅 URL 은 그 자체가 비밀번호다. 브라우저 코드에 넣으면 누구나 채널에 글을 쓸 수 있다 |
| 빈 음성채널 찾기 | 채널별 접속자는 REST API 로 얻을 수 없고, 게이트웨이에 계속 붙어 있는 봇만 안다 |

### 설정

```sh
cp .env.example .env     # .env 는 커밋되지 않는다
```

| 키 | 설명 |
| --- | --- |
| `PORT` | API 포트 (기본 3000). docker compose 에서는 3000 고정 |
| `SUPABASE_URL` | Supabase 프로젝트 URL `https://<project-ref>.supabase.co`. docker compose 에서는 로컬 흉내(`http://web`) 고정 |
| `SUPABASE_SECRET_KEY` | Supabase secret key `sb_secret_...` (아래 [Supabase 설정](#supabase-설정)). docker compose 에서는 로컬 전용 키 고정 |
| `SITE_URL` | 알림 속 팀 링크 · 썸네일 이미지의 기준 주소. 운영은 `https://nba-kor.github.io` |
| `CORS_ORIGIN` | 화면과 API 의 도메인이 다를 때 화면 주소. 비우면 CORS 헤더를 붙이지 않는다(같은 도메인) |
| `TRUST_PROXY` | `1` 이면 `X-Forwarded-For` 첫 주소를 IP 로 본다(요청 수 제한: IP(IPv6 는 /64) 당 POST·DELETE 10분에 30번). 프록시 없이 열면 `0` — 헤더 위조를 막는다. docker compose 에서는 `1` 고정 |
| `DISCORD_WEBHOOK_URL` | 알림 보낼 웹훅. 비우면 알림 없음 |
| `DISCORD_BOT_TOKEN` | 음성채널 배정용 봇 토큰 |
| `DISCORD_GUILD_ID` | 디스코드 서버 ID. 봇 토큰과 둘 다 있어야 봇이 켜진다 |
| `DISCORD_VOICE_CATEGORY_ID` | 이 카테고리 안의 음성채널만 배정. 비우면 서버의 모든 음성채널 |

`SUPABASE_URL` · `SUPABASE_SECRET_KEY` 가 없으면 서버가 시작하지 않는다. 디스코드 값은 전부 비워도 모집 자체는 된다 — 알림과 음성채널 배정만 빠진다.

### Supabase 설정

1. [Supabase](https://supabase.com/dashboard) 에서 새 프로젝트를 만든다(Free). 리전은 API 서버와 가까운 곳으로.
2. 스키마를 한 번 넣는다. 아래 **둘 중 한 방법만 계속 쓴다** — SQL Editor 로 바꾼 내용은 CLI 의 마이그레이션 기록에 남지 않아 나중에 `db push` 가 어긋난다.
   - 대시보드 **SQL Editor** 에 `supabase/migrations/20260914000000_recruit.sql` 을 붙여 넣고 Run
   - 또는 CLI: `npx supabase login` → `npx supabase link --project-ref <project-ref>` → `npx supabase db push`
3. **Project Settings > API Keys** 의 secret key(`sb_secret_...`)를 API 서버의 `SUPABASE_SECRET_KEY` 에, 프로젝트 URL 을 `SUPABASE_URL` 에 넣는다.
   `sb_secret_` 키가 없는 오래된 프로젝트면 같은 화면에서 새 키를 만든다(예전 `service_role` JWT 는 2026년 말에 없어질 예정).

secret key 는 RLS 를 건너뛰는 관리자 키다. **API 서버의 `.env` 에만 둔다** — `assets/recruit.js` 같은 브라우저 코드나 저장소에 넣지 않는다.
공개 GitHub 저장소에 올라간 secret key 는 Supabase 가 찾아내 자동으로 폐기한다(그러면 API 가 멈춘다). 새로 만들고 서버 값을 바꾸면 된다.

스키마를 바꿀 때는 `supabase/migrations/<타임스탬프>_<이름>.sql` 을 새로 만들고, 위에서 고른 방법으로 클라우드에 넣는다.
새 표나 함수에는 기존 파일처럼 `enable row level security` · `revoke ... from public, anon, authenticated` · `grant ... to service_role` 을 꼭 같이 쓴다
(프로젝트에 따라 새 표가 자동 공개되기도, service_role 에도 권한이 없기도 하다).

### Discord 설정

**웹훅 (알림)** — 알림 받을 텍스트 채널의 채널 편집 > 연동 > 웹후크 > 새 웹후크 → URL 복사 → `DISCORD_WEBHOOK_URL`.
보낼 때 멘션 파싱을 끄므로 닉네임에 `@everyone` 을 넣어도 울리지 않는다.

**봇 (빈 음성채널 배정)**

1. [Discord Developer Portal](https://discord.com/developers/applications) > New Application > **Bot** > Reset Token → `DISCORD_BOT_TOKEN`.
   Privileged Gateway Intents(Presence · Server Members · Message Content)는 **전부 꺼 둔다.**
   쓰는 인텐트는 `GUILDS` · `GUILD_VOICE_STATES` 뿐이고 둘 다 특권 인텐트가 아니다.
2. **OAuth2 > URL Generator** 에서 scope `bot`, 권한은 **View Channels** 하나만 골라 서버에 초대한다.
   (`https://discord.com/oauth2/authorize?client_id=<애플리케이션 ID>&scope=bot&permissions=1024` 와 같다.)
   음성채널에 들어가지도, 글을 쓰지도 않으므로 Connect · Speak · Send Messages 는 필요 없다.
3. **음성채널 카테고리에서 봇이 채널 보기 권한을 갖게 한다.** 비공개 카테고리면 카테고리 권한에 봇 역할을 추가해야 한다.
   디스코드는 **2026-11-16 부터** 봇이 볼 수 없는 채널을 이름을 가린 채(`___hidden___`) 보내고,
   서버는 그런 채널을 후보에서 뺀다 — 권한이 없으면 배정할 방이 하나도 없다.
4. 사용자 설정 > 고급 > 개발자 모드를 켜고, 서버 아이콘 우클릭 > ID 복사 → `DISCORD_GUILD_ID`,
   음성채널 카테고리 우클릭 > ID 복사 → `DISCORD_VOICE_CATEGORY_ID`.

`/api/health` 의 `voice` 가 `true` 면 봇이 서버 상태를 받은 것이다.

**끝 방 고르는 법** — 팀을 만들 때 한 번만 고른다. 후보는

- `DISCORD_VOICE_CATEGORY_ID` 카테고리 안의 음성채널 (비우면 전체)
- 서버의 잠수(AFK) 채널이 아니고, 봇이 볼 수 있고, 지금 **아무도 없는** 방
- 만료 전인 다른 방(모집 중 · 다 참)이 이미 잡아 둔 방이 아닌 것 — 방이 해제 · 만료되면 다시 후보가 된다

이고, 그중 **채널 목록에서 가장 아래** 방(`position` 이 가장 큰 방, 같으면 나중에 만든 방)을 고른다.
`position` 은 카테고리가 다르면 화면 순서와 어긋날 수 있으니 카테고리를 지정하는 게 좋다.
빈 방이 없거나 봇이 준비되지 않았으면 음성채널 없이 팀이 만들어지고, 알림에 "빈 음성채널이 없어요" 가 나간다.

봇은 접속(IDENTIFY)이 **하루 1000번을 넘으면 디스코드가 토큰을 초기화한다.** 같은 토큰을 여러 곳에서 띄우지 말고,
docker compose 의 `node --watch` 는 `server/*.mjs` 를 저장할 때마다 재시작해 다시 접속하니
서버 코드를 한창 고칠 때는 `DISCORD_BOT_TOKEN` 을 비워 두는 게 안전하다.

### 카카오 설정

1. [Kakao Developers](https://developers.kakao.com) 에서 앱을 만들고 **앱 > 플랫폼 키 > JavaScript 키** 를 복사해
   `assets/recruit.js` 맨 위 `KAKAO_JS_KEY` 에 넣는다. JavaScript 키는 원래 브라우저에 공개되는 키라 커밋해도 되고,
   아래에 등록한 도메인에서만 쓸 수 있다. 키가 비어 있으면 공유 버튼은 기기 공유창이나 링크 복사로 대신한다.
2. 도메인을 **두 군데** 등록한다. 이름이 비슷하지만 서로 별개다.

   | 위치 | 넣을 값 | 용도 |
   | --- | --- | --- |
   | JavaScript 키 > **JavaScript SDK 도메인** | `https://nba-kor.github.io`, `http://localhost:8000` | 이 주소의 페이지에서만 SDK 를 쓸 수 있다 |
   | **제품 링크 관리 > 웹 도메인** | `https://nba-kor.github.io` | 메시지 속 링크 · "팀 가입" 버튼은 여기 등록된 도메인만 열린다 |

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

GitHub Pages 에는 정적 파일만 올라가므로 API 서버는 따로 띄운다.
API 없이 main 에 올리면 팀원모집 탭은 「모집 서버에 연결할 수 없어요」만 보인다 — 아래를 끝낸 뒤 올리거나, 그때까지 메뉴·홈 카드를 빼 둔다.

1. [Supabase 설정](#supabase-설정)을 끝낸다.
2. **늘 켜져 있고 HTTPS 가 되는** 곳 아무 데나 Node 24 로 `node server/index.mjs` 를 띄운다 — 게이트웨이 봇이 계속 붙어 있어야 하므로
   요청이 없을 때 잠드는 서버리스는 맞지 않는다. (Docker 면 `node:24-alpine` 에 저장소를 넣고 `--watch` 없이 실행, 앞에 HTTPS 프록시를 둔다.
   `compose.yaml` 의 `db` · `rest` · `web` 은 로컬용이라 운영에는 필요 없다.)
   페이지가 HTTPS 라 API 도 HTTPS 여야 브라우저가 막지 않는다. 요청 수 제한 · 비밀번호 실패 횟수 · 음성채널 상태 · 팀 만들 때의 방 배정 줄 세우기가
   메모리에 있으므로 **한 프로세스만** 띄운다(재시작하면 제한 횟수는 초기화된다). 만료된 방 청소도 이 프로세스가 켜고 15초 뒤 한 번 + 5분마다 한다.
3. `assets/recruit.js` 맨 위 `API_ORIGIN` 을 API 주소(예: `'https://api.example.com'`)로 바꾸고
   `node tools/stamp-assets.mjs` 후 커밋.
4. API 서버의 `.env` (디스코드 값은 [설정](#설정) 표 참고):

   ```sh
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...
   SITE_URL=https://nba-kor.github.io
   CORS_ORIGIN=https://nba-kor.github.io
   TRUST_PROXY=1    # 앞단 프록시가 X-Forwarded-For 를 접속 주소 하나로 "덮어쓸" 때만. 덧붙이는 설정이면 첫 주소를 위조할 수 있다
   ```

   nginx 라면 이 저장소 `compose.yaml` 처럼 `proxy_set_header X-Forwarded-For $remote_addr;`.

### Supabase 무료 플랜 주의

- **7일 동안 DB 요청이 뜸하면 프로젝트가 일시정지된다.** 그동안 팀원모집은 「모집 서버 DB 에 연결할 수 없어요」만 보인다.
  서버가 5분마다 만료된 방을 지우는 요청을 보내 막아 보지만(Supabase 가 기준을 밝히지 않아 보장은 아니다) 서버가 꺼져 있으면 소용없다.
  정지 전에 경고 메일이 오고, 정지되면 대시보드에서 Restore 로 되살린다.
- DB 는 500MB 까지다(넘으면 읽기 전용). 방 하나는 몇 KB 이고 만료된 방은 서버가 지우므로(팀원은 cascade) 쌓이지 않는다.
  서버가 오래 꺼져 있었다면 켜질 때 한 번에 지운다.

- **자동 백업이 없다.** 직접 받아 둔다(`npx supabase link` 를 한 상태에서). 닉네임과 토큰 · 비밀번호 해시가 들어 있으니 저장소 밖에 둔다 —
  로컬 nginx 가 저장소 루트를 통째로 서비스한다.

  ```sh
  npx supabase db dump --linked -f ../recruit-schema.sql               # 기본은 스키마만
  npx supabase db dump --linked --data-only -f ../recruit-data.sql
  ```

### 테스트

```sh
docker compose run --rm api node --test server/test.mjs
```

`docker compose up -d` 로 로컬 Supabase(`db` · `rest`)가 떠 있어야 한다. compose 의 로컬 DB 에만 쓰고
(`SUPABASE_URL` 이 `web` · `rest` · `localhost` · `127.0.0.1` 이 아니면 DB 테스트를 건너뛴다), 테스트마다 먼 미래 시계를 써서
화면의 모집 목록에는 섞이지 않는다. 가짜 웹훅 서버 · 가짜 음성채널 상태로 돌아가므로 `.env` 나 디스코드 계정은 필요 없다.

Docker 없이 `node --test server/test.mjs` 로 돌리면 DB 가 필요 없는 테스트(검증 · 알림 · 음성채널 상태 · 게이트웨이 · HTTP 가장자리)만 돌고
나머지는 이유를 달고 건너뛴다. compose 가 떠 있으면 호스트의 Node 로도 전부 돌릴 수 있다 — 로컬 Data API 는 `127.0.0.1:54321` 에 열려 있다:

```sh
SUPABASE_URL=http://localhost:54321 SUPABASE_SECRET_KEY=<compose.yaml 의 api SUPABASE_SECRET_KEY> node --test server/test.mjs
```

만료 · 연장 · 비밀번호 잠금은 테스트가 시계(`now`)를 돌려 확인하고, 청소(`cleanup()`)는 과거 시계로 돌려 지금 떠 있는 방은 건드리지 않는다.

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
| `web` (nginx) | 저장소를 그대로 마운트해 `:8000` 으로 서비스하고 `/api/` 는 `api` 로 넘긴다. 로컬 Data API(`/rest/v1/` → `rest`)는 따로 **`127.0.0.1:54321`** 에만 연다 — `:8000` 에는 없어서 같은 네트워크의 다른 기기가 DB 에 닿지 못한다 |
| `api` (Node 24) | 팀원모집 API. `.env` 를 읽되 Supabase 주소 · 키는 `compose.yaml` 의 로컬 값으로 고정 — 로컬에서 클라우드 DB 를 건드리지 않는다 |
| `db` (supabase/postgres) | Supabase 가 쓰는 Postgres 이미지. 데이터는 `supabase-db` 볼륨 |
| `rest` (PostgREST) | Supabase Data API 와 같은 PostgREST. 로컬 전용 JWT 비밀값 · 키는 `compose.yaml` 에 적혀 있다. `api` 는 `http://web:8080`, 호스트의 스크립트는 `http://localhost:54321` 로 부른다 |

`db` 이미지는 처음 받을 때 크다(디스크 약 1.7GB). 빈 볼륨으로 처음 뜰 때 `supabase/migrations/*.sql` 을 적용하고, 그 뒤로는 다시 돌리지 않는다.
마이그레이션을 새로 추가했으면 `docker compose down -v && docker compose up -d` (로컬 모집 데이터가 지워진다) 또는
`docker compose exec db psql -U postgres -h localhost -d postgres -f /migrations/<파일>`.

파일을 고치고 새로고침하면 바로 반영된다(캐시 끔). `api` 는 `node --watch` 라 `server/*.mjs` 를 고치면 알아서 재시작한다.
`.env` 를 고쳤으면 `docker compose up -d` 를 다시 돌린다. `compose.yaml` 의 nginx 설정을 고쳤으면
`docker compose up -d --force-recreate web` (`up -d` · `restart` 로는 반영되지 않는다). 모집한 방은 3시간이 지나면 지워지고, 당장 비우려면 `docker compose down -v`.

Docker 가 없으면 `python3 -m http.server 8000 --bind 127.0.0.1` 도 되지만(저장소를 통째로 서비스하므로 `.env` 가 있으면 밖에 열지 않는다), 브라우저 캐시 때문에 고친 CSS·JS 가
늦게 보일 수 있고 팀원모집은 API 가 없어 동작하지 않는다.

## 라이선스 / 출처

팬 제작 비공식 도구. 선수 정보와 이미지의 저작권은 NetEase / NBA 등 원저작자에게 있으며,
[공식 홈페이지](https://www.dunkcitymobile.com/kr/)에서 가져온다.
