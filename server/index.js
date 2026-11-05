import express from 'express'
import jwt from 'jsonwebtoken'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, verifyPassword, writeAudit } from './db.js'
import extraRouter, { isArchived } from './extra.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 4321
// 优先读环境变量（自建服务器部署时由 systemd 注入随机密钥）；
// 未注入时回落到固定值，兼容托管沙盒多副本场景，避免签发/验签密钥不一致导致 401。
const SECRET = process.env.JWT_SECRET || 'dorm-platform-demo-secret'

app.use(express.json())

/* ---------------- auth ---------------- */

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ message: '请输入账号与密码' })
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim())
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ message: '账号或密码错误' })
  }
  const payload = { id: user.id, username: user.username, role: user.role, name: user.name }
  const token = jwt.sign(payload, SECRET, { expiresIn: '12h' })
  res.json({ token, user: payload })
})

function auth(req, res, next) {
  // 托管平台的反向代理可能占用/改写 Authorization 头，优先使用应用自定义头
  const custom = req.headers['x-dorm-token']
  const header = custom || req.headers.authorization || ''
  const token = String(header).startsWith('Bearer ') ? String(header).slice(7) : String(header)
  if (!token) return res.status(401).json({ message: '未登录或登录已过期' })
  try {
    req.user = jwt.verify(token, SECRET)
    next()
  } catch {
    res.status(401).json({ message: '登录状态已失效，请重新登录' })
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: '当前角色无此操作权限' })
  next()
}

app.get('/api/me', auth, (req, res) => {
  res.json({ user: req.user })
})

/* ---------------- overview ---------------- */

app.get('/api/overview', auth, (req, res) => {
  const beds = db.prepare(`
    SELECT b.status, COUNT(*) AS c FROM beds b
    JOIN rooms r ON r.id = b.room_id
    JOIN buildings bl ON bl.id = r.building_id
    GROUP BY b.status
  `).all()
  const byStatus = Object.fromEntries(beds.map((r) => [r.status, r.c]))
  const buildings = db.prepare('SELECT COUNT(*) c FROM buildings').get().c
  const rooms = db.prepare('SELECT COUNT(*) c FROM rooms').get().c
  const total = beds.reduce((s, r) => s + r.c, 0)
  const occupied = byStatus['已占用'] || 0
  const reserved = byStatus['预留'] || 0
  const maintenance = byStatus['维修'] || 0
  const free = byStatus['空闲'] || 0

  const buildingStats = db.prepare(`
    SELECT bl.id, bl.code, bl.name, bl.gender,
      COUNT(DISTINCT r.id) AS rooms,
      COUNT(b.id) AS beds,
      SUM(CASE WHEN b.status = '已占用' THEN 1 ELSE 0 END) AS occupied
    FROM buildings bl
    LEFT JOIN rooms r ON r.building_id = bl.id
    LEFT JOIN beds b ON b.room_id = r.id
    GROUP BY bl.id ORDER BY bl.code
  `).all().map((b) => ({ ...b, rate: b.beds ? Math.round((b.occupied / b.beds) * 100) : 0 }))

  res.json({ buildings, rooms, total, occupied, reserved, maintenance, free, rate: total ? Math.round((occupied / total) * 100) : 0, buildingStats })
})

app.get('/api/buildings', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM buildings ORDER BY code').all())
})

/* ---------------- rooms & beds ---------------- */

