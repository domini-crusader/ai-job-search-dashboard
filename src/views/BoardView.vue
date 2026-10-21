<script setup>
import { computed, ref } from 'vue'
import { state, setStatus, toast, trigger, saveLists, activeList } from '../store.js'
import { COLUMNS, FINAL_STATUSES, STATUS_LABELS, sortCards } from '../columns.js'
import Icon from '../components/Icon.vue'
import JobCard from '../components/JobCard.vue'
import JobDrawer from '../components/JobDrawer.vue'
import ListEditor from '../components/ListEditor.vue'

const search = ref('')
const editing = ref(null) // lista aberta no editor ({} = nova)

const list = computed(() => activeList())
const allCards = computed(() => [...state.board.applications, ...state.board.jobs])

// ---------- filtros da lista ----------
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function haystack(card) {
  const d = card.details || {}
  return fold([card.title, card.company, d.rank_verdict, d.notes, d.sector, d.role_type].join(' '))
}

function passes(card, f) {
  if (card.source === 'tracker' && !f.applications) return false
  const text = haystack(card)
  if (f.include.length && !f.include.some((t) => text.includes(fold(t)))) return false
  if (f.exclude.some((t) => text.includes(fold(t)))) return false
  if (card.source === 'seen') {
    if (f.fits.length && !f.fits.includes(card.fit)) return false
    if (f.portals.length && !f.portals.includes(card.portal)) return false
    if (f.minScore != null && (card.score == null || card.score < f.minScore)) return false
    if (f.flagsOk && (['FLAG', 'FAIL'].includes(card.details?.language_gate) ||
      ['FLAG', 'FAIL'].includes(card.details?.location_verdict))) return false
  } else if (f.minScore != null && card.score != null && card.score < f.minScore) return false
  return true
}

const inList = computed(() => (list.value ? allCards.value.filter((c) => passes(c, list.value.filters)) : []))

const columns = computed(() => {
  const q = fold(search.value.trim())
  const visible = list.value?.columns ?? []
  return COLUMNS.filter((c) => visible.includes(c.id)).map((col) => {
    const cards = inList.value.filter(col.match)
    return { ...col, total: cards.length, cards: sortCards(col.id, q ? cards.filter((c) => haystack(c).includes(q)) : cards) }
  })
})

const counts = computed(() => ({
  vagas: inList.value.filter((c) => c.source === 'seen' && ['new', 'ranked'].includes(c.status)).length,
  abertas: inList.value.filter((c) => c.source === 'tracker' && !FINAL_STATUSES.includes(c.status)).length,
}))

const activeFilters = computed(() => {
  const f = list.value?.filters
  if (!f) return []
  const out = []
  if (f.include.length) out.push(`contém: ${f.include.slice(0, 3).join(', ')}${f.include.length > 3 ? '…' : ''}`)
  if (f.exclude.length) out.push(`sem: ${f.exclude.slice(0, 2).join(', ')}${f.exclude.length > 2 ? '…' : ''}`)
  if (f.fits.length) out.push(`fit ${f.fits.join('/')}`)
  if (f.portals.length) out.push(f.portals.map((p) => p.replace(/-search$/, '')).join(', '))
  if (f.minScore != null) out.push(`nota ≥ ${f.minScore}`)
  if (f.flagsOk) out.push('sem alertas')
  if (!f.applications) out.push('sem candidaturas')
  return out
})

function selectList(id) {
  saveLists({ ...state.lists, active: id })
}

const selectedCard = computed(() => allCards.value.find((c) => c.id === state.selected) || null)

// ---------- arrastar e soltar ----------
const dragging = ref(null)
const overColumn = ref(null)
const closePicker = ref(null)

function onDragStart(card, ev) {
  dragging.value = card
  ev.dataTransfer.effectAllowed = 'move'
  ev.dataTransfer.setData('text/plain', card.id)
}
function onDragEnd() { dragging.value = null; overColumn.value = null }
const canDrop = (col) => dragging.value && col.source === dragging.value.source && !col.match(dragging.value)

