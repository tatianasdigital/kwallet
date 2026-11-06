/*
 * Features section entrance.
 *  1. features-heading appears line by line like the headings on
 *     crency.agency (read from its code): each line slides up out of a mask,
 *     un-skewing and fading in.
 *  2. A moment after the heading starts, the Tiles come in from the right, one
 *     a little after another, and stop with the first Tile in the middle of the
 *     screen — like the how-it-works cards (src/how-it-works.js). From there the
 *     scroll carries them sideways (main.js) until the last one is in the middle.
 *     They move with the CSS `translate` property, so the track's own scroll
 *     movement and everything else that styles the Tiles is unaffected.
 *  3. Together with the heading the decorative star pops out of a point,
 *     cartoon-style (overshoot, then settle); it is in the same stop-motion as the
 *     other stars on the site (src/about-stopmotion.js). The pop uses the CSS
 *     `scale` property, the stop-motion owns `transform`.
 * After the page has glided the section to the top (main.js → features:arrived)
 * the heading plays; it replays after the section has been scrolled back out above.
 * Reduced motion: everything is shown as is.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createLineReveal } from './heading-reveal.js';
import { initStopMotionItems } from './about-stopmotion.js';

gsap.registerPlugin(ScrollTrigger);

export function initFeaturesReveal(section) {
  if (!section) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const heading = section.querySelector('.features-heading');
  if (!heading) return;

  /* ---- heading, line by line (src/heading-reveal.js) ---- */
  const headingReveal = createLineReveal(heading);

  /* ---- Tiles come in from the right, a little after the heading ---- */
  const cards = [...section.querySelectorAll('.feature-card')];
  const st = cards.map(() => ({ y: 1, o: 0 }));   // y: share of the way left to go (1 = waiting off to the right)
  // where they wait: 560 (Figma px) right of their place, as the how-it-works cards
  const FROM = () => 560 * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1);
  const paint = () => cards.forEach((c, i) => {
    const { y, o } = st[i];
    c.style.translate = y > 0.0005 ? `${(y * FROM()).toFixed(1)}px 0` : '';
    c.style.opacity = o >= 1 ? '' : o.toFixed(3);
  });
  paint();
  /* ---- decorative star: stop-motion + pop out of a point ---- */
  const star = section.querySelector('.features-star');
  const starPop = { s: 0 };
  const paintStar = () => { if (star) star.style.scale = starPop.s === 1 ? '' : starPop.s.toFixed(3); };
  if (star) {
    initStopMotionItems(section, [star], { amp: 1.3, rot: 4 });
    paintStar();
  }
  let starTween = null;
  let cardsTl = null;
  const heading$ = {
    show() {
      if (headingReveal.shown()) return;
      headingReveal.show();
      if (star) {
        if (starTween) starTween.kill();
        starTween = gsap.to(starPop, { s: 1, duration: 0.9, ease: 'back.out(2.6)', delay: 0.1, onUpdate: paintStar });
      }
      if (cardsTl) cardsTl.kill();
      cardsTl = gsap.timeline({ delay: 0.25 });
      st.forEach((s, i) => {
        cardsTl.to(s, { y: 0, duration: 1.3, ease: 'power3.inOut', onUpdate: paint }, i * 0.07);
        cardsTl.to(s, { o: 1, duration: 0.4, ease: 'power1.out', onUpdate: paint }, i * 0.07);
      });
    },
    hide() {
      headingReveal.hide();
      if (cardsTl) { cardsTl.kill(); cardsTl = null; }
      if (starTween) { starTween.kill(); starTween = null; }
      starPop.s = 0; paintStar();
      st.forEach((s) => { s.y = 1; s.o = 0; });
      paint();
    },
  };
  new IntersectionObserver(([e]) => {
    if (section.dataset.gliding) return;        // wait for the glide to finish
    if (e.isIntersecting) heading$.show();
    // reset only when the heading drops out below the screen (scrolled back up);
    // when it leaves over the top the Tiles are still on screen and must stay
    else if (e.boundingClientRect.top > 0) heading$.hide();
  }).observe(heading);

  // the page glided the section to the top of the screen: play the heading
  section.addEventListener('features:arrived', () => heading$.show());

  // scrolled back out above the section → ready to play again
  ScrollTrigger.create({
    trigger: section,
    start: 'top bottom',
    onLeaveBack: () => heading$.hide(),
  });
}
