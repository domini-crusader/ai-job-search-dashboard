<script setup>
import { computed, reactive } from 'vue'
import { state } from '../store.js'
import Icon from './Icon.vue'
import CompanyLogo from './CompanyLogo.vue'

// Edita as consultas de uma categoria (props.category.queries, uma por linha) por tags.
const props = defineProps({ category: Object })

// multi: vários valores na mesma consulta; single: no máximo um; o resto (cargo, site)
// multiplica as consultas (uma por combinação).
const GROUPS = [
  { key: 'titles', label: 'Cargo', kind: 'expand' },
  { key: 'sites', label: 'Sites', kind: 'expand' },
  { key: 'stacks', label: 'Tecnologia', kind: 'multi' },
  { key: 'skills', label: 'Habilidades', kind: 'multi' },
  { key: 'levels', label: 'Nível', kind: 'multi' },
  { key: 'modes', label: 'Modalidade', kind: 'single' },
  { key: 'locations', label: 'Local', kind: 'single' },
  { key: 'salary', label: 'Pretensão salarial', kind: 'single', hint: 'vai para as notas da categoria' },
]

const vocab = computed(() => state.search?.vocab ?? {})
const pick = reactive(Object.fromEntries(GROUPS.map((g) => [g.key, []])))
const custom = reactive({})

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
  props.category.queries = lines.value.filter((_, k) => k !== i).join('\n')
}

const quote = (s) => (/\s/.test(s) ? `"${s}"` : s)

function toggle(g, v) {
  const arr = pick[g.key]
  if (arr.includes(v)) arr.splice(arr.indexOf(v), 1)
  else if (g.kind === 'single') arr.splice(0, arr.length, v)
  else arr.push(v)
}

// Tag digitada só para esta consulta (não entra no vocabulário salvo).
function addCustom(g) {
  const v = String(custom[g.key] ?? '').replace(/"/g, '').trim()
  if (v && !pick[g.key].includes(v)) toggle(g, v)
  custom[g.key] = ''
}
const options = (g) => [...new Set([...pick[g.key], ...(vocab.value[g.key] ?? [])])]

const generated = computed(() => {
  if (!pick.titles.length) return []
  const sites = pick.sites.length ? pick.sites : [null]
  const tail = [
    ...pick.stacks.map((s) => `"${s}"`),
    ...pick.skills.map((s) => `"${s}"`),
    pick.modes[0] && quote(pick.modes[0]),
    pick.locations[0] && quote(pick.locations[0]),
    pick.levels.length > 1 ? `(${pick.levels.join(' OR ')})` : pick.levels[0],
  ].filter(Boolean)
  const out = []
  for (const site of sites) for (const t of pick.titles) out.push([site && `site:${site}`, `"${t}"`, ...tail].filter(Boolean).join(' '))
  return out.slice(0, 24)
})

function apply(replace) {
  const merged = replace ? generated.value : [...new Set([...lines.value, ...generated.value])]
  props.category.queries = merged.join('\n')
  if (pick.salary[0]) {
    const notes = props.category.notes.replace(/^Pretens[ãa]o salarial:.*$/im, '').trim()
    props.category.notes = `${notes}${notes ? '\n\n' : ''}Pretensão salarial: ${pick.salary[0]}`
  }
  pick.titles.splice(0)
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
      <span class="field-label">Montar consultas com tags <em class="muted">(edite as opções em “Tags de busca”, acima)</em></span>
      <div v-for="g in GROUPS" :key="g.key" class="qb-row">
        <span class="qb-label">{{ g.label }}<em v-if="g.hint" class="qb-hint">{{ g.hint }}</em></span>
        <div class="chip-select">
          <button v-for="s in options(g)" :key="s" type="button" class="fchip toggle" :class="{ on: pick[g.key].includes(s) }" @click="toggle(g, s)">{{ s }}</button>
          <input v-model="custom[g.key]" class="input chip-input" :placeholder="`outro ${g.label.toLowerCase()}…`" @keydown.enter.prevent="addCustom(g)" />
        </div>
      </div>

      <div v-if="generated.length" class="qb-preview">
        <code v-for="q in generated" :key="q">{{ q }}</code>
        <code v-if="pick.salary[0]" class="note">notas: Pretensão salarial: {{ pick.salary[0] }}</code>
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
