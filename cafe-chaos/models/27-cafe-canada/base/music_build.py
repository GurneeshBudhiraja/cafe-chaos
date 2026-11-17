"""Music set: a small acoustic guitar (origin at the body centre, authored in playing pose for a
barista's `Guitar` attach point) and floating music notes with an Ambient loop.
exec(src, {"bpy": bpy, "cc": <cafe_counter ns>}); build_music()."""
import bpy, bmesh, math
from mathutils import Vector, Euler

CM = 0.01

def sound_hole(m, D):
    """A dark disc on the guitar's front (facing -Y)."""
    uv = m.uv; cx, cz, r = 0.0, 0.0, 0.36; seg = 16
    vs = [m.bm.verts.new(Vector((cx + r * math.cos(a), -D * 1.03, cz + r * math.sin(a))) * CM) for a in [i * 2 * math.pi / seg for i in range(seg)]]
    f = m.bm.faces.new(vs[::-1])
    for l in f.loops: l[uv].uv = cc_tile("charcoal")

def build_music(cc):
    global cc_tile
    cc_tile = lambda name: cc["tile_uv"](name, 0.5, 0.5)
    Mesh = cc["Mesh"]; pal = bpy.data.materials["CafeBarPalette"]
    sc = bpy.data.scenes.get("MusicArt") or bpy.data.scenes.new("MusicArt")
    for o in list(sc.collection.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    for a in [a for a in bpy.data.actions if a.name.startswith("Ambient|Note-")]: bpy.data.actions.remove(a)
    out = {}
    def finish(m, name, parent=None, origin=(0, 0, 0), mats=(pal,)):
        me = bpy.data.meshes.new(name)
        for v in m.bm.verts: v.co -= Vector(origin) * CM
        m.bm.normal_update(); m.bm.to_mesh(me); m.bm.free()
        for mt in mats: me.materials.append(mt)
        ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); ob.parent = parent; ob.location = Vector(origin) * CM
        out[name] = ob; return ob
    # ---- guitar: body in the XZ plane (front -Y), neck along +X-ish and slightly up; the game attaches it to `Guitar`
    g = bpy.data.objects.new("guitar", None); sc.collection.objects.link(g); out["guitar"] = g
    m = Mesh()
    D = 0.5
    m.ball(0, 0, -0.35, 1.35, D, 1.15, "tea", seg=18, rings=10)             # lower bout (sides in dark wood)
    m.ball(0, 0, 1.25, 1.0, D, 0.9, "tea", seg=16, rings=8)                  # upper bout
    m.ball(0, -D * 0.92, -0.35, 1.3, 0.08, 1.1, "bamboo", seg=18, rings=10)  # spruce top
    m.ball(0, -D * 0.92, 1.25, 0.96, 0.08, 0.86, "bamboo", seg=16, rings=8)
    sound_hole(m, D)
    m.box(-0.5, 0.5, -D * 1.05, -D * 0.9, -1.25, -1.05, "charcoal")            # bridge
    m.box(-0.2, 0.2, -D * 1.0, -D * 0.6, 1.6, 4.6, "tea")                      # neck
    m.box(-0.22, 0.22, -D * 1.08, -D * 1.0, 1.7, 4.6, "charcoal")              # fretboard
    for z in (2.2, 2.7, 3.15, 3.55, 3.9, 4.2): m.box(-0.22, 0.22, -D * 1.1, -D * 1.07, z - 0.02, z + 0.02, "brass")   # frets
    m.box(-0.3, 0.3, -D * 1.0, -D * 0.5, 4.6, 5.5, "charcoal", bevel=0.05)    # headstock
    for sx in (-1, 1):
        for z in (4.8, 5.05, 5.3): m.ball(sx * 0.38, -D * 0.75, z, 0.07, 0.07, 0.07, "brass", seg=6, rings=4)   # tuners
    for i in range(4):                                                        # strings
        x = -0.15 + i * 0.1
        m.tube([(x, -D * 1.12, -1.15), (x, -D * 1.12, 4.6)], 0.012, "cream", seg=4)
    body = finish(m, "GuitarBody", g)
    # the sound hole disc was built facing +Z; turn it to face -Y by rotating the whole thing: simpler to
    # build the hole as a thin flat cylinder on the front instead
    # ---- notes: three flat glyphs, each its own node, rising and swaying in `Ambient`
    def note(m, kind, colour):
        # a flat note: head (ellipse), stem, flag(s); 0.22 cm thick, front -Y
        m.ball(0, 0, 0, 0.42, 0.11, 0.3, colour, seg=12, rings=6)                      # head
        m.box(0.3, 0.42, -0.1, 0.1, 0.0, 1.6, colour)                                  # stem
        if kind == "quaver":
            m.tube([(0.36, 0, 1.6), (0.7, 0, 1.25), (0.78, 0, 0.75)], 0.07, colour, seg=5)   # flag
        elif kind == "beamed":
            m.ball(1.3, 0, 0.25, 0.42, 0.11, 0.3, colour, seg=12, rings=6)
            m.box(1.6, 1.72, -0.1, 0.1, 0.25, 1.85, colour)
            m.box(0.3, 1.72, -0.12, 0.12, 1.5, 1.85, colour)                           # beam
    for i, (kind, col, x) in enumerate((("quaver", "charcoal", 0.0), ("beamed", "charcoal", 2.2), ("crotchet", "charcoal", 5.0))):
        node = bpy.data.objects.new(f"Note-{i + 1}", None); node.empty_display_size = 0.004; sc.collection.objects.link(node)
        node.location = Vector((x, 0, 0)) * CM; out[node.name] = node
        m = Mesh(); note(m, kind, col); ob = finish(m, f"Note-{i + 1}-Glyph", node)
        ob.location = (0, 0, 0)
    notes_root = bpy.data.objects.new("music-notes", None); sc.collection.objects.link(notes_root); out["music-notes"] = notes_root
    for i in range(3): out[f"Note-{i + 1}"].parent = notes_root
    # Ambient: each note drifts up ~3 cm over 2 s, swaying, and pops back small at the start (the game can also just spawn them)
    N = 48
    for i in range(3):
        node = out[f"Note-{i + 1}"]; base = node.location.copy()
        node.animation_data_create(); act = bpy.data.actions.new(f"Ambient|{node.name}"); node.animation_data.action = act
        ph = i * 0.37
        for f in range(1, N + 2, 2):
            p = ((f - 1) / N + ph) % 1.0
            s = min(1.0, p * 6) * (1.0 - max(0.0, (p - 0.75) / 0.25))
            node.location = base + Vector((0.5 * math.sin(p * 6.283 + i), 0, 3.0 * p)) * CM
            node.scale = (s, s, s); node.rotation_euler = Euler((0, math.radians(12 * math.sin(p * 6.283 * 2 + i)), 0))
            node.keyframe_insert("location", frame=f); node.keyframe_insert("scale", frame=f); node.keyframe_insert("rotation_euler", frame=f)
        ad = node.animation_data; ad.action = None
        tr = ad.nla_tracks.new(); tr.name = "Ambient"; st = tr.strips.new("Ambient", 1, act)
        if getattr(st, "action_slot", 1) is None and act.slots: st.action_slot = act.slots[0]
        node.location = base; node.scale = (1, 1, 1); node.rotation_euler = Euler((0, 0, 0))
    sc.frame_start, sc.frame_end = 1, N + 1
    g.location.x = -0.06
    return sc, out
