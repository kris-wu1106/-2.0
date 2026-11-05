<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">操作日志（审计）</h2>
        <p class="page-desc">登录、导入、校验修复、分配、台账变更、审批、导出与归档全量留痕；日志不可修改，可按条件筛选并导出 CSV。</p>
      </div>
      <div class="head-actions">
        <el-input v-model="keyword" placeholder="搜索动作 / 对象 / 操作人" clearable style="width: 220px" @keyup.enter="load" />
        <el-button plain @click="exportCsv">导出 CSV</el-button>
      </div>
    </div>

    <section class="panel">
      <el-table :data="logs" size="small" max-height="620">
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ fmt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="actor" label="操作人" width="170" show-overflow-tooltip />
        <el-table-column prop="role" label="角色" width="80" />
        <el-table-column prop="action" label="动作" width="150" />
        <el-table-column prop="target" label="对象" min-width="180" show-overflow-tooltip />
        <el-table-column label="变更" min-width="240">
          <template #default="{ row }">
            <div v-if="row.before_value || row.after_value" class="change">
              <span>{{ row.before_value || '—' }}</span><i>→</i><span>{{ row.after_value || '—' }}</span>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" width="150" show-overflow-tooltip />
      </el-table>
      <div class="pager">
        <span class="hint">共 {{ total }} 条 · 当前展示最近 {{ logs.length }} 条</span>
        <el-pagination v-model:current-page="page" :page-size="50" :total="total" layout="prev, pager, next" background small @current-change="load" />
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const logs = ref([])
const total = ref(0)
const page = ref(1)
const keyword = ref('')

function fmt(t) {
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

async function load() {
  const data = await api.get('/audit-logs', { params: { limit: 200, page: page.value, q: keyword.value } })
  logs.value = data.items || data
  total.value = data.total || logs.value.length
}

function exportCsv() {
  const header = ['时间', '操作人', '角色', '动作', '对象', '变更前', '变更后', '原因']
  const lines = logs.value.map((l) => [fmt(l.created_at), l.actor, l.role, l.action, l.target, l.before_value, l.after_value, l.reason])
  const csv = '\uFEFF' + [header, ...lines].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = '审计日志.csv'
  a.click()
  ElMessage.success('审计日志已导出')
}

onMounted(load)
</script>

<style scoped>
.head-actions { display: flex; gap: 8px; }
.change { display: flex; gap: 6px; align-items: center; font-size: 11.5px; color: var(--ink-2); }
.change i { font-style: normal; color: #b9c6d8; }
.muted { color: #b9c6d8; font-size: 11.5px; }
.pager { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
.hint { font-size: 11.5px; color: var(--ink-3); }
</style>
