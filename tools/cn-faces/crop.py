"""전신 렌더에서 얼굴을 찾아 181x180 원형 카드로 만든다. fetch.mjs 가 호출한다.


1) OpenCV Haar 정면/측면 얼굴 검출 (여러 스케일·전처리로 재시도)
2) 실패하면 피부톤 연결 성분 중 얼굴다운 덩어리로 대체
tune.json 으로 개별 보정 가능: {"id": {"zoom":1.8, "dx":0.05, "dy":-0.1}}
"""
import json, os, sys
import cv2
import numpy as np
from PIL import Image, ImageDraw

SIZE = (181, 180)
BG = (60, 42, 32)  # BGR 기준 남색
CASCADES = [
    "haarcascade_frontalface_default.xml",
    "haarcascade_frontalface_alt2.xml",
    "haarcascade_profileface.xml",
]


def load(path):
    im = Image.open(path).convert("RGBA")
    flat = Image.new("RGBA", im.size, (32, 42, 60, 255))
    flat.alpha_composite(im)
    return im, cv2.cvtColor(np.array(flat.convert("RGB")), cv2.COLOR_RGB2BGR)


def detect_haar(bgr):
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    variants = [gray, cv2.equalizeHist(gray), cv2.createCLAHE(3.0, (8, 8)).apply(gray)]
    out = []
    for name in CASCADES:
        c = cv2.CascadeClassifier(cv2.data.haarcascades + name)
        if c.empty():
            continue
        for g in variants:
            for scale in (1.04, 1.09, 1.15):
                for gg in (g, cv2.flip(g, 1)):
                    found = c.detectMultiScale(gg, scale, 3, minSize=(int(gray.shape[1] * .07),) * 2)
                    for (x, y, w, h) in found:
                        if gg is not g:
                            x = gray.shape[1] - x - w
                        out.append((x, y, w, h))
    return out


def skin_mask(bgr, alpha):
    b, g, r = [bgr[:, :, i].astype(int) for i in range(3)]
    mx, mn = np.max(bgr, 2).astype(int), np.min(bgr, 2).astype(int)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    m = (alpha > 160) & (r > g) & (g >= b) & (r - b > 18) & (r - b < 130) & (r > 70) & (sat > .12) & (sat < .62)
    return m.astype(np.uint8)


def detect_skin(bgr, alpha):
    m = cv2.morphologyEx(skin_mask(bgr, alpha), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, stats, cent = cv2.connectedComponentsWithStats(m, 8)
    H, W = m.shape
    best, score = None, -1
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < W * H * .002 or w == 0 or h == 0:
            continue
        if area / (w * h) < .3 or not (.7 < h / w < 2.2):
            continue
        s = (area ** .5) * (0.35 + (1 - cent[i][1] / H) * 1.65)
        if s > score:
            score, best = s, (x, y, w, h)
    return [best] if best else []


def skin_ratio(mask, b):
    """박스 안 피부색 비율 — 유니폼·공·신발을 얼굴로 오인하는 걸 막는 핵심 필터."""
    x, y, w, h = b
    H, W = mask.shape
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    return float(mask[y0:y1, x0:x1].mean())


def pick(boxes, shape, mask=None, min_skin=0.32):
    """피부 비율로 거른 뒤, 위쪽에 있고 큰 것을 얼굴로 본다. 겹치는 박스는 평균낸다."""
    if not boxes:
        return None
    H, W = shape[:2]
    boxes = [b for b in boxes if b[1] + b[3] / 2 < H * .75]
    if mask is not None:
        kept = [b for b in boxes if skin_ratio(mask, b) >= min_skin]
        boxes = kept or [b for b in boxes if skin_ratio(mask, b) >= min_skin * .6]
    if not boxes:
        return None
    best = max(boxes, key=lambda b: (b[2] * b[3]) ** .5 * (0.4 + (1 - (b[1] + b[3] / 2) / H) * 1.6))
    close = [b for b in boxes
             if abs(b[0] + b[2] / 2 - best[0] - best[2] / 2) < best[2] * .5
             and abs(b[1] + b[3] / 2 - best[1] - best[3] / 2) < best[3] * .5]
    a = np.mean(close, 0)
    return tuple(int(v) for v in a)


def card(im, cx, cy, side):
    side = max(8, int(side))
    box = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))
    crop = Image.new("RGBA", (side, side), (32, 42, 60, 255))
    crop.alpha_composite(im.crop(box), (0, 0))
    crop = crop.resize(SIZE, Image.LANCZOS)
    mask = Image.new("L", SIZE, 0)
    ImageDraw.Draw(mask).ellipse((1, 1, SIZE[0] - 2, SIZE[1] - 2), fill=255)
    out = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    out.paste(crop, (0, 0), mask)
    ImageDraw.Draw(out).ellipse((2, 2, SIZE[0] - 3, SIZE[1] - 3), outline=(255, 255, 255, 255), width=3)
    return out


src, dst = sys.argv[1], sys.argv[2]
tune = json.load(open(sys.argv[3])) if len(sys.argv) > 3 and os.path.exists(sys.argv[3]) else {}
os.makedirs(dst, exist_ok=True)
report = {}
for f in sorted(os.listdir(src)):
    if not f.endswith(".png"):
        continue
    pid = f[:-4]
    im, bgr = load(os.path.join(src, f))
    alpha = np.array(im)[:, :, 3]
    t = tune.get(pid, {})
    if "face" in t:                      # [중심x, 중심y, 얼굴폭] — 모두 이미지 대비 비율
        H, W = bgr.shape[:2]
        fcx, fcy, fw = t["face"]
        side_px = fw * W
        x, y, w, h = int(fcx * W - side_px / 2), int(fcy * H - side_px / 2), int(side_px), int(side_px)
        how = "manual"
    elif "box" in t:
        x, y, w, h = t["box"]
        how = "manual"
    else:
        mask = cv2.morphologyEx(skin_mask(bgr, alpha), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        b = pick(detect_haar(bgr), bgr.shape, mask)
        how = "haar"
        if b is None:
            b = pick(detect_skin(bgr, alpha), bgr.shape)
            how = "skin"
        if b is None:
            H, W = bgr.shape[:2]
            b, how = (int(W * .3), int(H * .05), int(W * .4), int(W * .4)), "fallback"
        x, y, w, h = b
    side = max(w, h) * t.get("zoom", 1.85)
    cx = x + w / 2 + t.get("dx", 0) * side
    cy = y + h / 2 + t.get("dy", 0 if how == "manual" else -0.06) * side
    card(im, cx, cy, side).save(os.path.join(dst, f))
    report[pid] = how
print(json.dumps(report, ensure_ascii=False))
