<template>
  <main class="credits-page">
    <header class="credits-head">
      <div>
        <button class="back-link" type="button" @click="navigateTo('/')">
          <ArrowLeft :size="15" :stroke-width="1.8" />
          返回项目
        </button>
        <h1>积分中心</h1>
      </div>
      <button class="btn btn-primary" type="button" :disabled="paymentStatusLoading" @click="openRechargeModal">
        <Loader2 v-if="paymentStatusLoading" class="animate-spin" :size="15" :stroke-width="1.9" />
        <Plus v-else :size="15" :stroke-width="2" />
        {{ paymentStatusLoading ? '加载中' : '充值积分' }}
      </button>
    </header>

    <section class="balance-grid">
      <article class="balance-card balance-main">
        <span class="balance-label">当前可用积分</span>
        <strong>{{ totalBalance }}</strong>
        <span class="balance-hint">1 元 = 10 积分 · 积分永久有效</span>
      </article>
      <article class="balance-card">
        <span class="balance-label">冻结中</span>
        <strong>{{ totalFrozen }}</strong>
        <span class="balance-hint">生成任务完成后结算</span>
      </article>
    </section>

    <section class="ledger-section is-flow">
      <div class="section-head"><h2>积分流水</h2><span>共 {{ ledgerTotal }} 条记录</span></div>
      <div v-if="loading" class="ledger-empty">正在加载积分明细…</div>
      <div v-else-if="!ledger.length" class="ledger-empty">还没有积分变动记录</div>
      <div v-else class="ledger-list">
        <div v-for="row in ledger" :key="row.id" class="ledger-row">
          <div><strong>{{ row.task_name || ledgerLabel(row.type) }}</strong><span>{{ row.note || '积分变动' }}</span></div>
          <b :class="row.amount >= 0 ? 'is-add' : 'is-use'">{{ row.amount >= 0 ? '+' : '' }}{{ row.amount }}</b>
          <time>{{ formatDate(row.created_at) }}</time>
        </div>
      </div>
      <div v-if="!loading && ledgerTotal > ledgerPageSize" class="ledger-pager">
        <button type="button" :disabled="ledgerPage <= 1" @click="gotoLedgerPage(ledgerPage - 1)">上一页</button>
        <span>第 {{ ledgerPage }} / {{ ledgerPages }} 页 · 每页 {{ ledgerPageSize }} 条</span>
        <button type="button" :disabled="ledgerPage >= ledgerPages" @click="gotoLedgerPage(ledgerPage + 1)">下一页</button>
      </div>
    </section>

    <section class="ledger-section is-orders">
      <div class="section-head"><h2>充值记录</h2><span>{{ orders.length }} 笔订单</span></div>
      <div v-if="!orders.length" class="ledger-empty">还没有充值记录</div>
      <div v-else class="ledger-list">
        <div v-for="order in orders" :key="order.id" class="ledger-row">
          <div><strong>{{ order.payment_provider === 'wechat' ? '微信支付' : '支付宝' }}</strong><span class="mono">{{ order.order_no }}</span></div>
          <b>¥{{ (order.amount_fen / 100).toFixed(2) }} · {{ order.credits }} 积分</b>
          <time>{{ order.status === 'pending' ? '待支付' : order.status }} · {{ formatDate(order.created_at) }}</time>
          <button v-if="order.status === 'pending'" class="order-pay" type="button" :disabled="!paymentReady[order.payment_provider]" @click="payOrder(order)">{{ paymentReady[order.payment_provider] ? '去支付' : '待配置' }}</button>
        </div>
      </div>
    </section>

    <section class="ledger-section credits-help">
      <div class="section-head"><h2>积分说明</h2></div>
      <div class="help-grid">
        <div class="help-item"><strong>如何获得积分</strong><p>充值 1 元 = 10 积分；新用户注册即送初始积分。</p></div>
        <div class="help-item"><strong>积分怎么扣</strong><p>文本、图片、视频生成按当前价格规则扣减；任务失败会自动退还消耗积分。</p></div>
        <div class="help-item"><strong>冻结积分是什么</strong><p>任务执行期间会预先冻结对应积分，任务完成后正式扣减，失败或取消时原路退回。</p></div>
        <div class="help-item"><strong>充值未到账</strong><p>若支付成功但积分未到账，请保留订单号并联系运营人员处理。</p></div>
      </div>
    </section>

    <div v-if="showRecharge" class="modal-backdrop" @click.self="closeRechargeModal">
      <section :class="['recharge-modal', { 'is-paying': activePayment }]" role="dialog" aria-modal="true" aria-labelledby="recharge-title">
        <button class="modal-close" type="button" aria-label="关闭" @click="closeRechargeModal">
          <X :size="18" :stroke-width="2" />
        </button>
        <template v-if="activePayment">
          <h2 id="recharge-title">{{ providerLabel(activePayment.order.payment_provider) }}扫码支付</h2>
          <p>订单 {{ activePayment.order.order_no }}</p>
          <div v-if="activePayment.cashierUrl" class="cashier-shell">
            <div v-if="paymentLoading" class="qr-placeholder">
              <Loader2 class="animate-spin" :size="24" :stroke-width="1.8" />
            </div>
            <iframe v-else class="alipay-cashier" :src="activePayment.cashierUrl" title="支付宝收银台" scrolling="no"></iframe>
          </div>
          <div v-else class="qr-shell">
            <div v-if="paymentLoading" class="qr-placeholder">
              <Loader2 class="animate-spin" :size="24" :stroke-width="1.8" />
            </div>
            <img v-else class="payment-qr" :src="activePayment.qrDataUrl" alt="支付二维码" />
          </div>
          <div class="payment-summary">
            <span>支付金额</span><strong>¥{{ amountYuan(activePayment.order) }}</strong>
            <span>到账积分</span><strong>{{ activePayment.order.credits }}</strong>
          </div>
          <p v-if="rechargeMessage" class="recharge-message">{{ rechargeMessage }}</p>
          <div class="payment-actions">
            <button class="btn" type="button" @click="resetPaymentView">重新选择</button>
            <button class="btn btn-primary" type="button" :disabled="checkingPayment" @click="checkActiveOrder">
              <RefreshCw :class="{ 'animate-spin': checkingPayment }" :size="15" :stroke-width="1.9" />
              {{ checkingPayment ? '检查中' : '我已支付' }}
            </button>
          </div>
        </template>
        <template v-else>
          <h2 id="recharge-title">充值积分</h2><p>1 元 = 10 积分，积分永久有效。</p>
          <div class="recharge-options">
            <button v-for="item in packages" :key="item.price" type="button" :class="['recharge-option', { selected: selected?.price === item.price }]" @click="selected = item; customAmount = item.price">
              <strong>{{ item.price }} 元</strong><span>{{ item.credits }} 积分</span>
            </button>
          </div>
          <div class="custom-recharge"><label>自定义金额<input v-model.number="customAmount" class="input" type="number" min="0.1" step="0.1" placeholder="输入金额" /></label><span>到账 {{ previewCredits(customAmount) }} 积分</span></div>
          <div v-if="availablePaymentProviders.length" class="payment-providers">
            <button v-for="provider in availablePaymentProviders" :key="provider.value" type="button" :class="{ selected: paymentProvider === provider.value }" @click="paymentProvider = provider.value">
              <span>{{ provider.label }}</span><small>可用</small>
            </button>
          </div>
          <p v-else-if="!rechargeMessage" class="recharge-message">暂无可用支付渠道，请联系管理员。</p>
          <p v-if="rechargeMessage" class="recharge-message">{{ rechargeMessage }}</p>
          <button class="btn btn-primary recharge-submit" type="button" :disabled="recharging || !availablePaymentProviders.length || !paymentReady[paymentProvider]" @click="createRecharge">
            <Loader2 v-if="recharging" class="animate-spin" :size="15" :stroke-width="1.9" />
            {{ recharging ? '处理中…' : paymentReady[paymentProvider] ? '去支付' : '支付渠道待配置' }}
          </button>
        </template>
      </section>
    </div>
  </main>
