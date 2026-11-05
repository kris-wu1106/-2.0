<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">{{ isStudent ? '请假与我的状态' : '请假审批与状态看板' }}</h2>
        <p class="page-desc">
          学生状态由三类动作驱动：请假审批、宿管点名、学生自助报备。状态数据只读，异常项置顶。
        </p>
      </div>
      <el-button v-if="isStudent" type="primary" @click="dialog.visible = true">提交请假申请</el-button>
    </div>

    <template v-if="isStudent">
      <div class="layout">
        <section class="panel my-status">
          <div class="ms-head">
            <div>
              <div class="ms-label">当前状态</div>
              <div class="ms-state" :class="stateClass(myState.state)">{{ myState.state }}</div>
              <div class="ms-note">{{ myState.note || '无异常记录' }}</div>
              <div v-if="myState.leave" class="ms-leave">
                {{ myState.leave.status === '已通过' ? '请假已批准' : '请假申请待审批' }}：{{ myState.leave.leave_type }}
                {{ myState.leave.start_date }} ~ {{ myState.leave.end_date }}（{{ myState.leave.days }} 天）
              </div>
            </div>
            <el-tag size="small" effect="plain">数据只读</el-tag>
          </div>
          <div class="ms-tip">状态变更只能由请假审批、宿管点名或学生自助报备触发，学生不可自行修改。</div>
        </section>

        <section class="panel">
          <div class="block-head"><h3>我的请假记录</h3></div>
          <el-table :data="myLeaves" size="small">
            <el-table-column prop="leave_type" label="类型" width="70" />
            <el-table-column label="起止" min-width="190">
              <template #default="{ row }">{{ row.start_date }} ~ {{ row.end_date }}（{{ row.days }} 天）</template>
            </el-table-column>
            <el-table-column prop="reason" label="事由" show-overflow-tooltip />
            <el-table-column label="状态" width="92">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status === '已通过' ? 'success' : row.status === '已驳回' ? 'danger' : 'info'" effect="plain">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </div>
    </template>

    <template v-else>
      <section class="panel tabs-panel">
        <el-tabs v-model="tab">
          <el-tab-pane label="请假单" name="leaves">
            <el-table :data="leaves" size="small">
              <el-table-column label="学生" width="150">
                <template #default="{ row }">
                  <div class="stu-cell"><strong>{{ row.student_name }}</strong><span>{{ row.student_no }} · {{ row.class_name }}</span></div>
                </template>
              </el-table-column>
              <el-table-column label="床位" width="96">
                <template #default="{ row }">{{ row.building_code ? `${row.building_code}-${row.room_no}` : '-' }}</template>
              </el-table-column>
              <el-table-column prop="leave_type" label="类型" width="70" />
              <el-table-column label="起止" width="200">
                <template #default="{ row }">{{ row.start_date }} ~ {{ row.end_date }}（{{ row.days }} 天）</template>
              </el-table-column>
              <el-table-column prop="reason" label="事由" min-width="180" show-overflow-tooltip />
              <el-table-column label="状态" width="92">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.status === '已通过' ? 'success' : row.status === '已驳回' ? 'danger' : row.status === '已销假' ? 'info' : 'warning'" effect="plain">{{ row.status }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row }">
                  <template v-if="row.status === '待审批'">
                    <el-button link type="primary" size="small" @click="review(row, 'approve')">通过</el-button>
                    <el-button link type="danger" size="small" @click="review(row, 'reject')">驳回</el-button>
                  </template>
                  <el-button v-else-if="row.status === '已通过'" link type="primary" size="small" @click="back(row)">确认销假</el-button>
                  <span v-else class="muted">{{ row.review_note || '-' }}</span>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="状态看板" name="board">
            <div class="board-head">
              <div class="board-legend">
                <span v-for="s in ['未归', '晚归', '请假离宿', '离校实习', '在宿']" :key="s" class="lg" :class="stateClass(s)">{{ s }}</span>
              </div>
              <span class="hint">按班内状态排序，异常项置顶 · 共 {{ board.length }} 名学生</span>
            </div>
            <div class="board">
              <div v-for="st in board" :key="st.id" class="stu-chip" :class="stateClass(st.state)">
                <div class="sc-top"><strong>{{ st.name }}</strong><span>{{ st.state }}</span></div>
                <div class="sc-meta">{{ st.class_name }}</div>
                <div class="sc-loc">{{ st.building_code }}-{{ st.room_no }}-{{ st.bed_no }}床</div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </section>
    </template>

    <el-dialog v-model="dialog.visible" title="提交请假申请" width="520px">
      <el-form label-width="76px" label-position="left">
        <el-form-item label="请假类型">
          <el-radio-group v-model="dialog.leave_type">
            <el-radio-button label="事假" />
            <el-radio-button label="病假" />
          </el-radio-group>
        </el-form-item>
        <el-form-item label="起止日期">
          <el-date-picker v-model="dialog.range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" style="width:100%" />
        </el-form-item>
        <el-form-item label="事由"><el-input v-model="dialog.reason" type="textarea" :rows="3" placeholder="请说明请假原因，超过 3 天需宿管联签" /></el-form-item>
      </el-form>
      <p class="dlg-tip">超过 3 天或跨省的请假，需辅导员审批后由宿管联签；返校后请及时销假。</p>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submit">提交申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const role = localStorage.getItem('dorm_role')
