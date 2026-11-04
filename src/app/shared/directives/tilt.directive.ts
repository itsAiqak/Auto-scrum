import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Tilts the host towards the mouse pointer. It only sets CSS variables; the host's styles decide how to use them:
 *   --rx / --ry  rotation in deg          --tx / --ty  pointer offset from the centre, -1..1
 *   --mx / --my  pointer position in %    .tilting     present while the pointer is over the host
 * Plain DOM listeners (not @HostListener) so mouse moves never trigger change detection.
 */
@Directive({ selector: '[appTilt]' })
export class TiltDirective {
  /** Maximum rotation in degrees. */
  readonly max = input(9, { alias: 'appTilt', transform: (value: number | '') => (value === '' ? 9 : value) });

  constructor() {
    const el: HTMLElement = inject(ElementRef).nativeElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;

    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
        const max = reducedMotion ? 0 : this.max();
        el.classList.add('tilting');
        el.style.setProperty('--rx', `${((y - 0.5) * 2 * max).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${((0.5 - x) * 2 * max).toFixed(2)}deg`);
        el.style.setProperty('--tx', ((x - 0.5) * 2).toFixed(3));
        el.style.setProperty('--ty', ((y - 0.5) * 2).toFixed(3));
        el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      });
    };

    const leave = () => {
      cancelAnimationFrame(frame);
      el.classList.remove('tilting');
      for (const name of ['--rx', '--ry', '--tx', '--ty', '--mx', '--my']) el.style.removeProperty(name);
    };

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    });
  }
}
