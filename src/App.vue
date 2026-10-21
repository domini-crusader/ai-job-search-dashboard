<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { state, loadBoard, loadCatalog, watchChanges, setStatus, toast, dismissToast, trigger } from './store.js'
import { COLUMNS, FINAL_STATUSES, STATUS_LABELS, sortCards } from './columns.js'
import JobCard from './components/JobCard.vue'
import JobDrawer from './components/JobDrawer.vue'
import CommandPanel from './components/CommandPanel.vue'
import ParamDialog from './components/ParamDialog.vue'
import LogPanel from './components/LogPanel.vue'

const prefs = (() => { try { return JSON.parse(localStorage.getItem('dashboard-prefs') || '{}') } catch { return {} } })()
const search = ref('')
const fitFilter = ref(prefs.fitFilter || [])
const portalFilter = ref('')
const showDiscarded = ref(prefs.showDiscarded ?? false)
const showCommands = ref(prefs.showCommands ?? true)
watch([fitFilter, showDiscarded, showCommands], () => {
  try {
    localStorage.setItem('dashboard-prefs', JSON.stringify({
      fitFilter: fitFilter.value, showDiscarded: showDiscarded.value, showCommands: showCommands.value,
    }))
  } catch { /* armazenamento indisponível: só não lembra a preferência */ }
}, { deep: true })

const allCards = computed(() => [...state.board.applications, ...state.board.jobs])
const portals = computed(() => [...new Set(state.board.jobs.map((j) => j.portal).filter(Boolean))].sort())

function matches(card) {
  const q = search.value.trim().toLowerCase()
  if (q && !`${card.title} ${card.company} ${card.portal ?? ''}`.toLowerCase().includes(q)) return false
  if (card.source === 'seen') {
    if (fitFilter.value.length && !fitFilter.value.includes(card.fit)) return false
    if (portalFilter.value && card.portal !== portalFilter.value) return false
  }
  return true
}

const columns = computed(() =>
  COLUMNS.filter((col) => !col.optional || showDiscarded.value).map((col) => {
    const all = allCards.value.filter(col.match)
    const visible = sortCards(col.id, all.filter(matches))
    return { ...col, cards: visible, total: all.length }
  }),
)

const stats = computed(() => {
  const apps = state.board.applications
  return {
    novas: state.board.jobs.filter((j) => j.status === 'new').length,
    ranqueadas: state.board.jobs.filter((j) => j.status === 'ranked').length,
    abertas: apps.filter((a) => !FINAL_STATUSES.includes(a.status)).length,
    entrevistas: apps.filter((a) => a.status === 'interview').length,
  }
})

const selectedCard = computed(() => allCards.value.find((c) => c.id === state.selected) || null)

// ---------- arrastar e soltar ----------
const dragging = ref(null)
const overColumn = ref(null)
const closePicker = ref(null) // card aguardando escolha do status final

function onDragStart(card, ev) {
  dragging.value = card
  ev.dataTransfer.effectAllowed = 'move'
  ev.dataTransfer.setData('text/plain', card.id)
}
function onDragEnd() { dragging.value = null; overColumn.value = null }

function canDrop(col) {
  const card = dragging.value
  return card && col.source === card.source && !col.match(card)
}

function onDrop(col) {
  const card = dragging.value
  onDragEnd()
  if (!card || col.match(card)) return
  if (col.source !== card.source) {
    if (card.source === 'seen') {
      toast('Para levar uma vaga ao pipeline, rode /apply (gera CV, carta e a linha do tracker).', 'info',
        { label: 'Copiar /apply', run: () => trigger('apply', { url: card.url }) })
    } else {
      toast('Candidaturas ficam nas colunas do tracker.', 'info')
    }
    return
  }
  if (col.id === 'ranked' && card.score == null) {
    toast('Esta vaga nunca foi ranqueada — rode /rank.', 'error')
    return
  }
  if (col.drop === null) { closePicker.value = card; return }
  setStatus(card, col.drop)
}

function pickFinal(status) {
  const card = closePicker.value
  closePicker.value = null
  if (card) setStatus(card, status)
}

onMounted(async () => {
  await Promise.all([loadBoard(), loadCatalog()])
  watchChanges()
})
</script>