</template>

<script setup>
import { ArrowLeft, Loader2, Plus, RefreshCw, X } from 'lucide-vue-next'
import QRCode from 'qrcode'
import { toast } from 'vue-sonner'
import { api, creditAPI, rechargeAPI } from '~/composables/useApi'
const { user } = useAuth()
const accounts = ref([])
const orders = ref([])
const ledger = ref([])
const loading = ref(true)
// 积分流水分页:默认 50 条/页,后端同样限制,避免流水过大拖垮页面
const ledgerPage = ref(1)
const ledgerPageSize = 50
const ledgerTotal = ref(0)
const ledgerPages = computed(() => Math.max(1, Math.ceil(ledgerTotal.value / ledgerPageSize)))
const showRecharge = ref(false)
const customAmount = ref(10)
const selected = ref(null)
const paymentProvider = ref('alipay')
const paymentReady = ref({ wechat: false, alipay: false })
const recharging = ref(false)
const paymentStatusLoading = ref(false)
const paymentLoading = ref(false)
const checkingPayment = ref(false)
const activePayment = ref(null)
const rechargeMessage = ref('')
const packages = [{ price: 10, credits: 100 }, { price: 50, credits: 500 }, { price: 100, credits: 1000 }, { price: 500, credits: 5000 }]
const paymentProviderOptions = [{ value: 'alipay', label: '支付宝' }, { value: 'wechat', label: '微信支付' }]
const totalBalance = computed(() => accounts.value.reduce((sum, item) => sum + Number(item.balance || 0), 0))
const totalFrozen = computed(() => accounts.value.reduce((sum, item) => sum + Number(item.frozen || 0), 0))
const availablePaymentProviders = computed(() => paymentProviderOptions.filter(provider => paymentReady.value[provider.value]))
let paymentPollTimer = null

