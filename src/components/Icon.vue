<script setup>
import { computed } from 'vue'

const props = defineProps({ name: String, size: { type: Number, default: 16 } })

// Ícones de traço (viewBox 24). String = <path d>; {c} círculo, {r} retângulo, {e} elipse.
const ICONS = {
  search: [{ c: [11, 11, 7] }, 'M20 20l-4-4'],
  star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
  send: ['M21 3 10 14', 'M21 3l-7 18-4-7-7-4z'],
  flag: ['M5 21V4', 'M5 4h12l-2 4 2 4H5'],
  mic: [{ r: [9, 3, 6, 11, 3] }, 'M5 11a7 7 0 0 0 14 0', 'M12 18v3'],
  mail: [{ r: [3, 5, 18, 14, 2] }, 'M3 7l9 6 9-6'],
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M3 20h18'],
  book: ['M4 5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2z', 'M4 20a2 2 0 0 0 2 1h14v-3'],
  database: [{ e: [12, 5, 8, 3] }, 'M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  user: [{ c: [12, 8, 4] }, 'M4 21a8 8 0 0 1 16 0'],
  plus: ['M12 5v14', 'M5 12h14'],
  globe: [{ c: [12, 12, 9] }, 'M3 12h18', 'M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z'],
  layout: [{ r: [3, 3, 18, 18, 2] }, 'M3 9h18', 'M9 21V9'],
  package: ['M21 8l-9-5-9 5 9 5z', 'M3 8v8l9 5 9-5V8', 'M12 13v8'],
  list: ['M9 6h12', 'M9 12h12', 'M9 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  clock: [{ c: [12, 12, 9] }, 'M12 7v5l3 2'],
  archive: [{ r: [3, 4, 18, 4, 1] }, 'M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8', 'M10 12h4'],
  shield: ['M12 21s8-4 8-10V5l-8-3-8 3v6c0 6 8 10 8 10z'],
  check: ['M20 6L9 17l-5-5'],
  cog: [{ c: [12, 12, 3] }, 'M12 2v3', 'M12 19v3', 'M4.9 4.9l2.1 2.1', 'M17 17l2.1 2.1', 'M2 12h3', 'M19 12h3', 'M4.9 19.1L7 17', 'M17 7l2.1-2.1'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', { c: [12, 12, 3] }],
  external: ['M14 4h6v6', 'M10 14L20 4', 'M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5'],
  copy: [{ r: [9, 9, 12, 12, 2] }, 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  play: ['M7 4l13 8-13 8z'],
  stop: [{ r: [6, 6, 12, 12, 1.5] }],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  refresh: ['M20 12a8 8 0 1 1-2.3-5.7L20 8.5', 'M20 3.5v5h-5'],
  home: ['M3 11l9-8 9 8', 'M5 9.5V20h14V9.5'],
  board: [{ r: [3, 4, 18, 16, 2] }, 'M9 4v16', 'M15 4v16'],
  terminal: ['M4 17l6-5-6-5', 'M12 19h8'],
  file: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z', 'M14 3v6h6'],
  sun: [{ c: [12, 12, 4] }, 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  monitor: [{ r: [3, 4, 18, 12, 2] }, 'M8 20h8', 'M12 16v4'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  alert: [{ c: [12, 12, 9] }, 'M12 8v4', 'M12 16h.01'],
  archiveIn: ['M3 7h18', 'M5 7v12h14V7', 'M10 11h4'],
  arrowRight: ['M5 12h14', 'M13 6l6 6-6 6'],
}

const parts = computed(() => ICONS[props.name] || ICONS.alert)
</script>

<template>
  <svg
    :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="icon"
  >
    <template v-for="(p, i) in parts" :key="i">
      <path v-if="typeof p === 'string'" :d="p" />
      <circle v-else-if="p.c" :cx="p.c[0]" :cy="p.c[1]" :r="p.c[2]" />
      <rect v-else-if="p.r" :x="p.r[0]" :y="p.r[1]" :width="p.r[2]" :height="p.r[3]" :rx="p.r[4]" />
      <ellipse v-else-if="p.e" :cx="p.e[0]" :cy="p.e[1]" :rx="p.e[2]" :ry="p.e[3]" />
    </template>
  </svg>
</template>
