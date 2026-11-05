<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h2>生活部协同</h2>
        <p class="sub">检查任务下发 · 结果回传与批量导入 · 违禁品标准库</p>
      </div>
      <div class="head-actions">
        <el-button plain size="small" @click="downloadTemplate">下载导入模板</el-button>
      </div>
    </header>

    <el-tabs v-model="tab" class="tabs">
      <!-- ===== 检查任务 ===== -->
      <el-tab-pane label="检查任务" name="tasks">
        <div class="task-bar">
          <el-input v-model="task.title" placeholder="任务名称，如：第十一周内务检查" style="width: 240px" />
          <el-select v-model="task.buildingCode" style="width: 130px">
            <el-option label="全部楼栋" value="ALL" />
            <el-option v-for="b in buildings" :key="b.code" :label="b.code" :value="b.code" />
          </el-select>
          <el-select v-model="task.checkType" style="width: 140px">
            <el-option label="内务检查" value="内务检查" />
            <el-option label="违禁品检查" value="违禁品检查" />
            <el-option label="联合检查" value="联合检查" />
          </el-select>
          <el-date-picker v-model="task.deadline" type="date" value-format="YYYY-MM-DD" placeholder="截止日期" style="width: 150px" />
          <el-button type="primary" @click="createTask">下发任务</el-button>
        </div>
        <el-table :data="tasks" size="small" stripe>
          <el-table-column prop="title" label="任务" min-width="180" />
          <el-table-column prop="building_code" label="范围" width="90" />
          <el-table-column prop="check_type" label="类型" width="110" />
          <el-table-column prop="deadline" label="截止" width="110" />
          <el-table-column label="进度" width="130">
            <template #default="{ row }">
              <span>{{ row.record_count }} 条记录</span>
              <el-tag v-if="row.problem_count > 0" type="danger" size="small" style="margin-left:6px">{{ row.problem_count }} 问题</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === '进行中' ? 'primary' : 'info'" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ row }">
              <el-button v-if="row.status === '进行中'" link type="primary" size="small" @click="closeTask(row)">关闭</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- ===== 检查记录 ===== -->
      <el-tab-pane label="检查记录" name="records">
        <div class="rec-bar">
          <el-select v-model="filterTask" placeholder="按任务筛选" clearable style="width: 220px" @change="loadRecords">
            <el-option v-for="t in tasks" :key="t.id" :label="t.title" :value="t.id" />
          </el-select>
          <el-upload :show-file-list="false" accept=".csv,.xlsx,.xls" :auto-upload="false" :on-change="onFile">
            <el-button type="primary" plain size="small">批量导入检查表</el-button>
          </el-upload>
          <span class="rec-tip">评分 &lt; 60 或发现违禁品 → 自动生成整改工单</span>
        </div>

        <div class="summary" v-if="summary.byBuilding?.length">
          <div v-for="b in summary.byBuilding" :key="b.building_code" class="sum-card">
            <div class="sum-code">{{ b.building_code }}</div>
            <div class="sum-score" :class="b.avg_score < 75 ? 'low' : ''">{{ b.avg_score }}</div>
            <div class="sum-sub">{{ b.checks }} 次检查 · {{ b.problems }} 问题</div>
          </div>
        </div>

        <el-table :data="records" size="small" stripe>
          <el-table-column label="房间" width="110">
            <template #default="{ row }">{{ row.building_code }}-{{ row.room_no }}</template>
          </el-table-column>
          <el-table-column prop="check_date" label="日期" width="105" />
          <el-table-column prop="check_type" label="类型" width="105" />
          <el-table-column label="评分" width="80">
            <template #default="{ row }">
              <span :class="row.score < 60 ? 'bad-score' : row.score < 75 ? 'mid-score' : 'ok-score'">{{ row.score }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="issues" label="问题项" min-width="160" show-overflow-tooltip />
          <el-table-column label="违禁品" width="140">
            <template #default="{ row }">
              <el-tag v-if="row.prohibited_item" type="danger" size="small">{{ row.prohibited_item }}</el-tag>
              <span v-else class="dim">—</span>
            </template>
          </el-table-column>
          <el-table-column prop="disposal" label="处置" width="95" />
          <el-table-column prop="checker" label="检查人" width="110" />
          <el-table-column label="整改工单" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.ticket_id" type="warning" size="small">#{{ row.ticket_id }}</el-tag>
              <span v-else class="dim">—</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- ===== 违禁品标准 ===== -->
      <el-tab-pane label="违禁品标准" name="standards">
        <div class="std-bar">
          <p class="std-note">判定规则：烹饪/加热类一律违禁；非烹饪电器看额定功率（≤800W 申报放行，>800W 需特批；宿舍配电容量 2000W/间）。<template v-if="isAdmin">标准库以学校下发文件为准：下载模板填写后导入，将<b>整库替换</b>内置演示标准。</template></p>
          <div v-if="isAdmin" class="std-actions">
            <el-button size="small" plain @click="downloadStdTemplate">下载标准模板</el-button>
            <el-upload :show-file-list="false" accept=".csv,.xlsx,.xls" :auto-upload="false" :on-change="onStdFile">
              <el-button type="primary" size="small">导入学校标准</el-button>
            </el-upload>
          </div>
        </div>
        <el-table :data="standards" size="small" stripe>
          <el-table-column label="级别" width="140">
            <template #default="{ row }">
              <el-tag :type="row.level.startsWith('一级') ? 'danger' : row.level.startsWith('二级') ? 'warning' : 'success'" size="small">{{ row.level }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="category" label="类别" width="120" />
          <el-table-column prop="name" label="物品" min-width="240" />
          <el-table-column prop="disposal" label="处置方式" min-width="200" />
          <el-table-column prop="clause" label="依据条款" min-width="220" show-overflow-tooltip />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import * as XLSX from 'xlsx'
import api from '../api'

const isAdmin = computed(() => localStorage.getItem('dorm_role') === 'admin')

const tab = ref('tasks')
const buildings = ref([])
const tasks = ref([])
const records = ref([])
const standards = ref([])
const summary = ref({ byBuilding: [], latest: [] })
const filterTask = ref(null)
const task = reactive({ title: '', buildingCode: 'ALL', checkType: '内务检查', deadline: '' })

async function loadTasks() {
  tasks.value = await api.get('/inspections/tasks')
}
async function loadRecords() {
  records.value = await api.get('/inspections/records', { params: filterTask.value ? { taskId: filterTask.value } : {} })
  summary.value = await api.get('/inspections/summary')
}
async function createTask() {
  if (!task.title.trim()) return ElMessage.warning('请填写任务名称')
  const res = await api.post('/inspections/tasks', task)
  ElMessage.success(res.message)
  task.title = ''
  await loadTasks()
}
async function closeTask(row) {
  const res = await api.post(`/inspections/tasks/${row.id}/close`)
  ElMessage.success(res.message)
  await loadTasks()
}

function downloadTemplate() {
  const header = '楼栋,房间号,检查日期,检查类型,评分,问题项,违禁品,处置方式'
  const sample = ['1,201,2026-11-03,内务检查,92,阳台杂物堆放,,无', '1,202,2026-11-03,违禁品检查,55,桌面混乱,电煮锅,代为保管', '4,105,2026-11-03,联合检查,78,地面有垃圾,,无'].join('\n')
  const blob = new Blob(['\uFEFF' + header + '\n' + sample], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = '检查记录导入模板.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

async function onFile(file) {
  const f = file.raw
  if (f.size > 10 * 1024 * 1024) return ElMessage.error('文件超过 10MB')
  let rows
  if (f.name.toLowerCase().endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(await f.arrayBuffer())
    rows = XLSX.utils.sheet_to_json(XLSX.read(text, { type: 'string' }).Sheets.Sheet1, { defval: '' })
  } else {
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
  }
  if (!rows.length) return ElMessage.error('未解析到有效数据行')
  try {
    const body = { rows }
    if (filterTask.value) body.taskId = filterTask.value
    const res = await api.post('/inspections/import', body)
    ElMessage.success(res.message)
    await Promise.all([loadRecords(), loadTasks()])
  } catch (e) {
    const msg = e?.response?.data?.message || '导入失败'
    ElMessage.error({ message: msg, duration: 6000 })
    const errs = e?.response?.data?.errors || []
    if (errs.length) console.table(errs)
  }
}

function downloadStdTemplate() {
  const header = '级别,类别,物品名称,处置方式,依据条款'
  const sample = ['一级（严禁）,烹饪电器,电煮锅、电饭煲、电磁炉,代为保管，学期末退还，记违规 1 次,学生宿舍违禁物品管理规定 第三章 第 12 条', '二级（限制）,大功率电器,额定功率 > 800W 且非烹饪/加热类电器,未申报代为保管；申报获批可使用,学生宿舍用电管理办法 第五章 第 30 条', '三级（合规可用）,低功率电器,≤800W 吹风机、加湿器、风扇、台灯,申报后直接放行,学生宿舍用电管理办法 第五章 第 30 条'].join('\n')
  const blob = new Blob(['\uFEFF' + header + '\n' + sample], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = '违禁品标准导入模板.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

async function onStdFile(file) {
  const f = file.raw
  if (f.size > 10 * 1024 * 1024) return ElMessage.error('文件超过 10MB')
  let rows
  if (f.name.toLowerCase().endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(await f.arrayBuffer())
    rows = XLSX.utils.sheet_to_json(XLSX.read(text, { type: 'string' }).Sheets.Sheet1, { defval: '' })
  } else {
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
  }
  if (!rows.length) return ElMessage.error('未解析到有效数据行')
  try {
    const res = await api.post('/standards/import', { rows, mode: 'replace' })
    ElMessage.success(res.message)
    standards.value = await api.get('/standards')
  } catch (e) {
    ElMessage.error({ message: e?.response?.data?.message || '导入失败', duration: 6000 })
  }
}

onMounted(async () => {
  buildings.value = await api.get('/buildings')
  await Promise.all([loadTasks(), loadRecords(), (standards.value = await api.get('/standards'))])
})
</script>

<style scoped>
.page { padding: 18px 22px; }
.page-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
.page-head h2 { margin: 0; font-size: 18px; }
.sub { margin: 4px 0 0; font-size: 12.5px; color: var(--ink-3, #8a97a8); }
.task-bar { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.rec-bar { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; }
.rec-tip { font-size: 12px; color: var(--ink-3, #8a97a8); }
.summary { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.sum-card { border: 1px solid var(--line, #e4e9f1); border-radius: 8px; padding: 10px 18px; text-align: center; min-width: 110px; }
.sum-code { font-size: 12px; color: var(--ink-3, #8a97a8); }
.sum-score { font-size: 22px; font-weight: 700; color: #1f9d61; }
.sum-score.low { color: #d8483f; }
.sum-sub { font-size: 11.5px; color: var(--ink-3, #8a97a8); }
.bad-score { color: #d8483f; font-weight: 700; }
.mid-score { color: #d08a1f; font-weight: 600; }
.ok-score { color: #1f9d61; }
.dim { color: #c0c9d6; }
.std-bar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 12px; }
.std-actions { display: flex; gap: 10px; flex-shrink: 0; }
.std-note { font-size: 12.5px; color: var(--ink-3, #8a97a8); margin: 0; }
</style>
