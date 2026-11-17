import bpy, bmesh, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
# gb: the guest build namespace (SPECIES, flat_bottom, capsule, blob, cyl_uv, tex_mat, ZB, mk ...)
SPECIES = gb["SPECIES"]; ZB = gb["ZB"]
capsule, blob, cyl_uv, flat_bottom, tex_mat = gb["capsule"], gb["blob"], gb["cyl_uv"], gb["flat_bottom"], gb["tex_mat"]

# ------------------------------------------------------------------ one atlas for every accessory
# 4 columns x 2 rows of 64 px swatches. top row: cloth (white), linen (sage), indigo seigaiha, dark
#                                      bottom row: red, gold, pink, black
_COLS = ["cloth", "linen", "indigo", "dark"]; _COLS2 = ["red", "gold", "pink", "black"]
REGION = {}
for i, n in enumerate(_COLS): REGION[n] = (i * 0.25 + 0.01, 0.51, 0.23, 0.48)
for i, n in enumerate(_COLS2): REGION[n] = (i * 0.25 + 0.01, 0.01, 0.23, 0.48)

def atlas_image(name="GuestAccessoryAtlas", size=256):
    rng = np.random.default_rng(5)
    H = W = size; h = H // 2; w = W // 4
    img = np.zeros((H, W, 4), np.float32); img[..., 3] = 1
    yy, xx = np.mgrid[0:h, 0:w]
    n = rng.random((h, w))
    weave = 0.5 + 0.5 * np.sin(xx * 1.3) * np.sin(yy * 1.3)
    def put(row, col, rgb):
        r0 = h if row == 0 else 0
        img[r0:r0 + h, col * w:(col + 1) * w, :3] = np.clip(rgb, 0, 1)
    put(0, 0, np.array([0.975, 0.965, 0.935]) * (0.96 + 0.04 * weave + 0.02 * n)[..., None])
    put(0, 1, np.array([0.70, 0.78, 0.63]) * (0.95 + 0.05 * weave + 0.03 * n)[..., None])
    # plain deep indigo with a soft weave (reads crisp at any distance)
    ind = np.ones((h, w, 3)) * np.array([0.13, 0.17, 0.36])
    put(0, 2, ind * (0.93 + 0.07 * weave + 0.03 * n)[..., None])
    put(0, 3, np.array([0.13, 0.12, 0.12]) * (0.9 + 0.2 * n)[..., None])
    put(1, 0, np.array([0.80, 0.16, 0.18]) * (0.95 + 0.07 * n)[..., None])
    put(1, 1, np.array([0.93, 0.72, 0.30]) * (0.95 + 0.07 * n)[..., None])
    put(1, 2, np.array([0.97, 0.70, 0.76]) * (0.96 + 0.05 * n)[..., None])
    put(1, 3, np.array([0.05, 0.05, 0.06]) * (0.9 + 0.2 * n)[..., None])
    im = bpy.data.images.get(name)
    if im and (im.size[0] != W): bpy.data.images.remove(im); im = None
    if not im: im = bpy.data.images.new(name, W, H, alpha=True)
    im.pixels.foreach_set(img.ravel()); im.pack()
    return im

def uv_region(bm, faces, region, mode="cyl", scale=1.0):
    """Project faces' UVs (cylindrical or planar xz) and squeeze them into an atlas region."""
    uv = bm.loops.layers.uv.verify()
    u0, v0, w, hgt = REGION[region]
    for f in faces:
        for l in f.loops:
            x, y, z = l.vert.co
            if mode == "cyl":
                u, v = 0.5 + math.atan2(x, -y) / (2 * math.pi), z * 20 * scale
            else:
                u, v = 0.5 + x * 20 * scale, 0.5 + z * 20 * scale
            u %= 1.0; v %= 1.0
            l[uv].uv = (u0 + u * w, v0 + v * hgt)

# ------------------------------------------------------------------ primitives
def since(bm, before):
    """Faces added since `before` (a set of faces)."""
    return [f for f in bm.faces if f not in before]

def torus(bm, c, R, r, seg=18, ring=7, axis="Y"):
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring_vs = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            rr = R + r * math.cos(b)
            p = (rr * math.cos(a), r * math.sin(b), rr * math.sin(a))   # ring axis = Y
            if axis == "Z": p = (p[0], p[2], p[1])
            ring_vs.append(bm.verts.new(Vector(c) + Vector(p)))
        verts.append(ring_vs)
    fs = []
    for i in range(seg):
        for j in range(ring):
            a, b = verts[i][j], verts[i][(j + 1) % ring]
            c2, d = verts[(i + 1) % seg][(j + 1) % ring], verts[(i + 1) % seg][j]
            fs.append(bm.faces.new((a, b, c2, d)))
    return fs

