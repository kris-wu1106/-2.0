import express from 'express'
import { db, writeAudit } from './db.js'
import { aiStatus, isAiConfigured, retrieve, buildKnowledge, buildMessages, chatStream, chatOnce, localAnswer } from './ai.js'

/* ===================== 扩展表结构 ===================== */

db.exec(`
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                -- 报修 / 调宿 / 退宿
  student_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  priority TEXT DEFAULT '普通',
  handler TEXT,
  result TEXT,
  target_room TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  leave_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  reviewer TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_states (
  student_id INTEGER PRIMARY KEY,
  state TEXT NOT NULL,
  note TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  level TEXT NOT NULL,
  content TEXT,
  publisher TEXT NOT NULL,
  target TEXT NOT NULL,
  require_sign INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notice_receipts (
  notice_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  read_at TEXT,
  signed_at TEXT,
  PRIMARY KEY (notice_id, student_id)
);

CREATE TABLE IF NOT EXISTS standard_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,               -- 一级（严禁）/ 二级（限制）/ 三级（合规可用）
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  disposal TEXT NOT NULL,            -- 处置方式
  clause TEXT                        -- 依据条款
);

CREATE TABLE IF NOT EXISTS inspection_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  building_code TEXT NOT NULL,       -- ALL 表示全部楼栋
  check_type TEXT NOT NULL,          -- 内务检查 / 违禁品检查 / 联合检查
  deadline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '进行中',  -- 进行中 / 已完成
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inspection_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER,
  building_code TEXT NOT NULL,
  room_no TEXT NOT NULL,
  check_date TEXT NOT NULL,
  check_type TEXT NOT NULL,
  score INTEGER NOT NULL,
  issues TEXT,
  prohibited_item TEXT,
  disposal TEXT,                     -- 当场整改 / 代为保管 / 收缴上报 / 无
  checker TEXT NOT NULL,
  ticket_id INTEGER,                 -- 自动生成的整改工单
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS declarations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  power TEXT,
  location TEXT,
  status TEXT NOT NULL,
  voucher_no TEXT,
  reviewer TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS regulations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  keywords TEXT NOT NULL,
  title TEXT NOT NULL,
  clause_no TEXT NOT NULL,
  content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  matched_clause TEXT,
  escalated INTEGER DEFAULT 0,
  source TEXT DEFAULT 'rule',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS duty_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_code TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  duty_day TEXT NOT NULL,
  duty_time TEXT NOT NULL,
  office TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  metrics TEXT,
  rules TEXT,
  created_at TEXT NOT NULL,
  locked_at TEXT
);

CREATE TABLE IF NOT EXISTS allocation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  allocation_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  bed_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS export_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  scope TEXT,
  rows INTEGER,
  operator TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_no TEXT NOT NULL,
  file_name TEXT,
  rows INTEGER,
  ok_rows INTEGER,
  error_rows INTEGER,
  warn_rows INTEGER,
  status TEXT,
  operator TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS change_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reason TEXT NOT NULL,
  items TEXT,
  status TEXT NOT NULL,              -- 待批准 / 已批准 / 已驳回
  applicant TEXT NOT NULL,
  approver TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS project (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  archived_at TEXT
);
`)

export function isArchived() {
  const p = db.prepare('SELECT status FROM project WHERE id = 1').get()
  return p?.status === '已归档'
}

export function archiveGuard(req, res, next) {
  if (isArchived() && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return res.status(403).json({ message: '归档项目只读：请提交变更单后再修改' })
  }
  next()
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) return res.status(403).json({ message: `无权限：该操作仅限 ${roles.join(' / ')}` })
    next()
  }
}

/* ===================== 种子数据 ===================== */

