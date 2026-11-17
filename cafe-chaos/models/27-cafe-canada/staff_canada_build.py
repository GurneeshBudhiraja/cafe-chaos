"""The Canadian café's staff on the barista rig (base/barista_build.py): three baristas, two
janitors and the violinist, each its own look, with every clip the Japanese staff have plus Wipe
(the janitors) and Play (the violinist). Exports barista-<name>.glb files and renders.

  Blender --background --factory-startup --python staff_canada_build.py -- <out-dir> [only]

Looks (all read at a glance across the café; Hoser's red and cream, winter wool):
- maple:  the lead barista: brown hair under a red cap with a cream brim, cream shirt, red apron.
- aspen:  blonde bun with a red tie, cream shirt, red apron with a cream tie.
- rowan:  dark skin, black hair under a cream toque with a red pompom, red apron.
- birch:  a janitor: red plaid shirt, dark overalls, a spruce-green toque, a snow shovel on the back.
- cedar:  the second janitor: green plaid, a red toque, earmuffs; the same shovel.
- fiddler: the violinist: a cream parka with a red zip, a red-and-cream toque, a violin under the
  chin and a bow in the right hand.
Same node names as the Japanese staff (Rig, Body, Head, Blink, Arm-L/R, Leg-L/R, Tray, Guitar,
Hand-L/R; the janitors' Bucket), so the game's staff code runs unchanged.
"""
import bpy, bmesh, sys, os, math, json
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else os.path.join(HERE, 'out')
ONLY = args[1] if len(args) > 1 else None
os.makedirs(OUT, exist_ok=True)
ns = {"bpy": bpy}
exec(open(os.path.join(HERE, 'base', 'barista_build.py')).read(), ns)
rgb = ns["rgb"]; R = ns["R"]; K = ns["K"]; blink = ns["blink"]; box = ns["box"]; mk = ns["mk"]; CM = ns["CM"]
LEG_H, BODY_H, HEAD, BODY_W, BODY_D, ARM_H, TEX = ns["LEG_H"], ns["BODY_H"], ns["HEAD"], ns["BODY_W"], ns["BODY_D"], ns["ARM_H"], ns["TEX"]
LOOKS = ns["LOOKS"]

RED = rgb(0.72, 0.09, 0.12); CREAM = rgb(0.97, 0.93, 0.85); SPRUCE = rgb(0.17, 0.37, 0.27)
DARK = rgb(0.18, 0.17, 0.19); DENIM = rgb(0.22, 0.28, 0.42); WOOD = rgb(0.62, 0.42, 0.24)
# Free corners of the 64 px skin for the props.
R.update({"cloth": (48, 0, 56, 8), "bucket": (48, 8, 56, 16), "violin": (0, 32, 8, 40), "violin_dark": (8, 32, 12, 36),
          "bow_stick": (8, 36, 12, 40), "bow_hair": (12, 32, 16, 40), "shovel_handle": (16, 32, 20, 40), "shovel_blade": (20, 32, 28, 40),
          "strings": (28, 32, 32, 40)})

def look(skin, hair, shirt, apron, trim, legs, shoes, hat, hat2, top, eye=(0.10, 0.08, 0.09), blush=(0.95, 0.58, 0.55), mouth=(0.70, 0.34, 0.34), **more):
    d = dict(skin=rgb(*skin), hair=rgb(*hair), shirt=shirt, apron=apron, trim=trim, legs=legs, shoes=rgb(*shoes), hat=hat, hat2=hat2,
             eye=rgb(*eye), blush=rgb(*blush), mouth=rgb(*mouth), top=top)
    d.update(more)
    return d

LOOKS["maple"] = look((0.95, 0.78, 0.64), (0.42, 0.26, 0.14), CREAM, RED, CREAM, DENIM, (0.30, 0.20, 0.14), RED, CREAM, "cap")
LOOKS["aspen"] = look((0.97, 0.85, 0.74), (0.90, 0.76, 0.44), CREAM, RED, CREAM, rgb(0.26, 0.26, 0.30), (0.95, 0.93, 0.90), rgb(0.90, 0.76, 0.44), RED, "bun")
LOOKS["rowan"] = look((0.52, 0.34, 0.22), (0.10, 0.08, 0.08), CREAM, RED, CREAM, DENIM, (0.18, 0.16, 0.16), CREAM, RED, "toque", eye=(0.08, 0.06, 0.06), blush=(0.80, 0.45, 0.40))
LOOKS["birch"] = look((0.92, 0.72, 0.56), (0.55, 0.32, 0.16), RED, DARK, DARK, DARK, (0.30, 0.20, 0.14), SPRUCE, CREAM, "toque", plaid=(RED, rgb(0.42, 0.06, 0.08), CREAM))
LOOKS["cedar"] = look((0.88, 0.68, 0.52), (0.26, 0.18, 0.12), SPRUCE, DARK, DARK, DARK, (0.22, 0.18, 0.16), RED, CREAM, "earmuffs", plaid=(SPRUCE, rgb(0.10, 0.24, 0.17), CREAM))
LOOKS["fiddler"] = look((0.96, 0.82, 0.70), (0.60, 0.40, 0.24), CREAM, CREAM, RED, DENIM, (0.30, 0.20, 0.14), RED, CREAM, "toque", parka=True)

