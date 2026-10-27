# NBA 덩크 시티 한국 서버 도구함

「NBA 덩크 시티」(Dunk City Dynasty) 한국 서버 유저를 위한 팬 제작 정적 사이트.
빌드 도구 없이 HTML + CSS + ES 모듈로만 돌아가며 GitHub Pages에 그대로 올라간다.
팀원모집만 예외로 API 가 Supabase Edge Function 으로 따로 돈다([팀원모집](#팀원모집) 참고).

| URL | 파일 | 설명 |
| --- | --- | --- |
| `/` | `index.html` | 홈 — 맨 위에 **내 프로필**(본계정 · 캐릭터 · 이번 주 아레나 신청 · 배정), 메뉴 카드 네 개(아레나 운영 · 전략·공략 · 영상 자료실 · 마이페이지), 최신 강의, 선수 현황 |
| `/arena/` | `arena/index.html` | **아레나 운영** — 주간 아레나전 참가 신청(시간대 + 내 프로필 계정) · 편성 결과(누구나) · 요일 · 시간대별 참여 그래프 · 편성표 그림 카톡 공유([아레나 운영](#아레나-운영)) |
| `/arena/plan/` | `arena/plan/index.html` | **아레나 편성**(관리자, `noindex`) — 신청한 계정을 시간대별 팀에 끌어서 · 눌러서 배치. `assets/arena.js` 가 주소를 보고 편성만 그린다 |
| `/me/` | `me/index.html` | **마이페이지** — 표시 이름 · 마이크 · 게임 계정(본계정 · 부계정)마다 보유 캐릭터 여러 개 · 아레나 신청 이력 · 카카오 연결 · (관리자) 숨긴 메뉴 · 아레나 출석 현황 · 멤버 관리 · (마스터) 사이트 접근 비밀번호 |
| `/tactics/` | `tactics/index.html` | **전술판** — 하프코트 3:3 배치, 동선 드로잉, 기본 전술 프리셋 14종 + 커스텀 전술(등록 · 좋아요), 재생, 링크 · 카톡 공유 |
| `/tiers/` | `tiers/index.html` | **티어표** — S~D 프리셋에 선수를 드래그, 티어 추가/이름 변경, 링크 공유. 올리면 「모두의 티어표」(`?list`, 최신순 · 추천순) 게시판에 뜨고 추천 · 댓글 · 가져오기([티어표 게시판](#티어표-게시판)) |
| `/combos/` | `combos/index.html` | **조합표** — 선수 3명 조합 게시판. 선수마다 잠재력추천 빌드를 참고로 붙이고, 상대하기 편한/힘든 캐릭터와 조합(3명 세트)을 고른다. 추천 · 댓글([조합표](#조합표)) |
| `/potentials/` | `potentials/index.html` | **잠재력추천** — 빨강 · 초록 · 파랑 30칸 잠재력 빌드 게시판. 추천 캐릭터 · 포지션 필터, 추천 · 댓글(디스코드 · 카카오 로그인). API 는 팀원모집 함수를 같이 쓴다([잠재력추천](#잠재력추천)) |
| `/videos/` | `videos/index.html` | **영상** — 유튜브 링크 게시판. 분류(강의 · 하이라이트 · 공략 · 매드무비 · 기타) · 캐릭터 필터, 추천 · 댓글 · 카톡 공유. 최신 강의는 홈에도 뜬다 |
| `/recruit/` | `recruit/index.html` | **팀원모집**(메뉴에서 숨김 — 마이페이지의 관리자 메뉴에서만 링크, 주소로는 누구나 · `noindex`) — 디스코드 · 카카오 로그인 또는 비회원 · 방 만들기·가입(TNAB 봇과 같은 목록) · 팀장이 팀원 직접 추가, 디스코드 알림 + 빈 음성채널 배정, 카카오톡 공유, 3시간 뒤 자동 삭제 |
| `/slam/` | `slam/index.html` | **슈퍼 슬램**(메뉴에서 숨김 — 마이페이지의 관리자 메뉴에서만 링크, 주소로는 누구나 · `noindex`) — 5:5 풀코트 오락실 농구(1P vs CPU, 3분). 90년대 오락실 농구 느낌만 빌린 새 게임이라 원작 롬 · 그림은 쓰지 않는다. 선수 얼굴은 덩크 시티 선수. 키보드 · 휴대폰 스틱과 버튼. 서버를 쓰지 않는다(`assets/slam.js`) |
| `/discord/` | `discord/index.html` | 카카오 카드의 **디스코드** 버튼이 거쳐 가는 곳. `discord://` 앱 주소로 넘긴다 — `discord.com` 으로 곧장 보내면 브라우저에 세션이 없어 매번 로그인해야 한다. 서버 · 채널은 `data/recruit.json` 의 `discord` 에서 읽는다 |

머리 메뉴는 **홈 · 아레나 운영 · 전략·공략 · 영상 자료실 · 마이페이지** 다. 전략·공략은 전술판 · 티어표 · 조합표 · 잠재력추천 네 페이지를 묶은 메뉴로,
네 페이지 머리 둘째 줄 왼쪽의 하위 메뉴(`.subnav`)로 오간다(`mountTop` 이 `data-group` 에 든 페이지에서 「전략·공략」 을 켠다). 페이지를 새로 만들면 모든 페이지의 `<nav>` 를 같이 고친다.
휴대폰(560px 이하)에서는 표가 가로로 넘치지 않게 칸을 줄인다(`style.css` 끝의 「휴대폰 정리」 — 집계표는 # · 보유 캐릭터 열 대신 이름 아래 작은 줄, 배치 현황은 토1 · ○ 로 짧게).
머리 높이는 모든 페이지 · 로그인 상태에서 같다(PC 90px · 휴대폰 91px) — 둘째 줄(왼쪽 하위 메뉴 · 오른쪽 로그인 이름)은 이름이 아직 없어도 자리를 비워 둔다(`style.css` 의 `.top::before` · `::after`).

### 검색 · 공유 (SEO · 미리보기)

사이트 이름은 **TNAB Vipers** 다(TNAB = 덩크시티 아레나 이름, 예전 이름 NBA덩크시티-TNAB 는 ld+json 의 alternateName 에 남겼다). 제목 · 설명 · Open Graph 태그가
페이지마다 들어 있고, 카카오톡 · 디스코드 · 트위터가 모두 이 태그로 미리보기를 만든다.

```
robots.txt              색인 허용 + /discord/ 제외 + sitemap 위치
sitemap.xml             공개 페이지(팀원모집 · 마이페이지 빼고). 새 페이지를 만들면 여기에도 넣는다
tools/logo.png          사이트 로고 원본 (VIPERS TNAB). 아래 세 장은 tools/og-image.py 가 이걸로 굽는다
assets/og.jpg           1200x630 미리보기 이미지
assets/icon.png         512x512 파비콘 · 홈 화면 아이콘 · 헤더 로고
assets/share/logo.jpg   300x300 카카오 리스트 카드에서 얼굴이 없는 줄(설명 · 작성자)의 썸네일
index.html 의 ld+json   검색 결과의 사이트 이름 (WebSite 구조화 데이터)
```

```sh
tools/cn-faces/.venv/bin/python tools/og-image.py   # 로고를 바꿨으면 이미지를 다시 굽는다
```

이미지를 바꿨으면 각 페이지의 `og:image` · `rel=icon` 뒤 `?v=` 를 올린다. **카카오는 이미지를 URL 기준으로 캐시하므로**
같은 주소로 내용만 바꾸면 한동안 옛 그림이 나간다. 이미 퍼진 링크의 미리보기를 지금 갱신하려면
[카카오 디버거](https://developers.kakao.com/tool/clear/og) 에 주소를 넣어 캐시를 지운다.

**페이지 이동** — SPA 가 아니라 페이지마다 HTML 이다(위 미리보기 · 검색 때문). 대신 두 가지로 이동을 빠르고 부드럽게 한다(지원 안 하는 브라우저는 그냥 평소처럼 연다):
같은 사이트 링크에 마우스를 올리면 다음 페이지를 미리 그려 두고(`assets/app.js` 의 speculation rules, 크롬 · 엣지. `/discord/` 제외),
페이지 사이는 흰 화면 없이 0.18초 겹쳐 넘어간다(`style.css` 의 `@view-transition`, 움직임 줄이기를 켜면 끔).
미리 그리기가 실제로 됐는지는 크롬 DevTools > Application > Speculative loads 에서 본다(자동화 브라우저 · DevTools 를 붙인 상태에서는 크롬이 끈다).

주소에 `.html` 이 드러나지 않도록 디렉터리 + `index.html` 구조를 쓴다.
그래서 페이지가 루트가 아닌 깊이에 있어도 되도록 정적 자원은 전부 **루트 절대경로**(`/assets/...`,
`/data/...`)로 참조한다. `data/*.json` 의 `img` 값도 같은 이유로 `/assets/players/...` 형태다.
사이트를 하위 경로에 올리려면 이 접두사를 바꿔야 한다.

## 선수 데이터

선수 정보와 얼굴 이미지는 **한 곳에서만** 관리하고 모든 페이지가 같이 쓴다.
목록 순서도 모든 페이지가 같다 — 포지션(PG → C) → 화면에 보이는 이름 가나다(`assets/app.js` 의 `loadPlayers`). 파일 안 순서는 상관없다.

```
data/players.json     한국 서버 출시 선수 39명 (자동 생성 — 직접 수정 금지)
data/upcoming.json    미출시 선수 54명, 중국 서버 기준 (직접 관리)
assets/players/*.png  얼굴 이미지 (id.png, 181x180 원형)
assets/share/*.jpg    카카오톡 공유용 얼굴 (300x300, 위 PNG 로 생성 — 얼굴을 바꾸면 다시 만든다)
```

**인게임 표기와 다른 이름** — 공식 홈페이지 라인업과 게임 안 표기가 다른 선수가 있다(클레이 **탐슨** · 유서프 **너키치** · 스티븐 **아담스** · **카메론** 존슨).
`tools/update-players.mjs` 의 `NAME_FIX` 가 인게임 표기(확률 공지 기준)로 고친다. 라인업 페이지가 나중에 같아지면 스크립트가 "NAME_FIX 불필요" 로 알려 주니 그 줄을 지운다.

**인게임에 먼저 나온 선수** — 공식 홈페이지 갱신이 늦어 `update-players` 로는 아직 못 받는 선수는,
`data/upcoming.json` 에서 그 선수의 **`"server": "cn"` 을 `"kr"` 로 바꾸면** 한국 서버 명단에 올라간다.
화면(전술판 · 티어표 · 모집 캐릭터 선택) · 모집 API · TNAB 봇이 모두 이 값을 본다.

```sh
# 1) data/upcoming.json 에서 해당 선수의 server 를 kr 로
tools/cn-faces/.venv/bin/python tools/share-faces.py     # 2) 카카오 공유 얼굴 굽기
npx supabase functions deploy recruit --project-ref lgchgqxjjlapszmxarun   # 3) 함수가 선수 목록을 번들로 들고 있다
# 4) 봇은 재시작(사이트 데이터를 프로세스당 한 번만 읽는다)
```

홈페이지에 오르면 `update-players` 가 `data/players.json` 에 공식 id 로 넣으므로, 그때 `upcoming.json` 에서 그 줄을 지운다(두 곳에 남으면 명단에 두 번 나온다).

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

현재 54명이 들어 있다(2026-10 중국 서버에 새로 나온 마누 지노빌리를 직접 넣고, 게임에서 빠진 에반 포니에는 지웠다). 중국 서버 공식 아트 배포 데이터가 전 캐릭터 95종을 담고 있어,
거기서 한국 서버 39명을 뺀 명단이다. 그 목록에 없는 항목은 `unverified` 로 따로 빼 두었다
(LLM 조사 단계에서 나왔지만 공식 데이터로 확인되지 않은 오리지널 캐릭터 4명).

### 프로필 카드 얼굴 (tools/portraits · 우선)

중국 서버 게임의 선수 프로필 카드(노란 배경 얼굴) 캡처에서 잘라 만든 180x180 원형 얼굴 93장이 `tools/portraits/<id>.png` 에 있다.
`update-players.mjs` · `cn-faces/fetch.mjs` 는 이미지를 받은 뒤 **portraits 에 같은 id 가 있으면 그걸로 덮는다** — 다시 돌려도 이 얼굴이 유지된다.
틀은 옛 한국 공식 얼굴과 같다(흰 테두리 10px + 오른쪽 아래 반투명 파란 그림자). 얼굴을 바꿨으면 카톡 공유 얼굴도 다시 굽고(`tools/share-faces.py`), **카카오가 옛 이미지를 주소로 캐시하므로** `assets/app.js` 의 `SHARE_FACES_VERSION` 과 봇 `tnab/kakao_share.py` 의 같은 이름 숫자를 하나 올린다(`?v=` 가 바뀌어 새 이미지로 받는다).
캡처에는 같은 선수의 스킨 카드(克城之子·詹姆斯 · 风城玫瑰·罗斯)도 있었는데 쓰지 않았다.

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

## 아레나 운영

`/arena/` — 매주 토 · 일 19:30~21:30 아레나전. 규칙은 운영진(집계 담당)의 매뉴얼을 따른다.
시간대는 토 · 일마다 **1차(19:30~20:30) · 1.5차(20:00~종료) · 2차(20:30~종료)** 여섯이고, **토요일 FA · 일요일 FA(그날 시간 미정 · 용병 — 편성 후보에 그날 모든 시간대로 뜬다)** · **사유불참** 을 더 고를 수 있다(여럿 선택. 예전의 요일 없는 FA `flex` 는 `20261027000000_arena_fa_days.sql` 이 토 · 일 FA 둘 다로 바꾼다).
시간대 · 포지션 · 돌파 단계(7) · 팀 인원(3) · 메모 길이는 `data/arena.json` 하나에 있고 API · 화면이 같이 읽는다(고치면 함수도 다시 배포. 시간대 id 는 저장된 신청에 남으니 더하기만 한다).

**계정** — 내 프로필의 게임 계정마다 **계정명**(특수문자 그대로) · **주력 포지션 1 · 2순위**(스코어러 · 중열 · 센터 · 올포, 1순위는 아레나 신청에 필수. **올포**는 셋 다 가능 — 1순위로만 고르고 2순위는 없다, 편성 포지션 필터는 모든 포지션에 걸린다) · **보유 캐릭터(계정마다 제한 없음 — 프로필 전체 `maxEntries` 100개) + 돌파(1~7, 선택)**. 앞 캐릭터가 대표.
**소유자**는 본계(프로필 첫 계정) 닉네임으로 보여 준다. 배경은 어두운 그대로, 색은 강조색(주황) 하나 + 회색만 쓴다(링크도 주황). 카드(팀 · 편성 칸 · 계정 칩 · 내 배정 · 고른 시간대)는 밝은 회색 바탕 · 검은 글자, 뱃지(1팀 · 확정 · 신청 완료 · 1순위 포지션 · 본계정 · 고른 탭/필터)는 흰 바탕 · 검은 글자, 카톡 이미지의 팀 줄도 카드와 같은 밝은 회색 칸 — 시간대 · 포지션 · 계정 수는 글자로 구분한다(편성 칩에 「계정 N」, 집계표에 「계정 수」 열, 1순위 포지션 뱃지는 채움 · 2순위는 테두리).
프로필 줄(`entries`)에 `roles`(계정의 줄마다 같은 값) · `breakthrough`(캐릭터 줄마다)로 저장한다 — 팀원모집의 프로필 폼은 이 칸이 없어 저장할 때 원래 값을 그대로 싣는다.

1. **신청**(로그인) — 페이지에는 신청 상태 요약(편성되면 **내 배정** — 시간대 · 팀 · 내 참가 계정과 본계정 · 같은 팀 팀원의 참가 계정 · 본계정 · 포지션)만 있고 「신청하기 / 신청 수정」 이 **전체 화면 모달**을 연다(✕ · 신청 완료로만 닫힌다 — 바깥을 누르거나 Esc 로는 안 닫힌다. 홈 · 마이페이지의 링크 `/arena/#signup` 은 바로 연다).
   참석 가능한 시간을 여럿 고르고(사유불참은 혼자), 이번 주에 낼 계정을 **내 프로필의 계정 목록**에서 고른다. 여기서 계정을 더하거나 고치면 프로필에 바로 저장된다(마이페이지와 같은 목록).
   처음이면 신청할 때 표시 이름 · 마이크와 함께 프로필도 만든다. 처음 신청할 때 계정 기본값은 지난번에 낸 계정.
2. **편성**(관리자) — 「편성하기」 가 **`/arena/plan/`** 으로 간다(신청 · 결과와 페이지를 나눴다). 계정 칩(주력 포지션 1 · 2순위 뱃지, 소유자의 참가 계정 수, 부계정이면 「본계 ○○」 줄)을 팀 칸에 끌어다 놓거나,
   눌러서 팀을 고른다(메뉴 위에 포지션 · 캐릭터(돌파)). 「자세히 보기」(처음엔 켜짐, 끄면 이 브라우저에 기억)면 칩마다 캐릭터가 펼쳐진다. 맨 아래에는 신청 메모(사유불참은 사유)를 모아 보여 준다. 빈 칸에 놓으면 새 팀. 대기 목록은 시간대 탭(시간대 탭은 그 시간대 + 그날 FA 중 겹치는 시간대에 아직 없는 사람) · **토 FA · 일 FA 탭**(그날 FA 중 안 겹치는 시간대가 아직 남은 사람 — 1차 · 2차를 다 뛰거나 1.5차에 들어가면 빠진다) + **포지션 필터**(전체 · 스코어러 · 중열 · 센터 — 1 · 2순위 중 하나가 그 포지션, 1순위가 먼저)로 거른다.
   **한 사람은 겹치는 시간대에 한 번만**(동시에 두 계정을 못 하니까) — 1.5차는 같은 날 1차 · 2차와 겹치고, 1차와 2차는 안 겹친다.(서버 · 화면이 `data/arena.json` 의 시각으로 같이 판단). 팀은 3명까지.
   바꿀 때마다 저장하고, 그새 다른 관리자가 저장했거나 신청이 바뀌었으면(409) 새로 불러온다. 대기 목록은 PC 에서 위에 붙어 있어(sticky) 아래 시간대로 스크롤하며 끌 수 있다(휴대폰은 눌러서 고르니 붙이지 않는다).
3. **결과**(누구나) — 요약(참가 신청 · 배정 완료 · 대기 · 참가 계정) · **집계표** · 팀별 편성 명단(시간대 탭) · 멤버별 배치 현황(계정 × 시간대).
   집계표는 신청 시간대별로 **사람마다 한 줄(본계정)** — **참가 계정 수 많은 순 → 1순위 포지션(스코어러 > 중열 > 센터) → 본계정 닉네임(가나다 · 영문)**(`byOwner` · `byTally`, 편성의 대기 목록은 계정 단위로 같은 순서).
   부계정은 「상세」 로 펼친다 — 최종 명단은 팀별 편성 명단이다. 사유불참은 사유. **이번 주 미신청**(프로필은 있는데 신청이 없는 사람의 본계정 닉네임)은 따로 번호 붙은 표로.
   맨 아래 **요일 · 시간대별 참여** 막대 — 참가 신청한 사람(사유불참 빼고) 중 그 시간대를 고른 비율 · 사람 수 · 계정 수, 요일마다 그날 하나라도 고른 비율. 그 아래 **포지션 · 캐릭터 비율** — 이번 주 참가 계정 기준, 포지션은 1순위 도넛(합이 100% 라서 — 강조색을 차례로 옅게, 미정은 회색), 캐릭터는 막대로 계정마다 고른 주력 캐릭터(얼굴 · 많은 순).
   지난 주는 ◀ 로 본다(보기만). 마이페이지에는 내 신청 이력과 배정이 남는다.
   관리자는 마이페이지 **아레나 출석 현황**에서 멤버마다 **N주 연속 참석 · N주째 미참석**을 본다 — 출석 = 그 주 참가 신청(사유불참 빼고), 이번 주에 아직 신청 전이면 지난주까지로,
   가입한 주 · 아레나 신청을 받기 시작한 주 앞은 미참석으로 세지 않는다(`GET /api/members` 의 `attend`).
4. **카톡 공유** — 편성표를 캔버스로 그려(`drawPlan`) `Kakao.Share.uploadImage` 로 카카오에 올리고, 그 그림을 넣은 피드 카드(「편성표 보기」 버튼)를 보낸다.
   올리는 데 시간이 걸려 PC 는 버튼을 한 번 더 눌러 보낸다(기다린 뒤 열면 팝업이 막힌다). 「이미지 저장」(휴대폰은 「이미지 공유」 — 공유창에서 카카오톡을 고르면 사진으로 간다)도 있다.
5. **엑셀 저장** — 편성 페이지 위 버튼(관리자만). 편성 명단을 계정 한 줄(시간대 · 일시 · 팀 · 팀장 · 닉네임 · 본계정 · 포지션 · 캐릭터)로 CSV 로 받는다(`saveExcel`).
   BOM 을 붙여 엑셀이 한글을 그대로 읽고, `= + - @` 로 시작하는 닉네임은 수식으로 실행되지 않게 앞에 `'` 를 붙인다.
6. **팀장** — 그 팀에 처음 넣은 계정(팀 배열의 맨 앞)이 팀장이다. 팀장을 빼면 다음 사람이 팀장이 된다. 팀 카드 · 편성 칩은 오른쪽 위 귀퉁이에 주황 「팀장」 라벨,
   내 배정은 이름 옆 뱃지, 카톡 이미지는 얼굴 아래 뱃지, 엑셀은 「팀장」 열.

**관리자** = `site_admins` 에 있는 계정 + 마스터(`site_masters` = **슈퍼관리자**, 갓보노). 관리자는 마이페이지의 **멤버 관리**에서
멤버(프로필을 등록한 사람)를 **관리자로 임명 · 일반 멤버로 변경 · 탈퇴**시킨다. 슈퍼관리자는 등급을 바꾸거나 탈퇴시킬 수 없고, 본인도 못 바꾼다(서버가 막는다).
탈퇴 = 관리자 권한 · 프로필(게임 계정 · 아레나 신청 · 팀원모집 자리는 cascade)을 지우고 팀장이던 모집 팀은 해제 — 다시 로그인하면 새로 가입할 수 있다(차단은 없다).
슈퍼관리자는 화면이 없다 — `site_masters` 를 SQL 로. 관리자도 SQL Editor 에서 표시 이름으로 넣고 뺄 수 있다:

```sql
insert into public.site_admins (user_id, note) select discord_user_id, discord_name from public.recruit_profiles where discord_name = '<표시 이름>';
delete from public.site_admins where user_id = '<디스코드 ID 또는 k카카오번호>';
```

**저장** — `arena_signups`(주 · 사람마다 한 줄: 시간대 · 계정 닉네임 · 메모)는 계정을 **게임 닉네임으로만** 가리키고 캐릭터 · 표시 이름은 읽을 때 프로필에서 가져온다.
그래서 프로필을 고치면 신청에도 바로 보이고, 프로필에서 계정을 지우거나 **닉네임을 바꾸면 그 계정은 신청 · 편성표에서 빠진다**(아레나 화면에서 바꾸면 고른 상태는 따라간다).
`arena_plans` 는 주마다 편성표 하나(`{ 시간대: [[{ u: 사용자 ID, n: 닉네임 }]] }`). 주 = 그 주 토요일 날짜(KST)이고 **일요일 21:30 이 지나면 다음 주**다(`arenaWeek`).

| 요청 | 권한 | 결과 |
| --- | --- | --- |
| `GET /api/arena?w=YYYY-MM-DD` | – | `{ week, current, signups: [{ userId, name, owner, slots, memo, accounts: [{ nick, roles, chars, bt: { 캐릭터: 돌파 } }] }], plan, planAt, missing }` — `w` 없으면 이번 주. `owner` = 본계 닉네임, `missing` = 프로필은 있는데 이번 주 신청이 없는 본계 닉네임 |
| `PUT /api/arena/signup` | 로그인(프로필 필요, 없으면 428) | `{ slots, nicks, memo? }` 이번 주 신청 · 수정 → `{ week, signup }`. 고른 계정에 1순위 포지션이 없으면 400 |
| `DELETE /api/arena/signup` | 로그인 | 이번 주 신청 취소 |
| `PUT /api/arena/plan` | 관리자 | `{ week, version: 읽어 온 planAt, plan }` → `{ plan, planAt }`. 이번 주만 · 버전이 다르거나 신청 안 한 계정이면 409 · 겹치는 시간대에 같은 사람이면 400. 10분에 300번(끌 때마다 저장) |
| `GET /api/arena/mine` | 로그인 | 최근 10주 내 신청 + 배정 `{ history: [{ week, slots, nicks, memo, assigned: [{ slot, team, nick }] }] }` |
| `GET /api/members` | 관리자 | `{ members: [{ userId, name, main(본계정), accounts, role: master\|admin\|member, lastWeek, attend: { now: in\|absent\|null, streak, missed, total }, updatedAt }] }` — 슈퍼관리자 → 관리자 → 멤버, 각각 본계정 순(최근에 고친 1000명) |
| `PUT /api/members/:id` | 관리자 | `{ role: admin\|member }` 임명 · 해제. 슈퍼관리자 403 · 본인 400 |
| `DELETE /api/members/:id` | 관리자 | 탈퇴(위). 슈퍼관리자 403 · 본인 400 |

`GET /api/me` 는 `admin`(관리자 여부)을 같이 준다.

**처음 운영에 올릴 때** (순서대로 — 함수가 `site_admins` 를 읽고, 새 화면은 티어 없는 프로필을 보낸다)

1. `20261023000000_arena.sql` 을 SQL Editor 에 붙여 넣어 Run → 위 SQL 로 관리자를 넣는다.
2. Supabase **Authentication > URL Configuration > Redirect URLs** 에 `https://nba-kor.github.io/` · `https://nba-kor.github.io/arena/` · `https://nba-kor.github.io/arena/plan/` · `https://nba-kor.github.io/me/` · `https://nba-kor.github.io/slam/` 추가(로그인은 누른 페이지로 돌아온다).
3. `sh tools/deploy-api.sh` → `node tools/stamp-assets.mjs` → main 푸시.

## 팀원모집

> 2026-10 부터 메뉴에서 숨겼다(지우지 않음). 마이페이지의 관리자 메뉴에서만 링크하고, 주소로는 누구나 들어온다. 「내 프로필」 은 이제 마이페이지가 본판이고 팀원모집의 프로필 폼도 같은 프로필을 고친다.

`/recruit/` — 3:3 이라 팀장 포함 3명이 한 팀이다. **웹 화면과 TNAB 디스코드 봇이 같은 파티 목록을 쓴다** — 웹에서 만든 팀에 봇으로 가입하거나 그 반대도 된다.
규칙 · 검증 · 권한 · 알림은 전부 Edge Function 한 곳(`server/index.mjs`)에 있다.

1. **디스코드 · 카카오로 로그인**하거나 **비회원**으로 쓴다(Supabase Auth, [카카오 로그인 · 비회원](#카카오-로그인--비회원)). 봇은 디스코드 계정 그대로 쓴다.
   계정이면 신원 = 그 계정이라 비밀번호가 없고, 비회원만 팀마다 관리 비밀번호를 쓴다.
2. **내 프로필**을 한 번 등록한다: 캐릭터 1~100줄(`data/recruit.json` 의 `maxEntries`, 줄 = 게임 닉네임 · 캐릭터 · 티어(선택, 이제 안 받는다)) + 개인 마이크 O/X. 같은 닉네임 줄들이 한 계정이고 첫 줄 캐릭터가 대표다.
   마이페이지는 이 줄을 계정(본계정 · 부계정)마다 캐릭터 여러 개로 묶어 보여 준다(`assets/profile.js` — 저장 모양은 그대로).
   **표시 이름**(로스터 · 알림 · 카톡 카드에 보이는 이름)은 **디스코드 서버 별명**으로 채워진다 — 같은 서버 사람들은 별명으로 서로를 알기 때문이다.
   봇은 `interaction` 에서 별명을 그대로 보내고, 웹은 로그인이 계정 이름만 알려 줘서 함수가 봇 토큰으로 별명을 한 번 읽는다(워커마다 10분 기억, 없으면 계정 이름).
   그 뒤로는 본인이 프로필에서 고칠 수 있고, 한 번 고치면 디스코드 이름이 바뀌어도 봇으로 프로필을 저장해도 그대로 남는다.
   프로필을 고치면 들어가 있는 파티에도 바로 반영된다.
3. **팀장**이 방을 만든다 — 방 제목(선택) · 마이크 **필수 / 듣코가능 / 필요없음** · 즐겜/빡겜 · 메모(선택, 줄바꿈 가능) · 전술(선택).
4. API 가 팀을 저장하고 **빈 음성채널을 끝 방부터** 하나 잡아, 디스코드 웹훅으로 "모집 시작" + 음성채널 링크를 보낸다.
   알림 제목은 방 제목(없으면 전술 이름), 첫 줄은 `🎙️ 마이크 필수 · 빡겜 · 전술 픽 앤 롤`, 팀원 줄은 `**이름** (골드) · PG 라멜로 볼 외 2개 · 마이크 O`, 메모는 따로 붙는다.
5. 팀장이 **카카오톡 공유**로 카톡방에 링크를 뿌린다. 리스트 메시지로, 제목은 `🟢 방 이름 · 1/3 모집 중`(다 차면 `✅ … · 매칭 완료`),
   항목마다 왼쪽에 `👑 닉네임`(계정이 여럿이면 `+2`)과 `SG · 전성기 · 마이크 O`, 오른쪽에 대표 캐릭터 얼굴, 남은 자리는 `빈 자리`로 채운다.
   버튼은 **웹사이트**(이 팀 화면)와 **디스코드**(`/discord/` 를 거쳐 앱의 #매칭-현황) 둘. **TNAB 봇이 카톡방에 자동으로 보내는 카드와 같은 모양이다** —
   `assets/recruit.js` 의 `kakaoPayload` 와 봇의 `tnab/kakao_share.py` `build_party_share_options` 중 한쪽만 고치면 같은 팀이 두 가지로 보인다.
6. **팀원**이 링크로 들어오면(로그인 없이도 볼 수 있다) 방 정보 · 전술 설명 · 전술 애니메이션 · 로스터를 보고 버튼 하나로 가입한다.
   가입할 때마다 디스코드 알림, 3명이 차면 "모집 완료" 알림에서 **그 파티원 3명만 멘션**한다.

**1인 1파티** — 한 사람(계정)은 한 팀에만 있을 수 있다(DB 의 `unique(discord_user_id)`. 비회원은 계정이 없어 걸리지 않는다). 다른 팀을 만들거나 가입하면 기존 팀에서 자동으로 빠지고,
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
- 팀원: `{ userId, name, mic: boolean | null, entries: [{ nick, tier, char }], leader, joinedAt, kind: user|guest|added }` — 팀장 먼저, 들어온 순.
  `userId` 는 디스코드 ID · `k<카카오 회원번호>`(카카오로만 로그인한 계정) · `g<번호>`(비회원 `guest` · 팀장이 넣은 팀원 `added`). `added` 는 `mic: null` · `tier: ''` 일 수 있다
- 프로필: `{ userId, name, mic, entries, updatedAt }`
- `left`: `null` 또는 `{ teamId, disbanded }` — 1인 1파티로 빠진 기존 팀(`disbanded` = 팀장이라 해제됨)

| 요청 | 권한 | 결과 |
| --- | --- | --- |
| `GET /api/health` | – | `{ ok, voice, login }` — `voice` 는 디스코드 봇 토큰 · 서버 ID, `login` 은 publishable key 가 있는지 |
| `GET /api/gate?g=<토큰>` | – | `{ on, ok }` — 접근 비밀번호가 켜져 있는지 · 그 토큰이 아직 맞는지 |
| `POST /api/gate` | – | `{ code }` → `{ token }`(꺼져 있으면 `null`). 틀리면 403, 한 IP 가 10분에 10번 틀리면 429 |
| `PUT /api/gate` | 마스터 | `{ code }`(4~32자) → `{ code, token, changedAt }` — 바꾸면 토큰이 새로 생겨 모두 다시 입력한다 |
| `GET /api/teams` | – | 만료 전 방, 모집 중 → 다 찬 순, 각각 오래된 순, 최대 100개 |
| `GET /api/teams/:id` | – | 팀. 없거나 만료 → 404 |
| `GET /api/me` | 로그인 | `{ user: { id, name }, profile \| null, teamId \| null }` |
| `DELETE /api/me` | 로그인 | 본인 탈퇴 → `{ ok }`. 사이트 데이터(멤버 관리의 탈퇴와 같다) → 카카오 연결 끊기 → Supabase Auth 사용자 삭제(관리 API, secret key). 슈퍼관리자 403 · 봇 400 · Auth 실패 503(다시 누르면 된다) |
| `DELETE /api/me/kakao` | 로그인 | 디스코드 계정에 붙인 카카오 떼기 → `{ ok }`. Auth 신원 삭제(본인 토큰) → 카카오 연결 끊기. 카카오만 있는 계정 · 카카오가 없으면 400 |
| `PUT /api/me/profile` | 로그인 | `{ mic, entries, name? }` → `{ profile }`. `name` 은 표시 이름(1~32자). 안 보내면 저장된 이름을 그대로 두고, 프로필이 없으면 디스코드 이름으로 채운다 |
| `POST /api/teams` | 로그인 · 비회원 | `{ room: { title?, mic, mode, memo? }, tactic }` → 201 `{ team, left }`. 프로필이 없으면 428. 비회원은 인증 헤더 없이 `guest: { name, mic, entries }` · `password`(4~32자)를 더 보내고 `member`(`g<번호>`)를 받는다 |
| `POST /api/teams/quick` | 로그인 | 가장 오래된 모집 중 팀(내 팀 제외)에 가입 → 201 `{ team, left }`. 없으면 404 |
| `POST /api/teams/:id/members` | 로그인 · 비회원 | 본인 가입(본문 없음) → 201 `{ team, left }`. 없거나 만료 404 · 다 참 · 이미 이 팀 409 · 프로필 없음 428. 비회원은 만들기와 같은 `guest` · `password` → `member` |
| `POST /api/teams/:id/members` `{ add: { nick, char, tier? } }` | 팀장(비회원 포함) | 팀원 직접 추가(계정과 잇지 않음, `kind: added`) → 201 `{ team }` |
| `GET /api/profiles?q=` | 로그인 · 비회원 | 직접 추가 자동완성 — 표시 이름 · 대표 게임 닉네임에 `q` 가 들어간 프로필 8개 `{ profiles: [{ name, entries }] }` |
| `DELETE /api/teams/:id/members/:userId` | 본인 = 나가기, 팀장 = 방출 | `{ ok: true, team }`. 팀장이 대상이면 해제되고 `team: null` |
| `DELETE /api/teams/:id` | 팀장, 봇 + `X-Discord-Admin: 1` | 팀 해제(삭제) → `{ ok: true }` |
| `POST /api/teams/:id/extend` | 팀장 | 만료 = 지금 + 3시간 → `{ team }` |
| `PUT /api/teams/:id` | 팀장 | `{ room, tactic? }` 팀 정보 수정 — 방 설정은 통째로, 전술은 보냈을 때만(`null` = 전술 자유). 팀원 · 음성채널 · 남은 시간은 그대로 → `{ team }` |
| `PUT /api/teams/:id/members/:userId` | 본인 | `{ entry }` 참가 캐릭터 바꾸기(프로필 몇 번째 줄) → `{ team }` |

**신원**은 세 가지다. 없거나 틀리면 401 「로그인해 주세요」.

- **웹**: `Authorization: Bearer <Supabase access token>`. 함수가 `GET ${SUPABASE_URL}/auth/v1/user`(publishable key)로 확인하고,
  ID 는 `identities` 에서만 꺼낸다 — `discord` 가 있으면 디스코드 ID, 없고 `kakao` 만 있으면 `k<카카오 회원번호>`. `user_metadata` 는 사용자가 고칠 수 있어 ID 로 쓰지 않는다
  (카카오 계정의 표시 이름 `user_metadata.nickname` 에만 쓴다). 둘 다 없는 계정은 401,
  Auth 가 응답하지 않으면 503 「로그인 서버에 연결할 수 없어요」. 확인 결과는 워커마다 토큰 해시로 60초 기억한다(로그아웃한 토큰도 최대 60초는 통한다).
- **봇**: `Authorization: Bot <TNAB_BOT_KEY>` + `X-Discord-User: <17~20자리 ID>` + `X-Discord-Name: <퍼센트 인코딩한 UTF-8, 1~80자>` + 선택 `X-Discord-Admin: 1`.
  키가 맞으면 헤더의 ID 를 믿는다. 서버 키가 32자보다 짧거나 없으면 봇 인증은 꺼진다. ID · 이름 형식이 틀리면 400.
- **비회원**: `Authorization: Guest g<번호>:<퍼센트 인코딩한 비밀번호>`. 그 팀원 행의 scrypt 해시와 맞으면 그 팀원이다 — 자기 팀 안의 일(관리 · 나가기 · 자동완성 · `GET /api/me` 로 비밀번호 확인)만 되고
  프로필 · 게시판은 401. 틀리면 403, 한 IP 가 한 팀원에 5번 · 그 팀원 전체로 20번(10분) 틀리면 429.

PUT · POST · DELETE 는 신원을 확인한 뒤 **한 사람(계정 · 비회원 팀원) 당 10분에 30번**까지다(웹 · 봇 합산, 넘으면 429). 비회원 만들기 · 가입은 IP 당 같은 수.
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
.github/workflows/db-backup.yml       매일 자정(KST) DB 전체 백업 — 암호화해 Actions 아티팩트로 30일
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
| `DISCORD_BOT_TOKEN` | 음성채널 목록과 **서버 별명**을 읽을 봇 토큰 |
| `DISCORD_GUILD_ID` | 디스코드 서버 ID. 봇 토큰과 둘 다 있어야 음성채널을 배정한다 |
| `DISCORD_VOICE_CATEGORY_ID` | 이 카테고리 안의 음성채널만 배정. 비우면 서버의 모든 음성채널 |
| `KAKAO_ADMIN_KEY` | 카카오 앱의 **어드민 키**(카카오 디벨로퍼스 > 앱 > 앱 키). 탈퇴 · 카카오 연결 해제 때 카카오 쪽 「연결 끊기」에 쓴다. 비우면 그 단계만 건너뛴다(함수 로그). 서버에만 — 화면 · 저장소에 두지 않는다 |

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
   **Authentication > URL Configuration** 의 Site URL 은 `https://nba-kor.github.io/recruit/`, Redirect URLs 에 `https://nba-kor.github.io/recruit/` · `https://nba-kor.github.io/potentials/` · `https://nba-kor.github.io/videos/` · `https://nba-kor.github.io/tactics/` · `https://nba-kor.github.io/tiers/` · `http://localhost:8000/recruit/` · `http://localhost:8000/potentials/` · `http://localhost:8000/videos/`
   (로그인은 누른 페이지로 돌아온다 — `assets/auth.js`. 목록에 없는 페이지는 Site URL 로 떨어진다).
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

   `sh tools/deploy-api.sh` 가 같은 일을 한다(`.env` 의 토큰을 읽고, 끝나면 `/api/health` 를 찍는다).

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
- **무료 플랜은 자동 백업이 없다** — 아래 [DB 백업](#db-백업) 워크플로가 매일 받아 둔다.

### DB 백업

`.github/workflows/db-backup.yml` 이 매일 자정(KST 00:05)에 DB 를 통째로(역할 `roles.sql` · 스키마 `schema.sql` · 데이터 `data.sql`, `supabase db dump`) 받아
`db-<날짜>.tar.gz.gpg` 로 암호화해 **Actions 아티팩트로 30일** 둔다. Actions 탭 > db-backup > **Run workflow** 로 바로 한 번 돌릴 수도 있다.
저장소가 공개라 아티팩트는 GitHub 에 로그인한 누구나 받을 수 있다 — 그래서 암호화한 파일만 올린다(디스코드 ID · 이름 · 게임 닉네임이 들어 있다).
Storage 의 파일(그림 등)은 DB 가 아니라 들어가지 않는다.

처음 한 번, 저장소 **Settings > Secrets and variables > Actions > New repository secret** 으로 두 개를 넣는다:

| 이름 | 값 |
| --- | --- |
| `SUPABASE_DB_URL` | 대시보드 상단 **Connect** > **Session pooler** 의 연결 문자열(`postgresql://postgres.lgchgqxjjlapszmxarun:<DB 비밀번호>@aws-….pooler.supabase.com:5432/postgres`). 직접 연결(`db.….supabase.co`)은 IPv6 전용이라 GitHub 러너에서 안 붙는다. DB 비밀번호를 모르면 **Database > Settings** 에서 새로 정한다(함수는 DB 비밀번호를 안 쓰니 바꿔도 된다) |
| `BACKUP_PASSPHRASE` | 백업을 잠그는 긴 비밀번호(`openssl rand -base64 24`). **저장소 밖(비밀번호 관리자)에도 적어 둔다 — 잃으면 백업을 못 푼다** |

복원 — 실행 화면의 **Artifacts** 에서 받은 zip 을 풀고(저장소 밖에서. 로컬 nginx 가 저장소 루트를 통째로 서비스한다), 비밀번호를 넣어 연 뒤 새 프로젝트(또는 비운 DB)에 넣는다:

```sh
gpg -d db-2026-10-27.tar.gz.gpg | tar xz        # BACKUP_PASSPHRASE 를 묻는다 → roles.sql · schema.sql · data.sql
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' --file data.sql \
  --dbname '<새 프로젝트의 Session pooler 연결 문자열>'
```

손으로 한 번 더 받아 두고 싶으면 이 PC 에서 같은 명령을 `--db-url '<연결 문자열>'` 로 돌린다(`npx supabase db dump --db-url … -f roles.sql --role-only` 등 워크플로의 세 줄).

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

### 서브 캐릭터로 참가

프로필에 캐릭터가 2줄 이상이면 팀 만들기 · 가입 카드에 「참가 캐릭터」 버튼(대표 / 서브 / 부계정)이 나온다. 고른 줄 번호가
`POST /api/teams` · `POST /api/teams/<id>/members` 의 `{ entry }` 로 가고 `recruit_members.entry` 에 저장된다(안 보내면 0 = 대표 — 봇 · 옛 화면).
API 가 팀을 보여 줄 때 그 줄을 `entries` 맨 앞으로 옮기므로 웹 · 디스코드 알림 · 카톡 카드 · TNAB 봇은 고칠 곳 없이 고른 캐릭터를 보여 준다.
프로필에서 그 줄을 지우면 대표로 보인다.
모집 상세의 로스터는 팀원마다 참가 캐릭터 하나만 보이고, 나머지는 「캐릭터 N개 보기」 모달로 연다. 참가 캐릭터 고르기도 같은 모달이다.
**TNAB 봇의 `tnab/service.py` `MAX_ENTRIES`(3)** 는 봇에서 대표를 바꿀 때 나머지 줄을 그 수로 자른다 — `maxEntries` 를 바꾸면 봇도 같이 올린다. 마이그레이션 `20261001000000_recruit_entry.sql` 을 **함수 배포보다 먼저** 넣는다(팀 조회가 entry 칸을 읽는다).

### 카카오 로그인 · 비회원

**카카오 로그인** — 머리의 「로그인」 이 디스코드 · 카카오를 고르는 창을 연다(`assets/auth.js` 의 `chooseLogin`, 게시판도 같다). 카카오톡 인앱 브라우저에서도 카카오 로그인은 바로 된다
(디스코드만 평소 쓰는 브라우저로 넘긴다). 카카오로만 로그인한 계정의 ID 는 `k<카카오 회원번호>` 이고, **처음 로그인할 때 닉네임을 한 번 묻는다** — 카카오 닉네임은 대개 실명이라 쓰지 않고,
입력한 이름을 `user_metadata.nickname` 에 둔다(취소하면 「카카오 사용자」, 다음에 또 묻는다). 팀원모집 프로필의 표시 이름이 있으면 그것이 먼저다.

**카카오 연결** — 디스코드로 로그인한 사람은 마이페이지(또는 팀원모집 「내 프로필」)의 「카카오 로그인 연결」 로 같은 계정에 카카오를 붙인다(`linkIdentity`). 그 뒤로는 카카오로 들어와도
디스코드 ID 그대로라 프로필 · 파티 · 글 · 봇이 이어진다. 그 카카오로 따로 로그인해 만든 계정이 이미 있으면 Supabase 가 거절하고 이유가 뜬다.
반대(카카오 계정에 디스코드 붙이기)는 화면에 없다 — ID 가 디스코드로 바뀌어 카카오 때의 프로필 · 글과 끊기기 때문이다.
마이페이지 「로그인 연결」 의 **카카오 연결 해제** 로 붙인 카카오를 뗀다(`DELETE /api/me/kakao`) — 그 뒤 카카오로 로그인하면 따로 새 계정이다. 디스코드는 같은 이유로 못 떼고, 카카오로만 쓰는 계정은 탈퇴로.

**탈퇴** — 마이페이지 맨 아래 「회원 탈퇴」(「탈퇴」 를 쳐야 한다, `DELETE /api/me`). 프로필 · 게임 계정 · 아레나 신청 · 팀원모집 자리 · 관리자 권한을 지우고 이끌던 팀은 해제,
카카오가 있으면 카카오 「연결 끊기」(`KAKAO_ADMIN_KEY`), 마지막으로 Supabase Auth 사용자(디스코드 · 카카오 신원 · 이메일)를 지운다. 게시판 글 · 댓글 · 추천은 남는다(화면에 적어 둔다).
슈퍼관리자는 못 한다 — `site_masters` 에서 먼저 뺀다. 감사 로그는 남는다(누가 탈퇴했는지).

**비회원** — 로그인하지 않으면(로그인 모듈을 못 불러왔을 때도) 「비회원 프로필」 을 쓴다: 표시 이름 · 마이크 · 캐릭터 줄 · **관리 비밀번호(4~32자)** 를 이 브라우저 localStorage(`dc.recruit.guest`)에만 둔다.
만들기 · 가입 때 서버로 보내 팀원 행(`recruit_members.guest`)에 복사하고 비밀번호는 scrypt 해시(`pw_hash`)만 남긴다. 응답의 `g<번호>` 와 비밀번호를 `dc.recruit.guestTeams` 에 팀마다 두어
그 기기에서는 다시 묻지 않고, **다른 기기**(카톡 인앱 브라우저 포함)에서는 로스터의 「본인 확인」 에 비밀번호를 넣으면 관리 칸이 열린다.
비회원은 1인 1파티 · 프로필 연동 · 모집 완료 멘션 · 게시판 쓰기가 없다. 프로필을 고쳐도 이미 들어간 팀에는 반영되지 않는다(가입할 때의 복사본). 참가 캐릭터 바꾸기도 계정만 — 나갔다 다시 들어온다.

**팀원 직접 추가** — 팀장(비회원 팀장 포함) 관리 칸의 「팀원 직접 추가」 로 게임 닉네임 · 캐릭터(+ 티어)만 넣는다. 닉네임을 치면 `GET /api/profiles?q=` 로 가입된 프로필이 목록에 뜨고,
고르면 캐릭터 · 티어가 채워진다. **계정과 잇지 않는다** — 그 사람이 나중에 직접 가입하면 두 줄이 되니 팀장이 이 줄을 방출한다. 마이크는 모르므로 `null`(로스터 · 알림 · 카톡 카드에서 빠진다).

**TNAB 봇** — 팀원 `userId` 가 숫자가 아닐 수 있고(`k…` · `g…`), `mic` 이 `null` · `tier` 가 `''` 일 수 있다. 봇은 숫자면 int, 아니면 문자열 그대로 받는다(`tnab/service.py` `_member_id`).
**봇을 먼저 올린다** — 옛 봇은 `int(userId)` 에서 터져, 비회원이 낀 팀이 하나만 있어도 목록을 못 읽는다.

**처음 운영에 올릴 때** (순서대로)

1. [Kakao Developers](https://developers.kakao.com) — 사이트 공유에 쓰는 같은 앱에서 **카카오 로그인**을 켜고, **앱 > 플랫폼 키 > REST API 키**의 **카카오 로그인 리다이렉트 URI** 에
   `https://lgchgqxjjlapszmxarun.supabase.co/auth/v1/callback` 을 넣는다. **카카오 로그인 > 보안**(Client Secret)을 만들어 켠다.
   **동의항목**은 받아 쓰는 게 없어 **필수는 하나도 없다**(신원은 늘 오는 회원번호, 닉네임은 사이트에서 따로 받는다).
   다만 Supabase 가 scope 에 `account_email profile_image profile_nickname` 을 고정으로 넣고(사이트에서 뺄 수 없다),
   카카오는 '사용 안함' 인 항목이 scope 에 있으면 KOE205 로 막는다 — 세 개 모두 **선택 동의**로 둔다.
   이메일은 비즈 앱만 켤 수 있으니 앱을 비즈 앱으로 바꾼다(개인 개발자 비즈 앱, 사업자번호 없이 된다). 사용자가 다 체크 해제해도 로그인은 된다.
2. Supabase **Authentication > Sign In / Providers > Kakao** 를 켜고 REST API 키(Client ID) · Client Secret 을 넣고 **Allow users without an email** 을 켠다.
   같은 화면의 **Allow manual linking**(카카오 연결)도 켠다. Redirect URLs 는 그대로(페이지 목록이 같다).
3. 마이그레이션 `20261016000000_kakao_guests.sql` 을 SQL Editor 에 붙여 넣어 Run(사용자 ID 형식 · 비회원 칸 · 만들기/가입 RPC). 옛 함수도 이 스키마로 그대로 돈다.
4. TNAB 봇을 돌리고 있으면 새 코드로 먼저 다시 띄운다(옛 봇은 비회원 · 카카오 팀원이 낀 팀에서 목록을 못 읽는다). 2026-10 부터는 봇을 쓰지 않는다.
5. `sh tools/deploy-api.sh` → `node tools/stamp-assets.mjs` 후 main 푸시.

### 접근 비밀번호

사이트에 들어오려면 비밀번호를 한 번 넣는다. 맞히면 그 브라우저에 토큰을 두고 다음부터는 묻지 않는다 —
마스터가 비밀번호를 바꾸면 토큰도 바뀌어 다시 묻는다(화면은 하루에 한 번 서버에 확인하고, 그 사이에도 API 가 옛 토큰을 거절하면 바로 묻는다).

- **켜고 바꾸기**: 마스터 계정으로 로그인 → 마이페이지의 「사이트 접근 비밀번호」. 직접 쓰거나 「랜덤 생성」(숫자 6자리) → 「바꾸기」.
  지금 비밀번호도 거기서 보고 복사한다(회원끼리 나눠 쓰는 공용 비밀번호라 해시하지 않고 그대로 둔다). 처음 정하기 전에는 꺼져 있다.
- **마스터 추가 · 빼기**: 화면은 없다. SQL Editor 에서
  `insert into public.site_masters (user_id, note) values ('<디스코드 ID 또는 k카카오번호>', '<누구>');` / `delete from public.site_masters where user_id = '…';`
- **끄기**: `delete from public.site_gate;` (함수 워커는 이 줄을 30초 기억한다).
- **막는 범위**: API(모집 · 게시판 · 프로필)는 서버가 막는다 — 켜져 있으면 모든 요청이 `?g=<토큰>` 을 싣고, 없거나 틀리면 401 `{ gate: true }`.
  화면은 HTML 머리의 한 줄 스크립트가 토큰 없는 브라우저를 가리고 `assets/auth.js` 가 비밀번호 창을 띄운다.
  **GitHub Pages 라 HTML · JS · `data/*.json` · 이미지는 주소만 알면 누구나 받는다**(저장소도 공개) — 완전히 막으려면 로그인이 붙는 호스팅으로 옮겨야 한다.
  서버에 닿지 않으면 화면은 연다(정적 화면은 서버 없이도 돈다).
- 처음 운영에 올릴 때: `20261017000000_site_gate.sql` 을 SQL Editor 에서 Run(마스터 갓보노가 같이 들어간다) → `sh tools/deploy-api.sh` → main 푸시 →
  마스터가 「내 프로필」 에서 비밀번호를 정한다(그 전까지는 꺼져 있다). 함수를 먼저 올리면 `site_gate` 가 없어 모든 API 가 503 이다.

### 감사 로그

사이트에서 무언가를 바꾼 요청(GET 이 아니고 성공한 것)은 함수가 응답한 뒤 `audit_log` 표에 한 줄씩 남긴다(`server/index.mjs` 의 `audit` 한 곳).

| 칸 | 내용 |
| --- | --- |
| 누가 | `user_id`(디스코드 ID · `k`카카오 · `g`비회원 팀원) · `user_name`(그때 이름). 로그인 없이 하는 비회원 팀 만들기 · 가입은 비어 있다 |
| 언제 | `at`(ms) |
| 무슨 일 | `label` 한글 이름(예 「아레나 편성 저장」 · 「잠재력추천 댓글 삭제」, `auditLabel`) · `action` 메서드 경로(예 `PUT /api/arena/plan`) |
| 무엇에 | `target` — 글은 `#번호 제목`, 멤버 관리는 그 사람 이름, 아레나는 `2026-10-31 주`, 프로필은 표시 이름 |
| 바뀐 내용 | `detail` 줄 목록(60줄까지) — 프로필: 표시 이름 · 마이크 · 본계정 · 계정 추가 · 삭제 · 계정마다 포지션 · 캐릭터 +/− · 대표 캐릭터 · 돌파(`profileChanges`). 아레나 신청: 시간 · 계정 · 메모 전 → 후(`signupChanges`). 편성: 계정마다 「토 1차 1팀 → 토 1.5차 2팀」 · 「+넣음」 · 「−뺌」(`planChanges`). 멤버 등급: 「멤버 → 관리자」. 글 수정: 제목 · 캐릭터 · 내용 · 그 밖의 칸, 남의 글이면 「○○ 님의 글」. 댓글: 내용 앞부분. 추천: 추천 · 추천 취소 |

- 요청 본문을 통째로 남기지 않는다 — 비회원 비밀번호 · 접근 비밀번호를 싣는 요청이 있다. 접근 비밀번호를 바꾼 일은 남지만 비밀번호는 안 남는다.
  접근 비밀번호 **입력**(`POST /api/gate`)과 실패한 요청은 남기지 않는다.
- 함수는 넣고 읽기만 한다(고치거나 지울 권한이 없다). 남기다 실패해도 요청은 그대로 되고 함수 로그에 `감사 로그 실패` 만 찍힌다.
- **보기**: 슈퍼관리자(마스터)로 로그인 → 마이페이지 맨 아래 **변경 기록**. 최근 것부터 50줄씩(「더 보기」), 이름을 누르면 그 사람 기록만(`GET /api/audit?before=&who=`, 마스터만).
  대시보드 **Table Editor > audit_log** 나 SQL Editor 로도 본다:

  ```sql
  select to_timestamp(at / 1000.0) at time zone 'Asia/Seoul' as kst, user_name, label, target, detail
  from public.audit_log order by at desc limit 200;
  ```

- 지우지 않고 쌓인다(한 줄 수백 바이트). DB 가 500MB 에 가까워지면 SQL Editor 에서 오래된 줄을 지운다.
- 처음 운영에 올릴 때: `20261026000000_audit_log.sql` → `20261026100000_audit_detail.sql` 을 SQL Editor 에서 Run → `sh tools/deploy-api.sh`.
  함수를 먼저 올리면 그 사이 로그는 남지 않는다(요청은 된다).

## 잠재력추천

잠재력 빌드 게시판. 따로 서버를 두지 않고 팀원모집 함수(`server/index.mjs`)의 `/api/builds` 로 같이 돈다 — 로그인 · 요청 수 제한 · DB 원칙이 같다.

```
potentials/index.html                           화면 (정적)
assets/potentials.js                            목록 · 글 · 쓰기/고치기
assets/auth.js                                  디스코드 로그인 + api() — 팀원모집과 같이 쓴다
assets/potentials/<id>.png · share/<id>.jpg   잠재력 아이콘(게임 캡처에서 잘라냄) · 카카오 공유용 200x200 JPG
data/potentials.json                            잠재력 목록 (색 · 이름 · 옵션). 늘 5레벨(MAX)로 끼운다고 보고 레벨은 저장하지 않는다
supabase/migrations/20260928000000_potentials.sql  potential_builds · potential_likes · potential_comments + 추천 RPC
```

| 요청 | 누가 | 설명 |
| --- | --- | --- |
| `GET /api/builds?sort=likes\|new&pos=1~5&char=<id>` | 누구나 | 목록 100개 (카드에 작은 판을 그리려고 30칸도 준다) |
| `GET /api/builds/<id>` | 누구나 | 글 + 댓글. 로그인 토큰을 붙이면 내가 추천했는지(`liked`)도 |
| `POST /api/builds` · `PUT /api/builds/<id>` · `DELETE /api/builds/<id>` | 로그인 · 고치기/지우기는 쓴 사람 | 제목 · 추천 캐릭터 1~5명 · 설명 · 30칸 |
| `POST /api/builds/<id>/like` | 로그인 | 추천 켜기/끄기 → `{ liked, likes }` |
| `POST /api/builds/<id>/comments` · `DELETE /api/builds/<id>/comments/<댓글 id>` | 로그인 · 지우기는 쓴 사람 | 댓글 |

작성자 이름은 팀원모집 프로필 이름(없으면 디스코드 이름)을 쓸 때 저장한다. 잠재력이 게임에 새로 나오면
`data/potentials.json` 의 `potentials` 에 한 줄 넣는다(`id` 는 한 번 정하면 바꾸지 않는다 — 저장된 글이 이 id 를 가리킨다).
함수에 묶여 있으므로 **함수도 다시 배포**한다([운영 배포](#운영-배포) 4번).

처음 운영에 올릴 때: 마이그레이션을 SQL Editor 에 붙여 넣어 Run → 위 Redirect URLs 에 `/potentials/` 추가 → 함수 배포 → main 푸시.

## 영상

유튜브 링크 게시판. 잠재력추천과 같은 게시판 코드를 쓴다 — 서버는 `server/index.mjs` 의 `BOARDS`(게시판마다 표 이름 · 글 검증 · 필터),
화면은 `assets/board.js`(로그인 표시 · 캐릭터 필터 · 목록 카드 · 글 머리 · 추천 · 댓글). 요청 모양도 `/api/builds` 와 같고 `/api/videos` 로 부른다.

```
videos/index.html · assets/videos.js         화면
data/videos.json                             분류 목록 · 캐릭터 최대 수. 분류를 바꾸면 함수도 다시 배포한다
supabase/migrations/20260929000000_videos.sql  videos · video_likes · video_comments + 추천 RPC
```

- 주소는 서버가 영상 id(11자)로 바꿔 저장한다(watch · youtu.be · shorts · live · embed). 같은 영상은 한 번만 올라간다(409).
- 제목은 화면이 유튜브 oEmbed(CORS 허용)로 받아 미리 채운다. 서버는 유튜브에 묻지 않는다.
- `GET /api/videos?cat=<분류>&limit=<n>` — 홈이 `cat=lecture&sort=new&limit=4` 로 "최신 강의" 를 그린다. 실패하거나 0개면 그 칸은 숨는다.
- 카톡 공유는 피드 카드(유튜브 썸네일 `i.ytimg.com/vi/<id>/hqdefault.jpg`).

처음 운영에 올릴 때: 마이그레이션을 SQL Editor 에 붙여 넣어 Run → Redirect URLs 에 `/videos/` 추가 → `sh tools/deploy-api.sh` → main 푸시.

## 커스텀 전술

전술판에서 보드를 고치면(선수 위치 · 동선 · 선수 수 — 선수만 바꿔 끼운 건 아니다) 프리셋 상자가 「✏️ 직접 수정한 전술」 로 바뀌고
등록 칸이 열린다. 이름 · 설명을 붙여 등록(디스코드 로그인)하면 모두의 프리셋 상자에 「커스텀 전술」 묶음(수비 전술 아래, 좋아요순)으로 뜬다.
고르면 설명 · 작성자 · 좋아요, 내 것이면 삭제. 서버는 잠재력추천 · 영상과 같은 게시판 코드(`BOARDS.tactics`, 댓글 없음)이고 보드는 팀원모집과 같은 `board()` 검증을 쓴다.

```
supabase/migrations/20260930000000_custom_tactics.sql   custom_tactics · custom_tactic_likes + 좋아요 RPC
GET /api/tactics?sort=likes      목록(보드 없이) · GET /api/tactics/<id> 보드 · 설명 · liked
```

- 카톡 공유: 등록된 커스텀(안 고친 것)은 `/tactics/?c=<id>`, 나머지는 보드를 담은 `#...` 주소. 주소가 2000자를 넘으면(동선이 많으면) 등록을 권한다.
- 카드: 1~3줄 공격 선수(모자라면 수비), 4줄 전술 설명(등록된 커스텀은 그 설명) — 4줄 사용자 정의 템플릿. 고친 보드(# 주소)는 기본 3줄(설명 없이), 선수 2명 미만이면 사이트 대표 이미지.
- 팀원모집 「원하는 전술」 에도 커스텀 전술 묶음(좋아요순)이 나온다. 고르면 보드 · 이름과 함께 `tactic.custom`(전술 번호)을 보내고, 팀 화면은 그 번호로 설명 · 작성자 · 「전술판에서 열기」 를 보여 준다(전술이 지워졌으면 보드만).

처음 운영에 올릴 때: 마이그레이션을 SQL Editor 에 붙여 넣어 Run → Redirect URLs 에 `/tactics/` 추가 → `sh tools/deploy-api.sh` → main 푸시.

## 티어표 게시판

티어표 편집기의 「티어표 올리기」(디스코드 로그인)로 지금 티어표에 제목 · 설명을 붙여 올린다. 서버는 같은 게시판 코드(`BOARDS.tiers`)이고 화면은 `assets/tiers.js` 한 파일이 주소로 나눈다.

```
/tiers/             편집기(localStorage 에 저장) · /tiers/?edit=<id> 내 글을 불러와 「수정 저장」
/tiers/?list        모두의 티어표 — 최신순(기본) · 추천순, 카드에 작은 티어표
/tiers/?t=<id>      글 — 추천 · 댓글 · 카톡 공유(티어 4줄 + 작성자 줄) · 「내 티어표로 가져와 고치기」
supabase/migrations/20261006000000_tier_lists.sql   tier_lists · tier_list_likes · tier_list_comments + 추천 RPC
```

- 티어 1~12줄, 이름 10자 · 색 `#rrggbb` · 선수는 한 줄에만. 미출시 선수도 올릴 수 있다(`chars` 에는 한국 서버 선수만 들어간다).

처음 운영에 올릴 때: 마이그레이션을 SQL Editor 에 붙여 넣어 Run → Redirect URLs 에 `/tiers/` 추가 → `sh tools/deploy-api.sh` → main 푸시.

## 조합표

선수 3명 조합 게시판. 서버는 같은 게시판 코드(`BOARDS.combos`), 화면은 `assets/combos.js`(`?c=<id>` 글, 없으면 목록).

```
combos/index.html · assets/combos.js            화면
supabase/migrations/20261006100000_combos.sql   combos · combo_likes · combo_comments + 추천 RPC
supabase/migrations/20261006200000_combos_sets.sql  추천 티어 칸 빼기 · 상대 조합을 글 번호 → 3명 세트로
```

- 선수는 정확히 3명(한국 서버). 고른 순서대로 선수마다 **잠재력추천 글을 하나씩 참고로** 붙일 수 있다(`builds` — 선수 순서와 같은 3칸, 글 번호 | null). 글쓰기 화면은 `GET /api/builds?char=<id>&sort=likes` 로 그 캐릭터를 추천한 빌드를 고르게 한다.
- 상대하기 편한 · 힘든 쪽마다 캐릭터 10명 · 조합 10개까지(`matchups.easy|hard.chars` · `combos: [[id, id, id]]`). 조합은 글쓰기 화면의 「조합 만들기」 에서 세 명을 누르면 하나 생기고, 줄마다 삭제 버튼이 있다.
  한 캐릭터 · 조합은 한쪽에만 들어간다(세 명이 같으면 순서가 달라도 같은 조합).
- 잠재력추천은 **글 번호만 저장**하고, 글 화면이 게시판 공용 `?ids=1,2,3`(30개까지) 목록으로 한 번에 읽는다 — 지워진 글은 「지워졌어요」 로 보인다.
- 카톡 공유: 선수 3줄(포지션 · 추천 빌드 제목) + 상성 줄 + 설명 줄(있을 때) — 4 · 5줄 사용자 정의 템플릿, 3줄뿐이면 기본 카드.

처음 운영에 올릴 때: 마이그레이션을 SQL Editor 에 붙여 넣어 Run → Redirect URLs 에 `/combos/` 추가 → `sh tools/deploy-api.sh` → main 푸시.

## 카카오 4 · 5줄 리스트

기본 리스트 템플릿은 3줄이 최대라, 카카오 디벨로퍼스 메시지 템플릿 빌더로 **사용자 정의 리스트 4줄(137568) · 5줄(137513)** 을 만들어 쓴다.
번호는 `assets/app.js` 의 `KAKAO_LIST_TEMPLATES`, 보내는 곳은 `kakaoList()` 하나다 — 줄이 4~5개면 `Kakao.Share.sendCustom`, 모자라거나 주소에 `#` 가 있으면 기본 3줄.

| 변수 | 내용 |
| --- | --- |
| `HEADER` · `HEADER_PATH` | 머리 제목 · 링크 |
| `TITLEn` · `DESCn` · `IMGn` · `PATHn` | n번째 줄(1~4 또는 1~5) 제목 · 설명 · 이미지 전체 주소 · 링크 |
| `BTN1` · `BTN1_PATH` · `BTN2` · `BTN2_PATH` | 버튼 두 개 이름 · 링크 |

링크 변수는 사이트 도메인 뒤의 경로 · 쿼리만 넘긴다(`potentials/?b=3`). 템플릿 빌더의 링크 칸에서 `${…_PATH}` 앞에 공백이 끼면 `/%20combos/` 로 열려 404 가 난다 — 루트의 `404.html` 이 앞 공백을 떼고 원래 페이지로 보내 주지만(이미 퍼진 카드용), 템플릿 쪽을 고쳐야 한다. 버튼 이름은 5자 이내(넘으면 두 줄). 변수가 하나라도 빠지면 카드에 `${…}` 가 그대로 보이므로 늘 전부 채운다.
쓰는 곳: 티어표(티어 4줄 + 작성자 줄), 조합표(선수 3줄 + 상성 + 설명), 잠재력추천(추천 캐릭터 + 합계 → 색깔별 대표 잠재력 → 빌드 설명이 있으면 5줄, 없으면 4줄), 전술판(등록된 커스텀, 4줄: 공격 3 + 설명). 팀원모집 · 영상 · TNAB 봇은 기본 템플릿 그대로.

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
| 페이지 | `index.html`, `tactics/index.html`, `tiers/index.html`, `recruit/index.html`, `potentials/index.html`, `videos/index.html`, `combos/index.html`, `me/index.html`, `arena/index.html`, `arena/plan/index.html`, `discord/index.html` |
| 자원 | `assets/style.css`, `app.js`, `auth.js`, `board.js`, `profile.js`, `court.js`, `tactics.js`, `tiers.js`, `recruit.js`, `potentials.js`, `videos.js`, `combos.js`, `me.js`, `arena.js` |

다른 스크립트가 import 하는 모듈은 import 구문에도 버전이 박히고, 그걸 박은 결과로 다시 해시를 낸다.
`app.js` → `court.js` → `tactics.js` · `recruit.js` (그리고 `app.js` → `board.js` → `tiers.js` · `profile.js` → `me.js` · `arena.js`) 순으로 번지므로
`app.js` 만 고쳐도 줄줄이 새 URL 이 된다. JS 파일이나 페이지를 새로 만들면 스크립트의 `ASSETS` · `PAGES` 에
넣는다 — `ASSETS` 는 import 되는 쪽이 앞이어야 하고, 순서가 틀리면 에러로 알려준다.
**로컬에서도 한 번 돌린 뒤 본다** — 버전이 붙은 주소(`/assets/board.js?v=…`)와 안 붙은 주소(`./board.js`)는 브라우저가 서로 다른 모듈로 읽어, 홈처럼 두 갈래로 board.js 를 부르는 페이지가 깨진다.

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
`.env` 를 고쳤으면 `docker compose up -d` 를 다시 돌린다 — **떠 있는 컨테이너는 `.env` 를 다시 읽지 않는다.**
`restart` 로도 안 바뀐다. 디스코드 값이 빈 채로 오래 떠 있으면 알림 · 음성채널 배정이 조용히 빠지므로, 의심되면 확인하고 강제로 다시 만든다:

```sh
docker compose exec api sh -c 'echo "$DISCORD_GUILD_ID"'   # 비어 있거나 옛 값이면
docker compose up -d --force-recreate api
curl -s localhost:8000/api/health                          # voice 가 true 여야 봇 토큰 · 서버 ID 가 들어간 것
```
 `compose.yaml` 의 nginx 설정을 고쳤으면
`docker compose up -d --force-recreate web` (`up -d` · `restart` 로는 반영되지 않는다). 모집한 방은 3시간이 지나면 사라지고, 당장 비우려면 `docker compose down -v`.
요청 수 제한(한 사람 당 쓰기 10분에 30번)은 DB 에 남으므로 스크립트로 몰아서 시험하다 막히면
`docker compose exec db psql -U postgres -h localhost -d postgres -c 'delete from recruit_hits'`.

Docker 가 없으면 `python3 -m http.server 8000 --bind 127.0.0.1` 도 되지만(저장소를 통째로 서비스하므로 `.env` 가 있으면 밖에 열지 않는다), 브라우저 캐시 때문에 고친 CSS·JS 가
늦게 보일 수 있고 팀원모집은 API 가 없어 동작하지 않는다.

## 라이선스 / 출처

팬 제작 비공식 도구. 선수 정보와 이미지의 저작권은 NetEase / NBA 등 원저작자에게 있으며,
[공식 홈페이지](https://www.dunkcitymobile.com/kr/)에서 가져온다.