app.get('/api/rooms', auth, (req, res) => {
  const { buildingId, floor, status = '', keyword = '', page = 1, pageSize = 10 } = req.query
  if (!buildingId) return res.status(400).json({ message: '缺少楼栋参数' })

  const where = ['r.building_id = ?']
  const params = [Number(buildingId)]
  if (floor) { where.push('r.floor = ?'); params.push(Number(floor)) }
  if (keyword) { where.push('r.room_no LIKE ?'); params.push(`%${keyword}%`) }
  if (status) {
    where.push(`(CASE WHEN r.status <> '可用' THEN r.status
      WHEN EXISTS (SELECT 1 FROM beds b WHERE b.room_id = r.id AND b.status = '空闲') THEN '有空床'
      ELSE '已满' END) = ?`)
    params.push(status)
  }
  const whereSql = where.join(' AND ')

  const total = db.prepare(`SELECT COUNT(*) c FROM rooms r WHERE ${whereSql}`).get(...params).c
  const offset = (Number(page) - 1) * Number(pageSize)
  const rooms = db.prepare(`
    SELECT r.* FROM rooms r WHERE ${whereSql}
    ORDER BY r.floor, r.room_no LIMIT ? OFFSET ?
  `).all(...params, Number(pageSize), offset)

  const bedStmt = db.prepare(`
    SELECT b.id, b.bed_no, b.status, b.note,
           s.id AS student_id, s.name AS student_name, s.student_no, s.class_name, s.gender AS student_gender
    FROM beds b LEFT JOIN students s ON s.id = b.student_id
    WHERE b.room_id = ? ORDER BY b.bed_no
  `)
  const list = rooms.map((room) => {
    const beds = bedStmt.all(room.id)
    return {
      ...room,
      beds,
      occupied: beds.filter((b) => b.status === '已占用').length,
      freeBeds: beds.filter((b) => b.status === '空闲').length
    }
  })
  res.json({ total, page: Number(page), pageSize: Number(pageSize), list })
})

app.get('/api/students', auth, requireAdmin, (req, res) => {
  const { keyword = '', gender = '' } = req.query
  const where = ['1 = 1']
  const params = []
  if (keyword) {
    where.push('(s.name LIKE ? OR s.student_no LIKE ? OR s.class_name LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }
  if (gender) { where.push('s.gender = ?'); params.push(gender) }
  const rows = db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM beds b WHERE b.student_id = s.id) AS in_bed
    FROM students s WHERE ${where.join(' AND ')} ORDER BY s.student_no LIMIT 30
  `).all(...params)
  res.json(rows)
})

function bedContext(bedId) {
  return db.prepare(`
    SELECT b.*, r.room_no, r.floor, r.status AS room_status, r.building_id,
           bl.code AS building_code, bl.name AS building_name, bl.gender AS building_gender
    FROM beds b JOIN rooms r ON r.id = b.room_id JOIN buildings bl ON bl.id = r.building_id
    WHERE b.id = ?
  `).get(bedId)
}

app.post('/api/beds/:id/checkin', auth, requireAdmin, (req, res) => {
  if (isArchived()) return res.status(403).json({ message: '归档项目只读：请提交变更单后再修改' })
  const bed = bedContext(Number(req.params.id))
  if (!bed) return res.status(404).json({ message: '床位不存在' })
  if (bed.room_status !== '可用') return res.status(400).json({ message: `房间当前为「${bed.room_status}」，不可办理入住` })
  if (bed.status !== '空闲') return res.status(400).json({ message: `该床位当前为「${bed.status}」，仅空闲床位可办理入住` })

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(Number(req.body?.studentId))
  if (!student) return res.status(400).json({ message: '请选择入住学生' })
  if (bed.building_gender !== '混合' && student.gender !== bed.building_gender) {
    return res.status(400).json({ message: `性别冲突：${bed.building_name}为${bed.building_gender}生楼栋，${student.name}为${student.gender}生` })
  }
  if (bed.building_gender === '混合') {
    const clash = db.prepare(`
      SELECT s.gender AS g FROM beds b2 JOIN students s ON s.id = b2.student_id
      WHERE b2.room_id = ? AND b2.status = '已占用' AND s.gender <> ? LIMIT 1
    `).get(bed.room_id, student.gender)
    if (clash) return res.status(400).json({ message: `性别冲突：房间 ${bed.building_code}-${bed.room_no} 已有${clash.g}生入住，混合楼按房间安排性别` })
  }
  const occupied = db.prepare("SELECT COUNT(*) c FROM beds WHERE student_id = ? AND status = '已占用'").get(student.id).c
  if (occupied > 0) return res.status(400).json({ message: `${student.name} 已有在住床位，请先办理退宿` })

  db.prepare("UPDATE beds SET status = '已占用', student_id = ?, note = NULL WHERE id = ?").run(student.id, bed.id)
  writeAudit({
    actor: req.user.name, role: '宿管', action: '办理入住',
    target: `${bed.building_code}-${bed.room_no}-${bed.bed_no}号床`,
    beforeValue: '空闲', afterValue: `已占用（${student.name} / ${student.student_no}）`,
    reason: req.body?.reason || '零星入住登记'
  })
  res.json({ message: '入住办理成功' })
})

app.post('/api/beds/:id/checkout', auth, requireAdmin, (req, res) => {
  if (isArchived()) return res.status(403).json({ message: '归档项目只读：请提交变更单后再修改' })
  const bed = bedContext(Number(req.params.id))
  if (!bed || bed.status !== '已占用') return res.status(400).json({ message: '该床位当前没有在住学生' })
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(bed.student_id)

  db.prepare("UPDATE beds SET status = '空闲', student_id = NULL, note = NULL WHERE id = ?").run(bed.id)
  writeAudit({
    actor: req.user.name, role: '宿管', action: '办理退宿',
    target: `${bed.building_code}-${bed.room_no}-${bed.bed_no}号床`,
    beforeValue: `已占用（${student?.name || '-'}）`, afterValue: '空闲',
    reason: req.body?.reason || '学生退宿'
  })
  res.json({ message: '退宿办理成功' })
})

app.post('/api/beds/:id/state', auth, requireAdmin, (req, res) => {
  if (isArchived()) return res.status(403).json({ message: '归档项目只读：请提交变更单后再修改' })
  const { status, reason } = req.body || {}
  const allowed = ['空闲', '预留', '维修']
  if (!allowed.includes(status)) return res.status(400).json({ message: '不支持的床位状态' })
  if (!reason || !String(reason).trim()) return res.status(400).json({ message: '状态变更必须填写原因（记入审计日志）' })

  const bed = bedContext(Number(req.params.id))
  if (!bed) return res.status(404).json({ message: '床位不存在' })
  if (bed.status === '已占用') return res.status(400).json({ message: '已占用床位需先办理退宿，再变更状态' })

  db.prepare('UPDATE beds SET status = ?, note = ? WHERE id = ?').run(status, reason, bed.id)
  writeAudit({
    actor: req.user.name, role: '宿管', action: '床位状态变更',
    target: `${bed.building_code}-${bed.room_no}-${bed.bed_no}号床`,
    beforeValue: bed.status, afterValue: status, reason
  })
  res.json({ message: '状态已更新' })
})

/* ---------------- audit & student views ---------------- */

app.get('/api/audit-logs', auth, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500)
  const page = Math.max(Number(req.query.page) || 1, 1)
  const q = String(req.query.q || '').trim()
  const where = q ? 'WHERE action LIKE ? OR target LIKE ? OR actor LIKE ?' : ''
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []
  const total = db.prepare(`SELECT COUNT(*) c FROM audit_logs ${where}`).get(...params).c
  const items = db.prepare(`SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit)
  res.json({ items, total })
})

