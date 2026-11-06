"""Render a KiCad board into PBR texture maps (per side): base colour, roughness, metallic, height, alpha.

    python3 tools/kicad_render.py <board.kicad_pcb> <out_prefix> [px_per_mm]

Output (side = F / B):  <prefix>_<side>_color.png, _rough.png, _metal.png, _height.png, plus <prefix>_alpha.png
and <prefix>_meta.json with the board bbox (mm) so geometry can be aligned with the textures.
Image orientation: x → right, KiCad y (down) → down, i.e. the board *as seen from the F (top) side*.
B-side maps are drawn in the same frame (NOT mirrored) — mirror at UV time.
"""
import sys, math, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from kicad import load, find, first

path, prefix = sys.argv[1], sys.argv[2]
PX = float(sys.argv[3]) if len(sys.argv) > 3 else 40.0
COIL_SILK_W = 0.55   # mm — CAD says 1.0; reference photos show thin lines with green gaps
B = load(path)

# ------------------------------------------------------------------ geometry helpers
def rot(x, y, deg):
    a = math.radians(deg)
    return x * math.cos(a) + y * math.sin(a), -x * math.sin(a) + y * math.cos(a)

def arc_points(start, mid, end, n=24):
    (x1, y1), (x2, y2), (x3, y3) = start, mid, end
    d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2))
    if abs(d) < 1e-9: return [start, end]
    ux = ((x1**2 + y1**2) * (y2 - y3) + (x2**2 + y2**2) * (y3 - y1) + (x3**2 + y3**2) * (y1 - y2)) / d
    uy = ((x1**2 + y1**2) * (x3 - x2) + (x2**2 + y2**2) * (x1 - x3) + (x3**2 + y3**2) * (x2 - x1)) / d
    r = math.hypot(x1 - ux, y1 - uy)
    a1, a2, a3 = (math.atan2(p[1] - uy, p[0] - ux) for p in (start, mid, end))
    def norm(a): return a % (2 * math.pi)
    # choose direction passing through mid
    ccw = norm(a2 - a1) < norm(a3 - a1)
    span = norm(a3 - a1) if ccw else -norm(a1 - a3)
    return [(ux + r * math.cos(a1 + span * i / n), uy + r * math.sin(a1 + span * i / n)) for i in range(n + 1)]

def ANG(at):
    nums = []
    for v in at[1:]:
        try: nums.append(float(v))
        except (TypeError, ValueError): pass
    return nums[2] if len(nums) > 2 else 0.0

def P(node, key):
    p = first(node, key)
    return (float(p[1]), float(p[2])) if p else None

# ------------------------------------------------------------------ board bbox from Edge.Cuts
edge = []
for g in B:
    if isinstance(g, list) and g[0] in ('gr_line', 'gr_arc') and first(g, 'layer') and first(g, 'layer')[1] == 'Edge.Cuts':
        edge.append(g)
pts = [P(g, k) for g in edge for k in ('start', 'end', 'mid') if P(g, k)]
X0, Y0 = min(p[0] for p in pts), min(p[1] for p in pts)
X1, Y1 = max(p[0] for p in pts), max(p[1] for p in pts)
W, H = int(round((X1 - X0) * PX)), int(round((Y1 - Y0) * PX))
def T(p): return ((p[0] - X0) * PX, (p[1] - Y0) * PX)

# ------------------------------------------------------------------ outline → closed loops (alpha mask)
segs = []
for g in edge:
    if g[0] == 'gr_line': segs.append([P(g, 'start'), P(g, 'end')])
    else: segs.append(arc_points(P(g, 'start'), P(g, 'mid'), P(g, 'end')))
# fp Edge.Cuts arcs (mouse bites)
for f in find(B, 'footprint'):
    fx, fy = float(first(f, 'at')[1]), float(first(f, 'at')[2]); fr = float(first(f, 'at')[3]) if len(first(f, 'at')) > 3 else 0
    for c in f:
        if isinstance(c, list) and c[0] in ('fp_arc', 'fp_line') and first(c, 'layer') and first(c, 'layer')[1] == 'Edge.Cuts':
            def g2(k):
                x, y = P(c, k); dx, dy = rot(x, y, fr); return (fx + dx, fy + dy)
            if c[0] == 'fp_line': segs.append([g2('start'), g2('end')])
            else: segs.append(arc_points(g2('start'), g2('mid'), g2('end')))

