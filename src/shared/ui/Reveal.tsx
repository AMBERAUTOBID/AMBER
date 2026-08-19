"use client";

import { motion } from "framer-motion";
import { clsx } from "clsx";

export default function Reveal({
  children,
  className,
  delay = 0,
  y = 20,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  /**
   * A scroll target, for the rare block something else has to reach — the
   * phone's sticky lot bar scrolls to the cost panel this way.
   *
   * Added rather than wrapping the call site in a plain `<div id>`: this
   * component is usually a grid child carrying its own column span, and an
   * extra wrapper would have to inherit that span or quietly break the layout.
   */
  id?: string;
}) {
  return (
    <motion.div
      id={id}
      className={clsx(className)}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