const isStudent = role === 'student'
const tab = ref('leaves')
const leaves = ref([])
const board = ref([])
const myLeaves = ref([])
const myState = reactive({ state: '在宿', note: '', leave: null })
const dialog = reactive({ visible: false, leave_type: '事假', range: [], reason: '' })

function stateClass(s) {
  return {
    '未归': 'danger', '晚归': 'warn', '请假离宿': 'leave', '请假外出': 'leave', '离校实习': 'away', '在宿': 'ok'
  }[s] || 'ok'
}

async function load() {
  if (isStudent) {
    // 状态由后端按登录身份直接取，不再用账号去匹配学号（两者格式不同）
    const [mine, st] = await Promise.all([
      api.get('/leaves'),
      api.get('/my-status').catch(() => null)
    ])
    myLeaves.value = mine.slice(0, 8)
    if (st) {
      myState.state = st.state || '在宿'
      myState.leave = st.leave || null
      myState.note = st.note || (st.leave ? `${st.leave.leave_type} ${st.leave.days} 天 · ${st.leave.status}` : '')
    }
    return
  }
  leaves.value = await api.get('/leaves')
  board.value = await api.get('/status-board')
}

async function review(row, action) {
  let note = ''
  if (action === 'reject') {
    const r = await ElMessageBox.prompt('请填写驳回理由', '驳回请假', { confirmButtonText: '确认驳回', cancelButtonText: '取消' })
    note = r.value
  }
  const res = await api.post(`/leaves/${row.id}/review`, { action, note })
  ElMessage.success(res.message)
  await load()
}

async function back(row) {
  const res = await api.post(`/leaves/${row.id}/return`)
  ElMessage.success(res.message)
  await load()
}

async function submit() {
  if (!dialog.range || dialog.range.length !== 2) return ElMessage.warning('请选择请假起止日期')
  const res = await api.post('/leaves', {
    leave_type: dialog.leave_type,
    start_date: dialog.range[0],
    end_date: dialog.range[1],
    reason: dialog.reason
  })
  ElMessage.success(res.message)
  dialog.visible = false
  await load()
}

onMounted(load)
</script>

<style scoped>
.layout { display: grid; grid-template-columns: 320px 1fr; gap: 16px; align-items: start; }
.my-status { padding: 18px; }
.ms-head { display: flex; justify-content: space-between; align-items: flex-start; }
.ms-label { font-size: 11.5px; color: var(--ink-3); margin-bottom: 8px; }
.ms-state { font-size: 24px; font-weight: 600; margin-bottom: 6px; }
.ms-state.ok { color: #2e8b57; }
.ms-state.danger { color: #c0392b; }
.ms-state.warn { color: #d98416; }
.ms-state.leave { color: #2456a6; }
.ms-state.away { color: #7b8aa3; }
.ms-note { font-size: 12px; color: var(--ink-2); }
.ms-leave { margin-top: 8px; font-size: 11px; color: #5b7ba8; background: #f4f8ff; border: 1px solid #e2ecfb; border-radius: 5px; padding: 6px 9px; line-height: 1.6; }
.ms-tip { margin-top: 16px; font-size: 11px; color: var(--ink-3); line-height: 1.7; border-top: 1px dashed var(--line); padding-top: 10px; }
.tabs-panel { padding: 6px 16px 16px; }
.stu-cell strong { font-size: 12.5px; display: block; font-weight: 500; }
.stu-cell span { font-size: 10.5px; color: var(--ink-3); }
.muted { font-size: 11px; color: #a2aec1; }
.board-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.board-legend { display: flex; gap: 6px; }
.lg { font-size: 10.5px; padding: 2px 8px; border-radius: 10px; background: #f2f6f4; color: #2e8b57; }
.lg.danger { background: #fdecec; color: #c0392b; }
.lg.warn { background: #fdf4e4; color: #c07f10; }
.lg.leave { background: #edf4ff; color: #2456a6; }
.lg.away { background: #f1f3f7; color: #6f8098; }
.hint { font-size: 11px; color: var(--ink-3); }
.board { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; max-height: 460px; overflow-y: auto; }
.stu-chip { border: 1px solid var(--line); border-radius: 8px; padding: 9px 11px; background: #fff; }
.stu-chip.danger { border-color: #f2d4d4; background: #fdf7f7; }
.stu-chip.warn { border-color: #f3e2c2; background: #fffbf3; }
.stu-chip.leave { border-color: #d8e6fb; background: #f8fbff; }
.stu-chip.away { background: #fafbfd; }
.sc-top { display: flex; justify-content: space-between; align-items: baseline; }
.sc-top strong { font-size: 12.5px; font-weight: 500; }
.sc-top span { font-size: 10px; color: var(--ink-3); }
.sc-meta { font-size: 10.5px; color: var(--ink-3); margin-top: 3px; }
.sc-loc { font-size: 10.5px; color: #9aa8bd; margin-top: 2px; }
.dlg-tip { font-size: 11px; color: var(--ink-3); margin: 0; line-height: 1.7; }
@media (max-width: 1200px) { .layout { grid-template-columns: 1fr; } .board { grid-template-columns: repeat(3, 1fr); } }
</style>
