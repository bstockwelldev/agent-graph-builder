import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MS, useLongPress } from "./useLongPress";

const target = document.createElement("div");
const pointer = (overrides: Record<string, unknown> = {}) =>
  ({ pointerType: "touch", pointerId: 1, clientX: 100, clientY: 100, target, ...overrides }) as never;

describe("useLongPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires after a still touch held long enough, then swallows the click", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.onPointerDownCapture(pointer()));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS - 1));
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onLongPress).toHaveBeenCalledWith(target, 100, 100);
    const click = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as never;
    result.current.onClickCapture(click);
    expect((click as { preventDefault: () => void }).preventDefault).toHaveBeenCalled();
  });

  it("cancels on movement, lift, a second finger, and ignores the mouse", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    act(() => result.current.onPointerDownCapture(pointer()));
    act(() => result.current.onPointerMoveCapture(pointer({ clientX: 120 })));
    act(() => result.current.onPointerDownCapture(pointer()));
    act(() => result.current.onPointerUpCapture());
    act(() => result.current.onPointerDownCapture(pointer()));
    act(() => result.current.onPointerDownCapture(pointer({ pointerId: 2 })));
    act(() => result.current.onPointerDownCapture(pointer({ pointerType: "mouse" })));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2));
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
