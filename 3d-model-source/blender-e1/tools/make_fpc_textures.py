"""Realistic flexible-printed-circuit (polyimide / Kapton) PBR textures.
   python3 tools/make_fpc_textures.py

For each cable writes tex/<name>_{color,metal,rough,height}.png. Width of the texture = full cable width,
the length tiles (1024 px = 12 mm of cable). Layers, as on a real FPC:
  * amber polyimide base film with slight lamination variation
  * copper traces under the coverlay — redder / darker, partly metallic, slightly raised
  * a copper-free margin along both edges, a few ground-plane hatch patches and vias
"""
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import random, os
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tex')


def fpc(name, lanes, w=512, h=1024, seed=1, margin=0.06, trace=0.52):
    r = random.Random(seed)
    cu = Image.new('L', (w, h), 0); d = ImageDraw.Draw(cu)            # copper mask
    x0, x1 = w * margin, w * (1 - margin)
    pitch = (x1 - x0) / lanes
    for i in range(lanes):
        cx = x0 + pitch * (i + 0.5)
        d.rectangle([cx - pitch * trace / 2, 0, cx + pitch * trace / 2, h], fill=255)
    # a couple of wider ground / power lanes at the edges
    d.rectangle([x0 - pitch * 0.15, 0, x0 + pitch * 0.15, h], fill=255)
    d.rectangle([x1 - pitch * 0.15, 0, x1 + pitch * 0.15, h], fill=255)
    cu = cu.filter(ImageFilter.GaussianBlur(1.1))                      # etched edges are not razor sharp

    # height: copper raised under the coverlay, coverlay rounds over it
    height = cu.filter(ImageFilter.GaussianBlur(3.5))
    height = Image.eval(height, lambda v: int(40 + v * 0.7))

    # base film colour with low-frequency lamination variation
    noise = Image.effect_noise((w // 32, h // 32), 40).convert('L').resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(12))
    film = Image.new('RGB', (w, h), (196, 112, 30))
    film_lt = Image.new('RGB', (w, h), (214, 132, 44))
    base = Image.composite(film_lt, film, noise)
    copper = Image.new('RGB', (w, h), (168, 84, 40))                   # copper seen through amber coverlay
    color = Image.composite(copper, base, cu)
    # fine grain
    grain = Image.effect_noise((w, h), 6).convert('L')
    color = ImageChops.add(color, Image.merge('RGB', [grain.point(lambda v: v // 6)] * 3), 1, -21)
    color.save(f'{OUT}/{name}_color.png', optimize=True)

    metal = cu.point(lambda v: int(v * 0.55))
    metal.save(f'{OUT}/{name}_metal.png', optimize=True)

    # coverlay is glossy; copper areas a touch smoother, faint streaks along the length (rolled film)
    streak = Image.effect_noise((w, 8), 30).convert('L').resize((w, h), Image.BICUBIC)
    rough = Image.eval(streak, lambda v: int(40 + (v - 128) * 0.12))
    rough = ImageChops.subtract(rough, cu.point(lambda v: v // 18))
    rough.save(f'{OUT}/{name}_rough.png', optimize=True)
    height.save(f'{OUT}/{name}_height.png', optimize=True)


fpc('fpcr_display', 24, seed=1)
fpc('fpcr_touch', 8, seed=2, trace=0.42)
print('ok')
