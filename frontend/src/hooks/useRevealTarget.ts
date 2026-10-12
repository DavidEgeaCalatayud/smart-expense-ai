import { useCallback, useRef, useState } from 'react';

export function useRevealTarget() {
  const ref = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState(false);

  const reveal = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const element = ref.current;
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setHighlighted(true);
        window.setTimeout(() => setHighlighted(false), 900);
        const firstField = element.querySelector<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button[data-autofocus="true"]',
        );
        window.setTimeout(() => firstField?.focus({ preventScroll: true }), 260);
      });
    });
  }, []);

  return { ref, reveal, highlighted };
}
