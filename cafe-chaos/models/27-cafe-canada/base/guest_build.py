import bpy, bmesh, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# =====================================================================================
#  Café Chaos guests. Blender metres, Z up, the character faces -Y.
#  One shared rig (legs, arms, 12 face decals, anchors, attach points) is built on top of
#  a per-species body shape. Species: mochi (ball), onigiri (rounded triangle),
#  tofu (rounded square).
# =====================================================================================

ZB = 0.009            # body bottom (legs below it)
TORSO = (0, 0, ZB)    # squash pivot
RAISE = 0.008         # the body sits this much higher than the shapes are drawn, so the legs show
HIP_Z, KNEE_Z, ANKLE_Z = ZB + RAISE + 0.0005, 0.0097, 0.0022   # leg joints (feet rest on z = 0)

# ------------------------------------------------------------------ small helpers
def ellipse_pts(cx, cz, rx, rz, seg=20, a0=0.0, a1=2 * math.pi):
    return [(cx + rx * math.cos(a0 + (a1 - a0) * i / seg), cz + rz * math.sin(a0 + (a1 - a0) * i / seg))
            for i in range(seg)]

def arc_pts(cx, cz, r, a0, a1, w, seg=10):
    a0, a1 = math.radians(a0), math.radians(a1)
    outer = [(cx + (r + w / 2) * math.cos(a0 + (a1 - a0) * i / seg), cz + (r + w / 2) * math.sin(a0 + (a1 - a0) * i / seg)) for i in range(seg + 1)]
    inner = [(cx + (r - w / 2) * math.cos(a0 + (a1 - a0) * i / seg), cz + (r - w / 2) * math.sin(a0 + (a1 - a0) * i / seg)) for i in range(seg + 1)]
    return outer + inner[::-1]

def bar_pts(x0, z0, x1, z1, w):
    dx, dz = x1 - x0, z1 - z0
    L = math.hypot(dx, dz); nx, nz = -dz / L * w / 2, dx / L * w / 2
    return [(x0 + nx, z0 + nz), (x1 + nx, z1 + nz), (x1 - nx, z1 - nz), (x0 - nx, z0 - nz)]

def capsule(bm, p0, p1, r, seg=10):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=8, radius=r)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    for v in res["verts"]:
        lo = v.co.copy()
        if lo.z > 0: lo.z += d.length
        v.co = q @ lo + p0
    return res["verts"]

def blob(bm, c, r, seg=10, rings=8):
    res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in res["verts"]:
        v.co = Vector((c[0] + v.co.x * r[0], c[1] + v.co.y * r[1], c[2] + v.co.z * r[2]))
    return res["verts"]

def cyl_uv(bm, v0=0.006, vh=0.05):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            x, y, z = l.vert.co
            l[uv].uv = (0.5 + math.atan2(x, -y) / (2 * math.pi), (z - v0) / vh)

def mk(name, bm, mats, parent, pivot, parent_pivot=(0, 0, 0), scene=None, smooth=False):
    me = bpy.data.meshes.new(name)
    for v in bm.verts: v.co -= Vector(pivot)
    bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    (scene or bpy.context.scene).collection.objects.link(ob)
    ob.parent = parent
    ob.location = Vector(pivot) - Vector(parent_pivot)
    return ob

def mk_empty(name, parent, loc, scene=None, size=0.004):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    (scene or bpy.context.scene).collection.objects.link(e)
    e.parent = parent; e.location = loc
    return e

