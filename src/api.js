import axios from 'axios'
import { ElMessage } from 'element-plus'

const api = axios.create({ baseURL: '/api', timeout: 15000 })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('dorm_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
    // 线上托管网关可能改写 Authorization，用自定义头兜底传递 token
    config.headers['X-Dorm-Token'] = token
  }
  return config
})

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status
    const message = err.response?.data?.message || '网络异常，请稍后重试'
    if (status === 401) {
      localStorage.removeItem('dorm_token')
      localStorage.removeItem('dorm_user')
      if (location.hash !== '#/login') location.hash = '#/login'
    }
    ElMessage.error(message)
    return Promise.reject(err)
  }
)

export default api
