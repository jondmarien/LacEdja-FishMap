/**
 * Resolve the Vercel Blob read-write token from the environment. Normally
 * BLOB_READ_WRITE_TOKEN, with a fallback to any <PREFIX>_READ_WRITE_TOKEN in
 * case the store was connected with a custom prefix. Accessed via globalThis
 * so this module type-checks in the client build (no Node types needed); it is
 * only ever called from the server API routes.
 */
export function resolveBlobToken(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  if (!env) return undefined
  if (env.BLOB_READ_WRITE_TOKEN) return env.BLOB_READ_WRITE_TOKEN
  const key = Object.keys(env).find((k) => /_READ_WRITE_TOKEN$/.test(k))
  return key ? env[key] : undefined
}
