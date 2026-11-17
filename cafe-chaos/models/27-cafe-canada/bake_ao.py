"""Bake one ambient-occlusion atlas for a whole model and wire it into every material as the glTF
occlusion texture (on a second UV set), so the game's matte materials get soft contact shading in
the log joins, under the eaves and the counter, round the stones: the baked-lighting route Meta's
Quest guidance prefers over real-time effects.

Exec'd by a build script right before its export, with `ROOT` (the model's root empty), `sc`
(the scene) and `MATS` in scope. Optional knobs set before the exec: AO_RES (px, 2048),
AO_SAMPLES (32), AO_DIST (metres the rays look, 0.06), AO_SKIP (material names left alone).

How: every mesh under ROOT gets a `Lightmap` UV layer as its SECOND layer (the box UVs stay
first, so TEXCOORD_0 is still the tiling one); all of them are unwrapped (Smart UV Project) and
packed together into one 0–1 square; Cycles bakes AO into one image through that layer; each
material gets an Image Texture of it fed to a `glTF Material Output` group's `Occlusion` input,
which the glTF exporter writes as `occlusionTexture` with `texCoord: 1`. three.js's GLTFLoader puts
that on `aoMap` (and the Lambert twin keeps `aoMap`).
"""
import time as _time

AO_RES = globals().get('AO_RES', 2048)
AO_SAMPLES = globals().get('AO_SAMPLES', 32)
AO_DIST = globals().get('AO_DIST', 0.06)
AO_SKIP = set(globals().get('AO_SKIP', ('Glass', 'Smoke', 'Fire', 'FireCore', 'Bulb')))
_t0 = _time.time()

_meshes = [o for o in ROOT.children_recursive if o.type == 'MESH' and o.data.polygons
           and not any(m and m.name in AO_SKIP for m in o.data.materials)]
for _o in _meshes:
    if not _o.data.uv_layers:
        _o.data.uv_layers.new(name='UVMap')
    if 'Lightmap' not in _o.data.uv_layers:
        _o.data.uv_layers.new(name='Lightmap')
    _o.data.uv_layers.active = _o.data.uv_layers['Lightmap']

bpy.ops.object.select_all(action='DESELECT')
for _o in _meshes:
    _o.select_set(True)
bpy.context.view_layer.objects.active = _meshes[0]

def _unwrap_all():
    """Smart-project every mesh (islands by angle) and pack all of them into one square."""
    sc.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004, margin_method='FRACTION', shape_method='AABB')
    bpy.ops.object.mode_set(mode='OBJECT')

try:
    _unwrap_all()
    _how = 'smart_project+pack_islands'
except Exception as _e:
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.uv.lightmap_pack(PREF_CONTEXT='ALL_FACES', PREF_PACK_IN_ONE=True, PREF_NEW_UVLAYER=False, PREF_BOX_DIV=24, PREF_MARGIN_DIV=0.05)
    _how = f'lightmap_pack (smart project failed: {_e})'

_ao_img = bpy.data.images.new(f'ao-{ROOT.name}', AO_RES, AO_RES, alpha=False)
_ao_img.colorspace_settings.name = 'Non-Color'
_ao_img.generated_color = (1, 1, 1, 1)

_group = bpy.data.node_groups.get('glTF Material Output')
if _group is None:
    _group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    _group.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    _group.nodes.new('NodeGroupInput'); _group.nodes.new('NodeGroupOutput')

_mats_done = set()
for _o in _meshes:
    for _m in _o.data.materials:
        if _m is None or _m.name in _mats_done:
            continue
        _mats_done.add(_m.name)
        _nt = _m.node_tree
        _tn = _nt.nodes.new('ShaderNodeTexImage'); _tn.image = _ao_img; _tn.name = _tn.label = 'AO'; _tn.location = (-900, -600)
        _uv = _nt.nodes.new('ShaderNodeUVMap'); _uv.uv_map = 'Lightmap'; _uv.location = (-1100, -600)
        _nt.links.new(_uv.outputs['UV'], _tn.inputs['Vector'])
        _g = _nt.nodes.new('ShaderNodeGroup'); _g.node_tree = _group; _g.location = (-500, -600)
        _nt.links.new(_tn.outputs['Color'], _g.inputs['Occlusion'])
        for _n in _nt.nodes: _n.select = False
        _tn.select = True; _nt.nodes.active = _tn

_engine = sc.render.engine
sc.render.engine = 'CYCLES'
try:
    _cp = bpy.context.preferences.addons['cycles'].preferences
    _cp.compute_device_type = 'METAL'; _cp.get_devices()
    for _d in _cp.devices: _d.use = (_d.type == 'METAL')
    sc.cycles.device = 'GPU'
except Exception:
    sc.cycles.device = 'CPU'
sc.cycles.samples = AO_SAMPLES
sc.cycles.use_denoising = False
if sc.world is None:
    sc.world = bpy.data.worlds.new('AO-World')
sc.world.light_settings.distance = AO_DIST
sc.render.bake.use_selected_to_active = False
bpy.ops.object.bake(type='AO', uv_layer='Lightmap', margin=6, use_clear=True)
_ao_img.pack()
sc.render.engine = _engine
for _o in _meshes:
    _o.data.uv_layers.active_index = 0
_px = _ao_img.pixels[:]
print(f'AO BAKED {AO_RES}px {_how} meshes={len(_meshes)} materials={len(_mats_done)} mean={sum(_px[0::4]) / (len(_px) // 4):.3f} in {_time.time() - _t0:.0f}s')
