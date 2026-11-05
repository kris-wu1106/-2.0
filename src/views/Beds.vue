<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">床位管理</h2>
        <p class="page-desc">
          楼栋 → 楼层 → 房间 → 床位四级台账。入住、退宿与状态变更均执行确定性校验，并写入审计日志。
        </p>
      </div>
      <div class="head-actions">
        <el-button plain @click="openAudit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right:5px;vertical-align:-2px"><path d="M12 8v5l3 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="12" r="8.4" stroke="currentColor" stroke-width="1.7"/></svg>
          操作日志
        </el-button>
        <el-button type="primary" @click="loadRooms">刷新台账</el-button>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-icon" style="background:#eef4ff;color:#2456a6">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M3 18v-8m0 8h18m0 0v-4a3 3 0 00-3-3H9v7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="6.5" cy="9.5" r="2" stroke="currentColor" stroke-width="1.7"/></svg>
        </div>
        <div><div class="stat-label">床位总量</div><div class="stat-value">{{ overview.total }}<small>张</small></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:#eaf8f1;color:#2e8b57">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div><div class="stat-label">已入住</div><div class="stat-value">{{ overview.occupied }}<small>人</small></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:#f5f7fb;color:#7b8aa3">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" stroke-width="1.7" stroke-dasharray="3 3"/></svg>
        </div>
        <div><div class="stat-label">空闲床位</div><div class="stat-value">{{ overview.free }}<small>张</small></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:#fdf5e7;color:#d98416">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M6 4h12v16l-6-3-6 3V4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
        </div>
        <div><div class="stat-label">预留床位</div><div class="stat-value">{{ overview.reserved }}<small>张</small></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:#fdeeee;color:#c0392b">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M14.5 5.5l4 4L9 19H5v-4L14.5 5.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
        </div>
        <div><div class="stat-label">维修床位</div><div class="stat-value">{{ overview.maintenance }}<small>张</small></div></div>
      </div>
    </div>

    <section class="panel toolbar">
      <div class="b-tabs">
        <button
          v-for="b in buildings"
          :key="b.id"
          class="b-tab"
          :class="{ active: b.id === currentBuildingId }"
          @click="switchBuilding(b)"
        >
          <span class="b-code">{{ b.code }}</span>
          <span class="b-gender" :class="b.gender === '男' ? 'male' : (b.gender === '女' ? 'female' : 'mixed')">{{ b.gender === '混合' ? '男女混住' : b.gender }}</span>
        </button>
      </div>
      <div class="filters">
        <el-select v-model="filters.status" placeholder="房间状态" style="width: 130px" clearable @change="reload">
          <el-option label="全部房间" value="" />
          <el-option label="有空床" value="有空床" />
          <el-option label="已满房" value="已满" />
          <el-option label="维修中" value="维修" />
          <el-option label="已停用" value="停用" />
        </el-select>
        <el-input v-model="filters.keyword" placeholder="搜索房间号" clearable style="width: 160px" @keyup.enter="reload" @clear="reload">
          <template #prefix>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="#9aa8bd" stroke-width="1.7"/><path d="M16 16l4 4" stroke="#9aa8bd" stroke-width="1.7" stroke-linecap="round"/></svg>
          </template>
        </el-input>
        <el-button plain @click="reload">查询</el-button>
      </div>
    </section>

    <div class="body-grid">
      <aside class="panel floors">
        <div class="floors-title">楼层</div>
        <button class="floor-item" :class="{ active: filters.floor === '' }" @click="selectFloor('')">
          全部楼层
        </button>
        <button
          v-for="f in floorList"
          :key="f"
          class="floor-item"
          :class="{ active: Number(filters.floor) === f }"
          @click="selectFloor(f)"
        >
          {{ f }} 层
        </button>
        <div class="floors-foot">
          <div class="ff-label">本楼栋</div>
          <div class="ff-val">{{ currentBuilding?.name }}</div>
          <div class="ff-meta">管理员 {{ currentBuilding?.manager }}</div>
        </div>
      </aside>

      <div class="rooms-wrap">
        <div v-loading="loading" class="rooms">
          <article v-for="room in rooms" :key="room.id" class="room-card">
            <header class="room-head">
              <div class="rh-left">
                <span class="room-no">{{ room.room_no }}</span>
                <span class="room-type">{{ room.room_type }}</span>
                <el-tag v-if="room.status !== '可用'" size="small" :type="room.status === '维修' ? 'warning' : 'info'" effect="light">{{ room.status }}</el-tag>
              </div>
              <div class="rh-right">
                <span class="room-count">{{ room.occupied }}/{{ room.capacity }} 人</span>
                <span class="rh-divider"></span>
                <span class="room-free">空 {{ room.freeBeds }}</span>
              </div>
            </header>

            <div v-if="room.status !== '可用'" class="room-blocked">
              <span>{{ room.status === '维修' ? '房间维修中，暂停入住分配' : '房间已停用' }}</span>
              <small v-if="room.note">{{ room.note }}</small>
            </div>

            <div class="beds">
              <el-dropdown
                v-for="bed in room.beds"
                :key="bed.id"
                trigger="click"
                :disabled="room.status !== '可用'"
                @command="(cmd) => onBedCommand(cmd, bed, room)"
              >
                <div class="bed" :class="stateClass(bed.status)">
                  <div class="bed-top">
                    <span class="bed-no">{{ bed.bed_no }}号床</span>
                    <span class="bed-flag" v-if="bed.status !== '空闲'">{{ bed.status }}</span>
                  </div>
                  <div class="bed-ico">
                    <svg width="46" height="26" viewBox="0 0 48 28" fill="none">
                      <path d="M4 22V12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
                      <path d="M4 18h38v4H4" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
                      <path d="M44 22V9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
                      <rect x="10" y="10" width="14" height="6" rx="2.4" stroke="currentColor" stroke-width="1.8" />
                      <path d="M28 16v-3.5a2 2 0 012-2h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    </svg>
                  </div>
                  <div class="bed-info">
                    <template v-if="bed.status === '已占用'">
                      <div class="bed-name">{{ bed.student_name }}</div>
                      <div class="bed-class">{{ bed.class_name }}</div>
                    </template>
                    <template v-else-if="bed.status === '预留'">
                      <div class="bed-name">{{ bed.note || '预留床位' }}</div>
                      <div class="bed-class">暂不可分配</div>
                    </template>
                    <template v-else-if="bed.status === '维修'">
                      <div class="bed-name">{{ bed.note || '维修中' }}</div>
                      <div class="bed-class">暂停使用</div>
                    </template>
                    <template v-else>
                      <div class="bed-name muted">暂未入住</div>
                      <div class="bed-class">点击办理</div>
                    </template>
                  </div>
                </div>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="bed.status === '空闲'" command="checkin">办理入住</el-dropdown-item>
                    <el-dropdown-item v-if="bed.status === '已占用'" command="checkout">办理退宿</el-dropdown-item>
                    <el-dropdown-item v-if="bed.status === '空闲'" command="reserve">标记为预留</el-dropdown-item>
                    <el-dropdown-item v-if="bed.status === '空闲'" command="maintenance">标记为维修</el-dropdown-item>
                    <el-dropdown-item v-if="bed.status !== '空闲'" command="restore" divided>恢复为空闲</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </article>

          <el-empty v-if="!loading && !rooms.length" description="当前筛选条件下没有房间" :image-size="90" />
        </div>

        <div class="pager">
          <span class="pager-total">共 {{ total }} 间房</span>
          <el-pagination
            v-model:current-page="page"
            :page-size="pageSize"
            :total="total"
            layout="prev, pager, next"
            background
            @current-change="loadRooms"
          />
        </div>
      </div>
    </div>

    <!-- 办理入住 -->
    <el-dialog v-model="checkin.visible" title="办理入住" width="520px" destroy-on-close>
      <div class="dlg-bed">
        <span class="dlg-bed-no">{{ checkin.roomNo }} · {{ checkin.bedNo }}号床</span>
        <el-tag size="small" effect="plain">{{ currentBuilding?.name }} {{ currentBuilding?.gender === '混合' ? '男女混住（按房间安排性别）' : currentBuilding?.gender + '生' }}</el-tag>
      </div>
      <el-form label-width="82px" label-position="left">
        <el-form-item label="入住学生" required>
          <el-select
            v-model="checkin.studentId"
            filterable
            remote
            reserve-keyword
            placeholder="输入姓名 / 学号 / 区队搜索"
            :remote-method="searchStudents"
            :loading="studentLoading"
            style="width: 100%"
          >
            <el-option
              v-for="s in studentOptions"
              :key="s.id"
              :label="`${s.name} · ${s.student_no} · ${s.class_name}`"
              :value="s.id"
              :disabled="s.in_bed > 0"
            >
              <div class="opt-row">
                <span>{{ s.name }} <small>{{ s.student_no }}</small></span>
                <span class="opt-class">{{ s.class_name }}<em v-if="s.in_bed > 0">已在住</em></span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="checkin.reason" placeholder="如：插班生补录 / 退宿后重新入住" />
        </el-form-item>
      </el-form>
      <p class="dlg-tip">系统将校验：床位空闲、房间可用、性别与楼栋属性一致（混合楼按房间实际入住性别）、学生无其他在住床位。</p>
      <template #footer>
        <el-button @click="checkin.visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCheckin">确认入住</el-button>
      </template>
    </el-dialog>

    <!-- 退宿 -->
    <el-dialog v-model="checkout.visible" title="办理退宿" width="460px">
      <p class="dlg-text">确认为 <strong>{{ checkout.studentName }}</strong> 办理 {{ checkout.roomNo }} · {{ checkout.bedNo }}号床退宿？退宿后床位将恢复为空闲。</p>
      <el-form label-width="72px" label-position="left">
        <el-form-item label="退宿原因">
          <el-input v-model="checkout.reason" type="textarea" :rows="2" placeholder="如：毕业离校 / 转专业调整" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="checkout.visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCheckout">确认退宿</el-button>
      </template>
    </el-dialog>

    <!-- 状态变更 -->
    <el-dialog v-model="stateDialog.visible" :title="stateDialog.status === '预留' ? '标记为预留' : '标记为维修'" width="460px">
      <p class="dlg-text">{{ stateDialog.roomNo }} · {{ stateDialog.bedNo }}号床将变更为「{{ stateDialog.status }}」，变更原因必填并记入审计日志。</p>
      <el-form label-width="72px" label-position="left">
        <el-form-item label="变更原因" required>
          <el-input v-model="stateDialog.reason" type="textarea" :rows="3" :placeholder="stateDialog.status === '预留' ? '如：预留给定时报到的交换生' : '如：床架损坏待维修'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stateDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitState">确认变更</el-button>
      </template>
    </el-dialog>

    <!-- 审计日志 -->
    <el-drawer v-model="audit.visible" title="操作记录（审计日志）" size="480px">
      <div class="audit-list">
        <div v-for="log in audit.list" :key="log.id" class="audit-item">
          <div class="audit-head">
            <strong>{{ log.action }}</strong>
            <span class="audit-time">{{ formatTime(log.created_at) }}</span>
          </div>
          <div class="audit-target">{{ log.target }}</div>
          <div class="audit-change" v-if="log.before_value || log.after_value">
            <span>{{ log.before_value || '—' }}</span>
            <i>→</i>
            <span>{{ log.after_value || '—' }}</span>
          </div>
          <div class="audit-meta">{{ log.actor }}<template v-if="log.reason"> · 原因：{{ log.reason }}</template></div>
        </div>
        <el-empty v-if="!audit.list.length" description="暂无记录" :image-size="80" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const buildings = ref([])
