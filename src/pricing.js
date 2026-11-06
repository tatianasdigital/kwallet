/*
 * Pricing section
 *  - The heading and the shipping information appear together, with the same
 *    line-by-line reveal as the other section headings (src/heading-reveal.js);
 *    both reset when the section leaves the screen.
 *  - A moment after the heading starts, the Tiles float up from below one after
 *    another (fast start, smooth slow-down) and fade in — the same entrance as
 *    the Tiles of the features section (src/features-reveal.js). They reset only
 *    when the heading drops out below the screen (scrolled back up), so they never
 *    vanish while still on screen. They move with the CSS `translate` property.
 *  - The availability badge lives in the same stop-motion as the vectors of
 *    the site (src/about-stopmotion.js).
 *  - While a card is hovered (or focused), its product name flickers through
 *    the serif faces like the word "kampela" in the flat-design description
 *    (src/link-jitter.js).
 *  - Hovering (or keyboard-focusing) a card draws a white outline over its
 *    border in stop-motion, like the other lines (src/drawn-stroke.js); on
 *    leave it undraws.
 */
import { gsap } from 'gsap';
import { createLineReveal } from './heading-reveal.js';
import { initStopMotionItems } from './about-stopmotion.js';
import { initCardTitleFlicker } from './link-jitter.js';
import { drawnOutline } from './drawn-stroke.js';

export function initPricing(section) {
  if (!section) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1) heading + shipping information, together
  const heading = section.querySelector('.section-heading');
  const shipping = section.querySelector('.shipping-information');
  if (heading && !reduce) {
    const reveals = [createLineReveal(heading)];
    if (shipping) {
      const blocks = [...shipping.children];
      blocks.forEach((b) => { if (getComputedStyle(b).display === 'inline') b.style.display = 'inline-block'; });
      reveals.push(createLineReveal(shipping, { blocks }));
    }

    // the Tiles float up a little after the heading (as in the features section)
    const cards = [...section.querySelectorAll('.pricing-card')];
    const st = cards.map(() => ({ y: 1, o: 0 }));   // y: share of the rise left
    const RISE = () => 160 * Math.max(1024, innerWidth) / 1920;
    const paint = () => cards.forEach((c, i) => {
      const { y, o } = st[i];
      c.style.translate = y > 0.0005 ? `0 ${(y * RISE()).toFixed(1)}px` : '';
      c.style.opacity = o >= 1 ? '' : o.toFixed(3);
    });
    paint();
    let cardsTl = null, cardsShown = false;
    const showCards = () => {
      if (cardsShown) return;
      cardsShown = true;
      cardsTl = gsap.timeline({ delay: 0.25 });
      st.forEach((v, i) => {
        cardsTl.to(v, { y: 0, duration: 1.3, ease: 'power3.out', onUpdate: paint }, i * 0.12);
        cardsTl.to(v, { o: 1, duration: 0.6, ease: 'power1.out', onUpdate: paint }, i * 0.12);
      });
    };
    const hideCards = () => {
      cardsShown = false;
      if (cardsTl) { cardsTl.kill(); cardsTl = null; }
      st.forEach((v) => { v.y = 1; v.o = 0; });
      paint();
    };

    // mobile (src/mobile.css): the Tiles are one under another, so each one rises
    // when it comes into view itself
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    new IntersectionObserver(([e]) => {
      reveals.forEach((r) => (e.isIntersecting ? r.show() : r.hide()));
      if (mobile) return;
      if (e.isIntersecting) showCards();
      else if (e.boundingClientRect.top > 0) hideCards();   // only when it drops out below
    }).observe(heading);
    if (mobile) {
      cards.forEach((c, i) => {
        let tl = null;
        new IntersectionObserver(([e]) => {
          const v = st[i];
          if (e.isIntersecting) {
            if (tl) return;
            tl = gsap.timeline({ delay: 0.1 })
              .to(v, { y: 0, duration: 1.3, ease: 'power3.out', onUpdate: paint }, 0)
              .to(v, { o: 1, duration: 0.6, ease: 'power1.out', onUpdate: paint }, 0);
          } else if (e.boundingClientRect.top > 0) {     // dropped out below: ready to rise again
            tl?.kill(); tl = null; v.y = 1; v.o = 0; paint();
          }
        }, { rootMargin: '0px 0px -10% 0px' }).observe(c);
      });
    }
  }

  // 2) availability badge in stop-motion: the whole badge jitters / twinkles,
  //    only its shape "boils" (the filter would make the small text unreadable)
  const badges = [...section.querySelectorAll('.availability-badge')];
  if (badges.length && !reduce) {
    const shapes = badges.map((b) => {
      const bg = document.createElement('span');
      bg.className = 'ab-bg';
      bg.setAttribute('aria-hidden', 'true');
      b.prepend(bg);
      b.classList.add('has-ab-bg');
      return bg;
    });
    initStopMotionItems(section, badges, { amp: 1.2, rot: 3, boil: false, boilOnly: shapes });
  }

  // 3) product names: typeface flicker while the card is hovered / focused
  initCardTitleFlicker(section.querySelectorAll('.pricing-card'), '.product-header h3');

  // 4) white outline drawn on hover / focus
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  section.querySelectorAll('.pricing-card').forEach((card) => {
    const outline = drawnOutline(card, { color: '#fff', ticks: 7 });
    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch' || !canHover.matches) return;
      outline.show();
    });
    // a click on the card's button / link focuses it too: only keyboard focus keeps the card lit
    card.addEventListener('pointerleave', () => { if (!card.matches(':focus-visible, :has(:focus-visible)')) outline.hide(); });
    card.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) outline.show(); });
    card.addEventListener('focusout', () => { if (!card.matches(':hover')) outline.hide(); });
  });
}
