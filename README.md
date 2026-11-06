# Kampela — landing page

Desktop landing page built from the Figma file *Kampela* (frame `home-page`, 1920 × 1080 reference).

## Локальный запуск через PowerShell

Двойной щелчок по `start-site.cmd` или в PowerShell из этой папки:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-site.ps1               # авто: dev-сервер, если есть Node.js, иначе готовая сборка
powershell -ExecutionPolicy Bypass -File .\start-site.ps1 -Mode static  # готовая сборка из dist, Node.js не нужен
powershell -ExecutionPolicy Bypass -File .\start-site.ps1 -Mode build   # пересобрать dist и открыть
```

Параметры: `-Port 8080` — другой порт, `-NoBrowser` — не открывать браузер. Остановка — `Ctrl+C`.

## npm

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
npm run preview  # serve the build
```

## Structure

| File | What it holds |
|---|---|
| `index.html` | All page markup, sections named after the Figma layers |
| `src/styles.css` | Layout, fluid units, sticky device sequence, reduced-motion fallbacks |
| `src/main.js` | Marquee duplication, GSAP ScrollTrigger horizontal sections, active-step logic |
| `public/assets/` | Assets exported from Figma |

## Fluid units

* `--u` = `max(1024px, 100vw) / 1920` — one Figma pixel at the current width.
* `--s` = `min(--u, 100svh / 1080)` — used in full-screen "stages" (hero device, flat illustration,
  pinned horizontal sections) so they also fit shorter / taller desktop windows.

## Hero device → flat illustration

No scroll listeners: both elements are `position: sticky` inside tracks whose heights are pure CSS
`calc()`s, so the device stays at one viewport position, the opaque flat-design scene (higher
`z-index`, wavy mask from Figma) slides over it, and the illustration — stuck at the same
viewport centre — is revealed by the same wave edge. Both tracks end at the moment the
illustration reaches the vertical middle of `flat-design-scene`.

## Dependencies

* `gsap` (ScrollTrigger) — pinned horizontal sections only.
* `@fontsource/space-grotesk`, `@fontsource/space-mono` — self-hosted fonts.

## 3D-модель устройства (hero) — финальная анимация от скролла

В блоке `.hero-device-visual` — финальный рендер Kampela E1 (Blender / Cycles): 120 кадров полного оборота
с прозрачным фоном (WebP с альфой), так что надпись KAMPELA видна сквозь прозрачный корпус.
Кадр выбирается **только по положению скролла**: автоплея и вращения мышью нет.

| Файл | Что внутри |
|---|---|
| `public/models/kampela-turn/720/`, `…/1080/` | Веб-секвенция: 120 кадров 720×900 и 1080×1350 (размер выбирается по экрану) |
| `src/kampela-3d/kampela-sequence-stage.js` | Плеер секвенции на canvas: прогрессивная загрузка, кроссфейд между кадрами, рендер только при изменении |
| `src/kampela-3d/hero-device-3d.js` | Связка с GSAP ScrollTrigger: от верха `.hero-section` до конца `.about-section` |
| `src/kampela-3d/kampela-scroll-stage.js`, `public/models/kampela-e1.glb` | Real-time WebGL-версия той же модели (прототип) — сейчас не подключена, оставлена как запасная |
| `src/device-benefits.js`, `public/models/kampela-sway/` | Секция device-benefits: та же модель стороной с платой; для покачивания отдельные 31 кадр с шагом 0,5° (−7,5°…+7,5°), свет и наклон неподвижны — движение плавное (tools/render_sway.py) |
| `public/models/kampela.glb`, `src/kampela-3d/kampela-viewer.js`, `model-test.html` | Старая процедурная модель — осталась только на тестовой странице |
| `3d-model-source/blender-e1/` | Blender-сцена, текстуры из KiCad, скрипты рендера, мастер-рендер (16-bit PNG) |

**Хореография** (запечена в рендер, `3d-model-source/blender-e1/tools/build_scene.py`):
один оборот по часовой стрелке (если смотреть сверху) вокруг собственной длинной оси; наклон до 4,5° к середине
оборота (виден торец и толщина 7 мм); узкая студийная полоса света проходит по корпусу и ловит торцы в профиль;
ключевой свет «дышит» на ±8 %. Камера неподвижна, наклон 25° из Figma — фиксированный крен камеры.

Диапазон скролла — в `hero-device-3d.js` (`start: 'top top'`, `end: 'bottom bottom'` у `.about-section`).
Плавность догоняния — `smoothing` в `kampela-sequence-stage.js` (0,085 с). При `prefers-reduced-motion: reduce`
загружается и показывается только первый кадр. PNG `device-hero.png` остаётся постером и запасным вариантом.

Перерендер: `cd 3d-model-source/blender-e1` → `python tools/build_scene.py` (сцена) →
`python tools/render_frames.py master 100 64 1-120 0.02` (мастер) →
`python tools/make_web_sequence.py master ../../public/models/kampela-turn` (веб). Нужен Blender как модуль `bpy`
(или `blender -b blender/kampela_E1.blend -P …`); на видеокарте рендер в десятки раз быстрее.

### Загрузка 3D в hero
- В разметке заставка — сам кадр 1 поворота (`models/kampela-turn/720|1080/kampela_0001.webp`, 1x/2x), плеер берёт его как первый кадр, без повторной загрузки; `device-hero.png` больше не используется.
- Остальные 119 кадров запрашиваются только после загрузки страницы (в простое) или при первом скролле/касании/клавише, по 4 одновременно, с низким приоритетом.
