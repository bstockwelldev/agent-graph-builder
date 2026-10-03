import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";

export const LONG_PRESS_MS = 500;
export const LONG_PRESS_SLOP_PX = 8;

/**
 * Touch long-press as a context menu: a finger held still for 500 ms calls
 * `onLongPress` with the pressed element and point. Moving more than 8 px,
 * lifting, or a second finger cancels it. The click that follows a fired
 * press is swallowed so it doesn't also select or close what just opened.
 * Mouse and pen keep using the browser's contextmenu event.
 */
export function useLongPress(onLongPress: (target: Element, x: number, y: number) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const fired = useRef(false);
  const callback = useRef(onLongPress);
  callback.current = onLongPress;

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerType !== "touch") return;
      if (start.current) {
        cancel(); // a second finger: pinch, not a press
        return;
      }
      fired.current = false;
      const target = event.target as Element;
      const { clientX: x, clientY: y } = event;
      start.current = { x, y, pointerId: event.pointerId };
      timer.current = setTimeout(() => {
        timer.current = null;
        start.current = null;
        fired.current = true;
        callback.current(target, x, y);
      }, LONG_PRESS_MS);
    },
    [cancel],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const origin = start.current;
      if (!origin || origin.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > LONG_PRESS_SLOP_PX) cancel();
    },
    [cancel],
  );

  const onClickCapture = useCallback((event: ReactMouseEvent) => {
    if (!fired.current) return;
    fired.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return { onPointerDownCapture: onPointerDown, onPointerMoveCapture: onPointerMove, onPointerUpCapture: cancel, onPointerCancelCapture: cancel, onClickCapture };
}
