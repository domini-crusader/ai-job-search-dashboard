// Preferências que o ai-job-search oferece e o painel deixa reorganizar:
//   - categorias de busca em .claude/skills/job-scraper/search-queries.md
//     (ordem de prioridade, título, descrição, consultas, notas)
//   - janela de datas do /scrape ("within the last N days")
//   - portais ligados/desligados (frontmatter `enabled` de .agents/skills/*/SKILL.md)
// E o que é só do painel: as listas de objetivos, guardadas fora do repositório.
// Toda escrita em arquivo do workspace guarda antes um backup na pasta do addon.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { ROOT, httpError } from './data.js'

const QUERIES = path.join(ROOT, '.claude', 'skills', 'job-scraper', 'search-queries.md')
const PORTALS = path.join(ROOT, '.agents', 'skills')

export const CONFIG_DIR = process.env.AJS_DASHBOARD_HOME || path.join(os.homedir(), '.ai-job-search-dashboard')
const WS_ID = crypto.createHash('sha1').update(ROOT.toLowerCase()).digest('hex').slice(0, 10)
const LISTS_FILE = path.join(CONFIG_DIR, `lists-${WS_ID}.json`)

// ---------- utilitários ----------

function backup(file) {
  if (!fs.existsSync(file)) return
  const dir = path.join(CONFIG_DIR, 'backups', WS_ID)
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const name = path.relative(ROOT, file).replace(/[\\/]/g, '__')
  fs.copyFileSync(file, path.join(dir, `${stamp}__${name}`))
}

function writeText(file, text, eol) {
  backup(file)
  const out = eol === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, out, 'utf8')
  fs.renameSync(tmp, file)
}

function readText(file) {
  const raw = fs.readFileSync(file, 'utf8')
  return { text: raw.replace(/\r\n/g, '\n'), eol: raw.includes('\r\n') ? '\r\n' : '\n' }
}

function cleanLine(s, max = 120) {
  const v = String(s ?? '').replace(/[\r\n]+/g, ' ').trim()
  if (!v || v.length > max) throw httpError(400, 'título inválido')
  return v
}

