<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="sb-brand">
        <div class="sb-logo">
          <img src="/logo.png" alt="广西警察学院校徽" />
        </div>
        <div>
          <div class="sb-title">广西警察学院</div>
          <div class="sb-sub">宿舍智能交付 · 后勤管理平台</div>
        </div>
      </div>

      <div class="sb-project">
        <div class="sp-label">当前交付项目</div>
        <div class="sp-name">广西警察学院 · 2026 级新生宿舍交付</div>
        <div class="sp-meta"><span class="dot"></span> 交付阶段：日常开服</div>
      </div>

      <nav class="sb-nav">
        <template v-for="group in menus" :key="group.title">
          <div class="nav-group">{{ group.title }}</div>
          <template v-for="item in group.items" :key="item.label">
            <router-link v-if="item.path && item.roles.includes(role)" :to="item.path" class="nav-item" active-class="active">
              <span class="nav-ico" v-html="item.icon"></span>
              <span>{{ item.label }}</span>
            </router-link>
            <div v-else-if="item.roles.includes(role)" class="nav-item disabled">
              <span class="nav-ico" v-html="item.icon"></span>
              <span>{{ item.label }}</span>
              <em>规划中</em>
            </div>
          </template>
        </template>
      </nav>

      <div class="sb-foot">
        <div class="foot-line">方案 A · 警务蓝「严谨交付」 · Vue 3 + Express + SQLite</div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="crumbs">
          <span>首页</span>
          <i>/</i>
          <strong>{{ route.meta.title || '交付工作台' }}</strong>
        </div>
        <div class="top-actions">
          <el-tag size="small" effect="dark" class="role-tag">{{ roleLabel }}</el-tag>
          <el-dropdown trigger="click" @command="onCommand">
            <div class="user-chip">
              <span class="avatar">{{ (user.name || 'U').slice(0, 1) }}</span>
              <span class="uname">{{ user.name }}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#9FB3D4" stroke-width="2" stroke-linecap="round" /></svg>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()
const user = reactive(JSON.parse(localStorage.getItem('dorm_user') || '{}'))
const role = localStorage.getItem('dorm_role') || 'admin'
const roleLabel = computed(() => ({ admin: '宿管 · 后勤管理员', student: '学生', counselor: '辅导员', inspector: '生活部协同' }[role] || '访客'))