def body_shell(kind, zmin, zmax, offset=0.0006, keep_front_deg=None, drop_front_deg=None):
    """A thin copy of the body surface between zmin and zmax (optionally only the front
    wedge, or everything except the front wedge), pushed out by `offset`."""
    body, ztop = SPECIES[kind]["body"](); flat_bottom(body)
    body.normal_update()
    for v in body.verts: v.co += v.normal * offset
    def cut(co, no, clear_inner=False, clear_outer=False):
        geom = body.verts[:] + body.edges[:] + body.faces[:]
        bmesh.ops.bisect_plane(body, geom=geom, plane_co=co, plane_no=no, clear_inner=clear_inner, clear_outer=clear_outer)
    cut((0, 0, zmin), (0, 0, 1), clear_inner=True)
    cut((0, 0, zmax), (0, 0, 1), clear_outer=True)
    if keep_front_deg is not None:
        a = math.radians(keep_front_deg)
        cut((0, 0, 0), (-math.cos(a), -math.sin(a), 0), clear_inner=True)
        cut((0, 0, 0), (-math.cos(a), math.sin(a), 0), clear_outer=True)
    if drop_front_deg is not None:
        a = math.radians(drop_front_deg)
        cut((0, 0, 0), (-math.cos(a), -math.sin(a), 0))
        cut((0, 0, 0), (-math.cos(a), math.sin(a), 0))
        drop = [f for f in body.faces if abs(math.atan2(f.calc_center_median().x, -f.calc_center_median().y)) < a - 1e-4]
        bmesh.ops.delete(body, geom=drop, context='FACES')
    return body, ztop

def finish(bm, name, mat, scene, loc, smooth=True):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    me = bpy.data.meshes.new(f"Acc-{name}")
    bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.location = loc
    ob["attach"] = ATTACH_OF[name.split("-")[0]]
    return ob

ATTACH_OF = {"ChefHat": "HeadTop", "Glasses": "Face", "Bow": "Neck", "Beret": "HeadTop",
             "Hachimaki": "HeadTop", "Apron": "Chest", "Vest": "Chest"}

# ------------------------------------------------------------------ the accessories (origin = attach point)
def chef_hat(bm):
    band = bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.0108, radius2=0.0112, depth=0.0062)
    for v in band["verts"]: v.co.z += -0.0005
    uv_region(bm, bm.faces, "cloth")
    n0 = set(bm.faces)
    blob(bm, (0, 0, 0.0075), (0.0130, 0.0125, 0.0068), seg=16, rings=8)
    for a, r in ((20, 0.0095), (140, 0.0092), (260, 0.0097)):
        t = math.radians(a)
        blob(bm, (math.cos(t) * r * 0.55, math.sin(t) * r * 0.55, 0.0090), (0.0058, 0.0056, 0.0045), seg=12, rings=6)
    uv_region(bm, since(bm, n0), "cloth", scale=0.7)

def glasses(bm):
    for sx in (-1, 1):
        torus(bm, (sx * 0.0066, -0.0005, 0), 0.0031, 0.00045)
    capsule(bm, (-0.0035, -0.0005, 0.0002), (0.0035, -0.0005, 0.0002), 0.00040, seg=6)   # bridge
    for sx in (-1, 1):                                                                 # arms back into the head
        capsule(bm, (sx * 0.0097, -0.0003, 0.0003), (sx * 0.0112, 0.0135, 0.0010), 0.00042, seg=6)
    uv_region(bm, bm.faces, "dark", mode="planar")

def bow(bm):
    for sx in (-1, 1):
        vs = blob(bm, (sx * 0.0031, -0.0010, 0.0002), (0.0034, 0.0013, 0.0023), seg=12, rings=7)
        for v in vs:                                    # pinch toward the knot
            k = 1 - 0.55 * max(0.0, 1 - abs(v.co.x) / 0.0031)
            v.co.z = v.co.z * k; v.co.y = -0.0010 + (v.co.y + 0.0010) * k
    blob(bm, (0, -0.0015, 0), (0.0013, 0.0014, 0.0015), seg=10, rings=6)
    for sx in (-1, 1):
        capsule(bm, (sx * 0.0006, -0.0010, -0.0008), (sx * 0.0022, -0.0008, -0.0042), 0.0008, seg=6)
    uv_region(bm, bm.faces, "red", mode="planar")

