function deepDecodeMessage(input: string): string {
  let text = String(input || '')

  for (let i = 0; i < 4; i++) {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) break
    try {
      const parsed = JSON.parse(match[0])
      const next = parsed?.error?.message || parsed?.message || parsed?.msg || parsed?.error_msg
      if (!next || next === text) break
      text = String(next)
    } catch {
      break
    }
  }

  return text
    .replace(/\\+"/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function friendlyErrorMessage(error: unknown, fallback = '操作失败，请稍后重试') {
  const raw = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : String(error || '')
  const text = deepDecodeMessage(raw)
  const lower = text.toLowerCase()

  if (/input image .*may contain real person/i.test(text)
    || lower.includes('inputimagesensitivecontentdetected')
    || lower.includes('privacyinformation')) {
    return '参考图可能被平台识别为真实人物或隐私内容。请换一张更明显的 3D 动画/插画风参考图，或先取消勾选这张人物参考图后重试。'
  }

  if (lower.includes('outputvideosensitivecontentdetected')) {
    return '生成结果触发了平台内容审核。建议弱化敏感画面或改写视频提示词后重试。'
  }

  if (lower.includes('504 gateway') || lower.includes('gateway time-out') || lower.includes('gateway timeout') || /api error 504/i.test(text)) {
    return '图片/视频服务响应超时了，通常是上游暂时繁忙。系统会自动重试；如果仍失败，请稍后再试或切换模型。'
  }

  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return '服务请求太频繁了，稍等一会儿再试。'
  }

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('polling exceeded')) {
    return '生成等待超时了。任务可能太久或上游响应慢，请稍后重试。'
  }

  if (lower.includes('no image url') || lower.includes('no video url')) {
    return '服务没有返回可用的生成结果。请重试一次，或切换模型/配置。'
  }

  if (lower.includes('<html') || lower.includes('<!doctype')) {
    return '上游服务返回了异常页面，暂时无法完成生成。请稍后重试。'
  }

  if (/api error 4\d\d/i.test(text)) {
    return '请求没有被生成服务接受。请检查提示词、参考素材或模型配置后重试。'
  }

  if (/api error 5\d\d/i.test(text)) {
    return '生成服务暂时不可用，请稍后重试或切换模型配置。'
  }

  return text.length > 220 ? fallback : (text || fallback)
}
