"""The Canadian café's staff on the barista rig (base/barista_build.py): three baristas, two
janitors and the violinist, each its own look, with every clip the Japanese staff have plus Wipe
(the janitors) and Play (the violinist). Exports barista-<name>.glb files and renders.

  Blender --background --factory-startup --python staff_canada_build.py -- <out-dir> [only]

Looks (all read at a glance across the café):
- maple, aspen, rowan: the baristas: a white shirt under green overalls; a green cap with a white brim (maple),
  a blonde bun with a green tie (aspen), a white toque with a green pompom (rowan).
- birch, cedar: the janitors: blue work uniforms (a blue shirt under dark blue overalls), a navy toque (birch) or
  navy earmuffs (cedar); the snow shovel on the back.
- fiddler, pianist: the musicians, dressed alike: a black tailcoat over a white shirt front with gold trim, a red bow
  tie, the hair in a bun with a red ribbon. The fiddler has a violin under the chin and a bow in the right hand; the
  pianist plays the upright on the upper deck (the piano is part of the shell) sitting on its bench (clip PlayPiano).
Every look also climbs the stairs to the upper deck: ClimbUp and ClimbDown empty-handed, CarryUp and CarryDown
with a tray (1 s, two steps a loop; the game moves the root up or down the stair's slope, 9 mm a step).
Same node names as the Japanese staff (Rig, Body, Head, Blink, Arm-L/R, Leg-L/R, Tray, Guitar,
Hand-L/R; the janitors' Bucket), so the game's staff code runs unchanged.
"""
import bpy, bmesh, sys, os, math, json
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else os.path.join(HERE, 'out')
ONLY = args[1] if len(args) > 1 else None
os.makedirs(OUT, exist_ok=True)
ns = {"bpy": bpy}
exec(open(os.path.join(HERE, 'base', 'barista_build.py')).read(), ns)
rgb = ns["rgb"]; R = ns["R"]; K = ns["K"]; blink = ns["blink"]; box = ns["box"]; mk = ns["mk"]; CM = ns["CM"]
LEG_H, BODY_H, HEAD, BODY_W, BODY_D, ARM, ARM_H, TEX = ns["LEG_H"], ns["BODY_H"], ns["HEAD"], ns["BODY_W"], ns["BODY_D"], ns["ARM"], ns["ARM_H"], ns["TEX"]
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

WHITE = rgb(0.97, 0.97, 0.96); GREEN = rgb(0.13, 0.42, 0.26); GREEN_DK = rgb(0.08, 0.28, 0.17)
BLUE = rgb(0.30, 0.47, 0.78); BLUE_DK = rgb(0.13, 0.23, 0.50)
TUX = rgb(0.07, 0.07, 0.09); GOLD = rgb(0.86, 0.68, 0.30)
# Baristas: a white shirt under green overalls (the bib and the trousers), green caps and toque.
LOOKS["maple"] = look((0.95, 0.78, 0.64), (0.42, 0.26, 0.14), WHITE, GREEN, GREEN_DK, GREEN, (0.30, 0.20, 0.14), GREEN, WHITE, "cap")
LOOKS["aspen"] = look((0.97, 0.85, 0.74), (0.90, 0.76, 0.44), WHITE, GREEN, GREEN_DK, GREEN, (0.95, 0.93, 0.90), rgb(0.90, 0.76, 0.44), GREEN, "bun")
LOOKS["rowan"] = look((0.52, 0.34, 0.22), (0.10, 0.08, 0.08), WHITE, GREEN, GREEN_DK, GREEN, (0.18, 0.16, 0.16), WHITE, GREEN, "toque", eye=(0.08, 0.06, 0.06), blush=(0.80, 0.45, 0.40))
# Janitors: blue work uniforms, a lighter blue shirt under dark blue overalls, a navy toque or earmuffs.
LOOKS["birch"] = look((0.92, 0.72, 0.56), (0.55, 0.32, 0.16), BLUE, BLUE_DK, BLUE_DK, BLUE_DK, (0.20, 0.16, 0.14), BLUE_DK, WHITE, "toque")
LOOKS["cedar"] = look((0.88, 0.68, 0.52), (0.26, 0.18, 0.12), BLUE, BLUE_DK, BLUE_DK, BLUE_DK, (0.20, 0.16, 0.14), BLUE_DK, WHITE, "earmuffs")
# The musicians, dressed alike for the stage: a black tailcoat over a white shirt front, gold trim, a red bow tie,
# black trousers and shoes; the hair up in a bun with a red ribbon.
LOOKS["fiddler"] = look((0.96, 0.82, 0.70), (0.60, 0.40, 0.24), TUX, WHITE, GOLD, TUX, (0.05, 0.05, 0.06), rgb(0.60, 0.40, 0.24), RED, "bun", bowtie=True)
LOOKS["pianist"] = look((0.86, 0.66, 0.50), (0.20, 0.14, 0.10), TUX, WHITE, GOLD, TUX, (0.05, 0.05, 0.06), rgb(0.20, 0.14, 0.10), RED, "bun",
                        eye=(0.08, 0.06, 0.06), bowtie=True)

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

