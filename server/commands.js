// Catálogo dos comandos expostos como botões. Nada fora desta lista é executado:
// o cliente envia só o `id` e parâmetros, que são validados aqui antes de virar
// argv (sempre sem shell).
//
// Dois tipos:
//   script  - roda direto (Python, LaTeX) e a saída vai para o painel de logs
//   claude  - slash command do Claude Code; o painel copia o comando ou, quando
//             o CLI `claude` está no PATH (ou em CLAUDE_BIN), abre um terminal
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { ROOT, trackerRow, httpError } from './data.js'

// ---------- descoberta de executáveis ----------

let pythonCache
export function python() {
  if (pythonCache !== undefined) return pythonCache
  const candidates = [
    process.env.PYTHON && [process.env.PYTHON, []],
    process.platform === 'win32' && ['py', ['-3']],
    ['python3', []],
    ['python', []],
  ].filter(Boolean)
  pythonCache = null
  for (const [cmd, pre] of candidates) {
    // No Windows, `python` pode ser o alias da Microsoft Store, que não é Python.
    const r = spawnSync(cmd, [...pre, '--version'], { encoding: 'utf8', windowsHide: true })
    if (r.status === 0 && /Python 3/.test(`${r.stdout}${r.stderr}`)) {
      pythonCache = { cmd, pre }
      break
    }
  }
  return pythonCache
}

let claudeCache
export function claudeBin() {
  if (claudeCache !== undefined) return claudeCache
  claudeCache = null
  if (process.env.CLAUDE_BIN && fs.existsSync(process.env.CLAUDE_BIN)) {
    claudeCache = process.env.CLAUDE_BIN
    return claudeCache
  }
  const finder = process.platform === 'win32' ? 'where.exe' : 'which'
  const r = spawnSync(finder, ['claude'], { encoding: 'utf8', windowsHide: true })
  if (r.status === 0) {
    const found = r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    // npm instala também um script sem extensão (para Git Bash) que o Windows não executa.
    claudeCache = (process.platform === 'win32' ? found.find((f) => /\.(exe|cmd)$/i.test(f)) : found[0]) || null
  }
  return claudeCache
}

const py = (...args) => {
  const p = python()
  if (!p) throw httpError(500, 'Python 3 não encontrado (defina a variável PYTHON)')
  return { cmd: p.cmd, args: [...p.pre, ...args], cwd: ROOT }
}

// ---------- validação ----------

function intParam(value, { min, max, def }) {
  if (value === undefined || value === '') return def
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) throw httpError(400, `número inválido: ${value}`)
  return n
}

function textParam(value, max = 200) {
  const s = String(value ?? '').trim()
  if (s.length > max || /[\r\n\0]/.test(s)) throw httpError(400, 'texto inválido')
  return s
}

function httpUrl(value) {
  const s = textParam(value, 2000)
  let u
  try { u = new URL(s) } catch { throw httpError(400, 'URL inválida') }
  if (!/^https?:$/.test(u.protocol)) throw httpError(400, 'apenas URLs http(s)')
  return u.href
}

// Caminho do tracker -> arquivo dentro de cv/ ou cover_letters/.
function docPath(rel, dir, ext) {
  const s = String(rel ?? '').trim().replace(/\\/g, '/')
  if (!s) throw httpError(400, 'esta candidatura não tem esse arquivo no tracker')
  const abs = path.resolve(ROOT, s)
  const base = path.join(ROOT, dir) + path.sep
  if (!abs.startsWith(base) || path.dirname(abs) !== path.join(ROOT, dir)) {
    throw httpError(400, `arquivo fora de ${dir}/: ${s}`)
  }
  const target = abs.replace(/\.[^.\\/]+$/, ext)
  return { abs: target, rel: path.relative(ROOT, target).replace(/\\/g, '/'), name: path.basename(target) }
}

function rowDoc(params, column, dir, ext) {
  const row = trackerRow(intParam(params.index, { min: 0, max: 1e6 }))
  if (!row) throw httpError(404, 'linha não encontrada no tracker')
  return docPath(row[column], dir, ext)
}

function mustExist(doc) {
  if (!fs.existsSync(doc.abs)) throw httpError(404, `não encontrado: ${doc.rel}`)
  return doc
}

// ---------- catálogo ----------

export const GROUPS = [
  { id: 'search', title: 'Buscar e avaliar' },
  { id: 'track', title: 'Acompanhar' },
  { id: 'reports', title: 'Relatórios e integrações' },
  { id: 'setup', title: 'Configuração' },
  { id: 'maintenance', title: 'Manutenção' },
]

