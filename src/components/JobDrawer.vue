<script setup>
import { computed, watch } from 'vue'
import { state, trigger, setStatus, loadDetails } from '../store.js'
import { STATUS_LABELS, FINAL_STATUSES } from '../columns.js'
import Icon from './Icon.vue'
import CompanyLogo from './CompanyLogo.vue'

const props = defineProps({ card: Object })
defineEmits(['close'])

const d = computed(() => props.card.details || {})
const isApp = computed(() => props.card.source === 'tracker')
watch(() => props.card.id, (id) => loadDetails(id), { immediate: true })

const det = computed(() => state.details[props.card.id] ?? { loading: true })
const x = computed(() => det.value.data)

const statusOptions = computed(() =>
  isApp.value
    ? ['drafted', 'applied', 'interview', 'offer', ...FINAL_STATUSES]
    : ['new', 'skipped', ...(props.card.score != null ? ['ranked'] : [])],
)

// Tags da busca: o que mais pesa para decidir, antes de qualquer detalhe.
const searchTags = computed(() => {
  const v = x.value
  if (!v) return []
  return [
    { label: 'Tipo de vaga', value: [...(v.jobType ?? []).filter((t) => t !== 'Engenharia de software')].join(' · ') || v.jobType?.[0], icon: 'layout' },
    { label: 'Modelo de trabalho', value: v.workModel, icon: 'home' },
    { label: 'Remuneração', value: v.salary, icon: 'chart' },
    { label: 'Nível', value: v.seniority?.join(' / '), icon: 'star' },
  ].map((t) => ({ ...t, value: t.value || 'Não informado', empty: !t.value }))
})

const facts = computed(() => {
  const v = x.value
  if (!v) return []
  return [
    ['Contrato', v.contracts?.join(' · ')],
    ['Jornada', v.schedule],
    ['Local', v.location],
    ['Idioma', v.english],
    ['Setor', v.industries || d.value.sector],
  ].filter(([, val]) => val)
})

