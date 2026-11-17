"""Build the Canadian winter café shell (Hoser's · Coffee & Donuts) and export it.

Runs in a fresh background Blender (nothing is saved to a .blend):
  Blender --background --factory-startup --python cafe_canada_build.py -- <out-dir>

A diorama on the player's table, the same plate, origin, floor height and
entrance side as the Japanese `cafe-shell`, so the game needs no geometry
changes (see ../../game/docs/CANADA-PLAN.md): a log cabin with its counter
along the back wall, a snow-dusted deck (the patio) on the right, a frozen
lake with a dock and a red canoe front right, a bonfire ring front left,
snowy spruces, string lights, a gate arch with the sign where the queue
forms. Bright sunny winter day: flat pastel materials, no glowing walls,
the lights only a touch emissive.

Coordinates below are the game's: +Y up, the player toward +Z, the entrance
on +X, metres; `G()` turns them into Blender's (the glTF export swaps back).
"""
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(OUT, 'previews'), exist_ok=True)

sc = bpy.data.scenes[0]
for o in list(sc.collection.all_objects):
    bpy.data.objects.remove(o, do_unlink=True)

FLOOR = 0.024       # the café floor's top (and the snow's)
PLATE_W, PLATE_D = 0.92, 0.62

# ------------------------------------------------------------------ materials
MATS = {}
def mat(name, rgb, rough=0.85, emit=None, strength=0.0, alpha=None, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metallic
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    if alpha is not None:
        bsdf.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except AttributeError:
            m.blend_method = 'BLEND'
    MATS[name] = m
    return m

mat('Snow', (0.96, 0.975, 1.0), 0.95)
mat('SnowShade', (0.86, 0.91, 0.98), 0.95)
mat('PlateEdge', (0.84, 0.79, 0.70), 0.9)
mat('Pine', (0.82, 0.60, 0.36), 0.8)
mat('PineDark', (0.58, 0.38, 0.21), 0.85)
mat('PlankFloor', (0.74, 0.54, 0.34), 0.8)
mat('Deck', (0.60, 0.50, 0.41), 0.85)
mat('Red', (0.70, 0.08, 0.11), 0.6)
mat('Cream', (0.97, 0.93, 0.85), 0.7)
mat('Glass', (0.78, 0.90, 0.97), 0.1, alpha=0.38)
mat('Ice', (0.66, 0.82, 0.94), 0.15)
mat('IceDeep', (0.44, 0.64, 0.84), 0.12)
mat('Spruce', (0.17, 0.37, 0.27), 0.9)
mat('SpruceLight', (0.27, 0.50, 0.35), 0.9)
mat('Trunk', (0.40, 0.27, 0.16), 0.9)
mat('Stone', (0.57, 0.58, 0.60), 0.9)
mat('StoneDark', (0.40, 0.41, 0.44), 0.9)
mat('Fire', (1.0, 0.50, 0.10), 0.5, emit=(1.0, 0.42, 0.06), strength=3.5)
mat('FireCore', (1.0, 0.88, 0.40), 0.5, emit=(1.0, 0.80, 0.30), strength=5.0)
mat('Bulb', (1.0, 0.88, 0.62), 0.4, emit=(1.0, 0.82, 0.50), strength=1.6)
mat('Wire', (0.16, 0.15, 0.14), 0.9)
mat('Chalk', (0.13, 0.15, 0.14), 0.9)
mat('ChalkText', (0.95, 0.95, 0.90), 0.9)
mat('Steel', (0.76, 0.77, 0.80), 0.35, metallic=0.8)
mat('Donut', (0.84, 0.62, 0.38), 0.8)
mat('IcingPink', (0.96, 0.62, 0.72), 0.6)
mat('IcingChoc', (0.38, 0.23, 0.14), 0.6)
mat('IcingMaple', (0.86, 0.52, 0.22), 0.6)
mat('Smoke', (0.92, 0.92, 0.94), 0.9, alpha=0.55)

# ------------------------------------------------------------------ helpers
ROOT = bpy.data.objects.new('cafe-canada', None)
sc.collection.objects.link(ROOT)
ROOT['cafe_model'] = True
ROOT['cafe_style'] = 'canada'
ROOT['front_edge_z_m'] = 0.16
ROOT['back_edge_z_m'] = -0.27
ROOT['floor_top_y_m'] = FLOOR
ROOT['window_side'] = '-x'
ROOT['entrance_side'] = '+x'

def G(x, y, z):
    """Game space (x right, y up, z toward the player) to Blender (z up, -y toward the player)."""
    return Vector((x, -z, y))

def new_obj(name, bm, material, parent=ROOT, shade_smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if shade_smooth:
        for p in me.polygons:
            p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(MATS[material] if isinstance(material, str) else material)
    o.parent = parent
    sc.collection.objects.link(o)
    return o

class Part:
    """A mesh being built out of primitives (one material), in game space."""
    def __init__(self, name, material, smooth=False):
        self.name, self.material, self.smooth = name, material, smooth
        self.bm = bmesh.new()
    def _xform(self, geom, at, scale, rot_y=0.0, rot_x=0.0, rot_z=0.0):
        M = Matrix.Translation(G(*at)) @ Matrix.Rotation(-math.radians(rot_y), 4, 'Z') @ Matrix.Rotation(math.radians(rot_x), 4, 'X') @ Matrix.Rotation(math.radians(rot_z), 4, 'Y') @ Matrix.Diagonal(Vector((scale[0], scale[2], scale[1], 1)))
        bmesh.ops.transform(self.bm, matrix=M, verts=geom['verts'])
    def box(self, at, size, rot_y=0.0, rot_x=0.0, rot_z=0.0):
        """A box centred at `at` (game space), `size` (x, y, z) in metres."""
        g = bmesh.ops.create_cube(self.bm, size=1.0)
        self._xform(g, at, size, rot_y, rot_x, rot_z)
        return self
    def boxb(self, at, size, rot_y=0.0):
        """A box whose base's centre is at `at`."""
        return self.box((at[0], at[1] + size[1] / 2, at[2]), size, rot_y)
    def cyl(self, at, r, h, axis='y', seg=10, r2=None, rot_y=0.0):
        """A cylinder centred at `at`, radius `r` (top radius r2), height h, along the game axis (x, y or z)."""
        g = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
        rx = {'y': 0, 'z': 90, 'x': 0}[axis]
        rz = 90 if axis == 'x' else 0
        # create_cone stands along Blender Z; game y is Blender z, game z is Blender -y, game x is Blender x.
        M = Matrix.Translation(G(*at)) @ Matrix.Rotation(-math.radians(rot_y), 4, 'Z') @ Matrix.Rotation(math.radians(rx), 4, 'X') @ Matrix.Rotation(math.radians(rz), 4, 'Y')
        bmesh.ops.transform(self.bm, matrix=M, verts=g['verts'])
        return self
    def cone(self, at, r, h, seg=8):
        """A cone standing on `at` (its base's centre), pointing up."""
        g = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=0.0, depth=h)
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation(G(at[0], at[1] + h / 2, at[2])), verts=g['verts'])
        return self
    def sphere(self, at, r, seg=10, rings=7, scale=(1, 1, 1)):
        g = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=r)
        M = Matrix.Translation(G(*at)) @ Matrix.Diagonal(Vector((scale[0], scale[2], scale[1], 1)))
        bmesh.ops.transform(self.bm, matrix=M, verts=g['verts'])
        return self
    def ellipse(self, at, rx, ry, depth, seg=28):
        """A flat ellipse rx by ry (game x by y) of thickness `depth` along game z, facing the player."""
        g = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=1.0, radius2=1.0, depth=1.0)
        M = Matrix.Translation(G(*at)) @ Matrix.Rotation(math.radians(90), 4, 'X') @ Matrix.Diagonal(Vector((rx, ry, depth, 1)))
        bmesh.ops.transform(self.bm, matrix=M, verts=g['verts'])
        return self
    def done(self, parent=ROOT):
        return new_obj(self.name, self.bm, self.material, parent, self.smooth)

exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'textures.py')).read())   # textures + UVs onto the palette

def anchor(name, at, rot_y=0.0, parent=ROOT):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.01
    e.empty_display_type = 'PLAIN_AXES'
    e.location = G(*at)
    e.rotation_euler = (0, 0, -math.radians(rot_y))
    e.parent = parent
    sc.collection.objects.link(e)
    return e

def text_mesh(name, body, size, material, at, rot_y=0.0, rot_x=0.0, extrude=0.0006, align='CENTER', parent=ROOT):
    """Words as a mesh (Blender's built-in font), standing upright facing the game's +Z, at `at`."""
    cu = bpy.data.curves.new(name + '-curve', type='FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.resolution_u = 4
    cu.align_x = align
    cu.align_y = 'CENTER'
    tmp = bpy.data.objects.new(name + '-tmp', cu)
    sc.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(MATS[material])
    # Text is drawn in Blender's XY plane; stand it up so it faces the game's +Z (Blender -Y), then turn it.
    o.matrix_world = Matrix.Translation(G(*at)) @ Matrix.Rotation(-math.radians(rot_y), 4, 'Z') @ Matrix.Rotation(math.radians(90 + rot_x), 4, 'X')
    o.parent = parent
    o.matrix_parent_inverse = parent.matrix_world.inverted()
    sc.collection.objects.link(o)
    return o

# ------------------------------------------------------------------ the plate and the snow
Part('Base', 'PlateEdge').boxb((0, 0, 0), (PLATE_W, 0.02, PLATE_D)).done()
# Snow over the whole plate but the cabin floor, the deck and the lake: four slabs around them.
snow = Part('SnowGround', 'Snow')
snow.boxb((-0.20, 0.02, 0.235), (0.52, 0.004, 0.15))        # front left, round the bonfire
snow.boxb((-0.44, 0.02, -0.055), (0.04, 0.004, 0.43))        # left strip beside the cabin
snow.boxb((0.00, 0.02, -0.29), (0.92, 0.004, 0.04))          # back strip behind the cabin and the stage
snow.boxb((0.43, 0.02, 0.00), (0.06, 0.004, 0.62))           # right strip: the gate's ground
snow.boxb((0.23, 0.02, -0.195), (0.34, 0.004, 0.15))         # behind the deck: the stage's ground
snow.boxb((0.09, 0.02, 0.245), (0.06, 0.004, 0.13))          # between the bonfire and the lake
snow.boxb((0.04, 0.02, -0.055), (0.04, 0.004, 0.43))         # the cabin's doorstep strip, under the deck's left edge
# Soft banks where the snow meets the lake and the deck, and drifts along the plate's back edge.
for x, z, sx, sz in ((0.06, 0.19, 0.08, 0.02), (0.27, 0.19, 0.30, 0.02), (0.44, 0.255, 0.04, 0.11), (-0.06, 0.25, 0.028, 0.10)):
    snow.sphere((x, 0.024, z), 1.0, seg=10, rings=6, scale=(sx, 0.012, sz))
for i in range(7):
    x = -0.40 + i * 0.13
    snow.sphere((x, 0.024, -0.30), 1.0, seg=10, rings=6, scale=(0.07, 0.014 + 0.004 * (i % 2), 0.025))
snow.done()

# ------------------------------------------------------------------ the cabin
CAB = dict(x0=-0.42, x1=0.04, z0=-0.27, z1=0.16)   # outer walls
H = 0.155                                            # wall height over the floor
LOG_R = 0.0072
Part('CabinFloor', 'PlankFloor').boxb((-0.19, 0.02, -0.055), (0.44, 0.004, 0.41)).done()
grooves = Part('CabinFloorGrooves', 'PineDark')
for i in range(10):
    grooves.boxb((-0.19, 0.0241, -0.245 + i * 0.042), (0.44, 0.0005, 0.0015))
grooves.done()

def log_wall(part, spans, z=None, x=None, y_from=FLOOR, logs=11, gap=None):
    """Horizontal logs stacked `logs` high along x (`z` fixed) or along z (`x` fixed); `spans` are (from, to) pairs along the wall; `gap` (lo, hi, log_lo, log_hi) leaves a window: logs log_lo..log_hi skip (lo, hi)."""
    for k in range(logs):
        y = y_from + LOG_R + k * (2 * LOG_R - 0.0006)
        for a, b in spans:
            pieces = [(a, b)]
            if gap and gap[2] <= k <= gap[3]:
                lo, hi = gap[0], gap[1]
                pieces = [(a, lo), (hi, b)]
            for p0, p1 in pieces:
                if p1 - p0 < 0.004:
                    continue
                if z is not None:
                    part.cyl(((p0 + p1) / 2, y, z), LOG_R, p1 - p0, axis='x', seg=8)
                else:
                    part.cyl((x, y, (p0 + p1) / 2), LOG_R, p1 - p0, axis='z', seg=8)

walls = Part('CabinLogs', 'Pine', smooth=True)
# Back wall: full height, behind the counter and the back bar.
log_wall(walls, [(CAB['x0'], CAB['x1'])], z=CAB['z0'])
# Left wall: full height, a window in its middle (logs 3..8 skip z -0.17..-0.03).
log_wall(walls, [(CAB['z0'], CAB['z1'])], x=CAB['x0'], gap=(-0.17, -0.03, 3, 8))
# Front wall: a knee-high half wall (4 logs), so the player sees every table; a front window frame stands on it (below).
log_wall(walls, [(CAB['x0'], CAB['x1'])], z=CAB['z1'], logs=4)
# Right wall: a half wall each side of the door (the door at z -0.02..0.08), 4 logs.
log_wall(walls, [(CAB['z0'], -0.02), (0.08, CAB['z1'])], x=CAB['x1'], logs=4)
walls.done()
# Log ends: a darker disc at each wall corner (the crossed logs of a cabin).
ends = Part('CabinLogEnds', 'PineDark', smooth=True)
for k in range(11):
    y = FLOOR + LOG_R + k * (2 * LOG_R - 0.0006)
    for cx in (CAB['x0'], CAB['x1']):
        ends.cyl((cx, y, CAB['z0'] - 0.006), LOG_R * 0.95, 0.012, axis='z', seg=8)
    ends.cyl((CAB['x0'] - 0.006, y, CAB['z0']), LOG_R * 0.95, 0.012, axis='x', seg=8)
    if k < 4:
        ends.cyl((CAB['x0'] - 0.006, y, CAB['z1']), LOG_R * 0.95, 0.012, axis='x', seg=8)
        ends.cyl((CAB['x1'] + 0.006, y, CAB['z1']), LOG_R * 0.95, 0.012, axis='x', seg=8)
        ends.cyl((CAB['x0'], y, CAB['z1'] + 0.006), LOG_R * 0.95, 0.012, axis='z', seg=8)
ends.done()
# Corner posts: cream-trimmed square posts at the four corners and either side of the door.
posts = Part('CabinPosts', 'PineDark')
for px, pz in ((CAB['x0'], CAB['z0']), (CAB['x1'], CAB['z0']), (CAB['x0'], CAB['z1']), (CAB['x1'], CAB['z1']), (CAB['x1'], -0.02), (CAB['x1'], 0.08)):
    tall = H + 0.01 if pz == CAB['z0'] or px == CAB['x1'] and pz in (-0.02, 0.08) else 4 * (2 * LOG_R - 0.0006) + 0.01
    posts.boxb((px, FLOOR, pz), (0.016, tall, 0.016))
# The door's lintel, and a top rail along the front half wall.
posts.box((CAB['x1'], FLOOR + 4 * (2 * LOG_R - 0.0006) + 0.07, 0.03), (0.016, 0.014, 0.13))
posts.done()
# The left window: frame, glass, cross bar; the front window over the half wall, glass only in its upper half.
frames = Part('WindowFrames', 'Cream')
wx, wz0, wz1, wy0, wy1 = CAB['x0'], -0.17, -0.03, FLOOR + 3 * (2 * LOG_R - 0.0006), FLOOR + 9 * (2 * LOG_R - 0.0006)
for z in (wz0, wz1):
    frames.box((wx, (wy0 + wy1) / 2, z), (0.014, wy1 - wy0 + 0.008, 0.008))
for y in (wy0, wy1):
    frames.box((wx, y, (wz0 + wz1) / 2), (0.014, 0.008, wz1 - wz0))
frames.box((wx, (wy0 + wy1) / 2, (wz0 + wz1) / 2), (0.012, 0.004, wz1 - wz0))   # cross bar
frames.box((wx, (wy0 + wy1) / 2, (wz0 + wz1) / 2), (0.012, wy1 - wy0, 0.004))
# Shutters either side, spruce green, with a snow ledge below.
frames.done()
shutters = Part('Shutters', 'Spruce')
for z in (wz0 - 0.016, wz1 + 0.016):
    shutters.box((wx - 0.004, (wy0 + wy1) / 2, z), (0.006, wy1 - wy0, 0.024))
shutters.done()
Part('WindowGlass', 'Glass').box((wx, (wy0 + wy1) / 2, (wz0 + wz1) / 2), (0.003, wy1 - wy0, wz1 - wz0)).done()
# Window sockets inside: two white plates on the left wall's inner face, one over each window table.
sockets = Part('Sockets', 'Cream')
for z in (-0.10, 0.06):
    sockets.box((wx + 0.009, FLOOR + 0.028, z), (0.003, 0.012, 0.012))
sockets.done()
slots = Part('SocketSlots', 'Wire')
for z in (-0.10, 0.06):
    for dz in (-0.0025, 0.0025):
        slots.box((wx + 0.0108, FLOOR + 0.028, z + dz), (0.001, 0.004, 0.0012))
slots.done()
anchor('Socket-1', (wx + 0.01, FLOOR + 0.028, -0.10))
anchor('Socket-2', (wx + 0.01, FLOOR + 0.028, 0.06))

# The eave over the counter: a sloped pine roof from the back wall out over the counter, snow on top, icicles under.
eave = Part('EaveRoof', 'PineDark')
EAVE_Y = FLOOR + H + 0.004
eave.box((-0.19, EAVE_Y + 0.016, -0.215), (0.50, 0.008, 0.13), rot_x=-9)
eave.done()
# Rafters under it.
rafters = Part('EaveRafters', 'Pine')
for i in range(6):
    rafters.box((-0.40 + i * 0.084, EAVE_Y + 0.009, -0.215), (0.01, 0.008, 0.126), rot_x=-9)
rafters.done()
snowcap = Part('EaveSnow', 'Snow', smooth=True)
snowcap.box((-0.19, EAVE_Y + 0.028, -0.215), (0.505, 0.014, 0.134), rot_x=-9)
for i in range(9):   # a soft rounded lip along the front edge of the snow
    snowcap.sphere((-0.40 + i * 0.0525, EAVE_Y + 0.030, -0.152), 1.0, seg=8, rings=5, scale=(0.03, 0.012, 0.014))
snowcap.done()
icicles = Part('Icicles', 'Ice')
for i, x in enumerate((-0.37, -0.31, -0.22, -0.13, -0.05, 0.01)):
    icicles.cone((x, EAVE_Y + 0.004, -0.152), 0.003, -0.012 - 0.004 * (i % 3), seg=5)
icicles.done()
# The chimney: a stone stack through the eave, back left, with smoke puffs (animated below).
Part('Chimney', 'StoneDark').boxb((-0.33, EAVE_Y, -0.245), (0.03, 0.055, 0.03)).done()
Part('ChimneyCap', 'Stone').box((-0.33, EAVE_Y + 0.057, -0.245), (0.036, 0.006, 0.036)).done()
Part('ChimneySnow', 'Snow').box((-0.33, EAVE_Y + 0.061, -0.245), (0.03, 0.004, 0.03)).done()
smoke_objs = []
for i in range(3):
    s = Part(f'Smoke-{i}', 'Smoke', smooth=True).sphere((0, 0, 0), 0.009, seg=8, rings=6).done()
    s.location = G(-0.33, EAVE_Y + 0.07 + i * 0.016, -0.245)
    smoke_objs.append(s)

# The gable over the eave with the sign: a cream board, the red oval, the words.
Part('GableBoard', 'Cream').box((-0.19, EAVE_Y + 0.062, -0.262), (0.30, 0.06, 0.012)).done()
Part('GableTrim', 'PineDark').box((-0.19, EAVE_Y + 0.094, -0.262), (0.31, 0.008, 0.016)).done()
Part('GableSnow', 'Snow').box((-0.19, EAVE_Y + 0.100, -0.262), (0.31, 0.006, 0.018)).done()
Part('SignOval', 'Red', smooth=True).ellipse((-0.19, EAVE_Y + 0.062, -0.254), 0.125, 0.025, 0.004).done()
Part('SignOvalRim', 'Cream', smooth=True).ellipse((-0.19, EAVE_Y + 0.062, -0.2555), 0.131, 0.029, 0.002).done()
text_mesh('SignWords', "Hoser's", 0.026, 'Cream', (-0.19, EAVE_Y + 0.0655, -0.2512), extrude=0.0008)
text_mesh('SignSub', 'COFFEE & DONUTS', 0.0085, 'Cream', (-0.19, EAVE_Y + 0.047, -0.2512), extrude=0.0006)

# ------------------------------------------------------------------ the counter and the back bar
CZ0, CZ1 = -0.20, -0.16      # the counter's back and front faces (the baristas stand behind, at z -0.204)
counter = Part('Counter', 'Red')
counter.boxb((-0.19, FLOOR, (CZ0 + CZ1) / 2), (0.44, 0.058, CZ1 - CZ0))
counter.done()
panels = Part('CounterPanels', 'Cream')
for i in range(5):
    panels.box((-0.37 + i * 0.09, FLOOR + 0.03, CZ1 + 0.001), (0.07, 0.036, 0.003))
panels.done()
Part('CounterTop', 'Cream').box((-0.19, FLOOR + 0.061, (CZ0 + CZ1) / 2 + 0.004), (0.46, 0.006, CZ1 - CZ0 + 0.016)).done()
Part('CounterTopEdge', 'PineDark').box((-0.19, FLOOR + 0.058, CZ1 + 0.010), (0.46, 0.004, 0.006)).done()
# The duckboard the baristas stand on (y 0.036: a 1.2 cm step, walked).
Part('Duckboard', 'Deck').boxb((-0.19, FLOOR, -0.235), (0.44, 0.012, 0.07)).done()
# The back bar: a pine shelf unit against the back wall, coffee urns, cups, a donut tower.
Part('BackBar', 'Pine').boxb((-0.19, FLOOR, -0.255), (0.42, 0.075, 0.03)).done()
Part('BackBarTop', 'PineDark').box((-0.19, FLOOR + 0.077, -0.255), (0.43, 0.004, 0.034)).done()
Part('BackShelf', 'PineDark').box((-0.26, FLOOR + 0.118, -0.258), (0.27, 0.004, 0.024)).done()
urns = Part('CoffeeUrns', 'Steel', smooth=True)
for x in (-0.36, -0.31):
    urns.cyl((x, FLOOR + 0.097, -0.255), 0.013, 0.036, seg=12)
    urns.cyl((x, FLOOR + 0.117, -0.255), 0.006, 0.006, seg=8)
urns.done()
taps = Part('UrnTaps', 'Red')
for x in (-0.36, -0.31):
    taps.box((x, FLOOR + 0.088, -0.238), (0.006, 0.006, 0.008))
taps.done()
cups = Part('StackedCups', 'Cream', smooth=True)
for i, x in enumerate((-0.24, -0.215, -0.19, -0.165)):
    cups.cyl((x, FLOOR + 0.079 + 0.012, -0.255), 0.008, 0.024 + 0.004 * (i % 2), seg=10, r2=0.0065)
cups.done()
lids = Part('CupLids', 'Red')
for i, x in enumerate((-0.24, -0.215, -0.19, -0.165)):
    lids.cyl((x, FLOOR + 0.079 + 0.024 + 0.004 * (i % 2) + 0.002, -0.255), 0.0085, 0.004, seg=10)
lids.done()
# Shelf: syrup bottles, a maple leaf tin, a toque on a hook.
bottles = Part('SyrupBottles', 'IcingMaple', smooth=True)
for x in (-0.37, -0.345, -0.32):
    bottles.cyl((x, FLOOR + 0.120 + 0.012, -0.258), 0.0045, 0.024, seg=8)
bottles.done()
Part('ShelfTins', 'Red').box((-0.26, FLOOR + 0.120 + 0.009, -0.258), (0.05, 0.018, 0.016)).done()
Part('ShelfTinLid', 'Cream').box((-0.26, FLOOR + 0.139, -0.258), (0.052, 0.003, 0.018)).done()
Part('ShelfMugs', 'Spruce', smooth=True).cyl((-0.18, FLOOR + 0.128, -0.258), 0.007, 0.014, seg=10).cyl((-0.155, FLOOR + 0.128, -0.258), 0.007, 0.014, seg=10).done()
# The menu board on the back wall, right of the shelf, with chalk lines.
Part('MenuBoard', 'Chalk').box((-0.03, FLOOR + 0.115, -0.2645), (0.11, 0.055, 0.004)).done()
Part('MenuFrame', 'PineDark').box((-0.03, FLOOR + 0.115, -0.2655), (0.118, 0.063, 0.003)).done()
for i, line in enumerate(('2x2 COFFEE  2', 'SNOWBITS  3', 'BEAVER TAIL  4', 'MAPLE LATTE  3')):
    text_mesh(f'Menu-{i}', line, 0.0072, 'ChalkText', (-0.03, FLOOR + 0.133 - i * 0.012, -0.262), extrude=0.0003)
text_mesh('MenuTitle', 'MENU', 0.006, 'ChalkText', (-0.03 - 0.04, FLOOR + 0.1385, -0.262), extrude=0.0003, align='LEFT')
# The donut case at the counter's right end: a glass box of donuts, a till beside it.
Part('DonutCaseBase', 'Cream').boxb((-0.02, FLOOR + 0.064, -0.18), (0.10, 0.004, 0.034)).done()
Part('DonutCaseGlass', 'Glass').boxb((-0.02, FLOOR + 0.068, -0.18), (0.10, 0.03, 0.034)).done()
Part('DonutCaseTop', 'PineDark').box((-0.02, FLOOR + 0.099, -0.18), (0.104, 0.003, 0.038)).done()
donuts = Part('Donuts', 'Donut', smooth=True)
icings = {'IcingPink': Part('DonutIcingPink', 'IcingPink', smooth=True), 'IcingChoc': Part('DonutIcingChoc', 'IcingChoc', smooth=True), 'IcingMaple': Part('DonutIcingMaple', 'IcingMaple', smooth=True)}
for i in range(6):
    x = -0.06 + (i % 3) * 0.032
    z = -0.188 + (i // 3) * 0.016
    y = FLOOR + 0.0705 + (i // 3) * 0.009
    g = bmesh.ops.create_cone(donuts.bm, cap_ends=True, segments=12, radius1=0.0095, radius2=0.0095, depth=0.006)
    bmesh.ops.transform(donuts.bm, matrix=Matrix.Translation(G(x, y, z)), verts=g['verts'])
    ic = list(icings.values())[i % 3]
    g = bmesh.ops.create_cone(ic.bm, cap_ends=True, segments=12, radius1=0.0097, radius2=0.0097, depth=0.0022)
    bmesh.ops.transform(ic.bm, matrix=Matrix.Translation(G(x, y + 0.0038, z)), verts=g['verts'])
donuts.done()
for p in icings.values():
    p.done()
Part('Till', 'Cream').boxb((0.0, FLOOR + 0.064, -0.19), (0.028, 0.02, 0.022), rot_y=-12).done()
Part('TillScreen', 'Wire').box((0.0, FLOOR + 0.084, -0.19), (0.026, 0.014, 0.004), rot_y=-12, rot_x=-20).done()
# A "pick up here" tag at the counter's right end, for takeaway.
Part('TakeawayTag', 'Red').box((0.012, FLOOR + 0.072, CZ1 + 0.003), (0.02, 0.0005, 0.001)).done()
text_mesh('TakeawayWords', 'PICK UP', 0.0056, 'Cream', (0.012, FLOOR + 0.0745, CZ1 + 0.0036), extrude=0.0003)
Part('TakeawayTagBoard', 'Red').box((0.012, FLOOR + 0.0745, CZ1 + 0.002), (0.028, 0.01, 0.002)).done()
anchor('TakeawaySpot', (0.0, FLOOR, -0.125), rot_y=180)
anchor('BaristaSpot-1', (-0.235, 0.036, -0.204), rot_y=180)
anchor('BaristaSpot-2', (-0.115, 0.036, -0.204), rot_y=180)
anchor('BaristaSpot-3', (0.005, 0.036, -0.204), rot_y=180)

# ------------------------------------------------------------------ the deck (the patio)
DX0, DX1, DZ0, DZ1 = 0.06, 0.40, -0.12, 0.17
Part('Deck', 'Deck').boxb((((DX0 + DX1) / 2), 0.02, (DZ0 + DZ1) / 2), (DX1 - DX0, 0.004, DZ1 - DZ0)).done()
dg = Part('DeckGrooves', 'PineDark')
for i in range(12):
    dg.boxb((DX0 + 0.014 + i * 0.028, 0.0241, (DZ0 + DZ1) / 2), (0.0015, 0.0005, DZ1 - DZ0))
dg.done()
# Snow dusting on the deck: thin soft patches along its edges.
dust = Part('DeckSnow', 'Snow', smooth=True)
for x, z, sx, sz in ((0.10, -0.10, 0.05, 0.02), (0.36, -0.10, 0.06, 0.02), (0.38, 0.14, 0.04, 0.03), (0.09, 0.14, 0.04, 0.03), (0.22, 0.165, 0.10, 0.015)):
    dust.sphere((x, 0.024, z), 1.0, seg=10, rings=6, scale=(sx, 0.0035, sz))
dust.done()
# The deck's back rail (toward the stage) with snow on it, and its corner posts.
rail = Part('DeckRail', 'PineDark')
rail.box((0.26, FLOOR + 0.03, DZ0), (0.28, 0.006, 0.006))
for x in (0.14, 0.26, 0.38):
    rail.boxb((x, FLOOR, DZ0), (0.008, 0.03, 0.008))
rail.done()
Part('DeckRailSnow', 'Snow').box((0.26, FLOOR + 0.0345, DZ0), (0.28, 0.003, 0.007)).done()
# String lights: three posts and two sagging lines of bulbs over the deck.
poles = Part('LightPoles', 'PineDark')
for x, z in ((DX1, DZ0), (DX1, DZ1), (DX0, DZ1)):
    poles.boxb((x, FLOOR, z), (0.01, 0.13, 0.01))
poles.done()
Part('LightPoleSnow', 'Snow').box((DX1, FLOOR + 0.132, DZ0), (0.012, 0.004, 0.012)).box((DX1, FLOOR + 0.132, DZ1), (0.012, 0.004, 0.012)).box((DX0, FLOOR + 0.132, DZ1), (0.012, 0.004, 0.012)).done()
wire = Part('LightWire', 'Wire')
bulbs = Part('LightBulbs', 'Bulb', smooth=True)
def string(a, b, n=7, sag=0.025):
    pts = []
    for i in range(n + 1):
        t = i / n
        x = a[0] + (b[0] - a[0]) * t
        z = a[2] + (b[2] - a[2]) * t
        y = a[1] - sag * 4 * t * (1 - t)
        pts.append((x, y, z))
    for p, q in zip(pts, pts[1:]):
        mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2)
        length = math.dist(p, q)
        ang_y = math.degrees(math.atan2(q[0] - p[0], q[2] - p[2]))
        tilt = math.degrees(math.atan2(q[1] - p[1], math.hypot(q[0] - p[0], q[2] - p[2])))
        wire.box(mid, (0.0012, 0.0012, length), rot_y=ang_y, rot_x=-tilt)
    for p in pts[1:-1]:
        bulbs.sphere((p[0], p[1] - 0.004, p[2]), 0.0035, seg=8, rings=5)
TOP = FLOOR + 0.125
string((DX1, TOP, DZ0), (DX1, TOP, DZ1))
string((DX1, TOP, DZ1), (DX0, TOP, DZ1))
string((DX0, TOP, DZ1), (CAB['x1'], FLOOR + 0.10, 0.08), n=4, sag=0.012)
wire.done()
bulbs.done()
# A patio heater: a steel pole with a mushroom top, snow on the top.
Part('HeaterPole', 'Steel').boxb((0.235, FLOOR, 0.0), (0.006, 0.10, 0.006)).done()
Part('HeaterBase', 'Steel', smooth=True).cyl((0.235, FLOOR + 0.004, 0.0), 0.018, 0.008, seg=12).done()
Part('HeaterHood', 'Steel', smooth=True).cyl((0.235, FLOOR + 0.102, 0.0), 0.022, 0.012, seg=12, r2=0.006).done()
Part('HeaterGlow', 'Bulb', smooth=True).cyl((0.235, FLOOR + 0.094, 0.0), 0.009, 0.01, seg=10).done()
Part('HeaterSnow', 'Snow').cyl((0.235, FLOOR + 0.110, 0.0), 0.012, 0.004, seg=10).done()
# The musician's stage, back of the deck: a round low platform, two posts and a snow-capped awning.
Part('Stage', 'PineDark', smooth=True).cyl((0.30, FLOOR + 0.005, -0.21), 0.045, 0.01, seg=16).done()
Part('StageTop', 'Deck', smooth=True).cyl((0.30, FLOOR + 0.0105, -0.21), 0.044, 0.001, seg=16).done()
sp = Part('StagePosts', 'PineDark')
for x in (0.262, 0.338):
    sp.boxb((x, FLOOR + 0.01, -0.245), (0.008, 0.11, 0.008))
sp.done()
Part('StageAwning', 'Red').box((0.30, FLOOR + 0.122, -0.215), (0.10, 0.006, 0.075), rot_x=10).done()
Part('StageAwningSnow', 'Snow').box((0.30, FLOOR + 0.128, -0.215), (0.102, 0.006, 0.077), rot_x=10).done()
scallops = Part('AwningScallops', 'Cream', smooth=True)
for i in range(6):
    scallops.cyl((0.258 + i * 0.0168, FLOOR + 0.118 - 0.0065, -0.1785), 0.0084, 0.004, axis='z', seg=10)
scallops.done()
anchor('MusicianSpot', (0.30, FLOOR + 0.011, -0.21), rot_y=180)
# Patio table spots and the deck's seats are furniture pieces (phase 2); marked for the layout.
anchor('PatioSpot-1', (0.16, FLOOR, 0.08))
anchor('PatioSpot-2', (0.31, FLOOR, 0.06))

# ------------------------------------------------------------------ the lake, the dock and the canoe
LX0, LX1, LZ0, LZ1 = 0.12, 0.46, 0.20, 0.31
Part('LakeIce', 'Ice').boxb((((LX0 + LX1) / 2), 0.02, (LZ0 + LZ1) / 2), (LX1 - LX0, 0.002, LZ1 - LZ0)).done()
Part('IceSkatingPatch', 'IceDeep', smooth=True).ellipse((0.27, 0.0221, 0.255), 0.12, 0.045, 0.0004, seg=24).done()
bpy.data.objects['IceSkatingPatch'].rotation_euler = (math.radians(90), 0, 0)
cracks = Part('IceCracks', 'SnowShade')
for x, z, l, a in ((0.20, 0.26, 0.05, 20), (0.34, 0.235, 0.06, -35), (0.41, 0.28, 0.035, 60)):
    cracks.box((x, 0.0222, z), (0.0012, 0.0004, l), rot_y=a)
cracks.done()
# The dock: planks out from the deck over the ice, on posts, with a snow dusting; the bench on it is a piece (phase 2).
Part('Dock', 'Deck').boxb((0.26, 0.026, 0.235), (0.08, 0.004, 0.11)).done()
dgr = Part('DockGrooves', 'PineDark')
for i in range(7):
    dgr.boxb((0.26, 0.0301, 0.19 + i * 0.015), (0.08, 0.0004, 0.0012))
dgr.done()
dp = Part('DockPosts', 'PineDark')
for x in (0.225, 0.295):
    for z in (0.20, 0.285):
        dp.boxb((x, 0.02, z), (0.008, 0.028, 0.008))
dp.done()
Part('DockPostSnow', 'Snow').box((0.225, 0.05, 0.285), (0.01, 0.004, 0.01)).box((0.295, 0.05, 0.285), (0.01, 0.004, 0.01)).done()
Part('DockSnow', 'Snow', smooth=True).sphere((0.235, 0.030, 0.21), 1.0, seg=8, rings=5, scale=(0.02, 0.003, 0.014)).sphere((0.285, 0.030, 0.27), 1.0, seg=8, rings=5, scale=(0.018, 0.003, 0.016)).done()
anchor('DockSpot', (0.26, 0.030, 0.25))
# The red canoe pulled up on the ice beside the dock, snow in it, two paddles across.
canoe = Part('Canoe', 'Red', smooth=True)
g = bmesh.ops.create_uvsphere(canoe.bm, u_segments=14, v_segments=8, radius=1.0)
bmesh.ops.transform(canoe.bm, matrix=Matrix.Diagonal(Vector((0.065, 0.016, 0.014, 1))), verts=g['verts'])
# Cut the top half away (a hull), keep a 2.4 mm wall.
bmesh.ops.bisect_plane(canoe.bm, geom=canoe.bm.verts[:] + canoe.bm.edges[:] + canoe.bm.faces[:], plane_co=(0, 0, 0.003), plane_no=(0, 0, 1), clear_outer=True)
bmesh.ops.transform(canoe.bm, matrix=Matrix.Translation(G(0.385, 0.036, 0.245)) @ Matrix.Rotation(math.radians(-12), 4, 'Z'), verts=canoe.bm.verts[:])
canoe_obj = canoe.done()
solid = canoe_obj.modifiers.new('Shell', 'SOLIDIFY')
solid.thickness = 0.0024
solid.offset = 1.0
Part('CanoeTrim', 'Cream', smooth=True).sphere((0.385, 0.039, 0.245), 1.0, seg=14, rings=4, scale=(0.066, 0.003, 0.0145)).done()
Part('CanoeSnow', 'Snow', smooth=True).sphere((0.385, 0.036, 0.245), 1.0, seg=12, rings=6, scale=(0.05, 0.006, 0.010)).done()
# Turn the trim and the snow with the canoe.
for n in ('CanoeTrim', 'CanoeSnow'):
    ob = bpy.data.objects[n]
    ob.matrix_world = Matrix.Translation(G(0.385, 0, 0.245)) @ Matrix.Rotation(math.radians(-12), 4, 'Z') @ Matrix.Translation(-G(0.385, 0, 0.245)) @ ob.matrix_world
paddles = Part('Paddles', 'Pine')
paddles.box((0.385, 0.041, 0.235), (0.004, 0.003, 0.05), rot_y=70)
paddles.box((0.392, 0.0415, 0.25), (0.004, 0.003, 0.05), rot_y=62)
paddles.done()
# A tiny hockey net on the ice, and a puck.
net = Part('HockeyNet', 'Red')
net.box((0.15, 0.028, 0.285), (0.03, 0.003, 0.003))
net.box((0.15, 0.028 + 0.008, 0.285), (0.03, 0.003, 0.003))
for x in (0.136, 0.164):
    net.boxb((x, 0.022, 0.285), (0.003, 0.016, 0.003))
    net.box((x, 0.026, 0.292), (0.003, 0.003, 0.016))
net.done()
Part('HockeyMesh', 'Cream').box((0.15, 0.030, 0.291), (0.03, 0.014, 0.001), rot_x=35).done()
Part('Puck', 'Wire', smooth=True).cyl((0.19, 0.0225, 0.265), 0.0035, 0.0015, seg=10).done()
Part('HockeyStick', 'Pine').box((0.21, 0.023, 0.28), (0.003, 0.002, 0.045), rot_y=-28).box((0.198, 0.023, 0.298), (0.014, 0.002, 0.003), rot_y=-28).done()

# ------------------------------------------------------------------ the bonfire, front left
FX, FZ = -0.27, 0.245
ring = Part('FireRing', 'Stone', smooth=True)
for i in range(11):
    a = i * 2 * math.pi / 11
    ring.sphere((FX + 0.036 * math.cos(a), FLOOR + 0.006, FZ + 0.036 * math.sin(a)), 0.0085, seg=8, rings=5, scale=(1.0, 0.75, 1.0))
ring.done()
Part('FireAsh', 'StoneDark', smooth=True).cyl((FX, FLOOR + 0.001, FZ), 0.03, 0.002, seg=14).done()
logs = Part('FireLogs', 'Trunk', smooth=True)
logs.cyl((FX, FLOOR + 0.007, FZ), 0.006, 0.05, axis='x', seg=8, rot_y=20)
logs.cyl((FX, FLOOR + 0.011, FZ), 0.006, 0.05, axis='x', seg=8, rot_y=-40)
logs.cyl((FX, FLOOR + 0.015, FZ), 0.005, 0.046, axis='x', seg=8, rot_y=85)
logs.done()
flames = []
for i, (dx, dz, h, r) in enumerate(((0, 0, 0.042, 0.016), (-0.009, 0.006, 0.028, 0.010), (0.010, -0.004, 0.024, 0.009))):
    f = Part(f'Flame-{i}', 'Fire', smooth=True).cone((0, 0, 0), r, h, seg=8).done()
    f.location = G(FX + dx, FLOOR + 0.016, FZ + dz)
    flames.append(f)
core = Part('FlameCore', 'FireCore', smooth=True).cone((0, 0, 0), 0.009, 0.026, seg=8).done()
core.location = G(FX, FLOOR + 0.017, FZ)
flames.append(core)
# Three chair spots round the fire (the Muskoka chairs are pieces, phase 2) and a woodpile against the cabin's front.
for i, a in enumerate((205, 270, 335)):
    r = 0.085
    anchor(f'FireSpot-{i + 1}', (FX + r * math.cos(math.radians(a)), FLOOR, FZ - r * math.sin(math.radians(a))), rot_y=a - 90)
wood = Part('Woodpile', 'Trunk', smooth=True)
for row, n in enumerate((4, 3, 2)):
    for k in range(n):
        wood.cyl((-0.395 + k * 0.013 + row * 0.0065, FLOOR + 0.006 + row * 0.011, 0.195), 0.006, 0.03, axis='z', seg=8)
wood.done()
Part('WoodpileSnow', 'Snow', smooth=True).sphere((-0.375, FLOOR + 0.036, 0.195), 1.0, seg=8, rings=5, scale=(0.02, 0.005, 0.016)).done()
# A path of dark plank pavers from the cabin's door to the gate and from the door round to the bonfire.
pavers = Part('Pavers', 'StoneDark')
for i, (x, z) in enumerate(((0.02, 0.19), (-0.05, 0.215), (-0.12, 0.235), (-0.18, 0.25))):
    pavers.boxb((x, 0.0241, z), (0.04, 0.0006, 0.035), rot_y=20 - i * 10)
pavers.done()

# ------------------------------------------------------------------ the gate, the mailbox, the trees
GX = 0.42
gate = Part('GateArch', 'PineDark')
for z in (-0.02, 0.13):
    gate.boxb((GX, FLOOR, z), (0.014, 0.16, 0.014))
gate.box((GX, FLOOR + 0.165, 0.055), (0.018, 0.012, 0.18))
gate.done()
Part('GateArchSnow', 'Snow').box((GX, FLOOR + 0.173, 0.055), (0.02, 0.005, 0.184)).done()
Part('GateSign', 'Red').box((GX, FLOOR + 0.135, 0.055), (0.006, 0.03, 0.09)).done()
Part('GateSignTrim', 'Cream').box((GX, FLOOR + 0.135, 0.055), (0.004, 0.034, 0.094)).done()
for s in (1, -1):
    text_mesh(f'GateWords{"R" if s > 0 else "L"}', "Hoser's", 0.016, 'Cream', (GX + s * 0.0036, FLOOR + 0.135, 0.055), rot_y=-90 * s, extrude=0.0005)
chains = Part('GateSignChains', 'Wire')
for z in (0.02, 0.09):
    chains.boxb((GX, FLOOR + 0.15, z), (0.002, 0.012, 0.002))
chains.done()
anchor('Entrance', (0.39, FLOOR, 0.055), rot_y=90)
# The mailbox by the gate: red box on a post, a cream flag, snow on top.
Part('MailboxPost', 'PineDark').boxb((0.44, FLOOR, 0.17), (0.008, 0.045, 0.008)).done()
Part('Mailbox', 'Red', smooth=True).cyl((0.44, FLOOR + 0.055, 0.17), 0.011, 0.028, axis='z', seg=12).done()
Part('MailboxFlag', 'Cream').box((0.452, FLOOR + 0.062, 0.166), (0.002, 0.012, 0.004)).done()
Part('MailboxSnow', 'Snow', smooth=True).sphere((0.44, FLOOR + 0.066, 0.17), 1.0, seg=8, rings=5, scale=(0.012, 0.004, 0.015)).done()
# Snowy spruces: three tiers of cones, snow cones offset up, a trunk.
def spruce(name, at, h, lean=0):
    base_r = h * 0.30
    t = Part(name, 'Spruce', smooth=False)
    s = Part(name + 'Snow', 'Snow', smooth=False)
    k = Part(name + 'Trunk', 'Trunk', smooth=True)
    k.cyl((at[0], at[1] + 0.012, at[2]), h * 0.03, 0.03, seg=7)
    for i, (y, r, th) in enumerate(((0.10, 1.0, 0.42), (0.36, 0.78, 0.38), (0.60, 0.52, 0.36))):
        t.cone((at[0], at[1] + h * y, at[2]), base_r * r, h * th, seg=8)
        s.cone((at[0], at[1] + h * y + h * th * 0.30, at[2]), base_r * r * 0.80, h * th * 0.72, seg=8)
    s.cone((at[0], at[1] + h * 0.92, at[2]), h * 0.03, h * 0.07, seg=6)
    t.done(); s.done(); k.done()
spruce('SpruceBackLeft', (-0.43, 0.024, -0.275), 0.22)
spruce('SpruceBackRight', (0.415, 0.024, -0.27), 0.20)
spruce('SpruceFrontLeft', (-0.425, 0.024, 0.275), 0.16)
spruce('SpruceLakeside', (0.43, 0.024, 0.20), 0.12)
# Small snow-capped fence posts along the back right, behind the stage (a hint of a fence line).
fence = Part('BackFence', 'PineDark')
fsnow = Part('BackFenceSnow', 'Snow')
for x in (0.12, 0.17, 0.22, 0.38):
    fence.boxb((x, FLOOR, -0.285), (0.008, 0.04, 0.008))
    fsnow.box((x, FLOOR + 0.042, -0.285), (0.01, 0.004, 0.01))
fence.box((0.17, FLOOR + 0.028, -0.285), (0.11, 0.004, 0.004))
fence.done(); fsnow.done()

anchor('FloorTop', (0, FLOOR, 0))
anchor('BenchSpot', (0.235, FLOOR, 0.165))     # kept for compatibility; the queue stands outside the gate as now
# Table spots inside the cabin, for the layout file.
anchor('TableSpot-1', (-0.33, FLOOR, -0.10))
anchor('TableSpot-2', (-0.33, FLOOR, 0.06))
anchor('TableSpot-3', (-0.17, FLOOR, -0.03))

# ------------------------------------------------------------------ the Ambient clip: the smoke puffs rise, the flames flicker
def fcurves_of(o):
    act = o.animation_data.action
    try:
        return list(act.fcurves)
    except AttributeError:
        out = []
        slot = o.animation_data.action_slot
        for layer in act.layers:
            for strip in layer.strips:
                cb = strip.channelbag(slot)
                if cb:
                    out += list(cb.fcurves)
        return out
sc.name = 'Ambient'
sc.frame_start, sc.frame_end = 1, 48
sc.render.fps = 24
for i, s in enumerate(smoke_objs):
    base = G(-0.33, EAVE_Y + 0.07, -0.245)
    for f in (1, 49):
        s.location = base + Vector((0, 0, i * 0.016)); s.scale = (0.6 + 0.4 * i / 3,) * 3
        s.keyframe_insert('location', frame=f); s.keyframe_insert('scale', frame=f)
    s.location = base + Vector((0.004 * (1 if i % 2 else -1), 0, 0.048 + i * 0.016)); s.scale = (1.6 + 0.4 * i / 3,) * 3
    s.keyframe_insert('location', frame=25); s.keyframe_insert('scale', frame=25)
    # Each puff cycles with a phase offset by shifting its curves.
    for fc in fcurves_of(s):
        for kp in fc.keyframe_points:
            kp.co.x += i * 16
            kp.interpolation = 'LINEAR'
        fc.modifiers.new('CYCLES')
for i, f in enumerate(flames):
    for frame, sy in ((1, 1.0), (9, 1.12), (17, 0.92), (29, 1.08), (41, 0.96), (49, 1.0)):
        f.scale = (1.0 + 0.04 * ((i + frame) % 3 - 1), 1.0 + 0.04 * ((i + frame) % 2), sy)
        f.keyframe_insert('scale', frame=frame)
    for fc in fcurves_of(f):
        for kp in fc.keyframe_points:
            kp.co.x += i * 5
        fc.modifiers.new('CYCLES')
# One action named Ambient on the root is what the game plays; the glTF exporter gathers every object's action into
# one animation per action name, so name them all Ambient.
for ob in smoke_objs + flames:
    ob.animation_data.action.name = 'Ambient'

# ------------------------------------------------------------------ baked occlusion, then export
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bake_ao.py')).read())

def select_tree(root):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for ch in root.children_recursive:
        ch.select_set(True)
select_tree(ROOT)
bpy.context.view_layer.objects.active = ROOT
glb = os.path.join(OUT, 'cafe-canada.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_yup=True, export_extras=True, export_animations=True, export_apply=True, export_animation_mode='SCENE')
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in ROOT.children_recursive if o.type == 'MESH')
heavy = sorted(((sum(len(p.vertices) - 2 for p in o.data.polygons), o.name) for o in ROOT.children_recursive if o.type == 'MESH'), reverse=True)[:12]
print('HEAVIEST', heavy)
print(f'EXPORTED {glb} meshes={sum(1 for o in ROOT.children_recursive if o.type == "MESH")} tris~{tris} materials={len(MATS)}')

# ------------------------------------------------------------------ previews: a bright winter sky and sun
w = bpy.data.worlds.new('W'); w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.78, 0.88, 0.98, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 1.2
sc.world = w
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy = 4.0
sun.data.angle = math.radians(4)
sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
sc.collection.objects.link(sun)
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); cam.data.lens = 50
sc.collection.objects.link(cam); sc.camera = cam
try:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError:
    sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 1400, 900
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
w.node_tree.nodes['Background'].inputs[1].default_value = 0.75
sun.data.energy = 2.6
sc.render.film_transparent = False
def shot(name, eye, target, lens=50):
    cam.data.lens = lens
    cam.location = G(*eye)
    d = (G(*target) - cam.location)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, 'previews', name + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath)
sc.frame_set(12)
shot('seat', (0.0, 0.55, 0.95), (0.0, 0.06, -0.02), lens=45)       # from the player's seat
shot('front-right', (0.75, 0.50, 0.70), (-0.02, 0.05, -0.03), lens=45)
shot('above', (0.05, 1.05, 0.25), (0.0, 0.02, -0.03), lens=40)
shot('bonfire', (-0.08, 0.20, 0.52), (-0.27, 0.03, 0.24), lens=60)
shot('lake', (0.52, 0.22, 0.56), (0.30, 0.03, 0.24), lens=60)
shot('counter', (-0.10, 0.22, 0.20), (-0.19, 0.09, -0.22), lens=50)
