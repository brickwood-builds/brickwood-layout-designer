import { useLayoutEffect, useRef } from 'react';

/** Nudge a pop-up sideways so it stays inside the window (it opens under its button). */
export function useKeepInView<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    el.style.transform = '';
    const r = el.getBoundingClientRect();
    const margin = 8;
    let dx = 0;
    if (r.left < margin) dx = margin - r.left;
    else if (r.right > window.innerWidth - margin) dx = window.innerWidth - margin - r.right;
    if (dx) el.style.transform = `translateX(${dx}px)`;
  }, [open]);
  return ref;
}
