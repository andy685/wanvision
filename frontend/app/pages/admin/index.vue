<template>
  <div class="admin-shell">
    <aside class="admin-sidebar" :class="{ open: sidebarOpen }">
      <div class="admin-brand"><span class="admin-brand-mark">万</span><span><strong>万影工坊</strong><small>管理后台</small></span></div>
      <nav class="admin-nav" aria-label="管理后台导航">
        <section v-for="group in menuGroups" :key="group.label" class="admin-nav-group">
          <div class="admin-nav-group-label">{{ group.label }}</div>
          <button v-for="tab in group.items" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" @click="selectTab(tab.id)">
            <component :is="tab.icon" :size="17" /><span>{{ tab.label }}</span>
          </button>
        </section>
      </nav>
      <div class="admin-sidebar-footer">
        <button type="button" class="admin-ghost-link" @click="loadAdminData"><RefreshCw :size="16" />刷新数据</button>
        <button type="button" class="admin-ghost-link" @click="adminLogout"><LogOut :size="16" />退出后台</button>
      </div>
    </aside>
    <button v-if="sidebarOpen" type="button" class="admin-scrim" aria-label="关闭导航" @click="sidebarOpen = false"></button>

    <main class="admin-main">
      <header class="admin-page-head">
        <button class="mobile-menu-button" type="button" aria-label="打开导航" @click="sidebarOpen = true"><Menu :size="20" /></button>
        <div><h1>{{ currentModule.label }}</h1><p>{{ currentModule.description }}</p></div>
        <button class="btn btn-primary btn-sm head-refresh" type="button" @click="loadAdminData"><RefreshCw :size="15" />刷新</button>
      </header>

      <div v-if="loading" class="admin-state"><Loader2 :size="20" class="spin" /><strong>正在加载运营数据</strong><span>正在同步用户、任务和服务配置</span></div>
      <div v-else-if="denied" class="admin-state"><ShieldAlert :size="22" /><strong>暂无管理员权限</strong><span>请使用超管账号登录后访问运营后台。</span></div>
      <div v-else-if="loadError" class="admin-state"><TriangleAlert :size="22" /><strong>运营数据加载失败</strong><span>{{ loadError }}</span><button class="btn btn-primary btn-sm" type="button" @click="loadAdminData">重新加载</button></div>

      <template v-else>
        <section v-if="activeTab === 'overview'" class="admin-section admin-overview">
          <div class="metric-grid" aria-label="平台概览"><div v-for="metric in metrics" :key="metric.label" class="metric-card"><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong></div></div>
          <div class="overview-note"><strong>运营概览</strong><span>这里集中查看平台核心数据；具体配置和业务操作请从左侧进入对应模块。</span></div>
        </section>

        <section v-else-if="activeTab === 'services'" class="admin-section">
          <div class="section-head"><div><h2>AI 服务配置</h2><p>统一维护文本、图片、视频服务，密钥只在服务端保存。</p></div><button class="btn btn-primary btn-sm" type="button" @click="openConfigForm()">新增配置</button></div>
          <div class="toolbar-panel"><div><strong>快捷配置</strong><span>输入统一 API Key，一次写入默认文本、图片、视频服务。</span></div><div class="toolbar-actions"><input v-model.trim="quickApiKey" class="input" type="password" placeholder="统一 API Key" /><button class="btn btn-primary btn-sm" type="button" :disabled="quickSaving" @click="applyQuickConfig">{{ quickSaving ? '配置中...' : '一键配置' }}</button></div></div>
          <div class="data-table">
            <div class="table-row table-head service-table"><span>名称</span><span>类型</span><span>服务商</span><span>模型</span><span>状态</span><span>操作</span></div>
            <div v-for="row in aiConfigs" :key="row.id" class="table-row service-table">
              <span class="strong">{{ row.name }}</span><span>{{ serviceTypeLabel(row.service_type) }}</span><span class="mono">{{ row.provider }}</span><span class="mono model-cell">{{ (row.model || []).join(', ') }}</span>
              <span><button class="status-toggle" :class="{ on: row.is_active }" type="button" @click="toggleConfig(row)">{{ row.is_active ? '已启用' : '已停用' }}</button><small class="config-state">{{ row.api_key ? '密钥已配置' : '无密钥' }}</small></span>
              <span><button class="save-btn" type="button" @click="openConfigForm(row)">编辑</button></span>
            </div>
            <div v-if="!aiConfigs.length" class="table-empty">还没有 API 配置。</div>
          </div>
        </section>

        <section v-else-if="activeTab === 'payments'" class="admin-section">
          <div class="section-head"><div><h2>支付渠道</h2><p>维护充值支付参数、渠道开关和回调地址。</p></div><span class="section-count">{{ paymentStatusText }}</span></div>
          <section class="payment-channel-controls"><div><strong>渠道上线控制</strong><span>只有开启且配置完整的渠道，用户端才允许创建充值订单。</span></div><label><span>微信支付</span><ElSwitch v-model="paymentEnabled.wechat" active-text="启用" inactive-text="停用" /></label><label><span>支付宝</span><ElSwitch v-model="paymentEnabled.alipay" active-text="启用" inactive-text="停用" /></label><button class="btn btn-primary btn-sm" type="button" :disabled="paymentSaving" @click="savePaymentSettings">{{ paymentSaving ? '保存中...' : '保存渠道状态' }}</button></section>
          <div class="payment-grid"><section class="payment-card"><div class="payment-card-head"><div><h3>微信支付 Native</h3><span>用于生成二维码和接收支付回调</span></div><span :class="['status-dot-label', paymentReady.wechat ? 'is-ready' : 'is-pending']">{{ paymentReady.wechat ? '已配置' : '待配置' }}</span></div><label>商户号<input v-model.trim="paymentForm.wechat_mch_id" class="input" placeholder="微信商户号" /></label><label>AppID<input v-model.trim="paymentForm.wechat_app_id" class="input" placeholder="微信支付应用 AppID" /></label><label>API v3 密钥<input v-model="paymentForm.wechat_api_v3_key" class="input" type="password" :placeholder="paymentForm.wechat_api_v3_key === 'configured' ? '已配置，留空保持不变' : '32 位密钥'" /></label><label>商户证书序列号<input v-model.trim="paymentForm.wechat_serial_no" class="input" placeholder="证书序列号" /></label><label>商户私钥<textarea v-model="paymentForm.wechat_private_key" class="textarea" placeholder="PEM 私钥，支持换行转义" /></label><label>平台证书公钥<textarea v-model="paymentForm.wechat_platform_public_key" class="textarea" placeholder="PEM 公钥，支持换行转义" /></label></section><section class="payment-card"><div class="payment-card-head"><div><h3>支付宝电脑网站支付</h3><span>用于生成支付链接和接收支付回调</span></div><span :class="['status-dot-label', paymentReady.alipay ? 'is-ready' : 'is-pending']">{{ paymentReady.alipay ? '已配置' : '待配置' }}</span></div><label>应用 AppID<input v-model.trim="paymentForm.alipay_app_id" class="input" placeholder="支付宝应用 ID" /></label><label>应用私钥<textarea v-model="paymentForm.alipay_private_key" class="textarea" placeholder="RSA 私钥，支持换行转义" /></label><label>支付宝公钥<textarea v-model="paymentForm.alipay_public_key" class="textarea" placeholder="RSA 公钥，支持换行转义" /></label><label>支付完成返回地址<input v-model.trim="paymentForm.alipay_return_url" class="input" placeholder="https://your-domain.com/credits" /></label></section></div>
          <section class="payment-common"><label>统一回调地址<input v-model.trim="paymentForm.payment_notify_url" class="input" placeholder="https://your-domain.com/api/v1/recharge/webhooks" /></label><span>微信和支付宝回调地址必须是公网 HTTPS 地址。</span></section>
          <div class="payment-save-row"><span v-if="paymentSaved" class="save-state">支付配置已保存</span><button class="btn btn-primary" type="button" :disabled="paymentSaving" @click="savePaymentSettings">{{ paymentSaving ? '保存中...' : '保存支付配置' }}</button></div>
        </section>

        <section v-else-if="activeTab === 'pricing'" class="admin-section"><div class="section-head"><div><h2>AI 价格规则</h2><p>修改后新任务立即使用新价格，已冻结任务保持原价。</p></div><span class="section-count">{{ pricing.length }} 条规则</span></div><div class="data-table"><div class="table-row table-head"><span>生成环节</span><span>服务类型</span><span>单价</span><span>状态</span><span>操作</span></div><div v-for="row in pricing" :key="row.id" class="table-row"><span class="strong">{{ actionLabel(row.action) }}</span><span>{{ row.service_type }}</span><label class="price-edit"><input v-model.number="row.price" type="number" min="0" /><em>积分</em></label><button type="button" class="status-toggle" :class="{ on: row.is_active }" @click="togglePricing(row)">{{ row.is_active ? '已启用' : '已停用' }}</button><button type="button" class="save-btn" @click="savePricing(row)">{{ row.saving ? '保存中' : '保存' }}</button></div></div></section>
        <section v-else-if="activeTab === 'users'" class="admin-section"><div class="section-head"><div><h2>用户管理</h2><p>查看账号、积分余额和账号状态。</p></div><span class="section-count">{{ users.length }} 个用户</span></div><div class="data-table"><div class="table-row table-head users-table"><span>手机号</span><span>积分余额</span><span>账号状态</span><span>状态操作</span><span>积分操作</span></div><div v-for="row in pagedRows" :key="row.id" class="table-row users-table"><span class="strong">{{ row.phone }}</span><span class="credits">{{ row.balance }}</span><span>{{ row.status === 'active' ? '正常' : '已停用' }}</span><button class="status-toggle" :class="{ on: row.status === 'active' }" type="button" @click="toggleUserStatus(row)">{{ row.status === 'active' ? '停用' : '启用' }}</button><button class="save-btn" type="button" @click="openAdjust(row)">调整积分</button></div></div></section>
        <section v-else-if="activeTab === 'orders'" class="admin-section"><div class="section-head"><div><h2>充值订单</h2><p>查看充值订单状态和到账积分。</p></div><span class="section-count">{{ orders.length }} 笔订单</span></div><div class="data-table"><div class="table-row table-head"><span>订单号</span><span>支付方式</span><span>金额</span><span>积分</span><span>状态</span></div><div v-for="row in pagedRows" :key="row.id" class="table-row"><span class="strong mono">{{ row.order_no }}</span><span>{{ row.payment_provider === 'wechat' ? '微信支付' : '支付宝' }}</span><span>¥{{ (row.amount_fen / 100).toFixed(2) }}</span><span class="credits">+{{ row.credits }}</span><span>{{ row.status === 'pending' ? '待支付' : row.status }} <button v-if="row.status === 'paid'" class="save-btn" type="button" @click="refundOrder(row)">退款</button></span></div></div></section>
        <section v-else-if="activeTab === 'tasks'" class="admin-section"><div class="section-head"><div><h2>生成任务</h2><p>查看全平台任务、模型、积分结算和错误信息。</p></div><span class="section-count">{{ tasks.length }} 条任务</span></div><div class="data-table"><div class="table-row table-head task-table"><span>任务</span><span>项目 / 模型</span><span>积分</span><span>状态</span><span>时间</span></div><div v-for="row in pagedRows" :key="row.id" class="table-row task-table"><span><strong>#{{ row.id }} · {{ row.type === 'video' ? '视频' : '图片' }}</strong><small>{{ row.provider || '-' }}</small></span><span>{{ row.drama_id || '-' }} · <span class="mono">{{ row.model || '-' }}</span></span><span class="credits">{{ row.credit_cost || 0 }}<small>{{ row.credit_status || 'none' }}</small></span><span :class="{ 'task-error': row.status === 'failed' }">{{ row.status }}<small v-if="row.error_msg">{{ row.error_msg }}</small></span><span>{{ formatDate(row.created_at) }} <button v-if="row.status === 'processing'" class="save-btn" type="button" @click="cancelTask(row)">取消并退款</button><button v-if="row.status === 'failed' || row.status === 'cancelled'" class="save-btn" type="button" @click="retryTask(row)">重试</button></span></div></div></section>
        <section v-else class="admin-section"><div class="section-head"><div><h2>操作日志</h2><p>记录管理员对账号、积分、价格和订单的操作。</p></div><span class="section-count">{{ auditLogs.length }} 条记录</span></div><div class="data-table"><div class="table-row table-head log-table"><span>操作</span><span>管理员</span><span>目标</span><span>详情</span><span>时间</span></div><div v-for="row in pagedRows" :key="row.id" class="table-row log-table"><span class="strong">{{ auditLabel(row.action) }}</span><span>{{ row.admin_phone }}</span><span>{{ row.target_type }} · {{ row.target_id }}</span><span class="mono">{{ row.detail || '-' }}</span><span>{{ formatDate(row.created_at) }}</span></div></div></section>
        <div v-if="pagedPageCount > 1" class="admin-pager"><span>第 {{ currentPage }} / {{ pagedPageCount }} 页，共 {{ pagedTotal }} 条</span><ElPagination background layout="prev, pager, next" :current-page="currentPage" :page-size="pageSize" :total="pagedTotal" @current-change="changePageTo" /></div>
      </template>

      <div v-if="adjustingUser" class="modal-backdrop"><section class="adjust-modal"><button class="modal-close" type="button" aria-label="关闭" @click="adjustingUser = null"><X :size="18" /></button><h2>调整用户积分</h2><p>{{ adjustingUser.phone }} · 当前余额 {{ adjustingUser.balance }} 积分</p><form @submit.prevent="submitAdjust"><label>变动积分<input v-model.number="adjustAmount" class="input" type="number" step="1" placeholder="正数增加，负数扣除" required /></label><label>调整原因<textarea v-model.trim="adjustNote" class="textarea" rows="3" placeholder="请输入原因" required /></label><div class="adjust-actions"><button class="btn" type="button" @click="adjustingUser = null">取消</button><button class="btn btn-primary" type="submit" :disabled="adjustSaving">{{ adjustSaving ? '提交中...' : '确认调整' }}</button></div></form></section></div>
      <div v-if="configEditing" class="modal-backdrop" @click.self="configEditing = false"><form class="adjust-modal config-edit-modal" @submit.prevent="saveConfig"><button class="modal-close" type="button" aria-label="关闭" @click="configEditing = false"><X :size="18" /></button><h2>{{ configForm.id ? '编辑 API 配置' : '新增 API 配置' }}</h2><p>API Key 仅保存于服务端，用户端只会看到已配置状态。</p><label>配置名称<input v-model.trim="configForm.name" class="input" placeholder="例如：默认文本服务" required /></label><label>服务类型<select v-model="configForm.service_type" class="input"><option value="text">文本</option><option value="image">图片</option><option value="video">视频</option></select></label><label>服务商<input v-model.trim="configForm.provider" class="input" placeholder="openai / gemini / volcengine" required /></label><label>Base URL<input v-model.trim="configForm.base_url" class="input" placeholder="https://..." required /></label><label>API Key<input v-model="configForm.api_key" class="input" type="password" placeholder="留空则保留原密钥" /></label><label>模型（逗号分隔）<input v-model.trim="configForm.model" class="input" placeholder="model-a, model-b" required /></label><label>优先级<input v-model.number="configForm.priority" class="input" type="number" min="0" max="999" /></label><label class="config-active-field"><input v-model="configForm.is_active" type="checkbox" /> 启用此配置</label><div class="adjust-actions"><button class="btn" type="button" @click="configEditing = false">取消</button><button class="btn btn-primary" type="submit" :disabled="configSaving">{{ configSaving ? '保存中...' : '保存配置' }}</button></div></form></div>
    </main>
  </div>
