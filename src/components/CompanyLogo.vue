<script setup>
import { computed, ref, watch } from 'vue'

// Tenta cada URL em ordem; se nenhuma carregar, mostra as iniciais numa cor estável.
const props = defineProps({ sources: { type: Array, default: () => [] }, name: String, size: { type: Number, default: 40 } })

const index = ref(0)
const list = computed(() => props.sources.filter(Boolean))
watch(list, () => { index.value = 0 })
const src = computed(() => list.value[index.value] ?? null)

const initials = computed(() => {
  const words = String(props.name ?? '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/)
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase()
})
const hue = computed(() => [...String(props.name ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7))
</script>

<template>
  <span class="logo" :style="{ width: `${size}px`, height: `${size}px`, '--hue': hue, fontSize: `${Math.round(size * 0.38)}px` }">
    <img v-if="src" :src="src" alt="" referrerpolicy="no-referrer" loading="lazy" @error="index++" />
    <span v-else class="initials">{{ initials }}</span>
  </span>
</template>
