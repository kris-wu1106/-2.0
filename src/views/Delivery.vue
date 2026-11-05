<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">交付验收与归档</h2>
        <p class="page-desc">把系统里的数据变成可以签字交付的材料：验收清单自检 → 交付报告 → 三类交付物导出 → 归档只读。</p>
      </div>
      <div class="head-actions">
        <el-tag :type="project.status === '已归档' ? 'info' : 'success'" effect="plain">{{ project.status }}</el-tag>
        <el-button v-if="project.status !== '已归档'" type="primary" :disabled="!allPass" @click="archive">归档项目</el-button>
      </div>
    </div>

    <div class="layout">
      <section class="panel checklist">
        <div class="block-head">
          <h3>验收清单</h3>
          <span class="hint">{{ passed }}/{{ checklist.length }} 项通过</span>
        </div>
        <div class="check-list">
          <div v-for="c in checklist" :key="c.key" class="check-item" :class="{ fail: !c.pass }">
            <span class="ck-ico">
              <svg v-if="c.pass" width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#2e8b57" stroke-width="1.6"/><path d="M8 12.2l2.6 2.6 5.2-5.6" stroke="#2e8b57" stroke-width="1.8" stroke-linecap="round"/></svg>
              <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#d98416" stroke-width="1.6"/><path d="M12 7.5v5.5" stroke="#d98416" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1" fill="#d98416"/></svg>
            </span>
            <div class="ck-body">
              <div class="ck-title">{{ c.title }}</div>
              <div class="ck-evidence">{{ c.evidence }}</div>
            </div>
          </div>
        </div>

        <div class="export-block">
          <div class="block-head" style="margin-bottom:10px"><h3>交付物导出</h3></div>
          <div class="export-btns">
            <el-button plain size="small" @click="exportAs('交付台账')">交付台账 CSV</el-button>
            <el-button plain size="small" @click="exportAs('分配方案')">分配方案 CSV</el-button>
            <el-button plain size="small" @click="exportAs('验收材料')">验收材料 CSV</el-button>
          </div>
          <div class="export-list">
            <div v-for="e in exports" :key="e.id" class="export-item">
              <span>{{ e.type }} · {{ e.rows }} 行</span>
              <span>{{ e.operator }} · {{ fmt(e.created_at) }}</span>
            </div>
            <p v-if="!exports.length" class="empty-tip">尚未导出任何交付物</p>
          </div>
        </div>

        <div class="export-block">
          <div class="block-head" style="margin-bottom:10px">
            <h3>变更单</h3>
            <el-button size="small" :type="project.status === '已归档' ? 'primary' : 'default'" plain @click="openChange">提交变更单</el-button>
          </div>
          <p class="empty-tip" style="margin-bottom:8px">归档项目只读；如需修改台账，唯一通道是提交变更单，批准后自动解除只读。</p>
          <div class="co-list">
            <div v-for="c in changeOrders" :key="c.id" class="co-item">
              <div class="co-main">
                <span class="co-no">#{{ c.id }} · {{ c.reason }}</span>
                <el-tag size="small" :type="c.status === '已批准' ? 'success' : c.status === '已驳回' ? 'danger' : 'warning'" effect="light">{{ c.status }}</el-tag>
              </div>
              <div class="co-meta">
                <span>{{ c.applicant }} · {{ fmt(c.created_at) }}</span>
                <span v-if="c.status === '待批准'" class="co-actions">
                  <el-button link type="primary" size="small" @click="reviewChange(c.id, 'approve')">批准并解除只读</el-button>
                  <el-button link type="danger" size="small" @click="reviewChange(c.id, 'reject')">驳回</el-button>
                </span>
                <span v-else-if="c.approver">{{ c.approver }}</span>
              </div>
            </div>
            <p v-if="!changeOrders.length" class="empty-tip">暂无变更单</p>
          </div>
        </div>
      </section>

      <section class="panel report">
        <div class="paper">
          <div class="paper-head">
            <div class="ph-sub">广西警察学院宿舍智能交付与后勤管理平台</div>
            <h2>宿舍交付验收报告</h2>
            <div class="ph-meta">
              <span>项目：{{ project.name }}</span>
              <span>生成时间：{{ report.generatedAt ? fmt(report.generatedAt) : '-' }}</span>
            </div>
          </div>

          <div class="sec">
            <h4>一、项目概况</h4>
            <p>本项目覆盖 {{ s.buildings }} 栋宿舍楼、{{ s.rooms }} 间房间、{{ s.beds }} 张床位，服务在校住宿学生 {{ s.occupied }} 人，床位入住率 {{ s.rate }}%。交付过程包含数据导入治理、床位分配、日常业务开服与验收归档四个阶段。</p>
          </div>

          <div class="sec">
            <h4>二、数据治理情况</h4>
            <p>累计执行批量导入 {{ s.imports }} 批次，学生主数据以学号为业务主键执行 upsert；导入校验覆盖 12 条规则，阻断级错误清零后方可入库。</p>
          </div>

          <div class="sec">
            <h4>三、床位资源盘点</h4>
            <div class="mini-table">
              <div><span>床位总量</span><strong>{{ s.beds }}</strong></div>
              <div><span>已入住</span><strong>{{ s.occupied }}</strong></div>
              <div><span>空闲</span><strong>{{ s.free }}</strong></div>
              <div><span>预留</span><strong>{{ s.reserved }}</strong></div>
              <div><span>维修</span><strong>{{ s.maintenance }}</strong></div>
            </div>
          </div>

          <div class="sec">
            <h4>四、日常业务运行情况</h4>
            <p>报修/调宿/退宿工单累计 {{ s.tickets }} 单，办结率 {{ s.finishRate }}%（已完工 {{ s.finishedTickets }} 单）；调宿执行 {{ s.moves }} 次，退宿办结 {{ s.checkouts }} 次；请假单 {{ s.leaves }} 条，通知 {{ s.notices }} 条；审计日志 {{ s.audit }} 条，覆盖登录、导入、分配、台账变更、审批、导出与归档。</p>
          </div>

          <div class="sec">
            <h4>五、验收结论</h4>
            <p class="conclusion">经系统自检，验收清单 {{ passed }}/{{ checklist.length }} 项通过。{{ allPass ? '台账数据完整、方案已锁定、交付物已导出，同意通过交付验收。' : '仍有未通过项，需完成整改后重新提交验收。' }}</p>
          </div>

          <div class="sign">
            <div class="sign-item"><span>宿管中心（签字）</span><i></i></div>
            <div class="sign-item"><span>广西警察学院后勤处（签字）</span><i></i></div>
            <div class="sign-item"><span>日期</span><i></i></div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const checklist = ref([])
