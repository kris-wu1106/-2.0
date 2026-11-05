<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">通知与消息中心</h2>
        <p class="page-desc">通知不是「发出去就算完成」——每条通知都有送达、已读、签收三段状态，未读可一键催办。</p>
      </div>
      <el-button v-if="isStaff" type="primary" @click="openCreate">发布通知</el-button>
    </div>

    <div v-if="isStaff" class="notice-grid">
      <article v-for="n in list" :key="n.id" class="panel notice-card">
        <header class="nc-head">
          <el-tag size="small" :type="levelType(n.level)" effect="dark">{{ n.level }}</el-tag>
          <span class="nc-date">{{ fmt(n.created_at) }}</span>
        </header>
        <h3>{{ n.title }}</h3>
        <p class="nc-content">{{ n.content }}</p>
        <div class="nc-meta">
          <span>发布人 {{ n.publisher }}</span>
          <span>范围 {{ n.target }}</span>
          <span v-if="n.require_sign">需签收</span>
        </div>
        <div class="nc-stats">
          <div class="st"><span>送达</span><strong>{{ n.recipients }}</strong></div>
          <div class="st"><span>已读</span><strong>{{ n.read_count }}</strong></div>
          <div class="st"><span>签收</span><strong>{{ n.signed_count }}</strong></div>
          <div class="progress"><div class="fill" :style="{ width: signRate(n) + '%' }"></div></div>
        </div>
        <div class="nc-foot">
          <span class="rate-text">签收率 {{ signRate(n) }}%</span>
          <el-button v-if="n.read_count < n.recipients" link type="primary" size="small" @click="urge(n)">一键催办未读</el-button>
        </div>
      </article>
    </div>

    <div v-else class="student-list">
      <article v-for="n in list" :key="n.id" class="panel s-card" :class="{ signed: n.mySigned }">
        <div class="s-head">
          <el-tag size="small" :type="levelType(n.level)" effect="dark">{{ n.level }}</el-tag>
          <span class="s-date">{{ fmt(n.created_at) }}</span>
        </div>
        <h3>{{ n.title }}</h3>
        <p class="s-content">{{ n.content }}</p>
        <div class="s-foot">
          <span>{{ n.publisher }}</span>
          <el-button v-if="n.require_sign && !n.mySigned" size="small" type="primary" @click="sign(n)">签收</el-button>
          <span v-else-if="n.mySigned" class="signed-tag">已签收</span>
        </div>
      </article>
    </div>

    <el-dialog v-model="dialog.visible" title="发布通知" width="560px">
      <el-form label-width="76px" label-position="left">
        <el-form-item label="标题" required><el-input v-model="dialog.title" placeholder="请输入通知标题" /></el-form-item>
        <el-form-item label="级别">
          <el-radio-group v-model="dialog.level">
            <el-radio-button label="普通" />
            <el-radio-button label="重要" />
            <el-radio-button label="紧急" />
          </el-radio-group>
        </el-form-item>
        <el-form-item label="范围">
          <el-select v-model="dialog.target" style="width: 100%">
            <el-option label="全部楼栋" value="全部楼栋" />
            <el-option v-for="b in ['1 栋', '2 栋', '3 栋', '4 栋', '5 栋', '6 栋', '7 栋']" :key="b" :label="b" :value="b" />
          </el-select>
        </el-form-item>
        <el-form-item label="需签收"><el-switch v-model="dialog.requireSign" /></el-form-item>
        <el-form-item label="正文"><el-input v-model="dialog.content" type="textarea" :rows="4" placeholder="请输入通知正文" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" @click="create">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const role = localStorage.getItem('dorm_role')
const isStaff = role === 'admin' || role === 'counselor'
const list = ref([])
const dialog = reactive({ visible: false, title: '', level: '普通', target: '全部楼栋', requireSign: false, content: '' })

function levelType(l) {
  return { 紧急: 'danger', 重要: 'warning', 普通: 'info' }[l] || 'info'
}
function fmt(t) {
  return new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}
function signRate(n) {
  if (!n.recipients) return 0
  return n.require_sign ? Math.round((n.signed_count / n.recipients) * 100) : Math.round((n.read_count / n.recipients) * 100)
}

async function load() {
  if (!isStaff) {
    list.value = await api.get('/notices/mine')
    return
  }
  list.value = await api.get('/notices')
}

function openCreate() {
  Object.assign(dialog, { visible: true, title: '', level: '普通', target: '全部楼栋', requireSign: false, content: '' })
}

async function create() {
  if (!dialog.title.trim()) return ElMessage.warning('请填写通知标题')
  const res = await api.post('/notices', dialog)
  ElMessage.success(res.message)
  dialog.visible = false
  await load()
}

function urge(n) {
  ElMessage.success(`已向 ${n.recipients - n.read_count} 名未读学生推送催办提醒`)
}

async function sign(n) {
  const res = await api.post(`/notices/${n.id}/sign`)
  n.mySigned = true
  ElMessage.success(res.message)
}

onMounted(load)
</script>

<style scoped>
.notice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.notice-card { padding: 14px 16px 12px; }
.nc-head { display: flex; justify-content: space-between; align-items: center; }
.nc-date { font-size: 11px; color: var(--ink-3); }
.notice-card h3 { font-size: 14px; margin: 9px 0 7px; line-height: 1.5; }
.nc-content { font-size: 12px; color: var(--ink-2); line-height: 1.8; margin: 0 0 10px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.nc-meta { display: flex; gap: 12px; font-size: 10.5px; color: var(--ink-3); margin-bottom: 10px; }
.nc-stats { display: flex; align-items: center; gap: 14px; }
.st { display: flex; flex-direction: column; gap: 2px; }
.st span { font-size: 10px; color: var(--ink-3); }
.st strong { font-size: 14px; font-variant-numeric: tabular-nums; }
.progress { flex: 1; height: 6px; background: #eef2f8; border-radius: 6px; overflow: hidden; }
.fill { height: 100%; background: linear-gradient(90deg, #2456a6, #5079bd); }
.nc-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.rate-text { font-size: 11px; color: var(--ink-3); }
.student-list { display: grid; gap: 12px; max-width: 860px; }
.s-card { padding: 15px 18px; }
.s-card.signed { opacity: .82; }
.s-head { display: flex; justify-content: space-between; align-items: center; }
.s-date { font-size: 11px; color: var(--ink-3); }
.s-card h3 { font-size: 14.5px; margin: 9px 0 8px; }
.s-content { font-size: 12.5px; color: var(--ink-2); line-height: 1.9; margin: 0 0 12px; }
.s-foot { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: var(--ink-3); }
.signed-tag { color: #2e8b57; font-size: 12px; }
@media (max-width: 1100px) { .notice-grid { grid-template-columns: 1fr; } }
</style>