def beret(bm):
    vs = blob(bm, (0.0015, 0, 0.0018), (0.0135, 0.0128, 0.0048), seg=18, rings=8)
    for v in vs:
        if v.co.z < 0.0018: v.co.z = 0.0018 - (0.0018 - v.co.z) * 0.35
    capsule(bm, (0.001, 0, 0.0062), (0.001, 0, 0.0082), 0.0006, seg=6)
    uv_region(bm, bm.faces, "red", mode="planar")
    # tilt
    q = Vector((0, 0, 1)).rotation_difference(Vector((0.28, -0.1, 1)).normalized())
    for v in bm.verts: v.co = q @ v.co

def hachimaki(kind, bm, ztop):
    S = SPECIES[kind]
    z0 = S["EZ"] + S["ERZ"] + 0.0028
    shell, _ = body_shell(kind, z0, z0 + 0.0048, offset=0.0007)
    uv_region(shell, shell.faces, "cloth")
    # red sun in front
    tree_body, _ = SPECIES[kind]["body"](); flat_bottom(tree_body)
    tree = BVHTree.FromBMesh(tree_body)
    hit = tree.ray_cast(Vector((0, -0.2, z0 + 0.0024)), Vector((0, 1, 0)), 0.4)
    yf = hit[0].y if hit[0] else -0.014
    n0 = set(shell.faces)
    blob(shell, (0, yf - 0.0009, z0 + 0.0024), (0.0017, 0.0005, 0.0017), seg=12, rings=5)
    uv_region(shell, since(shell, n0), "red", mode="planar")
    n1 = set(shell.faces)
    # knot tails at the back
    hitb = tree.ray_cast(Vector((0, 0.2, z0 + 0.0024)), Vector((0, -1, 0)), 0.4)
    yb = hitb[0].y if hitb[0] else 0.014
    for sx in (-1, 1):
        capsule(shell, (sx * 0.0012, yb + 0.0006, z0 + 0.0020), (sx * 0.0040, yb + 0.0016, z0 - 0.0030), 0.0009, seg=6)
    uv_region(shell, since(shell, n1), "cloth", mode="planar")
    tree_body.free()
    for v in shell.verts: v.co.z -= ztop        # origin -> HeadTop
    return shell

def chest_attach(kind, chest_z):
    """The Chest attach point in body space: on the front surface at chest height (as guest_build)."""
    body, _ = SPECIES[kind]["body"](); flat_bottom(body)
    tree = BVHTree.FromBMesh(body)
    hit = tree.ray_cast(Vector((0, -0.2, chest_z)), Vector((0, 1, 0)), 0.4)
    body.free()
    return Vector((0, (hit[0].y if hit[0] else -0.015) - 0.0004, chest_z))

def apron(kind, bm, chest_z):
    S = SPECIES[kind]
    top = S["MZ"] - 0.0048
    shell, _ = body_shell(kind, ZB + 0.0012, top, offset=0.0006, keep_front_deg=60)
    uv_region(shell, shell.faces, "linen")
    n0 = set(shell.faces)
    strap, _ = body_shell(kind, top - 0.0009, top + 0.0003, offset=0.0008)
    me = bpy.data.meshes.new("_tmp"); strap.to_mesh(me); strap.free()
    shell.from_mesh(me); bpy.data.meshes.remove(me)
    uv_region(shell, since(shell, n0), "red")
    # pocket
    n1 = set(shell.faces)
    tree_body, _ = SPECIES[kind]["body"](); flat_bottom(tree_body)
    tree = BVHTree.FromBMesh(tree_body)
    pz = ZB + 0.0012 + (top - ZB - 0.0012) * 0.42
    for (px, pz2) in ((0.0, pz),):
        hit = tree.ray_cast(Vector((px, -0.2, pz2)), Vector((0, 1, 0)), 0.4)
        yf = hit[0].y if hit[0] else -0.014
        blob(shell, (px, yf - 0.0012, pz2), (0.0036, 0.0005, 0.0024), seg=12, rings=5)
    uv_region(shell, since(shell, n1), "cloth", mode="planar")
    tree_body.free()
    at = chest_attach(kind, chest_z)
    for v in shell.verts: v.co -= at          # origin = the Chest attach point
    return shell

