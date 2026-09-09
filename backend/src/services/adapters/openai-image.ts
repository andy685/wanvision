/**
 * OpenAI DALL-E 图片生成 Adapter
 * 端点: /v1/images/generations (注意 /v1 前缀)
 * 响应格式: { data: [{ url: "..." }] } 或 { data: [{ b64_json: "..." }] }
 */
import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types'
import { joinProviderUrl } from './url'

export class OpenAIImageAdapter implements ImageProviderAdapter {
  provider = 'openai'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'gpt-image-2'
    const isGptImage = model.startsWith('gpt-image-')
    const isGptImage2 = model === 'gpt-image-2'
    const size = isGptImage2
      ? this.normalizeGptImage2Size(record.size)
      : isGptImage
      ? this.normalizeGptImageSize(record.size)
      : record.size || '1024x1024'

    const body: any = {
      model,
      prompt: record.prompt,
      size,
      n: 1,
    }

    if (!isGptImage) {
      body.response_format = 'url'
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/images/generations'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  private normalizeGptImageSize(size?: string | null): string {
    const allowed = ['1024x1024', '1536x1024', '1024x1536', 'auto']
    if (!size) return '1024x1024'

    const normalized = size.toLowerCase()
    if (allowed.includes(normalized)) return normalized

    const [width, height] = normalized.split('x').map(Number)
    if (!width || !height) return 'auto'
    if (width === height) return '1024x1024'
    return width > height ? '1536x1024' : '1024x1536'
  }

  private normalizeGptImage2Size(size?: string | null): string {
    const allowed = ['1024x1024', '1536x1024', '1024x1536', 'auto']
    if (!size) return '1024x1024'
    const normalized = size.toLowerCase()
    if (allowed.includes(normalized)) return normalized

    const [rawWidth, rawHeight] = normalized.split('x').map(Number)
    if (!rawWidth || !rawHeight) return 'auto'

    if (rawWidth === rawHeight) return '1024x1024'
    return rawWidth > rawHeight ? '1536x1024' : '1024x1536'
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    this.throwIfProviderError(result)

    const imageUrl = this.findImageUrl(result)
    if (imageUrl) {
      return { isAsync: false, imageUrl }
    }

    // b64_json/base64 模式。先返回同步空 URL,后续由 generation.ts 调 extractImageBase64 保存。
    const b64 = this.findImageBase64(result)
    if (b64) {
      return { isAsync: false, imageUrl: undefined }
    }

    // OpenAI DALL-E 3 目前是同步返回，但规范上也有异步 task 模式
    const taskId = result.task_id || result.taskId || result.task?.id
    if (taskId) {
      return { isAsync: true, taskId }
    }

    throw new Error(`No image URL in response (keys: ${this.describeKeys(result)})`)
  }

  private throwIfProviderError(result: any) {
    if (!result || typeof result !== 'object') return
    if (result.error) {
      const err = result.error
      const msg = typeof err === 'string' ? err : err.message || err.msg || JSON.stringify(err)
      throw new Error(msg || 'Image generation failed')
    }
    if (result.success === false || result.code) {
      const msg = result.message || result.msg || result.error_msg
      if (msg) throw new Error(String(msg))
    }
  }

  private findImageUrl(value: any): string | null {
    if (!value) return null
    if (typeof value === 'string') {
      return /^(https?:\/\/|data:image\/)/i.test(value) ? value : null
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findImageUrl(item)
        if (found) return found
      }
      return null
    }
    if (typeof value !== 'object') return null

    for (const key of ['url', 'image_url', 'imageUrl', 'output_url', 'outputUrl', 'result_url', 'resultUrl']) {
      const found = this.findImageUrl(value[key])
      if (found) return found
    }
    for (const key of ['data', 'images', 'output', 'content', 'result']) {
      const found = this.findImageUrl(value[key])
      if (found) return found
    }
    return null
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/images/task/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): ImagePollResponse {
    this.throwIfProviderError(result)
    if (result.status === 'completed') {
      return {
        status: 'completed',
        imageUrl: this.findImageUrl(result) || undefined,
      }
    }
    if (result.status === 'failed') {
      return { status: 'failed', error: result.error?.message || 'Generation failed' }
    }
    return { status: result.status || 'processing' }
  }

  extractImageUrl(result: any): string | null {
    return this.findImageUrl(result)
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    const b64 = this.findImageBase64(result)
    if (b64) {
      return { data: b64, mimeType: 'image/png' }
    }
    return null
  }

  private findImageBase64(value: any): string | null {
    if (!value) return null
    if (typeof value === 'string') {
      const dataUrl = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)
      if (dataUrl) return dataUrl[2]
      return value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(value) ? value : null
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findImageBase64(item)
        if (found) return found
      }
      return null
    }
    if (typeof value !== 'object') return null

    for (const key of ['b64_json', 'base64', 'image_base64', 'imageBase64']) {
      const found = this.findImageBase64(value[key])
      if (found) return found
    }
    for (const key of ['data', 'images', 'output', 'content', 'result']) {
      const found = this.findImageBase64(value[key])
      if (found) return found
    }
    return null
  }

  private describeKeys(value: any): string {
    if (!value || typeof value !== 'object') return typeof value
    const keys = Object.keys(value).slice(0, 12).join(', ') || 'none'
    const first = Array.isArray(value.data) && value.data[0] && typeof value.data[0] === 'object'
      ? `; data[0]: ${Object.keys(value.data[0]).slice(0, 12).join(', ')}`
      : ''
    return `${keys}${first}`
  }
}
