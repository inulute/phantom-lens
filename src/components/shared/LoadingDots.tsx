import React from "react";
import { motion } from "framer-motion";

interface LoadingDotsProps {
  color?: string;
  size?: number;
  gap?: number;
}

export default function LoadingDots({ color, size, gap }: LoadingDotsProps) {
  const dotVariants = {
    pulse: {
      scale: [1, 1.3, 1],
      opacity: [0.5, 1, 0.5],
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
  };

  return (
    <motion.div
      animate="pulse"
      transition={{ staggerChildren: 0.15 }}
      className="flex justify-center items-center"
      style={{
        gap: `${gap}px`,
      }}
    >
      <motion.div
        className="dot rounded-full will-change-transform"
        variants={dotVariants}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: color,
        }}
      />
      <motion.div
        className="dot rounded-full will-change-transform"
        variants={dotVariants}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: color,
        }}
      />
      <motion.div
        className="dot rounded-full will-change-transform"
        variants={dotVariants}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: color,
        }}
      />
    </motion.div>
  );
}
