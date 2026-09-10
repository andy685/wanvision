/**
 * 任务展示名解析 — 供积分流水、管理后台任务列表等处复用
 * 命名规则与创作端任务抽屉保持一致：剧本改写 / 资产提取（角色）/ 图片生成（分镜 #3）等
 */
import { inArray } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

const EXTRACT_TARGET_NAMES: Record<string, string> = { characters: '角色', scenes: '场景', props: '道具' }

function parseParams(raw: string | null): any {
  try { return raw ? JSON.parse(raw) : null } catch { return null }
}

/** 文本类任务名（剧本改写 / 资产提取 / 分镜拆解 / 提示词生成） */
export function textTaskName(task: any): string {
  const params = parseParams(task.params)
  if (task.provider === 'script_rewriter') return '剧本改写'
  if (task.provider === 'extractor') {
    const name = EXTRACT_TARGET_NAMES[params?.target || '']
    return name ? `资产提取（${name}）` : '资产提取'
  }
  if (task.provider === 'storyboard_breaker') return '分镜拆解'
  if (task.provider === 'prompt_generator') return '提示词生成'
  return '文本生成'
}

/**
 * 批量解析任务展示名。tasks 为 sys_task 行数组，返回 Map<任务id, 展示名>。
 * 图片/视频任务会追加关联对象（分镜 #N / 角色 · 名 / 场景 · 地点 / 道具 · 名）。
 */
export async function resolveTaskNames(tasks: any[]): Promise<Map<number, string>> {
  const result = new Map<number, string>()
  if (!tasks.length) return result

  const sbIds = new Set<number>()
  const charIds = new Set<number>()
  const sceneIds = new Set<number>()
  const propIds = new Set<number>()
  for (const t of tasks) {
    if (t.storyboardId) sbIds.add(t.storyboardId)
    if (t.characterId) charIds.add(t.characterId)
    if (t.sceneId) sceneIds.add(t.sceneId)
    if (t.propId) propIds.add(t.propId)
  }

  const [sbs, chars, scenes, props] = await Promise.all([
    sbIds.size ? db.select({ id: schema.storyboards.id, number: schema.storyboards.storyboardNumber }).from(schema.storyboards).where(inArray(schema.storyboards.id, [...sbIds])) : [],
    charIds.size ? db.select({ id: schema.characters.id, name: schema.characters.name }).from(schema.characters).where(inArray(schema.characters.id, [...charIds])) : [],
    sceneIds.size ? db.select({ id: schema.scenes.id, location: schema.scenes.location }).from(schema.scenes).where(inArray(schema.scenes.id, [...sceneIds])) : [],
    propIds.size ? db.select({ id: schema.props.id, name: schema.props.name }).from(schema.props).where(inArray(schema.props.id, [...propIds])) : [],
  ])
  const sbMap = new Map(sbs.map(s => [s.id, s.number]))
  const charMap = new Map(chars.map(c => [c.id, c.name]))
  const sceneMap = new Map(scenes.map(s => [s.id, s.location]))
  const propMap = new Map(props.map(p => [p.id, p.name]))

  for (const t of tasks) {
    let name: string
    if (t.type === 'text') name = textTaskName(t)
    else name = t.type === 'image' ? '图片生成' : t.type === 'video' ? '视频生成' : t.type
    // 挂了具体对象的补上对象名：分镜 #N / 角色 · 名 / 场景 · 地点 / 道具 · 名
    let target = ''
    if (t.storyboardId && sbMap.has(t.storyboardId)) target = `分镜 #${sbMap.get(t.storyboardId)}`
    else if (t.characterId && charMap.has(t.characterId)) target = `角色 · ${charMap.get(t.characterId)}`
    else if (t.sceneId && sceneMap.has(t.sceneId)) target = `场景 · ${sceneMap.get(t.sceneId)}`
    else if (t.propId && propMap.has(t.propId)) target = `道具 · ${propMap.get(t.propId)}`
    result.set(t.id, target ? `${name}（${target}）` : name)
  }
  return result
}
