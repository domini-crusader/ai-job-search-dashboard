// Estado compartilhado do painel e chamadas à API local (server/api.js).
import { reactive } from 'vue'

const TABS = ['inicio', 'vagas', 'comandos']

export const state = reactive({
  board: { jobs: [], applications: [], meta: {} },
  catalog: { commands: [], claudeCli: false, python: null },
  loading: true,
  error: null,
  runs: [], // { uid, id, label, output, status: 'running'|'ok'|'fail'|'stopped', controller }
  activeRun: null,
  toasts: [],
  tab: tabFromHash(),
  health: null,
  profile: null,
  search: null,
  lists: null, // { active, lists: [...] } - listas de objetivos
  prefs: loadPrefs(),
  dialog: null, // { command, params } - diálogo de parâmetros aberto
  selected: null, // id do card aberto no painel lateral
  details: {}, // id -> { loading, data, error } - detalhes extraídos da vaga
})

export async function loadDetails(id, refresh = false) {
  const cur = state.details[id]
  if (cur?.loading || (cur?.data && !refresh)) return
  state.details[id] = { loading: true, data: cur?.data ?? null, error: null }
  try {
    const data = await api(`/api/job?id=${encodeURIComponent(id)}${refresh ? '&refresh=1' : ''}`)
    state.details[id] = { loading: false, data, error: null }
    // Atualiza o resumo do card sem recarregar o quadro inteiro.
    const card = [...state.board.jobs, ...state.board.applications].find((c) => c.id === id)
    if (card) card.brief = { workModel: data.workModel, seniority: data.seniority?.[0] ?? null, salary: data.salary, logo: data.logo || data.companyFavicon }
  } catch (e) {
    state.details[id] = { loading: false, data: cur?.data ?? null, error: e.message }
  }
}

function tabFromHash() {
  const t = location.hash.replace(/^#\/?/, '')
  return TABS.includes(t) ? t : 'vagas'
}

export function goTo(tab) {
  state.tab = tab
  history.replaceState(null, '', `#/${tab}`)
}
window.addEventListener('hashchange', () => { state.tab = tabFromHash() })

// Preferências por navegador (tema, filtros); a falta de storage só desliga a memória.
function loadPrefs() {
  const defaults = { theme: 'system', showDiscarded: false, fitFilter: [], claudeMode: 'background' }
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('ajs-dashboard-prefs') || '{}') } } catch { return defaults }
}

export function savePrefs() {
  try { localStorage.setItem('ajs-dashboard-prefs', JSON.stringify(state.prefs)) } catch { /* sem storage */ }
  document.documentElement.dataset.theme = state.prefs.theme === 'system' ? '' : state.prefs.theme
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Dashboard': '1' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export async function apiPut(path, body) {
  try {
    return await api(path, { method: 'PUT', body })
  } catch (e) {
    toast(e.message, 'error')
    return null
  }
}

export async function apiGet(path) {
  try { return await api(path) } catch (e) { toast(e.message, 'error'); return null }
}

export function toast(message, kind = 'info', action = null) {
  const t = { uid: Math.random(), message, kind, action }
  state.toasts.push(t)
  setTimeout(() => dismissToast(t.uid), action ? 9000 : 4500)
}

export function dismissToast(uid) {
  const i = state.toasts.findIndex((t) => t.uid === uid)
  if (i >= 0) state.toasts.splice(i, 1)
}

export async function loadBoard() {
  try {
    state.board = await api('/api/board')
    state.error = null
  } catch (e) {
    state.error = e.message
  } finally {
    state.loading = false
  }
}

export async function loadCatalog() {
  try { state.catalog = await api('/api/catalog') } catch (e) { toast(e.message, 'error') }
}

export async function loadHealth() {
  try { state.health = await api('/api/health') } catch (e) { toast(e.message, 'error') }
}

