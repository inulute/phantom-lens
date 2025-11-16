import { getStoreValue } from "./main";

interface CounterResult {
  success: boolean;
  error?: string;
}

export async function incrementAppOpenCounter(): Promise<CounterResult> {
  try {
    const serverEndpoint = await getStoreValue("stats-server-endpoint");

    if (serverEndpoint && typeof serverEndpoint === "string" && serverEndpoint.trim()) {
      // Fire-and-forget: Don't await, let it run in background
      // This prevents blocking app startup
      sendIncrementToServer(serverEndpoint.trim()).catch((error) => {
        // Silent fail - don't spam console in production
        if (process.env.NODE_ENV === "development") {
          console.warn("[UsageCounter] Failed to send increment to server:", error);
        }
      });
    }

    return { success: true };
  } catch (error: any) {
    // Only log in development
    if (process.env.NODE_ENV === "development") {
      console.error("[UsageCounter] Error incrementing counter:", error);
    }
    return { success: false, error: error.message || "Unknown error" };
  }
}

// Timeout for fetch requests (5 seconds)
const FETCH_TIMEOUT = 5000;

async function sendIncrementToServer(endpoint: string): Promise<void> {
  try {
    // Validate URL format
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new Error("Invalid endpoint URL format");
    }

    // Add timestamp for cache busting
    url.searchParams.set('t', Date.now().toString());

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "User-Agent": "PhantomLens/1.0",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      // Success - no need to read response body (saves bandwidth)
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === "AbortError") {
        throw new Error("Request timeout");
      }
      throw fetchError;
    }
  } catch (error: any) {
    throw new Error(`Failed to send increment to server: ${error.message}`);
  }
}

export async function getAppOpenCount(): Promise<number> {
  return 0;
}

export async function resetAppOpenCount(): Promise<boolean> {
  console.log("[UsageCounter] Note: Server maintains the count. Reset on server if needed.");
  return true;
}

