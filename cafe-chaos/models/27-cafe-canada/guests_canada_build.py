"""The Canadian café's guests on the guest rig (base/guest_build.py + guest_anim.py +
guest_accessories.py): three new snack species and a winter wardrobe. Exports
guest-<species>.glb (same nodes, attach points and 10 clips as the Japanese guests) and
accessories-canada.glb (every item carries its `attach` extra, as accessories.glb).

  Blender --background --factory-startup --python guests_canada_build.py -- <out-dir>

Species (each a shape the rig is built on; the game names the guests):
- snowbit:    a round donut hole, golden with a cap of powdered sugar (snow) on top.
- beavertail: a tall flat oval of fried dough, cinnamon-sugar skin, a red maple leaf on its head.
- nanaimo:    a square bar in three layers (chocolate top, custard, coconut crumb), a chocolate curl.
These ship in their own colours (the Japanese guests ship white and are tinted at runtime):
tint them white, or only with very light pastels, or the layers go muddy.

Wardrobe (accessories-canada.glb; the game clones an item onto `St-`/`Se-` + its attach point):
- Toque-<species>     HeadTop  a red knit cap with a cream band and pompom, fitted to each head.
- Earmuffs-<species>  HeadTop  red muffs on a dark band over the head.
- Scarf-<species>     Neck     a red knit scarf wound round the neck, a tail down the front.
- Parka-<species>     Chest    a cream quilted parka with a fur collar and a red zip.
"""
import bpy, bmesh, sys, os, math, json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
BASE = os.path.join(HERE, 'base')

# ------------------------------------------------------------------ the base, with three accents added
src = open(os.path.join(BASE, 'guest_build.py')).read()
ACCENTS = '''
    elif S["accent"] == "snowcap":
        # a cap of powdered sugar (snow) over the crown, two loose drifts
        bm = bmesh.new()
        c = Vector((0, 0, ztop - 0.0014))
        blob(bm, c, (0.0112, 0.0092, 0.0034), seg=16, rings=6)
        blob(bm, c + Vector((0.0068, -0.0040, -0.0018)), (0.0030, 0.0026, 0.0017), seg=8, rings=5)
        blob(bm, c + Vector((-0.0062, 0.0034, -0.0016)), (0.0026, 0.0024, 0.0015), seg=8, rings=5)
        cyl_uv(bm)
        P["Snowcap"] = (bm, [M["sugar"]], tuple(c), True)
    elif S["accent"] == "mapleleaf":
        # a red maple leaf lying over the crown, tilted to the front-right, a short stem behind
        bm = bmesh.new()
        c = Vector((0.0, 0.0, ztop - 0.0006))
        half = [(0.00, 1.00), (0.14, 0.58), (0.40, 0.66), (0.33, 0.40), (0.90, 0.55), (0.72, 0.30), (1.00, 0.05),
                (0.55, -0.08), (0.70, -0.45), (0.28, -0.35), (0.12, -0.60), (0.00, -0.55)]
        pts = half + [(-x, y) for x, y in reversed(half[1:-1])]
        sc = 0.0082; th = 0.0006
        top = [bm.verts.new(c + Vector((x * sc, -y * sc, th))) for x, y in pts]
        bot = [bm.verts.new(c + Vector((x * sc, -y * sc, 0.0))) for x, y in pts]
        fs = [bm.faces.new(top), bm.faces.new(bot[::-1])]
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            fs.append(bm.faces.new((bot[i], bot[j], top[j], top[i])))
        sv = set(capsule(bm, c + Vector((0, 0.0048, 0.0002)), c + Vector((0.0006, 0.0082, 0.0012)), 0.0005, seg=6))
        for f in bm.faces:
            f.material_index = 1 if all(v in sv for v in f.verts) else 0
        rot_q = Vector((0, 0, 1)).rotation_difference(Vector((0.25, -0.62, 1)).normalized())
        for v in bm.verts: v.co = rot_q @ (v.co - c) + c
        cyl_uv(bm)
        P["MapleLeaf"] = (bm, [M["maple"], M["choc"]], tuple(c), False)
    elif S["accent"] == "curl":
        # two chocolate curls standing on the top layer
        bm = bmesh.new()
        c = Vector((0.0, 0.0, ztop - 0.0006))
        capsule(bm, c + Vector((-0.0050, 0.0005, 0)), c + Vector((0.0034, 0.0020, 0.0050)), 0.0014, seg=8)
        capsule(bm, c + Vector((0.0030, -0.0014, 0)), c + Vector((-0.0026, -0.0034, 0.0040)), 0.0012, seg=8)
        cyl_uv(bm)
        P["Curl"] = (bm, [M["choc"]], tuple(c), True)
'''
hook = '    elif S["accent"] == "sprout":'
assert hook in src
src = src.replace(hook, ACCENTS + hook)
gb = {"bpy": bpy, "__name__": "guest_build"}
exec(src, gb)
gb["gb"] = gb
SPECIES = gb["SPECIES"]; ZB = gb["ZB"]; flat_mat = gb["flat_mat"]; _noise = gb["_noise"]

