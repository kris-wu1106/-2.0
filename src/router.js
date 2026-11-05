import { createRouter, createWebHashHistory } from 'vue-router'
import Login from './views/Login.vue'
import Layout from './views/Layout.vue'
import Dashboard from './views/Dashboard.vue'
import Beds from './views/Beds.vue'
import MyDorm from './views/MyDorm.vue'
import Import from './views/Import.vue'
import Allocate from './views/Allocate.vue'
import Tickets from './views/Tickets.vue'
import Delivery from './views/Delivery.vue'
import Services from './views/Services.vue'
import Notices from './views/Notices.vue'
import Leaves from './views/Leaves.vue'
import Contacts from './views/Contacts.vue'
import Audit from './views/Audit.vue'
import Inspections from './views/Inspections.vue'

const routes = [
  { path: '/login', component: Login },
  {
    path: '/',
    component: Layout,
    redirect: () => (localStorage.getItem('dorm_role') === 'student' ? '/my-dorm' : '/dashboard'),
    children: [
      { path: 'dashboard', component: Dashboard, meta: { title: '数据看板', roles: ['admin', 'counselor'] } },
      { path: 'beds', component: Beds, meta: { title: '床位管理', roles: ['admin'] } },
      { path: 'import', component: Import, meta: { title: '导入与校验', roles: ['admin'] } },
      { path: 'allocate', component: Allocate, meta: { title: '智能床位分配', roles: ['admin'] } },
      { path: 'delivery', component: Delivery, meta: { title: '交付验收归档', roles: ['admin'] } },
      { path: 'tickets', component: Tickets, meta: { title: '业务审批与工单', roles: ['admin', 'counselor'] } },
      { path: 'inspections', component: Inspections, meta: { title: '生活部协同', roles: ['admin', 'counselor', 'inspector'] } },
      { path: 'notices', component: Notices, meta: { title: '通知与消息中心', roles: ['admin', 'counselor', 'student'] } },
      { path: 'leaves', component: Leaves, meta: { title: '请假与状态', roles: ['admin', 'counselor', 'student'] } },
      { path: 'services', component: Services, meta: { title: '咨询与物品申报', roles: ['admin', 'counselor', 'student'] } },
      { path: 'contacts', component: Contacts, meta: { title: '宿管通讯录', roles: ['admin', 'counselor', 'student'] } },
      { path: 'audit', component: Audit, meta: { title: '操作日志', roles: ['admin'] } },
      { path: 'my-dorm', component: MyDorm, meta: { title: '我的宿舍', roles: ['student'] } }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({ history: createWebHashHistory(), routes })

router.beforeEach((to) => {
  const token = localStorage.getItem('dorm_token')
  const role = localStorage.getItem('dorm_role')
  if (to.path !== '/login' && !token) return '/login'
  if (to.path === '/login' && token) return '/'
  if (to.meta?.roles && !to.meta.roles.includes(role)) return '/'
  return true
})

export default router
