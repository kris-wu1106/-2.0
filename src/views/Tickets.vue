<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">业务审批与工单</h2>
        <p class="page-desc">报修、调宿、退宿共用「发起 → 审批 → 执行 → 归档」范式，每一步写台账并留审计。</p>
      </div>
      <div class="head-tags">
        <span class="pill"><i class="dot warn"></i>待处理 {{ pendingCount }}</span>
        <span class="pill"><i class="dot ok"></i>本周办结 {{ doneCount }}</span>
      </div>
    </div>

    <section class="panel tabs-panel">
      <el-tabs v-model="type" @tab-change="load">
        <el-tab-pane label="报修工单" name="报修" />
        <el-tab-pane label="调宿申请" name="调宿" />
        <el-tab-pane label="退宿办理" name="退宿" />
      </el-tabs>

      <div class="filters">
        <el-radio-group v-model="status" size="small" @change="load">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button v-for="s in statuses" :key="s" :label="s">{{ s }}</el-radio-button>
        </el-radio-group>
      </div>

      <el-table :data="list" size="small" style="width:100%">
        <el-table-column label="学生" width="150">
          <template #default="{ row }">
            <div class="stu-cell">
              <strong>{{ row.student_name }}</strong>
              <span>{{ row.student_no }} · {{ row.class_name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="住宿位置" width="120">
          <template #default="{ row }">{{ row.building_code ? `${row.building_code}-${row.room_no}` : '未分配' }}</template>
        </el-table-column>
        <el-table-column prop="title" label="事项" min-width="240" show-overflow-tooltip />
        <el-table-column label="优先级" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.priority === '紧急' ? 'danger' : 'info'" effect="plain">{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="96">
          <template #default="{ row }">
            <el-tag size="small" :type="tagType(row.status)" effect="light">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="140">
          <template #default="{ row }">{{ fmt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <template v-if="row.type === '报修' && row.status === '待受理'">
              <el-button link type="primary" size="small" @click="act(row, 'accept', '确认受理该报修工单？')">受理</el-button>
            </template>
            <template v-else-if="row.type === '报修' && row.status === '处理中'">
              <el-button link type="primary" size="small" @click="finish(row)">完工登记</el-button>
            </template>
            <template v-else-if="row.type === '调宿' && row.status === '待初审'">
              <el-button link type="primary" size="small" @click="act(row, 'approve', '初审通过后转辅导员复核，确认？')">初审通过</el-button>
              <el-button link type="danger" size="small" @click="reject(row)">驳回</el-button>
            </template>
            <template v-else-if="row.type === '调宿' && row.status === '待复核'">
              <el-button link type="primary" size="small" @click="act(row, 'approve', `执行调宿到 ${row.target_room}？将释放原床位并占用目标空床。`)">复核通过并执行</el-button>
              <el-button link type="danger" size="small" @click="reject(row)">驳回</el-button>
            </template>
            <template v-else-if="row.type === '退宿' && row.status === '待审批'">
              <el-button link type="primary" size="small" @click="act(row, 'approve', '通过后床位立即释放，确认办理退宿？')">通过并办结</el-button>
              <el-button link type="danger" size="small" @click="reject(row)">驳回</el-button>
            </template>
            <span v-else class="done-text">{{ row.result || '已处理' }}</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!list.length" description="当前没有该类型工单" :image-size="80" />
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const type = ref('报修')
const status = ref('')
const list = ref([])

const statuses = computed(() => ({
  报修: ['待受理', '处理中', '已完工'],
  调宿: ['待初审', '待复核', '已执行', '已驳回'],
  退宿: ['待审批', '已办结', '已驳回']
}[type.value]))

const pendingCount = computed(() => list.value.filter((t) => ['待受理', '待初审', '待复核', '待审批'].includes(t.status)).length)
const doneCount = computed(() => list.value.filter((t) => ['已完工', '已执行', '已办结'].includes(t.status)).length)

function tagType(s) {
  if (['已完工', '已执行', '已办结'].includes(s)) return 'success'
  if (s === '已驳回') return 'danger'
  if (['处理中', '待复核'].includes(s)) return 'warning'
  return 'info'
}

function fmt(t) {
  return new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

async function load() {
  list.value = await api.get('/tickets', { params: { type: type.value, status: status.value } })
}

async function act(row, action, tip) {
  await ElMessageBox.confirm(tip, '操作确认', { confirmButtonText: '确认', cancelButtonText: '取消' })
  const res = await api.post(`/tickets/${row.id}/action`, { action })
  ElMessage.success(res.message)
  await load()
}

async function finish(row) {
  const { value } = await ElMessageBox.prompt('请填写维修结果（记入审计与验收材料）', '完工登记', {
    confirmButtonText: '提交', cancelButtonText: '取消', inputPlaceholder: '如：已更换配件并测试正常'
  })
  const res = await api.post(`/tickets/${row.id}/action`, { action: 'finish', note: value })
  ElMessage.success(res.message)
  await load()
}

async function reject(row) {
  const { value } = await ElMessageBox.prompt('请填写驳回理由（必填）', '驳回申请', {
    confirmButtonText: '确认驳回', cancelButtonText: '取消', inputPlaceholder: '如：材料不齐 / 不符合调宿条件'
  })
  const res = await api.post(`/tickets/${row.id}/action`, { action: 'reject', note: value })
  ElMessage.success(res.message)
  await load()
}

onMounted(load)
</script>

<style scoped>
.head-tags { display: flex; gap: 8px; }
.pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-2); background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 5px 12px; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.dot.warn { background: #d98416; }
.dot.ok { background: #2e8b57; }
.tabs-panel { padding: 6px 16px 16px; }
.filters { margin: 0 0 12px; }
.stu-cell strong { font-size: 12.5px; font-weight: 500; display: block; }
.stu-cell span { font-size: 10.5px; color: var(--ink-3); }
.done-text { font-size: 11.5px; color: #a2aec1; }
</style>
