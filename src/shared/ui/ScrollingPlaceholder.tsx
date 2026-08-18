"use client";

import { useEffect, useRef, useState } from "react";

export default function ScrollingPlaceholder({
  text,
  active,
  className,
}: {
  text: string;
  active: boolean;
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scrollDistance, setScrollDistance] = useState(0);

  useEffect(() => {
    function measure() {
      if (!outerRef.current || !textRef.current) return;
      const overflow = textRef.current.scrollWidth - outerRef.current.clientWidth;
      setScrollDistance(overflow > 4 ? overflow + 8 : 0);
    }

    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [text]);

  if (!active) return null;

  return (
    <div
      ref={outerRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 flex items-center overflow-hidden ${className ?? ""}`}
    >
      <span
        ref={textRef}
        className="whitespace-nowrap text-char-500"
        style={
          scrollDistance > 0
            ? ({
                "--scroll-x": `-${scrollDistance}px`,
                animation: "text-scroll 6s ease-in-out infinite",
              } as React.CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </div>
  );
}
