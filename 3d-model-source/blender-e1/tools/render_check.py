"""Quick geometry check renders at fixed yaw angles.  python3 tools/render_check.py out_prefix samples pct yaw1,yaw2,..  [opaque]"""
import bpy, sys, math, time, os
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
prefix, samples, pct, yaws = argv[0], int(argv[1]), int(argv[2]), [float(v) for v in argv[3].split(',')]
opaque = len(argv) > 4 and argv[4] == 'opaque'
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(root, 'blender', 'kampela_E1.blend'))
s = bpy.context.scene
s.cycles.samples = samples; s.render.resolution_percentage = pct
s.cycles.use_adaptive_sampling = True; s.cycles.adaptive_threshold = 0.03
s.render.image_settings.color_depth = '8'
if opaque: s.render.film_transparent = False
piv = bpy.data.objects['Turntable']; piv.animation_data_clear()
for y in yaws:
    piv.rotation_euler = (0, 0, math.radians(y))
    s.render.filepath = f'{prefix}_{int(y):+04d}.png'
    t = time.time(); bpy.ops.render.render(write_still=True); print('RENDER', y, round(time.time() - t, 1), 's')
