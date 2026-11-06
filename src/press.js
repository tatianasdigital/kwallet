/*
 * Press section — each card works as one link.
 *  - Clicking anywhere on a card follows its link (the link itself stays the
 *    keyboard-focusable element; selecting text does not trigger it).
 *  - Hovering (or keyboard-focusing) a card:
 *      · the card outline is drawn over in white, an uneven hand-drawn line in
 *        stop-motion (src/drawn-stroke.js) — same as the pricing cards;
 *      · the link text flickers through the serif faces (src/link-jitter.js);
 *      · the straight underline of the link is replaced by a hand-drawn line
 *        that draws itself left → right and keeps "boiling".
 *    On leave everything undraws / returns.
 *  - Entrance: a moment after the heading starts, the cards float up from below
 *    one after another (fast start, smooth slow-down) and fade in — the same as
 *    the pricing cards (src/pricing.js). They reset only when the heading drops
 *    out below the screen (scrolled back up). They move with the CSS `translate`
 *    property, so the hover effects are not affected.
 */
import { gsap } from 'gsap';
import { drawnOutline, drawnLine } from './drawn-stroke.js';
import { initCardTitleFlicker } from './link-jitter.js';
import { initStopMotionItems } from './about-stopmotion.js';

const NS = 'http://www.w3.org/2000/svg';

/* Live cursor over the cards (Figma "cursor" / "newv": hand-drawn green blob with an arrow).
   A CSS cursor image can't move, so the native cursor is hidden over the
   cards and this element follows the pointer; the edge of the blob "boils"
   in the same stop-motion as the vector drawings, the arrow stays crisp. */
function createLiveCursor(section, cards) {
  const el = document.createElement('div');
  el.className = 'press-cursor';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<span class="pc-inner">' +
    `<svg width="76" height="80" viewBox="0 0 76 80" fill="none" xmlns="${NS}" overflow="visible">` +
    '<path class="pc-dot" d="M76 39.7222C76 60.7397 55.9357 80 34.9489 80C9.43066 80 0 60.7397 0 39.7222C0 18.7047 21.1738 0 42.1606 0C63.1474 0 76 18.7047 76 39.7222Z" fill="#028464"/>' +
    '<path transform="translate(9.5 12)" d="M23.9047 32.5962L33.0971 23.4038M33.0971 31.889V23.4038H24.6119" stroke="#fff"/></svg></span>';
  document.body.append(el);
  section.classList.add('has-live-cursor');
  // same stop-motion as the availability badge: the whole cursor jitters,
  // tilts and now and then twinkles; only the blob's edge "boils"
  initStopMotionItems(section, [el.querySelector('.pc-inner')], {
    amp: 1.2, rot: 3, boil: false, boilOnly: [el.querySelector('.pc-dot')],
  });

  let x = 0, y = 0, raf = 0;
  const place = () => { raf = 0; el.style.transform = `translate3d(${x - 38}px, ${y - 40}px, 0)`; };
  const move = (e) => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(place); };
  cards.forEach((card) => {
    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      move(e); place();
      el.classList.add('is-on');
    });
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerleave', () => el.classList.remove('is-on'));
  });
  // the page scrolls under a resting mouse: hide if the pointer is no longer on a card
  window.addEventListener('scroll', () => {
    if (!el.classList.contains('is-on')) return;
    const under = document.elementFromPoint(x, y);
    if (!under?.closest('.press-card')) el.classList.remove('is-on');
  }, { passive: true });
}

export function initPress(section) {
  if (!section) return;
  const cards = [...section.querySelectorAll('.press-card')];
  if (!cards.length) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');

  // entrance: the cards float up a little after the heading (as in pricing)
  const heading = section.querySelector('.section-heading');
  if (heading && !reduce) {
    const st = cards.map(() => ({ y: 1, o: 0 }));   // y: share of the rise left
    const RISE = () => 160 * Math.max(1024, innerWidth) / 1920;
    const paint = () => cards.forEach((c, i) => {
      const { y, o } = st[i];
      c.style.translate = y > 0.0005 ? `0 ${(y * RISE()).toFixed(1)}px` : '';
      c.style.opacity = o >= 1 ? '' : o.toFixed(3);
    });
    paint();
    let tl = null, shown = false;
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (shown) return;
        shown = true;
        tl = gsap.timeline({ delay: 0.25 });
        st.forEach((v, i) => {
          tl.to(v, { y: 0, duration: 1.3, ease: 'power3.out', onUpdate: paint }, i * 0.12);
          tl.to(v, { o: 1, duration: 0.6, ease: 'power1.out', onUpdate: paint }, i * 0.12);
        });
      } else if (e.boundingClientRect.top > 0) {   // only when it drops out below
        shown = false;
        if (tl) { tl.kill(); tl = null; }
        st.forEach((v) => { v.y = 1; v.o = 0; });
        paint();
      }
    }).observe(heading);
  }

  cards.forEach((card) => {
    const link = card.querySelector('a[href]');
    if (!link) return;
    card.classList.add('is-card-link');

    // whole card clickable
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;                       // the link handles itself
      if (String(window.getSelection?.() || '').length) return; // text was being selected
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        window.open(link.href, '_blank', 'noopener');
        return;
      }
      link.click();
    });

    if (reduce) return;
    const outline = drawnOutline(card, { color: '#fff', ticks: 7 });
    const under = document.createElement('span');
    under.className = 'link-underline';
    under.setAttribute('aria-hidden', 'true');
    link.append(under);
    const line = drawnLine(under, { color: 'currentColor', ticks: 6 });

    let on = false, restore = 0;
    const enter = () => {
      if (on) return;
      on = true;
      clearTimeout(restore);
      link.classList.add('has-drawn-underline');
      outline.show();
      line.show();
    };
    const leave = () => {
      if (!on) return;
      on = false;
      outline.hide();
      line.hide();
      // bring the straight underline back once the drawn one has undrawn
      restore = setTimeout(() => { if (!on) link.classList.remove('has-drawn-underline'); }, 550);
    };
    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch' || !canHover.matches) return;
      enter();
    });
    card.addEventListener('pointerleave', () => { if (!card.matches(':focus-visible, :has(:focus-visible)')) leave(); });
    card.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) enter(); });   // keyboard only, not a click
    card.addEventListener('focusout', () => { if (!card.matches(':hover')) leave(); });
  });

  // link text flickers while the card (not only the link) is hovered / focused
  initCardTitleFlicker(cards, 'a[href]');

  if (!reduce && canHover.matches) createLiveCursor(section, cards);
}