def pixels(kind):
    img = bpy.data.images[f"BaristaSkin-{kind}"]
    return img, np.array(img.pixels[:], np.float32).reshape(TEX, TEX, 4)

def put(px, reg, col, x0=0, y0=0, x1=None, y1=None):
    """Paint a block of a skin region (pixels, y down in the atlas; the image is stored bottom-up)."""
    rx0, ry0, rx1, ry1 = R[reg]
    x1 = rx1 - rx0 if x1 is None else x1; y1 = ry1 - ry0 if y1 is None else y1
    px[TEX - (ry0 + y1):TEX - (ry0 + y0), rx0 + x0:rx0 + x1, :3] = np.array(col)

def save(img, px):
    img.pixels.foreach_set(px.ravel()); img.pack()

def plaid(px, base, dark, light):
    """A lumberjack plaid over the shirt (the whole body: no apron) and the sleeves: wide dark bands crossing, a thin light line."""
    for reg in ("body_front", "body_back", "body_left", "body_right", "body_top"):
        rx0, ry0, rx1, ry1 = R[reg]
        w, h = rx1 - rx0, ry1 - ry0
        for y in range(h):
            for x in range(w):
                c = base
                if x % 4 in (1, 2) or y % 4 in (1, 2): c = dark
                if x % 4 in (1, 2) and y % 4 in (1, 2): c = dark * 0.8
                if x % 4 == 0 and y % 4 == 0: c = light
                px[TEX - (ry0 + y + 1), rx0 + x, :3] = c
    # Dark overall bib and straps over the plaid, a brass button.
    put(px, "body_front", DARK, x0=2, x1=6, y0=3, y1=10); put(px, "body_back", DARK, y0=6, y1=10); put(px, "body_left", DARK, y0=6, y1=10); put(px, "body_right", DARK, y0=6, y1=10)
    px[TEX - (R["body_front"][1] + 1), R["body_front"][0] + 2, :3] = DARK; px[TEX - (R["body_front"][1] + 1), R["body_front"][0] + 5, :3] = DARK
    px[TEX - (R["body_front"][1] + 2), R["body_front"][0] + 2, :3] = DARK; px[TEX - (R["body_front"][1] + 2), R["body_front"][0] + 5, :3] = DARK
    px[TEX - (R["body_front"][1] + 4), R["body_front"][0] + 3, :3] = rgb(0.86, 0.66, 0.30)
    put(px, "arm_side", base, y0=0, y1=3); put(px, "arm_side", dark, y0=1, y1=2)
    put(px, "arm_top", base)

def parka(px):
    """A puffy cream parka: quilted bands across the body, a red zip down the front, red cuffs."""
    for reg in ("body_front", "body_back", "body_left", "body_right"):
        rx0, ry0, rx1, ry1 = R[reg]
        for y in range(ry1 - ry0):
            put(px, reg, CREAM * (0.90 if y % 3 == 2 else 1.0), y0=y, y1=y + 1)
    put(px, "body_front", RED, x0=4, x1=5, y0=0, y1=10)
    put(px, "body_front", RED, x0=0, x1=8, y0=9, y1=10); put(px, "body_back", RED, y0=9, y1=10)
    put(px, "arm_side", CREAM, y0=0, y1=3); put(px, "arm_side", RED, y0=2, y1=3); put(px, "arm_top", CREAM)

