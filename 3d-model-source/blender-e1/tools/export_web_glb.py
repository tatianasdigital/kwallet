"""Export the CURRENT E1 Blender model as a web GLB (no geometry changes).

    python3 tools/export_web_glb.py  →  web/kampela-e1.glb

Only the shading is adapted to what glTF can carry:
  * KiCad height maps → tangent-space normal maps (glTF has no bump node)
  * light-path / volume tricks (Cycles-only) are dropped; the clear resin is re-created in Three.js
  * textures are re-encoded at web resolution
"""
import os, sys, subprocess, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX, WEBTEX, OUT = os.path.join(ROOT, 'tex'), os.path.join(ROOT, 'web', 'tex'), os.path.join(ROOT, 'web')
os.makedirs(WEBTEX, exist_ok=True)

# ---------------------------------------------------------------- 1. web-resolution textures + normal maps (PIL/numpy)
from PIL import Image
import numpy as np
def resized(name, maxw, mode=None):
    im = Image.open(os.path.join(TEX, name))
    if mode: im = im.convert(mode)
    if im.width > maxw: im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    return im
def normal_from_height(name, maxw, strength):
    h = np.asarray(resized(name, maxw, 'L'), np.float32) / 255
    gy, gx = np.gradient(h)
    n = np.dstack((-gx * strength, gy * strength, np.ones_like(h)))
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8))
for pre, w in (('e1', 2400), ('tag', 860)):
    for sd in 'FB':
        resized(f'{pre}_{sd}_color.png', w, 'RGB').save(os.path.join(WEBTEX, f'{pre}_{sd}_color.png'))
        resized(f'{pre}_{sd}_rough.png', w, 'L').save(os.path.join(WEBTEX, f'{pre}_{sd}_rough.png'))
        resized(f'{pre}_{sd}_metal.png', w, 'L').save(os.path.join(WEBTEX, f'{pre}_{sd}_metal.png'))
        normal_from_height(f'{pre}_{sd}_height.png', w, 6.0).save(os.path.join(WEBTEX, f'{pre}_{sd}_normal.png'))
for n in ('eink_fpl.png', 'fpc_display.png', 'fpc_touch.png', 'mark_qfn.png'):
    resized(n, 2048, 'RGB').save(os.path.join(WEBTEX, n))
print('web textures ready')

# ---------------------------------------------------------------- 2. Blender: rewire materials for glTF and export
import bpy
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'blender', 'kampela_E1.blend'))
def webimg(name, cs):
    im = bpy.data.images.load(os.path.join(WEBTEX, name), check_existing=True); im.colorspace_settings.name = cs; return im

for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree; N = nt.nodes; L = nt.links
    bsdf = next((n for n in N if n.type == 'BSDF_PRINCIPLED'), None)
    out = next((n for n in N if n.type == 'OUTPUT_MATERIAL'), None)
    if not bsdf or not out: continue
    # Principled straight to the output, no volume / light-path mixing
    for l in list(out.inputs['Surface'].links) + list(out.inputs['Volume'].links): L.remove(l)
    L.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    for k in ('Coat Weight', 'Alpha', 'Normal'):
        for l in list(bsdf.inputs[k].links): L.remove(l)
    if m.name.startswith(('PCB_Component', 'PCB_Screen', 'Tag_Front', 'Tag_Back')):
        pre = 'e1' if m.name.startswith('PCB') else 'tag'
        sd = 'F' if m.name in ('PCB_ComponentSide', 'Tag_Front') else 'B'
        uv = N.new('ShaderNodeTexCoord')
        for t in [n for n in N if n.type == 'TEX_IMAGE']: N.remove(t)
        def tex(suffix, cs):
            t = N.new('ShaderNodeTexImage'); t.image = webimg(f'{pre}_{sd}_{suffix}.png', cs); L.new(uv.outputs['UV'], t.inputs['Vector']); return t
        L.new(tex('color', 'sRGB').outputs['Color'], bsdf.inputs['Base Color'])
        L.new(tex('rough', 'Non-Color').outputs['Color'], bsdf.inputs['Roughness'])
        L.new(tex('metal', 'Non-Color').outputs['Color'], bsdf.inputs['Metallic'])
        nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 1.0
        L.new(tex('normal', 'Non-Color').outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        bsdf.inputs['Coat Weight'].default_value = 0.25; bsdf.inputs['Coat Roughness'].default_value = 0.2
    else:
        for t in [n for n in N if n.type == 'TEX_IMAGE']:
            base = os.path.basename(t.image.filepath) if t.image else ''
            if base in ('eink_fpl.png', 'fpc_display.png', 'fpc_touch.png', 'mark_qfn.png'):
                t.image = webimg(base, 'sRGB')

# export only the device (not studio / turntable)
piv = bpy.data.objects['Turntable']; piv.animation_data_clear(); piv.rotation_euler = (0, 0, 0)
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.collections['Kampela_Device'].all_objects:
    if o.name != 'Turntable': o.select_set(True)
root = bpy.data.objects['Kampela']; root.parent = None
out = os.path.join(OUT, 'kampela-e1.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True,
                          export_image_format='WEBP', export_image_quality=88, export_gpu_instances=True,
                          export_materials='EXPORT', export_yup=True, export_animations=False, export_cameras=False, export_lights=False)
print('exported', out, round(os.path.getsize(out) / 1e6, 2), 'MB')
