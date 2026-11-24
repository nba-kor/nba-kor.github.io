---
description: 메인 캘린더 카드(index.html 의 CAL 배열)를 최신 공지로 갱신
argument-hint: "[캘린더 캡처 이미지 · 공지 글 붙여넣기 · 인스타 글 주소 (없으면 공식 인스타를 확인)]"
---

메인페이지 캘린더 카드를 최신 공지에 맞춰 갱신한다. 입력: $ARGUMENTS

1. 출처를 모은다.
   - 이 메시지에 붙은 캡처 이미지 · 붙여 넣은 공지 글 · 글 주소가 있으면 그것이 1순위다.
   - 없거나 모자라면 공식 인스타그램 https://www.instagram.com/nbadunkcitykr 의 최근 글(캡션)을 web-fetch 로 읽는다.
     네이버 게임 라운지(game.naver.com)는 이 환경에서 못 읽는다 — 시도하지 않는다.
   - 공지 이미지 안의 글자는 읽을 수 없으니, 캡션에 없는 기간 · 보상은 추측하지 말고 비워 둔다.
2. `index.html` 의 `const CAL = [` 배열을 고친다. 항목 모양:
   `{ g: '선수'|'코스튬'|'이벤트', t: 이름, s: 'MM-DD', e: 'MM-DD'(출시일이면 s 와 같게), img: assets/calendar/<이름>.webp 의 이름 또는 ico: 이모지, d: [공지 문구 문장들], src: 공지 글 주소 }`
   - 연도는 같은 스크립트의 `const Y` — 해가 바뀌는 일정이면 함께 본다.
   - 끝난 지 한 달 넘은 시즌 항목은 지운다(새 시즌이면 통째로 바꾸고 `<h2>` 의 시즌 이름 · 기간도 고친다).
   - 새 그림이 필요하면 캡처에서 잘라 `assets/calendar/*.webp` 로 저장한다(`uv run -q --with pillow python`, 잘라낸 것을 한 장으로 붙여 눈으로 확인).
3. 확인: 로컬 서버(`python3 -m http.server 8765`)와 playwright(`LD_LIBRARY_PATH=$HOME/.local/lib uv run -q --no-project --with playwright==1.62.0`)로 홈을 열어
   `#cal-title` · `.cal-bar` 개수 · 페이지 오류를 보고, 카드 스크린샷을 눈으로 확인한다(`localStorage dc.gate` 를 미리 넣어 둔다). 끝나면 서버를 끈다.
4. 무엇을 더하고 · 고치고 · 지웠는지, 출처에 없어 비워 둔 것을 짧게 보고하고 커밋한다. 푸시는 묻는다.
