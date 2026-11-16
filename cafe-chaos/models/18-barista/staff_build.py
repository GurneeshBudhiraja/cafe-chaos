"""Build the janitor (a new look on the barista rig, with a cloth) and add a Wipe clip to every look; export glbs and renders.
Runs in a fresh, empty background Blender: nothing is saved to any .blend."""
import bpy, sys, math, json
import numpy as np
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[0], args[1]
ONLY = args[2] if len(args) > 2 else None
ORDER = ["sora", "momo", "yuki", "janitor"]
ns = {"bpy": bpy}
exec(open(SRC).read(), ns)
rgb = ns["rgb"]; R = ns["R"]; K = ns["K"]; blink = ns["blink"]; box = ns["box"]; mk = ns["mk"]; CM = ns["CM"]

# The janitor: green work shirt and darker overall bib, a green flat cap, brown hair, a brass buckle.
# The janitor: a bright safety-blue coverall (shirt, bib and legs all one), yellow reflective stripes, a white
# badge on the chest, a yellow bandana; nobody else in the café wears blue or yellow, so it reads at a glance.
BLUE = rgb(0.13, 0.42, 0.86); YELLOW = rgb(0.98, 0.84, 0.16); WHITE = rgb(0.97, 0.97, 0.95)
ns["LOOKS"]["janitor"] = dict(skin=rgb(0.90, 0.70, 0.55), hair=rgb(0.38, 0.24, 0.14), shirt=BLUE, apron=BLUE,
                             trim=YELLOW, legs=BLUE, shoes=rgb(0.18, 0.16, 0.16), hat=YELLOW,
                             hat2=BLUE, eye=rgb(0.10, 0.08, 0.09), blush=rgb(0.95, 0.58, 0.55), mouth=rgb(0.70, 0.34, 0.34), top="bandana")
# A free corner of the 64 px skin for the cloth.
R["cloth"] = (48, 0, 56, 8)
R["mop_handle"] = (56, 0, 60, 8)
R["mop_head"] = (60, 0, 64, 8)
R["bucket"] = (48, 8, 56, 16)
CLOTH = (0.55, 0.78, 0.93)

def wipe(B):
    """2 s loop: leaning over a table, the right hand wiping round and round, the left hand resting on the edge."""
    P = B["P"]; c = "Wipe"
    for f, z in ((1, 0), (13, 0.05), (25, 0), (37, 0.05), (49, 0)): K(c, P["Body"], f, loc=(0, 0, z), rot=(18, 0, 0))
    for f, r in ((1, 14), (25, 18), (49, 14)): K(c, P["Head"], f, rot=(r, 0, 0))
    for f in (1, 49): K(c, P["Arm-L"], f, rot=(-58, 0, 12))
    for i, f in enumerate(range(1, 50, 6)):
        side = (-28, -6, 18, -6)[i % 4]
        reach = (-74, -80, -74, -68)[i % 4]
        K(c, P["Arm-R"], f, rot=(reach, 0, side))
    blink(c, P, (30,))

sc = bpy.data.scenes[0]
for o in list(sc.collection.all_objects): bpy.data.objects.remove(o, do_unlink=True)
ns["ACTS"].clear(); ns["REST"].clear()
built = {}
for i, kind in enumerate(ORDER):
    if ONLY and kind != ONLY: continue
    B = ns["build"](kind, sc, x_cm=i * 8)
    ns["animate"](B, flip=1 if i == 0 else -1); ns["animate_moves"](B); ns["strum"](B); wipe(B)
    built[kind] = B