const currentBuilding = ref(null)
const rooms = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 8
const loading = ref(false)
const submitting = ref(false)
const overview = reactive({ total: 0, occupied: 0, free: 0, reserved: 0, maintenance: 0 })

const filters = reactive({ floor: '', status: '', keyword: '' })
const floorList = computed(() => {
  const n = currentBuilding.value?.floors || 0
  return Array.from({ length: n }, (_, i) => i + 1)
})

const checkin = reactive({ visible: false, bedId: null, bedNo: '', roomNo: '', roomGender: '', studentId: null, reason: '' })
const checkout = reactive({ visible: false, bedId: null, bedNo: '', roomNo: '', studentName: '', reason: '' })
const stateDialog = reactive({ visible: false, bedId: null, bedNo: '', roomNo: '', status: '预留', reason: '' })
const audit = reactive({ visible: false, list: [] })
const studentOptions = ref([])
const studentLoading = ref(false)

function stateClass(s) {
  return { free: s === '空闲', occupied: s === '已占用', reserved: s === '预留', maintenance: s === '维修' }
}

function formatTime(t) {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function loadOverview() {
  const o = await api.get('/overview')
  Object.assign(overview, o)
}

async function loadRooms() {
  if (!currentBuilding.value) return
  loading.value = true
  try {
    const data = await api.get('/rooms', {
      params: {
        buildingId: currentBuilding.value.id,
        floor: filters.floor,
        status: filters.status,
        keyword: filters.keyword.trim(),
        page: page.value,
        pageSize
      }
    })
    rooms.value = data.list
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  loadRooms()
}

function switchBuilding(b) {
  currentBuilding.value = b
  filters.floor = ''
  page.value = 1
  loadRooms()
}

function selectFloor(f) {
  filters.floor = f
  page.value = 1
  loadRooms()
}

async function searchStudents(keyword) {
  studentLoading.value = true
  try {
    // 单性别楼按楼栋性别筛选；混合楼按目标房间的实际入住性别筛选（空房间不限制）
    let gender = currentBuilding.value?.gender || ''
    if (gender === '混合') gender = checkin.roomGender || ''
    studentOptions.value = await api.get('/students', {
      params: { keyword, gender }
    })
  } finally {
    studentLoading.value = false
  }
}

function onBedCommand(cmd, bed, room) {
  if (cmd === 'checkin') {
    // 混合楼：取该房间已有在住学生的性别，作为入住候选的筛选条件
    const occupant = (room.beds || []).find((x) => x.status === '已占用' && x.student_gender)
    Object.assign(checkin, { visible: true, bedId: bed.id, bedNo: bed.bed_no, roomNo: room.room_no, roomGender: occupant?.student_gender || '', studentId: null, reason: '' })
    studentOptions.value = []
    searchStudents('')
  } else if (cmd === 'checkout') {
    Object.assign(checkout, { visible: true, bedId: bed.id, bedNo: bed.bed_no, roomNo: room.room_no, studentName: bed.student_name, reason: '' })
  } else if (cmd === 'reserve' || cmd === 'maintenance') {
    Object.assign(stateDialog, {
      visible: true, bedId: bed.id, bedNo: bed.bed_no, roomNo: room.room_no,
      status: cmd === 'reserve' ? '预留' : '维修', reason: ''
    })
  } else if (cmd === 'restore') {
    Object.assign(stateDialog, { visible: true, bedId: bed.id, bedNo: bed.bed_no, roomNo: room.room_no, status: '空闲', reason: '' })
  }
}

async function submitCheckin() {
  if (!checkin.studentId) return ElMessage.warning('请选择入住学生')
  submitting.value = true
  try {
    const res = await api.post(`/beds/${checkin.bedId}/checkin`, { studentId: checkin.studentId, reason: checkin.reason })
    ElMessage.success(res.message)
    checkin.visible = false
    await Promise.all([loadRooms(), loadOverview()])
  } finally {
    submitting.value = false
  }
}

async function submitCheckout() {
  submitting.value = true
  try {
    const res = await api.post(`/beds/${checkout.bedId}/checkout`, { reason: checkout.reason })
    ElMessage.success(res.message)
    checkout.visible = false
    await Promise.all([loadRooms(), loadOverview()])
  } finally {
    submitting.value = false
  }
}

async function submitState() {
  if (!stateDialog.reason.trim()) return ElMessage.warning('请填写变更原因')
  submitting.value = true
  try {
    const res = await api.post(`/beds/${stateDialog.bedId}/state`, { status: stateDialog.status, reason: stateDialog.reason })
    ElMessage.success(res.message)
    stateDialog.visible = false
    await Promise.all([loadRooms(), loadOverview()])
  } finally {
    submitting.value = false
  }
}

async function openAudit() {
  audit.list = (await api.get('/audit-logs', { params: { limit: 40 } })).items
  audit.visible = true
}

onMounted(async () => {
  buildings.value = await api.get('/buildings')
  if (buildings.value.length) {
    currentBuilding.value = buildings.value[0]
    await Promise.all([loadRooms(), loadOverview()])
  }
})
</script>

<style scoped>
.head-actions { display: flex; gap: 8px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 14px; margin-bottom: 14px; }
.b-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.b-tab { display: flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: #fff; border-radius: 8px; padding: 7px 12px; cursor: pointer; transition: .16s; }
.b-tab:hover { border-color: #bdd2f1; }
.b-tab.active { border-color: #2456a6; background: #eaf1fb; box-shadow: 0 2px 8px rgba(36, 86, 166, .12); }
.b-code { font-size: 13px; font-weight: 600; color: var(--ink); }
.b-gender { font-size: 10px; padding: 1px 5px; border-radius: 3px; }
.b-gender.male { background: #eaf1fe; color: #2456a6; }
.b-gender.female { background: #fdeef2; color: #c9446a; }
.b-gender.mixed { background: #fdf3e3; color: #b8860b; }
.filters { display: flex; gap: 8px; align-items: center; }

.body-grid { display: grid; grid-template-columns: 150px 1fr; gap: 14px; align-items: start; }
.floors { padding: 12px 10px; position: sticky; top: 72px; }
.floors-title { font-size: 11px; color: var(--ink-3); padding: 0 8px 8px; }
.floor-item { display: block; width: 100%; text-align: left; border: none; background: transparent; padding: 9px 10px; border-radius: 7px; font-size: 13px; color: var(--ink-2); cursor: pointer; margin-bottom: 2px; transition: .15s; }
.floor-item:hover { background: #f3f7fd; }
.floor-item.active { background: #eaf2fe; color: #2456a6; font-weight: 500; }
.floors-foot { border-top: 1px dashed var(--line); margin-top: 10px; padding: 10px 8px 2px; }
.ff-label { font-size: 10px; color: var(--ink-3); }
.ff-val { font-size: 12px; color: var(--ink-2); margin: 4px 0 3px; line-height: 1.5; }
.ff-meta { font-size: 10.5px; color: #a2aec1; }

.rooms-wrap { min-width: 0; }
.rooms { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; min-height: 320px; }
.room-card { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px 14px; box-shadow: 0 1px 2px rgba(16, 28, 45, .03); transition: .18s; }
.room-card:hover { box-shadow: 0 6px 20px rgba(22, 32, 47, .07); border-color: #dbe5f4; }
.room-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 9px; border-bottom: 1px dashed #edf1f8; }
.rh-left { display: flex; align-items: center; gap: 8px; }
.room-no { font-size: 15px; font-weight: 600; letter-spacing: .3px; }
.room-type { font-size: 11px; color: var(--ink-3); background: #f4f6fa; border-radius: 3px; padding: 1px 6px; }
.rh-right { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--ink-3); }
.room-count { color: var(--ink-2); }
.rh-divider { width: 1px; height: 10px; background: #e2e9f3; }
.room-free { color: #2e8b57; }
.room-blocked { margin-top: 10px; background: #fff8ec; border: 1px dashed #f0d5a8; color: #b97a10; border-radius: 7px; padding: 8px 10px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; }
.room-blocked small { color: #c9a15f; }

.beds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
.bed { border: 1px solid #e9eef7; border-radius: 8px; padding: 8px 9px 9px; cursor: pointer; transition: .16s; background: #fcfdff; height: 100%; }
.bed:hover { border-color: #a9c5ee; box-shadow: 0 4px 12px rgba(31, 111, 235, .08); transform: translateY(-1px); }
.bed-top { display: flex; justify-content: space-between; align-items: center; }
.bed-no { font-size: 10.5px; color: #98a6bb; }
.bed-flag { font-size: 9.5px; padding: 0 5px; border-radius: 3px; }
.bed-ico { display: flex; justify-content: center; padding: 6px 0 4px; }
.bed-info { text-align: center; }
.bed-name { font-size: 12px; color: var(--ink); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bed-name.muted { color: #a7b3c5; font-weight: 400; }
.bed-class { font-size: 10px; color: #a2aec1; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.bed.free { border-style: dashed; }
.bed.free .bed-ico { color: #c2cede; }
.bed.occupied { background: #f6fdf9; border-color: #cdeadd; }
.bed.occupied .bed-ico { color: #2e8b57; }
.bed.occupied .bed-flag { background: #e5f6ee; color: #2e8b57; }
.bed.reserved { background: #fffaf0; border-color: #f3e0bc; }
.bed.reserved .bed-ico { color: #d98416; }
.bed.reserved .bed-flag { background: #fcf1dc; color: #b97a10; }
.bed.maintenance { background: #fdf6f6; border-color: #f2d4d4; }
.bed.maintenance .bed-ico { color: #c0392b; }
.bed.maintenance .bed-flag { background: #fbe9e9; color: #c33; }

.pager { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding: 4px 2px; }
.pager-total { font-size: 12px; color: var(--ink-3); }

.dlg-bed { display: flex; align-items: center; gap: 10px; background: #f6f9fe; border: 1px solid #e3ecfa; border-radius: 8px; padding: 10px 12px; margin-bottom: 16px; }
.dlg-bed-no { font-size: 13.5px; font-weight: 500; }
.dlg-tip { font-size: 11.5px; color: var(--ink-3); margin: 0; line-height: 1.7; }
.dlg-text { font-size: 13px; color: var(--ink-2); margin: 0 0 14px; line-height: 1.8; }
.opt-row { display: flex; justify-content: space-between; gap: 18px; align-items: center; }
.opt-row small { color: #a2aec1; margin-left: 4px; }
.opt-class { font-size: 11.5px; color: #94a2b8; }
.opt-class em { font-style: normal; color: #d98416; margin-left: 6px; font-size: 10.5px; }

.audit-list { display: grid; gap: 2px; }
.audit-item { padding: 11px 2px; border-bottom: 1px dashed #eef2f8; }
.audit-head { display: flex; justify-content: space-between; align-items: baseline; }
.audit-head strong { font-size: 13px; font-weight: 500; }
.audit-time { font-size: 11px; color: #a2aec1; }
.audit-target { font-size: 12px; color: var(--ink-2); margin: 4px 0; }
.audit-change { font-size: 11.5px; color: var(--ink-3); display: flex; gap: 6px; align-items: center; background: #f7f9fd; border-radius: 5px; padding: 4px 8px; margin: 4px 0; width: fit-content; }
.audit-change i { font-style: normal; color: #b9c6d8; }
.audit-meta { font-size: 11px; color: #a2aec1; }

@media (max-width: 1400px) { .rooms { grid-template-columns: 1fr; } }
</style>
