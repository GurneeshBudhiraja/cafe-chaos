"""Build the Canadian café's furniture pieces and export each as its own glb, plus a group preview.

  Blender --background --factory-startup --python pieces_build.py -- <out-dir>

Every piece keeps the Japanese pieces' conventions (../START-HERE.md): units metres, +Y up, the
front toward +Z, the origin at the bottom centre; `Seat-N` empties at the seat top (1.6 cm up) with
their +Z toward the table (a guest copying the empty faces the table), `Meal-N` on the table top in
front of each seat (2.8 cm up), `TableTop` at the top's centre. The same sizes as `table-2` and
`table-4`, so the Japanese layout's spacing holds.

- table-ca-2: a square maple table on a pedestal, two slat-back chairs with red cushions.
- table-ca-4: a long maple table with a plaid-cushioned bench either side (four seats).
- patio-table: a red steel bistro table with snow on it and two red chairs.
- dock-bench: a pine bench for two facing the lake, snow on its back, a mug shelf on each arm.
- fire-chair: a red Muskoka chair with a log stump side table (three stand round the fire).
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'kit.py')).read())

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else os.path.join(HERE, 'out')
os.makedirs(os.path.join(OUT, 'previews'), exist_ok=True)
for o in list(sc.collection.all_objects):
    bpy.data.objects.remove(o, do_unlink=True)

SEAT_Y = 0.016      # the seat top the guests' seated pose sits on
TOP_Y = 0.028       # the table top
CM = 0.01

def root_of(name, x=0.0):
    r = bpy.data.objects.new(name, None)
    r.location = G(x, 0, 0)
    sc.collection.objects.link(r)
    return r

def chair(parent, tag, at, face_rot, material='Cushion', wood='Maple', slats=3):
    """A slat-back chair at `at` whose sitter faces `face_rot` (degrees about up, 0 = +Z); the back stands on the far side."""
    x, z = at
    # Its own frame: +Z is the way the sitter faces; parts placed in that frame and turned by face_rot.
    def P(dx, dz):
        a = math.radians(face_rot)
        # The sitter's +Z turned by face_rot about up (the same hand as Part.box's rot_y: +90 turns +Z to -X).
        return (x + dx * math.cos(a) - dz * math.sin(a), z + dx * math.sin(a) + dz * math.cos(a))
    w = Part(f'{tag}-Wood', wood)
    for dx, dz in ((-1.1, -1.1), (1.1, -1.1), (-1.1, 1.1), (1.1, 1.1)):
        px, pz = P(dx * CM, dz * CM)
        w.boxb((px, 0, pz), (0.3 * CM, 1.3 * CM, 0.3 * CM), rot_y=face_rot)
    px, pz = P(0, 0)
    w.box((px, 1.35 * CM, pz), (2.6 * CM, 0.3 * CM, 2.6 * CM), rot_y=face_rot)
    # The back: two posts and slats on the side away from the table (behind the sitter, -Z of its frame).
    for dx in (-1.1, 1.1):
        px, pz = P(dx * CM, -1.2 * CM)
        w.boxb((px, 1.3 * CM, pz), (0.3 * CM, 2.6 * CM, 0.3 * CM), rot_y=face_rot)
    for i in range(slats):
        px, pz = P(0, -1.2 * CM)
        w.box((px, (2.0 + i * 0.6) * CM, pz), (2.2 * CM, 0.25 * CM, 0.2 * CM), rot_y=face_rot)
    w.done(parent)
    px, pz = P(0, 0.05 * CM)
    Part(f'{tag}-Cushion', material).box((px, 1.5 * CM, pz), (2.3 * CM, 0.3 * CM, 2.2 * CM), rot_y=face_rot).done(parent)

def pedestal_table(parent, size, top_material='Maple'):
    Part('Top', top_material).box((0, TOP_Y - 0.25 * CM, 0), (size, 0.5 * CM, size)).done(parent)
    Part('TopEdge', 'PineDark').box((0, TOP_Y - 0.55 * CM, 0), (size * 0.92, 0.12 * CM, size * 0.92)).done(parent)
    Part('Pedestal', 'PineDark').boxb((0, 0.3 * CM, 0), (0.7 * CM, TOP_Y - 0.8 * CM, 0.7 * CM)).done(parent)
    Part('Foot', 'PineDark', smooth=True).cyl((0, 0.15 * CM, 0), size * 0.32, 0.3 * CM, seg=12).done(parent)

# ------------------------------------------------------------------ table-ca-2
T2 = root_of('table-ca-2', 0.0)
pedestal_table(T2, 4.2 * CM)
# A red-and-cream napkin holder at the centre.
Part('Napkins', 'Red').box((0, TOP_Y + 0.35 * CM, 0), (0.9 * CM, 0.7 * CM, 0.5 * CM)).done(T2)
Part('NapkinPaper', 'Cream').box((0, TOP_Y + 0.85 * CM, 0), (0.7 * CM, 0.3 * CM, 0.3 * CM)).done(T2)
chair(T2, 'ChairL', (-3.3 * CM, 0), -90)     # left chair, its sitter facing +X (the table)
chair(T2, 'ChairR', (3.3 * CM, 0), 90)       # right chair, facing -X
anchor('Seat-1', (-3.3 * CM, SEAT_Y, 0), T2, rot_y=-90)
anchor('Seat-2', (3.3 * CM, SEAT_Y, 0), T2, rot_y=90)
anchor('Meal-1', (-1.3 * CM, TOP_Y, 0), T2)
anchor('Meal-2', (1.3 * CM, TOP_Y, 0), T2)
anchor('TableTop', (0, TOP_Y, 0), T2)

# ------------------------------------------------------------------ table-ca-4
T4 = root_of('table-ca-4', 0.16)
Part('Top', 'Maple').box((0, TOP_Y - 0.25 * CM, 0), (7.0 * CM, 0.5 * CM, 3.4 * CM)).done(T4)
Part('TopEdge', 'PineDark').box((0, TOP_Y - 0.55 * CM, 0), (6.6 * CM, 0.12 * CM, 3.0 * CM)).done(T4)
legs = Part('Legs', 'PineDark')
for x in (-2.9 * CM, 2.9 * CM):
    legs.boxb((x, 0, 0), (0.5 * CM, TOP_Y - 0.5 * CM, 2.6 * CM))
legs.box((0, 0.5 * CM, 0), (5.8 * CM, 0.35 * CM, 0.5 * CM))
legs.done(T4)
for side, zc, face in (('Front', 3.6 * CM, 180), ('Back', -3.6 * CM, 0)):
    b = Part(f'Bench{side}', 'Pine')
    b.box((0, 1.35 * CM, zc), (7.0 * CM, 0.3 * CM, 2.4 * CM))
    for x in (-3.0 * CM, 3.0 * CM):
        b.boxb((x, 0, zc), (0.4 * CM, 1.2 * CM, 2.0 * CM))
    # The back rest on the outer side.
    zb = zc + (1.4 * CM if side == 'Front' else -1.4 * CM)
    b.boxb((0, 1.3 * CM, zb), (7.0 * CM, 2.4 * CM, 0.3 * CM))
    b.done(T4)
    Part(f'Bench{side}Cushion', 'Plaid').box((0, 1.5 * CM, zc - (0.1 * CM if side == 'Front' else -0.1 * CM)), (6.6 * CM, 0.3 * CM, 2.0 * CM)).done(T4)
    Part(f'Bench{side}Stripes', 'Cream').box((-1.6 * CM, 1.66 * CM, zc), (0.25 * CM, 0.02 * CM, 1.9 * CM)).box((1.6 * CM, 1.66 * CM, zc), (0.25 * CM, 0.02 * CM, 1.9 * CM)).box((0, 1.66 * CM, zc), (6.4 * CM, 0.02 * CM, 0.25 * CM)).done(T4)
    for k, x in enumerate((-1.8 * CM, 1.8 * CM)):
        n = k + 1 + (0 if side == 'Front' else 2)
        anchor(f'Seat-{n}', (x, SEAT_Y, zc), T4, rot_y=face)
        anchor(f'Meal-{n}', (x, TOP_Y, 0.9 * CM if side == 'Front' else -0.9 * CM), T4)
Part('Candle', 'Cream', smooth=True).cyl((0, TOP_Y + 0.35 * CM, 0), 0.25 * CM, 0.7 * CM, seg=8).done(T4)
Part('CandleFlame', 'FireCore', smooth=True).sphere((0, TOP_Y + 0.85 * CM, 0), 0.12 * CM, seg=6, rings=4).done(T4)
anchor('TableTop', (0, TOP_Y, 0), T4)

# ------------------------------------------------------------------ patio-table
PT = root_of('patio-table', 0.32)
Part('Top', 'Red', smooth=True).cyl((0, TOP_Y - 0.15 * CM, 0), 2.2 * CM, 0.3 * CM, seg=18).done(PT)
Part('TopSnow', 'Snow', smooth=True).sphere((0.3 * CM, TOP_Y, -0.4 * CM), 1.0, seg=10, rings=5, scale=(1.3 * CM, 0.18 * CM, 1.0 * CM)).done(PT)
Part('Pole', 'Steel', smooth=True).cyl((0, (TOP_Y - 0.3 * CM) / 2, 0), 0.25 * CM, TOP_Y - 0.3 * CM, seg=8).done(PT)
feet = Part('Feet', 'Steel')
for a in (0, 120, 240):
    feet.box((1.0 * CM * math.cos(math.radians(a)), 0.15 * CM, 1.0 * CM * math.sin(math.radians(a))), (2.0 * CM, 0.25 * CM, 0.35 * CM), rot_y=-a)
feet.done(PT)
def bistro_chair(parent, tag, at, face_rot):
    x, z = at
    def P(dx, dz):
        a = math.radians(face_rot)
        # The sitter's +Z turned by face_rot about up (the same hand as Part.box's rot_y: +90 turns +Z to -X).
        return (x + dx * math.cos(a) - dz * math.sin(a), z + dx * math.sin(a) + dz * math.cos(a))
    s = Part(f'{tag}-Steel', 'Steel')
    for dx, dz in ((-1.0, -1.0), (1.0, -1.0), (-1.0, 1.0), (1.0, 1.0)):
        px, pz = P(dx * CM, dz * CM)
        s.boxb((px, 0, pz), (0.22 * CM, 1.4 * CM, 0.22 * CM), rot_y=face_rot)
    for dx in (-1.0, 1.0):
        px, pz = P(dx * CM, -1.1 * CM)
        s.boxb((px, 1.4 * CM, pz), (0.22 * CM, 2.2 * CM, 0.22 * CM), rot_y=face_rot)
    px, pz = P(0, -1.1 * CM)
    s.box((px, 3.6 * CM, pz), (2.2 * CM, 0.22 * CM, 0.22 * CM), rot_y=face_rot)
    s.done(parent)
    px, pz = P(0, 0)
    Part(f'{tag}-Seat', 'Red', smooth=True).cyl((px, 1.5 * CM, pz), 1.25 * CM, 0.25 * CM, seg=14).done(parent)
    px, pz = P(0, -1.1 * CM)
    Part(f'{tag}-Back', 'Red').box((px, 2.9 * CM, pz), (2.0 * CM, 0.9 * CM, 0.2 * CM), rot_y=face_rot).done(parent)
bistro_chair(PT, 'ChairL', (-3.3 * CM, 0), -90)
bistro_chair(PT, 'ChairR', (3.3 * CM, 0), 90)
anchor('Seat-1', (-3.3 * CM, SEAT_Y, 0), PT, rot_y=-90)
anchor('Seat-2', (3.3 * CM, SEAT_Y, 0), PT, rot_y=90)
anchor('Meal-1', (-1.2 * CM, TOP_Y, 0.2 * CM), PT)
anchor('Meal-2', (1.2 * CM, TOP_Y, 0.2 * CM), PT)
anchor('TableTop', (0, TOP_Y, 0), PT)

# ------------------------------------------------------------------ dock-bench
DB = root_of('dock-bench', 0.48)
bench = Part('Bench', 'Pine')
bench.box((0, 1.4 * CM, 0), (6.4 * CM, 0.4 * CM, 2.2 * CM))
for x in (-2.8 * CM, 2.8 * CM):
    bench.boxb((x, 0, 0), (0.5 * CM, 1.2 * CM, 2.0 * CM))
    # Arms: a flat shelf each side for a mug (the meal spots), on a post.
    bench.boxb((x + (0.9 * CM if x > 0 else -0.9 * CM), 1.6 * CM, -0.3 * CM), (0.4 * CM, 1.0 * CM, 0.4 * CM))
    bench.box((x + (0.9 * CM if x > 0 else -0.9 * CM), 2.7 * CM, -0.1 * CM), (1.3 * CM, 0.3 * CM, 2.0 * CM))
# The back rest: three slats on two posts, on the -Z side (the sitters face +Z, the lake and the player).
for x in (-2.6 * CM, 2.6 * CM):
    bench.boxb((x, 1.6 * CM, -1.2 * CM), (0.4 * CM, 2.4 * CM, 0.3 * CM))
for i in range(3):
    bench.box((0, (2.2 + i * 0.6) * CM, -1.2 * CM), (6.0 * CM, 0.35 * CM, 0.25 * CM))
bench.done(DB)
Part('BenchSnow', 'Snow', smooth=True).sphere((-0.6 * CM, 3.5 * CM, -1.2 * CM), 1.0, seg=10, rings=5, scale=(2.6 * CM, 0.2 * CM, 0.28 * CM)).done(DB)
Part('BenchCushion', 'Plaid').box((0, 1.65 * CM, 0.1 * CM), (6.0 * CM, 0.25 * CM, 1.8 * CM)).done(DB)
Part('BenchCushionStripe', 'Cream').box((0, 1.78 * CM, 0.1 * CM), (6.0 * CM, 0.02 * CM, 0.22 * CM)).done(DB)
anchor('Seat-1', (-1.5 * CM, SEAT_Y, 0), DB, rot_y=0)
anchor('Seat-2', (1.5 * CM, SEAT_Y, 0), DB, rot_y=0)
anchor('Meal-1', (-3.7 * CM, 2.85 * CM, -0.1 * CM), DB)
anchor('Meal-2', (3.7 * CM, 2.85 * CM, -0.1 * CM), DB)
anchor('TableTop', (0, 2.85 * CM, -0.1 * CM), DB)

# ------------------------------------------------------------------ fire-chair (a Muskoka chair)
FC = root_of('fire-chair', 0.62)
mk = Part('Muskoka', 'Cushion')
# Slanted seat slats, sloping down toward the back, on short legs.
for i in range(4):
    z = (1.0 - i * 0.65) * CM
    mk.box((0, (1.35 + i * 0.1) * CM, z), (2.6 * CM, 0.25 * CM, 0.55 * CM), rot_x=-8)
for dx in (-1.1, 1.1):
    mk.boxb((dx * CM, 0, 0.9 * CM), (0.3 * CM, 1.3 * CM, 0.3 * CM))
    mk.boxb((dx * CM, 0, -1.0 * CM), (0.3 * CM, 1.5 * CM, 0.3 * CM))
# The fan back: five slats leaning back, taller in the middle.
for i, (dx, h) in enumerate(((-1.0, 2.6), (-0.5, 2.9), (0, 3.1), (0.5, 2.9), (1.0, 2.6))):
    mk.box((dx * CM, (1.5 + h / 2) * CM, -1.35 * CM - 0.15 * CM * (h / 3.1)), (0.42 * CM, h * CM, 0.2 * CM), rot_x=-14)
# Wide flat arms on posts.
for dx in (-1.55, 1.55):
    mk.box((dx * CM, 2.35 * CM, 0.0), (0.7 * CM, 0.2 * CM, 2.8 * CM))
    mk.boxb((dx * CM, 1.4 * CM, 1.1 * CM), (0.25 * CM, 0.95 * CM, 0.25 * CM))
mk.done(FC)
Part('MuskokaSnow', 'Snow', smooth=True).sphere((0, 4.55 * CM, -1.75 * CM), 1.0, seg=10, rings=5, scale=(1.0 * CM, 0.14 * CM, 0.2 * CM)).done(FC)
# A log stump beside it, its top the meal spot; snow on it.
Part('Stump', 'Trunk', smooth=True).cyl((2.9 * CM, 1.1 * CM, 0.6 * CM), 0.9 * CM, 2.2 * CM, seg=10).done(FC)
Part('StumpTop', 'Pine', smooth=True).cyl((2.9 * CM, 2.21 * CM, 0.6 * CM), 0.82 * CM, 0.02 * CM, seg=10).done(FC)
Part('StumpSnow', 'Snow', smooth=True).sphere((2.6 * CM, 2.25 * CM, 0.2 * CM), 1.0, seg=8, rings=5, scale=(0.5 * CM, 0.12 * CM, 0.4 * CM)).done(FC)
anchor('Seat-1', (0, SEAT_Y, 0), FC, rot_y=0)
anchor('Meal-1', (2.9 * CM, 2.25 * CM, 0.6 * CM), FC)
anchor('TableTop', (2.9 * CM, 2.25 * CM, 0.6 * CM), FC)

# ------------------------------------------------------------------ export each, then one preview of them all
roots = [T2, T4, PT, DB, FC]
sizes = {}
for r in roots:
    x = r.location.x
    r.location = (0, 0, 0)
    bpy.context.view_layer.update()
    export_glb(r, os.path.join(OUT, r.name + '.glb'))
    xs, ys, zs = [], [], []
    for o in r.children_recursive:
        if o.type != 'MESH':
            continue
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            xs.append(p.x); ys.append(p.z); zs.append(-p.y)
    sizes[r.name] = (round((max(xs) - min(xs)) * 100, 1), round(max(ys) * 100, 1), round((max(zs) - min(zs)) * 100, 1))
    r.location = (x, 0, 0)
print('SIZES', sizes)
cam, sun = daylight()
# A snowy table under them for the group shot.
Part('Ground', 'Snow').boxb((0.31, -0.004, 0), (1.0, 0.004, 0.4)).done(root_of('preview-ground'))
sc.frame_set(1)
shot(cam, os.path.join(OUT, 'previews', 'pieces.png'), (0.31, 0.32, 0.62), (0.31, 0.01, -0.02), lens=40, size=(1800, 600))
# Each piece on its own, from the seat's angle.
for r in roots:
    x = r.location.x
    shot(cam, os.path.join(OUT, 'previews', r.name + '.png'), (x + 0.07, 0.11, 0.15), (x, 0.015, 0.0), lens=60, size=(900, 700))
