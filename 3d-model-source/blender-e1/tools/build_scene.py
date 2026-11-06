"""Build the Kampela E1 device + studio + turntable in Blender from the KiCad data.

    python3 tools/build_scene.py            (bpy module)  →  blender/kampela_E1.blend

Everything is modelled in millimetres and parented to `Kampela` (scale 0.001 → metres).
Axes (device upright, as in the hero):  Z = long axis (coil on top), X = width, Y = thickness.
+Y = front (e-ink screen side, KiCad B side), −Y = back (component side, KiCad F side).
The camera looks from −Y, so frame 1 shows the component side like the Figma hero.
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector, Matrix
from mathutils.geometry import tessellate_polygon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, 'tex')
sys.path.insert(0, os.path.join(ROOT, 'tools'))
META = json.load(open(os.path.join(TEX, 'e1_meta.json')))
TAGMETA = json.load(open(os.path.join(TEX, 'tag_meta.json')))
KX0, KY0, KX1, KY1 = META['bbox_mm']
CX, CY = (KX0 + KX1) / 2, (KY0 + KY1) / 2          # board centre (KiCad)

# ------------------------------------------------------------------ stack-up (Y, mm)  — total 7.0 like the D1 CAD
HOUSING = dict(w=50.0, l=124.5, t=7.0, r=4.5, edge=0.6)
Y_FRONT, Y_BACK = 3.5, -3.5
PCB_T = 1.09                                      # from the KiCad stack-up
Y_PCB_B = 1.40                                    # board B surface (towards the screen)
Y_PCB_F = Y_PCB_B - PCB_T                         # board F surface (components)
DISP = dict(l=70.42, w=45.8, kx0=91.90)           # GDEY027T91 outline; starts right after the touch-FPC slot
Y_DISP0 = Y_PCB_B + 0.10                          # display rests on 0.1 mm adhesive / display FPC
SEAMS = (-2.05, 0.30, 2.25)                       # laminate interfaces visible on the edge

def K(kx, ky, y=0.0):
    """KiCad board coords → device coords (mm)."""
    return Vector((-(ky - CY), y, -(kx - CX)))

# ------------------------------------------------------------------ scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
coll_cache = {}
def coll(name, parent=None):
    if name in coll_cache: return coll_cache[name]
    c = bpy.data.collections.new(name); (parent or scene.collection).children.link(c); coll_cache[name] = c; return c
C_DEV = coll('Kampela_Device'); C_HOUSING = coll('Housing', C_DEV); C_PCB = coll('PCB', C_DEV)
C_PARTS = coll('Components', C_DEV); C_DISP = coll('Display', C_DEV); C_FPC = coll('Flex_Cables', C_DEV)
C_TAG = coll('NFC_Tag_Fob', C_DEV); C_STUDIO = coll('Studio')

root = bpy.data.objects.new('Kampela', None); C_DEV.objects.link(root)
root.empty_display_type = 'ARROWS'; root.scale = (0.001,) * 3   # mm → m
pivot = bpy.data.objects.new('Turntable', None); C_DEV.objects.link(pivot)
root.parent = pivot

def link(ob, c):
    c.objects.link(ob); ob.parent = root; return ob

def mesh_obj(name, verts, faces, c, uvs=None, mats=None, mat_idx=None, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    if uvs is not None:
        uvl = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices:
                uvl.data[li].uv = uvs[me.loops[li].vertex_index]
    if mats:
        for m in mats: me.materials.append(m)
        if mat_idx is not None:
            for p, mi in zip(me.polygons, mat_idx): p.material_index = mi
    me.validate(); me.update()
    for p in me.polygons: p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me); return link(ob, c)

# ------------------------------------------------------------------ materials
def img(name, colorspace='sRGB'):
    im = bpy.data.images.load(os.path.join(TEX, name), check_existing=True)
    im.colorspace_settings.name = colorspace
    return im

def principled(name, color=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, **kw):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    for k, v in kw.items():
        if k in b.inputs: b.inputs[k].default_value = v
    return m, b

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

def board_material(name, prefix, side, coat=0.2):
    m, b = principled(name)
    nt = m.node_tree; N = nt.nodes; L = nt.links
    uv = N.new('ShaderNodeTexCoord')
    def tex(suffix, cs):
        t = N.new('ShaderNodeTexImage'); t.image = img(f'{prefix}_{side}_{suffix}.png' if suffix != 'alpha' else f'{prefix}_alpha.png', cs)
        t.interpolation = 'Cubic' if suffix == 'height' else 'Linear'
        L.new(uv.outputs['UV'], t.inputs['Vector']); return t
    col, rgh, met, hgt, alp = tex('color', 'sRGB'), tex('rough', 'Non-Color'), tex('metal', 'Non-Color'), tex('height', 'Non-Color'), tex('alpha', 'Non-Color')
    L.new(col.outputs['Color'], b.inputs['Base Color'])
    L.new(rgh.outputs['Color'], b.inputs['Roughness'])
    L.new(met.outputs['Color'], b.inputs['Metallic'])
    L.new(alp.outputs['Color'], b.inputs['Alpha'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.6; bump.inputs['Distance'].default_value = 0.04
    L.new(hgt.outputs['Color'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    # glossy solder-mask coat everywhere except bare gold
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = coat
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = coat
    L.new(met.outputs['Color'], mul.inputs[0])
    L.new(mul.outputs[0], inv.inputs[1]); L.new(inv.outputs[0], b.inputs['Coat Weight'])
    b.inputs['Coat Roughness'].default_value = 0.18
    return m

M = {}
M['pcb_F'] = board_material('PCB_ComponentSide', 'e1', 'F')
M['pcb_B'] = board_material('PCB_ScreenSide', 'e1', 'B')
M['pcb_edge'], _ = principled('PCB_FR4_Edge', srgb('#8f9a62'), 0.6)
M['tag_F'] = board_material('Tag_Front', 'tag', 'F')
M['tag_B'] = board_material('Tag_Back', 'tag', 'B')

# clear cast resin / acrylic
def resin(name, rough=0.0, tint=(0.86, 0.97, 0.91), density=0.0045):
    m, b = principled(name, (1, 1, 1), rough, 0, IOR=1.49)
    b.inputs['Transmission Weight'].default_value = 1.0
    b.inputs['Specular IOR Level'].default_value = 0.5
    N = m.node_tree.nodes; out = N['Material Output']
    vol = N.new('ShaderNodeVolumeAbsorption'); vol.inputs['Color'].default_value = (*tint, 1); vol.inputs['Density'].default_value = density
    m.node_tree.links.new(vol.outputs[0], out.inputs['Volume'])
    # shadow rays pass through the clear resin (otherwise, with refractive caustics off, the glass would
    # black out everything inside it). Camera / reflection / refraction rays still see real glass.
    lp = N.new('ShaderNodeLightPath'); tr = N.new('ShaderNodeBsdfTransparent'); tr.inputs['Color'].default_value = (*tint, 1)
    mix = N.new('ShaderNodeMixShader')
    m.node_tree.links.new(lp.outputs['Is Shadow Ray'], mix.inputs['Fac'])
    m.node_tree.links.new(b.outputs['BSDF'], mix.inputs[1]); m.node_tree.links.new(tr.outputs['BSDF'], mix.inputs[2])
    m.node_tree.links.new(mix.outputs[0], out.inputs['Surface'])
    return m
M['resin'] = resin('Resin_Clear')
M['seam'] = resin('Resin_LaminateSeam', rough=0.45, tint=(0.95, 0.98, 0.96), density=0.02)
M['fob'] = resin('Resin_TagFob', rough=0.03)
M['frost'] = resin('Resin_CutEdge_Frosted', rough=0.12, tint=(0.88, 0.97, 0.92), density=0.0045)

M['ceramic'], _ = principled('MLCC_Ceramic', srgb('#9b7655'), 0.55)
M['ceramic_lt'], _ = principled('MLCC_Ceramic_Small', srgb('#b49272'), 0.5)
M['tin'], _ = principled('Solder_Tin', srgb('#c8ccd0'), 0.22, 1.0)
M['epoxy'], _ = principled('IC_Epoxy', srgb('#1c1c1e'), 0.45)
M['res_top'], _ = principled('Resistor_Top', srgb('#161616'), 0.5)
M['res_body'], _ = principled('Resistor_Ceramic', srgb('#e8e6de'), 0.55)
M['ferrite'], _ = principled('Inductor_Ferrite', srgb('#3a3a3c'), 0.6)
M['silicon'], _ = principled('WLCSP_Silicon', srgb('#2a2c36'), 0.18, 0.4)
M['metal_lid'], _ = principled('Crystal_Lid', srgb('#cfd2d4'), 0.3, 1.0)
M['gold'], _ = principled('Gold_Contact', srgb('#d6ad62'), 0.25, 1.0)
M['conn_body'], _ = principled('Connector_Body', srgb('#e9dfc8'), 0.45)
M['conn_lever'], _ = principled('Connector_Actuator', srgb('#222222'), 0.4)
M['led'], _ = principled('LED_Lens', srgb('#f2efe6'), 0.2, 0, **{'Transmission Weight': 0.6})
M['glass_tft'] = resin('Display_TFT_Glass', rough=0.02, tint=(0.88, 0.95, 0.9), density=0.02)
M['glass_touch'] = resin('Display_Touch_Glass', rough=0.0, tint=(0.95, 0.98, 0.96), density=0.01)
M['tft_edge'], _ = principled('Display_TFT_Back', srgb('#b9c0b6'), 0.35, 0.6)
M['driver_ic'], _ = principled('Display_Driver_IC', srgb('#121212'), 0.3)

def fpl_material():
    m, b = principled('EInk_FrontPlane', rough=0.55)
    N = m.node_tree.nodes; t = N.new('ShaderNodeTexImage'); t.image = img('eink_fpl.png')
    m.node_tree.links.new(N.new('ShaderNodeTexCoord').outputs['UV'], t.inputs['Vector'])
    m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m
M['fpl'] = fpl_material()

def fpc_material(name, prefix):
    """Polyimide (Kapton) flex: translucent amber film, copper traces under a glossy coverlay.
    Maps from tools/make_fpc_textures.py (tex/<prefix>_color|metal|rough|height.png)."""
    m, b = principled(name, rough=0.2, IOR=1.7)
    nt = m.node_tree; N = nt.nodes; L = nt.links
    uv = N.new('ShaderNodeTexCoord')
    def tex(k, cs):
        t = N.new('ShaderNodeTexImage'); t.image = img(f'{prefix}_{k}.png', cs); t.interpolation = 'Cubic'
        L.new(uv.outputs['UV'], t.inputs['Vector']); return t
    col, met, rgh, hgt = tex('color', 'sRGB'), tex('metal', 'Non-Color'), tex('rough', 'Non-Color'), tex('height', 'Non-Color')
    L.new(col.outputs['Color'], b.inputs['Base Color'])
    L.new(met.outputs['Color'], b.inputs['Metallic'])
    L.new(rgh.outputs['Color'], b.inputs['Roughness'])
    # light passes through the bare film (board shows through, amber-tinted), not through the copper
    tr = N.new('ShaderNodeMath'); tr.operation = 'MULTIPLY_ADD'
    tr.inputs[1].default_value = -0.6 / 0.55; tr.inputs[2].default_value = 0.45     # 0.45 film → ~0 copper
    L.new(met.outputs['Color'], tr.inputs[0]); tr.use_clamp = True
    L.new(tr.outputs[0], b.inputs['Transmission Weight'])
    # traces raised under the coverlay + very gentle waviness of the thin film
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = 0.02
    L.new(hgt.outputs['Color'], bump.inputs['Height'])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0; nz.inputs['Detail'].default_value = 2.0
    L.new(uv.outputs['Object'], nz.inputs['Vector'])
    bump2 = N.new('ShaderNodeBump'); bump2.inputs['Strength'].default_value = 0.08; bump2.inputs['Distance'].default_value = 0.2
    L.new(nz.outputs['Fac'], bump2.inputs['Height']); L.new(bump.outputs['Normal'], bump2.inputs['Normal'])
    L.new(bump2.outputs['Normal'], b.inputs['Normal'])
    # glossy coverlay on top (sharp reflections are what makes it read as film, not paint)
    b.inputs['Coat Weight'].default_value = 1.0; b.inputs['Coat Roughness'].default_value = 0.05
    b.inputs['Coat IOR'].default_value = 1.6; b.inputs['Coat Tint'].default_value = (1.0, 0.86, 0.62, 1)
    L.new(bump2.outputs['Normal'], b.inputs['Coat Normal'])
    return m
M['fpc_disp'] = fpc_material('FPC_Display_Polyimide', 'fpcr_display')
M['fpc_touch'] = fpc_material('FPC_Touch_Polyimide', 'fpcr_touch')

def stiffener_material():
    """Thick polyimide stiffener behind the connector end: darker amber, satin finish, slightly translucent."""
    m, b = principled('FPC_Stiffener', srgb('#a85d18'), 0.38, 0, IOR=1.7)
    nt = m.node_tree; N = nt.nodes; L = nt.links
    b.inputs['Transmission Weight'].default_value = 0.2
    b.inputs['Coat Weight'].default_value = 0.4; b.inputs['Coat Roughness'].default_value = 0.2
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 40.0; nz.inputs['Detail'].default_value = 6.0
    L.new(N.new('ShaderNodeTexCoord').outputs['Object'], nz.inputs['Vector'])
    rr = N.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = 0.3; rr.inputs['To Max'].default_value = 0.48
    L.new(nz.outputs['Fac'], rr.inputs['Value']); L.new(rr.outputs['Result'], b.inputs['Roughness'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.05
    L.new(nz.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m
M['stiffener'] = stiffener_material()

def marked(name, texname):
    m, b = principled(name, rough=0.42)
    N = m.node_tree.nodes; t = N.new('ShaderNodeTexImage'); t.image = img(texname)
    m.node_tree.links.new(N.new('ShaderNodeTexCoord').outputs['Generated'], t.inputs['Vector'])
    m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m
M['qfn_mark'] = marked('IC_QFN_Marking', 'mark_qfn.png')

# ------------------------------------------------------------------ geometry helpers
def rrect(w, h, r, seg=8, cx=0.0, cz=0.0):
    """rounded rectangle in the X-Z plane, CCW, as list of (x, z)."""
    pts = []
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    for (qx, qz, a0) in [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)]:
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg); pts.append((cx + qx + r * math.cos(a), cz + qz + r * math.sin(a)))
    return pts

def offset_rrect(w, h, r, d, seg=8, cx=0.0, cz=0.0):
    return rrect(w + 2 * d, h + 2 * d, max(r + d, 0.05), seg, cx, cz)

def slab(name, loops_xz, y0, y1, c, mat_top, mat_bot, mat_side, uv_fn=None):
    """Extrude polygon-with-holes (first loop outer) between y0 (bottom/back) and y1 (top/front)."""
    flat = [p for l in loops_xz for p in l]
    tris = tessellate_polygon([[Vector((x, z, 0)) for x, z in l] for l in loops_xz])
    n = len(flat)
    verts = [(x, y1, z) for x, z in flat] + [(x, y0, z) for x, z in flat]
    faces, idx = [], []
    for t in tris:   # orient top faces to +Y
        a, b_, c_ = (Vector(verts[i]) for i in t)
        nrm = (b_ - a).cross(c_ - a)
        tt = t if nrm.y > 0 else (t[0], t[2], t[1])
        faces.append(tt); idx.append(0)
        faces.append((tt[0] + n, tt[2] + n, tt[1] + n)); idx.append(1)
    base = 0
    for l in loops_xz:
        m = len(l)
        for i in range(m):
            a, b_ = base + i, base + (i + 1) % m
            faces.append((a, b_, b_ + n, a + n)); idx.append(2)
        base += m
    uvs = None
    if uv_fn: uvs = [uv_fn(v[0], v[2]) for v in verts]
    ob = mesh_obj(name, verts, faces, c, uvs, [mat_top, mat_bot, mat_side], idx)
    # fix side-face winding (outward normals)
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free()
    return ob

def box_mesh(name, sx, sy, sz, bevel=0.0, seg=2):
    """box centred at origin, size along x, y, z (z = up from board)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(bevel, min(sx, sy, sz) * 0.45), segments=seg, affect='EDGES', profile=0.5)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = bevel > 0
    return me

