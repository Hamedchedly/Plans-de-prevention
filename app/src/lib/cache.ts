/** Cache du navigateur (localStorage) : propre à chaque poste, jamais partagé. Toute erreur d'accès est ignorée. */
const PREFIX = 'pp-cache:'

export function readCache<T>(key: string): { at: number; value: T } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as { at: number; value: T }) : null
  } catch {
    return null
  }
}

export function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value }))
  } catch {
    // quota dépassé ou stockage désactivé : pas de cache, sans conséquence pour l'affichage
  }
}

/** Renvoie le cache s'il est assez récent, sinon interroge le serveur. En cas d'échec, reprend le cache même ancien. */
export async function cachedFetch<T>(key: string, maxAgeMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = readCache<T>(key)
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.value
  try {
    const value = await fetcher()
    writeCache(key, value)
    return value
  } catch (e) {
    if (hit) return hit.value
    throw e
  }
}
