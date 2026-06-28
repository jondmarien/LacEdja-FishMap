import { get } from '@vercel/blob'
import { resolveBlobToken } from '../src/lib/blobToken.js'
import { logger } from '../src/lib/logger.js'

/**
 * Streams a private Blob to the browser so catch photos can be shown/downloaded
 * without making the store public. The pathname is supplied by /api/upload as
 * a same-origin proxy URL (/api/photo?pathname=...).
 */
export async function GET(request: Request) {
  const token = resolveBlobToken()
  if (!token) {
    return new Response('Photo storage is not configured', { status: 500 })
  }

  const pathname = new URL(request.url).searchParams.get('pathname')
  if (!pathname) {
    return new Response('Missing pathname', { status: 400 })
  }

  try {
    const result = await get(pathname, { access: 'private', token })
    if (!result) {
      return new Response('Not found', { status: 404 })
    }
    return new Response(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    logger.api('error', 'Failed to serve photo', { error: String(error) })
    return new Response('Error serving photo', { status: 500 })
  }
}
