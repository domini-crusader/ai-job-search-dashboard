<script setup>
import { computed } from 'vue'
import { state, trigger, setStatus } from '../store.js'
import { STATUS_LABELS, FINAL_STATUSES } from '../columns.js'
import Icon from './Icon.vue'

const props = defineProps({ card: Object })
defineEmits(['close'])

const d = computed(() => props.card.details || {})
const isApp = computed(() => props.card.source === 'tracker')
const LABELS = {
  date: 'Data', sector: 'Setor', role_type: 'Tipo', channel: 'Canal', contact_person: 'Contato',
  fit_rating: 'Fit', notes: 'Notas', deadline: 'Prazo', first_seen: 'Vista em', posted_date: 'Publicada',
  portal: 'Portal', fit: 'Fit inicial', rank_score: 'Pontuação', rank_verdict: 'Veredito', rank_date: 'Ranqueada',
  location: 'Local', location_verdict: 'Local', language_gate: 'Idioma', language_note: 'Nota de idioma',
  last_fetch_error: 'Erro de acesso', expired_reason: 'Expirou por',
}
const fields = computed(() =>
  Object.entries(d.value)
    .filter(([k, v]) => LABELS[k] && v !== null && v !== '' && typeof v !== 'object')
    .map(([k, v]) => [LABELS[k], String(v)]),
)
const statusOptions = computed(() =>
  isApp.value
    ? ['drafted', 'applied', 'interview', 'offer', ...FINAL_STATUSES]
    : ['new', 'skipped', ...(props.card.score != null ? ['ranked'] : [])],
)
const refText = computed(() => `${props.card.company} ${props.card.title}`.trim())
const label = (s) => `${s} · ${props.card.company}`
const pdfUrl = (kind) => `/api/pdf?index=${props.card.index}&kind=${kind}`
const fileName = (p) => p.split(/[\\/]/).pop()
</script>

<template>
  <div class="scrim" @click="$emit('close')"></div>
  <aside class="drawer" aria-label="Detalhes" @keydown.esc="$emit('close')">
    <header class="drawer-head">
      <div class="titles">
        <p class="eyebrow">{{ isApp ? 'Candidatura' : 'Vaga' }} · {{ STATUS_LABELS[card.status] || card.status }}</p>
        <h2>{{ card.title }}</h2>
        <p class="company">{{ card.company }}</p>
      </div>
      <button class="btn ghost icon-only" aria-label="Fechar" @click="$emit('close')"><Icon name="x" /></button>
    </header>

    <div class="drawer-body">
      <div class="actions-row">
        <template v-if="!isApp">
          <button class="btn primary" :disabled="!card.url" @click="trigger('apply', { url: card.url })">
            <Icon name="send" /> Candidatar
          </button>
        </template>
        <template v-else>
          <button class="btn" @click="trigger('outcome', { args: refText })"><Icon name="flag" /> Resultado</button>
          <button class="btn" @click="trigger('interview', { args: refText })"><Icon name="mic" /> Entrevista</button>
        </template>
        <a v-if="card.url" class="btn" :href="card.url" target="_blank" rel="noopener noreferrer">
          <Icon name="external" /> Abrir vaga
        </a>
      </div>

      <div>
        <label class="field-label" for="status">Status</label>
        <select id="status" class="select" style="width: 100%" :value="card.status" @change="setStatus(card, $event.target.value)">
          <option v-if="!statusOptions.includes(card.status)" :value="card.status" disabled>{{ STATUS_LABELS[card.status] || card.status }}</option>
          <option v-for="s in statusOptions" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
        </select>
      </div>

      <section v-if="isApp && (d.cv_file || d.cover_letter_file)" class="block">
        <h4>Documentos</h4>
        <div v-for="doc in [['cv', d.cv_file, 'CV'], ['cover', d.cover_letter_file, 'Carta']].filter((x) => x[1])" :key="doc[0]" class="doc">
          <Icon name="file" />
          <span class="doc-name" :title="doc[1]">{{ doc[2] }} · {{ fileName(doc[1]) }}</span>
          <button class="btn sm icon-only" title="Compilar" @click="trigger(doc[0] === 'cv' ? 'compile-cv' : 'compile-cover', { index: card.index, __label: label(`Compilar ${doc[2]}`) })"><Icon name="cog" :size="14" /></button>
          <button class="btn sm icon-only" title="Verificar" @click="trigger(doc[0] === 'cv' ? 'verify-cv' : 'verify-cover', { index: card.index, __label: label(`Verificar ${doc[2]}`) })"><Icon name="eye" :size="14" /></button>
          <a class="btn sm icon-only" title="Abrir PDF" :href="pdfUrl(doc[0])" target="_blank" rel="noopener"><Icon name="external" :size="14" /></a>
        </div>
      </section>

      <section v-if="d.strengths?.length" class="block">
        <h4>Pontos fortes</h4>
        <ul class="bullets"><li v-for="s in d.strengths" :key="s">{{ s }}</li></ul>
      </section>
      <section v-if="d.gaps?.length" class="block">
        <h4>Lacunas</h4>
        <ul class="bullets gaps"><li v-for="s in d.gaps" :key="s">{{ s }}</li></ul>
      </section>

      <section v-if="fields.length" class="block">
        <h4>Detalhes</h4>
        <dl class="kv">
          <template v-for="[k, v] in fields" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template>
        </dl>
      </section>

      <p v-if="!state.catalog.claudeCli" class="muted" style="font-size: 12px">
        Os botões do Claude copiam o comando — cole no Claude Code.
      </p>
    </div>
  </aside>
</template>
