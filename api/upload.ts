import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { logger } from '../src/lib/logger.js'

/**
 * Resolve the Blob read-write token. Normally Vercel injects
 * BLOB_READ_WRITE_TOKEN when a Blob store is connected to the project, but if
 * the store was connected with a custom prefix the var can be named
 * <PREFIX>_READ_WRITE_TOKEN. Fall back to any such var so uploads keep working.
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

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody
  const token = resolveBlobToken()

  if (!token) {
    // Names only — never log secret values.
    const blobVars = Object.keys(process.env).filter((k) => /BLOB/i.test(k))
    logger.api('error', 'No Blob read-write token in environment', { blobVars })
    return Response.json(
      {
        error:
          'Photo storage is not configured on the server (missing BLOB_READ_WRITE_TOKEN). Connect the Blob store to this project and redeploy.',
      },
      { status: 500 },
    )
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async () => ({
        // Allow any image type. Phone cameras (esp. iPhone) often produce
        // HEIC/HEIF, which an explicit jpeg/png/webp list silently rejected.
        allowedContentTypes: ['image/*'],
        // Camera files are frequently named "image.jpg" — randomise so repeat
        // uploads don't collide/overwrite.
        addRandomSuffix: true,
        // Generous cap for full-resolution phone photos.
        maximumSizeInBytes: 40 * 1024 * 1024,
      }),
      onUploadCompleted: async ({ blob }) => {
        logger.api('info', 'Photo uploaded', { url: blob.url })
      },
    })

    return Response.json(jsonResponse)
  } catch (error) {
    logger.api('error', 'Photo upload failed', { error: String(error) })
    return Response.json({ error: (error as Error).message }, { status: 400 })
  }
}