export function watchChanges() {
  const es = new EventSource('/api/events')
  es.addEventListener('changed', () => loadBoard())
  // Ao voltar para a aba (por exemplo, depois de logar no terminal), reconsulta o login.
  window.addEventListener('focus', () => { if (state.catalog.claudeCli) loadCatalog() })
}

export async function setStatus(card, status) {
  const body = { id: card.id, status }
  if (card.source === 'tracker') body.expect = { company: card.details.company, role: card.details.role }
  try {
    await api('/api/status', { method: 'POST', body })
    toast(`“${card.title}” → ${status}`, 'ok')
  } catch (e) {
    toast(e.message, 'error')
  }
  await loadBoard()
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

// Abrir uma janela do terminal leva alguns segundos sem retorno visual, o que
// convida a clicar de novo; o mesmo comando fica travado por um instante.
const launching = new Map()

// Comandos do Claude Code: copia o slash command ou abre o CLI num terminal.
export async function claudeCommand(id, params = {}, launch = false) {
  if (launch) {
    if (Date.now() - (launching.get(id) ?? 0) < 6000) {
      toast('Este comando já está abrindo no terminal — a janela pode levar alguns segundos', 'info')
      return false
    }
    launching.set(id, Date.now())
    toast(id === 'login' ? 'Abrindo o Claude Code para login…' : 'Abrindo o Claude Code no terminal…', 'info')
  }
  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dashboard': '1' },
      body: JSON.stringify({ id, params, launch }),
    })
    const data = await res.json().catch(() => ({}))
    // CLI sem login: copia o comando (cola-se no app do Claude) e oferece o login.
    if (res.status === 409 && data.code === 'login') {
      await copyText(data.prompt)
      state.catalog.claudeLoggedIn = false
      launching.delete(id)
      toast(`O Claude Code do terminal não está logado. ${data.prompt} foi copiado — cole no app do Claude, ou faça login para rodar daqui.`,
        'error', { label: 'Fazer login', run: () => claudeCommand('login', {}, true) })
      return false
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    const { prompt } = data
    if (launch) {
      toast(id === 'login'
        ? 'Abrindo o Claude Code: entre na sua conta na janela do terminal e depois volte aqui'
        : `Abrindo o Claude Code com ${prompt} numa janela do terminal`, 'ok')
    } else {
      await copyText(prompt)
      toast(`Copiado: ${prompt} — cole no Claude Code`, 'ok')
    }
    return true
  } catch (e) {
    toast(e.message, 'error')
    return false
  }
}

// Scripts locais: a resposta chega em streaming e vai para o console.
export async function runScript(command, params = {}) {
  const busy = state.runs.find((r) => r.id === command.id && r.status === 'running')
  if (busy) {
    toast(`${command.label} já está em execução`, 'info', { label: 'Ver saída', run: () => { state.activeRun = busy.uid; goTo('comandos') } })
    return
  }
  const controller = new AbortController()
  const run = reactive({
    uid: Date.now() + Math.random(),
    id: command.id,
    label: params.__label || command.label,
    output: '',
    status: 'running',
    exitCode: null,
    controller,
    startedAt: new Date(),
  })
  state.runs.unshift(run)
  if (state.runs.length > 20) state.runs.pop()
  state.activeRun = run.uid
  if (state.tab !== 'comandos') {
    toast(`${run.label}: em execução`, 'info', { label: 'Ver saída', run: () => goTo('comandos') })
  }

  const { __label, __background, ...cleanParams } = params
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dashboard': '1' },
      body: JSON.stringify({ id: command.id, params: cleanParams, background: Boolean(__background) }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      run.output += decoder.decode(value, { stream: true })
    }
    const m = run.output.match(/__EXIT__(-?\d+)\s*$/)
    run.exitCode = m ? Number(m[1]) : null
    run.output = run.output.replace(/__EXIT__-?\d+\s*$/, '')
    run.status = run.exitCode === 0 ? 'ok' : 'fail'
  } catch (e) {
    if (e.name === 'AbortError') {
      run.status = 'stopped'
      run.output += '\n[interrompido]\n'
    } else {
      run.status = 'fail'
      run.output += `\n[erro] ${e.message}\n`
    }
  }
  toast(`${run.label}: ${{ ok: 'concluído', fail: 'falhou', stopped: 'interrompido' }[run.status]}`,
    run.status === 'ok' ? 'ok' : 'error',
    state.tab !== 'comandos' ? { label: 'Ver saída', run: () => { state.activeRun = run.uid; goTo('comandos') } } : null)
  if (['install-portals', 'install-pypdf'].includes(command.id)) loadHealth()
}

