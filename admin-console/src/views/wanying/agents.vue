<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  ElAlert,
  ElButton,
  ElCard,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTag
} from "element-plus";
import { http } from "@/utils/http";
import { message } from "@/utils/message";
import WanyingPage from "./components/WanyingPage.vue";
import { data, errorText } from "./utils/format";
import { names } from "./utils/constants";

const [title, subtitle] = names.agents;
const loading = ref(false);
const savingPrompt = ref(false);
const savingSkill = ref(false);
const creatingSkill = ref(false);
const rows = ref<any[]>([]);
const skills = ref<any[]>([]);
const textModels = ref<string[]>([]);
const selectedAgent = ref("script_rewriter");
const promptForm = ref<any>({});
const selectedSkillId = ref("");
const skillForm = ref<any>({});
const createSkillOpen = ref(false);
const createSkillForm = ref({ prefix: "", id: "", description: "", content: "" });

const agentDefs = [
  { type: "script_rewriter", label: "剧本改写", desc: "小说/梗概改写为短剧剧本", accent: "01" },
  { type: "extractor", label: "资产提取", desc: "提取角色、场景和关键道具", accent: "02" },
  { type: "storyboard_breaker", label: "分镜拆解", desc: "拆成可生成视频的分镜段落", accent: "03" },
  { type: "prompt_generator", label: "提示词生成", desc: "生成图片和视频提示词", accent: "04" }
];

const skillDisplayNames: Record<string, string> = {
  "script-rewriter": "剧本改写规则",
  extractor: "资产提取规则",
  "storyboard-breaker": "分镜拆解规则",
  "prompt-generator/character-prompt": "角色图片提示词规则",
  "prompt-generator/scene-prompt": "场景图片提示词规则",
  "prompt-generator/prop-prompt": "道具图片提示词规则",
  "prompt-generator/video-prompt": "视频提示词规则"
};

const agentSkillPrefixes: Record<string, string[]> = {
  script_rewriter: ["script-rewriter"],
  extractor: ["extractor"],
  storyboard_breaker: ["storyboard-breaker"],
  prompt_generator: [
    "prompt-generator/character-prompt",
    "prompt-generator/scene-prompt",
    "prompt-generator/prop-prompt",
    "prompt-generator/video-prompt"
  ]
};

const selectedAgentDef = computed(() =>
  agentDefs.find(item => item.type === selectedAgent.value) || agentDefs[0]
);
const selectedPrompt = computed(() =>
  rows.value.find(item => item.agent_type === selectedAgent.value)
);
const currentSkills = computed(() =>
  skills.value.filter(skill => skillBelongsTo(skill.id, selectedAgent.value))
);
const activeSkill = computed(() =>
  currentSkills.value.find(skill => skill.id === selectedSkillId.value)
);
const skillGroupOptions = computed(() =>
  (agentSkillPrefixes[selectedAgent.value] || []).map(prefix => ({
    prefix,
    label: skillDisplayNames[prefix] || prefix
  }))
);
const selectedPromptStatus = computed(() =>
  selectedPrompt.value?.is_default ? "内置主指令" : "自定义主指令"
);
const agentDialogModelText = computed(() => {
  const model = String(promptForm.value?.model || "").trim();
  if (model) return `保存后使用自定义模型：${model}`;
  return promptForm.value?.effective_model
    ? `留空后使用默认文本模型：${promptForm.value.effective_model}`
    : "留空后使用默认文本模型，但当前尚未配置默认文本模型";
});

function skillBelongsTo(skillId: string, agentType: string) {
  const prefixes = agentSkillPrefixes[agentType] || [];
  return prefixes.some(prefix => skillId === prefix || skillId.startsWith(`${prefix}/`));
}

function skillCount(agentType: string) {
  return skills.value.filter(skill => skillBelongsTo(skill.id, agentType)).length;
}

function skillTitle(skill: any) {
  return skillDisplayNames[skill?.id] || skill?.display_name || skill?.name || skill?.id || "";
}

