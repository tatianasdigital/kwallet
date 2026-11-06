"""Master PNG sequence (16-bit RGBA) → web sequence (WebP with alpha, two sizes).

    python3 tools/make_web_sequence.py <master_dir> <out_dir> [--placeholder] [--count N]

Writes <out_dir>/1080/kampela_0001.webp … and <out_dir>/720/… (frames 1..120) plus a poster
<out_dir>/poster.webp (= frame 1, 1080). With --placeholder, missing frames are filled with the nearest
rendered one (used only to test the player before the master render is finished).
"""
import sys, os, glob
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
placeholder = '--placeholder' in sys.argv
N = int(sys.argv[sys.argv.index('--count') + 1]) if '--count' in sys.argv else 120
SIZES = {'1080': (1080, 1350), '720': (720, 900)}
have = {int(os.path.basename(f)[8:12]): f for f in glob.glob(os.path.join(src, 'kampela_*.png'))}
if not have: sys.exit('no frames in ' + src)
for d in SIZES: os.makedirs(os.path.join(out, d), exist_ok=True)
total = {d: 0 for d in SIZES}
for i in range(1, N + 1):
    f = have.get(i)
    if f is None:
        if not placeholder: continue
        f = have[min(have, key=lambda k: min(abs(k - i), N - abs(k - i)))]
    im = Image.open(f)
    im = im.convert('RGBA') if im.mode != 'RGBA' else im
    for d, (w, h) in SIZES.items():
        fr = im.resize((w, h), Image.LANCZOS) if im.size != (w, h) else im
        p = os.path.join(out, d, f'kampela_{i:04d}.webp')
        fr.save(p, 'WEBP', quality=84, method=6, alpha_quality=90, exact=False)
        total[d] += os.path.getsize(p)
    if i == 1:
        im.resize(SIZES['1080'], Image.LANCZOS).save(os.path.join(out, 'poster.webp'), 'WEBP', quality=86, method=6)
for d, t in total.items(): print(f'{d}: {t / 1e6:.1f} MB')