const icon = (d) => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none">${d}</svg>`
const ic = {
  board: icon('<rect x="3.5" y="3.5" width="7" height="7" rx="1.6" stroke="currentColor" stroke-width="1.6"/><rect x="13.5" y="3.5" width="7" height="4.5" rx="1.6" stroke="currentColor" stroke-width="1.6"/><rect x="3.5" y="14" width="7" height="6.5" rx="1.6" stroke="currentColor" stroke-width="1.6"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.6" stroke="currentColor" stroke-width="1.6"/>'),
  bed: icon('<path d="M3 18v-8m0 8h18m0 0v-4a3 3 0 00-3-3H9v7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="6.5" cy="9.5" r="2" stroke="currentColor" stroke-width="1.6"/>'),
  import: icon('<path d="M12 3v11m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  magic: icon('<path d="M5 19l9-9M14 5l.9 2.1L17 8l-2.1.9L14 11l-.9-2.1L11 8l2.1-.9L14 5zM18.5 13l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'),
  check: icon('<path d="M4 6h10M4 12h7M4 18h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14.5 16.5l2 2 4-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  home: icon('<path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'),
  ticket: icon('<path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4V8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 9v6" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2"/>'),
  notice: icon('<path d="M4 10v4a1 1 0 001 1h2l4 3V6L7 9H5a1 1 0 00-1 1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M15.5 9.5a4 4 0 010 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  leave: icon('<rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9.5 14.5l2 2 3.5-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
  service: icon('<path d="M4 12a8 8 0 1114 5.3V20h-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="2.2" stroke="currentColor" stroke-width="1.6"/>'),
  contact: icon('<circle cx="9" cy="9" r="3" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 19c.7-3 2.9-4.6 5.5-4.6s4.8 1.6 5.5 4.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16 8.5h4.5M18.2 6.3v4.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  audit: icon('<path d="M6 3.5h8l4 4V20a1 1 0 01-1 1H6a1 1 0 01-1-1V4.5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  inspect: icon('<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="M15.8 15.8L20 20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8.8 11h4.4M11 8.8v4.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>')
}

/* 方案 A 导航分组：交付主线 / 台账与业务 / 生活服务 / 系统 */
const menus = [
  { title: '交付主线', items: [
    { label: '交付工作台', path: '/dashboard', icon: ic.board, roles: ['admin', 'counselor'] },
    { label: '导入与校验', path: '/import', icon: ic.import, roles: ['admin'] },
    { label: '智能床位分配', path: '/allocate', icon: ic.magic, roles: ['admin'] },
    { label: '交付验收归档', path: '/delivery', icon: ic.check, roles: ['admin'] }
  ] },
  { title: '台账与业务', items: [
    { label: '床位管理', path: '/beds', icon: ic.bed, roles: ['admin'] },
    { label: '我的宿舍', path: '/my-dorm', icon: ic.home, roles: ['student'] },
    { label: '业务审批与工单', path: '/tickets', icon: ic.ticket, roles: ['admin', 'counselor'] }
  ] },
  { title: '生活服务', items: [
    { label: '通知与消息', path: '/notices', icon: ic.notice, roles: ['admin', 'counselor', 'student'] },
    { label: '请假与状态', path: '/leaves', icon: ic.leave, roles: ['admin', 'counselor', 'student'] },
    { label: '咨询与物品申报', path: '/services', icon: ic.service, roles: ['admin', 'counselor', 'student'] },
    { label: '宿管通讯录', path: '/contacts', icon: ic.contact, roles: ['admin', 'counselor', 'student'] },
    { label: '检查任务与记录', path: '/inspections', icon: ic.inspect, roles: ['admin', 'counselor', 'inspector'] }
  ] },
  { title: '系统', items: [
    { label: '操作日志（审计）', path: '/audit', icon: ic.audit, roles: ['admin'] }
  ] }
]

async function onCommand(cmd) {
  if (cmd !== 'logout') return
  await ElMessageBox.confirm('确认退出当前账号？', '退出登录', { confirmButtonText: '退出', cancelButtonText: '取消', type: 'warning' })
  localStorage.removeItem('dorm_token')
  localStorage.removeItem('dorm_user')
  localStorage.removeItem('dorm_role')
  router.replace('/login')
}
</script>

<style scoped>
.shell { display: flex; min-height: 100vh; }
.sidebar {
  width: 228px; flex: none;
  background: linear-gradient(180deg, var(--navy-900), #0B1B36);
  color: #C7D4E8; display: flex; flex-direction: column;
  position: sticky; top: 0; height: 100vh;
  border-right: 1px solid rgba(200, 155, 60, .18);
}
.sb-brand { display: flex; align-items: center; gap: 10px; padding: 18px 18px 16px; border-bottom: 1px solid rgba(255, 255, 255, .07); }
.sb-logo { width: 36px; height: 36px; border-radius: 50%; background: #fff; display: grid; place-items: center; padding: 3px; flex: none; box-shadow: 0 3px 10px rgba(0, 0, 0, .35), 0 0 0 2px rgba(200, 155, 60, .35); }
.sb-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }
.sb-title { font-size: 14.5px; font-weight: 700; color: #F2F6FC; letter-spacing: .4px; }
.sb-sub { font-size: 10px; color: #7E93B8; letter-spacing: 1px; margin-top: 2px; }
.sb-project { margin: 12px 12px 8px; padding: 11px 12px; border-radius: 8px; background: rgba(36, 86, 166, .22); border: 1px solid rgba(127, 155, 208, .22); }
.sp-label { font-size: 10px; color: #7E93B8; margin-bottom: 5px; }
.sp-name { font-size: 12.5px; color: #DBE7F7; line-height: 1.5; }
.sp-meta { font-size: 10.5px; color: #9FB3D4; margin-top: 6px; display: flex; align-items: center; gap: 5px; }
.dot { width: 5px; height: 5px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 0 3px rgba(200, 155, 60, .18); }
.sb-nav { padding: 8px 10px; flex: 1; overflow-y: auto; }
.nav-group { font-size: 10.5px; color: #64809F; padding: 14px 10px 7px; letter-spacing: 2px; }
.nav-item {
  display: flex; align-items: center; gap: 9px; padding: 9px 10px;
  border-radius: 6px; color: #B9C8DC; font-size: 13px; text-decoration: none;
  margin-bottom: 2px; transition: .16s; border-left: 3px solid transparent;
}
.nav-item:hover { background: rgba(255, 255, 255, .05); color: #EAF2FC; }
/* 方案 A：active 态 = 深一档蓝底 + 警徽金左边框 */
.nav-item.active { background: var(--navy-700); color: #fff; border-left-color: var(--gold); font-weight: 600; }
.nav-item.disabled { color: #5F7290; cursor: not-allowed; }
.nav-item.disabled em { margin-left: auto; font-style: normal; font-size: 9.5px; border: 1px solid #34455E; color: #647A99; border-radius: 3px; padding: 1px 4px; }
.nav-ico { display: inline-flex; opacity: .95; }
.sb-foot { padding: 12px 18px 16px; border-top: 1px solid rgba(255, 255, 255, .06); }
.foot-line { font-size: 10px; color: #4D637F; line-height: 1.6; }

.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
/* 方案 A：深警蓝顶栏 */
.topbar {
  height: 56px; background: var(--navy-900); border-bottom: 1px solid rgba(200, 155, 60, .25);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; position: sticky; top: 0; z-index: 10; color: #C7D4E8;
}
.crumbs { font-size: 13px; color: #9FB3D4; display: flex; align-items: center; gap: 7px; }
.crumbs i { font-style: normal; color: #52678A; }
.crumbs strong { color: #fff; font-weight: 600; }
.top-actions { display: flex; align-items: center; gap: 14px; }
/* 方案 A：警徽金角色徽章 */
.role-tag { background: var(--gold); border-color: var(--gold); color: #fff; font-weight: 600; }
.user-chip { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 8px; border-radius: 20px; color: #DBE7F7; font-size: 13px; }
.user-chip:hover { background: rgba(255, 255, 255, .08); }
.avatar { width: 26px; height: 26px; border-radius: 50%; background: var(--gold); color: #fff; font-size: 12px; font-weight: 700; display: grid; place-items: center; }
.uname { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.content { flex: 1; min-width: 0; }
</style>
