<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">智能床位分配</h2>
        <p class="page-desc">规则优先、AI 只写说明。算法为确定性约束满足 + 优先级贪心，生成结果可复核、可锁定、可回看版本。</p>
      </div>
      <el-tag v-if="project.status === '已归档'" type="info" effect="dark">项目已归档 · 只读</el-tag>
    </div>

    <div class="layout">
      <section class="panel config">
        <div class="cfg-head">分配规则</div>
        <el-form label-position="top" size="default">
          <el-form-item label="方案名称">
            <el-input v-model="rules.name" placeholder="2026 秋迎新分配方案" />
          </el-form-item>
          <el-form-item label="预留床位比例（不参与分配）">
            <div class="slider-row">
              <el-slider v-model="rules.reserveRatio" :min="0" :max="20" :step="1" style="flex:1" />
              <span class="ratio">{{ rules.reserveRatio }}%</span>
            </div>
          </el-form-item>
          <el-form-item label="同班优先聚合">
            <el-switch v-model="rules.classTogether" active-text="开启" inactive-text="关闭" inline-prompt />
            <span class="field-hint">同区队学生优先安排到同一房间，一个宿舍基本住一个区队</span>
          </el-form-item>
          <el-form-item label="楼栋优先级">
            <el-checkbox-group v-model="rules.buildingOrder">
              <el-checkbox v-for="b in buildings" :key="b.code" :label="b.code" :value="b.code">{{ b.code }}（{{ b.gender }}）</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
          <el-form-item label="硬约束（不可关闭）">
            <div class="hard-rules">
              <span>性别与楼栋属性一致</span><span>仅可用房间的空闲床位</span><span>维修/预留床位不参与</span><span>一人一床</span>
            </div>
          </el-form-item>
        </el-form>
        <el-button type="primary" :loading="generating" style="width:100%" @click="generate">生成分配方案</el-button>
        <p class="cfg-tip">当前待分配学生：{{ pending }} 人 · 可用空闲床位：{{ freeBeds }} 张</p>
      </section>

      <section class="panel result">
        <div class="res-head">
          <div class="res-title">
            <strong>方案版本</strong>
            <span class="hint">每次生成产生一个新版本，锁定后写入台账</span>
          </div>
          <el-select v-model="currentId" placeholder="选择方案" style="width: 260px" @change="loadDetail">
            <el-option v-for="a in allocations" :key="a.id" :label="`${a.name}`" :value="a.id" />
          </el-select>
        </div>

        <template v-if="detail">
          <div class="metrics">
            <div class="metric"><span>已分配</span><strong>{{ detail.metrics.assigned || 0 }}</strong></div>
            <div class="metric"><span>未分配</span><strong class="warn">{{ detail.metrics.unassigned || 0 }}</strong></div>
            <div class="metric"><span>规则满足率</span><strong>{{ detail.metrics.ruleSatisfyRate || 0 }}%</strong></div>
            <div class="metric"><span>区队聚合度</span><strong>{{ detail.metrics.classAggregation || 0 }}%</strong></div>
            <div class="metric"><span>预留床位</span><strong>{{ detail.metrics.reservedBeds || 0 }}</strong></div>
          </div>

          <div class="detail-head">
            <div class="dh-left">
              <el-tag :type="detail.status === '已锁定' ? 'success' : 'info'" effect="plain">{{ detail.status }}</el-tag>
              <span class="dh-meta">生成于 {{ fmt(detail.created_at) }}</span>
            </div>
            <el-button v-if="detail.status !== '已锁定'" type="primary" plain :loading="locking" @click="lock">锁定方案并写入台账</el-button>
            <span v-else class="locked-note">已锁定 · 只读（调整需走调宿流程）</span>
          </div>

          <el-table :data="detail.items" size="small" max-height="420">
            <el-table-column prop="name" label="学生" width="90" />
            <el-table-column prop="student_no" label="学号" width="110" />
            <el-table-column prop="class_name" label="区队" width="130" />
            <el-table-column prop="code" label="楼栋" width="70" />
            <el-table-column prop="room_no" label="房间" width="80" />
            <el-table-column prop="bed_no" label="床位" width="70" />
            <el-table-column label="分配说明" min-width="150">
              <template #default="{ row }">按「同班优先 + 楼栋顺序」规则匹配</template>
            </el-table-column>
            <el-table-column v-if="detail.status !== '已锁定' && project.status !== '已归档'" label="操作" width="76" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openMove(row)">调整</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!detail.items.length" description="该方案暂无分配明细" :image-size="70" />
        </template>
        <el-empty v-else description="尚未生成分配方案，请在左侧配置规则后生成" :image-size="90" />
      </section>
    </div>

    <el-dialog v-model="moveVisible" title="调整床位（冲突即时校验）" width="520">
      <div v-if="moving" class="move-student">
        <span>{{ moving.name }}（{{ moving.student_no }} · {{ moving.class_name }}）</span>
        <el-tag size="small" effect="plain">当前：{{ moving.code }}-{{ moving.room_no }}-{{ moving.bed_no }}号床</el-tag>
      </div>
      <el-select v-model="moveTarget" filterable placeholder="选择目标床位（仅性别匹配的可用床位）" style="width: 100%" size="large">
        <el-option v-for="b in moveCandidates" :key="b.id" :label="b.label" :value="b.id" />
      </el-select>
      <p class="move-tip">目标床位限「空闲且房间可用」；若选择方案内已分配床位，将与该学生<b>对调</b>。性别、房间状态冲突会被即时拦截。</p>
      <template #footer>
        <el-button @click="moveVisible = false">取消</el-button>
        <el-button type="primary" :loading="movingBusy" :disabled="!moveTarget" @click="submitMove">确认调整</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const buildings = ref([])