# The janitor's cloth, in its right hand (it moves with the arm), painted on the free corner of its skin.
J = built.get("janitor")
if J:
  img = bpy.data.images["BaristaSkin-janitor"]
  px = np.array(img.pixels[:], np.float32).reshape(64, 64, 4)
  x0, y0, x1, y1 = R["cloth"]
  px[64 - y1:64 - y0, x0:x1, :3] = CLOTH
  px[64 - y1:64 - y0, x0:x1:2, :3] = np.array(CLOTH) * 0.85
  def put(reg, col, x0=0, y0=0, x1=None, y1=None):
      rx0, ry0, rx1, ry1 = R[reg]
      x1 = rx1 - rx0 if x1 is None else x1; y1 = ry1 - ry0 if y1 is None else y1
      px[64 - (ry0 + y1):64 - (ry0 + y0), rx0 + x0:rx0 + x1, :3] = col
  Y = np.array(YELLOW); W = np.array(WHITE); Bl = np.array(BLUE)
  # Reflective stripes round the chest and the legs, and on the sleeves.
  for f in ("body_front", "body_back", "body_left", "body_right"): put(f, Y, y0=6, y1=7)
  put("leg_side", Y, y0=4, y1=5)
  put("arm_side", Y, y0=2, y1=3)
  # The badge: a white patch on the chest, a small blue broom on it.
  put("body_front", W, x0=4, x1=7, y0=1, y1=4)
  put("body_front", Bl, x0=6, x1=7, y0=1, y1=3); put("body_front", Bl, x0=5, x1=7, y0=3, y1=4)
  # The mop: a wooden handle, a cream head; the bucket: yellow with a blue rim.
  put("mop_handle", np.array((0.62, 0.42, 0.24)))
  put("mop_head", np.array((0.93, 0.90, 0.80))); put("mop_head", np.array((0.80, 0.77, 0.68)), y0=6, y1=8)
  put("bucket", Y); put("bucket", Bl, y0=0, y1=2)
  img.pixels.foreach_set(px.ravel()); img.pack()
  import bmesh
  bm = bmesh.new()
  arm = J["P"]["Arm-R"]
  hand_z = -ns["ARM_H"] + 0.25
  box(bm, -0.7, 0.7, -0.85, 0.25, hand_z - 0.22, hand_z + 0.04, {"all": "cloth"})
  cloth = mk("Cloth", bm, bpy.data.materials["BaristaSkin-janitor"], arm, (0, 0, 0), (0, 0, 0), sc)
  cloth.location = (0, 0, 0)
  mat = bpy.data.materials["BaristaSkin-janitor"]
  body = J["P"]["Body"]
  # The mop, slung across the back: the handle from over the right shoulder down to the left hip, the head behind it.
  bm = bmesh.new()
  box(bm, -0.18, 0.18, 0, 0.36, -1.6, 4.4, {"all": "mop_handle"})
  box(bm, -0.75, 0.75, -0.2, 0.55, -2.6, -1.5, {"all": "mop_head"})
  mop = mk("Mop", bm, mat, body, (0, 0, 0), (0, 0, 0), sc)
  mop.location = (0, (ns["BODY_D"] / 2 + 0.25) * CM, 1.0 * CM)
  mop.rotation_euler = (0, math.radians(-38), 0)
  # The bucket, set down beside it while it wipes (shown only by the Wipe clip).
  bm = bmesh.new()
  box(bm, -0.65, 0.65, -0.65, 0.65, 0, 1.25, {"all": "bucket"})
  bucket = mk("Bucket", bm, mat, J["P"]["Rig"], (0, 0, 0), (0, 0, 0), sc)
  bucket.location = (2.3 * CM, 0.4 * CM, 0)
  # Shown by the game only while it cleans (it collapses the bucket's part to nothing otherwise).
# Every part a clip moves gets all three channels (position, turn, size), at rest where the clip leaves one alone,
# as the shipped models have: a clip then always sets the whole pose of what it moves.
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
    if not frames: continue
    rest = ns["REST"][o]
    for path, value in (("location", rest[0]), ("rotation_euler", rest[1]), ("scale", rest[2])):
        if path in have: continue
        setattr(o, path, value.copy())
        for f in (frames[0], frames[-1]): o.keyframe_insert(path, frame=f)
ns["finish"]()

# ---- export each look (its hierarchy only), clips from the NLA tracks
def select_tree(root):
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root] + list(root.children_recursive): o.select_set(True)
    bpy.context.view_layer.objects.active = root

report = {}
for kind, B in built.items():
    root = B["root"]
    keep = root.location.copy(); root.location = (0, 0, 0)
    select_tree(root)
    path = f"{OUT}/barista-{kind}.glb"
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_force_sampling=True, export_optimize_animation_size=False, export_extras=True, export_yup=True, export_apply=False, export_image_format='AUTO')
    root.location = keep
    report[kind] = path