function seedExtra() {
  const now = new Date()
  const iso = (offsetDays = 0, hour = 9) => {
    const d = new Date(now)
    d.setDate(d.getDate() + offsetDays)
    d.setHours(hour, 30, 0, 0)
    return d.toISOString()
  }

  if (!db.prepare('SELECT id FROM project WHERE id = 1').get()) {
    db.prepare('INSERT INTO project (id, name, status) VALUES (1, ?, ?)').run('广西警察学院 · 2026 级新生宿舍交付', '日常开服')
  }

  if (!db.prepare('SELECT COUNT(*) c FROM regulations').get().c) {
    const regs = [
      ['大功率电器', '电煮锅,锅,加热,煮', '学生宿舍违禁物品管理规定', '第三章 第 12 条', '严禁在宿舍内使用电煮锅、电饭煲、电磁炉等烹饪类电器。违者由宿管中心代为保管，学期末退还，并记录一次违规。'],
      ['大功率电器', '热得快,烧水,水壶', '学生宿舍违禁物品管理规定', '第三章 第 13 条', '严禁使用热得快、电热水壶（功率超过 800W）等大功率加热器具，宿舍楼配电容量为每间 2000W。'],
      ['大功率电器', '电磁炉,电陶炉,做饭', '学生宿舍违禁物品管理规定', '第三章 第 12 条', '严禁在宿舍内使用电煮锅、电饭煲、电磁炉等烹饪类电器。违者由宿管中心代为保管，学期末退还，并记录一次违规。'],
      ['取暖设备', '电热毯,取暖器,小太阳', '学生宿舍违禁物品管理规定', '第三章 第 15 条', '禁止使用电热毯、电暖器等取暖设备，冬季供暖由学校统一保障（11 月 15 日至次年 3 月 15 日）。'],
      ['宠物', '宠物,猫,狗,仓鼠', '学生宿舍管理规定', '第四章 第 21 条', '宿舍内不得饲养猫、狗、仓鼠等宠物，导盲犬等工作犬除外。'],
      ['消防', '酒精炉,蜡烛,明火,烧烤', '学生宿舍消防安全管理办法', '第二章 第 8 条', '严禁在宿舍内使用明火、酒精炉、蜡烛，严禁在楼道焚烧物品。'],
      ['电器申报', '吹风机,风扇,加湿器,申报', '学生宿舍用电管理办法', '第五章 第 30 条', '功率 800W 以下的吹风机、加湿器可申请入楼使用，须在平台提交物品申报并经宿管审核，凭入楼凭证使用。']
    ]
    const ins = db.prepare('INSERT INTO regulations (category, keywords, title, clause_no, content) VALUES (?, ?, ?, ?, ?)')
    regs.forEach((r) => ins.run(...r))
  }

  if (!db.prepare('SELECT COUNT(*) c FROM standard_items').get().c) {
    const std = [
      ['一级（严禁）', '明火易燃', '酒精炉、蜡烛、打火机气罐、烧烤用具', '收缴上报，通报辅导员', '学生宿舍消防安全管理办法 第二章 第 8 条'],
      ['一级（严禁）', '烹饪电器', '电煮锅、电饭煲、电磁炉、电陶炉', '代为保管，学期末退还，记违规 1 次', '学生宿舍违禁物品管理规定 第三章 第 12 条'],
      ['一级（严禁）', '高危加热', '热得快、电热毯、电暖器（小太阳）', '代为保管，学期末退还', '学生宿舍违禁物品管理规定 第三章 第 13/15 条'],
      ['一级（严禁）', '管制物品', '管制刀具、赌具、毒品及吸食工具', '收缴上报，移交保卫处', '学生宿舍管理规定 第四章 第 19 条'],
      ['二级（限制）', '大功率电器', '额定功率 > 800W 且非烹饪/加热类电器', '未申报代为保管；申报获批可使用', '学生宿舍用电管理办法 第五章 第 30 条'],
      ['二级（限制）', '宠物', '猫、狗、仓鼠等（导盲犬等工作犬除外）', '限期带离，逾期上报学院', '学生宿舍管理规定 第四章 第 21 条'],
      ['三级（合规可用）', '低功率电器', '≤800W 吹风机、加湿器、风扇、台灯', '申报后直接放行', '学生宿舍用电管理办法 第五章 第 30 条'],
      ['三级（合规可用）', '学习生活用品', '电脑、插线板（带 3C 认证）、蚊帐', '直接放行', '学生宿舍管理规定 第一章 第 4 条']
    ]
    const insS = db.prepare('INSERT INTO standard_items (level, category, name, disposal, clause) VALUES (?, ?, ?, ?, ?)')
    std.forEach((r) => insS.run(...r))
  }

  if (!db.prepare('SELECT COUNT(*) c FROM duty_schedule').get().c) {
    const rows = [
      ['1', '李秀兰', '0771-5601-2301', '周一 / 周三 / 周五', '08:00 - 17:30', '1 栋一层值班室'],
      ['1', '王建国', '0771-5601-2302', '周二 / 周四 / 周六', '08:00 - 17:30', '1 栋一层值班室'],
      ['2', '刘志强', '0771-5601-2401', '周一 / 周二 / 周四', '08:00 - 17:30', '2 栋一层值班室'],
      ['4', '张慧敏', '0771-5601-3501', '周一 / 周三 / 周日', '08:00 - 17:30', '4 栋一层值班室'],
      ['5', '赵丽娟', '0771-5601-3601', '周二 / 周五 / 周六', '08:00 - 17:30', '5 栋一层值班室'],
      ['3', '孙立平', '0771-5601-2501', '周一 / 周四 / 周日', '08:00 - 17:30', '3 栋一层值班室'],
      ['6', '李红梅', '0771-5601-3701', '周一 / 周二 / 周五', '08:00 - 17:30', '6 栋一层值班室'],
      ['7', '周雅琴', '0771-5601-3801', '周三 / 周四 / 周六', '08:00 - 17:30', '7 栋一层值班室'],
      ['夜间应急', '值班手机', '0771-5601-9999', '每日', '17:30 - 次日 08:00', '宿管中心总值班室']
    ]
    const ins = db.prepare('INSERT INTO duty_schedule (building_code, name, phone, duty_day, duty_time, office) VALUES (?, ?, ?, ?, ?, ?)')
    rows.forEach((r) => ins.run(...r))
  }

  const studentAt = (i) => db.prepare('SELECT id, name, class_name FROM students ORDER BY id LIMIT 1 OFFSET ?').get(i)

  if (!db.prepare('SELECT COUNT(*) c FROM tickets').get().c) {
    const ins = db.prepare('INSERT INTO tickets (type, student_id, title, description, status, priority, handler, result, target_room, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const repair = [
      ['卫生间下水道堵塞，积水无法排出', '待受理', '紧急', null],
      ['阳台晾衣杆脱落', '处理中', '普通', '维修班已上门，等待配件'],
      ['宿舍门锁卡顿，钥匙难以转动', '待受理', '普通', null],
      ['上铺床板松动，存在安全隐患', '已完工', '紧急', '已更换床板并加固'],
      ['空调不制冷', '已完工', '普通', '补充冷媒，已恢复正常']
    ]
    repair.forEach((r, i) => {
      const s = studentAt(i * 7)
      ins.run('报修', s.id, r[0], '学生自助提交，附现场照片 1 张', r[1], r[2], r[1] === '待受理' ? null : '维修班 · 周师傅', r[3], null, iso(-i - 1), iso(-i))
    })
    const move = [
      ['因转专业希望调至 4 栋同班同学宿舍', '待初审', '普通', '4-302'],
      ['与室友作息冲突，申请调宿', '待复核', '普通', '2-105'],
      ['身体原因需调至低楼层', '已通过', '紧急', '1-102']
    ]
    move.forEach((r, i) => {
      const s = studentAt(i * 11 + 2)
      ins.run('调宿', s.id, r[0], '目标房间：' + r[3], r[1], r[2], r[1] === '待初审' ? null : '李秀兰（宿管中心）', r[1] === '已通过' ? '初审通过，待辅导员复核' : null, r[3], iso(-i - 2), iso(-i))
    })
    const quit = [
      ['毕业实习离校，申请退宿', '待审批', '普通', '物品已清空，钥匙待交回'],
      ['休学一年，办理退宿', '已办结', '普通', '已完成物品交接与床位释放']
    ]
    quit.forEach((r, i) => {
      const s = studentAt(i * 17 + 5)
      ins.run('退宿', s.id, r[0], r[3], r[1], r[2], r[1] === '待审批' ? null : '李秀兰（宿管中心）', r[3], null, iso(-i - 1), iso(-i))
    })
  }

  if (!db.prepare('SELECT COUNT(*) c FROM leaves').get().c) {
    const ins = db.prepare('INSERT INTO leaves (student_id, leave_type, start_date, end_date, days, reason, status, reviewer, review_note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const rows = [
      [3, '病假', iso(0).slice(0, 10), iso(2).slice(0, 10), 3, '急性肠胃炎，附校医院证明', '已通过', '陈静（26级侦查学1区队辅导员）', '注意休息，返校后销假'],
      [9, '事假', iso(1).slice(0, 10), iso(1).slice(0, 10), 1, '家中事务需返乡处理', '待审批', null, null],
      [15, '病假', iso(-3).slice(0, 10), iso(-1).slice(0, 10), 3, '发热就诊', '已销假', '陈静（26级侦查学1区队辅导员）', '已返校销假'],
      [21, '事假', iso(3).slice(0, 10), iso(7).slice(0, 10), 5, '参加省级竞赛集训（跨省）', '待审批', null, null]
    ]
    rows.forEach((r) => ins.run(...r, iso(-2)))
  }

  if (!db.prepare('SELECT COUNT(*) c FROM student_states').get().c) {
    const ins = db.prepare('INSERT INTO student_states (student_id, state, note, updated_at) VALUES (?, ?, ?, ?)')
    ins.run(3, '请假外出', '病假 3 天，已审批', iso(0))
    ins.run(30, '晚归', '22:40 归寝，已登记', iso(-1, 22))
    ins.run(44, '未归', '点名未到，已联系辅导员', iso(-1, 23))
    ins.run(58, '离校实习', '毕业实习，已备案', iso(-5))
  }

  if (!db.prepare('SELECT COUNT(*) c FROM notices').get().c) {
    const ins = db.prepare('INSERT INTO notices (title, level, content, publisher, target, require_sign, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    ins.run('关于开展 2026 年秋季宿舍安全大检查的通知', '重要', '本周四 19:00-21:00 对全部宿舍开展用电安全与消防通道检查，请同学们提前整理桌面与阳台，检查期间留人在寝。', '陈静（26级侦查学1区队辅导员）', '全部区队', 1, iso(-1))
    ins.run('4 栋热水系统检修停水通知', '紧急', '11 月 5 日 09:00-16:00 4 栋热水系统检修，期间暂停热水供应，请提前储水。', '张慧敏（4 栋管理员）', '4 栋', 0, iso(-2))
    ins.run('宿舍文化节报名开始', '普通', '第十届宿舍文化节开始报名，以宿舍为单位提交布置方案，11 月 20 日截止。', '宿管中心', '全部楼栋', 0, iso(-4))
  }

  if (!db.prepare('SELECT COUNT(*) c FROM declarations').get().c) {
    const ins = db.prepare('INSERT INTO declarations (student_id, item_name, quantity, power, location, status, voucher_no, reviewer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    ins.run(7, '吹风机', 1, '1200W', '1-204 书桌抽屉', '待审核', null, null, iso(-1))
    ins.run(12, '加湿器', 1, '35W', '4-301 床头柜', '已通过', 'RZ-2026-0007', '李秀兰（宿管中心）', iso(-3))
    ins.run(26, '电煮锅', 1, '800W', '2-402 阳台', '已驳回', null, '李秀兰（宿管中心）', iso(-4))
  }

  if (!db.prepare('SELECT COUNT(*) c FROM consultations').get().c) {
    const ins = db.prepare('INSERT INTO consultations (student_id, question, answer, matched_clause, escalated, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    ins.run(4, '电煮锅能不能带？', '不可以。依据《学生宿舍违禁物品管理规定》第三章 第 12 条：严禁在宿舍内使用电煮锅、电饭煲、电磁炉等烹饪类电器。', '第三章 第 12 条', 0, iso(-1))
    ins.run(8, '可以在宿舍养仓鼠吗？', '不可以。依据《学生宿舍管理规定》第四章 第 21 条：宿舍内不得饲养猫、狗、仓鼠等宠物。', '第四章 第 21 条', 0, iso(-2))
  }

  // 通知签收状态：为部分学生生成已读/已签收记录
  const noticeIds = db.prepare('SELECT id, require_sign FROM notices').all()
  const students = db.prepare('SELECT id FROM students ORDER BY id LIMIT 60').all()
  const receiptStmt = db.prepare('INSERT OR IGNORE INTO notice_receipts (notice_id, student_id, read_at, signed_at) VALUES (?, ?, ?, ?)')
  noticeIds.forEach((n, ni) => {
    students.forEach((s, si) => {
      if (si % 3 === 0) return
      const read = iso(-ni - 1, 12)
      receiptStmt.run(n.id, s.id, read, n.require_sign && si % 4 !== 0 ? read : null)
    })
  })
}

seedExtra()

/* ===================== 通用工具 ===================== */

const nowIso = () => new Date().toISOString()
const router = express.Router()

function studentById(id) {
  return db.prepare('SELECT * FROM students WHERE id = ?').get(id)
}

/**
 * 混合楼（男女混住）按「房间」定性别：房间内已有在住学生时性别跟随在住学生，
 * 空房间两性均可入住。返回 true 表示该性别学生可入住此房间。
 */
function roomGenderOk(roomId, gender) {
  const row = db.prepare(`
    SELECT s.gender AS g FROM beds b JOIN students s ON s.id = b.student_id
    WHERE b.room_id = ? AND b.status = '已占用' AND s.gender <> ?
    LIMIT 1
  `).get(roomId, gender)
  return !row
}

function bedOfStudent(studentId) {
  return db.prepare(`
    SELECT b.id AS bed_id, b.bed_no, r.room_no, r.id AS room_id, bl.code AS building_code, bl.name AS building_name, bl.id AS building_id
    FROM beds b JOIN rooms r ON r.id = b.room_id JOIN buildings bl ON bl.id = r.building_id
    WHERE b.student_id = ? AND b.status = '已占用'
  `).get(studentId)
}

function bumpTicket(id, fields) {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  if (!t) return null
  const next = { ...t, ...fields, updated_at: nowIso() }
  db.prepare('UPDATE tickets SET status = ?, handler = ?, result = ?, updated_at = ? WHERE id = ?')
    .run(next.status, next.handler, next.result, next.updated_at, id)
  return next
}

/* ===================== 项目 / 工单 ===================== */

router.get('/project', (req, res) => {
  res.json(db.prepare('SELECT * FROM project WHERE id = 1').get())
})

router.get('/stats/pending', (req, res) => {
  const pending = db.prepare(`
    SELECT COUNT(*) c FROM students s
    WHERE s.id NOT IN (SELECT student_id FROM beds WHERE student_id IS NOT NULL AND status = '已占用')
  `).get().c
  const freeBeds = db.prepare(`
    SELECT COUNT(*) c FROM beds b JOIN rooms r ON r.id = b.room_id
    WHERE b.status = '空闲' AND r.status = '可用'
  `).get().c
  res.json({ pending, freeBeds })
})

/* 增量迁移：调宿申请记录学生选定的目标床位 */
try {
  db.exec('ALTER TABLE tickets ADD COLUMN target_bed INTEGER')
} catch { /* 列已存在，忽略 */ }

/**
 * 调宿可选空床分布：按楼栋聚合「房间 → 空闲床位」。
 * 仅返回与学生同性别、房间状态可用的床位；不传 building 时返回全部可申请楼栋。
 */
router.get('/free-beds', (req, res) => {
  const sid = db.prepare('SELECT student_id FROM users WHERE id = ?').get(req.user.id)?.student_id
  if (!sid) return res.status(403).json({ message: '仅学生账号可查询空床分布' })
  const stu = studentById(sid)
  if (!stu) return res.status(404).json({ message: '学生档案不存在' })

  const code = String(req.query.building || '').trim()
  const params = [stu.gender, stu.gender]
  // 同性别楼栋 + 混合楼（6/7 栋）中无异性在住的房间
  let where = `b.status = '空闲' AND r.status = '可用' AND (bl.gender = ? OR bl.gender = '混合')
    AND NOT EXISTS (SELECT 1 FROM beds b2 JOIN students s2 ON s2.id = b2.student_id
                    WHERE b2.room_id = r.id AND b2.status = '已占用' AND s2.gender <> ?)`
  if (code) { where += ' AND bl.code = ?'; params.push(code) }

  const rows = db.prepare(`
    SELECT b.id AS bed_id, b.bed_no, r.room_no, r.floor, r.room_type,
           bl.code AS building_code, bl.name AS building_name
    FROM beds b
    JOIN rooms r ON r.id = b.room_id
    JOIN buildings bl ON bl.id = r.building_id
    WHERE ${where}
    ORDER BY bl.code, r.floor, r.room_no, b.bed_no
  `).all(...params)

  // 房间聚合：一次下发，前端直接渲染「楼栋 → 房间 → 空床号」
  const roomMap = new Map()
  for (const r of rows) {
    const key = `${r.building_code}-${r.room_no}`
    if (!roomMap.has(key)) {
      roomMap.set(key, {
        building_code: r.building_code,
        building_name: r.building_name,
        room_no: r.room_no,
        floor: r.floor,
        room_type: r.room_type,
        beds: []
      })
    }
    roomMap.get(key).beds.push({ id: r.bed_id, bed_no: r.bed_no })
  }

  const buildingMap = new Map()
  for (const room of roomMap.values()) {
    if (!buildingMap.has(room.building_code)) {
      buildingMap.set(room.building_code, {
        code: room.building_code, name: room.building_name, freeCount: 0, roomCount: 0
      })
    }
    const b = buildingMap.get(room.building_code)
    b.freeCount += room.beds.length
    b.roomCount += 1
  }

  res.json({
    gender: stu.gender,
    buildings: [...buildingMap.values()],
    rooms: [...roomMap.values()]
  })
})

/** 当前登录学生的住宿状态（含生效中的请假单），避免前端用账号去匹配学号 */
router.get('/my-status', (req, res) => {
  const sid = db.prepare('SELECT student_id FROM users WHERE id = ?').get(req.user.id)?.student_id
  if (!sid) return res.json({ state: '', note: '', updated_at: '', leave: null })
  const st = db.prepare('SELECT state, note, updated_at FROM student_states WHERE student_id = ?').get(sid)
  const leave = db.prepare(`
    SELECT id, leave_type, start_date, end_date, days, status FROM leaves
    WHERE student_id = ? AND status IN ('待审批', '已通过') ORDER BY created_at DESC LIMIT 1
  `).get(sid)
  res.json({
    state: st?.state || '在宿',
    note: st?.note || '',
    updated_at: st?.updated_at || '',
    leave: leave || null
  })
})

router.get('/tickets', (req, res) => {
  const { type = '', status = '' } = req.query
  const where = ['1 = 1']
  const params = []
  if (type) { where.push('t.type = ?'); params.push(type) }
  if (status) { where.push('t.status = ?'); params.push(status) }
  const rows = db.prepare(`
    SELECT t.*, s.name AS student_name, s.student_no, s.class_name,
           bl.code AS building_code, r.room_no, tb.bed_no AS target_bed_no
    FROM tickets t
    JOIN students s ON s.id = t.student_id
    LEFT JOIN beds b ON b.student_id = s.id AND b.status = '已占用'
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN buildings bl ON bl.id = r.building_id
    LEFT JOIN beds tb ON tb.id = t.target_bed
    WHERE ${where.join(' AND ')}
    ORDER BY t.created_at DESC
  `).all(...params)
  res.json(rows)
})

router.post('/tickets', archiveGuard, requireRole('student'), (req, res) => {
  const sid = db.prepare('SELECT student_id FROM users WHERE id = ?').get(req.user.id)?.student_id
  if (!sid) return res.status(403).json({ message: '仅学生账号可提交申请' })
  const stu = studentById(sid)
  const { type = '报修', description = '', targetBuilding = '', targetRoom = '', targetBedId = null } = req.body || {}
  if (!['报修', '调宿'].includes(type)) return res.status(400).json({ message: '不支持的申请类型' })
  if (!String(description).trim()) return res.status(400).json({ message: '请填写描述' })

  let target = null
  let bedId = null
  if (type === '调宿') {
    const code = String(targetBuilding || '').trim()
    const roomNo = String(targetRoom || '').trim()
    if (!code || !roomNo) return res.status(400).json({ message: '请选择意向楼栋与房间号' })
    const room = db.prepare('SELECT r.*, bl.gender AS bg, bl.name AS bname FROM rooms r JOIN buildings bl ON bl.id = r.building_id WHERE bl.code = ? AND r.room_no = ?').get(code, roomNo)
    if (!room) return res.status(400).json({ message: `目标房间 ${code}-${roomNo} 不存在` })
    if (room.bg !== '混合' && room.bg !== stu.gender) return res.status(400).json({ message: '目标楼栋性别属性与学生不符，校验不通过' })
    if (room.bg === '混合' && !roomGenderOk(room.id, stu.gender)) return res.status(400).json({ message: '目标房间已有异性学生入住，不可申请' })
    if (room.status !== '可用') return res.status(400).json({ message: `目标房间当前状态为「${room.status}」，不可申请` })
    // 学生自选床位：必须属于目标房间且仍空闲，避免提交瞬间被他人占用
    if (targetBedId) {
      const bed = db.prepare('SELECT * FROM beds WHERE id = ?').get(Number(targetBedId))
      if (!bed) return res.status(400).json({ message: '所选床位不存在' })
      if (bed.room_id !== room.id) return res.status(400).json({ message: '所选床位不属于目标房间' })
      if (bed.status !== '空闲') return res.status(400).json({ message: `所选 ${bed.bed_no} 号床已被占用，请重新选择` })
      bedId = bed.id
    }
    target = `${code}-${roomNo}`
  }

  const now = nowIso()
  const title = type === '报修' ? `报修：${String(description).slice(0, 24)}` : `调宿申请：意向 ${target}${bedId ? `（指定 ${db.prepare('SELECT bed_no FROM beds WHERE id = ?').get(bedId).bed_no} 号床）` : ''}`
  const id = Number(db.prepare('INSERT INTO tickets (type, student_id, title, description, status, target_room, target_bed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(type, sid, title, description, '待初审', target, bedId, now, now).lastInsertRowid)
  writeAudit({ actor: stu.name, role: '学生', action: type === '报修' ? '提交报修单' : '提交调宿申请', target: `工单 #${id}`, beforeValue: '-', afterValue: target || '待受理', reason: description.slice(0, 40) })
  res.json({ message: type === '报修' ? '报修单已提交，等待宿管受理' : '调宿申请已提交，等待宿管初审', id })
})

router.get('/tickets/mine', (req, res) => {
  const sid = db.prepare('SELECT student_id FROM users WHERE id = ?').get(req.user.id)?.student_id
  if (!sid) return res.json([])
  const rows = db.prepare(`
    SELECT t.*, bl.code AS building_code, r.room_no, b.bed_no
    FROM tickets t
    LEFT JOIN beds b ON b.student_id = t.student_id AND b.status = '已占用'
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN buildings bl ON bl.id = r.building_id
    WHERE t.student_id = ?
    ORDER BY t.created_at DESC
  `).all(sid)
  res.json(rows)
})

router.post('/tickets/:id/action', archiveGuard, requireRole('admin', 'counselor'), (req, res) => {
  const id = Number(req.params.id)
  const { action, note = '' } = req.body || {}
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  if (!t) return res.status(404).json({ message: '工单不存在' })
  const stu = studentById(t.student_id)

  if (t.type === '报修') {
    if (action === 'accept') bumpTicket(id, { status: '处理中', handler: req.user.name })
    else if (action === 'finish') bumpTicket(id, { status: '已完工', handler: req.user.name, result: note || '维修完成，已验收' })
    else return res.status(400).json({ message: '不支持的报修操作' })
  } else if (t.type === '调宿') {
    if (action === 'approve') {
      if (t.status === '待初审') bumpTicket(id, { status: '待复核', handler: req.user.name, result: '宿管初审通过，转辅导员复核' })
      else if (t.status === '待复核') {
        // 执行调宿：释放原床位，分配到目标房间空床
        const target = String(t.target_room || '')
        const [code, roomNo] = target.split('-')
        const room = db.prepare('SELECT r.*, bl.gender AS building_gender FROM rooms r JOIN buildings bl ON bl.id = r.building_id WHERE bl.code = ? AND r.room_no = ?').get(code, roomNo)
        if (!room) return res.status(400).json({ message: `目标房间 ${target} 不存在` })
        if (room.building_gender !== '混合' && room.building_gender !== stu.gender) return res.status(400).json({ message: '目标楼栋性别与学生不符' })
        if (room.building_gender === '混合' && !roomGenderOk(room.id, stu.gender)) return res.status(400).json({ message: '目标房间已有异性学生入住，无法执行调宿' })
        // 优先分配学生指定的床位；该床若已被占用则回退到房间内任一空床
        const picked = t.target_bed
          ? db.prepare("SELECT * FROM beds WHERE id = ? AND room_id = ? AND status = '空闲'").get(t.target_bed, room.id)
          : null
        const bed = picked || db.prepare("SELECT * FROM beds WHERE room_id = ? AND status = '空闲' ORDER BY bed_no LIMIT 1").get(room.id)
        if (!bed) return res.status(400).json({ message: '目标房间暂无空闲床位' })
        const old = bedOfStudent(stu.id)
        if (old) db.prepare("UPDATE beds SET status = '空闲', student_id = NULL WHERE id = ?").run(old.bed_id)
        db.prepare("UPDATE beds SET status = '已占用', student_id = ? WHERE id = ?").run(stu.id, bed.id)
        bumpTicket(id, { status: '已执行', handler: req.user.name, result: `已由 ${old ? old.building_code + '-' + old.room_no : '未分配'} 调整至 ${code}-${roomNo}` })
        writeAudit({ actor: req.user.name, role: '宿管', action: '调宿执行', target: `${stu.name}（${stu.student_no}）`, beforeValue: old ? `${old.building_code}-${old.room_no}-${old.bed_no}号床` : '无床位', afterValue: `${code}-${roomNo}-${bed.bed_no}号床`, reason: t.title })
      } else return res.status(400).json({ message: '当前状态不可通过' })
    } else if (action === 'reject') bumpTicket(id, { status: '已驳回', handler: req.user.name, result: note || '不符合调宿条件' })
    else return res.status(400).json({ message: '不支持的调宿操作' })
  } else if (t.type === '退宿') {
    if (action === 'approve') {
      const old = bedOfStudent(stu.id)
      if (old) db.prepare("UPDATE beds SET status = '空闲', student_id = NULL WHERE id = ?").run(old.bed_id)
      bumpTicket(id, { status: '已办结', handler: req.user.name, result: note || '已办理退宿，床位释放' })
      writeAudit({ actor: req.user.name, role: '宿管', action: '退宿办理', target: `${stu.name}（${stu.student_no}）`, beforeValue: old ? `${old.building_code}-${old.room_no}-${old.bed_no}号床` : '无床位', afterValue: '空闲', reason: t.title })
    } else if (action === 'reject') bumpTicket(id, { status: '已驳回', handler: req.user.name, result: note || '材料不齐，退回补充' })
    else return res.status(400).json({ message: '不支持的退宿操作' })
  }
  res.json({ message: '操作成功' })
})

/* ===================== 通知 ===================== */

router.get('/notices', (req, res) => {
  const rows = db.prepare(`
    SELECT n.*, (SELECT COUNT(*) FROM notice_receipts r WHERE r.notice_id = n.id) AS recipients,
           (SELECT COUNT(*) FROM notice_receipts r WHERE r.notice_id = n.id AND r.read_at IS NOT NULL) AS read_count,
           (SELECT COUNT(*) FROM notice_receipts r WHERE r.notice_id = n.id AND r.signed_at IS NOT NULL) AS signed_count
    FROM notices n ORDER BY n.created_at DESC
  `).all()
  res.json(rows)
})

router.get('/notices/mine', (req, res) => {
  const sid = db.prepare('SELECT student_id FROM users WHERE id = ?').get(req.user.id)?.student_id
  const rows = db.prepare(`
    SELECT n.*, r.read_at AS my_read, r.signed_at AS my_signed
    FROM notices n LEFT JOIN notice_receipts r ON r.notice_id = n.id AND r.student_id = ?
    ORDER BY n.created_at DESC
  `).all(sid)
  res.json(rows.map((r) => ({ ...r, myRead: !!r.my_read, mySigned: !!r.my_signed })))
})

router.post('/notices', archiveGuard, requireRole('admin', 'counselor'), (req, res) => {
  const { title, level = '普通', content = '', target = '全部楼栋', requireSign = false } = req.body || {}
  if (!title) return res.status(400).json({ message: '请填写通知标题' })
  const id = Number(db.prepare('INSERT INTO notices (title, level, content, publisher, target, require_sign, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(title, level, content, req.user.name, target, requireSign ? 1 : 0, nowIso()).lastInsertRowid)

  const students = db.prepare('SELECT id FROM students').all()
  const ins = db.prepare('INSERT OR IGNORE INTO notice_receipts (notice_id, student_id) VALUES (?, ?)')
  students.forEach((s) => ins.run(id, s.id))
  writeAudit({ actor: req.user.name, role: '宿管', action: '发布通知', target: title, beforeValue: '-', afterValue: `${level} · ${target}`, reason: '通知下发' })
  res.json({ message: '通知已发布', id })
})

router.post('/notices/:id/sign', requireRole('student'), (req, res) => {
  const id = Number(req.params.id)
  const sid = db.prepare('SELECT student_id FROM users WHERE id = ?').get(req.user.id)?.student_id
  if (!sid) return res.status(400).json({ message: '当前账号无学生身份' })
  db.prepare('UPDATE notice_receipts SET read_at = COALESCE(read_at, ?), signed_at = ? WHERE notice_id = ? AND student_id = ?')
    .run(nowIso(), nowIso(), id, sid)
  res.json({ message: '已签收' })
})

/* ===================== 请假与状态 ===================== */

/* 状态口径迁移（幂等）：
   1) 历史「请假外出」统一为「请假离宿」；
   2) 已无生效请假单（未通过 / 已过期 / 已销假）却仍标记离宿的，自动校正回「在宿」。 */
try {
  db.exec("UPDATE student_states SET state = '请假离宿' WHERE state = '请假外出'")
  db.exec(`
    UPDATE student_states SET state = '在宿', note = '无生效请假单，已自动校正', updated_at = datetime('now')
    WHERE state IN ('请假离宿', '请假外出')
      AND NOT EXISTS (
        SELECT 1 FROM leaves l
        WHERE l.student_id = student_states.student_id
          AND l.status = '已通过'
          AND date('now') BETWEEN l.start_date AND l.end_date
      )
  `)
} catch { /* 表结构差异时忽略 */ }

router.get('/leaves', (req, res) => {
  const sid = db.prepare('SELECT student_id FROM users WHERE id = ?').get(req.user.id)?.student_id
  const onlyMine = req.user.role === 'student'
  const rows = db.prepare(`
    SELECT l.*, s.name AS student_name, s.student_no, s.class_name,
           bl.code AS building_code, r.room_no
    FROM leaves l JOIN students s ON s.id = l.student_id
    LEFT JOIN beds b ON b.student_id = s.id AND b.status = '已占用'
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN buildings bl ON bl.id = r.building_id
    ${onlyMine ? 'WHERE l.student_id = ?' : ''}
    ORDER BY l.created_at DESC
  `).all(...(onlyMine && sid ? [sid] : onlyMine ? [-1] : []))
  res.json(rows)
})

router.post('/leaves', archiveGuard, requireRole('student'), (req, res) => {
  const { leave_type = '事假', start_date, end_date, reason = '' } = req.body || {}
  if (!start_date || !end_date) return res.status(400).json({ message: '请选择请假起止日期' })
  const days = Math.max(1, Math.round((new Date(end_date) - new Date(start_date)) / 86400000) + 1)
  if (days > 3) {
    // 超过 3 天需宿管联签：交由辅导员审批并标注
  }
  const sid = db.prepare('SELECT student_id FROM users WHERE id = ?').get(req.user.id)?.student_id
  if (!sid) return res.status(400).json({ message: '仅学生账号可提交请假' })
  db.prepare('INSERT INTO leaves (student_id, leave_type, start_date, end_date, days, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(sid, leave_type, start_date, end_date, days, reason, '待审批', nowIso())
  writeAudit({ actor: req.user.name, role: '学生', action: '提交请假申请', target: `${start_date} ~ ${end_date}`, beforeValue: '-', afterValue: '待审批', reason })
  res.json({ message: '请假申请已提交' })
})

router.post('/leaves/:id/review', archiveGuard, requireRole('admin', 'counselor'), (req, res) => {
  const id = Number(req.params.id)
  const { action, note = '' } = req.body || {}
  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(id)
  if (!leave) return res.status(404).json({ message: '请假单不存在' })
  if (action === 'approve') {
    db.prepare('UPDATE leaves SET status = ?, reviewer = ?, review_note = ? WHERE id = ?').run('已通过', req.user.name, note, id)
    // 只有请假区间已开始才切换为「请假离宿」；未来请假保持「在宿」，避免状态与实际不符
    const today = new Date().toLocaleDateString('sv-SE')
    if (leave.start_date <= today && today <= leave.end_date) {
      db.prepare(`INSERT INTO student_states (student_id, state, note, updated_at) VALUES (?, '请假离宿', ?, ?)
        ON CONFLICT(student_id) DO UPDATE SET state = '请假离宿', note = excluded.note, updated_at = excluded.updated_at`)
        .run(leave.student_id, `${leave.leave_type} ${leave.days} 天（${leave.start_date} ~ ${leave.end_date}）`, nowIso())
    }
  } else {
    db.prepare('UPDATE leaves SET status = ?, reviewer = ?, review_note = ? WHERE id = ?').run('已驳回', req.user.name, note || '材料不齐', id)
  }
  writeAudit({ actor: req.user.name, role: '辅导员', action: action === 'approve' ? '审批通过请假' : '驳回请假', target: `请假单 #${id}`, beforeValue: leave.status, afterValue: action === 'approve' ? '已通过' : '已驳回', reason: note })
  res.json({ message: '审批完成' })
})

router.post('/leaves/:id/return', archiveGuard, (req, res) => {
  const id = Number(req.params.id)
  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(id)
  if (!leave) return res.status(404).json({ message: '请假单不存在' })
  db.prepare('UPDATE leaves SET status = ? WHERE id = ?').run('已销假', id)
  db.prepare(`INSERT INTO student_states (student_id, state, note, updated_at) VALUES (?, '在宿', '已返校销假', ?)
    ON CONFLICT(student_id) DO UPDATE SET state = '在宿', note = '已返校销假', updated_at = excluded.updated_at`).run(leave.student_id, nowIso())
  writeAudit({ actor: req.user.name, role: '辅导员', action: '确认销假', target: `请假单 #${id}`, beforeValue: '已通过', afterValue: '已销假', reason: '学生返校' })
  res.json({ message: '已确认销假' })
})

router.get('/status-board', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.name, s.student_no, s.class_name,
           bl.code AS building_code, r.room_no, b.bed_no,
           COALESCE(st.state, '在宿') AS state, st.note, st.updated_at
    FROM students s
    LEFT JOIN beds b ON b.student_id = s.id AND b.status = '已占用'
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN buildings bl ON bl.id = r.building_id
    LEFT JOIN student_states st ON st.student_id = s.id
    WHERE b.id IS NOT NULL
    ORDER BY CASE COALESCE(st.state, '在宿') WHEN '未归' THEN 0 WHEN '晚归' THEN 1 WHEN '请假离宿' THEN 2 WHEN '请假外出' THEN 2 WHEN '离校实习' THEN 3 ELSE 4 END, s.student_no
    LIMIT 80
  `).all()
  res.json(rows)
})

/* ===================== 咨询与申报 ===================== */

/* 增量迁移：旧库补 source 列，标记回答来自 AI 还是本地规则 */
try {
  db.exec("ALTER TABLE consultations ADD COLUMN source TEXT DEFAULT 'rule'")
} catch { /* 列已存在，忽略 */ }

router.get('/regulations', (req, res) => {
  res.json(db.prepare('SELECT * FROM regulations ORDER BY id').all())
})

/** AI 服务配置状态（脱敏），前端据此显示「AI 在线 / 本地规章库」徽章 */
router.get('/ai/status', (req, res) => {
  res.json(aiStatus())
})

router.get('/consultations', (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, s.name AS student_name FROM consultations c JOIN students s ON s.id = c.student_id
    ORDER BY c.created_at DESC LIMIT 30
  `).all())
})

/**
 * 清空聊天记录
 * 学生：仅删除本人咨询；宿管/辅导员：清空全部（列表本就是全局视图）。
 * 空记录返回 cleared: 0；删除数写入审计日志，保证操作可追溯。
 */
router.delete('/consultations', archiveGuard, (req, res) => {
  const manageAll = ['admin', 'counselor'].includes(req.user.role)
  let sid = null
  let info
  if (manageAll) {
    info = db.prepare('DELETE FROM consultations').run()
  } else {
    sid = db.prepare('SELECT student_id FROM users WHERE id = ?').get(req.user.id)?.student_id
    if (!sid) return res.json({ message: '当前账号没有咨询记录', cleared: 0 })
    info = db.prepare('DELETE FROM consultations WHERE student_id = ?').run(sid)
  }
  if (!info.changes) return res.json({ message: '暂无咨询记录，无需清空', cleared: 0 })
  writeAudit({
    actor: req.user.name,
    role: manageAll ? '宿管' : '学生',
    action: '清空咨询记录',
    target: manageAll ? '全部咨询记录' : '本人咨询记录',
    beforeValue: `${info.changes} 条`,
    afterValue: '0 条',
    reason: '用户主动清空'
  })
  res.json({ message: `已清空 ${info.changes} 条咨询记录`, cleared: info.changes })
})

/**
 * 智能问答（SSE 流式）
 * 事件：meta（模式与命中条款）→ delta（增量文本，可多次）→ done（完整回答）
 *      失败时：error（含降级兜底答案）
 * AI 未配置或调用失败时自动降级为本地规章匹配，保证接口永远有回答。
 */
router.post('/consultations/stream', archiveGuard, async (req, res) => {
  const question = String(req.body?.question || '').trim()
  if (!question) return res.status(400).json({ message: '请输入要咨询的问题' })

  const sid = db.prepare('SELECT student_id FROM users WHERE id = ?').get(req.user.id)?.student_id
  if (!sid) return res.status(400).json({ message: '仅学生账号可发起咨询' })

  const kb = buildKnowledge(db)
  const hits = retrieve(db, question)
  const top = hits.length ? hits[0] : null
  const matchedPayload = top ? { title: top.title, clause_no: top.clause_no, content: top.content, citation: top.citation, kind: top.kind } : null

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // 关闭 Nginx 缓冲，保证逐字下发
  res.flushHeaders?.()

  let closed = false
  res.on('close', () => { closed = true })

  const send = (event, data) => {
    if (closed) return
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const persist = (answer, source, escalated) => {
    const clause = top && !top.weak ? top.clause_no : (escalated ? '未命中' : (top?.clause_no || '未命中'))
    try {
      db.prepare('INSERT INTO consultations (student_id, question, answer, matched_clause, escalated, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(sid, question, answer, clause, escalated ? 1 : 0, source, nowIso())
    } catch {
      /* 落库失败不影响回答下发 */
    }
  }

  const mode = isAiConfigured() ? 'ai' : 'rule'
  const st = aiStatus()
  send('meta', {
    mode,
    model: st.model,
    provider: st.provider,
    hits: hits.map((h) => ({ title: h.title, clause_no: h.clause_no, score: Math.round(h.score) }))
  })

  // 未配置模型：直接走本地规则，协议保持一致
  if (mode === 'rule') {
    const answer = localAnswer(question, hits)
    send('delta', { text: answer })
    persist(answer, 'rule', !top || top.weak)
    send('done', { answer, matched: matchedPayload, escalated: !top || top.weak, mode: 'rule' })
    return res.end()
  }

  const ctrl = new AbortController()
  res.on('close', () => ctrl.abort())

  try {
    const { text, usage } = await chatStream({
      messages: buildMessages(question, kb, hits),
      onDelta: (delta) => send('delta', { text: delta }),
      signal: ctrl.signal
    })
    const answer = text.trim()
    if (!answer) throw Object.assign(new Error('模型返回空内容'), { code: 'EMPTY' })
    persist(answer, 'ai', !top || top.weak)
    send('done', { answer, matched: matchedPayload, escalated: !top || top.weak, mode: 'ai', usage })
    res.end()
  } catch (err) {
    if (closed) return
    // AI 失败 → 本地规则兜底，前端同时展示错误原因
    const fallback = localAnswer(question, hits)
    send('error', {
      code: err.code || 'UNKNOWN',
      message: err.message || 'AI 服务异常，已切换为本地规章匹配',
      fallback,
      matched: matchedPayload,
      escalated: !top || top.weak
    })
    persist(fallback, 'fallback', !top || top.weak)
    res.end()
  }
})

/** 非流式版本：保留给不支持 SSE 的调用方与回归测试 */
router.post('/consultations', archiveGuard, async (req, res) => {
  const question = String(req.body?.question || '').trim()
  if (!question) return res.status(400).json({ message: '请输入要咨询的问题' })
  const sid = db.prepare('SELECT student_id FROM users WHERE id = ?').get(req.user.id)?.student_id
  const kb = buildKnowledge(db)
  const hits = retrieve(db, question)
  const top = hits.length ? hits[0] : null

  let answer = ''
  let source = 'rule'
  if (isAiConfigured()) {
    try {
      const { text } = await chatOnce({ messages: buildMessages(question, kb, hits) })
      answer = text.trim()
      source = 'ai'
    } catch {
      answer = localAnswer(question, hits)
      source = 'fallback'
    }
  } else {
    answer = localAnswer(question, hits)
  }

  const escalated = !top || top.weak
  db.prepare('INSERT INTO consultations (student_id, question, answer, matched_clause, escalated, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(sid, question, answer, top ? top.clause_no : '未命中', escalated ? 1 : 0, source, nowIso())
  res.json({
    answer,
    mode: source,
    matched: top ? { title: top.title, clause_no: top.clause_no, content: top.content, citation: top.citation, kind: top.kind } : null,
    escalated
  })
})

router.get('/declarations', (req, res) => {
  res.json(db.prepare(`
    SELECT d.*, s.name AS student_name, s.student_no, s.class_name FROM declarations d
    JOIN students s ON s.id = d.student_id ORDER BY d.created_at DESC
  `).all())
})

router.post('/declarations', archiveGuard, requireRole('student'), (req, res) => {
  const { item_name, quantity = 1, power = '', location = '' } = req.body || {}
  if (!item_name) return res.status(400).json({ message: '请填写物品名称' })
  const sid = db.prepare('SELECT student_id FROM users WHERE id = ?').get(req.user.id)?.student_id
  if (!sid) return res.status(400).json({ message: '仅学生账号可提交申报' })
  db.prepare('INSERT INTO declarations (student_id, item_name, quantity, power, location, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(sid, item_name, Number(quantity), power, location, '待审核', nowIso())
  res.json({ message: '申报已提交，等待宿管审核' })
})

router.post('/declarations/:id/review', archiveGuard, requireRole('admin', 'counselor'), (req, res) => {
  const id = Number(req.params.id)
  const { action } = req.body || {}
  const d = db.prepare('SELECT * FROM declarations WHERE id = ?').get(id)
  if (!d) return res.status(404).json({ message: '申报不存在' })
  if (action === 'approve') {
    const no = `RZ-2026-${String(1000 + id).slice(1)}`
    db.prepare("UPDATE declarations SET status = '已通过', voucher_no = ?, reviewer = ? WHERE id = ?").run(no, req.user.name, id)
  } else {
    db.prepare("UPDATE declarations SET status = '已驳回', reviewer = ? WHERE id = ?").run(req.user.name, id)
  }
  writeAudit({ actor: req.user.name, role: '宿管', action: action === 'approve' ? '通过物品申报' : '驳回物品申报', target: `${d.item_name} × ${d.quantity}`, beforeValue: d.status, afterValue: action === 'approve' ? '已通过' : '已驳回', reason: '物品申报审核' })
  res.json({ message: '审核完成' })
})

/* ===================== 通讯录 ===================== */

router.get('/contacts', (req, res) => {
  res.json(db.prepare('SELECT * FROM duty_schedule ORDER BY id').all())
})

/* ===================== 导入与校验 ===================== */

const RULES = [
  { id: 'R01', level: 'E', field: '学号' },
  { id: 'R02', level: 'E', field: '学号' },
  { id: 'R03', level: 'E', field: '姓名' },
  { id: 'R04', level: 'E', field: '性别' },
  { id: 'R05', level: 'E', field: '区队' },
  { id: 'R06', level: 'W', field: '手机号' },
  { id: 'R07', level: 'E', field: '楼栋' },
  { id: 'R08', level: 'E', field: '性别/楼栋' },
  { id: 'R09', level: 'E', field: '房间号' },
  { id: 'R10', level: 'E', field: '床位号' },
  { id: 'R11', level: 'E', field: '床位号' },
  { id: 'R12', level: 'W', field: '学号' }
]

router.get('/import/rules', (req, res) => res.json(RULES))

router.get('/import/template', (req, res) => {
  const header = '学号,姓名,性别,区队,年级,手机号,楼栋,房间号,床位号'
  const sample = [
    '20269001,李思远,男,26级侦查学1区队,26级,13800000001,1,201,5',
    '20269002,王雨萱,女,26级侦查学2区队,26级,13800000002,4,203,2',
    '20269003,张浩然,男,26级治安学1区队,26级,1380000000,1,201,7'
  ].join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="student-import-template.csv"')
  res.send('\uFEFF' + header + '\n' + sample)
})

router.post('/import/validate', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  if (!rows.length) return res.status(400).json({ message: '未解析到有效数据行' })

  const seen = new Map()
  const buildings = db.prepare('SELECT * FROM buildings').all()
  const results = rows.map((row, idx) => {
    const errors = []
    const no = String(row['学号'] ?? '').trim()
    const name = String(row['姓名'] ?? '').trim()
    let gender = String(row['性别'] ?? '').trim()
    const cls = String(row['区队'] ?? row['班级'] ?? '').trim()
    const phone = String(row['手机号'] ?? '').trim()
    const bCode = String(row['楼栋'] ?? '').trim().toUpperCase()
    const roomNo = String(row['房间号'] ?? '').trim()
    const bedNo = String(row['床位号'] ?? '').trim()

    if (!no || !/^\d{6,20}$/.test(no)) errors.push({ ruleId: 'R01', level: 'E', field: '学号', value: no, message: '学号缺失或格式非法（应为 6-20 位数字）', suggestion: '' })
    if (no && seen.has(no)) errors.push({ ruleId: 'R02', level: 'E', field: '学号', value: no, message: `学号与第 ${seen.get(no)} 行重复`, suggestion: '' })
    if (no && !seen.has(no)) seen.set(no, idx + 1)
    if (!name) errors.push({ ruleId: 'R03', level: 'E', field: '姓名', value: name, message: '姓名不能为空', suggestion: '' })
    if (!['男', '女'].includes(gender)) {
      const map = { 男生: '男', 女生: '女', M: '男', F: '女', 1: '男', 2: '女', 0: '女' }
      const fix = map[gender]
      errors.push({ ruleId: 'R04', level: 'E', field: '性别', value: gender, message: '性别只能为「男」或「女」', suggestion: fix || '' })
      if (fix) gender = fix
    }
    if (!cls) errors.push({ ruleId: 'R05', level: 'E', field: '区队', value: cls, message: '区队不能为空', suggestion: '' })
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) errors.push({ ruleId: 'R06', level: 'W', field: '手机号', value: phone, message: '手机号格式不正确（11 位）', suggestion: '' })

    let building = null
    let room = null
    let bed = null
    if (bCode) {
      building = buildings.find((b) => b.code === bCode)
      if (!building) errors.push({ ruleId: 'R07', level: 'E', field: '楼栋', value: bCode, message: `楼栋 ${bCode} 不存在`, suggestion: buildings.map((b) => b.code).join(' / ') })
      else if (gender && building.gender !== '混合' && building.gender !== gender) errors.push({ ruleId: 'R08', level: 'E', field: '性别/楼栋', value: `${gender} → ${bCode}`, message: `性别冲突：${bCode} 为${building.gender}生楼栋`, suggestion: buildings.filter((b) => b.gender === building.gender || b.gender === '混合').map((b) => b.code).join(' / ') })
    }
    if (building && roomNo) {
      room = db.prepare('SELECT * FROM rooms WHERE building_id = ? AND room_no = ?').get(building.id, roomNo)
      if (!room) errors.push({ ruleId: 'R09', level: 'E', field: '房间号', value: roomNo, message: `${bCode} 栋不存在房间 ${roomNo}`, suggestion: '请核对楼层房号规则（如 201）' })
      else if (building.gender === '混合' && gender && !roomGenderOk(room.id, gender)) errors.push({ ruleId: 'R08', level: 'E', field: '性别/楼栋', value: `${gender} → ${bCode}-${roomNo}`, message: `性别冲突：房间 ${bCode}-${roomNo} 已有异性学生入住（混合楼按房间定性别）`, suggestion: '选择同楼层同性别房间' })
    }
    if (room && bedNo) {
      const n = Number(bedNo)
      if (!n || n < 1 || n > room.capacity) {
        errors.push({ ruleId: 'R10', level: 'E', field: '床位号', value: bedNo, message: `床位号超出房间容量（1-${room.capacity}）`, suggestion: `1-${room.capacity}` })
      } else {
        bed = db.prepare('SELECT * FROM beds WHERE room_id = ? AND bed_no = ?').get(room.id, n)
        if (bed && bed.status === '已占用') errors.push({ ruleId: 'R11', level: 'E', field: '床位号', value: bedNo, message: '该床位已被占用', suggestion: '选择其他空闲床位' })
      }
    }
    if (no && db.prepare('SELECT id FROM students WHERE student_no = ?').get(no)) {
      errors.push({ ruleId: 'R12', level: 'W', field: '学号', value: no, message: '学号已存在，提交时将更新该学生信息', suggestion: '保持不变' })
    }

    return {
      rowNo: idx + 2,
      data: { ...row, 性别: gender },
      errors
    }
  })

  const errorRows = results.filter((r) => r.errors.some((e) => e.level === 'E')).length
  const warnRows = results.filter((r) => r.errors.some((e) => e.level === 'W')).length
  res.json({
    total: results.length,
    passRows: results.length - errorRows,
    errorRows,
    warnRows,
    blocking: results.reduce((s, r) => s + r.errors.filter((e) => e.level === 'E').length, 0),
    rows: results
  })
})

router.post('/import/commit', archiveGuard, requireRole('admin'), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  if (!rows.length) return res.status(400).json({ message: '没有可提交的数据' })
  const batchNo = `IMP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(db.prepare('SELECT COUNT(*) c FROM import_batches').get().c + 1).padStart(3, '0')}`
  let inserted = 0
  let updated = 0
  let assigned = 0

  db.exec('BEGIN')
  try {
    for (const r of rows) {
      const d = r.data || {}
      const no = String(d['学号'] || '').trim()
      const name = String(d['姓名'] || '').trim()
      const gender = String(d['性别'] || '').trim()
      const cls = String(d['区队'] || d['班级'] || '').trim()
      const grade = String(d['年级'] || '26级').trim()
      const phone = String(d['手机号'] || '').trim()
      const existing = db.prepare('SELECT id FROM students WHERE student_no = ?').get(no)
      let sid
      if (existing) {
        db.prepare('UPDATE students SET name = ?, gender = ?, class_name = ?, grade = ?, phone = ? WHERE id = ?').run(name, gender, cls, grade, phone, existing.id)
        sid = existing.id
        updated++
      } else {
        sid = Number(db.prepare('INSERT INTO students (student_no, name, gender, class_name, grade, phone) VALUES (?, ?, ?, ?, ?, ?)').run(no, name, gender, cls, grade, phone).lastInsertRowid)
        inserted++
      }
      // 若指定了床位则尝试入住
      const bCode = String(d['楼栋'] || '').trim().toUpperCase()
      const roomNo = String(d['房间号'] || '').trim()
      const bedNo = Number(d['床位号'] || 0)
      if (bCode && roomNo && bedNo) {
        const bed = db.prepare(`
          SELECT b.* FROM beds b JOIN rooms r ON r.id = b.room_id JOIN buildings bl ON bl.id = r.building_id
          WHERE bl.code = ? AND r.room_no = ? AND b.bed_no = ?
        `).get(bCode, roomNo, bedNo)
        if (bed && bed.status === '空闲') {
          db.prepare("UPDATE beds SET status = '已占用', student_id = ? WHERE id = ?").run(sid, bed.id)
          assigned++
        }
      }
    }
    db.prepare('INSERT INTO import_batches (batch_no, file_name, rows, ok_rows, error_rows, warn_rows, status, operator, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(batchNo, req.body?.fileName || '导入文件', rows.length, rows.length, 0, 0, '已入库', req.user.name, nowIso())
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    return res.status(500).json({ message: '导入失败，已回滚：' + e.message })
  }

  writeAudit({ actor: req.user.name, role: '宿管', action: '批量导入学生名单', target: `导入批次 ${batchNo}`, beforeValue: '0 条', afterValue: `新增 ${inserted} / 更新 ${updated} / 分配床位 ${assigned}`, reason: '迎新数据导入' })
  res.json({ message: `导入完成：新增 ${inserted} 条，更新 ${updated} 条，分配床位 ${assigned} 张`, batchNo, inserted, updated, assigned })
})

router.get('/import/batches', (req, res) => {
  res.json(db.prepare('SELECT * FROM import_batches ORDER BY id DESC LIMIT 20').all())
})

/* ===================== 智能床位分配 ===================== */

router.get('/allocations', (req, res) => {
  res.json(db.prepare('SELECT * FROM allocations ORDER BY id DESC').all().map((a) => ({ ...a, metrics: JSON.parse(a.metrics || '{}'), rules: JSON.parse(a.rules || '{}') })))
})

router.post('/allocations/generate', archiveGuard, requireRole('admin'), (req, res) => {
  const rules = req.body || {}
  const classTogether = rules.classTogether !== false
  const buildingOrder = Array.isArray(rules.buildingOrder) && rules.buildingOrder.length ? rules.buildingOrder : ['1', '2', '3', '4', '5', '6', '7']
  const reserveRatio = Number(rules.reserveRatio ?? 5)

  const unassigned = db.prepare(`
    SELECT s.* FROM students s
    WHERE s.id NOT IN (SELECT student_id FROM beds WHERE student_id IS NOT NULL AND status = '已占用')
    ORDER BY s.class_name, s.student_no
  `).all()
  if (!unassigned.length) return res.status(400).json({ message: '当前没有待分配学生（全部学生已有床位）' })

  const buildings = db.prepare('SELECT * FROM buildings').all()
  const freeBeds = db.prepare(`
    SELECT b.id AS bed_id, b.bed_no, r.id AS room_id, r.room_no, r.capacity, bl.id AS building_id, bl.code, bl.gender
    FROM beds b JOIN rooms r ON r.id = b.room_id JOIN buildings bl ON bl.id = r.building_id
    WHERE b.status = '空闲' AND r.status = '可用'
    ORDER BY bl.code, r.room_no, b.bed_no
  `).all()

  // 预留比例：按楼栋保留部分床位不参与分配（以「整间」为单位，避免把房间拆成半间）
  const reserved = new Set()
  buildings.forEach((b) => {
    const list = freeBeds.filter((f) => f.building_id === b.id)
    const keep = Math.floor(list.length * (reserveRatio / 100))
    if (keep <= 0) return
    const byRoom = new Map()
    list.forEach((f) => {
      if (!byRoom.has(f.room_id)) byRoom.set(f.room_id, [])
      byRoom.get(f.room_id).push(f)
    })
    let kept = 0
    for (const beds of [...byRoom.values()].reverse()) {
      if (kept >= keep) break
      beds.forEach((f) => reserved.add(f.bed_id))
      kept += beds.length
    }
  })

  const roomMembers = new Map() // room_id -> 已有班级集合（含已入住）
  const roomGender = new Map()  // room_id -> 已入住学生性别（混合楼按房间定性别）
  db.prepare("SELECT r.id AS room_id, s.class_name, s.gender FROM beds b JOIN rooms r ON r.id = b.room_id JOIN students s ON s.id = b.student_id WHERE b.status = '已占用'").all()
    .forEach((r) => {
      if (!roomMembers.has(r.room_id)) roomMembers.set(r.room_id, new Set())
      roomMembers.get(r.room_id).add(r.class_name)
      roomGender.set(r.room_id, r.gender)
    })

  const plan = []
  const unassignable = []
  const usedBeds = new Set()

  for (const stu of unassigned) {
    const candidates = freeBeds.filter((f) => {
      if (usedBeds.has(f.bed_id) || reserved.has(f.bed_id)) return false
      if (f.gender === stu.gender) return true
      // 混合楼：房间无在住学生或已有同性学生在住时可入住
      if (f.gender === '混合') {
        const g = roomGender.get(f.room_id)
        return !g || g === stu.gender
      }
      return false
    })
    if (!candidates.length) { unassignable.push({ student: stu, reason: '容量不足（同性别可住楼栋无空闲床位）' }); continue }
    let best = null
    let bestScore = -Infinity
    for (const c of candidates) {
      const members = roomMembers.get(c.room_id) || new Set()
      let score = 0
      if (classTogether && members.has(stu.class_name)) score += 1000 // 同区队优先填满同一间
      if (members.size === 0) score += 100                            // 其次优先空房，避免拆散
      score -= members.size * 5                                       // 房内人越少越靠前
      const orderIdx = buildingOrder.indexOf(c.code)
      score -= orderIdx >= 0 ? orderIdx * 3 : 0                       // 楼栋优先级
      score += Math.max(0, 10 - c.bed_no)                             // 床位顺序
      if (score > bestScore) { bestScore = score; best = c }
    }
    if (!best) { unassignable.push({ student: stu, reason: '容量不足（同性别可住楼栋无空闲床位）' }); continue }
    usedBeds.add(best.bed_id)
    if (!roomMembers.has(best.room_id)) roomMembers.set(best.room_id, new Set())
    roomMembers.get(best.room_id).add(stu.class_name)
    roomGender.set(best.room_id, stu.gender)
    plan.push({ student: stu, bed: best })
  }

  let sameClassSeats = 0
  const roomClassCount = new Map()
  plan.forEach((p) => {
    const key = p.bed.room_id
    if (!roomClassCount.has(key)) roomClassCount.set(key, new Map())
    const m = roomClassCount.get(key)
    m.set(p.student.class_name, (m.get(p.student.class_name) || 0) + 1)
  })
  roomClassCount.forEach((m) => { sameClassSeats += Math.max(...m.values()) })

  const metrics = {
    candidates: unassigned.length,
    assigned: plan.length,
    unassigned: unassignable.length,
    ruleSatisfyRate: plan.length ? 100 : 0,
    classAggregation: plan.length ? Math.round((sameClassSeats / plan.length) * 100) : 0,
    reservedBeds: reserved.size,
    durationMs: 0
  }
  const version = db.prepare('SELECT COUNT(*) c FROM allocations').get().c + 1
  const name = `${rules.name || '2026 秋迎新分配方案'} v${version}`
  const aid = Number(db.prepare('INSERT INTO allocations (name, version, status, metrics, rules, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, version, '草稿', JSON.stringify(metrics), JSON.stringify({ ...rules, buildingOrder, reserveRatio }), nowIso()).lastInsertRowid)
  const insItem = db.prepare('INSERT INTO allocation_items (allocation_id, student_id, bed_id) VALUES (?, ?, ?)')
  plan.forEach((p) => insItem.run(aid, p.student.id, p.bed.bed_id))

  writeAudit({ actor: req.user.name, role: '宿管', action: '生成床位分配方案', target: name, beforeValue: '-', afterValue: `已分配 ${plan.length} 人 / 未分配 ${unassignable.length} 人`, reason: '规则化批量分配' })
  res.json({
    id: aid,
    name,
    metrics,
    preview: plan.slice(0, 40).map((p) => ({
      student: p.student.name, class_name: p.student.class_name,
      location: `${p.bed.code}-${p.bed.room_no}-${p.bed.bed_no}`
    })),
    unassigned: unassignable.slice(0, 20).map((u) => ({ name: u.student.name, reason: u.reason }))
  })
})

router.post('/allocations/:id/lock', archiveGuard, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  const a = db.prepare('SELECT * FROM allocations WHERE id = ?').get(id)
  if (!a) return res.status(404).json({ message: '方案不存在' })
  if (a.status === '已锁定') return res.status(400).json({ message: '方案已锁定，如需调整请先解锁（当前原型未开放解锁）' })
  const items = db.prepare('SELECT * FROM allocation_items WHERE allocation_id = ?').all(id)
  let applied = 0
  db.exec('BEGIN')
  try {
    for (const it of items) {
      const bed = db.prepare("SELECT * FROM beds WHERE id = ? AND status = '空闲'").get(it.bed_id)
      if (!bed) continue
      db.prepare("UPDATE beds SET status = '已占用', student_id = ? WHERE id = ?").run(it.student_id, it.bed_id)
      applied++
    }
    db.prepare("UPDATE allocations SET status = '已锁定', locked_at = ? WHERE id = ?").run(nowIso(), id)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    return res.status(500).json({ message: '锁定失败：' + e.message })
  }
  writeAudit({ actor: req.user.name, role: '宿管', action: '锁定分配方案', target: a.name, beforeValue: '草稿', afterValue: `已锁定（写入 ${applied} 条床位绑定）`, reason: '方案确认' })
  res.json({ message: `方案已锁定，${applied} 条床位绑定已写入台账`, applied })
})

router.get('/allocations/:id', (req, res) => {
  const id = Number(req.params.id)
  const a = db.prepare('SELECT * FROM allocations WHERE id = ?').get(id)
  if (!a) return res.status(404).json({ message: '方案不存在' })
  const items = db.prepare(`
    SELECT i.student_id, s.name, s.student_no, s.class_name, bl.code, r.room_no, b.bed_no
    FROM allocation_items i JOIN students s ON s.id = i.student_id
    JOIN beds b ON b.id = i.bed_id JOIN rooms r ON r.id = b.room_id JOIN buildings bl ON bl.id = r.building_id
    WHERE i.allocation_id = ? ORDER BY bl.code, r.room_no, b.bed_no
  `).all(id)
  res.json({ ...a, metrics: JSON.parse(a.metrics || '{}'), items })
})

// 方案微调：可选床位 = 空闲可用床位 + 方案内其他学生床位（对调）
router.get('/allocations/:id/free-beds', (req, res) => {
  const id = Number(req.params.id)
  const { studentId } = req.query
  const stu = studentById(Number(studentId))
  if (!stu) return res.status(404).json({ message: '学生不存在' })
  const rows = db.prepare(`
    SELECT b.id, b.bed_no, r.room_no, bl.code AS building_code,
           COALESCE(ps.name, s2.name) AS holder,
           CASE WHEN i2.id IS NOT NULL THEN 1 ELSE 0 END AS in_plan
    FROM beds b
    JOIN rooms r ON r.id = b.room_id
    JOIN buildings bl ON bl.id = r.building_id
    LEFT JOIN allocation_items i2 ON i2.allocation_id = ? AND i2.bed_id = b.id
    LEFT JOIN students ps ON ps.id = i2.student_id
    LEFT JOIN students s2 ON s2.id = b.student_id
    WHERE (bl.gender = ? OR bl.gender = '混合')
      AND r.status = '可用'
      AND (b.status = '空闲' OR i2.id IS NOT NULL)
      AND b.id NOT IN (SELECT bed_id FROM allocation_items WHERE allocation_id = ? AND student_id = ?)
      AND NOT EXISTS (SELECT 1 FROM beds b3 JOIN students s3 ON s3.id = b3.student_id
                      WHERE b3.room_id = r.id AND b3.status = '已占用' AND s3.gender <> ?)
    ORDER BY bl.code, r.room_no, b.bed_no
  `).all(id, stu.gender, id, Number(studentId), stu.gender)
  res.json(rows.map((r) => ({
    ...r,
    label: `${r.building_code}-${r.room_no}-${r.bed_no}号床` + (r.holder ? `（与方案内 ${r.holder} 对调）` : '（空闲）')
  })))
})

// 方案微调：移动到指定床位；若目标床位在方案内已被占用则两人对调
router.post('/allocations/:id/move', archiveGuard, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  const a = db.prepare('SELECT * FROM allocations WHERE id = ?').get(id)
  if (!a) return res.status(404).json({ message: '方案不存在' })
  if (a.status === '已锁定') return res.status(400).json({ message: '方案已锁定，调整请走调宿工单流程' })
  const { studentId, toBedId } = req.body || {}
  const stu = studentById(Number(studentId))
  const item = db.prepare('SELECT * FROM allocation_items WHERE allocation_id = ? AND student_id = ?').get(id, Number(studentId))
  if (!stu || !item) return res.status(404).json({ message: '该学生不在本方案中' })
  const bed = db.prepare('SELECT b.*, r.status AS room_status, bl.gender AS bg FROM beds b JOIN rooms r ON r.id = b.room_id JOIN buildings bl ON bl.id = r.building_id WHERE b.id = ?').get(Number(toBedId))
  if (!bed) return res.status(404).json({ message: '目标床位不存在' })
  if (bed.bg !== '混合' && bed.bg !== stu.gender) return res.status(400).json({ message: '冲突校验：目标楼栋性别与学生不符' })
  if (bed.room_status !== '可用') return res.status(400).json({ message: `冲突校验：目标房间状态为「${bed.room_status}」` })
  if (bed.bg === '混合') {
    if (!roomGenderOk(bed.room_id, stu.gender)) {
      return res.status(400).json({ message: '冲突校验：目标房间已有异性学生入住（混合楼按房间定性别）' })
    }
    const otherItem = db.prepare('SELECT ai.*, s.gender AS og FROM allocation_items ai JOIN students s ON s.id = ai.student_id WHERE ai.allocation_id = ? AND ai.bed_id = ?').get(id, Number(toBedId))
    if (otherItem && otherItem.og !== stu.gender) {
      return res.status(400).json({ message: '冲突校验：对调目标与学生性别不同，不能同住一间' })
    }
  }

  const other = db.prepare('SELECT * FROM allocation_items WHERE allocation_id = ? AND bed_id = ?').get(id, Number(toBedId))
  db.exec('BEGIN')
  try {
    if (other) {
      db.prepare('UPDATE allocation_items SET bed_id = ? WHERE id = ?').run(item.bed_id, other.id)
    } else if (bed.status !== '空闲') {
      db.exec('ROLLBACK')
      return res.status(400).json({ message: '冲突校验：目标床位已被台账中其他学生占用，不可选' })
    }
    db.prepare('UPDATE allocation_items SET bed_id = ? WHERE id = ?').run(Number(toBedId), item.id)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    return res.status(500).json({ message: '调整失败：' + e.message })
  }
  const otherName = other ? studentById(other.student_id)?.name : null
  writeAudit({
    actor: req.user.name, role: '宿管', action: otherName ? '方案内对调床位' : '方案内调整床位',
    target: `${stu.name}（${stu.student_no}）`,
    beforeValue: `床位 #${item.bed_id}`, afterValue: `床位 #${Number(toBedId)}` + (otherName ? `，与 ${otherName} 对调` : ''),
    reason: '分配方案人工微调'
  })
  res.json({ message: otherName ? `已与 ${otherName} 对调床位` : '床位已调整' })
})

/* ===================== 变更单（归档后修改的唯一通道） ===================== */

router.get('/change-orders', (req, res) => {
  res.json(db.prepare('SELECT * FROM change_orders ORDER BY id DESC LIMIT 50').all())
})

router.post('/change-orders', requireRole('admin', 'counselor'), (req, res) => {
  const { reason = '', items = '' } = req.body || {}
  if (!String(reason).trim()) return res.status(400).json({ message: '请填写变更原因' })
  const id = Number(db.prepare('INSERT INTO change_orders (reason, items, status, applicant, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(String(reason).trim(), String(items || '').trim(), '待批准', req.user.name, nowIso()).lastInsertRowid)
  writeAudit({ actor: req.user.name, role: '宿管', action: '提交变更单', target: `变更单 #${id}`, beforeValue: isArchived() ? '已归档（只读）' : '日常开服', afterValue: '待批准', reason: String(reason).slice(0, 40) })
  res.json({ message: '变更单已提交，批准后项目解除只读', id })
})

router.post('/change-orders/:id/review', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  const co = db.prepare('SELECT * FROM change_orders WHERE id = ?').get(id)
  if (!co) return res.status(404).json({ message: '变更单不存在' })
  if (co.status !== '待批准') return res.status(400).json({ message: '该变更单已处理' })
  const { action = 'approve', note = '' } = req.body || {}
  if (action === 'reject') {
    db.prepare("UPDATE change_orders SET status = '已驳回', approver = ?, approved_at = ? WHERE id = ?").run(req.user.name, nowIso(), id)
    writeAudit({ actor: req.user.name, role: '宿管', action: '驳回变更单', target: `变更单 #${id}`, beforeValue: '待批准', afterValue: '已驳回', reason: note || '理由不充分' })
    return res.json({ message: '变更单已驳回，项目保持只读' })
  }
  db.prepare("UPDATE change_orders SET status = '已批准', approver = ?, approved_at = ? WHERE id = ?").run(req.user.name, nowIso(), id)
  db.prepare("UPDATE project SET status = '日常开服', archived_at = NULL WHERE id = 1").run()
  writeAudit({ actor: req.user.name, role: '宿管', action: '批准变更单并解除归档', target: `变更单 #${id}`, beforeValue: '已归档（只读）', afterValue: '日常开服', reason: co.reason.slice(0, 40) })
  res.json({ message: '变更单已批准，项目已解除只读，可继续修改台账' })
})

/* ===================== 交付验收 ===================== */

function buildChecklist() {
  const bedMismatch = db.prepare(`
    SELECT COUNT(*) c FROM rooms r WHERE (SELECT COUNT(*) FROM beds b WHERE b.room_id = r.id) <> r.capacity
  `).get().c
  const unassigned = db.prepare(`
    SELECT COUNT(*) c FROM students s WHERE s.id NOT IN (SELECT student_id FROM beds WHERE student_id IS NOT NULL AND status = '已占用')
  `).get().c
  const weirdRooms = db.prepare("SELECT COUNT(*) c FROM rooms WHERE status NOT IN ('可用', '维修')").get().c
  const auditCount = db.prepare('SELECT COUNT(*) c FROM audit_logs').get().c
  const lockedPlan = db.prepare("SELECT COUNT(*) c FROM allocations WHERE status = '已锁定'").get().c
  const exports = db.prepare('SELECT type, COUNT(*) c FROM export_records GROUP BY type').all()
  const exportTypes = new Set(exports.map((e) => e.type))

  return [
    { key: 'ledger', title: '床位台账完整性校验通过', pass: bedMismatch === 0, evidence: bedMismatch === 0 ? '全部房间床位数与核定容量一致' : `${bedMismatch} 间房床位数与容量不一致` },
    { key: 'assign', title: '无未分配学生（或已说明）', pass: unassigned === 0, evidence: unassigned === 0 ? '全部学生已有在住床位' : `仍有 ${unassigned} 名学生未分配床位` },
    { key: 'room', title: '房间状态无异常值', pass: weirdRooms === 0, evidence: weirdRooms === 0 ? '房间状态均为 可用 / 维修' : `${weirdRooms} 间房状态异常` },
    { key: 'plan', title: '分配方案已锁定并写入台账', pass: lockedPlan > 0, evidence: lockedPlan > 0 ? `已锁定方案 ${lockedPlan} 个` : '尚未锁定任何分配方案' },
    { key: 'audit', title: '审计日志连续可追溯', pass: auditCount >= 10, evidence: `累计 ${auditCount} 条审计记录` },
    { key: 'export', title: '三类交付物均已导出', pass: ['交付台账', '分配方案', '验收材料'].every((t) => exportTypes.has(t)), evidence: `已导出类型：${[...exportTypes].join('、') || '无'}` }
  ]
}

router.get('/delivery/checklist', (req, res) => {
  res.json({ checklist: buildChecklist(), project: db.prepare('SELECT * FROM project WHERE id = 1').get() })
})

router.get('/delivery/report', (req, res) => {
  const project = db.prepare('SELECT * FROM project WHERE id = 1').get()
  const stats = {
    buildings: db.prepare('SELECT COUNT(*) c FROM buildings').get().c,
    rooms: db.prepare('SELECT COUNT(*) c FROM rooms').get().c,
    beds: db.prepare('SELECT COUNT(*) c FROM beds').get().c,
    students: db.prepare('SELECT COUNT(*) c FROM students').get().c,
    occupied: db.prepare("SELECT COUNT(*) c FROM beds WHERE status = '已占用'").get().c,
    free: db.prepare("SELECT COUNT(*) c FROM beds WHERE status = '空闲'").get().c,
    reserved: db.prepare("SELECT COUNT(*) c FROM beds WHERE status = '预留'").get().c,
    maintenance: db.prepare("SELECT COUNT(*) c FROM beds WHERE status = '维修'").get().c,
    imports: db.prepare('SELECT COUNT(*) c FROM import_batches').get().c,
    tickets: db.prepare('SELECT COUNT(*) c FROM tickets').get().c,
    finishedTickets: db.prepare("SELECT COUNT(*) c FROM tickets WHERE status IN ('已完工','已执行','已办结')").get().c,
    moves: db.prepare("SELECT COUNT(*) c FROM tickets WHERE type = '调宿' AND status = '已执行'").get().c,
    checkouts: db.prepare("SELECT COUNT(*) c FROM tickets WHERE type = '退宿' AND status = '已办结'").get().c,
    leaves: db.prepare('SELECT COUNT(*) c FROM leaves').get().c,
    notices: db.prepare('SELECT COUNT(*) c FROM notices').get().c,
    audit: db.prepare('SELECT COUNT(*) c FROM audit_logs').get().c
  }
  stats.rate = stats.beds ? Math.round((stats.occupied / stats.beds) * 100) : 0
  stats.finishRate = stats.tickets ? Math.round((stats.finishedTickets / stats.tickets) * 100) : 0
  res.json({ project, stats, checklist: buildChecklist(), generatedAt: nowIso() })
})

router.post('/delivery/export', archiveGuard, requireRole('admin'), (req, res) => {
  const type = String(req.body?.type || '交付台账')
  const rows = db.prepare(`
    SELECT bl.code AS 楼栋, bl.name AS 楼栋名称, bl.gender AS 性别属性, r.room_no AS 房间号, r.floor AS 楼层,
           r.room_type AS 房间类型, r.status AS 房间状态, b.bed_no AS 床位号, b.status AS 床位状态,
           COALESCE(s.name, '') AS 学生姓名, COALESCE(s.student_no, '') AS 学号, COALESCE(s.class_name, '') AS 区队
    FROM beds b JOIN rooms r ON r.id = b.room_id JOIN buildings bl ON bl.id = r.building_id
    LEFT JOIN students s ON s.id = b.student_id
    ORDER BY bl.code, r.room_no, b.bed_no
  `).all()

  const header = Object.keys(rows[0] || { 楼栋: '', 房间: '' })
  const csv = '\uFEFF' + header.join(',') + '\n' + rows.map((r) => header.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')

  db.prepare('INSERT INTO export_records (type, scope, rows, operator, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(type, '全部楼栋', rows.length, req.user.name, nowIso())
  writeAudit({ actor: req.user.name, role: '宿管', action: '导出交付物', target: type, beforeValue: '-', afterValue: `${rows.length} 行`, reason: '交付留痕' })
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(type)}.csv"`)
  res.send(csv)
})

router.get('/delivery/exports', (req, res) => {
  res.json(db.prepare('SELECT * FROM export_records ORDER BY id DESC LIMIT 20').all())
})

router.post('/delivery/archive', archiveGuard, requireRole('admin'), (req, res) => {
  const checklist = buildChecklist()
  const failed = checklist.filter((c) => !c.pass)
  if (failed.length) return res.status(400).json({ message: `归档条件未满足：${failed.map((f) => f.title).join('；')}` })
  db.prepare("UPDATE project SET status = '已归档', archived_at = ? WHERE id = 1").run(nowIso())
  writeAudit({ actor: req.user.name, role: '宿管', action: '项目归档', target: '广西警察学院 · 2026 级新生宿舍交付', beforeValue: '日常开服', afterValue: '已归档（只读）', reason: '交付验收完成' })
  res.json({ message: '项目已归档，全部写操作已关闭（只读）' })
})

/* ===================== 生活部协同：检查任务 / 结果回传 / 违禁品标准 ===================== */

const INSPECTOR_ROLES = ['admin', 'counselor', 'inspector']
const DISPOSALS = ['当场整改', '代为保管', '收缴上报', '无']

function createRectifyTicket(rec) {
  // 给问题房间生成整改工单：挂在房间第一名在住学生名下
  const stu = db.prepare(`
    SELECT s.id FROM beds b JOIN students s ON s.id = b.student_id
    JOIN rooms r ON r.id = b.room_id JOIN buildings bl ON bl.id = r.building_id
    WHERE bl.code = ? AND r.room_no = ? ORDER BY b.bed_no LIMIT 1
  `).get(rec.building_code, rec.room_no)
  if (!stu) return null
  const now = nowIso()
  const brief = rec.prohibited_item ? `发现违禁品：${rec.prohibited_item}` : `内务评分 ${rec.score} 分：${(rec.issues || '需整改').slice(0, 30)}`
  const tid = Number(db.prepare(`INSERT INTO tickets (type, student_id, title, description, status, priority, target_room, created_at, updated_at)
    VALUES (?, ?, ?, ?, '待受理', ?, ?, ?, ?)`).run(
    '整改', stu.id, `整改：${rec.building_code}-${rec.room_no}`, brief,
    rec.prohibited_item || rec.score < 40 ? '紧急' : '普通',
    `${rec.building_code}-${rec.room_no}`, now, now).lastInsertRowid)
  return tid
}

function validateInspectionRow(row, idx, buildings) {
  const errors = []
  const code = String(row['楼栋'] ?? '').trim().toUpperCase()
  const roomNo = String(row['房间号'] ?? '').trim()
  const date = String(row['检查日期'] ?? '').trim()
  const type = String(row['检查类型'] ?? '').trim() || '内务检查'
  const scoreRaw = String(row['评分'] ?? '').trim()
  const item = String(row['违禁品'] ?? '').trim()
  const disposal = String(row['处置方式'] ?? '').trim() || (item ? '代为保管' : '无')
  const checker = String(row['检查人'] ?? '').trim()

  const b = buildings.find((x) => x.code === code)
  if (!b) errors.push({ row: idx, field: '楼栋', value: code, message: `楼栋 ${code || '(空)'} 不存在`, suggestion: buildings.map((x) => x.code).join(' / ') })
  else if (roomNo && !db.prepare('SELECT id FROM rooms WHERE building_id = ? AND room_no = ?').get(b.id, roomNo)) {
    errors.push({ row: idx, field: '房间号', value: `${code}-${roomNo}`, message: '房间不存在', suggestion: '' })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push({ row: idx, field: '检查日期', value: date, message: '日期格式应为 YYYY-MM-DD', suggestion: '' })
  if (!/^\d{1,3}$/.test(scoreRaw) || Number(scoreRaw) > 100) errors.push({ row: idx, field: '评分', value: scoreRaw, message: '评分应为 0-100 的整数', suggestion: '' })
  if (item && !DISPOSALS.includes(disposal)) errors.push({ row: idx, field: '处置方式', value: disposal, message: `发现违禁品时处置方式必须为：${DISPOSALS.slice(0, 3).join(' / ')}`, suggestion: '' })
  if (!checker) errors.push({ row: idx, field: '检查人', value: checker, message: '检查人不能为空', suggestion: '' })
  return { row: idx, errors, data: { building_code: code, room_no: roomNo, check_date: date, check_type: type, score: Number(scoreRaw), issues: String(row['问题项'] ?? '').trim(), prohibited_item: item, disposal, checker } }
}

function commitRecord(data, taskId, user) {
  let ticketId = null
  if (data.score < 60 || data.prohibited_item) ticketId = createRectifyTicket(data)
  const id = Number(db.prepare(`INSERT INTO inspection_records
    (task_id, building_code, room_no, check_date, check_type, score, issues, prohibited_item, disposal, checker, ticket_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    taskId, data.building_code, data.room_no, data.check_date, data.check_type,
    data.score, data.issues || null, data.prohibited_item || null, data.disposal || null, data.checker, ticketId, nowIso()).lastInsertRowid)
  writeAudit({ actor: user.name, role: user.role === 'inspector' ? '生活部' : '宿管', action: taskId ? '回传检查结果' : '录入检查记录', target: `${data.building_code}-${data.room_no}`, beforeValue: '-', afterValue: `评分 ${data.score}` + (data.prohibited_item ? ` / 违禁品：${data.prohibited_item}` : ''), reason: data.issues?.slice(0, 40) || '' })
  return { id, ticketId }
}

router.get('/standards', (req, res) => {
  res.json(db.prepare('SELECT * FROM standard_items ORDER BY CASE level WHEN \'一级（严禁）\' THEN 1 WHEN \'二级（限制）\' THEN 2 ELSE 3 END, id').all())
})

const LEVEL_MAP = {
  '一级（严禁）': '一级（严禁）', '一级': '一级（严禁）', '严禁': '一级（严禁）', '禁止': '一级（严禁）',
  '二级（限制）': '二级（限制）', '二级': '二级（限制）', '限制': '二级（限制）',
  '三级（合规可用）': '三级（合规可用）', '三级': '三级（合规可用）', '合规': '三级（合规可用）', '允许': '三级（合规可用）'
}

router.get('/standards/template', (req, res) => {
  const header = '级别,类别,物品名称,处置方式,依据条款'
  const sample = [
    '一级（严禁）,烹饪电器,电煮锅、电饭煲、电磁炉,代为保管，学期末退还，记违规 1 次,学生宿舍违禁物品管理规定 第三章 第 12 条',
    '二级（限制）,大功率电器,额定功率 > 800W 且非烹饪/加热类电器,未申报代为保管；申报获批可使用,学生宿舍用电管理办法 第五章 第 30 条',
    '三级（合规可用）,低功率电器,≤800W 吹风机、加湿器、风扇、台灯,申报后直接放行,学生宿舍用电管理办法 第五章 第 30 条'
  ].join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="standard-items-template.csv"')
  res.send('\uFEFF' + header + '\n' + sample)
})

// 标准库导入：以学校下发文件为准，默认整库替换（mode=append 追加）
router.post('/standards/import', archiveGuard, requireRole('admin'), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  const mode = req.body?.mode === 'append' ? 'append' : 'replace'
  if (!rows.length) return res.status(400).json({ message: '未解析到有效数据行' })
  const bad = []
  const clean = rows.map((r, i) => {
    const level = LEVEL_MAP[String(r['级别'] ?? '').trim()]
    const category = String(r['类别'] ?? '').trim()
    const name = String(r['物品名称'] ?? '').trim()
    const disposal = String(r['处置方式'] ?? '').trim()
    const clause = String(r['依据条款'] ?? '').trim()
    const errs = []
    if (!level) errs.push(`第 ${i + 1} 行：级别须为 一级（严禁）/ 二级（限制）/ 三级（合规可用）`)
    if (!category) errs.push(`第 ${i + 1} 行：类别不能为空`)
    if (!name) errs.push(`第 ${i + 1} 行：物品名称不能为空`)
    if (errs.length) bad.push(...errs)
    return { level, category, name, disposal: disposal || '代为保管', clause }
  })
  if (bad.length) return res.status(400).json({ message: `校验未通过：${bad.length} 处问题，未写入`, errors: bad })
  const replace = mode === 'replace'
  if (replace) db.prepare('DELETE FROM standard_items').run()
  const ins = db.prepare('INSERT INTO standard_items (level, category, name, disposal, clause) VALUES (?, ?, ?, ?, ?)')
  clean.forEach((c) => ins.run(c.level, c.category, c.name, c.disposal, c.clause))
  writeAudit({ actor: req.user.name, role: '宿管', action: replace ? '导入标准库（整库替换）' : '导入标准库（追加）', target: '违禁品标准库', beforeValue: replace ? `${db.prepare('SELECT COUNT(*) c FROM standard_items').get().c} 条（导入前）` : '-', afterValue: `${clean.length} 条`, reason: '以学校下发标准文件为准' })
  res.json({ message: `标准库${replace ? '替换' : '追加'}成功：${clean.length} 条`, count: clean.length })
})

router.get('/inspections/tasks', (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, COUNT(r.id) AS record_count,
      SUM(CASE WHEN r.score < 60 OR r.prohibited_item IS NOT NULL THEN 1 ELSE 0 END) AS problem_count
    FROM inspection_tasks t LEFT JOIN inspection_records r ON r.task_id = t.id
    GROUP BY t.id ORDER BY t.id DESC LIMIT 50
  `).all()
  res.json(rows)
})

router.post('/inspections/tasks', archiveGuard, requireRole('admin', 'counselor'), (req, res) => {
  const { title, buildingCode, checkType, deadline } = req.body || {}
  if (!title || !checkType || !/^\d{4}-\d{2}-\d{2}$/.test(String(deadline || ''))) {
    return res.status(400).json({ message: '任务名称、检查类型、截止日期（YYYY-MM-DD）必填' })
  }
  const code = String(buildingCode || 'ALL').toUpperCase()
  if (code !== 'ALL' && !db.prepare('SELECT id FROM buildings WHERE code = ?').get(code)) return res.status(400).json({ message: `楼栋 ${code} 不存在` })
  const id = Number(db.prepare('INSERT INTO inspection_tasks (title, building_code, check_type, deadline, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(title, code, checkType, deadline, '进行中', req.user.name, nowIso()).lastInsertRowid)
  writeAudit({ actor: req.user.name, role: req.user.role === 'counselor' ? '辅导员' : '宿管', action: '下发检查任务', target: `检查任务 #${id}`, beforeValue: '-', afterValue: `${title}（${code} / ${checkType}）`, reason: `截止 ${deadline}` })
  res.json({ message: '检查任务已下发', id })
})

router.post('/inspections/tasks/:id/close', archiveGuard, requireRole('admin', 'counselor'), (req, res) => {
  const t = db.prepare('SELECT * FROM inspection_tasks WHERE id = ?').get(Number(req.params.id))
  if (!t) return res.status(404).json({ message: '任务不存在' })
  db.prepare("UPDATE inspection_tasks SET status = '已完成' WHERE id = ?").run(t.id)
  writeAudit({ actor: req.user.name, role: '宿管', action: '关闭检查任务', target: `检查任务 #${t.id}`, beforeValue: '进行中', afterValue: '已完成', reason: '' })
  res.json({ message: '任务已关闭' })
})

// 单条录入（生活部 / 宿管 / 辅导员）
router.post('/inspections/records', archiveGuard, requireRole(...INSPECTOR_ROLES), (req, res) => {
  const b = req.body || {}
  const row = {
    '楼栋': b.building_code ?? b['楼栋'] ?? '',
    '房间号': b.room_no ?? b['房间号'] ?? '',
    '检查日期': b.check_date ?? b['检查日期'] ?? '',
    '检查类型': b.check_type ?? b['检查类型'] ?? '内务检查',
    '评分': b.score ?? b['评分'] ?? '',
    '问题项': b.issues ?? b['问题项'] ?? '',
    '违禁品': b.prohibited_item ?? b['违禁品'] ?? '',
    '处置方式': b.disposal ?? b['处置方式'] ?? '',
    '检查人': b.checker || req.user.name
  }
  const buildings = db.prepare('SELECT * FROM buildings').all()
  const v = validateInspectionRow(row, 1, buildings)
  if (v.errors.length) return res.status(400).json({ message: v.errors[0].message, errors: v.errors })
  const taskId = req.body?.taskId ? Number(req.body.taskId) : null
  const out = commitRecord(v.data, taskId, req.user)
  res.json({ message: out.ticketId ? `已记录，并自动生成整改工单 #${out.ticketId}` : '检查记录已保存', ...out })
})

// 批量导入：先校验全部行，无阻断错误才入库
router.post('/inspections/import', archiveGuard, requireRole(...INSPECTOR_ROLES), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
  if (!rows.length) return res.status(400).json({ message: '未解析到有效数据行' })
  const taskId = req.body?.taskId ? Number(req.body.taskId) : null
  const buildings = db.prepare('SELECT * FROM buildings').all()
  const results = rows.map((r, i) => validateInspectionRow(r, i + 1, buildings))
  const bad = results.filter((r) => r.errors.length)
  if (bad.length) {
    return res.status(400).json({
      message: `校验未通过：${bad.length}/${rows.length} 行存在问题，未写入任何数据`,
      errors: bad.flatMap((r) => r.errors)
    })
  }
  const committed = results.map((r) => commitRecord(r.data, taskId, req.user))
  const tickets = committed.filter((c) => c.ticketId).length
  res.json({ message: `导入成功：${committed.length} 条记录` + (tickets ? `，自动生成 ${tickets} 张整改工单` : ''), count: committed.length, tickets })
})

router.get('/inspections/records', (req, res) => {
  const taskId = req.query.taskId ? Number(req.query.taskId) : null
  const rows = taskId
    ? db.prepare('SELECT * FROM inspection_records WHERE task_id = ? ORDER BY id DESC LIMIT 200').all(taskId)
    : db.prepare('SELECT * FROM inspection_records ORDER BY id DESC LIMIT 200').all()
  res.json(rows)
})

router.get('/inspections/summary', (req, res) => {
  const byBuilding = db.prepare(`
    SELECT building_code, COUNT(*) AS checks, ROUND(AVG(score), 1) AS avg_score,
      SUM(CASE WHEN score < 60 OR prohibited_item IS NOT NULL THEN 1 ELSE 0 END) AS problems
    FROM inspection_records GROUP BY building_code ORDER BY building_code
  `).all()
  const latest = db.prepare(`
    SELECT r.* FROM inspection_records r
    JOIN (SELECT building_code, room_no, MAX(check_date) AS d FROM inspection_records GROUP BY building_code, room_no) m
      ON m.building_code = r.building_code AND m.room_no = r.room_no AND m.d = r.check_date
    ORDER BY r.score ASC LIMIT 8
  `).all()
  res.json({ byBuilding, latest })
})

router.get('/inspections/template', (req, res) => {
  const header = '楼栋,房间号,检查日期,检查类型,评分,问题项,违禁品,处置方式'
  const sample = [
    '1,201,2026-11-03,内务检查,92,阳台杂物堆放,,无',
    '1,202,2026-11-03,违禁品检查,55,桌面混乱；插线板私拉,电煮锅,代为保管',
    '4,105,2026-11-03,联合检查,78,地面有垃圾,,无'
  ].join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="inspection-import-template.csv"')
  res.send('\uFEFF' + header + '\n' + sample)
})

export default router
