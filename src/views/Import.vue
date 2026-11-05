<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">导入与校验</h2>
        <p class="page-desc">原始名单进来 → 12 条规则校验 → 行内修复 → 事务入库。阻断级错误清零前不可提交正式台账。</p>
      </div>
      <div class="steps">
        <span v-for="(s, i) in ['上传文件', '校验结果', '提交入库']" :key="s" class="step" :class="{ on: step === i, done: step > i }">
          <i>{{ i + 1 }}</i>{{ s }}
        </span>
      </div>
    </div>

    <section v-if="step === 0" class="panel upload-panel">
      <el-upload
        drag
        :auto-upload="false"
        :show-file-list="false"
        accept=".csv,.xlsx,.xls"
        :on-change="handleFile"
      >
        <div class="up-inner">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" stroke="#2456a6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke="#2456a6" stroke-width="1.6" stroke-linecap="round"/></svg>
          <p class="up-title">将学生名单拖到这里，或点击选择文件</p>
          <p class="up-sub">支持 .csv / .xlsx，单文件 ≤ 10 MB；系统会自动按表头匹配标准字段</p>
        </div>
      </el-upload>

      <div class="up-tips">
        <div class="tip-item">
          <strong>1. 下载模板</strong>
          <span>含必填列标注与示例行</span>
          <el-button link type="primary" @click="downloadTemplate">下载《学生名单导入模板》</el-button>
        </div>
        <div class="tip-item">
          <strong>2. 字段映射</strong>
          <span>表头需包含：学号、姓名、性别、区队、年级、手机号、楼栋、房间号、床位号</span>
        </div>
        <div class="tip-item">
          <strong>3. 校验规则</strong>
          <span>12 条规则（R01-R12），阻断级 E 必须清零，警告级 W 可忽略并备注</span>
        </div>
      </div>

      <div v-if="batches.length" class="batch-block">
        <div class="batch-title">历史导入批次</div>
        <el-table :data="batches" size="small">
          <el-table-column prop="batch_no" label="批次号" width="180" />
          <el-table-column prop="rows" label="行数" width="70" />
          <el-table-column prop="status" label="状态" width="90" />
          <el-table-column prop="operator" label="操作人" />
          <el-table-column label="时间" width="150">
            <template #default="{ row }">{{ fmt(row.created_at) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </section>

    <template v-else-if="step === 1">
      <div class="stat-row">
        <div class="stat-card"><div><div class="stat-label">总行数</div><div class="stat-value">{{ result.total }}</div></div></div>
        <div class="stat-card"><div><div class="stat-label">通过行</div><div class="stat-value" style="color:#2e8b57">{{ result.passRows }}</div></div></div>
        <div class="stat-card"><div><div class="stat-label">错误行</div><div class="stat-value" style="color:#c0392b">{{ result.errorRows }}</div></div></div>
        <div class="stat-card"><div><div class="stat-label">警告行</div><div class="stat-value" style="color:#d98416">{{ result.warnRows }}</div></div></div>
        <div class="stat-card"><div><div class="stat-label">阻断级错误</div><div class="stat-value">{{ result.blocking }}<small>条</small></div></div></div>
      </div>

      <section class="panel result-panel">
        <div class="res-head">
          <div class="res-title">
            <strong>校验明细</strong>
            <span class="file-name">{{ fileName }}</span>
          </div>
          <div class="res-actions">
            <el-select v-model="filter" size="small" style="width: 120px">
              <el-option label="全部问题" value="all" />
              <el-option label="仅阻断级" value="E" />
              <el-option label="仅警告级" value="W" />
            </el-select>
            <el-button size="small" plain @click="reset">重新上传</el-button>
            <el-button size="small" type="primary" :disabled="result.blocking > 0" @click="commit">
              提交入库{{ result.blocking > 0 ? `（仍有 ${result.blocking} 条阻断错误）` : '' }}
            </el-button>
          </div>
        </div>

        <el-table :data="visibleRows" size="small" max-height="460" row-key="rowNo">
          <el-table-column prop="rowNo" label="行号" width="64" />
          <el-table-column label="学号" width="110"><template #default="{ row }">{{ row.data['学号'] }}</template></el-table-column>
          <el-table-column label="姓名" width="90"><template #default="{ row }">{{ row.data['姓名'] }}</template></el-table-column>
          <el-table-column label="性别" width="70"><template #default="{ row }">{{ row.data['性别'] }}</template></el-table-column>
          <el-table-column label="区队" width="120"><template #default="{ row }">{{ row.data['区队'] }}</template></el-table-column>
          <el-table-column label="床位" width="130">
            <template #default="{ row }">{{ row.data['楼栋'] || '-' }}-{{ row.data['房间号'] || '-' }}-{{ row.data['床位号'] || '-' }}</template>
          </el-table-column>
          <el-table-column label="校验结果" min-width="300">
            <template #default="{ row }">
              <div v-if="!row.errors.length" class="ok-line">通过</div>
              <div v-for="e in row.errors" :key="e.ruleId + e.field" class="err-line">
                <el-tag size="small" :type="e.level === 'E' ? 'danger' : 'warning'" effect="plain">{{ e.ruleId }}</el-tag>
                <span class="err-msg">{{ e.message }}</span>
                <el-button v-if="e.suggestion" link type="primary" size="small" @click="applySuggestion(row, e)">采纳建议</el-button>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="88" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openFix(row)">修复</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </template>

    <section v-else class="panel done-panel">
      <div class="done-ico">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.2" stroke="#2e8b57" stroke-width="1.6"/><path d="M7.8 12.4l2.8 2.8 5.6-6" stroke="#2e8b57" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h3>导入完成</h3>
      <p class="done-desc">{{ commitResult }}</p>
      <div class="done-actions">
        <el-button @click="reset">继续导入</el-button>
        <el-button type="primary" @click="$router.push('/beds')">前往床位台账</el-button>
      </div>
    </section>

    <el-dialog v-model="fixDialog.visible" :title="`修复第 ${fixDialog.rowNo} 行`" width="520px">
      <el-form label-width="76px" label-position="left">
        <el-form-item v-for="f in fields" :key="f" :label="f">
          <el-input v-model="fixDialog.data[f]" size="default" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fixDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveFix">保存并重新校验</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import * as XLSX from 'xlsx'
