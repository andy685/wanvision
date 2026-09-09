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
      <button class="btn btn-primary" type="button" @click="showRecharge = true">
        <Plus :size="15" :stroke-width="2" />
        充值积分
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

    <section class="ledger-section">
      <div class="section-head"><h2>积分流水</h2><span>{{ ledger.length }} 条记录</span></div>
      <div v-if="loading" class="ledger-empty">正在加载积分明细…</div>
      <div v-else-if="!ledger.length" class="ledger-empty">还没有积分变动记录</div>
      <div v-else class="ledger-list">
        <div v-for="row in ledger" :key="row.id" class="ledger-row">
          <div><strong>{{ ledgerLabel(row.type) }}</strong><span>{{ row.note || '积分变动' }}</span></div>
          <b :class="row.amount >= 0 ? 'is-add' : 'is-use'">{{ row.amount >= 0 ? '+' : '' }}{{ row.amount }}</b>
          <time>{{ formatDate(row.created_at) }}</time>
        </div>
      </div>
    </section>
    <section class="ledger-section recharge-history"><div class="section-head"><h2>充值记录</h2><span>{{ orders.length }} 笔订单</span></div><div v-if="!orders.length" class="ledger-empty">还没有充值记录</div><div v-else class="ledger-list"><div v-for="order in orders" :key="order.id" class="ledger-row"><div><strong>{{ order.payment_provider === 'wechat' ? '微信支付' : '支付宝' }}</strong><span class="mono">{{ order.order_no }}</span></div><b>¥{{ (order.amount_fen / 100).toFixed(2) }} · {{ order.credits }} 积分</b><time>{{ order.status === 'pending' ? '待支付' : order.status }} · {{ formatDate(order.created_at) }}</time><button v-if="order.status === 'pending'" class="order-pay" type="button" :disabled="!paymentReady[order.payment_provider]" @click="payOrder(order)">{{ paymentReady[order.payment_provider] ? '去支付' : '待配置' }}</button></div></div></section>

    <section class="ledger-section credits-help">
      <div class="section-head"><h2>积分说明</h2></div>
      <div class="help-grid">
        <div class="help-item"><strong>如何获得积分</strong><p>充值 1 元 = 10 积分；新用户注册即送初始积分。</p></div>
        <div class="help-item"><strong>积分怎么扣</strong><p>文本、图片、视频生成按当前价格规则扣减；任务失败会自动退还消耗积分。</p></div>
        <div class="help-item"><strong>冻结积分是什么</strong><p>任务执行期间会预先冻结对应积分，任务完成后正式扣减，失败或取消时原路退回。</p></div>
        <div class="help-item"><strong>充值未到账</strong><p>若支付成功但积分未到账，请保留订单号并联系运营人员处理。</p></div>
      </div>
    </section>

    <div v-if="showRecharge" class="modal-backdrop" @click.self="showRecharge = false">
      <section class="recharge-modal" role="dialog" aria-modal="true" aria-labelledby="recharge-title">
        <button class="modal-close" type="button" aria-label="关闭" @click="showRecharge = false">
          <X :size="18" :stroke-width="2" />
        </button>
        <h2 id="recharge-title">充值积分</h2><p>1 元 = 10 积分，积分永久有效。</p>
        <div class="recharge-options">
          <button v-for="item in packages" :key="item.price" type="button" :class="['recharge-option', { selected: selected?.price === item.price }]" @click="selected = item; customAmount = item.price">
            <strong>{{ item.price }} 元</strong><span>{{ item.credits }} 积分</span>
          </button>
        </div>
        <div class="custom-recharge"><label>自定义金额<input v-model.number="customAmount" class="input" type="number" min="1" step="1" placeholder="输入金额" /></label><span>到账 {{ Math.max(0, customAmount || 0) * 10 }} 积分</span></div>
        <div class="payment-providers"><button type="button" :class="{ selected: paymentProvider === 'wechat' }" @click="paymentProvider = 'wechat'"><span>微信支付</span><small>{{ paymentReady.wechat ? '可用' : '待配置' }}</small></button><button type="button" :class="{ selected: paymentProvider === 'alipay' }" @click="paymentProvider = 'alipay'"><span>支付宝</span><small>{{ paymentReady.alipay ? '可用' : '待配置' }}</small></button></div>
        <p v-if="rechargeMessage" class="recharge-message">{{ rechargeMessage }}</p>
        <button class="btn btn-primary recharge-submit" type="button" :disabled="recharging || !paymentReady[paymentProvider]" @click="createRecharge">{{ recharging ? '创建订单中…' : paymentReady[paymentProvider] ? '创建充值订单' : '支付渠道待配置' }}</button>
      </section>
    </div>
  </main>
