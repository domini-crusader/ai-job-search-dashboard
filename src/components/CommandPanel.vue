<script setup>
import { computed } from 'vue'
import { state, trigger } from '../store.js'

const groups = computed(() => {
  const out = new Map()
  for (const c of state.catalog.commands) {
    if (c.group === 'card') continue
    if (!out.has(c.group)) out.set(c.group, [])
    out.get(c.group).push(c)
  }
  return [...out.entries()]
})

const runningIds = computed(() => new Set(state.runs.filter((r) => r.status === 'running').map((r) => r.id)))
</script>

<template>
  <nav class="commands" aria-label="Comandos do projeto">
    <div class="cmd-note">
      <template v-if="state.catalog.claudeCli">
        Comandos <b>Claude Code</b> abrem um terminal com o CLI <code>claude</code>.
      </template>
      <template v-else>
        Comandos <b>Claude Code</b> são copiados — cole no chat do Claude.
        Para abrir direto num terminal, instale o CLI <code>claude</code> no PATH.
      </template>
    </div>
    <section v-for="[group, cmds] in groups" :key="group" class="cmd-group">
      <h3>{{ group }}</h3>
      <button
        v-for="c in cmds"
        :key="c.id"
        class="cmd"
        :class="{ running: runningIds.has(c.id) }"
        :disabled="runningIds.has(c.id)"
        :title="c.description"
        @click="trigger(c.id)"
      >
        <span class="cmd-icon">{{ c.icon }}</span>
        <span class="cmd-text">
          <span class="cmd-label">{{ c.label }}</span>
          <span class="cmd-desc">{{ c.description }}</span>
        </span>
        <span class="cmd-kind" :class="c.kind">{{ c.kind === 'claude' ? (state.catalog.claudeCli ? '▶' : '⧉') : runningIds.has(c.id) ? '…' : '▶' }}</span>
      </button>
    </section>
    <p v-if="!state.catalog.python" class="cmd-warn">Python 3 não encontrado — scripts locais vão falhar. Defina a variável <code>PYTHON</code>.</p>
  </nav>
</template>