function ledgerLabel(type) { return ({ welcome: '注册赠送', recharge: '充值到账', recharge_refund: '充值退款', consume: 'AI 生成消费', refund: '生成失败退款', freeze: '积分冻结', admin_adjust: '后台调账' })[type] || '积分变动' }
function formatDate(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-' }
function providerLabel(provider) { return provider === 'wechat' ? '微信' : '支付宝' }
function amountYuan(order) { return (Number(order?.amount_fen || 0) / 100).toFixed(2) }
function previewCredits(amount) { return Math.max(0, Math.floor(Math.round(Number(amount || 0) * 100) / 10)) }
function applyPaymentReady(payments, { preferAvailable = true } = {}) {
  paymentReady.value = {
    wechat: !!payments?.wechat,
    alipay: !!payments?.alipay,
  }
  if (preferAvailable && !paymentReady.value[paymentProvider.value]) {
    if (paymentReady.value.alipay) paymentProvider.value = 'alipay'
    else if (paymentReady.value.wechat) paymentProvider.value = 'wechat'
  }
  return paymentReady.value
}

async function refreshPaymentReady(options) {
  const readiness = await api.get(`/health/ready?t=${Date.now()}`)
  return applyPaymentReady(readiness?.payments, options)
}

function updateOrder(latest) {
  const index = orders.value.findIndex(item => item.order_no === latest.order_no)
  if (index >= 0) {
    orders.value[index] = { ...orders.value[index], ...latest }
    return orders.value[index]
  }
  orders.value = [latest, ...orders.value]
  return latest
}

function stopPaymentPolling() {
  if (!paymentPollTimer) return
  clearTimeout(paymentPollTimer)
  paymentPollTimer = null
}

function resetPaymentView() {
  stopPaymentPolling()
  activePayment.value = null
  paymentLoading.value = false
  checkingPayment.value = false
  rechargeMessage.value = ''
}

function closeRechargeModal() {
  showRecharge.value = false
  resetPaymentView()
}

async function openRechargeModal() {
  rechargeMessage.value = ''
  paymentStatusLoading.value = true
  try {
    await refreshPaymentReady()
  } catch (e) {
    rechargeMessage.value = e.message || '支付渠道状态加载失败'
  } finally {
    showRecharge.value = true
    paymentStatusLoading.value = false
  }
}

async function refreshOrder(orderNo, { quiet = false } = {}) {
  const latest = await rechargeAPI.get(orderNo)
  const order = updateOrder(latest)
  if (activePayment.value?.order?.order_no === orderNo) {
    activePayment.value = { ...activePayment.value, order }
  }
  if (latest.status === 'paid') {
    const message = `充值到账 ${latest.credits} 积分`
    stopPaymentPolling()
    await reloadCreditsPage()
    showRecharge.value = false
    resetPaymentView()
    toast.success(message)
  } else if (latest.status !== 'pending') {
    stopPaymentPolling()
    rechargeMessage.value = `订单状态：${latest.status}`
  } else if (!quiet) {
    rechargeMessage.value = '还没有收到支付成功通知，请稍后再试。'
  }
  return latest
}

function startPaymentPolling(orderNo) {
  stopPaymentPolling()
  const tick = async (remaining = 120) => {
    if (!activePayment.value || activePayment.value.order.order_no !== orderNo) return
    try {
      const latest = await refreshOrder(orderNo, { quiet: true })
      if (latest.status !== 'pending' || remaining <= 0) return
    } catch {
      if (remaining <= 0) return
    }
    paymentPollTimer = setTimeout(() => tick(remaining - 1), 3000)
  }
  paymentPollTimer = setTimeout(() => tick(), 2500)
}

async function createRecharge() {
  if (!customAmount.value || customAmount.value < 0.1) { rechargeMessage.value = '请输入至少 0.1 元'; return }
  recharging.value = true; rechargeMessage.value = ''
  try {
    const provider = paymentProvider.value
    const ready = await refreshPaymentReady({ preferAvailable: false })
    if (!ready[provider]) {
      rechargeMessage.value = '该支付渠道已关闭，请选择其他支付方式。'
      return
    }
    const order = await rechargeAPI.create(customAmount.value, provider)
    updateOrder(order)
    await payOrder(order)
  } catch (e) { rechargeMessage.value = e.message || '订单创建失败' } finally { recharging.value = false }
}
async function payOrder(order) {
  const ready = await refreshPaymentReady({ preferAvailable: false }).catch(() => paymentReady.value)
  if (!ready[order.payment_provider]) {
    rechargeMessage.value = '该支付渠道配置未完成，请联系管理员。'
    return
  }
  showRecharge.value = true
  paymentLoading.value = true
  activePayment.value = { order, qrDataUrl: '' }
  rechargeMessage.value = ''
  stopPaymentPolling()
  try {
    const result = await rechargeAPI.pay(order.order_no)
    if (!result.configured) {
      activePayment.value = null
      rechargeMessage.value = result.message || '支付商户参数待配置'
      return
    }
    const paymentUrl = result.payload?.payment_url
    if (order.payment_provider === 'alipay' && paymentUrl) {
      activePayment.value = { order, cashierUrl: String(paymentUrl) }
      rechargeMessage.value = '请使用支付宝扫描收银台二维码完成支付。'
      startPaymentPolling(order.order_no)
      return
    }
    const qrText = result.payload?.qr_code || paymentUrl
    if (!qrText) {
      activePayment.value = null
      rechargeMessage.value = '支付二维码生成失败，请稍后重试。'
      return
    }
    const qrDataUrl = await QRCode.toDataURL(String(qrText), {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
      color: { dark: '#111827', light: '#ffffff' },
    })
    activePayment.value = { order, qrDataUrl, qrText }
    rechargeMessage.value = `请使用${providerLabel(order.payment_provider)}扫码完成支付。`
    startPaymentPolling(order.order_no)
  } catch (e) {
    activePayment.value = null
    rechargeMessage.value = e.message || '支付请求失败'
  } finally {
    paymentLoading.value = false
  }
}
async function checkActiveOrder() {
  if (!activePayment.value?.order?.order_no) return
  checkingPayment.value = true
  try {
    await refreshOrder(activePayment.value.order.order_no)
  } catch (e) {
    rechargeMessage.value = e.message || '订单状态查询失败'
  } finally {
    checkingPayment.value = false
  }
}
async function loadLedger() {
  const data = await creditAPI.ledger({ page: ledgerPage.value, pageSize: ledgerPageSize }) || {}
  ledger.value = data.list || []
  ledgerTotal.value = data.total || 0
}
async function gotoLedgerPage(p) {
  if (p < 1 || p > ledgerPages.value || p === ledgerPage.value) return
  ledgerPage.value = p
  try { await loadLedger() } catch { /* 保持当前页数据 */ }
}
async function reloadCredits() {
  accounts.value = await creditAPI.list() || []
  await loadLedger()
}
async function reloadCreditsPage() {
  await reloadCredits()
  orders.value = await rechargeAPI.list() || []
  await refreshPaymentReady().catch(() => paymentReady.value)
}
onMounted(async () => {
  if (!user.value) { await navigateTo('/login'); return }
  try {
    await reloadCreditsPage()
  } finally { loading.value = false }
})
onBeforeUnmount(stopPaymentPolling)
</script>

<style scoped>
.credits-page { width: min(var(--page-fixed-width), 100%); margin: 0 auto; padding: 36px var(--page-gutter) 64px; color: var(--text-0); }
.credits-head { display: flex; justify-content: space-between; align-items: end; gap: 24px; margin-bottom: 16px; }
.back-link { min-height: 32px; display:inline-flex; align-items:center; gap:6px; border: 0; padding: 0 10px; border-radius: var(--radius-pill); background: transparent; color: var(--text-2); cursor: pointer; font: 650 12px/1 var(--font-body); }
.back-link:hover { background: var(--bg-hover); color: var(--text-0); }
.back-link:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }
h1 { margin: 22px 0 0; font-size: 26px; }
.balance-grid { display: grid; grid-template-columns: 1.25fr .75fr; gap: 12px; }
.balance-card { min-height: 132px; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-raised); display: flex; flex-direction: column; justify-content: space-between; box-shadow: var(--shadow-card); }
.balance-main { border-color: color-mix(in srgb, var(--accent) 42%, var(--border)); background: color-mix(in srgb, var(--accent) 6%, var(--surface)); }
.balance-label, .balance-hint { color: var(--text-3); font-size: 12px; } .balance-card strong { font-size: 32px; font-variant-numeric: tabular-nums; }
.ledger-section { margin-top: 14px; padding:18px; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface-raised); box-shadow:var(--shadow-card); }
.section-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; } .section-head h2 { margin:0; font-size:16px; } .section-head span { color:var(--text-3); font-size:12px; }
/* 流水列表限高,滚动条收在区块内部,页面本体不拉长 */
.is-flow .ledger-list { max-height: 560px; overflow-y: auto; }
.ledger-list { border:1px solid var(--border); border-radius:8px; overflow:hidden; background:var(--surface-raised); } .ledger-row { display:grid; grid-template-columns:1fr auto 170px; gap:20px; align-items:center; padding:15px 18px; border-bottom:1px solid var(--border); } .ledger-row:last-child { border-bottom:0; } .ledger-row div { display:grid; gap:4px; } .ledger-row span, .ledger-row time { color:var(--text-3); font-size:12px; } .ledger-row b { font-variant-numeric: tabular-nums; } .is-add { color:#16803c; } .is-use { color:#c43232; } .ledger-empty { padding:50px; border:1px dashed var(--border); border-radius:8px; text-align:center; color:var(--text-3); font-size:13px; }
.ledger-pager { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 12px; }
.ledger-pager span { color: var(--text-3); font-size: 12px; }
.ledger-pager button { min-height: 30px; padding: 0 14px; border: 1px solid var(--border); border-radius: var(--radius-pill); background: transparent; color: var(--text-1); font: 600 12px/1 var(--font-body); cursor: pointer; }
.ledger-pager button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, var(--surface)); }
.ledger-pager button:disabled { opacity: 0.4; cursor: not-allowed; }
.modal-backdrop { position:fixed; inset:0; z-index:20; display:grid; place-items:center; padding:20px; background:rgba(16,24,40,.42); } .recharge-modal { position:relative; width:min(100%,460px); padding:28px; border-radius:var(--radius); background:var(--surface-raised); box-shadow:var(--shadow-xl); } .modal-close { position:absolute; top:12px; right:12px; width:34px; height:34px; display:grid; place-items:center; border:0; border-radius:var(--radius-pill); background:transparent; color:var(--text-2); cursor:pointer; } .modal-close:hover { background:var(--bg-hover); color:var(--text-0); } .modal-close:focus-visible { outline:none; box-shadow:0 0 0 3.5px var(--button-focus); } .recharge-modal h2 { margin:0 0 7px; font-size:20px; } .recharge-modal p { margin:0 0 20px; color:var(--text-3); font-size:12px; } .recharge-options { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; } .recharge-option { display:grid; gap:5px; padding:14px; text-align:left; border:1px solid var(--border); border-radius:7px; background:transparent; cursor:pointer; } .recharge-option:hover, .recharge-option.selected { border-color:var(--accent); background:color-mix(in srgb, var(--accent) 7%, var(--surface)); } .recharge-option span { color:var(--text-3); font-size:12px; } .custom-recharge { display:flex; align-items:end; justify-content:space-between; gap:12px; margin-top:16px; color:var(--text-2); font-size:12px; } .custom-recharge label { display:grid; gap:6px; flex:1; } .payment-providers { display:flex; gap:8px; margin-top:14px; } .payment-providers button { flex:1; min-height:38px; border:1px solid var(--border); border-radius:7px; background:transparent; color:var(--text-1); cursor:pointer; } .payment-providers button.selected { border-color:var(--accent); color:var(--accent); background:color-mix(in srgb, var(--accent) 7%, var(--surface)); } .recharge-message { margin:12px 0 0 !important; color:var(--accent) !important; } .recharge-submit { width:100%; justify-content:center; margin-top:22px; }
.credits-help { margin-top: 14px; }
.help-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.help-item { display: grid; gap: 6px; }
.help-item strong { font-size: 13px; color: var(--text-0); }
.help-item p { margin: 0; font-size: 12px; line-height: 1.6; color: var(--text-2); }
@media (max-width:700px) {
  .credits-page { padding: 24px var(--page-gutter-sm) 40px; }
  .credits-head { align-items:stretch; flex-direction:column; }
  .credits-head .btn { width:100%; }
  .balance-grid { grid-template-columns:1fr; }
  .is-flow .ledger-list { max-height: 420px; }
  .ledger-row { grid-template-columns:1fr auto; gap:8px; }
  .ledger-row time { grid-column:1 / -1; }
  .help-grid { grid-template-columns: 1fr; }
}
</style>