def flat_mat(name, color, rough=0.5, emit=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*color, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m

def tex_mat(name, img, rough=0.6):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled"); b.location = (-300, 0)
    t = nt.nodes.new("ShaderNodeTexImage"); t.location = (-700, 0); t.image = img
    t.interpolation = 'Linear'
    # texture x Tint -> base colour. Tint is white in the file; the game sets it per guest
    # (it exports as the glTF baseColorFactor, so it is the material's `color` in three.js).
    mix = nt.nodes.new("ShaderNodeMix"); mix.location = (-500, 0); mix.name = mix.label = "Tint"
    mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs["Factor"].default_value = 1.0
    nt.links.new(t.outputs["Color"], mix.inputs[6])
    mix.inputs[7].default_value = (1, 1, 1, 1)
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    b.inputs["Roughness"].default_value = rough
    return m

def set_tint(kind, rgb):
    """Preview helper: tint a species' skin material (reset to (1,1,1) before export)."""
    m = bpy.data.materials[f"GuestSkin-{kind}"]
    m.node_tree.nodes["Tint"].inputs[7].default_value = (*rgb, 1)

# ------------------------------------------------------------------ painted textures (256 px)
def _noise(h, w, rng, scale):
    """Soft blurred noise in [0,1]."""
    small = rng.random((max(2, h // scale), max(2, w // scale)))
    ys = np.linspace(0, small.shape[0] - 1, h); xs = np.linspace(0, small.shape[1] - 1, w)
    yi = np.floor(ys).astype(int); xi = np.floor(xs).astype(int)
    yf = (ys - yi)[:, None]; xf = (xs - xi)[None, :]
    yi2 = np.minimum(yi + 1, small.shape[0] - 1); xi2 = np.minimum(xi + 1, small.shape[1] - 1)
    a = small[yi][:, xi]; b = small[yi][:, xi2]; c = small[yi2][:, xi]; d = small[yi2][:, xi2]
    return a * (1 - yf) * (1 - xf) + b * (1 - yf) * xf + c * yf * (1 - xf) + d * yf * xf

def make_skin(name, kind, seed=1, size=256):
    rng = np.random.default_rng(seed)
    H = W = size
    v = np.linspace(0, 1, H)[:, None] * np.ones((1, W))      # v: 0 bottom .. 1 top (z)
    u = np.ones((H, 1)) * np.linspace(0, 1, W)[None, :]     # u: around (0.5 = front)
    front = 0.5 - 0.5 * np.cos((u - 0.5) * 2 * math.pi)     # 1 at the front, 0 at the back
    n1 = _noise(H, W, rng, 24); n2 = _noise(H, W, rng, 6)
    if kind == "mochi":
        # neutral white so a runtime tint shows true; only a soft shade toward the feet
        base = np.array([0.99, 0.985, 0.98])
        bottom = np.array([0.95, 0.935, 0.935])
        t = np.clip((0.42 - v) / 0.42, 0, 1) ** 1.6
        col = base * (1 - t[..., None]) + bottom * t[..., None]
        col *= (0.97 + 0.06 * n1)[..., None]
        col += (0.04 * np.clip(v - 0.65, 0, 1) * front)[..., None]        # top highlight
        # fine powdery speckle
        sp = (rng.random((H, W)) > 0.985).astype(float)
        col -= (0.05 * sp)[..., None]
    elif kind == "onigiri":
        base = np.array([0.98, 0.98, 0.97])
        col = base * (0.96 + 0.07 * n2)[..., None]
        # rice grains: soft small ovals
        grain = np.zeros((H, W))
        for _ in range(900):
            cy, cx = rng.integers(0, H), rng.integers(0, W)
            ang = rng.random() * math.pi
            yy, xx = np.ogrid[-4:5, -4:5]
            xr = xx * math.cos(ang) + yy * math.sin(ang); yr = -xx * math.sin(ang) + yy * math.cos(ang)
            g = np.clip(1 - (xr / 3.6) ** 2 - (yr / 1.6) ** 2, 0, 1)
            ys = (cy + yy) % H; xs = (cx + xx) % W
            grain[ys, xs] = np.maximum(grain[ys, xs], g)
        col = col * (1 - 0.10 * grain)[..., None] + 0.08 * grain[..., None]
        # nori band: lower front, slightly higher in the middle, with a torn edge
        edge = 0.19 + 0.02 * _noise(H, W, rng, 10) + 0.03 * front
        lo = 0.05 + 0.01 * _noise(H, W, rng, 16)
        side = np.clip((np.abs(u - 0.5) - 0.20) / 0.01, 0, 1)        # wraps the front ~145 deg
        band = ((v < edge) & (v > lo)).astype(float) * (1 - side)
        nori = np.array([0.10, 0.17, 0.11]) * (0.85 + 0.3 * n2)[..., None] + (0.05 * n1)[..., None]
        nori += (0.04 * (rng.random((H, W)) > 0.95).astype(float))[..., None]
        col = col * (1 - band[..., None]) + nori * band[..., None]
    elif kind == "tofu":
        base = np.array([0.985, 0.98, 0.965])
        col = base * (0.97 + 0.05 * n1)[..., None]
        col -= (0.03 * n2)[..., None]
        # tiny pores
        pores = (rng.random((H, W)) > 0.993).astype(float)
        col -= (0.06 * pores)[..., None]
        col += (0.03 * np.clip(v - 0.7, 0, 1))[..., None]
    col = np.clip(col, 0, 1)
    # soft occlusion toward the very bottom and the back
    occ = 1 - 0.04 * np.clip((0.08 - v) / 0.08, 0, 1) - 0.05 * (1 - front) * (1 - v)
    col *= occ[..., None]
    rgba = np.concatenate([col, np.ones((H, W, 1))], axis=2).astype(np.float32)
    img = bpy.data.images.get(name)
    if img and (img.size[0] != W or img.size[1] != H):
        bpy.data.images.remove(img); img = None
    if not img:
        img = bpy.data.images.new(name, W, H, alpha=True)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img

# ------------------------------------------------------------------ body shapes
def body_ball(R=0.0188, ry=0.86):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=18, radius=1.0)
    zc = ZB + R
    for v in bm.verts:
        v.co = Vector((v.co.x * R, v.co.y * R * ry, zc + v.co.z * R))
    return bm, zc + R

def _bevel_all(bm, offset, seg):
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=offset, segments=seg, profile=0.5, affect='EDGES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

def body_tri(hw=0.0235, hd=0.0150, zt=0.0505, r=0.0130):
    """Rounded triangle (point up) with depth 2*hd. The flat bottom sits at ZB."""
    bm = bmesh.new()
    # the raw prism is a touch bigger than the target so the rounding lands on the target size
    zb = ZB - 0.0015
    hw2 = hw + 0.004; zt2 = zt + 0.006
    f = [bm.verts.new((-hw2, -hd, zb)), bm.verts.new((hw2, -hd, zb)), bm.verts.new((0, -hd, zt2))]
    b = [bm.verts.new((-hw2, hd, zb)), bm.verts.new((hw2, hd, zb)), bm.verts.new((0, hd, zt2))]
    bm.faces.new(f[::-1]); bm.faces.new(b)
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((f[i], f[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _bevel_all(bm, r, 7)
    # gentle belly: puff the big faces outward so nothing reads as a flat plane
    for v in bm.verts:
        d = Vector((v.co.x, v.co.y, 0))
        v.co += Vector((0, math.copysign(1, v.co.y) * 0.0012 * (1 - min(1, abs(v.co.y) / hd)), 0)) * 0
    zmax = max(v.co.z for v in bm.verts)
    return bm, zmax

def body_cube(hw=0.0175, hd=0.0150, zt=0.0445, r=0.0095):
    bm = bmesh.new()
    zb = ZB - 0.0015
    res = bmesh.ops.create_cube(bm, size=1.0)
    for v in res["verts"]:
        v.co = Vector(((hw + 0.003) * math.copysign(1, v.co.x), (hd + 0.003) * math.copysign(1, v.co.y),
                       zb if v.co.z < 0 else zt + 0.003))
    _bevel_all(bm, r, 7)
    zmax = max(v.co.z for v in bm.verts)
    return bm, zmax

def flat_bottom(bm, zb=ZB, soften=0.5):
    for v in bm.verts:
        if v.co.z < zb: v.co.z = zb - (zb - v.co.z) * soften

# ------------------------------------------------------------------ species table
SPECIES = {
    "mochi": dict(body=body_ball, EX=0.0070, EZ=0.0335, ERX=0.0023, ERZ=0.0032, MZ=0.0268, BLZ=0.0288, BLX=0.0118,
                  shoulder=(0.0168, -0.001, 0.0255), arm_len=0.0062, hip_x=0.0058, accent="hairpin",
                  skin_rough=0.62, grip=0.034, bubble=0.0655),
    "onigiri": dict(body=body_tri, EX=0.0060, EZ=0.0300, ERX=0.0021, ERZ=0.0030, MZ=0.0240, BLZ=0.0262, BLX=0.0105,
                    shoulder=(0.0165, -0.001, 0.0225), arm_len=0.0060, hip_x=0.0060, accent="leaf",
                    skin_rough=0.70, grip=0.032, bubble=0.064),
    "tofu": dict(body=body_cube, EX=0.0070, EZ=0.0310, ERX=0.0023, ERZ=0.0032, MZ=0.0245, BLZ=0.0265, BLX=0.0120,
                 shoulder=(0.0160, -0.001, 0.0245), arm_len=0.0062, hip_x=0.0060, accent="sprout",
                 skin_rough=0.50, grip=0.032, bubble=0.0620),
}

EXPRESSIONS = ["EyesOpen", "EyesWide", "WidePupils", "EyesHappy", "EyesClosed", "EyesCross",
               "MouthSmile", "MouthOpen", "MouthO", "MouthFrown", "MouthNom", "Blush"]
DEFAULT_ON = {"EyesOpen", "MouthSmile", "Blush"}
ATTACH = ["HeadTop", "Face", "Neck", "Chest", "Guitar"]

def materials():
    M = {}
    M["eye"] = flat_mat("GuestEye", (0.08, 0.055, 0.05), 0.75)
    M["shine"] = flat_mat("GuestEyeShine", (1, 1, 1), 0.2, emit=0.4)
    M["white"] = flat_mat("GuestEyeWhite", (0.98, 0.98, 0.98), 0.4)
    M["mouth"] = flat_mat("GuestMouth", (0.45, 0.14, 0.16), 0.7)
    M["tongue"] = flat_mat("GuestTongue", (0.93, 0.45, 0.50), 0.5)
    M["blush"] = flat_mat("GuestBlush", (0.99, 0.56, 0.62), 0.7)
    M["petal"] = flat_mat("GuestSakuraPin", (0.99, 0.72, 0.80), 0.55)
    M["pistil"] = flat_mat("GuestSakuraPistil", (0.99, 0.88, 0.45), 0.5)
    M["leaf"] = flat_mat("GuestLeaf", (0.33, 0.58, 0.30), 0.55)
    M["leaf_dark"] = flat_mat("GuestLeafDark", (0.20, 0.42, 0.22), 0.6)
    return M

# ------------------------------------------------------------------ one species' parts
def build_parts(kind, M):
    S = SPECIES[kind]
    EX, EZ, ERX, ERZ, MZ = S["EX"], S["EZ"], S["ERX"], S["ERZ"], S["MZ"]
    body, ztop = S["body"]()
    flat_bottom(body)
    cyl_uv(body)
    tree = BVHTree.FromBMesh(body)

    def surf_y(x, z):
        hit = tree.ray_cast(Vector((x, -0.2, z)), Vector((0, 1, 0)), 0.4)
        if hit[0] is not None: return hit[0].y
        near = tree.find_nearest(Vector((x, -0.02, z)))
        return near[0].y if near[0] is not None else -0.015

    def decal(bm, pts, lift, depth=0.0005, mat=0):
        front = [bm.verts.new((x, surf_y(x, z) - lift, z)) for x, z in pts]
        back = [bm.verts.new((x, surf_y(x, z) - lift + depth, z)) for x, z in pts]
        fs = [bm.faces.new(front[::-1]), bm.faces.new(back)]
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            fs.append(bm.faces.new((front[i], front[j], back[j], back[i])))
        for f in fs: f.material_index = mat
        return fs

    skin_img = make_skin(f"GuestSkin-{kind}", kind, seed={"mochi": 3, "onigiri": 7, "tofu": 11}[kind])
    skin = tex_mat(f"GuestSkin-{kind}", skin_img, S["skin_rough"])
    M["skin"] = skin

    P = {}
    P["Body"] = (body, [skin], TORSO, True)

    for side, sx in (("L", -1), ("R", 1)):
        # Three-part leg for a real gait: thigh (node "Leg-*", pivot at the hip), shin (pivot at
        # the knee) and foot (pivot at the ankle). The hip sits just inside the body.
        lx = sx * S["hip_x"]
        hip, knee, ankle = (lx, 0, HIP_Z), (lx, 0.0004, KNEE_Z), (lx, 0, ANKLE_Z)
        bm = bmesh.new()
        capsule(bm, knee, hip, 0.0031)
        cyl_uv(bm)
        P[f"Leg-{side}"] = (bm, [skin], hip, True)
        bm = bmesh.new()
        capsule(bm, ankle, knee, 0.0026)
        cyl_uv(bm)
        P[f"Shin-{side}"] = (bm, [skin], knee, True)
        bm = bmesh.new()
        blob(bm, (lx, -0.0016, 0.0013), (0.0031, 0.0048, 0.0013))    # sole, toe forward
        blob(bm, (lx, 0.0010, 0.0016), (0.0027, 0.0022, 0.0016))     # heel
        cyl_uv(bm)
        P[f"Foot-{side}"] = (bm, [skin], ankle, True)

        bm = bmesh.new()
        shx, shy, shz = S["shoulder"]
        sh = (sx * shx, shy, shz)
        a = math.radians(58)
        tip = (sh[0] + sx * S["arm_len"] * math.cos(a), shy, sh[2] - S["arm_len"] * math.sin(a))
        capsule(bm, sh, tip, 0.0025)
        cyl_uv(bm)
        P[f"Arm-{side}"] = (bm, [skin], sh, True)

    # --- signature accent on the head
    if S["accent"] == "hairpin":
        bm = bmesh.new()
        d = Vector((0.42, -0.36, 0.83)).normalized()
        c = Vector((0, 0, ZB + 0.0188)) + Vector((d.x * 0.0188, d.y * 0.0188 * 0.86, d.z * 0.0188)) + d * 0.0006
        for i in range(5):
            a = math.radians(90 + i * 72)
            blob(bm, c + Vector((math.cos(a) * 0.0029, 0, math.sin(a) * 0.0029)), (0.0024, 0.0010, 0.0024), seg=8, rings=6)
        pv = set(blob(bm, c + Vector((0, -0.0008, 0)), (0.0011, 0.0008, 0.0011), seg=8, rings=6))
        for f in bm.faces:
            if all(v in pv for v in f.verts): f.material_index = 1
        rot_q = Vector((0, -1, 0)).rotation_difference(d)
        for v in bm.verts: v.co = rot_q @ (v.co - c) + c
        cyl_uv(bm)
        P["Hairpin"] = (bm, [M["petal"], M["pistil"]], tuple(c), True)
    elif S["accent"] == "leaf":
        # a small shiso leaf lying over the apex, tilted to the side
        bm = bmesh.new()
        c = Vector((0.0, 0.0, ztop - 0.001))
        lv = blob(bm, c + Vector((0.0025, 0, 0.0025)), (0.0045, 0.0014, 0.0022), seg=12, rings=6)
        stem = capsule(bm, c + Vector((-0.0015, 0, 0.0008)), c + Vector((-0.0045, 0, 0.0035)), 0.0006, seg=6)
        sv = set(stem)
        for f in bm.faces:
            if all(v in sv for v in f.verts): f.material_index = 1
        rot_q = Vector((0, 0, 1)).rotation_difference(Vector((0.45, -0.25, 1)).normalized())
        for v in bm.verts: v.co = rot_q @ (v.co - c) + c
        cyl_uv(bm)
        P["Leaf"] = (bm, [M["leaf"], M["leaf_dark"]], tuple(c), True)
    elif S["accent"] == "sprout":
        # two little scallion leaves sprouting from the top
        bm = bmesh.new()
        c = Vector((0.0, 0.0, ztop - 0.0008))
        capsule(bm, c, c + Vector((-0.0028, -0.0008, 0.0062)), 0.0009, seg=8)
        capsule(bm, c, c + Vector((0.0030, 0.0006, 0.0052)), 0.0009, seg=8)
        cyl_uv(bm)
        P["Sprout"] = (bm, [M["leaf"]], tuple(c), True)

    # --- face decals
    def eyes(build, mats, pivot_z=EZ):
        bm = bmesh.new()
        for sx in (-1, 1): build(bm, sx * EX, sx)
        return (bm, mats, (0, surf_y(0, pivot_z), pivot_z), False)
    def open_eye(bm, x, sx):
        decal(bm, ellipse_pts(x, EZ, ERX, ERZ), 0.00035, mat=0)
        decal(bm, ellipse_pts(x - 0.0007, EZ + 0.0012, 0.00078, 0.00078, seg=10), 0.00055, mat=1)
    P["EyesOpen"] = eyes(open_eye, [M["eye"], M["shine"]])
    P["EyesWide"] = eyes(lambda bm, x, sx: decal(bm, ellipse_pts(x, EZ + 0.0002, ERX + 0.0010, ERZ + 0.0005), 0.0003), [M["white"]])
    def wide_pupil(bm, x, sx):
        decal(bm, ellipse_pts(x, EZ + 0.0002, 0.0016, 0.0018, seg=14), 0.00052, mat=0)
        decal(bm, ellipse_pts(x - 0.0005, EZ + 0.0009, 0.00055, 0.00055, seg=8), 0.0007, mat=1)
    P["WidePupils"] = eyes(wide_pupil, [M["eye"], M["shine"]])
    P["EyesHappy"] = eyes(lambda bm, x, sx: decal(bm, arc_pts(x, EZ - 0.0013, 0.0025, 25, 155, 0.0012), 0.00035), [M["eye"]])
    P["EyesClosed"] = eyes(lambda bm, x, sx: decal(bm, arc_pts(x, EZ + 0.0017, 0.0025, 205, 335, 0.0012), 0.00035), [M["eye"]])
    def cross(bm, x, sx):
        tip = x - sx * 0.0017; back = x + sx * 0.0021
        decal(bm, bar_pts(back, EZ + 0.0020, tip, EZ, 0.0011), 0.00035)
        decal(bm, bar_pts(tip, EZ, back, EZ - 0.0020, 0.0011), 0.00036)
    P["EyesCross"] = eyes(cross, [M["eye"]])

    def mouth(build, mats, cz=MZ):
        bm = bmesh.new(); build(bm)
        return (bm, mats, (0, surf_y(0, cz), cz), False)
    P["MouthSmile"] = mouth(lambda bm: decal(bm, arc_pts(0, MZ + 0.0010, 0.0021, 205, 335, 0.0009), 0.00035), [M["mouth"]])
    def open_mouth(bm):
        pts = ellipse_pts(0, MZ + 0.0004, 0.0029, 0.0027, seg=16, a0=math.pi, a1=2 * math.pi) + [(0.0029, MZ + 0.0004)]
        decal(bm, pts, 0.00035, mat=0)
        decal(bm, ellipse_pts(0, MZ - 0.0012, 0.0013, 0.0007, seg=12), 0.0005, mat=1)
    P["MouthOpen"] = mouth(open_mouth, [M["mouth"], M["tongue"]])
    P["MouthO"] = mouth(lambda bm: decal(bm, ellipse_pts(0, MZ - 0.0004, 0.0014, 0.0018, seg=16), 0.00035), [M["mouth"]])
    P["MouthFrown"] = mouth(lambda bm: decal(bm, arc_pts(0, MZ - 0.0026, 0.0020, 30, 150, 0.0009), 0.00035), [M["mouth"]])
    def nom(bm):
        for sx in (-1, 1):
            decal(bm, arc_pts(sx * 0.0011, MZ + 0.0004, 0.0011, 185, 355, 0.0008, seg=8), 0.00035)
    P["MouthNom"] = mouth(nom, [M["mouth"]])
    P["Blush"] = eyes(lambda bm, x, sx: decal(bm, ellipse_pts(sx * S["BLX"], S["BLZ"], 0.0027, 0.0016, seg=14), 0.0002), [M["blush"]], pivot_z=S["BLZ"])

    attach = {
        "HeadTop": (0, 0, ztop),
        "Face": (0, surf_y(0, EZ) - 0.0008, EZ),
        "Neck": (0, surf_y(0, MZ - 0.0055) - 0.0004, MZ - 0.0055),
        "Chest": (0, surf_y(0, (MZ + ZB) / 2) - 0.0004, (MZ + ZB) / 2),
        "Guitar": (0.003, surf_y(0, (MZ + ZB) / 2 - 0.006) - 0.006, (MZ + ZB) / 2 - 0.005),
    }
    return P, attach, ztop

def make_rig(prefix, group, scene, parts, attach, data=None):
    rig = mk_empty(f"{prefix}Rig", group, (0, 0, 0), scene)
    torso = mk_empty(f"{prefix}Torso", rig, (TORSO[0], TORSO[1], TORSO[2] + RAISE), scene)
    objs = {"Rig": rig, "Torso": torso}
    out = {}
    for name, val in parts.items():
        if name.startswith("Leg"): parent, ppiv = rig, (0, 0, 0)
        elif name.startswith("Shin"): parent, ppiv = objs["Leg-" + name[-1]], out["Leg-" + name[-1]][1]
        elif name.startswith("Foot"): parent, ppiv = objs["Shin-" + name[-1]], out["Shin-" + name[-1]][1]
        else: parent, ppiv = torso, TORSO
        if data:
            me, pivot = data[name]
            ob = bpy.data.objects.new(f"{prefix}{name}", me)
            scene.collection.objects.link(ob)
            ob.parent = parent; ob.location = Vector(pivot) - Vector(ppiv)
        else:
            bm, mats, pivot, smooth = val
            ob = mk(f"{prefix}{name}", bm, mats, parent, pivot, ppiv, scene, smooth)
        out[name] = (ob.data, pivot)
        if name in EXPRESSIONS and name not in DEFAULT_ON:
            ob.scale = (0, 0, 0)
        objs[name] = ob
    for n, loc in attach.items():
        objs[n] = mk_empty(f"{prefix}{n}", torso, Vector(loc) - Vector(TORSO), scene, size=0.003)
        if n == "Guitar": objs[n].rotation_euler = (0, math.radians(-35), math.radians(8))
    return objs, out

def build_guest(kind, scene, M, x=0.0):
    S = SPECIES[kind]
    root = bpy.data.objects.new("guest", None); scene.collection.objects.link(root)
    root["guest_type"] = kind
    root.location.x = x
    standing = mk_empty("Standing", root, (0, 0, 0), scene)
    seated = mk_empty("Seated", root, (0, 0, 0), scene)
    for n, z in (("Grip", S["grip"] + RAISE), ("BubbleAnchor", S["bubble"] + RAISE), ("MoodAnchor", 0.0005)):
        mk_empty(n, root, (0, 0, z), scene)
    parts, attach, ztop = build_parts(kind, M)
    st, shared = make_rig("St-", standing, scene, parts, attach)
    for name, (me, _) in shared.items(): me.name = f"Guest-{kind}-{name}"
    se, _ = make_rig("Se-", seated, scene, parts, attach, data=shared)
    se["Rig"].location = (0, 0, 0.0005 - ZB - RAISE)   # body bottom just on the seat top
    for s in ("L", "R"):
        # thighs forward over the seat edge, shins hanging down, feet level
        se[f"Leg-{s}"].rotation_euler = (math.radians(-70), 0, 0)
        se[f"Shin-{s}"].rotation_euler = (math.radians(70), 0, 0)
    se["Arm-L"].rotation_euler = (math.radians(-55), 0, math.radians(30))
    se["Arm-R"].rotation_euler = (math.radians(-55), 0, math.radians(-30))
    return {"root": root, "St": st, "Se": se, "standing": standing, "seated": seated, "kind": kind, "ztop": ztop}

def build_all(scene, kinds=("mochi", "onigiri", "tofu"), spacing=0.075):
    M = materials()
    rigs = {}
    for i, k in enumerate(kinds):
        rigs[k] = build_guest(k, scene, M, x=(i - (len(kinds) - 1) / 2) * spacing)
    return rigs, M
