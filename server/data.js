// Leitura e escrita dos dois arquivos de estado do workspace:
//   job_scraper/seen_jobs.json  - vagas encontradas por /scrape e pontuadas por /rank
//   job_search_tracker.csv      - candidaturas registradas por /apply e /outcome
// As escritas mudam só o campo `status` do registro alvo e preservam o resto do
// arquivo byte a byte (formatação, aspas, quebras de linha).
import fs from 'node:fs'
import path from 'node:path'
import { resolveWorkspace } from './workspace.js'

export const ROOT = resolveWorkspace()
export const SEEN = path.join(ROOT, 'job_scraper', 'seen_jobs.json')
export const TRACKER = path.join(ROOT, 'job_search_tracker.csv')

export const TRACKER_HEADER = [
  'date', 'company', 'sector', 'role', 'role_type', 'channel', 'status', 'contact_person',
  'fit_rating', 'notes', 'cv_file', 'cover_letter_file', 'source', 'deadline',
]

// Vocabulário de /outcome ("Tracker status vocabulary"); grafias legadas com espaço
// são lidas como as formas com underscore.
export const TRACKER_STATUSES = [
  'drafted', 'applied', 'interview', 'offer',
  'hired', 'rejected', 'no_response', 'offer_declined', 'withdrawn',
]
// Valores que o painel pode gravar em seen_jobs.json (ranked/expired/unreachable
// pertencem a tools/rank_state.py).
export const SEEN_WRITABLE = ['new', 'skipped', 'ranked']

export function normTrackerStatus(value) {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'no response') return 'no_response'
  if (v === 'offer declined') return 'offer_declined'
  return v
}

function norm(text) {
  return String(text ?? '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function normUrl(url) {
  return String(url ?? '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase()
}

// ---------- CSV (RFC 4180) com offsets de cada registro ----------

export function parseCsv(text) {
  const records = []
  let i = 0
  const n = text.length
  if (text.charCodeAt(0) === 0xfeff) i = 1
  while (i < n) {
    const start = i
    const fields = []
    let field = ''
    let inQuotes = false
    for (; i < n; i++) {
      const c = text[i]
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
        } else field += c
      } else if (c === '"') inQuotes = true
      else if (c === ',') { fields.push(field); field = '' }
      else if (c === '\r' || c === '\n') break
      else field += c
    }
    fields.push(field)
    const end = i
    if (text[i] === '\r' && text[i + 1] === '\n') i += 2
    else if (i < n) i += 1
    if (!(fields.length === 1 && fields[0] === '')) records.push({ fields, start, end })
  }
  return records
}

function csvField(value) {
  const s = String(value ?? '')
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ---------- escrita atômica ----------

function atomicWrite(file, content) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`)
  fs.writeFileSync(tmp, content, 'utf8')
  fs.renameSync(tmp, file)
}

// ---------- leitura ----------

function readSeen() {
  if (!fs.existsSync(SEEN)) return { doc: null, seen: {} }
  const raw = fs.readFileSync(SEEN, 'utf8').replace(/^﻿/, '')
  const doc = JSON.parse(raw)
  return { doc, seen: doc.seen ?? {}, raw }
}

function readTracker() {
  if (!fs.existsSync(TRACKER)) return { header: TRACKER_HEADER, rows: [], records: [], text: '' }
  const text = fs.readFileSync(TRACKER, 'utf8')
  const records = parseCsv(text)
  const header = records.length ? records[0].fields.map((h) => h.trim()) : TRACKER_HEADER
  const rows = records.slice(1).map((rec, idx) => {
    const row = {}
    header.forEach((h, j) => { row[h] = rec.fields[j] ?? '' })
    row.__index = idx
    return row
  })
  return { header, rows, records, text }
}

export function loadBoard() {
  const { seen } = readSeen()
  const tracker = readTracker()

  const appliedUrls = new Set()
  const appliedPairs = new Set()
  const applications = tracker.rows.map((row) => {
    if (row.source) appliedUrls.add(normUrl(row.source))
    appliedPairs.add(`${norm(row.company)}|${norm(row.role)}`)
    const fit = Number.parseFloat(row.fit_rating)
    return {
      id: `app:${row.__index}`,
      source: 'tracker',
      index: row.__index,
      title: row.role,
      company: row.company,
      url: row.source || null,
      status: normTrackerStatus(row.status),
      rawStatus: row.status,
      score: Number.isFinite(fit) ? fit : null,
      date: row.date || null,
      deadline: row.deadline || null,
      details: row,
    }
  })

  const jobs = []
  let hiddenAsApplied = 0
  for (const [key, entry] of Object.entries(seen)) {
    // Uma vaga que já virou candidatura aparece só no card do tracker.
    if (
      (entry.url && appliedUrls.has(normUrl(entry.url))) ||
      appliedPairs.has(`${norm(entry.company)}|${norm(entry.title)}`)
    ) { hiddenAsApplied++; continue }
    jobs.push({
      id: `seen:${key}`,
      source: 'seen',
      key,
      title: entry.title,
      company: entry.company,
      url: entry.url || null,
      status: entry.status || 'new',
      fit: entry.fit || null,
      score: typeof entry.rank_score === 'number' ? entry.rank_score : null,
      date: entry.first_seen || null,
      posted: entry.posted_date || null,
      deadline: entry.deadline || null,
      portal: entry.portal || null,
      details: entry,
    })
  }

  return {
    jobs,
    applications,
    meta: {
      seenFile: fs.existsSync(SEEN),
      trackerFile: fs.existsSync(TRACKER),
      seenTotal: Object.keys(seen).length,
      hiddenAsApplied,
      loadedAt: new Date().toISOString(),
    },
  }
}

// ---------- escrita de status ----------

export function setSeenStatus(key, status) {
  if (!SEEN_WRITABLE.includes(status)) throw httpError(400, `status inválido para vaga: ${status}`)
  const { doc, raw } = readSeen()
  if (!doc || !doc.seen?.[key]) throw httpError(404, 'vaga não encontrada em seen_jobs.json')
  const entry = doc.seen[key]
  if (status === 'ranked' && typeof entry.rank_score !== 'number') {
    throw httpError(409, 'esta vaga nunca foi ranqueada - rode /rank')
  }
  entry.status = status
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  let out = JSON.stringify(doc, null, 2)
  if (eol === '\r\n') out = out.replace(/\n/g, '\r\n')
  if (/\r?\n$/.test(raw)) out += eol
  atomicWrite(SEEN, out)
}

export function setTrackerStatus(index, status, expect) {
  const st = normTrackerStatus(status)
  if (!TRACKER_STATUSES.includes(st)) throw httpError(400, `status inválido: ${status}`)
  const { header, records, text } = readTracker()
  const rec = records[index + 1]
  const col = header.indexOf('status')
  if (!rec || col < 0) throw httpError(404, 'linha não encontrada no tracker')
  const cIdx = header.indexOf('company')
  const rIdx = header.indexOf('role')
  // Proteção contra o arquivo ter mudado entre a leitura do painel e o clique.
  if (expect && (rec.fields[cIdx] !== expect.company || rec.fields[rIdx] !== expect.role)) {
    throw httpError(409, 'o tracker mudou desde a última leitura - recarregue')
  }
  const fields = rec.fields.slice()
  while (fields.length <= col) fields.push('')
  fields[col] = st
  const line = fields.map(csvField).join(',')
  atomicWrite(TRACKER, text.slice(0, rec.start) + line + text.slice(rec.end))
}

export function trackerRow(index) {
  const { rows } = readTracker()
  return rows[index] ?? null
}

export function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}
