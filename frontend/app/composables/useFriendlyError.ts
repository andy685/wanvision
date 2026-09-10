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

  if (/^(500|502|503)$/i.test(text)) {
    return '服务暂时不可用，请稍后重试。如果连续出现，请检查后端日志或切换模型配置。'
  }

  if (/^504$/i.test(text)) {
    return '生成服务响应超时了，通常是上游暂时繁忙。请稍后重试或切换模型配置。'
  }

  if (/^401$/i.test(text)) {
    return '当前登录状态已失效，请重新登录后再试。'
  }

  if (/^403$/i.test(text)) {
    return '当前账号权限不足，无法执行这个操作。'
  }

  if (/^404$/i.test(text)) {
    return '没有找到对应的数据，请刷新页面后再试。'
  }

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

  if (lower.includes('no available channel') || lower.includes('no channel for model') || lower.includes('no available model')) {
    const model = text.match(/model\s+([^\s]+)\s+under/i)?.[1]
    return model
      ? `当前模型「${model}」暂时没有可用服务通道，请在运营后台更换模型或联系管理员配置渠道。`
      : '当前模型暂时没有可用服务通道，请在运营后台更换模型或联系管理员配置渠道。'
  }

  if (lower.includes('network error') || lower.includes('failed to fetch') || lower.includes('econnrefused')) {
    return '服务连接失败，请检查网络或确认服务端已启动后重试。'
  }

  if (text.includes('积分不足') || lower.includes('insufficient credit') || lower.includes('insufficient balance')) {
    return text.includes('积分不足') ? text : '积分不足，请先充值后再生成。'
  }

  if (lower.includes('amount 和 note') || lower.includes('amount and note')) {
    return '请填写调整积分和操作备注。'
  }

  if (/^(drama_id|episode_id|name|location|prompt|file|skill id|system_prompt) is required$/i.test(text)
    || /^(drama_id|episode_id|name|location|prompt|file|skill id|system_prompt) required$/i.test(text)) {
    const field = ({
      drama_id: '项目',
      episode_id: '剧集',
      name: '名称',
      location: '场景地点',
      prompt: '提示词',
      file: '文件',
      'skill id': '技能标识',
      system_prompt: '系统提示词',
    } as Record<string, string>)[lower.replace(/\s+is required$/, '').replace(/\s+required$/, '')] || '必填内容'
    return `请填写${field}。`
  }

  if (lower.includes('unauthorized') || lower.includes('需要管理员权限') || lower.includes('请先登录')) {
    return '当前登录状态或账号权限不足，请重新登录后再试。'
  }

  if (lower.includes('invalid model') || lower.includes('model not found') || lower.includes('unsupported model')) {
    return '当前模型不可用，请在运营后台检查模型名称或切换其他模型。'
  }

  if (lower.includes('api key') || lower.includes('authentication') || lower.includes('invalid token')) {
    return 'AI 服务密钥无效或未配置，请联系管理员检查服务配置。'
  }

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('polling exceeded')) {
    return '生成等待超时了。任务可能太久或上游响应慢，请稍后重试。'
  }

  if (lower.includes('no image url') || lower.includes('no video url')) {
    return '服务没有返回可用的生成结果。请重试一次，或切换模型/配置。'
  }

  if (lower.includes('task_id is empty') || lower.includes('no task_id') || lower.includes('task id')) {
    return '视频服务没有返回任务 ID，系统无法继续查询生成进度。通常是上游没有受理本次请求，请检查视频模型配置、参考素材是否可访问，或稍后重试。'
  }

  if (lower.includes('<html') || lower.includes('<!doctype')) {
    return '上游服务返回了异常页面，暂时无法完成生成。请稍后重试。'
  }

  if (/api error 4\d\d/i.test(text)) {
    return '请求没有被生成服务接受。请检查提示词、参考素材或模型配置后重试。'
  }

  if (/api error 5\d\d/i.test(text) || lower.includes('internal server error')) {
    return '生成服务暂时不可用，请稍后重试或切换模型配置。'
  }

  return text.length > 220 ? fallback : (text || fallback)
}
