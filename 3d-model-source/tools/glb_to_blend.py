"""Import kampela.glb into a clean Blender scene and save an editable .blend (with turntable + camera + lights).
Run:  python3 tools/glb_to_blend.py   (uses the bpy module)"""
import bpy, math, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
glb = os.path.join(root, 'public', 'models', 'kampela.glb')
out = os.path.join(root, 'blender', 'kampela.blend')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'; scene.unit_settings.scale_length = 1.0

root_obj = bpy.data.objects.get('Kampela_Root')
# glTF is Y-up; Blender is Z-up — the importer already converts, so the device stands along Blender Z.
# Turntable: an empty at the origin, rotating 360° about Z over 300 frames (linear = seamless loop).
pivot = bpy.data.objects.new('Turntable_Pivot', None); scene.collection.objects.link(pivot)
root_obj.parent = pivot
scene.frame_start, scene.frame_end = 1, 300
pivot.rotation_euler = (0, 0, 0); pivot.keyframe_insert('rotation_euler', index=2, frame=1)
pivot.rotation_euler = (0, 0, math.radians(360)); pivot.keyframe_insert('rotation_euler', index=2, frame=301)
for fc in pivot.animation_data.action.fcurves if hasattr(pivot.animation_data.action, 'fcurves') else []:
    for k in fc.keyframe_points: k.interpolation = 'LINEAR'
try:  # Blender 4.4+/5.x layered actions
    for layer in pivot.animation_data.action.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                for fc in cb.fcurves:
                    for k in fc.keyframe_points: k.interpolation = 'LINEAR'
except Exception:
    pass

cam_data = bpy.data.cameras.new('Camera'); cam_data.lens = 85
cam = bpy.data.objects.new('Camera', cam_data); scene.collection.objects.link(cam)
cam.location = (0, -0.42, 0.05); cam.rotation_euler = (math.radians(83), 0, 0)
scene.camera = cam
for name, loc, power in [('Key', (-0.3, -0.4, 0.4), 30), ('Rim', (0.4, 0.3, 0.2), 20), ('Back', (-0.2, 0.5, 0.3), 12)]:
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = power; ld.size = 0.3
    lo = bpy.data.objects.new(name, ld); lo.location = loc; scene.collection.objects.link(lo)
    c = lo.constraints.new('TRACK_TO'); c.target = pivot
world = bpy.data.worlds.new('World'); world.use_nodes = True; scene.world = world
bg = world.node_tree.nodes.get('Background'); bg.inputs['Color'].default_value = (0.02, 0.022, 0.021, 1); bg.inputs['Strength'].default_value = 1.0

# WebGL-only helpers (thin alpha shell + layer seams) are not needed in Cycles: real refraction does that job.
for ob in bpy.data.objects:
    if ob.name.startswith('Housing_Volume') or ob.name.startswith('Seam'):
        ob.hide_render = True
# Physically based acrylic for Cycles/EEVEE
m = bpy.data.materials.get('Acrylic_Clear')
if m and m.use_nodes:
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.93, 0.98, 0.95, 1)
    bsdf.inputs['Roughness'].default_value = 0.02
    bsdf.inputs['IOR'].default_value = 1.49
    bsdf.inputs['Transmission Weight'].default_value = 1.0
    out_node = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    if out_node.inputs['Volume'].is_linked:                      # drop importer's absorption volume (frosts in Cycles)
        for l in list(out_node.inputs['Volume'].links): nt.links.remove(l)
scene.render.engine = 'CYCLES'
scene.render.film_transparent = False
scene.cycles.samples = 128
scene.render.resolution_x, scene.render.resolution_y = 1080, 1350
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print('saved', out, 'objects:', len(bpy.data.objects))
