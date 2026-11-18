"""Store covers from the key-art renders: crop each render to its size and lay the one logo over it.

Runs in a background Blender (it reads and writes images with Blender's own image library, so no
Pillow is needed):

  Blender --background --factory-startup --python scripts/compose-covers.py -- <renders-dir> <out-root>

<renders-dir> holds jp-landscape, jp-hero, ca-square and ca-portrait (.png fresh from
scripts/render-key-art.py, or the .jpg copies kept in assets/source/renders). <out-root> gets meta-store/ and devpost/ (normally assets/).
The logo is assets/meta-store/logo.png (the transparent wordmark built by build-store-art.py).
Every cover carries the exact title and nothing else (docs/STORE-ART.md); Meta wants 24-bit PNGs.
"""
import bpy, sys, os
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
RENDERS, OUT = argv[0], argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
# Save pixels exactly as read: no tone mapping on the way out (the default AgX would grey the render a second time).
_vs = bpy.context.scene.view_settings
_vs.view_transform = 'Standard'; _vs.look = 'None'; _vs.exposure = 0.0; _vs.gamma = 1.0
LOGO = os.path.join(HERE, '..', 'assets', 'meta-store', 'logo.png')


def load(path):
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size
    a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a)
    return im, a.reshape(h, w, 4)            # rows bottom-up, as Blender stores them


def resized(path, w, h):
    im = bpy.data.images.load(path, check_existing=False)
    im.scale(w, h)
    a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def crop(arr, x0, y0, w, h):
    """x0, y0 from the top-left (image convention); arr is bottom-up."""
    H = arr.shape[0]
    return arr[H - (y0 + h):H - y0, x0:x0 + w].copy()


def scale_arr(arr, w, h):
    hh, ww = arr.shape[:2]
    im = bpy.data.images.new('tmp', ww, hh, alpha=True)
    im.pixels.foreach_set(arr.ravel())
    im.scale(w, h)
    out = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(out)
    bpy.data.images.remove(im)
    return out.reshape(h, w, 4)


def over(base, logo_w, cx, top):
    """Lay the logo, logo_w wide, centred on cx (fraction of the width), its top at `top` (fraction of the height)."""
    H, W = base.shape[:2]
    lw = int(W * logo_w)
    li, _ = load(LOGO); r = li.size[1] / li.size[0]; bpy.data.images.remove(li)
    lh = int(lw * r)
    logo = resized(LOGO, lw, lh)
    x0 = int(W * cx - lw / 2); y0 = int(H * top)
    x0 = max(0, min(W - lw, x0)); y0 = max(0, min(H - lh, y0))
    region = base[H - (y0 + lh):H - y0, x0:x0 + lw]
    a = logo[..., 3:4]
    region[..., :3] = logo[..., :3] * a + region[..., :3] * (1 - a)
    return base


def save(arr, path):
    h, w = arr.shape[:2]
    arr = arr.copy(); arr[..., 3] = 1.0
    im = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    im.pixels.foreach_set(arr.ravel())
    im.filepath_raw = path; im.file_format = 'PNG'
    sc = bpy.context.scene
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'; sc.render.image_settings.color_depth = '8'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save_render(path, scene=sc)
    bpy.data.images.remove(im)
    print('WROTE', path, w, h)


def render(name):
    path = os.path.join(RENDERS, name + '.png')
    return load(path if os.path.exists(path) else os.path.join(RENDERS, name + '.jpg'))[1]


# Landscape cover 2560x1440: the title upper left, over the soft roof and cherry tree.
land = render('jp-landscape')
save(over(land.copy(), 0.40, 0.25, 0.05), os.path.join(OUT, 'meta-store', 'cover-landscape-2560x1440.png'))
# Devpost thumbnail 1500x1000 (3:2): the landscape cut to 3:2 keeping the hand, then the title upper left.
dev = scale_arr(crop(land, 330, 0, 2160, 1440), 1500, 1000)
save(over(dev, 0.46, 0.27, 0.05), os.path.join(OUT, 'devpost', 'thumbnail-1500x1000.png'))
# Hero 3000x900: the title centred (Meta's rule for the hero).
hero = render('jp-hero')
save(over(hero.copy(), 0.34, 0.5, 0.07), os.path.join(OUT, 'meta-store', 'hero-3000x900.png'))
# Mini landscape 1080x360 (3:1): the hero cut to 3:1, the title centred.
mini = scale_arr(crop(hero, 150, 0, 2700, 900), 1080, 360)
save(over(mini, 0.52, 0.5, 0.10), os.path.join(OUT, 'meta-store', 'mini-landscape-1080x360.png'))
# Square cover 1440x1440: the Canadian café, the title across the cream wall at the top.
sq = render('ca-square')
save(over(sq.copy(), 0.78, 0.5, 0.06), os.path.join(OUT, 'meta-store', 'cover-square-1440x1440.png'))
# Portrait cover 1008x1440: the title across the wall at the top.
po = render('ca-portrait')
save(over(po.copy(), 0.86, 0.5, 0.08), os.path.join(OUT, 'meta-store', 'cover-portrait-1008x1440.png'))
