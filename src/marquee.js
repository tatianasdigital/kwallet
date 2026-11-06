/*
 * Marquees — two identical halves inside .marquee-content, animated by CSS
 * (translateX 0 → -50%), so the loop is seamless at any width.
 * Shared by the landing page (src/main.js) and the inner pages (src/subpage.js).
 */
const GROUPS_PER_HALF = 6; // one half ≈ 2800 Figma px — always wider than the viewport

export function buildMarquees() {
  document.querySelectorAll('.marquee-track[data-marquee-items]').forEach((track) => {
    const items = track.dataset.marqueeItems.split('|');
    const group = items
      .map((raw) => {
        const muted = raw.startsWith('~');
        const text = muted ? raw.slice(1) : raw;
        return ` / <span${muted ? ' class="is-muted"' : ''}>${text}</span>`;
      })
      .join('');
    track.innerHTML = group.repeat(GROUPS_PER_HALF);
    track.removeAttribute('data-marquee-items');
    // second, visually identical half
    const clone = track.cloneNode(true);
    track.after(clone);
  });
}