def toque(B, sc):
    """A knit cap: the crown over the head, a folded band, a pompom on top (hat = the crown, hat2 = band and pompom)."""
    P = B["P"]; h = HEAD / 2; neck = (0, 0, LEG_H + BODY_H); top = neck[2] + HEAD
    bm = bmesh.new()
    box(bm, -h - 0.12, h + 0.12, -h - 0.12, h + 0.12, top - 0.75, top + 0.05, {"all": "extra"})      # the crown, snug on the head
    box(bm, -h + 0.25, h - 0.25, -h + 0.25, h - 0.25, top + 0.05, top + 0.42, {"all": "extra"})      # tapering in
    box(bm, -h - 0.24, h + 0.24, -h - 0.24, h + 0.24, top - 1.0, top - 0.42, {"all": "extra2"})      # the folded band
    box(bm, -0.36, 0.36, -0.36, 0.36, top + 0.42, top + 1.05, {"all": "extra2"})                   # the pompom
    mk("Toque", bm, bpy.data.materials[f"BaristaSkin-{B['kind']}"], P["Head"], neck, neck, sc)

def earmuffs(B, sc):
    P = B["P"]; h = HEAD / 2; neck = (0, 0, LEG_H + BODY_H); top = neck[2] + HEAD
    bm = bmesh.new()
    for sx in (-1, 1):
        box(bm, sx * (h + 0.05) - 0.25, sx * (h + 0.05) + 0.25, -0.55, 0.55, top - 1.75, top - 0.75, {"all": "extra2"})
    box(bm, -h - 0.3, h + 0.3, -0.18, 0.18, top - 0.05, top + 0.22, {"all": "extra"})
    for sx in (-1, 1):
        box(bm, sx * (h + 0.05) - 0.12, sx * (h + 0.05) + 0.12, -0.18, 0.18, top - 0.8, top + 0.1, {"all": "extra"})
    mk("Earmuffs", bm, bpy.data.materials[f"BaristaSkin-{B['kind']}"], P["Head"], neck, neck, sc)

def shovel(J, sc):
    """A snow shovel slung across the back (the janitors): a wooden handle, a steel blade low behind the hip, a cloth in hand, a bucket beside (the game shows the bucket only while cleaning)."""
    P = J["P"]; mat = bpy.data.materials[f"BaristaSkin-{J['kind']}"]
    bm = bmesh.new()
    box(bm, -0.16, 0.16, 0, 0.32, -1.2, 4.6, {"all": "shovel_handle"})
    box(bm, -0.5, 0.5, 0.05, 0.35, 4.4, 5.0, {"all": "shovel_handle"})                 # D grip
    box(bm, -1.0, 1.0, -0.05, 0.42, -2.6, -1.1, {"all": "shovel_blade"})                # the blade
    sh = mk("Shovel", bm, mat, P["Body"], (0, 0, 0), (0, 0, 0), sc)
    sh.location = (0, (BODY_D / 2 + 0.28) * CM, 1.0 * CM)
    sh.rotation_euler = (0, math.radians(32), 0)
    bm = bmesh.new()
    hand_z = -ARM_H + 0.25
    box(bm, -0.7, 0.7, -0.85, 0.25, hand_z - 0.22, hand_z + 0.04, {"all": "cloth"})
    cloth = mk("Cloth", bm, mat, P["Arm-R"], (0, 0, 0), (0, 0, 0), sc); cloth.location = (0, 0, 0)
    bm = bmesh.new()
    box(bm, -0.65, 0.65, -0.65, 0.65, 0, 1.25, {"all": "bucket"})
    bucket = mk("Bucket", bm, mat, P["Rig"], (0, 0, 0), (0, 0, 0), sc)
    bucket.location = (2.3 * CM, 0.4 * CM, 0)

def violin(F, sc):
    """A violin under the chin on the left (parented to the body) and the bow in the right hand (parented to the arm, so the Play clip saws it)."""
    P = F["P"]; mat = bpy.data.materials[f"BaristaSkin-{F['kind']}"]
    bm = bmesh.new()
    # The body: a waisted box pair, the front toward -y; the neck along +x; a scroll at its end; strings on the front.
    box(bm, -0.95, -0.15, -0.22, 0.22, -0.62, 0.62, {"all": "violin"})
    box(bm, -0.25, 0.55, -0.22, 0.22, -0.52, 0.52, {"all": "violin"})
    box(bm, -0.55, -0.10, -0.26, 0.26, -0.36, 0.36, {"all": "violin_dark"})           # the waist, a touch darker
    box(bm, 0.5, 1.9, -0.09, 0.09, -0.16, 0.16, {"all": "violin_dark"})               # the neck
    box(bm, 1.85, 2.25, -0.16, 0.16, -0.22, 0.22, {"all": "violin_dark"})             # the scroll
    box(bm, -0.9, 1.8, -0.26, -0.22, -0.1, 0.1, {"all": "strings"})                   # strings
    v = mk("Violin", bm, mat, P["Body"], (0, 0, 0), (0, 0, 0), sc)
    v.location = (-0.35 * CM, -(BODY_D / 2 + 0.6) * CM, (BODY_H + 0.3) * CM)                 # up under the chin, on the left
    v.rotation_euler = (math.radians(-22), math.radians(-24), math.radians(-30))               # the neck out to the left and up
    bm = bmesh.new()
    hand_z = -ARM_H + 0.25
    box(bm, -2.6, 0.4, -0.35, -0.2, hand_z - 0.08, hand_z + 0.08, {"all": "bow_stick"})
    box(bm, -2.5, 0.3, -0.42, -0.35, hand_z - 0.05, hand_z + 0.05, {"all": "bow_hair"})
    mk("Bow", bm, mat, P["Arm-R"], (0, 0, 0), (0, 0, 0), sc).location = (0, 0, 0)