const allocations = ref([])
const currentId = ref(null)
const detail = ref(null)
const generating = ref(false)
const locking = ref(false)
const pending = ref(0)
const freeBeds = ref(0)
const project = reactive({ status: '' })

const rules = reactive({
  name: '2026 秋迎新分配方案',
  reserveRatio: 5,
  classTogether: true,
  buildingOrder: ['1', '2', '3', '4', '5', '6', '7']
})

function fmt(t) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

async function loadBase() {
  const [b, p, stats] = await Promise.all([api.get('/buildings'), api.get('/project'), api.get('/stats/pending')])
  buildings.value = b
  Object.assign(project, p)
  pending.value = stats.pending
  freeBeds.value = stats.freeBeds
}

async function loadAllocations() {
  allocations.value = await api.get('/allocations')
  if (allocations.value.length && !currentId.value) {
    currentId.value = allocations.value[0].id
    await loadDetail()
  }
}

async function loadDetail() {
  if (!currentId.value) return
  detail.value = await api.get(`/allocations/${currentId.value}`)
}

async function generate() {
  generating.value = true
  try {
    const res = await api.post('/allocations/generate', rules)
    ElMessage.success(`方案已生成：分配 ${res.metrics.assigned} 人，未分配 ${res.metrics.unassigned} 人`)
    await loadAllocations()
    currentId.value = res.id
    await loadDetail()
  } finally {
    generating.value = false
  }
}

async function lock() {
  const res = await api.post(`/allocations/${currentId.value}/lock`)
  ElMessage.success(res.message)
  await Promise.all([loadDetail(), loadAllocations()])
}

/* ---- 方案手动微调 ---- */
const moveVisible = ref(false)
const moving = ref(null)
const moveCandidates = ref([])
const moveTarget = ref(null)
const movingBusy = ref(false)

async function openMove(row) {
  moving.value = row
  moveTarget.value = null
  moveCandidates.value = await api.get(`/allocations/${currentId.value}/free-beds`, { params: { studentId: row.student_id } })
  moveVisible.value = true
}

async function submitMove() {
  movingBusy.value = true
  try {
    const res = await api.post(`/allocations/${currentId.value}/move`, { studentId: moving.value.student_id, toBedId: moveTarget.value })
    ElMessage.success(res.message)
    moveVisible.value = false
    await loadDetail()
  } finally {
    movingBusy.value = false
  }
}

onMounted(async () => {
  await loadBase()
  await loadAllocations()
})
</script>

<style scoped>
.layout { display: grid; grid-template-columns: 320px 1fr; gap: 16px; align-items: start; }
.config { padding: 16px 18px 18px; }
.cfg-head { font-size: 14px; font-weight: 600; margin-bottom: 14px; }
.slider-row { display: flex; align-items: center; gap: 12px; width: 100%; }
.ratio { font-size: 12.5px; color: #2456a6; width: 36px; text-align: right; font-variant-numeric: tabular-nums; }
.field-hint { font-size: 11px; color: var(--ink-3); margin-left: 10px; }
.hard-rules { display: flex; flex-wrap: wrap; gap: 6px; }
.hard-rules span { font-size: 11px; color: #5b7ba8; background: #f3f7fd; border: 1px solid #e2ecfb; border-radius: 4px; padding: 2px 7px; }
.cfg-tip { font-size: 11px; color: var(--ink-3); margin: 10px 0 0; line-height: 1.6; }
.result { padding: 14px 16px 18px; }
.res-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.res-title { display: flex; align-items: baseline; gap: 10px; }
.res-title strong { font-size: 14px; }
.hint { font-size: 11.5px; color: var(--ink-3); }
.metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 14px; }
.metric { background: #f8fafd; border: 1px solid #eef2f8; border-radius: 8px; padding: 10px 12px; }
.metric span { font-size: 11px; color: var(--ink-3); display: block; margin-bottom: 5px; }
.metric strong { font-size: 19px; font-weight: 600; font-variant-numeric: tabular-nums; }
.metric strong.warn { color: #d98416; }
.detail-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.dh-left { display: flex; align-items: center; gap: 10px; }
.dh-meta { font-size: 11.5px; color: var(--ink-3); }
.locked-note { font-size: 12px; color: #2e8b57; }
.move-student { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; font-size: 13px; }
.move-tip { font-size: 11.5px; color: var(--ink-3); line-height: 1.7; margin: 12px 0 0; }
@media (max-width: 1200px) { .layout { grid-template-columns: 1fr; } }
</style>
