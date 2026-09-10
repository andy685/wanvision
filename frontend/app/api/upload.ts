import { upload } from './client'
import type { UploadResult } from './types'

export const uploadAPI = {
  image: (f: File) => upload<UploadResult>('/upload/image', f),
  video: (f: File) => upload<UploadResult>('/upload/video', f),
  audio: (f: File) => upload<UploadResult>('/upload/audio', f),
}
