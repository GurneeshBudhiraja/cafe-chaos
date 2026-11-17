"""Blocky baristas: box-built characters with a 64 px pixel-art skin each (nearest filtering).
Run in Blender: exec(src, {"bpy": bpy}); then build_all(). Front is -Y, units metres (helpers take cm)."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Euler

CM = 0.01
TEX = 64

# ------------------------------------------------------------------ atlas layout (pixels, y down)
R = {  # name: (x0, y0, x1, y1)
    "head_front": (0, 0, 8, 8), "head_back": (8, 0, 16, 8), "head_left": (16, 0, 24, 8), "head_right": (24, 0, 32, 8),
    "head_top": (32, 0, 40, 8), "head_bottom": (40, 0, 48, 8),
    "body_front": (0, 8, 8, 18), "body_back": (8, 8, 16, 18), "body_left": (16, 8, 20, 18), "body_right": (20, 8, 24, 18),
    "body_top": (24, 8, 32, 12), "body_bottom": (24, 12, 32, 16),
    "arm_side": (0, 20, 3, 29), "arm_top": (4, 20, 7, 23), "arm_bottom": (4, 24, 7, 27),
    "leg_side": (8, 20, 12, 29), "leg_top": (13, 20, 17, 24), "leg_bottom": (13, 25, 17, 29),
    "extra": (20, 20, 28, 28), "extra2": (30, 20, 38, 28), "lid": (40, 20, 48, 22),
}

def rgb(*c): return np.array(c, np.float32)

LOOKS = {
    # Sora: black bob under a sage flat cap, indigo apron
    "sora": dict(skin=rgb(0.97, 0.80, 0.66), hair=rgb(0.15, 0.12, 0.13), shirt=rgb(0.95, 0.92, 0.84), apron=rgb(0.15, 0.20, 0.40),
                 trim=rgb(0.86, 0.66, 0.30), legs=rgb(0.22, 0.22, 0.25), shoes=rgb(0.40, 0.24, 0.13), hat=rgb(0.58, 0.70, 0.54),
                 hat2=rgb(0.48, 0.60, 0.45), eye=rgb(0.10, 0.08, 0.09), blush=rgb(0.98, 0.62, 0.62), mouth=rgb(0.78, 0.36, 0.36), top="cap"),
    # Momo: chestnut hair with a bun, pink apron
    "momo": dict(skin=rgb(0.93, 0.72, 0.57), hair=rgb(0.52, 0.28, 0.15), shirt=rgb(0.97, 0.96, 0.93), apron=rgb(0.95, 0.60, 0.68),
                 trim=rgb(0.97, 0.96, 0.93), legs=rgb(0.24, 0.30, 0.44), shoes=rgb(0.86, 0.66, 0.30), hat=rgb(0.52, 0.28, 0.15),
                 hat2=rgb(0.78, 0.18, 0.18), eye=rgb(0.16, 0.10, 0.08), blush=rgb(0.98, 0.55, 0.58), mouth=rgb(0.72, 0.30, 0.32), top="bun"),
    # Yuki: silver-white hair, round glasses (extra2 as the frames), matcha-green apron
    "yuki": dict(skin=rgb(0.96, 0.84, 0.74), hair=rgb(0.88, 0.88, 0.90), shirt=rgb(0.93, 0.93, 0.90), apron=rgb(0.45, 0.60, 0.30),
                 trim=rgb(0.95, 0.92, 0.84), legs=rgb(0.28, 0.28, 0.30), shoes=rgb(0.15, 0.13, 0.13), hat=rgb(0.88, 0.88, 0.90),
                 hat2=rgb(0.12, 0.12, 0.14), eye=rgb(0.20, 0.25, 0.35), blush=rgb(0.98, 0.70, 0.70), mouth=rgb(0.78, 0.40, 0.42), top="glasses"),
    # Ren: red bandana over dark hair, grey tee, charcoal apron with copper tie
    "ren": dict(skin=rgb(0.85, 0.62, 0.46), hair=rgb(0.10, 0.09, 0.10), shirt=rgb(0.55, 0.57, 0.60), apron=rgb(0.20, 0.20, 0.22),
                trim=rgb(0.74, 0.43, 0.27), legs=rgb(0.16, 0.18, 0.26), shoes=rgb(0.90, 0.90, 0.88), hat=rgb(0.78, 0.18, 0.18),
                hat2=rgb(0.95, 0.92, 0.84), eye=rgb(0.08, 0.07, 0.08), blush=rgb(0.90, 0.55, 0.50), mouth=rgb(0.62, 0.30, 0.28), top="bandana"),
    # Hana: pink twin buns, lavender apron, cream blouse
    "hana": dict(skin=rgb(0.98, 0.86, 0.78), hair=rgb(0.95, 0.60, 0.72), shirt=rgb(0.97, 0.95, 0.90), apron=rgb(0.70, 0.60, 0.90),
                 trim=rgb(0.97, 0.95, 0.90), legs=rgb(0.50, 0.42, 0.62), shoes=rgb(0.95, 0.60, 0.72), hat=rgb(0.95, 0.60, 0.72),
                 hat2=rgb(0.86, 0.66, 0.30), eye=rgb(0.25, 0.14, 0.18), blush=rgb(0.99, 0.55, 0.62), mouth=rgb(0.80, 0.35, 0.45), top="twin"),
    # Kenji: the old master — grey hair and beard, white hachimaki, indigo happi, no apron
    "kenji": dict(skin=rgb(0.90, 0.72, 0.58), hair=rgb(0.62, 0.62, 0.64), shirt=rgb(0.14, 0.19, 0.38), apron=rgb(0.14, 0.19, 0.38),
                  trim=rgb(0.78, 0.18, 0.18), legs=rgb(0.20, 0.20, 0.22), shoes=rgb(0.40, 0.24, 0.13), hat=rgb(0.95, 0.92, 0.84),
                  hat2=rgb(0.78, 0.18, 0.18), eye=rgb(0.10, 0.08, 0.09), blush=rgb(0.92, 0.62, 0.58), mouth=rgb(0.62, 0.62, 0.64), top="hachimaki", beard=True),
}

def paint(kind):
    L = LOOKS[kind]
    P = np.zeros((TEX, TEX, 3), np.float32) + 0.5
    def fill(reg, col, x0=0, y0=0, x1=None, y1=None):
        rx0, ry0, rx1, ry1 = R[reg]
        x1 = rx1 - rx0 if x1 is None else x1; y1 = ry1 - ry0 if y1 is None else y1
        P[ry0 + y0:ry0 + y1, rx0 + x0:rx0 + x1] = col
    def px(reg, x, y, col): P[R[reg][1] + y, R[reg][0] + x] = col
    shade = lambda c, k: np.clip(c * k, 0, 1)
    skin, hair = L["skin"], L["hair"]
    # --- head
    for f in ("head_front", "head_back", "head_left", "head_right", "head_bottom"): fill(f, skin)
    fill("head_top", hair); fill("head_back", hair, y1=6); fill("head_back", shade(hair, 0.85), y0=5, y1=6)
    for f in ("head_left", "head_right"):
        fill(f, hair, y1=5); fill(f, hair, x0=4 if f == "head_left" else 0, x1=8 if f == "head_left" else 4, y0=5, y1=6)
    fill("head_front", hair, y1=2)
    if kind == "sora":
        fill("head_front", hair, y0=2, y1=3, x0=0, x1=2); fill("head_front", hair, y0=2, y1=3, x0=6, x1=8)
        px("head_front", 0, 3, hair); px("head_front", 7, 3, hair)
    else:
        for x in (0, 1, 5, 6, 7): px("head_front", x, 2, hair)
        px("head_front", 0, 3, hair); px("head_front", 7, 3, hair); px("head_front", 0, 4, hair); px("head_front", 7, 4, hair)
    for x in (2, 5):
        px("head_front", x, 3, L["eye"]); px("head_front", x, 4, L["eye"])
    px("head_front", 1, 5, L["blush"]); px("head_front", 6, 5, L["blush"])
    px("head_front", 3, 6, L["mouth"]); px("head_front", 4, 6, L["mouth"])
    if L.get("beard"):
        fill("head_front", hair, y0=7, y1=8); fill("head_front", hair, x0=0, x1=2, y0=6, y1=7); fill("head_front", hair, x0=6, x1=8, y0=6, y1=7)
        for f in ("head_left", "head_right"): fill(f, hair, y0=7, y1=8)
    if kind == "kenji":                                   # happi: no apron bib, a red collar band
        for f in ("body_front", "body_back", "body_left", "body_right"): fill(f, L["shirt"])
        fill("body_front", L["trim"], x0=2, x1=6, y0=0, y1=1); fill("body_front", L["trim"], y0=4, y1=5)
    # --- body: shirt, apron bib + skirt, straps on the back
    for f in ("body_front", "body_back", "body_left", "body_right", "body_top", "body_bottom"): fill(f, L["shirt"])
    fill("body_front", L["apron"], x0=2, x1=6, y0=1, y1=4); fill("body_front", L["apron"], y0=4, y1=10)
    px("body_front", 2, 0, L["apron"]); px("body_front", 5, 0, L["apron"])            # neck straps
    fill("body_front", shade(L["apron"], 0.8), x0=3, x1=5, y0=6, y1=8)                  # pocket
    fill("body_front", L["trim"], y0=4, y1=5)                                           # waist tie
    for f in ("body_left", "body_right"): fill(f, L["apron"], y0=5, y1=10); fill(f, L["trim"], y0=4, y1=5)
    fill("body_back", L["trim"], y0=4, y1=5); px("body_back", 3, 5, L["trim"]); px("body_back", 4, 5, L["trim"])   # bow
    px("body_back", 2, 0, L["apron"]); px("body_back", 5, 0, L["apron"])
    for y in range(1, 4): px("body_back", 2 + (y > 1), y, L["apron"]); px("body_back", 5 - (y > 1), y, L["apron"])
    fill("body_bottom", L["legs"])
    # --- arms: short sleeve, skin, a cuff of shade at the hand
    fill("arm_side", skin); fill("arm_side", L["shirt"], y1=3); fill("arm_side", shade(skin, 0.93), y0=8, y1=9)
    fill("arm_top", L["shirt"]); fill("arm_bottom", shade(skin, 0.93))
    # --- legs and shoes
    fill("leg_side", L["legs"]); fill("leg_side", L["shoes"], y0=7, y1=9); fill("leg_top", L["legs"]); fill("leg_bottom", shade(L["shoes"], 0.8))
    # --- cap / bun colours
    fill("extra", L["hat"]); fill("extra2", L["hat2"]); fill("lid", skin)
    if kind == "sora":                                    # cap band
        P[R["extra"][1] + 5:R["extra"][1] + 6, R["extra"][0]:R["extra"][2]] = L["hat2"]
    img = bpy.data.images.get(f"BaristaSkin-{kind}")
    if not img: img = bpy.data.images.new(f"BaristaSkin-{kind}", TEX, TEX, alpha=True)
    rgba = np.concatenate([P[::-1], np.ones((TEX, TEX, 1), np.float32)], axis=2)
    img.pixels.foreach_set(rgba.ravel()); img.pack()
    return img

def material(kind):
    img = paint(kind)
    m = bpy.data.materials.get(f"BaristaSkin-{kind}") or bpy.data.materials.new(f"BaristaSkin-{kind}")
    m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial"); b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; t.interpolation = 'Closest'
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"]); nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    b.inputs["Roughness"].default_value = 0.75
    return m

# ------------------------------------------------------------------ boxes with per-face atlas regions
def box(bm, x0, x1, y0, y1, z0, z1, faces, bevel=0.06):
    """faces: {"front"|"back"|"left"|"right"|"top"|"bottom" or "all"/"sides": region name}. cm."""
    uv = bm.loops.layers.uv.verify()
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r["verts"]:
        v.co = Vector((x0 + (v.co.x + .5) * (x1 - x0), y0 + (v.co.y + .5) * (y1 - y0), z0 + (v.co.z + .5) * (z1 - z0))) * CM
    vs = set(r["verts"]); bm.normal_update()
    for f in [f for f in bm.faces if all(v in vs for v in f.verts)]:
        n = f.normal
        key = ("right" if n.x > .5 else "left" if n.x < -.5 else "back" if n.y > .5 else "front" if n.y < -.5 else "top" if n.z > .5 else "bottom")
        reg = faces.get(key) or (faces.get("sides") if key not in ("top", "bottom") else None) or faces.get("all")
        px0, py0, px1, py1 = R[reg]; e = 0.03
        for l in f.loops:
            c = l.vert.co / CM
            tx, ty, tz = (c.x - x0) / (x1 - x0), (c.y - y0) / (y1 - y0), (c.z - z0) / (z1 - z0)
            if key == "front": s, t = tx, tz
            elif key == "back": s, t = 1 - tx, tz
            elif key == "left": s, t = 1 - ty, tz
            elif key == "right": s, t = ty, tz
            elif key == "top": s, t = tx, ty
            else: s, t = tx, 1 - ty
            u = (px0 + e + s * (px1 - px0 - 2 * e)) / TEX
            v = 1 - (py1 - e - t * (py1 - py0 - 2 * e)) / TEX
            l[uv].uv = (u, v)
    return r["verts"]

def mk(name, bm, mat, parent, pivot, parent_pivot, scene):
    me = bpy.data.meshes.new(name)
    for v in bm.verts: v.co -= Vector(pivot) * CM
    bm.normal_update(); bm.to_mesh(me); bm.free(); me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    ob.parent = parent; ob.location = (Vector(pivot) - Vector(parent_pivot)) * CM
    return ob

def empty(name, parent, loc_cm, scene):
    e = bpy.data.objects.new(name, None); e.empty_display_size = 0.004
    scene.collection.objects.link(e); e.parent = parent; e.location = Vector(loc_cm) * CM
    return e

# sizes (cm)
LEG_H, BODY_H, HEAD = 2.4, 2.4, 2.6
BODY_W, BODY_D = 2.2, 1.3
ARM, ARM_H = 0.8, 2.3
HEIGHT = LEG_H + BODY_H + HEAD

def build(kind, scene, x_cm=0.0):
    mat = material(kind)
    root = bpy.data.objects.new("barista", None); scene.collection.objects.link(root)
    root["barista"] = kind; root.location.x = x_cm * CM
    rig = empty("Rig", root, (0, 0, 0), scene)
    P = {}
    hip = (0, 0, LEG_H)
    bm = bmesh.new()
    box(bm, -BODY_W / 2, BODY_W / 2, -BODY_D / 2, BODY_D / 2, LEG_H, LEG_H + BODY_H,
        {"front": "body_front", "back": "body_back", "left": "body_left", "right": "body_right", "top": "body_top", "bottom": "body_bottom"})
    P["Body"] = mk("Body", bm, mat, rig, hip, (0, 0, 0), scene)
    neck = (0, 0, LEG_H + BODY_H)
    bm = bmesh.new()
    h = HEAD / 2
    box(bm, -h, h, -h, h, neck[2], neck[2] + HEAD,
        {"front": "head_front", "back": "head_back", "left": "head_left", "right": "head_right", "top": "head_top", "bottom": "head_bottom"})
    top = neck[2] + HEAD
    top_kind = LOOKS[kind]["top"]
    if top_kind == "bandana":
        box(bm, -h - 0.1, h + 0.1, -h - 0.1, h + 0.1, top - 0.75, top + 0.15, {"all": "extra"})        # the band
        box(bm, -0.35, 0.35, h, h + 0.9, top - 0.6, top - 0.1, {"all": "extra"})                       # knot tails at the back
    elif top_kind == "hachimaki":
        box(bm, -h - 0.1, h + 0.1, -h - 0.1, h + 0.1, top - 1.05, top - 0.55, {"all": "extra"})       # headband
        box(bm, -0.3, 0.3, -h - 0.16, -h - 0.1, top - 0.98, top - 0.62, {"all": "extra2"})           # red sun
        box(bm, -0.6, 0.6, h, h + 0.8, top - 1.0, top - 0.6, {"all": "extra"})                         # knot
    elif top_kind == "twin":
        for sx in (-1, 1):
            box(bm, sx * 1.15 - 0.55, sx * 1.15 + 0.55, -0.5, 0.6, top - 0.5, top + 0.6, {"all": "extra"})
            box(bm, sx * 1.15 - 0.62, sx * 1.15 + 0.62, -0.57, 0.67, top - 0.1, top + 0.1, {"all": "extra2"})
    elif top_kind == "glasses":
        for sx in (-1, 1):
            box(bm, sx * 0.62 - 0.42, sx * 0.62 + 0.42, -h - 0.12, -h - 0.04, neck[2] + HEAD * 0.33, neck[2] + HEAD * 0.66, {"all": "extra2"})
        box(bm, -0.2, 0.2, -h - 0.12, -h - 0.04, neck[2] + HEAD * 0.48, neck[2] + HEAD * 0.54, {"all": "extra2"})
    if top_kind == "cap":
        box(bm, -h - 0.1, h + 0.1, -h - 0.1, h + 0.1, top - 0.35, top + 0.55, {"all": "extra"})            # crown
        box(bm, -h + 0.2, h - 0.2, -h - 1.0, -h, top - 0.35, top - 0.12, {"all": "extra2"})               # brim
    elif top_kind == "bun":
        box(bm, -0.75, 0.75, -0.55, 0.95, top, top + 1.1, {"all": "extra"})                                # bun
        box(bm, -0.85, 0.85, -0.65, 1.05, top, top + 0.22, {"all": "extra2"})                              # red tie
    P["Head"] = mk("Head", bm, mat, P["Body"], neck, hip, scene)
    # eyelids: a skin-coloured strip over the eyes, scale 0 = eyes open
    bm = bmesh.new()
    ez0 = neck[2] + HEAD * (3 / 8); ez1 = neck[2] + HEAD * (5 / 8)
    box(bm, -h * 0.82, h * 0.82, -h - 0.02, -h + 0.02, ez0, ez1, {"all": "lid"}, bevel=0)
    P["Blink"] = mk("Blink", bm, mat, P["Head"], (0, -h, (ez0 + ez1) / 2), neck, scene)
    P["Blink"].scale = (0, 0, 0)
    for side, sx in (("L", -1), ("R", 1)):
        sh = (sx * (BODY_W / 2 + ARM / 2), 0, LEG_H + BODY_H - 0.25)
        bm = bmesh.new()
        box(bm, sh[0] - ARM / 2, sh[0] + ARM / 2, -ARM / 2, ARM / 2, sh[2] - ARM_H + 0.25, sh[2] + 0.25, {"sides": "arm_side", "top": "arm_top", "bottom": "arm_bottom"})
        P[f"Arm-{side}"] = mk(f"Arm-{side}", bm, mat, P["Body"], sh, hip, scene)
        lp = (sx * 0.55, 0, LEG_H)
        bm = bmesh.new()
        box(bm, lp[0] - 0.5, lp[0] + 0.5, -0.55, 0.55, 0, LEG_H, {"sides": "leg_side", "top": "leg_top", "bottom": "leg_bottom"})
        P[f"Leg-{side}"] = mk(f"Leg-{side}", bm, mat, rig, lp, (0, 0, 0), scene)
    P["Rig"] = rig
    P["Tray"] = empty("Tray", P["Body"], (0, -BODY_D / 2 - 1.55, 0.45), scene)   # where a carried tray sits (Carry clip)
    P["Guitar"] = empty("Guitar", P["Body"], (0.3, -BODY_D / 2 - 1.1, 0.9), scene)  # a guitar held against the chest (Strum clip)
    P["Guitar"].rotation_euler = (0, math.radians(-35), math.radians(8))
    P["HandR"] = empty("Hand-R", P["Arm-R"], (0, 0, -ARM_H + 0.25), scene)      # for a held item (a cup, a cloth)
    P["HandL"] = empty("Hand-L", P["Arm-L"], (0, 0, -ARM_H + 0.25), scene)
    return {"root": root, "P": P, "kind": kind}

# ------------------------------------------------------------------ clips
ACTS = {}
REST = {}

def K(clip, o, f, loc=None, rot=None, scl=None, interp='BEZIER'):
    if o not in REST: REST[o] = (o.location.copy(), o.rotation_euler.copy(), o.scale.copy())
    key = (clip, o)
    if key not in ACTS: ACTS[key] = bpy.data.actions.new(f"{clip}|{o.name}")
    o.animation_data_create(); o.animation_data.action = ACTS[key]
    paths = []
    if loc is not None: o.location = REST[o][0] + Vector(loc) * CM; paths.append("location")
    if rot is not None: o.rotation_euler = Euler([math.radians(v) for v in rot]); paths.append("rotation_euler")
    if scl is not None: o.scale = scl; paths.append("scale")
    for p in paths: o.keyframe_insert(p, frame=f)
    act = o.animation_data.action
    try: fcs = act.fcurves
    except AttributeError:
        fcs = []
        slot = o.animation_data.action_slot
        for layer in act.layers:
            for strip in layer.strips:
                cb = strip.channelbag(slot)
                if cb: fcs = cb.fcurves
    for fc in fcs:
        if fc.data_path in paths:
            for kp in fc.keyframe_points:
                if kp.co.x == f: kp.interpolation = interp

def blink(clip, P, frames):
    K(clip, P["Blink"], 1, scl=(0, 0, 0), interp='CONSTANT')
    for f in frames:
        K(clip, P["Blink"], f, scl=(1, 1, 1), interp='CONSTANT'); K(clip, P["Blink"], f + 3, scl=(0, 0, 0), interp='CONSTANT')

def animate(B, flip=1):
    P = B["P"]
    # limbs hang down: a negative x rotation swings them forward (toward the counter, -Y)
    c = "Idle"                                                    # 3 s: breathing, a look around, a blink
    for f, z in ((1, 0), (37, 0.06), (73, 0)): K(c, P["Body"], f, loc=(0, 0, z))
    for f, r in ((1, 0), (16, 22 * flip), (34, 22 * flip), (46, -14 * flip), (60, -14 * flip), (73, 0)): K(c, P["Head"], f, rot=(0, 0, r))
    for f, r in ((1, 0), (37, 3), (73, 0)):
        K(c, P["Arm-L"], f, rot=(0, r, 0)); K(c, P["Arm-R"], f, rot=(0, -r, 0))
    blink(c, P, (40,))

    c = "Work"                                                    # 2 s: both hands busy on the counter, head down
    for f in (1, 49): K(c, P["Body"], f, rot=(8, 0, 0))
    for f, r in ((1, 14), (25, 18), (49, 14)): K(c, P["Head"], f, rot=(r, 0, 0))
    for i, f in enumerate(range(1, 50, 6)):
        a = -62 if i % 2 == 0 else -48
        K(c, P["Arm-R"], f, rot=(a, 0, -8)); K(c, P["Arm-L"], f, rot=(-110 - a, 0, 8))
    blink(c, P, (30,))

    c = "Wave"                                                    # 1.5 s: a wave to an arriving guest
    for f, r in ((1, 0), (7, -6 * flip), (31, -6 * flip), (37, 0)): K(c, P["Head"], f, rot=(0, r, 0))
    K(c, P["Arm-R"], 1, rot=(0, 0, 0))
    for i, f in enumerate(range(7, 32, 4)):
        K(c, P["Arm-R"], f, rot=(0, -150 + (16 if i % 2 == 0 else -14), 0))
    K(c, P["Arm-R"], 37, rot=(0, 0, 0))
    for f, z in ((1, 0), (7, 0.12), (13, 0), (19, 0.12), (25, 0), (37, 0)): K(c, P["Body"], f, loc=(0, 0, z))
    blink(c, P, (16,))

    c = "Bow"                                                     # 2 s: a small bow, hands together (thanks / welcome)
    for f, r in ((1, 0), (13, 32), (31, 32), (43, 0), (49, 0)): K(c, P["Body"], f, rot=(r, 0, 0))
    for f, r in ((1, 0), (13, 10), (31, 10), (43, 0), (49, 0)): K(c, P["Head"], f, rot=(r, 0, 0))
    for f, a in ((1, 0), (13, -38), (31, -38), (43, 0), (49, 0)):
        K(c, P["Arm-R"], f, rot=(a, 0, -22 * (a != 0))); K(c, P["Arm-L"], f, rot=(a, 0, 22 * (a != 0)))
    K(c, P["Blink"], 1, scl=(0, 0, 0), interp='CONSTANT'); K(c, P["Blink"], 12, scl=(1, 1, 1), interp='CONSTANT'); K(c, P["Blink"], 34, scl=(0, 0, 0), interp='CONSTANT')

def gait(c, P, swing=26, bob=0.08, arms=True):
    """A 1 s two-step walk in place for the box legs (they pivot at the hip)."""
    for f, k in ((1, 1), (7, 0), (13, -1), (19, 0), (25, 1)):
        K(c, P["Leg-L"], f, rot=(-swing * k, 0, 0)); K(c, P["Leg-R"], f, rot=(swing * k, 0, 0))
        if arms: K(c, P["Arm-L"], f, rot=(swing * 0.8 * k, 0, 0)); K(c, P["Arm-R"], f, rot=(-swing * 0.8 * k, 0, 0))
        K(c, P["Body"], f, loc=(0, 0, 0 if k else bob), rot=(4, 0, 3 * k))
    K(c, P["Head"], 1, rot=(0, 0, 0)); K(c, P["Head"], 25, rot=(0, 0, 0))

def animate_moves(B):
    P = B["P"]
    gait("Walk", P)
    c = "Carry"                                                   # walking with a tray held out in front
    gait(c, P, swing=20, bob=0.06, arms=False)
    for f in (1, 25):
        K(c, P["Arm-L"], f, rot=(-78, 0, 6)); K(c, P["Arm-R"], f, rot=(-78, 0, -6))
    for f, z in ((1, 0), (7, 0.05), (13, 0), (19, 0.05), (25, 0)): K(c, P["Tray"], f, loc=(0, 0, z))
    c = "Serve"                                                   # 1.5 s: lower the tray to table height, then straighten
    for f, (a, z, lean) in ((1, (-78, 0, 0)), (13, (-52, -0.9, 14)), (25, (-52, -0.9, 14)), (37, (-78, 0, 0))):
        K(c, P["Arm-L"], f, rot=(a, 0, 6)); K(c, P["Arm-R"], f, rot=(a, 0, -6))
        K(c, P["Tray"], f, loc=(0, -0.4 * (lean / 14), z)); K(c, P["Body"], f, rot=(lean, 0, 0)); K(c, P["Head"], f, rot=(lean * 0.6, 0, 0))

def strum(B):
    """1 s loop: the guitar held against the chest, left hand up the neck, right hand strumming; head nods."""
    P = B["P"]; c = "Strum"
    for f in (1, 25): K(c, P["Arm-L"], f, rot=(-70, 0, 55))                       # fretting hand out along the neck
    for i, f in enumerate(range(1, 26, 3)):
        K(c, P["Arm-R"], f, rot=(-82 + (10 if i % 2 == 0 else -10), 0, -18))         # strumming
    for f, (z, r) in ((1, (0, 0)), (7, (0.06, 6)), (13, (0, 0)), (19, (0.06, -6)), (25, (0, 0))):
        K(c, P["Body"], f, loc=(0, 0, z), rot=(5, r * 0.5, 0)); K(c, P["Head"], f, rot=(r, 0, -r * 0.6))
    blink(c, P, (16,))

def finish():
    for (clip, o), act in ACTS.items():
        ad = o.animation_data; ad.action = None
        tr = next((t for t in ad.nla_tracks if t.name == clip), None) or ad.nla_tracks.new(); tr.name = clip
        if not any(s.action == act for s in tr.strips):
            st = tr.strips.new(clip, 1, act)
            if getattr(st, "action_slot", 1) is None and act.slots: st.action_slot = act.slots[0]
    for o, (l, r, s) in REST.items(): o.location, o.rotation_euler, o.scale = l, r, s

def preview(clips, frame, scene):
    for o in REST:
        if o.animation_data:
            for t in o.animation_data.nla_tracks: t.mute = t.name not in clips
    scene.frame_set(frame)

def unmute_all():
    for o in REST:
        if o.animation_data:
            for t in o.animation_data.nla_tracks: t.mute = False

def build_all():
    sc = bpy.data.scenes.get("BaristaArt") or bpy.data.scenes.new("BaristaArt")
    for o in list(sc.collection.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    for a in [a for a in bpy.data.actions if a.name.split("|")[0] in ("Idle", "Work", "Wave", "Bow", "Walk", "Carry", "Serve", "Strum") and "|" in a.name and a.users == 0]:
        bpy.data.actions.remove(a)
    ACTS.clear(); REST.clear()
    out = {}
    kinds = list(LOOKS)
    for i, kind in enumerate(kinds):
        B = build(kind, sc, x_cm=(i - (len(kinds) - 1) / 2) * 6)
        animate(B, flip=1 if i == 0 else -1); animate_moves(B); strum(B)
        out[kind] = B
    finish()
    return sc, out
