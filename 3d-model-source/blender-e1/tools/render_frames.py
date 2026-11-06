"""Render frames of the turntable animation.
   python3 tools/render_frames.py <outdir> <pct> <samples> <frames: 1,11,21 | 1-120> [threshold]"""
import bpy, sys, os, time
a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
outdir, pct, samples, spec = a[0], int(a[1]), int(a[2]), a[3]
thr = float(a[4]) if len(a) > 4 else 0.015
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(root, 'blender', 'kampela_E1.blend'))
s = bpy.context.scene
s.render.resolution_percentage = pct; s.cycles.samples = samples; s.cycles.adaptive_threshold = thr
s.render.use_persistent_data = True          # keep BVH/textures between frames
# KAMPELA_NO_SWEEP_GLOSS=1: the sweep strip lights the device but is not mirrored by the housing.
# Used to re-render the two frames (55, 105) where the strip's mirror image flashed for one frame.
if os.environ.get('KAMPELA_NO_SWEEP_GLOSS') == '1':
    bpy.data.objects['Sweep_Strip'].visible_glossy = False
frames = []
for part in spec.split(','):
    if '-' in part: x, y = map(int, part.split('-')); frames += list(range(x, y + 1))
    else: frames.append(int(part))
os.makedirs(outdir, exist_ok=True)
for f in frames:
    path = os.path.join(outdir, f'kampela_{f:04d}.png')
    if os.path.exists(path): continue          # resumable
    # In frames 3, 55, 105 the clear housing / glass faces the sweep strip exactly and mirrors it as a hard
    # white bar for one frame. There the strip is light-linked away from the glass parts only: it keeps lighting
    # the board (same sheen as the neighbouring frames) but is no longer mirrored by the housing.
    sweep = bpy.data.objects['Sweep_Strip']
    if f in (3, 55, 105):
        if not sweep.light_linking.receiver_collection:
            lc = bpy.data.collections.new('Sweep_NoGlass')
            for n in ('Housing_Resin', 'Display_Touch_Glass', 'Display_TFT_Backplane', 'Tag_Fob_Resin'):
                lc.objects.link(bpy.data.objects[n])
            for co in lc.collection_objects: co.light_linking.link_state = 'EXCLUDE'
            sweep.light_linking.receiver_collection = lc
    else:
        sweep.light_linking.receiver_collection = None
    sweep.visible_glossy = os.environ.get('KAMPELA_NO_SWEEP_GLOSS') != '1'
    s.frame_set(f); s.render.filepath = path
    t = time.time(); bpy.ops.render.render(write_still=True)
    print(f'FRAME {f} {time.time() - t:.1f}s', flush=True)
