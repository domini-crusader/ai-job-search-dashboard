<script setup>
import { computed, reactive, ref } from 'vue'
import { state, saveLists, toast } from '../store.js'
import { COLUMNS } from '../columns.js'
import Icon from './Icon.vue'

const props = defineProps({ list: Object })
const emit = defineEmits(['close'])

const isNew = !props.list.id
const isAll = props.list.id === 'all'
const src = props.list.filters ?? {}
const form = reactive({
  name: props.list.name ?? '',
  include: [...(src.include ?? [])],
  exclude: [...(src.exclude ?? [])],
  fits: [...(src.fits ?? [])],
  portals: [...(src.portals ?? [])],
  minScore: src.minScore ?? null,
  flagsOk: src.flagsOk ?? false,
  applications: src.applications ?? true,
  columns: [...(props.list.columns ?? COLUMNS.filter((c) => c.id !== 'discarded').map((c) => c.id))],
})

const portals = computed(() => state.search?.portals ?? [])
const categories = computed(() => state.search?.categories ?? [])

// Campo de termos: Enter ou vírgula adiciona.
const draftTerm = reactive({ include: '', exclude: '' })
function addTerm(kind) {
  for (const t of draftTerm[kind].split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!form[kind].includes(t)) form[kind].push(t)
  }
  draftTerm[kind] = ''
}
function onKey(kind, ev) {
  if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); addTerm(kind) }
  else if (ev.key === 'Backspace' && !draftTerm[kind] && form[kind].length) form[kind].pop()
}
function removeTerm(kind, t) { form[kind] = form[kind].filter((x) => x !== t) }

const category = ref('')
function importCategory() {
  const cat = categories.value.find((c) => c.title === category.value)
  if (!cat) return
  for (const k of cat.keywords) if (!form.include.includes(k)) form.include.push(k)
  if (!form.name.trim()) form.name = cat.title.replace(/\s*\(.*\)\s*$/, '')
  category.value = ''
}

const toggle = (arr, v) => (arr.includes(v) ? arr.splice(arr.indexOf(v), 1) : arr.push(v))

async function save() {
  addTerm('include')
  addTerm('exclude')
  if (!form.name.trim()) return toast('Dê um nome à lista', 'error')
  const order = COLUMNS.map((c) => c.id)
  const entry = {
    id: props.list.id || `l${Date.now().toString(36)}`,
    name: form.name.trim(),
    filters: {
      include: form.include, exclude: form.exclude, fits: form.fits, portals: form.portals,
      minScore: form.minScore === '' ? null : form.minScore, flagsOk: form.flagsOk, applications: form.applications,
    },
    columns: order.filter((c) => form.columns.includes(c)),
  }
  const lists = isNew ? [...state.lists.lists, entry] : state.lists.lists.map((l) => (l.id === entry.id ? entry : l))
  if (await saveLists({ active: entry.id, lists })) emit('close')
}

async function remove() {
  if (!confirm(`Excluir a lista "${props.list.name}"? As vagas não são afetadas.`)) return
  if (await saveLists({ active: 'all', lists: state.lists.lists.filter((l) => l.id !== props.list.id) })) emit('close')
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <form class="dialog wide" @submit.prevent="save">
      <h3>{{ isNew ? 'Nova lista de objetivos' : 'Filtros da lista' }}</h3>
      <p class="desc">Cada lista é um Kanban próprio com seus filtros e colunas. Os dados continuam os mesmos.</p>

      <label class="field">
        <span>Nome</span>
        <input v-model="form.name" class="input" maxlength="60" placeholder="Ex.: Back-end .NET remoto" :disabled="isAll" />
      </label>

      <div v-if="categories.length" class="field">
        <span>Partir de uma categoria de busca</span>
        <div class="row">
          <select v-model="category" class="select grow">
            <option value="">Escolha uma categoria do search-queries.md…</option>
            <option v-for="c in categories" :key="c.title" :value="c.title">{{ c.title }}</option>
          </select>
          <button type="button" class="btn" :disabled="!category" @click="importCategory">Usar termos</button>
        </div>
      </div>

      <div v-for="kind in ['include', 'exclude']" :key="kind" class="field">
        <span>{{ kind === 'include' ? 'Mostrar vagas com qualquer um destes termos' : 'Esconder vagas com estes termos' }}</span>
        <div class="tag-input">
          <span v-for="t in form[kind]" :key="t" class="tag" :class="kind">
            {{ t }}<button type="button" :aria-label="`Remover ${t}`" @click="removeTerm(kind, t)"><Icon name="x" :size="12" /></button>
          </span>
          <input
            v-model="draftTerm[kind]" :placeholder="form[kind].length ? '' : (kind === 'include' ? '.NET, C#, AWS…' : 'Júnior, Java, presencial…')"
            @keydown="onKey(kind, $event)" @blur="addTerm(kind)"
          />
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <span>Fit inicial (/scrape)</span>
          <div class="segmented">
            <button v-for="f in [['high', 'Alto'], ['medium', 'Médio'], ['low', 'Baixo']]" :key="f[0]" type="button"
              :class="{ on: form.fits.includes(f[0]) }" @click="toggle(form.fits, f[0])">{{ f[1] }}</button>
          </div>
        </div>
        <label class="field">
          <span>Pontuação mínima (/rank)</span>
          <input v-model.number="form.minScore" class="input" type="number" min="0" max="100" placeholder="Qualquer" />
        </label>
      </div>

      <div v-if="portals.length" class="field">
        <span>Portais <em class="muted">(nenhum marcado = todos)</em></span>
        <div class="chip-select">
          <button v-for="p in portals" :key="p.id" type="button" class="fchip toggle"
            :class="{ on: form.portals.includes(p.id) }" @click="toggle(form.portals, p.id)">{{ p.name }}</button>
        </div>
      </div>

      <div class="field">
        <span>Colunas</span>
        <div class="chip-select">
          <button v-for="c in COLUMNS" :key="c.id" type="button" class="fchip toggle"
            :class="{ on: form.columns.includes(c.id) }" @click="toggle(form.columns, c.id)">{{ c.title }}</button>
        </div>
      </div>

      <label class="switch"><input v-model="form.flagsOk" type="checkbox" /> Esconder vagas com alerta de idioma ou local</label>
      <label class="switch"><input v-model="form.applications" type="checkbox" /> Incluir candidaturas do tracker</label>

      <div class="dialog-actions">
        <button v-if="!isNew && !isAll" type="button" class="btn ghost danger" style="margin-right: auto" @click="remove">
          <Icon name="trash" :size="14" /> Excluir lista
        </button>
        <button type="button" class="btn ghost" @click="emit('close')">Cancelar</button>
        <button type="submit" class="btn primary">{{ isNew ? 'Criar lista' : 'Salvar' }}</button>
      </div>
    </form>
  </div>
</template>
