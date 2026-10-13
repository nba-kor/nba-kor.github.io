"""사이트 로고(tools/logo.png)로 공유 카드(카카오톡 · 디스코드 · 트위터) · 파비콘 이미지를 굽는다.

    tools/cn-faces/.venv/bin/python tools/og-image.py

    assets/og.jpg          1200x630 — 모든 페이지의 og:image · 전술 피드 카드
    assets/icon.png        512x512  — 파비콘 · 홈 화면 아이콘 · 헤더 로고
    assets/share/logo.jpg  300x300  — 카카오 리스트 카드에서 얼굴이 없는 줄(설명 · 작성자)의 썸네일

로고는 흰 배경이라 캔버스도 흰색이다. 여러 번 돌려도 결과는 같다.
**이미지를 바꿨으면 파일 이름의 ?v= 도 같이 올린다** — 카카오는 이미지를 URL 기준으로 캐시해서,
같은 주소로 내용만 바꾸면 한동안 옛 그림이 나간다(README "카카오 설정").
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"
LOGO = Image.open(ROOT / "tools/logo.png").convert("RGB")


def bake(w: int, h: int, fill: float) -> Image.Image:
    """흰 w x h 캔버스 가운데에 로고를 짧은 변의 fill 비율 크기로 앉힌다."""
    k = min(w, h) * fill / max(LOGO.size)
    logo = LOGO.resize((round(LOGO.width * k), round(LOGO.height * k)), Image.LANCZOS)
    img = Image.new("RGB", (w, h), "white")
    img.paste(logo, ((w - logo.width) // 2, (h - logo.height) // 2))
    return img


if __name__ == "__main__":
    bake(1200, 630, 0.92).save(OUT / "og.jpg", quality=88, optimize=True)
    bake(512, 512, 0.96).convert("L").save(OUT / "icon.png", optimize=True)  # 로고가 흑백이라 L 이 RGB 의 절반 크기
    # 카톡 리스트 썸네일은 모서리가 둥글게 잘린다 — 얼굴(share-faces.py FACE)과 같은 여백
    bake(300, 300, 0.86).save(OUT / "share/logo.jpg", quality=85, optimize=True, progressive=True)
    print("assets/og.jpg · assets/icon.png · assets/share/logo.jpg")
