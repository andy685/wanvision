/**
 * 火山引擎 Seedance 2.0 视频生成 Adapter
 * 端点: /api/v3/contents/generations/tasks (注意 /api/v3 前缀)
 * 响应: { id: "task-xxx" } -> 轮询获取状态
 *
 * 仅支持 Doubao Seedance 2.0+ 系列模型，生成模式只保留多模态参考:
 * - reference   多模态参考（≤9 reference_image + ≤3 reference_video + ≤3 reference_audio + 可选文本）
 *   有参考音频时至少包含 1 个参考图片或视频
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'
import { joinProviderUrl, normalizeProviderBaseUrl } from './url'

/** 兼容 FlowingCloud 中转站可用的 Seedance 系列模型。 */
const SEEDANCE_MODEL_PREFIXES = ['doubao-seedance-2-0', 'doubao-seedance-2-5']
const DEFAULT_MODEL = 'doubao-seedance-2-0-260128'

/** 多模态参考素材上限：图片 9、视频 3、音频 3 */
const REF_LIMITS = { images: 9, videos: 3, audios: 3 } as const

function parseUrlArray(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((u) => typeof u === 'string' && u.trim()) : []
  } catch {
    return []
  }
}

export class VolcEngineVideoAdapter implements VideoProviderAdapter {
  provider = 'volcengine'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = normalizeSeedanceModel(record.model || config.model || DEFAULT_MODEL, config.baseUrl)
    if (!SEEDANCE_MODEL_PREFIXES.some(prefix => model.startsWith(prefix))) {
      throw new Error(`仅支持 Seedance 2.0/2.5 系列模型，当前: ${model}`)
    }

    const prompt = (record.prompt || '').trim()
    const acceptsInlineReferenceImages = !isFlowingCloud(config.baseUrl)
    const refImages = parseUrlArray(record.referenceImageUrls)
      .filter(url => acceptsInlineReferenceImages || !url.startsWith('data:image/'))
    const refVideos = parseUrlArray(record.referenceVideoUrls)
    const refAudios = parseUrlArray(record.referenceAudioUrls)

    if (refImages.length > REF_LIMITS.images || refVideos.length > REF_LIMITS.videos || refAudios.length > REF_LIMITS.audios) {
      throw new Error(`参考素材超限：图片≤${REF_LIMITS.images}、视频≤${REF_LIMITS.videos}、音频≤${REF_LIMITS.audios}`)
    }
    if (refAudios.length > 0 && refImages.length + refVideos.length === 0) {
      throw new Error('参考音频需要至少 1 个参考图片或视频')
    }
    if (!prompt && !refImages.length && !refVideos.length && !refAudios.length) {
      throw new Error('多模态参考模式需要至少一个参考素材或 prompt')
    }

    const content: any[] = []
    if (prompt) content.push({ type: 'text', text: prompt })
    for (const url of refImages) {
      content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
    }
    for (const url of refVideos) {
      content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' })
    }
    for (const url of refAudios) {
      content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' })
    }

    const body: any = {
      model,
      content,
      generate_audio: record.generateAudio !== 0 && record.generateAudio !== false,
      ratio: record.aspectRatio || 'adaptive',
      duration: this.normalizeDuration(record.duration),
      resolution: record.resolution === '480p' ? '480p' : '720p',
      return_last_frame: true,
      watermark: false,
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', '/contents/generations/tasks'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    const task = unwrapTask(result)
    const taskId = task.id || task.task_id || task.taskId || task.data?.id || task.data?.task_id || task.data?.taskId
    if (taskId) {
      return { isAsync: true, taskId: String(taskId) }
    }
    // 同步返回
    const videoUrl = extractVideoUrlFromPayload(task)
    if (videoUrl) {
      return { isAsync: false, videoUrl }
    }
    throw new Error('视频服务没有返回任务 ID 或视频地址，请检查视频模型配置、参考素材是否可访问后重试。')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', `/contents/generations/tasks/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    const task = unwrapTask(result)
    const status = String(task.status || task.state || '').toLowerCase()
    if (['succeeded', 'success', 'completed'].includes(status)) {
      const videoUrl = extractVideoUrlFromPayload(task)
      return {
        status: 'completed',
        videoUrl: videoUrl || undefined,
      }
    }
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
      // 上游 error 可能是对象 { code, message }（如 OutputVideoSensitiveContentDetected），规范成字符串
      const err = task.error || task.last_error
      const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || 'Video generation failed')
      const code = err && typeof err === 'object' && err.code ? `[${err.code}] ` : ''
      return { status: 'failed', error: `${code}${msg}` }
    }
    return { status: status as VideoPollResponse['status'] || 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    return extractVideoUrlFromPayload(unwrapTask(result))
  }

  private normalizeDuration(duration?: number | null): number {
    const parsed = Math.round(Number(duration || 5))
    if (!Number.isFinite(parsed)) return 5
    // Seedance 2.0 支持 4-15 秒
    return Math.min(15, Math.max(4, parsed))
  }
}

function normalizeSeedanceModel(model: string, baseUrl: string) {
  if (isFlowingCloud(baseUrl) && model === 'doubao-seedance-2-0-fast-260128') {
    return DEFAULT_MODEL
  }
  return model
}

function isFlowingCloud(baseUrl: string) {
  return normalizeProviderBaseUrl(baseUrl) === 'https://cloudapi.flowingcloud.com'
}

function unwrapTask(result: any) {
  if (result?.task && typeof result.task === 'object') return result.task
  if (result?.data?.task && typeof result.data.task === 'object') return result.data.task
  if (result?.data && typeof result.data === 'object') return result.data
  return result || {}
}

function extractVideoUrlFromPayload(payload: any): string | null {
  return payload.video_url
    || payload.videoUrl
    || payload.content?.video_url
    || payload.content?.videoUrl
    || payload.content?.url
    || payload.output?.video_url
    || payload.output?.videoUrl
    || payload.output?.url
    || payload.result?.video_url
    || payload.result?.videoUrl
    || payload.result?.url
    || null
}
