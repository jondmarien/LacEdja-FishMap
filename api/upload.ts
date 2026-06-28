import { put } from '@vercel/blob'
import { resolveBlobToken } from '../src/lib/blobToken.js'
import { logger } from '../src/lib/logger.js'

/**
 * Server-side photo upload to a PRIVATE Blob store. The client sends the
 * already-optimized JPEG as the raw request body with ?filename=. We store it
 * with private access and return a same-origin proxy URL (/api/photo?pathname=)
 * so the rest of the app can display/download it without exposing the store.
 */
export async function POST(request: Request) {
  const token = resolveBlobToken()
  if (!token) {
    const blobVars = Object.keys((globalThis as any).process?.env ?? {}).filter((k) =>
      /BLOB/i.test(k),
    )
    logger.api('error', 'No Blob read-write token in environment', { blobVars })
    return Response.json(
      {
        error:
          'Photo storage is not configured (missing BLOB_READ_WRITE_TOKEN). Connect the Blob store to this project and redeploy.',
      },
      { status: 500 },
    )
  }

  const filename = new URL(request.url).searchParams.get('filename') || 'photo.jpg'
  const contentType = request.headers.get('content-type') || 'image/jpeg'

  let bytes: ArrayBuffer
  try {
    bytes = await request.arrayBuffer()
  } catch (error) {
    logger.api('error', 'Could not read upload body', { error: String(error) })
    return Response.json({ error: 'Invalid upload request' }, { status: 400 })
  }

  if (bytes.byteLength === 0) {
    return Response.json({ error: 'No file provided' }, { status: 400 })
  }

  try {
    const blob = await put(filename, bytes, {
      access: 'private',
      addRandomSuffix: true,
      contentType,
      token,
    })
    // Hand back a proxy URL, not the private blob URL (which isn't directly
    // viewable). The /api/photo route streams it with the server token.
    const proxyUrl = `/api/photo?pathname=${encodeURIComponent(blob.pathname)}`
    logger.api('info', 'Photo uploaded', { pathname: blob.pathname, bytes: bytes.byteLength })
    return Response.json({ url: proxyUrl })
  } catch (error) {
    logger.api('error', 'Photo upload failed', { error: String(error) })
    return Response.json({ error: (error as Error).message }, { status: 400 })
  }
}
