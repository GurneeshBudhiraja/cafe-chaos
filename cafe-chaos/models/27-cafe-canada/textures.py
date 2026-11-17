"""The winter café's textures: tileable colour (and normal) maps generated with numpy and wired into
the palette's materials, plus world-space box UVs for every part, so the flat-colour build scripts
become textured without touching their geometry.

Exec'd by a build script after its `mat()` palette and `new_obj()` exist:
    exec(open(os.path.join(HERE, 'textures.py')).read())
It replaces `new_obj` with one that projects UVs (box mapping in metres, by each face's dominant
normal, with a horizontal `u` so wood grain runs along logs and planks) scaled by the material's
tile size, and gives each textured material an Image Texture (sRGB colour) and, where it helps,
a normal map derived from the same height field. Materials not listed stay flat.

Why this way (Meta's Quest guidance, see CANADA-PLAN.md): the game swaps every material for a
Lambert twin that keeps `map` and `normalMap`, so colour + normal is what reaches the headset; no
roughness/metal maps (unused), no transparency added, modest texture sizes (256–1024, mipmapped by
three.js), one image per material so a material is still one texture bind.
"""
import numpy as np

TEX_RES = {}      # material name -> texture size (px)
TILE = {}         # material name -> metres per texture repeat
TEX_SEED = 7

def _rng(name):
    return np.random.default_rng(abs(hash(name)) % (2**32) if False else sum(ord(c) * (i + 1) for i, c in enumerate(name)) + TEX_SEED)

def _vnoise(n, cells, rng):
    """Periodic value noise n x n with `cells` lattice points per side (wraps on both edges)."""
    g = rng.random((cells, cells))
    ys = np.linspace(0, cells, n, endpoint=False); xs = ys
    yi = np.floor(ys).astype(int) % cells; xi = np.floor(xs).astype(int) % cells
    yf = (ys - np.floor(ys))[:, None]; xf = (xs - np.floor(xs))[None, :]
    yf = yf * yf * (3 - 2 * yf); xf = xf * xf * (3 - 2 * xf)
    yi2 = (yi + 1) % cells; xi2 = (xi + 1) % cells
    a = g[yi][:, xi]; b = g[yi][:, xi2]; c = g[yi2][:, xi]; d = g[yi2][:, xi2]
    return a * (1 - yf) * (1 - xf) + b * (1 - yf) * xf + c * yf * (1 - xf) + d * yf * xf

def _fbm(n, rng, base=4, octaves=5, gain=0.5):
    out = np.zeros((n, n)); amp = 1.0; tot = 0.0; cells = base
    for _ in range(octaves):
        out += amp * _vnoise(n, cells, rng); tot += amp
        amp *= gain; cells *= 2
    return out / tot

def _voronoi(n, cells, rng):
    """Periodic jittered-grid Voronoi: (distance to nearest, distance to second, cell id) per pixel."""
    pts = (np.indices((cells, cells)).transpose(1, 2, 0) + 0.15 + 0.7 * rng.random((cells, cells, 2))) / cells
    ys, xs = np.mgrid[0:n, 0:n] / n
    d1 = np.full((n, n), 9.0); d2 = np.full((n, n), 9.0); idm = np.zeros((n, n), int)
    cy = np.floor(ys * cells).astype(int); cx = np.floor(xs * cells).astype(int)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            ny = (cy + oy) % cells; nx = (cx + ox) % cells
            py = pts[ny, nx, 0] + oy * (ny != (cy + oy)) * 0 ; px = pts[ny, nx, 1]
            # wrap: the neighbour cell's point, shifted across the tile edge when needed
            py = pts[ny, nx, 0] + np.where(cy + oy < 0, -1, np.where(cy + oy >= cells, 1, 0))
            px = pts[ny, nx, 1] + np.where(cx + ox < 0, -1, np.where(cx + ox >= cells, 1, 0))
            d = np.hypot(ys - py, xs - px)
            closer = d < d1
            d2 = np.where(closer, d1, np.minimum(d2, d)); idm = np.where(closer, ny * cells + nx, idm); d1 = np.where(closer, d, d1)
    return d1, d2, idm

