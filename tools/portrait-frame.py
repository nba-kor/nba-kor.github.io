"""중국 서버 게임의 선수 프로필 카드(노란 배경 얼굴) 캡처 → 180x180 원형 얼굴 (tools/portraits/<id>.png · assets/players/<id>.png)

    tools/cn-faces/.venv/bin/python tools/portrait-frame.py <캡처.png> <id>

캡처는 카드 한 장을 크림색 바탕째로(아래 이름표는 있어도 된다). 노란 카드를 찾아 폭 146px 로 맞추고
흰 테두리 10px + 오른쪽 아래 반투명 파란 그림자 틀에 앉힌다 — 숫자는 기존 portraits 얼굴에서 잰 값.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
K = 4                                      # 4배로 그려 줄여 가장자리를 부드럽게
SIZE, C, R_OUT, R_IN = 180, (87, 86.5), 87.5, 77.5   # 판 · 흰 원 중심 · 흰 원 · 얼굴 원 반지름
SHADOW, SHIFT = (43, 100, 144, 76), (5, 6)
CARD_W, CARD_X, CARD_TOP = 146, 87.5, 20   # 결과에서 카드 폭 · 카드 가운데 x · 카드 윗변 y
CREAM = (255, 251, 242)                    # 카드 바깥 바탕

src, pid = sys.argv[1], sys.argv[2]
cap = Image.open(src).convert("RGB")
a = np.asarray(cap).astype(int)
ys, xs = np.nonzero((a[..., 0] > 235) & (a[..., 1] > 160) & (a[..., 1] < 240) & (a[..., 2] < 190))   # 노란 카드
s = CARD_W * K / (xs.max() - xs.min() + 1)
big = cap.resize((round(cap.width * s), round(cap.height * s)), Image.LANCZOS)

face = Image.new("RGBA", (SIZE * K, SIZE * K), CREAM)
face.paste(big, (round(CARD_X * K - (xs.min() + xs.max() + 1) / 2 * s), round(CARD_TOP * K - ys.min() * s)))


def disc(c, r):
    return [(c[0] - r) * K, (c[1] - r) * K, (c[0] + r) * K - 1, (c[1] + r) * K - 1]


out = Image.new("RGBA", face.size, (0, 0, 0, 0))
shadow = Image.new("RGBA", face.size, (0, 0, 0, 0))
ImageDraw.Draw(shadow).ellipse(disc((C[0] + SHIFT[0], C[1] + SHIFT[1]), R_OUT), fill=SHADOW)
out.alpha_composite(shadow)
ImageDraw.Draw(out).ellipse(disc(C, R_OUT), fill="white")
mask = Image.new("L", face.size, 0)
ImageDraw.Draw(mask).ellipse(disc(C, R_IN), fill=255)
out.paste(face, (0, 0), mask)
out = out.resize((SIZE, SIZE), Image.LANCZOS)
for d in ("tools/portraits", "assets/players"):
    out.save(ROOT / d / f"{pid}.png", optimize=True)
print(f"{pid}: 카드 폭 {xs.max() - xs.min() + 1}px → {CARD_W}px")