function onDrop(col) {
  const card = dragging.value
  onDragEnd()
  if (!card || col.match(card)) return
  if (col.source !== card.source) {
    if (card.source === 'seen') {
      toast('Para levar a vaga ao pipeline, use Candidatar (/apply).', 'info',
        { label: 'Candidatar', run: () => trigger('apply', { url: card.url }) })
    }
    return
  }
  if (col.id === 'ranked' && card.score == null) return toast('Esta vaga ainda não foi ranqueada — rode /rank.', 'error')
  if (col.drop === null) { closePicker.value = card; return }
  setStatus(card, col.drop)
}
function pickFinal(status) {
  const card = closePicker.value
  closePicker.value = null
  if (card) setStatus(card, status)
}
</script>

<template>
  <div class="board-view">
    <div class="lists-bar">
      <div class="list-tabs" role="tablist" aria-label="Listas de objetivos">
        <button
          v-for="l in state.lists?.lists ?? []" :key="l.id" role="tab" class="list-tab"
          :class="{ on: l.id === list?.id }" :aria-selected="l.id === list?.id" @click="selectList(l.id)"
        >{{ l.name }}</button>
        <button class="list-tab add" title="Nova lista de objetivos" @click="editing = {}"><Icon name="plus" :size="14" /> Nova lista</button>
      </div>
    </div>

    <div class="toolbar">
      <div class="search-box">
        <Icon name="search" :size="15" />
        <input v-model="search" class="input" type="search" placeholder="Buscar nesta lista" />
      </div>
      <div class="filter-chips">
        <span v-for="f in activeFilters" :key="f" class="fchip">{{ f }}</span>
        <button class="btn ghost sm" @click="editing = list"><Icon name="cog" :size="14" /> {{ activeFilters.length ? 'Editar filtros' : 'Filtros e colunas' }}</button>
      </div>
      <span class="spacer"></span>
      <div class="summary">
        <span><b>{{ counts.vagas }}</b>vagas</span>
        <span><b>{{ counts.abertas }}</b>candidaturas abertas</span>
      </div>
    </div>

    <div v-if="state.loading" class="empty-state">Carregando…</div>
    <div v-else-if="state.error" class="empty-state">Não foi possível ler os dados: {{ state.error }}</div>
    <div v-else-if="!state.board.meta.seenFile && !state.board.meta.trackerFile" class="empty-state">
      <p>Nenhuma vaga ainda.</p>
      <button class="btn primary" style="margin-top: 12px" @click="trigger('scrape')"><Icon name="search" /> Buscar vagas</button>
    </div>
    <div v-else class="board">
      <section
        v-for="col in columns" :key="col.id" class="column"
        :class="[`col-${col.id}`, { droppable: canDrop(col), over: overColumn === col.id && canDrop(col) }]"
        @dragover.prevent="overColumn = col.id" @dragleave="overColumn === col.id && (overColumn = null)" @drop.prevent="onDrop(col)"
      >
        <header class="col-head" :title="col.hint">
          <i class="col-bullet"></i>
          <h2>{{ col.title }}</h2>
          <span class="count">{{ col.cards.length }}<template v-if="col.cards.length !== col.total">/{{ col.total }}</template></span>
        </header>
        <div class="col-body">
          <JobCard
            v-for="card in col.cards" :key="card.id" :card="card"
            :selected="state.selected === card.id" :dragging="dragging?.id === card.id"
            @dragstart="onDragStart(card, $event)" @dragend="onDragEnd" @open="state.selected = card.id"
          />
          <p v-if="!col.cards.length" class="col-empty">{{ col.total ? 'Nada com essa busca' : 'Vazio' }}</p>
        </div>
      </section>
    </div>

    <JobDrawer v-if="selectedCard" :card="selectedCard" @close="state.selected = null" />
    <ListEditor v-if="editing" :list="editing" @close="editing = null" />

    <div v-if="closePicker" class="overlay" @click.self="closePicker = null">
      <div class="dialog">
        <h3>Como terminou?</h3>
        <p class="desc">{{ closePicker.title }} · {{ closePicker.company }}</p>
        <div class="pick">
          <button v-for="s in FINAL_STATUSES" :key="s" class="btn" @click="pickFinal(s)">{{ STATUS_LABELS[s] }}</button>
        </div>
        <p class="muted small">Muda só o status no tracker. Para registrar feedback e etapas, use Resultado (/outcome).</p>
        <div class="dialog-actions"><button class="btn ghost" @click="closePicker = null">Cancelar</button></div>
      </div>
    </div>
  </div>
</template>