def play(B):
    """2 s loop: the violin held up on the left, the bow arm sawing across, the head leaning onto the chin rest, a sway."""
    P = B["P"]; c = "Play"
    for f in (1, 49): K(c, P["Arm-L"], f, rot=(-66, 0, 52))
    for i, f in enumerate(range(1, 50, 6)):
        K(c, P["Arm-R"], f, rot=(-96 + (7 if i % 2 else -7), 0, (-24 if i % 2 else 4)))     # the bow arm up at chin height, sawing
    for f, (r, z) in ((1, (0, 0)), (13, (5, 0.05)), (25, (0, 0)), (37, (-5, 0.05)), (49, (0, 0))):
        K(c, P["Body"], f, loc=(0, 0, z), rot=(4, r, 0)); K(c, P["Head"], f, rot=(10, 0, -18 + r))
    blink(c, P, (30,))

def props(kind):
    px_img, px = pixels(kind)
    put(px, "cloth", (0.55, 0.78, 0.93)); put(px, "cloth", np.array((0.55, 0.78, 0.93)) * 0.85, x0=0, x1=8, y0=4, y1=5)
    put(px, "bucket", RED); put(px, "bucket", CREAM, y0=0, y1=2)
    put(px, "violin", (0.58, 0.32, 0.14)); put(px, "violin", (0.66, 0.38, 0.17), y0=2, y1=4)
    put(px, "violin_dark", (0.30, 0.16, 0.09)); put(px, "bow_stick", (0.34, 0.20, 0.12)); put(px, "bow_hair", (0.95, 0.93, 0.86))
    put(px, "shovel_handle", WOOD); put(px, "shovel_blade", (0.70, 0.72, 0.76)); put(px, "shovel_blade", (0.50, 0.52, 0.56), y0=6, y1=8)
    put(px, "strings", (0.92, 0.90, 0.80))
    L = LOOKS[kind]
    if L.get("plaid"):
        plaid(px, *L["plaid"])
    if L.get("parka"):
        parka(px)
    save(px_img, px)

ORDER = ["maple", "aspen", "rowan", "birch", "cedar", "fiddler"]
sc = bpy.data.scenes[0]
for o in list(sc.collection.all_objects):
    bpy.data.objects.remove(o, do_unlink=True)
ns["ACTS"].clear(); ns["REST"].clear()
built = {}
for i, kind in enumerate(ORDER):
    if ONLY and kind != ONLY:
        continue
    B = ns["build"](kind, sc, x_cm=i * 8)
    props(kind)
    top = LOOKS[kind]["top"]
    if top == "toque":
        toque(B, sc)
    elif top == "earmuffs":
        earmuffs(B, sc)
    if kind in ("birch", "cedar"):
        shovel(B, sc)
    if kind == "fiddler":
        violin(B, sc)
    ns["animate"](B, flip=1 if i % 2 == 0 else -1); ns["animate_moves"](B); ns["strum"](B)
    built[kind] = B

# The janitors' Wipe clip (as the Japanese janitor's) and the violinist's Play.
def wipe(B):
    P = B["P"]; c = "Wipe"
    for f, z in ((1, 0), (13, 0.05), (25, 0), (37, 0.05), (49, 0)): K(c, P["Body"], f, loc=(0, 0, z), rot=(18, 0, 0))
    for f, r in ((1, 14), (25, 18), (49, 14)): K(c, P["Head"], f, rot=(r, 0, 0))
    for f in (1, 49): K(c, P["Arm-L"], f, rot=(-58, 0, 12))
    for i, f in enumerate(range(1, 50, 6)):
        side = (-28, -6, 18, -6)[i % 4]
        reach = (-74, -80, -74, -68)[i % 4]
        K(c, P["Arm-R"], f, rot=(reach, 0, side))
    blink(c, P, (30,))
