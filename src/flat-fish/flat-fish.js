/*
 * Kampela — flounder in flat-design-section.
 *
 * 1. The fish comes out from above, head down, accelerating; turns to
 *    horizontal smoothly but quickly (its body stretched by the speed),
 *    overshoots below its place, bounces
 *    back up into the centre and slows down softly. This part is smooth
 *    (every display frame) and the fish then stays perfectly still.
 * 2. The eyes and the bubbles live in retro stop-motion: 12 drawings a
 *    second, each one slightly misregistered, line "boil", and now and then
 *    a repeated or skipped drawing. Once the fish rests in the centre, its
 *    parts PPP01–PPP04, PPP06–PPP08 (fins, tail, mouth, eye patches — Figma
 *    2842:3877) join in with a gentle version of the same stop-motion.
 *
 * The artwork (fish vector from Figma "vector", bubbles from "fish3/bubbles",
 * plus drawn eyelids) lives in flat-fish.svg and is injected at runtime.
 * Plays when the flat-design scene has scrolled in, replays after it has
 * fully left the screen. Reduced motion → static fish3 pose.
 */
import stageSvg from './flat-fish.svg?raw';

const global = window;

var FPS = 12;                 // stop-motion drawings per second
var TICK = 1000 / FPS;
var W = 890, H = 799;         // stage = fish frames in Figma
var SX = W / 2134, SY = H / 1914;   // fish artwork -> stage units
var CX = W / 2, CY = H / 2;
var MOUTH = { x: 222, y: 1036 };    // mouth in artwork units
var START = { x: 0, y: -820, r: -90 };

