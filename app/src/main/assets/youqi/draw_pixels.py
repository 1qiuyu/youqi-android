"""Hand-plotted 32px cat sprites. Pillow only; no generative image model."""

import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw

ROOT = Path(__file__).resolve().parent
SIZE = 32
PALETTES = {
    "white": {"line": "#F4F2E9", "fill": None, "eye": "#F4F2E9",
              "cloud": None, "cloud_line": "#A5B8C0"},
    "cream": {"line": "#4B3527", "fill": "#F6D5A0", "eye": "#4B3527",
              "cloud": "#FFF6E2", "cloud_line": "#A5B8C0"},
}


def plot(draw, points, color):
    draw.line(points, fill=color, width=1)


def eyes(draw, x, y, phase, color, gap=4):
    for ex in (x, x + gap):
        if phase == "closed":
            plot(draw, [(ex - 1, y + 1), (ex, y + 1)], color)
        elif phase == "half":
            draw.point((ex, y + 1), fill=color)
        else:
            plot(draw, [(ex, y), (ex, y + 1)], color)


def cloud(draw, palette, y=24):
    shape = [(3, y + 1), (5, y + 1), (5, y), (9, y), (9, y - 1),
             (13, y - 1), (13, y), (20, y), (20, y - 1), (24, y - 1),
             (24, y), (27, y), (27, y + 1), (29, y + 1), (29, y + 3),
             (27, y + 3), (27, y + 4), (6, y + 4), (6, y + 3),
             (3, y + 3), (3, y + 1)]
    draw.polygon(shape, fill=palette["cloud"])
    plot(draw, shape, palette["cloud_line"])


def lying(palette, eye="open", tail=0, with_cloud=True):
    im = Image.new("RGBA", (SIZE, SIZE))
    d = ImageDraw.Draw(im)
    if with_cloud:
        cloud(d, palette)
    # Draw tail and compact body behind the oversized, front-facing head.
    paths = [
        [(24, 22), (28, 22), (29, 20), (29, 18), (28, 17), (27, 17)],
        [(24, 22), (28, 22), (30, 20), (30, 18), (29, 17), (28, 17)],
        [(24, 22), (28, 21), (29, 19), (29, 17), (28, 16), (27, 16)],
        [(24, 22), (28, 23), (30, 21), (30, 19), (29, 18), (28, 18)],
    ]
    plot(d, paths[tail % 4], palette["line"])
    body = [(15, 17), (23, 17), (26, 19), (26, 22), (24, 23),
            (14, 23), (12, 22), (12, 19), (15, 17)]
    d.polygon(body, fill=palette["fill"])
    plot(d, body, palette["line"])
    head = [(4, 19), (4, 14), (5, 14), (5, 10), (6, 10), (10, 13),
            (16, 13), (20, 10), (21, 10), (21, 14), (22, 14),
            (22, 20), (21, 22), (19, 23), (7, 23), (5, 22), (4, 19)]
    if palette["fill"] is None:
        d.polygon(head, fill=(0, 0, 0, 0))
    else:
        d.polygon(head, fill=palette["fill"])
    plot(d, head, palette["line"])
    eyes(d, 9, 18, eye, palette["eye"], gap=9)
    d.point((13, 21), fill=palette["eye"])
    return im


def cloud_peek(palette, eye="half", tail=0):
    """The cloud occludes the torso: only the head and tail are exposed."""
    im = Image.new("RGBA", (SIZE, SIZE))
    d = ImageDraw.Draw(im)
    tails = [
        [(25, 23), (28, 21), (29, 18), (29, 15), (28, 14), (27, 14)],
        [(25, 23), (29, 21), (30, 18), (30, 15), (29, 14), (28, 14)],
        [(25, 23), (27, 21), (28, 18), (28, 14), (27, 13), (26, 13)],
        [(25, 23), (29, 22), (30, 20), (30, 17), (29, 16), (28, 16)],
    ]
    plot(d, tails[tail % 4], palette["line"])
    head = [(4, 17), (4, 12), (5, 12), (5, 8), (6, 8), (10, 11),
            (16, 11), (20, 8), (21, 8), (21, 12), (22, 12),
            (22, 18), (21, 20), (19, 21), (7, 21), (5, 20), (4, 17)]
    d.polygon(head, fill=palette["fill"] or (0, 0, 0, 0))
    plot(d, head, palette["line"])
    eyes(d, 9, 16, eye, palette["eye"], gap=9)
    d.point((13, 19), fill=palette["eye"])
    # Mask behind the foreground cloud, including in the outline-only palette.
    foreground = dict(palette, cloud=palette["cloud"] or (0, 0, 0, 0))
    cloud(d, foreground, 22)
    return im


