"""The winter café's build kit: the palette and the primitive helpers shared by the shell and the
furniture scripts (exec'd into each: `exec(open('kit.py').read())`), all in the game's space.

Game space: +Y up, the player toward +Z, the entrance on +X, metres. `G()` turns a game-space
point into Blender's (z up, -y toward the player); the glTF export (`export_yup=True`) swaps back.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

sc = bpy.data.scenes[0]

# ------------------------------------------------------------------ the palette
MATS = {}
def mat(name, rgb, rough=0.85, emit=None, strength=0.0, alpha=None, metallic=0.0):
    m = bpy.data.materials.get(name)
    if m is None:
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
mat('Maple', (0.90, 0.74, 0.50), 0.7)
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
mat('Plaid', (0.62, 0.16, 0.18), 0.9)
mat('Cushion', (0.78, 0.20, 0.22), 0.9)
mat('Mug', (0.97, 0.95, 0.90), 0.6)
mat('Coffee', (0.30, 0.18, 0.10), 0.5)

# ------------------------------------------------------------------ helpers
def G(x, y, z):
    """Game space (x right, y up, z toward the player) to Blender (z up, -y toward the player)."""
    return Vector((x, -z, y))

def new_obj(name, bm, material, parent, shade_smooth=False):
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
    """A mesh being built out of primitives (one material), in game space; `done(parent)` makes the object."""
    def __init__(self, name, material, smooth=False):
        self.name, self.material, self.smooth = name, material, smooth
        self.bm = bmesh.new()
    def _xform(self, geom, at, scale, rot_y=0.0, rot_x=0.0, rot_z=0.0):
        M = Matrix.Translation(G(*at)) @ Matrix.Rotation(-math.radians(rot_y), 4, 'Z') @ Matrix.Rotation(math.radians(rot_x), 4, 'X') @ Matrix.Rotation(math.radians(rot_z), 4, 'Y') @ Matrix.Diagonal(Vector((scale[0], scale[2], scale[1], 1)))
        bmesh.ops.transform(self.bm, matrix=M, verts=geom['verts'])
    def box(self, at, size, rot_y=0.0, rot_x=0.0, rot_z=0.0):
        """A box centred at `at` (game space), `size` (x, y, z) in metres; rot_y turns it about up (degrees)."""
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
        M = Matrix.Translation(G(*at)) @ Matrix.Rotation(-math.radians(rot_y), 4, 'Z') @ Matrix.Rotation(math.radians(rx), 4, 'X') @ Matrix.Rotation(math.radians(rz), 4, 'Y')
        bmesh.ops.transform(self.bm, matrix=M, verts=g['verts'])
        return self
    def cone(self, at, r, h, seg=8):
        """A cone standing on `at` (its base's centre), pointing up (a negative h hangs down)."""
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
    def done(self, parent):
        return new_obj(self.name, self.bm, self.material, parent, self.smooth)

def anchor(name, at, parent, rot_y=0.0):
    """An empty the game reads (a seat, a meal spot, a station), at `at` in game space, turned rot_y about up."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.01
    e.empty_display_type = 'PLAIN_AXES'
    e.location = G(*at)
    e.rotation_euler = (0, 0, -math.radians(rot_y))
    e.parent = parent
    sc.collection.objects.link(e)
    return e

def text_mesh(name, body, size, material, at, parent, rot_y=0.0, rot_x=0.0, extrude=0.0006, align='CENTER'):
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
    o.matrix_world = Matrix.Translation(G(*at)) @ Matrix.Rotation(-math.radians(rot_y), 4, 'Z') @ Matrix.Rotation(math.radians(90 + rot_x), 4, 'X')
    o.parent = parent
    o.matrix_parent_inverse = parent.matrix_world.inverted()
    sc.collection.objects.link(o)
    return o

def fcurves_of(o):
    """An object's action f-curves, on Blender 4 (flat) or 5 (layered)."""
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

def select_tree(root):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for ch in root.children_recursive:
        ch.select_set(True)
    bpy.context.view_layer.objects.active = root

def export_glb(root, path, animations=False):
    select_tree(root)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_extras=True, export_animations=animations, export_apply=True, export_animation_mode='SCENE')
    meshes = [o for o in root.children_recursive if o.type == 'MESH']
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    print(f'EXPORTED {path} meshes={len(meshes)} tris~{tris}')
    return tris

def tri_count(root):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in root.children_recursive if o.type == 'MESH')

def daylight():
    """A bright winter sky and sun for the previews, an honest exposure."""
    w = bpy.data.worlds.new('W'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.78, 0.88, 0.98, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.75
    sc.world = w
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 2.6
    sun.data.angle = math.radians(4)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); cam.data.lens = 50
    sc.collection.objects.link(cam); sc.camera = cam
    try:
        sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        sc.render.engine = 'BLENDER_EEVEE'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.film_transparent = False
    return cam, sun

def shot(cam, path, eye, target, lens=50, size=(1400, 900)):
    """Render from `eye` looking at `target` (game space) to `path`."""
    sc.render.resolution_x, sc.render.resolution_y = size
    cam.data.lens = lens
    cam.location = G(*eye)
    d = (G(*target) - cam.location)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('RENDERED', path)
