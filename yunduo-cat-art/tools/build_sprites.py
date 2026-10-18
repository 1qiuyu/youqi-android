#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""云朵 · 像素猫素材生成器 (final)
32x32 逻辑像素网格绘制 -> NEAREST 2x 导出 64x64，16x 导出 512x512。
"""
import os, sys
from PIL import Image

OUT = (75, 53, 39, 255)
FUR = (246, 213, 160, 255)
CLD = (255, 246, 226, 255)
SHD = (185, 201, 216, 255)
NON = (0, 0, 0, 0)
PAL = {'.': NON, 'o': OUT, 'c': FUR, 'w': CLD, 's': SHD}
N = 32


def ell(cx, cy, rx, ry):
    s = set()
    for y in range(int(cy - ry) - 2, int(cy + ry) + 3):
        for x in range(int(cx - rx) - 2, int(cx + rx) + 3):
            if ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1.0:
                s.add((x, y))
    return s


def seg(pts, r=0.75):
    s = set()
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        n = int(max(abs(x1 - x0), abs(y1 - y0)) * 8) + 1
        for t in range(n + 1):
            f = t / n
            px, py = x0 + (x1 - x0) * f, y0 + (y1 - y0) * f
            for yy in range(int(py - r) - 1, int(py + r) + 2):
                for xx in range(int(px - r) - 1, int(px + r) + 2):
                    if (xx + .5 - px) ** 2 + (yy + .5 - py) ** 2 <= r * r + .28:
                        s.add((xx, yy))
    return s


def box(x0, y0, x1, y1):
    return {(x, y) for x in range(int(x0), int(x1) + 1)
            for y in range(int(y0), int(y1) + 1)}


def tri(a, b, c):
    s = set()
    def sg(p, q, r):
        return (r[0] - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (r[1] - q[1])
    P = (a, b, c)
    for y in range(int(min(p[1] for p in P)) - 1, int(max(p[1] for p in P)) + 2):
        for x in range(int(min(p[0] for p in P)) - 1, int(max(p[0] for p in P)) + 2):
            p = (x + .5, y + .5)
            d = [sg(P[i], P[(i + 1) % 3], p) for i in range(3)]
            if not (any(v < 0 for v in d) and any(v > 0 for v in d)):
                s.add((x, y))
    return s


def clip(s):
    return {(x, y) for (x, y) in s if 0 <= x < N and 0 <= y < N}


def ring(cells):
    add = set()
    for x, y in cells:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            p = (x + dx, y + dy)
            if p not in cells and 0 <= p[0] < N and 0 <= p[1] < N:
                add.add(p)
    return add


def eyeb(pts, st):
    s = set()
    for x, y in pts:
        if st == 'open':
            s |= {(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)}
        elif st == 'half':
            s |= {(x, y + 1), (x + 1, y + 1)}
        else:
            s |= {(x - 1, y + 1), (x, y), (x + 1, y + 1)}
    return s


def ears(cx, top, spread=1.0):
    return (tri((cx - 5.0 * spread, top + 3.4), (cx - 3.2 * spread, top - 2.4),
                (cx - 0.2, top + 1.4)) |
            tri((cx + 0.4, top + 1.4), (cx + 3.6 * spread, top - 2.2),
                (cx + 5.2 * spread, top + 3.4)))


def cloud(cx, cy, rx, ry):
    s  = ell(cx - rx * .56, cy + ry * .04, rx * .44, ry * .68)
    s |= ell(cx - rx * .05, cy - ry * .32, rx * .56, ry * .90)
    s |= ell(cx + rx * .55, cy, rx * .44, ry * .66)
    s |= ell(cx, cy + ry * .30, rx * .95, ry * .48)
    bot = int(cy + ry * .72)
    s = {p for p in s if p[1] <= bot}
    s = {p for p in s if not (p[1] == bot and
                              (p[0] < cx - rx * .84 or p[0] > cx + rx * .84))}
    return clip(s)


def body_ell(cx, cy, rx, ry):
    return ell(cx, cy, rx, ry)


# ---------------- 姿势 ----------------
def cat_lying(wag=0):
    """趴云：侧卧朝左，前爪搭云边。"""
    fur = ell(9.8, 10.0, 5.8, 5.2) | ears(9.8, 4.8)
    fur |= ell(19.0, 16.2, 7.4, 4.3)
    fur |= ell(21.4, 18.8, 5.2, 2.4)
    fur |= ell(10.4, 19.8, 2.4, 1.7)
    fur |= ell(13.8, 20.4, 2.2, 1.6)
    fur |= seg([(25.2, 15.4), (28.0, 12.4), (28.7 + wag * .6, 8.8),
                (26.6 + wag, 6.4)], .72)
    return clip(fur), [(5, 8), (10, 8)], {(7, 11)}, 'side'


def cat_standing(wag=0):
    """站云：四腿撑起，腹部离云面，脚掌落在云顶。"""
    fur = ell(9.6, 8.6, 5.6, 5.0) | ears(9.6, 3.4)
    fur |= ell(19.6, 13.6, 6.4, 3.4)
    # 前后腿各一条，间距小，避免描边后断开
    for lx in (15.4, 18.6):
        fur |= box(lx, 14.6, lx + 1.2, 20.0)
        fur |= box(lx - 0.6, 20.0, lx + 1.8, 21.4)
    fur |= seg([(25.2, 11.6), (27.6, 8.8), (28.2 + wag * .6, 5.4),
                (26.2 + wag, 3.2)], .72)
    return clip(fur), [(5, 7), (10, 7)], {(7, 10)}, 'side'


def cat_climb_left(wag=0):
    """左扒边：身体竖直贴着左边界，两只前爪一上一下扒住边缘。"""
    fur = ell(10.6, 8.8, 5.6, 5.2) | ears(10.6, 3.6)
    fur |= ell(12.0, 19.6, 5.2, 6.2)
    fur |= seg([(8.6, 12.0), (6.8, 11.8)], 1.15)
    fur |= ell(5.0, 11.8, 2.3, 1.8)
    fur |= seg([(8.6, 17.8), (6.6, 17.6)], 1.15)
    fur |= ell(4.9, 17.6, 2.3, 1.8)
    fur |= ell(9.8, 25.6, 2.4, 1.6)
    fur |= ell(13.8, 25.6, 2.4, 1.6)
    fur |= seg([(16.4, 22.6), (20.8, 20.2), (23.4, 15.6),
                (22.2 + wag * .6, 10.6)], .8)
    return clip(fur), [(7, 7), (12, 7)], [(9, 10)], 'side'


def cat_front_bottom(wag=0):
    """下扒边：猫在下边缘外侧，上半身露出、双爪搭在边缘上。"""
    cx = 16.0
    fur = ell(cx, 9.4, 6.4, 5.6) | ears(cx, 3.8, 1.15)
    fur |= ell(cx, 18.0, 6.2, 4.4)
    # 两只前爪搭在下边缘：短、横向略宽，像肉垫
    fur |= box(10.4, 20.4, 13.4, 25.6)
    fur |= box(18.6, 20.4, 21.6, 25.6)
    fur |= box(8.8, 25.6, 14.2, 28.4)
    fur |= box(17.8, 25.6, 23.2, 28.4)
    fur |= seg([(22.0, 19.4), (25.6, 20.6), (27.6 + wag * .5, 23.0),
                (26.4 + wag * .5, 24.8)], .72)
    return clip(fur), [(12, 7), (18, 7)], {(15, 10), (16, 10)}, 'front'


def cat_crouch(wag=0):
    """起跳蓄力：压低身体，爪收紧。"""
    fur = ell(9.6, 12.6, 5.8, 5.0) | ears(9.6, 6.6)
    fur |= ell(18.4, 20.0, 6.8, 3.6)
    fur |= ell(11.4, 22.6, 2.3, 1.5)
    fur |= ell(15.0, 23.0, 2.2, 1.5)
    fur |= ell(20.6, 22.8, 2.4, 1.6)
    fur |= seg([(24.4, 18.4), (27.4, 16.2), (28.0 + wag * .6, 13.0),
                (25.8 + wag, 11.2)], .72)
    return clip(fur), [(5, 11), (10, 11)], {(7, 14)}, 'side'


def cat_airborne(wag=0):
    """腾空：身体略伸展，四肢离开地面。"""
    fur = ell(10.4, 9.0, 5.8, 5.0) | ears(10.4, 2.8)
    fur |= ell(20.0, 13.4, 7.2, 3.8)
    fur |= seg([(14.0, 16.0), (11.4, 20.4)], .58)
    fur |= ell(11.0, 21.4, 1.7, 1.25)
    fur |= seg([(16.6, 16.2), (15.0, 21.0)], .58)
    fur |= ell(14.8, 21.9, 1.7, 1.25)
    fur |= seg([(21.6, 16.2), (21.0, 20.6)], .58)
    fur |= ell(21.0, 21.5, 1.7, 1.25)
    fur |= seg([(24.2, 15.6), (24.6, 20.0)], .58)
    fur |= ell(24.8, 20.9, 1.7, 1.25)
    fur |= seg([(26.0, 12.6), (28.2, 9.4), (28.6 + wag * .6, 6.0),
                (26.4 + wag, 4.0)], .72)
    return clip(fur), [(6, 7), (11, 7)], {(8, 10)}, 'side'


def cat_land(wag=0):
    """落云缓冲：四肢微屈。"""
    fur = ell(9.8, 11.4, 5.8, 5.2) | ears(9.8, 6.2)
    fur |= ell(19.0, 15.4, 7.0, 3.6)
    for lx, ly in ((13.4, 17.0), (16.2, 17.0), (21.6, 17.0), (24.2, 17.0)):
        fur |= seg([(lx, ly), (lx + .3, 20.4)], .58)
        fur |= ell(lx + .3, 21.0, 1.8, 1.3)
    fur |= seg([(25.0, 14.6), (27.6, 11.6), (28.2 + wag * .6, 8.2),
                (26.2 + wag, 5.8)], .72)
    return clip(fur), [(5, 9), (10, 9)], {(7, 12)}, 'side'


# ---------------- 渲染 ----------------
def render(fur, eyes_pts, nose_pts, state, cld=None, face='side'):
    g = [['.'] * N for _ in range(N)]
    if cld:
        for x, y in ring(cld):
            g[y][x] = 'o'
        for x, y in cld:
            g[y][x] = 'w'
        bot = max(y for x, y in cld)
        row = sorted(x for x, y in cld if y == bot)
        lo, hi = row[0], row[-1]
        for x in range(lo + 1, hi):
            g[bot][x] = 's'
        span = hi - lo
        for x in range(lo + 2, lo + int(span * .52)):
            if (x, bot - 1) in cld:
                g[bot - 1][x] = 's'
    for x, y in ring(fur):
        if g[y][x] == '.':
            g[y][x] = 'o'
    for x, y in fur:
        g[y][x] = 'c'
    for x, y in eyeb(eyes_pts, state):
        if 0 <= x < N and 0 <= y < N:
            g[y][x] = 'o'
    for x, y in nose_pts:
        if 0 <= x < N and 0 <= y < N:
            g[y][x] = 'o'
    return g


def img(g, k):
    im = Image.new('RGBA', (N, N), NON)
    px = im.load()
    for y in range(N):
        for x in range(N):
            px[x, y] = PAL[g[y][x]]
    return im.resize((N * k, N * k), Image.NEAREST)


# ---------------- 帧表 ----------------
WAGS = {1: -2, 2: -1, 3: 1, 4: 2}

ICON_CLOUD = (16.0, 24.4, 13.4, 5.4)
DRAG_CLOUD = (16.0, 24.0, 13.0, 5.2)
CHAT_CLOUD = (16.0, 26.2, 13.0, 4.4)


def frame(name):
    if name == 'icon-cloud-cat.png':
        f, e, n, _ = cat_lying(0)
        return render(f, e, n, 'open', cloud(*ICON_CLOUD))
    stem = name[:-4]                      # 去掉 .png
    if stem.startswith('jump-'):
        k = int(stem.split('-')[1])
        fn = {1: cat_crouch, 2: cat_airborne, 3: cat_land, 4: cat_standing}[k]
        w = 0 if k <= 2 else 0
        f, e, n, _ = fn(w)
        return render(f, e, n, 'open', None if k <= 2 else cloud(*CHAT_CLOUD))
    if stem.startswith('drag-cloud-'):
        w = WAGS.get(int(stem.split('-')[2]), 0)
        f, e, n, _ = cat_lying(w)
        return render(f, e, n, 'open', cloud(*DRAG_CLOUD))

    grp = stem.split('-')[0]              # left / right / bottom / chat
    parts = stem.split('-')
    if grp == 'chat':
        kind = parts[2]
        w = WAGS.get(int(parts[3]), 0) if kind == 'idle' else 0
    else:
        kind = parts[1]
        w = WAGS.get(int(parts[2]), 0) if kind == 'idle' else 0
    st = {'idle': 'open', 'half': 'half', 'closed': 'closed'}[kind]

    if grp == 'left':
        f, e, n, _ = cat_climb_left(w)
        return render(f, e, n, st)
    if grp == 'right':
        f, e, n, _ = cat_climb_left(w)
        return [r[::-1] for r in render(f, e, n, st)]
    if grp == 'bottom':
        f, e, n, _ = cat_front_bottom(w)
        return render(f, e, n, st)
    if grp == 'chat':
        f, e, n, _ = cat_standing(w)
        return render(f, e, n, st, cloud(*CHAT_CLOUD))
    raise ValueError(name)


NAMES = ['icon-cloud-cat.png'] + \
    [f'left-idle-0{i}.png' for i in range(1, 5)] + ['left-half.png', 'left-closed.png'] + \
    [f'right-idle-0{i}.png' for i in range(1, 5)] + ['right-half.png', 'right-closed.png'] + \
    [f'bottom-idle-0{i}.png' for i in range(1, 5)] + ['bottom-half.png', 'bottom-closed.png'] + \
    [f'drag-cloud-0{i}.png' for i in range(1, 5)] + \
    [f'chat-cloud-idle-0{i}.png' for i in range(1, 5)] + ['chat-cloud-half.png', 'chat-cloud-closed.png'] + \
    [f'jump-0{i}.png' for i in range(1, 5)]


GROUPS = [
    ('left',   [n for n in NAMES if n.startswith('left-')],   False),
    ('right',  [n for n in NAMES if n.startswith('right-')],  False),
    ('bottom', [n for n in NAMES if n.startswith('bottom-')], True),
    ('drag',   [n for n in NAMES if n.startswith('drag-cloud-')], False),
    ('chat',   [n for n in NAMES if n.startswith('chat-cloud-')], False),
    ('jump-a', ['jump-01.png', 'jump-02.png'], False),
    ('jump-b', ['jump-03.png', 'jump-04.png'], False),
    ('icon',   ['icon-cloud-cat.png'], False),
]


def bbox(grid):
    xs, ys = [], []
    for y in range(N):
        for x in range(N):
            if grid[y][x] != '.':
                xs.append(x); ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def shift_grid(grid, dx, dy):
    out = [['.'] * N for _ in range(N)]
    for y in range(N):
        for x in range(N):
            nx, ny = x + dx, y + dy
            if 0 <= nx < N and 0 <= ny < N:
                out[ny][nx] = grid[y][x]
    return out


def normalize(grids, allow_bottom_touch):
    """同组统一平移，保证上下左右各留 1 逻辑像素透明余量。"""
    boxes = [bbox(g) for g in grids]
    if not any(boxes):
        return grids
    minx = min(b[0] for b in boxes if b)
    maxx = max(b[2] for b in boxes if b)
    miny = min(b[1] for b in boxes if b)
    maxy = max(b[3] for b in boxes if b)
    dx, dy = 0, 0
    if minx < 1:
        dx = 1 - minx
    if maxx > N - 2:
        dx = -(maxx - (N - 2))
    if miny < 1:
        dy = 1 - miny
    if not allow_bottom_touch and maxy > N - 2:
        dy = -(maxy - (N - 2))
    return [shift_grid(g, dx, dy) for g in grids]


def main():
    out = sys.argv[1]
    for d in ('png64', 'png512', 'src32'):
        os.makedirs(os.path.join(out, d), exist_ok=True)
    cache = {}
    for gname, names, bottom_touch in GROUPS:
        gs = [frame(n) for n in names]
        gs = normalize(gs, bottom_touch)
        for n, g in zip(names, gs):
            cache[n] = g
    for nm in NAMES:
        g = cache[nm]
        im1 = img(g, 1)
        im1.save(os.path.join(out, 'src32', nm))
        img(g, 2).save(os.path.join(out, 'png64', nm))
        if nm == 'icon-cloud-cat.png':
            img(g, 16).save(os.path.join(out, 'png512', nm))
    # 预览表
    K, pad = 6, 8
    cell = N * K
    cols = 7
    rows = (len(NAMES) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * (cell + pad) + pad, rows * (cell + pad) + pad),
                      (236, 232, 226, 255))
    for i, nm in enumerate(NAMES):
        g = cache[nm]
        tile = Image.new('RGBA', (cell, cell), (250, 247, 242, 255))
        tile.alpha_composite(img(g, K))
        sheet.paste(tile, (pad + (i % cols) * (cell + pad),
                           pad + (i // cols) * (cell + pad)))
    sheet.save(os.path.join(out, 'preview-all.png'))
    print(f'{len(NAMES)} frames written')


if __name__ == '__main__':
    main()
