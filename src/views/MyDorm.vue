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
          <div class="dc-tags">
            <el-tag
              v-if="myStatus.state && myStatus.state !== '在宿'"
              :type="myStatus.state === '请假离宿' || myStatus.state === '请假外出' ? 'warning' : 'danger'"
              effect="dark"
              round
            >{{ myStatus.state }}</el-tag>
            <el-tag type="success" effect="dark" round>{{ dorm.bed_no }} 号床</el-tag>
          </div>
        </div>
        <div v-if="myStatus.state === '请假离宿' || myStatus.state === '请假外出'" class="leave-banner">
          当前「{{ myStatus.state }}」{{ myStatus.note ? ' · ' + myStatus.note : '' }}，床位保留，返校后由辅导员确认销假即恢复在宿状态。
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

    <el-dialog v-model="moveVisible" title="申请调宿" width="560">
      <el-form label-position="top">
        <el-form-item label="意向楼栋" required>
          <el-select v-model="move.building" placeholder="选择目标楼栋" style="width: 100%" @change="onBuildingChange">
            <el-option
              v-for="b in freeBuildings"
              :key="b.code"
              :label="`${b.name}　空床 ${b.freeCount} 个 / ${b.roomCount} 间房`"
              :value="b.code"
            />
          </el-select>
          <p v-if="!freeBuildings.length" class="form-hint warn">当前没有与你性别匹配的空余床位，暂无法申请调宿。</p>
        </el-form-item>

        <el-form-item label="意向房间" required>
          <el-select v-model="move.room" :disabled="!move.building" placeholder="选择有空床的房间" style="width: 100%" @change="onRoomChange">
            <el-option v-for="r in roomOptions" :key="r.room_no" :label="`${r.room_no} 室　空床 ${r.beds.length} 个（${r.room_type}）`" :value="r.room_no" />
          </el-select>
        </el-form-item>

        <el-form-item label="意向床位" required>
          <div v-if="bedOptions.length" class="bed-picker">
            <button
              v-for="b in bedOptions"
              :key="b.id"
              type="button"
              class="bed-chip"
              :class="{ on: move.bedId === b.id }"
              @click="move.bedId = b.id"
            >{{ b.bed_no }} 号床</button>
          </div>
          <p v-else class="form-hint">请先选择楼栋与房间</p>
        </el-form-item>

        <el-form-item label="申请理由" required>
          <el-input v-model="move.reason" type="textarea" :rows="3" placeholder="简要说明调宿原因（宿管与辅导员审批时会看到）" />
        </el-form-item>
        <p class="move-tip">空床数据实时读取台账：仅展示与你性别一致的楼栋，已被占用的床位不会出现在可选列表中；提交后床位被他人先占，系统会提示重新选择。</p>
      </el-form>
      <template #footer>
        <el-button @click="moveVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitMove">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const dorm = ref(null)
const roommates = ref([])
const myTickets = ref([])
const buildings = ref([])
const freeBuildings = ref([])
const freeRooms = ref([])
const myStatus = reactive({ state: '', note: '', leave: null })
const repairVisible = ref(false)
const moveVisible = ref(false)
const submitting = ref(false)
const repair = reactive({ desc: '' })
const move = reactive({ building: '', room: '', bedId: null, reason: '' })

/** 当前所选楼栋下的房间（来自实时空床数据，只含有空床的房间） */
const roomOptions = computed(() => freeRooms.value.filter((r) => r.building_code === move.building))
/** 当前所选房间的空床 */
const bedOptions = computed(() => roomOptions.value.find((r) => r.room_no === move.room)?.beds || [])

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

async function openMove() {
  move.building = ''
  move.room = ''
  move.bedId = null
  move.reason = ''
  moveVisible.value = true
  // 打开即拉取实时空床分布，让学生先看清哪里有床位
  try {
    const data = await api.get('/free-beds')
    freeBuildings.value = data.buildings || []
    freeRooms.value = data.rooms || []
  } catch {
    freeBuildings.value = []
    freeRooms.value = []
  }
}

function onBuildingChange() {
  move.room = ''
  move.bedId = null
}

function onRoomChange() {
  // 默认选中第一个空床，减少一次点击
  move.bedId = bedOptions.value[0]?.id ?? null
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
  if (!move.building || !move.room) return ElMessage.warning('请选择意向楼栋与房间')
  if (!move.bedId) return ElMessage.warning('请选择意向床位')
  if (!move.reason.trim()) return ElMessage.warning('请填写调宿理由，审批人需要据此判断')
  submitting.value = true
  try {
    const res = await api.post('/tickets', {
      type: '调宿',
      description: move.reason.trim(),
      targetBuilding: move.building,
      targetRoom: move.room,
      targetBedId: move.bedId
    })
    ElMessage.success(res.message)
    moveVisible.value = false
    myTickets.value = await api.get('/tickets/mine')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  const [data, tickets, b, st] = await Promise.all([
    api.get('/my-dorm'), api.get('/tickets/mine'), api.get('/buildings'), api.get('/my-status').catch(() => null)
  ])
  dorm.value = data.dorm
  roommates.value = data.roommates
  myTickets.value = tickets
  buildings.value = b
  if (st) Object.assign(myStatus, st)
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
.dc-tags { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.leave-banner { margin-top: 14px; font-size: 11.5px; color: #8a5a12; background: #fdf8ec; border: 1px solid #f2e3c2; border-left: 3px solid #c89b3c; border-radius: 6px; padding: 9px 11px; line-height: 1.7; }
.form-hint { margin: 6px 0 0; font-size: 11px; color: var(--ink-3); }
.form-hint.warn { color: #a04036; }
.bed-picker { display: flex; flex-wrap: wrap; gap: 8px; }
.bed-chip { border: 1px solid #dbe7f8; background: #fff; color: #2456a6; font-size: 12px; padding: 7px 14px; border-radius: 6px; cursor: pointer; }
.bed-chip:hover { background: #f2f7ff; }
.bed-chip.on { background: #2456a6; border-color: #2456a6; color: #fff; }
@media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
</style>