import api from '../api'

const step = ref(0)
const fileName = ref('')
const result = reactive({ total: 0, passRows: 0, errorRows: 0, warnRows: 0, blocking: 0, rows: [] })
const filter = ref('all')
const batches = ref([])
const commitResult = ref('')
const fixDialog = reactive({ visible: false, rowNo: 0, index: -1, data: {} })
const fields = ['学号', '姓名', '性别', '区队', '年级', '手机号', '楼栋', '房间号', '床位号']

const visibleRows = computed(() => {
  if (filter.value === 'all') return result.rows
  return result.rows.filter((r) => r.errors.some((e) => e.level === filter.value))
})

function fmt(t) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

async function downloadTemplate() {
  const res = await fetch('/api/import/template', { headers: { Authorization: `Bearer ${localStorage.getItem('dorm_token')}` } })
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = '学生名单导入模板.csv'
  a.click()
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  const headers = lines[0].split(',').map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()) || []
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']))
  })
}

async function handleFile(uploadFile) {
  const file = uploadFile.raw
  if (!file) return
  fileName.value = file.name
  let rows = []
  if (file.name.toLowerCase().endsWith('.csv')) {
    rows = parseCsv(await file.text())
  } else {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
  }
  if (!rows.length) return ElMessage.warning('文件没有数据行')
  await validate(rows)
}

async function validate(rows) {
  const data = await api.post('/import/validate', { rows })
  Object.assign(result, data)
  step.value = 1
}

function applySuggestion(row, err) {
  const map = { R04: '性别', R01: '学号', R10: '床位号' }
  const field = map[err.ruleId]
  if (!field) return ElMessage.info('该规则需人工核对，请点击「修复」')
  row.data[field] = err.suggestion
  revalidate()
}

let timer = null
function revalidate() {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    await validate(result.rows.map((r) => r.data))
  }, 200)
}

function openFix(row) {
  fixDialog.rowNo = row.rowNo
  fixDialog.index = result.rows.findIndex((r) => r.rowNo === row.rowNo)
  fixDialog.data = { ...row.data }
  fixDialog.visible = true
}

async function saveFix() {
  result.rows[fixDialog.index].data = { ...fixDialog.data }
  fixDialog.visible = false
  await validate(result.rows.map((r) => r.data))
  ElMessage.success('已重新校验')
}

async function commit() {
  const okRows = result.rows.filter((r) => !r.errors.some((e) => e.level === 'E'))
  const res = await api.post('/import/commit', { rows: okRows, fileName: fileName.value })
  commitResult.value = res.message
  step.value = 2
  loadBatches()
}

function reset() {
  step.value = 0
  result.rows = []
  Object.assign(result, { total: 0, passRows: 0, errorRows: 0, warnRows: 0, blocking: 0 })
}

async function loadBatches() {
  batches.value = await api.get('/import/batches')
}

onMounted(loadBatches)
</script>

<style scoped>
.steps { display: flex; gap: 6px; }
.step { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #9aa8bd; background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 5px 12px 5px 6px; }
.step i { width: 18px; height: 18px; border-radius: 50%; background: #eef2f8; color: #94a2b8; display: grid; place-items: center; font-style: normal; font-size: 11px; }
.step.on { color: #2456a6; border-color: #b3c4e2; background: #eaf1fb; }
.step.on i { background: #2456a6; color: #fff; }
.step.done i { background: #e5f6ee; color: #2e8b57; }
.upload-panel { padding: 20px; }
.up-inner { padding: 18px 0 10px; }
.up-title { font-size: 14px; margin: 10px 0 6px; color: var(--ink); }
.up-sub { font-size: 12px; color: var(--ink-3); margin: 0; }
.up-tips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
.tip-item { background: #f8fafd; border: 1px solid #edf1f8; border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 5px; }
.tip-item strong { font-size: 12.5px; }
.tip-item span { font-size: 11.5px; color: var(--ink-3); line-height: 1.6; }
.batch-block { margin-top: 22px; border-top: 1px dashed var(--line); padding-top: 16px; }
.batch-title { font-size: 13px; font-weight: 500; margin-bottom: 10px; }
.result-panel { padding: 14px 16px 18px; }
.res-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.res-title { display: flex; align-items: baseline; gap: 10px; }
.res-title strong { font-size: 14px; }
.file-name { font-size: 11.5px; color: var(--ink-3); }
.res-actions { display: flex; gap: 8px; align-items: center; }
.ok-line { font-size: 12px; color: #2e8b57; }
.err-line { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
.err-msg { font-size: 12px; color: var(--ink-2); }
.done-panel { padding: 44px 20px; text-align: center; }
.done-ico { display: flex; justify-content: center; margin-bottom: 12px; }
.done-panel h3 { margin: 0 0 8px; font-size: 17px; }
.done-desc { font-size: 13px; color: var(--ink-2); margin: 0 0 18px; }
.done-actions { display: flex; justify-content: center; gap: 10px; }
</style>
