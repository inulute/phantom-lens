import { getStoreValue } from "./main";

interface CounterResult {
  success: boolean;
  error?: string;
}

export async function incrementAppOpenCounter(): Promise<CounterResult> {
  try {
    const serverEndpoint = await getStoreValue("stats-server-endpoint");
    
    console.log("[UsageCounter] Endpoint from store:", serverEndpoint);

    if (serverEndpoint && typeof serverEndpoint === "string" && serverEndpoint.trim()) {
      const endpoint = serverEndpoint.trim();
      console.log("[UsageCounter] Sending increment to:", endpoint);
      
      // Fire-and-forget: Don't await, let it run in background
      // This prevents blocking app startup
      sendIncrementToServer(endpoint).catch((error) => {
        // Always log errors for debugging
        console.error("[UsageCounter] Failed to send increment to server:", error);
      });
    } else {
      console.warn("[UsageCounter] No endpoint configured or invalid endpoint");
    }

    return { success: true };
  } catch (error: any) {
    console.error("[UsageCounter] Error incrementing counter:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
}

// Timeout for fetch requests (5 seconds)
const FETCH_TIMEOUT = 5000;

async function sendIncrementToServer(endpoint: string): Promise<void> {
  try {
    // Remove trailing slash if present (can cause issues)
    const cleanEndpoint = endpoint.replace(/\/$/, '');
    
    // Validate URL format
    let url: URL;
    try {
      url = new URL(cleanEndpoint);
    } catch (urlError) {
      console.error("[UsageCounter] Invalid URL format:", cleanEndpoint, urlError);
      throw new Error("Invalid endpoint URL format");
    }

    // Add timestamp for cache busting
    url.searchParams.set('t', Date.now().toString());
    
    const finalUrl = url.toString();
    console.log("[UsageCounter] Fetching:", finalUrl);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const response = await fetch(finalUrl, {
        method: "GET",
        headers: {
          "User-Agent": "PhantomLens/1.0",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log("[UsageCounter] Response status:", response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      console.log("[UsageCounter] Successfully sent increment to server");
      // Success - no need to read response body (saves bandwidth)
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === "AbortError") {
        console.error("[UsageCounter] Request timeout after", FETCH_TIMEOUT, "ms");
        throw new Error("Request timeout");
      }
      console.error("[UsageCounter] Fetch error:", fetchError.message, fetchError);
      throw fetchError;
    }
  } catch (error: any) {
    console.error("[UsageCounter] Error in sendIncrementToServer:", error.message);
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

