<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">交付工作台</h2>
        <p class="page-desc">当前交付项目的阶段进度、待办事项与床位运行概览，数据实时取自台账底账（SQLite）。</p>
      </div>
      <div class="head-actions">
        <span class="asof">数据截至 {{ asOf }}</span>
        <el-button plain @click="load">刷新数据</el-button>
      </div>
    </div>

    <!-- 方案 A：七阶段交付链路 -->
    <div class="stage-stepper">
      <div class="ss-title">七阶段交付链路（FDE 交付主线） · 当前阶段：日常开服</div>
      <div class="ss-steps">
        <div v-for="(s, i) in stages" :key="s" class="ss-step" :class="stageClass(i)">
          <div class="node">{{ i + 1 < curStage ? '✓' : i + 1 }}</div>
          <div class="lbl">{{ s }}</div>
        </div>
      </div>
    </div>

    <div class="stat-row" style="margin-top:16px">
      <div class="stat-card tone-gold">
        <div class="stat-icon" style="background:var(--gold-soft);color:var(--gold)">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M12 3a9 9 0 109 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </div>
        <div><div class="stat-label">床位入住率</div><div class="stat-value" style="color:var(--gold)">{{ o.rate }}<small>%</small></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--navy-100);color:var(--brand)">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M3 18v-8m0 8h18m0 0v-4a3 3 0 00-3-3H9v7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="6.5" cy="9.5" r="2" stroke="currentColor" stroke-width="1.7"/></svg>
        </div>
        <div><div class="stat-label">空置床位</div><div class="stat-value">{{ o.free }}<small>张 / 共 {{ o.total }}</small></div></div>
      </div>
      <div class="stat-card tone-danger">
        <div class="stat-icon" style="background:#FDECEA;color:var(--danger)">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M14 6.5a4 4 0 00-5.6 5.6l-4.2 4.2a1.6 1.6 0 002.2 2.3l4.3-4.3A4 4 0 0014 6.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
        </div>
        <div><div class="stat-label">待处理报修</div><div class="stat-value" style="color:var(--danger)">{{ kpi.repairs }}<small>单</small></div></div>
      </div>
      <div class="stat-card tone-warn">
        <div class="stat-icon" style="background:#FDF3E3;color:var(--warn)">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </div>
        <div><div class="stat-label">待审批申请</div><div class="stat-value" style="color:var(--warn)">{{ kpi.approvals }}<small>件</small></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--navy-100);color:var(--brand)">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.4" stroke="currentColor" stroke-width="1.7"/><path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </div>
        <div><div class="stat-label">待分配学生</div><div class="stat-value">{{ kpi.unassigned }}<small>人</small></div></div>
      </div>
    </div>

    <div class="grid">
      <!-- 方案 A：待办事项聚合表 -->
      <section class="panel block">
        <div class="block-head">
          <h3>待办事项</h3>
          <div class="legend">
            <span><i class="lg-dot" style="background:var(--danger)"></i>报修</span>
            <span><i class="lg-dot" style="background:var(--warn)"></i>审批</span>
            <span><i class="lg-dot" style="background:var(--brand)"></i>交付</span>
          </div>
        </div>
        <el-table :data="visibleTodos" size="small" style="width:100%" :max-height="showAll ? 420 : undefined" empty-text="暂无待办，交付链路畅通">
          <el-table-column label="事项" min-width="230" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="todo-title"><i class="td-dot" :style="{ background: row.color }"></i>{{ row.title }}</div>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="82">
            <template #default="{ row }">
              <el-tag size="small" effect="plain" :type="row.tagType">{{ row.type }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="来源" width="150">
            <template #default="{ row }">
              <span class="src">{{ row.source }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="94">
            <template #default="{ row }">
              <el-tag size="small" effect="light" :type="row.tagType">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="82" align="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="$router.push(row.to)">去处理</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="allTodos.length > PAGE_SIZE" class="todo-foot">
          <span>共 {{ allTodos.length }} 项待办，当前显示 {{ visibleTodos.length }} 项</span>
          <el-button link type="primary" size="small" @click="showAll = !showAll">
            {{ showAll ? '收起' : '查看全部' }}
          </el-button>
        </div>
      </section>

      <section class="panel block">
        <div class="block-head">
          <h3>今日动态</h3>
          <span class="hint">审计日志 · 不可修改</span>
        </div>
        <div class="logs">
          <div v-for="log in logs" :key="log.id" class="log-item">
            <div class="log-dot"></div>
            <div class="log-body">
              <div class="log-line"><strong>{{ log.action }}</strong><span class="log-target">{{ log.target }}</span></div>
              <div class="log-meta">{{ log.actor }} · {{ formatTime(log.created_at) }}</div>
            </div>
          </div>
          <el-empty v-if="!logs.length" description="暂无操作记录" :image-size="72" />
        </div>
      </section>
    </div>

    <section class="panel block building-block">
      <div class="block-head">
        <h3>各楼栋入住情况</h3>
        <span class="hint">{{ o.buildings }} 栋 · {{ o.rooms }} 间 · 空床 {{ o.free }} · 预留 {{ o.reserved }} · 维修 {{ o.maintenance }}</span>
      </div>
      <div class="building-list">
        <div v-for="b in o.buildingStats" :key="b.id" class="b-row">
          <div class="b-id">
            <strong>{{ b.code }}</strong>
            <el-tag size="small" :type="b.gender === '男' ? 'primary' : (b.gender === '女' ? 'danger' : 'warning')" effect="plain">{{ b.gender === '混合' ? '混住' : b.gender }}</el-tag>
          </div>
          <div class="b-name">{{ b.name }}</div>
          <div class="b-bar"><div class="b-fill" :style="{ width: b.rate + '%' }"></div></div>
          <div class="b-num">{{ b.occupied }}/{{ b.beds }} 床 · {{ b.rate }}%</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import api from '../api'

const o = reactive({ buildings: 0, rooms: 0, total: 0, occupied: 0, free: 0, reserved: 0, maintenance: 0, rate: 0, buildingStats: [] })
const logs = ref([])
const tickets = ref([])
const leaves = ref([])
const plans = ref([])
const stats = ref({ pending: 0, freeBeds: 0 })
const showAll = ref(false)
const asOf = ref('')
const PAGE_SIZE = 6

/* 七阶段交付链路（与侧栏「交付阶段：日常开服」一致，当前为前端静态配置） */
const stages = ['数据导入', '校验清洗', '规则化分配', '确认锁定', '日常开服', '交付物导出', '验收归档']
const curStage = 5

function stageClass(i) {
  if (i + 1 < curStage) return 'done'
  if (i + 1 === curStage) return 'cur'
  return ''
}

const PENDING_REPAIR = ['待受理', '处理中']
const PENDING_APPROVAL = ['待初审', '待复核', '待审批']

/* 指标：待处理报修 / 待审批申请 / 待分配学生（真实接口，无待办时归零） */
const kpi = computed(() => {
  const repairs = tickets.value.filter((t) => t.type === '报修' && PENDING_REPAIR.includes(t.status)).length
  const approvals =
    tickets.value.filter((t) => t.type !== '报修' && PENDING_APPROVAL.includes(t.status)).length +
    leaves.value.filter((l) => l.status === '待审批').length
  const unassigned = stats.value.pending
  return { repairs, approvals, unassigned }
})

/* 待办聚合：报修 / 调宿退宿 / 请假 / 未锁定方案，按时间倒序 */
const allTodos = computed(() => {
  const typeMap = {
    报修: { tagType: 'danger', color: 'var(--danger)', to: '/tickets' },
    调宿: { tagType: 'warning', color: 'var(--warn)', to: '/tickets' },
    退宿: { tagType: 'warning', color: 'var(--warn)', to: '/tickets' }
  }
  const items = []
  for (const t of tickets.value) {
    const pending = t.type === '报修' ? PENDING_REPAIR.includes(t.status) : PENDING_APPROVAL.includes(t.status)
    if (!pending) continue
    const meta = typeMap[t.type] || typeMap['报修']
    items.push({
      id: `t${t.id}`, title: t.title, type: t.type, status: t.status,
      source: `${t.student_name || '—'} · ${t.building_code ? `${t.building_code}-${t.room_no}` : '未分配'}`,
      tagType: meta.tagType, color: meta.color, to: meta.to, at: t.created_at
    })
  }
  for (const l of leaves.value) {
    if (l.status !== '待审批') continue
    items.push({
      id: `l${l.id}`, title: `${l.student_name} 申请${l.leave_type}（${l.start_date} ~ ${l.end_date}）`,
      type: '请假', status: '待审批',
      source: `${l.student_name} · ${l.building_code ? `${l.building_code}-${l.room_no}` : '未分配'}`,
      tagType: 'warning', color: 'var(--warn)', to: '/leaves', at: l.created_at
    })
  }
  for (const p of plans.value) {
    if (p.status === '已锁定') continue
    items.push({
      id: `p${p.id}`, title: `${p.name} 尚未锁定写入台账`, type: '分配', status: p.status || '草稿',
      source: `方案 v${p.version} · 已分配 ${p.metrics?.assigned ?? 0} 人`,
      tagType: 'primary', color: 'var(--brand)', to: '/allocate', at: p.created_at
    })
  }
  return items.sort((a, b) => String(b.at).localeCompare(String(a.at)))
})

/* 默认只展示前 6 项，超出时提供「查看全部 / 收起」 */
const visibleTodos = computed(() => (showAll.value ? allTodos.value : allTodos.value.slice(0, PAGE_SIZE)))

function formatTime(t) {
  if (!t) return ''
  const d = new Date(t)
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function load() {
  const [overview, audit, tk, lv, pl, st] = await Promise.allSettled([
    api.get('/overview'),
    api.get('/audit-logs', { params: { limit: 7 } }),
    api.get('/tickets'),
    api.get('/leaves'),
    api.get('/allocations'),
    api.get('/stats/pending')
  ])
  if (overview.status === 'fulfilled') Object.assign(o, overview.value)
  if (audit.status === 'fulfilled') logs.value = audit.value.items
  if (tk.status === 'fulfilled') tickets.value = tk.value
  if (lv.status === 'fulfilled') leaves.value = lv.value
  if (pl.status === 'fulfilled') plans.value = pl.value
  if (st.status === 'fulfilled') stats.value = st.value
  const now = new Date()
  asOf.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

onMounted(load)
</script>

<style scoped>
.head-actions { display: flex; align-items: center; gap: 12px; }
.asof { font-size: 11.5px; color: var(--ink-3); }
.grid { display: grid; grid-template-columns: 1.45fr 1fr; gap: 16px; }
.block { padding: 16px 18px 18px; }
.block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.block-head h3 { font-size: 14px; font-weight: 600; margin: 0; }
.hint { font-size: 11.5px; color: var(--ink-3); }
.legend { display: flex; gap: 12px; font-size: 11.5px; color: var(--ink-3); }
.legend span { display: inline-flex; align-items: center; gap: 5px; }
.lg-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.todo-title { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink); }
.td-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.src { font-size: 11.5px; color: var(--ink-3); }
.todo-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); font-size: 11.5px; color: var(--ink-3); }
.building-block { margin-top: 16px; }
.building-list { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 32px; }
.b-row { display: grid; grid-template-columns: 78px 92px 1fr 128px; align-items: center; gap: 10px; }
.b-id { display: flex; align-items: center; gap: 6px; }
.b-id strong { font-size: 13px; font-weight: 600; }
.b-name { font-size: 12.5px; color: var(--ink-2); }
.b-bar { height: 7px; background: var(--navy-100); border-radius: 3px; overflow: hidden; }
.b-fill { height: 100%; background: linear-gradient(90deg, var(--brand), var(--brand-dark)); border-radius: 3px; }
.b-num { font-size: 11.5px; color: var(--ink-3); text-align: right; font-variant-numeric: tabular-nums; }
.logs { display: grid; gap: 4px; max-height: 300px; overflow-y: auto; }
.log-item { display: flex; gap: 10px; padding: 7px 0; }
.log-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--gold); margin-top: 6px; flex: none; }
.log-line { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; }
.log-line strong { font-weight: 500; color: var(--ink); }
.log-target { color: var(--ink-3); font-size: 11.5px; }
.log-meta { font-size: 11px; color: #A7B3C5; margin-top: 2px; }
@media (max-width: 1240px) {
  .grid { grid-template-columns: 1fr; }
  .building-list { grid-template-columns: 1fr; }
}
</style>
