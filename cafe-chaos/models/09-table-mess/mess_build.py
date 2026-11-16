"""The dirty-table mess, final art: a used plate with leftovers, a tipped teacup with its spill, a crumpled napkin,
crumbs. One mesh, one material, colours painted per vertex (one draw call). Sized as the grey-box (3.4 x 3.0 cm,
about 1.1 cm tall), origin at the bottom centre, front toward the player. Runs in an empty background Blender."""
import bpy, bmesh, math, sys, random
from mathutils import Vector, Matrix
OUT = sys.argv[sys.argv.index('--') + 1]
CM = 0.01
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bm = bmesh.new()
col = bm.loops.layers.color.new("Col")

def paint(faces, rgb):
    for f in faces:
        for l in f.loops: l[col] = (*rgb, 1.0)

def cyl(r, h, segs, at, rot=None, r2=None):
    res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r * CM, radius2=(r2 if r2 is not None else r) * CM, depth=h * CM)
    m = Matrix.Translation(Vector(at) * CM)
    if rot: m = m @ rot
    bmesh.ops.transform(bm, matrix=m, verts=res["verts"])
    return list({f for v in res["verts"] for f in v.link_faces})

# The plate: a flat cream disc with a blue rim band and a raised edge; a smear of sauce and a few leftovers on it.
PLATE = (-0.45, 0.1)
paint(cyl(1.15, 0.12, 24, (*PLATE, 0.06)), (0.96, 0.94, 0.88))
paint(cyl(1.18, 0.05, 24, (*PLATE, 0.135)), (0.22, 0.42, 0.72))
paint(cyl(0.95, 0.03, 20, (*PLATE, 0.145)), (0.98, 0.96, 0.91))
paint(cyl(0.45, 0.02, 10, (PLATE[0] + 0.15, PLATE[1] - 0.1, 0.162), r2=0.38), (0.62, 0.30, 0.16))
for dx, dy, c in ((-0.3, 0.25, (0.95, 0.85, 0.55)), (0.35, 0.3, (0.40, 0.62, 0.30)), (-0.1, -0.4, (0.95, 0.85, 0.55))):
    f = bmesh.ops.create_cube(bm, size=0.22 * CM)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector((PLATE[0] + dx, PLATE[1] + dy, 0.24)) * CM) @ Matrix.Rotation(random.random() * 3, 4, 'Z'), verts=f["verts"])
    paint(list({x for v in f["verts"] for x in v.link_faces}), c)
# The teacup, tipped on its side, toward the front right, with a spill of tea running from its mouth.
CUP = (1.0, -0.35)
tip = Matrix.Rotation(math.radians(90), 4, 'Y') @ Matrix.Rotation(math.radians(0), 4, 'X')
paint(cyl(0.42, 0.75, 16, (CUP[0], CUP[1], 0.42), rot=tip, r2=0.5), (0.97, 0.95, 0.90))
paint(cyl(0.44, 0.12, 16, (CUP[0] - 0.12, CUP[1], 0.42), rot=tip, r2=0.52), (0.85, 0.30, 0.25))
paint(cyl(0.36, 0.02, 14, (CUP[0] - 0.42, CUP[1], 0.42), rot=tip), (0.36, 0.20, 0.10))
spill = bmesh.ops.create_circle(bm, cap_ends=True, segments=28, radius=0.55 * CM)
for i, v in enumerate(spill["verts"]):
    a = i / 28 * math.tau
    k = 1.0 + 0.16 * math.sin(a * 2 + 0.6) + 0.08 * math.cos(a * 3 + 1.1)
    v.co.x *= k * 1.3; v.co.y *= k
bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector((CUP[0] - 0.15, CUP[1] - 0.75, 0.012)) * CM), verts=spill["verts"])
paint(list({f for v in spill["verts"] for f in v.link_faces}), (0.55, 0.33, 0.16))
# The napkin, crumpled, at the back right.
nap = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.38 * CM)
for v in nap["verts"]:
    v.co += Vector(((random.random() - 0.5) * 0.18, (random.random() - 0.5) * 0.18, (random.random() - 0.5) * 0.12)) * CM
bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector((0.95, 0.75, 0.3)) * CM) @ Matrix.Diagonal(Vector((1.25, 1.0, 0.75, 1))), verts=nap["verts"])
paint(list({f for v in nap["verts"] for f in v.link_faces}), (0.93, 0.95, 0.98))
# Crumbs.
for _ in range(9):
    c = bmesh.ops.create_cube(bm, size=(0.08 + random.random() * 0.07) * CM)
    x = (random.random() - 0.5) * 3.0; y = (random.random() - 0.5) * 2.6
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector((x, y, 0.05)) * CM) @ Matrix.Rotation(random.random() * 3, 4, 'Z'), verts=c["verts"])
    paint(list({f for v in c["verts"] for f in v.link_faces}), (0.80, 0.62, 0.36))
me = bpy.data.meshes.new("table-mess")
bm.to_mesh(me); bm.free()
mat = bpy.data.materials.new("MessArt"); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]; vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"]); bsdf.inputs["Roughness"].default_value = 0.55
me.materials.append(mat)
ob = bpy.data.objects.new("table-mess", me); sc.collection.objects.link(ob)
for p in ob.data.polygons: p.use_smooth = False
dims = [round(v / CM, 2) for v in ob.dimensions]
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
bpy.ops.export_scene.gltf(filepath=f"{OUT}/table-mess.glb", export_format='GLB', use_selection=True, export_yup=True, export_vertex_color='ACTIVE', export_attributes=True)
# Render: on a wooden table top, from the seat's angle and from above.
top = bpy.data.objects.new("Top", bpy.data.meshes.new("Top")); sc.collection.objects.link(top)
tb = bmesh.new(); bmesh.ops.create_cube(tb, size=1); bmesh.ops.transform(tb, matrix=Matrix.Diagonal(Vector((5.2 * CM, 4.2 * CM, 0.4 * CM, 1))) @ Matrix.Translation(Vector((0, 0, -0.5))), verts=tb.verts); tb.to_mesh(top.data); tb.free()
wood = bpy.data.materials.new("Wood"); wood.use_nodes = True; wood.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.42, 0.24, 0.13, 1); top.data.materials.append(wood)
w = bpy.data.worlds.new("W"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.93, 0.89, 0.82, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.1; sc.world = w
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", 'SUN')); sun.data.energy = 3.0; sun.rotation_euler = (math.radians(45), 0, math.radians(30)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); cam.data.lens = 70; sc.collection.objects.link(cam); sc.camera = cam
try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError: sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = 900; sc.render.resolution_y = 600
for name, elev, azim, dist in (("seat", 38, 0, 0.13), ("above", 75, -20, 0.12)):
    e, a = math.radians(elev), math.radians(azim)
    cam.location = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (Vector((0, 0, 0.004)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f"{OUT}/mess-{name}.png"; bpy.ops.render.render(write_still=True)
print("DIMS", dims)
