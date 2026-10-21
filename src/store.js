// Estado compartilhado do painel e chamadas à API local (server/api.js).
import { reactive } from 'vue'

export const state = reactive({
  board: { jobs: [], applications: [], meta: {} },
  catalog: { commands: [], claudeCli: false, python: null },
  loading: true,
  error: null,
  runs: [], // { uid, id, label, output, status: 'running'|'ok'|'fail'|'stopped', controller }
  activeRun: null,
  logOpen: false,
  toasts: [],
  dialog: null, // { command, params } - diálogo de parâmetros aberto
  selected: null, // id do card aberto no painel lateral
})

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

export function watchChanges() {
  const es = new EventSource('/api/events')
  es.addEventListener('changed', () => loadBoard())
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

// Comandos do Claude Code: copia o slash command ou abre o CLI num terminal.
export async function claudeCommand(id, params = {}, launch = false) {
  try {
    const { prompt } = await api('/api/claude', { method: 'POST', body: { id, params, launch } })
    if (launch) {
      toast(`Abrindo o Claude Code com ${prompt}`, 'ok')
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
  state.logOpen = true

  const { __label, ...cleanParams } = params
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dashboard': '1' },
      body: JSON.stringify({ id: command.id, params: cleanParams }),
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
    run.status === 'ok' ? 'ok' : 'error')
}

export function findCommand(id) {
  return state.catalog.commands.find((c) => c.id === id)
}

// Ponto único de disparo dos botões: abre o diálogo de parâmetros quando o
// comando tem algum (ou confirmação), senão executa direto.
export function trigger(id, preset = {}, launch = false) {
  const command = findCommand(id)
  if (!command) return toast(`comando indisponível: ${id}`, 'error')
  const needsDialog = (command.params || []).some((p) => preset[p.name] === undefined)
  if (needsDialog || command.confirm) {
    const params = {}
    for (const p of command.params || []) params[p.name] = preset[p.name] ?? p.default ?? (p.type === 'checkbox' ? false : '')
    state.dialog = { command, params, preset }
    return
  }
  return execute(command, preset, launch)
}

export function execute(command, params, launch = false) {
  state.dialog = null
  if (command.kind === 'claude') return claudeCommand(command.id, params, launch)
  return runScript(command, params)
}