export const COMMANDS = [
  // --- Claude Code ---
  { id: 'scrape', kind: 'claude', group: 'search', label: 'Buscar vagas', icon: 'search',
    description: 'Busca nos portais instalados e deduplica (/scrape).',
    params: [{ name: 'args', label: 'Argumentos (opcional, ex.: health)', type: 'text', optional: true }],
    prompt: (p) => `/scrape ${textParam(p.args)}`.trim() },
  { id: 'rank', kind: 'claude', group: 'search', label: 'Ranquear', icon: 'star',
    description: 'Pontua as vagas novas e monta a shortlist (/rank).',
    params: [{ name: 'args', label: 'Argumentos (ex.: --all, --focus "aws")', type: 'text', optional: true }],
    prompt: (p) => `/rank ${textParam(p.args)}`.trim() },
  { id: 'apply', kind: 'claude', group: 'search', label: 'Candidatar', icon: 'send',
    description: 'Avalia a vaga e gera CV + carta sob medida (/apply).',
    params: [{ name: 'url', label: 'URL da vaga', type: 'url', required: true }],
    prompt: (p) => `/apply ${httpUrl(p.url)}` },
  { id: 'outcome', kind: 'claude', group: 'track', label: 'Registrar resultado', icon: 'flag',
    description: 'Atualiza o status e arquiva o resultado (/outcome).',
    params: [{ name: 'args', label: 'Empresa / vaga (opcional)', type: 'text', optional: true }],
    prompt: (p) => `/outcome ${textParam(p.args)}`.trim() },
  { id: 'interview', kind: 'claude', group: 'track', label: 'Preparar entrevista', icon: 'mic',
    description: 'Prepara respostas e perguntas (/interview).',
    params: [{ name: 'args', label: 'Empresa / vaga (opcional)', type: 'text', optional: true }],
    prompt: (p) => `/interview ${textParam(p.args)}`.trim() },
  { id: 'gmail-sync', kind: 'claude', group: 'track', label: 'Sincronizar Gmail', icon: 'mail',
    description: 'Atualiza status lendo respostas no Gmail (/gmail-sync).', prompt: () => '/gmail-sync' },
  { id: 'html-report', kind: 'claude', group: 'reports', label: 'Relatório HTML', icon: 'chart',
    description: 'Gera o relatório estático em reports/ (/html-report).', prompt: () => '/html-report' },
  { id: 'upskill', kind: 'claude', group: 'reports', label: 'Plano de estudos', icon: 'book',
    description: 'Lacunas de skills nas vagas acompanhadas (/upskill).', prompt: () => '/upskill' },
  { id: 'notion-sync', kind: 'claude', group: 'reports', label: 'Enviar ao Notion', icon: 'database',
    description: 'Envia vagas e candidaturas ao Notion (/notion-sync).', prompt: () => '/notion-sync' },
  { id: 'login', kind: 'claude', group: 'setup', label: 'Entrar no Claude', icon: 'user',
    description: 'Abre o Claude Code para fazer login na sua conta (/login).', prompt: () => '/login' },
  { id: 'setup', kind: 'claude', group: 'setup', label: 'Configurar perfil', icon: 'user',
    description: 'Onboarding / revisão do perfil (/setup).', prompt: () => '/setup' },
  { id: 'expand', kind: 'claude', group: 'setup', label: 'Expandir competências', icon: 'plus',
    description: 'Enriquece o perfil com documents/ e presença online (/expand).', prompt: () => '/expand' },
  { id: 'add-portal', kind: 'claude', group: 'setup', label: 'Adicionar portal', icon: 'globe',
    description: 'Gera um novo CLI de portal de vagas (/add-portal).',
    params: [{ name: 'args', label: 'Portal / mercado (opcional)', type: 'text', optional: true }],
    prompt: (p) => `/add-portal ${textParam(p.args)}`.trim() },
  { id: 'add-template', kind: 'claude', group: 'setup', label: 'Adicionar template', icon: 'layout',
    description: 'Registra um template próprio de CV ou carta (/add-template).', prompt: () => '/add-template' },

  // --- Scripts locais ---
  { id: 'install-portals', kind: 'script', group: 'setup', label: 'Instalar portais', icon: 'package',
    description: 'Instala as dependências de cada CLI de portal (bun install).',
    build: () => [py('tools/install_portal_clis.py')] },
  { id: 'install-pypdf', kind: 'script', group: 'setup', label: 'Instalar pypdf', icon: 'package',
    description: 'pip install pypdf — usado na verificação dos PDFs.',
    confirm: 'Instalar o pacote pypdf no Python do usuário (pip install --user pypdf)?',
    build: () => [py('-m', 'pip', 'install', '--user', 'pypdf')] },
  { id: 'rank-candidates', kind: 'script', group: 'maintenance', label: 'Prévia do /rank', icon: 'list',
    description: 'Lista o que o próximo /rank pontuaria (rank_state.py candidates).',
    params: [
      { name: 'limit', label: 'Limite (0 = todas)', type: 'number', default: 10, optional: true },
      { name: 'focus', label: 'Filtro (--focus)', type: 'text', optional: true },
      { name: 'all', label: 'Incluir já ranqueadas (--all)', type: 'checkbox', optional: true },
    ],
    build: (p) => {
      const args = ['tools/rank_state.py', 'candidates', '--limit', String(intParam(p.limit, { min: 0, max: 10000, def: 10 }))]
      const focus = textParam(p.focus)
      if (focus) args.push('--focus', focus)
      if (p.all === true) args.push('--all')
      return [py(...args)]
    } },
  { id: 'rank-sweep', kind: 'script', group: 'maintenance', label: 'Prazos vencidos', icon: 'clock',
    description: 'Mostra vagas ranqueadas com prazo vencido, sem gravar.',
    build: () => [py('tools/rank_state.py', 'sweep')] },
  { id: 'rank-sweep-write', kind: 'script', group: 'maintenance', label: 'Expirar vencidas', icon: 'archive',
    description: 'Marca como expired as vagas com prazo vencido.',
    confirm: 'Marcar como "expired" as vagas ranqueadas com prazo vencido em seen_jobs.json?',
    build: () => [py('tools/rank_state.py', 'sweep', '--write')] },
  { id: 'security-guards', kind: 'script', group: 'maintenance', label: 'Guardas de segurança', icon: 'shield',
    description: 'Mesma checagem de segurança do CI.',
    build: () => [py('tools/security_guards.py')] },
  { id: 'tests', kind: 'script', group: 'maintenance', label: 'Rodar testes', icon: 'check',
    description: 'Suíte de testes do projeto (unittest, como no CI).',
    build: () => [py('-m', 'unittest', 'discover', '-s', 'tests', '-t', '.')] },

  // --- Ações de card (candidaturas do tracker) ---
  { id: 'compile-cv', kind: 'script', group: 'card', label: 'Compilar CV', icon: 'cog',
    build: (p) => {
      const tex = mustExist(rowDoc(p, 'cv_file', 'cv', '.tex'))
      return [{ cmd: 'lualatex', args: ['-interaction=nonstopmode', '-halt-on-error', tex.name], cwd: path.dirname(tex.abs) }]
    } },
  { id: 'verify-cv', kind: 'script', group: 'card', label: 'Verificar CV', icon: 'eye',
    build: (p) => {
      const pdf = mustExist(rowDoc(p, 'cv_file', 'cv', '.pdf'))
      return [py('tools/verify_pdf.py', pdf.rel, '--pages', '2', '--ascii-dates'), py('tools/verify_layout.py', pdf.rel)]
    } },
  { id: 'compile-cover', kind: 'script', group: 'card', label: 'Compilar carta', icon: 'cog',
    build: (p) => {
      const tex = mustExist(rowDoc(p, 'cover_letter_file', 'cover_letters', '.tex'))
      return [{ cmd: 'xelatex', args: ['-interaction=nonstopmode', '-halt-on-error', tex.name], cwd: path.dirname(tex.abs) }]
    } },
  { id: 'verify-cover', kind: 'script', group: 'card', label: 'Verificar carta', icon: 'eye',
    build: (p) => {
      const pdf = mustExist(rowDoc(p, 'cover_letter_file', 'cover_letters', '.pdf'))
      return [py('tools/verify_pdf.py', pdf.rel, '--pages', '1'), py('tools/verify_layout.py', pdf.rel)]
    } },
]

export function findCommand(id) {
  const c = COMMANDS.find((x) => x.id === id)
  if (!c) throw httpError(404, `comando desconhecido: ${id}`)
  return c
}

export function publicCatalog() {
  return {
    workspace: ROOT,
    claudeCli: Boolean(claudeBin()),
    python: python() ? [python().cmd, ...python().pre].join(' ') : null,
    groups: GROUPS,
    commands: COMMANDS.map(({ build, prompt, ...rest }) => rest),
  }
}

// Caminho de PDF (para abrir no navegador) de uma candidatura.
export function pdfFor(index, kind) {
  const p = { index }
  return kind === 'cover'
    ? rowDoc(p, 'cover_letter_file', 'cover_letters', '.pdf')
    : rowDoc(p, 'cv_file', 'cv', '.pdf')
}