</template>

<script setup>
import { ArrowLeft, Plus, X } from 'lucide-vue-next'
import { api, creditAPI, rechargeAPI } from '~/composables/useApi'
const { user } = useAuth()
const accounts = ref([])
const orders = ref([])
const ledger = ref([])
const loading = ref(true)
const showRecharge = ref(false)
const customAmount = ref(10)
const selected = ref(null)
const paymentProvider = ref('wechat')
const paymentReady = ref({ wechat: false, alipay: false })
const recharging = ref(false)
const rechargeMessage = ref('')
const packages = [{ price: 10, credits: 100 }, { price: 50, credits: 500 }, { price: 100, credits: 1000 }, { price: 500, credits: 5000 }]
const totalBalance = computed(() => accounts.value.reduce((sum, item) => sum + Number(item.balance || 0), 0))
const totalFrozen = computed(() => accounts.value.reduce((sum, item) => sum + Number(item.frozen || 0), 0))
function ledgerLabel(type) { return ({ welcome: '注册赠送', recharge: '充值到账', consume: 'AI 生成消费', refund: '生成失败退款' })[type] || '积分变动' }
function formatDate(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-' }
async function createRecharge() {
  if (!customAmount.value || customAmount.value < 1) { rechargeMessage.value = '请输入至少 1 元'; return }
  recharging.value = true; rechargeMessage.value = ''
  try {
    const order = await rechargeAPI.create(customAmount.value, paymentProvider.value)
    orders.value = [order, ...orders.value]
    rechargeMessage.value = `订单 ${order.order_no} 已创建，待支付后到账 ${order.credits} 积分。`
  } catch (e) { rechargeMessage.value = e.message || '订单创建失败' } finally { recharging.value = false }
}
async function payOrder(order) {
  const paymentWindow = typeof window !== 'undefined' ? window.open('', '_blank') : null
  try {
    const result = await rechargeAPI.pay(order.order_no)
    rechargeMessage.value = result.configured ? '支付请求已提交，请完成支付。' : result.message || '支付商户参数待配置'
    if (result.configured && result.payload?.payment_url) {
      if (paymentWindow) paymentWindow.location.href = result.payload.payment_url
      else window.open(result.payload.payment_url, '_blank', 'noopener,noreferrer')
    } else paymentWindow?.close()
    for (let i = 0; i < 5 && order.status === 'pending'; i++) { await new Promise(resolve => setTimeout(resolve, 2000)); const latest = await rechargeAPI.get(order.order_no); Object.assign(order, latest); if (latest.status === 'paid') { await reloadCredits(); rechargeMessage.value = `充值到账 ${latest.credits} 积分` } }
  } catch (e) { paymentWindow?.close(); rechargeMessage.value = e.message || '支付请求失败' }
}
async function reloadCredits() { accounts.value = await creditAPI.list() || []; ledger.value = await creditAPI.ledger() || [] }
onMounted(async () => {
  if (!user.value) { await navigateTo('/login'); return }
  try { accounts.value = await creditAPI.list() || []; ledger.value = await creditAPI.ledger() || []; orders.value = await rechargeAPI.list() || []; const readiness = await api.get('/health/ready'); paymentReady.value = readiness?.payments || paymentReady.value } finally { loading.value = false }
})
</script>

<style scoped>
.credits-page { width: min(var(--page-fixed-width), 100%); margin: 0 auto; padding: 36px var(--page-gutter) 64px; color: var(--text-0); overflow-y: auto; }
.credits-head { display: flex; justify-content: space-between; align-items: end; gap: 24px; margin-bottom: 16px; }
.back-link { min-height: 32px; display:inline-flex; align-items:center; gap:6px; border: 0; padding: 0 10px; border-radius: var(--radius-pill); background: transparent; color: var(--text-2); cursor: pointer; font: 650 12px/1 var(--font-body); }
.back-link:hover { background: var(--bg-hover); color: var(--text-0); }
.back-link:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }
h1 { margin: 22px 0 0; font-size: 26px; }
.balance-grid { display: grid; grid-template-columns: 1.25fr .75fr; gap: 12px; }
.balance-card { min-height: 132px; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-raised); display: flex; flex-direction: column; justify-content: space-between; box-shadow: var(--shadow-card); }
.balance-main { border-color: color-mix(in srgb, var(--accent) 42%, var(--border)); background: color-mix(in srgb, var(--accent) 6%, var(--surface)); }
.balance-label, .balance-hint { color: var(--text-3); font-size: 12px; } .balance-card strong { font-size: 32px; font-variant-numeric: tabular-nums; }
.ledger-section { margin-top: 14px; padding:18px; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface-raised); box-shadow:var(--shadow-card); } .section-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; } .section-head h2 { margin:0; font-size:16px; } .section-head span { color:var(--text-3); font-size:12px; }
.ledger-list { border:1px solid var(--border); border-radius:8px; overflow:hidden; background:var(--surface-raised); } .ledger-row { display:grid; grid-template-columns:1fr auto 170px; gap:20px; align-items:center; padding:15px 18px; border-bottom:1px solid var(--border); } .ledger-row:last-child { border-bottom:0; } .ledger-row div { display:grid; gap:4px; } .ledger-row span, .ledger-row time { color:var(--text-3); font-size:12px; } .ledger-row b { font-variant-numeric: tabular-nums; } .is-add { color:#16803c; } .is-use { color:#c43232; } .ledger-empty { padding:50px; border:1px dashed var(--border); border-radius:8px; text-align:center; color:var(--text-3); font-size:13px; }
.modal-backdrop { position:fixed; inset:0; z-index:20; display:grid; place-items:center; padding:20px; background:rgba(16,24,40,.42); } .recharge-modal { position:relative; width:min(100%,460px); padding:28px; border-radius:var(--radius); background:var(--surface-raised); box-shadow:var(--shadow-xl); } .modal-close { position:absolute; top:12px; right:12px; width:34px; height:34px; display:grid; place-items:center; border:0; border-radius:var(--radius-pill); background:transparent; color:var(--text-2); cursor:pointer; } .modal-close:hover { background:var(--bg-hover); color:var(--text-0); } .modal-close:focus-visible { outline:none; box-shadow:0 0 0 3.5px var(--button-focus); } .recharge-modal h2 { margin:0 0 7px; font-size:20px; } .recharge-modal p { margin:0 0 20px; color:var(--text-3); font-size:12px; } .recharge-options { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; } .recharge-option { display:grid; gap:5px; padding:14px; text-align:left; border:1px solid var(--border); border-radius:7px; background:transparent; cursor:pointer; } .recharge-option:hover, .recharge-option.selected { border-color:var(--accent); background:color-mix(in srgb, var(--accent) 7%, var(--surface)); } .recharge-option span { color:var(--text-3); font-size:12px; } .custom-recharge { display:flex; align-items:end; justify-content:space-between; gap:12px; margin-top:16px; color:var(--text-2); font-size:12px; } .custom-recharge label { display:grid; gap:6px; flex:1; } .payment-providers { display:flex; gap:8px; margin-top:14px; } .payment-providers button { flex:1; min-height:38px; border:1px solid var(--border); border-radius:7px; background:transparent; color:var(--text-1); cursor:pointer; } .payment-providers button.selected { border-color:var(--accent); color:var(--accent); background:color-mix(in srgb, var(--accent) 7%, var(--surface)); } .recharge-message { margin:12px 0 0 !important; color:var(--accent) !important; } .recharge-submit { width:100%; justify-content:center; margin-top:22px; }
.credits-help { margin-top: 14px; }
.help-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.help-item { display: grid; gap: 6px; }
.help-item strong { font-size: 13px; color: var(--text-0); }
.help-item p { margin: 0; font-size: 12px; line-height: 1.6; color: var(--text-2); }
@media (max-width:700px) { .credits-page { padding:24px var(--page-gutter-sm) 40px; } .credits-head { align-items:stretch; flex-direction:column; } .credits-head .btn { width:100%; } .balance-grid { grid-template-columns:1fr; } .ledger-row { grid-template-columns:1fr auto; gap:8px; } .ledger-row time { grid-column:1 / -1; } .help-grid { grid-template-columns: 1fr; } }
</style>

<style scoped>
.payment-providers button { min-height: 46px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; }
.payment-providers button span { font-size: 13px; }
.payment-providers button small { color: var(--text-3); font-size: 11px; }
.payment-providers button.selected small { color: var(--accent); }
</style>
