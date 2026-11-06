"""E-ink screen, FPC and IC-marking textures (PIL).  python3 tools/make_textures.py"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random, os
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tex')
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'

# ---------------------------------------------------------------- e-paper front plane (FPL) — 66.4 × 45.8 mm
# drawn LANDSCAPE exactly as the screen reads in the photos (coil on the left of the device).
PX = 40
W_MM, H_MM = 66.4, 45.8
AA_W, AA_H = 57.29, 38.19                    # active area of GDEY027T91 (2.7", 264×176)
W, H = int(W_MM * PX), int(H_MM * PX)
img = Image.new('RGB', (W, H), (196, 192, 182))          # FPL border (grey, slightly warm)
d = ImageDraw.Draw(img)
# edge seal (tan) right at the FPL perimeter
d.rectangle([0, 0, W - 1, H - 1], outline=(170, 138, 92), width=int(0.6 * PX))
# touch-panel silver bus traces around the viewing area
ax0 = (W_MM - AA_W) / 2 * PX; ay0 = (H_MM - AA_H) / 2 * PX
d.rectangle([ax0 - 1.5 * PX, ay0 - 1.5 * PX, ax0 + AA_W * PX + 1.5 * PX, ay0 + AA_H * PX + 1.5 * PX], outline=(160, 160, 158), width=int(0.9 * PX))
d.rectangle([ax0 - 0.5 * PX, ay0 - 0.5 * PX, ax0 + AA_W * PX + 0.5 * PX, ay0 + AA_H * PX + 0.5 * PX], outline=(206, 204, 198), width=int(0.25 * PX))
# active area: e-ink white with subtle paper grain
aa = Image.new('RGB', (int(AA_W * PX), int(AA_H * PX)), (214, 215, 209))
g = Image.effect_noise(aa.size, 10).convert('L')
aa = Image.composite(Image.new('RGB', aa.size, (206, 207, 201)), aa, g.point(lambda v: 60 if v > 140 else 0))
ad = ImageDraw.Draw(aa)
# 264×176 px panel → 1 panel pixel = 0.217 mm; text drawn on that grid then up-scaled (crisp e-ink pixels)
pw, ph = 264, 176
low = Image.new('L', (pw, ph), 255); ld = ImageDraw.Draw(low)
font = ImageFont.truetype(MONO, 11)
lines = [(12, 'Please write down seed phrase'), (34, 'engage exile shock budget shaft'), (46, 'used mountain energy force across'),
         (58, 'pilot ginger sphere try erase'), (70, 'warfare comic side zebra roast'), (82, 'wrist slim tornado october'),
         (116, 'touch the screen when done')]
for y, t in lines:
    w = ld.textlength(t, font=font)
    if w > pw - 6:   # condense to fit (the panel font is narrow)
        tmp = Image.new('L', (int(w) + 4, 16), 255); ImageDraw.Draw(tmp).text((2, 0), t, font=font, fill=0)
        tmp = tmp.resize((pw - 8, 16)); low.paste(tmp, (4, y))
    else:
        ld.text(((pw - w) / 2, y), t, font=font, fill=0)
low = low.point(lambda v: 0 if v < 150 else 255)
ink = low.resize(aa.size, Image.NEAREST).filter(ImageFilter.GaussianBlur(0.6))
aa = Image.composite(aa, Image.new('RGB', aa.size, (40, 41, 44)), ink)
img.paste(aa, (int(ax0), int(ay0)))
img.save(f'{OUT}/eink_fpl.png', optimize=True)

# ---------------------------------------------------------------- FPC (polyimide) — tileable along length, 512 px across width
def fpc(name, lanes, w=512, h=1024, seed=1):
    r = random.Random(seed)
    im = Image.new('RGB', (w, h), (206, 128, 44)); d = ImageDraw.Draw(im)
    pitch = w / lanes
    for i in range(lanes):
        x = pitch * (i + 0.5)
        d.line([(x, 0), (x, h)], fill=(178, 96, 30), width=max(2, int(pitch * 0.45)))     # copper under coverlay (darker)
        d.line([(x - pitch * 0.12, 0), (x - pitch * 0.12, h)], fill=(232, 168, 90), width=max(1, int(pitch * 0.08)))
    im = im.filter(ImageFilter.GaussianBlur(0.8))
    im.save(f'{OUT}/{name}.png', optimize=True)
fpc('fpc_display', 24)
fpc('fpc_touch', 8, seed=2)

# ---------------------------------------------------------------- IC top markings (laser-etched look)
def marking(name, lines, size=(256, 256)):
    im = Image.new('RGB', size, (24, 24, 26)); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(MONO, size[1] // 7)
    for i, t in enumerate(lines):
        d.text((size[0] * 0.12, size[1] * (0.22 + 0.2 * i)), t, font=f, fill=(78, 78, 80))
    d.ellipse([size[0] * 0.08, size[1] * 0.78, size[0] * 0.16, size[1] * 0.86], fill=(46, 46, 48))
    im.save(f'{OUT}/{name}.png')
marking('mark_qfn', ['EFR32', 'MG12P', '432F1'])
marking('mark_small', ['T3', 'K2'], (128, 128))
print('textures written to', OUT)
