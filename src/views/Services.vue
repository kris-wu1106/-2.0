<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">生活部咨询与物品申报</h2>
        <p class="page-desc">咨询由 AI 检索规章库后作答并标注条款出处；申报是独立单据流，审核通过后生成入楼凭证。</p>
      </div>
      <div class="ai-badge" :class="ai.online ? 'on' : 'off'" :title="aiBadgeTip">
        <i class="dot"></i>
        <span v-if="ai.online">AI 在线 · {{ ai.model }}</span>
        <span v-else>本地规章库模式</span>
      </div>
    </div>

    <section class="panel tabs-panel">
      <el-tabs v-model="tab">
        <el-tab-pane label="违禁品咨询" name="ask">
          <div v-if="!ai.online && !ai.loading" class="cfg-tip">
            未检测到 AI 配置，当前使用本地规章关键词匹配（同义词可能漏判）。在服务器 <code>.env</code> 中填写
            <code>AI_API_KEY</code> 后重启服务，即自动切换为智能问答。
          </div>

          <div class="ask-layout">
            <div class="chat">
              <div ref="chatBody" class="chat-body" @scroll="onChatScroll">
                <div v-if="!history.length" class="chat-empty">
                  <div class="ce-title">问一句，AI 会检索规章库后作答并标注条款</div>
                  <div class="ce-examples">
                    <button v-for="q in examples" :key="q" class="ex" @click="question = q; ask()">{{ q }}</button>
                  </div>
                </div>

                <div v-for="h in history" :key="h.key" class="msg">
                  <div class="q"><span class="who">我</span>{{ h.question }}</div>
                  <div class="a">
                    <span class="who ai" :class="{ rule: h.mode === 'rule', fallback: h.degraded }">{{ h.mode === 'rule' ? '规章' : 'AI' }}</span>
                    <div class="a-body" :class="{ bad: h.status === 'error' }">
                      <div v-if="h.status === 'pending'" class="thinking">
                        <i></i><i></i><i></i>
                        <span>正在检索规章并生成回答…</span>
                      </div>

                      <p v-else class="a-text">
                        {{ h.answer }}<span v-if="h.status === 'streaming'" class="caret"></span>
                      </p>

                      <div v-if="h.status === 'error'" class="err-bar">
                        <span class="err-msg">{{ h.error }}</span>
                        <button class="retry" @click="retry(h)">重试</button>
                      </div>

                      <div v-if="h.clauseText" class="clause">依据 {{ h.clauseText }}</div>
                      <div v-else-if="h.escalated && h.status === 'done'" class="clause esc">
                        规章未完全覆盖，已同步转生活部人工确认（1 个工作日内答复）
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="chat-input">
                <el-input
                  v-model="question"
                  placeholder="如：电饭煲能不能带？"
                  :disabled="asking"
                  @keyup.enter="ask"
                />
                <el-button v-if="asking" @click="stop">停止</el-button>
                <el-button v-else type="primary" @click="ask">发送</el-button>
              </div>
            </div>

            <aside class="rules">
              <div class="rules-head">规章文件库</div>
              <div class="rule-item" v-for="r in rules" :key="r.id">
                <div class="ri-title">{{ r.title }}</div>
                <div class="ri-clause">{{ r.clause_no }} · {{ r.category }}</div>
                <div class="ri-content">{{ r.content }}</div>
              </div>
              <p v-if="!rules.length" class="empty-tip">暂无文件</p>
            </aside>
          </div>
        </el-tab-pane>

        <el-tab-pane label="物品申报" name="declare">
          <div class="declare-head">
            <span class="hint">申报须填写物品、数量、功率与拟放位置；审核通过后生成入楼凭证，检查时可出示。</span>
            <el-button v-if="isStudent" type="primary" size="small" @click="openDeclare">新增申报</el-button>
          </div>
          <el-table :data="declarations" size="small">
            <el-table-column label="申报人" width="140">
              <template #default="{ row }">{{ row.student_name }}<span class="sub">{{ row.class_name }}</span></template>
            </el-table-column>
            <el-table-column prop="item_name" label="物品" width="120" />
            <el-table-column prop="quantity" label="数量" width="70" />
            <el-table-column prop="power" label="功率" width="90" />
            <el-table-column prop="location" label="拟放位置" min-width="150" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status === '已通过' ? 'success' : row.status === '已驳回' ? 'danger' : 'warning'" effect="plain">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="voucher_no" label="入楼凭证" width="120" />
            <el-table-column v-if="!isStudent" label="审核" width="130" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === '待审核'">
                  <el-button link type="primary" size="small" @click="review(row, 'approve')">通过</el-button>
                  <el-button link type="danger" size="small" @click="review(row, 'reject')">驳回</el-button>
                </template>
                <span v-else class="sub">{{ row.reviewer || '-' }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-dialog v-model="dialog.visible" title="新增物品申报" width="500px">
      <el-form label-width="82px" label-position="left">
        <el-form-item label="物品名称" required><el-input v-model="dialog.item_name" placeholder="如：吹风机" /></el-form-item>
        <el-form-item label="数量"><el-input-number v-model="dialog.quantity" :min="1" :max="5" /></el-form-item>
        <el-form-item label="功率"><el-input v-model="dialog.power" placeholder="如：800W" /></el-form-item>
        <el-form-item label="拟放位置"><el-input v-model="dialog.location" placeholder="如：1-204 书桌抽屉" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitDeclare">提交申报</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const role = localStorage.getItem('dorm_role')
const isStudent = role === 'student'
const tab = ref('ask')
const question = ref('')
const asking = ref(false)
const history = ref([])
const rules = ref([])
const declarations = ref([])
const chatBody = ref(null)
const ai = reactive({ online: false, model: '', provider: '', loading: true, configured: false })
const dialog = reactive({ visible: false, item_name: '', quantity: 1, power: '', location: '' })

let streamCtrl = null
let seq = 0

const examples = ['电煮锅能不能带？', '电饭煲能不能带？', '吹风筒需要申报吗？', '可以养仓鼠吗？']

const aiBadgeTip = computed(() =>
  ai.online
    ? `${ai.provider}${ai.model ? ' · ' + ai.model : ''}`
    : '未配置 AI_API_KEY，回答来自本地规章关键词匹配'
)

/** 贴底跟随：用户停留在底部附近（40px 容差）时自动跟随新消息；向上翻阅历史时不打扰 */
const stickToBottom = ref(true)

function onChatScroll() {
  const el = chatBody.value
  if (!el) return
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

function scrollBottom(force = false) {
  if (!force && !stickToBottom.value) return
  nextTick(() => {
    const el = chatBody.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function loadAiStatus() {
  try {
    const st = await api.get('/ai/status')
    ai.configured = !!st.configured
    ai.online = !!st.configured
    ai.model = st.model || ''
    ai.provider = st.provider || ''
  } catch {
    ai.online = false
  } finally {
    ai.loading = false
  }
}

/** 解析单条 SSE 消息（event: xxx / data: {...}） */
function handleEvent(raw, item) {
  let event = 'message'
  let data = ''
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  if (!data) return
  let payload
  try {
    payload = JSON.parse(data)
  } catch {
    return
  }

  if (event === 'meta') {
    item.mode = payload.mode
    ai.online = payload.mode === 'ai'
    if (payload.model) ai.model = payload.model
  } else if (event === 'delta') {
    item.status = 'streaming'
    item.answer += payload.text || ''
    scrollBottom()
  } else if (event === 'done') {
    item.status = 'done'
    item.mode = payload.mode || item.mode
    item.answer = payload.answer || item.answer
    item.matched = payload.matched || null
    item.escalated = !!payload.escalated
    item.clauseText = payload.matched?.citation || ''
    scrollBottom()
  } else if (event === 'error') {
    item.status = 'error'
    item.error = payload.message || 'AI 服务异常'
    item.answer = payload.fallback || ''
    item.matched = payload.matched || null
    item.escalated = !!payload.escalated
    item.clauseText = payload.matched?.citation || ''
    item.degraded = true
    scrollBottom()
  }
}

async function ask() {
  const q = String(question.value || '').trim()
  if (!q || asking.value) return

  const item = reactive({
    key: ++seq,
    question: q,
    answer: '',
    status: 'pending',
    error: '',
    mode: '',
    matched: null,
    clauseText: '',
    escalated: false,
    degraded: false
  })
  history.value.push(item)
  question.value = ''
  asking.value = true
  stickToBottom.value = true
  scrollBottom(true)

  const token = localStorage.getItem('dorm_token')
  const ctrl = new AbortController()
  streamCtrl = ctrl

  try {
    const res = await fetch('/api/consultations/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Dorm-Token': token || ''
      },
      body: JSON.stringify({ question: q }),
      signal: ctrl.signal
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let msg = `请求失败（${res.status}）`
      try { msg = JSON.parse(text).message || msg } catch { /* 非 JSON 忽略 */ }
      throw new Error(msg)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const blocks = buf.split('\n\n')
      buf = blocks.pop() || ''
      for (const block of blocks) if (block.trim()) handleEvent(block, item)
    }
    if (item.status === 'pending' || item.status === 'streaming') item.status = 'done'
  } catch (err) {
    if (err.name === 'AbortError') {
      item.status = item.answer ? 'done' : 'error'
      if (!item.answer) item.error = '已取消本次提问'
    } else {
      item.status = 'error'
      item.error = err.message || '网络异常，请稍后重试'
    }
  } finally {
    asking.value = false
    streamCtrl = null
  }
}

function stop() {
  streamCtrl?.abort()
}

async function retry(item) {
  if (asking.value) return
  history.value = history.value.filter((h) => h.key !== item.key)
  question.value = item.question
  await ask()
}

async function loadHistory() {
  const rows = await api.get('/consultations')
  if (!history.value.length) {
    // 接口按时间倒序返回，反转后最早在上、最新在底，与聊天流方向一致
    history.value = rows.slice(0, 5).reverse().map((r) => ({
      key: ++seq,
      question: r.question,
      answer: r.answer,
      status: 'done',
      error: '',
      mode: r.source === 'ai' ? 'ai' : 'rule',
      matched: null,
      clauseText: r.matched_clause && r.matched_clause !== '未命中' ? r.matched_clause : '',
      escalated: !!r.escalated,
      degraded: r.source === 'fallback'
    }))
  }
}

async function fetchRules() {
  return await api.get('/regulations')
}

async function loadDeclarations() {
  declarations.value = await api.get('/declarations')
}

function openDeclare() {
  Object.assign(dialog, { visible: true, item_name: '', quantity: 1, power: '', location: '' })
}

async function submitDeclare() {
  if (!dialog.item_name.trim()) return ElMessage.warning('请填写物品名称')
  const res = await api.post('/declarations', dialog)
  ElMessage.success(res.message)
  dialog.visible = false
  await loadDeclarations()
}

async function review(row, action) {
  const res = await api.post(`/declarations/${row.id}/review`, { action })
  ElMessage.success(res.message)
  await loadDeclarations()
}

onMounted(async () => {
  rules.value = await fetchRules()
  await Promise.all([loadAiStatus(), loadHistory(), loadDeclarations()])
  scrollBottom(true)
})

onUnmounted(() => streamCtrl?.abort())
</script>

<style scoped>
.tabs-panel { padding: 6px 16px 16px; }

.ai-badge { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; padding: 6px 12px; border-radius: 20px; border: 1px solid var(--line); background: #fff; color: var(--ink-3); }
.ai-badge .dot { width: 7px; height: 7px; border-radius: 50%; background: #b6c2d4; flex: none; }
.ai-badge.on { border-color: #cfe0c8; background: #f5faf3; color: #2e7d4f; }
.ai-badge.on .dot { background: #2e8b57; box-shadow: 0 0 0 3px rgba(46, 139, 87, .15); }

.cfg-tip { font-size: 11.5px; color: #9a6b16; background: #fdf8ec; border: 1px solid #f2e3c2; border-left: 3px solid #c89b3c; border-radius: 4px; padding: 9px 12px; margin: 4px 0 12px; line-height: 1.7; }
.cfg-tip code { background: #f6efdd; padding: 1px 5px; border-radius: 3px; font-size: 11px; }

.ask-layout { display: grid; grid-template-columns: 1fr 320px; gap: 16px; align-items: start; }
.chat { border: 1px solid var(--line); border-radius: 10px; display: flex; flex-direction: column; height: 520px; }
.chat-body { flex: 1; overflow-y: auto; padding: 16px; background: #fbfcfe; }
.chat-empty { padding-top: 40px; text-align: center; }
.ce-title { font-size: 13px; color: var(--ink-2); margin-bottom: 14px; }
.ce-examples { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.ex { border: 1px solid #dbe7f8; background: #fff; color: #2456a6; font-size: 12px; padding: 7px 12px; border-radius: 18px; cursor: pointer; }
.ex:hover { background: #f2f7ff; }

.msg { margin-bottom: 16px; }
.q { display: flex; gap: 8px; font-size: 13px; color: var(--ink); background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 9px 12px; }
.a { display: flex; gap: 8px; margin-top: 9px; }
.who { font-size: 10px; color: #fff; background: #9aa8bd; border-radius: 4px; padding: 2px 6px; height: fit-content; flex: none; }
.who.ai { background: #2456a6; }
.who.ai.rule { background: #7b8aa4; }
.who.ai.fallback { background: #b7791f; }
.a-body { background: #f2f7ff; border: 1px solid #dbe8fb; border-radius: 8px; padding: 10px 12px; flex: 1; min-width: 0; }
.a-body.bad { background: #fdf4f3; border-color: #f0d7d3; }
.a-text { margin: 0; font-size: 12.5px; line-height: 1.9; color: var(--ink-2); white-space: pre-wrap; word-break: break-word; }

/* 加载态：三点跳动 */
.thinking { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #6b7f9c; }
.thinking i { width: 5px; height: 5px; border-radius: 50%; background: #2456a6; opacity: .35; animation: blink 1.2s infinite; }
.thinking i:nth-child(2) { animation-delay: .2s; }
.thinking i:nth-child(3) { animation-delay: .4s; }
.thinking span { margin-left: 6px; }
@keyframes blink { 0%, 80%, 100% { opacity: .2; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }

/* 流式光标 */
.caret { display: inline-block; width: 6px; height: 13px; background: #2456a6; margin-left: 2px; vertical-align: -2px; animation: caret 1s steps(2) infinite; }
@keyframes caret { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }

/* 错误条 */
.err-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e8cfcb; font-size: 11.5px; color: #c0392b; }
.err-msg { flex: 1; }
.retry { border: 1px solid #e3b8b2; background: #fff; color: #c0392b; font-size: 11px; padding: 3px 10px; border-radius: 12px; cursor: pointer; flex: none; }
.retry:hover { background: #fdf0ee; }

.clause { margin-top: 7px; font-size: 10.5px; color: #5b7ba8; }
.clause.esc { color: #b97a10; }

.chat-input { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--line); background: #fff; border-radius: 0 0 10px 10px; }

.rules { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; max-height: 520px; overflow-y: auto; }
.rules-head { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.rule-item { padding: 9px 0; border-bottom: 1px dashed #eef2f8; }
.ri-title { font-size: 12px; color: var(--ink); }
.ri-clause { font-size: 10.5px; color: #5b7ba8; margin: 3px 0 5px; }
.ri-content { font-size: 11px; color: var(--ink-3); line-height: 1.7; }

.declare-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.hint { font-size: 11.5px; color: var(--ink-3); }
.sub { display: block; font-size: 10.5px; color: var(--ink-3); margin-top: 2px; }
.empty-tip { font-size: 11.5px; color: #a7b3c5; }

@media (max-width: 1200px) { .ask-layout { grid-template-columns: 1fr; } }
</style>