function rnd(a, b) { return a + Math.random() * (b - a); }
// phones: no line-boil filter (feTurbulence + displacement re-rasterises the whole
// drawing 12 times a second, which made the page stutter there); the misregister stays
var LITE = window.matchMedia('(max-width: 767px)').matches;
function boilOn(el, f) { if (!LITE) el.setAttribute('filter', f); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

/* ---- smooth intro: one continuous motion, no holds ----
   1. comes out from under the splash, vertical (head down), accelerating;
   2. turns to horizontal smoothly but quickly while it falls;
   3. its momentum carries it below its resting place, then it bounces back
      up from below into the centre and slows down softly (damped spring),
      leaning with its own speed.
   Only after that the eyes start blinking and the bubbles start. */
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function seg(ms, a, b) { return Math.max(0, Math.min(1, (ms - a) / (b - a))); }

var FALL_MS = 620;                       // accelerating entry, reaches the resting height here
var FALL_V = 2 * -START.y / (FALL_MS / 1000);   // speed at that moment (stage units / s)
var SPRING_Z = 0.72;                     // damping ratio: one soft bounce, no wobble
var SPRING_W = 9;                        // natural frequency (rad / s)
var SPRING_WD = SPRING_W * Math.sqrt(1 - SPRING_Z * SPRING_Z);
var FLIP = [180, 980];                   // vertical → horizontal, during the fall
var INTRO_END = 2100;

// vertical position and speed (stage units, + = down)
function introY(ms) {
  if (ms < FALL_MS) {
    var u = ms / FALL_MS;
    return { y: START.y * (1 - u * u), v: FALL_V * u };
  }
  var t = (ms - FALL_MS) / 1000;
  var e = Math.exp(-SPRING_Z * SPRING_W * t);
  var A = FALL_V / SPRING_WD;            // starts at 0 with the fall speed
  var s = Math.sin(SPRING_WD * t), c = Math.cos(SPRING_WD * t);
  return { y: A * e * s, v: A * e * (SPRING_WD * c - SPRING_Z * SPRING_W * s) };
}

function introPose(ms) {
  var m = introY(ms);
  var flip = easeInOutCubic(seg(ms, FLIP[0], FLIP[1]));
  var r = START.r + (0 - START.r) * flip;
  // once horizontal, the fish leans into its own motion: head down while it
  // sinks, head up while it comes back
  var lean = Math.max(-9, Math.min(9, -m.v * 0.012)) * flip;
  // squash & stretch: the body stretches along the direction of motion with
  // its speed (volume kept), and gets its proportions back as it slows down
  var sy = 1 + Math.min(0.22, Math.abs(m.v) * 0.00008);
  return { x: 0, y: m.y, r: r + lean, sx: 1 / Math.sqrt(sy), sy: sy };
}

function mount(stage, opts) {
  opts = opts || {};
  var svg = stage.querySelector('.kf-svg');
  var fishG = svg.querySelector('.kf-fish');
  var bubbleLayer = svg.querySelector('.kf-bubbles');
  var art = svg.querySelector('.kf-art');
  var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- eyes: twitch groups + lids sized from the drawn eye shapes ----
  var eyeGroups = { L: [].slice.call(art.querySelectorAll('.kf-eye-L')), R: [].slice.call(art.querySelectorAll('.kf-eye-R')) };
  var eyes = ['L', 'R'].map(function (s) {
    var shape = art.querySelector('.kf-eyeshape-' + s);
    var lid = art.querySelector('.kf-lid-' + s);
    var bb = shape.getBBox();
    return {
      bb: bb,
      up: lid.querySelector('.up'), upEdge: lid.querySelector('.upEdge'),
      lo: lid.querySelector('.lo'), loEdge: lid.querySelector('.loEdge')
    };
  });
  eyes.forEach(function (e) {
    [e.up, e.upEdge, e.lo, e.loEdge].forEach(function (r) {
      r.setAttribute('x', e.bb.x - 12); r.setAttribute('width', e.bb.width + 24);
    });
  });
  // lid amounts: [upper, lower] share of the eye height
  var LID = { open: [0, 0], half: [0.42, 0.14], closed: [0.6, 0.4] };
  function setLids(state) {
    var f = LID[state];
    eyes.forEach(function (e) {
      var bb = e.bb, top = bb.y - 10, bottom = bb.y + bb.height + 10;
      var upH = f[0] ? (bb.height * f[0] + 10) : 0;
      var loH = f[1] ? (bb.height * f[1] + 10) : 0;
      e.up.setAttribute('y', top); e.up.setAttribute('height', upH);
      e.upEdge.setAttribute('y', top + upH - 3); e.upEdge.setAttribute('height', upH ? 6 : 0);
      e.lo.setAttribute('y', bottom - loH); e.lo.setAttribute('height', loH);
      e.loEdge.setAttribute('y', bottom - loH - 3); e.loEdge.setAttribute('height', loH && state !== 'closed' ? 6 : 0);
    });
  }

  // stop-motion eyes: each drawing sits a little off register (artwork units)
  var eyePrev = { L: [0, 0], R: [0, 0] };
  function twitchEyes() {
    ['L', 'R'].forEach(function (s) {
      var dx = rnd(-2.6, 2.6), dy = rnd(-2.6, 2.6);
      var roll = Math.random();
      if (roll < 0.08) { dx += pick([-1, 1]) * rnd(5, 8); dy += pick([-1, 1]) * rnd(3, 6); } // slipped drawing
      else if (roll < 0.15) { dx = eyePrev[s][0]; dy = eyePrev[s][1]; }                       // drawing shot twice
      eyePrev[s] = [dx, dy];
      var boil = 'url(#kfBoil' + ((Math.random() * 3) | 0) + ')';
      eyeGroups[s].forEach(function (g) {
        g.setAttribute('transform', 'translate(' + dx.toFixed(2) + ' ' + dy.toFixed(2) + ')');
        boilOn(g, boil);
      });
    });
  }
  function resetEyes() {
    ['L', 'R'].forEach(function (s) {
      eyeGroups[s].forEach(function (g) { g.removeAttribute('transform'); g.removeAttribute('filter'); });
    });
  }

  // ---- parts in stop-motion once the fish rests (PPP01–04, 06–08) ----
  // each drawing: a small shift and tilt around the part's own centre and a
  // line boil; drawings are held 1–2 ticks, now and then one slips a bit more
  var parts = [].slice.call(art.querySelectorAll('.kf-pp')).map(function (g) {
    var bb = null;
    try { bb = g.getBBox(); } catch (e) { bb = null; }
    return { g: g, cx: bb ? bb.x + bb.width / 2 : 0, cy: bb ? bb.y + bb.height / 2 : 0, hold: 0 };
  });
  function twitchParts() {
    parts.forEach(function (p) {
      if (p.hold > 0) { p.hold--; return; }
      p.hold = pick([0, 1, 1]);
      var dx = rnd(-2.2, 2.2), dy = rnd(-2.2, 2.2), a = rnd(-0.9, 0.9);
      if (Math.random() < 0.07) { dx *= 2.2; dy *= 2.2; a *= 2; }   // slipped drawing
      p.g.setAttribute('transform', 'translate(' + dx.toFixed(2) + ' ' + dy.toFixed(2) + ') rotate(' + a.toFixed(2) + ' ' + p.cx.toFixed(1) + ' ' + p.cy.toFixed(1) + ')');
      boilOn(p.g, 'url(#kfBoil' + ((Math.random() * 3) | 0) + ')');
    });
  }
  function resetParts() {
    parts.forEach(function (p) { p.g.removeAttribute('transform'); p.g.removeAttribute('filter'); p.hold = 0; });
  }

  // ---- state ----
  var running = false, raf = 0, last = 0, acc = 0, t0 = 0;
  var tickN = 0, phase = 'idle-wait';
  var shown = { x: 0, y: START.y, r: START.r };
  var blinkQ = [], nextBlink = 0;
  var bubbles = [], nextBurst = 0, burstQ = [];

  function apply(p) {
    shown = p;
    // scale before rotate = stretch along the screen's vertical (the direction of the fall)
    var sx = p.sx || 1, sy = p.sy || 1;
    if (LITE) {
      // phones: the whole drawing moves as one composited layer (CSS transform on
      // the <svg>, rendered once) instead of re-rendering the big SVG every frame
      var still = !p.x && !p.y && !p.r && sx === 1 && sy === 1;
      var k = (svg.clientWidth || W) / W;
      svg.style.transformOrigin = '50% 50%';
      svg.style.willChange = still ? '' : 'transform';
      svg.style.transform = still ? '' : 'translate(' + (p.x * k).toFixed(2) + 'px, ' + (p.y * k).toFixed(2) + 'px)' +
        (sx !== 1 || sy !== 1 ? ' scale(' + sx.toFixed(4) + ', ' + sy.toFixed(4) + ')' : '') +
        ' rotate(' + p.r.toFixed(3) + 'deg)';
      return;
    }
    fishG.setAttribute('transform', 'translate(' + (CX + p.x).toFixed(2) + ' ' + (CY + p.y).toFixed(2) + ')' +
      (sx !== 1 || sy !== 1 ? ' scale(' + sx.toFixed(4) + ' ' + sy.toFixed(4) + ')' : '') +
      ' rotate(' + p.r.toFixed(3) + ') translate(' + (-CX) + ' ' + (-CY) + ')');
  }

  // stage point of the mouth for the pose on screen
  function mouthPoint() {
    var px = MOUTH.x * SX - CX, py = MOUTH.y * SY - CY;
    var a = shown.r * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return { x: CX + shown.x + px * c - py * s, y: CY + shown.y + px * s + py * c };
  }

  // ---- bubbles (stop-motion) ----
  var NS = 'http://www.w3.org/2000/svg';
  var KINDS = [
    { id: '#kfBubbleS', w: 17 }, { id: '#kfBubbleM', w: 24 }, { id: '#kfBubbleL', w: 43 }
  ];
  function spawnBubble(kind) {
    var m = mouthPoint();
    var g = document.createElementNS(NS, 'g');
    var use = document.createElementNS(NS, 'use');
    use.setAttribute('href', kind.id);
    g.appendChild(use);
    bubbleLayer.appendChild(g);
    bubbles.push({
      el: g, use: use, x: m.x - 6, y: m.y - 8, x0: m.x - 6,
      vy: rnd(5.5, 8.5) * (kind.w > 30 ? 0.85 : 1.1), // stage units per drawing
      drift: rnd(-1.6, -0.6), phase: rnd(0, 6.28), wob: rnd(3, 7),
      age: 0, life: (rnd(18, 30)) | 0, popping: 0, k: kind
    });
  }
  function stepBubbles() {
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      b.age++;
      if (b.popping) {
        b.popping++;
        if (b.popping === 2) { b.use.setAttribute('href', '#kfPop'); b.el.setAttribute('transform', 'translate(' + b.x.toFixed(1) + ' ' + b.y.toFixed(1) + ') scale(' + (b.k.w / 30).toFixed(2) + ')'); }
        if (b.popping > 3) { b.el.remove(); bubbles.splice(i, 1); }
        continue;
      }
      b.y -= b.vy + rnd(-0.8, 0.8);
      b.x0 += b.drift;
      b.x = b.x0 + Math.sin(b.phase + b.age * 0.55) * b.wob + rnd(-0.7, 0.7);
      var grow = Math.min(1, 0.45 + b.age * 0.14);
      var squash = 1 + (Math.random() < 0.2 ? rnd(-0.08, 0.08) : 0);
      boilOn(b.el, 'url(#kfBoil' + ((Math.random() * 3) | 0) + ')');
      b.el.setAttribute('transform', 'translate(' + b.x.toFixed(1) + ' ' + b.y.toFixed(1) + ') rotate(' + rnd(-4, 4).toFixed(1) + ') scale(' + (grow * squash).toFixed(3) + ' ' + (grow / squash).toFixed(3) + ')');
      if (b.age >= b.life || b.y < 40) b.popping = 1;
    }
  }
  function clearBubbles() { bubbles.forEach(function (b) { b.el.remove(); }); bubbles = []; burstQ = []; }

  // ---- one stop-motion drawing (eyes, blinks, bubbles) ----
  function tick() {
    tickN++;
    twitchEyes();
    if (phase === 'live') {
      twitchParts();
      if (!blinkQ.length && tickN >= nextBlink) {
        blinkQ = ['half', 'closed', 'closed', 'half', 'open'];
        if (Math.random() < 0.22) blinkQ = blinkQ.concat(['open', 'half', 'closed', 'half', 'open']);
        nextBlink = tickN + ((rnd(2.4, 5) * FPS) | 0);
      }
      if (blinkQ.length) setLids(blinkQ.shift());

      if (!burstQ.length && tickN >= nextBurst) {
        var n = pick([1, 2, 2, 3]);
        for (var j = 0; j < n; j++) burstQ.push({ at: tickN + j * ((rnd(3, 6)) | 0), kind: pick(KINDS) });
        nextBurst = tickN + ((rnd(2.2, 4.2) * FPS) | 0);
      }
      while (burstQ.length && burstQ[0].at <= tickN) spawnBubble(burstQ.shift().kind);
    }
    stepBubbles();
  }

  function loop(t) {
    if (!running) return;
    if (!last) last = t;
    if (!t0) t0 = t;
    var dt = t - last; last = t;

    // smooth body motion, every display frame
    if (phase === 'intro') {
      var ms = t - t0;
      apply(introPose(ms));
      if (ms >= INTRO_END) {
        apply({ x: 0, y: 0, r: 0 });          // and then it stays put
        phase = 'live';
        nextBlink = tickN + 8; nextBurst = tickN + 4;
      }
    }

    // stop-motion layer at 12 drawings per second
    acc += dt;
    if (acc > 500) acc = TICK;               // tab was hidden: don't fast-forward
    while (acc >= TICK) { acc -= TICK; tick(); }
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true; last = 0; acc = TICK; raf = requestAnimationFrame(loop);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function park() {
    resetParts();
    apply({ x: 0, y: START.y, r: START.r });
    fishG.setAttribute('visibility', 'hidden');
  }

  function play() {
    clearBubbles(); setLids('open'); blinkQ = []; resetParts();
    if (reduce) { phase = 'static'; fishG.removeAttribute('visibility'); apply({ x: 0, y: 0, r: 0 }); resetEyes(); return; }
    fishG.removeAttribute('visibility');
    phase = 'intro'; t0 = 0;
    apply({ x: 0, y: START.y, r: START.r });
    stop(); start();
  }

  // resting frame before anything plays
  if (opts.autoplay === 'inview' && !reduce) park();
  else apply({ x: 0, y: 0, r: 0 });

  var trigger = opts.trigger || stage;
  if (opts.autoplay === 'inview' && 'IntersectionObserver' in global) {
    var armed = true;
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (armed && en.intersectionRatio >= 0.6) { armed = false; play(); }
        else if (!en.isIntersecting) {
          // left the screen completely: stop, park the fish above, replay next time
          armed = true; stop(); clearBubbles();
          if (!reduce) { phase = 'idle-wait'; park(); }
        } else if (!armed && phase === 'live' && !running) {
          start();
        }
      });
    }, { threshold: [0, 0.6] }).observe(trigger);
  } else if (opts.autoplay !== false) {
    play();
  }

  return { play: play, stop: stop };
}

/**
 * Replace the static flounder <img> inside `host` with the animated stage.
 * @param {HTMLElement} host   .flat-device-illustration element
 * @param {HTMLElement} [trigger] element whose visibility starts the animation
 */
export function initFlatFish(host, trigger) {
  if (!host) return null;
  host.innerHTML = stageSvg;
  host.classList.add('kf-stage');
  return mount(host, { autoplay: 'inview', trigger: trigger || host });
}
