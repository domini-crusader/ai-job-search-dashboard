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
  if (r.status === 0) claudeCache = r.stdout.split(/\r?\n/).find(Boolean)?.trim() || null
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

export const COMMANDS = [
  // --- Fluxo principal (Claude Code) ---
  { id: 'scrape', kind: 'claude', group: 'Fluxo (Claude Code)', label: 'Buscar vagas', icon: '🔎',
    description: 'Roda /scrape: busca nos portais instalados e deduplica.',
    params: [{ name: 'args', label: 'Argumentos (opcional, ex.: health)', type: 'text' }],
    prompt: (p) => `/scrape ${textParam(p.args)}`.trim() },
  { id: 'rank', kind: 'claude', group: 'Fluxo (Claude Code)', label: 'Ranquear vagas', icon: '🏅',
    description: 'Roda /rank: pontua as vagas novas e devolve a shortlist.',
    params: [{ name: 'args', label: 'Argumentos (ex.: --all, --focus "aws")', type: 'text' }],
    prompt: (p) => `/rank ${textParam(p.args)}`.trim() },
  { id: 'apply', kind: 'claude', group: 'Fluxo (Claude Code)', label: 'Candidatar (/apply)', icon: '📝',
    description: 'Avalia a vaga e gera CV + carta sob medida.',
    params: [{ name: 'url', label: 'URL da vaga', type: 'url', required: true }],
    prompt: (p) => `/apply ${httpUrl(p.url)}` },
  { id: 'outcome', kind: 'claude', group: 'Fluxo (Claude Code)', label: 'Registrar resultado', icon: '📬',
    description: 'Roda /outcome: atualiza status e arquiva o resultado.',
    params: [{ name: 'args', label: 'Empresa / vaga (opcional)', type: 'text' }],
    prompt: (p) => `/outcome ${textParam(p.args)}`.trim() },
  { id: 'interview', kind: 'claude', group: 'Fluxo (Claude Code)', label: 'Preparar entrevista', icon: '🎤',
    description: 'Roda /interview para uma candidatura do tracker.',
    params: [{ name: 'args', label: 'Empresa / vaga (opcional)', type: 'text' }],
    prompt: (p) => `/interview ${textParam(p.args)}`.trim() },

  // --- Relatórios e integrações (Claude Code) ---
  { id: 'html-report', kind: 'claude', group: 'Relatórios e integrações', label: 'Relatório HTML', icon: '📊',
    description: 'Gera o dashboard estático em reports/.', prompt: () => '/html-report' },
  { id: 'upskill', kind: 'claude', group: 'Relatórios e integrações', label: 'Plano de estudos', icon: '📚',
    description: 'Lacunas de skills nas vagas acompanhadas.', prompt: () => '/upskill' },
  { id: 'gmail-sync', kind: 'claude', group: 'Relatórios e integrações', label: 'Sincronizar Gmail', icon: '✉️',
    description: 'Atualiza status lendo respostas no Gmail.', prompt: () => '/gmail-sync' },
  { id: 'notion-sync', kind: 'claude', group: 'Relatórios e integrações', label: 'Enviar ao Notion', icon: '🗂️',
    description: 'Envia vagas ranqueadas e candidaturas ao Notion.', prompt: () => '/notion-sync' },

  // --- Configuração (Claude Code) ---
  { id: 'setup', kind: 'claude', group: 'Configuração', label: 'Perfil (/setup)', icon: '👤',
    description: 'Onboarding / revisão do perfil do candidato.', prompt: () => '/setup' },
  { id: 'expand', kind: 'claude', group: 'Configuração', label: 'Expandir competências', icon: '➕',
    description: 'Lê documents/ e presença online para enriquecer o perfil.', prompt: () => '/expand' },
  { id: 'add-portal', kind: 'claude', group: 'Configuração', label: 'Adicionar portal', icon: '🌐',
    description: 'Gera um novo CLI de portal de vagas.',
    params: [{ name: 'args', label: 'Portal / mercado (opcional)', type: 'text' }],
    prompt: (p) => `/add-portal ${textParam(p.args)}`.trim() },
  { id: 'add-template', kind: 'claude', group: 'Configuração', label: 'Adicionar template', icon: '🎨',
    description: 'Registra um template próprio de CV ou carta.', prompt: () => '/add-template' },

  // --- Scripts locais (execução direta) ---
  { id: 'rank-candidates', kind: 'script', group: 'Scripts locais', label: 'Candidatas ao /rank', icon: '📋',
    description: 'tools/rank_state.py candidates - lista o que o próximo /rank pontuaria.',
    params: [
      { name: 'limit', label: 'Limite (0 = todas)', type: 'number', default: 10 },
      { name: 'focus', label: 'Filtro (--focus)', type: 'text' },
      { name: 'all', label: 'Incluir já ranqueadas (--all)', type: 'checkbox' },
    ],
    build: (p) => {
      const args = ['tools/rank_state.py', 'candidates', '--limit', String(intParam(p.limit, { min: 0, max: 10000, def: 10 }))]
      const focus = textParam(p.focus)
      if (focus) args.push('--focus', focus)
      if (p.all === true) args.push('--all')
      return [py(...args)]
    } },
  { id: 'rank-sweep', kind: 'script', group: 'Scripts locais', label: 'Varredura de prazos (simulação)', icon: '⏳',
    description: 'tools/rank_state.py sweep - mostra vagas ranqueadas com prazo vencido, sem gravar.',
    build: () => [py('tools/rank_state.py', 'sweep')] },
  { id: 'rank-sweep-write', kind: 'script', group: 'Scripts locais', label: 'Varredura de prazos (gravar)', icon: '🧹',
    description: 'tools/rank_state.py sweep --write - marca como expired as vagas vencidas.',
    confirm: 'Marcar como "expired" as vagas ranqueadas com prazo vencido em seen_jobs.json?',
    build: () => [py('tools/rank_state.py', 'sweep', '--write')] },
  { id: 'install-portals', kind: 'script', group: 'Scripts locais', label: 'Instalar CLIs dos portais', icon: '📦',
    description: 'tools/install_portal_clis.py - bun install em cada portal.',
    build: () => [py('tools/install_portal_clis.py')] },
  { id: 'security-guards', kind: 'script', group: 'Scripts locais', label: 'Checar guardas de segurança', icon: '🛡️',
    description: 'tools/security_guards.py - mesma checagem do CI.',
    build: () => [py('tools/security_guards.py')] },
  { id: 'framework-version', kind: 'script', group: 'Scripts locais', label: 'Checar versão do framework', icon: '🏷️',
    description: 'tools/check_framework_version.py',
    build: () => [py('tools/check_framework_version.py')] },
  { id: 'tests', kind: 'script', group: 'Scripts locais', label: 'Rodar testes', icon: '✅',
    description: 'python -m unittest discover -s tests -t . (como no CI).',
    build: () => [py('-m', 'unittest', 'discover', '-s', 'tests', '-t', '.')] },

  // --- Ações de card (candidaturas do tracker) ---
  { id: 'compile-cv', kind: 'script', group: 'card', label: 'Compilar CV', icon: '⚙️',
    build: (p) => {
      const tex = mustExist(rowDoc(p, 'cv_file', 'cv', '.tex'))
      return [{ cmd: 'lualatex', args: ['-interaction=nonstopmode', '-halt-on-error', tex.name], cwd: path.dirname(tex.abs) }]
    } },
  { id: 'verify-cv', kind: 'script', group: 'card', label: 'Verificar CV', icon: '🔍',
    build: (p) => {
      const pdf = mustExist(rowDoc(p, 'cv_file', 'cv', '.pdf'))
      return [py('tools/verify_pdf.py', pdf.rel, '--pages', '2', '--ascii-dates'), py('tools/verify_layout.py', pdf.rel)]
    } },
  { id: 'compile-cover', kind: 'script', group: 'card', label: 'Compilar carta', icon: '⚙️',
    build: (p) => {
      const tex = mustExist(rowDoc(p, 'cover_letter_file', 'cover_letters', '.tex'))
      return [{ cmd: 'xelatex', args: ['-interaction=nonstopmode', '-halt-on-error', tex.name], cwd: path.dirname(tex.abs) }]
    } },
  { id: 'verify-cover', kind: 'script', group: 'card', label: 'Verificar carta', icon: '🔍',
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
