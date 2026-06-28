import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { logger } from '../src/lib/logger.js'

export async function POST(request: Request) {
  const body = await request.json() as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
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
