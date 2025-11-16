import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import Main from "@/components/main";
import "./scrollbar.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: Infinity,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

export default function App() {
  const [initialized, setInitialized] = useState(false);

  // Helper function to mark initialization complete
  const markInitialized = useCallback(() => {
    setInitialized(true);
    window.__IS_INITIALIZED__ = true;
  }, []);

  // Initialize app with default values
  useEffect(() => {
    try {
      markInitialized();
    } catch (e) {
      console.error("Error setting initial language", e);
    }
  }, [markInitialized]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen overflow-hidden bg-transparent">
        {initialized && <Main />}
      </div>
    </QueryClientProvider>
  );
}