function skillPath(skillId: string) {
  return `backend/workspace/skills/${skillId}/SKILL.md`;
}

function basename(value: string) {
  return String(value || "").split("/").filter(Boolean).pop() || "";
}

function buildSkillMarkdown(id: string, description: string, content: string) {
  const name = basename(id);
  const body = content.trim() || `请在这里写清楚这条规则希望 Agent 遵守什么。`;
  return `---
name: ${JSON.stringify(name)}
description: ${JSON.stringify(description.trim())}
---

# ${name}

${body}
`;
}

async function loadBaseData() {
  const [promptRows, skillRows, configs] = await Promise.all([
    http.get("/prompts"),
    http.get("/skills"),
    http.get("/ai-configs?service_type=text")
  ]);
  rows.value = data(promptRows);
  skills.value = data(skillRows);
  textModels.value = data(configs)
    .filter((c: any) => c.is_active)
    .flatMap((c: any) => c.model || [])
    .filter((m: string, i: number, arr: string[]) => arr.indexOf(m) === i);
}

async function load() {
  loading.value = true;
  try {
    await loadBaseData();
    await loadPrompt(selectedAgent.value);
    if (!selectedSkillId.value && currentSkills.value[0]) await selectSkill(currentSkills.value[0].id);
  } catch (error: any) {
    message(errorText(error) || "数据加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

async function selectAgent(type: string) {
  selectedAgent.value = type;
  selectedSkillId.value = "";
  skillForm.value = {};
  await loadPrompt(type);
  if (currentSkills.value[0]) await selectSkill(currentSkills.value[0].id);
}

async function loadPrompt(type: string) {
  const prompt = data(await http.get(`/prompts/${type}`));
  promptForm.value = {
    ...prompt,
    model: Array.isArray(prompt.model) ? prompt.model.join(", ") : prompt.model || ""
  };
}

async function savePrompt() {
  savingPrompt.value = true;
  try {
    await http.request("put", `/prompts/${selectedAgent.value}`, { data: promptForm.value });
    await loadBaseData();
    message("主指令已保存", { type: "success" });
  } catch (error: any) {
    message(errorText(error) || "保存失败", { type: "error" });
  } finally {
    savingPrompt.value = false;
  }
}

async function resetPrompt() {
  try {
    await ElMessageBox.confirm(
      `确定恢复「${selectedAgentDef.value.label}」的内置主指令吗？`,
      "恢复默认",
      { type: "warning", confirmButtonText: "恢复", cancelButtonText: "取消" }
    );
    await http.request("post", `/prompts/${selectedAgent.value}/reset`);
    await loadBaseData();
    await loadPrompt(selectedAgent.value);
    message("已恢复默认主指令", { type: "success" });
  } catch (error: any) {
    if (error === "cancel" || error === "close") return;
    message(errorText(error) || "恢复失败", { type: "error" });
  }
}

async function selectSkill(id: string) {
  selectedSkillId.value = id;
  skillForm.value = data(await http.get(`/skills/${id}`));
}

async function saveSkill() {
  if (!selectedSkillId.value) return;
  savingSkill.value = true;
  try {
    await http.request("put", `/skills/${selectedSkillId.value}`, {
      data: { content: skillForm.value.content }
    });
    await loadBaseData();
    message("技能规则已保存", { type: "success" });
  } catch (error: any) {
    message(errorText(error) || "保存失败", { type: "error" });
  } finally {
    savingSkill.value = false;
  }
}

function openCreateSkill() {
  createSkillForm.value = {
    prefix: agentSkillPrefixes[selectedAgent.value]?.[0] || "",
    id: "",
    description: "",
    content: ""
  };
  createSkillOpen.value = true;
}

async function createSkill() {
  const rawId = createSkillForm.value.id.trim();
  if (!rawId) {
    message("请填写技能标识", { type: "warning" });
    return;
  }
  const base = createSkillForm.value.prefix || agentSkillPrefixes[selectedAgent.value][0];
  const id = rawId.includes("/") ? rawId : `${base}/${rawId}`;
  const description = createSkillForm.value.description.trim();
  const content = buildSkillMarkdown(id, description, createSkillForm.value.content);
  creatingSkill.value = true;
  try {
    await http.request("post", "/skills", {
      data: { id, description, content }
    });
    createSkillOpen.value = false;
    await loadBaseData();
    await selectSkill(id);
    message("技能规则已创建，下一次 Agent 任务会自动注入", { type: "success" });
  } catch (error: any) {
    message(errorText(error) || "创建失败", { type: "error" });
  } finally {
    creatingSkill.value = false;
  }
}

async function deleteSkill(skill: any) {
  if (!skill?.id) return;
  try {
    await ElMessageBox.confirm(
      `确定删除「${skillTitle(skill)}」吗？删除后该规则不会再注入 Agent。`,
      "删除技能规则",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
    await http.request("delete", `/skills/${skill.id}`);
    selectedSkillId.value = "";
    skillForm.value = {};
    await loadBaseData();
    if (currentSkills.value[0]) await selectSkill(currentSkills.value[0].id);
    message("已删除", { type: "success" });
  } catch (error: any) {
    if (error === "cancel" || error === "close") return;
    message(errorText(error) || "删除失败", { type: "error" });
  }
}

onMounted(load);
</script>

<template>
  <WanyingPage :title="title" :subtitle="subtitle">
    <div v-loading="loading" class="workflow-layout">
      <aside class="agent-nav">
        <div class="nav-title">Agent</div>
        <div class="agent-list">
          <button
            v-for="agent in agentDefs"
            :key="agent.type"
            :class="['agent-nav-item', { active: selectedAgent === agent.type }]"
            type="button"
            @click="selectAgent(agent.type)"
          >
            <span class="agent-index">{{ agent.accent }}</span>
            <span class="agent-copy">
              <strong>{{ agent.label }}</strong>
              <small>{{ agent.desc }}</small>
            </span>
            <ElTag size="small" effect="plain">{{ skillCount(agent.type) }}</ElTag>
          </button>
        </div>
        <div class="runtime-note">
          <strong>生效逻辑</strong>
          <span>每次执行 Agent 时，后端会重新读取主指令，并扫描当前 Agent 名下所有 SKILL.md。</span>
        </div>
      </aside>

      <main class="workflow-main">
        <section class="workflow-hero">
          <div>
            <span class="eyebrow">当前工作流</span>
            <h2>{{ selectedAgentDef.label }}</h2>
            <p>{{ selectedAgentDef.desc }}</p>
          </div>
          <div class="hero-metrics">
            <div>
              <span>主指令</span>
              <strong>{{ selectedPromptStatus }}</strong>
            </div>
            <div>
              <span>技能规则</span>
              <strong>{{ currentSkills.length }} 条</strong>
            </div>
            <div>
              <span>模型来源</span>
              <strong>{{ promptForm.model ? "Agent 覆盖" : "默认文本模型" }}</strong>
            </div>
          </div>
        </section>

        <ElAlert
          type="info"
          show-icon
          :closable="false"
          title="保存后的主指令和技能规则会在下一次 Agent 任务启动时生效；已经运行中的任务不会被中途改写。"
        />

        <ElCard shadow="never" class="agent-card">
          <div class="section-head">
            <div>
              <h3>主指令与模型</h3>
              <p>控制这个 Agent 的身份、执行流程和默认模型覆盖。</p>
            </div>
            <span class="status-pill">{{ selectedPromptStatus }}</span>
          </div>

          <div class="prompt-grid">
            <ElForm label-position="top">
              <ElFormItem label="模型覆盖">
                <ElSelect v-model="promptForm.model" clearable placeholder="留空使用默认文本模型" style="width: 100%">
                  <ElOption v-for="m in textModels" :key="m" :label="m" :value="m" />
                </ElSelect>
                <div class="field-hint">{{ agentDialogModelText }}</div>
              </ElFormItem>
              <ElFormItem label="主指令">
                <ElInput v-model="promptForm.system_prompt" type="textarea" :rows="14" />
              </ElFormItem>
            </ElForm>
            <div class="explain-panel">
              <strong>运行时注入顺序</strong>
              <p>先注入这里的主指令，再追加下方属于该 Agent 的所有技能规则。</p>
              <strong>怎么分工</strong>
              <p>主指令管角色定位、整体流程和模型覆盖；技能规则管细分格式、字段约束和生产规范。</p>
            </div>
          </div>

          <div class="actions">
            <ElButton @click="resetPrompt">恢复默认主指令</ElButton>
            <ElButton type="primary" :loading="savingPrompt" @click="savePrompt">保存主指令</ElButton>
          </div>
        </ElCard>

        <ElCard shadow="never" class="agent-card">
          <div class="section-head">
            <div>
              <h3>技能规则</h3>
              <p>每条规则对应一个 SKILL.md。创建并保存后，下一次执行当前 Agent 时自动注入。</p>
            </div>
            <ElButton type="primary" plain @click="openCreateSkill">新增规则</ElButton>
          </div>

          <div class="skills-grid">
            <div class="skill-list">
              <button
                v-for="skill in currentSkills"
                :key="skill.id"
                :class="['skill-item', { active: selectedSkillId === skill.id }]"
                type="button"
                @click="selectSkill(skill.id)"
              >
                <span>
                  <strong>{{ skillTitle(skill) }}</strong>
                  <small>{{ skill.id }}</small>
                </span>
                <ElTag v-if="skill.id === activeSkill?.id" size="small">编辑中</ElTag>
              </button>
              <div v-if="!currentSkills.length" class="empty-state">
                <strong>暂无技能规则</strong>
                <span>新增一条后会挂到当前 Agent 名下。</span>
              </div>
            </div>

            <div class="skill-editor">
              <template v-if="selectedSkillId">
                <div class="skill-editor-head">
                  <div>
                    <strong>{{ skillTitle(activeSkill || {}) }}</strong>
                    <span>{{ skillPath(selectedSkillId) }}</span>
                  </div>
                  <ElButton
                    text
                    type="danger"
                    @click="deleteSkill(activeSkill)"
                  >
                    删除
                  </ElButton>
                </div>
                <ElAlert
                  type="success"
                  show-icon
                  :closable="false"
                  title="这条规则属于当前 Agent，保存后会被后端动态扫描并注入。"
                  class="skill-active-alert"
                />
                <ElInput v-model="skillForm.content" type="textarea" :rows="18" />
                <div class="actions">
                  <ElButton type="primary" :loading="savingSkill" @click="saveSkill">保存技能规则</ElButton>
                </div>
              </template>
              <div v-else class="empty-state">选择左侧规则后编辑</div>
            </div>
          </div>
        </ElCard>
      </main>
    </div>

    <ElDialog v-model="createSkillOpen" title="新增技能规则" width="640px">
      <ElForm label-position="top">
        <ElFormItem label="挂载位置">
          <ElSelect v-model="createSkillForm.prefix" style="width: 100%">
            <ElOption
              v-for="item in skillGroupOptions"
              :key="item.prefix"
              :label="item.label"
              :value="item.prefix"
            />
          </ElSelect>
          <div class="field-hint">新增规则只会注入当前 Agent；这里决定放在哪个技能组下面。</div>
        </ElFormItem>
        <ElFormItem label="规则标识">
          <ElInput v-model="createSkillForm.id" placeholder="如 tone-rules" />
          <div class="field-hint">只能使用小写字母、数字和连字符；不含斜杠时自动拼到上方挂载位置。</div>
        </ElFormItem>
        <ElFormItem label="描述">
          <ElInput v-model="createSkillForm.description" placeholder="一句话说明这条规则约束什么" />
        </ElFormItem>
        <ElFormItem label="规则正文">
          <ElInput
            v-model="createSkillForm.content"
            type="textarea"
            :rows="7"
            placeholder="例如：改写时所有对白必须短句化；每句台词不超过 18 个字；保留角色关系但强化冲突。"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="createSkillOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="creatingSkill" @click="createSkill">创建并生效</ElButton>
      </template>
    </ElDialog>
  </WanyingPage>
</template>

<style scoped>
.workflow-layout {
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr);
  gap: 16px;
}

.agent-nav,
.agent-card {
  border: 1px solid var(--el-border-color-lighter);
}

.agent-nav {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-self: start;
  padding: 14px;
  background: var(--el-bg-color);
  border-radius: 8px;
}

.nav-title {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 700;
}

.agent-list {
  display: grid;
  gap: 8px;
}

.agent-nav-item,
.skill-item {
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  color: var(--el-text-color-regular);
  text-align: left;
  cursor: pointer;
}

.agent-nav-item {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 64px;
  padding: 10px;
  border-color: var(--el-border-color-lighter);
  border-radius: 6px;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.agent-index {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  background: var(--el-color-primary-light-9);
  border-radius: 6px;
}

.agent-copy {
  display: grid;
  flex: 1;
  gap: 2px;
  min-width: 0;
}

.agent-copy strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.runtime-note {
  display: grid;
  gap: 6px;
  padding: 12px;
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.runtime-note strong {
  color: var(--el-text-color-primary);
  font-size: 13px;
}

.agent-nav-item small,
.runtime-note span,
.skill-item small,
.field-hint,
.section-head p,
.explain-panel p,
.skill-editor-head span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.agent-nav-item.active,
.skill-item.active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
}

.workflow-main {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.workflow-hero {
  display: flex;
  gap: 20px;
  align-items: stretch;
  justify-content: space-between;
  padding: 18px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.eyebrow {
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 800;
}

.workflow-hero h2 {
  margin: 6px 0;
  color: var(--el-text-color-primary);
  font-size: 22px;
  line-height: 1.25;
}

.workflow-hero p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(112px, 1fr));
  gap: 10px;
  min-width: 420px;
}

.hero-metrics div {
  display: grid;
  align-content: center;
  gap: 6px;
  padding: 12px;
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.hero-metrics span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.hero-metrics strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.section-head,
.actions,
.skill-editor-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.section-head {
  margin-bottom: 16px;
}

.section-head h3 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
}

.section-head p {
  margin: 6px 0 0;
}

.status-pill {
  flex: 0 0 auto;
  padding: 3px 8px;
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 700;
  background: var(--el-color-primary-light-9);
  border-radius: 6px;
}

.prompt-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 16px;
}

.explain-panel {
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 14px;
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.actions {
  justify-content: flex-end;
  margin-top: 14px;
}

.skills-grid {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 14px;
}

.skill-list {
  display: grid;
  align-content: start;
  gap: 8px;
}

.skill-item {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  min-height: 58px;
  padding: 10px 12px;
  border-color: var(--el-border-color-lighter);
  border-radius: 6px;
}

.skill-item > span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.skill-item strong {
  color: var(--el-text-color-primary);
  font-size: 13px;
}

.skill-editor {
  min-width: 0;
}

.skill-editor-head {
  margin-bottom: 10px;
}

.skill-editor-head div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.skill-active-alert {
  margin-bottom: 10px;
}

.empty-state {
  display: grid;
  gap: 4px;
  padding: 28px 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
  background: var(--el-fill-color-extra-light);
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
}

.empty-state strong {
  color: var(--el-text-color-primary);
  font-size: 13px;
}

:deep(.el-textarea__inner) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  line-height: 1.65;
}

@media (max-width: 980px) {
  .workflow-layout,
  .workflow-hero,
  .prompt-grid,
  .skills-grid {
    grid-template-columns: 1fr;
  }

  .workflow-hero {
    display: grid;
  }

  .hero-metrics {
    grid-template-columns: 1fr;
    min-width: 0;
  }
}
</style>