def _grain(n, rng, rings=14, warp=0.18, streak=6, along='u'):
    """Wood grain: rings of a cut log seen as streaks, warped by noise. `along`: the streak axis."""
    ys, xs = np.mgrid[0:n, 0:n] / n
    w = _fbm(n, rng, base=3, octaves=4)
    across = ys if along == 'u' else xs
    g = 0.5 + 0.5 * np.sin((across * rings + warp * w * rings / 3) * 2 * np.pi)
    g = g ** 1.6
    fine = _vnoise(n, max(2, streak), rng) if along == 'u' else _vnoise(n, max(2, streak), rng).T
    return g, w, fine

def _normal_from_height(h, strength=2.0):
    """Tangent-space normals from a height field; the slope is per texel (not per tile), so a
    strength of 1 tilts a 0.1 step by about 6 degrees: relief stays a hint, not stripes."""
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5
    nx = -dx * strength; ny = -dy * strength; nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([0.5 + 0.5 * nx / l, 0.5 + 0.5 * ny / l, 0.5 + 0.5 * nz / l], axis=2)

def _mix(a, b, t):
    return a * (1 - t[..., None]) + np.array(b) * t[..., None]

# ------------------------------------------------------------------ the textures (colour in [0,1], height in [0,1] or None)
def tex_snow(n, rng):
    f = _fbm(n, rng, base=3, octaves=6, gain=0.55)
    drift = _vnoise(n, 2, rng)
    h = 0.6 * f + 0.4 * drift
    col = _mix(np.ones((n, n, 3)) * np.array([0.955, 0.97, 1.0]), [0.80, 0.87, 0.97], np.clip(0.55 - h, 0, 1) * 0.9)
    sparkle = (rng.random((n, n)) > 0.9975).astype(float)
    col = _mix(col, [1.0, 1.0, 1.0], sparkle)
    return col, h

def tex_wood(n, rng, light, dark, rings=14, knots=True, along='u'):
    g, w, fine = _grain(n, rng, rings=rings, along=along)
    col = _mix(np.ones((n, n, 3)) * np.array(light), dark, 0.32 * g + 0.14 * fine)        # soft: a 1:20 miniature's grain, not zebra
    h = 1 - g
    if knots:
        ys, xs = np.mgrid[0:n, 0:n] / n
        for _ in range(2):
            cy, cx = rng.random(), rng.random()
            d = np.hypot((ys - cy + 0.5) % 1 - 0.5, ((xs - cx + 0.5) % 1 - 0.5) * 1.6)
            ring = 0.5 + 0.5 * np.sin(d * 90)
            k = np.clip(1 - d / 0.07, 0, 1)
            col = _mix(col, np.array(dark) * 0.75, k * (0.45 + 0.4 * ring))
            h = h * (1 - k) + k * ring
    return col, h

def tex_planks(n, rng, light, dark, across=4, length=1, gap=0.012, rings=10, weather=0.0):
    """Planks running along u: `across` planks per tile, seams between them, each with its own grain phase."""
    ys, xs = np.mgrid[0:n, 0:n] / n
    row = np.floor(ys * across).astype(int)
    offs = rng.random(across)
    phase = offs[row]
    g, w, fine = _grain(n, rng, rings=rings)
    g = 0.5 + 0.5 * np.sin(((ys * across % 1) * rings + 0.5 * w * rings / 3 + phase * 7) * 2 * np.pi)
    g = g ** 1.5
    tone = 0.85 + 0.3 * offs[row]
    col = _mix(np.ones((n, n, 3)) * np.array(light), dark, 0.42 * g + 0.18 * fine) * tone[..., None]
    seam_y = np.abs((ys * across % 1) - 0.5) > 0.5 - gap * across
    end = (xs * length + phase) % 1
    seam_x = np.abs(end - 0.5) > 0.5 - gap * length * 0.6 if length > 1 else np.zeros_like(seam_y)
    seam = seam_y | seam_x
    col = _mix(col, np.array(dark) * 0.35, seam.astype(float))
    if weather:
        grey = _fbm(n, rng, base=4, octaves=4)
        col = _mix(col, [0.62, 0.60, 0.58], weather * (0.5 + 0.5 * grey))
    h = (1 - 0.6 * g) * (~seam) + 0.0 * seam
    return col, h

