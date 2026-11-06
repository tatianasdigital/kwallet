/*
 * SpecificationsModal — Figma "Pop-up" (490:8421): Technical Specifications
 * panel on the right, over a dimmed, blurred page.
 *
 *  - Opens from any .specifications-link (no navigation). The product name
 *    and the CTA (label + link) come from the pricing card that was clicked.
 *  - Closes with the close button, a click on the backdrop (only the backdrop
 *    itself, never inside the panel) or Escape; the CTA closes it too.
 *  - Opening / closing: the backdrop fades, the panel fades and slides in a
 *    little (250 ms; styles.css). The element is only display:none'd after
 *    the closing transition, so nothing flickers.
 *  - While open every animation of the page is paused (src/site-pause.js).
 *  - While open: the page can't scroll (smooth scroll stopped, html overflow
 *    hidden, scrollbar width compensated, position kept); the panel content
 *    scrolls on its own if the screen is too short; the rest of the page is
 *    inert, focus moves into the dialog, Tab stays inside it, and on close
 *    focus returns to the link that opened it.
 */
import { fitButtonLabel } from './btn-hover.js';
import { setPaused } from './site-pause.js';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const DURATION = 900;   // ms, closing: panel slides out, then the backdrop fades (styles.css)

export function initSpecificationsModal({ lenis } = {}) {
  const overlay = document.getElementById('specifications-overlay');
  const links = document.querySelectorAll('.specifications-link');
  if (!overlay || !links.length) return null;
  const dialog = overlay.querySelector('.specifications-modal');
  const body = overlay.querySelector('.spec-modal-body');
  const title = overlay.querySelector('.spec-modal-title');
  const closeBtn = overlay.querySelector('.spec-modal-close');
  const cta = overlay.querySelector('.spec-modal-cta');
  // button labels may be split into the typeface-flicker copies (src/link-jitter.js):
  // read the original text, and write both the original and its copy
  const btnText = (b) => {
    if (!b) return '';
    const bases = [...b.querySelectorAll('.tf-base')];
    if (bases.length) return bases.map((n) => n.textContent).join(' ').trim();
    return [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim();
  };
  const setBtnText = (b, text) => {
    if (!b) return;
    const word = b.querySelector('.tf-word');
    if (word) {
      word.querySelector('.tf-base').textContent = text;
      word.querySelector('.tf-alt').textContent = text;
      [...b.querySelectorAll('.tf-word')].slice(1).forEach((w) => w.remove());
      return;
    }
    const node = [...b.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (node) node.nodeValue = text;
  };
  const defaults = { name: title.textContent, label: btnText(cta), href: cta?.getAttribute('href') };

  let opener = null;
  let open = false;
  let hideTimer = 0;
  let inerted = [];

  const fillFrom = (link) => {
    const card = link.closest('.pricing-card');
    const h3 = card?.querySelector('.product-header h3');
    // the title may carry the typeface-flicker copy: read the original text only
    const name = (h3?.querySelector('.tf-base') || h3)?.textContent.trim();
    const btn = card?.querySelector('.purchase-details .btn');
    title.textContent = name || defaults.name;
    setBtnText(cta, btnText(btn) || defaults.label);
    fitButtonLabel(cta);
    cta?.setAttribute('href', btn?.getAttribute('href') || defaults.href);
    // same look as the card's own purchase button: green (devkit) or white (Kampela, Kampela x 2)
    if (cta) {
      const white = !!btn?.classList.contains('btn--white');
      cta.classList.toggle('btn--white', white);
      cta.classList.toggle('btn--green', !white);
      const arrow = cta.querySelector(':scope > img');
      if (arrow) arrow.src = `/assets/icon-arrow-right-${white ? 'dark' : 'white'}.svg`;
    }
  };

  const lockPage = () => {
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--scrollbar-w', `${Math.max(0, sbw)}px`);
    document.documentElement.classList.add('modal-open');
    lenis?.stop();
    setPaused(true);                          // every animation of the page waits
    inerted = [...document.body.children].filter((el) => el !== overlay && !el.inert && el.tagName !== 'SCRIPT');
    inerted.forEach((el) => { el.inert = true; });
  };
  const unlockPage = () => {
    inerted.forEach((el) => { el.inert = false; });
    inerted = [];
    document.documentElement.classList.remove('modal-open');
    document.documentElement.style.removeProperty('--scrollbar-w');
    lenis?.start();
    setPaused(false);
  };

  const show = (link) => {
    if (open) return;
    open = true;
    opener = link;
    clearTimeout(hideTimer);
    fillFrom(link);
    body.scrollTop = 0;
    lockPage();
    overlay.hidden = false;
    void overlay.offsetWidth;                 // commit the start state before animating
    overlay.classList.add('is-visible');
    closeBtn.focus({ preventScroll: true });
    document.addEventListener('keydown', onKey, true);
  };

  const hide = ({ restoreFocus = true } = {}) => {
    if (!open) return;
    open = false;
    document.removeEventListener('keydown', onKey, true);
    overlay.classList.remove('is-visible');
    const done = () => {
      clearTimeout(hideTimer);
      overlay.removeEventListener('transitionend', onEnd);
      if (open) return;                       // reopened meanwhile
      overlay.hidden = true;
    };
    const onEnd = (e) => { if (e.target === overlay) done(); };
    overlay.addEventListener('transitionend', onEnd);
    hideTimer = setTimeout(done, DURATION + 100);
    unlockPage();
    if (restoreFocus) opener?.focus({ preventScroll: true });
  };

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); hide(); return; }
    if (e.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === closeBtn);
    if (!items.length) { e.preventDefault(); dialog.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      e.preventDefault(); first.focus();
    }
  }

  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();                    // keep the smooth-scroll anchor handler out of it
      show(link);
    });
  });
  closeBtn.addEventListener('click', () => hide());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });
  cta?.addEventListener('click', () => hide({ restoreFocus: false }));

  return { open: show, close: hide };
}
