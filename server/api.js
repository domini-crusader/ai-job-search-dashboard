// Plugin do Vite que serve a API local do painel em /api/*.
// Roda dentro do `npm run dev` - não há um segundo processo para subir.
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { ROOT, SEEN, TRACKER, loadBoard, setSeenStatus, setTrackerStatus, httpError } from './data.js'
import { findCommand, publicCatalog, claudeBin, pdfFor } from './commands.js'
import { health } from './health.js'
import { profileReport } from './profile.js'
import { searchSettings, saveCategories, saveDays, setPortalEnabled, readLists, writeLists } from './settings.js'

const running = new Map() // id do comando -> processo filho em execução
const sseClients = new Set()

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 64 * 1024) reject(httpError(413, 'corpo grande demais'))
    })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) } catch { reject(httpError(400, 'JSON inválido')) }
    })
    req.on('error', reject)
  })
}

// Só aceita chamadas da própria página do painel. O header customizado obriga um
// preflight CORS (que nunca é respondido), então outro site aberto no navegador
// não consegue disparar escritas nem comandos.
function guard(req) {
  const host = String(req.headers.host || '').toLowerCase()
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) throw httpError(403, 'host não permitido')
  if (req.method !== 'GET' && req.headers['x-dashboard'] !== '1') throw httpError(403, 'requisição recusada')
}

// Quoting de argv do Windows (regras do CommandLineToArgvW).
function winQuote(arg) {
  if (arg && !/[\s"]/.test(arg)) return arg
  let out = '"'
  let slashes = 0
  for (const ch of arg) {
    if (ch === '\\') { slashes++; continue }
    if (ch === '"') { out += '\\'.repeat(slashes * 2 + 1) + '"' } else { out += '\\'.repeat(slashes) + ch }
    slashes = 0
  }
  return out + '\\'.repeat(slashes * 2) + '"'
}

function launchClaude(prompt) {
  const bin = claudeBin()
  if (!bin) throw httpError(501, 'CLI `claude` não encontrado no PATH (ou defina CLAUDE_BIN)')
  if (process.platform !== 'win32') throw httpError(501, 'abertura de terminal só implementada no Windows')
  // Os valores vão por variável de ambiente para não passarem pelo parser do PowerShell.
  const child = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    'Start-Process -FilePath $env:JD_CLAUDE -ArgumentList $env:JD_ARGS -WorkingDirectory $env:JD_CWD',
  ], {
    env: { ...process.env, JD_CLAUDE: bin, JD_ARGS: winQuote(prompt), JD_CWD: ROOT },
    windowsHide: true, detached: true, stdio: 'ignore',
  })
  child.unref()
}

async function runCommand(req, res, body) {
  const command = findCommand(body.id)
  if (command.kind !== 'script') throw httpError(400, 'este comando não é um script local')
  if (running.has(command.id)) throw httpError(409, 'este comando já está em execução')
  const steps = command.build(body.params || {})

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  let child = null
  let aborted = false
  res.on('close', () => {
    if (!res.writableFinished) {
      aborted = true
      if (child && child.exitCode === null) child.kill()
    }
  })

  let exitCode = 0
  running.set(command.id, true)
  try {
    for (const step of steps) {
      if (aborted) break
      res.write(`$ ${[step.cmd, ...step.args].join(' ')}\n`)
      exitCode = await new Promise((resolve) => {
        child = spawn(step.cmd, step.args, {
          cwd: step.cwd || ROOT,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
          windowsHide: true,
        })
        child.stdout.on('data', (d) => res.write(d))
        child.stderr.on('data', (d) => res.write(d))
        child.on('error', (err) => { res.write(`\n[erro] ${err.message}\n`); resolve(127) })
        child.on('close', (code) => resolve(code ?? 1))
      })
      res.write(`\n[código de saída: ${exitCode}]\n\n`)
      if (exitCode !== 0) break
    }
  } finally {
    running.delete(command.id)
  }
  res.end(`__EXIT__${exitCode}`)
}

