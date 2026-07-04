/**
 * Ask the browser to protect this origin's storage from automatic eviction.
 * Call from a user gesture (e.g. download button click), not on page load.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      return navigator.storage.persist()
    }
  } catch {
    // Feature unavailable or blocked — best-effort only.
  }
  return false
}
