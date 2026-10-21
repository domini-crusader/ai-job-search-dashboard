<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { state, apiPut, toast } from '../store.js'
import Icon from './Icon.vue'

// Grupos de tags usados pelo construtor de consultas. A pessoa adiciona e remove;
// "Gerar com o Claude" propõe uma lista a partir do setup, que só vale depois de salvar.
const VOCAB_LABELS = {
  titles: ['Cargos'], sites: ['Sites'], stacks: ['Tecnologias'], skills: ['Habilidades'],
  levels: ['Nível'], modes: ['Modalidade'], locations: ['Local'], salary: ['Pretensão salarial'],
}

const draft = reactive({})
const input = reactive({})
const open = ref(false)
const generating = ref(false)
const suggested = ref(null) // tags novas vindas do Claude, para destacar

function reset() {
  for (const g of Object.keys(VOCAB_LABELS)) draft[g] = [...(state.search?.vocab?.[g] ?? [])]
  suggested.value = null
}
watch(() => state.search?.vocab, reset, { immediate: true })

const dirty = computed(() => Object.keys(VOCAB_LABELS).some((g) => JSON.stringify(draft[g]) !== JSON.stringify(state.search?.vocab?.[g] ?? [])))
const total = computed(() => Object.values(draft).reduce((n, l) => n + l.length, 0))

function add(g) {
  for (const t of String(input[g] ?? '').split(',').map((s) => s.replace(/"/g, '').trim()).filter(Boolean)) {
    if (!draft[g].some((x) => x.toLowerCase() === t.toLowerCase())) draft[g].push(t)
  }
  input[g] = ''
}
const remove = (g, t) => { draft[g] = draft[g].filter((x) => x !== t) }
const isNew = (g, t) => suggested.value?.[g]?.has(t.toLowerCase())

async function save() {
  const res = await apiPut('/api/settings/vocab', { groups: { ...draft } })
  if (res) { state.search = res; toast('Tags de busca salvas', 'ok') }
}
async function restore() {
  if (!confirm('Voltar às tags padrão do ai-job-search (somadas às do seu workspace)?')) return
  const res = await apiPut('/api/settings/vocab', { reset: true })
  if (res) { state.search = res; toast('Tags padrão restauradas', 'ok') }
}

async function generate() {
  generating.value = true
  open.value = true
  try {
    const r = await fetch('/api/settings/vocab/generate', { method: 'POST', headers: { 'X-Dashboard': '1' } })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
    const before = Object.fromEntries(Object.keys(VOCAB_LABELS).map((g) => [g, new Set(draft[g].map((t) => t.toLowerCase()))]))
    suggested.value = {}
    for (const g of Object.keys(VOCAB_LABELS)) {
      const fresh = (data.groups[g] ?? []).filter((t) => !before[g].has(t.toLowerCase()))
      suggested.value[g] = new Set(fresh.map((t) => t.toLowerCase()))
      draft[g] = [...fresh, ...draft[g]]
    }
    const n = Object.values(suggested.value).reduce((s, set) => s + set.size, 0)
    toast(`O Claude sugeriu ${n} tag(s) novas — revise e salve`, 'ok')
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="section-head">
    <div>
      <h2 class="section-title">Tags de busca</h2>
      <p class="muted small">
        As opções do construtor de consultas.
        {{ state.search?.vocabCustom ? 'Personalizadas por você.' : 'Padrão do ai-job-search + o que já existe no seu workspace.' }}
      </p>
    </div>
    <div class="actions-inline">
      <button class="btn sm" :disabled="generating" title="O Claude lê o seu setup e sugere tags" @click="generate">
        <Icon :name="generating ? 'refresh' : 'star'" :size="13" :class="{ spin: generating }" />
        {{ generating ? 'Gerando…' : 'Gerar com o Claude' }}
      </button>
      <button class="btn ghost sm" @click="open = !open">{{ open ? 'Recolher' : `Editar (${total})` }}</button>
    </div>
  </div>

  <div v-if="open" class="panel vocab">
    <div v-for="(meta, g) in VOCAB_LABELS" :key="g" class="vocab-row">
      <span class="qb-label">{{ meta[0] }}</span>
      <div class="chip-select">
        <span v-for="t in draft[g]" :key="t" class="vtag" :class="{ fresh: isNew(g, t) }">
          {{ t }}<button type="button" :aria-label="`Remover ${t}`" @click="remove(g, t)"><Icon name="x" :size="11" /></button>
        </span>
        <input v-model="input[g]" class="input chip-input" :placeholder="`+ ${meta[0].toLowerCase()}`" @keydown.enter.prevent="add(g)" @blur="add(g)" />
      </div>
    </div>
    <div class="vocab-foot">
      <button class="btn ghost sm" @click="restore">Restaurar padrão</button>
      <span v-if="suggested" class="muted small"><i class="fresh-dot"></i> sugestões do Claude</span>
      <span class="spacer"></span>
      <button class="btn ghost sm" :disabled="!dirty" @click="reset">Descartar</button>
      <button class="btn primary sm" :disabled="!dirty" @click="save">Salvar tags</button>
    </div>
  </div>
</template>
