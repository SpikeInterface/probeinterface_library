import { useCallback, useRef, useState } from "react";

interface Size {
  width: number;
  height: number;
}

export function useResizeObserver<T extends HTMLElement>() {
  const observerRef = useRef<ResizeObserver | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  const callbackRef = useCallback((node: T | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (node) {
      observerRef.current = new ResizeObserver(([entry]) => {
        const box = entry.contentRect;
        setSize({ width: box.width, height: box.height });
      });
      observerRef.current.observe(node);
    }
  }, []);

  return { ref: callbackRef, size };
}