def chain(segs, tol=0.02):
    segs = [list(s) for s in segs]; loops = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while changed:
            changed = False
            for i, s in enumerate(segs):
                if math.dist(cur[-1], s[0]) < tol: cur += s[1:]; segs.pop(i); changed = True; break
                if math.dist(cur[-1], s[-1]) < tol: cur += s[::-1][1:]; segs.pop(i); changed = True; break
        loops.append(cur)
    return loops
loops = chain(segs)
def area(l): return 0.5 * sum(l[i][0] * l[i - 1][1] - l[i - 1][0] * l[i][1] for i in range(len(l)))
loops.sort(key=lambda l: -abs(area(l)))
alpha = Image.new('L', (W, H), 0); da = ImageDraw.Draw(alpha)
# even-odd fill: outer loop filled, inner loops (holes) cleared
for i, l in enumerate(loops):
    if len(l) < 3: continue
    da.polygon([T(p) for p in l], fill=255 if i == 0 else 0)

# ------------------------------------------------------------------ per-side layer images (mode L)
def blank(): return Image.new('L', (W, H), 0)
cu = {'F': blank(), 'B': blank()}
mask_open = {'F': blank(), 'B': blank()}
silk = {'F': blank(), 'B': blank()}
holes = blank()
D = {k: ImageDraw.Draw(v) for k, v in [('cuF', cu['F']), ('cuB', cu['B']), ('mF', mask_open['F']), ('mB', mask_open['B']),
                                         ('sF', silk['F']), ('sB', silk['B']), ('h', holes)]}
side_of = lambda layer: 'F' if layer.startswith('F.') else ('B' if layer.startswith('B.') else None)

def thick_line(d, a, b, w):
    a, b = T(a), T(b); w = max(1, w * PX)
    d.line([a, b], fill=255, width=int(round(w)))
    r = w / 2
    for p in (a, b): d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=255)

def polyline(d, pts, w):
    for a, b in zip(pts, pts[1:]): thick_line(d, a, b, w)

# tracks
for s in find(B, 'segment'):
    sd = side_of(first(s, 'layer')[1]); w = float(first(s, 'width')[1])
    if sd: thick_line(D['cu' + sd], P(s, 'start'), P(s, 'end'), w)
for s in find(B, 'arc'):
    sd = side_of(first(s, 'layer')[1]); w = float(first(s, 'width')[1])
    if sd: polyline(D['cu' + sd], arc_points(P(s, 'start'), P(s, 'mid'), P(s, 'end')), w)
# zones (filled)
for z in find(B, 'zone'):
    for fp in find(z, 'filled_polygon'):
        lay = first(fp, 'layer')[1]; sd = side_of(lay)
        xy = [(float(p[1]), float(p[2])) for p in first(fp, 'pts') if p[0] == 'xy']
        if sd and len(xy) > 2: D['cu' + sd].polygon([T(p) for p in xy], fill=255)
# vias (tented: copper ring both sides, drill hole)
for v in find(B, 'via'):
    c = P(v, 'at'); r = float(first(v, 'size')[1]) / 2; dr = float(first(v, 'drill')[1]) / 2
    for sd in 'FB':
        x, y = T(c); D['cu' + sd].ellipse([x - r * PX, y - r * PX, x + r * PX, y + r * PX], fill=255)
    x, y = T(c); D['h'].ellipse([x - dr * PX, y - dr * PX, x + dr * PX, y + dr * PX], fill=255)

