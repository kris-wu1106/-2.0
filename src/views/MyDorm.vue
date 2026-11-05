<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">我的宿舍</h2>
        <p class="page-desc">查看个人住宿信息、室友，以及提交报修与调宿申请。</p>
      </div>
      <div class="head-actions">
        <el-button type="primary" plain @click="openRepair">提交报修</el-button>
        <el-button plain @click="openMove">申请调宿</el-button>
      </div>
    </div>

    <div v-if="dorm" class="grid">
      <section class="panel dorm-card">
        <div class="dc-head">
          <div>
            <div class="dc-label">当前住宿</div>
            <div class="dc-room">{{ dorm.building_code }} · {{ dorm.room_no }}</div>
            <div class="dc-sub">{{ dorm.building_name }} · {{ dorm.floor }} 层 · {{ dorm.room_type }}</div>
          </div>
          <el-tag type="success" effect="dark" round>{{ dorm.bed_no }} 号床</el-tag>
        </div>
        <div class="dc-grid">
          <div class="dc-item"><span>姓名</span><strong>{{ dorm.name }}</strong></div>
          <div class="dc-item"><span>学号</span><strong>{{ dorm.student_no }}</strong></div>
          <div class="dc-item"><span>区队</span><strong>{{ dorm.class_name }}</strong></div>
          <div class="dc-item"><span>楼栋管理员</span><strong>{{ dorm.manager }}</strong></div>
        </div>
        <div class="dc-foot">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 4v5c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V7l7-4z" stroke="#2456a6" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="#2456a6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          住宿信息已与台账底账同步，变更须由宿管办理并留痕
        </div>
      </section>

      <section class="panel mates">
        <div class="mates-head">
          <h3>同房间室友</h3>
          <span class="hint">共 {{ roommates.length }} 人（仅展示姓名，不含隐私字段）</span>
        </div>
        <div class="mate-list">
          <div v-for="m in roommates" :key="m.bed_no" class="mate">
            <span class="mate-avatar">{{ m.name.slice(0, 1) }}</span>
            <div class="mate-info">
              <div class="mate-name">{{ m.name }}</div>
              <div class="mate-class">{{ m.class_name }}</div>
            </div>
            <span class="mate-bed">{{ m.bed_no }}号床</span>
          </div>
          <el-empty v-if="!roommates.length" description="暂无室友" :image-size="70" />
        </div>
      </section>
    </div>

    <el-empty v-else description="暂无住宿记录，请联系宿管中心办理入住" />

    <section v-if="myTickets.length" class="panel tickets-panel">
      <div class="mates-head">
        <h3>我的申请记录</h3>
        <span class="hint">报修 / 调宿进度实时同步宿管端工单池</span>
      </div>
      <el-table :data="myTickets" size="small">
        <el-table-column label="类型" width="80">
          <template #default="{ row }"><el-tag size="small" :type="row.type === '报修' ? 'warning' : 'primary'" effect="plain">{{ row.type }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="title" label="内容" min-width="180" show-overflow-tooltip />
        <el-table-column label="状态" width="96">
          <template #default="{ row }"><el-tag size="small" :type="statusType(row.status)" effect="light">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="handler" label="受理人" width="110" />
        <el-table-column prop="result" label="处理结果" min-width="160" show-overflow-tooltip />
        <el-table-column label="提交时间" width="150">
          <template #default="{ row }">{{ fmt(row.created_at) }}</template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="repairVisible" title="提交报修单" width="460">
      <el-form label-position="top">
        <el-form-item label="问题描述" required>
          <el-input v-model="repair.desc" type="textarea" :rows="3" placeholder="例：卫生间水龙头漏水，关不紧" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="repairVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitRepair">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="moveVisible" title="申请调宿" width="460">
      <el-form label-position="top">
        <el-form-item label="意向楼栋" required>
          <el-select v-model="move.building" placeholder="选择目标楼栋" style="width: 100%">
            <el-option v-for="b in buildings" :key="b.code" :label="`${b.name}（${b.gender}）`" :value="b.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="意向房间号" required>
          <el-input v-model="move.room" placeholder="例：201" />
        </el-form-item>
        <el-form-item label="申请理由" required>
          <el-input v-model="move.reason" type="textarea" :rows="3" placeholder="简要说明调宿原因" />
        </el-form-item>
        <p class="move-tip">系统将校验目标楼栋性别属性与房间状态；宿管初审通过后，跨楼栋申请由辅导员复核。</p>
      </el-form>
      <template #footer>
        <el-button @click="moveVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitMove">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const dorm = ref(null)