async function handle(req, res) {
  guard(req)
  const url = new URL(req.url, 'http://local')
  const route = `${req.method} ${url.pathname}`

  switch (route) {
    case 'GET /api/board':
      return send(res, 200, loadBoard())

    case 'GET /api/health':
      return send(res, 200, await health())

    case 'GET /api/profile':
      return send(res, 200, profileReport())

    case 'GET /api/settings/search':
      return send(res, 200, searchSettings())

    case 'PUT /api/settings/categories': {
      const body = await readJson(req)
      saveCategories(body.categories)
      return send(res, 200, searchSettings())
    }

    case 'PUT /api/settings/days': {
      const body = await readJson(req)
      saveDays(body.days)
      return send(res, 200, searchSettings())
    }

    case 'PUT /api/settings/portal': {
      const body = await readJson(req)
      setPortalEnabled(body.id, body.enabled === true)
      return send(res, 200, searchSettings())
    }

    case 'GET /api/lists':
      return send(res, 200, readLists())

    case 'PUT /api/lists':
      return send(res, 200, writeLists(await readJson(req)))

    case 'GET /api/catalog':
      return send(res, 200, publicCatalog())

    case 'GET /api/events': {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
      res.write('retry: 3000\n\n')
      sseClients.add(res)
      req.on('close', () => sseClients.delete(res))
      return
    }

    case 'GET /api/pdf': {
      const doc = pdfFor(url.searchParams.get('index'), url.searchParams.get('kind'))
      if (!fs.existsSync(doc.abs)) throw httpError(404, `PDF ainda não compilado: ${doc.rel}`)
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' })
      return fs.createReadStream(doc.abs).pipe(res)
    }

    case 'POST /api/status': {
      const body = await readJson(req)
      const id = String(body.id || '')
      if (id.startsWith('seen:')) setSeenStatus(id.slice(5), body.status)
      else if (id.startsWith('app:')) setTrackerStatus(Number(id.slice(4)), body.status, body.expect)
      else throw httpError(400, 'id inválido')
      return send(res, 200, { ok: true })
    }

    case 'POST /api/claude': {
      const body = await readJson(req)
      const command = findCommand(body.id)
      if (command.kind !== 'claude') throw httpError(400, 'não é um comando do Claude')
      const params = body.params || {}
      for (const p of command.params || []) {
        if (p.required && !String(params[p.name] ?? '').trim()) throw httpError(400, `preencha: ${p.label}`)
      }
      const prompt = command.prompt(params)
      if (body.launch) launchClaude(prompt)
      return send(res, 200, { prompt, launched: Boolean(body.launch) })
    }

    case 'POST /api/run': {
      const body = await readJson(req)
      return runCommand(req, res, body)
    }
  }
  throw httpError(404, 'rota não encontrada')
}

// Avisa a página quando /scrape, /rank, /apply etc. mudam os arquivos de estado.
function watchFiles() {
  let timer = null
  const notify = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      for (const res of sseClients) res.write(`event: changed\ndata: ${Date.now()}\n\n`)
    }, 300)
  }
  for (const file of [SEEN, TRACKER]) {
    fs.watchFile(file, { interval: 1500 }, (cur, prev) => {
      if (cur.mtimeMs !== prev.mtimeMs || cur.size !== prev.size) notify()
    })
  }
  // Mantém as conexões SSE vivas através de proxies/antivírus.
  setInterval(() => { for (const res of sseClients) res.write(': ping\n\n') }, 25000).unref()
}

export function dashboardApi() {
  return {
    name: 'ai-job-search-dashboard-api',
    configureServer(server) {
      watchFiles()
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        handle(req, res).catch((err) => {
          if (res.headersSent) {
            res.end(`\n[erro] ${err.message}\n__EXIT__1`)
            return
          }
          send(res, err.status || 500, { error: err.message })
        })
      })
    },
  }
}
