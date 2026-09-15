"""카카오톡 공유용 얼굴 이미지를 만든다: assets/players/*.png → assets/share/<id>.jpg (300x300)

    tools/cn-faces/.venv/bin/python tools/share-faces.py

카카오 공유 이미지는 200x200 이상이어야 하고, 투명 영역은 검게 나올 수 있다.
그래서 원형 얼굴(투명 PNG)을 불투명한 어두운 정사각형 가운데에 앉혀 JPG 로 굽는다.
빈 자리용 empty.jpg 도 같이 만든다. 여러 번 돌려도 결과는 같다 — 얼굴을 추가했으면 다시 돌린다.
팀원모집은 한국 출시 캐릭터(data/players.json)만 받으므로 그 얼굴만 굽는다. 미출시 얼굴은 출시 때
update-players 가 공식 카드로 바꾸니 미리 만들어 봐야 쓸모없다 — 출시 후 다시 돌린다. 지난 결과물은 지우지 않는다.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "assets/players", ROOT / "assets/share"
SIZE = 300
BG = "#1c2230"  # style.css --panel-2
FG = "#8b97a8"  # style.css --muted
FACE = 0.86  # 얼굴 폭 비율 — 카톡 리스트 썸네일에서 둥근 모서리에 잘리지 않을 만큼 여백
SAVE = dict(quality=85, optimize=True, progressive=True)


def face(path):
    im = Image.open(path).convert("RGBA")
    w = round(SIZE * FACE)
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)  # RGBA 는 알파 보정해서 줄여 가장자리가 검게 번지지 않는다
    bg = Image.new("RGBA", (SIZE, SIZE), BG)
    bg.alpha_composite(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2))
    return bg.convert("RGB")


def empty():
    """점선 원 + '+'. 4배로 그려 줄여서 계단 현상을 없앤다."""
    k = 4
    s, r, lw = SIZE * k, SIZE * FACE / 2 * k, 6 * k
    im = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(im)
    box = (s / 2 - r, s / 2 - r, s / 2 + r, s / 2 + r)
    for a in range(0, 360, 15):  # 7.5도 선 + 7.5도 틈
        d.arc(box, a, a + 7.5, fill=FG, width=lw)
    arm = r * 0.36
    d.line((s / 2 - arm, s / 2, s / 2 + arm, s / 2), fill=FG, width=lw * 2)
    d.line((s / 2, s / 2 - arm, s / 2, s / 2 + arm), fill=FG, width=lw * 2)
    return im.resize((SIZE, SIZE), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
kr = {p["id"] for p in json.loads((ROOT / "data/players.json").read_text(encoding="utf-8"))["players"] if p.get("server") == "kr"}
pngs = sorted(p for p in SRC.glob("*.png") if p.stem in kr)
for p in pngs:
    face(p).save(OUT / f"{p.stem}.jpg", **SAVE)
empty().save(OUT / "empty.jpg", **SAVE)
print(f"assets/share/ 에 {len(pngs)}명 + empty.jpg")
