import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

import Initial from "@/components/initial";
import Response from "@/components/response";
import { memo } from "react";
import { useQueryClient } from "@tanstack/react-query";

const MemoizedInitial = memo(Initial);
const MemoizedResponse = memo(Response);
  
const VIEW_DIMENSIONS: Record<"initial" | "response" | "followup", { width: number; height: number }> = {
  initial: { width: 832, height: 260 },
  response: { width: 832, height: 660 },
  followup: { width: 832, height: 700 },
};

function useDimensionUpdates(view: "initial" | "response" | "followup") {
  useEffect(() => {
    const dimensions = VIEW_DIMENSIONS[view] ?? VIEW_DIMENSIONS.response;
    console.log("[Dimensions] Applying preset dimensions for view:", view, dimensions);
    window.electronAPI?.updateContentDimensions({
      width: dimensions.width,
      height: dimensions.height,
    });
  }, [view]);
}

const pageVariants = {
  initial: {
    opacity: 0,
    x: -20,
    scale: 0.95,
  },
  enter: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      duration: 0.2,
      ease: [0.25, 0.25, 0, 1],
      staggerChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    x: 20,
    scale: 0.95,
    transition: {
      duration: 0.15,
      ease: [0.25, 0.25, 0, 1],
    },
  },
};

const containerVariants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.1,
      when: "beforeChildren",
    },
  },
};

export default function Main() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"initial" | "response" | "followup">("initial");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useDimensionUpdates(view);

  const setViewWithTransition = useCallback((newView: "initial" | "response" | "followup") => {
    if (newView === view) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setView(newView);
      setIsTransitioning(false);
    }, 50);
  }, [view]);

  useEffect(() => {
    const cleanup = window.electronAPI.onResetView(() => {
      queryClient.invalidateQueries({ queryKey: ["screenshots"] });
      queryClient.invalidateQueries({ queryKey: ["response"] });
      queryClient.invalidateQueries({ queryKey: ["new_response"] });
      setViewWithTransition("initial");
    });

    return () => {
      cleanup();
    };
  }, [queryClient, setViewWithTransition]);

  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onResponseStart(() => {
        setViewWithTransition("response");
      }),
      window.electronAPI.onResetView(() => {
        queryClient.removeQueries({ queryKey: ["screenshots"] });
        queryClient.removeQueries({ queryKey: ["response"] });
        setViewWithTransition("initial");
      }),
    ];
    return () => cleanupFunctions.forEach((fn) => fn());
  }, [setViewWithTransition, queryClient]);

  useEffect(() => {
    const body = document.body;
    body.classList.remove("view-initial", "view-response", "view-followup");
    body.classList.add(`view-${view}`);
  }, [view]);

  return (
    <motion.div
      ref={containerRef}
      className="min-h-screen overflow-hidden relative flex items-start justify-center"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >

      <AnimatePresence mode="wait" onExitComplete={() => setIsTransitioning(false)}>
        {view === "initial" ? (
          <motion.div
            key="initial"
            variants={pageVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="relative z-10"
          >
            <MemoizedInitial setView={setViewWithTransition} />
          </motion.div>
        ) : view === "response" ? (
          <motion.div
            key="response"
            variants={pageVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="relative z-10"
          >
            <MemoizedResponse setView={setViewWithTransition} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}