def vest(kind, bm, chest_z):
    """A happi vest: a shell from the shoulders down to the waist, open at the front, with a red
    collar along the opening and a red hem."""
    S = SPECIES[kind]
    waist = ZB + 0.0040
    top = S["shoulder"][2] + 0.0045
    OPEN = 24                                             # half-angle of the front opening (deg)
    shell, _ = body_shell(kind, waist, top, offset=0.0006, drop_front_deg=OPEN)
    uv_region(shell, shell.faces, "indigo", scale=1.6)
    n0 = set(shell.faces)
    # hem: a thin band around the bottom edge, also open at the front
    hem, _ = body_shell(kind, waist - 0.0004, waist + 0.0007, offset=0.0009, drop_front_deg=OPEN)
    me = bpy.data.meshes.new("_tmp"); hem.to_mesh(me); hem.free()
    shell.from_mesh(me); bpy.data.meshes.remove(me)
    # collar: rounded strips along both front edges, from the hem up and over the shoulder line
    tree_body, _ = SPECIES[kind]["body"](); flat_bottom(tree_body)
    tree = BVHTree.FromBMesh(tree_body)
    a = math.radians(OPEN + 1)
    zs = np.linspace(waist - 0.0002, top - 0.0004, 7)
    for sx in (-1, 1):
        pts = []
        for z in zs:
            d = Vector((sx * math.sin(a), -math.cos(a), 0))
            hit = tree.ray_cast(Vector((0, 0, z)), d, 0.1)
            p = hit[0] if hit[0] else Vector((sx * 0.01, -0.012, z))
            pts.append(p + d * 0.0012)
        for p0, p1 in zip(pts[:-1], pts[1:]):
            capsule(shell, p0, p1, 0.0009, seg=6)
    uv_region(shell, since(shell, n0), "red", mode="planar")
    tree_body.free()
    at = chest_attach(kind, chest_z)
    for v in shell.verts: v.co -= at          # origin = the Chest attach point
    return shell

def build_accessories(scene):
    for o in list(scene.collection.objects): bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0 and me.name.startswith("Acc-"): bpy.data.meshes.remove(me)
    mat = tex_mat("GuestAccessoryAtlas", atlas_image(), 0.62)
    made = {}
    generic = [("ChefHat", chef_hat), ("Glasses", glasses), ("Bow", bow), ("Beret", beret)]
    for i, (name, fn) in enumerate(generic):
        bm = bmesh.new(); fn(bm)
        made[name] = finish(bm, name, mat, scene, (-0.09 + i * 0.045, 0, 0.0))
    kinds = list(SPECIES)
    for row, kind in enumerate(kinds):
        body, ztop = SPECIES[kind]["body"](); body.free()
        S = SPECIES[kind]
        chest_z = (S["MZ"] + ZB) / 2
        bm = hachimaki(kind, None, ztop)
        made[f"Hachimaki-{kind}"] = finish(bm, f"Hachimaki-{kind}", mat, scene, (-0.09, 0, -0.05 - row * 0.05))
        bm = apron(kind, None, chest_z)
        made[f"Apron-{kind}"] = finish(bm, f"Apron-{kind}", mat, scene, (-0.03, 0, -0.05 - row * 0.05))
        bm = vest(kind, None, chest_z)
        made[f"Vest-{kind}"] = finish(bm, f"Vest-{kind}", mat, scene, (0.03, 0, -0.05 - row * 0.05))
    return made

# -------- dress guests for preview: linked copies parented to the attach points
def dress(rigs, made, outfit):
    """outfit = {kind: [accessory names]}; returns the preview objects (delete before export)."""
    sc = bpy.context.scene
    objs = []
    for kind, names in outfit.items():
        R = rigs[kind]
        for n in names:
            src = made[n]
            for side in ("St", "Se"):
                at = R[side][src["attach"]]
                ob = bpy.data.objects.new(f"_prev-{side}-{n}", src.data)
                sc.collection.objects.link(ob)
                ob.parent = at
                objs.append(ob)
    return objs

def undress():
    for o in list(bpy.data.objects):
        if o.name.startswith("_prev-"): bpy.data.objects.remove(o, do_unlink=True)

gb["build_accessories"] = build_accessories; gb["dress"] = dress; gb["undress"] = undress
