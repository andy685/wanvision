import { toast } from 'vue-sonner'
import { api } from './useApi'
import { friendlyErrorMessage } from './useFriendlyError'

// 各 Agent 完成后的提示：标题说清「做完了什么」，描述说清「接下来该干什么」
const AGENT_DONE_TEXT: Record<string, { title: string; desc: string }> = {
  script_rewriter: { title: 'AI 剧本改写完成', desc: '已生成格式化剧本，请核对内容后再进入资产制作' },
  extractor: { title: '资产提取完成', desc: '角色 / 场景 / 道具已写入，可在资产页查看与调整' },
  storyboard_breaker: { title: '分镜拆解完成', desc: '可在分镜页查看与调整镜头顺序' },
  prompt_generator: { title: '视频提示词已生成', desc: '进入视频步骤即可批量生成镜头' },
}
const FALLBACK_DONE = { title: '生成完成', desc: '' }

export function agentDoneText(type: string) {
  return (AGENT_DONE_TEXT[type] || FALLBACK_DONE).title
}

// 耗时只在超过 1 秒时才展示，秒级以下的任务报出来反而像噪音
function agentDoneToast(type: string, seconds?: number) {
  const conf = AGENT_DONE_TEXT[type] || FALLBACK_DONE
  const parts = [conf.desc, seconds && seconds >= 1 ? `耗时 ${Math.round(seconds)} 秒` : ''].filter(Boolean)
  return { title: conf.title, description: parts.join(' · ') || undefined }
}

// 同一个 agent 的完成提示共用一个 id：run 返回与轮询补刀只会更新同一条 toast，不会叠成两条
const agentToastId = (type: string) => `agent-done-${type}`

function notifyDone(type: string, seconds?: number) {
  const { title, description } = agentDoneToast(type, seconds)
  toast.success(title, { id: agentToastId(type), description })
}

export function useAgent() {
  const running = ref(false)
  const runningType = ref<string | null>(null)
  const activeTask = ref<any | null>(null)
  let statusTimer: ReturnType<typeof setTimeout> | null = null
  // 轮询世代号：每次开新一轮就 +1，旧轮询（可能正卡在 await 里）醒来发现世代号对不上就自行退出，
  // 不会再给「本次操作」补一条迟到几十秒的完成提示。
  let pollToken = 0

  function clearStatusTimer() {
    if (statusTimer) {
      clearTimeout(statusTimer)
      statusTimer = null
    }
  }

  function invalidatePoll() {
    pollToken++
    clearStatusTimer()
  }

  async function pollStatus(type: string, dramaId: number, episodeId: number, onDone?: () => void, attempts = 240) {
    clearStatusTimer()
    const token = ++pollToken
    const alive = () => token === pollToken
    const tick = async (left: number) => {
      try {
        const task = await status(type, dramaId, episodeId)
        if (!alive()) return
        activeTask.value = task
        if (!task || task.status !== 'processing') {
          running.value = false
          runningType.value = null
          activeTask.value = task || null
          if (task?.status === 'completed') {
            notifyDone(type)
            onDone?.()
          } else if (task?.status === 'failed') {
            toast.error(friendlyErrorMessage(task.error_msg || task.errorMsg, '操作失败'), { id: agentToastId(type) })
          }
          return
        }
      } catch {
        // 状态查询偶发失败时继续轮询，避免刷新恢复后闪断。
      }

      if (!alive()) return
      if (left > 0) {
        statusTimer = setTimeout(() => tick(left - 1), 2500)
      } else {
        running.value = false
        runningType.value = null
      }
    }
    statusTimer = setTimeout(() => tick(attempts), 2500)
  }

  async function run(type: string, msg: string, dramaId: number, episodeId: number, onDone?: () => void, model?: string, configId?: number) {
    if (running.value) { toast.warning('操作执行中'); return }
    // 先作废上一轮残留的轮询，否则它会在本次完成后再补一条 toast
    invalidatePoll()
    const token = pollToken
    running.value = true
    runningType.value = type
    activeTask.value = null
    const startedAt = Date.now()
    try {
      const data = await api.post<any>(`/agent/${type}/chat`, {
        message: msg,
        drama_id: dramaId,
        episode_id: episodeId,
        model: model || undefined,
        config_id: configId || undefined,
      })
      // 期间若又发起了新的操作，本次结果已过期，不再提示也不再覆盖状态
      if (token !== pollToken) return
      activeTask.value = data?.task_id ? { id: data.task_id, status: 'completed' } : null
      notifyDone(type, (Date.now() - startedAt) / 1000)
      onDone?.()
    } catch (err: any) {
      if (token === pollToken) toast.error(friendlyErrorMessage(err, '操作失败，请稍后重试'), { id: agentToastId(type) })
    } finally {
      if (token === pollToken) {
        running.value = false
        runningType.value = null
      }
    }
  }

  async function status(type: string, dramaId: number, episodeId: number) {
    const query = new URLSearchParams({
      drama_id: String(dramaId),
      episode_id: String(episodeId),
    })
    return api.get<any>(`/agent/${type}/status?${query.toString()}`)
  }

  async function sync(type: string, dramaId: number, episodeId: number, onDone?: () => void) {
    if (!episodeId) return null
    const task = await status(type, dramaId, episodeId)
    activeTask.value = task
    if (task?.status === 'processing') {
      running.value = true
      runningType.value = type
      pollStatus(type, dramaId, episodeId, onDone)
    }
    return task
  }

  onUnmounted(invalidatePoll)

  return { running, runningType, activeTask, run, status, sync }
}
