"""Music notes for the rooftop pianist: tiny notes that pop up over the piano, rise, sway and shrink away to
nothing, three at a time on a 2 s loop. Its own file, so the game shows it only while the pianist plays.

  Blender --background --factory-startup --python notes_build.py -- <out-dir>
  node merge_anims.mjs <out-dir>/music-notes.glb        (one clip, named Ambient)

Place `music-notes.glb` at `PianoSpot` with its rotation (the pianist's frame: +Z toward the keys and the sign),
and play its `Ambient` clip on a loop while the pianist plays. The notes rise from just over the piano's top,
between the pianist and the sign, and face the player. Each note is about 6 mm tall (the seated pianist is
8 cm, the upright 5.9 cm): small, but dark against the cream sign so it reads.
"""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'kit.py')).read())

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = args[0] if args else os.path.join(HERE, 'out')
os.makedirs(os.path.join(OUT, 'previews'), exist_ok=True)
for o in list(sc.collection.all_objects):
    bpy.data.objects.remove(o, do_unlink=True)

mat('Note', (0.07, 0.06, 0.08), 0.5)

root = bpy.data.objects.new('music-notes', None)
sc.collection.objects.link(root)
root['cafe_prop'] = 'music-notes'

def empty(name, parent):
    e = bpy.data.objects.new(name, None)
    sc.collection.objects.link(e)
    e.parent = parent
    return e

# The notes' shapes, in each note's own frame (game axes, centred on the note), facing -Z: the player, since the
# pianist's frame looks away from the player toward the keys. Heads are slanted ovals, stems thin, flags angled.
def head(part, x, y):
    part.sphere((x, y, 0), 1.0, seg=8, rings=5, scale=(0.0013, 0.00095, 0.0006))
def stem(part, x, y0, h):
    part.box((x - 0.0011, y0 + h / 2, 0), (0.00035, h, 0.0005))     # -x: the viewer's right, seen from -Z

def eighth(name, parent):
    n = empty(name, parent)
    p = Part(f'{name}-Shape', 'Note', smooth=True)
    head(p, 0, -0.0022)
    stem(p, 0, -0.0022, 0.0055)
    p.box((-0.0019, 0.0028, 0), (0.0018, 0.00045, 0.0005), rot_z=-35)        # the flag, out to the viewer's right
    p.done(n)
    return n

def beamed(name, parent):
    n = empty(name, parent)
    p = Part(f'{name}-Shape', 'Note', smooth=True)
    head(p, -0.0022, -0.0024); head(p, 0.0022, -0.0018)
    stem(p, -0.0022, -0.0024, 0.0056); stem(p, 0.0022, -0.0018, 0.0050)
    p.box((-0.0011, 0.0032, 0), (0.0046, 0.0006, 0.0005), rot_z=8)          # the beam
    p.done(n)
    return n

notes = [eighth('Note-1', root), beamed('Note-2', root), eighth('Note-3', root)]

# Each note's loop: it pops up over the piano (scale 0 -> 1.15 -> 1 in a fifth of a second), rises 4 cm with a sway,
# and from halfway up shrinks to nothing (a glTF clip cannot fade alpha). The three are a third of a loop apart, each
# starting from its own spot over the keys. 24 fps, frames 1..49 (2 s), a key every frame so the wrap is clean.
START = [(-0.016, 0.066, 0.030), (0.004, 0.068, 0.034), (0.020, 0.065, 0.028)]   # in the pianist's frame (+Z = the sign)
sc.render.fps = 24
sc.frame_start, sc.frame_end = 1, 48
for i, n in enumerate(notes):
    n.rotation_mode = 'XYZ'
    x0, y0, z0 = START[i]
    for f in range(1, 50):
        t = ((f - 1) / 48 + i / 3) % 1.0
        if t < 0.1:
            s = 1.15 * t / 0.1
        elif t < 0.18:
            s = 1.15 - 0.15 * (t - 0.1) / 0.08
        elif t < 0.5:
            s = 1.0
        else:
            s = max(0.0, 1.0 - (t - 0.5) / 0.5)
        x = x0 + 0.006 * math.sin(2 * math.pi * (t + i * 0.27)) * t
        y = y0 + 0.040 * t
        n.location = G(x, y, z0)
        n.rotation_euler = (0, math.radians(14 * math.sin(2 * math.pi * (t + i * 0.4))), 0)   # a little rock as it floats
        n.scale = (s, s, s)
        for path in ('location', 'rotation_euler', 'scale'):
            n.keyframe_insert(path, frame=f)
    for fc in fcurves_of(n):
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'

tris = export_glb(root, os.path.join(OUT, 'music-notes.glb'), animations=True)

# A preview: the notes at frame 12 over a stand-in piano top and against a cream board, as the player sees them.
mat('Board', (0.97, 0.93, 0.85), 0.7)
mat('PianoTop', (0.08, 0.07, 0.08), 0.35)
stage = bpy.data.objects.new('stage', None); sc.collection.objects.link(stage)
Part('Board', 'Board').box((0, 0.10, 0.052), (0.30, 0.064, 0.008)).done(stage)
Part('PianoTop', 'PianoTop').boxb((0, 0, 0.044), (0.065, 0.054, 0.024)).done(stage)
sc.frame_set(12)
cam, sun = daylight()
shot(cam, os.path.join(OUT, 'previews', 'music-notes.png'), (0.0, 0.16, -0.30), (0.0, 0.075, 0.03), lens=60, size=(1200, 800))
print('NOTES_TRIS', tris)
