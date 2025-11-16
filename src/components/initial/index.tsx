import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

import Commands from "@/components/Commands";
import { Screenshot } from "@/types/screenshots";
import { fetchScreenshots } from "@/utils/screenshots";

interface InitialProps {
  setView: (view: "initial" | "response" | "followup") => void;
}

export default function Initial({ setView }: InitialProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: screenshots = [], refetch } = useQuery<Screenshot[]>({
    queryKey: ["screenshots"],
    queryFn: fetchScreenshots,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => refetch()),
      window.electronAPI.onResponseError((error: string) => {
        window.electronAPI.clearFixedResponseWidth?.().catch((error: any) => {
          console.warn("Failed to clear fixed response width:", error);
        });
        setView("initial");
        console.error("Processing error:", error);
      }),
    ];

    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, [refetch, setView]);


  return (
    <div 
      ref={contentRef} 
      className="relative space-y-2 px-4 py-2"
      style={{ minHeight: '80px' }}
    >
      <div className="relative z-10">
        <Commands
          view="initial"
          isMinimal={true}
        />
      </div>

      {screenshots.length > 0 && (
        <motion.div
          className="grid grid-cols-2 gap-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {screenshots.map((screenshot, index) => (
            <motion.div
              key={screenshot.path}
              className="relative group cursor-pointer"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => {
                window.electronAPI.triggerScreenshot();
                setView("response");
              }}
            >
              <img
                src={screenshot.preview}
                alt={`Screenshot ${index + 1}`}
                className="w-full h-20 object-cover rounded-lg border border-border/50 shadow-sm"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 rounded-lg flex items-center justify-center">
                <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs font-medium">
                  Click to analyze
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}