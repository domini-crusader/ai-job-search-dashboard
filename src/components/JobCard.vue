<script setup>
import { computed } from 'vue'
import { STATUS_LABELS, daysUntil } from '../columns.js'
import CompanyLogo from './CompanyLogo.vue'

const props = defineProps({ card: Object, selected: Boolean, dragging: Boolean })
defineEmits(['open', 'dragstart', 'dragend'])

const deadline = computed(() => {
  const d = daysUntil(props.card.deadline)
  if (d === null) return null
  if (d < 0) return { text: 'vencida', cls: 'late' }
  if (d === 0) return { text: 'vence hoje', cls: 'late' }
  return { text: `${d}d`, cls: d <= 7 ? 'soon' : '' }
})

const source = computed(() => {
  if (props.card.portal) return props.card.portal.replace(/-search$/, '')
  try { return new URL(props.card.url).hostname.replace(/^www\./, '') } catch { return null }
})

const band = computed(() => {
  const s = props.card.score
  return s == null ? '' : s >= 75 ? 'high' : s >= 55 ? 'medium' : ''
})

// Status que não é o da coluna (Encerradas e Descartadas misturam vários).
const statusTag = computed(() => {
  const { source: src, status } = props.card
  if (src === 'tracker' && !['drafted', 'applied', 'interview', 'offer'].includes(status)) return STATUS_LABELS[status] || props.card.rawStatus
  if (src === 'seen' && !['new', 'ranked'].includes(status)) return STATUS_LABELS[status] || status
  return null
})
const flagged = computed(() => ['FLAG', 'FAIL'].includes(props.card.details?.language_gate) ||
  ['FLAG', 'FAIL'].includes(props.card.details?.location_verdict))
</script>

<template>
  <article
    class="card" :class="{ selected, dragging }" draggable="true" tabindex="0"
    @dragstart="$emit('dragstart', $event)" @dragend="$emit('dragend')"
    @click="$emit('open')" @keydown.enter="$emit('open')"
  >
    <div class="card-top">
      <CompanyLogo :sources="[card.brief?.logo]" :name="card.company" :size="30" />
      <h3 :title="card.title">{{ card.title }}</h3>
      <span v-if="card.score != null" class="pill" :class="band" title="Pontuação">{{ Math.round(card.score) }}</span>
      <i v-else-if="card.fit" class="fit-dot" :class="card.fit" :title="`fit ${card.fit}`"></i>
    </div>
    <p class="company">{{ card.company || '—' }}</p>
    <div class="card-meta">
      <span v-if="statusTag" class="pill">{{ statusTag }}</span>
      <span v-if="flagged" class="pill soon" title="Idioma ou local a conferir">conferir</span>
      <span v-if="card.brief?.workModel" class="pill">{{ card.brief.workModel }}</span>
      <span v-if="card.brief?.seniority" class="pill">{{ card.brief.seniority }}</span>
      <span v-if="source">{{ source }}</span>
      <span v-if="source && card.date" class="sep">·</span>
      <span v-if="card.date">{{ card.date.slice(5).split('-').reverse().join('/') }}</span>
      <span v-if="deadline" class="pill" :class="deadline.cls" title="Prazo">{{ deadline.text }}</span>
    </div>
  </article>
</template>
