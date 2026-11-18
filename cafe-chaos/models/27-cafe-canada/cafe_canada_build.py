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
mat('Fire', (0.98, 0.40, 0.06), 0.5, emit=(1.0, 0.36, 0.04), strength=1.3)     # orange outer flame (not so bright it washes to yellow)
mat('FireCore', (1.0, 0.84, 0.36), 0.5, emit=(1.0, 0.78, 0.28), strength=1.9)
mat('Bulb', (1.0, 0.88, 0.62), 0.4, emit=(1.0, 0.82, 0.50), strength=1.6)
mat('Wire', (0.16, 0.15, 0.14), 0.9)
mat('Chalk', (0.13, 0.15, 0.14), 0.9)
mat('ChalkText', (0.95, 0.95, 0.90), 0.9)
mat('Steel', (0.76, 0.77, 0.80), 0.35, metallic=0.8)
mat('Donut', (0.84, 0.62, 0.38), 0.8)
mat('IcingPink', (0.96, 0.62, 0.72), 0.6)
mat('IcingChoc', (0.38, 0.23, 0.14), 0.6)
mat('IcingMaple', (0.86, 0.52, 0.22), 0.6)
mat('Smoke', (0.93, 0.93, 0.95), 0.9, alpha=0.42)
mat('Mountain', (0.47, 0.55, 0.68), 0.95)          # the near range, blue with distance
mat('MountainFar', (0.64, 0.71, 0.82), 0.95)       # the far range, paler still
mat('Mountains', (1.0, 1.0, 1.0), 0.95)            # the painted relief ranges (texture made in the backdrop block)
mat('Ember', (0.80, 0.20, 0.04), 0.6, emit=(0.95, 0.24, 0.03), strength=0.9)
mat('Soot', (0.055, 0.05, 0.048), 0.95)
mat('Terracotta', (0.62, 0.32, 0.22), 0.8)
mat('Water', (0.80, 0.92, 1.0), 0.2, emit=(0.82, 0.93, 1.0), strength=0.45)
mat('PianoBlack', (0.08, 0.07, 0.08), 0.35)
mat('PianoKeys', (0.97, 0.96, 0.92), 0.4)
mat('Plaid', (0.62, 0.16, 0.18), 0.9)
mat('Mug', (0.97, 0.95, 0.90), 0.6)
mat('BearFur', (0.10, 0.085, 0.08), 0.9)            # the black bear
mat('BearMuzzle', (0.74, 0.56, 0.38), 0.85)
mat('CupLid', (0.98, 0.98, 0.97), 0.5)

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