print('RESULT' + json.dumps(report))

ICON = len(args) > 3 and args[3] == 'icon'
if ONLY and ICON:
    # The shop picture, in the icon set's own look (icon_render.py): 256 px, transparent, a warm sky, a 60 mm lens,
    # the same sun, 28 degrees down and 30 to the side, framed to the figure.
    sc.render.resolution_x = sc.render.resolution_y = 256; sc.render.resolution_percentage = 100
    sc.render.film_transparent = True; sc.view_settings.view_transform = 'Standard'
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    w = bpy.data.worlds.new("IconWorld"); w.use_nodes = True; bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.92, 0.90, 0.86, 1); bg.inputs[1].default_value = 0.9; sc.world = w
    cam = bpy.data.objects.new("IconCam", bpy.data.cameras.new("IconCam")); cam.data.lens = 60; sc.collection.objects.link(cam); sc.camera = cam
    sun = bpy.data.objects.new("IconSun", bpy.data.lights.new("IconSun", 'SUN')); sun.data.energy = 2.2; sun.data.angle = math.radians(25)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35)); sc.collection.objects.link(sun)
    root = built[ONLY]["root"]; root.location = (0, 0, 0)
    for o in root.children_recursive:
        if o.name.startswith('Bucket'): o.scale = (0, 0, 0)
    for o in ns["REST"]:
        if o.animation_data:
            for tr in o.animation_data.nla_tracks: tr.mute = tr.name != "Idle"
    sc.frame_set(1)
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(b) for o in [root] + list(root.children_recursive) if o.type == 'MESH' for b in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre = (mn + mx) / 2; d = (mx - mn).length * 1.25 * 1.55
    e, y = math.radians(28), math.radians(-30)
    cam.location = centre + Vector((math.sin(y) * math.cos(e), -math.cos(y) * math.cos(e), math.sin(e))) * d
    cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f"{OUT}/icon-{ONLY}.png"; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    bpy.ops.render.render(write_still=True)
    print('ICON')
if ONLY:
    raise SystemExit(0)
# ---- renders for the owner: the janitor standing, and each look mid-wipe
scene = sc
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scene.render.resolution_x = 900; scene.render.resolution_y = 600; scene.render.film_transparent = False
world = bpy.data.worlds.new("W"); world.use_nodes = True; world.node_tree.nodes["Background"].inputs[0].default_value = (0.93, 0.89, 0.82, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 1.2
scene.world = world
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.lens = 70
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), 0, math.radians(30)); scene.collection.objects.link(sun)
def look(target, dist, elev=12, azim=-28):
    t = Vector(target)
    a, e = math.radians(azim), math.radians(elev)
    cam.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    d = t - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
def play(clip, frame):
    for o in ns["REST"]:
        if o.animation_data:
            for tr in o.animation_data.nla_tracks: tr.mute = tr.name != clip
    scene.frame_set(frame)
centre_x = 1.5 * 8 * CM
bucket = next((o for o in bpy.data.objects if o.name.startswith("Bucket")), None)
if bucket: bucket.scale = (0, 0, 0)
play("Idle", 1)
look((centre_x, 0, 0.037), 0.62, elev=14, azim=-10)
scene.render.filepath = f"{OUT}/staff-lineup.png"; bpy.ops.render.render(write_still=True)
jx = 3 * 8 * CM
if bucket: bucket.scale = (1, 1, 1)
play("Wipe", 7)
look((jx, 0, 0.037), 0.3, elev=14, azim=-35)
scene.render.filepath = f"{OUT}/janitor-wipe.png"; bpy.ops.render.render(write_still=True)
if bucket: bucket.scale = (0, 0, 0)
play("Walk", 7)
look((jx, 0, 0.037), 0.3, elev=14, azim=50)
scene.render.filepath = f"{OUT}/janitor-walk.png"; bpy.ops.render.render(write_still=True)
play("Wipe", 13)
look((0, 0, 0.037), 0.3, elev=14, azim=-35)
scene.render.filepath = f"{OUT}/sora-wipe.png"; bpy.ops.render.render(write_still=True)
print('RENDERED')
