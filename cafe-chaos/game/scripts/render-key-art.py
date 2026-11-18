"""Key art for the store: the game's own 3D models, rendered on a real-looking table (docs/STORE-ART.md).

Runs in a background Blender (nothing lives in a .blend):

  Blender --background --factory-startup --python scripts/render-key-art.py -- <out-dir> <shot> [--fast]

Shots:
  jp-landscape   the Japanese café (the lead), the cream hand pinching a mochi above a glowing seat, 16:9
  ca-square      the Canadian café, the hand pinching a snowbit above a glowing seat, 1:1

Every model comes from public/models (the shipped files), placed as the game places them
(src/cafe/layout.ts, src/cafe/canada-layout.ts). Guests are tinted as the game tints them
(src/guests/cast.ts). The hand is the game's cream hand (models/20-hands), its finger joints
posed into a pinch here. Renders have no title: the logo is added when the covers are composed.
"""
import bpy, sys, os, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'source', 'renders')
SHOT = argv[1] if len(argv) > 1 else 'jp-landscape'
FAST = '--fast' in argv
os.makedirs(OUT, exist_ok=True)
MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'models')

sc = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)


def G(x, y, z):
    """Game space (+Y up, the player toward +Z) to Blender's (+Z up)."""
    return Vector((x, -z, y))


def base(name):
    return name.split('.')[0]