def tex_stone(n, rng, light, dark, cells=5):
    """Fieldstone: rounded stones of varied warm and cool greys and tans (as a Canadian river-stone chimney),
    each domed, set in a recessed sandy mortar, with speckle and fine pits. `light`/`dark` set the overall
    tone (the darker material is the same stone in shadow and soot)."""
    d1, d2, idm = _voronoi(n, cells, rng)
    gap = d2 - d1
    stone = np.clip((gap - 0.012) / 0.05, 0, 1)                     # 0 in the mortar, 1 in a stone's middle
    r1 = (np.sin(idm * 12.9898) * 43758.5453) % 1
    r2 = (np.sin(idm * 78.233 + 1.7) * 24634.6345) % 1
    palette = np.array([[0.63, 0.62, 0.61], [0.57, 0.53, 0.47], [0.47, 0.49, 0.53], [0.68, 0.63, 0.55],
                        [0.41, 0.40, 0.41], [0.59, 0.57, 0.53], [0.52, 0.47, 0.42], [0.55, 0.56, 0.58]])
    col = palette[(r1 * len(palette)).astype(int) % len(palette)] * (0.92 + 0.16 * r2)[..., None]
    col = col * (np.mean(light) / 0.60)
    f = _fbm(n, rng, base=10, octaves=4)
    speck = (rng.random((n, n)) > 0.93).astype(float) * 0.10 - (rng.random((n, n)) > 0.95).astype(float) * 0.12
    dome = np.sqrt(stone)
    col = col * (0.80 + 0.22 * dome + 0.10 * (f - 0.5))[..., None] + speck[..., None]
    mortar = np.array([0.70, 0.67, 0.61]) * (np.mean(light) / 0.66) * (0.86 + 0.14 * f)[..., None]
    in_mortar = np.clip(1 - stone / 0.25, 0, 1)
    col = col * (1 - in_mortar[..., None]) + mortar * in_mortar[..., None]
    col = col * (1 - 0.35 * np.clip(0.06 - gap, 0, 0.06) / 0.06)[..., None] * (1 - 0.25 * in_mortar)[..., None]   # shadow in the joints
    h = 0.35 * dome + 0.65 * stone ** 0.5 + 0.05 * f
    return np.clip(col, 0, 1), h

def tex_ice(n, rng):
    d1, d2, idm = _voronoi(n, 6, rng)
    crack = np.clip(1 - (d2 - d1) / 0.006, 0, 1)
    f = _fbm(n, rng, base=2, octaves=6, gain=0.6)
    col = _mix(np.ones((n, n, 3)) * np.array([0.74, 0.86, 0.95]), [0.58, 0.75, 0.90], f * 0.9)
    frost = _fbm(n, rng, base=10, octaves=3)
    col = _mix(col, [0.94, 0.97, 1.0], np.clip(frost - 0.52, 0, 1) * 1.8)
    col = _mix(col, [0.90, 0.95, 1.0], crack * 0.45)
    h = 0.5 + 0.2 * f - 0.25 * crack
    return col, h

def tex_bark(n, rng, light, dark):
    g, w, fine = _grain(n, rng, rings=9, warp=0.6, along='v')
    f = _fbm(n, rng, base=8, octaves=3)
    col = _mix(np.ones((n, n, 3)) * np.array(light), dark, 0.7 * g + 0.3 * f)
    return col, 1 - g

def tex_needles(n, rng, base_c, light_c):
    f = _fbm(n, rng, base=12, octaves=3, gain=0.6)
    fine = _vnoise(n, 64, rng)
    col = _mix(np.ones((n, n, 3)) * np.array(base_c), light_c, np.clip(0.3 * f + 0.7 * fine - 0.25, 0, 1))
    snow = np.clip(_fbm(n, rng, base=5, octaves=3) - 0.62, 0, 1) * 3
    col = _mix(col, [0.95, 0.97, 1.0], np.clip(snow, 0, 1))
    return col, None

def tex_paint(n, rng, base_c, wear_c, lines=0, grain=0.12):
    ys, xs = np.mgrid[0:n, 0:n] / n
    f = _fbm(n, rng, base=4, octaves=4)
    g, w, fine = _grain(n, rng, rings=8, warp=0.3)
    col = _mix(np.ones((n, n, 3)) * np.array(base_c), wear_c, grain * g + 0.08 * f)
    h = np.zeros((n, n))
    if lines:
        line = np.abs((ys * lines % 1) - 0.5) > 0.5 - 0.035
        shade = np.clip(((ys * lines % 1) - 0.8) / 0.2, 0, 1) * 0.25
        col = _mix(col, np.array(base_c) * 0.78, line.astype(float) + shade)
        h = 1 - (ys * lines % 1) * 0.5 - line * 0.5
    return col, h

