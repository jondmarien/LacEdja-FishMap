import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { logger } from '../src/lib/logger.js'

export async function POST(request: Request) {
  const body = await request.json() as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        // Allow any image type. Phone cameras (esp. iPhone) often produce
        // HEIC/HEIF, which an explicit jpeg/png/webp list silently rejected.
        allowedContentTypes: ['image/*'],
        // Camera files are frequently named "image.jpg" — randomise so repeat
        // uploads don't collide/overwrite.
        addRandomSuffix: true,
        // Generous cap for full-resolution phone photos.
        maximumSizeInBytes: 25 * 1024 * 1024,
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
