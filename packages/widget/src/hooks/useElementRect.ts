import { useState, useEffect, useRef } from "react";
import { resolveKey } from "../engine/selectors.js";

export function useElementRect(elementKey: string | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!elementKey) {
      setRect(null);
      return;
    }

    function update() {
      const hit = resolveKey(elementKey!);
      setRect(hit ? hit.element.getBoundingClientRect() : null);
      rafRef.current = requestAnimationFrame(update);
    }

    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [elementKey]);

  return rect;
}
