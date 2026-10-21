<script setup>
import { computed, reactive, ref } from 'vue'
import { state } from '../store.js'
import Icon from './Icon.vue'
import CompanyLogo from './CompanyLogo.vue'

// Edita as consultas de uma categoria (props.category.queries, uma por linha) por tags.
const props = defineProps({ category: Object })

const vocab = computed(() => state.search?.vocab ?? { sites: [], titles: [], stacks: [], levels: [], modes: [], locations: [] })
const pick = reactive({ titles: [], sites: [], stacks: [], levels: [], mode: '', location: '' })
const customTitle = ref('')

const lines = computed(() => props.category.queries.split('\n').map((l) => l.trim()).filter(Boolean))

// Quebra uma consulta em tags: site, termo entre aspas, grupo OR, palavra solta.
function parseQuery(q) {
  const out = []
  const re = /site:(\S+)|"([^"]+)"|\(([^)]+)\)|(\S+)/g
  let m
  while ((m = re.exec(q))) {
    if (m[1]) out.push({ kind: 'site', text: m[1] })
    else if (m[2]) out.push({ kind: 'term', text: m[2] })
    else if (m[3]) out.push({ kind: 'or', text: m[3].split(/\s+OR\s+/).join(' ou ') })
    else out.push({ kind: 'word', text: m[4] })
  }
  return out
}

function removeLine(i) {
  const keep = lines.value.filter((_, k) => k !== i)
  props.category.queries = keep.join('\n')
}

const quote = (s) => (/\s/.test(s) ? `"${s}"` : s)
const toggle = (arr, v) => (arr.includes(v) ? arr.splice(arr.indexOf(v), 1) : arr.push(v))

const generated = computed(() => {
  if (!pick.titles.length) return []
  const sites = pick.sites.length ? pick.sites : [null]
  const tail = [
    ...pick.stacks.map((s) => `"${s}"`),
    pick.mode && quote(pick.mode),
    pick.location && quote(pick.location),
    pick.levels.length > 1 ? `(${pick.levels.join(' OR ')})` : pick.levels[0],
  ].filter(Boolean)
  const out = []
  for (const site of sites) for (const t of pick.titles) out.push([site && `site:${site}`, `"${t}"`, ...tail].filter(Boolean).join(' '))
  return out.slice(0, 24)
})

function addTitle() {
  const t = customTitle.value.trim().replace(/"/g, '')
  if (t && !pick.titles.includes(t)) pick.titles.push(t)
  customTitle.value = ''
}

function apply(replace) {
  const merged = replace ? generated.value : [...new Set([...lines.value, ...generated.value])]
  props.category.queries = merged.join('\n')
  pick.titles = []
}

const siteIcon = (s) => `https://${s.split('/')[0].replace(/^(br|www)\./, '')}/favicon.ico`
</script>

<template>
  <div class="qb">
    <div class="qb-current">
      <span class="field-label">Consultas ({{ lines.length }})</span>
      <div v-for="(q, i) in lines" :key="q + i" class="qline">
        <template v-for="(t, k) in parseQuery(q)" :key="k">
          <span v-if="t.kind === 'site'" class="qtag site"><CompanyLogo :sources="[siteIcon(t.text)]" :name="t.text" :size="14" /> {{ t.text }}</span>
          <span v-else class="qtag" :class="t.kind">{{ t.text }}</span>
        </template>
        <button class="btn ghost sm icon-only" title="Remover consulta" @click="removeLine(i)"><Icon name="x" :size="12" /></button>
      </div>
      <p v-if="!lines.length" class="muted small">Nenhuma consulta. Monte abaixo.</p>
    </div>

    <div class="qb-build">
      <span class="field-label">Montar consultas com tags</span>

      <div class="qb-row">
        <span class="qb-label">Cargo</span>
        <div class="chip-select">
          <button v-for="t in pick.titles" :key="t" type="button" class="fchip toggle on" @click="toggle(pick.titles, t)">{{ t }} ✕</button>
          <input v-model="customTitle" class="input chip-input" list="qb-titles" placeholder="Cargo… (Enter)" @keydown.enter.prevent="addTitle" @change="addTitle" />
          <datalist id="qb-titles"><option v-for="t in vocab.titles" :key="t" :value="t" /></datalist>
        </div>
      </div>
      <div class="qb-row">
        <span class="qb-label">Sites</span>
        <div class="chip-select">
          <button v-for="s in vocab.sites" :key="s" type="button" class="fchip toggle" :class="{ on: pick.sites.includes(s) }" @click="toggle(pick.sites, s)">{{ s }}</button>
        </div>
      </div>
      <div class="qb-row">
        <span class="qb-label">Tecnologia</span>
        <div class="chip-select">
          <button v-for="s in vocab.stacks" :key="s" type="button" class="fchip toggle" :class="{ on: pick.stacks.includes(s) }" @click="toggle(pick.stacks, s)">{{ s }}</button>
        </div>
      </div>
      <div class="qb-row">
        <span class="qb-label">Nível</span>
        <div class="chip-select">
          <button v-for="s in vocab.levels" :key="s" type="button" class="fchip toggle" :class="{ on: pick.levels.includes(s) }" @click="toggle(pick.levels, s)">{{ s }}</button>
        </div>
      </div>
      <div class="qb-row">
        <span class="qb-label">Modalidade</span>
        <div class="chip-select">
          <button v-for="s in vocab.modes" :key="s" type="button" class="fchip toggle" :class="{ on: pick.mode === s }" @click="pick.mode = pick.mode === s ? '' : s">{{ s }}</button>
        </div>
      </div>
      <div class="qb-row">
        <span class="qb-label">Local</span>
        <div class="chip-select">
          <button v-for="s in vocab.locations" :key="s" type="button" class="fchip toggle" :class="{ on: pick.location === s }" @click="pick.location = pick.location === s ? '' : s">{{ s }}</button>
        </div>
      </div>

      <div v-if="generated.length" class="qb-preview">
        <code v-for="g in generated" :key="g">{{ g }}</code>
        <div class="qb-actions">
          <span class="muted small">{{ generated.length }} consulta(s)</span>
          <button type="button" class="btn ghost sm" @click="apply(true)">Substituir todas</button>
          <button type="button" class="btn primary sm" @click="apply(false)"><Icon name="plus" :size="13" /> Adicionar</button>
        </div>
      </div>
      <p v-else class="muted small">Escolha ao menos um cargo para gerar as consultas.</p>
    </div>
  </div>
</template>
