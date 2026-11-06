"""Fine-step 'sway' sequence for the device-benefits section.

    python3 tools/render_sway.py <outdir> <pct> <samples> [threshold]

The section shows the component side (frame 4 of the turn) and turns it a little back and forth. With the
turn's 3° steps the cross-faded neighbours show two outlines at the edges; this renders the same view in
0.5° steps instead: STEPS frames from -RANGE to +RANGE around frame 4's yaw, with everything else (tilt,
sweep strip, key light) frozen at frame 4's values, so only the rotation changes. Resumable.
"""
import bpy, sys, os, math, time
a = sys.argv[1:]
outdir, pct, samples = a[0], int(a[1]), int(a[2])
thr = float(a[3]) if len(a) > 3 else 0.02
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_FRAME, RANGE, STEP = 4, 7.5, 0.5          # turn frame, ± degrees, degrees per frame
STEPS = int(round(2 * RANGE / STEP)) + 1        # 31

bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'blender', 'kampela_E1.blend'))
s = bpy.context.scene
s.render.resolution_percentage = pct; s.cycles.samples = samples; s.cycles.adaptive_threshold = thr
s.render.use_persistent_data = True
s.frame_set(BASE_FRAME)

# freeze every animated value at frame 4, then drop the animation
pivot, tilt = bpy.data.objects['Turntable'], bpy.data.objects['Tilt']
frozen = []
for idb in (pivot, tilt, bpy.data.objects['Sweep_Strip'], bpy.data.objects['Key_Softbox'].data):
    vals = {}
    if hasattr(idb, 'location'): vals['location'] = tuple(idb.location); vals['rotation_euler'] = tuple(idb.rotation_euler)
    if hasattr(idb, 'energy'): vals['energy'] = idb.energy
    idb.animation_data_clear()
    for k, v in vals.items(): setattr(idb, k, v)
base_yaw = pivot.rotation_euler[2]
# the sweep strip lights the board but is not mirrored by the glass parts (near this view the flat housing
# would show it as a hard white bar over several degrees) — same light linking as turn frames 3, 55, 105
sweep = bpy.data.objects['Sweep_Strip']; sweep.visible_glossy = True
lc = bpy.data.collections.new('Sweep_NoGlass')
for n in ('Housing_Resin', 'Display_Touch_Glass', 'Display_TFT_Backplane', 'Tag_Fob_Resin'):
    lc.objects.link(bpy.data.objects[n])
for co in lc.collection_objects: co.light_linking.link_state = 'EXCLUDE'
sweep.light_linking.receiver_collection = lc

os.makedirs(outdir, exist_ok=True)
for i in range(STEPS):
    path = os.path.join(outdir, f'kampela_{i + 1:04d}.png')
    if os.path.exists(path): continue
    d = -RANGE + i * STEP                                  # i increases → same direction as the turn
    pivot.rotation_euler[2] = base_yaw - math.radians(d)
    s.render.filepath = path
    t = time.time(); bpy.ops.render.render(write_still=True)
    print(f'FRAME {i + 1} ({d:+.1f}°) {time.time() - t:.1f}s', flush=True)
