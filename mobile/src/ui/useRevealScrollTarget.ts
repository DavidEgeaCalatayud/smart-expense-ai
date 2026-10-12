import { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, ScrollView as NativeScrollView } from 'react-native';

type ScrollRef = { current: NativeScrollView | null };

interface RevealOptions {
  focus?: () => void;
}

export function useRevealScrollTarget<T extends string>(
  scrollViewRef: ScrollRef,
  {
    offset = 12,
    highlightMs = 900,
    focusDelayMs = 260,
  }: {
    offset?: number;
    highlightMs?: number;
    focusDelayMs?: number;
  } = {},
) {
  const positionsRef = useRef(new Map<T, number>());
  const pendingRef = useRef<{ target: T; focus?: () => void } | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedTarget, setHighlightedTarget] = useState<T | null>(null);

  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
  }, []);

  const revealAt = (target: T, y: number) => {
    const pending = pendingRef.current;
    if (!pending || pending.target !== target) return;

    pendingRef.current = null;
    scrollViewRef.current?.scrollTo({
      y: Math.max(0, y - offset),
      animated: true,
    });

    setHighlightedTarget(target);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedTarget((current) => current === target ? null : current);
    }, highlightMs);

    if (pending.focus) {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(pending.focus, focusDelayMs);
    }
  };

  const reveal = (target: T, options: RevealOptions = {}) => {
    pendingRef.current = { target, focus: options.focus };
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const y = positionsRef.current.get(target);
        if (y !== undefined) revealAt(target, y);
      });
    });
  };

  const onLayout = (target: T) => (event: LayoutChangeEvent) => {
    const y = event.nativeEvent.layout.y;
    positionsRef.current.set(target, y);
    revealAt(target, y);
  };

  const cancel = (target?: T) => {
    if (!target || pendingRef.current?.target === target) {
      pendingRef.current = null;
    }
  };

  return {
    highlightedTarget,
    reveal,
    onLayout,
    cancel,
  };
}
