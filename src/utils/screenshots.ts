import { Screenshot } from "../types/screenshots";

export async function fetchScreenshots(): Promise<Screenshot[]> {
  try {
    const response = await window.electronAPI.getScreenshots();
    const screenshots = response?.previews || response || [];

    return (Array.isArray(screenshots) ? screenshots : []).map((p: any) => ({
      id: p.path,
      path: p.path,
      preview: p.preview,
      timestamp: Date.now(),
    }));
  } catch (error) {
    console.error("Error loading screenshots:", error);
    throw error;
  }
}
