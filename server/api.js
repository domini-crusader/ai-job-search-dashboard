// Plugin do Vite que serve a API local do painel em /api/*.
// Roda dentro do `npm run dev` - não há um segundo processo para subir.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { ROOT, SEEN, TRACKER, loadBoard, setSeenStatus, setTrackerStatus, httpError } from './data.js'
import { findCommand, publicCatalog, claudeBin, pdfFor } from './commands.js'
import { health } from './health.js'
import { jobDetails, brief } from './enrich.js'
import { profileReport, stepSections, saveSection } from './profile.js'
import { searchSettings, saveCategories, saveDays, setPortalEnabled, readLists, writeLists, writeText, readText, writeVocab, resetVocab, includeSite } from './settings.js'
import { generateVocab } from './generate.js'

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
  // Sem `detached`: um PowerShell destacado fica sem console e o Start-Process falha
  // em silêncio. A saída ("started"/"ERRO") é lida para a falha chegar à tela.
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'try { $p = Start-Process -FilePath $env:JD_CLAUDE -ArgumentList $env:JD_ARGS -WorkingDirectory $env:JD_CWD -PassThru; "started " + $p.Id } catch { "ERRO: " + $_ }',
    ], {
      env: { ...process.env, JD_CLAUDE: bin, JD_ARGS: winQuote(prompt), JD_CWD: ROOT },
      windowsHide: true,
    })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    child.on('error', (e) => reject(httpError(500, `não foi possível abrir o terminal: ${e.message}`)))
    child.on('close', () => {
      if (/^started \d+/m.test(out)) resolve()
      else reject(httpError(500, `não foi possível abrir o terminal: ${out.replace(/^ERRO:\s*/, '').trim().slice(0, 200) || 'erro desconhecido'}`))
    })
  })
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
    case 'GET /api/board': {
      const board = loadBoard()
      for (const card of [...board.jobs, ...board.applications]) card.brief = brief(card.id)
      return send(res, 200, board)
    }

    case 'GET /api/job': {
      const id = url.searchParams.get('id')
      const board = loadBoard()
      const card = [...board.jobs, ...board.applications].find((c) => c.id === id)
      return send(res, 200, await jobDetails(card, { refresh: url.searchParams.get('refresh') === '1' }))
    }

    case 'GET /api/health':
      return send(res, 200, await health())

    case 'GET /api/profile':
      return send(res, 200, profileReport())

    case 'GET /api/profile/sections':
      return send(res, 200, stepSections(url.searchParams.get('step')))

    case 'PUT /api/profile/section': {
      const body = await readJson(req)
      try { saveSection(body, writeText, readText) } catch (e) { throw httpError(400, e.message) }
      return send(res, 200, { sections: stepSections(body.step), profile: profileReport() })
    }

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

    case 'PUT /api/settings/vocab': {
      const body = await readJson(req)
      if (body.reset) resetVocab()
      else writeVocab(body.groups)
      return send(res, 200, searchSettings())
    }

    case 'POST /api/settings/vocab/generate':
      return send(res, 200, await generateVocab())

    case 'PUT /api/settings/site': {
      const body = await readJson(req)
      includeSite(String(body.domain || ''))
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

    // Mascote oficial (Pip, MIT) lido do próprio workspace: o addon não o redistribui.
    case 'GET /api/brand/mascot': {
      const file = path.join(ROOT, 'assets', 'mascot', 'pip_flight_loop.gif')
      if (!fs.existsSync(file)) throw httpError(404, 'mascote não encontrado no workspace')
      res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'max-age=3600' })
      return fs.createReadStream(file).pipe(res)
    }

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
      if (body.launch) await launchClaude(prompt)
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
