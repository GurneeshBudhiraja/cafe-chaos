"""The Café Chaos logo in 3D (brand direction A, "The Rush"): CAFÉ arched close over CHAOS, every
letter of CHAOS on its own tilt, all of them glazed (the chosen O is a plain glazed O; the donut, guest,
bean, steam and cup O's are kept as options with --o=).

Runs in a background Blender (nothing lives in a .blend):

  Blender --background --factory-startup --python scripts/build-logo-3d.py -- <out-dir> [--fast]

Writes logo-3d.png (transparent, for every use) and logo-3d-preview.png (on the moss field).
The letters are Fredoka (SIL OFL, assets/source/fonts), extruded with a round bevel: a glossy
lantern-gold glaze on the faces, timber on the sides, a thick ink outline (an inverted hull)
for the sticker look the brand uses. Colours are the game's own (src/ui/sketch.ts).
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'source', 'logo')
FAST = '--fast' in argv
# Which O: donut, guest (the game's snowbit), plain (a glazed O), bean (a coffee bean), steam or cup (rejected tries)
OVAR = next((x.split('=', 1)[1] for x in argv if x.startswith('--o=')), 'plain')   # the chosen O: a plain glazed O
os.makedirs(OUT, exist_ok=True)
FONT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'source', 'fonts', 'Fredoka[wdth,wght].ttf')

sc = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)


def srgb(h):
    def lin(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin((h >> 16) & 255), lin((h >> 8) & 255), lin(h & 255), 1.0)


# The game's palette (src/ui/sketch.ts)
LANTERN, TIMBER, INK, CREAM, MOSS, KOI, AMBER = 0xf0c987, 0x66462f, 0x16171d, 0xf2ebdd, 0x3d6136, 0x9a2208, 0xc98a1e


def mat(name, hexc, rough=0.35, coat=0.0, emit=0.0, backface=False):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(hexc)
    b.inputs['Roughness'].default_value = rough
    if coat:
        b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = 0.08
    if emit:
        b.inputs['Emission Color'].default_value = srgb(hexc); b.inputs['Emission Strength'].default_value = emit
    m.use_backface_culling = backface
    return m


GLAZE = mat('Glaze', LANTERN, 0.28, coat=0.7)
SIDE = mat('Side', TIMBER, 0.8)   # matte: inside the counters it stays a dark wall, not a bright bar
OUTLINE = mat('Outline', INK, 0.9, emit=0.0, backface=True)
CERAMIC = mat('Ceramic', CREAM, 0.2, coat=0.8)
COFFEE = mat('Coffee', 0x3b2418, 0.15, coat=0.5)
FONT_DATA = bpy.data.fonts.load(FONT)


def outline(o, t):
    """The ink outline: a flipped, slightly larger shell whose front faces are culled (the inverted hull)."""
    if OUTLINE.name not in [m.name for m in o.data.materials]:
        o.data.materials.append(OUTLINE)
    s = o.modifiers.new('Ink', 'SOLIDIFY')
    s.thickness = t; s.offset = 1.0; s.use_flip_normals = True; s.use_rim = False
    s.material_offset = len(o.data.materials) - 1


def letter(ch, size):
    cu = bpy.data.curves.new(f'L-{ch}', 'FONT')
    cu.body = ch; cu.font = FONT_DATA; cu.size = size
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    cu.offset = 0.008 * size           # the variable font loads at its regular weight: thicken a little (more makes the counters overlap)
    cu.extrude = 0.13 * size
    cu.bevel_depth = 0.055 * size; cu.bevel_resolution = 6   # the round bevel does most of the weight
    o = bpy.data.objects.new(f'L-{ch}', cu); sc.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.view_layer.objects:
        x.select_set(x is o)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.view_layer.objects.active
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005 * size)   # merge the seams the font's outlines leave
    bm.to_mesh(o.data); bm.free()
    o.data.materials.clear(); o.data.materials.append(GLAZE); o.data.materials.append(SIDE)
    for p in o.data.polygons:             # the glaze on the face (toward +Z, the viewer), timber on the sides
        p.material_index = 0 if p.normal.z > 0.55 else 1
    for p in o.data.polygons:
        p.use_smooth = True
    outline(o, 0.028 * size)
    return o


def width(o):
    xs = [(o.matrix_world @ Vector(c)).x for c in o.bound_box]
    return max(xs) - min(xs)


def place(o, x, y, rot_deg):
    o.matrix_world = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.radians(rot_deg), 4, 'Z')


def cup(h):
    """The O: a ceramic cup from the side, its mouth up (+Y in the logo's plane), a handle on the right, coffee inside,
    tipped over and spilling, with steam. h = its height."""
    parts = []
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=0.30 * h, radius2=0.42 * h, depth=0.78 * h)
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(-90), 3, 'X'))   # axis along +Y
    for v in bm.verts:                                                                     # a softer, rounder belly
        k = 1 + 0.10 * math.sin(math.pi * (v.co.y / (0.78 * h) + 0.5))
        v.co.x *= k; v.co.z *= k
    me = bpy.data.meshes.new('Cup'); bm.to_mesh(me); bm.free()
    body = bpy.data.objects.new('Cup', me); sc.collection.objects.link(body)
    body.data.materials.append(CERAMIC)
    for p in body.data.polygons: p.use_smooth = True
    outline(body, 0.03 * h); parts.append(body)
    # the rim, a rounded lip
    bpy.ops.mesh.primitive_torus_add(major_radius=0.42 * h, minor_radius=0.035 * h, major_segments=48, minor_segments=12,
                                     location=(0, 0.39 * h, 0), rotation=(math.radians(90), 0, 0))
    rim = bpy.context.active_object; rim.data.materials.append(CERAMIC); outline(rim, 0.02 * h); parts.append(rim)
    # the coffee, a little below the rim
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.405 * h, depth=0.012 * h, location=(0, 0.396 * h, 0), rotation=(math.radians(90), 0, 0))   # just over the cup's top cap
    cof = bpy.context.active_object; cof.data.materials.append(COFFEE); parts.append(cof)
    # the handle on the right, its ring facing the viewer
    bpy.ops.mesh.primitive_torus_add(major_radius=0.17 * h, minor_radius=0.055 * h, major_segments=40, minor_segments=14,
                                     location=(0.47 * h, 0.02 * h, 0))
    han = bpy.context.active_object; han.scale = (1.0, 1.25, 1.0); han.data.materials.append(CERAMIC); outline(han, 0.02 * h); parts.append(han)
    for p in parts:
        p.data.polygons.foreach_set('use_smooth', [True] * len(p.data.polygons))
    return parts


def spill(origin, h, toward):
    """Coffee leaving the tipped cup: a tongue of coffee off the rim, then drops stretched along their flight."""
    out = []
    d = Vector(toward).normalized()
    side = Vector((-d.y, d.x, 0))
    ang = math.atan2(d.y, d.x)
    for t, r, s, stretch in ((0.10, 0.10, 0.00, 1.9), (0.34, 0.07, 0.07, 1.6), (0.52, 0.055, -0.06, 1.5), (0.68, 0.04, 0.10, 1.4), (0.80, 0.03, -0.03, 1.3)):
        p = Vector(origin) + d * (t * h * 1.5) + side * (s * h)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r * h, location=p, segments=24, ring_count=14)
        o = bpy.context.active_object
        o.scale = (stretch, 1.0, 0.75); o.rotation_euler = (0, 0, ang)
        o.data.materials.append(COFFEE); outline(o, 0.014 * h)
        for pl in o.data.polygons: pl.use_smooth = True
        out.append(o)
    return out


def steam(origin, h):
    """Two short curls of steam above the cup."""
    for k, dx in enumerate((-0.10, 0.12)):
        cu = bpy.data.curves.new(f'Steam{k}', 'CURVE'); cu.dimensions = '3D'
        sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
        pts = [(0, 0), (0.08, 0.14), (-0.04, 0.27)]
        for bp, (x, y) in zip(sp.bezier_points, pts):
            bp.co = Vector(origin) + Vector(((x + dx) * h, y * h, 0.05 * h))
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
        cu.bevel_depth = 0.03 * h; cu.bevel_resolution = 4; cu.use_fill_caps = True
        cu.taper_radius_mode = 'MULTIPLY'
        sp.bezier_points[0].radius = 0.6; sp.bezier_points[1].radius = 1.0; sp.bezier_points[2].radius = 0.35
        o = bpy.data.objects.new(f'Steam{k}', cu); sc.collection.objects.link(o)
        o.data.materials.append(CERAMIC)


def group(objs, name):
    e = bpy.data.objects.new(name, None); sc.collection.objects.link(e)
    for o in objs:
        o.parent = e
    return e


# ------------------------------------------------------------------ the O options
GOLD, ROAST = 0xe2a83a, 0x4e3020


def donut(h):
    """A glazed donut standing face-on: golden dough, chocolate icing with a drippy edge, sprinkles."""
    import random
    rnd = random.Random(7)
    parts = []
    bpy.ops.mesh.primitive_torus_add(major_radius=0.30 * h, minor_radius=0.175 * h, major_segments=64, minor_segments=24)
    d = bpy.context.active_object; d.data.materials.append(mat('Dough', GOLD, 0.55)); outline(d, 0.022 * h); parts.append(d)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.30 * h, minor_radius=0.186 * h, major_segments=192, minor_segments=64)   # fine, so the drip edge is smooth
    ic = bpy.context.active_object
    bm = bmesh.new(); bm.from_mesh(ic.data)
    def keep(v):
        th = math.atan2(v.co.y, v.co.x); outer = Vector((v.co.x, v.co.y, 0)).length > 0.30 * h
        edge = (0.085 + 0.045 * math.sin(6 * th) + 0.025 * math.sin(11 * th)) if outer else 0.02
        return v.co.z >= edge * h
    gone = [v for v in bm.verts if not keep(v)]
    bmesh.ops.delete(bm, geom=gone, context='VERTS'); bm.to_mesh(ic.data); bm.free()
    ic.data.materials.append(mat('Icing', TIMBER, 0.18, coat=0.9)); parts.append(ic)
    cols = [mat('SprCream', CREAM, 0.4), mat('SprKoi', KOI, 0.4), mat('SprMoss', MOSS, 0.4), mat('SprLantern', LANTERN, 0.4)]
    for i in range(22):
        th = rnd.uniform(0, 2 * math.pi); ph = rnd.uniform(0.75, 2.3)
        r = 0.30 * h + 0.188 * h * math.cos(ph)
        pos = Vector((r * math.cos(th), r * math.sin(th), 0.188 * h * math.sin(ph) + 0.004 * h))
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.016 * h, depth=0.07 * h, location=pos,
                                            rotation=(rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0, 3.1)))
        sp = bpy.context.active_object; sp.data.materials.append(cols[i % 4]); parts.append(sp)
    for p_ in parts:
        p_.data.polygons.foreach_set('use_smooth', [True] * len(p_.data.polygons))
    return parts


def bean(h):
    """A roasted coffee bean, face-on, its crease an S-curve."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=48, ring_count=32)
    b = bpy.context.active_object; b.scale = (0.36 * h, 0.48 * h, 0.22 * h)
    bpy.ops.object.transform_apply(scale=True)
    b.data.materials.append(mat('Bean', ROAST, 0.25, coat=0.7)); outline(b, 0.022 * h)
    b.data.polygons.foreach_set('use_smooth', [True] * len(b.data.polygons))
    cu = bpy.data.curves.new('Crease', 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
    for bp, (x, y) in zip(sp.bezier_points, ((0.02, -0.40), (-0.06, 0.0), (0.03, 0.40))):
        z = 0.22 * math.sqrt(max(0.0, 1 - (x / 0.36) ** 2 - (y / 0.48) ** 2))
        bp.co = Vector((x * h, y * h, z * h)); bp.handle_left_type = bp.handle_right_type = 'AUTO'
    cu.bevel_depth = 0.03 * h; cu.bevel_resolution = 4
    cr = bpy.data.objects.new('Crease', cu); sc.collection.objects.link(cr)
    cr.data.materials.append(mat('CreaseInk', 0x1f140d, 0.6))
    return [b, cr]


def guest_o(h):
    """The game's own snowbit guest (public/models/guest-snowbit.glb), standing, happy, as tall as the letters."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'models', 'guest-snowbit.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.animation_data:
            o.animation_data.action = None
            for t in o.animation_data.nla_tracks: t.mute = True
        n = o.name.split('.')[0]
        if n == 'Seated':
            for c in [o] + list(o.children_recursive): c.hide_render = True
        if o.type == 'MESH':
            part = n.split('-', 1)[-1]
            if part.startswith(('Eyes', 'Mouth', 'WidePupils')) and part not in ('EyesHappy', 'MouthOpen'):
                o.hide_render = True
    root = next(o for o in new if o.parent is None)
    root.rotation_mode = 'XYZ'; root.rotation_euler = (math.radians(-90), 0, 0)    # its front toward the viewer, up along +Y
    root.scale = (h / 0.064,) * 3
    return root


# ------------------------------------------------------------------ the lockup
TOP, BIG = 1.0, 1.42          # letter sizes: CAFÉ on the arch, CHAOS below
# CAFÉ on an arch: the letters set on a circle, each turned to follow it
arch_r = 3.2
cafe = [letter(c, TOP) for c in 'CAFÉ']
ws = [width(o) for o in cafe]
steps = [(ws[i] + ws[i + 1]) / 2 + 0.06 for i in range(3)]          # centre to centre, along the arc
s_at = [0.0]
for st in steps: s_at.append(s_at[-1] + st)
mid = s_at[-1] / 2
for o, sv in zip(cafe, s_at):
    a = math.degrees((sv - mid) / arch_r)
    place(o, arch_r * math.sin(math.radians(a)), arch_r * math.cos(math.radians(a)) - arch_r + 0.78, -a)   # CAFÉ sits close over CHAOS

# CHAOS below, each letter on its own tilt and bounce, the O a tipping cup
spec = [('C', -7, 0.00), ('H', 4, 0.06), ('A', -5, -0.03), ('O', -18, 0.04), ('S', 8, 0.02)]
gap = 0.05
items = []
for ch, rot, dy in spec:
    if ch == 'O' and OVAR == 'cup':
        parts = cup(BIG * 0.80)
        g = group(parts, 'CupO')
        for prt in parts:                     # lean the mouth toward the viewer so the coffee shows
            prt.matrix_world = Matrix.Rotation(math.radians(28), 4, 'X') @ prt.matrix_world
        items.append((g, BIG * 0.80 * 1.05, rot, dy, True))
    elif ch == 'O' and OVAR == 'donut':
        items.append((group(donut(BIG * 0.88), 'DonutO'), BIG * 0.88 * 0.97, 14, dy, False))
    elif ch == 'O' and OVAR == 'bean':
        items.append((group(bean(BIG * 0.95), 'BeanO'), BIG * 0.95 * 0.74, 24, dy, False))
    elif ch == 'O' and OVAR == 'guest':
        g = group([guest_o(BIG * 1.0)], 'GuestO')
        items.append((g, BIG * 0.72, -10, dy - 0.30, False))
    elif ch == 'O' and OVAR == 'plain':
        o = letter('O', BIG)
        items.append((o, width(o), -6, dy, False))
    elif ch == 'O' and OVAR == 'steam':
        o = letter('O', BIG)
        items.append((o, width(o), -6, dy, 'steam'))
    else:
        o = letter(ch, BIG)
        items.append((o, width(o), rot, dy, False))
total = sum(w for _, w, *_ in items) + gap * (len(items) - 1)
x = -total / 2
for obj, w, rot, dy, is_cup in items:
    cx = x + w / 2
    place(obj, cx, -0.62 + dy * BIG, rot)
    if is_cup is True:
        bpy.context.view_layer.update()
        steam(obj.matrix_world @ Vector((0.12, 0.52 * BIG * 0.8, 0)), BIG * 0.8)
    elif is_cup == 'steam':
        bpy.context.view_layer.update()
        steam(obj.matrix_world @ Vector((0.0, 0.40 * BIG, 0)), BIG * 1.5)
    x += w + gap

# ------------------------------------------------------------------ light, camera, render
bpy.context.view_layer.update()
key = bpy.data.lights.new('Key', 'AREA'); key.energy = 900; key.size = 4; key.color = (1.0, 0.95, 0.88)
k = bpy.data.objects.new('Key', key); sc.collection.objects.link(k); k.location = (-3.5, 3.5, 6.5)
k.rotation_euler = (Vector((0, 0, 0)) - k.location).to_track_quat('-Z', 'Y').to_euler()
fill = bpy.data.lights.new('Fill', 'AREA'); fill.energy = 300; fill.size = 6
f = bpy.data.objects.new('Fill', fill); sc.collection.objects.link(f); f.location = (4, -3, 5)
f.rotation_euler = (Vector((0, 0, 0)) - f.location).to_track_quat('-Z', 'Y').to_euler()
w = bpy.data.worlds.new('W'); w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.9, 0.86, 0.8, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
sc.world = w

cam = bpy.data.cameras.new('Cam'); cam.lens = 85
c = bpy.data.objects.new('Cam', cam); sc.collection.objects.link(c)
c.location = (0.0, -2.6, 13.0)                 # a little below centre: the timber sides show under the letters
c.rotation_euler = (Vector((0, 0.1, 0)) - c.location).to_track_quat('-Z', 'Y').to_euler()
sc.camera = c

sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.eevee.taa_render_samples = 16 if FAST else 128
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
sc.render.resolution_x, sc.render.resolution_y = 2400, 1500
sc.render.resolution_percentage = 50 if FAST else 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'

sc.render.film_transparent = True
sc.render.filepath = os.path.join(OUT, f'logo-3d-{OVAR}.png'); bpy.ops.render.render(write_still=True)

# the preview on the brand's moss field: a backdrop card far behind (it does not light the letters)
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -3))
bd = bpy.context.active_object
bm_ = bpy.data.materials.new('Moss'); bm_.use_nodes = True; nt = bm_.node_tree
for n in list(nt.nodes):
    if n.type == 'BSDF_PRINCIPLED': nt.nodes.remove(n)
em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = srgb(MOSS); em.inputs['Strength'].default_value = 1.0
nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
bd.data.materials.append(bm_)
sc.render.film_transparent = False; sc.render.image_settings.color_mode = 'RGB'
sc.render.filepath = os.path.join(OUT, f'logo-3d-{OVAR}-preview.png'); bpy.ops.render.render(write_still=True)
print('WROTE', OUT)