def join_parts(name, parts):
    """parts: list of (mesh, material, matrix) → one mesh datablock with material slots."""
    bm = bmesh.new(); mats = []
    for me, mat, mtx in parts:
        if mat not in mats: mats.append(mat)
        tmp = me.copy(); tmp.transform(mtx)
        mi = mats.index(mat)
        for p in tmp.polygons: p.material_index = mi
        bm.from_mesh(tmp); bpy.data.meshes.remove(tmp)
    out = bpy.data.meshes.new(name); bm.to_mesh(out); bm.free()
    for m in mats: out.materials.append(m)
    return out

T = Matrix.Translation
def S(x, y, z): return Matrix.Diagonal((x, y, z, 1))

# ------------------------------------------------------------------ PCB
def kloop_to_xz(loop): return [(K(x, y).x, K(x, y).z) for x, y in loop]
loops = [kloop_to_xz(l[:-1] if math.dist(l[0], l[-1]) < 1e-3 else l) for l in META['outline']]
W_MM, H_MM = KX1 - KX0, KY1 - KY0
def board_uv(x, z):
    kx = CX - z; ky = CY - x
    return ((kx - KX0) / W_MM, 1 - (ky - KY0) / H_MM)
pcb = slab('PCB_E1', loops, Y_PCB_F, Y_PCB_B, C_PCB, M['pcb_B'], M['pcb_F'], M['pcb_edge'], board_uv)

