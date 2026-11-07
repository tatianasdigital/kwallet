/*
 * How it works — cartoon-like stepper.
 *
 *  - Once the section reaches the top of the screen, the heading appears
 *    line by line (src/heading-reveal.js). When it is
 *    almost done, the cards glide in from the right (speeding up, then slowing
 *    down smoothly) and stop with step 01 in the centre — no overshoot.
 *  - The connector lines between the badges stretch with the cards every
 *    frame, so they stay continuous while the cards lag behind each other.
 *  - The section is pinned; one scroll gesture moves exactly one step (the
 *    page glides to that step's beat). The cards simply glide together —
 *    gentle start, gentle stop, no hold-back or bounce.
 *  - The active card's photo (transparent PNG) sits on a #028465 fill with
 *    the page's film grain that grows from the centre of the card, then its edges
 *    wobble softly in stop-motion (src/step-fill.js).
 *  - Every badge has a grey outline that "boils" in stop-motion
 *    (src/drawn-stroke.js) instead of a CSS border.
 *  - The centred step is active: its image is opaque (the others 25 %), its
 *    badge outline turns white and the line running right from the badge
 *    draws itself: 80 % white, the last 20 % #676767. Scrolling on, the last
 *    20 % fills in white, then the next badge's outline fills in white from
 *    the point the line touches, both ways round; then the old badge's white
 *    outline undraws and its line (still boiling) turns #676767.
 * Reduced motion is handled in main.js (native horizontal scroll instead).
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createLineReveal } from './heading-reveal.js';
import { drawnOutline, drawnLine } from './drawn-stroke.js';
import { createStepFill } from './step-fill.js';

gsap.registerPlugin(ScrollTrigger);

const MOVE = 0.75;         // s — one step: all cards glide together (power2.inOut: gentle start, gentle stop)
const ACTIVATE_AT = 0.25;  // s into the move when the new step becomes active
const SETTLE_AT = 0.4;     // s into a backward move when the badges / lines settle
const LAG = 0.07;          // s — intro only: each following card starts this much later
const INTRO_FROM = 560;    // --s units right of centre where the cards wait before the intro
const INTRO_AT = 0.72;     // the cards start when the heading reveal is this far through
const GREY_OUTLINE = '#333333';   // = --lines, the badge border colour
const GREY_LINE = '#676767';      // unlit part of a line / lines left behind
const LINE_LEAD = 0.8;            // the active step's line is white this far, grey after
const FILL_TICKS = 10;            // drawings a full length takes when the last part fills in

export function initHowItWorks(section, { jumpTo, glideTo, scrollTarget = () => window.scrollY } = {}) {
  const heading = section.querySelector('.section-heading');
  const viewport = section.querySelector('.h-scroll-viewport');
  const track = section.querySelector('.transaction-steps-track');
  const steps = [...track.children];
  if (!heading || !viewport || !steps.length) return () => {};
  const n = steps.length;
  section.classList.add('hiw-drawn');   // badge borders are drawn in JS from here on
  const s = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;

  /* ---- strokes: badge outline + connector line for every step ---- */
  const strokes = steps.map((step, i) => {
    const badge = step.querySelector('.step-badge');
    // grey outline: always there, "boiling" like the rest (replaces the CSS border)
    const base = drawnOutline(badge, { color: GREY_OUTLINE, ticks: 6 });
    base.show();
    // white outline on top; from step 02 on it grows from the point where the
    // incoming line touches the badge (middle of its left side)
    const outline = drawnOutline(badge, { color: '#fff', ticks: 6, from: i > 0 ? 'left' : undefined });
    let line = null, conn = null, rest = 0;
    if (i < n - 1) {
      conn = document.createElement('span');
      conn.className = 'step-connector';
      conn.setAttribute('aria-hidden', 'true');
      step.append(conn);
      const next = steps[i + 1].querySelector('.step-badge');
      // from the right edge of this badge to the left edge of the next one;
      // re-measured whenever a badge changes size (e.g. once the web font
      // has loaded and the label gets wider), so the line never runs under a badge
      const place = () => {
        const x0 = badge.offsetLeft + badge.offsetWidth;
        const x1 = steps[i + 1].offsetLeft - step.offsetLeft + (next?.offsetLeft || 0);
        conn.style.left = `${x0}px`;
        conn.style.top = `${badge.offsetTop + badge.offsetHeight / 2}px`;
        conn.style.width = `${Math.max(0, x1 - x0)}px`;
        rest = conn.offsetWidth;
        line?.refresh();
      };
      place();
      line = drawnLine(conn, { color: '#fff', baseColor: GREY_LINE, ticks: 9 });
      const ro = new ResizeObserver(place);
      ro.observe(step);
      ro.observe(badge, { box: 'border-box' });
      if (next) ro.observe(next, { box: 'border-box' });
      document.fonts?.ready.then(place);
    }
    return { base, outline, line, conn, rest: () => rest };
  });

  /* ---- connectors stay continuous ----
     Every card moves on its own (with a lag), so the distance to the next card
     changes during a move. Each frame the line is stretched (scaleX, from its
     left end) to reach exactly the next card's badge — it never breaks and
     never overshoots. The wobble is vertical only and the stroke is
     non-scaling, so the stretch does not distort the drawing. */
  const syncLines = () => {
    for (let i = 0; i < n - 1; i++) {
      const { conn, rest: r } = strokes[i];
      const w = r();
      if (!conn || !w) continue;
      const dx = gsap.getProperty(steps[i + 1], 'x') - gsap.getProperty(steps[i], 'x');
      conn.style.transform = `scaleX(${Math.max(0, (w + dx) / w).toFixed(4)})`;
    }
  };
  gsap.ticker.add(syncLines);

  /* ---- active step ---- */
  let active = -1;
  let introDone = false;
  // green fill behind the active card's photo (src/step-fill.js)
  const fills = steps.map((step) => createStepFill(step.querySelector('.step-image-container')));
  const paintFills = () => fills.forEach((f, i) => (i === active ? f.show() : f.hide()));
  const setActive = (k) => {
    if (k === active) return;
    active = k;
    steps.forEach((step, i) => {
      step.classList.toggle('is-active', i === k);
      if (i === k) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    if (introDone) paintFills();
  };

  /* ---- strokes ----
     Resting on step k: badge k has the white outline; line k is drawn white
     for the first 80 % and #676767 for the rest; lines left of k are #676767;
     lines right of k are not drawn.
     Scrolling one step on: the last 20 % of line k fills in white, then the
     next badge's outline fills in white from the point the line touches,
     and only then the strokes settle on the new step. */
  let gen = 0;   // every new sequence cancels the callbacks of the previous one
  const settle = (k) => {
    gen++;
    strokes.forEach((st, i) => {
      if (i === k) st.outline.show(); else st.outline.hide();
      const l = st.line;
      if (!l) return;
      if (i < k) { l.setColor(GREY_LINE); l.show(); }
      else if (i === k) { l.setColor('#fff'); l.show(); l.setFill(LINE_LEAD); }
      else l.hide();
    });
  };
  const advance = (from, to) => {
    const l = strokes[from]?.line;
    if (!l) { settle(to); return; }
    const g = ++gen;
    strokes.forEach((st, i) => {
      if (i !== from && i !== to) st.outline.hide();
      if (!st.line || i === from) return;
      if (i < from) { st.line.setColor(GREY_LINE); st.line.show(); } else st.line.hide();
    });
    strokes[from].outline.show();
    l.setColor('#fff');
    l.show();
    l.setFill(1, FILL_TICKS);
    l.whenFull(() => l.whenFilled(() => {
      if (g !== gen) return;
      const o = strokes[to].outline;           // grows from the middle of its left side
      o.show();
      o.whenFull(() => { if (g === gen) settle(to); });
    }));
  };
  const clearStrokes = () => {
    gen++;
    strokes.forEach((st) => { st.outline.hide(); st.line?.hide(); st.line?.setColor('#fff'); });
  };

  /* ---- positions ---- */
  const pitch = () => (n > 1 ? steps[1].offsetLeft - steps[0].offsetLeft : 0);
  const xFor = (k) => viewport.clientWidth / 2 - (steps[0].offsetLeft + steps[0].offsetWidth / 2) - k * pitch();
  const xStart = () => xFor(0) + INTRO_FROM * s();   // waiting off to the right before the intro
  let current = -1;    // beat the cards are at (or heading to)
  let moveTl = null;

  const moveTo = (k, { intro = false } = {}) => {
    if (k === current && !intro) return;
    const from = current;
    current = k;
    moveTl?.kill();
    const target = xFor(k);
    moveTl = gsap.timeline();
    if (!intro && from >= 0 && k === from + 1) advance(from, k);   // one step on: fill, then light the next badge
    else moveTl.call(() => settle(k), null, SETTLE_AT);
    // plain smooth scroll: no hold-back, no bounce, all cards together
    moveTl.to(steps, { x: target, duration: MOVE, ease: 'power2.inOut' }, 0);
    // the new step becomes active as it arrives
    moveTl.call(() => setActive(k), null, ACTIVATE_AT);
  };

  /* ---- intro: heading first; when it is almost done the cards glide in
     from the right and stop in the centre (accelerate, then ease out) ---- */
  const heading$ = createLineReveal(heading);
  let introCall = null;
  const playIntro = () => {
    if (introDone) return;
    introDone = true;
    current = 0;
    moveTl?.kill();
    const target = xFor(0);
    moveTl = gsap.timeline({ onComplete: () => settle(0) });
    steps.forEach((el, i) => {
      const t0 = i * LAG;
      moveTl
        .to(el, { opacity: 1, duration: 0.4, ease: 'power1.out' }, t0)
        .to(el, { x: target, duration: 1.3, ease: 'power3.inOut' }, t0);   // in from the right, straight to the centre
    });
    moveTl.call(() => { setActive(0); paintFills(); }, null, 0.85);
  };
  const resetIntro = () => {
    introDone = false;
    snapping = false;
    anchor = null;
    stepId++;
    introCall?.kill();
    moveTl?.kill();
    current = -1;
    gsap.set(steps, { x: xStart(), opacity: 0 });
    setActive(0);
    clearStrokes();
    fills.forEach((f) => f.reset());
    active = -1;
    heading$.hide();
  };
  gsap.set(steps, { x: xStart(), opacity: 0 });
  setActive(0);

  /* ---- scroll: one scroll = one step ----
     The section is pinned with one "beat" of scroll per step. As soon as the
     visitor scrolls a little away from the current beat, the page glides
     (input locked) to the next / previous beat and the cards move one step —
     so a single wheel flick or swipe turns exactly one card. Past the first /
     last step the scroll is left alone, so the page carries on normally. */
  const beatLen = () => Math.max(380, innerHeight * 0.55);
  // Any real scroll counts — even the small deltas of touchpads, precision
  // wheels and some browsers (a 33px notch only moves the page ~13px after
  // smoothing, which used to need a second scroll).
  const NUDGE = 4;                                    // px of scroll that counts as "a scroll"
  const QUIET = 140;                                  // ms without wheel / touch input = gesture over
  let st = null;
  let snapping = false;
  let anchor = null;                                  // scroll position the next nudge is measured from
  let lastInput = 0;
  const onInput = () => { lastInput = performance.now(); };
  window.addEventListener('wheel', onInput, { passive: true });
  window.addEventListener('touchmove', onInput, { passive: true });
  const beat = () => (st ? Math.round(gsap.utils.clamp(0, 1, st.progress) * (n - 1)) : 0);
  const beatPos = (k) => st.start + k * beatLen();
  let stepId = 0;
  const step = (k) => {
    const id = ++stepId;
    snapping = true;
    anchor = null;
    moveTo(k);
    const t0 = performance.now();
    // unlock only once the gesture is over (touchpad inertia keeps sending
    // wheel events after the glide) — so one gesture = exactly one step
    let released = false;
    const release = () => {
      if (id !== stepId || released) return;
      // a scroll that keeps going steps on (not one step per gesture any more): the
      // wait for the gesture to end is capped just after the glide
      if (performance.now() - lastInput < QUIET && performance.now() - t0 < 950) {
        gsap.delayedCall(0.05, release);
        return;
      }
      released = true;
      anchor = window.scrollY;
      snapping = false;
    };
    if (glideTo) glideTo(beatPos(k), 0.6, release);
    else { jumpTo?.(beatPos(k)); release(); }
    gsap.delayedCall(4.2, () => { if (!released) { lastInput = 0; release(); } });   // never stay locked
  };
  st = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${beatLen() * (n - 1)}`,
    pin: true,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      if (snapping || !introDone || current < 0) return;
      const goal = scrollTarget();
      if (goal < st.start - 4 || goal > st.end + 4) return;   // a link glide passing through
      const delta = window.scrollY - (anchor ?? beatPos(current));
      if (Math.abs(delta) < NUDGE) return;
      const next = current + (delta > 0 ? 1 : -1);
      if (next < 0 || next > n - 1) return;           // leaving the section: let it scroll
      // a fast flick may already be beyond the next beat: still only one step
      step(next);
    },
    onRefresh: () => {
      if (!introDone) gsap.set(steps, { x: xStart() });
      else {
        anchor = null;
        current = -1; moveTl?.kill(); gsap.set(steps, { x: xFor(beat()), opacity: 1 }); current = beat(); setActive(current);
        paintFills();
        settle(current);
      }
    },
  });
  // The heading (and after it the cards) start while the section is still
  // coming up (its top at 65 % of the screen), so there is no empty pause.
  const startAt = ScrollTrigger.create({
    trigger: section,
    start: 'top 65%',            // earlier: no empty stretch after the device-benefits section
    onEnter: () => {
      if (introDone) return;
      // jumped past the section (menu link, fast drag of the scrollbar):
      // don't pull the page back — just show the section in its end state
      if (Math.max(window.scrollY, scrollTarget()) > st.end + 4) {
        introCall?.kill();
        introDone = true;
        heading$.show();
        current = n - 1;
        moveTl?.kill();
        gsap.set(steps, { x: xFor(current), opacity: 1 });
        setActive(current);
        paintFills();
        settle(current);
        return;
      }
      heading$.show();
      const at = heading$.duration() * INTRO_AT;
      introCall?.kill();
      introCall = gsap.delayedCall(at, playIntro);
      // the intro now plays while the section is still coming up, so the page
      // is no longer pulled to the section; stepping just waits for the intro
      snapping = true;
      // stepping is free again as soon as the first card has arrived (not after the whole intro)
      gsap.delayedCall(at + 0.85, () => { anchor = null; snapping = false; });
    },
  });
  const back = ScrollTrigger.create({ trigger: section, start: 'top bottom', onLeaveBack: resetIntro });

  // keyboard: focusing a step scrolls to its beat
  const onFocusIn = (e) => {
    const i = steps.indexOf(e.target.closest('.step'));
    if (i < 0 || !jumpTo) return;
    jumpTo(st.start + i * beatLen());
  };
  section.addEventListener('focusin', onFocusIn);

  return () => {
    section.removeEventListener('focusin', onFocusIn);
    window.removeEventListener('wheel', onInput);
    window.removeEventListener('touchmove', onInput);
    st.kill(); back.kill(); startAt.kill(); moveTl?.kill(); introCall?.kill();
    gsap.ticker.remove(syncLines);
    gsap.set(steps, { clearProps: 'transform,opacity' });
    section.classList.remove('hiw-drawn');
  };
}
