"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type PageMotionProps = {
  children: React.ReactNode;
  className?: string;
};

export function PageMotion({ children, className }: PageMotionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