<style scoped>
.is-orders .ledger-row { grid-template-columns: minmax(0, 1fr) auto 170px auto; }
.order-pay {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--accent);
  font: 650 12px/1 var(--font-body);
  cursor: pointer;
}
.order-pay:hover:not(:disabled) { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--surface)); }
.order-pay:disabled { opacity: .45; cursor: not-allowed; }
.payment-providers button { min-height: 46px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; }
.payment-providers button span { font-size: 13px; }
.payment-providers button small { color: var(--text-3); font-size: 11px; }
.payment-providers button.selected small { color: var(--accent); }
.recharge-modal.is-paying {
  width: min(100%, 376px);
  max-height: calc(100dvh - 40px);
  padding: 22px;
  overflow-y: auto;
  text-align: center;
}
.cashier-shell {
  width: min(300px, 100%);
  height: min(300px, calc(100vw - 76px));
  display: grid;
  place-items: center;
  margin: 4px auto 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
  overflow: hidden;
}
.alipay-cashier {
  width: 240px;
  height: 240px;
  border: 0;
  background: #fff;
  overflow: hidden;
}
.qr-shell {
  width: 276px;
  height: 276px;
  display: grid;
  place-items: center;
  margin: 6px auto 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
}
.qr-placeholder { color: var(--text-3); }
.payment-qr { width: 240px; height: 240px; display: block; }
.payment-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-1);
  text-align: left;
}
.payment-summary span { color: var(--text-3); font-size: 12px; }
.payment-summary strong { font-size: 18px; font-variant-numeric: tabular-nums; }
.payment-actions { display: flex; gap: 10px; margin-top: 12px; }
.payment-actions .btn { flex: 1; justify-content: center; }
@media (max-width:700px) {
  .is-orders .ledger-row { grid-template-columns: 1fr auto; }
  .is-orders .ledger-row time, .is-orders .ledger-row .order-pay { grid-column: 1 / -1; }
  .order-pay { justify-self: start; }
  .payment-actions { flex-direction: column; }
}
</style>
