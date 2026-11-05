<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">宿管通讯录</h2>
        <p class="page-desc">按楼栋查看宿管与全部宿管的值班时间、办公地点、工作电话，一键拨号（仅展示工作号）。</p>
      </div>
    </div>

    <section v-for="group in grouped" :key="group.code" class="panel group">
      <div class="group-head">
        <div class="gh-left">
          <strong>{{ group.code }}</strong>
          <span>{{ group.name || '宿管中心' }}</span>
        </div>
        <el-tag v-if="group.code === '夜间应急'" type="warning" effect="plain" size="small">24 小时</el-tag>
      </div>
      <div class="cards">
        <div v-for="c in group.items" :key="c.id" class="contact">
          <div class="c-avatar">{{ c.name.slice(0, 1) }}</div>
          <div class="c-body">
            <div class="c-name">{{ c.name }}</div>
            <div class="c-line">{{ c.duty_day }} · {{ c.duty_time }}</div>
            <div class="c-line">{{ c.office }}</div>
          </div>
          <div class="c-phone">
            <span>{{ c.phone }}</span>
            <el-button size="small" plain @click="call(c)">拨号</el-button>
          </div>
        </div>
      </div>
    </section>

    <p class="foot-note">注：通讯录仅展示工作号与值班时段，个人手机号不在平台内公开；非值班时段请拨打夜间应急电话。</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const contacts = ref([])

const grouped = computed(() => {
  const map = new Map()
  contacts.value.forEach((c) => {
    if (!map.has(c.building_code)) map.set(c.building_code, { code: c.building_code, name: c.building_code === '夜间应急' ? '总值班室' : `${c.building_code} 栋`, items: [] })
    map.get(c.building_code).items.push(c)
  })
  return [...map.values()]
})

function call(c) {
  ElMessage.success(`正在呼叫 ${c.name}：${c.phone}`)
}

onMounted(async () => {
  contacts.value = await api.get('/contacts')
})
</script>

<style scoped>
.group { padding: 14px 18px 16px; margin-bottom: 14px; }
.group-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.gh-left { display: flex; align-items: baseline; gap: 8px; }
.gh-left strong { font-size: 14px; }
.gh-left span { font-size: 12px; color: var(--ink-3); }
.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.contact { display: flex; align-items: center; gap: 12px; border: 1px solid var(--line); border-radius: 9px; padding: 11px 13px; }
.c-avatar { width: 34px; height: 34px; border-radius: 50%; background: #eaf1fb; color: #2456a6; display: grid; place-items: center; font-size: 13px; flex: none; }
.c-body { flex: 1; min-width: 0; }
.c-name { font-size: 13px; font-weight: 500; }
.c-line { font-size: 11px; color: var(--ink-3); margin-top: 3px; }
.c-phone { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
.c-phone span { font-size: 12px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.foot-note { font-size: 11px; color: #a2aec1; margin-top: 6px; }
@media (max-width: 1100px) { .cards { grid-template-columns: 1fr; } }
</style>