VIOLIN_HOLD = {}

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
    # Held as a violin is: the body on the left shoulder, tucked under the overhanging head (the chin), the
    # tail end toward the middle of the chest, the neck reaching forward and out to the left and a touch up,
    # the strings facing up (a little inward, toward the bow). Built from explicit directions (body space,
    # cm from the hip, the front -y), not hand-tuned Euler angles: the old ones held it across the face.
    O = Vector((-0.75, -(BODY_D / 2 + 0.4), BODY_H - 0.28))
    n = Vector((-0.65, -0.75, 0.12)).normalized()                       # the neck's direction
    up = Vector((0.25, 0.0, 1.0)); s = (up - n * up.dot(n)).normalized()  # the strings' face
    X, Y = n, -s; Z = X.cross(Y)
    v.rotation_euler = Matrix((X, Y, Z)).transposed().to_euler('XYZ')
    v.location = O * CM
    # The left hand closes on the neck where it is an arm's reach from the shoulder; the Play clip aims Arm-L there.
    sh = Vector((-(BODY_W / 2 + ARM / 2), 0, BODY_H - 0.25)); reach = ARM_H - 0.25
    t = min((k / 100 for k in range(40, 221)), key=lambda t: abs((O + n * t - sh).length - reach))
    aim = Vector((0, 0, -1)).rotation_difference((O + n * t - sh).normalized()).to_euler('XYZ')
    VIOLIN_HOLD["arm_l"] = tuple(math.degrees(a) for a in aim)
    bm = bmesh.new()
    hand_z = -ARM_H + 0.25
    box(bm, -2.6, 0.4, -0.35, -0.2, hand_z - 0.08, hand_z + 0.08, {"all": "bow_stick"})
    box(bm, -2.5, 0.3, -0.42, -0.35, hand_z - 0.05, hand_z + 0.05, {"all": "bow_hair"})
    mk("Bow", bm, mat, P["Arm-R"], (0, 0, 0), (0, 0, 0), sc).location = (0, 0, 0)

def play(B):
    """2 s loop: the violin held up on the left, the bow arm sawing across, the head leaning onto the chin rest, a sway."""
    P = B["P"]; c = "Play"
    ax, ay, az = VIOLIN_HOLD["arm_l"]                    # the neck hand on the violin's neck (see violin()), with a vibrato
    for i, f in enumerate(range(1, 50, 6)):
        K(c, P["Arm-L"], f, rot=(ax + (1.5 if i % 2 else -1.5), ay, az))
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
    if L.get("bowtie"):
        put(px, "body_front", RED, x0=2, x1=6, y0=0, y1=1); put(px, "body_front", RED, x0=3, x1=5, y0=1, y1=2)
        put(px, "body_front", CREAM, x0=0, x1=2, y0=0, y1=1); put(px, "body_front", CREAM, x0=6, x1=8, y0=0, y1=1)
    save(px_img, px)

