<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">生活部咨询与物品申报</h2>
        <p class="page-desc">咨询是文件驱动的即时问答，直接引用规章原文作答；申报是独立单据流，审核通过后生成入楼凭证。</p>
      </div>
    </div>

    <section class="panel tabs-panel">
      <el-tabs v-model="tab">
        <el-tab-pane label="违禁品咨询" name="ask">
          <div class="ask-layout">
            <div class="chat">
              <div class="chat-body">
                <div v-if="!history.length" class="chat-empty">
                  <div class="ce-title">问一句，系统会引用规章原文作答</div>
                  <div class="ce-examples">
                    <button v-for="q in examples" :key="q" class="ex" @click="question = q; ask()">{{ q }}</button>
                  </div>
                </div>
                <div v-for="(h, i) in history" :key="i" class="msg">
                  <div class="q"><span class="who">我</span>{{ h.question }}</div>
                  <div class="a">
                    <span class="who ai">规章</span>
                    <div class="a-body">
                      <p>{{ h.answer }}</p>
                      <div v-if="h.matched_clause && h.matched_clause !== '未命中'" class="clause">条款 {{ h.matched_clause }} · 文件原文引用</div>
                      <div v-else class="clause esc">未命中文件，已转生活部人工问询（1 个工作日内答复）</div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="chat-input">
                <el-input v-model="question" placeholder="如：电煮锅能不能带？" @keyup.enter="ask" />
                <el-button type="primary" :loading="asking" @click="ask">发送</el-button>
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
import { onMounted, reactive, ref } from 'vue'
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
const dialog = reactive({ visible: false, item_name: '', quantity: 1, power: '', location: '' })

const examples = ['电煮锅能不能带？', '可以养仓鼠吗？', '吹风机需要申报吗？', '宿舍能用电磁炉做饭吗？']

async function ask() {
  const q = question.value.trim()
  if (!q) return
  asking.value = true
  try {
    const res = await api.post('/consultations', { question: q })
    history.value.unshift({ question: q, answer: res.answer, matched_clause: res.matched?.clause_no || '未命中' })
    question.value = ''
    await loadHistory()
  } finally {
    asking.value = false
  }
}

async function loadHistory() {
  const rows = await api.get('/consultations')
  rules.value = rules.value.length ? rules.value : await fetchRules()
  if (!history.value.length) {
    history.value = rows.slice(0, 5).map((r) => ({ question: r.question, answer: r.answer, matched_clause: r.matched_clause }))
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
  await Promise.all([loadHistory(), loadDeclarations()])
})
</script>

<style scoped>
.tabs-panel { padding: 6px 16px 16px; }
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
.a-body { background: #f2f7ff; border: 1px solid #dbe8fb; border-radius: 8px; padding: 10px 12px; flex: 1; }
.a-body p { margin: 0; font-size: 12.5px; line-height: 1.9; color: var(--ink-2); }
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