export function findCommand(id) {
  return state.catalog.commands.find((c) => c.id === id)
}

// Ponto único de disparo dos botões: um clique executa; o diálogo só abre quando
// falta um parâmetro obrigatório, o comando pede confirmação ou `options` é pedido.
export function trigger(id, preset = {}, launch = false, options = false) {
  const command = findCommand(id)
  if (!command) return toast(`comando indisponível: ${id}`, 'error')
  const missing = (command.params || []).some((p) => p.required && !preset[p.name])
  if (options || missing || command.confirm) {
    const params = {}
    for (const p of command.params || []) params[p.name] = preset[p.name] ?? p.default ?? (p.type === 'checkbox' ? false : '')
    state.dialog = { command, params, preset }
    return
  }
  return execute(command, preset, launch ? 'terminal' : 'auto')
}

// Comandos do Claude que não fazem perguntas rodam no próprio painel (`claude -p`),
// com a saída no console, quando a preferência é "No painel" e o CLI está logado.
// how: 'auto' (decide), 'background', 'terminal' ou 'copy'.
export function execute(command, params, how = 'auto') {
  state.dialog = null
  if (command.kind !== 'claude') return runScript(command, params)
  const cli = state.catalog.claudeCli
  const canBackground = command.background && cli && state.catalog.claudeLoggedIn === true
  if (how === 'background' || (how === 'auto' && canBackground && state.prefs.claudeMode !== 'terminal')) {
    return runScript(command, { ...params, __background: true, __label: command.label })
  }
  if (how === 'copy') return claudeCommand(command.id, params, false)
  return claudeCommand(command.id, params, cli)
}

// ---------- Início: perfil e preferências de busca ----------

export async function loadProfile() {
  try { state.profile = await api('/api/profile') } catch (e) { toast(e.message, 'error') }
}

export async function loadSearch() {
  try { state.search = await api('/api/settings/search') } catch (e) { toast(e.message, 'error') }
}

async function saveSearch(path, body, okMessage) {
  try {
    state.search = await api(path, { method: 'PUT', body })
    toast(okMessage, 'ok')
    loadProfile()
    return true
  } catch (e) {
    toast(e.message, 'error')
    return false
  }
}

export const saveCategories = (categories) =>
  saveSearch('/api/settings/categories', { categories }, 'Categorias salvas em search-queries.md')
export const saveDays = (days) =>
  saveSearch('/api/settings/days', { days }, `Janela de busca: últimos ${days} dias`)
export const togglePortal = (portal, enabled) =>
  saveSearch('/api/settings/portal', { id: portal.id, enabled }, `${portal.name} ${enabled ? 'ligado' : 'desligado'} no /scrape`)

// ---------- listas de objetivos ----------

export async function loadLists() {
  try { state.lists = await api('/api/lists') } catch (e) { toast(e.message, 'error') }
}

export async function saveLists(next) {
  try {
    state.lists = await api('/api/lists', { method: 'PUT', body: next })
    return true
  } catch (e) {
    toast(e.message, 'error')
    return false
  }
}

export function activeList() {
  const l = state.lists
  return l?.lists.find((x) => x.id === l.active) || l?.lists[0] || null
}
