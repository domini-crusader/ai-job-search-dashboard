<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { state } from '../store.js'

const pre = ref(null)
const active = computed(() => state.runs.find((r) => r.uid === state.activeRun) || state.runs[0] || null)
const icon = { running: '⏳', ok: '✅', fail: '❌', stopped: '⏹' }

// Acompanha o fim da saída enquanto o usuário não rolou para cima.
watch(() => active.value?.output, async () => {
  const el = pre.value
  if (!el) return
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  await nextTick()
  if (atBottom) el.scrollTop = el.scrollHeight
})

function clearFinished() {
  state.runs = state.runs.filter((r) => r.status === 'running')
  if (!state.runs.length) state.logOpen = false
}
</script>

<template>
  <section v-if="state.runs.length" class="logpanel" :class="{ open: state.logOpen }">
    <header class="log-head">
      <button class="btn ghost small" @click="state.logOpen = !state.logOpen">
        {{ state.logOpen ? '▾' : '▴' }} Console
      </button>
      <div class="log-tabs">
        <button
          v-for="r in state.runs"
          :key="r.uid"
          class="log-tab"
          :class="[r.status, { active: active?.uid === r.uid }]"
          @click="state.activeRun = r.uid; state.logOpen = true"
        >{{ icon[r.status] }} {{ r.label }}</button>
      </div>
      <button v-if="active?.status === 'running'" class="btn small danger" @click="active.controller.abort()">⏹ Parar</button>
      <button class="btn ghost small" title="Limpar concluídos" @click="clearFinished">🧹</button>
    </header>
    <pre v-show="state.logOpen" ref="pre" class="log-out">{{ active?.output || '…' }}</pre>
  </section>
</template>
