<script setup>
import { computed, ref, watch } from 'vue'
import { state, saveCategories, saveDays, togglePortal, saveLists, goTo, toast, trigger } from '../store.js'
import Icon from './Icon.vue'

// Rascunho local das categorias; só vai para o search-queries.md ao salvar.
const draft = ref([])
const open = ref(null)
const days = ref(null)
const dragFrom = ref(null)

function reset() {
  draft.value = (state.search?.categories ?? []).map((c, i) => ({ ...c, key: `${i}-${c.title}` }))
  days.value = state.search?.days ?? null
}
watch(() => state.search, reset, { immediate: true })

const strip = (list) => list.map(({ title, description, queries, notes }) => ({ title, description, queries, notes }))
const dirty = computed(() => JSON.stringify(strip(draft.value)) !== JSON.stringify(strip(state.search?.categories ?? [])))
const invalid = computed(() => draft.value.some((c) => !c.title.trim()))

function move(i, delta) {
  const j = i + delta
  if (j < 0 || j >= draft.value.length) return
  const list = draft.value.slice()
  ;[list[i], list[j]] = [list[j], list[i]]
  draft.value = list
}
function onDrop(i) {
  if (dragFrom.value === null || dragFrom.value === i) return
  const list = draft.value.slice()
  const [item] = list.splice(dragFrom.value, 1)
  list.splice(i, 0, item)
  draft.value = list
  dragFrom.value = null
}
function add() {
  const key = `new-${Date.now()}`
  draft.value = [...draft.value, { key, title: 'Nova categoria', description: '', queries: '', notes: '', keywords: [] }]
  open.value = key
}
function remove(i) {
  if (confirm(`Remover a categoria "${draft.value[i].title}"? (Salve para gravar.)`)) {
    draft.value = draft.value.filter((_, k) => k !== i)
  }
}
async function save() {
  if (await saveCategories(strip(draft.value))) open.value = null
}

// Cria uma lista de objetivos com os termos entre aspas das consultas da categoria.
async function listFrom(cat) {
  const lists = state.lists
  const id = `l${Date.now().toString(36)}`
  const ok = await saveLists({
    active: id,
    lists: [...lists.lists, {
      id, name: cat.title.replace(/\s*\(.*\)\s*$/, ''),
      filters: { include: cat.keywords, exclude: [], fits: [], portals: [], minScore: null, flagsOk: false, applications: true },
      columns: ['new', 'ranked', 'drafted', 'applied', 'interview', 'offer', 'closed'],
    }],
  })
  if (ok) {
    toast(`Lista "${cat.title}" criada`, 'ok')
    goTo('vagas')
  }
}
</script>

<template>
  <div v-if="!state.search" class="empty-state">Lendo a configuração de busca…</div>
  <template v-else>
    <p v-if="state.search.error" class="callout"><Icon name="alert" :size="18" /> {{ state.search.error }}</p>

    <div class="section-head">
      <div>
        <h2 class="section-title">Categorias de busca</h2>
        <p class="muted small">A ordem é a prioridade usada pelo /scrape. Arraste para reorganizar.</p>
      </div>
      <div class="actions-inline">
        <button class="btn sm" @click="add"><Icon name="plus" :size="14" /> Categoria</button>
      </div>
    </div>

    <div class="panel cat-list">
      <div
        v-for="(c, i) in draft" :key="c.key" class="cat" :class="{ expanded: open === c.key }"
        draggable="true" @dragstart="dragFrom = i" @dragover.prevent @drop.prevent="onDrop(i)"
      >
        <div class="cat-row">
          <span class="grip" title="Arrastar">⋮⋮</span>
          <span class="prio">{{ i + 1 }}</span>
          <button class="cat-title" @click="open = open === c.key ? null : c.key">
            <b>{{ c.title || 'Sem título' }}</b>
            <span>{{ c.queries.split('\n').filter(Boolean).length }} consultas<template v-if="c.keywords?.length"> · {{ c.keywords.slice(0, 3).join(', ') }}</template></span>
          </button>
          <button class="btn ghost sm icon-only" title="Subir" :disabled="i === 0" @click="move(i, -1)">↑</button>
          <button class="btn ghost sm icon-only" title="Descer" :disabled="i === draft.length - 1" @click="move(i, 1)">↓</button>
          <button class="btn ghost sm" title="Criar uma lista de vagas com estes termos" :disabled="!c.keywords?.length" @click="listFrom(c)">
            <Icon name="board" :size="14" /> Lista
          </button>
        </div>
        <div v-if="open === c.key" class="cat-edit">
          <label class="field"><span>Título</span><input v-model="c.title" class="input" maxlength="120" /></label>
          <label class="field"><span>Descrição</span><textarea v-model="c.description" class="input area" rows="2"></textarea></label>
          <label class="field"><span>Consultas (uma por linha)</span><textarea v-model="c.queries" class="input area mono" rows="6" spellcheck="false"></textarea></label>
          <label class="field"><span>Notas (títulos-variantes, observações)</span><textarea v-model="c.notes" class="input area" rows="2"></textarea></label>
          <div class="cat-edit-foot">
            <button class="btn ghost sm danger" @click="remove(i)"><Icon name="trash" :size="14" /> Remover</button>
          </div>
        </div>
      </div>
      <p v-if="!draft.length" class="empty-state">Nenhuma categoria. Crie uma ou rode /setup.</p>
    </div>

    <div v-if="dirty" class="savebar">
      <span>Alterações não salvas em <code>{{ state.search.file }}</code></span>
      <button class="btn ghost" @click="reset">Descartar</button>
      <button class="btn primary" :disabled="invalid" @click="save">Salvar</button>
    </div>

    <h2 class="section-title">Portais</h2>
    <div class="panel">
      <div v-for="p in state.search.portals" :key="p.id" class="pref-row">
        <div>
          <b>{{ p.name }}</b>
          <span>{{ p.installed ? (p.description || p.id) : 'Dependências não instaladas' }}</span>
        </div>
        <label class="switch" :title="p.enabled ? 'Ligado no /scrape' : 'Desligado no /scrape'">
          <input type="checkbox" :checked="p.enabled" @change="togglePortal(p, $event.target.checked)" />
        </label>
      </div>
      <div class="pref-row">
        <div><b>Novo portal</b><span>Gera um CLI para outro site de vagas.</span></div>
        <button class="btn sm" @click="trigger('add-portal')"><Icon name="plus" :size="14" /> Adicionar</button>
      </div>
    </div>

    <h2 class="section-title">Filtros do /scrape</h2>
    <div class="panel">
      <div class="pref-row">
        <div><b>Janela de datas</b><span>Só vagas publicadas nos últimos N dias (ou com prazo aberto).</span></div>
        <form class="inline-form" @submit.prevent="saveDays(days)">
          <input v-model.number="days" class="input num" type="number" min="1" max="365" :disabled="!state.search.days" />
          <span class="muted small">dias</span>
          <button class="btn sm" :disabled="!state.search.days || days === state.search.days">Salvar</button>
        </form>
      </div>
    </div>
    <p class="muted small foot-note">
      Antes de cada gravação, o arquivo original é copiado para <code>{{ state.search.backups }}</code>.
    </p>
  </template>
</template>