# Cel-shaded flames: three flat tones with hard edges, keeping the flat 2D look. A flame's UVs (made in
# `flame_tongue`) carry u = how much a point faces the light (0 the shadow side, 1 the lit side) and v = height
# (0 the foot, 1 the tip), so a 64 px band map gives it a dark tone on its shadow side and round its foot, its
# own tone in the middle, and a light streak up the lit side. The bands go in as the emissive map at strength 1
# (the colour the eye sees) and, at a third, as the base colour, so the sun's light on top of the glow cannot
# wash the bands out to beige as the flat emissive did.
def toon_flame(name, dark, mid, light):
    n = 64
    u = np.linspace(0, 1, n)[None, :].repeat(n, 0)
    v = np.linspace(0, 1, n)[:, None].repeat(n, 1)          # row 0 is the image's bottom: v = 0, the foot
    arr = np.empty((n, n, 3)); arr[:] = mid
    arr[(u > 0.66) & (v > 0.16) & (v < 0.82)] = light
    arr[(u < 0.30) | (v < 0.12)] = dark
    m = MATS[name]; nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
    te = nt.nodes.new('ShaderNodeTexImage'); te.image = _image(f'toon-{name}', arr); te.interpolation = 'Closest'
    tb = nt.nodes.new('ShaderNodeTexImage'); tb.image = _image(f'toon-{name}-base', arr * 0.32); tb.interpolation = 'Closest'
    nt.links.new(te.outputs['Color'], bsdf.inputs['Emission Color'])
    nt.links.new(tb.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Emission Strength'].default_value = 1.0
toon_flame('Fire', (0.80, 0.17, 0.04), (0.98, 0.42, 0.07), (1.0, 0.68, 0.24))        # deep red-orange / orange / amber
toon_flame('FireCore', (1.0, 0.60, 0.14), (1.0, 0.80, 0.30), (1.0, 0.95, 0.66))      # amber / yellow / pale yellow
FLAME_LIGHT = math.atan2(-0.6, -0.8)        # the lit side, in a tongue's own xy (Blender): toward the player's left-front

def flat_ellipse(name, material, at, rx, rz, thick, seg=24, parent=ROOT):
    """A flat disc rx by rz (game x by z) of thickness `thick`, lying level, centred at `at`."""
    part = Part(name, material, smooth=True)
    g = bmesh.ops.create_cone(part.bm, cap_ends=True, segments=seg, radius1=1.0, radius2=1.0, depth=thick)
    bmesh.ops.transform(part.bm, matrix=Matrix.Translation(G(*at)) @ Matrix.Diagonal(Vector((rx, rz, 1.0, 1))), verts=g['verts'])
    return part.done(parent)

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
# Every bank stays inside the plate (x ±0.46). The lake's back bank is two pieces, either side of the
# dock (x 0.22 … 0.30): one long piece ran under the dock and 11 cm past the plate's right edge, its thin
# tapered end a spike in the air. Long banks get more segments so their ends stay round, not pointed.
for x, z, sx, sz in ((-0.01, 0.19, 0.03, 0.016), (0.165, 0.19, 0.05, 0.018), (0.375, 0.19, 0.075, 0.018), (0.428, 0.255, 0.028, 0.055), (-0.075, 0.285, 0.035, 0.022)):
    snow.sphere((x, 0.024, z), 1.0, seg=16 if sx > 2 * sz else 10, rings=6, scale=(sx, 0.008, sz))   # low round drifts (a long one pointed at the player read as a boulder)
for i in range(7):
    x = -0.40 + i * 0.13
    snow.sphere((x, 0.024, -0.30), 1.0, seg=10, rings=6, scale=(0.07, 0.014 + 0.004 * (i % 2), 0.025))
snow.done()

# ------------------------------------------------------------------ the cabin
CAB = dict(x0=-0.42, x1=0.04, z0=-0.27, z1=0.16)   # outer walls
LOG_R = 0.0072
WALL_LOGS = 9                                        # the walls stop just over the baristas' heads: the upper deck sits on them
H = WALL_LOGS * (2 * LOG_R - 0.0006) + 0.0006        # wall height over the floor (0.125)
Part('CabinFloor', 'PlankFloor').boxb((-0.19, 0.02, -0.055), (0.44, 0.004, 0.41)).done()
grooves = Part('CabinFloorGrooves', 'PineDark')
for i in range(10):
    grooves.boxb((-0.19, 0.0241, -0.245 + i * 0.042), (0.44, 0.0005, 0.0015))
grooves.done()

def log_wall(part, spans, z=None, x=None, y_from=FLOOR, logs=WALL_LOGS, gap=None):
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
# Left wall: full height, a window in its middle (logs 3..7 skip z -0.17..-0.03).
log_wall(walls, [(CAB['z0'], CAB['z1'])], x=CAB['x0'], gap=(-0.17, -0.03, 3, 7))
# Front wall: a knee-high half wall (4 logs), so the player sees every table; a front window frame stands on it (below).
log_wall(walls, [(CAB['x0'], CAB['x1'])], z=CAB['z1'], logs=4)
# Right wall: a half wall each side of the door (the door at z -0.02..0.08), 4 logs.
log_wall(walls, [(CAB['z0'], -0.02), (0.08, CAB['z1'])], x=CAB['x1'], logs=4)
walls.done()
# Log ends: a darker disc at each wall corner (the crossed logs of a cabin).
ends = Part('CabinLogEnds', 'PineDark', smooth=True)
for k in range(WALL_LOGS):
    y = FLOOR + LOG_R + k * (2 * LOG_R - 0.0006)
    for cx in (CAB['x0'], CAB['x1']):
        ends.cyl((cx, y, CAB['z0'] - 0.006), LOG_R * 0.95, 0.012, axis='z', seg=8)
    ends.cyl((CAB['x0'] - 0.006, y, CAB['z0']), LOG_R * 0.95, 0.012, axis='x', seg=8)
    if k < 4:
        ends.cyl((CAB['x0'] - 0.006, y, CAB['z1']), LOG_R * 0.95, 0.012, axis='x', seg=8)
        ends.cyl((CAB['x1'] + 0.006, y, CAB['z1']), LOG_R * 0.95, 0.012, axis='x', seg=8)
        ends.cyl((CAB['x0'], y, CAB['z1'] + 0.006), LOG_R * 0.95, 0.012, axis='z', seg=8)
ends.done()
# Corner posts: square posts at the four corners and either side of the door gap. The door has no frame
# (no tall posts, no lintel): the gap is just an opening in the knee-high wall, its posts as high as the wall.
posts = Part('CabinPosts', 'PineDark')
for px, pz in ((CAB['x0'], CAB['z0']), (CAB['x1'], CAB['z0']), (CAB['x0'], CAB['z1']), (CAB['x1'], CAB['z1']), (CAB['x1'], -0.02), (CAB['x1'], 0.08)):
    tall = H if pz == CAB['z0'] else 4 * (2 * LOG_R - 0.0006) + 0.01
    posts.boxb((px, FLOOR, pz), (0.016, tall, 0.016))
posts.done()
# The left window: frame, glass, cross bar; the front window over the half wall, glass only in its upper half.
frames = Part('WindowFrames', 'Cream')
wx, wz0, wz1, wy0, wy1 = CAB['x0'], -0.17, -0.03, FLOOR + 3 * (2 * LOG_R - 0.0006), FLOOR + 8 * (2 * LOG_R - 0.0006)
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
for z in (-0.05, 0.09):
    sockets.box((wx + 0.009, FLOOR + 0.028, z), (0.003, 0.012, 0.012))
sockets.done()
slots = Part('SocketSlots', 'Wire')
for z in (-0.05, 0.09):
    for dz in (-0.0025, 0.0025):
        slots.box((wx + 0.0108, FLOOR + 0.028, z + dz), (0.001, 0.004, 0.0012))
slots.done()
anchor('Socket-1', (wx + 0.01, FLOOR + 0.028, -0.05))
anchor('Socket-2', (wx + 0.01, FLOOR + 0.028, 0.09))

# Fire: tongues of flame shaped like real ones (a teardrop that swells near its foot, narrows to a licking tip
# and curls a little), an orange outer flame round a yellow core, on a bed of glowing embers. Each tongue is its
# own object with its origin at its foot, so the Ambient clip's flicker stretches it from the bottom.
def flame_tongue(name, material, at, h, r, lean=(0.0, 0.0), curl=0.0, phase=0.0):
    part = Part(name, material, smooth=True)
    g = bmesh.ops.create_uvsphere(part.bm, u_segments=9, v_segments=8, radius=1.0)
    uvl = part.bm.loops.layers.uv.verify()
    for f in part.bm.faces:                                    # the band map's coordinates, from the round sphere (see toon_flame)
        for l in f.loops:
            c = l.vert.co
            lit = (math.cos(math.atan2(c.y, c.x) - FLAME_LIGHT) * math.hypot(c.x, c.y) + 1) / 2
            l[uvl].uv = (min(max(lit, 0.0), 1.0), (c.z + 1) / 2)
    for v in g['verts']:
        t = (v.co.z + 1) / 2                                   # 0 at the foot, 1 at the tip
        ang = math.atan2(v.co.y, v.co.x)
        prof = math.sin(math.pi * min(1.0, t ** 0.55)) * (1 - t) ** 0.45 * 1.35
        ox = lean[0] * t * t + curl * r * math.sin(5 * t + phase) * t
        oz = lean[1] * t * t
        v.co = Vector((math.cos(ang) * r * prof + ox, math.sin(ang) * r * prof * 0.8 - oz, h * t))   # Blender space: z up, -y = game +z
    ob = part.done()
    ob.location = G(*at)
    return ob

def fire(prefix, at, scale, tongues, parent_list):
    """A fire at `at` (game space, the top of its fuel): tongues = (dx, dz, h, r, lean_x, lean_z, curl)."""
    for i, (dx, dz, h, r, lx, lz, cu) in enumerate(tongues):
        p = (at[0] + dx * scale, at[1], at[2] + dz * scale)
        parent_list.append(flame_tongue(f'{prefix}Flame-{i}', 'Fire', p, h * scale, r * scale, (lx * scale, lz * scale), cu, i * 1.3))
        parent_list.append(flame_tongue(f'{prefix}FlameCore-{i}', 'FireCore', (p[0], p[1] - 0.0004 * scale, p[2]), h * 0.62 * scale, r * 0.55 * scale, (lx * 0.6 * scale, lz * 0.6 * scale), cu * 0.5, i * 1.3 + 0.6))

# The fireplace: a river-stone hearth on the left wall, just in front of the window, where the front half
# wall does not hide it from the player. A raised flagstone hearth; a firebox with sooty sides, cast-iron
# andirons, two logs on a bed of embers and a fire; a stone surround with a lintel and keystone; a heavy pine
# beam mantel on corbels with a spruce garland, berries, two mugs and two stockings; the chimney breast
# narrowing at a shoulder into the stack, up past the wall top, a cap, a clay pot and smoke. A fire-tool stand
# and a plaid rug in front. Seats near it are warm.
FPX, FPZ = CAB['x0'] + 0.0072, 0.020               # the wall's inner face and the hearth's middle (between the window and table 2: in sight over the half wall)
FO = 0.018                                          # half the firebox opening (along z)
hearth = Part('Hearth', 'Stone')
hearth.boxb((FPX + 0.006, FLOOR + 0.004, FPZ), (0.012, 0.042, 0.072))                     # back of the firebox
for s_ in (-1, 1):
    hearth.boxb((FPX + 0.011, FLOOR + 0.004, FPZ + s_ * (FO + 0.009)), (0.022, 0.034, 0.018))   # the jambs
hearth.box((FPX + 0.011, FLOOR + 0.042, FPZ), (0.022, 0.012, 0.074))                       # over the opening
hearth.box((FPX + 0.010, FLOOR + 0.057, FPZ), (0.020, 0.018, 0.070))                       # the breast up to the mantel
hearth.done()
Part('HearthLintel', 'StoneDark').box((FPX + 0.0225, FLOOR + 0.0385, FPZ), (0.0015, 0.005, 2 * FO + 0.012)).box((FPX + 0.0228, FLOOR + 0.040, FPZ), (0.002, 0.008, 0.009)).done()
Part('HearthSlab', 'StoneDark').boxb((FPX + 0.019, FLOOR, FPZ), (0.038, 0.004, 0.084)).done()   # the raised flagstone hearth
soot = Part('Firebox', 'Soot')
soot.box((FPX + 0.0122, FLOOR + 0.020, FPZ), (0.0008, 0.032, 2 * FO))                         # back
for s_ in (-1, 1):
    soot.box((FPX + 0.017, FLOOR + 0.020, FPZ + s_ * (FO - 0.0004)), (0.010, 0.032, 0.0008))   # the sides
soot.box((FPX + 0.017, FLOOR + 0.0358, FPZ), (0.010, 0.0008, 2 * FO))                         # the roof
soot.done()
Part('EmberGlow', 'Ember', smooth=True).cyl((FPX + 0.018, FLOOR + 0.0045, FPZ), 0.011, 0.0008, seg=12).done()
embers = Part('Embers', 'Ember', smooth=True)
for i in range(9):
    a = i * 2.39996
    rr = 0.0035 + 0.0055 * ((i * 0.618) % 1)
    embers.sphere((FPX + 0.018 + rr * math.cos(a) * 0.7, FLOOR + 0.0055, FPZ + rr * math.sin(a)), 0.0018, seg=6, rings=4, scale=(1.0, 0.6, 1.0))
embers.done()
andirons = Part('Andirons', 'Wire')
for s_ in (-1, 1):
    andirons.box((FPX + 0.018, FLOOR + 0.0065, FPZ + s_ * 0.010), (0.016, 0.0012, 0.0012))
    andirons.boxb((FPX + 0.026, FLOOR + 0.004, FPZ + s_ * 0.010), (0.0014, 0.009, 0.0014))
andirons.done()
fire_logs = Part('HearthLogs', 'Trunk', smooth=True)
fire_logs.cyl((FPX + 0.016, FLOOR + 0.0095, FPZ), 0.0032, 0.030, axis='z', seg=8, rot_y=6)
fire_logs.cyl((FPX + 0.021, FLOOR + 0.0105, FPZ + 0.002), 0.0028, 0.026, axis='z', seg=8, rot_y=-14)
fire_logs.done()
Part('HearthLogEnds', 'Ember', smooth=True).cyl((FPX + 0.016, FLOOR + 0.0095, FPZ + 0.0152), 0.0026, 0.0006, axis='z', seg=8).done()
hearth_flames = []
fire('Hearth', (FPX + 0.019, FLOOR + 0.011, FPZ), 1.0,
     ((0.0, 0.0, 0.019, 0.0060, 0.0, 0.0, 0.18), (-0.001, -0.007, 0.014, 0.0045, 0.0, -0.002, 0.25),
      (0.001, 0.0075, 0.015, 0.0045, 0.0, 0.002, 0.22), (0.003, 0.003, 0.010, 0.0035, 0.001, 0.0, 0.3)), hearth_flames)
# The mantel: a heavy pine beam on two corbels, a spruce garland with red berries, two mugs, two stockings.
MY = FLOOR + 0.066
Part('Mantel', 'PineDark').box((FPX + 0.014, MY + 0.0035, FPZ), (0.028, 0.007, 0.086)).done()
Part('MantelCorbels', 'PineDark').box((FPX + 0.018, MY - 0.004, FPZ - 0.036), (0.012, 0.008, 0.006)).box((FPX + 0.018, MY - 0.004, FPZ + 0.036), (0.012, 0.008, 0.006)).done()
garland = Part('MantelGarland', 'Spruce', smooth=True)
berries = Part('MantelBerries', 'Red', smooth=True)
for i in range(13):
    z = FPZ - 0.038 + i * 0.0063
    sag = 0.0035 * math.sin(math.pi * ((i % 6) / 6))
    garland.sphere((FPX + 0.0285, MY + 0.002 - sag, z), 0.0026, seg=6, rings=4)
    if i % 3 == 1:
        berries.sphere((FPX + 0.0305, MY + 0.0015 - sag, z + 0.0012), 0.0010, seg=5, rings=3)
garland.done(); berries.done()
Part('MantelMugs', 'Mug', smooth=True).cyl((FPX + 0.012, MY + 0.0115, FPZ - 0.024), 0.0042, 0.009, seg=10).cyl((FPX + 0.012, MY + 0.0115, FPZ + 0.026), 0.0042, 0.009, seg=10).done()
stock = Part('Stockings', 'Red', smooth=True)
cuffs = Part('StockingCuffs', 'Cream', smooth=True)
for z in (FPZ - 0.012, FPZ + 0.012):
    stock.box((FPX + 0.0295, MY - 0.010, z), (0.003, 0.014, 0.0065))
    stock.box((FPX + 0.0295, MY - 0.0175, z + 0.0035), (0.003, 0.0045, 0.010))
    cuffs.box((FPX + 0.0298, MY - 0.0025, z), (0.0032, 0.0035, 0.0075))
stock.done(); cuffs.done()
# The chimney: the breast above the mantel, a sloped shoulder, the narrower stack up past the wall top.
CH_TOP = FLOOR + H + 0.058                          # the stack stands 5.8 cm proud of the wall top
chim = Part('ChimneyBreast', 'Stone')
chim.boxb((FPX + 0.010, MY + 0.007, FPZ), (0.020, 0.040, 0.064))
chim.box((FPX + 0.008, MY + 0.051, FPZ), (0.016, 0.010, 0.056), rot_z=0)
chim.boxb((FPX + 0.006, MY + 0.055, FPZ), (0.013, CH_TOP - MY - 0.055, 0.036))
chim.done()
Part('ChimneyShoulder', 'StoneDark').box((FPX + 0.016, MY + 0.049, FPZ), (0.010, 0.004, 0.062), rot_z=28).done()
Part('ChimneyCap', 'StoneDark').box((FPX + 0.006, CH_TOP + 0.003, FPZ), (0.019, 0.006, 0.044)).done()
Part('ChimneyPot', 'Terracotta', smooth=True).cyl((FPX + 0.006, CH_TOP + 0.011, FPZ), 0.0048, 0.011, seg=10, r2=0.0042).done()
Part('ChimneySnow', 'Snow', smooth=True).box((FPX + 0.006, CH_TOP + 0.0072, FPZ - 0.011), (0.017, 0.003, 0.016)).box((FPX + 0.006, CH_TOP + 0.0072, FPZ + 0.012), (0.017, 0.003, 0.014)).done()
tools = Part('FireTools', 'Wire')
tools.boxb((FPX + 0.030, FLOOR + 0.004, FPZ + 0.046), (0.0012, 0.030, 0.0012))
tools.box((FPX + 0.030, FLOOR + 0.034, FPZ + 0.046), (0.0026, 0.0026, 0.0026))
tools.boxb((FPX + 0.028, FLOOR + 0.004, FPZ + 0.044), (0.008, 0.0012, 0.008))
tools.done()
Part('HearthRug', 'Plaid').boxb((FPX + 0.055, 0.0241, FPZ), (0.030, 0.0006, 0.052)).done()
anchor('FireplaceSpot', (FPX + 0.03, FLOOR, FPZ), rot_y=-90)
# The smoke: one soft wisp, not separate balls. Five small puffs, a fifth of a loop apart, so close that
# they always overlap into a column; each is born inside the pot's mouth (hidden), rises and swells, and
# shrinks away at the top (see the Ambient clip below). They lean one way, downwind, so it reads as a wisp.
SMOKE_N = 5
SMOKE_AT = (FPX + 0.006, CH_TOP + 0.014, FPZ)      # 2.5 mm inside the pot's rim (its top is CH_TOP + 0.0165)
smoke_objs = []
for i in range(SMOKE_N):
    sm = Part(f'Smoke-{i}', 'Smoke', smooth=True).sphere((0, 0, 0), 0.0055, seg=10, rings=7).done()
    sm.location = G(*SMOKE_AT)
    smoke_objs.append(sm)

# ------------------------------------------------------------------ the counter and the back bar
CF = 0.045                   # the counter and the baristas came 4.5 cm forward (a deeper barista zone under a deeper upper deck)
CZ0, CZ1 = -0.20 + CF, -0.16 + CF      # the counter's back and front faces (the baristas stand behind, at z -0.159)
counter = Part('Counter', 'Red')
counter.boxb((-0.1625, FLOOR, (CZ0 + CZ1) / 2), (0.385, 0.058, CZ1 - CZ0))   # x -0.355..0.03: a way out at the left end
counter.done()
panels = Part('CounterPanels', 'Cream')
for i in range(5):
    panels.box((-0.325 + i * 0.0815, FLOOR + 0.03, CZ1 + 0.001), (0.064, 0.036, 0.003))
panels.done()
Part('CounterTop', 'Cream').box((-0.1625, FLOOR + 0.061, (CZ0 + CZ1) / 2 + 0.004), (0.405, 0.006, CZ1 - CZ0 + 0.016)).done()
Part('CounterTopEdge', 'PineDark').box((-0.1625, FLOOR + 0.058, CZ1 + 0.010), (0.405, 0.004, 0.006)).done()
# The duckboard the baristas stand on (y 0.036: a 1.2 cm step, walked).
Part('Duckboard', 'Deck').boxb((-0.19, FLOOR, (-0.27 + CZ0) / 2), (0.44, 0.012, CZ0 - (-0.27))).done()
# The back bar: a pine shelf unit against the back wall, coffee urns, cups, a donut tower.
Part('BackBar', 'Pine').boxb((-0.19, FLOOR, -0.255), (0.42, 0.075, 0.03)).done()
Part('BackBarTop', 'PineDark').box((-0.19, FLOOR + 0.077, -0.255), (0.43, 0.004, 0.034)).done()
urns = Part('CoffeeUrns', 'Steel', smooth=True)
for x in (-0.36, -0.31):
    urns.cyl((x, FLOOR + 0.093, -0.255), 0.013, 0.028, seg=12)
    urns.cyl((x, FLOOR + 0.109, -0.255), 0.006, 0.005, seg=8)
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
for x in (-0.15, -0.135, -0.12):
    bottles.cyl((x, FLOOR + 0.079 + 0.012, -0.258), 0.0045, 0.024, seg=8)
bottles.done()
Part('ShelfTins', 'Red').box((-0.095, FLOOR + 0.079 + 0.009, -0.258), (0.03, 0.018, 0.016)).done()
Part('ShelfTinLid', 'Cream').box((-0.095, FLOOR + 0.0985, -0.258), (0.032, 0.003, 0.018)).done()
Part('ShelfMugs', 'Spruce', smooth=True).cyl((-0.055, FLOOR + 0.086, -0.255), 0.007, 0.014, seg=10).cyl((-0.035, FLOOR + 0.086, -0.255), 0.007, 0.014, seg=10).done()
# The donut case at the counter's right end: a glass box of donuts, a till beside it.
Part('DonutCaseBase', 'Cream').boxb((-0.02, FLOOR + 0.064, -0.18 + CF), (0.10, 0.004, 0.034)).done()
Part('DonutCaseGlass', 'Glass').boxb((-0.02, FLOOR + 0.068, -0.18 + CF), (0.10, 0.03, 0.034)).done()
Part('DonutCaseTop', 'PineDark').box((-0.02, FLOOR + 0.099, -0.18 + CF), (0.104, 0.003, 0.038)).done()
donuts = Part('Donuts', 'Donut', smooth=True)
icings = {'IcingPink': Part('DonutIcingPink', 'IcingPink', smooth=True), 'IcingChoc': Part('DonutIcingChoc', 'IcingChoc', smooth=True), 'IcingMaple': Part('DonutIcingMaple', 'IcingMaple', smooth=True)}
for i in range(6):
    x = -0.06 + (i % 3) * 0.032
    z = -0.188 + CF + (i // 3) * 0.016
    y = FLOOR + 0.0705 + (i // 3) * 0.009
    g = bmesh.ops.create_cone(donuts.bm, cap_ends=True, segments=12, radius1=0.0095, radius2=0.0095, depth=0.006)
    bmesh.ops.transform(donuts.bm, matrix=Matrix.Translation(G(x, y, z)), verts=g['verts'])
    ic = list(icings.values())[i % 3]
    g = bmesh.ops.create_cone(ic.bm, cap_ends=True, segments=12, radius1=0.0097, radius2=0.0097, depth=0.0022)
    bmesh.ops.transform(ic.bm, matrix=Matrix.Translation(G(x, y + 0.0038, z)), verts=g['verts'])
donuts.done()
for p in icings.values():
    p.done()
Part('Till', 'Cream').boxb((0.0, FLOOR + 0.064, -0.19 + CF), (0.028, 0.02, 0.022), rot_y=-12).done()
Part('TillScreen', 'Wire').box((0.0, FLOOR + 0.084, -0.19 + CF), (0.026, 0.014, 0.004), rot_y=-12, rot_x=-20).done()
# A "pick up here" tag at the counter's right end, for takeaway.
Part('TakeawayTag', 'Red').box((0.012, FLOOR + 0.072, CZ1 + 0.003), (0.02, 0.0005, 0.001)).done()
text_mesh('TakeawayWords', 'PICK UP', 0.0056, 'Cream', (0.012, FLOOR + 0.0745, CZ1 + 0.0036), extrude=0.0003)
Part('TakeawayTagBoard', 'Red').box((0.012, FLOOR + 0.0745, CZ1 + 0.002), (0.028, 0.01, 0.002)).done()
anchor('TakeawaySpot', (0.0, FLOOR, -0.13 + CF), rot_y=180)   # 3 cm off the counter's front (z -0.115), clear of TableSpot-4
anchor('BaristaSpot-1', (-0.235, 0.036, -0.204 + CF), rot_y=180)
anchor('BaristaSpot-2', (-0.115, 0.036, -0.204 + CF), rot_y=180)
anchor('BaristaSpot-3', (0.005, 0.036, -0.204 + CF), rot_y=180)

# ------------------------------------------------------------------ the deck (the patio)
DX0, DX1, DZ0, DZ1 = 0.06, 0.40, -0.12, 0.17
Part('Deck', 'Deck').boxb((((DX0 + DX1) / 2), 0.02, (DZ0 + DZ1) / 2), (DX1 - DX0, 0.004, DZ1 - DZ0)).done()
dg = Part('DeckGrooves', 'PineDark')
for i in range(12):
    dg.boxb((DX0 + 0.014 + i * 0.028, 0.0241, (DZ0 + DZ1) / 2), (0.0015, 0.0005, DZ1 - DZ0))
dg.done()
# Snow dusting on the deck: thin soft patches along its edges.
dust = Part('DeckSnow', 'Snow', smooth=True)
for x, z, sx, sz in ((0.15, -0.10, 0.035, 0.02), (0.36, -0.10, 0.06, 0.02), (0.38, 0.14, 0.04, 0.03), (0.09, 0.14, 0.04, 0.03), (0.22, 0.165, 0.10, 0.015)):
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
wire.done()
bulbs.done()
# A patio heater: a steel pole with a mushroom top, snow on the top.
Part('HeaterPole', 'Steel').boxb((0.235, FLOOR, 0.0), (0.006, 0.10, 0.006)).done()
Part('HeaterBase', 'Steel', smooth=True).cyl((0.235, FLOOR + 0.004, 0.0), 0.018, 0.008, seg=12).done()
Part('HeaterHood', 'Steel', smooth=True).cyl((0.235, FLOOR + 0.102, 0.0), 0.022, 0.012, seg=12, r2=0.006).done()
Part('HeaterGlow', 'Bulb', smooth=True).cyl((0.235, FLOOR + 0.094, 0.0), 0.009, 0.01, seg=10).done()
Part('HeaterSnow', 'Snow').cyl((0.235, FLOOR + 0.110, 0.0), 0.012, 0.004, seg=10).done()
# The bear, behind the deck where the musician's stage stood: a low-poly black bear sitting in the snow, legs out
# in front, holding a red takeaway cup with a white lid in both paws under its chin, turned toward the player.
BEX, BEZ, BYAW = 0.31, -0.205, math.radians(-15)
def bp(x, y, z):
    """A point in the bear's own frame (+z its front) to game space."""
    return (BEX + x * math.cos(BYAW) + z * math.sin(BYAW), FLOOR + y, BEZ - x * math.sin(BYAW) + z * math.cos(BYAW))
def limb(part, a, b, r, seg=8):
    """An ellipsoid from a to b (game space), r thick."""
    a, b = G(*a), G(*b)
    d = b - a
    g = bmesh.ops.create_uvsphere(part.bm, u_segments=seg, v_segments=6, radius=1.0)
    M = Matrix.Translation((a + b) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4() @ Matrix.Diagonal(Vector((r, r, d.length / 2 + r * 0.5, 1)))
    bmesh.ops.transform(part.bm, matrix=M, verts=g['verts'])
fur = Part('Bear', 'BearFur')
fur.sphere(bp(0, 0.016, 0.002), 1.0, seg=10, rings=7, scale=(0.028, 0.017, 0.024))       # seat and belly
fur.sphere(bp(0, 0.030, -0.001), 1.0, seg=10, rings=7, scale=(0.024, 0.022, 0.020))      # chest
fur.sphere(bp(0, 0.057, 0.003), 1.0, seg=10, rings=7, scale=(0.019, 0.017, 0.017))      # head
for sx in (1, -1):
    fur.sphere(bp(sx * 0.0135, 0.0715, 0.0), 1.0, seg=8, rings=5, scale=(0.0065, 0.0065, 0.004))     # ears
    limb(fur, bp(sx * 0.014, 0.010, 0.006), bp(sx * 0.019, 0.008, 0.026), 0.0095)                    # legs out in front
    fur.sphere(bp(sx * 0.019, 0.0085, 0.030), 1.0, seg=8, rings=6, scale=(0.0085, 0.0085, 0.0065))  # feet
    limb(fur, bp(sx * 0.021, 0.038, 0.004), bp(sx * 0.011, 0.030, 0.024), 0.0062)                    # arms round to the cup
    fur.sphere(bp(sx * 0.0105, 0.030, 0.0255), 1.0, seg=8, rings=6, scale=(0.0058, 0.0058, 0.0055)) # paws on the cup
fur.done()
tan = Part('BearMuzzle', 'BearMuzzle')
tan.sphere(bp(0, 0.052, 0.0175), 1.0, seg=8, rings=6, scale=(0.0095, 0.0072, 0.0072))   # muzzle
tan.sphere(bp(0, 0.020, 0.0205), 1.0, seg=8, rings=6, scale=(0.014, 0.012, 0.005))      # belly patch, under the cup
for sx in (1, -1):
    tan.sphere(bp(sx * 0.0135, 0.0715, 0.0032), 1.0, seg=8, rings=5, scale=(0.0038, 0.0038, 0.0018))   # inner ears
    tan.sphere(bp(sx * 0.019, 0.0085, 0.0355), 1.0, seg=8, rings=5, scale=(0.0055, 0.0058, 0.0016))    # foot pads, soles to the player
tan.done()
face = Part('BearFace', 'PianoBlack')
face.sphere(bp(0, 0.0555, 0.0245), 1.0, seg=8, rings=5, scale=(0.0038, 0.0027, 0.0025))  # nose
for sx in (1, -1):
    face.sphere(bp(sx * 0.0075, 0.0615, 0.0165), 1.0, seg=6, rings=4, scale=(0.0021, 0.0024, 0.0016))   # eyes
face.done()
blush = Part('BearBlush', 'IcingPink')
for sx in (1, -1):
    blush.sphere(bp(sx * 0.0125, 0.0525, 0.0145), 1.0, seg=6, rings=4, scale=(0.0028, 0.0018, 0.0012))
blush.done()
cup = bp(0, 0.0305, 0.028)
Part('BearCup', 'Red').cyl(cup, 0.0066, 0.017, seg=12, r2=0.0082).done()                     # a red takeaway cup, wider at the top
Part('BearCupLid', 'CupLid').cyl((cup[0], cup[1] + 0.0098, cup[2]), 0.0088, 0.0026, seg=12).cyl((cup[0], cup[1] + 0.0118, cup[2]), 0.0068, 0.0016, seg=12, r2=0.0055).done()
Part('BearHeadSnow', 'Snow', smooth=True).sphere(bp(0, 0.0725, 0.0), 1.0, seg=8, rings=5, scale=(0.009, 0.0022, 0.008)).done()   # a little snow on its head
# The violinist (once bought) stands on the snow at the bear's left, by the deck's back rail.
anchor('MusicianSpot', (0.205, FLOOR, -0.19), rot_y=180)
# Patio table spots and the deck's seats are furniture pieces (phase 2); marked for the layout.
anchor('PatioSpot-1', (0.16, FLOOR, 0.08))
anchor('PatioSpot-2', (0.31, FLOOR, 0.06))

# ------------------------------------------------------------------ the upper deck (the rooftop patio)
# A pine deck on the cabin's back half, over the counter and the back bar (the part of the room the player never
# reaches into), open to the sky so every seat on it is in reach from above; the lower floor's seats stay in front,
# open too. It sits on the back and side walls and two slim posts at its front edge, 2.6 cm over the baristas'
# heads. A low rail round it, string lights on two tall poles, icicles under its front edge, the menu board hanging
# from it; the rooftop sign stands at its back. Guests reach it by the stairs outside the cabin's right wall, from
# the patio. Everything on this floor is named Upper* / Stair* / Landing* / Piano* / RoofSign*.
UY = FLOOR + H + 0.006                              # the upper floor's top (0.155)
UX0, UX1, UZ0, UZ1 = CAB['x0'] - 0.005, CAB['x1'], CAB['z0'] - 0.005, -0.090   # 18.5 cm deep: two rows of two tables
ROOT['upper_floor_top_y_m'] = round(UY, 4)
Part('UpperDeckFloor', 'Deck').box(((UX0 + UX1) / 2, UY - 0.003, (UZ0 + UZ1) / 2), (UX1 - UX0, 0.006, UZ1 - UZ0)).done()
ug = Part('UpperDeckGrooves', 'PineDark')
for i in range(1, 13):
    ug.boxb(((UX0 + UX1) / 2, UY + 0.0001, UZ0 + i * (UZ1 - UZ0) / 13), (UX1 - UX0, 0.0005, 0.0015))
ug.done()
Part('UpperFascia', 'Cream').box(((UX0 + UX1) / 2, UY - 0.005, UZ1 + 0.001), (UX1 - UX0, 0.012, 0.003)).done()
up = Part('UpperPosts', 'PineDark')
for x in (-0.175, 0.034):                            # two slim posts under its front edge (between the stations, at the right wall)
    up.boxb((x, FLOOR, UZ1 - 0.003), (0.008, UY - 0.006 - FLOOR, 0.008))
up.done()
# The rail: posts, a top and a middle rail along the front and the left end, the back behind the sign; low (2.2 cm)
# so seated guests show over it and a hand reaches over it.
RAIL_H = 0.022
rail_u = Part('UpperRail', 'PineDark')
for x in (UX0 + 0.003, -0.30, -0.19, -0.08, UX1 - 0.006):
    rail_u.boxb((x, UY, UZ1 - 0.003), (0.005, RAIL_H, 0.005))
for z in (UZ0 + 0.004, -0.21, -0.15):
    rail_u.boxb((UX0 + 0.003, UY, z), (0.005, RAIL_H, 0.005))
for y in (RAIL_H, RAIL_H / 2):
    rail_u.box(((UX0 + UX1) / 2, UY + y, UZ1 - 0.003), (UX1 - UX0, 0.003, 0.003))
    rail_u.box((UX0 + 0.003, UY + y, (UZ0 + UZ1) / 2), (0.003, 0.003, UZ1 - UZ0))
    rail_u.box(((UX0 + UX1) / 2, UY + y, UZ0 + 0.004), (UX1 - UX0, 0.003, 0.003))
rail_u.box((UX1 - 0.003, UY + RAIL_H, -0.2575), (0.003, 0.003, 0.035))   # the short right-hand run behind the landing
rail_u.boxb((UX1 - 0.003, UY, UZ0 + 0.004), (0.005, RAIL_H, 0.005))
rail_u.done()
Part('UpperRailSnow', 'Snow').box(((UX0 + UX1) / 2, UY + RAIL_H + 0.0025, UZ1 - 0.003), (UX1 - UX0, 0.003, 0.0045)).box((UX0 + 0.003, UY + RAIL_H + 0.0025, (UZ0 + UZ1) / 2), (0.0045, 0.003, UZ1 - UZ0)).done()
usnow = Part('UpperSnow', 'Snow', smooth=True)
for x, z, sx, sz in ((UX0 + 0.02, UZ0 + 0.012, 0.022, 0.010), (UX1 - 0.03, UZ0 + 0.01, 0.03, 0.009), (-0.19, UZ0 + 0.008, 0.05, 0.006)):
    usnow.sphere((x, UY, z), 1.0, seg=10, rings=6, scale=(sx, 0.003, sz))
usnow.done()
uice = Part('UpperIcicles', 'Ice')
for i, x in enumerate((-0.405, -0.345, -0.065, 0.032)):   # clear of the three stations, so no barista is hidden
    uice.cone((x, UY - 0.011, UZ1 + 0.001), 0.0026, -0.009 - 0.003 * (i % 2), seg=5)
uice.done()
# String lights: two tall poles at the front corners, a sagging line of bulbs well over the seated guests' heads.
Part('UpperLightPoles', 'PineDark').boxb((UX0 + 0.003, UY, UZ1 - 0.003), (0.007, 0.088, 0.007)).boxb((UX1 - 0.006, UY, UZ1 - 0.003), (0.007, 0.088, 0.007)).done()
uwire = Part('UpperLightWire', 'Wire')
ubulbs = Part('UpperLightBulbs', 'Bulb', smooth=True)
pts = []
a, b, n, sag = (UX0 + 0.003, UY + 0.086, UZ1 - 0.003), (UX1 - 0.006, UY + 0.086, UZ1 - 0.003), 10, 0.014
for i in range(n + 1):
    t = i / n
    pts.append((a[0] + (b[0] - a[0]) * t, a[1] - sag * 4 * t * (1 - t), a[2]))
for p, q in zip(pts, pts[1:]):
    mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, p[2])
    tilt = math.degrees(math.atan2(q[1] - p[1], q[0] - p[0]))
    uwire.box(mid, (math.dist(p, q), 0.0012, 0.0012), rot_z=-tilt)
for p in pts[1:-1]:
    ubulbs.sphere((p[0], p[1] - 0.004, p[2]), 0.0035, seg=8, rings=5)
uwire.done(); ubulbs.done()
# The menu board hangs from the deck's front edge, between the first two stations (the back wall is out of sight
# under the deck), on two short chains.
MBX, MBY, MBZ = -0.175, UY - 0.030, UZ1 + 0.0042
Part('MenuFrame', 'PineDark').box((MBX, MBY, MBZ - 0.001), (0.076, 0.04, 0.003)).done()
Part('MenuBoard', 'Chalk').box((MBX, MBY, MBZ), (0.07, 0.034, 0.003)).done()
Part('MenuChains', 'Wire').box((MBX - 0.028, UY - 0.0105, MBZ - 0.001), (0.0012, 0.004, 0.0012)).box((MBX + 0.028, UY - 0.0105, MBZ - 0.001), (0.0012, 0.004, 0.0012)).done()
text_mesh('MenuTitle', 'MENU', 0.0045, 'ChalkText', (MBX, MBY + 0.0128, MBZ + 0.0018), extrude=0.0003)
for i, line in enumerate(('2x2 COFFEE  2', 'SNOWBITS  3', 'BEAVER TAIL  4', 'MAPLE LATTE  3')):
    text_mesh(f'Menu-{i}', line, 0.0050, 'ChalkText', (MBX, MBY + 0.0062 - i * 0.0062, MBZ + 0.0018), extrude=0.0003)

# The rooftop sign: the cream board with the red oval and the words, on two legs at the deck's back, its bottom
# 7 cm up so the seated guests and the pianist in front of it do not hide it; the mountains rise behind it.
SIGN_LIFT = 0.04    # raised 4 cm so the seated pianist does not hide the logo; the legs grow by the same
SGY = UY + 0.062 + SIGN_LIFT
Part('RoofSignLegs', 'PineDark').boxb((-0.31, UY, UZ0 + 0.006), (0.006, 0.03 + SIGN_LIFT, 0.006)).boxb((-0.03, UY, UZ0 + 0.006), (0.006, 0.03 + SIGN_LIFT, 0.006)).done()
Part('RoofSignBoard', 'Cream').box((-0.17, SGY, UZ0 + 0.006), (0.30, 0.064, 0.008)).done()
Part('RoofSignTrim', 'PineDark').box((-0.17, SGY + 0.034, UZ0 + 0.006), (0.31, 0.006, 0.012)).done()
Part('RoofSignSnow', 'Snow', smooth=True).box((-0.17, SGY + 0.039, UZ0 + 0.006), (0.31, 0.005, 0.014)).done()
Part('SignOvalRim', 'Cream', smooth=True).ellipse((-0.17, SGY, UZ0 + 0.0115), 0.131, 0.029, 0.002).done()
Part('SignOval', 'Red', smooth=True).ellipse((-0.17, SGY, UZ0 + 0.0125), 0.125, 0.025, 0.003).done()
text_mesh('SignWords', "Hoser's", 0.026, 'Cream', (-0.17, SGY + 0.0035, UZ0 + 0.0145), extrude=0.0008)
text_mesh('SignSub', 'COFFEE & DONUTS', 0.0085, 'Cream', (-0.17, SGY - 0.015, UZ0 + 0.0145), extrude=0.0006)

# The rooftop piano at the deck's left end, side on to the player: an upright, black, a red runner and a mug on
# top, its keys toward the deck; the bench in front of it. The pianist (barista-pianist.glb, bought in the game)
# sits on the bench at `PianoSpot`, facing the keys.
PZ = -0.2125
PX = UX0 + 0.004                                    # the piano's back, against the end rail
Part('PianoBody', 'PianoBlack').boxb((PX + 0.012, UY, PZ), (0.024, 0.054, 0.065)).done()
Part('PianoLid', 'PianoBlack').box((PX + 0.012, UY + 0.0555, PZ), (0.027, 0.003, 0.068)).done()
Part('PianoShelf', 'PianoBlack').box((PX + 0.0295, UY + 0.028, PZ), (0.011, 0.004, 0.061)).done()
Part('PianoLegs', 'PianoBlack').boxb((PX + 0.032, UY, PZ - 0.027), (0.003, 0.026, 0.003)).boxb((PX + 0.032, UY, PZ + 0.027), (0.003, 0.026, 0.003)).done()
Part('PianoKeys', 'PianoKeys').box((PX + 0.0295, UY + 0.0306, PZ), (0.009, 0.0012, 0.057)).done()
black = Part('PianoBlackKeys', 'PianoBlack')
for k in range(14):
    if k % 7 in (2, 6):
        continue
    black.box((PX + 0.0275, UY + 0.0318, PZ - 0.026 + k * 0.004), (0.005, 0.0014, 0.0022))
black.done()
Part('PianoMusicStand', 'PianoBlack').box((PX + 0.0255, UY + 0.040, PZ), (0.002, 0.012, 0.026), rot_z=-12).done()
Part('PianoSheet', 'PianoKeys').box((PX + 0.0268, UY + 0.040, PZ), (0.0005, 0.010, 0.022), rot_z=-12).done()
Part('PianoRunner', 'Red').box((PX + 0.012, UY + 0.0572, PZ), (0.02, 0.0006, 0.06)).done()
Part('PianoMug', 'Mug', smooth=True).cyl((PX + 0.012, UY + 0.0620, PZ + 0.022), 0.004, 0.008, seg=10).done()
Part('PianoBench', 'PianoBlack').boxb((PX + 0.054, UY, PZ), (0.014, 0.0095, 0.03)).done()
Part('PianoBenchCushion', 'Red').box((PX + 0.054, UY + 0.010, PZ), (0.013, 0.0012, 0.028)).done()
anchor('PianoSpot', (PX + 0.056, UY, PZ), rot_y=90)          # facing -X, the keys
anchor('UpperFloorTop', (-0.19, UY, -0.17))
# Four bistro tables in two rows of two: the back row where the two stood, the front row 8.5 cm nearer the player.
for i, (x, z) in enumerate(((-0.27, -0.2225), (-0.11, -0.2225), (-0.27, -0.1375), (-0.11, -0.1375))):
    anchor(f'UpperSpot-{i + 1}', (x, UY, z))

# ------------------------------------------------------------------ the stairs up to it, outside the cabin's right wall
# Fifteen 8.7 mm steps of 9 mm (under the walk grid's 1.35 cm step, and about one guest stride each), climbing
# away from the player from the patio by the cabin door to a landing level with the upper deck. A stringer each
# side, a handrail on the patio side.
N_STEPS = 15
RISE = (UY - FLOOR) / N_STEPS
RUN = 0.009
SX0, SX1 = 0.050, 0.112                             # 6.2 cm wide: a guest (4.3 cm) with room either side
SZ_START = -0.012                                   # the front edge of the first step
ROOT['stair_steps'] = N_STEPS
ROOT['stair_rise_m'] = round(RISE, 5)
ROOT['stair_run_m'] = RUN
steps = Part('StairSteps', 'Deck')
noses = Part('StairNosing', 'PineDark')
for k in range(1, N_STEPS + 1):
    z_front = SZ_START - (k - 1) * RUN
    top = FLOOR + k * RISE
    steps.box(((SX0 + SX1) / 2, top - 0.0013, z_front - RUN / 2 - 0.0005), (SX1 - SX0 - 0.006, 0.0026, RUN + 0.001))   # open treads
    noses.box(((SX0 + SX1) / 2, top - 0.0008, z_front - 0.0004), (SX1 - SX0 - 0.006, 0.0016, 0.0014))
steps.done(); noses.done()
L_RUN = N_STEPS * RUN
slope = math.degrees(math.atan2(UY - FLOOR, L_RUN))
length = math.hypot(L_RUN, UY - FLOOR)
stringers = Part('StairStringers', 'PineDark')
for x in (SX0 + 0.001, SX1 - 0.001):
    stringers.box((x, FLOOR + (UY - FLOOR) / 2 - 0.003, SZ_START - L_RUN / 2), (0.004, 0.014, length), rot_x=slope)
stringers.done()
hand = Part('StairHandrail', 'PineDark')
hand.boxb((SX1 + 0.001, FLOOR, SZ_START - 0.002), (0.005, 0.032, 0.005))
hand.box((SX1 + 0.001, FLOOR + (UY - FLOOR) / 2 + 0.028, SZ_START - L_RUN / 2), (0.003, 0.003, length + 0.004), rot_x=slope)
hand.done()
Part('StairHandrailSnow', 'Snow').box((SX1 + 0.001, FLOOR + 0.0335, SZ_START - 0.002), (0.006, 0.003, 0.006)).done()
# The landing: level with the deck, joined to it, on three posts, a rail on its outer side and its back.
LZ0, LZ1 = -0.240, SZ_START - L_RUN
Part('LandingFloor', 'Deck').box(((UX1 + SX1) / 2, UY - 0.003, (LZ0 + LZ1) / 2), (SX1 - UX1, 0.006, LZ1 - LZ0)).done()
lposts = Part('LandingPosts', 'PineDark')
for x, z in ((SX1 - 0.004, LZ0 + 0.004), (SX1 - 0.004, LZ1 - 0.004), (UX1 + 0.004, LZ0 + 0.004)):
    lposts.boxb((x, FLOOR, z), (0.007, UY - 0.006 - FLOOR, 0.007))
lposts.done()
lrail = Part('LandingRail', 'PineDark')
for x, z in ((SX1 - 0.003, LZ0 + 0.003), (SX1 - 0.003, LZ1 - 0.002), (UX1 + 0.003, LZ0 + 0.003)):
    lrail.boxb((x, UY, z), (0.005, RAIL_H, 0.005))
for y in (RAIL_H, RAIL_H / 2):
    lrail.box((SX1 - 0.003, UY + y, (LZ0 + LZ1) / 2), (0.003, 0.003, LZ1 - LZ0))
    lrail.box(((UX1 + SX1) / 2, UY + y, LZ0 + 0.003), (SX1 - UX1, 0.003, 0.003))
lrail.done()
Part('LandingSnow', 'Snow', smooth=True).sphere((SX1 - 0.012, UY, LZ0 + 0.01), 1.0, seg=8, rings=5, scale=(0.012, 0.003, 0.008)).done()
anchor('StairBottom', ((SX0 + SX1) / 2, FLOOR, SZ_START + 0.010), rot_y=180)   # where a guest starts up (facing -Z)
anchor('StairTop', ((SX0 + SX1) / 2, UY, LZ1 - 0.006), rot_y=180)                # the first spot on the landing
anchor('UpperLanding', ((UX1 + SX1) / 2, UY, -0.19), rot_y=90)                   # turned toward the deck (-X)

# ------------------------------------------------------------------ the lake, the dock and the canoe
LX0, LX1, LZ0, LZ1 = 0.12, 0.46, 0.20, 0.31
Part('LakeIce', 'Ice').boxb((((LX0 + LX1) / 2), 0.02, (LZ0 + LZ1) / 2), (LX1 - LX0, 0.002, LZ1 - LZ0)).done()
flat_ellipse('IceSkatingPatch', 'IceDeep', (0.27, 0.0221, 0.255), 0.12, 0.045, 0.0004, seg=24)   # lying on the ice (it was turned about the plate's centre, under the plate)
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
bembers = Part('FireEmbers', 'Ember', smooth=True)
for i in range(14):
    a = i * 2.39996
    rr = 0.004 + 0.016 * ((i * 0.618) % 1)
    bembers.sphere((FX + rr * math.cos(a), FLOOR + 0.004, FZ + rr * math.sin(a)), 0.0028, seg=6, rings=4, scale=(1.0, 0.6, 1.0))
bembers.done()
fire('Bonfire', (FX, FLOOR + 0.013, FZ), 1.0,
     ((0.0, 0.0, 0.042, 0.0115, 0.0, 0.0, 0.15), (-0.009, 0.005, 0.031, 0.009, -0.002, 0.001, 0.2), (0.009, -0.004, 0.028, 0.0085, 0.002, -0.001, 0.25),
      (0.002, 0.010, 0.023, 0.007, 0.0, 0.002, 0.3), (-0.004, -0.010, 0.021, 0.0065, -0.001, -0.002, 0.3)), flames)
# Three chair spots round the fire (the Muskoka chairs are pieces, phase 2) and a woodpile against the cabin's front.
for i, a in enumerate((205, 270, 335)):
    r = 0.085
    anchor(f'FireSpot-{i + 1}', (FX + r * math.cos(math.radians(a)), FLOOR, FZ - r * math.sin(math.radians(a))), rot_y=90 - a)   # facing the fire (an anchor's rot_y is the negative of three.js's yaw)
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
# The exit walkway: a flagstone path from the deck's front edge by the cabin door straight to the plate's front
# edge, between the bonfire's snow and the lake. Guests leave the café along it (`Exit`, at its foot). Irregular
# flat stones, two staggered per row, their tops 1.5 mm proud of the snow (a guest steps over nothing).
walk = Part('ExitWalk', 'Stone', smooth=True)
WKX, WKZ0, WKZ1 = 0.06, 0.182, 0.300
rows = 7
for r in range(rows):
    z = WKZ0 + (WKZ1 - WKZ0) * r / (rows - 1)
    for k, dx in enumerate((-0.0135, 0.0135) if r % 2 == 0 else (-0.019, 0.004, 0.024)):
        j = math.sin(r * 12.9898 + k * 78.233) * 43758.5453 % 1.0      # a repeatable jitter per stone
        sx = (0.0115 if r % 2 == 0 else 0.0085) * (0.9 + 0.2 * j)
        sz = 0.0085 * (0.92 + 0.16 * ((j * 7.0) % 1.0))
        walk.sphere((WKX + dx + 0.002 * (j - 0.5), FLOOR, z + 0.002 * (0.5 - j)), 1.0, seg=9, rings=4, scale=(sx, 0.0015, sz))
walk.done()
anchor('Exit', (WKX, FLOOR, 0.295))   # the walkway's foot at the plate's front edge, facing +Z (away from the café)

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
# ------------------------------------------------------------------ the Rockies behind, and a waterfall
# Two ranges of real relief along the plate's back edge (a deep bas-relief, as a stage backdrop: the front of
# each range comes 1-2 cm toward the player, ridges and spurs stand out and gullies sink in, so the one sun
# shades them like mountains). The far range is taller, thinner and hazed blue; the near range is darker with a
# spruce forest at its foot. One painted texture (1024 px, both ranges) carries rock with strata, the snowline,
# snow down the couloirs, bare rock on the steep faces and the forest; its normal map adds the rock's grain.
# A waterfall springs from a cleft in the near range and falls into a pool ringed with stones; white water runs
# down it and foam churns at its foot in the Ambient clip. All inside the plate, the tallest peak 0.35 up.
MT_X0, MT_X1, MT_BASE, MT_HMAX = -PLATE_W / 2 + 0.003, PLATE_W / 2 - 0.003, 0.022, 0.36
WFX = 0.150                                          # the waterfall's line
_grids = {}
def _vnoise2(u, v, seed):
    g = _grids.setdefault(seed, np.random.default_rng(seed).random((257, 257)))
    iu = np.floor(u).astype(int); iv = np.floor(v).astype(int)
    fu = u - iu; fv = v - iv; fu = fu * fu * (3 - 2 * fu); fv = fv * fv * (3 - 2 * fv)
    iu %= 256; iv %= 256
    return (g[iv, iu] * (1 - fu) * (1 - fv) + g[iv, iu + 1] * fu * (1 - fv) + g[iv + 1, iu] * (1 - fu) * fv + g[iv + 1, iu + 1] * fu * fv)
def fbm2(x, y, seed, freq, octaves=5):
    out, amp, tot = 0.0, 1.0, 0.0
    for o in range(octaves):
        out = out + amp * _vnoise2(x * freq + 37.1 * o + 100, y * freq + 11.7 * o + 100, seed + o); tot += amp
        amp *= 0.5; freq *= 2.07
    return out / tot
LAYERS = [
    dict(name='MountainsNear', z_back=-0.302, depth=0.022, nx=96, ny=24, seed=37, haze=0.10, snowline=0.62, forest=True, v0=0.0,
         peaks=[(-0.44, 0.15, 0.10), (-0.29, 0.21, 0.15), (-0.08, 0.18, 0.15), (0.16, 0.165, 0.10), (0.31, 0.20, 0.13), (0.45, 0.14, 0.09)]),
    dict(name='MountainsFar', z_back=-0.3085, depth=0.010, nx=72, ny=16, seed=31, haze=0.42, snowline=0.50, forest=False, v0=0.5,
         peaks=[(-0.39, 0.26, 0.15), (-0.18, 0.33, 0.19), (0.04, 0.29, 0.17), (0.23, 0.32, 0.18), (0.41, 0.27, 0.14)]),
]
def top_of(L, x):
    """The ridgeline: each peak a summit with uneven shoulders (steeper on one side), and along the whole line
    ridged noise for the sub-summits, notches and broken crests of the Rockies."""
    h = np.full_like(x, 0.035)
    for k, (px, ph, pw) in enumerate(L['peaks']):
        left, right = (0.80, 1.20) if k % 2 else (1.15, 0.85)
        w = np.where(x < px, pw * left, pw * right)
        h = np.maximum(h, ph * np.clip(1 - np.abs(x - px) / w, 0, 1) ** 1.12)
    hmax = max(ph for _, ph, _ in L['peaks'])
    zero = np.zeros_like(x)
    ridged = 1 - np.abs(2 * fbm2(x, zero + 3.0, L['seed'] + 50, 26, 5) - 1)
    jag = (0.048 * (ridged - 0.62) + 0.012 * (fbm2(x, zero + 9.0, L['seed'] + 51, 90, 3) - 0.5)) * np.clip(h / hmax, 0.25, 1)
    return MT_BASE + h + jag
def gully_of(L, x, y):
    n = fbm2(x * 1.0, y * 0.45, L['seed'] + 7, 34, 4)
    return 1 - np.abs(2 * n - 1)                       # ridged: 1 on the ribs, 0 in the gullies
def depth_of(L, x, y):
    top = top_of(L, x)
    yr = np.clip((y - MT_BASE) / (top - MT_BASE), 0, 1)
    D = L['depth']
    d = D * (1 - yr) ** 0.7
    for px, ph, pw in L['peaks']:
        d = d + 0.45 * D * np.exp(-((x - px) / (0.20 * pw)) ** 2) * (1 - yr) ** 0.45 * np.clip(yr, 0.02, 1) ** 0.25
    d = d + 0.30 * D * (gully_of(L, x, y) - 0.5) * (1 - yr ** 3)
    if L['forest']:                                    # the waterfall's cleft: a narrow recess down the face
        cleft = np.exp(-((x - WFX) / 0.010) ** 2) * (y < WF_TOP + 0.004)
        d = d - 0.55 * D * cleft
    return np.maximum(d, 0.0005)
WF_TOP = MT_BASE + 0.108                             # where the water springs from
def mountain_mesh(L):
    part = Part(L['name'], 'Mountains', smooth=True)
    uv = part.bm.loops.layers.uv.verify()
    xs = np.linspace(MT_X0, MT_X1, L['nx'] + 1)
    tops = top_of(L, xs)
    rows = []
    for j in range(L['ny'] + 1):
        t = j / L['ny']
        ys = MT_BASE + (tops - MT_BASE) * t
        zs = L['z_back'] + depth_of(L, xs, ys)
        rows.append([part.bm.verts.new(G(float(x), float(y), float(z))) for x, y, z in zip(xs, ys, zs)])
    for j in range(L['ny']):
        for i in range(L['nx']):
            f = part.bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
            for l in f.loops:
                gx, gy = l.vert.co.x, l.vert.co.z
                l[uv].uv = ((gx - MT_X0) / (MT_X1 - MT_X0), L['v0'] + 0.5 * (gy - MT_BASE) / MT_HMAX)
    bmesh.ops.recalc_face_normals(part.bm, faces=part.bm.faces)
    for f in part.bm.faces:                            # face the player (+Z game = -Y Blender)
        if f.normal.y > 0:
            f.normal_flip()
    return part.done()
def mountain_texture(n=1024):
    col = np.zeros((n, n, 3)); hgt = np.zeros((n, n))
    for L in LAYERS:
        rows = np.arange(n // 2)
        v = (rows + 0.5) / n + L['v0']
        y = MT_BASE + (v - L['v0']) * 2 * MT_HMAX
        u = (np.arange(n) + 0.5) / n
        x = MT_X0 + u * (MT_X1 - MT_X0)
        X, Y = np.meshgrid(x, y)
        top = top_of(L, X)
        yr = np.clip((Y - MT_BASE) / (top - MT_BASE), 0, 1)
        g = gully_of(L, X, Y)
        s = L['seed']
        rock = _mix(np.ones(X.shape + (3,)) * np.array([0.33, 0.32, 0.33]), (0.50, 0.47, 0.43), fbm2(X, Y, s + 1, 70))
        rock = rock * (1 + 0.045 * np.sin(Y * 700 + 9 * fbm2(X, Y, s + 2, 14)) * fbm2(X, Y, s + 10, 30))[..., None]   # faint, broken strata
        rock = rock * (0.78 + 0.32 * g)[..., None]                                              # darker in the gullies
        # Snow: above a ragged snowline; down the gullies (couloirs) below it; thinned off the rock ribs that run
        # downhill through it; wind-scoured off the highest crests.
        sl = L['snowline'] + 0.18 * (fbm2(X, np.zeros_like(X), s + 3, 9, 3) - 0.5)
        n3 = fbm2(X, Y, s + 4, 45)
        snow = np.clip((yr - sl + 0.16 * (n3 - 0.5)) / 0.10, 0, 1)
        gully = np.clip((0.86 - g) / 0.30, 0, 1)
        couloir = gully * np.clip((yr - (sl - 0.38)) / 0.12, 0, 1)
        snow = np.maximum(snow * (0.55 + 0.45 * gully), 0.9 * couloir)
        rib = fbm2(X * 1.0, Y * 0.16, s + 5, 75)
        snow = snow * (1 - 0.92 * np.clip((rib - 0.54) / 0.07, 0, 1) * (1 - gully))
        snow = snow * (1 - 0.6 * np.clip((yr - 0.88) / 0.12, 0, 1) * (1 - gully))
        snowcol = _mix(np.ones(X.shape + (3,)) * np.array([0.95, 0.97, 1.0]), (0.76, 0.84, 0.95), np.clip(0.75 - g, 0, 1) * 0.8)
        c = rock
        c = c * (1 - snow[..., None]) + snowcol * snow[..., None]
        if L['forest']:
            fl = 0.22 + 0.07 * (fbm2(X, np.zeros_like(X), s + 6, 11, 3) - 0.5)
            forest = np.clip((fl - yr + 0.05 * (fbm2(X, Y, s + 7, 50) - 0.5)) / 0.03, 0, 1)
            trees = fbm2(X, Y, s + 8, 420, 3)
            fcol = _mix(np.ones(X.shape + (3,)) * np.array([0.08, 0.18, 0.13]), (0.17, 0.31, 0.22), trees)
            fcol = _mix(fcol, (0.86, 0.90, 0.94), np.clip((trees - 0.66) / 0.08, 0, 1) * 0.8)     # snow on the trees
            c = c * (1 - forest[..., None]) + fcol * forest[..., None]
            if True:                                                                           # the wet dark rock by the waterfall
                wet = np.exp(-((X - WFX) / 0.016) ** 2) * (Y < WF_TOP + 0.006)
                c = c * (1 - 0.35 * wet)[..., None]
        # The sun's side: shade from the relief's own slopes (the game's sun is high, front right), so the shallow
        # backdrop reads as deep mountains; faces turned from the sun go cool and dark.
        e = 0.0015
        fx = (depth_of(L, X + e, Y) - depth_of(L, X - e, Y)) / (2 * e)
        fy = (depth_of(L, X, Y + e) - depth_of(L, X, Y - e)) / (2 * e)
        lam = np.clip((-0.6 * fx - 1.2 * fy + 0.8) / np.sqrt(fx * fx + fy * fy + 1) / 1.56, 0, 1)
        lam = (lam - lam.mean()) * 2.2
        c = c * (1 + 0.30 * np.clip(lam, -1, 1))[..., None]
        c = _mix(c, (0.52, 0.60, 0.74), np.clip(-lam, 0, 1) * 0.25)
        haze = L['haze'] * (1 + 0.4 * (1 - yr))
        c = _mix(c, (0.74, 0.82, 0.92), np.clip(haze, 0, 0.8))
        r0 = int(L['v0'] * n)
        col[r0:r0 + n // 2] = c
        hgt[r0:r0 + n // 2] = 0.6 * g + 0.4 * fbm2(X, Y, s + 9, 160, 3)
    return np.clip(col, 0, 1), hgt
mt_col, mt_h = mountain_texture()
_mm = MATS['Mountains']; _nt = _mm.node_tree; _bsdf = _nt.nodes['Principled BSDF']
_tn = _nt.nodes.new('ShaderNodeTexImage'); _tn.image = _image('tex-Mountains', mt_col); _nt.links.new(_tn.outputs['Color'], _bsdf.inputs['Base Color'])
_tnn = _nt.nodes.new('ShaderNodeTexImage'); _tnn.image = _image('nrm-Mountains', _normal_from_height(mt_h, 2.5), srgb=False)
_nm = _nt.nodes.new('ShaderNodeNormalMap'); _nt.links.new(_tnn.outputs['Color'], _nm.inputs['Color']); _nt.links.new(_nm.outputs['Normal'], _bsdf.inputs['Normal'])
for L in LAYERS:
    mountain_mesh(L)
# The waterfall: a ribbon down the cleft, following the rock, wider at its foot.
NEAR = LAYERS[0]
wf = Part('Waterfall', 'Water', smooth=True)
wf_rows = []
WF_N = 14
for j in range(WF_N + 1):
    y = WF_TOP - (WF_TOP - (FLOOR + 0.002)) * j / WF_N
    z = float(NEAR['z_back'] + depth_of(NEAR, np.array([WFX]), np.array([y]))[0]) + 0.0016 + 0.004 * (j / WF_N) ** 3
    w = 0.006 + 0.006 * (j / WF_N)
    wf_rows.append((y, z, w))
    a = wf.bm.verts.new(G(WFX - w, y, z)); b = wf.bm.verts.new(G(WFX + w, y, z))
    if j:
        wf.bm.faces.new((prev[0], prev[1], b, a))
    prev = (a, b)
wf.done()
# Streaks of white water sliding down it (keys along the ribbon), and foam at its foot (both in the Ambient clip).
streaks = []
for i, dx in enumerate((-0.003, 0.002, 0.004, -0.001)):
    ob = Part(f'WaterStreak-{i}', 'Snow').box((0, 0, 0), (0.0018, 0.016, 0.0008)).done()
    path = [(WFX + dx * (0.6 + 0.4 * k / 5), wf_rows[int(k * WF_N / 5)][0], wf_rows[int(k * WF_N / 5)][1] + 0.0008) for k in range(6)]
    streaks.append({'ob': ob, 'path': path})
    ob.location = G(*path[0])
flat_ellipse('WaterfallPool', 'Water', (WFX, 0.0244, -0.266), 0.034, 0.016, 0.0008, seg=20)
pool_stones = Part('PoolStones', 'Stone', smooth=True)
for i in range(10):
    a = math.radians(-15 + i * 23)
    pool_stones.sphere((WFX + 0.037 * math.cos(a), FLOOR + 0.003, -0.266 + 0.019 * math.sin(a)), 0.0055 + 0.0015 * (i % 3) / 2, seg=7, rings=5, scale=(1.0, 0.65, 0.9))
pool_stones.done()
foam = []
for i, (dx, dz, r) in enumerate(((0.0, 0.006, 0.007), (-0.008, 0.009, 0.005), (0.008, 0.008, 0.005))):
    ob = Part(f'WaterFoam-{i}', 'Snow', smooth=True).sphere((0, 0, 0), r, seg=8, rings=5, scale=(1.0, 0.5, 0.8)).done()
    ob.location = G(WFX + dx, FLOOR + 0.004, wf_rows[-1][1] + dz)
    foam.append(ob)

# Two fence posts at the stage's back right are all that is left of the back fence (the pool took its place).
fence = Part('BackFence', 'PineDark')
fsnow = Part('BackFenceSnow', 'Snow')
for x in (0.24, 0.38):
    fence.boxb((x, FLOOR, -0.285), (0.008, 0.04, 0.008))
    fsnow.box((x, FLOOR + 0.042, -0.285), (0.01, 0.004, 0.01))
fence.done(); fsnow.done()

anchor('FloorTop', (0, FLOOR, 0))
anchor('BenchSpot', (0.235, FLOOR, 0.165))     # kept for compatibility; the queue stands outside the gate as now
# Table spots inside the cabin, for the layout file: three columns 14 cm apart (the window wall, the
# middle, the door side) and two rows at z ±0.09 either side of the room's axis. The window and door
# columns are tables for two (the window ones under the sockets), the middle one the long table for four
# (turned 90°, centred on the axis), so each aisle beside it is 4.2 cm. The rows sit 1 cm in from the
# sockets so the door column's back table clears a takeaway guest at the till (`TakeawaySpot`).
# Since the counter came forward the room runs z -0.115 .. 0.153; the rows sit either side of its middle (0.02),
# which is also the fireplace's, so the window pair frames the hearth and the long table lines up with it.
anchor('TableSpot-1', (-0.31, FLOOR, -0.05))
anchor('TableSpot-2', (-0.31, FLOOR, 0.09))
anchor('TableSpot-3', (-0.17, FLOOR, 0.02))
anchor('TableSpot-4', (-0.03, FLOOR, -0.05))
anchor('TableSpot-5', (-0.03, FLOOR, 0.09))

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
# Each puff leaves the pot small, rises 4.2 cm leaning downwind while it swells, then shrinks to nothing
# at the top (a glTF clip cannot fade the alpha, so it vanishes by scale) and is born again in the pot:
# it never hangs in the air and never sinks back down. Five puffs a fifth of a loop apart overlap into
# one column that is narrow at the pot, full in the middle and thins away at the top.
SMOKE_PATH = ((1, 0.000, 0.000, 0.55), (12, 0.010, 0.002, 1.05), (28, 0.024, 0.006, 1.35), (40, 0.035, 0.010, 1.0), (48, 0.042, 0.013, 0.0))
for i, s in enumerate(smoke_objs):
    base = G(*SMOKE_AT)
    wob = 0.0015 * (1 if i % 2 else -1)            # a little sideways wobble so the column is not a rod
    for f, rise, dx, sc_ in SMOKE_PATH + ((49,) + SMOKE_PATH[0][1:],):
        s.location = base + Vector((dx + (wob if 0 < rise < 0.04 else 0), 0, rise)); s.scale = (sc_,) * 3
        s.keyframe_insert('location', frame=f); s.keyframe_insert('scale', frame=f)
    # Each puff cycles with a phase offset by shifting its curves; the jump from the top back to the
    # pot happens in the one frame the puff has no size (48 → 49 holds, then snaps).
    for fc in fcurves_of(s):
        for kp in fc.keyframe_points:
            kp.interpolation = 'CONSTANT' if round(kp.co.x) == 48 else 'LINEAR'
            kp.co.x += i * 48 / SMOKE_N
        fc.modifiers.new('CYCLES')
for i, f in enumerate(flames + hearth_flames):
    for frame, sy in ((1, 1.0), (9, 1.12), (17, 0.92), (29, 1.08), (41, 0.96), (49, 1.0)):
        f.scale = (1.0 + 0.04 * ((i + frame) % 3 - 1), 1.0 + 0.04 * ((i + frame) % 2), sy)
        f.keyframe_insert('scale', frame=frame)
    for fc in fcurves_of(f):
        for kp in fc.keyframe_points:
            kp.co.x += i * 5
        fc.modifiers.new('CYCLES')
# One action named Ambient on the root is what the game plays; the glTF exporter gathers every object's action into
# one animation per action name, so name them all Ambient.
for i, st in enumerate(streaks):
    for frame, pt, sc_ in zip((1, 10, 20, 30, 40, 49), st['path'], (0.2, 1.0, 1.0, 1.0, 1.0, 0.2)):
        st['ob'].location = G(*pt); st['ob'].scale = (1, 1, sc_)
        st['ob'].keyframe_insert('location', frame=frame); st['ob'].keyframe_insert('scale', frame=frame)
    for fc in fcurves_of(st['ob']):
        for kp in fc.keyframe_points:
            kp.co.x += i * 12
            kp.interpolation = 'LINEAR'
        fc.modifiers.new('CYCLES')
for i, fo in enumerate(foam):
    for frame, k in ((1, 1.0), (13, 1.25), (25, 0.9), (37, 1.18), (49, 1.0)):
        fo.scale = (k, k, 1.0 + (k - 1) * 0.6)
        fo.keyframe_insert('scale', frame=frame)
    for fc in fcurves_of(fo):
        for kp in fc.keyframe_points:
            kp.co.x += i * 7
        fc.modifiers.new('CYCLES')
for ob in smoke_objs + flames + hearth_flames + [st['ob'] for st in streaks] + foam:
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
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_yup=True, export_extras=True, export_animations=True, export_apply=True, export_animation_mode='SCENE',
                          export_image_format='JPEG', export_image_quality=90)   # JPEG textures: a third of the PNGs' download, no visible loss at this size
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
shot('upper-deck', (0.10, 0.36, 0.30), (-0.17, 0.16, -0.21), lens=45)
shot('stairs', (0.30, 0.22, 0.16), (0.07, 0.09, -0.09), lens=50)
shot('fireplace', (-0.22, 0.16, 0.34), (-0.39, 0.06, 0.12), lens=55)
shot('backdrop', (0.05, 0.30, 0.62), (0.05, 0.15, -0.29), lens=40)
shot('exit-walk', (0.16, 0.24, 0.58), (0.04, 0.04, 0.16), lens=50)
shot('door', (0.26, 0.20, 0.30), (0.03, 0.06, 0.03), lens=50)
shot('bear', (0.36, 0.13, 0.05), (0.31, 0.06, -0.20), lens=55)
shot('rooftop-sign', (-0.17, 0.30, 0.40), (-0.17, 0.22, -0.27), lens=45)
