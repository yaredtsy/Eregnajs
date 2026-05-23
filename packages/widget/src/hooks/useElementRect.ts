import { useState, useEffect, useRef } from "react";

export function useElementRect(elementId: string | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!elementId) {
      setRect(null);
      return;
    }

    function update() {
      const el = document.getElementById(elementId!);
      setRect(el ? el.getBoundingClientRect() : null);
      rafRef.current = requestAnimationFrame(update);
    }

    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [elementId]);

  return rect;
}