</template>

<script setup>
definePageMeta({ layout: false })
import { BarChart3, Bot, ClipboardList, CreditCard, ListTodo, Loader2, LogOut, Menu, ReceiptText, RefreshCw, ShieldAlert, SlidersHorizontal, TriangleAlert, Users, X } from 'lucide-vue-next'
import { ElMessage, ElPagination, ElSwitch } from 'element-plus'
import 'element-plus/dist/index.css'
import { adminAPI, aiConfigAPI } from '~/composables/useApi'

const route = useRoute()
const adminSessionCookie = useCookie('wanying:admin-session', { maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' })
const sidebarOpen = ref(false)
const menuGroups = [
  {
    label: '运营概览',
    items: [{ id: 'overview', label: '平台概览', description: '查看平台用户、任务、订单和积分概况。', icon: BarChart3 }],
  },
  {
    label: 'AI 生产',
    items: [
      { id: 'services', label: 'AI 服务', description: '统一维护平台 AI 服务、模型和密钥。', icon: Bot },
      { id: 'pricing', label: '价格规则', description: '管理各生成环节的积分价格和启停状态。', icon: SlidersHorizontal },
      { id: 'tasks', label: '生成任务', description: '跟踪全平台生成任务、模型和结算状态。', icon: ListTodo },
    ],
  },
  {
    label: '用户财务',
    items: [
      { id: 'users', label: '用户管理', description: '查看用户账号、状态和积分余额。', icon: Users },
      { id: 'orders', label: '充值订单', description: '查看充值订单、支付结果和退款操作。', icon: ReceiptText },
      { id: 'payments', label: '支付渠道', description: '配置充值支付参数、渠道开关和回调地址。', icon: CreditCard },
    ],
  },
  {
    label: '系统审计',
    items: [{ id: 'logs', label: '操作日志', description: '追踪管理员关键操作和审计记录。', icon: ClipboardList }],
  },
]
const tabs = menuGroups.flatMap(group => group.items)
const activeTab = ref(tabs.some(tab => tab.id === route.query.tab) ? route.query.tab : 'services')
const currentModule = computed(() => tabs.find(tab => tab.id === activeTab.value) || tabs[0])
const loading = ref(true)
const denied = ref(false)
const loadError = ref('')
const overview = ref({})
const pricing = ref([])
const users = ref([])
const orders = ref([])
const tasks = ref([])
const aiConfigs = ref([])
const auditLogs = ref([])
const adjustingUser = ref(null)
const adjustAmount = ref(null)
const adjustNote = ref('')
const adjustSaving = ref(false)
const configEditing = ref(false)
const configSaving = ref(false)
const configForm = reactive({ id: null, name: '', service_type: 'text', provider: '', base_url: '', api_key: '', model: '', priority: 0, is_active: true })
const paymentSaving = ref(false)
const paymentSaved = ref(false)
const paymentReady = reactive({ wechat: false, alipay: false })
const paymentEnabled = reactive({ wechat: true, alipay: true })
const paymentForm = reactive({ wechat_mch_id: '', wechat_app_id: '', wechat_api_v3_key: '', wechat_serial_no: '', wechat_private_key: '', wechat_platform_public_key: '', alipay_app_id: '', alipay_private_key: '', alipay_public_key: '', alipay_return_url: '', payment_notify_url: '' })
const quickApiKey = ref('')
const quickSaving = ref(false)
const metrics = computed(() => [{ label: '用户数', value: overview.value.users ?? '-' }, { label: '生成任务', value: overview.value.tasks ?? '-' }, { label: '待支付订单', value: overview.value.pending_orders ?? '-' }, { label: '累计消费积分', value: overview.value.consumed_credits ?? '-' }])
const pageSize = 12
const pages = reactive({ users: 1, tasks: 1, orders: 1, logs: 1 })
const pagedSource = computed(() => ({ users: users.value, tasks: tasks.value, orders: orders.value, logs: auditLogs.value })[activeTab.value] || [])
const currentPage = computed(() => pages[activeTab.value] || 1)
const pagedTotal = computed(() => pagedSource.value.length)
const pagedPageCount = computed(() => Math.max(1, Math.ceil(pagedTotal.value / pageSize)))
const pagedRows = computed(() => pagedSource.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize))
const toast = { success: message => ElMessage({ message, type: 'success' }), error: message => ElMessage({ message, type: 'error' }), warning: message => ElMessage({ message, type: 'warning' }) }
const paymentStatusText = computed(() => `${paymentReady.wechat ? '微信可用' : '微信待配置'} · ${paymentReady.alipay ? '支付宝可用' : '支付宝待配置'}`)
const quickConfigs = [{ service_type: 'text', provider: 'openai', name: '自有文本服务 · New API', base_url: 'https://cloudapi.flowingcloud.com', model: ['claude-opus-4-8', 'gpt-5.5'], priority: 101 }, { service_type: 'image', provider: 'openai', name: '自有图片服务 · New API', base_url: 'https://cloudapi.flowingcloud.com', model: ['gpt-image-2'], priority: 99 }, { service_type: 'video', provider: 'volcengine', name: '自有视频服务 · Seedance', base_url: 'https://cloudapi.flowingcloud.com', model: ['doubao-seedance-2-0-fast-260128', 'doubao-seedance-2-0-260128', 'doubao-seedance-2-0-mini-260615'], priority: 98 }]

function selectTab(tab) { activeTab.value = tab; sidebarOpen.value = false }
function changePageTo(page) { const key = activeTab.value; if (pages[key]) pages[key] = page }
function actionLabel(action) { return ({ script_rewrite: '剧本改写', asset_extract: '资产提取', storyboard_break: '分镜拆解', character_prompt: '角色提示词', scene_prompt: '场景提示词', prop_prompt: '道具提示词', character_image: '角色图片', scene_image: '场景图片', prop_image: '道具图片', video_prompt: '视频提示词', video_4s: '视频 4 秒', video_8s: '视频 8 秒', video_12s: '视频 12 秒', video_15s: '视频 15 秒' })[action] || action }
function serviceTypeLabel(type) { return ({ text: '文本', image: '图片', video: '视频' })[type] || type }
function formatDate(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-' }
function auditLabel(action) { return ({ user_status_update: '账号状态', credit_adjust: '积分调账', pricing_update: '价格调整', recharge_refund: '充值退款', payment_settings_update: '支付配置' })[action] || action }
function openAdjust(row) { adjustingUser.value = row; adjustAmount.value = null; adjustNote.value = '' }
function openConfigForm(row) { Object.assign(configForm, row ? { id: row.id, name: row.name || '', service_type: row.service_type, provider: row.provider || '', base_url: row.base_url || '', api_key: '', model: (row.model || []).join(', '), priority: row.priority || 0, is_active: row.is_active !== false } : { id: null, name: '', service_type: 'text', provider: '', base_url: '', api_key: '', model: '', priority: 0, is_active: true }); configEditing.value = true }
function adminLogout() { localStorage.removeItem('wanying:admin-session'); adminSessionCookie.value = null; navigateTo('/admin/login') }
async function savePricing(row) { row.saving = true; try { await adminAPI.updatePricing(row.id, { price: row.price, is_active: row.is_active }); toast.success(`「${actionLabel(row.action)}」价格已保存`); return true } catch (error) { toast.error(error.message || '价格保存失败'); return false } finally { row.saving = false } }
async function togglePricing(row) { const previous = row.is_active; row.is_active = !previous; if (!await savePricing(row)) row.is_active = previous }
async function applyQuickConfig() { if (!quickApiKey.value) { toast.warning('请填写统一 API Key'); return }; quickSaving.value = true; try { for (const preset of quickConfigs) { const existing = aiConfigs.value.find(row => row.service_type === preset.service_type && row.provider === preset.provider && row.base_url === preset.base_url); const payload = { ...preset, api_key: quickApiKey.value, is_active: true }; if (existing) await aiConfigAPI.update(existing.id, payload); else await aiConfigAPI.create(payload) }; aiConfigs.value = await adminAPI.aiConfigs(); quickApiKey.value = ''; toast.success('AI 服务快捷配置已保存') } catch (error) { toast.error(error.message || '快捷配置失败') } finally { quickSaving.value = false } }
async function saveConfig() { configSaving.value = true; try { const payload = { name: configForm.name, service_type: configForm.service_type, provider: configForm.provider, base_url: configForm.base_url, api_key: configForm.api_key || undefined, model: configForm.model.split(',').map(v => v.trim()).filter(Boolean), priority: configForm.priority, is_active: configForm.is_active }; if (configForm.id) await aiConfigAPI.update(configForm.id, payload); else await aiConfigAPI.create(payload); aiConfigs.value = await adminAPI.aiConfigs(); configEditing.value = false; toast.success('AI API 配置已保存') } catch (error) { toast.error(error.message || 'AI API 配置保存失败') } finally { configSaving.value = false } }
async function loadPaymentSettings() { const data = await adminAPI.paymentSettings(); for (const key of Object.keys(paymentForm)) paymentForm[key] = data?.[key] || ''; paymentEnabled.wechat = data?.wechat_enabled !== false; paymentEnabled.alipay = data?.alipay_enabled !== false; paymentReady.wechat = paymentEnabled.wechat && ['wechat_mch_id','wechat_app_id','wechat_api_v3_key','wechat_serial_no','wechat_private_key','wechat_platform_public_key','payment_notify_url'].every(key => !!data?.[key]); paymentReady.alipay = paymentEnabled.alipay && ['alipay_app_id','alipay_private_key','alipay_public_key','payment_notify_url'].every(key => !!data?.[key]) }
async function savePaymentSettings() { paymentSaving.value = true; paymentSaved.value = false; try { await adminAPI.updatePaymentSettings({ ...paymentForm, wechat_enabled: paymentEnabled.wechat, alipay_enabled: paymentEnabled.alipay }); await loadPaymentSettings(); paymentSaved.value = true; toast.success('支付渠道配置已保存') } catch (error) { toast.error(error.message || '支付配置保存失败') } finally { paymentSaving.value = false } }
async function toggleConfig(row) { const previous = row.is_active; const next = !previous; row.is_active = next; try { await aiConfigAPI.update(row.id, { is_active: next }); toast.success(`${row.name || 'AI 服务'}已${next ? '启用' : '停用'}`) } catch (error) { row.is_active = previous; toast.error(error.message || '服务状态保存失败') } }
async function toggleUserStatus(row) { const next = row.status === 'active' ? 'disabled' : 'active'; try { await adminAPI.updateUserStatus(row.id, next); row.status = next; toast.success(`账号已${next === 'active' ? '启用' : '停用'}`) } catch (error) { toast.error(error.message || '账号状态保存失败') } }
async function cancelTask(row) { if (!confirm(`确认取消任务 #${row.id} 并退还冻结积分吗？`)) return; try { await adminAPI.cancelTask(row.id); row.status = 'cancelled'; row.credit_status = 'refunded'; toast.success(`任务 #${row.id} 已取消，积分已退还`) } catch (error) { toast.error(error.message || '任务取消失败') } }
async function retryTask(row) { if (!confirm(`确认重试任务 #${row.id} 吗？将按当前价格重新计费。`)) return; try { const result = await adminAPI.retryTask(row.id); tasks.value.unshift({ id: result.task_id, type: row.type, drama_id: row.drama_id, model: row.model, credit_cost: result.credit_cost, credit_status: 'frozen', status: 'processing', created_at: new Date().toISOString() }); toast.success(`任务已重试，预计扣除 ${result.credit_cost} 积分`) } catch (error) { toast.error(error.message || '任务重试失败') } }
async function refundOrder(row) { if (!confirm(`确认退款订单 ${row.order_no} 吗？对应 ${row.credits} 积分将从账户余额扣回。`)) return; try { await adminAPI.refundOrder(row.order_no); row.status = 'refunded'; toast.success('订单已退款，积分已扣回') } catch (error) { toast.error(error.message || '订单退款失败') } }
async function submitAdjust() { if (!adjustingUser.value || !adjustAmount.value || !adjustNote.value) return; adjustSaving.value = true; try { const result = await adminAPI.adjustUserCredits(adjustingUser.value.id, adjustAmount.value, adjustNote.value); adjustingUser.value.balance = result.balance; toast.success('积分调整已保存'); adjustingUser.value = null } catch (error) { toast.error(error.message || '积分调整失败') } finally { adjustSaving.value = false } }
async function loadAdminData() { loading.value = true; denied.value = false; loadError.value = ''; try { overview.value = await adminAPI.overview(); pricing.value = await adminAPI.pricing(); aiConfigs.value = await adminAPI.aiConfigs(); users.value = await adminAPI.users(); tasks.value = await adminAPI.tasks(); orders.value = await adminAPI.orders(); auditLogs.value = await adminAPI.auditLogs(); await loadPaymentSettings() } catch (e) { if (/权限|请先登录|401|403/.test(e.message || '')) { await navigateTo(`/admin/login?redirect=${encodeURIComponent(route.fullPath)}`); return } loadError.value = e.message || '请稍后重试' } finally { loading.value = false } }

watch(activeTab, () => { if (pages[activeTab.value]) pages[activeTab.value] = 1 })
watch(activeTab, tab => { if (route.path === '/admin' && route.query.tab !== tab) navigateTo({ path: '/admin', query: { tab } }, { replace: true }) })
onMounted(loadAdminData)
</script>

<style scoped>
.admin-shell { --admin-bg:#f5f7fb; --admin-surface:#fff; --admin-surface-soft:#f8fafc; --admin-border:#e5e7eb; --admin-text:#111827; --admin-muted:#6b7280; --admin-subtle:#9ca3af; --admin-primary:#2563eb; --admin-primary-hover:#1d4ed8; --admin-success:#15803d; --admin-success-soft:#ecfdf3; --admin-warning:#b45309; --admin-warning-soft:#fffbeb; min-height:100dvh; display:grid; grid-template-columns:240px minmax(0,1fr); background:var(--admin-bg); color:var(--admin-text); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.admin-sidebar { position:sticky; top:0; height:100dvh; display:flex; flex-direction:column; border-right:1px solid #0f172a; background:#111827; color:#f9fafb; }
.admin-brand { display:flex; align-items:center; gap:12px; min-height:72px; padding:0 20px; border-bottom:1px solid rgba(255,255,255,.08); }
.admin-brand-mark { display:grid; place-items:center; width:34px; height:34px; border-radius:8px; background:#fff; color:#111827; font-weight:750; }
.admin-brand span:last-child { display:grid; gap:2px; } .admin-brand strong { font-size:15px; line-height:1.2; } .admin-brand small { color:#9ca3af; font-size:12px; }
.admin-nav { display:grid; gap:4px; padding:14px 12px; }
.admin-nav-group { display:grid; gap:4px; padding:7px 0; }
.admin-nav-group + .admin-nav-group { border-top:1px solid rgba(255,255,255,.08); }
.admin-nav-group-label { padding:0 12px 4px; color:#64748b; font-size:11px; font-weight:700; line-height:1.4; }
.admin-nav button, .admin-ghost-link { min-height:42px; display:flex; align-items:center; gap:10px; border:0; border-radius:7px; padding:0 12px; background:transparent; color:#cbd5e1; cursor:pointer; font:inherit; font-size:14px; text-align:left; transition:background .16s ease, color .16s ease; }
.admin-nav button:hover, .admin-ghost-link:hover { background:rgba(255,255,255,.08); color:#fff; }
.admin-nav button.active { background:var(--admin-primary); color:#fff; font-weight:650; }
.admin-sidebar-footer { margin-top:auto; display:grid; gap:4px; padding:12px; border-top:1px solid rgba(255,255,255,.08); }
.admin-main { min-width:0; height:100dvh; overflow:auto; padding:28px 32px 40px; }
.admin-page-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:18px; }
.admin-page-head h1 { margin:5px 0; font-size:24px; line-height:1.25; letter-spacing:0; }
.admin-page-head p, .section-head p { margin:0; color:var(--admin-muted); font-size:13px; }
.mobile-menu-button { display:none; width:42px; height:42px; border:1px solid var(--admin-border); border-radius:7px; background:var(--admin-surface); color:var(--admin-text); cursor:pointer; }
.head-refresh { display:flex; align-items:center; gap:6px; }
.metric-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; margin-bottom:20px; }
.metric-card { min-height:88px; display:grid; align-content:space-between; padding:16px; border:1px solid var(--admin-border); border-radius:8px; background:var(--admin-surface); }
.metric-card span, .section-count { color:var(--admin-muted); font-size:12px; }
.metric-card strong { font-size:24px; line-height:1.1; font-variant-numeric:tabular-nums; }
.overview-note { display:flex; align-items:center; gap:10px; margin-top:18px; padding:14px 16px; border:1px solid var(--admin-border); border-radius:8px; background:var(--admin-surface); color:var(--admin-muted); font-size:12px; }
.overview-note strong { color:var(--admin-text); font-size:13px; }
.admin-section { min-width:0; }
.section-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:12px; }
.section-head h2 { margin:0 0 5px; font-size:18px; }
.admin-section > .section-head > div:first-child { display:none; }
.toolbar-panel, .payment-channel-controls { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:12px; padding:14px 16px; border:1px solid var(--admin-border); border-radius:8px; background:var(--admin-surface); }
.toolbar-panel > div:first-child, .payment-channel-controls > div { display:grid; gap:3px; }
.toolbar-panel strong, .payment-channel-controls strong { font-size:13px; }
.toolbar-panel span, .payment-channel-controls > div span { color:var(--admin-muted); font-size:12px; }
.toolbar-actions { display:flex; align-items:center; gap:8px; width:min(430px, 100%); }
.data-table { overflow-x:auto; border:1px solid var(--admin-border); border-radius:8px; background:var(--admin-surface); }
.table-row { display:grid; grid-template-columns:1.35fr .8fr .8fr .8fr .8fr; gap:14px; align-items:center; min-width:760px; min-height:52px; padding:0 16px; border-bottom:1px solid var(--admin-border); color:#374151; font-size:13px; }
.table-row:last-child { border-bottom:0; }
.table-head { min-height:38px; background:var(--admin-surface-soft); color:var(--admin-muted); font-size:12px; font-weight:650; }
.service-table { grid-template-columns:1.25fr .58fr .8fr 1.55fr .85fr .48fr; }
.users-table { grid-template-columns:1.4fr .9fr .8fr .8fr .8fr; }
.task-table { grid-template-columns:1.05fr 1.35fr .75fr 1.25fr 1.1fr; }
.log-table { grid-template-columns:.85fr .9fr 1fr 1.6fr 1.1fr; }
.strong { color:var(--admin-text); font-weight:650; }
.mono { font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px; }
.model-cell, .log-table .mono { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.credits { color:var(--admin-primary); font-weight:650; font-variant-numeric:tabular-nums; }
.price-edit { display:flex; align-items:center; gap:6px; }
.price-edit input { width:78px; height:34px; border:1px solid var(--admin-border); border-radius:6px; padding:0 8px; color:var(--admin-text); }
.price-edit em { color:var(--admin-muted); font-style:normal; }
.status-toggle, .save-btn { min-height:32px; border:0; border-radius:6px; background:transparent; cursor:pointer; color:var(--admin-muted); font-size:12px; }
.status-toggle.on { color:var(--admin-success); }
.save-btn { color:var(--admin-primary); font-weight:650; }
.status-toggle:hover, .save-btn:hover { background:var(--admin-surface-soft); }
.config-state, .table-row small { display:block; margin-top:3px; color:var(--admin-subtle); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.task-error { color:#b91c1c; }
.table-empty { padding:50px 20px; text-align:center; color:var(--admin-muted); font-size:13px; }
.payment-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; }
.payment-card, .payment-common { display:grid; gap:14px; padding:18px; border:1px solid var(--admin-border); border-radius:8px; background:var(--admin-surface); }
.payment-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding-bottom:10px; border-bottom:1px solid var(--admin-border); }
.payment-card-head h3 { margin:0 0 4px; font-size:15px; }
.payment-card-head span, .payment-common > span { color:var(--admin-muted); font-size:12px; }
.payment-card label, .payment-common label, .adjust-modal label { display:grid; gap:7px; color:#374151; font-size:12px; font-weight:650; }
.payment-channel-controls label { display:flex; align-items:center; gap:8px; color:#374151; font-size:12px; white-space:nowrap; }
.payment-common { grid-template-columns:minmax(0,1fr) auto; align-items:end; margin-top:12px; }
.payment-save-row, .adjust-actions, .admin-pager { display:flex; align-items:center; justify-content:flex-end; gap:12px; }
.payment-save-row { margin-top:12px; }
.save-state { color:var(--admin-success); font-size:12px; }
.status-dot-label { flex:0 0 auto; padding:4px 8px; border-radius:999px; font-size:12px !important; font-weight:650; }
.status-dot-label.is-ready { color:var(--admin-success) !important; background:var(--admin-success-soft); }
.status-dot-label.is-pending { color:var(--admin-warning) !important; background:var(--admin-warning-soft); }
.input, .textarea, select.input { box-sizing:border-box; width:100%; min-height:38px; border:1px solid var(--admin-border); border-radius:7px; background:#fff; color:var(--admin-text); padding:8px 10px; font:inherit; font-size:13px; outline:0; }
.textarea { min-height:78px; resize:vertical; }
.input:focus, .textarea:focus { border-color:var(--admin-primary); box-shadow:0 0 0 3px rgba(37,99,235,.12); }
.btn { min-height:36px; display:inline-flex; align-items:center; justify-content:center; gap:6px; border:1px solid var(--admin-border); border-radius:7px; background:#fff; color:#374151; padding:0 13px; cursor:pointer; font:inherit; font-size:13px; font-weight:650; }
.btn-primary { border-color:var(--admin-primary); background:var(--admin-primary); color:#fff; }
.btn-primary:hover { background:var(--admin-primary-hover); }
.btn-sm { min-height:34px; padding:0 11px; font-size:12px; }
.btn:disabled { opacity:.55; cursor:not-allowed; }
.admin-pager { justify-content:space-between; padding:14px 2px 0; color:var(--admin-muted); font-size:12px; }
:deep(.el-pagination) { --el-color-primary: var(--admin-primary); }
.admin-state { min-height:360px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; border:1px solid var(--admin-border); border-radius:8px; background:var(--admin-surface); color:var(--admin-muted); text-align:center; }
.admin-state strong { color:var(--admin-text); font-size:16px; }
.spin { animation:spin 1s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.modal-backdrop { position:fixed; inset:0; z-index:40; display:grid; place-items:center; padding:24px; background:rgba(17,24,39,.45); }
.adjust-modal { position:relative; width:min(100%,460px); max-height:calc(100dvh - 48px); overflow:auto; padding:24px; border-radius:8px; background:var(--admin-surface); box-shadow:0 24px 70px rgba(17,24,39,.24); }
.config-edit-modal { display:grid; gap:13px; }
.adjust-modal h2 { margin:0 0 6px; font-size:20px; }
.adjust-modal p { margin:0 0 18px; color:var(--admin-muted); font-size:13px; }
.adjust-modal form { display:grid; gap:14px; }
.modal-close { position:absolute; top:14px; right:14px; width:34px; height:34px; display:grid; place-items:center; border:1px solid var(--admin-border); border-radius:7px; background:#fff; color:#4b5563; cursor:pointer; }
.config-active-field { display:flex !important; align-items:center; gap:8px !important; }
.admin-scrim { display:none; }
@media (max-width: 1100px) { .metric-grid { grid-template-columns:repeat(3, minmax(0,1fr)); } .payment-grid { grid-template-columns:1fr; } }
@media (max-width: 800px) {
  .admin-shell { grid-template-columns:1fr; }
  .admin-sidebar { position:fixed; z-index:50; left:0; top:0; width:240px; transform:translateX(-100%); transition:transform .18s ease; }
  .admin-sidebar.open { transform:translateX(0); }
  .admin-scrim { display:block; position:fixed; inset:0; z-index:45; border:0; background:rgba(17,24,39,.42); }
  .admin-main { height:auto; min-height:100dvh; padding:20px 16px 32px; }
  .mobile-menu-button { display:grid; place-items:center; flex:0 0 auto; }
  .admin-page-head { align-items:flex-start; }
  .head-refresh { display:none; }
  .metric-grid { grid-template-columns:repeat(2, minmax(0,1fr)); }
  .toolbar-panel, .payment-channel-controls { align-items:stretch; flex-direction:column; }
  .toolbar-actions { width:100%; }
  .payment-common { grid-template-columns:1fr; }
}
</style>
