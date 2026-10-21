<script setup>
import { computed, reactive } from 'vue'
import { state, execute } from '../store.js'

const props = defineProps({ dialog: Object })
const emit = defineEmits(['close'])

const params = reactive({ ...props.dialog.params })
const cmd = computed(() => props.dialog.command)
const missing = computed(() => (cmd.value.params || []).some((p) => p.required && !String(params[p.name] ?? '').trim()))

function submit(launch = false) {
  if (missing.value) return
  execute(cmd.value, { ...props.dialog.preset, ...params }, launch)
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <form class="dialog" @submit.prevent="submit(state.catalog.claudeCli && cmd.kind === 'claude')">
      <h3>{{ cmd.icon }} {{ cmd.label }}</h3>
      <p class="muted">{{ cmd.description }}</p>
      <p v-if="cmd.confirm" class="confirm">{{ cmd.confirm }}</p>

      <label v-for="p in cmd.params || []" :key="p.name" class="field" :class="{ check: p.type === 'checkbox' }">
        <template v-if="p.type === 'checkbox'">
          <input v-model="params[p.name]" type="checkbox" /> {{ p.label }}
        </template>
        <template v-else>
          <span>{{ p.label }}<b v-if="p.required"> *</b></span>
          <input
            v-model="params[p.name]"
            class="input"
            :type="p.type === 'number' ? 'number' : p.type === 'url' ? 'url' : 'text'"
            :placeholder="p.type === 'url' ? 'https://…' : ''"
            :required="p.required"
          />
        </template>
      </label>

      <div class="actions">
        <button type="button" class="btn ghost" @click="emit('close')">Cancelar</button>
        <template v-if="cmd.kind === 'claude'">
          <button type="button" class="btn" :class="{ primary: !state.catalog.claudeCli }" :disabled="missing" @click="submit(false)">⧉ Copiar comando</button>
          <button v-if="state.catalog.claudeCli" type="submit" class="btn primary" :disabled="missing">▶ Abrir no terminal</button>
        </template>
        <button v-else type="submit" class="btn primary" :class="{ danger: cmd.confirm }" :disabled="missing">▶ Executar</button>
      </div>
    </form>
  </div>
</template>