# ------------------------------------------------------------------ component packages (local: x = length, y = width, z = height; origin on board surface)
PK = {}
def pkg(key, parts):
    PK[key] = join_parts('PKG_' + key, parts)

def chip_passive(key, L, Wd, Hh, body, term_len, kind='C'):
    b = box_mesh('b', L - 2 * term_len * 0.6, Wd, Hh, bevel=min(0.04, Hh * 0.1))
    t = box_mesh('t', term_len, Wd * 1.02, Hh * 1.02, bevel=min(0.05, Hh * 0.12))
    parts = [(b, body, T((0, 0, Hh / 2)))]
    for s in (-1, 1): parts.append((t, M['tin'], T((s * (L / 2 - term_len / 2), 0, Hh / 2 + 0.001))))
    if kind == 'R':
        top = box_mesh('rt', L - 2 * term_len, Wd * 0.96, 0.03)
        parts.append((top, M['res_top'], T((0, 0, Hh + 0.012))))
    pkg(key, parts)

chip_passive('C1210', 3.2, 2.5, 2.5, M['ceramic'], 0.55)           # 47 µF / 16 V bank (D1 CAD: 3.2×2.5×2.5)
chip_passive('C0603', 1.6, 0.8, 0.8, M['ceramic_lt'], 0.35)
chip_passive('C0402', 1.0, 0.5, 0.5, M['ceramic_lt'], 0.25)
chip_passive('R0603', 1.6, 0.8, 0.45, M['res_body'], 0.3, 'R')
chip_passive('R0402', 1.0, 0.5, 0.35, M['res_body'], 0.22, 'R')
chip_passive('L0603', 1.6, 0.8, 0.8, M['ferrite'], 0.3)
chip_passive('L0402', 1.0, 0.5, 0.5, M['ferrite'], 0.22)

