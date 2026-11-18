"""Every brand asset from two sources: the 3D logo (scripts/build-logo-3d.py) and the 3D key-art renders
(scripts/render-key-art.py). See docs/STORE-ART.md.

Runs in a background Blender (it reads and writes images with Blender's own image library, so no
Pillow is needed):

  Blender --background --factory-startup --python scripts/build-brand-assets.py -- <out-root> [<renders-dir>]

<out-root> is normally assets/ (the app icons go to <out-root>/../public/icons when it is assets/,
else to <out-root>/icons). <renders-dir> defaults to assets/source/renders and holds jp-landscape,
jp-hero, ca-square and ca-portrait (.png or .jpg). The logo is assets/source/logo/logo-3d.png.

Writes
  meta-store/  logo.png (transparent), icon-512x512.png, hero-3000x900.png, cover-landscape-2560x1440.png,
               cover-square-1440x1440.png, cover-portrait-1008x1440.png, mini-landscape-1080x360.png
  devpost/     thumbnail-1500x1000.png
  social/      link-preview-1200x630.png, video-thumbnail-1280x720.png
  icons        icon-512.png, icon-maskable-512.png, icon-192.png, apple-touch-icon.png, favicon-32.png
Every cover carries the exact title and nothing else; Meta wants 24-bit PNGs (the logo alone keeps its alpha).
"""
import bpy, sys, os
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.join(HERE, '..')
OUT = argv[0]
RENDERS = argv[1] if len(argv) > 1 else os.path.join(GAME, 'assets', 'source', 'renders')
ICONS = os.path.join(GAME, 'public', 'icons') if os.path.abspath(OUT) == os.path.abspath(os.path.join(GAME, 'assets')) else os.path.join(OUT, 'icons')
LOGO3D = os.path.join(GAME, 'assets', 'source', 'logo', 'logo-3d.png')

# Save pixels exactly as read: no tone mapping on the way out (the default AgX would grey them a second time).
_vs = bpy.context.scene.view_settings
_vs.view_transform = 'Standard'; _vs.look = 'None'; _vs.exposure = 0.0; _vs.gamma = 1.0


def srgb(h):
    return np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], np.float32)


MOSS, LANTERN = srgb(0x3d6136), srgb(0xf0c987)


# ------------------------------------------------------------------ image helpers (arrays are top-down here)
def load(path):
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size
    a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    return a.reshape(h, w, 4)[::-1].copy()          # Blender stores rows bottom-up


def scale(arr, w, h):
    hh, ww = arr.shape[:2]
    im = bpy.data.images.new('tmp', ww, hh, alpha=True)
    im.pixels.foreach_set(arr[::-1].ravel())
    im.scale(w, h)
    out = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(out)
    bpy.data.images.remove(im)
    return out.reshape(h, w, 4)[::-1].copy()


def save(arr, path, alpha=False):
    h, w = arr.shape[:2]
    arr = arr.copy()
    if not alpha:
        arr[..., 3] = 1.0
    im = bpy.data.images.new(os.path.basename(path), w, h, alpha=alpha)
    im.pixels.foreach_set(arr[::-1].ravel())
    sc = bpy.context.scene
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA' if alpha else 'RGB'
    sc.render.image_settings.color_depth = '8'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save_render(path, scene=sc)
    bpy.data.images.remove(im)
    print('WROTE', path, w, h)


def render(name):
    p = os.path.join(RENDERS, name + '.png')
    return load(p if os.path.exists(p) else os.path.join(RENDERS, name + '.jpg'))


def crop(arr, x0, y0, w, h):
    return arr[y0:y0 + h, x0:x0 + w].copy()


def over(base, logo, width_frac, cx, top):
    """Lay the logo, width_frac of the base's width, centred on cx (a fraction of the width), its top at `top`."""
    H, W = base.shape[:2]
    lw = int(W * width_frac); lh = int(lw * logo.shape[0] / logo.shape[1])
    lg = scale(logo, lw, lh)
    x0 = max(0, min(W - lw, int(W * cx - lw / 2))); y0 = max(0, min(H - lh, int(H * top)))
    region = base[y0:y0 + lh, x0:x0 + lw]
    a = lg[..., 3:4]
    region[..., :3] = lg[..., :3] * a + region[..., :3] * (1 - a)
    return base


