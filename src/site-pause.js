/*
 * One switch that freezes every animation of the site (used while the
 * Specifications modal is open):
 *  - GSAP: the global timeline is paused (all tweens, timelines, delayed calls);
 *  - CSS animations: paused through html.anims-paused (styles.css);
 *  - the hand-made loops (stop-motion vectors, drawn lines, typeface flicker,
 *    the 0101 wave, the water splash) check isPaused() and hold their frame.
 * On resume everything continues from where it stopped — no jumps.
 */
import { gsap } from 'gsap';

let paused = false;

export const isPaused = () => paused;

export function setPaused(on) {
  if (paused === on) return;
  paused = on;
  document.documentElement.classList.toggle('anims-paused', on);
  if (on) gsap.globalTimeline.pause();
  else gsap.globalTimeline.resume();
}
