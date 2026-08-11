"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

export default function HeroGallery({
  images,
  intervalMs = 5000,
}: {
  images: string[];
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [images.length, intervalMs]);

  return (
    <>
      {images.map((src, i) => (
        <motion.div
          key={src}
          className="absolute inset-0"
          animate={{ opacity: i === index ? 1 : 0 }}
          transition={{ duration: 1.4, ease: "easeInOut" }}
        >
          {/* Only the first slide is the LCP element, so only it is
              preloaded. `priority` on all seven emitted seven
              <link rel="preload"> tags and pulled ~1.3 MB before first
              paint to display 212 KB of it. The others fade in on a 5 s
              timer — far longer than a lazy fetch needs. */}
          <Image
            src={src}
            alt=""
            fill
            priority={i === 0}
            loading={i === 0 ? undefined : "lazy"}
            sizes="100vw"
            className="object-cover"
          />
        </motion.div>
      ))}
    </>
  );
}