for kind, B in built.items():
    if kind in ("birch", "cedar"):
        wipe(B)
    if kind == "fiddler":
        play(B)

# Every part a clip moves gets all three channels, at rest where the clip leaves one alone (as the shipped models).
def fcurves_of(o, act):
    try:
        return list(act.fcurves)
    except AttributeError:
        out = []
        slot = o.animation_data.action_slot
        for layer in act.layers:
            for strip in layer.strips:
                cb = strip.channelbag(slot)
                if cb: out += list(cb.fcurves)
        return out
for (clip, o), act in list(ns["ACTS"].items()):
    o.animation_data.action = act
    fcs = fcurves_of(o, act)
    have = {fc.data_path for fc in fcs}
    frames = sorted({kp.co.x for fc in fcs for kp in fc.keyframe_points})
    if not frames:
        continue
    rest = ns["REST"][o]
    for path, value in (("location", rest[0]), ("rotation_euler", rest[1]), ("scale", rest[2])):
        if path in have:
            continue
        setattr(o, path, value.copy())
        for f in (frames[0], frames[-1]):
            o.keyframe_insert(path, frame=f)
ns["finish"]()

def select_tree(root):
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root] + list(root.children_recursive):
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
report = {}
for kind, B in built.items():
    root = B["root"]
    keep = root.location.copy(); root.location = (0, 0, 0)
    select_tree(root)
    path = os.path.join(OUT, f"barista-{kind}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_force_sampling=True, export_optimize_animation_size=False, export_extras=True, export_yup=True, export_apply=False, export_image_format='AUTO')
    root.location = keep
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in root.children_recursive if o.type == 'MESH')
    report[kind] = {"path": path, "tris": tris}
print('RESULT' + json.dumps(report))
if ONLY:
    raise SystemExit(0)

# Renders: the line-up idle; the janitor mid-wipe; the fiddler mid-play.
scene = sc
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.resolution_x = 1400; scene.render.resolution_y = 600; scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new("W"); world.use_nodes = True; world.node_tree.nodes["Background"].inputs[0].default_value = (0.78, 0.88, 0.98, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
scene.world = world
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.lens = 70
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", 'SUN')); sun.data.energy = 2.6; sun.rotation_euler = (math.radians(50), 0, math.radians(30)); scene.collection.objects.link(sun)
ground = bpy.data.objects.new("Ground", bpy.data.meshes.new("Ground")); scene.collection.objects.link(ground)
gb = bmesh.new(); bmesh.ops.create_cube(gb, size=1.0)
for v in gb.verts: v.co = Vector((v.co.x * 0.9 + 0.2, v.co.y * 0.4, v.co.z * 0.004 - 0.002))
gb.to_mesh(ground.data); gb.free()
gm = bpy.data.materials.new("GroundSnow"); gm.use_nodes = True; gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.96, 0.975, 1.0, 1); ground.data.materials.append(gm)
def look_at(target, dist, elev=12, azim=-28):
    t = Vector(target); a, e = math.radians(azim), math.radians(elev)
    cam.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
def play_clip(clip, frame):
    for o in ns["REST"]:
        if o.animation_data:
            for tr in o.animation_data.nla_tracks: tr.mute = tr.name != clip
    scene.frame_set(frame)
for o in bpy.data.objects:
    if o.name.startswith("Bucket"): o.scale = (0, 0, 0)
play_clip("Idle", 1)
look_at((2.5 * 8 * CM, 0, 0.037), 1.02, elev=12, azim=-8)
scene.render.filepath = os.path.join(OUT, "staff-lineup.png"); bpy.ops.render.render(write_still=True)
for o in bpy.data.objects:
    if o.name.startswith("Bucket"): o.scale = (1, 1, 1)
play_clip("Wipe", 7)
scene.render.resolution_x = 900
look_at((3 * 8 * CM + 0.01, 0, 0.03), 0.22, elev=18, azim=-30)
scene.render.filepath = os.path.join(OUT, "staff-janitor-wipe.png"); bpy.ops.render.render(write_still=True)
play_clip("Play", 9)
look_at((5 * 8 * CM, 0, 0.04), 0.22, elev=12, azim=-25)
scene.render.filepath = os.path.join(OUT, "staff-fiddler-play.png"); bpy.ops.render.render(write_still=True)
print('RENDERS DONE')
