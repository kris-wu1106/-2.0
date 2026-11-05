<template>
  <div class="login-wrap">
    <section class="brand-side">
      <div class="brand-top">
        <div class="logo-mark">
          <img src="/logo.png" alt="广西警察学院校徽" />
        </div>
        <div>
          <div class="brand-name">广西警察学院</div>
          <div class="brand-sub">GUANGXI POLICE COLLEGE</div>
        </div>
      </div>

      <div class="brand-body">
        <div class="eyebrow">2026 级新生宿舍交付 · 交付即服务</div>
        <h1>让宿舍底账<br />从「能用」走到「可交付」</h1>
        <p class="brand-desc">
          以交付项目为根实体，串联数据导入清洗、规则化床位分配、日常业务开服与验收归档。
          宿管无需实施工程师，也能独立完成一次标准化交付。
        </p>

        <ul class="brand-points">
          <li><i>01</i><div><strong>四级床位台账</strong><span>楼栋 → 楼层 → 房间 → 床位，状态与变更全留痕</span></div></li>
          <li><i>02</i><div><strong>确定性入住校验</strong><span>性别、容量、在住冲突即时拦截，不依赖人工经验</span></div></li>
          <li><i>03</i><div><strong>变更即审计</strong><span>每一次入住、退宿、预留、维修都有据可查</span></div></li>
        </ul>
      </div>

      <div class="brand-foot">广西警察学院 · 宿舍智能交付与后勤管理平台 v0.1</div>
    </section>

    <section class="form-side">
      <div class="form-card">
        <h2>登录平台</h2>
        <p class="form-sub">使用宿管中心分配的账号登录，演示环境可直接选择下方角色。</p>

        <el-form :model="form" @submit.prevent="submit" size="large">
          <el-form-item>
            <el-input v-model="form.username" placeholder="账号 / 学号" autocomplete="username">
              <template #prefix>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.4" stroke="#9aa8bd" stroke-width="1.6"/><path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6" stroke="#9aa8bd" stroke-width="1.6" stroke-linecap="round"/></svg>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item>
            <el-input v-model="form.password" type="password" show-password placeholder="密码" autocomplete="current-password">
              <template #prefix>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10" width="15" height="10" rx="2" stroke="#9aa8bd" stroke-width="1.6"/><path d="M8 10V7.5a4 4 0 018 0V10" stroke="#9aa8bd" stroke-width="1.6"/></svg>
              </template>
            </el-input>
          </el-form-item>
          <el-button type="primary" class="submit-btn" :loading="loading" @click="submit">登 录</el-button>
        </el-form>

        <div class="demo-block">
          <div class="demo-title">演示账号</div>
          <div class="demo-list">
            <button v-for="acc in accounts" :key="acc.username" class="demo-item" @click="fill(acc)">
              <span class="demo-role" :class="acc.role">{{ acc.label }}</span>
              <span class="demo-name">{{ acc.username }} / 123456</span>
            </button>
          </div>
          <p class="demo-tip">床位管理仅宿管角色可进入，学生账号登录后查看「我的宿舍」。</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../api'

const router = useRouter()
const loading = ref(false)
const form = reactive({ username: 'suguan', password: '123456' })

const accounts = [
  { label: '宿管', role: 'admin', username: 'suguan', password: '123456' },
  { label: '学生', role: 'student', username: '20260101', password: '123456' },
  { label: '辅导员', role: 'counselor', username: 'fudaoyuan', password: '123456' }
]

function fill(acc) {
  form.username = acc.username
  form.password = acc.password
}