const roommates = ref([])
const myTickets = ref([])
const buildings = ref([])
const repairVisible = ref(false)
const moveVisible = ref(false)
const submitting = ref(false)
const repair = reactive({ desc: '' })
const move = reactive({ building: '', room: '', reason: '' })

function fmt(t) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

function statusType(s) {
  return { 待初审: 'info', 处理中: 'warning', 待复核: 'warning', 已完工: 'success', 已执行: 'success', 已办结: 'success', 已驳回: 'danger' }[s] || 'info'
}

function openRepair() {
  repair.desc = ''
  repairVisible.value = true
}

function openMove() {
  move.building = ''
  move.room = ''
  move.reason = ''
  moveVisible.value = true
}

async function submitRepair() {
  if (!repair.desc.trim()) return ElMessage.warning('请填写问题描述')
  submitting.value = true
  try {
    const res = await api.post('/tickets', { type: '报修', description: repair.desc.trim() })
    ElMessage.success(res.message)
    repairVisible.value = false
    myTickets.value = await api.get('/tickets/mine')
  } finally {
    submitting.value = false
  }
}

async function submitMove() {
  if (!move.building || !move.room.trim() || !move.reason.trim()) return ElMessage.warning('请完整填写楼栋、房间号与理由')
  submitting.value = true
  try {
    const res = await api.post('/tickets', {
      type: '调宿',
      description: move.reason.trim(),
      targetBuilding: move.building,
      targetRoom: move.room.trim()
    })
    ElMessage.success(res.message)
    moveVisible.value = false
    myTickets.value = await api.get('/tickets/mine')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  const [data, tickets, b] = await Promise.all([api.get('/my-dorm'), api.get('/tickets/mine'), api.get('/buildings')])
  dorm.value = data.dorm
  roommates.value = data.roommates
  myTickets.value = tickets
  buildings.value = b
})
</script>

<style scoped>
.head-actions { display: flex; gap: 10px; }
.grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: 16px; align-items: start; }
.dorm-card { padding: 18px 20px; }
.dc-head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 1px dashed var(--line); }
.dc-label { font-size: 11.5px; color: var(--ink-3); margin-bottom: 6px; }
.dc-room { font-size: 24px; font-weight: 600; letter-spacing: .5px; }
.dc-sub { font-size: 12.5px; color: var(--ink-2); margin-top: 6px; }
.dc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; padding: 16px 0; }
.dc-item span { display: block; font-size: 11.5px; color: var(--ink-3); margin-bottom: 4px; }
.dc-item strong { font-size: 13.5px; font-weight: 500; }
.dc-foot { display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: #5b7ba8; background: #f4f8ff; border: 1px solid #e2ecfb; border-radius: 7px; padding: 9px 11px; }
.mates { padding: 16px 18px; }
.mates-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
.mates-head h3 { font-size: 14px; font-weight: 600; margin: 0; }
.hint { font-size: 11px; color: var(--ink-3); }
.mate-list { display: grid; gap: 8px; }
.mate { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 8px; }
.mate-avatar { width: 30px; height: 30px; border-radius: 50%; background: #eef4ff; color: #2456a6; display: grid; place-items: center; font-size: 12.5px; }
.mate-info { flex: 1; }
.mate-name { font-size: 12.5px; font-weight: 500; }
.mate-class { font-size: 10.5px; color: var(--ink-3); margin-top: 2px; }
.mate-bed { font-size: 11px; color: var(--ink-3); }
.tickets-panel { margin-top: 16px; padding: 16px 18px; }
.move-tip { font-size: 11px; color: var(--ink-3); line-height: 1.6; margin: 0; }
@media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
</style>
