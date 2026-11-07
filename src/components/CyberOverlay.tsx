import { useEffect, useRef } from 'react';

/* Custom cursor: exact-follow dot, short-lag ring, pooled trail, click ripple.
 *
 * Measured with cursor-speed.check.mjs, the previous loop closed 95% of a gap in
 * ~115ms and — worse — depended on requestAnimationFrame, which is starved
 * whenever the page is busy: on the landing screen the whole loop only got 2-4
 * frames in 900ms, so the ring simply never arrived. Any easing on top of that
 * was decoration.
 *
 * So there is no animation loop here. Both elements are positioned inside the
 * pointer handler itself (a compositor-only transform write), and the ring's
 * short lag comes from a 60ms CSS transform transition, which the compositor
 * interpolates even when the main thread is blocked. The dot has no transition,
 * so it is exactly on the pointer.
 *
 * Hover, press and drag come from delegated pointer events, which also removes
 * the per-frame `elementFromPoint` layout that used to run inside the loop.
 */
const NEON_COLORS = ['#00FFFF', '#FF00CC', '#00FF88', '#FFE000', '#AA44FF'];

/* Interactive things the ring reacts to, including the clickable cards that
 * never carried the old .side-card/.wing-card classes. */
const HOVER_SELECTOR = [
  'button', 'a', 'input', 'textarea', 'select', 'summary', 'label',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[data-cursor="hover"]', 'canvas',
].join(',');

const TRAIL_POOL = 14;
const TRAIL_INTERVAL_MS = 34;
const TRAIL_LIFE_MS = 420;

export default function CyberOverlay() {
  const rootRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Touch and stylus-only devices have no hover: keep the native cursor, drop
    // the overlay, and never hide the system pointer.
    if (!window.matchMedia('(pointer: fine) and (hover: hover)').matches) return;

    const root = rootRef.current;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!root || !dot || !ring) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.dataset.customCursor = 'on';

    let lastTrailAt = 0;

    /* Trail dots are pooled and animated with the Web Animations API: reusing a
       node costs no DOM insert, and transform/opacity run on the compositor. */
    const trails: HTMLDivElement[] = [];
    if (!reduceMotion) {
      for (let index = 0; index < TRAIL_POOL; index += 1) {
        const node = document.createElement('div');
        node.className = 'cursor-trail';
        node.style.background = NEON_COLORS[index % NEON_COLORS.length];
        root.appendChild(node);
        trails.push(node);
      }
    }
    let trailCursor = 0;

    const spawnTrail = (x: number, y: number) => {
      if (!trails.length) return;
      const node = trails[trailCursor % trails.length];
      trailCursor += 1;
      node.getAnimations().forEach(animation => animation.cancel());
      node.animate(
        [
          { transform: `translate3d(${x}px,${y}px,0) translate(-50%,-50%) scale(1)`, opacity: 1 },
          {
            transform: `translate3d(${x + (Math.random() - 0.5) * 16}px,${y + (Math.random() - 0.5) * 16}px,0) translate(-50%,-50%) scale(0)`,
            opacity: 0,
          },
        ],
        { duration: TRAIL_LIFE_MS, easing: 'cubic-bezier(0.2,0.7,0.3,1)', fill: 'none' },
      );
    };

    const spawnRipple = (x: number, y: number) => {
      const color = NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
      const outer = document.createElement('div');
      outer.className = 'click-ripple';
      outer.style.cssText = `left:${x}px;top:${y}px;width:40px;height:40px;border:2px solid ${color};box-shadow:0 0 12px currentColor;`;
      const inner = document.createElement('div');
      inner.className = 'click-ripple';
      inner.style.cssText = `left:${x}px;top:${y}px;width:16px;height:16px;background:rgba(0,255,255,0.3);box-shadow:0 0 20px rgba(0,255,255,0.6);animation-duration:0.4s;`;
      document.body.append(outer, inner);
      window.setTimeout(() => outer.remove(), 700);
      window.setTimeout(() => inner.remove(), 450);
    };

    const place = (x: number, y: number) => {
      const position = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      dot.style.transform = position;
      ring.style.transform = position;
    };

    const setHover = (active: boolean) => root.classList.toggle('hovering', active);

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const { clientX: x, clientY: y } = event;
      place(x, y);
      const now = performance.now();
      if (trails.length && now - lastTrailAt >= TRAIL_INTERVAL_MS) {
        lastTrailAt = now;
        spawnTrail(x, y);
      }
    };

    const onPointerOver = (event: PointerEvent) => {
      const target = event.target;
      setHover(target instanceof Element && !!target.closest(HOVER_SELECTOR));
    };

    const onPointerOut = (event: PointerEvent) => {
      const next = event.relatedTarget;
      setHover(next instanceof Element && !!next.closest(HOVER_SELECTOR));
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      root.classList.add('clicking', 'dragging');
      spawnRipple(event.clientX, event.clientY);
      place(event.clientX, event.clientY);
    };

    const release = () => root.classList.remove('clicking', 'dragging');

    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerover', onPointerOver, { passive: true });
    document.addEventListener('pointerout', onPointerOut, { passive: true });
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('pointerup', release, { passive: true });
    document.addEventListener('pointercancel', release, { passive: true });

    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      trails.forEach(node => { node.getAnimations().forEach(animation => animation.cancel()); node.remove(); });
      delete document.documentElement.dataset.customCursor;
    };
  }, []);

  return (
    <div id="cyber-cursor" ref={rootRef}>
      <div className="cursor-dot" ref={dotRef} />
      <div className="cursor-ring" ref={ringRef} />
    </div>
  );
}
