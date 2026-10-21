// Detalhes de uma vaga para o painel lateral. Usa as mesmas fontes do ai-job-search:
//   - LinkedIn: o código do CLI linkedin-search (server/portal/linkedin-detail.ts)
//   - demais: tools/fetch_page.py (respeita robots.txt) + JSON-LD JobPosting da página
// e resume o anúncio com server/extract.js. O resultado fica em cache por 7 dias
// em ~/.ai-job-search-dashboard/cache, nunca dentro do repositório.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { ROOT, httpError } from './data.js'
import { CONFIG_DIR, WS_ID, searchSettings } from './settings.js'
import { python } from './commands.js'
import { ADDON_DIR } from './workspace.js'
import { htmlToText, jobPostingFromHtml, metaContent, summarize } from './extract.js'

const CACHE_DIR = path.join(CONFIG_DIR, 'cache', WS_ID)
const TTL_MS = 7 * 24 * 3600 * 1000
const inflight = new Map()

export const PORTAL_DOMAINS = {
  'linkedin-search': 'linkedin.com', 'freehire-search': 'freehire.me', 'jobindex-search': 'jobindex.dk',
  'jobnet-search': 'jobnet.dk', 'jobbank-search': 'jobbank.dk', 'jobdanmark-search': 'jobdanmark.dk',
}

// Domínios de ATS e agregadores: o favicon deles não é o logo da empresa.
const NOT_COMPANY = /(^|\.)(gupy\.io|lever\.co|greenhouse\.io|breezy\.hr|ashbyhq\.com|bamboohr\.com|workable\.com|recruitee\.com|smartrecruiters\.com|teamtailor\.com|linkedin\.com|indeed\.com|glassdoor\.com|freehire\.me|getmatch\.ru|habr\.com|torre\.ai|jobs\.|kenoby\.com|solides\.com\.br|inhire\.app|programathor\.com\.br)$/i

const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16)
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// Palavras genéricas de título que não dizem nada sobre o tipo de vaga.
const GENERIC = new Set(['desenvolvedor', 'desenvolvedora', 'developer', 'engenheiro', 'engenheira', 'engineer', 'software',
  'pessoa', 'remoto', 'remote', 'brasil', 'brazil', 'latam', 'pleno', 'senior', 'junior', 'com', 'and', 'para', 'the', 'de', 'em'])

function tokens(s) {
  return fold(s)
    .replace(/back[\s-]?end/g, 'backend').replace(/front[\s-]?end/g, 'frontend').replace(/full[\s-]?stack/g, 'fullstack')
    .split(/[^a-z0-9.#+]+/)
    .map((t) => t.replace(/^\.+(?!net)|\.+$/g, ''))
    .filter((t) => t.length >= 2 && !GENERIC.has(t))
}

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return null } }

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 90000, maxBuffer: 20 * 1024 * 1024, windowsHide: true, encoding: 'utf8', ...opts },
      (err, stdout, stderr) => resolve({ ok: !err, stdout: stdout ?? '', stderr: stderr ?? '', err }))
  })
}