const project = reactive({ name: '-', status: '-' })
const report = reactive({ generatedAt: '' })
const s = reactive({})
const exports = ref([])

const passed = computed(() => checklist.value.filter((c) => c.pass).length)
const allPass = computed(() => checklist.value.length > 0 && passed.value === checklist.value.length)

function fmt(t) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

async function load() {
  const [d, r, e, co] = await Promise.all([api.get('/delivery/checklist'), api.get('/delivery/report'), api.get('/delivery/exports'), api.get('/change-orders')])
  checklist.value = d.checklist
  Object.assign(project, d.project)
  Object.assign(report, { generatedAt: r.generatedAt })
  Object.assign(s, r.stats)
  exports.value = e
  changeOrders.value = co
}

// 浏览器窗口重新聚焦时（如从其他标签页完成操作后切回）自动刷新清单，避免手动切页面
let lastLoadAt = 0
async function refreshOnFocus() {
  if (Date.now() - lastLoadAt < 2000) return
  lastLoadAt = Date.now()
  await load()
}

async function exportAs(type) {
  const res = await fetch('/api/delivery/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('dorm_token')}` },
    body: JSON.stringify({ type })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return ElMessage.error(err.message || '导出失败')
  }
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${type}.csv`
  a.click()
  ElMessage.success(`${type} 已导出并记录留痕`)
  // 导出会改变清单「三类交付物均已导出」判定与归档按钮可用性，立即重载清单/报告/项目状态
  await load()
}

async function archive() {
  await ElMessageBox.confirm('归档后项目进入只读态，所有写操作将返回「归档项目只读」。确认归档？', '项目归档', {
    confirmButtonText: '确认归档', cancelButtonText: '取消', type: 'warning'
  })
  const res = await api.post('/delivery/archive')
  ElMessage.success(res.message)
  await load()
}

/* ---- 变更单 ---- */
const changeOrders = ref([])
const changeVisible = ref(false)
const changeForm = reactive({ reason: '', items: '' })

function openChange() {
  changeForm.reason = ''
  changeForm.items = ''
  changeVisible.value = true
}

async function submitChange() {
  if (!changeForm.reason.trim()) return ElMessage.warning('请填写变更原因')
  const res = await api.post('/change-orders', { reason: changeForm.reason.trim(), items: changeForm.items.trim() })
  ElMessage.success(res.message)
  changeVisible.value = false
  await load()
}

async function reviewChange(id, action) {
  const tip = action === 'approve' ? '批准后项目解除只读，恢复日常开服。确认批准？' : '驳回后变更单关闭，项目保持只读。确认驳回？'
  await ElMessageBox.confirm(tip, '变更单审批', { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' })
  const res = await api.post(`/change-orders/${id}/review`, { action })
  ElMessage.success(res.message)
  await load()
}

onMounted(() => {
  load()
  window.addEventListener('focus', refreshOnFocus)
})
onBeforeUnmount(() => window.removeEventListener('focus', refreshOnFocus))
</script>

<style scoped>
.head-actions { display: flex; align-items: center; gap: 10px; }
.layout { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
.checklist { padding: 16px 16px 18px; }
.block-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.block-head h3 { font-size: 14px; font-weight: 600; margin: 0; }
.hint { font-size: 11.5px; color: var(--ink-3); }
.check-list { display: grid; gap: 8px; }
.check-item { display: flex; gap: 9px; padding: 9px 10px; border: 1px solid #e8f4ee; background: #f9fdfb; border-radius: 8px; }
.check-item.fail { border-color: #f6e7cb; background: #fffbf3; }
.ck-ico { margin-top: 1px; }
.ck-title { font-size: 12.5px; color: var(--ink); }
.ck-evidence { font-size: 11px; color: var(--ink-3); margin-top: 3px; line-height: 1.5; }
.export-block { margin-top: 20px; border-top: 1px dashed var(--line); padding-top: 14px; }
.export-btns { display: flex; flex-wrap: wrap; gap: 8px; }
.export-list { margin-top: 10px; display: grid; gap: 6px; }
.export-item { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-3); }
.empty-tip { font-size: 11.5px; color: #a7b3c5; margin: 4px 0 0; }
.report { padding: 18px; background: #f2f4f8; }
.paper { background: #fff; border-radius: 6px; padding: 32px 36px 40px; box-shadow: 0 2px 10px rgba(22, 32, 47, .06); }
.paper-head { text-align: center; border-bottom: 1.5px solid #e6ecf5; padding-bottom: 16px; margin-bottom: 18px; }
.ph-sub { font-size: 11.5px; color: var(--ink-3); letter-spacing: 1px; }
.paper-head h2 { font-size: 20px; margin: 8px 0 10px; letter-spacing: 2px; }
.ph-meta { display: flex; justify-content: center; gap: 18px; font-size: 11px; color: var(--ink-3); }
.sec { margin-bottom: 16px; }
.sec h4 { font-size: 13px; margin: 0 0 7px; font-weight: 600; }
.sec p { font-size: 12.5px; line-height: 2; color: var(--ink-2); margin: 0; text-align: justify; }
.conclusion { color: #2e8b57 !important; }
.mini-table { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 4px; }
.mini-table div { border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
.mini-table span { font-size: 10.5px; color: var(--ink-3); }
.mini-table strong { font-size: 15px; font-weight: 600; }
.sign { display: flex; gap: 28px; margin-top: 34px; padding-top: 18px; border-top: 1px dashed var(--line); }
.sign-item { flex: 1; font-size: 11.5px; color: var(--ink-3); }
.sign-item i { display: block; height: 30px; border-bottom: 1px solid #cfd8e6; margin-top: 8px; }
.co-list { display: grid; gap: 7px; }
.co-item { border: 1px solid var(--line); border-radius: 8px; padding: 9px 11px; }
.co-main { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.co-no { font-size: 12.5px; }
.co-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--ink-3); margin-top: 5px; }
.co-actions { display: flex; gap: 4px; }
@media (max-width: 1200px) { .layout { grid-template-columns: 1fr; } }
</style>
