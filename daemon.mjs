// Dorm platform daemon - keeps the HTTP service alive, restarts it on crash.
// Started by Windows Task Scheduler at user logon (see project notes).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 4321)
const entry = path.join(dir, 'server', 'index.js')
const dataDir = path.join(dir, 'server', 'data')
const logFile = path.join(dataDir, 'daemon.log')

fs.mkdirSync(dataDir, { recursive: true })
try {
  if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2 * 1024 * 1024) {
    fs.renameSync(logFile, logFile + '.1')
  }
} catch {}

const stream = fs.createWriteStream(logFile, { flags: 'a' })
const stamp = () => new Date().toISOString()
const log = (msg) => stream.write(`[${stamp()}] ${msg}\n`)

function portInUse() {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', () => resolve(true))
    probe.once('listening', () => probe.close(() => resolve(false)))
    probe.listen(PORT, '0.0.0.0')
  })
}

let current = null
let stopping = false

function startServer() {
  const child = spawn(process.execPath, [entry], {
    cwd: dir,
    windowsHide: true,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  current = child
  child.stdout.on('data', (d) => stream.write(d))
  child.stderr.on('data', (d) => stream.write(d))
  child.on('error', (e) => log('spawn error: ' + e.message))
  child.on('exit', (code, signal) => {
    current = null
    if (stopping) return
    log(`server exited (code=${code} signal=${signal}), restart in 3s`)
    setTimeout(startServer, 3000)
  })
  log(`server started pid=${child.pid} port=${PORT}`)
}

function onSignal(sig) {
  // Ignore termination signals so the daemon (and the service) stay alive when
  // the console is closed or the session switches. Stop via taskkill /F instead.
  log(`received ${sig}, ignored - daemon keeps running`)
}
process.on('SIGINT', () => onSignal('SIGINT'))
process.on('SIGTERM', () => onSignal('SIGTERM'))
process.on('SIGHUP', () => onSignal('SIGHUP'))

async function main() {
  if (await portInUse()) {
    log(`port ${PORT} already in use - another instance is running, exit`)
    process.exit(0)
  }
  log(`daemon up | node=${process.execPath} | port=${PORT}`)
  startServer()
}

main()