def imp(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    if len(roots) == 1:
        return roots[0], new
    r = bpy.data.objects.new(name + '-root', None)
    sc.collection.objects.link(r)
    for o in roots:
        o.parent = r
    return r, new + [r]


def place(name, x, z, yaw=0.0, y=0.0):
    r, new = imp(name)
    r.matrix_world = Matrix.Translation(G(x, y, z)) @ Matrix.Rotation(math.radians(yaw), 4, 'Z')
    return r, new


def find(objs, name):
    return [o for o in objs if base(o.name) == name]


def hide_tree(o):
    for c in [o] + list(o.children_recursive):
        c.hide_render = True; c.hide_viewport = True


def still(objs):
    """No clip plays: the rest pose (the seated rig's rest pose is the sitting pose)."""
    for o in objs:
        if o.animation_data:
            o.animation_data.action = None
            for t in o.animation_data.nla_tracks:
                t.mute = True


def play(objs, clip, frame):
    """Pose the rig by one clip at one frame (the importer keeps every clip as an NLA track)."""
    for o in objs:
        ad = o.animation_data
        if ad:
            ad.action = None
            for t in ad.nla_tracks:
                t.mute = base(t.name) != clip
    sc.frame_set(frame)


FACES = ('Eyes', 'Mouth', 'WidePupils')


def face(objs, eyes='EyesOpen', mouth='MouthSmile'):
    for o in objs:
        if o.type == 'MESH':
            n = base(o.name).split('-', 1)[-1]
            if n.startswith(FACES) and n not in (eyes, mouth):
                o.hide_render = True; o.hide_viewport = True


def tint(objs, rgb):
    """The game multiplies the near-white skin by one pastel (cast.ts TINTS); a copy of the material per guest."""
    if rgb is None:
        return
    done = {}
    for o in objs:
        if o.type != 'MESH':
            continue
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.name.startswith('GuestSkin'):
                continue
            if m.name not in done:
                c = m.copy()
                nt = c.node_tree
                bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
                link = next((l for l in nt.links if l.to_socket == bsdf.inputs['Base Color']), None)
                mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
                mul.inputs['Factor'].default_value = 1.0
                mul.inputs[7].default_value = (*rgb, 1.0)
                if link:
                    nt.links.new(link.from_socket, mul.inputs[6]); nt.links.remove(link)
                else:
                    mul.inputs[6].default_value = bsdf.inputs['Base Color'].default_value
                nt.links.new(mul.outputs[2], bsdf.inputs['Base Color'])
                done[m.name] = c
            slot.material = done[m.name]


def hexrgb(h):
    """sRGB hex to the linear colour Blender's nodes take."""
    def lin(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin((h >> 16) & 255), lin((h >> 8) & 255), lin(h & 255))


TINTS = {'plain': None, 'sakura': hexrgb(0xfaa8c2), 'ramune': hexrgb(0x9eccfa), 'matcha': hexrgb(0xb3e09e),
         'yuzu': hexrgb(0xf7e39a), 'lavender': hexrgb(0xcfb8f0), 'peach': hexrgb(0xfbc8a6)}


def seat_guest(kind, seat, tint_name='plain', happy=False):
    r, new = imp('guest-' + kind)
    still(new)
    for o in find(new, 'Standing'):
        hide_tree(o)
    bpy.context.view_layer.update()
    r.matrix_world = seat.matrix_world.copy()
    tint(new, TINTS.get(tint_name))
    face(new, 'EyesHappy' if happy else 'EyesOpen', 'MouthOpen' if happy else 'MouthSmile')
    return r, new


def seats_of(objs):
    return sorted([o for o in objs if base(o.name).startswith('Seat-')], key=lambda o: base(o.name))


def meal_on(objs, n):
    for m in objs:
        if base(m.name) == f'Meal-{n}':
            r, new = imp('meal')
            bpy.context.view_layer.update()
            r.matrix_world = m.matrix_world.copy()


def glow_disc(at, radius=0.013, color=(0.55, 0.32, 1.0), strength=3.5):
    """The seat the carried guest will land on glows a soft violet (the game's seat glow)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=0.0012, location=at + Vector((0, 0, 0.003)))
    print('GLOW AT', tuple(round(v, 3) for v in at))
    d = bpy.context.active_object
    m = bpy.data.materials.new('SeatGlow'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Emission Color'].default_value = (*color, 1)
    b.inputs['Emission Strength'].default_value = strength
    d.data.materials.append(m)
    return d


# ------------------------------------------------------------------ the hand, posed into a pinch
FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger']
CHAIN = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip']
CURL = {'index-finger': (0, -30, -45, -30), 'middle-finger': (0, -75, -85, -60),
        'ring-finger': (0, -80, -85, -60), 'pinky-finger': (0, -85, -85, -55)}


def pinch_hand():
    """The cream hand with the index curled and the thumb tip meeting it. Returns (root, pinch point in root space).

    Each joint node sits at its joint with the bone along +Y and the back of the hand along +Z
    (the WebXR joint frame after the glTF import); the fingers curl about their own X axis."""
    r, new = imp('cafe-hand-right')
    j = {base(o.name): o for o in new}
    for o in new:
        o.rotation_mode = 'QUATERNION'
    rest = {n: (o.location.copy(), o.rotation_quaternion.copy()) for n, o in j.items()}
    for f in FINGERS:
        names = [f'{f}-{c}' for c in CHAIN]
        pos = rest[names[0]][0].copy()
        cum = 0.0
        for i, n in enumerate(names):
            loc0, q0 = rest[n]
            if i < 4:
                cum += CURL[f][i]
            q = q0 @ Matrix.Rotation(math.radians(cum), 4, 'X').to_quaternion()
            j[n].location = pos; j[n].rotation_quaternion = q
            if i < 4:
                seg = (rest[names[i + 1]][0] - loc0).length
                pos = pos + q @ Vector((0, seg, 0))
    tip_i = j['index-finger-tip'].location.copy() + j['index-finger-tip'].rotation_quaternion @ Vector((0, 0.010, 0))
    # The thumb: from its metacarpal to a point just under the index tip, bowed a little toward the back of the hand.
    tn = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip']
    p0 = rest[tn[0]][0]
    target = tip_i + Vector((0.004, 0.0, -0.006))
    lens = [(rest[tn[i + 1]][0] - rest[tn[i]][0]).length for i in range(3)] + [0.010]
    total = sum(lens[:3]) + lens[3]
    span = target - p0
    bow = span.cross(Vector((0, 0, 1))).normalized() * 0.008
    pts, acc = [], 0.0
    for i in range(4):
        t = acc / total
        pts.append(p0 + span * t + bow * math.sin(math.pi * t))
        acc += lens[i]
    pts.append(target)
    for i, n in enumerate(tn):
        d = (pts[i + 1] - pts[i]).normalized()
        j[n].location = pts[i]
        j[n].rotation_quaternion = d.to_track_quat('Y', 'Z')
    pinch = (tip_i + target) / 2
    return r, pinch, new


def place_hand(target_world, finger_dir, back_dir):
    """Put the pinch point on target_world with the fingers pointing along finger_dir and the back of the
    hand turned toward back_dir (both in world space): the hand's own frame is fingers +Y, back +Z."""
    r, pinch, new = pinch_hand()
    Y = Vector(finger_dir).normalized()
    Z = (Vector(back_dir) - Y * Vector(back_dir).dot(Y)).normalized()
    X = Y.cross(Z)
    R = Matrix((X, Y, Z)).transposed().to_4x4()
    r.matrix_world = Matrix.Translation(target_world) @ R @ Matrix.Translation(-pinch)
    return r, new


def lifted_guest(kind, pinch_world, tint_name):
    """A guest held by the top of its head, its feet kicking (the Lifted clip), so its HeadTop meets the pinch."""
    r, new = imp('guest-' + kind)
    play(new, 'Lifted', 6)
    for o in find(new, 'Seated'):
        hide_tree(o)
    tint(new, TINTS.get(tint_name))
    face(new, 'EyesHappy', 'MouthOpen')
    bpy.context.view_layer.update()
    head = next(o for o in new if base(o.name) == 'St-HeadTop').matrix_world.translation
    r.location = r.location + (pinch_world - head) + Vector((0, 0, -0.002))
    return r, new
    return r, new


# ------------------------------------------------------------------ the room: a real table at home
def room(table_w=1.7, table_d=1.1):
    """A warm oak tabletop under the plate, a wall far behind (soft in the depth of field), a mug and a plant pot."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.05, -0.02))
    t = bpy.context.active_object; t.scale = (table_w, table_d, 0.04); t.name = 'Tabletop'
    m = bpy.data.materials.new('Oak'); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = 0.45
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1.0, 12.0, 1.0)
    wave = nt.nodes.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'; wave.bands_direction = 'Y'
    wave.inputs['Scale'].default_value = 1.4; wave.inputs['Distortion'].default_value = 12.0; wave.inputs['Detail'].default_value = 3.0
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 40.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.16, 0.075, 0.03, 1); ramp.color_ramp.elements[1].color = (0.34, 0.17, 0.07, 1)
    mix = nt.nodes.new('ShaderNodeMath'); mix.operation = 'ADD'
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], wave.inputs['Vector'])
    nt.links.new(wave.outputs['Fac'], mix.inputs[0]); nt.links.new(noise.outputs['Fac'], mix.inputs[1])
    nt.links.new(mix.outputs['Value'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    t.data.materials.append(m)
    # the wall and a window glow behind, far enough to blur
    bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 2.6, 1.5), rotation=(math.radians(90), 0, 0))
    w = bpy.context.active_object; w.name = 'Wall'
    # an evenly lit warm wall (an emission, so no light leaves a hard edge on it), lighter toward the top
    wm = bpy.data.materials.new('Wall'); wm.use_nodes = True; nt = wm.node_tree
    for n in list(nt.nodes):
        if n.type == 'BSDF_PRINCIPLED': nt.nodes.remove(n)
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 2.3   # through the -0.6 exposure: reads as the brand cream #e8dfcf
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.86, 0.66, 0.42, 1); ramp.color_ramp.elements[1].color = (0.90, 0.75, 0.53, 1)
    nt.links.new(tc.outputs['Generated'], sep.inputs['Vector']); nt.links.new(sep.outputs['Y'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
    w.data.materials.append(wm)
    # a mug at the table's back left, a little plant pot at the back right
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=0.042, depth=0.095, location=(-0.62, 0.38, 0.0475))
    mug = bpy.context.active_object
    mm = bpy.data.materials.new('Mug'); mm.use_nodes = True
    mm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.27, 0.15, 1)
    mm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.3
    mug.data.materials.append(mm)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.026, minor_radius=0.007, location=(-0.665, 0.38, 0.05), rotation=(math.radians(90), 0, 0))
    bpy.context.active_object.data.materials.append(mm)
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=0.05, depth=0.09, location=(0.66, 0.40, 0.045))
    pot = bpy.context.active_object
    pm = bpy.data.materials.new('Pot'); pm.use_nodes = True
    pm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.62, 0.30, 0.18, 1)
    pot.data.materials.append(pm)
    for k in range(7):
        a = k * 2 * math.pi / 7
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.035, location=(0.66 + 0.03 * math.cos(a), 0.40 + 0.03 * math.sin(a), 0.12 + 0.02 * (k % 3)))
        lf = bpy.context.active_object; lf.scale = (1, 1, 1.6)
        lm = bpy.data.materials.get('Leaf') or bpy.data.materials.new('Leaf'); lm.use_nodes = True
        lm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.10, 0.28, 0.10, 1)
        lf.data.materials.append(lm)


def lights_and_world():
    w = bpy.data.worlds.new('W'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.95, 0.86, 0.74, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.55
    sc.world = w
    key = bpy.data.lights.new('Key', 'AREA'); key.energy = 260; key.size = 1.2; key.color = (1.0, 0.90, 0.78)
    k = bpy.data.objects.new('Key', key); sc.collection.objects.link(k)
    k.location = (-1.1, 0.7, 1.4); k.rotation_euler = (math.radians(42), 0, math.radians(-125))
    fill = bpy.data.lights.new('Fill', 'AREA'); fill.energy = 90; fill.size = 2.0; fill.color = (0.85, 0.90, 1.0)
    f = bpy.data.objects.new('Fill', fill); sc.collection.objects.link(f)
    f.location = (1.2, -1.2, 1.0); f.rotation_euler = (math.radians(55), 0, math.radians(45))
    rim = bpy.data.lights.new('Rim', 'AREA'); rim.energy = 120; rim.size = 0.8; rim.color = (1.0, 0.82, 0.62)
    rr = bpy.data.objects.new('Rim', rim); sc.collection.objects.link(rr)
    rr.location = (0.4, 0.75, 0.55); rr.rotation_euler = (math.radians(-70), 0, math.radians(15))   # behind the café, low: no hard edge on the wall


def camera(eye, target, lens, focus, fstop, res):
    cam = bpy.data.cameras.new('Cam'); cam.lens = lens
    cam.dof.use_dof = True; cam.dof.aperture_fstop = fstop
    c = bpy.data.objects.new('Cam', cam); sc.collection.objects.link(c)
    c.location = eye
    c.rotation_euler = (target - eye).to_track_quat('-Z', 'Y').to_euler()
    cam.dof.focus_distance = (focus - eye).length
    sc.camera = c
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 50 if FAST else 100


# ------------------------------------------------------------------ the cafés
FLOOR = 0.024   # the café floor's top, where the game stands furniture (layout.ts FLOOR_TOP_M)


def hand_for(pinch, eye, fd=(-0.60, 0.15, -0.80)):
    """The hand reaching in from the right, its thumb side to the camera so the pinch reads as an O."""
    fd = Vector(fd)
    view = eye - pinch
    place_hand(pinch, finger_dir=fd, back_dir=view.normalized().cross(fd.normalized()) + Vector((0, 0, 0.35)))


def staff(name, spot, clip, frame, extra=None):
    r, new = imp(name)
    play(new, clip, frame)
    bpy.context.view_layer.update()
    r.matrix_world = spot.matrix_world.copy() if extra is None else spot.matrix_world @ extra
    return r, new


def jp_cafe(eye):
    """The Japanese garden café as the game opens it (layout.ts OPENING_LAYOUT), ten guests, the hand carrying an eleventh."""
    place('cafe-shell', 0, 0)
    cols = [-0.26, -0.13, 0, 0.13, 0.26]; back, front = -0.135, 0.025
    pieces = []
    for i in range(3):
        pieces.append(place('table-4', cols[i], back, y=FLOOR))
    for i in (3, 4):
        pieces.append(place('table-2', cols[i], back, y=FLOOR))
    for x in cols:
        pieces.append(place('table-2', x, front, y=FLOOR))
    pieces.append(place('bar-2', -0.3, 0.105, 90, y=FLOOR))
    pieces.append(place('quiet-corner', 0.24, -0.215, y=FLOOR))
    bpy.context.view_layer.update()
    who = [  # (piece index, seat number, species, tint, happy)
        (0, 1, 'onigiri', 'matcha', True), (0, 3, 'tofu', 'lavender', False),
        (1, 2, 'mochi', 'sakura', True), (1, 4, 'onigiri', 'yuzu', False), (2, 1, 'tofu', 'ramune', True),
        (3, 1, 'mochi', 'peach', False), (5, 2, 'onigiri', 'plain', True), (6, 1, 'tofu', 'yuzu', True),
        (8, 1, 'mochi', 'ramune', False), (9, 1, 'onigiri', 'sakura', True),
    ]
    for pi, sn, kind, tn, happy in who:
        seat_guest(kind, seats_of(pieces[pi][1])[sn - 1], tn, happy)
        meal_on(pieces[pi][1], sn)
    target_seat = seats_of(pieces[8][1])[1]          # front row, the table right of centre: the free seat
    glow_disc(target_seat.matrix_world.translation)
    pinch = target_seat.matrix_world.translation + Vector((0.0, 0.0, 0.135))
    lifted_guest('mochi', pinch, 'sakura')
    hand_for(pinch, eye)
    spots = sorted([o for o in bpy.data.objects if base(o.name).startswith('BaristaSpot-')], key=lambda o: o.name)
    for i, spot in enumerate(spots[:2]):
        staff(['barista-sora', 'barista-momo'][i], spot, 'Work', 8 + 10 * i)
    return pinch


def wear(guest_new, item, attach, rig='Se-'):
    """Dress a guest as the game does: the item's origin is its attach point (accessories-canada.glb)."""
    r, new = imp('accessories-canada')
    keep = next(o for o in new if base(o.name) == item)
    for o in new:
        if o is not keep and o not in keep.children_recursive:
            bpy.data.objects.remove(o, do_unlink=True)
    target = next(o for o in guest_new if base(o.name) == rig + attach)
    keep.parent = target; keep.matrix_parent_inverse.identity()
    keep.location = (0, 0, 0); keep.rotation_mode = 'QUATERNION'; keep.rotation_quaternion = (1, 0, 0, 0); keep.scale = (1, 1, 1)


ATTACH = {'Toque': 'HeadTop', 'Earmuffs': 'HeadTop', 'Scarf': 'Neck', 'Parka': 'Chest'}


def ca_cafe(eye):
    """The Canadian café as the layout places it (canada-layout.ts): guests in winter clothes on both floors, round
    the fire and on the dock, the fiddler on the stage, the pianist on the roof, the hand carrying a snowbit."""
    root, cafe = place('cafe-canada', 0, 0)
    bpy.context.view_layer.update()
    A = {base(o.name): o for o in cafe if o.type == 'EMPTY'}
    rot90 = Matrix.Rotation(math.radians(90), 4, 'Z')

    def at(model, spot, extra=None):
        r, new = imp(model)
        bpy.context.view_layer.update()
        r.matrix_world = A[spot].matrix_world if extra is None else A[spot].matrix_world @ extra
        bpy.context.view_layer.update()
        return new
    P = {s: at('table-ca-2', s) for s in ('TableSpot-1', 'TableSpot-2', 'TableSpot-4', 'TableSpot-5')}
    P['TableSpot-3'] = at('table-ca-4', 'TableSpot-3', rot90)
    for s in ('PatioSpot-1', 'PatioSpot-2', 'UpperSpot-1', 'UpperSpot-2'):
        P[s] = at('patio-table', s)
    P['DockSpot'] = at('dock-bench', 'DockSpot')
    for s in ('FireSpot-1', 'FireSpot-2', 'FireSpot-3'):
        P[s] = at('fire-chair', s)
    who = [  # (spot, seat, species, clothes, happy)
        ('TableSpot-1', 1, 'snowbit', ['Toque', 'Scarf'], True), ('TableSpot-3', 2, 'nanaimo', ['Toque', 'Parka'], False),
        ('TableSpot-3', 3, 'beavertail', ['Earmuffs'], True), ('TableSpot-4', 1, 'doubledouble', ['Earmuffs', 'Scarf'], True),
        ('TableSpot-5', 2, 'buttertart', ['Toque'], False), ('PatioSpot-1', 1, 'beavertail', ['Toque', 'Scarf'], True),
        ('PatioSpot-2', 2, 'nanaimo', ['Earmuffs'], False), ('DockSpot', 1, 'doubledouble', ['Parka'], True),
        ('FireSpot-1', 1, 'buttertart', ['Scarf'], True), ('FireSpot-2', 1, 'snowbit', ['Earmuffs', 'Parka'], True),
        ('FireSpot-3', 1, 'beavertail', ['Toque'], False), ('UpperSpot-1', 1, 'nanaimo', ['Scarf'], True),
        ('UpperSpot-2', 2, 'snowbit', ['Toque'], True),
    ]
    for spot, sn, kind, clothes, happy in who:
        r, new = seat_guest(kind, seats_of(P[spot])[sn - 1], None, happy)
        for c in clothes:
            wear(new, f'{c}-{kind}', ATTACH[c])
    target_seat = seats_of(P['PatioSpot-1'])[1]       # the patio table nearest the player: the free seat
    glow_disc(target_seat.matrix_world.translation)
    pinch = target_seat.matrix_world.translation + Vector((0.0, 0.0, 0.135))
    r, new = lifted_guest('snowbit', pinch, None)
    wear(new, 'Toque-snowbit', 'HeadTop', rig='St-')
    hand_for(pinch, eye)
    for i, spot in enumerate(('BaristaSpot-1', 'BaristaSpot-2', 'BaristaSpot-3')):
        staff(['barista-maple', 'barista-aspen', 'barista-rowan'][i], A[spot], 'Work', 6 + 9 * i)
    staff('barista-fiddler', A['MusicianSpot'], 'Play', 10)
    staff('barista-pianist', A['PianoSpot'], 'PlayPiano', 10)
    return pinch


# ------------------------------------------------------------------ the shots: (café, eye, look-at, lens, f-stop, size)
SHOTS = {
    # Meta Landscape cover and Devpost (3:2 is cropped from it): close on the pinch, the title goes upper left.
    'jp-landscape': (jp_cafe, G(0.36, 0.36, 0.64), G(0.10, 0.10, -0.03), 40, 2.8, (2560, 1440)),
    # Meta Hero (10:3, title centred) and Mini landscape (3:1, cropped from it).
    'jp-hero': (jp_cafe, G(0.02, 0.40, 1.16), G(-0.06, 0.15, -0.03), 44, 4.0, (3000, 900)),   # the pinch lower right, clear of the centred title
    # Meta Square cover: the Canadian café, the Rockies behind, the title in the top third.
    'ca-square': (ca_cafe, G(0.40, 0.38, 0.66), G(0.08, 0.13, -0.03), 34, 3.2, (1440, 1440)),
    # Meta Portrait cover: taller, the rooftop deck and the mountains, the title in the bottom quarter.
    'ca-portrait': (ca_cafe, G(0.34, 0.44, 0.70), G(0.05, 0.15, -0.05), 30, 3.2, (1008, 1440)),
}
build, eye, look, lens, fstop, res = SHOTS[SHOT]
focus = build(eye)
room()
lights_and_world()
camera(eye=eye, target=look, lens=lens, focus=focus, fstop=fstop, res=res)

sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.eevee.taa_render_samples = 16 if FAST else 96
sc.view_settings.view_transform = 'AgX'
sc.view_settings.exposure = -0.6
sc.view_settings.look = 'AgX - Punchy' if 'AgX - Punchy' in [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['look'].enum_items] else 'None'
sc.render.film_transparent = False
sc.use_nodes = True
try:
    tree = sc.compositing_node_group if hasattr(sc, 'compositing_node_group') and sc.compositing_node_group else sc.node_tree
except AttributeError:
    tree = None
if tree is not None:
    rl = next((n for n in tree.nodes if n.type == 'R_LAYERS'), None) or tree.nodes.new('CompositorNodeRLayers')
    comp = next((n for n in tree.nodes if n.type in ('COMPOSITE', 'GROUP_OUTPUT')), None)
    glare = tree.nodes.new('CompositorNodeGlare')
    for attr, val in (('glare_type', 'FOG_GLOW'), ('threshold', 1.2), ('size', 7)):
        try: setattr(glare, attr, val)
        except Exception: pass
    if comp is not None:
        tree.links.new(rl.outputs['Image'], glare.inputs['Image'])
        tree.links.new(glare.outputs['Image'], comp.inputs[0])
sc.render.filepath = os.path.join(OUT, f'{SHOT}.png')
bpy.ops.render.render(write_still=True)
print('WROTE', sc.render.filepath)
