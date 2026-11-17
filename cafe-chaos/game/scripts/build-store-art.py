"""
Store art: builds the logo, the one icon and the covers from the generated
pictures in art/source (see docs/STORE-ART.md).

- art/source/wordmark-magenta.jpg: the "CAFÉ CHAOS" lettering on flat
  magenta. The magenta is keyed out to make the transparent logo.
- art/source/cover-lockup.jpg: the cast on one chair (16:9, cream paper).

Output in art/store (Meta Horizon Store sizes, 24-bit PNG except the logo)
and the app icons in public/icons (the same icon as the store).

Usage: python3 scripts/build-store-art.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art' / 'source'
OUT = ROOT / 'art' / 'store'
ICONS = ROOT / 'public' / 'icons'

MOSS = (61, 97, 54)
MUSTARD = (240, 201, 135)
PAPER = (254, 248, 232)


def key_magenta(path: Path) -> Image.Image:
    """The lettering with the magenta made transparent (and its tint taken off the edges)."""
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(float)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    magenta = np.minimum(r, b) - g
    alpha = 1 - np.clip((magenta - 40) / 110, 0, 1)
    spill = np.clip(magenta, 0, None)
    rgb[..., 0] -= spill
    rgb[..., 2] -= spill
    img = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), 'RGBA')
    # Clear the faint specks, then crop to what is left.
    a = np.asarray(img.getchannel('A')).copy()
    a[a < 12] = 0
    img.putalpha(Image.fromarray(a))
    return img.crop(img.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())


def words(logo: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Split the lettering at the widest empty gap: CAFÉ, and CHAOS with its cup."""
    a = np.asarray(logo.getchannel('A')) > 20
    empty = a.sum(0) == 0
    runs, start = [], None
    for x, e in enumerate(empty):
        if e and start is None:
            start = x
        if not e and start is not None:
            runs.append((x - start, start, x))
            start = None
    _, x0, x1 = max(runs)
    first, second = logo.crop((0, 0, x0, logo.height)), logo.crop((x1, 0, logo.width, logo.height))
    return first.crop(first.getbbox()), second.crop(second.getbbox())


def fit(img: Image.Image, width: int | None = None, height: int | None = None) -> Image.Image:
    s = min(width / img.width if width else 1e9, height / img.height if height else 1e9)
    return img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)


