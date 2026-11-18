"""Every brand asset from the 3D logo (scripts/build-logo-3d.py): the logo on the brand's flat moss field,
at each place's exact size. See docs/STORE-ART.md.

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


def field(w, h=None, colour=None):
    """The brand field: flat moss (or another flat colour)."""
    h = w if h is None else h
    out = np.ones((h, w, 4), np.float32)
    out[..., :3] = MOSS if colour is None else colour
    return out


def card(w, h, logo_w):
    """The logo centred on the brand field, logo_w of the width (never taller than 70% of the height)."""
    lw = min(logo_w, 0.70 * h / w * LOGO.shape[1] / LOGO.shape[0])
    lh = lw * w * LOGO.shape[0] / LOGO.shape[1]
    return over(field(w, h), LOGO, lw, 0.5, (1 - lh / h) / 2)


# ------------------------------------------------------------------ the logo, cropped tight
raw = load(LOGO3D)
ys, xs = np.where(raw[..., 3] > 0.02)
pad = 24
LOGO = raw[max(0, ys.min() - pad):ys.max() + pad + 1, max(0, xs.min() - pad):xs.max() + pad + 1].copy()
save(LOGO, os.path.join(OUT, 'meta-store', 'logo.png'), alpha=True)
# The logo on white, for light backgrounds (print, documents, press).
WHITE = np.array([1.0, 1.0, 1.0], np.float32)
_wh, _ww = int(LOGO.shape[0] * 1.25), int(LOGO.shape[1] * 1.15)
_white = np.ones((_wh, _ww, 4), np.float32)
save(over(_white, LOGO, 1 / 1.15, 0.5, (1 - 1 / 1.25) / 2), os.path.join(OUT, 'meta-store', 'logo-on-white.png'))

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
    big = size * 2
    lh = big * logo_w * art.shape[0] / art.shape[1]
    return scale(over(field(big), art, logo_w, 0.5, (1 - lh / big) / 2), size, size)


save(icon(512, 0.86), os.path.join(OUT, 'meta-store', 'icon-512x512.png'))
save(icon(512, 0.86), os.path.join(ICONS, 'icon-512.png'))
save(icon(512, 0.70), os.path.join(ICONS, 'icon-maskable-512.png'))     # inside the centre 80% circle a round mask keeps
save(icon(192, 0.86), os.path.join(ICONS, 'icon-192.png'))
save(icon(180, 0.86), os.path.join(ICONS, 'apple-touch-icon.png'))
save(icon(32, 0.62, C), os.path.join(ICONS, 'favicon-32.png'))

# ------------------------------------------------------------------ the covers and social: the logo on the brand field
for path, w, h, lw in (
        (('meta-store', 'hero-3000x900.png'), 3000, 900, 0.34),
        (('meta-store', 'cover-landscape-2560x1440.png'), 2560, 1440, 0.56),
        (('meta-store', 'cover-square-1440x1440.png'), 1440, 1440, 0.72),
        (('meta-store', 'cover-portrait-1008x1440.png'), 1008, 1440, 0.80),
        (('meta-store', 'mini-landscape-1080x360.png'), 1080, 360, 0.40),
        (('devpost', 'thumbnail-1500x1000.png'), 1500, 1000, 0.62),
        (('social', 'link-preview-1200x630.png'), 1200, 630, 0.56),
        (('social', 'video-thumbnail-1280x720.png'), 1280, 720, 0.56)):
    save(card(w, h, lw), os.path.join(OUT, *path))