def gullwing(key, bl, bw, bh, pins_per_side, pitch, lead_w=0.3, lead_reach=0.45, sides=2):
    body = box_mesh('body', bl, bw, bh, bevel=0.06)
    parts = [(body, M['epoxy'], T((0, 0, bh / 2 + 0.08)))]
    lead = box_mesh('lead', lead_w, lead_reach, 0.12, bevel=0.03)
    for side in (-1, 1)[:sides]:
        n = pins_per_side[0] if side < 0 else pins_per_side[1]
        for i in range(n):
            x = (i - (n - 1) / 2) * pitch
            parts.append((lead, M['tin'], T((x, side * (bw / 2 + lead_reach / 2 - 0.05), 0.08))))
    pkg(key, parts)
gullwing('SOT323', 2.0, 1.25, 0.9, (3, 3), 0.65)
gullwing('SOT353', 2.0, 1.25, 0.9, (3, 2), 0.65)
gullwing('TSOT23_6', 2.9, 1.6, 0.85, (3, 3), 0.95)
gullwing('SOT563', 1.6, 1.2, 0.55, (3, 3), 0.5, lead_w=0.25, lead_reach=0.2)

def sod323():
    body = box_mesh('b', 1.7, 1.25, 0.8, bevel=0.08)
    lead = box_mesh('l', 0.35, 0.35, 0.12, bevel=0.03)
    pkg('SOD323F', [(body, M['epoxy'], T((0, 0, 0.42))), (lead, M['tin'], T((-1.05, 0, 0.06))), (lead, M['tin'], T((1.05, 0, 0.06)))])
sod323()