def disc(canvas: Image.Image, cx: float, cy: float, r: float, colour) -> None:
    """A soft-edged disc, drawn at 4× and scaled down."""
    big = Image.new('L', (canvas.width * 4, canvas.height * 4), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(big).ellipse(((cx - r) * 4, (cy - r) * 4, (cx + r) * 4, (cy + r) * 4), fill=255)
    canvas.paste(Image.new('RGB', canvas.size, colour), (0, 0), big.resize(canvas.size, Image.LANCZOS))


def icon(cafe: Image.Image, chaos: Image.Image, size: int, safe: float = 0.8) -> Image.Image:
    """The name stacked on moss, a mustard disc behind; everything inside the centre `safe` circle."""
    c = Image.new('RGB', (size, size), MOSS)
    disc(c, size / 2, size / 2, size * 0.42, MUSTARD)
    # Same letter size on both lines; scale the stack until its corners touch the safe circle.
    gap = -0.04  # the lines tuck together a little (the cup rides over the join)
    w = max(cafe.width, chaos.width)
    th = cafe.height + chaos.height + gap * cafe.height
    r = size * safe / 2
    s = r / ((w / 2) ** 2 + (th / 2) ** 2) ** 0.5
    a, b = fit(cafe, width=round(cafe.width * s)), fit(chaos, width=round(chaos.width * s))
    total = a.height + b.height + round(gap * a.height)
    y = (size - total) // 2
    c.paste(a, ((size - a.width) // 2, y), a)
    c.paste(b, ((size - b.width) // 2, y + a.height + round(gap * a.height)), b)
    return c


def first_letter(word: Image.Image) -> Image.Image:
    """The first letter of a word (the C of CAFÉ), cut at the first empty column."""
    a = np.asarray(word.getchannel('A')) > 20
    cols = a.sum(0)
    x = int(np.argmax(cols[20:] == 0)) + 20 if (cols[20:] == 0).any() else int(np.argmin(cols[20:word.width // 3])) + 20
    letter = word.crop((0, 0, x, word.height))
    return letter.crop(letter.getbbox())


def cup(chaos: Image.Image) -> Image.Image:
    """The tipping cup from above the S (the top right of CHAOS, above the letters)."""
    a = np.asarray(chaos.getchannel('A')) > 20
    # The letters start where most of the width is filled; the cup sits above that.
    rows = a.sum(1)
    top = int(np.argmax(rows > chaos.width * 0.5))
    region = chaos.crop((chaos.width // 2, 0, chaos.width, top))
    return region.crop(region.getbbox())


def small_icon(c: Image.Image, size: int) -> Image.Image:
    out = Image.new('RGB', (size, size), MOSS)
    g = fit(c, width=round(size * 0.94), height=round(size * 0.8))
    out.paste(g, ((size - g.width) // 2, (size - g.height) // 2), g)
    return out


def paper_canvas(art: Image.Image, w: int, h: int, box: tuple[int, int, int, int]) -> Image.Image:
    """Crop `box` from the art onto paper of aspect w:h (paper fills what the art does not cover), at w×h."""
    x0, y0, x1, y1 = box
    region = art.crop((max(0, x0), max(0, y0), min(art.width, x1), min(art.height, y1)))
    canvas = Image.new('RGB', (x1 - x0, y1 - y0), PAPER)
    canvas.paste(region, (max(0, -x0), max(0, -y0)))
    return canvas.resize((w, h), Image.LANCZOS)


def place(canvas: Image.Image, logo: Image.Image, cx: float, cy: float, width: float) -> None:
    g = fit(logo, width=round(width))
    canvas.paste(g, (round(cx - g.width / 2), round(cy - g.height / 2)), g)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)
    logo = key_magenta(SRC / 'wordmark-magenta.jpg')
    pad = 24
    padded = Image.new('RGBA', (logo.width + 2 * pad, logo.height + 2 * pad), (0, 0, 0, 0))
    padded.paste(logo, (pad, pad), logo)
    padded.save(OUT / 'logo.png')
    cafe, chaos = words(logo)

    # The one icon: store, Quest library, shortcut.
    # The store, the library and plain shortcuts are not masked: the name a little larger.
    # A round shortcut mask may cut to the centre 80%: the maskable copy keeps it all inside that.
    master = icon(cafe, chaos, 2048, safe=0.9).resize((512, 512), Image.LANCZOS)
    master.save(OUT / 'icon-512.png')
    master.save(ICONS / 'icon-512.png')
    icon(cafe, chaos, 2048).resize((512, 512), Image.LANCZOS).save(ICONS / 'icon-maskable-512.png')
    icon(cafe, chaos, 1024, safe=0.9).resize((192, 192), Image.LANCZOS).save(ICONS / 'icon-192.png')
    icon(cafe, chaos, 1024, safe=0.9).resize((180, 180), Image.LANCZOS).save(ICONS / 'apple-touch-icon.png')
    # Too small for the name: the C of the logo, on the same moss.
    c_letter = first_letter(cafe)
    small_icon(c_letter, 256).resize((32, 32), Image.LANCZOS).save(ICONS / 'favicon-32.png')
    small_icon(c_letter, 256).resize((48, 48), Image.LANCZOS).save(OUT / 'favicon-48.png')

    # Covers from the lockup (the cast on one chair; group at about x 490-1840, y 260-1100 of 2000×1116).
    art = Image.open(SRC / 'cover-lockup.jpg').convert('RGB')
    sq = paper_canvas(art, 1440, 1440, (400, -300, 1940, 1240))
    place(sq, logo, 720, 245, 1180)
    sq.save(OUT / 'cover-square-1440.png')

    land = paper_canvas(art, 2560, 1440, (-60, -40, 2060, 1153))
    place(land, logo, 2560 * 0.33, 1440 * 0.17, 2560 * 0.5)
    land.save(OUT / 'cover-landscape-2560x1440.png')

    dev = paper_canvas(art, 1500, 1000, (240, -20, 2000, 1153))
    place(dev, logo, 1500 * 0.33, 1000 * 0.16, 1500 * 0.56)
    dev.save(OUT / 'devpost-1500x1000.png')
    print('done:', ', '.join(sorted(p.name for p in OUT.iterdir())))


if __name__ == '__main__':
    main()