def draw_shape(d, shape, cx, cy, sx, sy, ang, rr=0.0, poly=None):
    """pad-like shape centred at board coords (cx,cy), size sx×sy, rotation ang (deg, KiCad)."""
    if shape == 'circle':
        x, y = T((cx, cy)); r = sx / 2 * PX; d.ellipse([x - r, y - r, x + r, y + r], fill=255); return
    if shape == 'oval':
        if sx > sy: a, b, w = (-(sx - sy) / 2, 0), ((sx - sy) / 2, 0), sy
        else: a, b, w = (0, -(sy - sx) / 2), (0, (sy - sx) / 2), sx
        ra = rot(*a, ang); rb = rot(*b, ang)
        thick_line(d, (cx + ra[0], cy + ra[1]), (cx + rb[0], cy + rb[1]), w); return
    if shape == 'custom' and poly:
        d.polygon([T((cx + rot(*p, ang)[0], cy + rot(*p, ang)[1])) for p in poly], fill=255)
    # rect / roundrect / trapezoid / custom anchor
    r = rr * min(sx, sy) if shape == 'roundrect' else 0
    if r > 0:
        pts = []
        for (qx, qy, a0) in [(sx / 2 - r, sy / 2 - r, 0), (-sx / 2 + r, sy / 2 - r, 90), (-sx / 2 + r, -sy / 2 + r, 180), (sx / 2 - r, -sy / 2 + r, 270)]:
            for k in range(7):
                a = math.radians(a0 + 15 * k); pts.append((qx + r * math.cos(a), qy + r * math.sin(a)))
    else:
        pts = [(sx / 2, sy / 2), (-sx / 2, sy / 2), (-sx / 2, -sy / 2), (sx / 2, -sy / 2)]
    d.polygon([T((cx + rot(*p, ang)[0], cy + rot(*p, ang)[1])) for p in pts], fill=255)

try:
    FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
    ImageFont.truetype(FONT_PATH, 10)
except Exception:
    FONT_PATH = None

def draw_text(img, text, cx, cy, size, ang, justify=()):
    if not text.strip(): return
    fs = max(6, int(size * PX * 1.25))
    font = ImageFont.truetype(FONT_PATH, fs) if FONT_PATH else ImageFont.load_default()
    l, t, r, b = font.getbbox(text)
    tw, th = r - l, b - t
    tile = Image.new('L', (tw + 8, th + 8), 0)
    ImageDraw.Draw(tile).text((4 - l, 4 - t), text, fill=255, font=font)
    # scale glyph width to KiCad stroke-font proportions (~0.9 of height per char)
    target_w = int(len(text) * size * 0.95 * PX) + 8
    tile = tile.resize((max(8, target_w), int(size * PX) + 8))
    tile = tile.rotate(ang, expand=True, resample=Image.BICUBIC)
    x, y = T((cx, cy))
    if 'left' in justify: x += (target_w / 2) * math.cos(math.radians(ang)); y -= (target_w / 2) * math.sin(math.radians(ang))
    if 'right' in justify: x -= (target_w / 2) * math.cos(math.radians(ang)); y += (target_w / 2) * math.sin(math.radians(ang))
    img.paste(255, (int(x - tile.width / 2), int(y - tile.height / 2)), tile)

def text_props(node):
    eff = first(node, 'effects')
    if 'hide' in node or first(node, 'hide') is not None and first(node, 'hide')[1:] in (['yes'], []):
        return None, ()
    if eff is None: return 1.0, ()
    hidden = any(c == 'hide' or (isinstance(c, list) and c[0] == 'hide' and c[1:] == ['yes']) for c in eff)
    font = first(eff, 'font'); sz = float(first(font, 'size')[1]) if font and first(font, 'size') else 1.0
    j = first(eff, 'justify'); j = tuple(j[1:]) if j else ()
    return (None if hidden else sz), j

# board-level graphics
for g in B:
    if not (isinstance(g, list) and g[0].startswith('gr_') and first(g, 'layer')): continue
    lay = first(g, 'layer')[1]; sd = side_of(lay)
    if not sd or not lay.endswith(('SilkS', 'Cu', 'Mask')): continue
    tgt = {'SilkS': 'sB' if sd == 'B' else 'sF', 'Cu': 'cu' + sd, 'Mask': 'm' + sd}[lay.split('.')[1]]
    st = first(g, 'stroke'); w = float(first(st, 'width')[1]) if st and first(st, 'width') else (float(first(g, 'width')[1]) if first(g, 'width') else 0.15)
    if 'SilkS' in lay and w >= 0.9 and (P(g, 'start') or P(g, 'center'))[0] < X0 + 41: w = COIL_SILK_W
    if g[0] == 'gr_line': thick_line(D[tgt], P(g, 'start'), P(g, 'end'), w)
    elif g[0] == 'gr_arc': polyline(D[tgt], arc_points(P(g, 'start'), P(g, 'mid'), P(g, 'end')), w)
    elif g[0] == 'gr_circle':
        c = P(g, 'center'); e = P(g, 'end'); r = math.dist(c, e)
        polyline(D[tgt], [(c[0] + r * math.cos(a / 24 * math.tau), c[1] + r * math.sin(a / 24 * math.tau)) for a in range(25)], w)
    elif g[0] == 'gr_poly':
        xy = [(float(p[1]), float(p[2])) for p in first(g, 'pts') if p[0] == 'xy']
        D[tgt].polygon([T(p) for p in xy], fill=255)
    elif g[0] == 'gr_text':
        sz, j = text_props(g)
        at = first(g, 'at'); ang = (ANG(at) if len([v for v in at[1:] if v.replace('.','',1).replace('-','',1).isdigit()]) > 2 else 0)
        if sz: draw_text(silk[sd] if 'SilkS' in lay else cu[sd], g[1], float(at[1]), float(at[2]), sz, ang, j)