def no_lead(key, bl, bw, bh, pins, pitch, ep=None, mark=None):
    body = box_mesh('b', bl, bw, bh, bevel=0.03)
    parts = [(body, mark or M['epoxy'], T((0, 0, bh / 2)))]
    pad = box_mesh('p', 0.22, 0.3, bh * 0.25)
    per = pins // 4 if pins >= 16 else pins // 2
    sides = 4 if pins >= 16 else 2
    for s in range(sides):
        for i in range(per):
            o = (i - (per - 1) / 2) * pitch
            if s < 2:  # long sides ±y
                sg = 1 if s == 0 else -1
                parts.append((pad, M['tin'], T((o, sg * (bw / 2 - 0.13), bh * 0.125 - 0.005))))
            else:
                sg = 1 if s == 2 else -1
                parts.append((pad, M['tin'], T((sg * (bl / 2 - 0.13), o, bh * 0.125 - 0.005)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')))
    pkg(key, parts)
no_lead('QFN40', 5.0, 5.0, 0.85, 40, 0.4, mark=M['qfn_mark'])
no_lead('SON8', 3.0, 2.0, 0.75, 8, 0.5)
no_lead('WSON8', 2.0, 2.0, 0.75, 8, 0.5)
no_lead('UQFN12', 2.0, 2.0, 0.55, 12, 0.4)

def wlcsp():
    die = box_mesh('d', 1.45, 1.05, 0.35, bevel=0.01)
    ball = box_mesh('ball', 0.2, 0.2, 0.15, bevel=0.07, seg=3)
    parts = [(die, M['silicon'], T((0, 0, 0.32)))]
    for i in range(3):
        for j in range(4):
            parts.append((ball, M['tin'], T(((j - 1.5) * 0.35, (i - 1) * 0.35, 0.08))))
    pkg('WLCSP12', parts)
wlcsp()

def crystal(key, bl, bw, bh):
    base = box_mesh('b', bl, bw, bh * 0.45, bevel=0.03)
    lid = box_mesh('l', bl * 0.9, bw * 0.86, bh * 0.55, bevel=0.06)
    pkg(key, [(base, M['ceramic_lt'], T((0, 0, bh * 0.225))), (lid, M['metal_lid'], T((0, 0, bh * 0.72)))])
crystal('XTAL2012', 2.0, 1.2, 0.6)
crystal('XTAL2016', 2.0, 1.6, 0.55)

def mapi3015():
    core = box_mesh('c', 3.0, 3.0, 1.5, bevel=0.12, seg=3)
    term = box_mesh('t', 0.7, 2.6, 0.08)
    pkg('MAPI3015', [(core, M['ferrite'], T((0, 0, 0.75))), (term, M['tin'], T((-1.15, 0, 0.04))), (term, M['tin'], T((1.15, 0, 0.04)))])
mapi3015()

def fh34(key, pins):
    width = pins * 0.5 + 2.2
    body = box_mesh('b', width, 2.9, 0.9, bevel=0.05)
    lever = box_mesh('a', width - 0.6, 1.1, 0.25, bevel=0.05)
    pin = box_mesh('p', 0.2, 0.7, 0.1)
    parts = [(body, M['conn_body'], T((0, 0.3, 0.45))), (lever, M['conn_lever'], T((0, -1.15, 0.85)))]
    for i in range(pins):
        parts.append((pin, M['gold'], T(((i - (pins - 1) / 2) * 0.5, 1.95, 0.05))))
    ear = box_mesh('e', 0.6, 0.9, 0.5)
    for s in (-1, 1): parts.append((ear, M['tin'], T((s * (width / 2 + 0.2), 0.3, 0.25))))
    pkg(key, parts)
fh34('FH34_24', 24); fh34('FH34_6', 6)

def led0603():
    b = box_mesh('b', 1.6, 0.8, 0.35, bevel=0.03); l = box_mesh('l', 1.2, 0.7, 0.3, bevel=0.08)
    pkg('LED0603', [(b, M['res_body'], T((0, 0, 0.18))), (l, M['led'], T((0, 0, 0.5)))])
led0603()

def classify(name):
    n = name
    if n.startswith('C_1210'): return 'C1210'
    if n.startswith('C_0603'): return 'C0603'
    if n.startswith('C_0402'): return 'C0402'
    if n.startswith('R_0603'): return 'R0603'
    if n.startswith('R_0402'): return 'R0402'
    if n.startswith('L_0603'): return 'L0603'
    if n.startswith('L_0402'): return 'L0402'
    if n.startswith('SOT-323'): return 'SOT323'
    if n.startswith('SOT-353'): return 'SOT353'
    if n.startswith('SOT-563'): return 'SOT563'
    if n.startswith('TSOT-23-6'): return 'TSOT23_6'
    if n.startswith('D_SOD-323'): return 'SOD323F'
    if n.startswith('QFN-40'): return 'QFN40'
    if n.startswith('SON-8'): return 'SON8'
    if n.startswith('WSON-8'): return 'WSON8'
    if n.startswith('Texas_R-PUQFN'): return 'UQFN12'
    if n.startswith('WLCSP'): return 'WLCSP12'
    if n.startswith('Crystal_SMD_2012'): return 'XTAL2012'
    if n.startswith('Crystal_SMD_2016'): return 'XTAL2016'
    if n.startswith('L_Wuerth_MAPI-3015'): return 'MAPI3015'
    if n.startswith('GDEY027T91'): return 'FH34_24'     # the display footprint carries the 24-pin FPC connector
    if n.startswith('HRS_FH34SRJ-6S'): return 'FH34_6'
    if n.startswith('LED_DUAL_0603'): return 'LED0603'
    return None   # test points, fiducials, holes, jumpers, logos, programming pads — flat, already in the textures

# KiCad rotation θ (deg, CCW on screen, y down): local +x → board dir (cos θ, −sin θ)
def part_matrix(kx, ky, rot, side):
    a = math.radians(rot)
    dx = K(kx + math.cos(a), ky - math.sin(a)) - K(kx, ky)
    if side == 'F':
        up = Vector((0, -1, 0)); origin = K(kx, ky, Y_PCB_F)
    else:
        up = Vector((0, 1, 0)); origin = K(kx, ky, Y_PCB_B)
        dx.x = -dx.x   # B-side footprints are stored mirrored
    dx.normalize(); dy = up.cross(dx)
    m = Matrix((dx, dy, up)).transposed().to_4x4(); m.translation = origin
    return m

by_type = {}
for p in META['parts']:
    k = classify(p['name'])
    if not k: continue
    side = 'F' if p['layer'] == 'F.Cu' else 'B'
    by_type.setdefault(k, []).append(part_matrix(p['x'], p['y'], p['rot'], side))
n_parts = 0
for k, mats in by_type.items():
    # one object per package type, real geometry instanced via linked duplicates
    for i, mtx in enumerate(mats):
        ob = bpy.data.objects.new(f'{k}_{i + 1:02d}', PK[k]); link(ob, C_PARTS); ob.matrix_parent_inverse = Matrix(); ob.matrix_basis = mtx
        n_parts += 1
print('components placed:', n_parts)

# ------------------------------------------------------------------ display GDEY027T91-T01 (2.7" e-paper + touch)
kx_a, kx_b = DISP['kx0'], DISP['kx0'] + DISP['l']
z_a, z_b = K(kx_a, CY).z, K(kx_b, CY).z            # z_a > z_b (coil end on top)
xw = DISP['w'] / 2
LEDGE = 4.0                                        # TFT ledge at the FPC end (driver IC + bonding)
def rect_loop(x0, x1, z0, z1, r=0.4):
    return rrect(abs(x1 - x0), abs(z1 - z0), r, 4, (x0 + x1) / 2, (z0 + z1) / 2)
y = Y_DISP0
tft = slab('Display_TFT_Backplane', [rect_loop(-xw, xw, z_b, z_a, 0.3)], y, y + 0.6, C_DISP, M['glass_tft'], M['tft_edge'], M['glass_tft']); y += 0.6 + 0.01
fpl_z_top = z_a - LEDGE
def fpl_uv(x, z):   # landscape texture: u along the long axis from the coil end, v across
    return ((fpl_z_top - z) / (fpl_z_top - z_b), (xw - x) / (2 * xw))
fpl = slab('Display_EInk_FrontPlane', [rect_loop(-xw, xw, z_b, fpl_z_top, 0.2)], y, y + 0.12, C_DISP, M['fpl'], M['fpl'], M['fpl'], fpl_uv); y += 0.12 + 0.01
touch = slab('Display_Touch_Glass', [rect_loop(-xw, xw, z_b, z_a, 0.6)], y, y + 0.7, C_DISP, M['glass_touch'], M['glass_touch'], M['glass_touch']); y += 0.7
drv = slab('Display_Driver_IC', [rect_loop(-9.0, 9.0, z_a - 2.6, z_a - 1.4, 0.05)], Y_DISP0 + 0.6, Y_DISP0 + 0.78, C_DISP, M['driver_ic'], M['driver_ic'], M['driver_ic'])
Y_DISP_TOP = y
print('display top at', round(Y_DISP_TOP, 3), '(front surface', Y_FRONT, ')')

# ------------------------------------------------------------------ flexible printed circuits
def ribbon(name, path_yz, x0, x1, thick, mat, c, xs=None):
    """flat cable: centre-line path in the Y–Z plane, width along X from x0 to x1 (or per-point xs=[(x0,x1),...])."""
    verts, faces, uvs = [], [], []
    n = len(path_yz); acc = 0.0
    for i, (py, pz) in enumerate(path_yz):
        a = path_yz[max(i - 1, 0)]; b = path_yz[min(i + 1, n - 1)]
        ty, tz = b[0] - a[0], b[1] - a[1]; L = math.hypot(ty, tz) or 1
        ny, nz = -tz / L, ty / L                      # normal in Y–Z
        if i: acc += math.hypot(py - path_yz[i - 1][0], pz - path_yz[i - 1][1])
        xa, xb = xs[i] if xs else (x0, x1)
        for s in (-1, 1):
            for xx in (xa, xb):
                verts.append((xx, py + s * ny * thick / 2, pz + s * nz * thick / 2)); uvs.append(((xx - xa) / max(xb - xa, 1e-3), acc / 12.0))
    for i in range(n - 1):
        a = i * 4; b = (i + 1) * 4
        faces += [(a + 2, a + 3, b + 3, b + 2), (a + 1, a, b, b + 1), (a, a + 2, b + 2, b), (a + 3, a + 1, b + 1, b + 3)]
    faces += [(0, 1, 3, 2), ((n - 1) * 4 + 2, (n - 1) * 4 + 3, (n - 1) * 4 + 1, (n - 1) * 4)]
    ob = mesh_obj(name, verts, faces, c, uvs, [mat], smooth=True)
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free()
    return ob

def arc_path(cy, cz, r, a0, a1, n=14):
    return [(cy + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]

# Display FPC: leaves the TFT ledge underside, runs to the coil-side edge of the main board, wraps through the
# 2 mm gap (KiCad x 84.96–86.96, y 104.7–116.2) and runs on the component side into the 24-pin FH34 connector.
x_lo, x_hi = K(0, 116.0).x, K(0, 104.9).x
z_edge = K(86.96, CY).z                       # main-board edge facing the coil
yf = Y_PCB_F - 0.07; yb = Y_PCB_B + 0.05
r = (yb - yf) / 2
path = [(yb, z_a - 2.0), (yb, z_edge + 0.05)] + arc_path((yb + yf) / 2, z_edge + 0.05, r, 90, -90)[1:] + \
       [(yf, z_edge - 0.4), (yf, K(110.0, CY).z)]
ribbon('FPC_Display', [(p[0], p[1]) for p in [(path[0][0], path[0][1])] + [(q[0], q[1] if i else q[1]) for i, q in enumerate(path[1:])]],
       x_lo, x_hi, 0.11, M['fpc_disp'], C_FPC)
# correct the arc to bulge towards the coil (z larger) — rebuild with proper orientation
bpy.data.objects.remove(bpy.data.objects['FPC_Display'])
bend = [(yb - (yb - yf) * (1 - math.cos(math.radians(t))) / 2, z_edge + 0.05 + r * math.sin(math.radians(t))) for t in range(0, 181, 12)]
path = [(yb, z_a - 2.0)] + bend + [(yf, K(110.3, CY).z)]
ribbon('FPC_Display', path, x_lo, x_hi, 0.11, M['fpc_disp'], C_FPC)
stf = slab('FPC_Display_Stiffener', [rect_loop(x_lo, x_hi, K(110.3, CY).z + 3.0, K(110.3, CY).z, 0.1)], yf - 0.25, yf - 0.05, C_FPC, M['stiffener'], M['stiffener'], M['stiffener'])

# Touch FPC: from the touch glass at the coil end, down through the slot (x 90.14–91.64, y 113–140.6),
# then along the component side to the 6-pin FH34 at (124.6, 137.75).  Square section carries the touch IC.
z_slot = K(90.89, CY).z
xt0, xt1 = K(0, 139.8).x, K(0, 132.6).x
yt = Y_PCB_F - 0.07
touch_path = [(Y_DISP_TOP - 0.35, z_a - 1.0), (Y_DISP_TOP - 0.35, z_slot + 0.9)] + \
             [(Y_DISP_TOP - 0.35 - (1 - math.cos(math.radians(t))) * 0.9, z_slot + 0.9 * math.cos(math.radians(t)) * 0 + 0.9 - 0.9 * math.sin(math.radians(t)) * 0 + (0.9 * math.cos(math.radians(t)) - 0.9)) for t in range(10, 91, 20)]
touch_path = [(Y_DISP_TOP - 0.35, z_a - 1.0), (Y_DISP_TOP - 0.35, z_slot + 0.75)]
for t in range(15, 91, 15):   # quarter bend down into the slot
    a = math.radians(t); touch_path.append((Y_DISP_TOP - 0.35 - 0.75 * math.sin(a), z_slot + 0.75 * math.cos(a)))
touch_path.append((yt + 0.75, z_slot))
for t in range(15, 91, 15):   # quarter bend along the back
    a = math.radians(t); touch_path.append((yt + 0.75 - 0.75 * math.sin(a), z_slot - 0.75 + 0.75 * math.cos(a)))
touch_path.append((yt, K(122.6, CY).z))
ribbon('FPC_Touch', touch_path, xt0, xt1, 0.09, M['fpc_touch'], C_FPC)
# wide section with the touch controller just behind the slot
pad_z0, pad_z1 = K(92.6, CY).z, K(101.4, CY).z
_pa, _pb = sorted((K(0, 136.2).x, K(0, 126.6).x))
# pad is a little thinner than the ribbon so where they overlap their faces never coincide (coincident faces flicker)
slab('FPC_Touch_Pad', [rect_loop(K(0, 136.2).x, K(0, 126.6).x, pad_z1, pad_z0, 0.6)], yt - 0.03, yt + 0.03, C_FPC, M['fpc_touch'], M['fpc_touch'], M['fpc_touch'],
     uv_fn=lambda x, z: ((x - _pa) / (_pb - _pa), z / 12.0))
ic = bpy.data.objects.new('Touch_Controller_IC', PK['UQFN12']); link(ic, C_FPC)
ic.matrix_basis = Matrix.Translation(K(97.0, 131.4, yt - 0.03)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Diagonal((1.6, 1.6, 1.4, 1)) @ Matrix.Rotation(math.pi, 4, 'X')

# ------------------------------------------------------------------ NFC tag fob (removable key fob in the coil window)
WIN_KX = (51.21 + 78.71) / 2; WIN_KY = (102.96 + 136.46) / 2
wc = K(WIN_KX, WIN_KY)
POCKET = dict(x=33.0, z=27.0, r=1.6, y0=-0.85)
FOB = dict(x=32.5, z=26.5, r=1.4, t=2.6)
fob_y0 = POCKET['y0'] + 0.02
fob = slab('Tag_Fob_Resin', [offset_rrect(FOB['x'], FOB['z'], FOB['r'], 0, 6, wc.x, wc.z)], fob_y0, fob_y0 + FOB['t'], C_TAG, M['fob'], M['fob'], M['fob'])
bev = fob.modifiers.new('EdgeBevel', 'BEVEL'); bev.width = 0.35; bev.segments = 3; bev.limit_method = 'ANGLE'
# tag PCB (21.5 × 27.5 mm, chip side towards the front) embedded at mid-depth
tx0, ty0, tx1, ty1 = TAGMETA['bbox_mm']; tcx, tcy = (tx0 + tx1) / 2, (ty0 + ty1) / 2
tag_loop = [((ty - tcy) + wc.x, -(tx - tcx) + wc.z) for tx, ty in TAGMETA['outline'][0]]
if math.dist(tag_loop[0], tag_loop[-1]) < 1e-3: tag_loop = tag_loop[:-1]
def tag_uv(x, z):
    ty = (x - wc.x) + tcy; tx = tcx - (z - wc.z)
    return ((tx - tx0) / (tx1 - tx0), 1 - (ty - ty0) / (ty1 - ty0))
ty_mid = fob_y0 + FOB['t'] / 2
slab('Tag_PCB', [tag_loop], ty_mid - 0.3, ty_mid + 0.3, C_TAG, M['tag_F'], M['tag_B'], M['pcb_edge'], tag_uv)
for p in TAGMETA['parts']:
    if p['name'].startswith('DFN-8'):
        tx, ty = p['x'], p['y']
        o = bpy.data.objects.new('Tag_NFC_Chip', PK['SON8']); link(o, C_TAG)
        o.matrix_basis = Matrix.Translation(Vector(((ty - tcy) + wc.x, ty_mid + 0.3, -(tx - tcx) + wc.z))) @ Matrix.Rotation(-math.pi / 2, 4, 'X') @ Matrix.Rotation(math.radians(p['rot']), 4, 'Z')

# ------------------------------------------------------------------ housing: cast clear resin, laminated look on the edge
Hw, Hl, Hr, E = HOUSING['w'], HOUSING['l'], HOUSING['r'], HOUSING['edge']
def ring(d, yv, seg=12): return [(x, yv, z) for x, z in offset_rrect(Hw - 2 * E, Hl - 2 * E, Hr - E, d, seg)]
profile = []          # (outward offset from the inner rounded rect, y)
for i in range(5):    # back edge fillet
    a = math.radians(90 * i / 4); profile.append((E * math.sin(a), Y_BACK + E * (1 - math.cos(a))))
side_ys = [Y_BACK + E]
for s in SEAMS: side_ys += [s - 0.06, s + 0.06]
side_ys += [Y_FRONT - E]
for yv in side_ys[1:-1]: profile.append((E, yv))
for i in range(5):    # front edge fillet
    a = math.radians(90 * i / 4); profile.append((E * math.cos(a), Y_FRONT - E * (1 - math.sin(a))))
rings = [ring(d, yv) for d, yv in profile]
m = len(rings[0]); verts = [v for rg in rings for v in rg]; faces = []; fmat = []
seam_band = {side_ys.index(s - 0.06) for s in SEAMS}
for k in range(len(rings) - 1):
    # identify which band of the side this quad strip is
    yk = profile[k][1]
    is_seam = any(abs(yk - (s - 0.06)) < 1e-6 for s in SEAMS)
    for i in range(m):
        a, b_ = k * m + i, k * m + (i + 1) % m
        faces.append((a, b_, b_ + m, a + m)); fmat.append(1 if is_seam else 0)
# caps (with the tag pocket cut later by boolean)
cap_b = rings[0]; cap_f = rings[-1]
base_b = 0; base_f = (len(rings) - 1) * m
for t in tessellate_polygon([[Vector((v[0], v[2], 0)) for v in cap_b]]):
    faces.append(tuple(base_b + i for i in t)); fmat.append(0)
for t in tessellate_polygon([[Vector((v[0], v[2], 0)) for v in cap_f]]):
    faces.append(tuple(base_f + i for i in t)); fmat.append(0)
housing = mesh_obj('Housing_Resin', verts, faces, C_HOUSING, None, [M['resin'], M['seam']], fmat, smooth=False)
bm = bmesh.new(); bm.from_mesh(housing.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(housing.data); bm.free()
# smooth shading only on the rounded edges (auto-smooth by angle)
housing.modifiers.new('SmoothByAngle', 'NODES') if False else None
housing.data.materials.append(M['frost'])
for p in housing.data.polygons:
    p.use_smooth = abs(p.normal.y) < 0.999
    if abs(p.normal.y) < 0.35 and p.material_index == 0: p.material_index = 2   # cut edges: lightly frosted
# tag pocket (front)
cut = slab('_cut_pocket', [offset_rrect(POCKET['x'], POCKET['z'], POCKET['r'], 0, 8, wc.x, wc.z)], POCKET['y0'], Y_FRONT + 1, C_HOUSING, M['resin'], M['resin'], M['resin'])
bv = cut.modifiers.new('b', 'BEVEL'); bv.width = 0.4; bv.segments = 3; bv.limit_method = 'ANGLE'
bpy.context.view_layer.objects.active = cut
bpy.context.view_layer.update()
bo = housing.modifiers.new('TagPocket', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = cut; bo.solver = 'EXACT'
bpy.context.view_layer.objects.active = housing
with bpy.context.temp_override(object=housing, active_object=housing):
    bpy.ops.object.modifier_apply(modifier='TagPocket')
bpy.data.objects.remove(cut)

# ------------------------------------------------------------------ studio
def area(name, size, loc, power, color=(1, 1, 1), shape='RECTANGLE', size_y=None, glossy=True, spread=1.0):
    ld = bpy.data.lights.new(name, 'AREA'); ld.shape = shape; ld.size = size; ld.energy = power; ld.color = color
    if size_y: ld.size_y = size_y
    ld.spread = spread
    ob = bpy.data.objects.new(name, ld); C_STUDIO.objects.link(ob); ob.location = loc
    tr = ob.constraints.new('TRACK_TO'); tr.target = pivot; tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'
    ob.visible_glossy = glossy
    ob.visible_transmission = False   # light sources must not be seen *through* the clear resin (white streaks)
    ob.visible_camera = False
    return ob
# key: big soft box front-left-top; fill: low right; two tall strip lights behind for the edge highlights; top kicker
area('Key_Softbox', 0.45, (-0.42, -0.55, 0.30), 28, shape='RECTANGLE', size_y=0.32, glossy=False)   # lights the board; reflections come from the strips (no flat glare on the glass)
area('Fill_Softbox', 0.6, (0.6, -0.45, -0.1), 8, color=(0.95, 0.98, 1.0), size_y=0.4, glossy=False)
area('Rim_Strip_L', 0.06, (-0.40, 0.30, 0.38), 11, color=(0.92, 1.0, 0.96), size_y=0.22, shape='RECTANGLE')
area('Rim_Strip_R', 0.06, (0.40, 0.32, 0.36), 11, color=(0.92, 1.0, 0.96), size_y=0.22, shape='RECTANGLE')
area('Top_Kicker', 0.25, (0.0, 0.0, 0.55), 6, size_y=0.25, glossy=False)
world = bpy.data.worlds.new('Studio_World'); scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.012, 0.013, 0.013, 1); bg.inputs['Strength'].default_value = 1.0

cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')); C_STUDIO.objects.link(cam)
cam.data.lens = 100; cam.data.sensor_fit = 'VERTICAL'; cam.data.sensor_height = 24
# Fixed camera. The 25° lean of the Figma hero is a camera roll (= a fixed 2-D rotation of the frame),
# so the device still turns about its OWN long axis. Distance fits the swept, leaned silhouette (fill ≈ 0.92).
EL, ROLL = math.radians(4.0), math.radians(25.0)
halfH = 0.06225 * math.cos(ROLL) + 0.02524 * math.sin(ROLL)
DIST = halfH / (0.12 * 0.88) + 0.025
cam.location = (0, -DIST * math.cos(EL), DIST * math.sin(EL))
cam.rotation_euler = (Matrix.Rotation(math.radians(90) - EL, 4, 'X') @ Matrix.Rotation(ROLL, 4, 'Z')).to_euler('XYZ')   # roll about the view axis only → device stays centred, leans CW
cam.data.clip_start = 0.05; cam.data.clip_end = 5
scene.camera = cam

# ------------------------------------------------------------------ choreography (same as the approved web prototype)
#   yaw   : one clockwise turn seen from above, about the device's own long axis
#   tilt  : pitch peaking at mid-turn (−4.5°·sin²(πt)), 0 at both ends
#   sweep : a narrow strip light travels across the front and catches the edges in profile
#   key   : ±8 % breathing
FRAMES = 120                                   # 3° per frame; frame N+1 would equal frame 1 (seamless)
scene.frame_start, scene.frame_end = 1, FRAMES
scene.render.fps = 30
START_YAW = math.radians(-22)                  # first frame: component side, three-quarter, edge visible
tiltg = bpy.data.objects.new('Tilt', None); C_DEV.objects.link(tiltg)
pivot.parent = tiltg
sweep = area('Sweep_Strip', 0.012, (0, -0.5, 0.2), 2.4, color=(0.96, 1.0, 0.98), size_y=0.5)
sweep.data.spread = math.radians(60)
key = bpy.data.objects['Key_Softbox']
def smooth(a, b, x):
    t = min(max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t)
for f in range(1, FRAMES + 2):
    t = (f - 1) / FRAMES
    pivot.rotation_euler = (0, 0, START_YAW - math.tau * t); pivot.keyframe_insert('rotation_euler', index=2, frame=f)
    tiltg.rotation_euler = (-math.radians(4.5) * math.sin(math.pi * t) ** 2, 0, 0); tiltg.keyframe_insert('rotation_euler', index=0, frame=f)
    az = math.radians(-55 + 110 * smooth(0.06, 0.94, t))
    sweep.location = (0.5 * math.sin(az), -0.5 * math.cos(az), 0.2); sweep.keyframe_insert('location', frame=f)
    key.data.energy = 28 * (1 + 0.08 * math.sin(math.tau * t)); key.data.keyframe_insert('energy', frame=f)
def linearize(idb):
    ad = idb.animation_data
    if not ad or not ad.action: return
    act = ad.action
    curves = list(getattr(act, 'fcurves', []) or [])
    try:
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags: curves += list(cb.fcurves)
    except AttributeError: pass
    for fc in curves:
        for k in fc.keyframe_points: k.interpolation = 'LINEAR'
for idb in (pivot, tiltg, sweep, key.data): linearize(idb)

# ------------------------------------------------------------------ render settings
r = scene.render
r.engine = 'CYCLES'; r.resolution_x, r.resolution_y = 1080, 1350; r.resolution_percentage = 100
r.film_transparent = True
scene.cycles.film_transparent_glass = True
scene.cycles.film_transparent_roughness = 0.3
scene.cycles.device = 'CPU'
scene.cycles.samples = 96
scene.cycles.use_adaptive_sampling = True; scene.cycles.adaptive_threshold = 0.012
scene.cycles.use_denoising = True
try: scene.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
scene.cycles.max_bounces = 16; scene.cycles.transmission_bounces = 16; scene.cycles.transparent_max_bounces = 16
scene.cycles.glossy_bounces = 8; scene.cycles.diffuse_bounces = 3
scene.cycles.caustics_reflective = False; scene.cycles.caustics_refractive = False
scene.cycles.blur_glossy = 1.0
scene.view_settings.view_transform = 'AgX'
scene.view_settings.exposure = -2.0
try: scene.view_settings.look = 'AgX - Punchy'
except Exception: pass
r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'; r.image_settings.color_depth = '16'

os.makedirs(os.path.join(ROOT, 'blender'), exist_ok=True)
for im in bpy.data.images: im.pack() if False else None
bpy.ops.file.make_paths_relative() if bpy.data.filepath else None
out = os.path.join(ROOT, 'blender', 'kampela_E1.blend')
bpy.ops.wm.save_as_mainfile(filepath=out)
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_mainfile()
print('saved', out)