const companySources = computed(() => [x.value?.logo, x.value?.companyFavicon, props.card.brief?.logo])
const refText = computed(() => `${props.card.company} ${props.card.title}`.trim())
const label = (s) => `${s} · ${props.card.company}`
const pdfUrl = (kind) => `/api/pdf?index=${props.card.index}&kind=${kind}`
const fileName = (p) => p.split(/[\\/]/).pop()
const when = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="scrim" @click="$emit('close')"></div>
  <aside class="drawer" aria-label="Detalhes da vaga" @keydown.esc="$emit('close')">
    <header class="drawer-head">
      <CompanyLogo :sources="companySources" :name="card.company" :size="48" />
      <div class="titles">
        <p class="eyebrow">{{ isApp ? 'Candidatura' : 'Vaga' }} · {{ STATUS_LABELS[card.status] || card.status }}</p>
        <h2>{{ card.title }}</h2>
        <p class="company">
          {{ card.company }}
          <span v-if="x?.portal || x?.via" class="via">
            <CompanyLogo :sources="[x?.portal?.icon, x?.viaIcon]" :name="x?.portal?.name || x?.via" :size="16" />
            {{ x?.portal?.name || x?.via }}
          </span>
        </p>
      </div>
      <button class="btn ghost icon-only" aria-label="Fechar" @click="$emit('close')"><Icon name="x" /></button>
    </header>

    <div class="drawer-body">
      <!-- tags da busca -->
      <div v-if="x" class="search-tags">
        <div v-for="t in searchTags" :key="t.label" class="stag" :class="{ empty: t.empty }">
          <span class="stag-label"><Icon :name="t.icon" :size="12" /> {{ t.label }}</span>
          <b>{{ t.value }}</b>
        </div>
      </div>
      <div v-else class="search-tags">
        <div v-for="i in 4" :key="i" class="stag skeleton"><span class="sk sk-s"></span><span class="sk"></span></div>
      </div>
      <div v-if="x?.categories?.length || card.score != null" class="match-row">
        <span v-if="card.score != null" class="pill" :class="card.score >= 75 ? 'high' : card.score >= 55 ? 'medium' : ''">nota {{ Math.round(card.score) }}</span>
        <span v-for="c in x?.categories ?? []" :key="c" class="fchip" title="Categoria de busca do search-queries.md que casa com esta vaga">
          <Icon name="search" :size="11" style="display:inline;vertical-align:-1px" /> {{ c }}
        </span>
      </div>

      <div class="actions-row">
        <button v-if="!isApp" class="btn primary" :disabled="!card.url" @click="trigger('apply', { url: card.url })">
          <Icon name="send" /> Candidatar
        </button>
        <template v-else>
          <button class="btn" @click="trigger('outcome', { args: refText })"><Icon name="flag" /> Resultado</button>
          <button class="btn" @click="trigger('interview', { args: refText })"><Icon name="mic" /> Entrevista</button>
        </template>
        <a v-if="card.url" class="btn" :href="card.url" target="_blank" rel="noopener noreferrer"><Icon name="external" /> Abrir vaga</a>
        <select class="select status-select" :value="card.status" aria-label="Status" @change="setStatus(card, $event.target.value)">
          <option v-if="!statusOptions.includes(card.status)" :value="card.status" disabled>{{ STATUS_LABELS[card.status] || card.status }}</option>
          <option v-for="s in statusOptions" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
        </select>
      </div>

      <div v-if="det.loading && !x" class="loading-note"><Icon name="refresh" class="spin" :size="14" /> Lendo o anúncio da vaga…</div>
      <p v-if="det.error" class="callout">{{ det.error }}</p>

      <template v-if="x">
        <section class="block">
          <h4>Resumo da vaga</h4>
          <p v-if="x.summary" class="summary">{{ x.summary }}</p>
          <dl v-if="facts.length" class="kv">
            <template v-for="[k, v] in facts" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template>
          </dl>
        </section>

        <section v-if="x.stacks?.length" class="block">
          <h4>Tecnologias</h4>
          <div class="chips"><span v-for="s in x.stacks" :key="s" class="fchip">{{ s }}</span></div>
        </section>

        <section v-if="x.requirements?.length" class="block">
          <h4>Requisitos e qualificações</h4>
          <ul class="bullets plain"><li v-for="r in x.requirements" :key="r">{{ r }}</li></ul>
        </section>
        <section v-if="x.niceToHave?.length" class="block">
          <h4>Diferenciais</h4>
          <ul class="bullets plain"><li v-for="r in x.niceToHave" :key="r">{{ r }}</li></ul>
        </section>

        <section v-if="x.benefits?.length || x.benefitItems?.length" class="block">
          <h4>Remuneração e benefícios</h4>
          <div v-if="x.benefits?.length" class="chips"><span v-for="b in x.benefits" :key="b" class="fchip good">{{ b }}</span></div>
          <details v-if="x.benefitItems?.length" class="more"><summary>Ver texto do anúncio</summary>
            <ul class="bullets plain"><li v-for="b in x.benefitItems" :key="b">{{ b }}</li></ul>
          </details>
        </section>

        <section v-if="x.responsibilities?.length" class="block">
          <details class="more"><summary>Responsabilidades ({{ x.responsibilities.length }})</summary>
            <ul class="bullets plain"><li v-for="r in x.responsibilities" :key="r">{{ r }}</li></ul>
          </details>
        </section>
      </template>

      <section v-if="d.strengths?.length || d.gaps?.length" class="block">
        <h4>Avaliação do /rank</h4>
        <ul v-if="d.strengths?.length" class="bullets"><li v-for="s in d.strengths" :key="s">{{ s }}</li></ul>
        <ul v-if="d.gaps?.length" class="bullets gaps" style="margin-top: 8px"><li v-for="s in d.gaps" :key="s">{{ s }}</li></ul>
      </section>

      <section v-if="isApp && (d.cv_file || d.cover_letter_file)" class="block">
        <h4>Documentos</h4>
        <div v-for="doc in [['cv', d.cv_file, 'CV'], ['cover', d.cover_letter_file, 'Carta']].filter((v) => v[1])" :key="doc[0]" class="doc">
          <Icon name="file" />
          <span class="doc-name" :title="doc[1]">{{ doc[2] }} · {{ fileName(doc[1]) }}</span>
          <button class="btn sm icon-only" title="Compilar" @click="trigger(doc[0] === 'cv' ? 'compile-cv' : 'compile-cover', { index: card.index, __label: label(`Compilar ${doc[2]}`) })"><Icon name="cog" :size="14" /></button>
          <button class="btn sm icon-only" title="Verificar" @click="trigger(doc[0] === 'cv' ? 'verify-cv' : 'verify-cover', { index: card.index, __label: label(`Verificar ${doc[2]}`) })"><Icon name="eye" :size="14" /></button>
          <a class="btn sm icon-only" title="Abrir PDF" :href="pdfUrl(doc[0])" target="_blank" rel="noopener"><Icon name="external" :size="14" /></a>
        </div>
      </section>

      <section v-if="x?.description" class="block">
        <details class="more"><summary>Descrição completa</summary>
          <p class="fulltext">{{ x.description }}</p>
        </details>
      </section>

      <footer v-if="x" class="drawer-foot">
        <span>
          {{ x.sources.length ? `Fonte: ${x.sources.join(', ')}` : 'Sem fonte acessível' }} · {{ when(x.fetchedAt) }}
          <template v-for="n in x.notes" :key="n"><br />{{ n }}</template>
        </span>
        <button class="btn ghost sm" :disabled="det.loading" @click="loadDetails(card.id, true)">
          <Icon name="refresh" :size="13" :class="{ spin: det.loading }" /> Atualizar
        </button>
      </footer>
    </div>
  </aside>
</template>