def tex_plaid(n, rng, a, b, c, bands=4):
    ys, xs = np.mgrid[0:n, 0:n] / n
    def band(t):
        return ((t * bands % 1) > 0.5).astype(float)
    thin = (np.abs((ys * bands % 1) - 0.25) < 0.025).astype(float) + (np.abs((xs * bands % 1) - 0.25) < 0.025).astype(float)
    m = band(ys) + band(xs)
    col = np.where((m == 0)[..., None], np.array(a), np.where((m == 1)[..., None], np.array(b), np.array(c)))
    col = _mix(col, np.array(a) * 1.4, np.clip(thin, 0, 1) * 0.6)
    weave = 0.93 + 0.07 * (0.5 + 0.5 * np.sin(xs * n * 0.9) * np.sin(ys * n * 0.9))
    return col * weave[..., None], None

def tex_fabric(n, rng, base_c):
    ys, xs = np.mgrid[0:n, 0:n] / n
    weave = 0.5 + 0.5 * np.sin(xs * n * 0.7) * np.sin(ys * n * 0.7)
    f = _fbm(n, rng, base=4, octaves=3)
    col = np.ones((n, n, 3)) * np.array(base_c) * (0.9 + 0.12 * weave + 0.06 * f)[..., None]
    return col, None

def tex_chalk(n, rng):
    f = _fbm(n, rng, base=3, octaves=5)
    smudge = np.clip(_fbm(n, rng, base=2, octaves=3) - 0.45, 0, 1)
    col = _mix(np.ones((n, n, 3)) * np.array([0.12, 0.14, 0.13]), [0.30, 0.32, 0.31], 0.4 * f + 0.9 * smudge)
    return col, None

def tex_steel(n, rng):
    ys, xs = np.mgrid[0:n, 0:n] / n
    brush = _vnoise(n, 2, rng) * 0 + np.repeat(rng.random((n, 1)), n, axis=1)
    f = _fbm(n, rng, base=4, octaves=3)
    col = np.ones((n, n, 3)) * np.array([0.74, 0.75, 0.78]) * (0.88 + 0.12 * brush + 0.06 * f)[..., None]
    return col, None

# material name -> (generator, size px, tile metres, normal strength or 0)
SPEC = {
    'Snow':       (lambda n, r: tex_snow(n, r), 1024, 0.22, 6.0),
    'SnowShade':  (lambda n, r: (lambda c: (c[0] * np.array([0.90, 0.94, 0.99]), c[1]))(tex_snow(n, r)), 512, 0.18, 5.0),
    'Pine':       (lambda n, r: tex_wood(n, r, (0.86, 0.67, 0.44), (0.70, 0.50, 0.30), rings=22, knots=True), 512, 0.045, 1.2),
    'PineDark':   (lambda n, r: tex_wood(n, r, (0.64, 0.44, 0.25), (0.44, 0.28, 0.14), rings=24), 256, 0.04, 1.2),
    'Maple':      (lambda n, r: tex_wood(n, r, (0.93, 0.80, 0.58), (0.84, 0.68, 0.46), rings=14, knots=False), 256, 0.06, 0.8),
    'PlankFloor': (lambda n, r: tex_planks(n, r, (0.80, 0.60, 0.38), (0.56, 0.38, 0.20), across=5, length=2), 512, 0.09, 1.5),
    'Deck':       (lambda n, r: tex_planks(n, r, (0.72, 0.62, 0.50), (0.48, 0.40, 0.30), across=6, length=2, weather=0.30), 512, 0.10, 1.5),
    'Red':        (lambda n, r: tex_paint(n, r, (0.72, 0.09, 0.12), (0.50, 0.07, 0.09), grain=0.18), 256, 0.06, 0.5),
    'Cream':      (lambda n, r: tex_paint(n, r, (0.97, 0.93, 0.85), (0.86, 0.80, 0.70), lines=3, grain=0.06), 256, 0.045, 2.0),
    'Ice':        (lambda n, r: tex_ice(n, r), 512, 0.20, 2.0),
    'IceDeep':    (lambda n, r: (lambda c: (c[0] * np.array([0.72, 0.82, 0.92]), c[1]))(tex_ice(n, r)), 256, 0.14, 2.0),
    'Stone':      (lambda n, r: tex_stone(n, r, (0.66, 0.66, 0.67), (0.42, 0.43, 0.46), cells=6), 512, 0.06, 4.0),
    'StoneDark':  (lambda n, r: tex_stone(n, r, (0.46, 0.47, 0.50), (0.30, 0.31, 0.34), cells=4), 256, 0.05, 4.0),
    'Trunk':      (lambda n, r: tex_bark(n, r, (0.50, 0.36, 0.22), (0.28, 0.18, 0.10)), 256, 0.04, 1.5),
    'Spruce':     (lambda n, r: tex_needles(n, r, (0.14, 0.33, 0.24), (0.30, 0.52, 0.36)), 256, 0.05, 0),
    'SpruceLight':(lambda n, r: tex_needles(n, r, (0.24, 0.46, 0.32), (0.42, 0.64, 0.44)), 256, 0.05, 0),
    'Chalk':      (lambda n, r: tex_chalk(n, r), 256, 0.10, 0),
    'Plaid':      (lambda n, r: tex_plaid(n, r, (0.62, 0.14, 0.16), (0.16, 0.14, 0.15), (0.40, 0.14, 0.16)), 256, 0.03, 0),
    'Cushion':    (lambda n, r: tex_fabric(n, r, (0.78, 0.20, 0.22)), 256, 0.03, 0),
    'Steel':      (lambda n, r: tex_steel(n, r), 256, 0.05, 0),
    'PlateEdge':  (lambda n, r: tex_wood(n, r, (0.86, 0.80, 0.70), (0.70, 0.63, 0.52), rings=10, knots=False), 256, 0.08, 0.6),
}