async function submit() {
  if (!form.username || !form.password) return ElMessage.warning('请输入账号与密码')
  loading.value = true
  try {
    const data = await api.post('/auth/login', form)
    localStorage.setItem('dorm_token', data.token)
    localStorage.setItem('dorm_user', JSON.stringify(data.user))
    localStorage.setItem('dorm_role', data.user.role)
    ElMessage.success(`欢迎回来，${data.user.name}`)
    router.replace(data.user.role === 'student' ? '/my-dorm' : '/dashboard')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-wrap { min-height: 100vh; display: grid; grid-template-columns: 1.05fr .95fr; background: #fff; }

.brand-side {
  position: relative; display: flex; flex-direction: column; justify-content: space-between;
  padding: 40px 48px; color: #eaf1fb; overflow: hidden;
  background: radial-gradient(1200px 600px at 15% 10%, #1E3A6E 0%, #0F2547 55%, #0A1830 100%);
}
.brand-side::after {
  content: ''; position: absolute; right: -120px; bottom: -160px; width: 420px; height: 420px;
  border-radius: 50%; border: 1px solid rgba(120, 170, 255, .18);
  box-shadow: 0 0 0 60px rgba(120, 170, 255, .05), 0 0 0 130px rgba(120, 170, 255, .03);
}
.brand-top { display: flex; align-items: center; gap: 12px; }
.logo-mark { width: 46px; height: 46px; border-radius: 50%; background: #fff; display: grid; place-items: center; padding: 4px; box-shadow: 0 6px 18px rgba(3, 14, 30, .45), 0 0 0 2px rgba(200, 155, 60, .45); }
.logo-mark img { width: 100%; height: 100%; object-fit: contain; display: block; }
.brand-name { font-size: 16px; font-weight: 600; letter-spacing: .5px; }
.brand-sub { font-size: 10px; letter-spacing: 1.6px; color: #7f97b8; margin-top: 2px; }

.brand-body { max-width: 480px; position: relative; z-index: 1; }
.eyebrow { display: inline-block; font-size: 12px; color: #E3C98B; border: 1px solid rgba(200, 155, 60, .45); background: rgba(200, 155, 60, .12); padding: 5px 10px; border-radius: 20px; margin-bottom: 20px; }
.brand-body h1 { font-size: 34px; line-height: 1.35; font-weight: 600; margin: 0 0 16px; letter-spacing: .5px; }
.brand-desc { font-size: 13.5px; line-height: 1.9; color: #a8bad3; margin: 0 0 28px; }
.brand-points { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
.brand-points li { display: flex; gap: 12px; align-items: flex-start; }
.brand-points i { font-style: normal; font-size: 11px; color: #7fa8e8; border: 1px solid rgba(127, 168, 232, .3); border-radius: 6px; padding: 3px 6px; margin-top: 1px; }
.brand-points strong { display: block; font-size: 13.5px; font-weight: 500; margin-bottom: 3px; }
.brand-points span { font-size: 12px; color: #8ba2c1; }
.brand-foot { font-size: 11.5px; color: #5f7896; position: relative; z-index: 1; }

.form-side { display: grid; place-items: center; padding: 40px; background: linear-gradient(180deg, #fbfcff, #f5f7fc); }
.form-card { width: 100%; max-width: 372px; }
.form-card h2 { font-size: 24px; font-weight: 600; margin: 0 0 8px; }
.form-sub { font-size: 13px; color: var(--ink-3); margin: 0 0 26px; line-height: 1.7; }
.submit-btn { width: 100%; height: 44px; font-size: 15px; letter-spacing: 4px; margin-top: 4px; }

.demo-block { margin-top: 26px; padding-top: 18px; border-top: 1px dashed var(--line); }
.demo-title { font-size: 12px; color: var(--ink-3); margin-bottom: 10px; }
.demo-list { display: grid; gap: 8px; }
.demo-item { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 9px 12px; cursor: pointer; transition: .18s; text-align: left; }
.demo-item:hover { border-color: #B3C4E2; box-shadow: 0 4px 14px rgba(36, 86, 166, .10); }
.demo-role { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: var(--navy-100, #E8EEF7); color: var(--brand, #2456A6); font-weight: 600; }
.demo-role.student { background: #e8f5ee; color: #2e8b57; }
.demo-role.counselor { background: #fdf3e3; color: #b97a10; }
.demo-name { font-size: 12.5px; color: var(--ink-2); font-family: ui-monospace, Menlo, Consolas, monospace; }
.demo-tip { font-size: 11.5px; color: #a2aec1; margin: 12px 0 0; line-height: 1.7; }

@media (max-width: 960px) {
  .login-wrap { grid-template-columns: 1fr; }
  .brand-side { display: none; }
}
</style>
