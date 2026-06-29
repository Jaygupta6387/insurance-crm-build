import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

const GAP = 4;
const DEFAULT_MAX_HEIGHT = 280;
const MIN_VISIBLE = 96;

/** Position a fixed portal panel anchored to a trigger rect (opens down when possible). */
export function computeFloatingPosition(rect: DOMRect, maxHeight = DEFAULT_MAX_HEIGHT): CSSProperties {
  const spaceBelow = window.innerHeight - rect.bottom - GAP;
  const spaceAbove = rect.top - GAP;
  const openDown = spaceBelow >= MIN_VISIBLE || spaceBelow >= spaceAbove;

  if (openDown) {
    return {
      position: 'fixed',
      top: rect.bottom + GAP,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(maxHeight, Math.max(MIN_VISIBLE, spaceBelow)),
      zIndex: 9999,
    };
  }

  return {
    position: 'fixed',
    bottom: window.innerHeight - rect.top + GAP,
    left: rect.left,
    width: rect.width,
    maxHeight: Math.min(maxHeight, Math.max(MIN_VISIBLE, spaceAbove)),
    zIndex: 9999,
  };
}

/** Keeps a portaled dropdown aligned with its anchor while open / on scroll. */
export function useFloatingPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  maxHeight = DEFAULT_MAX_HEIGHT,
) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const reposition = useCallback(() => {
    if (!anchorRef.current) return;
    setStyle(computeFloatingPosition(anchorRef.current.getBoundingClientRect(), maxHeight));
  }, [anchorRef, maxHeight]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  return { style, reposition };
}
