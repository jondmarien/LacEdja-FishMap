import { put } from '@vercel/blob'
import { logger } from '../src/lib/logger.js'

/**
 * Resolve the Blob read-write token. Normally Vercel injects
 * BLOB_READ_WRITE_TOKEN when a Blob store is connected to the project; fall
 * back to any <PREFIX>_READ_WRITE_TOKEN var so uploads keep working even if
 * the store was connected with a custom prefix.
 */
function resolveBlobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN
  const key = Object.keys(process.env).find((k) => /_READ_WRITE_TOKEN$/.test(k))
  if (key) {
    logger.api('warn', 'Using non-standard Blob token env var', { envVar: key })
    return process.env[key]
  }
  return undefined
}

/**
 * Server-side photo upload. The client sends an already-optimized JPEG as
 * multipart/form-data and we stream it to Blob with put(). This avoids the
 * client-token + onUploadCompleted callback flow, which was stalling uploads
 * (token issued, but the file never finalized into the store).
 */
export async function POST(request: Request) {
  const token = resolveBlobToken()
  if (!token) {
    const blobVars = Object.keys(process.env).filter((k) => /BLOB/i.test(k))
    logger.api('error', 'No Blob read-write token in environment', { blobVars })
    return Response.json(
      {
        error:
          'Photo storage is not configured (missing BLOB_READ_WRITE_TOKEN). Connect the Blob store to this project and redeploy.',
      },
      { status: 500 },
    )
  }

  let file: File | null = null
  try {
    const form = await request.formData()
    const f = form.get('file')
    if (f instanceof File) file = f
  } catch (error) {
    logger.api('error', 'Could not parse upload form', { error: String(error) })
    return Response.json({ error: 'Invalid upload request' }, { status: 400 })
  }

  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 })
  }

  try {
    const blob = await put(file.name || 'photo.jpg', file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type || 'image/jpeg',
      token,
    })
    logger.api('info', 'Photo uploaded', { url: blob.url, bytes: file.size })
    return Response.json({ url: blob.url })
  } catch (error) {
    logger.api('error', 'Photo upload failed', { error: String(error) })
    return Response.json({ error: (error as Error).message }, { status: 400 })
  }
}