function cleanBlock(s, max = 8000) {
  const v = String(s ?? '').replace(/\r\n/g, '\n').trim()
  if (v.length > max) throw httpError(400, 'texto grande demais')
  if (/^```/m.test(v)) throw httpError(400, 'não use ``` dentro do texto')
  return v
}

// ---------- search-queries.md ----------

// Divide "## Query Categories" em blocos "### Priority N: Título".
function parseQueries() {
  if (!fs.existsSync(QUERIES)) throw httpError(404, 'search-queries.md não encontrado - rode /setup')
  const { text, eol } = readText(QUERIES)
  const start = text.search(/^## Query Categories\s*$/m)
  if (start < 0) throw httpError(422, 'search-queries.md sem a seção "## Query Categories"')
  const bodyStart = text.indexOf('\n', start) + 1
  const nextH2 = text.slice(bodyStart).search(/^## /m)
  const bodyEnd = nextH2 < 0 ? text.length : bodyStart + nextH2
  const body = text.slice(bodyStart, bodyEnd)

  const heads = [...body.matchAll(/^### Priority\s+\d+\s*:\s*(.+)$/gm)]
  const intro = heads.length ? body.slice(0, heads[0].index) : body
  const categories = heads.map((m, i) => {
    const block = body.slice(m.index + m[0].length, i + 1 < heads.length ? heads[i + 1].index : body.length)
    const code = /```[^\n]*\n([\s\S]*?)```/.exec(block)
    const pre = code ? block.slice(0, code.index) : block
    const post = code ? block.slice(code.index + code[0].length) : ''
    return {
      title: m[1].trim(),
      description: pre.trim(),
      queries: code ? code[1].trim() : '',
      notes: post.trim(),
    }
  })
  const days = Number(text.match(/within the last (\d+) days/i)?.[1]) || null
  return { text, eol, bodyStart, bodyEnd, intro, categories, days }
}

function renderCategories(intro, categories) {
  const blocks = categories.map((c, i) => {
    const parts = [`### Priority ${i + 1}: ${c.title}`]
    if (c.description) parts.push(c.description)
    parts.push('```\n' + (c.queries || '') + '\n```')
    if (c.notes) parts.push(c.notes)
    return parts.join('\n\n')
  })
  const head = intro.trim() ? `${intro.trimEnd()}\n\n` : '\n'
  return `${head}${blocks.join('\n\n')}\n\n`
}

// Termos entre aspas das consultas, menos os genéricos - viram palavras-chave de lista.
const GENERIC = new Set(['remoto', 'remote', 'brasil', 'brazil', 'latam', 'pleno', 'sênior', 'senior'])
function keywordsOf(category) {
  const terms = [...category.queries.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim())
  return [...new Set(terms.filter((t) => !GENERIC.has(t.toLowerCase())))].slice(0, 12)
}

function portals() {
  if (!fs.existsSync(PORTALS)) return []
  return fs.readdirSync(PORTALS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(PORTALS, d.name, 'SKILL.md')))
    .map((d) => {
      const { text } = readText(path.join(PORTALS, d.name, 'SKILL.md'))
      const front = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
      const desc = front.match(/^description:\s*>?\s*\n?\s*(.+)$/m)?.[1]?.trim() ?? ''
      return {
        id: d.name,
        name: d.name.replace(/-search$/, ''),
        description: desc.replace(/^["']|["']$/g, '').slice(0, 160),
        enabled: !/^enabled:\s*false\b/m.test(front),
        installed: !fs.existsSync(path.join(PORTALS, d.name, 'cli', 'package.json')) ||
          fs.existsSync(path.join(PORTALS, d.name, 'cli', 'node_modules')),
      }
    })
}

export function searchSettings() {
  let parsed = null
  let error = null
  try { parsed = parseQueries() } catch (e) { error = e.message }
  return {
    file: path.relative(ROOT, QUERIES).replace(/\\/g, '/'),
    error,
    days: parsed?.days ?? null,
    categories: (parsed?.categories ?? []).map((c) => ({ ...c, keywords: keywordsOf(c) })),
    portals: portals(),
    backups: path.join(CONFIG_DIR, 'backups', WS_ID),
  }
}

// Recebe a lista completa (já reordenada/editada) e regrava só a seção de categorias.
export function saveCategories(list) {
  if (!Array.isArray(list) || list.length > 30) throw httpError(400, 'lista de categorias inválida')
  const categories = list.map((c) => ({
    title: cleanLine(c.title),
    description: cleanBlock(c.description),
    queries: cleanBlock(c.queries),
    notes: cleanBlock(c.notes),
  }))
  const q = parseQueries()
  const text = q.text.slice(0, q.bodyStart) + renderCategories(q.intro, categories) + q.text.slice(q.bodyEnd)
  writeText(QUERIES, text, q.eol)
}

export function saveDays(days) {
  const n = Number(days)
  if (!Number.isInteger(n) || n < 1 || n > 365) throw httpError(400, 'informe de 1 a 365 dias')
  const q = parseQueries()
  if (!q.days) throw httpError(422, 'search-queries.md não tem a frase "within the last N days"')
  writeText(QUERIES, q.text.replace(/within the last \d+ days/i, `within the last ${n} days`), q.eol)
}

export function setPortalEnabled(id, enabled) {
  if (!/^[a-z0-9-]+$/.test(String(id))) throw httpError(400, 'portal inválido')
  const file = path.join(PORTALS, id, 'SKILL.md')
  if (!fs.existsSync(file)) throw httpError(404, 'portal não encontrado')
  const { text, eol } = readText(file)
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) throw httpError(422, 'SKILL.md sem frontmatter')
  // Troca só o valor e mantém o comentário da linha; sem a chave, o /scrape trata
  // como ligado, então só é preciso acrescentá-la para desligar.
  let front = m[1]
  if (/^enabled:/m.test(front)) front = front.replace(/^(enabled:\s*)\w+/m, `$1${enabled}`)
  else if (!enabled) front += '\nenabled: false'
  else return
  writeText(file, text.replace(m[0], `---\n${front}\n---`), eol)
}

// ---------- listas de objetivos (do painel) ----------

const COLUMN_IDS = ['new', 'ranked', 'drafted', 'applied', 'interview', 'offer', 'closed', 'discarded']

function defaultLists() {
  return {
    active: 'all',
    lists: [{
      id: 'all', name: 'Todas as vagas', builtin: true,
      filters: { include: [], exclude: [], fits: [], portals: [], minScore: null, flagsOk: false, applications: true },
      columns: COLUMN_IDS.filter((c) => c !== 'discarded'),
    }],
  }
}

export function readLists() {
  try {
    const data = JSON.parse(fs.readFileSync(LISTS_FILE, 'utf8'))
    if (Array.isArray(data.lists) && data.lists.some((l) => l.id === 'all')) return data
  } catch { /* primeiro uso ou arquivo inválido */ }
  return defaultLists()
}

function terms(v) {
  return (Array.isArray(v) ? v : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 40).map((t) => t.slice(0, 60))
}

export function writeLists(data) {
  if (!data || !Array.isArray(data.lists) || data.lists.length > 50) throw httpError(400, 'listas inválidas')
  const lists = data.lists.map((l) => {
    const f = l.filters || {}
    const min = f.minScore === null || f.minScore === '' || f.minScore === undefined ? null : Number(f.minScore)
    return {
      id: String(l.id).replace(/[^\w-]/g, '').slice(0, 40) || crypto.randomUUID().slice(0, 8),
      name: cleanLine(l.name, 60),
      builtin: l.id === 'all',
      filters: {
        include: terms(f.include),
        exclude: terms(f.exclude),
        fits: terms(f.fits).filter((x) => ['high', 'medium', 'low'].includes(x)),
        portals: terms(f.portals),
        minScore: Number.isFinite(min) ? Math.max(0, Math.min(100, min)) : null,
        flagsOk: Boolean(f.flagsOk),
        applications: f.applications !== false,
      },
      columns: (Array.isArray(l.columns) ? l.columns : []).filter((c) => COLUMN_IDS.includes(c)),
    }
  })
  if (!lists.some((l) => l.id === 'all')) throw httpError(400, 'a lista "Todas as vagas" não pode ser removida')
  const out = { active: lists.some((l) => l.id === data.active) ? data.active : 'all', lists }
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(LISTS_FILE, JSON.stringify(out, null, 2), 'utf8')
  return out
}