# footprints
parts = []
for f in find(B, 'footprint'):
    at = first(f, 'at'); fx, fy = float(at[1]), float(at[2]); fr = (ANG(at) if len([v for v in at[1:] if v.replace('.','',1).replace('-','',1).isdigit()]) > 2 else 0)
    flay = first(f, 'layer')[1]
    def G(x, y):
        dx, dy = rot(x, y, fr); return (fx + dx, fy + dy)
    ref = ''
    for c in f:
        if not isinstance(c, list): continue
        if c[0] in ('property', 'fp_text'):
            if c[0] == 'property' and c[1] == 'Reference': ref = c[2]
            lay = first(c, 'layer')
            if not lay or not lay[1].endswith('SilkS'): continue
            txt = c[2] if c[0] == 'property' else c[2]
            if c[0] == 'fp_text' and c[1] not in ('user', 'reference'): continue
            if c[0] == 'property' and c[1] not in ('Reference',): continue
            sz, j = text_props(c)
            if not sz: continue
            a = first(c, 'at'); ang = ANG(a)
            draw_text(silk[side_of(lay[1])], txt.replace('${REFERENCE}', ref), *G(float(a[1]), float(a[2])), sz, ang, j)
        elif c[0] in ('fp_line', 'fp_arc', 'fp_circle', 'fp_poly', 'fp_rect'):
            lay = first(c, 'layer')[1]; sd = side_of(lay)
            if not sd or not lay.endswith(('SilkS', 'Mask', 'Cu')): continue
            tgt = {'SilkS': 's' + sd, 'Cu': 'cu' + sd, 'Mask': 'm' + sd}[lay.split('.')[1]]
            st = first(c, 'stroke'); w = float(first(st, 'width')[1]) if st and first(st, 'width') else (float(first(c, 'width')[1]) if first(c, 'width') else 0.12)
            fill = first(c, 'fill'); filled = fill is not None and fill[1] in ('solid', 'yes')
            if c[0] == 'fp_line': thick_line(D[tgt], G(*P(c, 'start')), G(*P(c, 'end')), w)
            elif c[0] == 'fp_arc': polyline(D[tgt], [G(*p) for p in arc_points(P(c, 'start'), P(c, 'mid'), P(c, 'end'))], w)
            elif c[0] == 'fp_circle':
                cc = P(c, 'center'); e = P(c, 'end'); r = math.dist(cc, e)
                ring = [G(cc[0] + r * math.cos(a / 24 * math.tau), cc[1] + r * math.sin(a / 24 * math.tau)) for a in range(25)]
                if filled: D[tgt].polygon([T(p) for p in ring], fill=255)
                else: polyline(D[tgt], ring, w)
            elif c[0] == 'fp_rect':
                (ax, ay), (bx, by) = P(c, 'start'), P(c, 'end')
                ring = [G(ax, ay), G(bx, ay), G(bx, by), G(ax, by), G(ax, ay)]
                if filled: D[tgt].polygon([T(p) for p in ring], fill=255)
                else: polyline(D[tgt], ring, w)
            elif c[0] == 'fp_poly':
                xy = [G(float(p[1]), float(p[2])) for p in first(c, 'pts') if p[0] == 'xy']
                if len(xy) > 2:
                    if filled or fill is None: D[tgt].polygon([T(p) for p in xy], fill=255)
                    else: polyline(D[tgt], xy + xy[:1], w)
        elif c[0] == 'pad':
            ptype, shape = c[2], c[3]
            pa = first(c, 'at'); px, py = float(pa[1]), float(pa[2]); pang = (ANG(pa) if len([v for v in pa[1:] if v.replace('.','',1).replace('-','',1).isdigit()]) > 2 else fr)
            sx, sy = float(first(c, 'size')[1]), float(first(c, 'size')[2])
            rr = float(first(c, 'roundrect_rratio')[1]) if first(c, 'roundrect_rratio') else 0.25
            layers = first(c, 'layers')[1:] if first(c, 'layers') else []
            cx, cy = G(px, py)
            poly = None
            if shape == 'custom':
                prim = first(c, 'primitives')
                if prim:
                    gp = first(prim, 'gr_poly')
                    if gp: poly = [(float(p[1]), float(p[2])) for p in first(gp, 'pts') if p[0] == 'xy']
            mm = float(first(c, 'solder_mask_margin')[1]) if first(c, 'solder_mask_margin') else 0.05
            for L in layers:
                sides = 'FB' if L.startswith('*') else (side_of(L) or '')
                for sd in sides:
                    if L.endswith('.Cu'): draw_shape(D['cu' + sd], shape, cx, cy, sx, sy, pang, rr, poly)
                    if L.endswith('.Mask'): draw_shape(D['m' + sd], shape, cx, cy, sx + 2 * mm, sy + 2 * mm, pang, rr, poly)
            dr = first(c, 'drill')
            if dr and ptype in ('thru_hole', 'np_thru_hole'):
                vals = [v for v in dr[1:] if not isinstance(v, list) and v != 'oval']
                dx = float(vals[0]); dy = float(vals[1]) if len(vals) > 1 else dx
                draw_shape(D['h'], 'oval' if dx != dy else 'circle', cx, cy, dx, dy, pang)
    parts.append({'ref': ref, 'name': f[1].split(':')[-1], 'layer': flay, 'x': fx, 'y': fy, 'rot': fr})

