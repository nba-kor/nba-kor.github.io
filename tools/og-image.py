"""공유 카드(카카오톡 · 디스코드 · 트위터)와 파비콘에 쓸 대표 이미지를 만든다.

    tools/cn-faces/.venv/bin/python tools/og-image.py

    assets/og.jpg    1200x630 — 모든 페이지의 og:image
    assets/icon.png  512x512  — 파비콘 · 홈 화면 아이콘

색은 assets/style.css 의 :root 값을 그대로 쓴다. 여러 번 돌려도 결과는 같다.
**이미지를 바꿨으면 파일 이름의 ?v= 도 같이 올린다** — 카카오는 이미지를 URL 기준으로 캐시해서,
같은 주소로 내용만 바꾸면 한동안 옛 그림이 나간다(README "카카오 설정").
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"

BG = "#0d1117"        # --bg
TEXT = "#e6edf3"      # --text
MUTED = "#8b97a8"     # --muted
ACCENT = "#f5a623"    # --accent
LINK = "#4d9eff"      # --accent-2
COURT_LINE = "#7d8896"  # --court-line

# 굵은 한글 폰트. 앞에서부터 있는 것을 쓴다(WSL · 리눅스 · 윈도우 순)
FONTS = [
    "~/.fonts/NanumSquareB.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/mnt/c/Windows/Fonts/malgunbd.ttf",
    "C:/Windows/Fonts/malgunbd.ttf",
]


def font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONTS:
        p = Path(path).expanduser()
        if p.is_file():
            return ImageFont.truetype(str(p), size)
    raise SystemExit(f"한글 굵은 폰트를 찾지 못했습니다. FONTS 에 경로를 추가해 주세요: {FONTS}")


def court(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int) -> None:
    """오른쪽에 하프코트 라인을 옅게 깐다 — 전술판 화면과 같은 모양."""
    draw.rectangle([x, y, x + w, y + h], outline=COURT_LINE, width=3)
    key_w, key_h = int(w * 0.36), int(h * 0.42)
    kx = x + (w - key_w) // 2
    draw.rectangle([kx, y, kx + key_w, y + key_h], outline=COURT_LINE, width=3)
    r = int(w * 0.13)
    cx, cy = x + w // 2, y + key_h
    draw.arc([cx - r, cy - r, cx + r, cy + r], 0, 360, fill=COURT_LINE, width=3)
    draw.arc([x + 10, y - h, x + w - 10, y + h], 0, 180, fill=COURT_LINE, width=3)
    draw.ellipse([cx - 14, y + 44, cx + 14, y + 72], outline=ACCENT, width=4)


def og() -> None:
    img = Image.new("RGB", (1200, 630), BG)
    d = ImageDraw.Draw(img)

    layer = Image.new("RGB", (1200, 630), BG)
    ld = ImageDraw.Draw(layer)
    court(ld, 700, 120, 440, 390)
    img.paste(Image.blend(img, layer, 0.35))
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, 1200, 8], fill=ACCENT)
    d.text((80, 150), "NBA 덩크 시티", font=font(86), fill=TEXT)

    # TNAB 는 아레나(클럽) 이름 — 칩으로 강조한다
    chip = font(52)
    tw = d.textlength("TNAB", font=chip)
    d.rounded_rectangle([80, 268, 80 + tw + 56, 348], radius=16, fill=ACCENT)
    d.text((108, 280), "TNAB", font=chip, fill=BG)

    d.text((80, 400), "3:3 전술판 · 티어표 · 팀원모집", font=font(40), fill=MUTED)
    d.text((80, 470), "nba-kor.github.io", font=font(32), fill=LINK)

    img.save(OUT / "og.jpg", quality=88, optimize=True)
    print("assets/og.jpg", img.size)


def icon() -> None:
    """농구공 — 가로 · 세로 지름선과 세로 이음새 하나면 작은 크기에서도 공으로 읽힌다."""
    size, pad, w = 512, 36, 16
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    d.ellipse([pad, pad, size - pad, size - pad], fill=ACCENT)
    c = size // 2
    d.line([pad, c, size - pad, c], fill=BG, width=w)
    d.line([c, pad, c, size - pad], fill=BG, width=w)
    seam = int((size - 2 * pad) * 0.23)
    d.ellipse([c - seam, pad, c + seam, size - pad], outline=BG, width=w)
    img.save(OUT / "icon.png", optimize=True)
    print("assets/icon.png", img.size)


if __name__ == "__main__":
    og()
    icon()
