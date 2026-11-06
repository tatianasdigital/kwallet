// Headless test harness: renders turntable frames and/or exports the GLB.
//   node tools/render.mjs shots [query]     → out/shot-*.png at several yaw angles
//   node tools/render.mjs export            → public/models/kampela.glb
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] || 'shots';
const extra = process.argv[3] || '';
const PORT = 8765;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/dev/index.html?speed=0&${extra}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  fs.mkdirSync(path.join(root, 'out'), { recursive: true });

  if (mode === 'export') {
    const b64 = await page.evaluate(() => window.exportGLB());
    const out = path.join(root, 'public/models/kampela.glb');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(0), 'KB');
  } else {
    const angles = (process.env.ANGLES || '0,0.6,1.5708,2.4,3.1416,4.7124').split(',').map(Number);
    for (const a of angles) {
      await page.evaluate((a) => { window.viewer.pause(); window.viewer.setAngle(a); }, a);
      await page.waitForTimeout(150);
      const f = path.join(root, 'out', `shot-${a.toFixed(2)}.png`);
      await page.screenshot({ path: f });
      console.log('shot', f);
    }
  }
} finally {
  await browser.close();
  srv.kill();
}