def field(size, glow=0.40):
    """The brand field: moss, with a soft lantern glow in the middle (the café's lamplight)."""
    h = w = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - w / 2) / w) ** 2 + ((yy - h / 2) / h) ** 2)
    t = np.clip(1 - r / glow, 0, 1) ** 2 * 0.55
    out = np.ones((h, w, 4), np.float32)
    out[..., :3] = MOSS * (1 - t[..., None]) + LANTERN * t[..., None]
    return out


# ------------------------------------------------------------------ the logo, cropped tight
raw = load(LOGO3D)
ys, xs = np.where(raw[..., 3] > 0.02)
pad = 24
LOGO = raw[max(0, ys.min() - pad):ys.max() + pad + 1, max(0, xs.min() - pad):xs.max() + pad + 1].copy()
save(LOGO, os.path.join(OUT, 'meta-store', 'logo.png'), alpha=True)

# The C of CHAOS alone, for the favicon (48 px and less: the name does not read there). The letters touch,
# so the C is cut by width: CHAOS fills the lower part of the logo, the C is its first fifth.
lower = LOGO[int(LOGO.shape[0] * 0.40):]
on = np.where((lower[..., 3] > 0.3).any(0))[0]
cw = int((on.max() - on.min()) * 0.19)
C = lower[:, on.min() - 6:on.min() + cw].copy()
rows = np.where((C[..., 3] > 0.3).any(1))[0]
C = C[max(0, rows.min() - 6):rows.max() + 7]

# ------------------------------------------------------------------ the icon (store, library, shortcut)
def icon(size, logo_w, art=LOGO):
    base = field(size * 2)
    base = over(base, art, logo_w, 0.5, 0.0)
    # centre the logo vertically
    lh = int(size * 2 * logo_w * art.shape[0] / art.shape[1])
    base2 = field(size * 2)
    base2 = over(base2, art, logo_w, 0.5, (1 - lh / (size * 2)) / 2)
    return scale(base2, size, size)


save(icon(512, 0.86), os.path.join(OUT, 'meta-store', 'icon-512x512.png'))
save(icon(512, 0.86), os.path.join(ICONS, 'icon-512.png'))
save(icon(512, 0.70), os.path.join(ICONS, 'icon-maskable-512.png'))     # inside the centre 80% circle a round mask keeps
save(icon(192, 0.86), os.path.join(ICONS, 'icon-192.png'))
save(icon(180, 0.86), os.path.join(ICONS, 'apple-touch-icon.png'))
save(icon(32, 0.62, C), os.path.join(ICONS, 'favicon-32.png'))

# ------------------------------------------------------------------ the covers
land = render('jp-landscape')
save(over(land.copy(), LOGO, 0.30, 0.20, 0.04), os.path.join(OUT, 'meta-store', 'cover-landscape-2560x1440.png'))
dev = scale(crop(land, 330, 0, 2160, 1440), 1500, 1000)
save(over(dev, LOGO, 0.36, 0.23, 0.04), os.path.join(OUT, 'devpost', 'thumbnail-1500x1000.png'))
hero = render('jp-hero')
save(over(hero.copy(), LOGO, 0.27, 0.5, 0.04), os.path.join(OUT, 'meta-store', 'hero-3000x900.png'))
mini = scale(crop(hero, 150, 0, 2700, 900), 1080, 360)
save(over(mini, LOGO, 0.38, 0.5, 0.05), os.path.join(OUT, 'meta-store', 'mini-landscape-1080x360.png'))
sq = render('ca-square')
save(over(sq.copy(), LOGO, 0.60, 0.5, 0.03), os.path.join(OUT, 'meta-store', 'cover-square-1440x1440.png'))
po = render('ca-portrait')
save(over(po.copy(), LOGO, 0.80, 0.5, 0.05), os.path.join(OUT, 'meta-store', 'cover-portrait-1008x1440.png'))

# ------------------------------------------------------------------ social
share = scale(crop(land, 0, 48, 2560, 1344), 1200, 630)
save(over(share, LOGO, 0.34, 0.22, 0.05), os.path.join(OUT, 'social', 'link-preview-1200x630.png'))
vid = scale(land, 1280, 720)
save(over(vid, LOGO, 0.40, 0.25, 0.04), os.path.join(OUT, 'social', 'video-thumbnail-1280x720.png'))