app.get('/api/my-dorm', auth, (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ message: '仅学生账号可访问' })
  const row = db.prepare(`
    SELECT b.id AS bed_id, b.bed_no, r.room_no, r.room_type, r.floor,
           bl.code AS building_code, bl.name AS building_name, bl.manager,
           s.name, s.student_no, s.class_name
    FROM users u
    JOIN students s ON s.id = u.student_id
    LEFT JOIN beds b ON b.student_id = s.id AND b.status = '已占用'
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN buildings bl ON bl.id = r.building_id
    WHERE u.id = ?
  `).get(req.user.id)
  if (!row) return res.status(404).json({ message: '未找到住宿记录' })

  const roommates = row.bed_id
    ? db.prepare(`
        SELECT s.name, s.class_name, b.bed_no FROM beds b JOIN students s ON s.id = b.student_id
        WHERE b.room_id = (SELECT room_id FROM beds WHERE id = ?) AND b.id <> ? AND b.status = '已占用'
        ORDER BY b.bed_no
      `).all(row.bed_id, row.bed_id)
    : []
  res.json({ dorm: row, roommates })
})

/* ---------------- static ---------------- */

app.use('/api', auth, extraRouter)

const dist = path.join(__dirname, '..', 'dist')
app.use(express.static(dist))
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')))

const HOST = process.env.HOST || '0.0.0.0'
app.listen(PORT, HOST, () => {
  console.log(`Dorm platform running: http://${HOST}:${PORT}`)
})
