<script setup>
import { computed } from 'vue'
import { state, trigger, setStatus } from '../store.js'
import { STATUS_LABELS, FINAL_STATUSES } from '../columns.js'

const props = defineProps({ card: Object })
defineEmits(['close'])

const d = computed(() => props.card.details || {})
const isApp = computed(() => props.card.source === 'tracker')
const prettyKeys = {
  date: 'Data', sector: 'Setor', role_type: 'Tipo', channel: 'Canal', contact_person: 'Contato',
  fit_rating: 'Fit', notes: 'Notas', cv_file: 'CV', cover_letter_file: 'Carta', source: 'Origem', deadline: 'Prazo',
  first_seen: 'Vista em', posted_date: 'Publicada em', portal: 'Portal', fit: 'Fit (scraper)',
  rank_score: 'Pontuação', rank_verdict: 'Veredito', rank_date: 'Ranqueada em', location: 'Local',
  location_verdict: 'Local (veto)', language_gate: 'Idioma (veto)', language_note: 'Nota de idioma',
  last_fetch_error: 'Último erro de acesso', expired_reason: 'Motivo da expiração',
}
const skip = new Set(['__index', 'company', 'role', 'title', 'url', 'status', 'strengths', 'gaps', 'source'])
const fields = computed(() =>
  Object.entries(d.value)
    .filter(([k, v]) => !skip.has(k) && v !== null && v !== '' && typeof v !== 'object')
    .map(([k, v]) => [prettyKeys[k] || k, String(v)]),
)
const sourceField = computed(() => (isApp.value ? d.value.source : null))

const statusOptions = computed(() =>
  isApp.value
    ? ['drafted', 'applied', 'interview', 'offer', ...FINAL_STATUSES]
    : ['new', 'skipped', ...(props.card.score != null ? ['ranked'] : [])],
)

const label = (s) => `${s}: ${props.card.company} — ${props.card.title}`
const refText = computed(() => `${props.card.company} ${props.card.title}`.trim())
const pdfUrl = (kind) => `/api/pdf?index=${props.card.index}&kind=${kind}`
</script>

<template>
  <aside class="drawer" aria-label="Detalhes da vaga">
    <header class="drawer-head">
      <div>
        <p class="eyebrow">{{ isApp ? 'Candidatura' : 'Vaga encontrada' }} · {{ STATUS_LABELS[card.status] || card.status }}</p>
        <h2>{{ card.title }}</h2>
        <p class="company">{{ card.company }}</p>
      </div>
      <button class="btn ghost" aria-label="Fechar" @click="$emit('close')">✕</button>
    </header>

    <div class="drawer-body">
      <div class="row-actions">
        <a v-if="card.url" class="btn" :href="card.url" target="_blank" rel="noopener noreferrer">↗ Abrir vaga</a>
        <label class="inline">
          Status
          <select class="select" :value="card.status" @change="setStatus(card, $event.target.value)">
            <option v-if="!statusOptions.includes(card.status)" :value="card.status" disabled>{{ STATUS_LABELS[card.status] || card.status }}</option>
            <option v-for="s in statusOptions" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
          </select>
        </label>
      </div>

      <section class="block">
        <h4>Claude Code</h4>
        <div class="btn-grid">
          <template v-if="!isApp">
            <button class="btn primary" :disabled="!card.url" @click="trigger('apply', { url: card.url })">📝 Copiar /apply</button>
            <button v-if="state.catalog.claudeCli" class="btn" :disabled="!card.url" @click="trigger('apply', { url: card.url }, true)">▶ /apply no terminal</button>
          </template>
          <template v-else>
            <button class="btn" @click="trigger('outcome', { args: refText })">📬 Copiar /outcome</button>
            <button class="btn" @click="trigger('interview', { args: refText })">🎤 Copiar /interview</button>
            <template v-if="state.catalog.claudeCli">
              <button class="btn" @click="trigger('outcome', { args: refText }, true)">▶ /outcome no terminal</button>
              <button class="btn" @click="trigger('interview', { args: refText }, true)">▶ /interview no terminal</button>
            </template>
          </template>
        </div>
      </section>

      <section v-if="isApp && (d.cv_file || d.cover_letter_file)" class="block">
        <h4>Documentos</h4>
        <div v-if="d.cv_file" class="doc-row">
          <span class="doc-name" :title="d.cv_file">CV · {{ d.cv_file.split(/[\\/]/).pop() }}</span>
          <div class="btn-grid">
            <button class="btn small" @click="trigger('compile-cv', { index: card.index, __label: label('Compilar CV') })">⚙️ Compilar</button>
            <button class="btn small" @click="trigger('verify-cv', { index: card.index, __label: label('Verificar CV') })">🔍 Verificar</button>
            <a class="btn small" :href="pdfUrl('cv')" target="_blank" rel="noopener">📄 PDF</a>
          </div>
        </div>
        <div v-if="d.cover_letter_file" class="doc-row">
          <span class="doc-name" :title="d.cover_letter_file">Carta · {{ d.cover_letter_file.split(/[\\/]/).pop() }}</span>
          <div class="btn-grid">
            <button class="btn small" @click="trigger('compile-cover', { index: card.index, __label: label('Compilar carta') })">⚙️ Compilar</button>
            <button class="btn small" @click="trigger('verify-cover', { index: card.index, __label: label('Verificar carta') })">🔍 Verificar</button>
            <a class="btn small" :href="pdfUrl('cover')" target="_blank" rel="noopener">📄 PDF</a>
          </div>
        </div>
      </section>

      <section v-if="d.strengths?.length" class="block">
        <h4>Pontos fortes</h4>
        <ul class="list good"><li v-for="s in d.strengths" :key="s">{{ s }}</li></ul>
      </section>
      <section v-if="d.gaps?.length" class="block">
        <h4>Lacunas</h4>
        <ul class="list bad"><li v-for="s in d.gaps" :key="s">{{ s }}</li></ul>
      </section>

      <section class="block">
        <h4>Dados</h4>
        <dl class="kv">
          <template v-for="[k, v] in fields" :key="k">
            <dt>{{ k }}</dt><dd>{{ v }}</dd>
          </template>
          <template v-if="sourceField">
            <dt>Origem</dt><dd class="break">{{ sourceField }}</dd>
          </template>
        </dl>
      </section>
    </div>
  </aside>
</template>