# ------------------------------------------------------------------ composite PBR maps
alpha = ImageChops.subtract(alpha, holes)
def save(img, name): img.save(f'{prefix}_{name}.png', optimize=True)
save(alpha, 'alpha')
import numpy as np
a = np.asarray(alpha, dtype=np.float32) / 255
for sd in 'FB':
    c = np.asarray(cu[sd], dtype=np.float32) / 255
    m = np.asarray(mask_open[sd], dtype=np.float32) / 255
    s = np.asarray(silk[sd], dtype=np.float32) / 255
    s = s * (1 - m)                          # silk is clipped by mask openings
    # colours (linear-ish sRGB values, tuned against the reference photos)
    sub = np.array([9, 58, 36], np.float32)       # mask over bare FR4
    mcu = np.array([20, 98, 58], np.float32)      # mask over copper (lighter)
    gold = np.array([214, 172, 96], np.float32)    # ENIG
    fr4 = np.array([150, 140, 90], np.float32)     # exposed laminate (mask opening, no copper)
    silkc = np.array([236, 240, 234], np.float32)
    col = sub[None, None] * (1 - c[..., None]) + mcu[None, None] * c[..., None]
    open_ = m[..., None]
    col = col * (1 - open_) + (gold[None, None] * c[..., None] + fr4[None, None] * (1 - c[..., None])) * open_
    col = col * (1 - s[..., None]) + silkc[None, None] * s[..., None]
    rough = (0.36 * (1 - m) + 0.22 * m * c + 0.7 * m * (1 - c)) * (1 - s) + 0.62 * s
    metal = m * c
    height = 0.35 * c + 0.25 * s + 0.15 * (1 - m) - 0.1 * m * (1 - c)
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).save(f'{prefix}_{sd}_color.png', optimize=True)
    Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).save(f'{prefix}_{sd}_rough.png', optimize=True)
    Image.fromarray((np.clip(metal, 0, 1) * 255).astype(np.uint8)).save(f'{prefix}_{sd}_metal.png', optimize=True)
    h = Image.fromarray((np.clip(height, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(PX * 0.04))
    h.save(f'{prefix}_{sd}_height.png', optimize=True)

json.dump({'bbox_mm': [X0, Y0, X1, Y1], 'px_per_mm': PX, 'size_px': [W, H],
           'outline': [[list(p) for p in l] for l in loops], 'parts': parts}, open(f'{prefix}_meta.json', 'w'))
print('done', W, H, 'loops', len(loops), 'parts', len(parts))