ORDER = ["maple", "aspen", "rowan", "birch", "cedar", "fiddler", "pianist"]
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
def climb(B, c, up, carry):
    """1 s, two steps up (or down) the stairs, in place: the lifted leg comes higher than on the flat going up and
    reaches down going down; the body leans into the climb (back a little coming down) and bobs on each step; the
    head watches the steps. Carrying, the arms hold the tray out as in Carry and the tray rides the bob."""
    P = B["P"]
    fwd, back = (-50, 14) if up else (-30, 18)
    lean, look = (12, 8) if up else (-4, 16)
    for f, k in ((1, 1), (7, 0), (13, -1), (19, 0), (25, 1)):
        a = fwd if k == 1 else back if k == -1 else (fwd + back) / 2 - 6
        b = fwd if k == -1 else back if k == 1 else (fwd + back) / 2 - 6
        K(c, P["Leg-L"], f, rot=(a, 0, 0)); K(c, P["Leg-R"], f, rot=(b, 0, 0))
        bob = (0.16 if k == 0 else 0.0) if up else (0.0 if k == 0 else -0.10)
        K(c, P["Body"], f, loc=(0, 0, bob), rot=(lean, 0, 3 * k))
        K(c, P["Head"], f, rot=(look, 0, 0))
        if carry:
            K(c, P["Arm-L"], f, rot=(-78, 0, 6)); K(c, P["Arm-R"], f, rot=(-78, 0, -6))
            K(c, P["Tray"], f, loc=(0, 0, bob * 0.5))
        else:
            sw = 22 if up else 14
            K(c, P["Arm-L"], f, rot=(sw * k, 0, 0)); K(c, P["Arm-R"], f, rot=(-sw * k, 0, 0))
    blink(c, P, (16,))

def play_piano(B):
    """2 s loop, sitting at the upright: the rig lowered onto the bench (legs straight out under the keys, as box
    legs sit), hands on the keys rising and falling out of step and drifting along them, a sway and a nod."""
    P = B["P"]; c = "PlayPiano"
    for f in (1, 49):
        K(c, P["Rig"], f, loc=(0, 0, -0.8))
        K(c, P["Leg-L"], f, rot=(-90, 0, 0)); K(c, P["Leg-R"], f, rot=(-90, 0, 0))
    for i, f in enumerate(range(1, 50, 4)):
        drift = (6, 0, -6, 0)[i % 4]
        K(c, P["Arm-L"], f, rot=(-60 + (9 if i % 2 else -3), 0, 8 + drift))
        K(c, P["Arm-R"], f, rot=(-60 + (-3 if i % 2 else 9), 0, -8 + drift))
    for f, (r, n) in ((1, (0, 4)), (13, (4, 10)), (25, (0, 4)), (37, (-4, 10)), (49, (0, 4))):
        K(c, P["Body"], f, rot=(5, r, 0)); K(c, P["Head"], f, rot=(n, 0, -r * 1.5))
    blink(c, P, (22,))

for kind, B in built.items():
    if kind in ("birch", "cedar"):
        wipe(B)
    if kind == "fiddler":
        play(B)
    if kind == "pianist":
        play_piano(B)
    climb(B, "ClimbUp", True, False); climb(B, "ClimbDown", False, False)
    climb(B, "CarryUp", True, True); climb(B, "CarryDown", False, True)

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
                              export_force_sampling=True, export_optimize_animation_size=True,   # drops only repeated keys (lossless), so keeping held poses below costs little
                              export_optimize_animation_keep_anim_object=True,   # keep a held pose: a part that holds still all clip (the pianist's lowered rig and legs, the fiddler's neck hand) was dropped
                              export_extras=True, export_yup=True, export_apply=False, export_image_format='AUTO')
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
look_at((3 * 8 * CM, 0, 0.037), 1.15, elev=12, azim=-8)
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
play_clip("PlayPiano", 9)
look_at((6 * 8 * CM, 0, 0.03), 0.20, elev=14, azim=55)
scene.render.filepath = os.path.join(OUT, "staff-pianist-play.png"); bpy.ops.render.render(write_still=True)
play_clip("CarryUp", 1)
look_at((0, 0, 0.04), 0.22, elev=10, azim=-70)
scene.render.filepath = os.path.join(OUT, "staff-climb-carry.png"); bpy.ops.render.render(write_still=True)
print('RENDERS DONE')