async function linkedinDetail(url) {
  const id = String(url).match(/(\d{6,})(?:[/?#]|$)/)?.[1]
  const cli = path.join(ROOT, '.agents', 'skills', 'linkedin-search', 'cli')
  if (!id || !fs.existsSync(path.join(cli, 'src', 'helpers.ts'))) return null
  const r = await run('bun', ['run', path.join(ADDON_DIR, 'server', 'portal', 'linkedin-detail.ts'), cli, id])
  try { return JSON.parse(r.stdout.trim().split('\n').pop()) } catch { return null }
}

async function fetchPage(url) {
  const py = python()
  if (!py) return { html: null, note: 'Python não encontrado' }
  const out = path.join(CACHE_DIR, 'pages', `${sha(url)}.html`)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const r = await run(py.cmd, [...py.pre, 'tools/fetch_page.py', url, '--out', out], {
    cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  })
  const status = Number(r.stdout.match(/HTTP (\d+)/)?.[1])
  if (!r.ok) return { html: null, note: /robots/i.test(r.stdout + r.stderr) ? 'Bloqueado pelo robots.txt do site' : 'Página não acessível' }
  if (status !== 200 || !fs.existsSync(out)) return { html: null, note: `A página respondeu HTTP ${status || '?'}` }
  return { html: fs.readFileSync(out, 'utf8'), note: null }
}

function logoUrl(v) {
  const u = typeof v === 'string' ? v : v?.url ?? v?.contentUrl
  return u && /^https:\/\//.test(u) ? u : null
}

function mainText(html) {
  const body = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html
  return htmlToText(body).slice(0, 15000)
}

async function build(card) {
  const result = { sources: [], notes: [], logo: null, companySite: null, industries: null, text: '' }
  const url = card.url
  let ld = null
  let employment = null
  let level = null
  let location = card.details?.location || null

  if (url && /linkedin\.com\/jobs/.test(url)) {
    const d = await linkedinDetail(url)
    if (d?.detail) {
      result.text = d.detail.description ?? ''
      employment = d.detail.employmentType
      level = d.detail.seniority
      location = d.detail.location || location
      result.industries = d.detail.industries
      result.logo = d.logo
      result.companySite = d.detail.companyUrl
      result.sources.push('linkedin-search')
    } else result.notes.push('O LinkedIn não devolveu o detalhe desta vaga (pode ter sido encerrada)')
  } else if (url) {
    const p = await fetchPage(url)
    if (p.html) {
      ld = jobPostingFromHtml(p.html)
      result.text = ld?.description ? htmlToText(ld.description) : mainText(p.html)
      employment = ld?.employmentType
      const org = ld?.hiringOrganization
      result.logo = logoUrl(org?.logo) || metaContent(p.html, 'og:image')
      result.companySite = org?.sameAs || org?.url || null
      const addr = [ld?.jobLocation].flat()[0]?.address
      location = [addr?.addressLocality, addr?.addressRegion, addr?.addressCountry?.name ?? addr?.addressCountry].filter(Boolean).join(', ') || location
      result.sources.push(`${host(url)}${ld ? ' (dados estruturados)' : ''}`)
    } else result.notes.push(p.note)
  }

  const title = card.title || ''
  const summary = summarize({ title, text: result.text, ld, employment, level, location, mode: card.details?.work_mode })
  // "Busca criada": quais categorias do search-queries.md casam com esta vaga.
  // Compara por palavras significativas dos termos de cada categoria. Cada palavra vale
  // 1/(nº de categorias que a usam): ".net", presente em quase todas, pesa pouco;
  // "lead" ou "fullstack" decidem. Palavra no título vale o triplo.
  const cats = searchSettings().categories || []
  const tokenSets = cats.map((c) => new Set(c.keywords.flatMap(tokens)))
  const counts = new Map()
  for (const set of tokenSets) for (const t of set) counts.set(t, (counts.get(t) ?? 0) + 1)
  const inTitle = new Set(tokens(title))
  const inText = new Set(tokens(result.text))
  const scored = cats.map((c, i) => ({
    title: c.title,
    score: [...tokenSets[i]].reduce((s, t) => s + (inTitle.has(t) ? 3 : inText.has(t) ? 1 : 0) / counts.get(t), 0),
  })).filter((c) => c.score > 0).sort((a, b) => b.score - a.score)
  const categories = scored.filter((c) => c.score >= scored[0]?.score * 0.75).slice(0, 2).map((c) => c.title)

  const siteHost = host(result.companySite)
  const companyFavicon = siteHost && !NOT_COMPANY.test(siteHost) ? `https://${siteHost}/favicon.ico` : null
  const portalDomain = PORTAL_DOMAINS[card.portal] || null
  return {
    ...summary,
    categories,
    logo: result.logo,
    companyFavicon,
    companySite: result.companySite,
    industries: result.industries,
    portal: card.portal ? { id: card.portal, name: card.portal.replace(/-search$/, ''), icon: portalDomain ? `https://${portalDomain}/favicon.ico` : null } : null,
    via: host(url),
    viaIcon: host(url) ? `https://${host(url)}/favicon.ico` : null,
    sources: result.sources,
    notes: result.notes.filter(Boolean),
    description: result.text ? result.text.slice(0, 12000) : null,
    fetchedAt: new Date().toISOString(),
  }
}

function cacheFile(id) {
  return path.join(CACHE_DIR, 'jobs', `${sha(id)}.json`)
}

export function cachedDetails(id) {
  try { return JSON.parse(fs.readFileSync(cacheFile(id), 'utf8')) } catch { return null }
}

export async function jobDetails(card, { refresh = false } = {}) {
  if (!card) throw httpError(404, 'vaga não encontrada')
  const cached = cachedDetails(card.id)
  if (cached && !refresh && Date.now() - Date.parse(cached.fetchedAt) < TTL_MS) return cached
  if (inflight.has(card.id)) return inflight.get(card.id)
  const job = build(card).then((res) => {
    fs.mkdirSync(path.dirname(cacheFile(card.id)), { recursive: true })
    fs.writeFileSync(cacheFile(card.id), JSON.stringify(res), 'utf8')
    return res
  }).finally(() => inflight.delete(card.id))
  inflight.set(card.id, job)
  return job
}

// Resumo curto para os cards do quadro (só o que já está em cache).
export function brief(id) {
  const c = cachedDetails(id)
  if (!c) return null
  return { workModel: c.workModel, seniority: c.seniority?.[0] ?? null, salary: c.salary, logo: c.logo || c.companyFavicon || null }
}
