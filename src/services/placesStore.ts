/**
 * In-memory per-session Places API result store.
 *
 * Keyed by sessionId (UUID). Entries expire after 2 hours to prevent unbounded
 * memory growth. The legacy response.json file path is kept as a fallback so
 * the app still works when the createSession → places call hasn't been made
 * yet (e.g., direct testing via questionnaire alone).
 */

interface PlacesEntry {
  data: any;
  expiresAt: number; // Unix ms
}

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const store = new Map<string, PlacesEntry>();

export function savePlacesData(sessionId: string, data: any): void {
  store.set(sessionId, { data, expiresAt: Date.now() + TTL_MS });
}

export function getPlacesData(sessionId: string | undefined): any | null {
  if (!sessionId) return null;
  const entry = store.get(sessionId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(sessionId);
    return null;
  }
  return entry.data;
}

export function deletePlacesData(sessionId: string): void {
  store.delete(sessionId);
}
