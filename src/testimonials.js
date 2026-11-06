/*
 * Testimonials slider ("What people say").
 *  - Arrows and the [ 01 ] [ 02 ] [ 03 ] pages switch the quote. States as in
 *    Figma 479:642: enabled white, disabled #525252 / #676767, hover #c3c3c3
 *    (CSS). The arrows stop at the first / last quote (disabled there).
 *  - Switching: the current quote and author fade up and out; the new quote
 *    appears line by line like the section headings (src/heading-reveal.js),
 *    its author a moment later.
 *  - Entrance, when the block is well in view: the quote mark pops out of a
 *    point (cartoon overshoot), the small heading and the controls rise, the
 *    current quote appears line by line like the section headings, its author
 *    a moment later. Resets when the section is scrolled back out below.
 *  - Keyboard: the arrows and pages are buttons; ← / → also work while the
 *    focus is in the controls. Touch: swipe left / right on the quote.
 * Reduced motion: the quote simply swaps.
 */
import { gsap } from 'gsap';
import { createLineReveal } from './heading-reveal.js';

export function initTestimonials(section) {
  if (!section) return;
  const slides = [...section.querySelectorAll('.testimonial-slide')];
  const pages = [...section.querySelectorAll('.testimonial-pagination button')];
  const prev = section.querySelector('.arrow-prev');
  const next = section.querySelector('.arrow-next');
  const controls = section.querySelector('.testimonial-slider-controls');
  if (slides.length < 2) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = Math.max(0, slides.findIndex((s) => s.classList.contains('is-current')));
  const reveals = new Map();   // slide index → line reveal of its quote (made on first use)
  let leaveTl = null;

  const paintControls = () => {
    pages.forEach((b, i) => {
      b.classList.toggle('is-current', i === current);
      if (i === current) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    if (prev) prev.disabled = current === 0;
    if (next) next.disabled = current === slides.length - 1;
  };

  const go = (k) => {
    if (k < 0 || k >= slides.length || k === current) return;
    const from = slides[current], to = slides[k];
    current = k;
    paintControls();

    // the old quote fades up and out
    leaveTl?.progress(1);
    from.classList.remove('is-current');
    from.setAttribute('aria-hidden', 'true');
    to.classList.add('is-current');
    to.removeAttribute('aria-hidden');
    slides.forEach((s) => { if (s !== from && s !== to) { s.classList.remove('is-leaving'); gsap.set(s, { clearProps: 'opacity,transform' }); } });
    if (reduce) { from.classList.remove('is-leaving'); return; }
    from.classList.add('is-leaving');
    leaveTl = gsap.timeline({ onComplete: () => { from.classList.remove('is-leaving'); gsap.set(from, { clearProps: 'opacity,transform' }); } })
      .to(from, { opacity: 0, y: -18, duration: 0.35, ease: 'power2.in' });

    // the new quote: line by line, the author a moment later
    const quote = to.querySelector('.testimonial-quote');
    const author = to.querySelector('.testimonial-author');
    gsap.set(to, { clearProps: 'opacity,transform' });
    if (quote) {
      if (!reveals.has(k)) reveals.set(k, createLineReveal(quote));
      const r = reveals.get(k);
      r.hide();
      gsap.delayedCall(0.25, () => { if (current === k) r.show(); });
    }
    if (author) gsap.fromTo(author, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: 0.6, clearProps: 'opacity,transform' });
  };

  prev?.addEventListener('click', () => go(current - 1));
  next?.addEventListener('click', () => go(current + 1));
  pages.forEach((b, i) => b.addEventListener('click', () => go(i)));
  controls?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
  });

  // touch: swipe on the quote
  const area = section.querySelector('.testimonial-slides');
  let sx = 0, sy = 0, tracking = false;
  area?.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; tracking = true; }, { passive: true });
  area?.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(current + (dx < 0 ? 1 : -1));
  }, { passive: true });

  paintControls();

  /* ---- entrance ---- */
  if (reduce) return;
  const mark = section.querySelector('.decorative-quotation-mark');
  const header = section.querySelector('.testimonials-header');
  const reveal = (k) => {
    const q = slides[k].querySelector('.testimonial-quote');
    if (!q) return null;
    if (!reveals.has(k)) reveals.set(k, createLineReveal(q));
    return reveals.get(k);
  };
  let entered = false, tl = null;
  const setStart = () => {
    tl?.kill();
    entered = false;
    reveal(current)?.hide();
    if (mark) gsap.set(mark, { scale: 0, transformOrigin: '50% 50%' });
    if (header) gsap.set(header, { opacity: 0, y: 24 });
    slides.forEach((s) => { const a = s.querySelector('.testimonial-author'); if (a) gsap.set(a, { opacity: 0, y: 14 }); });
  };
  const play = () => {
    if (entered) return;
    entered = true;
    tl = gsap.timeline();
    if (mark) tl.to(mark, { scale: 1, duration: 0.8, ease: 'back.out(2.6)' }, 0);
    if (header) tl.to(header, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, 0.1);
    tl.call(() => reveal(current)?.show(), null, 0.25);
    const a = slides[current].querySelector('.testimonial-author');
    if (a) tl.to(a, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0.85);
    tl.call(() => slides.forEach((s) => { const au = s.querySelector('.testimonial-author'); if (au) gsap.set(au, { clearProps: 'opacity,transform' }); }), null, 1.6);
  };
  setStart();
  // plays when the quote is well in view (not as soon as the section's edge shows)
  const target = section.querySelector('.testimonial-slides') || section;
  new IntersectionObserver(([e]) => { if (e.isIntersecting) play(); }, { rootMargin: '0px 0px -20% 0px' }).observe(target);
  // resets once the section has left the screen downwards, so it plays again
  new IntersectionObserver(([e]) => { if (!e.isIntersecting && e.boundingClientRect.top > 0) setStart(); }).observe(section);
}
