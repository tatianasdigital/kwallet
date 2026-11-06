/*
 * Section headings appear line by line, like the headings on crency.agency
 * (read from its code): each rendered line rises from 1.15 × its height
 * below, un-skewing from 6° and fading in, revealed by a clip that opens
 * upwards with it; power4.out, 1 s per line, 0.3 s between lines.
 *
 * createLineReveal(el, { blocks? }) → { show(), hide(), shown(), duration(), onDone(fn) }
 * initSectionHeadings(selector) → every matching heading plays when it comes
 * into view and resets when it leaves (as on the reference).
 * wrapLinesKeepingInline(el) → splits text that holds inline elements (a link,
 * a highlighted word …) into its rendered lines without taking them apart; the
 * result goes to createLineReveal(el, { blocks }).
 * Reduced motion: headings are left as they are.
 */
import { gsap } from 'gsap';

// Split the heading into its rendered lines: <span class="fx-line"> per line.
function splitLines(el) {
  const text = el.dataset.text || el.textContent.trim().replace(/\s+/g, ' ');
  el.dataset.text = text;
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const words = text.split(' ').map((w) => {
    const s = document.createElement('span');
    s.textContent = w;
    s.style.display = 'inline-block';
    el.append(s, ' ');
    return s;
  });
  const lines = [];
  let top = null;
  words.forEach((w) => {
    if (top === null || w.offsetTop > top + 2) { lines.push([]); top = w.offsetTop; }
    lines[lines.length - 1].push(w.textContent);
  });
  el.textContent = '';
  return lines.map((ws) => {
    const line = document.createElement('span');
    line.className = 'fx-line';
    line.setAttribute('aria-hidden', 'true');
    line.textContent = ws.join(' ');
    el.append(line);
    return line;
  });
}

// Like splitLines, but the element's inline children (e.g. "kampela [?]." with
// its own behaviour) are kept as they are — moved, never rebuilt — and count
// as one word. Each rendered line ends up in its own <span class="fx-line">.
export function wrapLinesKeepingInline(el) {
  const units = [];
  [...el.childNodes].forEach((node) => {
    if (node.nodeType === 3) {
      node.nodeValue.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { units.push(document.createTextNode(' ')); return; }
        const s = document.createElement('span');
        s.style.display = 'inline-block';
        s.textContent = part;
        units.push(s);
      });
    } else units.push(node);
  });
  el.replaceChildren(...units);
  const lines = [];
  let top = null;
  units.forEach((u) => {
    if (u.nodeType === 3) { if (lines.length) lines[lines.length - 1].push(u); return; }
    const t = u.getBoundingClientRect().top;
    if (top === null || t > top + 4) { lines.push([]); top = t; }
    lines[lines.length - 1].push(u);
  });
  const wraps = lines.map((ns) => {
    while (ns.length && ns[ns.length - 1].nodeType === 3) ns.pop();   // no trailing space
    const line = document.createElement('span');
    line.className = 'fx-line';
    ns.forEach((n) => {
      if (n.nodeType === 1 && n.style.display === 'inline-block' && !n.className) line.append(n.textContent);
      else line.append(n);
    });
    return line;
  });
  el.replaceChildren(...wraps);
  return wraps;
}

const ease = gsap.parseEase('power4.out');

export function createLineReveal(el, { blocks } = {}) {
  // blocks: elements that rise as they are (e.g. a paragraph and a link) —
  // nothing is re-split, so links, bold text etc. stay intact
  const split = () => (blocks ? [...blocks] : splitLines(el));
  let lines = split();
  let isShown = false;
  const doneFns = [];
  const draw = (t) => {
    lines.forEach((line, i) => {
      const a = 1 - ease(gsap.utils.clamp(0, 1, (t - i * 0.3) / 1));
      const y = 1.15 * line.offsetHeight * a;
      gsap.set(line, {
        y, opacity: 1 - a, skewY: 6 * a, transformOrigin: '0% 100%',
        clipPath: a > 0 ? `inset(-0.3em -0.25em calc(${y}px - 0.3em) -0.25em)` : 'none',
      });
    });
  };
  const tl = gsap.timeline({
    paused: true,
    onUpdate: () => draw(tl.time()),
    onComplete: () => doneFns.forEach((fn) => fn()),
  });
  const rebuild = () => { tl.clear(); tl.to({}, { duration: 0.3 * (lines.length - 1) + 1 }); };
  rebuild();
  draw(0);

  // re-split when the width (and so the line breaks) changes
  let lastW = innerWidth;
  const resplit = () => {
    if (innerWidth === lastW) return;
    lastW = innerWidth;
    const done = tl.progress() === 1;
    lines = split();
    rebuild();
    draw(done ? tl.duration() : (isShown ? tl.time() : 0));
  };
  window.addEventListener('resize', resplit);
  document.fonts?.ready.then(() => { lastW = -1; resplit(); });

  return {
    show() { if (isShown) return; isShown = true; tl.restart(); },
    hide() { isShown = false; tl.pause(0); draw(0); },
    shown: () => isShown,
    duration: () => tl.duration(),
    onDone(fn) { doneFns.push(fn); },
  };
}

export function initSectionHeadings(selector, { skip } = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll(selector).forEach((el) => {
    if (skip && el.matches(skip)) return;
    const r = createLineReveal(el);
    new IntersectionObserver(([e]) => (e.isIntersecting ? r.show() : r.hide())).observe(el);
  });
}