def sprite(pose, palette="white", eye="open", tail=0):
    p = PALETTES[palette] if isinstance(palette, str) else palette
    if pose in ("drag", "chat"):
        return cloud_peek(p, eye, tail)
    if pose == "icon":
        return lying(p, eye, tail)
    if pose == "bottom":
        return lying(p, eye, tail, False)
    if pose in ("left", "right"):
        im = lying(p, eye, tail, False)
        rotation = Image.Transpose.ROTATE_270 if pose == "left" else Image.Transpose.ROTATE_90
        return im.transpose(rotation)
    raise ValueError(pose)


def png_data(im):
    out = io.BytesIO()
    im.save(out, format="PNG")
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode()


def main():
    assets = ROOT / "sprites"
    assets.mkdir(exist_ok=True)
    frames = {}
    poses = ("icon", "left", "right", "bottom", "drag", "chat")
    for palette in PALETTES:
        frames[palette] = {}
        for pose in poses:
            frames[palette][pose] = {}
            for eye in ("open", "half", "closed"):
                frames[palette][pose][eye] = [png_data(sprite(pose, palette, eye, t))
                                             for t in range(4)]
            base = sprite(pose, palette, "open" if pose == "chat" else "closed")
            base.save(assets / f"{palette}-{pose}-32.png")
            base.resize((512 if pose == "icon" else 64,) * 2,
                        Image.Resampling.NEAREST).save(assets / f"{palette}-{pose}.png")
    # Semantic color slots let the browser recolor exact source pixels, not filters.
    semantic_palette = dict(PALETTES["cream"], eye="#ff00ff")
    slots = {ImageColor.getrgb(semantic_palette[name]): str(index)
             for index, name in enumerate(("line", "fill", "cloud", "cloud_line"), 1)}
    slots[ImageColor.getrgb(semantic_palette["eye"])] = "5"
    maps = {}
    for pose in poses:
        maps[pose] = {}
        for eye in ("open", "half", "closed"):
            maps[pose][eye] = []
            for tail in range(4):
                im = sprite(pose, semantic_palette, eye, tail)
                maps[pose][eye].append("".join(
                    "0" if pixel[3] == 0 else slots[pixel[:3]]
                    for pixel in im.getdata()))
    (ROOT / "frames.js").write_text("window.PIXEL_FRAMES=" + json.dumps(frames) + ";\n"
                                    + "window.PIXEL_MAPS=" + json.dumps(maps) + ";\n")

    # Review strip is a presentation only; sprite PNGs retain actual alpha.
    sheet = Image.new("RGB", (960, 320), "#171819")
    for row, palette in enumerate(PALETTES):
        for col, pose in enumerate(poses):
            im = sprite(pose, palette, "open" if pose == "chat" else "closed").resize((128, 128), Image.Resampling.NEAREST)
            sheet.paste(im, (col * 160 + 16, row * 160 + 16), im)
    sheet.save(ROOT / "pose-review.png")

    animation = []
    order = [0, 1, 2, 1, 0, 3]
    for i in range(36):
        eye = "half" if i in (30, 31) else "closed"
        frame = Image.new("RGB", (512, 256), "#171819")
        for index, palette in enumerate(PALETTES):
            cat = sprite("icon", palette, eye, order[(i // 3) % len(order)])
            cat = cat.resize((192, 192), Image.Resampling.NEAREST)
            frame.paste(cat, (index * 256 + 32, 32), cat)
        animation.append(frame)
    animation[0].save(ROOT / "cat-motion.gif", save_all=True,
                      append_images=animation[1:], duration=140, loop=0, disposal=2)
    assert all(sprite(p).size == (32, 32) for p in poses)
    print("Exported hand-plotted sprites, frame data, review strip and motion preview.")


if __name__ == "__main__":
    main()
