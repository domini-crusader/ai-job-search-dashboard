<script setup>
import { computed } from 'vue'
import { STATUS_LABELS, daysUntil } from '../columns.js'

const props = defineProps({ card: Object, selected: Boolean, dragging: Boolean })
defineEmits(['open', 'dragstart', 'dragend'])

const deadline = computed(() => {
  const d = daysUntil(props.card.deadline)
  if (d === null) return null
  if (d < 0) return { text: 'prazo vencido', cls: 'late' }
  if (d === 0) return { text: 'prazo hoje', cls: 'late' }
  return { text: `prazo em ${d}d`, cls: d <= 7 ? 'soon' : '' }
})

const host = computed(() => {
  try { return new URL(props.card.url).hostname.replace(/^www\./, '') } catch { return null }
})

const scoreCls = computed(() => {
  const s = props.card.score
  if (s == null) return ''
  return s >= 75 ? 'fit-high' : s >= 55 ? 'fit-medium' : 'fit-low'
})
</script>

<template>
  <article
    class="card"
    :class="{ selected, dragging }"
    draggable="true"
    tabindex="0"
    @dragstart="$emit('dragstart', $event)"
    @dragend="$emit('dragend')"
    @click="$emit('open')"
    @keydown.enter="$emit('open')"
  >
    <div class="card-top">
      <h3 :title="card.title">{{ card.title }}</h3>
      <span v-if="card.score != null" class="score" :class="scoreCls" title="Pontuação (0-100)">{{ Math.round(card.score) }}</span>
      <span v-else-if="card.fit" class="fit-dot" :class="`fit-${card.fit}`" :title="`fit ${card.fit}`"></span>
    </div>
    <p class="company">{{ card.company || '—' }}</p>
    <div class="tags">
      <span v-if="card.source === 'tracker' && !['drafted','applied','interview','offer'].includes(card.status)" class="tag">
        {{ STATUS_LABELS[card.status] || card.rawStatus || 'sem status' }}
      </span>
      <span v-if="card.source === 'seen' && !['new','ranked'].includes(card.status)" class="tag">{{ STATUS_LABELS[card.status] || card.status }}</span>
      <span v-if="card.portal" class="tag">{{ card.portal.replace(/-search$/, '') }}</span>
      <span v-else-if="host" class="tag">{{ host }}</span>
      <span v-if="card.details?.rank_verdict" class="tag">{{ card.details.rank_verdict }}</span>
      <span v-if="card.details?.language_gate === 'FLAG' || card.details?.location_verdict === 'FLAG'" class="tag warn" title="Requisito de idioma/local a conferir">⚠ conferir</span>
      <span v-if="deadline" class="tag" :class="deadline.cls">{{ deadline.text }}</span>
    </div>
    <p class="date">{{ card.source === 'tracker' ? 'registrada' : 'vista' }} em {{ card.date || '—' }}</p>
  </article>
</template>