def body_oval(rx=0.0215, ry=0.0120, rz=0.0235):
    """A tall flat oval (the beavertail), its flat bottom at ZB."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=18, radius=1.0)
    zc = ZB + rz
    for v in bm.verts:
        v.co = Vector((v.co.x * rx, v.co.y * ry, zc + v.co.z * rz))
    return bm, zc + rz

SPECIES["snowbit"] = dict(body=lambda: gb["body_ball"](R=0.0195, ry=0.90), EX=0.0072, EZ=0.0342, ERX=0.0024, ERZ=0.0033, MZ=0.0272, BLZ=0.0293, BLX=0.0122,
                          shoulder=(0.0174, -0.001, 0.0260), arm_len=0.0062, hip_x=0.0058, accent="snowcap",
                          skin_rough=0.55, grip=0.035, bubble=0.0675)
SPECIES["beavertail"] = dict(body=body_oval, EX=0.0078, EZ=0.0395, ERX=0.0025, ERZ=0.0034, MZ=0.0315, BLZ=0.0340, BLX=0.0130,
                             shoulder=(0.0195, -0.001, 0.0285), arm_len=0.0064, hip_x=0.0062, accent="mapleleaf",
                             skin_rough=0.68, grip=0.040, bubble=0.0750)
SPECIES["nanaimo"] = dict(body=lambda: gb["body_cube"](hw=0.0190, hd=0.0140, zt=0.0430, r=0.0075), EX=0.0074, EZ=0.0300, ERX=0.0023, ERZ=0.0032, MZ=0.0238, BLZ=0.0258, BLX=0.0128,
                          shoulder=(0.0172, -0.001, 0.0238), arm_len=0.0062, hip_x=0.0062, accent="curl",
                          skin_rough=0.45, grip=0.031, bubble=0.0620)
KINDS = ["snowbit", "beavertail", "nanaimo"]

_base_materials = gb["materials"]
def materials():
    M = _base_materials()
    M["sugar"] = flat_mat("GuestSugar", (0.985, 0.985, 0.995), 0.85)
    M["maple"] = flat_mat("GuestMapleLeaf", (0.80, 0.12, 0.12), 0.6)
    M["choc"] = flat_mat("GuestChoc", (0.26, 0.15, 0.09), 0.5)
    return M
gb["materials"] = materials

_base_make_skin = gb["make_skin"]
def make_skin(name, kind, seed=1, size=256):
    """Skins for the Canadian species (the base paints the Japanese ones). Real colours, not white."""
    if kind not in KINDS:
        return _base_make_skin(name, kind, seed, size)
    rng = np.random.default_rng({"snowbit": 21, "beavertail": 22, "nanaimo": 23}[kind])
    H = W = size
    v = np.linspace(0, 1, H)[:, None] * np.ones((1, W))
    u = np.ones((H, 1)) * np.linspace(0, 1, W)[None, :]
    front = 0.5 - 0.5 * np.cos((u - 0.5) * 2 * math.pi)
    n1 = _noise(H, W, rng, 24); n2 = _noise(H, W, rng, 6); n3 = _noise(H, W, rng, 12)
    if kind == "snowbit":
        # golden fried dough, paler at the seam round the middle, browner toward the bottom, sugar everywhere
        gold = np.array([0.86, 0.60, 0.30]); brown = np.array([0.66, 0.40, 0.17]); pale = np.array([0.93, 0.76, 0.48])
        t = np.clip((0.45 - v) / 0.45, 0, 1) ** 1.4
        col = gold * (1 - t[..., None]) + brown * t[..., None]
        seam = np.exp(-((v - 0.50) / 0.035) ** 2) * (0.6 + 0.4 * n3)
        col = col * (1 - seam[..., None]) + pale * seam[..., None]
        col *= (0.94 + 0.10 * n1 + 0.04 * n2)[..., None]
        col += (0.05 * np.clip(v - 0.62, 0, 1) * front)[..., None]
        sugar = (rng.random((H, W)) > 0.975).astype(float) + (rng.random((H, W)) > 0.93).astype(float) * np.clip((v - 0.6) / 0.3, 0, 1)
        sugar = np.clip(sugar, 0, 1)
        col = col * (1 - 0.9 * sugar[..., None]) + np.array([0.99, 0.98, 0.97]) * 0.9 * sugar[..., None]
    elif kind == "beavertail":
        # fried dough, blotchy, with cinnamon and sugar; darker at the thin edges (the sides)
        tan = np.array([0.88, 0.68, 0.42]); dark = np.array([0.70, 0.46, 0.22])
        blotch = np.clip(n2 * 1.3 - 0.25, 0, 1)
        col = tan * (1 - blotch[..., None]) + dark * blotch[..., None]
        col *= (0.95 + 0.08 * n1)[..., None]
        side = np.clip((np.abs(u - 0.5) - 0.18) / 0.08, 0, 1) * np.clip((np.abs(u - 0.5) < 0.32), 0, 1)
        col *= (1 - 0.10 * side)[..., None]
        cin = (rng.random((H, W)) > 0.978).astype(float)
        sug = (rng.random((H, W)) > 0.982).astype(float)
        col = col * (1 - 0.8 * cin[..., None]) + np.array([0.42, 0.22, 0.10]) * 0.8 * cin[..., None]
        col = col * (1 - 0.85 * sug[..., None]) + np.array([0.99, 0.98, 0.96]) * 0.85 * sug[..., None]
        col += (0.04 * np.clip(v - 0.65, 0, 1) * front)[..., None]
    else:
        # the three layers: chocolate on top, yellow custard, coconut-and-crumb base; wobbly edges
        choc = np.array([0.25, 0.14, 0.09]); custard = np.array([0.97, 0.85, 0.46]); crumb = np.array([0.48, 0.32, 0.18])
        e1 = 0.72 + 0.012 * (n3 - 0.5); e2 = 0.44 + 0.012 * (n2 - 0.5)
        col = np.where((v > e1)[..., None], choc * (0.92 + 0.12 * n1)[..., None],
              np.where((v > e2)[..., None], custard * (0.96 + 0.05 * n1)[..., None], crumb * (0.90 + 0.16 * n1)[..., None]))
        coco = ((rng.random((H, W)) > 0.955) & (v < e2)).astype(float)
        col = col * (1 - 0.85 * coco[..., None]) + np.array([0.97, 0.95, 0.90]) * 0.85 * coco[..., None]
        gloss = np.clip(v - 0.80, 0, 1) * front * 0.10
        col += gloss[..., None]
    col = np.clip(col, 0, 1)
    occ = 1 - 0.05 * np.clip((0.08 - v) / 0.08, 0, 1) - 0.05 * (1 - front) * (1 - v)
    col *= occ[..., None]
    rgba = np.concatenate([col, np.ones((H, W, 1))], axis=2).astype(np.float32)
    img = bpy.data.images.get(name)
    if img and (img.size[0] != W or img.size[1] != H):
        bpy.data.images.remove(img); img = None
    if not img:
        img = bpy.data.images.new(name, W, H, alpha=True)
    img.pixels.foreach_set(rgba.ravel()); img.pack()
    return img
gb["make_skin"] = make_skin

ga = {"gb": gb, "bpy": bpy}
exec(open(os.path.join(BASE, 'guest_anim.py')).read(), ga)
gc = {"gb": gb, "bpy": bpy}
exec(open(os.path.join(BASE, 'guest_accessories.py')).read(), gc)

# ------------------------------------------------------------------ build and animate the three
sc = bpy.data.scenes[0]
for o in list(sc.collection.all_objects):
    bpy.data.objects.remove(o, do_unlink=True)
rigs, M = gb["build_all"](sc, kinds=tuple(KINDS), spacing=0.08)
gb["RIGS"] = rigs
gb["animate_all"]()

# ------------------------------------------------------------------ the wardrobe
REGION = gc["REGION"]; uv_region = gc["uv_region"]; body_shell = gc["body_shell"]; since = gc["since"]
capsule, blob, cyl_uv, flat_bottom, tex_mat = gb["capsule"], gb["blob"], gb["cyl_uv"], gb["flat_bottom"], gb["tex_mat"]
gc["ATTACH_OF"].update({"Toque": "HeadTop", "Earmuffs": "HeadTop", "Scarf": "Neck", "Parka": "Chest"})
ROWS = [["cloth", "linen", "indigo", "dark"], ["red", "gold", "pink", "black"], ["knit_red", "knit_cream", "knit_green", "parka"]]
REGION.clear()
for r, row in enumerate(ROWS):                       # row 0 at the top of the image
    for i, n in enumerate(row):
        REGION[n] = (i * 0.25 + 0.01, (2 - r) / 3 + 0.01, 0.23, 1 / 3 - 0.03)

def atlas_canada(name="GuestAccessoryAtlasCanada", size=258):
    rng = np.random.default_rng(9)
    H = W = size; h = H // 3; w = W // 4
    img = np.zeros((H, W, 4), np.float32); img[..., 3] = 1
    yy, xx = np.mgrid[0:h, 0:w]
    n = rng.random((h, w))
    weave = 0.5 + 0.5 * np.sin(xx * 1.3) * np.sin(yy * 1.3)
    rib = 0.5 + 0.5 * np.sin(xx * 1.05)                                   # vertical knit ribs
    stitch = 0.5 + 0.5 * np.sin(yy * 2.1 + np.sin(xx * 1.05) * 0.8)       # the stitches up each rib
    knit = (0.84 + 0.12 * rib + 0.06 * stitch + 0.02 * n)[..., None]
    quilt = (1 - 0.16 * ((yy % 8) < 2) - 0.04 * np.clip(np.cos((yy % 8) / 8 * 2 * math.pi), 0, 1) + 0.02 * n)[..., None]
    def put(row, col, rgb):
        r0 = (2 - row) * h
        img[r0:r0 + h, col * w:(col + 1) * w, :3] = np.clip(rgb, 0, 1)
    put(0, 0, np.array([0.975, 0.965, 0.935]) * (0.96 + 0.04 * weave + 0.02 * n)[..., None])
    put(0, 1, np.array([0.70, 0.78, 0.63]) * (0.95 + 0.05 * weave + 0.03 * n)[..., None])
    put(0, 2, np.array([0.13, 0.17, 0.36]) * (0.93 + 0.07 * weave + 0.03 * n)[..., None])
    put(0, 3, np.array([0.13, 0.12, 0.12]) * (0.9 + 0.2 * n)[..., None])
    put(1, 0, np.array([0.80, 0.16, 0.18]) * (0.95 + 0.07 * n)[..., None])
    put(1, 1, np.array([0.93, 0.72, 0.30]) * (0.95 + 0.07 * n)[..., None])
    put(1, 2, np.array([0.97, 0.70, 0.76]) * (0.96 + 0.05 * n)[..., None])
    put(1, 3, np.array([0.05, 0.05, 0.06]) * (0.9 + 0.2 * n)[..., None])
    put(2, 0, np.array([0.78, 0.12, 0.14]) * knit)
    put(2, 1, np.array([0.96, 0.92, 0.84]) * knit)
    put(2, 2, np.array([0.20, 0.42, 0.30]) * knit)
    put(2, 3, np.array([0.96, 0.93, 0.86]) * quilt)
    im = bpy.data.images.get(name)
    if im and (im.size[0] != W): bpy.data.images.remove(im); im = None
    if not im: im = bpy.data.images.new(name, W, H, alpha=True)
    im.pixels.foreach_set(img.ravel()); im.pack()
    return im

def body_tree(kind):
    body, ztop = SPECIES[kind]["body"](); flat_bottom(body)
    return BVHTree.FromBMesh(body), body, ztop

def front_y(tree, x, z, fallback=-0.015):
    hit = tree.ray_cast(Vector((x, -0.2, z)), Vector((0, 1, 0)), 0.4)
    return hit[0].y if hit[0] else fallback

def side_x(tree, z, sx):
    hit = tree.ray_cast(Vector((sx * 0.2, 0, z)), Vector((-sx, 0, 0)), 0.4)
    return hit[0].x if hit[0] else sx * 0.018

def toque(kind):
    S = SPECIES[kind]; tree, body, ztop = body_tree(kind); body.free()
    z0 = S["EZ"] + S["ERZ"] + 0.0036
    shell, _ = body_shell(kind, z0, ztop + 0.01, offset=0.0010)                      # the crown over the whole top
    uv_region(shell, shell.faces, "knit_red", scale=1.6)
    n0 = set(shell.faces)
    band, _ = body_shell(kind, z0, z0 + 0.0034, offset=0.0019)                        # the folded band
    for f in band.faces:
        shell.faces.new([shell.verts.new(v.co) for v in f.verts])
    band.free()
    uv_region(shell, since(shell, n0), "knit_cream", scale=1.6)
    n1 = set(shell.faces)
    blob(shell, (0, 0, ztop + 0.0030), (0.0030, 0.0030, 0.0030), seg=10, rings=6)      # the pompom
    uv_region(shell, since(shell, n1), "knit_cream", mode="planar")
    for v in shell.verts: v.co.z -= ztop
    return shell

def earmuffs(kind):
    S = SPECIES[kind]; tree, body, ztop = body_tree(kind); body.free()
    z = S["EZ"] + 0.0006
    bm = bmesh.new()
    n0 = set(bm.faces)
    for sx in (-1, 1):
        x = side_x(tree, z, sx) + sx * 0.0014
        blob(bm, (x, 0, z), (0.0031, 0.0026, 0.0031), seg=10, rings=6)
    uv_region(bm, since(bm, n0), "red", mode="planar")
    n1 = set(bm.faces)
    # the band: an arc of short capsules from muff to muff over the top of the head
    pts = []
    for i in range(9):
        a = math.radians(12 + i * (156 / 8))
        rx = abs(side_x(tree, z, 1)) + 0.0014; rz = ztop - z + 0.0014
        pts.append(Vector((math.cos(a) * rx, 0, z + math.sin(a) * rz)))
    for p, q in zip(pts, pts[1:]):
        capsule(bm, p, q, 0.0007, seg=6)
    uv_region(bm, since(bm, n1), "dark", mode="planar")
    for v in bm.verts: v.co.z -= ztop
    return bm

def scarf(kind):
    S = SPECIES[kind]; tree, body, ztop = body_tree(kind); body.free()
    zN = S["MZ"] - 0.0055
    shell, _ = body_shell(kind, zN - 0.0036, zN + 0.0010, offset=0.0016)
    uv_region(shell, shell.faces, "knit_red", scale=1.6)
    n0 = set(shell.faces)
    yf = front_y(tree, 0.004, zN - 0.006)
    blob(shell, (0.0042, yf - 0.0010, zN - 0.0072), (0.0024, 0.0010, 0.0052), seg=8, rings=6)       # the tail down the front
    uv_region(shell, since(shell, n0), "knit_red", mode="planar", scale=1.6)
    n1 = set(shell.faces)
    blob(shell, (0.0042, yf - 0.0011, zN - 0.0124), (0.0026, 0.0011, 0.0012), seg=8, rings=5)       # cream fringe
    uv_region(shell, since(shell, n1), "knit_cream", mode="planar")
    origin = Vector((0, front_y(tree, 0, zN) - 0.0004, zN))                                      # the Neck attach point
    for v in shell.verts: v.co -= origin
    return shell

def parka(kind):
    S = SPECIES[kind]; tree, body, ztop = body_tree(kind); body.free()
    zN = S["MZ"] - 0.0055; chest_z = (S["MZ"] + ZB) / 2
    shell, _ = body_shell(kind, ZB + 0.0012, zN + 0.0012, offset=0.0011)                        # up to just under the mouth
    uv_region(shell, shell.faces, "parka", scale=1.6)
    n0 = set(shell.faces)
    collar, _ = body_shell(kind, zN + 0.0010, zN + 0.0034, offset=0.0021)                       # fur collar
    for f in collar.faces:
        shell.faces.new([shell.verts.new(v.co) for v in f.verts])
    collar.free()
    uv_region(shell, since(shell, n0), "cloth", scale=1.0)
    n1 = set(shell.faces)
    zs = [zN + 0.0008 - i * 0.0030 for i in range(8)]
    pts = [Vector((0, front_y(tree, 0, z) - 0.0016, z)) for z in zs if z > ZB + 0.0018]
    for p, q in zip(pts, pts[1:]):
        capsule(shell, p, q, 0.00045, seg=6)                                                 # the zip
    for sx in (-1, 1):                                                                        # pockets
        z = ZB + 0.0070
        blob(shell, (sx * 0.0075, front_y(tree, sx * 0.0075, z) - 0.0014, z), (0.0030, 0.0006, 0.0022), seg=8, rings=5)
    uv_region(shell, since(shell, n1), "red", mode="planar")
    origin = gc["chest_attach"](kind, chest_z)
    for v in shell.verts: v.co -= origin
    return shell

acc_mat = tex_mat("GuestAccessoryAtlasCanada", atlas_canada(), 0.62)
made = {}
for col, (name, fn) in enumerate((("Toque", toque), ("Earmuffs", earmuffs), ("Scarf", scarf), ("Parka", parka))):
    for row, kind in enumerate(KINDS):
        bm = fn(kind)
        made[f"{name}-{kind}"] = gc["finish"](bm, f"{name}-{kind}", acc_mat, sc, (0.3 + col * 0.05, 0, -0.05 - row * 0.05))

# ------------------------------------------------------------------ renders
def select_tree(root):
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root] + list(root.children_recursive):
        o.select_set(True)
    bpy.context.view_layer.objects.active = root

scene = sc
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.resolution_x = 1400; scene.render.resolution_y = 700; scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new("W"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.78, 0.88, 0.98, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
scene.world = world
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); scene.collection.objects.link(cam); scene.camera = cam; cam.data.lens = 70
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", 'SUN')); sun.data.energy = 2.6; sun.rotation_euler = (math.radians(50), 0, math.radians(30)); scene.collection.objects.link(sun)
ground = bpy.data.objects.new("Ground", bpy.data.meshes.new("Ground")); scene.collection.objects.link(ground)
g = bmesh.new(); bmesh.ops.create_cube(g, size=1.0)
for v in g.verts: v.co = Vector((v.co.x * 1.2, v.co.y * 0.6, v.co.z * 0.004 - 0.002))
g.to_mesh(ground.data); g.free()
gm = bpy.data.materials.new("GroundSnow"); gm.use_nodes = True; gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.96, 0.975, 1.0, 1); ground.data.materials.append(gm)

def look_at(target, dist, elev=12, azim=-28):
    t = Vector(target); a, e = math.radians(azim), math.radians(elev)
    cam.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()

def shot(name, target, dist, elev=12, azim=-20, w=1400, h=700):
    scene.render.resolution_x = w; scene.render.resolution_y = h
    look_at(target, dist, elev, azim)
    scene.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)

# the seated rigs sit at the same spot as the standing ones; park them behind for the renders
for k in KINDS:
    rigs[k]["seated"].location = (0, 0.06, 0.0)
hide = [o for o in sc.collection.all_objects if o.name.startswith("Toque") or o.name.startswith("Earmuffs") or o.name.startswith("Scarf") or o.name.startswith("Parka")]
for o in hide: o.hide_render = True
gb["preview"](["Idle"], 1)
shot("guests-lineup.png", (0, 0, 0.03), 0.42, elev=10, azim=-6)
for k in KINDS:
    rigs[k]["seated"].location = (0, 0, 0.0)
    rigs[k]["standing"].location = (0, 0.06, 0.0)
gb["preview"](["SitHappy"], 9)
shot("guests-seated.png", (0, 0, 0.03), 0.42, elev=16, azim=8)
for k in KINDS:
    rigs[k]["standing"].location = (0, 0, 0.0); rigs[k]["seated"].location = (0, 0.06, 0.0)
prev = gb["dress"](rigs, made, {"snowbit": ["Toque-snowbit", "Scarf-snowbit"], "beavertail": ["Earmuffs-beavertail", "Parka-beavertail"], "nanaimo": ["Toque-nanaimo", "Parka-nanaimo"]})
gb["preview"](["Idle"], 1)
shot("guests-dressed.png", (0, 0, 0.032), 0.40, elev=10, azim=-6)
gb["preview"](["Walk"], 7)
shot("guests-walk.png", (0, 0, 0.03), 0.40, elev=8, azim=-40)
gb["undress"]()
prev = gb["dress"](rigs, made, {"snowbit": ["Earmuffs-snowbit", "Parka-snowbit"], "beavertail": ["Toque-beavertail", "Scarf-beavertail"], "nanaimo": ["Scarf-nanaimo", "Earmuffs-nanaimo"]})
gb["preview"](["Impatient"], 13)
shot("guests-dressed-2.png", (0, 0, 0.032), 0.40, elev=10, azim=14)
gb["undress"]()
for k in KINDS:
    rigs[k]["seated"].location = (0, 0, 0.0)
for o in hide: o.hide_render = False
gb["preview"](["Idle"], 1)

# ------------------------------------------------------------------ export
report = {}
for k in KINDS:
    root = rigs[k]["root"]
    keep = root.location.copy(); root.location = (0, 0, 0)
    select_tree(root)
    path = os.path.join(OUT, f"guest-{k}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_force_sampling=True, export_optimize_animation_size=False, export_extras=True, export_yup=True, export_apply=False, export_image_format='AUTO')
    root.location = keep
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in root.children_recursive if o.type == 'MESH' and o.name.startswith("St-"))
    report[k] = {"tris_per_pose": tris, "kb": os.path.getsize(path) // 1024}
bpy.ops.object.select_all(action='DESELECT')
for o in made.values():
    o.select_set(True)
bpy.context.view_layer.objects.active = next(iter(made.values()))
path = os.path.join(OUT, "accessories-canada.glb")
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=False, export_extras=True, export_yup=True, export_apply=False, export_image_format='AUTO')
report["accessories"] = {"items": len(made), "kb": os.path.getsize(path) // 1024,
                         "tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in made.values())}
print('RESULT' + json.dumps(report))
