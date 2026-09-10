/**
 * 技能管理路由 — 全部经 Mastra Workspace API 读写
 * 文件操作 jail 在 backend/workspace/ 目录内
 */
import { Hono } from 'hono'
import { success, badRequest } from '../utils/response.js'
import { currentAdmin } from '../utils/workspace-access.js'
import { refreshSkillWorkspaces, skillsManagerWorkspace } from '../agents/skills.js'

const app = new Hono()
const fsm = () => skillsManagerWorkspace.filesystem!
const skillFile = (id: string) => `skills/${id}/SKILL.md`
const SKILL_ID_SEGMENT = /^[a-z0-9-]+$/
const SKILL_DISPLAY_NAMES: Record<string, string> = {
  'storyboard-breaker': '分镜拆解',
  'script-rewriter': '剧本改写',
  extractor: '资产提取',
  'prompt-generator/character-prompt': '角色提示词',
  'prompt-generator/scene-prompt': '场景提示词',
  'prompt-generator/prop-prompt': '道具提示词',
  'prompt-generator/video-prompt': '视频提示词',
}

// GET /skills — List all skills (经 workspace.skills 原生发现)
app.get('/', async (c) => {
  const metas = await skillsManagerWorkspace.skills?.list() || []
  return success(c, metas.map(meta => {
    const id = meta.path.replace(/^skills\//, '').replace(/\/SKILL\.md$/, '')
    return {
      id,
      name: SKILL_DISPLAY_NAMES[id] || meta.name,
      raw_name: meta.name,
      display_name: SKILL_DISPLAY_NAMES[id] || meta.name,
      description: meta.description || '',
    }
  }))
})

// GET /skills/:id — Get skill content (raw, 含 frontmatter 供编辑)
app.get('/*', async (c) => {
  const id = c.req.path.slice('/api/v1/skills/'.length)
  if (!await fsm().exists(skillFile(id))) return badRequest(c, 'Skill not found')
  const content = await fsm().readFile(skillFile(id), { encoding: 'utf-8' })
  return success(c, { id, content })
})

// PUT /skills/:id — Update skill content
app.put('/*', async (c) => {
  if (!['admin', 'super_admin'].includes((await currentAdmin(c))?.role || '')) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const id = c.req.path.slice('/api/v1/skills/'.length)
  const body = await c.req.json()
  await fsm().writeFile(skillFile(id), body.content, { recursive: true })
  // 目录 mtime 不会因文件内容编辑而更新（APFS），显式刷新技能缓存
  await refreshSkillWorkspaces()
  return success(c)
})

// POST /skills — Create new skill directory
app.post('/', async (c) => {
  if (!['admin', 'super_admin'].includes((await currentAdmin(c))?.role || '')) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const body = await c.req.json()
  const { id, description } = body
  if (!id) return badRequest(c, 'Skill id is required')
  // Mastra 技能规范：frontmatter name 必须与目录名一致，且只允许小写字母/数字/连字符
  const segments = String(id).split('/')
  if (!segments.every((seg: string) => SKILL_ID_SEGMENT.test(seg))) {
    return badRequest(c, 'Skill id 每段只能包含小写字母、数字和连字符')
  }
  if (await fsm().exists(skillFile(id))) return badRequest(c, 'Skill already exists')

  const name = segments[segments.length - 1]
  const rawContent = String(body.content || '').trim()
  const content = rawContent || `---
name: ${JSON.stringify(name)}
description: ${JSON.stringify(String(description || ''))}
---

# ${name}

Write your skill content here.
`
  await fsm().writeFile(skillFile(id), content, { recursive: true, overwrite: false })
  await refreshSkillWorkspaces()
  return success(c, { id, name, description: description || '' })
})

// DELETE /skills/:id — Delete skill directory
app.delete('/*', async (c) => {
  if (!['admin', 'super_admin'].includes((await currentAdmin(c))?.role || '')) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const id = c.req.path.slice('/api/v1/skills/'.length)
  if (!await fsm().exists(`skills/${id}`)) return badRequest(c, 'Skill not found')
  await fsm().rmdir(`skills/${id}`, { recursive: true })
  await refreshSkillWorkspaces()
  return success(c)
})

export default app
