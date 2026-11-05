import { DatabaseSync } from 'node:sqlite'
import { scryptSync, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

export const db = new DatabaseSync(path.join(dataDir, 'dorm.db'))

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,              -- admin | student | counselor
  name TEXT NOT NULL,
  student_id INTEGER
);

CREATE TABLE IF NOT EXISTS buildings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,            -- 男 / 女
  floors INTEGER NOT NULL,
  manager TEXT,
  status TEXT NOT NULL DEFAULT '正常'
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER NOT NULL,
  floor INTEGER NOT NULL,
  room_no TEXT NOT NULL,
  room_type TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '可用',   -- 可用 / 维修 / 停用
  note TEXT
);

CREATE TABLE IF NOT EXISTS beds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  bed_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '空闲',   -- 空闲 / 已占用 / 预留 / 维修
  student_id INTEGER,
  note TEXT
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_no TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  class_name TEXT NOT NULL,
  grade TEXT NOT NULL,
  phone TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  before_value TEXT,
  after_value TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms(building_id, floor);
CREATE INDEX IF NOT EXISTS idx_beds_room ON beds(room_id);
`)

export function hashPassword(pwd) {
  const salt = randomBytes(8).toString('hex')
  const hash = scryptSync(pwd, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(pwd, stored) {
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false
  return scryptSync(pwd, salt, 32).toString('hex') === hash
}

const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '林', '罗', '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧', '程', '曹', '袁', '邓', '许', '傅', '沈', '曾', '彭', '吕', '苏', '卢', '蒋', '蔡', '贾', '丁', '魏', '薛', '叶', '阎', '余', '潘', '杜', '戴', '夏', '钟', '汪', '田', '任', '姜']
const GIVEN = ['子涵', '雨轩', '思远', '嘉怡', '俊杰', '欣怡', '浩然', '梓萱', '宇轩', '若曦', '明轩', '诗涵', '天佑', '文博', '佳琪', '泽宇', '芷若', '子豪', '梦瑶', '博文', '晨曦', '亦辰', '曼婷', '皓轩']
// 公安院校按「区队」编制：同一年级每个专业一般只编 1-2 个区队（2401、2402）
// 一个区队 42 人，正好住满 7 间六人间
const SQUAD_PLAN = [
  // [专业, 男区队数, 女区队数]，每专业合计不超过 2 个区队
  ['侦查学', 1, 1], ['治安学', 1, 1], ['刑事科学技术', 1, 1],
  ['网络安全与执法', 1, 1], ['交通管理工程', 1, 1], ['警务指挥与战术', 1, 1],
  ['公安管理学', 0, 2], ['涉外警务', 1, 1], ['禁毒学', 2, 0],
  ['经济犯罪侦查', 2, 0], ['数据警务技术', 1, 1], ['监狱学', 0, 2],
  ['法学', 0, 2], ['行政管理', 0, 2]
]
const SQUAD_SIZE = 42
const SQUADS_PER_BUILDING = 4
const SQUADS = (() => {
  const out = []
  for (const [major, maleN, femaleN] of SQUAD_PLAN) {
    let seq = 0
    for (const [gender, n] of [['男', maleN], ['女', femaleN]]) {
      for (let i = 0; i < n; i++) out.push({ major, gender, name: `26级${major}${++seq}区队` })
    }
  }
  return out
})()
const STUDENT_TOTAL = SQUADS.length * SQUAD_SIZE

function seedUsers() {
  const insert = db.prepare('INSERT INTO users (username, password_hash, role, name, student_id) VALUES (?, ?, ?, ?, ?)')
  insert.run('suguan', hashPassword('123456'), 'admin', '李秀兰（宿管中心）', null)
  insert.run('fudaoyuan', hashPassword('123456'), 'counselor', '陈静（26级侦查学1区队辅导员）', null)
  insert.run('shenghuobu', hashPassword('123456'), 'inspector', '生活部检查组', null)
  insert.run('20260101', hashPassword('123456'), 'student', '王子涵', 1)
}

function seedBuildings() {
  const rows = [
    ['1', '仙葫校区 1 栋', '男', 6, '王建国'],
    ['2', '仙葫校区 2 栋', '男', 6, '刘志强'],
    ['3', '仙葫校区 3 栋', '男', 6, '孙立平'],
    ['4', '仙葫校区 4 栋', '女', 6, '张慧敏'],
    ['5', '仙葫校区 5 栋', '女', 6, '赵丽娟'],
    ['6', '仙葫校区 6 栋', '女', 6, '李红梅'],
    ['7', '仙葫校区 7 栋', '女', 6, '周雅琴']
  ]
  const insertB = db.prepare('INSERT INTO buildings (code, name, gender, floors, manager) VALUES (?, ?, ?, ?, ?)')
  const insertR = db.prepare('INSERT INTO rooms (building_id, floor, room_no, room_type, capacity) VALUES (?, ?, ?, ?, ?)')
  const insertBed = db.prepare('INSERT INTO beds (room_id, bed_no, status) VALUES (?, ?, ?)')

  for (const [code, name, gender, floors, manager] of rows) {
    const bid = Number(insertB.run(code, name, gender, floors, manager).lastInsertRowid)
    for (let floor = 1; floor <= floors; floor++) {
      for (let idx = 1; idx <= 6; idx++) {
        const roomNo = `${floor}0${idx}`
        const rid = Number(insertR.run(bid, floor, roomNo, '六人间', 6).lastInsertRowid)
        for (let bed = 1; bed <= 6; bed++) insertBed.run(rid, bed, '空闲')
      }
    }
  }
}

function seedStudents() {
  const insert = db.prepare('INSERT INTO students (student_no, name, gender, class_name, grade, phone) VALUES (?, ?, ?, ?, ?, ?)')
  let i = 0
  for (const squad of SQUADS) {
    // 一个区队 42 人，整建制编制，区队内性别一致
    for (let k = 0; k < SQUAD_SIZE; k++, i++) {
      const name = SURNAMES[Math.floor(i / GIVEN.length) % SURNAMES.length] + GIVEN[i % GIVEN.length]
      const no = `2026${String(1001 + i).padStart(4, '0')}`
      const phone = `138${String(10000000 + i * 137).slice(0, 8)}`
      insert.run(no, name, squad.gender, squad.name, '26级', phone)
    }
  }
}

function seedOccupancy() {
  const setBed = db.prepare('UPDATE beds SET status = ?, student_id = ? WHERE id = ?')
  const roomsOfBuilding = db.prepare('SELECT id FROM rooms WHERE building_id = ? ORDER BY floor, room_no')
  const bedsOfRoom = db.prepare('SELECT id FROM beds WHERE room_id = ? ORDER BY bed_no')
  const buildings = db.prepare('SELECT id, code, gender FROM buildings ORDER BY code').all()
  const students = db.prepare('SELECT id, gender, class_name FROM students ORDER BY id').all()

  // 区队 → 学生名单（同区队同性别，按生成顺序保持连续）
  const squads = new Map()
  for (const s of students) {
    if (!squads.has(s.class_name)) squads.set(s.class_name, { gender: s.gender, ids: [] })
    squads.get(s.class_name).ids.push(s.id)
  }
  const queue = [...squads.values()]
  // 最后一个区队不安排床位，留作「智能床位分配」的待分配生源
  queue.pop()

  const bedsPerRoom = bedsOfRoom.all(db.prepare('SELECT id FROM rooms ORDER BY id LIMIT 1').get().id).length || 6
  const roomsPerSquad = Math.ceil(SQUAD_SIZE / bedsPerRoom)

  // 每栋楼剩余房间的用途，保证楼栋之间的空床结构一致
  const sparePlan = ['预留', '维修', '空闲', '空闲', '空闲', '预留', '空闲', '空闲']

  let occupied = 0
  for (const g of ['男', '女']) {
    const pool = queue.filter((s) => s.gender === g)
    let sIdx = 0
    for (const b of buildings.filter((x) => x.gender === g)) {
      const rooms = roomsOfBuilding.all(b.id)
      // 每栋楼容纳 4 个完整区队，一个区队独占连续的 7 间房
      for (let k = 0; k < SQUADS_PER_BUILDING && sIdx < pool.length; k++, sIdx++) {
        const squad = pool[sIdx]
        let p = 0
        for (let r = k * roomsPerSquad; r < (k + 1) * roomsPerSquad && r < rooms.length; r++) {
          for (const bed of bedsOfRoom.all(rooms[r].id)) {
            if (p < squad.ids.length) {
              setBed.run('已占用', squad.ids[p++], bed.id)
              occupied++
            }
          }
        }
      }
      // 剩余房间：预留 / 整间维修 / 空闲
      for (let r = SQUADS_PER_BUILDING * roomsPerSquad; r < rooms.length; r++) {
        const kind = sparePlan[(r - SQUADS_PER_BUILDING * roomsPerSquad) % sparePlan.length]
        for (const bed of bedsOfRoom.all(rooms[r].id)) {
          setBed.run(kind === '维修' ? '维修' : kind, null, bed.id)
        }
        if (kind === '维修') db.prepare("UPDATE rooms SET status = '维修', note = '卫生间漏水维修' WHERE id = ?").run(rooms[r].id)
      }
    }
  }

  return occupied
}

export function ensureSeed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM buildings').get().c
  if (count > 0) return
  seedUsers()
  seedBuildings()
  seedStudents()
  const occupied = seedOccupancy()

  const now = new Date().toISOString()
  const stats = {
    buildings: db.prepare('SELECT COUNT(*) c FROM buildings').get().c,
    rooms: db.prepare('SELECT COUNT(*) c FROM rooms').get().c,
    beds: db.prepare('SELECT COUNT(*) c FROM beds').get().c,
    students: db.prepare('SELECT COUNT(*) c FROM students').get().c
  }
  const log = db.prepare('INSERT INTO audit_logs (actor, role, action, target, before_value, after_value, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  log.run('系统初始化', 'system', '初始化演示数据', '全平台', '空库', `${stats.buildings} 栋 / ${stats.rooms} 间房 / ${stats.beds} 张床 / 已入住 ${occupied} 人`, '演示环境种子数据', now)
  log.run('李秀兰（宿管中心）', 'admin', '导入学生名单', '导入批次 IMP-20260901-001', '0 条', `${stats.students} 条（新增 ${stats.students} / 更新 0）`, '迎新批量导入', now)
}

export function writeAudit({ actor, role, action, target, beforeValue = '', afterValue = '', reason = '' }) {
  db.prepare('INSERT INTO audit_logs (actor, role, action, target, before_value, after_value, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(actor, role, action, target, beforeValue, afterValue, reason, new Date().toISOString())
}

ensureSeed()
