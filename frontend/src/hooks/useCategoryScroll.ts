import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** Native category scrolling; observers only update the overflow cue. */
export function useCategoryScroll(ref: RefObject<HTMLDivElement | null>, selected: string, layoutKey: string) {
  const previousSelection = useRef(selected);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setHasMore(element.scrollWidth - element.clientWidth - element.scrollLeft > 2);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(element);
    element.addEventListener('scroll', schedule, { passive: true });
    schedule();
    return () => {
      observer?.disconnect();
      element.removeEventListener('scroll', schedule);
      cancelAnimationFrame(frame);
    };
  }, [layoutKey, ref]);

  useEffect(() => {
    const element = ref.current;
    const button = element?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    const changed = previousSelection.current !== selected;
    previousSelection.current = selected;
    if (!element || !button || getComputedStyle(element).overflowX === 'visible') return;
    const bounds = element.getBoundingClientRect();
    const target = button.getBoundingClientRect();
    const style = getComputedStyle(element);
    const leftEdge = bounds.left + parseFloat(style.paddingLeft || '0');
    const rightEdge = bounds.right - parseFloat(style.paddingRight || '0');
    const delta = target.left < leftEdge ? target.left - leftEdge : target.right > rightEdge ? target.right - rightEdge : 0;
    if (Math.abs(delta) < 1) return;
    element.scrollTo({ left: element.scrollLeft + delta, behavior: changed && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
  }, [selected, layoutKey, ref]);

  return hasMore;
}