def _image(name, arr, srgb=True):
    H, W = arr.shape[:2]
    img = bpy.data.images.get(name)
    if img and (img.size[0] != W or img.size[1] != H):
        bpy.data.images.remove(img); img = None
    if not img:
        img = bpy.data.images.new(name, W, H, alpha=True)
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'     # before the pixels: changing it afterwards reloads (blanks) a generated image
    rgba = np.concatenate([np.clip(arr, 0, 1), np.ones((H, W, 1))], axis=2).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.update()
    img.pack()
    assert abs(img.pixels[0] - float(rgba[0, 0, 0])) < 0.01, f"{name}: pixels did not take"
    return img

def texture_material(name):
    if name not in SPEC or name not in MATS:
        return
    gen, n, tile, nstr = SPEC[name]
    n = min(n, globals().get('TEX_MAX', 1024))          # the furniture files carry their own copies: smaller there
    m = MATS[name]
    col, h = gen(n, _rng(name))
    nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = _image(f'tex-{name}', col); t.location = (-500, 200)
    t.interpolation = 'Linear'
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if h is not None and nstr:
        nm = _normal_from_height(h, nstr)
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = _image(f'nrm-{name}', nm, srgb=False); tn.location = (-700, -200)
        node = nt.nodes.new('ShaderNodeNormalMap'); node.location = (-350, -200); node.inputs['Strength'].default_value = 1.0
        nt.links.new(tn.outputs['Color'], node.inputs['Color']); nt.links.new(node.outputs['Normal'], bsdf.inputs['Normal'])
    TILE[name] = tile * globals().get('TILE_SCALE', 1.0)       # the furniture is small: it halves the tiles

def box_uv(bm, tile):
    """World-space box projection in metres / tile: faces take the plane of their dominant normal; `u` is
    always a horizontal axis (Blender x for faces toward ±y, y for faces toward ±x), `v` is up for the
    sides, so grain runs along horizontal logs and planks."""
    uv = bm.loops.layers.uv.verify()
    bm.normal_update()
    for f in bm.faces:
        nrm = f.normal; ax = max(range(3), key=lambda i: abs(nrm[i]))
        for l in f.loops:
            co = l.vert.co
            if ax == 2: u, v = co.x, co.y
            elif ax == 1: u, v = co.x, co.z
            else: u, v = co.y, co.z
            l[uv].uv = (u / tile, v / tile)

for _name in list(SPEC):
    texture_material(_name)

_flat_new_obj = new_obj
def new_obj(name, bm, material, parent=None, shade_smooth=False):
    m = MATS[material] if isinstance(material, str) else material
    tile = TILE.get(m.name)
    if tile:
        box_uv(bm, tile)
    if parent is None:
        return _flat_new_obj(name, bm, material, shade_smooth=shade_smooth)
    return _flat_new_obj(name, bm, material, parent, shade_smooth)
print('TEXTURED', sorted(TILE))