<template>
  <div class="app" :class="{ 'with-log': state.logOpen }">
    <header class="topbar">
      <div class="brand">
        <span class="logo">🗂️</span>
        <div>
          <h1>Painel de Vagas</h1>
          <p class="sub" :title="state.catalog.workspace">{{ state.catalog.workspace || 'ai-job-search' }} · atualiza sozinho quando os arquivos mudam</p>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><b>{{ stats.novas }}</b><span>novas</span></div>
        <div class="stat"><b>{{ stats.ranqueadas }}</b><span>ranqueadas</span></div>
        <div class="stat"><b>{{ stats.abertas }}</b><span>candidaturas abertas</span></div>
        <div class="stat"><b>{{ stats.entrevistas }}</b><span>em entrevista</span></div>
      </div>

      <div class="filters">
        <input v-model="search" class="search" type="search" placeholder="Buscar cargo, empresa, portal…" />
        <div class="chips" role="group" aria-label="Filtrar por fit">
          <label v-for="f in ['high', 'medium', 'low']" :key="f" class="chip" :class="[`fit-${f}`, { on: fitFilter.includes(f) }]">
            <input v-model="fitFilter" type="checkbox" :value="f" />
            {{ { high: 'Fit alto', medium: 'Fit médio', low: 'Fit baixo' }[f] }}
          </label>
        </div>
        <select v-model="portalFilter" class="select" aria-label="Filtrar por portal">
          <option value="">Todos os portais</option>
          <option v-for="p in portals" :key="p" :value="p">{{ p.replace(/-search$/, '') }}</option>
        </select>
        <label class="toggle"><input v-model="showDiscarded" type="checkbox" /> Mostrar descartadas</label>
        <button class="btn ghost" title="Recarregar" @click="loadBoard">↻</button>
        <button class="btn" :class="{ primary: showCommands }" @click="showCommands = !showCommands">⚡ Comandos</button>
      </div>
    </header>

    <div class="body">
      <CommandPanel v-if="showCommands" />

      <main class="board-wrap">
        <div v-if="state.loading" class="empty">Carregando…</div>
        <div v-else-if="state.error" class="empty error">
          Não foi possível ler os dados: {{ state.error }}
        </div>
        <template v-else>
          <div v-if="!state.board.meta.seenFile && !state.board.meta.trackerFile" class="banner">
            Nenhum dado ainda — rode <code>/scrape</code> no painel de comandos para encontrar vagas.
          </div>
          <div class="board">
            <section
              v-for="col in columns"
              :key="col.id"
              class="column"
              :class="[`col-${col.id}`, { droppable: canDrop(col), over: overColumn === col.id && canDrop(col) }]"
              @dragover.prevent="overColumn = col.id"
              @dragleave="overColumn === col.id && (overColumn = null)"
              @drop.prevent="onDrop(col)"
            >
              <header class="col-head">
                <div>
                  <h2>{{ col.title }}</h2>
                  <p>{{ col.hint }}</p>
                </div>
                <span class="count" :title="`${col.cards.length} de ${col.total} visíveis`">
                  {{ col.cards.length }}<template v-if="col.cards.length !== col.total">/{{ col.total }}</template>
                </span>
              </header>
              <div class="col-body">
                <JobCard
                  v-for="card in col.cards"
                  :key="card.id"
                  :card="card"
                  :selected="state.selected === card.id"
                  :dragging="dragging?.id === card.id"
                  @dragstart="onDragStart(card, $event)"
                  @dragend="onDragEnd"
                  @open="state.selected = card.id"
                />
                <p v-if="!col.cards.length" class="col-empty">
                  {{ col.total ? 'Nada com estes filtros' : 'Vazio' }}
                </p>
              </div>
            </section>
          </div>
          <p v-if="state.board.meta.hiddenAsApplied" class="footnote">
            {{ state.board.meta.hiddenAsApplied }} vaga(s) do /scrape já estão no tracker e aparecem só como candidatura.
          </p>
        </template>
      </main>

      <JobDrawer v-if="selectedCard" :card="selectedCard" @close="state.selected = null" />
    </div>

    <LogPanel />

    <ParamDialog v-if="state.dialog" :dialog="state.dialog" @close="state.dialog = null" />

    <div v-if="closePicker" class="overlay" @click.self="closePicker = null">
      <div class="dialog small">
        <h3>Como terminou?</h3>
        <p class="muted">{{ closePicker.title }} — {{ closePicker.company }}</p>
        <div class="pick">
          <button v-for="s in FINAL_STATUSES" :key="s" class="btn" @click="pickFinal(s)">{{ STATUS_LABELS[s] }}</button>
        </div>
        <p class="hint">Isto só altera o status no CSV. Para arquivar feedback e etapas, use <code>/outcome</code>.</p>
        <div class="actions"><button class="btn ghost" @click="closePicker = null">Cancelar</button></div>
      </div>
    </div>

    <div class="toasts">
      <div v-for="t in state.toasts" :key="t.uid" class="toast" :class="t.kind" @click="dismissToast(t.uid)">
        <span>{{ t.message }}</span>
        <button v-if="t.action" class="btn small" @click.stop="t.action.run(); dismissToast(t.uid)">{{ t.action.label }}</button>
      </div>
    </div>
  </div>
</template>
